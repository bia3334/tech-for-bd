/* The three financial statements behind lesson 14. No DOM in here, so tools/test-14.mjs
   can run it in node.

   One small trading company. Fire a business event and three sheets react differently:
     sheet 1  Báo cáo tình hình tài chính  — a photograph of what is owned and owed
     sheet 2  Báo cáo kết quả kinh doanh   — what was earned across the period
     sheet 3  Báo cáo lưu chuyển tiền tệ   — where the cash went: operating / investing / financing

   Two invariants hold after every event, and the widget leans on both:
     assets = payables + borrowings + equity              (the sheet actually balances)
     profit − cash from operations = change in working capital
   The second one is the tie-back to lesson 01: that difference IS the cash conversion
   cycle, showing up in a legally filed document. No depreciation here, which is why the
   identity is exact in the model and only "near enough" on a real PDF.                    */
(function (root) {
"use strict";

var OPENING = { cash: 400e6, ar: 300e6, inv: 250e6, fa: 200e6, ap: 200e6, debt: 0, equity0: 950e6 };

/* Each event is a set of deltas. Absent keys are zero.
   ar/inv/ap move working capital · revenue/cogs/opex move sheet 2 · cfo/cfi/cff move sheet 3. */
var EVENTS = [
  { id: "sell", label: "Sell 200m of goods, 45-day terms",
    sub: "Delivered and invoiced today. The customer pays in a month and a half.",
    d: { ar: 200e6, inv: -140e6, revenue: 200e6, cogs: 140e6 } },

  { id: "collect", label: "An old customer pays 120m",
    sub: "Money for goods delivered months ago, and already booked as revenue back then.",
    d: { cash: 120e6, ar: -120e6, cfo: 120e6 } },

  { id: "buystock", label: "Buy 100m of stock, paying cash",
    sub: "Money leaves. Nothing has been sold, so nothing is a cost yet.",
    d: { cash: -100e6, inv: 100e6, cfo: -100e6 } },

  { id: "paysupplier", label: "Pay a supplier 80m",
    sub: "Settling a delivery taken on credit earlier. The debt goes, the cash goes with it.",
    d: { cash: -80e6, ap: -80e6, cfo: -80e6 } },

  { id: "salaries", label: "Pay salaries, 50m",
    sub: "The one ordinary event that moves all three sheets at once.",
    d: { cash: -50e6, opex: 50e6, cfo: -50e6 } },

  { id: "advance", label: "Take a 150m financing advance",
    sub: "Cash in the account today, and a debt that was not there yesterday.",
    d: { cash: 150e6, debt: 150e6, cff: 150e6 } },

  { id: "van", label: "Buy a delivery van, 300m cash",
    sub: "Money spent on something the company will keep and use for years.",
    d: { cash: -300e6, fa: 300e6, cfi: -300e6 } }
];

var KEYS = ["cash", "ar", "inv", "fa", "ap", "debt", "revenue", "cogs", "opex", "cfo", "cfi", "cff"];

function byId(id) {
  for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return EVENTS[i];
  return null;
}

function start() {
  var s = {};
  KEYS.forEach(function (k) { s[k] = OPENING[k] || 0; });
  return s;
}

function apply(s, ev) {
  var out = {};
  KEYS.forEach(function (k) { out[k] = s[k] + (ev.d[k] || 0); });
  return out;
}

/* Replay a list of event ids from the opening position. Unknown ids are ignored rather
   than thrown — the widget only ever passes its own, and a bad id must not blank the page. */
function run(ids) {
  var s = start();
  (ids || []).forEach(function (id) {
    var ev = byId(id);
    if (ev) s = apply(s, ev);
  });
  return s;
}

/* The three sheets as a reader would see them, plus the two numbers the lesson is about. */
function view(s) {
  var profit = s.revenue - s.cogs - s.opex;
  var equity = OPENING.equity0 + profit;
  var assets = s.cash + s.ar + s.inv + s.fa;
  var claims = s.ap + s.debt + equity;
  var net = s.cfo + s.cfi + s.cff;
  var wc0 = OPENING.ar + OPENING.inv - OPENING.ap;
  return {
    bs: { cash: s.cash, ar: s.ar, inv: s.inv, fa: s.fa, assets: assets,
          ap: s.ap, debt: s.debt, equity: equity, claims: claims },
    is: { revenue: s.revenue, cogs: s.cogs, gross: s.revenue - s.cogs, opex: s.opex, profit: profit },
    cf: { op: s.cfo, inv: s.cfi, fin: s.cff, net: net, closing: OPENING.cash + net },
    profit: profit,
    cfo: s.cfo,
    /* profit minus operating cash — the working capital the company put into the cycle */
    gap: profit - s.cfo,
    wc: (s.ar + s.inv - s.ap) - wc0,
    balanced: assets === claims,
    cashOk: s.cash === OPENING.cash + net
  };
}

/* Which of the three sheets this event touches at all — the point of the whole widget. */
function moves(ev) {
  var d = ev.d;
  var any = function (ks) { return ks.some(function (k) { return !!d[k]; }); };
  return {
    bs: any(["cash", "ar", "inv", "fa", "ap", "debt", "revenue", "cogs", "opex"]),
    is: any(["revenue", "cogs", "opex"]),
    cf: any(["cfo", "cfi", "cff"])
  };
}

root.FS = { OPENING: OPENING, EVENTS: EVENTS, byId: byId, run: run, view: view, moves: moves };
if (typeof module !== "undefined" && module.exports) module.exports = root.FS;
})(typeof window !== "undefined" ? window : globalThis);
