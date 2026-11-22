// @ts-nocheck
/* eslint-disable */
// Pure checks for pricing, markup, FX and the catalogue line parsers. No database or network.
import assert from "node:assert/strict";
import {
  computePrice,
  convertMinor,
  effectiveMarkup,
} from "../lib/services/pricing";
import {
  parseDenominationLines,
  parseInputLines,
  priceProduct,
} from "../lib/services/catalogue";

// 5% of 97000 kobo = 4850 -> price 101850
assert.equal(
  computePrice(97000, { type: "percent", value: 500 }, 100).priceMinor,
  101850,
);
// rounds up: 5% of 333 = 16.65 -> 17
assert.equal(
  computePrice(333, { type: "percent", value: 500 }, 100).priceMinor,
  350,
);
// 0% markup is raised to the 1% floor, and flagged
const f = computePrice(10000, { type: "percent", value: 0 }, 100);
assert.equal(f.priceMinor, 10100);
assert.equal(f.floored, true);
// fixed markup below floor is raised
assert.equal(
  computePrice(10000, { type: "fixed", value: 5 }, 100).priceMinor,
  10100,
);
// never below cost: negative and bad inputs throw
assert.throws(() => computePrice(10000, { type: "percent", value: -1 }, 100));
assert.throws(() => computePrice(0, { type: "percent", value: 500 }, 100));
assert.throws(() => computePrice(10.5, { type: "percent", value: 500 }, 100));
// property: price >= cost*(1+floor) for many costs/markups
for (let c = 1; c < 3000; c += 7)
  for (const v of [0, 1, 50, 500, 2500]) {
    const r = computePrice(c, { type: "percent", value: v }, 100);
    assert.ok(r.priceMinor >= c + Math.ceil(c / 100) && r.priceMinor > c);
  }
// markup precedence
const s = { defaultMarkupBps: 500 };
assert.equal(
  effectiveMarkup(
    { markup: { type: "percent", value: 1 } },
    { markup: { type: "percent", value: 2 } },
    s,
  ).source,
  "product",
);
assert.equal(
  effectiveMarkup({}, { markup: { type: "percent", value: 2 } }, s).source,
  "category",
);
assert.equal(effectiveMarkup({}, {}, s).source, "default");
// fx
assert.equal(convertMinor(150000, "NGN", 1500), 100); // 1500 NGN = $1.00
assert.equal(convertMinor(150001, "NGN", 1500), 101); // rounds up
assert.equal(convertMinor(100, "USD", 1500), 150000);
assert.equal(convertMinor(100, "USD", null), null);
// parsing
assert.equal(
  parseDenominationLines("MTN 1GB | 1000 | 970.5")[0].costMinor,
  97050,
);
assert.throws(() => parseDenominationLines("bad line"));
assert.equal(
  parseInputLines("phone | Phone | phone | yes | ^0\\d+$")[0].pattern,
  "^0\\d+$",
);
assert.throws(() => parseInputLines("phone | Phone | phone\nphone | Again"));
assert.throws(() => parseInputLines("x | X | select | yes | one"));
// product pricing, open and fixed
const open = priceProduct(
  {
    kind: "open",
    currency: "NGN",
    minMinor: 10000,
    maxMinor: 5000000,
    costBps: 9800,
  },
  null,
  { defaultMarkupBps: 500, minMarginBps: 100, fxNgnPerUsd: 1500 },
);
assert.equal(open.options.length, 2);
assert.ok(open.options.every((o) => o.priceMinor > o.costMinor));
console.log("pricing checks passed");
