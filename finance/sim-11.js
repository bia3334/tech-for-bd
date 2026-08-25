/* The 90-day cash forecast behind lesson 11. No DOM in here, so tools/test-11.mjs
   can run it in node.

   A forecast is not a prediction. It is an inventory of obligations that already exist,
   laid out on a calendar. Every row in BOOK is knowable on day 0: an invoice with a due
   date, a payroll that runs the same day every month, a rent, a loan instalment, a line
   in an approved budget, a tax payment already declared. Only DRIFT is statistical — it
   is the averaged daily trickle of small operating receipts and costs, the one source in
   CF-10 that is extrapolated rather than looked up.

   Alerts follow CF-11 the way ShortfallDetector implements it: the horizon is cut into
   periods, each period's projected CLOSING balance is compared with the configured
   threshold, and at most one alert is raised per period. Severity comes from the sign —
   a negative closing is CRITICAL, still positive but under the threshold is WARNING.  */
(function (root) {
"use strict";

var DAYS = 90;
var OPENING = 420e6;
var PERIOD = 7;            /* Granularity.WEEK — one projected_closing per week */
var DRIFT = -1.2e6;        /* history: net daily average of the small stuff, per day */

/* Everything already on the calendar on day 0. src names which of CF-10's sources the
   row came from — the code splits invoice due dates and payment_schedules into two
   EntrySource values because they are repaired in two different places. */
var BOOK = [
  { d:  2, a:  -30e6, src: "recurring", label: "Rent — the warehouse on Nguyễn Trãi" },
  { d:  5, a: -120e6, src: "recurring", label: "Payroll + BHXH" },
  { d: 12, a:  -95e6, src: "schedule",  label: "Trường An — net 30 on PO-8841" },
  { d: 18, a: +140e6, src: "invoice",   label: "INV-2201 Nam Phát falls due" },
  { d: 20, a:  -48e6, src: "scheduled", label: "VAT for the quarter — declared and approved" },
  { d: 27, a: -210e6, src: "schedule",  label: "Trường An — net 45 on PO-8860" },
  { d: 30, a: +230e6, src: "scheduled", label: "Discounting advance on INV-2230, 88% of face" },
  { d: 32, a:  -30e6, src: "recurring", label: "Rent" },
  { d: 34, a: +420e6, src: "invoice",   label: "INV-2188 Đại Thành falls due — largest customer" },
  { d: 35, a: -120e6, src: "recurring", label: "Payroll + BHXH" },
  { d: 45, a:  -60e6, src: "budget",    label: "Trade fair — approved line in the Q3 budget" },
  { d: 50, a:  -90e6, src: "scheduled", label: "Term loan instalment — the bank's own schedule" },
  { d: 57, a: +120e6, src: "invoice",   label: "INV-2214 Nam Phát falls due" },
  { d: 62, a: -150e6, src: "schedule",  label: "Minh Long — net 60 on PO-8902" },
  { d: 62, a:  -30e6, src: "recurring", label: "Rent" },
  { d: 65, a: -120e6, src: "recurring", label: "Payroll + BHXH" }
];

/* One assumption changed, the same obligations. That is all a scenario ever is. */
var SCENARIOS = [
  { id: "base", name: "Baseline",
    note: "Every obligation on the day it is contracted to fall. Nothing optimistic, nothing dramatic.",
    apply: function (rows) { return rows; } },

  { id: "late", name: "Largest customer pays 30 days late",
    note: "INV-2188 slips from day 34 to day 64. Nothing else moves — same order, same price, same profit. " +
          "This is forecast_scenarios.assumptions.paymentDelayDays, applied to one invoice.",
    apply: function (rows) {
      return rows.map(function (r) {
        return r.label.indexOf("INV-2188") === 0 ? shift(r, 30) : r;
      });
    } },

  { id: "declined", name: "The financing offer is declined",
    note: "The 230m advance on INV-2230 never arrives; the invoice is collected from the buyer on day 105 instead, " +
          "outside this horizon. One inflow removed, nothing else touched.",
    apply: function (rows) {
      return rows.filter(function (r) { return r.label.indexOf("Discounting advance") !== 0; });
    } },

  { id: "order", name: "A big order lands",
    note: "A 520m order is won on day 35. The stock for it is paid for on day 40; the customer pays on day 105, " +
          "fifteen days past the end of the horizon. The order is profitable and the forecast cannot see the good half.",
    apply: function (rows) {
      return rows.concat([{ d: 40, a: -380e6, src: "schedule",
        label: "Stock for the new order — supplier paid before the customer pays us" }]);
    } }
];

function shift(row, days) {
  return { d: row.d + days, a: row.a, src: row.src, label: row.label };
}

function scenarioOf(id) {
  for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].id === id) return SCENARIOS[i];
  return SCENARIOS[0];
}

/* o = { scenario:"base"|"late"|"declined"|"order", threshold:<đồng> } */
function forecast(o) {
  var sc = scenarioOf(o && o.scenario);
  var threshold = (o && typeof o.threshold === "number") ? o.threshold : 0;

  var rows = sc.apply(BOOK.slice()).slice()
    .sort(function (a, b) { return a.d - b.d || a.label.localeCompare(b.label); });

  /* the daily projected balance: opening, plus every obligation on its own day,
     plus the averaged trickle. No trend line anywhere. */
  var series = [], bal = OPENING, i = 0;
  for (var d = 0; d <= DAYS; d++) {
    while (i < rows.length && rows[i].d === d) bal += rows[i++].a;
    if (d > 0) bal += DRIFT;
    series.push(bal);
  }

  /* one projected_closing per period — CF-10 writes one cash_flow_forecasts row each */
  var periods = [], e;
  for (e = PERIOD; e <= DAYS; e += PERIOD) periods.push({ end: e, closing: series[e] });
  if (periods.length === 0 || periods[periods.length - 1].end !== DAYS) {
    periods.push({ end: DAYS, closing: series[DAYS] });
  }

  /* CF-11: at most one alert per period, and never one for a period nobody asked about */
  var alerts = periods.filter(function (p) { return p.closing < threshold; })
    .map(function (p) {
      return { d: p.end, closing: p.closing, threshold: threshold,
               severity: p.closing < 0 ? "CRITICAL" : "WARNING" };
    });

  /* a real shortfall: a run of days the account cannot cover what has fallen due */
  var episodes = [], run = null;
  for (d = 0; d <= DAYS; d++) {
    if (series[d] < 0) {
      if (!run) { run = { start: d, end: d, worst: series[d] }; episodes.push(run); }
      else { run.end = d; if (series[d] < run.worst) run.worst = series[d]; }
    } else { run = null; }
  }

  /* caught = an alert fired for a period ending STRICTLY BEFORE the first day in the red.
     An alert dated inside the hole is a report, not a warning. */
  episodes.forEach(function (ep) {
    var early = null;
    for (var k = 0; k < alerts.length; k++) {
      if (alerts[k].d < ep.start) { early = alerts[k]; break; }
    }
    ep.warnedOn = early ? early.d : null;
    ep.notice = early ? ep.start - early.d : 0;
  });

  var caught = episodes.filter(function (ep) { return ep.warnedOn !== null; }).length;
  var negDays = series.filter(function (v) { return v < 0; }).length;

  return {
    scenario: sc.id, name: sc.name, note: sc.note,
    threshold: threshold,
    rows: rows,
    series: series,
    periods: periods,
    alerts: alerts,
    episodes: episodes,
    caught: caught,
    notice: episodes.length ? episodes[0].notice : 0,
    minCash: Math.min.apply(null, series),
    negDays: negDays
  };
}

/* The band worth defending: every shortfall caught in advance, and few enough alerts
   that a human still reads them. noiseLimit is a product decision, not a constant of
   nature — it is "how many alerts will somebody open in a quarter". */
function band(scenario, noiseLimit, step) {
  var lo = null, hi = null, t;
  for (t = 0; t <= 400e6; t += (step || 5e6)) {
    var r = forecast({ scenario: scenario, threshold: t });
    var ok = r.caught === r.episodes.length && r.alerts.length <= (noiseLimit || 5);
    if (ok) { if (lo === null) lo = t; hi = t; }
  }
  return { lo: lo, hi: hi };
}

root.FORECAST = {
  forecast: forecast, band: band,
  BOOK: BOOK, SCENARIOS: SCENARIOS,
  DAYS: DAYS, OPENING: OPENING, PERIOD: PERIOD, DRIFT: DRIFT
};
if (typeof module !== "undefined" && module.exports) module.exports = root.FORECAST;
})(typeof window !== "undefined" ? window : globalThis);
