/* One runnable check for the money maths behind lesson 01:  node tools/test-ccc.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-ccc.js", "utf8"))();
const { simulate, BASE } = globalThis.CCC;
const run = (o) => simulate({ ...BASE, ...o });

const base = run({});

// the frame of the simulation
assert.equal(base.series.length, 91);
assert.equal(base.series[0], BASE.cash0);
assert.equal(base.ccc, BASE.dio + BASE.dso - BASE.dpo);
assert.equal(base.ccc, 35);

// the claim the whole lesson rests on: profitable in the books, still in the red in the bank
assert.ok(base.profit > 0, "the default scenario must be profitable, got " + base.profit);
assert.ok(base.minCash < 0, "the default scenario must run out of cash, got " + base.minCash);
assert.ok(base.negDays > 0);

// invoice discounting: no more days in the red, and profit drops by exactly the fee
const disc = run({ discount: true });
assert.ok(disc.minCash >= 0, "discounting on must clear the red, got " + disc.minCash);
assert.equal(disc.negDays, 0);
assert.equal(disc.profit, base.profit - disc.fees);
assert.ok(disc.fees > 0);

// the fee scales with the days advanced — 90 days must cost twice what 45 days costs
assert.equal(run({ discount: true, dso: 90 }).fees, 2 * run({ discount: true, dso: 45 }).fees);

// the three CCC levers, each has to move the cash the right way
assert.ok(run({ dso: 15 }).minCash > base.minCash, "getting paid sooner must ease the squeeze");
assert.ok(run({ dpo: 60 }).minCash > base.minCash, "paying the supplier later must ease the squeeze");
assert.ok(run({ dio: 5 }).minCash > base.minCash, "stock moving faster must ease the squeeze");
assert.equal(run({ dso: 15 }).ccc, 5);

// selling twice as much: more profit in the books, a deeper hole in the bank
const big = run({ cogs: BASE.cogs * 2, revenue: BASE.revenue * 2 });
assert.ok(big.profit > base.profit, "twice the volume must book more profit");
assert.ok(big.minCash < base.minCash, "twice the volume must squeeze cash harder — that is death by growth");

// cash only moves on an event, and every event lands inside the window
assert.ok(base.events.every(e => e.d >= 0 && e.d <= 90));
assert.ok(base.events.some(e => e.label === "Customer pays"));

console.log(`ok — CCC ${base.ccc} days · profit ${(base.profit / 1e6).toFixed(1)}m · short ${(-base.minCash / 1e6).toFixed(1)}m in cash` +
            ` · discounting on: profit ${(disc.profit / 1e6).toFixed(1)}m, no day in the red`);
