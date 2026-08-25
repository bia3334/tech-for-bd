/* The repeating cash cycle behind lesson 01. No DOM in here, so tools/test-ccc.mjs
   can run it in node.

   One cycle: buy stock on day t → sell on day t+DIO (invoice issued, NO cash yet)
              → customer pays on day t+DIO+DSO · you pay the supplier on day t+DPO.
   A new cycle opens every 30 days. Payroll and fixed costs go out at month end.   */
(function (root) {
"use strict";

function simulate(o) {
  var days = o.days || 90;
  var ev = [];
  function add(d, label, amount) {
    if (d >= 0 && d <= days) ev.push({ d: d, label: label, amount: amount });
  }

  var sold = 0, fees = 0;
  for (var start = 0; start < days; start += 30) {
    add(start + o.dpo, "Pay the supplier", -o.cogs);

    var saleDay = start + o.dio;
    if (saleDay > days) continue;          /* not sold yet inside the 90-day window */
    sold++;
    if (o.discount) {
      /* sell the receivable: cash on the day the invoice is issued, less a fee for the days advanced */
      var fee = Math.round(o.revenue * o.feeRate * o.dso / 30);
      fees += fee;
      add(saleDay, "Invoice discounted", o.revenue - fee);
    } else {
      add(saleDay + o.dso, "Customer pays", o.revenue);
    }
  }
  for (var m = 30; m <= days; m += 30) add(m, "Payroll + fixed costs", -o.opex);
  ev.sort(function (a, b) { return a.d - b.d; });

  var series = [], cash = o.cash0, i = 0, minCash = cash, negDays = 0;
  for (var d = 0; d <= days; d++) {
    while (i < ev.length && ev[i].d === d) cash += ev[i++].amount;
    series.push(cash);
    if (cash < minCash) minCash = cash;
    if (cash < 0) negDays++;
  }

  return {
    ccc: o.dio + o.dso - o.dpo,
    series: series,
    minCash: minCash,
    negDays: negDays,
    /* profit is booked on the day of the SALE, not the day of payment — that is the whole lesson */
    profit: sold * (o.revenue - o.cogs) - o.opex * Math.floor(days / 30) - fees,
    fees: fees,
    events: ev
  };
}

var BASE = { days: 90, cash0: 300e6, cogs: 300e6, revenue: 360e6, opex: 40e6,
             dio: 20, dso: 45, dpo: 30, feeRate: 0.012, discount: false };

root.CCC = { simulate: simulate, BASE: BASE };
if (typeof module !== "undefined" && module.exports) module.exports = root.CCC;
})(typeof window !== "undefined" ? window : globalThis);
