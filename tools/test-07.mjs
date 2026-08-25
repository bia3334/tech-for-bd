/* One runnable check for the money maths behind lesson 07:  node tools/test-07.mjs
   The lesson claims three things that are easy to say and easy to get wrong in code:
   the three products differ in who may start them, whose rating prices them, and what
   backs them. Each of those claims is a number here. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-07.js", "utf8"))();
const SCF = globalThis.SCF;
const { BASE } = SCF;
const run = (o) => SCF.simulate(o);

const none = run({ product: "NONE" });

// the frame — ninety days of a company that is profitable and empty
assert.equal(none.series.length, 91);
assert.equal(none.series[0], BASE.cash0);
assert.ok(none.minCash < 0, "unfinanced, the account must go under: got " + none.minCash);
assert.ok(none.negDays > 20, "and stay under for weeks: got " + none.negDays);
assert.equal(none.cost, 0);
// the baseline inside every other run is this same line, to the đồng
assert.deepEqual(run({ product: "DISCOUNT" }).base.series, none.series);

// the fee is the service's own formula — simple interest, 365-day year (FinancingFormula)
assert.equal(SCF.fee(400e6, 18, 55), Math.round(400e6 * 0.18 * 55 / 365));
assert.equal(SCF.fee(400e6, 18, 0), 0);
assert.equal(SCF.fee(400e6, 0, 55), 0);

// ── invoice discounting: the seller brings its own receivable, and pays its own rate ──
const disc = run({ product: "DISCOUNT" });
assert.ok(disc.plan.ok);
assert.equal(disc.plan.advance, 400e6);                    // 80% of the invoice
assert.equal(disc.plan.reserve, 100e6);                    // the rest, released on settlement
assert.equal(disc.plan.rate, BASE.sellerRate);
assert.equal(disc.cost, SCF.fee(400e6, BASE.sellerRate, BASE.dueDay - BASE.disburseDay));
assert.equal(disc.cashByDisbursement, disc.plan.advance - disc.cost);
assert.ok(disc.minCash >= 0, "discounting must clear the red here: got " + disc.minCash);
assert.equal(disc.negDays, 0);
// priced off the SELLER: move the seller's rate and the fee moves with it, linearly
assert.ok(run({ product: "DISCOUNT", sellerRate: 30 }).cost > disc.cost);
assert.equal(run({ product: "DISCOUNT", sellerRate: 36 }).cost,
             2 * run({ product: "DISCOUNT", sellerRate: 18 }).cost);
// and not off the buyer at all
assert.equal(run({ product: "DISCOUNT", buyerRate: 2 }).cost, disc.cost);

// ── reverse factoring: the buyer starts it, so the buyer's rating sets the price ──
const notEnrolled = run({ product: "REVERSE" });
assert.equal(notEnrolled.plan.ok, false);
assert.equal(notEnrolled.plan.code, "NO_PROGRAM");
// a refused product changes nothing — the cash line is the unfinanced one, exactly
assert.deepEqual(notEnrolled.series, none.series);
assert.equal(notEnrolled.cost, 0);

const rev = run({ product: "REVERSE", enrolled: true });
assert.ok(rev.plan.ok);
assert.equal(rev.plan.advance, BASE.invoice, "the buyer confirmed it, so nothing is held back");
assert.equal(rev.plan.rate, BASE.buyerRate);
assert.equal(rev.cost, SCF.fee(BASE.invoice, BASE.buyerRate, BASE.dueDay - BASE.disburseDay));
// the whole point of the chapter: more cash, sooner, for less money than the SME's own product
assert.ok(rev.cost < disc.cost, "reverse factoring must be the cheaper of the two");
assert.ok(rev.cashByDisbursement > disc.cashByDisbursement);
assert.equal(rev.negDays, 0);
// priced off the BUYER: the seller's own rate may go anywhere and the fee does not move
for (const sellerRate of [12, 18, 24, 30]) {
  assert.equal(run({ product: "REVERSE", enrolled: true, sellerRate }).cost, rev.cost,
    "the supplier's own rating must not touch a reverse factoring fee");
}
// ...which is exactly the gap that widens as the SME's own name gets worse
const cheapSme = run({ product: "DISCOUNT", sellerRate: 12 });
const dearSme = run({ product: "DISCOUNT", sellerRate: 30 });
assert.ok(dearSme.cost - rev.cost > cheapSme.cost - rev.cost);

// ── inventory financing: nothing is owed yet, so the goods are what is priced ──
const noStock = run({ product: "INVENTORY", stock: 0 });
assert.equal(noStock.plan.ok, false);
assert.equal(noStock.plan.code, "NO_COLLATERAL");
assert.deepEqual(noStock.series, none.series);

const inv = run({ product: "INVENTORY" });
assert.ok(inv.plan.ok);
assert.equal(inv.plan.advance, Math.round(BASE.stock * BASE.inventoryAdvance / 100)); // SCF-13
assert.equal(inv.plan.rate, BASE.sellerRate + BASE.goodsPremium);
assert.equal(run({ product: "INVENTORY", stock: 800e6 }).plan.advance, 2 * inv.plan.advance,
             "twice the stock, twice the limit — Σ pledged_value × advance_rate");
// the invoice is untouched: the buyer still pays YOU on the due date
assert.ok(inv.events.some(e => e.amount === BASE.invoice));
assert.ok(!disc.events.some(e => e.amount === BASE.invoice));
assert.ok(!rev.events.some(e => e.amount === BASE.invoice));
// and this one you repay yourself, on the loan's own schedule
assert.ok(inv.events.some(e => e.d === BASE.disburseDay + BASE.inventoryTenor && e.amount < 0));
// the smallest money of the three, and it does not save this company on its own
assert.ok(inv.cashByDisbursement < disc.cashByDisbursement);
assert.ok(inv.minCash > none.minCash, "it must still help");
assert.ok(inv.minCash < 0, "but 60% of the stock does not cover a 500m hole");

// ── the trade every product makes: cash today costs some of tomorrow ──
for (const r of [disc, rev, inv]) {
  assert.ok(r.cost > 0, r.plan.name + " must cost something");
  assert.ok(r.cashByDisbursement < r.plan.advance, "you never receive the face value");
  assert.ok(r.minCash > none.minCash, r.plan.name + " must ease the squeeze");
  assert.equal(r.rescued, r.minCash - none.minCash);
  assert.equal(r.end, none.end - r.cost,
    r.plan.name + " must end the quarter exactly the fee poorer — no more, no less");
}

// deterministic: no clock, no random, same answer every time
assert.deepEqual(run({ product: "REVERSE", enrolled: true }), rev);

const m = (n) => (n / 1e6).toFixed(1) + "m ₫";
console.log(`ok — unfinanced: ${m(none.minCash)} at the worst, ${none.negDays} days in the red` +
            ` · discounting costs ${m(disc.cost)} at ${disc.plan.rate}%` +
            ` · reverse factoring costs ${m(rev.cost)} at ${rev.plan.rate}% and hands over more` +
            ` · inventory financing lends ${m(inv.plan.advance)} against ${m(BASE.stock)} of stock`);
