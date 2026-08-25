/* One partner's credit profile — the maths behind lesson 04. No DOM in here, so
   tools/test-04.mjs can run it in node.

   Everything below is copied from the real thing rather than invented:
   the five criteria, their weights and their bands are what
   credit-service/db/migration/V2__seed_scoring_rules.sql loads; the score is mixed
   the way CreditScoringEngine.recomputeScore mixes it (criteria with no measurement
   are dropped and the remaining weights normalised back to 100); the letter grade
   uses CreditScoringEngine.calculateGrade; and check() is
   CreditAvailabilityService.check — including the part everyone gets wrong, that
   being over the limit is not on its own enough to refuse anything.            */
(function (root) {
"use strict";

/* weight = % of the score · bands = [from, to (excluded), points 0..100], to=null is the top band */
var RULES = [
  { c: "PAYMENT_HISTORY", w: 35, unit: "% of settled invoices paid on or before the due date",
    bands: [[0, 60, 10], [60, 80, 40], [80, 90, 65], [90, 98, 85], [98, 101, 100]] },
  { c: "TRANSACTION_VALUE", w: 20, unit: "million đồng of business in the last 12 months",
    bands: [[0, 100, 20], [100, 500, 45], [500, 2000, 70], [2000, 10000, 90], [10000, null, 100]] },
  { c: "RELATIONSHIP_LENGTH", w: 15, unit: "months since cooperation_since",
    bands: [[0, 6, 20], [6, 12, 45], [12, 36, 70], [36, 60, 90], [60, null, 100]] },
  { c: "TRANSACTION_FREQUENCY", w: 15, unit: "deals in the last 12 months",
    bands: [[0, 4, 20], [4, 12, 50], [12, 36, 75], [36, null, 100]] },
  /* CONTRACT_COMPLIANCE carries weight 15 and is never measured: nothing in the system
     records whether a delivery arrived on spec. Its weight is shared out, not given away. */
  { c: "CONTRACT_COMPLIANCE", w: 15, unit: "% of contract terms honoured",
    bands: [[0, 70, 15], [70, 85, 45], [85, 95, 75], [95, 101, 100]] }
];

/* one row per risk level, the way a company configures risk_thresholds (CM-11, CM-12).
   min_score is what decides which level a score lands in; the other three are what
   that level then costs you. */
var THRESHOLDS = [
  { level: "LOW",      minScore: 70, maxExposure: 500e6, maxOverdueDays: 30, action: "NOTIFY" },
  { level: "MEDIUM",   minScore: 50, maxExposure: 300e6, maxOverdueDays: 15, action: "NOTIFY" },
  { level: "HIGH",     minScore: 20, maxExposure: 150e6, maxOverdueDays: 7,  action: "BLOCK"  },
  { level: "CRITICAL", minScore: 0,  maxExposure: 0,     maxOverdueDays: 0,  action: "BLOCK"  }
];

function band(bands, v) {
  for (var i = 0; i < bands.length; i++) {
    var lo = bands[i][0], hi = bands[i][1] === null ? Infinity : bands[i][1];
    if (v >= lo && v < hi) return bands[i][2];
  }
  return null;                       /* no band covers it — treated as not measured */
}

/* CreditScoringEngine.calculateGrade — fixed on purpose, no table holds these boundaries */
function grade(s) {
  return s >= 90 ? "AAA" : s >= 80 ? "AA" : s >= 70 ? "A" : s >= 60 ? "BBB"
       : s >= 50 ? "BB" : s >= 40 ? "B" : s >= 20 ? "C" : "D";
}

function thresholdFor(level) {
  for (var i = 0; i < THRESHOLDS.length; i++) if (THRESHOLDS[i].level === level) return THRESHOLDS[i];
  return null;
}

/* highest min_score the partner still reaches — CreditScoringEngine.riskLevelFor */
function riskFor(s) {
  var best = null;
  THRESHOLDS.forEach(function (t) {
    if (s >= t.minScore && (!best || t.minScore > best.minScore)) best = t;
  });
  return best ? best.level : null;
}

/* what the five criteria actually measure, from the invoices themselves.
   A key that is absent means NO DATA — which is not the same as a low value. */
function measure(st) {
  var m = {};
  var settled = st.items.filter(function (i) { return i.settled; });
  if (settled.length) {
    var onTime = settled.filter(function (i) { return i.late === 0; }).length;
    m.PAYMENT_HISTORY = onTime * 100 / settled.length;
  }
  /* value and frequency count every deal that arose in the window, settled or not */
  m.TRANSACTION_VALUE = st.items.reduce(function (a, i) { return a + i.amount; }, 0) / 1e6;
  m.TRANSACTION_FREQUENCY = st.items.length;
  if (st.relationshipMonths !== null) m.RELATIONSHIP_LENGTH = st.relationshipMonths;
  return m;
}

function score(st) {
  var m = measure(st), factors = {}, sum = 0, w = 0;
  RULES.forEach(function (r) {
    if (!(r.c in m)) return;
    var s = band(r.bands, m[r.c]);
    if (s === null) return;
    factors[r.c] = s;
    sum += s * r.w;
    w += r.w;
  });
  if (!w) return { score: null, grade: null, risk: null, factors: factors, scoredWeight: 0, measured: m };
  /* divided by the weight ACTUALLY SCORED, not by 100 */
  var sc = Math.max(0, Math.min(100, Math.round(sum / w)));
  return { score: sc, grade: grade(sc), risk: riskFor(sc), factors: factors, scoredWeight: w, measured: m };
}

/* everything a screen needs about the profile as it stands right now */
function view(st) {
  var open = st.items.filter(function (i) { return !i.settled; });
  var exposure = open.reduce(function (a, i) { return a + i.amount; }, 0);
  var s = score(st);
  var t = thresholdFor(s.risk);
  var overdue = open.reduce(function (a, i) { return Math.max(a, i.late); }, 0);
  return {
    limit: st.limit,
    exposure: exposure,
    available: st.limit - exposure,               /* the generated column: limit − used */
    utilisation: st.limit ? exposure / st.limit : 0,
    openCount: open.length,
    settledCount: st.items.length - open.length,
    score: s.score, grade: s.grade, risk: s.risk,
    factors: s.factors, scoredWeight: s.scoredWeight, measured: s.measured,
    threshold: t,
    overCeiling: !!t && exposure > t.maxExposure,
    overdueDays: overdue,
    overOverdue: !!t && overdue > t.maxOverdueDays
  };
}

/* the synchronous gate transaction-service calls before it will save an order (TM-18).
   Note what it does NOT do: refuse on the score, refuse on the grade, or refuse on the
   limit alone. Both must agree — over the limit AND a level configured to BLOCK. */
function check(st, amount) {
  var v = view(st);
  var exceeded = amount > v.available;
  var action = v.threshold ? v.threshold.action : null;
  return {
    allowed: !(exceeded && action === "BLOCK"),
    exceeded: exceeded,
    available: v.available,
    requested: amount,
    action: action,
    risk: v.risk,
    grade: v.grade
  };
}

function clone(st) {
  return { limit: st.limit, relationshipMonths: st.relationshipMonths, order: st.order, seq: st.seq,
           items: st.items.map(function (i) { return { n: i.n, amount: i.amount, settled: i.settled, late: i.late }; }) };
}

function oldestOpen(st) {
  for (var i = 0; i < st.items.length; i++) if (!st.items[i].settled) return st.items[i];
  return null;
}

/* an order is only written when the check allows it — check first, then write */
function addOrder(st, amount) {
  var c = clone(st);
  if (!check(st, amount).allowed) return c;
  c.seq++;
  c.items.push({ n: c.seq, amount: amount, settled: false, late: 0 });
  return c;
}

/* late = days after the due date the money arrived; 0 means on time */
function settleOldest(st, late) {
  var c = clone(st), it = oldestOpen(c);
  if (it) { it.settled = true; it.late = late; }
  return c;
}

/* still unpaid, just older. Moves days_overdue and moves NOTHING in the score. */
function ageOldest(st, days) {
  var c = clone(st), it = oldestOpen(c);
  if (it) it.late = days;
  return c;
}

/* Minh Phát, a customer of three years: two invoices paid on time, two still open */
var BASE = {
  limit: 500e6, relationshipMonths: 30, order: 120e6, seq: 4,
  items: [
    { n: 1, amount: 120e6, settled: true,  late: 0 },
    { n: 2, amount: 120e6, settled: true,  late: 0 },
    { n: 3, amount: 120e6, settled: false, late: 0 },
    { n: 4, amount: 120e6, settled: false, late: 0 }
  ]
};

root.CREDIT = { RULES: RULES, THRESHOLDS: THRESHOLDS, BASE: BASE,
                grade: grade, riskFor: riskFor, thresholdFor: thresholdFor,
                measure: measure, score: score, view: view, check: check,
                addOrder: addOrder, settleOldest: settleOldest, ageOldest: ageOldest, clone: clone };
if (typeof module !== "undefined" && module.exports) module.exports = root.CREDIT;
})(typeof window !== "undefined" ? window : globalThis);
