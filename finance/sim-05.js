/* Aging buckets and two-way offsetting behind lesson 05. No DOM in here, so
   tools/test-05.mjs can run it in node.

   One partner who is both customer and supplier. Every debt carries a due date;
   how far past that date it is decides which aging bucket it falls into. An
   offset minutes picks debts from both sides and cancels them against each other
   — lawful only when the two sides total exactly the same amount.

   Mirrors credit-service: CreditReportService.slotOf for the buckets,
   CreditOffsetService.create / cancel for the minutes.                        */
(function (root) {
"use strict";

var DAY = 864e5;
function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / DAY);
}

function remaining(it) { return it.amount - it.offset; }

/* Status is derived, never stored twice: nothing left to pay means settled,
   otherwise in term or overdue depending on the day you ask. That is also how
   cancelling a minutes decides what a debt comes back as. */
function statusOf(it, on) {
  if (it.writtenOff) return "WRITTEN_OFF";
  if (remaining(it) <= 0) return "SETTLED";
  return daysBetween(it.due, on) > 0 ? "OVERDUE" : "OUTSTANDING";
}

function daysOverdue(it, on) { return Math.max(0, daysBetween(it.due, on)); }

/* Which bucket a debt lands in — index 0 is "in term", the last is "over the
   final boundary". Due on the as-of day itself still counts as in term. */
function slot(it, on, bounds) {
  var over = daysBetween(it.due, on);
  if (over <= 0) return 0;
  for (var i = 0; i < bounds.length; i++) if (over <= bounds[i]) return i + 1;
  return bounds.length + 1;
}

/* Labels are built from the boundaries, never written out by hand — the number
   of columns is a company setting, so "1–30" is data, not a caption. */
function labels(bounds) {
  var out = ["In term"], from = 1;
  for (var i = 0; i < bounds.length; i++) { out.push(from + "–" + bounds[i]); from = bounds[i] + 1; }
  out.push("Over " + bounds[bounds.length - 1]);
  return out;
}

/* The aging report for one direction: open debts only, grouped by days past due. */
function aging(items, dir, on, bounds) {
  var buckets = labels(bounds).map(function () { return 0; });
  var total = 0, overdue = 0;
  items.forEach(function (it) {
    if (it.dir !== dir) return;
    var st = statusOf(it, on);
    if (st === "SETTLED" || st === "WRITTEN_OFF") return;   /* not live công nợ any more */
    var s = slot(it, on, bounds), r = remaining(it);
    buckets[s] += r; total += r;
    if (s > 0) overdue += r;
  });
  return { labels: labels(bounds), buckets: buckets, total: total,
           overdue: overdue, tail: buckets[buckets.length - 1] };
}

var OPEN = { OUTSTANDING: 1, OVERDUE: 1 };

/* The four rules that make an offset lawful rather than convenient — the same
   ones CreditOffsetService.create refuses with a 422. */
function check(items, picked, on) {
  var recv = 0, pay = 0, cur = null, why = null, lines = 0;
  items.forEach(function (it) {
    var a = picked[it.id] || 0;
    if (a <= 0) return;
    lines++;
    if (!OPEN[statusOf(it, on)]) why = why || "A settled or written-off debt has no obligation left to offset.";
    if (a > remaining(it)) why = why || "A line cannot be larger than what is left of that debt.";
    if (cur !== null && it.cur !== cur) why = why || "Every line has to be in the same currency.";
    if (cur === null) cur = it.cur;
    if (it.dir === "RECEIVABLE") recv += a; else pay += a;
  });

  if (!why) {
    if (lines === 0) why = "Drag an amount on each side to build the minutes.";
    else if (recv === 0 || pay === 0) why = "A minutes needs both directions — one side alone cancels nothing.";
    else if (recv !== pay) why = "The two sides differ. The minutes only holds when they are exactly equal.";
  }
  return { recv: recv, pay: pay, gap: recv - pay, lines: lines,
           ok: !why, why: why || "Both sides agree.", currency: cur };
}

/* Confirming applies every line to its debt; a debt with nothing left becomes
   SETTLED on the date of the minutes, exactly as if money had arrived. */
function confirmOffset(items, picked, on) {
  var v = check(items, picked, on);
  if (!v.ok) return { ok: false, why: v.why, items: items, lines: [], total: 0 };
  var lines = [];
  var next = items.map(function (it) {
    var a = picked[it.id] || 0;
    if (a <= 0) return it;
    lines.push({ id: it.id, amount: a });
    return Object.assign({}, it, { offset: it.offset + a });
  });
  return { ok: true, why: v.why, items: next, lines: lines, total: v.recv };
}

/* Cancelling gives every đồng back. Nothing else is restored, because nothing
   else was stored: whether a debt is in term or overdue is worked out again
   against the day of the cancellation, not the day of the minutes. */
function cancelOffset(items, lines) {
  var back = {};
  lines.forEach(function (l) { back[l.id] = (back[l.id] || 0) + l.amount; });
  return items.map(function (it) {
    return back[it.id] ? Object.assign({}, it, { offset: it.offset - back[it.id] }) : it;
  });
}

var BASE = {
  partner: "Công ty Thành Đạt",
  asOf: "2026-03-31",
  cancelOn: "2026-04-20",
  bounds: [30, 60, 90],
  offsetNo: "BTCN-2026-00012",
  items: [
    { id: "R1", dir: "RECEIVABLE", no: "HD-2026-0118", cur: "VND", amount: 120e6, offset: 0, due: "2026-03-20" },
    { id: "R2", dir: "RECEIVABLE", no: "HD-2026-0061", cur: "VND", amount:  80e6, offset: 0, due: "2026-02-05" },
    { id: "R3", dir: "RECEIVABLE", no: "HD-2025-0774", cur: "VND", amount: 150e6, offset: 0, due: "2025-12-10" },
    { id: "R4", dir: "RECEIVABLE", no: "HD-2026-0203", cur: "VND", amount:  90e6, offset: 0, due: "2026-04-25" },
    { id: "R0", dir: "RECEIVABLE", no: "HD-2024-0912", cur: "VND", amount:  40e6, offset: 0, due: "2024-11-30", writtenOff: true },
    { id: "P1", dir: "PAYABLE", no: "NCC-2026-0044", cur: "VND", amount:  70e6, offset: 0, due: "2026-03-25" },
    { id: "P2", dir: "PAYABLE", no: "NCC-2026-0081", cur: "VND", amount: 130e6, offset: 0, due: "2026-04-10" },
    { id: "P3", dir: "PAYABLE", no: "NCC-2026-0009", cur: "VND", amount:  60e6, offset: 0, due: "2026-01-15" }
  ]
};

root.AGE = { BASE: BASE, aging: aging, slot: slot, labels: labels, check: check,
             confirmOffset: confirmOffset, cancelOffset: cancelOffset,
             statusOf: statusOf, remaining: remaining, daysOverdue: daysOverdue,
             daysBetween: daysBetween };
if (typeof module !== "undefined" && module.exports) module.exports = root.AGE;
})(typeof window !== "undefined" ? window : globalThis);
