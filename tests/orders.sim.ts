// @ts-nocheck

// Orders against the real database with throwaway data: pricing, inputs, limits, payments, state machine. Cleans up after itself.
import assert from "node:assert/strict";

// Safety: no real emails, no real payment provider calls, no sandbox shortcut for the underpaid check.
process.env.BREVO_API_KEY = "";
process.env.NOWPAYMENTS_API_KEY = "";
process.env.NOWPAYMENTS_IPN_SECRET = "";
process.env.NOWPAYMENTS_SANDBOX = "false";

const P = "../lib";

async function main() {
  const { connectDb } = await import(`${P}/db`);
  const M = await import(`${P}/models`);
  const O = await import(`${P}/services/orders`);
  const OP = await import(`${P}/services/order-payments`);
  const { default: mongoose } = await import("mongoose");
  await connectDb();

  const tag = Math.random().toString(36).slice(2, 8);
  const made = {
    users: [] as string[],
    orders: [] as string[],
    cat: "",
    prod: [] as string[],
    provider: false,
  };
  let userId = "";
  try {
    const user = await M.User.create({
      email: `sim-${tag}@example.invalid`,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
      username: `sim${tag}`,
    });
    userId = String(user._id);
    made.users.push(userId);
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
    const prevMockActive = (await M.Provider.findOne({ key: "mock" }).lean())
      .active;
    await M.Provider.updateOne({ key: "mock" }, { active: true });
    const cat = await M.ServiceCategory.create({
      slug: `sim-${tag}`,
      name: "Sim",
      sort: 999,
      inputs: [
        {
          key: "phone",
          label: "Phone",
          type: "phone",
          required: true,
          pattern: "^0[789][01]\\d{8}$",
        },
      ],
    });
    made.cat = String(cat._id);
    const mk = (extra = {}) =>
      M.Product.create({
        categoryId: cat._id,
        providerKey: "mock",
        providerCode: `sim-${tag}-${Math.random().toString(36).slice(2, 6)}`,
        name: "Sim card",
        kind: "fixed",
        currency: "USD",
        denominations: [
          { label: "$10", valueMinor: 1000, costMinor: 950 },
          { label: "$60", valueMinor: 6000, costMinor: 5700 },
        ],
        status: "active",
        ...extra,
      });
    const prod = await mk();
    made.prod.push(String(prod._id));
    const pid = String(prod._id);

    /* ---- pricing on the server ---- */
    const q = await O.quoteOrder({ productId: pid, option: "$10" });
    assert.ok(q.priceMinor > q.costMinor && q.amountUsdCents === q.priceMinor);
    await assert.rejects(
      O.quoteOrder({ productId: pid, option: "$1" }),
      O.OrderError,
    ); // tampered option
    await assert.rejects(O.quoteOrder({ productId: pid }), O.OrderError); // missing option
    await assert.rejects(O.quoteOrder({ productId: "nope" }), O.OrderError);
    const open = await mk({
      kind: "open",
      denominations: [],
      minMinor: 10000,
      maxMinor: 50000,
      costBps: 9800,
    });
    made.prod.push(String(open._id));
    await assert.rejects(
      O.quoteOrder({ productId: String(open._id), amount: "50" }),
      O.OrderError,
    ); // below min
    await assert.rejects(
      O.quoteOrder({ productId: String(open._id), amount: "100.123" }),
      O.OrderError,
    ); // 3 decimals
    const oq = await O.quoteOrder({
      productId: String(open._id),
      amount: "200",
    });
    assert.equal(oq.valueMinor, 20000);
    assert.ok(oq.priceMinor > Math.ceil(20000 * 0.98));
    // NGN without an FX rate must refuse, never guess
    const pricing = await M.Setting.findOne({ key: "pricing" }).lean();
    if (!pricing?.value?.fxNgnPerUsd) {
      const ngn = await mk({
        currency: "NGN",
        denominations: [
          { label: "N1000", valueMinor: 100000, costMinor: 97000 },
        ],
      });
      made.prod.push(String(ngn._id));
      await assert.rejects(
        O.quoteOrder({ productId: String(ngn._id), option: "N1000" }),
        /exchange rate/,
      );
    }
    // hidden product and disabled provider are refused
    await M.Product.updateOne({ _id: open._id }, { status: "hidden" });
    await assert.rejects(
      O.quoteOrder({ productId: String(open._id), amount: "200" }),
      O.OrderError,
    );
    await M.Provider.updateOne({ key: "mock" }, { active: false });
    await assert.rejects(
      O.quoteOrder({ productId: pid, option: "$10" }),
      O.OrderError,
    );
    await M.Provider.updateOne({ key: "mock" }, { active: true });

    /* ---- inputs ---- */
    assert.deepEqual(
      O.validateInputs(q.inputs, { phone: "08011111111", evil: "x" }),
      { phone: "08011111111" },
    );
    assert.throws(
      () => O.validateInputs(q.inputs, { phone: "123" }),
      O.OrderError,
    );
    assert.throws(() => O.validateInputs(q.inputs, {}), O.OrderError);

    /* ---- limits ---- */
    const big = await O.quoteOrder({ productId: pid, option: "$60" });
    await assert.rejects(
      O.checkLimits(userId, big.amountUsdCents),
      /Verify your identity/,
    ); // above tier 0 without KYC
    await O.checkLimits(userId, q.amountUsdCents); // small order passes

    /* ---- create, snapshot ---- */
    const mkOrder = async (
      status: "created" | "awaiting_payment" = "awaiting_payment",
      pay: Record<string, unknown> = {},
    ) => {
      const o = await O.createOrderRecord(userId, q, { phone: "08011111111" });
      made.orders.push(String(o._id));
      if (status === "awaiting_payment")
        await O.transition(o._id, "created", "awaiting_payment", {
          set: {
            "payment.provider": "nowpayments",
            "payment.paymentId": `sim-${tag}-${made.orders.length}`,
            "payment.payAsset": "USDT",
            "payment.payNetwork": "Tron (TRC20)",
            "payment.payAmount": 10,
            "payment.providerStatus": "waiting",
            "payment.status": "waiting",
            "payment.expiresAt": new Date(Date.now() + 1_800_000),
            ...pay,
          },
        });
      return String(o._id);
    };
    const id1 = await mkOrder();
    const before = (await M.Order.findById(id1).lean()).amountMinor;
    await M.Product.updateOne(
      { _id: prod._id },
      { $set: { "denominations.0.costMinor": 990 } },
    ); // price change later
    assert.equal((await M.Order.findById(id1).lean()).amountMinor, before); // order keeps its price
    await M.Product.updateOne(
      { _id: prod._id },
      { $set: { "denominations.0.costMinor": 950 } },
    );

    /* ---- idempotent payment: five simultaneous 'finished' callbacks, one paid ---- */
    const info = {
      actually_paid: 10,
      pay_amount: 10,
      price_amount: q.amountUsdCents / 100,
    };
    await Promise.all(
      Array.from({ length: 5 }, () =>
        OP.applyOrderPaymentStatus(id1, "finished", info),
      ),
    );
    await OP.applyOrderPaymentStatus(id1, "finished", info);
    const paidEvents = await M.OrderEvent.countDocuments({
      orderId: id1,
      to: "paid",
    });
    assert.equal(paidEvents, 1);
    assert.equal((await M.Order.findById(id1).lean()).status, "paid");
    assert.equal(
      await M.Notification.countDocuments({
        userId,
        title: "Payment received",
      }),
      1,
    ); // one notice, not five
    assert.equal(
      await M.AuditLog.countDocuments({ action: "order.paid", target: id1 }),
      1,
    );

    /* ---- underpaid goes to review ---- */
    const id2 = await mkOrder();
    await OP.applyOrderPaymentStatus(id2, "finished", {
      actually_paid: 5,
      pay_amount: 10,
      price_amount: q.amountUsdCents / 100,
    });
    let o2 = await M.Order.findById(id2).lean();
    assert.equal(o2.status, "review");
    assert.match(o2.reviewReason, /Underpaid/);
    const id3 = await mkOrder();
    await OP.applyOrderPaymentStatus(id3, "partially_paid", {
      actually_paid: 3,
      pay_amount: 10,
    });
    assert.equal((await M.Order.findById(id3).lean()).status, "review");

    /* ---- price mismatch goes to review ---- */
    const id4 = await mkOrder();
    await OP.applyOrderPaymentStatus(id4, "finished", {
      actually_paid: 10,
      pay_amount: 10,
      price_amount: 999,
    });
    assert.equal((await M.Order.findById(id4).lean()).status, "review");

    /* ---- late payment on an expired order goes to review, never paid ---- */
    const id5 = await mkOrder("awaiting_payment", {
      "payment.expiresAt": new Date(Date.now() - 60_000),
    });
    assert.equal(await O.expireStaleOrders(userId), 1);
    assert.equal((await M.Order.findById(id5).lean()).status, "expired");
    await OP.applyOrderPaymentStatus(id5, "finished", info);
    assert.equal((await M.Order.findById(id5).lean()).status, "review");

    /* ---- in-flight payments are not expired; cancel refuses once a payment is coming ---- */
    const id6 = await mkOrder("awaiting_payment", {
      "payment.expiresAt": new Date(Date.now() - 60_000),
      "payment.providerStatus": "confirming",
    });
    assert.equal(await O.expireStaleOrders(userId), 0);
    assert.equal(
      (await M.Order.findById(id6).lean()).status,
      "awaiting_payment",
    );
    await assert.rejects(O.cancelOrder(userId, id6), /already on its way/);
    const id7 = await mkOrder();
    await O.cancelOrder(userId, id7);
    assert.equal((await M.Order.findById(id7).lean()).status, "cancelled");
    await assert.rejects(O.cancelOrder(userId, id7), O.OrderError);
    await assert.rejects(
      O.cancelOrder(String(new mongoose.Types.ObjectId()), id1),
      /not found/,
    ); // not your order

    /* ---- the state machine ---- */
    await assert.rejects(O.transition(id1, "paid", "delivered"), /cannot go/); // not allowed
    assert.equal(await O.transition(id1, "awaiting_payment", "paid"), null); // wrong current state: no-op
    // limit: open orders cap
    const s = await (
      await import(`${P}/services/shop-settings`)
    ).getShopSettings();
    for (let i = 0; i < s.maxOpenOrders; i++) await mkOrder();
    await assert.rejects(
      O.checkLimits(userId, q.amountUsdCents),
      /unpaid orders open/,
    );

    await M.Provider.updateOne({ key: "mock" }, { active: prevMockActive });
    console.log("order simulation passed");
  } finally {
    const { Types } = mongoose;
    const oids = made.orders.map((x) => new Types.ObjectId(x));
    await M.OrderEvent.deleteMany({ orderId: { $in: oids } });
    await M.AuditLog.deleteMany({ target: { $in: made.orders } });
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
