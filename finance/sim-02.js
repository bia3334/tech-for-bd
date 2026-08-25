/* The invoice state machine behind lesson 02 — invoices.status (06 §5), TM-21, SCF-07.
   No DOM in here, so tools/test-02.mjs can run it in node.

   Time is a day counter and nothing else: no clock, no Date, so the same sequence of
   clicks always produces the same answer. Every refusal carries the reason it is refused,
   because in this table almost every refusal comes from law rather than from taste.        */
(function (root) {
"use strict";

var NET = 100e6, TAX = 10e6;               /* 100 million goods + 10% VAT */

/* The statuses a payment may still land on — InvoicePaymentService.UNPAID.
   DRAFT is absent on purpose: a draft carries no receivable yet.            */
var UNPAID = ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "FINANCING", "FINANCED"];

function fmt(n) { return (n / 1e6).toFixed(1) + "m"; }

function start(over) {
  var s = {
    day: 0, dueDay: 45,
    net: NET, tax: TAX, total: NET + TAX, paid: 0,
    status: "DRAFT", verified: false, eligible: false,
    replacedBy: null, pays: []
  };
  for (var k in (over || {})) s[k] = over[k];
  return s;
}

function copy(s) { var c = {}; for (var k in s) c[k] = s[k]; c.pays = s.pays.slice(); return c; }

function outstanding(s) { return s.total - s.paid; }
function daysToDue(s) { return s.dueDay - s.day; }

function refuse(s, code, msg) { return { state: s, ok: false, code: code, msg: msg, note: null }; }
function allow(s, msg, note) { return { state: s, ok: true, code: null, msg: msg, note: note || null }; }

function apply(prev, action, arg) {
  var s = copy(prev);

  switch (action) {

  case "issue":
    if (prev.status !== "DRAFT") {
      return refuse(prev, "INVALID_STATE_TRANSITION",
        "Refused — status is " + prev.status + ". Only a DRAFT can be issued, and issuing twice would "
        + "mint a second legal document for one sale.");
    }
    s.status = "ISSUED";
    return allow(s, "ISSUED on day " + s.day + ". Revenue is recognised here and the receivable exists "
      + "here (Nợ TK 131 at the moment of issue — TT 200/2014/TT-BTC). Not one đồng has moved.");

  case "cancel":
    if (prev.status === "DRAFT") {
      s.status = "CANCELED";
      return allow(s, "Draft abandoned. CANCELED is final, and DRAFT is the only place it can be reached "
        + "from — a draft has no legal standing to destroy.");
    }
    return refuse(prev, "INVALID_STATE_TRANSITION",
      "Refused — Nghị định 70/2025/NĐ-CP removed cancellation of an e-invoice once it has been issued. "
      + "A " + prev.status + " invoice is corrected by a replacement or by an adjustment invoice, and both "
      + "of those are new records pointing back at this one. There is no delete to build.");

  case "verify":
    if (prev.status === "DRAFT") {
      return refuse(prev, "INVALID_STATE_TRANSITION",
        "Refused — a draft has no tax lookup code, because the tax authority has never seen it. "
        + "There is nothing to look up.");
    }
    if (prev.verified) {
      return refuse(prev, "ALREADY_VERIFIED",
        "Already VERIFIED_MANUAL. There is no stronger level to reach: the enum holds two values and "
        + "only two, because the portal has a captcha and publishes no API to third parties.");
    }
    s.verified = true;
    return allow(s, "verification_status = VERIFIED_MANUAL — a person opened hoadondientu.gdt.gov.vn, "
      + "typed the lookup code, and confirmed the seller and buyer tax codes match the paper.");

  case "eligible":
    if (prev.status !== "ISSUED") {
      return refuse(prev, "INVALID_STATE_TRANSITION",
        "Refused — status is " + prev.status + ". Only an invoice that is issued and not already inside a "
        + "financing flow may be factored (Điều 7 Thông tư 20/2024/TT-NHNN). This one is a 409 rather than a "
        + "422: it means do another step first, not this invoice can never be financed.");
    }
    if (daysToDue(prev) < 0) {
      return refuse(prev, "INVOICE_OVERDUE",
        "Refused — the due date passed " + (-daysToDue(prev)) + " days ago. Điều 7 forbids factoring a "
        + "receivable already overdue, which is also why the state machine has no OVERDUE → FINANCING edge.");
    }
    if (prev.paid > 0) {
      return refuse(prev, "INVOICE_PARTIALLY_PAID",
        "Refused — " + fmt(prev.paid) + " has already been collected. What is left is no longer the whole "
        + "receivable that was offered for sale.");
    }
    if (daysToDue(prev) >= 365) {
      return refuse(prev, "INVOICE_TERM_TOO_LONG",
        "Refused — " + daysToDue(prev) + " days still to run. The remaining term of the receivable must be "
        + "under one year (Điều 7 khoản 2).");
    }
    s.eligible = true;
    return allow(s, "eligible_for_financing = true. Four checks passed, and a fifth asked credit-service "
      + "whether this partner is blocked.",
      prev.verified ? null : "verification_status is still UNVERIFIED, and nothing in the code stopped you. "
      + "No financier will quote on an invoice they cannot look up at the tax authority — this gate lives in "
      + "the market, not in the CHECK constraint.");

  case "finance":
    if (!prev.eligible) {
      return refuse(prev, "INVOICE_NOT_MARKED_ELIGIBLE",
        "Refused — nobody has run mark-eligible on this invoice (SCF-07), so there is no basis for an offer.");
    }
    if (prev.status !== "ISSUED") {
      return refuse(prev, "INVALID_STATE_TRANSITION",
        "Refused — status is " + prev.status + ". The eligible flag was set at some earlier moment; the status "
        + "is checked again here because between the two the invoice may have been paid, replaced, or financed "
        + "somewhere else.");
    }
    s.status = "FINANCING";
    return allow(s, "FINANCING — the request is out with the financiers. Still no money: this status means "
      + "asked, not funded.");

  case "disburse":
    if (prev.status !== "FINANCING") {
      return refuse(prev, "INVALID_STATE_TRANSITION",
        "Refused — status is " + prev.status + ". Only an offer already out for quotes can be disbursed.");
    }
    s.status = "FINANCED";
    return allow(s, "FINANCED — the financier has paid. The buyer still owes the money, which is why this "
      + "invoice keeps being swept by the overdue job.");

  case "pay": {
    if (UNPAID.indexOf(prev.status) < 0) {
      return refuse(prev, "INVALID_STATE_TRANSITION", prev.status === "DRAFT"
        ? "Refused — a draft carries no receivable. Công nợ starts the moment the invoice is issued, not the "
          + "moment somebody typed it into a form."
        : "Refused — status is " + prev.status + ", and nothing is owed on it any more.");
    }
    var take = Math.min(arg, outstanding(prev)), left = arg - take;
    s.pays.push({ day: s.day, amount: take });
    s.paid = s.pays.reduce(function (a, p) { return a + p.amount; }, 0);

    /* status is DERIVED from the sum of the allocations, never set by hand —
       Invoice.recalculatePaidAmount. FINANCING/FINANCED are deliberately left alone. */
    if (s.paid >= s.total) { s.status = "PAID"; }
    else if (s.paid > 0 && s.status !== "FINANCING" && s.status !== "FINANCED") { s.status = "PARTIALLY_PAID"; }

    var note = null;
    if (left > 0) {
      note = fmt(left) + " of that transaction did not fit on this invoice. It carries on to the same "
        + "partner's next unpaid invoice, oldest due date first — FIFO, TM-21. Nothing is refused and "
        + "nothing overflows.";
    } else if (prev.status === "FINANCING" || prev.status === "FINANCED") {
      note = "Status stays " + prev.status + " on purpose. Money arriving must not erase the fact that this "
        + "invoice sits inside a financing flow — that branch is decided by 06 §6, not by an addition.";
    }
    return allow(s, "Allocated " + fmt(take) + " on day " + s.day + ". paid_amount is now the sum of "
      + s.pays.length + " row" + (s.pays.length > 1 ? "s" : "") + " in invoice_payments: " + fmt(s.paid)
      + " of " + fmt(s.total) + ".", note);
  }

  case "advance": {
    s.day += (arg || 30);
    var msg = "The clock moves to day " + s.day + ". Nobody touched the invoice.";
    /* the nightly job — ScfJobTasks, 06 §5.1: due_date < today AND paid < total */
    if (s.dueDay < s.day && s.paid < s.total
        && UNPAID.indexOf(s.status) >= 0 && s.status !== "OVERDUE") {
      s.status = "OVERDUE";
      msg += " The nightly job found due_date < today with " + fmt(outstanding(s)) + " still outstanding "
        + "and set OVERDUE. No user clicked that, and no event was published.";
    }
    return allow(s, msg);
  }

  case "replace":
    if (prev.paid > 0) {
      return refuse(prev, "INVOICE_PARTIALLY_PAID",
        "Refused — " + fmt(prev.paid) + " has already been collected, so the debt cannot be carried over "
        + "whole to a new document. A part-paid invoice is corrected with an adjustment invoice instead "
        + "(06 §5).");
    }
    if (prev.status !== "ISSUED") {
      return refuse(prev, "INVALID_STATE_TRANSITION",
        "Refused — status is " + prev.status + ". ISSUED → REPLACED is the only replacement edge in the "
        + "state machine (06 §5).");
    }
    s.status = "REPLACED";
    s.replacedBy = "INV-2026-0142-R1";
    return allow(s, "REPLACED, and that is final. A NEW row " + s.replacedBy + " now exists with "
      + "original_invoice_id pointing back here and adjustment_kind = REPLACEMENT. The debt moves there whole; "
      + "this row keeps its history and stops being owed.");

  default:
    return refuse(prev, "UNKNOWN_ACTION", "No such command.");
  }
}

root.INV = { start: start, apply: apply, outstanding: outstanding, daysToDue: daysToDue,
             fmt: fmt, UNPAID: UNPAID, NET: NET, TAX: TAX };
if (typeof module !== "undefined" && module.exports) module.exports = root.INV;
})(typeof window !== "undefined" ? window : globalThis);
