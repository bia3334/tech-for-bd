/* The reconciliation run behind lesson 13. No DOM in here, so tools/test-13.mjs can run it
   in node.

   The data is not invented. The statement lines are the sample statements that ship in the
   project — dev-seed/sao-ke-mau-techcombank.csv and .mt940 — kept in the shape the bank
   really sends them: a blank statement date on one row, an ISO date in a dd/mm/yyyy file on
   another, a lowercase currency, a decimal comma, two rows with no reference and no
   counterparty at all, and one incoming transfer whose whole description is "khong ro noi
   dung".

   The matching rules mirror transaction-service · AutoMatcher (TM-10, CF-04):
     · same currency, same direction, amount equal to the LAST đồng, |days| <= tolerance
     · a line matches only if it has exactly ONE candidate — and that candidate is not the
       sole candidate of any other line. Ambiguity in either direction means no match.
     · a matching reference chooses BETWEEN candidates. It never excuses a wrong amount.
     · a difference other than zero can only ever be created by a human.                   */
(function (root) {
"use strict";

/* smefin.transaction.reconcile-date-tolerance-days — configuration, not a constant in code. */
var TOLERANCE = 3;

/* smefin.transaction.reconcile-dispute-threshold. Default 0: one đồng of difference has to
   be explained in writing. */
var DISPUTE_THRESHOLD = 0;

/* Bank statement, account 19033445566, July 2026. amount is SIGNED — negative is money out.
   sd = statement date, vd = value date; either may be blank in the file, and the import
   service fills the missing one from the other before the row is written. */
var LINES = [
  { id:"L1", sd:"2026-07-23", vd:"2026-07-23", amount:-84300000, cur:"VND", src:"CSV",
    nar:"CK di AN PHU phi luu kho quy II", cp:"KHO VAN AN PHU", ref:"FT26-91457" },
  { id:"L2", sd:"2026-07-24", vd:null, amount:18000000, cur:"VND", src:"CSV",
    nar:"CK den thanh toan don hang thang 07", cp:"CTY CP CANG TAN CANG", ref:"FT26-92008" },
  { id:"L3", sd:null, vd:"2026-07-25", amount:-2400000, cur:"VND", src:"CSV",
    nar:"Phi quan ly tai khoan va phi CK", cp:"TECHCOMBANK", ref:"PHI-TCB-0725" },
  { id:"L4", sd:"2026-07-26", vd:"2026-07-26", amount:-15750000, cur:"VND", src:"CSV",
    nar:"UNC tam ung cong tac phi", cp:"", ref:"" },
  { id:"L5", sd:"2026-07-22", vd:"2026-07-22", amount:260000000, cur:"VND", src:"MT940",
    nar:"Khach Tan Cang thanh toan cong no ky 06 - CTY CP CANG TAN CANG", cp:"",
    ref:"FT26-90233" },
  { id:"L6", sd:"2026-07-27", vd:"2026-07-27", amount:-45000000, cur:"VND", src:"MT940",
    nar:"CK di thanh toan dot 1", cp:"", ref:"" },
  { id:"L7", sd:"2026-07-27", vd:"2026-07-27", amount:-45000000, cur:"VND", src:"MT940",
    nar:"CK di thanh toan dot 1", cp:"", ref:"" },
  { id:"L8", sd:"2026-07-28", vd:"2026-07-28", amount:6500000.5, cur:"VND", src:"CSV",
    nar:"CK den hoan tien cuoc van chuyen", cp:"NHA XE DUC PHAT", ref:"FT26-92310" },
  { id:"L9", sd:"2026-07-29", vd:"2026-07-29", amount:5000000, cur:"VND", src:"MT940",
    nar:"CK den khong ro noi dung - NGUOI CHUYEN AN DANH", cp:"", ref:"" }
];

/* The company's own records. amount is ALWAYS positive — the direction lives in type,
   exactly as transactions.amount does. Comparing the two sides means taking the absolute
   value of the statement line first. */
var BOOKS = [
  { id:"R-0109", type:"RECEIPT", amount:260000000, cur:"VND", date:"2026-07-22",
    ref:"FT26-90233", partner:"CTY CP Cảng Tân Cảng", what:"Công nợ kỳ 06" },
  { id:"P-0231", type:"PAYMENT", amount:84150000, cur:"VND", date:"2026-07-23",
    ref:"FT26-91457", partner:"Kho vận An Phú", what:"Phí lưu kho quý II" },
  { id:"R-0114", type:"RECEIPT", amount:10500000, cur:"VND", date:"2026-07-24",
    ref:"HD-07-11", partner:"CTY CP Cảng Tân Cảng", what:"Hoá đơn HD-07-11" },
  { id:"R-0115", type:"RECEIPT", amount:7500000, cur:"VND", date:"2026-07-24",
    ref:"HD-07-12", partner:"CTY CP Cảng Tân Cảng", what:"Hoá đơn HD-07-12" },
  { id:"P-0234", type:"PAYMENT", amount:15750000, cur:"VND", date:"2026-07-25",
    ref:"", partner:"", what:"Tạm ứng công tác phí" },
  { id:"P-0236", type:"PAYMENT", amount:45000000, cur:"VND", date:"2026-07-27",
    ref:"", partner:"Công ty TNHH Vận tải Trường Sơn", what:"Cước vận chuyển đợt 1" },
  { id:"P-0237", type:"PAYMENT", amount:45000000, cur:"VND", date:"2026-07-27",
    ref:"", partner:"Công ty TNHH Bao bì Minh Long", what:"Bao bì đợt 1" },
  { id:"R-0118", type:"RECEIPT", amount:6500000.5, cur:"VND", date:"2026-07-28",
    ref:"FT26-92310", partner:"Nhà xe Đức Phát", what:"Hoàn cước vận chuyển" },
  { id:"P-0238", type:"PAYMENT", amount:33000000, cur:"VND", date:"2026-07-30",
    ref:"FT26-92455", partner:"Công ty TNHH Bao bì Minh Long", what:"Bao bì đợt 2" }
];

/* ---------- small pure helpers ---------- */

/* Days since epoch, from an ISO date, with no timezone anywhere near it. */
function day(iso) {
  var p = iso.split("-");
  return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
}

/* The value date the service actually stored: blank in the file means copy the other one.
   Leaving it blank would break the duplicate key, which compares on this column. */
function valueDate(line) { return line.vd || line.sd; }

/* Money equality to the last đồng. The service does this with BigDecimal.compareTo — never
   equals, which would call 100.00 and 100.0000 different numbers, and never double (ADR
   0004). A half-đồng epsilon is this widget standing in for that. */
function eq(a, b) { return Math.abs(a - b) < 0.005; }

function daysApart(line, book) {
  var vd = valueDate(line);
  return vd && book.date ? Math.abs(day(vd) - day(book.date)) : Infinity;
}

function directionMatches(line, book) {
  if (book.type === "PAYMENT") return line.amount < 0;
  if (book.type === "RECEIPT") return line.amount > 0;
  return false;                         /* ADJUSTMENT never auto-matches */
}

function refMatches(line, book) {
  return !!line.ref && !!book.ref && line.ref.trim().toUpperCase() === book.ref.trim().toUpperCase();
}

var LEGAL_FORM_WORDS = ["CTY","CONG","TY","TNHH","CP","CO","LTD","JSC","COMPANY","MTV"];

/* Bỏ dấu, chữ hoa, bỏ từ chỉ loại hình. "CTY CP CANG TAN CANG" and "CTY CP Cảng Tân Cảng"
   have to come out the same, because the bank prints one and the catalogue holds the other. */
function words(name) {
  if (!name) return [];
  var ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                  .replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase();
  var out = [];
  ascii.split(/[^A-Z0-9]+/).forEach(function (w) {
    if (w && LEGAL_FORM_WORDS.indexOf(w) < 0 && out.indexOf(w) < 0) out.push(w);
  });
  return out;
}

/* Every word of the shorter name has to appear in the longer one. A heuristic on purpose —
   it only ever decides whether something is SUGGESTED. */
function sameParty(a, b) {
  var x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  var shorter = x.length <= y.length ? x : y, longer = shorter === x ? y : x;
  return shorter.every(function (w) { return longer.indexOf(w) >= 0; });
}

/* ---------- the run ---------- */

function exactCandidates(line, books, tolerance) {
  return books.filter(function (b) {
    return directionMatches(line, b)
        && line.cur.toUpperCase() === b.cur.toUpperCase()
        && eq(b.amount, Math.abs(line.amount))
        && daysApart(line, b) <= tolerance;
  });
}

/* A reference chooses between candidates that already qualify. Exactly one of them carrying
   the reference narrows the field to that one; two carrying it narrows nothing. */
function preferByReference(line, exact) {
  if (exact.length <= 1) return exact;
  var byRef = exact.filter(function (b) { return refMatches(line, b); });
  return byRef.length === 1 ? byRef : exact;
}

function pair(line, book, confidence, difference, reason) {
  return { lineId: line.id, bookId: book.id, confidence: confidence,
           difference: difference, reason: reason };
}

/* A line with no candidate at all: say which condition it failed, so a human can decide. */
function nearMisses(line, books, tolerance) {
  var out = [];
  books.forEach(function (b) {
    if (!directionMatches(line, b) || line.cur.toUpperCase() !== b.cur.toUpperCase()) return;
    var difference = Math.abs(b.amount - Math.abs(line.amount));
    var days = daysApart(line, b);
    if (refMatches(line, b)) {
      out.push(pair(line, b, 1.00, difference, eq(difference, 0)
        ? "reference " + line.ref + " matches, but the value date is " + days
          + " days out and the tolerance is " + tolerance
        : "reference " + line.ref + " matches, but the amount is off by " + fmt(difference)));
    } else if (eq(difference, 0)) {
      out.push(pair(line, b, 0.80, 0,
        "amount matches to the đồng, but the value date is " + days
        + " days out and the tolerance is " + tolerance));
    }
  });
  return out;
}

function autoMatch(o) {
  o = o || {};
  var tolerance = o.tolerance === undefined ? TOLERANCE : o.tolerance;
  var takenLines = o.takenLines || [], takenBooks = o.takenBooks || [];
  var lines = LINES.filter(function (l) { return takenLines.indexOf(l.id) < 0; });
  var books = BOOKS.filter(function (b) { return takenBooks.indexOf(b.id) < 0; });

  /* phase 1 — the candidate set of every line */
  var eligible = {};
  lines.forEach(function (l) {
    eligible[l.id] = preferByReference(l, exactCandidates(l, books, tolerance));
  });

  /* phase 2 — how many lines claim each record as their ONLY candidate. Two lines pointing
     at one record means neither may have it: one đồng settles one thing, and picking a
     winner would be picking whichever row the database returned first. */
  var soleClaims = {};
  lines.forEach(function (l) {
    var only = eligible[l.id];
    if (only.length === 1) soleClaims[only[0].id] = (soleClaims[only[0].id] || 0) + 1;
  });

  /* phase 3 — conclude, one line at a time */
  var matches = [], suggestions = [];
  lines.forEach(function (l) {
    var only = eligible[l.id];
    if (only.length === 0) {
      suggestions = suggestions.concat(nearMisses(l, books, tolerance));
    } else if (only.length > 1) {
      only.forEach(function (b) {
        suggestions.push(pair(l, b, 0.90, 0,
          "amount and date both match" + (only.length === 2
            ? " — and so does one other entry in the books."
            : " — and so do " + (only.length - 1) + " other entries in the books.")
          + " The machine cannot choose, so it does not."));
      });
    } else if (soleClaims[only[0].id] > 1) {
      suggestions.push(pair(l, only[0], 0.90, 0,
        soleClaims[only[0].id] + " statement lines all match this one entry. "
        + "The machine cannot choose, so it does not."));
    } else {
      var b = only[0], days = daysApart(l, b);
      matches.push(pair(l, b, refMatches(l, b) ? 1.00 : 0.90, 0,
        refMatches(l, b)
          ? "amount to the đồng and reference " + l.ref + " — safe"
          : "amount to the đồng, " + (days === 0 ? "same day" : days + " day(s) apart")
            + ", nothing else in range — a guess, and the only one available"));
    }
  });

  /* a record already matched for real must not also stand in a suggestion */
  var claimed = matches.map(function (m) { return m.bookId; });
  suggestions = suggestions.filter(function (s) { return claimed.indexOf(s.bookId) < 0; })
                           .sort(function (a, b) { return b.confidence - a.confidence; });

  var suggestedLines = [];
  suggestions.forEach(function (s) {
    if (suggestedLines.indexOf(s.lineId) < 0) suggestedLines.push(s.lineId);
  });

  return { matches: matches, suggestions: suggestions,
           scanned: lines.length, matched: matches.length,
           suggestedLines: suggestedLines.length,
           unmatched: lines.length - matches.length - suggestedLines.length };
}

/* ---------- what happens when a human forces a pair ---------- */

function find(list, id) {
  var hit = null;
  list.forEach(function (x) { if (x.id === id) hit = x; });
  return hit;
}

/* Another open record from the same counterparty on the same day that is exactly the
   remainder — which is what "one transfer paying two invoices" looks like from here. */
function siblingFor(line, book, remainder, takenBooks) {
  var hit = null;
  BOOKS.forEach(function (b) {
    if (b.id === book.id || (takenBooks || []).indexOf(b.id) >= 0) return;
    if (b.type !== book.type || b.date !== book.date) return;
    if (!sameParty(b.partner, book.partner)) return;
    if (eq(b.amount, remainder)) hit = b;
  });
  return hit;
}

function manualMatch(lineId, bookId, o) {
  o = o || {};
  var line = find(LINES, lineId), book = find(BOOKS, bookId);
  if (!line || !book) return null;

  if (!directionMatches(line, book)) {
    return { kind:"direction", difference:0, disputed:false, status:"REFUSED",
      headline:"Opposite directions",
      detail:"The statement line is money " + (line.amount < 0 ? "leaving" : "arriving")
        + " and " + book.id + " is a " + book.type.toLowerCase()
        + ". Manual matching is the escape hatch for cases the algorithm cannot read, not a "
        + "way to pair a debit with a credit." };
  }

  var difference = Math.abs(book.amount - Math.abs(line.amount));
  var disputed = difference > DISPUTE_THRESHOLD;

  if (line.cp && book.partner && !sameParty(line.cp, book.partner)) {
    return { kind:"partner", difference:difference, disputed:disputed, status:"DISPUTED",
      headline:"Two different counterparties",
      detail:"The bank printed " + line.cp + " and " + book.id + " is against "
        + book.partner + ". Nothing stops you — the service takes a note and a name instead "
        + "of refusing — and from tomorrow both parties' balances are wrong, in opposite "
        + "directions, with a reconciled pair sitting on top saying they agree." };
  }

  if (eq(difference, 0)) {
    return { kind:"exact", difference:0, disputed:false, status:"MATCHED",
      headline:"Clean pair",
      detail:"Same direction, same amount to the đồng. difference_amount is 0, the line goes "
        + "MATCHED and " + book.id + " goes MATCHED in the same database transaction — never "
        + "one without the other, or the reconciliation screen contradicts itself." };
  }

  var sibling = siblingFor(line, book, difference, o.takenBooks);
  if (sibling) {
    return { kind:"partial", difference:difference, disputed:true, status:"DISPUTED",
      sibling:sibling.id,
      headline:"One transfer, two invoices — and you just closed one of them",
      detail:"The customer sent " + fmt(Math.abs(line.amount)) + " to settle two invoices at "
        + "once. You matched it to " + book.id + " alone, so the remaining "
        + fmt(difference) + " is now recorded as a difference on a closed pair — and "
        + sibling.id + ", which is that amount exactly, stays open with no transfer left to "
        + "pay it. Someone will chase a customer who already paid. The fix is not a bigger "
        + "match: it is allocating one receipt across two invoices (TM-21) and then "
        + "reconciling the receipt." };
  }

  return { kind:"difference", difference:difference, disputed:disputed, status:"DISPUTED",
    headline:"Matched with a difference of " + fmt(difference),
    detail:(Math.abs(line.amount) > book.amount
      ? "The account moved " + fmt(difference) + " more than the books say. That is a fee, a "
        + "rate or a second charge nobody recorded — and once it is buried inside a "
        + "reconciled pair it is nobody's line to explain."
      : "The books say " + fmt(difference) + " more moved than the bank shows. " + book.id
        + " is now closed anyway, so that shortfall is written off in silence and the "
        + "invoice behind it will never be chased.")
      + " difference_amount is above the dispute threshold, so the entry goes DISPUTED and a "
      + "note is mandatory — somebody's name is on this." };
}

function fmt(n) {
  var s = Math.round(n * 100) / 100, whole = Math.floor(s), rest = Math.round((s - whole) * 100);
  var out = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rest ? out + "," + (rest < 10 ? "0" + rest : rest) : out;
}

/* What is still standing at the end of the month, on both sides. */
function leftovers(takenLines, takenBooks) {
  return {
    lines: LINES.filter(function (l) { return (takenLines || []).indexOf(l.id) < 0; }),
    books: BOOKS.filter(function (b) { return (takenBooks || []).indexOf(b.id) < 0; })
  };
}

root.RECON = { LINES: LINES, BOOKS: BOOKS, TOLERANCE: TOLERANCE,
               DISPUTE_THRESHOLD: DISPUTE_THRESHOLD,
               autoMatch: autoMatch, manualMatch: manualMatch, leftovers: leftovers,
               valueDate: valueDate, sameParty: sameParty, fmt: fmt };
if (typeof module !== "undefined" && module.exports) module.exports = root.RECON;
})(typeof window !== "undefined" ? window : globalThis);
