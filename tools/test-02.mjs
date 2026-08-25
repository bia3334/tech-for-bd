/* One runnable check for the invoice state machine behind lesson 02:  node tools/test-02.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-02.js", "utf8"))();
const { start, apply, outstanding, daysToDue } = globalThis.INV;

/* run a script of [action, arg] pairs and keep the last result */
const run = (state, steps) => steps.reduce((r, [a, x]) => apply(r.state, a, x),
                                           { state, ok: true, code: null, msg: "", note: null });

const fresh = start();

// the frame: a draft owes nothing yet, and total is never a number of its own
assert.equal(fresh.status, "DRAFT");
assert.equal(fresh.total, fresh.net + fresh.tax);
assert.equal(fresh.paid, 0);
assert.equal(outstanding(fresh), fresh.total);
assert.equal(daysToDue(fresh), 45);

// a draft may be abandoned; an issued invoice may not — the whole point of the lesson
assert.equal(apply(fresh, "cancel").state.status, "CANCELED");
const issued = apply(fresh, "issue").state;
assert.equal(issued.status, "ISSUED");
const killed = apply(issued, "cancel");
assert.equal(killed.ok, false);
assert.equal(killed.state.status, "ISSUED", "a refused command must not move the state at all");
assert.match(killed.msg, /70\/2025/, "the refusal has to carry the legal reason, not just a no");

// issuing twice is a second legal document for one sale
assert.equal(apply(issued, "issue").ok, false);

// paid_amount is the sum of the allocation rows, and the status is derived from it
const part = apply(issued, "pay", 40e6);
assert.equal(part.state.paid, 40e6);
assert.equal(part.state.status, "PARTIALLY_PAID");
assert.equal(part.state.pays.length, 1);
const rest = apply(part.state, "pay", 70e6);
assert.equal(rest.state.paid, rest.state.total);
assert.equal(rest.state.status, "PAID");
assert.equal(rest.state.pays.length, 2, "one invoice, several payments — TM-21");
assert.equal(outstanding(rest.state), 0);

// a payment bigger than the invoice is not an error: the remainder walks on, FIFO
const over = apply(issued, "pay", 150e6);
assert.equal(over.state.paid, over.state.total);
assert.ok(over.state.paid <= over.state.total, "paid_amount may never exceed total — ck_invoices_paid");
assert.match(over.note, /FIFO/);

// nothing is owed on a draft, because the receivable is born at issue
assert.equal(apply(fresh, "pay", 10e6).ok, false);

// OVERDUE is set by the nightly job comparing due_date with today, by nobody clicking
const late = run(fresh, [["issue"], ["advance", 60]]);
assert.equal(late.state.status, "OVERDUE");
assert.equal(late.state.day, 60);
assert.match(late.msg, /nightly job/);
// ... and a fully paid invoice is never swept, however late the clock gets
assert.equal(run(fresh, [["issue"], ["pay", 110e6], ["advance", 300]]).state.status, "PAID");

// the four mark-eligible checks, each refusing for its own legal reason
assert.equal(apply(fresh, "eligible").code, "INVALID_STATE_TRANSITION");   // still a draft
assert.equal(apply(late.state, "eligible").code, "INVALID_STATE_TRANSITION"); // already OVERDUE
/* paid > 0 while still ISSUED: the status check normally gets there first, because
   recalculatePaidAmount moves ISSUED to PARTIALLY_PAID on the first đồng. The check is
   kept because the flag and the money are written by two different services. */
assert.equal(apply(start({ status: "ISSUED", paid: 40e6 }), "eligible").code, "INVOICE_PARTIALLY_PAID");
/* past due but still ISSUED — the window between the due date passing and the nightly job
   running is real, which is why the date is checked here and not only the status (Điều 7) */
assert.equal(apply(start({ status: "ISSUED", dueDay: 10, day: 40 }), "eligible").code, "INVOICE_OVERDUE");
assert.equal(apply(apply(start({ dueDay: 400 }), "issue").state, "eligible").code, "INVOICE_TERM_TOO_LONG");
const ok = apply(issued, "eligible");
assert.equal(ok.ok, true);
assert.equal(ok.state.eligible, true);
assert.match(ok.note, /UNVERIFIED/, "an eligible but unverified invoice must say so");
assert.equal(apply(apply(issued, "verify").state, "eligible").note, null);

// the flag alone is not a ticket — status is checked again at the offer
assert.equal(apply(issued, "finance").code, "INVOICE_NOT_MARKED_ELIGIBLE");
const financed = run(fresh, [["issue"], ["eligible"], ["finance"], ["disburse"]]);
assert.equal(financed.state.status, "FINANCED");
// money arriving on a financed invoice must not erase the financing
const paidWhileFinanced = apply(financed.state, "pay", 40e6);
assert.equal(paidWhileFinanced.state.paid, 40e6);
assert.equal(paidWhileFinanced.state.status, "FINANCED", "06 §6 decides that branch, not an addition");
// but paid in full still lands on PAID, and a financed invoice still goes overdue
assert.equal(apply(financed.state, "pay", 110e6).state.status, "PAID");
assert.equal(apply(financed.state, "advance", 60).state.status, "OVERDUE");

// replacement: a new record, and only while the debt is still whole
const replaced = apply(issued, "replace");
assert.equal(replaced.state.status, "REPLACED");
assert.ok(replaced.state.replacedBy, "a replacement is a NEW invoice pointing back at this one");
assert.equal(apply(part.state, "replace").code, "INVOICE_PARTIALLY_PAID");
assert.equal(apply(replaced.state, "pay", 10e6).ok, false, "REPLACED is final");

// deterministic: no clock, no random — the same clicks twice give the same bytes
const script = [["issue"], ["verify"], ["eligible"], ["finance"], ["advance", 30], ["pay", 30e6], ["advance", 30]];
assert.equal(JSON.stringify(run(start(), script).state), JSON.stringify(run(start(), script).state));

console.log(`ok — invoice ${(fresh.net / 1e6)}m + ${(fresh.tax / 1e6)}m VAT = ${(fresh.total / 1e6)}m`
  + ` · issued → cancel refused (NĐ 70/2025) · 40m then 70m ⇒ PARTIALLY_PAID ⇒ PAID`
  + ` · day 60 unpaid ⇒ OVERDUE by the nightly job`);
