/* One runnable check for the matching rules behind lesson 13:  node tools/test-13.mjs
   The lesson's whole claim is that a confident wrong match costs more than no match, so the
   checks that matter are the ones about what the machine REFUSES to do. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-13.js", "utf8"))();
const RECON = globalThis.RECON;
const { LINES, BOOKS } = RECON;

const run = RECON.autoMatch();
const matchedLines = run.matches.map(m => m.lineId).sort();
const suggested = [...new Set(run.suggestions.map(s => s.lineId))].sort();

/* ---- what auto-match is allowed to close on its own ---- */

// three, and only these three: exact amount + exact reference twice, and one amount-only
// match that had no competition
assert.deepEqual(matchedLines, ["L4", "L5", "L8"]);
assert.equal(run.matched, 3);

// the two safe ones carry the reference; L4 does not, and says so in its own reason
assert.equal(run.matches.find(m => m.lineId === "L5").confidence, 1.00);
assert.equal(run.matches.find(m => m.lineId === "L8").confidence, 1.00);
assert.equal(run.matches.find(m => m.lineId === "L4").confidence, 0.90);
assert.match(run.matches.find(m => m.lineId === "L4").reason, /a guess/);

// a match written by the machine never carries a difference — a difference needs a signature
assert.ok(run.matches.every(m => m.difference === 0));

// 6.500.000,50 has to match 6.500.000,50. Comparing money with equals or with a rounded
// double is how the half đồng goes missing (ADR 0004).
assert.equal(run.matches.find(m => m.lineId === "L8").bookId, "R-0118");

/* ---- what it refuses, and why ---- */

// L1: the reference matches P-0231 exactly and the amount is 150.000 short because the bank
// took its transfer fee on the same booking. A reference is a tie-breaker, never a licence
// to ignore the amount — so this is a suggestion and nothing has been closed.
assert.ok(!matchedLines.includes("L1"));
const l1 = run.suggestions.filter(s => s.lineId === "L1");
assert.equal(l1.length, 1);
assert.equal(l1[0].bookId, "P-0231");
assert.equal(l1[0].confidence, 1.00);
assert.equal(l1[0].difference, 150000);

// L6 and L7: two payments of 45.000.000 on the same day to two different suppliers. Each
// line has two perfect candidates, so neither line may be closed — in EITHER direction.
assert.ok(!matchedLines.includes("L6") && !matchedLines.includes("L7"));
assert.deepEqual(suggested, ["L1", "L6", "L7"]);
assert.equal(run.suggestions.filter(s => s.lineId === "L6").length, 2);
assert.ok(run.suggestions.some(s => /cannot choose/.test(s.reason)));

// no record may be claimed twice, even across suggestions and matches
const claimed = run.matches.map(m => m.bookId);
assert.equal(new Set(claimed).size, claimed.length);
assert.ok(run.suggestions.every(s => !claimed.includes(s.bookId)));

// the invariant the summary panel depends on: scanned = matched + suggested + unmatched
assert.equal(run.scanned, LINES.length);
assert.equal(run.matched + run.suggestedLines + run.unmatched, run.scanned);
assert.equal(run.unmatched, 3);            // L2, L3, L9 — nothing in the books resembles them

/* ---- the tolerance is configuration, and it bites ---- */

// L4's value date is one day after the entry in the books. Tolerance 3 lets it through;
// tolerance 0 does not, and then nothing is left to match it with.
assert.equal(RECON.autoMatch({ tolerance: 0 }).matched, 2);
assert.ok(RECON.autoMatch({ tolerance: 0 }).suggestions.some(
  s => s.lineId === "L4" && /value date/.test(s.reason)));

// widening it does not manufacture matches out of the ambiguous pair
assert.equal(RECON.autoMatch({ tolerance: 15 }).matched, 3);

/* ---- and it is deterministic: same input, same answer, every time ---- */
assert.deepEqual(RECON.autoMatch(), run);

/* ---- what a human can do that the machine may not ---- */

// the bank fee: accepted by hand, and it costs a note and a DISPUTED entry
const fee = RECON.manualMatch("L1", "P-0231");
assert.equal(fee.kind, "difference");
assert.equal(fee.difference, 150000);
assert.equal(fee.disputed, true);
assert.equal(fee.status, "DISPUTED");

// one transfer paying two invoices — the wrong match the lesson is built around
const half = RECON.manualMatch("L2", "R-0114");
assert.equal(half.kind, "partial");
assert.equal(half.difference, 7500000);
assert.equal(half.sibling, "R-0115");
assert.match(half.detail, /R-0115/);

// the same forcing, one direction out, is refused rather than merely flagged
assert.equal(RECON.manualMatch("L3", "R-0109").kind, "direction");
assert.equal(RECON.manualMatch("L3", "R-0109").status, "REFUSED");

// counterparties that share no word: allowed, noted, and wrong on both partners at once
const stranger = RECON.manualMatch("L1", "P-0238");
assert.equal(stranger.kind, "partner");
assert.equal(stranger.status, "DISPUTED");

// an exact pair is the only thing that closes clean
assert.equal(RECON.manualMatch("L5", "R-0109").kind, "exact");
assert.equal(RECON.manualMatch("L5", "R-0109").status, "MATCHED");

/* ---- the bank writes names one way and the catalogue another ---- */
assert.equal(RECON.sameParty("CTY CP CANG TAN CANG", "CTY CP Cảng Tân Cảng"), true);
assert.equal(RECON.sameParty("KHO VAN AN PHU", "Kho vận An Phú"), true);
assert.equal(RECON.sameParty("KHO VAN AN PHU", "Công ty TNHH Bao bì Minh Long"), false);
assert.equal(RECON.sameParty("", "Kho vận An Phú"), false);   // no name is not a match

/* ---- the month-end question ---- */
const left = RECON.leftovers(matchedLines, claimed);
assert.equal(left.lines.length, 6);
assert.equal(left.books.length, 6);
// a payment the books swear happened and the bank never made
assert.ok(left.books.some(b => b.id === "P-0238"));
// and money that arrived from somebody nobody can name
assert.ok(left.lines.some(l => l.id === "L9" && /khong ro noi dung/.test(l.nar)));

// the value date is never left blank once the row is written — the duplicate key reads it
assert.ok(LINES.every(l => !!RECON.valueDate(l)));
assert.equal(RECON.valueDate(LINES.find(l => l.id === "L2")), "2026-07-24");
assert.equal(RECON.valueDate(LINES.find(l => l.id === "L3")), "2026-07-25");

assert.equal(BOOKS.every(b => b.amount > 0), true);   // direction lives in type, never in a sign

console.log(`ok — ${run.scanned} statement lines: ${run.matched} matched by the machine, ` +
            `${run.suggestedLines} handed to a human, ${run.unmatched} matching nothing at all` +
            ` · ${left.books.length} book entries still unreconciled`);
