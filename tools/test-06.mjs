/* One runnable check for the money maths behind lesson 06:  node tools/test-06.mjs
   The two mistakes the lesson is about are both one-line changes, so the checks that
   matter are the ones that pin down how much money each one moves. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-06.js", "utf8"))();
const LATE = globalThis.LATE;
const { BASE } = LATE;
const run = (o) => LATE.compute({ ...BASE, ...o });

const base = run({});

// the frame: a contract rate is used as agreed, and with no mistake switched on the
// code and the precedent agree to the đồng
assert.equal(base.rate, 24);
assert.equal(base.appliedRate, 24);
assert.equal(base.rateSource, "agreed in the contract");
assert.equal(base.lawful, LATE.interest(BASE.principal, 24, 180));
assert.equal(base.charged, base.lawful);
assert.equal(base.gap, 0);
assert.equal(base.ceilingCost, 0);
assert.equal(base.overcharge, 0);

// Án lệ 09 rule one — no rate agreed means the average of at least three banks, never a constant
assert.equal(LATE.averageRate(), 13.5);
const avg = run({ rate: null });
assert.equal(avg.rate, 13.5);
assert.match(avg.rateSource, /^average of 3 banks$/);
assert.equal(avg.lawful, LATE.interest(BASE.principal, 13.5, 180));
assert.equal(run({ rate: "" }).rate, avg.rate, "a blank field must behave like null");

// mistake one — the Điều 468 ceiling. It takes money from the seller, and the amount is
// exactly the interest on the slice of rate it cut away
const cap = run({ civilCeiling: true });
assert.equal(cap.appliedRate, 20);
assert.ok(cap.ceilingBites);
assert.ok(cap.charged < base.lawful, "capping at 20% must underpay the seller");
assert.equal(cap.ceilingCost, base.lawful - cap.charged);
assert.equal(cap.ceilingCost, LATE.interest(BASE.principal, 24, 180) - LATE.interest(BASE.principal, 20, 180));

// ...and the reason it ships green: on a debt whose rate is already under the ceiling the
// wrong line and the right line return the same number
const capAvg = run({ rate: null, civilCeiling: true });
assert.equal(capAvg.ceilingCost, 0);
assert.equal(capAvg.charged, avg.charged);
assert.equal(capAvg.ceilingBites, false);

// mistake two — interest on phạt vi phạm and bồi thường thiệt hại. This is the calculation
// the first-instance court made in the Thép Việt Ý case and the one Án lệ 09 rejected
const onPen = run({ onPenalty: true });
assert.equal(onPen.chargedBase, BASE.principal + onPen.penalty + BASE.damages);
assert.ok(onPen.overcharge > 0);
assert.equal(onPen.gap, onPen.overcharge);
assert.equal(onPen.overcharge, LATE.interest(onPen.penalty + BASE.damages, 24, 180));
assert.deepEqual(onPen.rows.map(r => r.charged), [true, true, true]);
assert.deepEqual(base.rows.map(r => r.charged), [true, false, false]);

// the lawful figure must be untouchable from the sanction rows — ten times the damages,
// ten times the penalty, and what the seller is owed in interest does not move one đồng
assert.equal(run({ damages: BASE.damages * 10 }).lawful, base.lawful);
assert.equal(run({ penaltyPct: 80 }).lawful, base.lawful);

// the two mistakes are independent and compose exactly: charged = lawful − ceilingCost + overcharge
for (const civilCeiling of [false, true]) {
  for (const onPenalty of [false, true]) {
    for (const rate of [null, 9, 20, 24, 36]) {
      for (const days of [0, 45, 180, 540]) {
        const r = run({ civilCeiling, onPenalty, rate, days });
        assert.equal(r.charged, r.lawful - r.ceilingCost + r.overcharge,
          `charged must decompose · ceiling=${civilCeiling} penalty=${onPenalty} rate=${rate} days=${days}`);
        assert.ok(r.ceilingCost >= 0 && r.overcharge >= 0);
      }
    }
  }
}

// accrual is linear in days — a job that missed a night catches up by adding the days it missed
// (to the đồng, not to the fraction: every figure here is rounded to a whole đồng)
assert.equal(run({ days: 0 }).lawful, 0);
assert.ok(Math.abs(run({ days: 360 }).lawful - 2 * run({ days: 180 }).lawful) <= 1);

// Điều 301 Luật Thương mại 2005 — the penalty has its own ceiling, and it is not the interest's
assert.equal(LATE.PENALTY_CAP, 8);
assert.equal(base.penalty, base.penaltyCapAmount);
assert.equal(base.penaltyOverCap, false);
assert.equal(run({ penaltyPct: 9 }).penaltyOverCap, true);
assert.equal(run({ penaltyPct: 9 }).penaltyCapAmount, Math.round(BASE.principal * 0.08));

const m = (n) => (n / 1e6).toFixed(1) + "m ₫";
console.log(`ok — lawful interest ${m(base.lawful)} · the 20% ceiling takes ${m(cap.ceilingCost)} from the seller` +
            ` · interest on penalty + damages invents ${m(onPen.overcharge)} no court will uphold`);
