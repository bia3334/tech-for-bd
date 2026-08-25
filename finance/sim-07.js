/* The three supply-chain finance products behind lesson 07. No DOM in here, so
   tools/test-07.mjs can run it in node.

   One SME, ninety days. It delivered 500m of goods to a large buyer on net 60 terms, it
   owes its own supplier 260m on day 20, and payroll goes out on days 30, 60 and 90. The
   unfinanced line is lesson 01's problem: profitable on paper, empty from day 20 to day 60.

   Three products, one sentence — somebody is owed money later and needs it now:
     DISCOUNT  · invoice discounting — the seller brings its own receivable. Priced off the SELLER.
     REVERSE   · reverse factoring   — the buyer confirms the invoice. Priced off the BUYER.
     INVENTORY · inventory financing — nothing is owed yet, the stock is pledged. Priced off the GOODS.

   Fee is the formula the service actually uses — simple interest, 365-day year
   (sme-finance-scm · FinancingFormula, SCF-02 / SCF-08):
       fee = amount × rate / 100 × days ÷ 365

   The fee is taken off the top of what is disbursed (net_proceeds = requested − fee), so
   what is repaid later is the principal. Nothing here is random and nothing reads a clock. */
(function (root) {
"use strict";

/** FinancingFormula.fee — đồng, rounded once. */
function fee(amount, ratePercent, days) {
  return Math.round(amount * (ratePercent / 100) * days / 365);
}

var BASE = {
  days: 90,
  cash0: 60e6,
  invoice: 500e6,          /* one delivered invoice, net 60 */
  dueDay: 60,
  disburseDay: 5,          /* request → quote → director approves → money moves */
  supplierBill: 260e6,
  supplierDay: 20,
  payroll: 90e6,
  payrollDays: [30, 60, 90],

  stock: 400e6,            /* value of goods sitting in the warehouse */
  sellerRate: 18,          /* %/year this SME is quoted on its own name */
  buyerRate: 8.5,          /* %/year the large buyer is quoted on its name */
  goodsPremium: 2,         /* %/year on top: the lender is pricing goods it may have to sell */

  discountAdvance: 80,     /* % of the invoice — financing_programs.advance_rate */
  reverseAdvance: 100,     /* the buyer has confirmed it, so there is nothing to hold back */
  inventoryAdvance: 60,    /* % of pledged value — SCF-13 */
  inventoryTenor: 60,      /* the loan has a term of its own; the invoice does not lend it one */

  enrolled: false,         /* the buyer runs a programme and has enrolled this supplier */
  product: "NONE"
};

function refuse(key, name, vi, code, why) {
  return { key: key, name: name, vi: vi, ok: false, code: code, why: why,
           keepsInvoice: true, fee: 0, net: 0, advance: 0, rate: 0, tenor: 0, cash: [],
           startedBy: "—", pricedOff: "—", backedBy: "—", repaidBy: "—", direction: "—" };
}

function plan(o) {
  /* Days the money is advanced for: from the day it lands to the day the invoice falls due. */
  var tenor = o.dueDay - o.disburseDay;

  if (o.product === "DISCOUNT") {
    var adv = Math.round(o.invoice * o.discountAdvance / 100);
    var f = fee(adv, o.sellerRate, tenor);
    return {
      key: "DISCOUNT", name: "Invoice discounting", vi: "Chiết khấu hoá đơn", ok: true,
      program: "INVOICE_DISCOUNTING", direction: "RECEIVABLE",
      startedBy: "You. You bring your own invoice and sell it.",
      pricedOff: "Your own credit standing — " + o.sellerRate + "%/year",
      backedBy: "The receivable, handed to the financier",
      repaidBy: "The buyer, paying the financier on the original due date",
      rate: o.sellerRate, advanceRate: o.discountAdvance, tenor: tenor,
      advance: adv, fee: f, net: adv - f, reserve: o.invoice - adv,
      keepsInvoice: false,
      cash: [
        { d: o.disburseDay, fin: true,
          label: "Financier advances " + o.discountAdvance + "% of the invoice, fee off the top",
          amount: adv - f },
        { d: o.dueDay, fin: true,
          label: "Buyer pays the financier; the reserve is released to you",
          amount: o.invoice - adv }
      ]
    };
  }

  if (o.product === "REVERSE") {
    if (!o.enrolled) {
      return refuse("REVERSE", "Reverse factoring", "Tài trợ ngược dòng", "NO_PROGRAM",
        "You cannot start this one. Reverse factoring is the buyer's programme: the buyer signs it "
        + "with its bank, enrols you in it, and confirms this particular invoice. Until it does, "
        + "there is no programme to draw on and nobody has promised the bank anything.");
    }
    var radv = Math.round(o.invoice * o.reverseAdvance / 100);
    var rf = fee(radv, o.buyerRate, tenor);
    return {
      key: "REVERSE", name: "Reverse factoring", vi: "Tài trợ ngược dòng", ok: true,
      program: "REVERSE_FACTORING", direction: "PAYABLE",
      startedBy: "The buyer. It confirms the invoice and you choose to take the money early.",
      pricedOff: "The buyer's credit standing — " + o.buyerRate + "%/year",
      backedBy: "The buyer's confirmed promise to pay",
      repaidBy: "The buyer. It is the financier's customer, not you.",
      rate: o.buyerRate, advanceRate: o.reverseAdvance, tenor: tenor,
      advance: radv, fee: rf, net: radv - rf, reserve: o.invoice - radv,
      keepsInvoice: false,
      cash: [
        { d: o.disburseDay, fin: true,
          label: "Buyer confirmed it — the bank pays you in full, less the fee",
          amount: radv - rf }
      ]
    };
  }

  if (o.product === "INVENTORY") {
    if (o.stock <= 0) {
      return refuse("INVENTORY", "Inventory financing", "Tài trợ hàng tồn kho", "NO_COLLATERAL",
        "There is nothing to pledge. This is not a loan against your business, it is a loan "
        + "against specific goods in a specific warehouse, valued on a specific day. An empty "
        + "warehouse is not a thin file — it is no file at all.");
    }
    var iadv = Math.round(o.stock * o.inventoryAdvance / 100);
    var irate = o.sellerRate + o.goodsPremium;
    var ifee = fee(iadv, irate, o.inventoryTenor);
    return {
      key: "INVENTORY", name: "Inventory financing", vi: "Tài trợ hàng tồn kho", ok: true,
      program: "INVENTORY_FINANCING", direction: "no invoice involved",
      startedBy: "You. Nobody owes you anything yet — that is the point.",
      pricedOff: "What the goods would fetch in a hurry — " + irate + "%/year",
      backedBy: "The stock itself, pledged and revalued",
      repaidBy: "You, on the loan's own due date",
      rate: irate, advanceRate: o.inventoryAdvance, tenor: o.inventoryTenor,
      advance: iadv, fee: ifee, net: iadv - ifee, reserve: o.stock - iadv,
      keepsInvoice: true,
      cash: [
        { d: o.disburseDay, fin: true,
          label: "Financier advances " + o.inventoryAdvance + "% of the pledged value (SCF-13)",
          amount: iadv - ifee },
        { d: o.disburseDay + o.inventoryTenor, fin: true,
          label: "Repay the financier — the stock is released",
          amount: -iadv }
      ]
    };
  }

  return {
    key: "NONE", name: "Nothing — wait to be paid", vi: "Không dùng công cụ nào", ok: true,
    program: "—", direction: "RECEIVABLE",
    startedBy: "Nobody. You wait.",
    pricedOff: "Nothing — and it is not free: see how long the account is empty",
    backedBy: "—",
    repaidBy: "—",
    rate: 0, advanceRate: 0, tenor: 0, advance: 0, fee: 0, net: 0, reserve: 0,
    keepsInvoice: true, cash: []
  };
}

function events(o, p) {
  var ev = [{ d: o.supplierDay, label: "Pay your own supplier for the goods",
              amount: -o.supplierBill }];

  o.payrollDays.forEach(function (d) {
    ev.push({ d: d, label: "Payroll and fixed costs", amount: -o.payroll });
  });
  if (p.keepsInvoice) {
    ev.push({ d: o.dueDay, label: "The buyer pays you, on the day the invoice fell due",
              amount: o.invoice });
  }
  p.cash.forEach(function (c) { ev.push(c); });

  /* inflow before outflow on the same day, so the running balance in the log reads the way
     a bank statement does */
  return ev.filter(function (e) { return e.d >= 0 && e.d <= o.days; })
           .sort(function (a, b) { return a.d - b.d || b.amount - a.amount; });
}

function walk(o, ev) {
  var series = [], cash = o.cash0, i = 0, minCash = cash, negDays = 0;

  for (var d = 0; d <= o.days; d++) {
    while (i < ev.length && ev[i].d === d) cash += ev[i++].amount;
    series.push(cash);
    if (cash < minCash) minCash = cash;
    if (cash < 0) negDays++;
  }
  return { series: series, minCash: minCash, negDays: negDays, end: cash };
}

function simulate(options) {
  var o = Object.assign({}, BASE, options || {});
  var p = plan(o);
  var ev = events(o, p);
  var line = walk(o, ev);
  var base = walk(o, events(o, plan(Object.assign({}, o, { product: "NONE" }))));

  return {
    plan: p,
    events: ev,
    series: line.series,
    minCash: line.minCash,
    negDays: line.negDays,
    end: line.end,
    /* what the money cost, and what it bought */
    cost: p.fee,
    cashByDisbursement: p.ok ? p.net : 0,
    base: { series: base.series, minCash: base.minCash, negDays: base.negDays, end: base.end },
    rescued: line.minCash - base.minCash,
    daysSaved: base.negDays - line.negDays
  };
}

root.SCF = { simulate: simulate, plan: plan, fee: fee, BASE: BASE };
if (typeof module !== "undefined" && module.exports) module.exports = root.SCF;
})(typeof window !== "undefined" ? window : globalThis);
