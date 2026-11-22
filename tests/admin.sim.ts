// @ts-nocheck

// Admin and staff actions, refunds, reports and customer controls. Cleans up after itself.
import assert from "node:assert/strict";

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
  const A = await import(`${P}/services/order-admin`);
  const Rp = await import(`${P}/services/reports`);
  const Sup = await import(`${P}/services/support`);
  const { PermissionError } = await import(`${P}/auth/permissions`);
  const mock = await import(`${P}/providers/mock`);
  const mongoose = (await import("mongoose")).default;
  await connectDb();

  const tag = Math.random().toString(36).slice(2, 8);
  const made = {
    orders: [] as string[],
    prod: [] as string[],
    cat: "",
    provider: false,
    users: [] as string[],
    tickets: [] as string[],
  };
  let prevActive: boolean | undefined;
  try {
    const mkUser = async (n: string, extra = {}) => {
      const u = await M.User.create({
        email: `sim-${n}-${tag}@example.invalid`,
        passwordHash: "x",
        emailVerifiedAt: new Date(),
        username: `sim${n}${tag}`,
        ...extra,
      });
      made.users.push(String(u._id));
      return u;
    };
    const cust = await mkUser("c");
    const other = await mkUser("o");
    const staff = {
      id: String((await mkUser("s", { role: "staff" }))._id),
      email: `sim-s-${tag}@example.invalid`,
      role: "staff",
    };
    const admin = {
      id: String((await mkUser("a", { role: "admin" }))._id),
      email: `sim-a-${tag}@example.invalid`,
      role: "admin",
    };
    const userId = String(cust._id);
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
    const prod = await M.Product.create({
      categoryId: cat._id,
      providerKey: "mock",
      providerCode: `sim-${tag}`,
      name: "Sim item",
      kind: "fixed",
      currency: "USD",
      denominations: [{ label: "$10", valueMinor: 1000, costMinor: 950 }],
      status: "active",
    });
    made.prod.push(String(prod._id));
    const q = await O.quoteOrder({
      productId: String(prod._id),
      option: "$10",
    });
    mock.resetMock();
    const mkOrder = async (
      state: "paid" | "review" | "awaiting",
      inputs: Record<string, string> = { phone: "08011111111" },
      uid = userId,
    ) => {
      const o = await O.createOrderRecord(uid, q, inputs);
      const id = String(o._id);
      made.orders.push(id);
      await O.transition(id, "created", "awaiting_payment", {
        set: {
          "payment.paymentId": `sim-${tag}-${made.orders.length}`,
          "payment.providerStatus": "waiting",
        },
      });
      if (state === "awaiting") return id;
      await O.transition(id, "awaiting_payment", "paid", {
        set: { "payment.paidAt": new Date() },
      });
      if (state === "review") {
        await O.transition(id, "paid", "review", {
          set: { reviewReason: "test" },
        });
      }
      return id;
    };
    const st = async (id: string) =>
      (await M.Order.findById(id).lean()).status as string;
    const bal = async () =>
      (await M.User.findById(userId).lean()).balanceCents as number;

    /* ---- staff may do their job ---- */
    let id = await mkOrder("review", { phone: "08011111111" });
    assert.match(await A.addNote(staff, id, "Called the customer"), /saved/);
    await assert.rejects(A.addNote(staff, id, "x"), /at least/);
    await A.resendEmail(staff, id);
    assert.match(
      await A.retryFulfilment(staff, id, "Provider is back"),
      /Sent again/,
    );
    assert.equal(await st(id), "delivered");
    assert.equal(
      mock.mockPurchaseCalls(
        (await M.Order.findById(id).lean()).fulfilment.requestId,
      ),
      1,
    );
    assert.ok(
      (await M.AuditLog.countDocuments({
        action: "order.retry",
        target: id,
      })) === 1,
    );
    assert.ok(
      (await M.OrderEvent.countDocuments({ orderId: id, type: "note" })) === 1,
    );

    /* ---- staff may NOT do admin things, even calling the service directly ---- */
    id = await mkOrder("review");
    const b0 = await bal();
    await assert.rejects(
      A.refundCrypto(staff, id, {
        asset: "USDT",
        network: "Tron (TRC20)",
        address: "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        reason: "nope!",
      }),
      PermissionError,
    );
    await assert.rejects(A.adminReveal(staff, id), PermissionError);
    assert.equal(await st(id), "review");
    assert.equal(await bal(), b0); // nothing moved
    await assert.rejects(
      A.refundCredit(
        { id: "x", email: "x", role: "investor" },
        id,
        "customer?",
      ),
      PermissionError,
    );
    await assert.rejects(
      A.addNote({ id: "x", email: "x", role: "investor" }, id, "customer?"),
      PermissionError,
    );

    /* ---- refund to credit: once, whoever clicks ---- */
    await Promise.all([
      A.refundCredit(staff, id, "Customer asked").catch(() => null),
      A.refundCredit(admin, id, "Customer asked").catch(() => null),
    ]);
    await assert.rejects(
      A.refundCredit(admin, id, "again please"),
      /cannot be refunded/,
    );
    assert.equal(await bal(), b0 + q.amountUsdCents);
    assert.equal(
      await M.LedgerEntry.countDocuments({
        userId,
        refType: "order",
        refId: id,
      }),
      1,
    );
    assert.equal((await M.Order.findById(id).lean()).refund.type, "credit");

    /* ---- refund to crypto (admin): store credit once, withdrawal refused without identity, money stays as credit ---- */
    id = await mkOrder("review");
    const b1 = await bal();
    await assert.rejects(
      A.refundCrypto(admin, id, {
        asset: "USDT",
        network: "Tron (TRC20)",
        address: "not-an-address",
        reason: "customer asked",
      }),
      /valid/i,
    );
    assert.equal(await st(id), "review"); // a bad address changes nothing
    await assert.rejects(
      A.refundCrypto(admin, id, {
        asset: "USDT",
        network: "Tron (TRC20)",
        address: "T" + "A".repeat(33),
        reason: "customer asked",
      }),
      /Refunded to store credit instead/,
    );
    assert.equal(await st(id), "refunded");
    assert.equal((await M.Order.findById(id).lean()).refund.type, "crypto");
    assert.equal(await bal(), b1 + q.amountUsdCents); // credit kept, because no identity check
    assert.equal(await M.Withdrawal.countDocuments({ userId }), 0);
    assert.equal(
      await M.LedgerEntry.countDocuments({
        userId,
        refType: "order",
        refId: id,
      }),
      1,
    );

    /* ---- mark delivered needs proof; code is encrypted; customer reveal and admin reveal are audited ---- */
    id = await mkOrder("review");
    await assert.rejects(
      A.markDelivered(staff, id, { proof: "short" }),
      /at least/,
    );
    await A.markDelivered(staff, id, {
      proof: "Token read from the provider site",
      token: "1234-5678",
    });
    const d = await M.Order.findById(id).lean();
    assert.equal(d.status, "delivered");
    assert.ok(!d.delivery.encryptedPayload.includes("1234"));
    assert.equal((await F.revealDelivery(userId, id)).token, "1234-5678");
    assert.equal((await A.adminReveal(admin, id)).token, "1234-5678");
    assert.equal(
      await M.AuditLog.countDocuments({
        action: "order.admin_reveal",
        target: id,
      }),
      1,
    );
    assert.equal(
      await M.AuditLog.countDocuments({ action: "order.reveal", target: id }),
      1,
    );
    await assert.rejects(
      A.markDelivered(staff, id, { proof: "Already delivered once" }),
      /being fulfilled or in review/,
    );

    /* ---- cancel: unpaid only, never with a payment in flight ---- */
    id = await mkOrder("awaiting");
    await A.cancelUnpaid(staff, id, "Customer asked");
    assert.equal(await st(id), "cancelled");
    id = await mkOrder("awaiting");
    await M.Order.updateOne(
      { _id: id },
      { $set: { "payment.providerStatus": "confirming" } },
    );
    await assert.rejects(
      A.cancelUnpaid(staff, id, "Customer asked"),
      /already on its way/,
    );
    await assert.rejects(
      A.cancelUnpaid(staff, await mkOrder("review"), "Customer asked"),
      /Only an unpaid/,
    );

    /* ---- retry is safe: an unclear earlier attempt refuses; a delivered one is found, not re-bought ---- */
    id = await mkOrder("review", { phone: "08011111118" });
    await M.Order.updateOne(
      { _id: id },
      {
        $set: {
          "fulfilment.requestId": `OLD-${tag}`,
          "fulfilment.purchaseSentAt": new Date(),
          "fulfilment.attempts": 1,
        },
      },
    );
    const prov = (await import(`${P}/providers`)).createAdapter(
      "mock",
      "sandbox",
    )!;
    await prov.purchase({
      requestId: `OLD-${tag}`,
      orderNumber: "x",
      providerCode: "x",
      kind: "fixed",
      currency: "USD",
      valueMinor: 1000,
      inputs: { phone: "08011111118" },
    });
    assert.match(
      await A.retryFulfilment(staff, id, "Check it please"),
      /already delivered/,
    );
    assert.equal(await st(id), "delivered");
    assert.equal(mock.mockPurchaseCalls(`OLD-${tag}`), 1);
    id = await mkOrder("review", { phone: "500000000000" }); // unclear
    await M.Order.updateOne(
      { _id: id },
      {
        $set: {
          "fulfilment.requestId": `UNK-${tag}`,
          "fulfilment.purchaseSentAt": new Date(),
        },
      },
    );
    await prov.purchase({
      requestId: `UNK-${tag}`,
      orderNumber: "x",
      providerCode: "x",
      kind: "fixed",
      currency: "USD",
      valueMinor: 1000,
      inputs: { phone: "500000000000" },
    });
    await assert.rejects(
      A.retryFulfilment(staff, id, "Try anyway"),
      /could not confirm/i,
    );
    assert.equal(await st(id), "review");
    assert.equal(mock.mockPurchaseCalls(`UNK-${tag}`), 1);

    /* ---- risk controls: block and per-customer limit ---- */
    await M.User.updateOne({ _id: userId }, { shopBlocked: true });
    await assert.rejects(
      O.checkLimits(userId, q.amountUsdCents),
      /switched off/,
    );
    await M.User.updateOne(
      { _id: userId },
      { shopBlocked: false, shopLimitUsdCents: 100 },
    );
    await assert.rejects(
      O.checkLimits(userId, 5000),
      /limit set for your account/,
    );
    await M.User.updateOne(
      { _id: userId },
      { $unset: { shopLimitUsdCents: 1 } },
    );

    /* ---- ticket linking: only your own order ---- */
    const mine = await mkOrder("awaiting");
    const theirs = await mkOrder(
      "awaiting",
      { phone: "08011111119" },
      String(other._id),
    );
    const t1 = await Sup.createTicket(
      { id: userId, email: cust.email },
      {
        subject: "Help",
        category: "order",
        body: "about my order",
        orderId: mine,
      },
    );
    const t2 = await Sup.createTicket(
      { id: userId, email: cust.email },
      {
        subject: "Help",
        category: "order",
        body: "about their order",
        orderId: theirs,
      },
    );
    made.tickets.push(String(t1._id), String(t2._id));
    assert.equal(
      String((await M.Ticket.findById(t1._id).lean()).orderId),
      mine,
    );
    assert.equal((await M.Ticket.findById(t2._id).lean()).orderId, undefined);

    /* ---- reports: revenue counts delivered only; cost and margin from the snapshot ---- */
    const now = new Date();
    const from = new Date(now.getTime() - 3_600_000);
    const to = new Date(now.getTime() + 3_600_000);
    const delivered = await M.Order.find({
      _id: { $in: made.orders },
      status: "delivered",
    }).lean();
    const expRevenue = delivered.reduce(
      (s: number, o: any) => s + o.amountUsdCents,
      0,
    );
    const expCost = delivered.reduce(
      (s: number, o: any) =>
        s +
        Math.round(o.amountUsdCents * (o.snapshot.costMinor / o.amountMinor)),
      0,
    );
    const rows = await Rp.reportBy("category", from, to);
    const mine2 = rows.find((r: any) => r.key === `sim-${tag}`);
    assert.equal(mine2.delivered, delivered.length);
    assert.equal(mine2.revenue, expRevenue);
    assert.equal(mine2.cost, expCost);
    assert.equal(mine2.margin, expRevenue - expCost);
    assert.ok(mine2.margin > 0);
    assert.ok(
      mine2.refunded >= 2 &&
        mine2.refundedAmount >= 2 * q.amountUsdCents &&
        mine2.refundRate > 0 &&
        mine2.refundRate <= 1,
    );
    const day = await Rp.reportBy("day", from, to);
    assert.ok(
      day.reduce((s: number, r: any) => s + r.delivered, 0) >= delivered.length,
    );
    const ps = await Rp.periodStats(from, to);
    assert.ok(
      ps.delivered >= delivered.length &&
        ps.revenue >= expRevenue &&
        ps.margin <= ps.revenue,
    );
    const att = await Rp.needsAttention();
    assert.ok(att.review >= 1);

    await M.Provider.updateOne({ key: "mock" }, { active: prevActive });
    console.log("admin simulation passed");
  } finally {
    const oids = made.orders.map((x) => new mongoose.Types.ObjectId(x));
    await M.OrderEvent.deleteMany({ orderId: { $in: oids } });
    await M.AuditLog.deleteMany({
      $or: [
        { target: { $in: made.orders } },
        { actorEmail: /example\.invalid$/ },
      ],
    });
    await M.LedgerEntry.deleteMany({ userId: { $in: made.users } });
    await M.TicketMessage.deleteMany({ ticketId: { $in: made.tickets } });
    await M.Ticket.deleteMany({ _id: { $in: made.tickets } });
    await M.Withdrawal.deleteMany({ userId: { $in: made.users } });
    await M.Order.deleteMany({ _id: { $in: oids } });
    await M.Notification.deleteMany({ userId: { $in: made.users } });
    await M.Product.deleteMany({ _id: { $in: made.prod } });
    if (made.cat) await M.ServiceCategory.deleteOne({ _id: made.cat });
    await M.User.deleteMany({ _id: { $in: made.users } });
    await M.EmailLog.deleteMany({ to: /example\.invalid$/ });
    if (made.provider) await M.Provider.deleteOne({ key: "mock" });
    await mongoose.disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
