/* The late-payment interest arithmetic behind lesson 06. No DOM in here, so
   tools/test-06.mjs can run it in node.

   One overdue commercial debt, three money rows that must stay tagged apart:
     nợ gốc      — goods delivered and unpaid. The ONLY row interest may touch.
     phạt vi phạm — agreed penalty for the breach. Điều 301 Luật Thương mại 2005 caps it
                   at 8% of the value of the breached obligation.
     bồi thường  — proven loss.
   Án lệ số 09/2016/AL: no interest on the last two. The first-instance court in the
   Thép Việt Ý case added all three together and charged interest on the block, and that
   is precisely the calculation the giám đốc thẩm decision threw out.

   Daily accrual is the formula the nightly job uses
   (sme-finance-scm · docs/design/06-state-machines.md §7.1, CM-19):
       interest = base × (rate / 100) / 365 × days overdue                              */
(function (root) {
"use strict";

/* Published overdue lending rates, %/year. Án lệ 09 wants at least three banks in the
   locality, read at the time of payment. Frozen here so the lesson is reproducible —
   in the real system this is a number a human types in, with a date and a source. */
var BANKS = [
  { name: "Vietcombank", rate: 13.5 },
  { name: "Agribank", rate: 12.9 },
  { name: "VietinBank", rate: 14.1 }
];

var CIVIL_CEILING = 20;  /* %/year — Điều 468 Bộ luật Dân sự 2015, hợp đồng vay tài sản only */
var PENALTY_CAP = 8;     /* % of the breached obligation — Điều 301 Luật Thương mại 2005 */

function averageRate(banks) {
  var b = banks || BANKS, sum = 0;
  for (var i = 0; i < b.length; i++) sum += b[i].rate;
  return Math.round(sum / b.length * 1e4) / 1e4;
}

function interest(base, rate, days) {
  return Math.round(base * (rate / 100) / 365 * days);
}

function compute(o) {
  var banks = o.banks || BANKS;
  var noAgreement = (o.rate === null || o.rate === undefined || o.rate === "");
  var rate = noAgreement ? averageRate(banks) : o.rate;
  var applied = o.civilCeiling ? Math.min(rate, CIVIL_CEILING) : rate;

  var penalty = Math.round(o.principal * o.penaltyPct / 100);
  var sanctions = penalty + o.damages;

  /* what the precedent says is owed, and what the code as switched actually charges */
  var lawful = interest(o.principal, rate, o.days);
  var onPrincipal = interest(o.principal, applied, o.days);
  var overcharge = o.onPenalty ? interest(sanctions, applied, o.days) : 0;
  var charged = onPrincipal + overcharge;

  return {
    rate: rate,
    appliedRate: applied,
    rateSource: noAgreement ? "average of " + banks.length + " banks" : "agreed in the contract",
    banks: banks,
    ceilingBites: o.civilCeiling && applied < rate,

    principal: o.principal,
    penalty: penalty,
    damages: o.damages,
    penaltyCapAmount: Math.round(o.principal * PENALTY_CAP / 100),
    penaltyOverCap: o.penaltyPct > PENALTY_CAP,
    chargedBase: o.principal + (o.onPenalty ? sanctions : 0),

    lawful: lawful,          /* Điều 306 + Án lệ 09/2016/AL */
    charged: charged,        /* what this configuration of the code produces */
    gap: charged - lawful,
    ceilingCost: lawful - onPrincipal,   /* taken from the seller */
    overcharge: overcharge,              /* charged to the buyer, unenforceable */

    rows: [
      { tag: "PRINCIPAL", label: "Nợ gốc — goods delivered, never paid for",
        amount: o.principal, charged: true },
      { tag: "PENALTY", label: "Phạt vi phạm — agreed penalty, " + o.penaltyPct + "% of the breached obligation",
        amount: penalty, charged: !!o.onPenalty },
      { tag: "COMPENSATION", label: "Bồi thường thiệt hại — loss the seller proved",
        amount: o.damages, charged: !!o.onPenalty }
    ]
  };
}

var BASE = { principal: 2400e6, penaltyPct: 8, damages: 310e6, days: 180,
             rate: 24, civilCeiling: false, onPenalty: false, banks: BANKS };

root.LATE = { compute: compute, interest: interest, averageRate: averageRate,
              BANKS: BANKS, BASE: BASE, CIVIL_CEILING: CIVIL_CEILING, PENALTY_CAP: PENALTY_CAP };
if (typeof module !== "undefined" && module.exports) module.exports = root.LATE;
})(typeof window !== "undefined" ? window : globalThis);
