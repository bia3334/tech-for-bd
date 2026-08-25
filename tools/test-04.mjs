/* One runnable check for the credit maths behind lesson 04:  node tools/test-04.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-04.js", "utf8"))();
const C = globalThis.CREDIT;
const { BASE, view, check, addOrder, settleOldest, ageOldest } = C;

// the three numbers people confuse: limit, exposure, headroom — and utilisation on top
const base = view(BASE);
assert.equal(base.exposure, 240e6);
assert.equal(base.available, BASE.limit - base.exposure);
assert.equal(base.utilisation, 0.48);
assert.equal(base.score, 73);
assert.equal(base.grade, "A");
assert.equal(base.risk, "LOW");

// the weight that was scored is 85, not 100: CONTRACT_COMPLIANCE has no data source at all,
// so its 15 is shared out instead of being handed over as free points
assert.equal(base.scoredWeight, 85);
assert.ok(!("CONTRACT_COMPLIANCE" in base.factors));
assert.equal(Object.keys(base.factors).length, 4);

// a brand-new partner with nothing settled: payment history is ABSENT, not zero
const fresh = view({ ...BASE, relationshipMonths: null, items: [{ n: 1, amount: 120e6, settled: false, late: 0 }] });
assert.ok(!("PAYMENT_HISTORY" in fresh.measured), "no settled invoice means no payment history to measure");
assert.equal(fresh.scoredWeight, 35, "only value and frequency can be scored for a new partner");

// one invoice paid thirty days late drops the partner two grades and one risk level
const late = view(settleOldest(BASE, 30));
assert.equal(late.score, 48);
assert.equal(late.grade, "B");
assert.equal(late.risk, "HIGH");
assert.ok(late.score < base.score - 20, "a single late payment must cost more than a rounding error");

// paying on time instead leaves the score exactly where it was
assert.equal(view(settleOldest(BASE, 0)).score, base.score);

// an invoice forty days past due but still unpaid moves days_overdue and NOTHING in the score
const aged = view(ageOldest(BASE, 40));
assert.equal(aged.score, base.score, "overdue-but-unsettled cannot touch payment history");
assert.equal(aged.overdueDays, 40);
assert.equal(aged.overOverdue, true, "40 days is past the 30 a LOW-risk partner is allowed");

// the gate: over the limit alone refuses nothing. Both readings must agree.
const overByLimit = check(BASE, 400e6);
assert.equal(overByLimit.exceeded, true);
assert.equal(overByLimit.action, "NOTIFY");
assert.equal(overByLimit.allowed, true, "a LOW-risk partner over the limit is warned, not blocked");

const downgraded = settleOldest(BASE, 30);
const overByBoth = check(downgraded, 400e6);
assert.equal(overByBoth.exceeded, true);
assert.equal(overByBoth.action, "BLOCK");
assert.equal(overByBoth.allowed, false, "over the limit AND a BLOCK level is the only way to refuse");

// and the mirror image: two more orders sit comfortably inside the 500m limit and are
// waved through, while the risk ceiling for the level they land in has already gone past.
// Two controls, two different questions.
assert.equal(view(downgraded).threshold.maxExposure, 150e6);
const stretched = view(addOrder(addOrder(downgraded, 120e6), 120e6));
assert.equal(stretched.exposure, 360e6);
assert.ok(stretched.available > 0, "still well inside the limit");
assert.equal(stretched.threshold.maxExposure, 300e6);
assert.equal(stretched.overCeiling, true, "the limit says yes and the risk ceiling says no");

// a refused order is never written
const blocked = addOrder(downgraded, 400e6);
assert.equal(blocked.items.length, downgraded.items.length, "a blocked order must not reach the table");

// growth flatters the score: taking on more exposure raises transaction value and frequency
const bigger = view(addOrder(addOrder(BASE, BASE.order), BASE.order));
assert.ok(bigger.score > base.score, "more business must raise the score — that is what the weights say");
assert.ok(bigger.exposure > base.exposure);

console.log(`ok — base ${base.score}/${base.grade}/${base.risk} at ${(base.utilisation * 100).toFixed(0)}% used` +
            ` · one late payment → ${late.score}/${late.grade}/${late.risk}` +
            ` · over the limit at LOW: allowed, at HIGH: blocked`);
