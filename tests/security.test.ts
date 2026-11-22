// @ts-nocheck

// Security checks that need no database: payment callback signatures, log scrubbing, redaction, key handling.
// Every key, token and secret below is a made-up test value.
import assert from "node:assert/strict";

process.env.AUTH_SECRET = "a".repeat(32);
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET = "c".repeat(32);
process.env.NOWPAYMENTS_IPN_SECRET = "test-ipn-secret";
process.env.VTPASS_SANDBOX_API_KEY = "null";
process.env.VTPASS_SANDBOX_PUBLIC_KEY = "  ";
process.env.VTPASS_API_KEY = "single-set-key";
process.env.VTPASS_PUBLIC_KEY = "single-set-public";
process.env.VTPASS_SECRET_KEY = "single-set-secret";

async function main() {
  const root = process.cwd();
  const { verifyIpn, signIpn } = await import(
    `${root}/lib/payments/nowpayments`
  );
  const { scrub, log } = await import(`${root}/lib/log`);
  const { redact } = await import(`${root}/lib/providers/redact`);
  const { vtpassCredsFromEnv } = await import(`${root}/lib/providers/vtpass`);
  const { encrypt, decrypt, safeEqual } = await import(`${root}/lib/crypto`);

  /* ---- payment callback signature (HMAC-SHA512 over the body with sorted keys) ---- */
  const body = {
    payment_id: 5,
    order_id: "ORD-ABC234",
    payment_status: "finished",
    actually_paid: 10,
    pay_amount: 10,
    price_amount: 10,
  };
  const good = signIpn(body, "test-ipn-secret");
  assert.equal(verifyIpn(body, good), true);
  assert.equal(
    verifyIpn({ ...body, order_id: "ORD-OTHER" }, good),
    false,
    "a changed body must fail",
  );
  assert.equal(
    verifyIpn({ ...body, actually_paid: 9999 }, good),
    false,
    "a changed amount must fail",
  );
  assert.equal(
    verifyIpn(body, signIpn(body, "wrong-secret")),
    false,
    "the wrong secret must fail",
  );
  assert.equal(verifyIpn(body, null), false);
  assert.equal(verifyIpn(body, ""), false);
  assert.equal(
    verifyIpn(Object.fromEntries(Object.entries(body).reverse()), good),
    true,
    "key order must not matter",
  );

  /* ---- timing-safe compare ---- */
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);

  /* ---- encryption at rest ---- */
  const c = encrypt("secret-code-1234");
  assert.ok(!c.includes("secret-code"));
  assert.equal(decrypt(c), "secret-code-1234");
  assert.notEqual(
    encrypt("x"),
    encrypt("x"),
    "each encryption uses a fresh nonce",
  );
  assert.throws(
    () => decrypt(c.slice(0, -4) + "AAAA"),
    "a tampered ciphertext must not decrypt",
  );

  /* ---- logs never carry secrets ---- */
  const FAKE_SK = "SK_" + "f4k3".repeat(8);
  const FAKE_PK = "PK_" + "t3st".repeat(8);
  const dirty = [
    "connect failed mongodb+srv://admin:FakePassw0rd123@cluster0.example.net/db",
    "request failed Authorization: Bearer fakebearer1234567890abcdef",
    'sent {"api-key":"FAKEKEY-12345678","secret-key":"FAKESEC-12345678"}',
    "password=fakehunter2fake token: fakeabcdefghijkl",
    `keys ${FAKE_SK} and ${FAKE_PK}`,
    "digest " + "ab12".repeat(20),
  ]
    .map(scrub)
    .join(" | ");
  for (const secret of [
    "FakePassw0rd123",
    "fakebearer1234567890",
    "FAKEKEY-12345678",
    "FAKESEC-12345678",
    "fakehunter2fake",
    "fakeabcdefghijkl",
    FAKE_SK,
    FAKE_PK,
    "ab12ab12ab12",
  ])
    assert.ok(!dirty.includes(secret), `${secret} leaked: ${dirty}`);

  const lines: string[] = [];
  const orig = console.error;
  console.error = (l: string) => lines.push(l);
  log.error("provider call failed", new Error("bad token: zzzzzzzzzzzz"), {
    "api-key": "FAKEKEY-ABCDEFGH",
    order: "ORD-1",
  });
  console.error = orig;
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, "error");
  assert.equal(parsed.order, "ORD-1");
  assert.ok(
    !lines[0].includes("FAKEKEY-ABCDEFGH") &&
      !lines[0].includes("zzzzzzzzzzzz"),
  );
  assert.equal(
    redact({ a: { "Secret-Key": "x", fine: 1 } }).a["Secret-Key"],
    "[redacted]",
  );

  /* ---- keys: "null" is empty, the single set is used ---- */
  const creds = vtpassCredsFromEnv("sandbox");
  assert.equal(creds.apiKey, "single-set-key");
  assert.equal(creds.publicKey, "single-set-public");
  assert.equal(creds.secretKey, "single-set-secret");
  console.log("security checks passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
