/* The three quotes behind lesson 09. No DOM in here, so tools/test-09.mjs can run it in node.

   One rule applied to all three, whatever unit they were quoted in:

       cost of the deal  ÷  the money that actually landed  ×  365 ÷ days the money is held

   365 rather than 360 to match FinancingFormula in scf-service, which declares its own
   denominator back to the user. The denominator of the first division is the money RECEIVED,
   not the amount asked for — that is the one place this differs from
   FinancingFormula.effectiveAnnualRatePercent, and the difference is deliberate.            */
(function (root) {
"use strict";

/* The company needs this much, now. Everything below is priced against it. */
var AMOUNT = 500e6;

var QUOTES = [
  { id: "A", name: "Ngân hàng Đông Phương",
    headline: "1.2% per month", headlineNo: 1.2,
    unit: "monthly", rate: 1.2,
    small: "Arrangement fee 0.4% of the amount, charged once, deducted at drawdown.",
    arrangePct: 0.4, minDraw: 0, facility: 0, unusedPctYear: 0 },

  { id: "B", name: "Công ty Tài chính Trường Sơn",
    headline: "2% flat", headlineNo: 2,
    unit: "flat", rate: 2,
    small: "No monthly interest at all. Minimum drawdown 900.0m — the 2% is charged on the minimum, not on the 500.0m you take.",
    arrangePct: 0, minDraw: 900e6, facility: 0, unusedPctYear: 0 },

  { id: "C", name: "Quỹ Đầu tư Hải Đăng",
    headline: "3% off the face value", headlineNo: 3,
    unit: "discount", rate: 3,
    small: "Said out loud as \u201cwe take three percent and pay you today\u201d. Facility 2 000.0m, unused-facility charge 0.25% a year on the part you do not draw.",
    arrangePct: 0, minDraw: 0, facility: 2000e6, unusedPctYear: 0.25 }
];

/* One quote, priced. Every fee the provider mentioned ends up in `cost` — that is the point. */
function price(q, amount, days) {
  var base     = Math.max(amount, q.minDraw);
  var headline = q.unit === "monthly" ? base * (q.rate / 100) * (days / 30)
                                      : base * (q.rate / 100);
  var arrange  = amount * (q.arrangePct / 100);
  var unused   = q.facility > amount
               ? (q.facility - amount) * (q.unusedPctYear / 100) * (days / 365) : 0;

  var cost     = Math.round(headline + arrange + unused);
  var received = amount - cost;

  return {
    id: q.id, quote: q, base: base,
    headlineCost: Math.round(headline),
    arrangeCost: Math.round(arrange),
    unusedCost: Math.round(unused),
    cost: cost,
    received: received,
    /* cost of the money that actually landed, annualised over the days it is actually held */
    annual: received > 0 && days > 0 ? cost / received * 365 / days * 100 : 0
  };
}

function compare(amount, days) {
  var rows = QUOTES.map(function (q) { return price(q, amount, days); });

  var byHeadline = QUOTES.slice()
        .sort(function (a, b) { return a.headlineNo - b.headlineNo; })
        .map(function (q) { return q.id; });

  var sorted = rows.slice().sort(function (a, b) { return a.cost - b.cost; });
  var byTrueCost = sorted.map(function (r) { return r.id; });

  rows.forEach(function (r) {
    r.headlineRank = byHeadline.indexOf(r.id) + 1;
    r.trueRank = byTrueCost.indexOf(r.id) + 1;
  });

  return {
    amount: amount, days: days, rows: rows,
    byHeadline: byHeadline, byTrueCost: byTrueCost,
    best: sorted[0], worst: sorted[sorted.length - 1],
    /* the same figure MarketplaceCompareResponse calls savingsVsWorst */
    spread: sorted[sorted.length - 1].cost - sorted[0].cost,
    reversed: byTrueCost.join("") === byHeadline.slice().reverse().join("")
  };
}

/* "2/10 net 30" — give up `discountPct` of the invoice to be paid (netDays − discountDays)
   days sooner. Returned as an annual rate on the money the payer actually parts with. */
function earlyPayYield(discountPct, discountDays, netDays) {
  var daysEarly = netDays - discountDays;
  if (daysEarly <= 0 || discountPct <= 0 || discountPct >= 100) return 0;
  return discountPct / (100 - discountPct) * 365 / daysEarly * 100;
}

root.OFFERS = { AMOUNT: AMOUNT, QUOTES: QUOTES, price: price, compare: compare,
                earlyPayYield: earlyPayYield };
if (typeof module !== "undefined" && module.exports) module.exports = root.OFFERS;
})(typeof window !== "undefined" ? window : globalThis);
