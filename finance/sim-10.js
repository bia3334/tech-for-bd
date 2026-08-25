/* The five states of the same đồng, behind lesson 10. No DOM in here, so
   tools/test-10.mjs can run it in node.

   One department, one quarter, one budget line planned at 400 million. Five
   purchase requests move through three transitions and nothing else:

     DRAFT --approve--> COMMITTED --pay--> CONSUMED
                            \--cancel--> RELEASED

   Those are the three values of CommitmentStatus in budget-service, and the
   money each one moves is the whole lesson:
     approve  committed += amount            (the bank account does not move)
     pay      committed -= ; actual += amount
     cancel   committed -= amount            (the row is kept, never deleted)

   Two headroom numbers fall out of the same four figures, and they are not the
   same number:
     remaining = planned - actual                     <- no column holds this
     available = planned - committed - actual         <- budget_lines.available_amount

   check() runs the approval test both ways on purpose. Mode "available" is what
   BudgetCheckService really does; mode "remaining" is the version a developer
   writes when nobody has explained commitments.                                */
(function (root) {
"use strict";

var PLANNED = 400e6;

/* budget_thresholds for this budget, sorted by level DESCENDING. The order is
   load-bearing: the highest level crossed decides, not the first one met —
   BudgetCheckService.decide walks exactly this list and stops at the first hit. */
var THRESHOLDS = [
  { level: 100, action: "REQUIRE_APPROVAL" },
  { level: 90,  action: "NOTIFY" },
  { level: 80,  action: "NOTIFY" }
];

var REQUESTS = [
  { id: "PR-01", what: "Google Ads, the whole quarter",   amount: 120e6 },
  { id: "PR-02", what: "Trade fair booth in March",       amount: 150e6 },
  { id: "PR-03", what: "Print run and packaging",         amount: 90e6 },
  { id: "PR-04", what: "Agency retainer, three months",   amount: 60e6 },
  { id: "PR-05", what: "One more banner campaign",        amount: 40e6 }
];

/* The scripted run that walks the department into the trap: four approvals, one
   payment. It leaves remaining looking healthy and available already negative. */
var TRAP = [
  { id: "PR-01", to: "COMMITTED" },
  { id: "PR-02", to: "COMMITTED" },
  { id: "PR-03", to: "COMMITTED" },
  { id: "PR-01", to: "CONSUMED" },
  { id: "PR-04", to: "COMMITTED" }
];

function fresh() {
  return REQUESTS.map(function (r) {
    return { id: r.id, what: r.what, amount: r.amount, state: "DRAFT", via: null };
  });
}

function sum(reqs, state) {
  var t = 0;
  for (var i = 0; i < reqs.length; i++) if (reqs[i].state === state) t += reqs[i].amount;
  return t;
}

function find(reqs, id) {
  for (var i = 0; i < reqs.length; i++) if (reqs[i].id === id) return reqs[i];
  return null;
}

/* NUMERIC(5,2): two decimals, capped at 999.99, and a plan of zero that has been
   spent against reads as 100% rather than dividing by zero. Mirrors Percents.of. */
function pct(used, planned) {
  if (!planned) return used > 0 ? 100 : 0;
  return Math.min(999.99, Math.round(used / planned * 10000) / 100);
}

function tally(reqs) {
  var committed = sum(reqs, "COMMITTED");
  var actual = sum(reqs, "CONSUMED");
  return {
    planned: PLANNED,
    committed: committed,
    actual: actual,
    /* the number a developer invents. Nothing in the schema holds it. */
    remaining: PLANNED - actual,
    /* budget_lines.available_amount — GENERATED ALWAYS AS planned - committed - actual */
    available: PLANNED - committed - actual,
    used: committed + actual,
    /* BudgetUtilizationRow.varianceAmount — the same arithmetic as available */
    variance: PLANNED - (committed + actual),
    usagePercent: pct(committed + actual, PLANNED)
  };
}

/* Only the three transitions above exist. Anything else is refused rather than
   silently ignored, so a wrong button can never move money. */
var LEGAL = { DRAFT: ["COMMITTED"], COMMITTED: ["CONSUMED", "RELEASED"], CONSUMED: [], RELEASED: [] };

function can(reqs, id, to) {
  var r = find(reqs, id);
  return !!r && LEGAL[r.state].indexOf(to) >= 0;
}

/* Pure: returns a new list, never mutates the one handed in. */
function step(reqs, id, to, via) {
  if (!can(reqs, id, to)) return reqs;
  return reqs.map(function (r) {
    if (r.id !== id) return r;
    return { id: r.id, what: r.what, amount: r.amount, state: to,
             via: to === "COMMITTED" ? (via || "ALLOW") : r.via };
  });
}

/**
 * The budget check that runs BEFORE a request is approved (TM-17).
 *
 * mode "available" — what BudgetCheckService does: usage counts money already
 *   committed as well as money already paid, plus the amount being asked for.
 * mode "remaining" — the bug: commitments are invisible, so usage counts only
 *   what has actually left the bank.
 *
 * The verdict is the highest threshold crossed. It is never a refusal on its
 * own: REQUIRE_APPROVAL still lets the spend through, with one more signature.
 */
function check(t, amount, mode) {
  var already = mode === "remaining" ? t.actual : t.committed + t.actual;
  var headroom = mode === "remaining" ? t.remaining : t.available;
  var usage = pct(already + amount, t.planned);

  var action = "ALLOW", level = null;
  for (var i = 0; i < THRESHOLDS.length; i++) {
    if (usage >= THRESHOLDS[i].level) { action = THRESHOLDS[i].action; level = THRESHOLDS[i].level; break; }
  }

  return {
    mode: mode,
    amount: amount,
    action: action,
    level: level,
    usagePercent: usage,
    headroom: headroom,
    shortBy: Math.max(0, amount - headroom),
    /* allowed is false for BLOCK alone — the contract of BudgetCheckResult */
    allowed: action !== "BLOCK"
  };
}

/** Approve one request: run the real check first, then record which verdict let it through. */
function approve(reqs, id) {
  var v = check(tally(reqs), (find(reqs, id) || { amount: 0 }).amount, "available");
  return { reqs: v.allowed ? step(reqs, id, "COMMITTED", v.action) : reqs, check: v };
}

/** The next request still waiting for a decision, or null when there are none. */
function nextDraft(reqs) {
  for (var i = 0; i < reqs.length; i++) if (reqs[i].state === "DRAFT") return reqs[i];
  return null;
}

/** Walk the scripted sequence from a fresh set of requests. */
function trap() {
  var reqs = fresh();
  for (var i = 0; i < TRAP.length; i++) {
    reqs = TRAP[i].to === "COMMITTED" ? approve(reqs, TRAP[i].id).reqs
                                      : step(reqs, TRAP[i].id, TRAP[i].to);
  }
  return reqs;
}

root.BUD = {
  PLANNED: PLANNED, THRESHOLDS: THRESHOLDS, REQUESTS: REQUESTS, TRAP: TRAP,
  fresh: fresh, tally: tally, pct: pct, can: can, step: step,
  check: check, approve: approve, nextDraft: nextDraft, trap: trap, find: find
};
if (typeof module !== "undefined" && module.exports) module.exports = root.BUD;
})(typeof window !== "undefined" ? window : globalThis);
