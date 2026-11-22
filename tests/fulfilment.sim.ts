// @ts-nocheck

// Fulfilment against the mock provider: exactly-once delivery, refunds, crashes, callbacks. Cleans up after itself.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Safety: no real emails and no real payment provider. The mock fulfilment provider spends nothing.
process.env.BREVO_API_KEY = "";
process.env.NOWPAYMENTS_API_KEY = "";
process.env.NOWPAYMENTS_IPN_SECRET = "";
const ROOT = process.cwd();
const P = `${ROOT}/lib`;

async function main() {
  const { connectDb } = await import(`${P}/db`);
  const M = await import(`${P}/models`);
  const O = await import(`${P}/services/orders`);
  const F = await import(`${P}/services/fulfilment`);
  const R = await import(`${P}/services/refunds`);
  const mock = await import(`${P}/providers/mock`);
  const { createAdapter } = await import(`${P}/providers`);
  const mongoose = (await import("mongoose")).default;
  await connectDb();

  const tag = Math.random().toString(36).slice(2, 8);
  const made = {
    orders: [] as string[],
    prod: [] as string[],
    cat: "",
    provider: false,
    user: "",
  };
  let prevActive: boolean | undefined;
  try {
    const user = await M.User.create({
      email: `sim-${tag}@example.invalid`,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      username: `sim${tag}`,
    });
    const userId = String(user._id);
    made.user = userId;
    if (!(await M.Provider.exists({ key: "mock" }))) {
      await M.Provider.create({
        key: "mock",
        name: "Mock",
        mode: "sandbox",
        active: true,
        priority: 0,
      });
      made.provider = true;
    }
    prevActive = (await M.Provider.findOne({ key: "mock" }).lean()).active;
    await M.Provider.updateOne({ key: "mock" }, { active: true });
    const cat = await M.ServiceCategory.create({
      slug: `sim-${tag}`,
      name: "Sim",
      sort: 999,
      inputs: [],
    });
    made.cat = String(cat._id);
    const mkProd = async (extra = {}) => {
      const p = await M.Product.create({
        categoryId: cat._id,
        providerKey: "mock",
        providerCode: `sim-${tag}-${Math.random().toString(36).slice(2, 6)}`,
        name: "Sim item",
        kind: "fixed",
        currency: "USD",
        denominations: [{ label: "$10", valueMinor: 1000, costMinor: 950 }],
        status: "active",
        ...extra,
      });
      made.prod.push(String(p._id));
      return p;
    };
    const prod = await mkProd();
    const viewOncePod = await mkProd({ viewOnce: true });
    const quoteFor = (p: any) =>
      O.quoteOrder({ productId: String(p._id), option: "$10" });
    const q = await quoteFor(prod);
    const qv = await quoteFor(viewOncePod);
    const balance = async () =>
      (await M.User.findById(userId).lean()).balanceCents as number;
    const ev = (id: string, to: string) =>
      M.OrderEvent.countDocuments({ orderId: id, to });

    /** A paid order, as the payment step leaves it. */
    const paidOrder = async (inputs: Record<string, string>, quote = q) => {
      const o = await O.createOrderRecord(userId, quote, inputs);
      const id = String(o._id);
      made.orders.push(id);
      await O.transition(id, "created", "awaiting_payment", {
        set: { "payment.paymentId": `sim-${tag}-${made.orders.length}` },
      });
      await O.transition(id, "awaiting_payment", "paid", {
        set: { "payment.paidAt": new Date() },
      });
      return id;
    };
    const status = async (id: string) =>
      (await M.Order.findById(id).lean()).status as string;
    const doc = async (id: string) =>
      (await M.Order.findById(id).lean()) as any;
    mock.resetMock();

    /* 1. success, and a second call changes nothing */
    let id = await paidOrder({ phone: "08011111111" });
    await F.fulfilOrder(id);
    assert.equal(await status(id), "delivered");
    await F.fulfilOrder(id);
    await F.fulfilOrder(id);
    const d1 = await doc(id);
    assert.equal(mock.mockPurchaseCalls(d1.fulfilment.requestId), 1);
    assert.equal(await ev(id, "delivered"), 1);
    assert.equal(d1.fulfilment.attempts, 1);

    /* 2. five workers at once: one purchase, one delivery */
    id = await paidOrder({ phone: "08011111112" });
    await Promise.all(Array.from({ length: 5 }, () => F.fulfilOrder(id)));
    assert.equal(await status(id), "delivered");
    assert.equal(
      mock.mockPurchaseCalls((await doc(id)).fulfilment.requestId),
      1,
    );
    assert.equal(await ev(id, "delivered"), 1);

    /* 3. token delivery: encrypted at rest, shown to the owner only, audited */
    id = await paidOrder({ meter: "1111111111111", phone: "08011111111" });
    await F.fulfilOrder(id);
    let d = await doc(id);
    assert.equal(d.status, "delivered");
    assert.ok(
      d.delivery.encryptedPayload &&
        !d.delivery.encryptedPayload.includes("0000-0000"),
    ); // not stored in clear
    const shown = await F.revealDelivery(userId, id);
    assert.equal(shown.kind, "token");
    assert.equal(shown.token, "0000-0000-0000-0000-0000");
    assert.equal(
      await F.revealDelivery(String(new mongoose.Types.ObjectId()), id),
      null,
    ); // not the owner
    assert.equal(
      await M.AuditLog.countDocuments({ action: "order.reveal", target: id }),
      1,
    );

    /* 4. view-once: the second reveal is refused */
    id = await paidOrder({ meter: "1111111111111", phone: "08011111111" }, qv);
    await F.fulfilOrder(id);
    assert.ok(await F.revealDelivery(userId, id));
    await assert.rejects(F.revealDelivery(userId, id), /shown once/);

    /* 5. pending, then success on the second status check. One purchase. */
    id = await paidOrder({ phone: "201000000000" });
    await F.fulfilOrder(id);
    assert.equal(await status(id), "fulfilling");
    await F.pollFulfilment(id, true);
    assert.equal(await status(id), "fulfilling");
    await F.pollFulfilment(id, true);
    assert.equal(await status(id), "delivered");
    assert.equal(
      mock.mockPurchaseCalls((await doc(id)).fulfilment.requestId),
      1,
    );

    /* 6. definite failure: refunded to store credit once, however many times it is attempted */
    const before6 = await balance();
    id = await paidOrder({ phone: "000000000000" });
    await F.fulfilOrder(id);
    assert.equal(await status(id), "refunded");
    assert.equal(await balance(), before6 + q.amountUsdCents);
    for (let i = 0; i < 3; i++)
      assert.equal(await R.refundOrderToCredit(id, { reason: "again" }), null); // already refunded
    await Promise.all([
      R.refundOrderToCredit(id, { reason: "x" }),
      R.refundOrderToCredit(id, { reason: "y" }),
    ]);
    await F.fulfilOrder(id);
    await F.pollFulfilment(id, true);
    assert.equal(await balance(), before6 + q.amountUsdCents);
    assert.equal(
      await M.LedgerEntry.countDocuments({
        userId,
        refType: "order",
        refId: id,
      }),
      1,
    );
    assert.equal(await ev(id, "refunded"), 1);
    // a refund can never be taken from a delivered order
    assert.equal(
      await R.refundOrderToCredit(
        (await M.Order.findOne({ userId, status: "delivered" }).lean())._id,
        { reason: "no" },
      ),
      null,
    );

    /* 7. timeout: the purchase worked, the reply was lost. Status finds it. Still one purchase. */
    id = await paidOrder({ phone: "300000000000" });
    await F.fulfilOrder(id);
    assert.equal(await status(id), "delivered");
    assert.equal(
      mock.mockPurchaseCalls((await doc(id)).fulfilment.requestId),
      1,
    );

    /* 8. no response: the purchase never happened. Retried (status first), then refunded once. */
    const before8 = await balance();
    id = await paidOrder({ phone: "400000000000" });
    await F.fulfilOrder(id);
    assert.equal(await status(id), "fulfilling");
    for (let i = 0; i < 5 && (await status(id)) === "fulfilling"; i++) {
      await M.Order.updateOne(
        { _id: id },
        { $set: { "fulfilment.nextAttemptAt": new Date(Date.now() - 1000) } },
      );
      await F.runFulfilmentJob({ skipFloat: true });
    }
    assert.equal(await status(id), "refunded");
    assert.ok((await doc(id)).fulfilment.attempts >= 3);
    assert.equal(await balance(), before8 + q.amountUsdCents);

    /* 9. server crash mid-purchase: marked as sent, provider bought it, result never recorded. Recovery asks; it does not buy again. */
    id = await paidOrder({ phone: "08011111113" });
    await O.transition(id, "paid", "fulfilling", {
      set: {
        "fulfilment.requestId": `CRASH-${tag}`,
        "fulfilment.attempts": 1,
        "fulfilment.purchaseSentAt": new Date(),
      },
    });
    const prov = createAdapter("mock", "sandbox")!;
    await prov.purchase({
      requestId: `CRASH-${tag}`,
      orderNumber: "x",
      providerCode: "x",
      kind: "fixed",
      currency: "USD",
      valueMinor: 1000,
      inputs: { phone: "08011111113" },
    });
    assert.equal(mock.mockPurchaseCalls(`CRASH-${tag}`), 1);
    await M.Order.updateOne(
      { _id: id },
      { $set: { "fulfilment.nextAttemptAt": new Date(Date.now() - 1000) } },
    );
    await F.runFulfilmentJob({ skipFloat: true });
    assert.equal(await status(id), "delivered");
    assert.equal(mock.mockPurchaseCalls(`CRASH-${tag}`), 1); // still exactly one

    /* 10. crash after claiming but before sending: recovery sends once */
    id = await paidOrder({ phone: "08011111114" });
    await O.transition(id, "paid", "fulfilling", {
      set: { "fulfilment.requestId": `PRE-${tag}`, "fulfilment.attempts": 0 },
    });
    await F.runFulfilmentJob({ skipFloat: true });
    assert.equal(await status(id), "delivered");
    assert.equal(mock.mockPurchaseCalls(`PRE-${tag}`), 1);

    /* 11. an orphaned paid order (nobody claimed it) is picked up by the job */
    id = await paidOrder({ phone: "08011111115" });
    await M.Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { updatedAt: new Date(Date.now() - 120_000) } },
    );
    await F.runFulfilmentJob({ skipFloat: true });
    assert.equal(await status(id), "delivered");

    /* 12. kill switch: a provider switched off gets nothing, and the order waits */
    id = await paidOrder({ phone: "08011111116" });
    await M.Provider.updateOne({ key: "mock" }, { active: false });
    await F.fulfilOrder(id);
    d = await doc(id);
    assert.equal(d.status, "fulfilling");
    assert.ok(!d.fulfilment.purchaseSentAt);
    assert.equal(mock.mockPurchaseCalls(d.fulfilment.requestId), 0);
    await M.Provider.updateOne({ key: "mock" }, { active: true });
    await F.fulfilOrder(id);
    assert.equal(await status(id), "delivered");

    /* 13. duplicate provider callbacks: forged ones refused, real ones apply once */
    id = await paidOrder({ phone: "200000000000" }); // stuck pending
    await F.fulfilOrder(id);
    const rid = (await doc(id)).fulfilment.requestId;
    const adapter = createAdapter("mock", "sandbox")!;
    const body = JSON.stringify({ requestId: rid, status: "success" });
    assert.equal(
      adapter.parseWebhook(new Headers({ "x-mock-signature": "forged" }), body),
      null,
    );
    assert.equal(adapter.parseWebhook(new Headers(), body), null);
    const sig = createHmac("sha256", process.env.AUTH_SECRET!)
      .update(body)
      .digest("hex");
    const event = adapter.parseWebhook(
      new Headers({ "x-mock-signature": sig }),
      body,
    )!;
    await Promise.all(
      Array.from({ length: 4 }, () => F.handleProviderEvent(adapter, event)),
    );
    assert.equal(await status(id), "delivered");
    assert.equal(await ev(id, "delivered"), 1);
    assert.equal(mock.mockPurchaseCalls(rid), 1);

    /* 14. pending for too long goes to a person, not to a refund */
    id = await paidOrder({ phone: "200000000000" });
    await F.fulfilOrder(id);
    await M.Order.updateOne(
      { _id: id },
      {
        $set: {
          "fulfilment.purchaseSentAt": new Date(Date.now() - 7 * 3_600_000),
          "fulfilment.nextAttemptAt": new Date(Date.now() - 1000),
        },
      },
    );
    await F.runFulfilmentJob({ skipFloat: true });
    assert.equal(await status(id), "review");
    assert.equal(
      await M.LedgerEntry.countDocuments({
        userId,
        refType: "order",
        refId: id,
      }),
      0,
    ); // no refund while a person decides

    await M.Provider.updateOne({ key: "mock" }, { active: prevActive });
    console.log("fulfilment simulation passed");
  } finally {
    const oids = made.orders.map((x) => new mongoose.Types.ObjectId(x));
    await M.OrderEvent.deleteMany({ orderId: { $in: oids } });
    await M.AuditLog.deleteMany({ target: { $in: made.orders } });
    await M.LedgerEntry.deleteMany({ userId: made.user });
    await M.Order.deleteMany({ _id: { $in: oids } });
    await M.Notification.deleteMany({ userId: made.user });
    await M.Product.deleteMany({ _id: { $in: made.prod } });
    if (made.cat) await M.ServiceCategory.deleteOne({ _id: made.cat });
    await M.User.deleteMany({ _id: made.user });
    await M.EmailLog.deleteMany({ to: /example\.invalid$/ });
    if (made.provider) await M.Provider.deleteOne({ key: "mock" });
    await mongoose.disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
