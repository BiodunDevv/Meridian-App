// @ts-nocheck

// Provider adapters against faked HTTP: request shapes, reply classification, safe purchases, webhooks, redaction.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.AUTH_SECRET = "x".repeat(32);
async function main() {
  const R = "../lib/providers";
  const {
    createMockProvider,
    resetMock,
    mockPurchaseCalls,
    mockTotalPurchases,
  } = await import(`${R}/mock`);
  const { attemptPurchase, retryPurchase } = await import(`${R}/index`);
  const { createVtpass, vtpassRequestId, classifyVtpass } = await import(
    `${R}/vtpass`
  );
  const { redact } = await import(`${R}/redact`);

  const req = (id: string, phone: string, extra = {}) => ({
    requestId: id,
    orderNumber: "ORD-1",
    providerCode: "mock-x",
    kind: "open" as const,
    currency: "NGN" as const,
    valueMinor: 10000,
    inputs: { phone },
    ...extra,
  });

  /* ---------- mock: every outcome ---------- */
  const m = createMockProvider();
  resetMock();
  let r = await attemptPurchase(m, req("a1", "08011111111"));
  assert.equal(r.outcome.status, "success");
  r = await attemptPurchase(m, req("a2", "000000000000"));
  assert.equal(r.outcome.status, "failed");
  // pending then success after two status checks
  r = await attemptPurchase(m, req("a3", "201000000000"));
  assert.equal(r.outcome.status, "pending");
  assert.equal((await m.status("a3")).status, "pending");
  assert.equal((await m.status("a3")).status, "success");
  // stuck stays pending
  await attemptPurchase(m, req("a4", "200000000000"));
  assert.equal((await m.status("a4")).status, "pending");
  // timeout: purchase worked, reply lost. attemptPurchase finds success via status, ONE purchase only
  r = await attemptPurchase(m, req("a5", "300000000000"));
  assert.equal(r.outcome.status, "success");
  assert.equal(mockPurchaseCalls("a5"), 1);
  // calling retryPurchase afterwards must NOT buy again
  const rr = await retryPurchase(m, req("a5", "300000000000"));
  assert.equal(rr.sentAgain, false);
  assert.equal(mockPurchaseCalls("a5"), 1);
  // no response: never happened. status says not_found, so a retry IS safe and buys exactly once
  r = await attemptPurchase(m, req("a6", "400000000000"));
  assert.equal(r.retryable, true);
  assert.equal(mockPurchaseCalls("a6"), 0);
  // unexpected reply: unknown, not retryable
  r = await attemptPurchase(m, req("a7", "500000000000"));
  assert.equal(r.outcome.status, "unknown");
  assert.equal(r.retryable, false);
  // same request id twice never buys twice
  const before = mockTotalPurchases();
  await m.purchase(req("a1", "08011111111"));
  await m.purchase(req("a1", "08011111111"));
  assert.equal(mockTotalPurchases(), before);
  // mock webhook: bad signature refused, good accepted
  const body = JSON.stringify({ requestId: "a1", status: "success" });
  assert.equal(
    m.parseWebhook(new Headers({ "x-mock-signature": "nope" }), body),
    null,
  );
  assert.equal(m.parseWebhook(new Headers(), body), null);
  const sig = createHmac("sha256", process.env.AUTH_SECRET!)
    .update(body)
    .digest("hex");
  assert.equal(
    m.parseWebhook(new Headers({ "x-mock-signature": sig }), body)?.outcome
      .status,
    "success",
  );

  /* ---------- VTpass ---------- */
  const lagos = vtpassRequestId("ORD-AB12CD", new Date("2026-11-16T22:30:00Z")); // 23:30 in Lagos
  assert.equal(lagos, "202611162330ORDAB12CD");
  assert.ok(lagos.length >= 12 && /^\d{12}/.test(lagos));
  assert.equal(
    vtpassRequestId("X", new Date("2026-11-16T23:30:00Z")).slice(0, 12),
    "202611170030",
  ); // rolls over in Lagos

  const calls: { url: string; init: any }[] = [];
  const fake =
    (handler: (url: string, body: any) => unknown | "timeout") =>
    async (url: string, init?: any) => {
      calls.push({ url, init });
      const out = handler(url, init?.body ? JSON.parse(init.body) : undefined);
      if (out === "timeout") throw new Error("timeout");
      return new Response(JSON.stringify(out), { status: 200 });
    };
  const creds = {
    apiKey: "KEY-SECRET-1",
    publicKey: "PUB-SECRET-2",
    secretKey: "SEC-SECRET-3",
  };
  const delivered = {
    code: "000",
    response_description: "TRANSACTION SUCCESSFUL",
    content: { transactions: { status: "delivered", transactionId: "T1" } },
    purchased_code: "Token: 1234 5678",
    token: "1234 5678",
  };
  const vt = createVtpass("sandbox", {
    creds,
    fetch: fake((u) =>
      u.endsWith("/pay")
        ? delivered
        : u.endsWith("/balance")
          ? { code: 1, contents: { balance: 1081.82 } }
          : {},
    ),
  });
  const out = await vt.purchase({
    ...req("202611161200ORD1", "08011111111"),
    providerCode: "mtn",
  });
  assert.equal(out.status, "success");
  let c = calls.at(-1)!;
  assert.equal(c.url, "https://sandbox.vtpass.com/api/pay");
  assert.equal(c.init.headers["api-key"], "KEY-SECRET-1");
  assert.equal(c.init.headers["secret-key"], "SEC-SECRET-3");
  assert.deepEqual(JSON.parse(c.init.body), {
    request_id: "202611161200ORD1",
    serviceID: "mtn",
    amount: 100,
    phone: "08011111111",
  });
  // electricity: token delivered and mapped
  const el = await vt.purchase({
    ...req("202611161200ORD2", "x", {
      providerCode: "portharcourt-electric",
      valueMinor: 200000,
      inputs: {
        phone: "08011111111",
        meter: "1111111111111",
        meterType: "prepaid",
      },
    }),
  });
  assert.deepEqual(el.delivery, {
    kind: "token",
    token: "1234 5678",
    units: undefined,
  });
  assert.deepEqual(JSON.parse(calls.at(-1)!.init.body), {
    request_id: "202611161200ORD2",
    serviceID: "portharcourt-electric",
    billersCode: "1111111111111",
    variation_code: "prepaid",
    amount: 2000,
    phone: "08011111111",
  });
  // raw never carries the token
  assert.ok(!JSON.stringify(el.raw).includes("5678"));
  // GET uses api-key + public-key
  assert.deepEqual(await vt.balance(), {
    balanceMinor: 108182,
    currency: "NGN",
  });
  c = calls.at(-1)!;
  assert.equal(c.init.headers["public-key"], "PUB-SECRET-2");
  assert.equal(c.init.headers["secret-key"], undefined);
  // timeout never throws, is unknown, and exactly one POST is sent per purchase
  calls.length = 0;
  const vtTimeout = createVtpass("sandbox", {
    creds,
    fetch: fake(() => "timeout"),
  });
  const to = await vtTimeout.purchase({
    ...req("202611161200ORD3", "300000000000"),
    providerCode: "mtn",
  });
  assert.equal(to.status, "unknown");
  assert.equal(calls.filter((x) => x.url.endsWith("/pay")).length, 1);
  // classification table
  const cl = (code: string, status?: string) =>
    classifyVtpass({
      status: 200,
      noResponse: false,
      json: {
        code,
        content: status ? { transactions: { status } } : undefined,
      },
    });
  assert.equal(cl("000", "delivered").status, "success");
  assert.equal(cl("000", "pending").status, "pending");
  assert.equal(cl("000", "initiated").status, "pending");
  assert.equal(cl("099").status, "pending");
  assert.equal(cl("089").status, "pending");
  assert.equal(cl("016").status, "failed");
  assert.equal(cl("018").status, "failed");
  assert.equal(cl("014").status, "unknown"); // id already used: purchase happened, ask status
  assert.equal(cl("040").status, "unknown");
  assert.equal(cl("044").status, "unknown");
  assert.equal(cl("999").status, "unknown");
  assert.equal(
    classifyVtpass({ status: 502, noResponse: false, json: null }).status,
    "unknown",
  );
  assert.equal(
    classifyVtpass(
      { status: 200, noResponse: false, json: { code: "015" } },
      true,
    ).status,
    "not_found",
  );
  // webhook fails closed
  const vtw = createVtpass("sandbox", { creds, webhookSecret: "s3" });
  const hook = JSON.stringify({
    type: "transaction-update",
    data: {
      code: "000",
      requestId: "R1",
      content: { transactions: { status: "delivered" } },
    },
  });
  assert.equal(
    vtw.parseWebhook(new Headers(), hook, new URLSearchParams("secret=wrong")),
    null,
  );
  assert.equal(
    vtw.parseWebhook(new Headers(), hook, new URLSearchParams()),
    null,
  );
  const ev = vtw.parseWebhook(
    new Headers(),
    hook,
    new URLSearchParams("secret=s3"),
  )!;
  assert.equal(ev.requestId, "R1");
  assert.equal(ev.outcome.status, "success");
  assert.equal(ev.confirmWithStatus, true);
  assert.equal(
    createVtpass("sandbox", { creds, webhookSecret: "" }).parseWebhook(
      new Headers(),
      hook,
      new URLSearchParams("secret="),
    ),
    null,
  );
  // missing keys
  assert.equal(
    createVtpass("live", {
      creds: { apiKey: "", publicKey: "", secretKey: "" },
    }).isConfigured(),
    false,
  );
  // catalogue: variations become fixed items, zero-price variations are skipped
  const vtc = createVtpass("sandbox", {
    creds,
    fetch: fake((u) =>
      u.includes("service-variations")
        ? {
            content: {
              variations: [
                {
                  variation_code: "gotv-lite",
                  name: "GOtv Lite",
                  variation_amount: "400.00",
                },
                {
                  variation_code: "x",
                  name: "No price",
                  variation_amount: "0",
                },
              ],
            },
          }
        : {},
    ),
  });
  const cat = await vtc.catalogue();
  assert.ok(
    cat.find(
      (i) =>
        i.providerCode === "gotv:gotv-lite" &&
        i.denominations[0].valueMinor === 40000,
    ),
  );
  assert.ok(!cat.find((i) => i.providerCode.endsWith(":x")));
  assert.ok(cat.find((i) => i.providerCode === "mtn" && i.kind === "open"));

  // The VTpass sandbox sends the balance as text, not a number.
  const vtText = createVtpass("sandbox", {
    creds: { apiKey: "a", publicKey: "b", secretKey: "c" },
    fetch: async () =>
      new Response(
        JSON.stringify({ code: 1, contents: { balance: "2000000.00" } }),
      ),
  });
  assert.deepEqual(await vtText.balance(), {
    balanceMinor: 200000000,
    currency: "NGN",
  });

  /* ---------- redaction ---------- */
  const red = JSON.stringify(
    redact({
      "api-key": "A",
      nested: { Authorization: "Bearer B", pinCode: "1", ok: "fine" },
      list: [{ token: "T" }],
    }),
  );
  assert.ok(!/"A"|Bearer B|"1"|"T"/.test(red) && red.includes("fine"));

  console.log("provider checks passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
