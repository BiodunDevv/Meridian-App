// @ts-nocheck

// Idempotent submits and rate limits, against the real database with throwaway keys. Cleans up after itself.
import assert from "node:assert/strict";

async function main() {
  const root = process.cwd();
  const { connectDb } = await import(`${root}/lib/db`);
  const M = await import(`${root}/lib/models`);
  const { withIdempotency } = await import(`${root}/lib/auth/idempotency`);
  const { rateLimit } = await import(`${root}/lib/auth/rate-limit`);
  const mongoose = (await import("mongoose")).default;
  await connectDb();
  const tag = Math.random().toString(36).slice(2, 8);
  const uid = new mongoose.Types.ObjectId().toString();
  try {
    // five simultaneous submits with one key: the work runs once
    let runs = 0;
    const work = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 30));
      return { ok: true, message: "done" };
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        withIdempotency(uid, `key-${tag}-aaaaaaaa`, work),
      ),
    );
    assert.equal(runs, 1);
    assert.equal(results.filter((r) => r.message === "done").length, 1);
    assert.equal(
      results.filter((r) => /Already received/.test(r.message ?? "")).length,
      4,
    );
    // a later repeat is also a no-op
    await withIdempotency(uid, `key-${tag}-aaaaaaaa`, work);
    assert.equal(runs, 1);
    // a failed attempt releases the key so the user can fix it and retry
    let n = 0;
    const flaky = async () =>
      ++n === 1
        ? { ok: false, error: "bad input" }
        : { ok: true, message: "fixed" };
    assert.equal(
      (await withIdempotency(uid, `key-${tag}-bbbbbbbb`, flaky)).ok,
      false,
    );
    assert.equal(
      (await withIdempotency(uid, `key-${tag}-bbbbbbbb`, flaky)).message,
      "fixed",
    );
    // a thrown error also releases it
    let t = 0;
    const boom = async () => {
      if (++t === 1) throw new Error("db down");
      return { ok: true, message: "ok" };
    };
    await assert.rejects(
      withIdempotency(uid, `key-${tag}-cccccccc`, boom),
      /db down/,
    );
    assert.equal(
      (await withIdempotency(uid, `key-${tag}-cccccccc`, boom)).message,
      "ok",
    );
    // no key (or a short one) runs every time
    await withIdempotency(uid, undefined, work);
    await withIdempotency(uid, "short", work);
    assert.equal(runs, 3);
    // different users never share a key
    await withIdempotency(
      new mongoose.Types.ObjectId().toString(),
      `key-${tag}-aaaaaaaa`,
      work,
    );
    assert.equal(runs, 4);

    // rate limit: the first N pass, the rest are refused, a different key is independent
    const k = `test:${tag}`;
    const got = [];
    for (let i = 0; i < 6; i++) got.push(await rateLimit(k, 4, 60));
    assert.deepEqual(got, [true, true, true, true, false, false]);
    assert.equal(await rateLimit(`${k}:other`, 4, 60), true);
    console.log("idempotency and rate limit checks passed");
  } finally {
    await M.Idempotency.deleteMany({ key: new RegExp(`key-${tag}`) });
    await M.RateLimit.deleteMany({ key: new RegExp(`test:${tag}`) });
    await mongoose.disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
