/* One runnable check for the regime resolver behind lesson 15:  node tools/test-15.mjs
   The lesson turns on two claims: which statute a company falls under, and that two of the
   four Thông tư 58 groups owe the state no financial statement at all. Both are here, plus
   the product consequence — a screen list derived from the legal profile rather than set. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-15.js", "utf8"))();
const BOOKS = globalThis.BOOKS;
const { BASE, PRESETS } = BOOKS;
const run = (o) => BOOKS.resolve({ ...BASE, ...o });
const on = (r, id) => r.screens.find((s) => s.id === id).on;

/* ---- which of the two 2026 statutes applies ---- */

// micro enterprises and household businesses go to Thông tư 58; everyone else to Thông tư 99
assert.equal(run({ entity: "ENTERPRISE", scale: "MICRO" }).regime, "TT58");
assert.equal(run({ entity: "HOUSEHOLD" }).regime, "TT58");
for (const scale of ["SMALL", "MEDIUM", "LARGE"]) {
  assert.equal(run({ entity: "ENTERPRISE", scale }).regime, "TT99", scale + " must fall under Thông tư 99");
}
// a household business is never sized — Thông tư 58 reaches it whatever the knob says
assert.equal(run({ entity: "HOUSEHOLD", scale: "LARGE" }).regime, "TT58");
assert.equal(run({ entity: "HOUSEHOLD" }).scale, null);

// the statutes, their dates and what they retire
assert.equal(run({ scale: "SMALL" }).replaces, "Thông tư 200/2014/TT-BTC");
assert.equal(run({ scale: "SMALL" }).effective, "01/01/2026");
assert.equal(run({ scale: "MICRO" }).replaces, "Thông tư 132/2018/TT-BTC");
assert.equal(run({ scale: "MICRO" }).effective, "01/07/2026");

/* ---- the four groups of Thông tư 58, and the books each one keeps ---- */

const g = (vat, cit) => run({ scale: "MICRO", vat, cit });
assert.equal(g("DIRECT", "REVENUE_PERCENT").group, 1);
assert.equal(g("DIRECT", "TAXABLE_INCOME").group, 2);
assert.equal(g("DEDUCTION", "REVENUE_PERCENT").group, 3);
assert.equal(g("DEDUCTION", "TAXABLE_INCOME").group, 4);
// the grid is complete: two VAT methods times two income tax bases, no fifth answer
assert.equal(new Set(Object.values(BOOKS.GROUPS).map((x) => x.n)).size, 4);

// group 1 keeps exactly one book, and it is S1-DNSN
assert.deepEqual(g("DIRECT", "REVENUE_PERCENT").books.map((b) => b.code), ["S1-DNSN"]);
// group 2 keeps four detail books — and the source gives no form codes for them
assert.equal(g("DIRECT", "TAXABLE_INCOME").books.length, 4);
assert.ok(g("DIRECT", "TAXABLE_INCOME").books.every((b) => b.code === "—"));
assert.match(g("DIRECT", "TAXABLE_INCOME").booksNote, /no form codes/);
// group 3 is the VAT-deduction pair
assert.deepEqual(g("DEDUCTION", "REVENUE_PERCENT").books.map((b) => b.code), ["S3a-DNSN", "S3b-DNSN"]);
// group 4 is the full S2a–S2d set
assert.deepEqual(g("DEDUCTION", "TAXABLE_INCOME").books.map((b) => b.code),
                 ["S2a-DNSN", "S2b-DNSN", "S2c-DNSN", "S2d-DNSN"]);

/* ---- the point of the lesson: who owes the state a financial statement ---- */

// groups 1 and 3 file nothing; groups 2 and 4 do; Thông tư 99 always does
assert.equal(g("DIRECT", "REVENUE_PERCENT").fsRequired, false);
assert.equal(g("DEDUCTION", "REVENUE_PERCENT").fsRequired, false);
assert.equal(g("DIRECT", "TAXABLE_INCOME").fsRequired, true);
assert.equal(g("DEDUCTION", "TAXABLE_INCOME").fsRequired, true);
assert.equal(run({ scale: "MEDIUM" }).fsRequired, true);
// the exemption tracks the income tax basis, not the VAT method
assert.ok(Object.values(BOOKS.GROUPS).every((x) => x.fs === (x.label.includes("thu nhập tính thuế"))));
// group 2's ninety-day deadline is the one thing the statute puts a clock on
assert.match(g("DIRECT", "TAXABLE_INCOME").fsDeadline, /90 ngày/);
assert.equal(g("DIRECT", "REVENUE_PERCENT").fsDeadline, null);

/* ---- the product consequence: screens are derived, and group 1 switches most of them off ---- */

const one = g("DIRECT", "REVENUE_PERCENT");
assert.equal(one.shown, 1, "group 1 must leave exactly one screen standing, got " + one.shown);
assert.equal(one.hidden, one.screens.length - 1);
assert.equal(on(one, "sale-book"), true);
for (const id of ["cost-books", "vat-book", "coa", "fs-position", "fs-result", "fs-cash", "fs-file", "cit-worksheet"]) {
  assert.equal(on(one, id), false, id + " must be hidden for a group 1 customer");
}

// every screen is on for somebody and off for somebody — a screen that is always on is not derived
for (const s of one.screens) {
  const anyOn = PRESETS.some((p) => on(BOOKS.resolve(p.p), s.id));
  assert.ok(anyOn, s.id + " is never shown to anyone");
}
// the VAT book follows the VAT method and nothing else
assert.equal(on(g("DEDUCTION", "REVENUE_PERCENT"), "vat-book"), true);
assert.equal(on(g("DIRECT", "TAXABLE_INCOME"), "vat-book"), false);
// chart-of-accounts configuration exists only where Thông tư 99 grants the autonomy
assert.equal(run({ scale: "SMALL" }).coaConfigurable, true);
assert.equal(on(run({ scale: "SMALL" }), "coa"), true);
assert.equal(run({ scale: "MICRO" }).coaConfigurable, false);
assert.equal(on(run({ scale: "MICRO" }), "coa"), false);
// more obligation must never mean fewer screens
assert.ok(run({ scale: "SMALL" }).shown > g("DEDUCTION", "TAXABLE_INCOME").shown);
assert.ok(g("DEDUCTION", "TAXABLE_INCOME").shown > one.shown);

/* ---- honesty: the one place the source material runs out ---- */

// a household business carries a caveat; a micro enterprise on the same taxes does not
assert.ok(run({ entity: "HOUSEHOLD" }).caveat, "the hộ kinh doanh assumption must be declared");
assert.equal(run({ entity: "ENTERPRISE", scale: "MICRO" }).caveat, null);

/* ---- the six presets all resolve, and they cover every outcome ---- */
const outcomes = PRESETS.map((p) => BOOKS.resolve(p.p));
assert.deepEqual(outcomes.map((r) => r.group), [1, 2, 3, 4, 0, 1]);
assert.deepEqual(outcomes.map((r) => r.fsRequired), [false, true, false, true, true, false]);
assert.deepEqual(outcomes.map((r) => r.regime), ["TT58", "TT58", "TT58", "TT58", "TT99", "TT58"]);

console.log(`ok — 4 groups under Thông tư 58, ${Object.values(BOOKS.GROUPS).filter(x => !x.fs).length} of them file no financial statement` +
            ` · a group 1 customer sees ${one.shown} of ${one.screens.length} screens, a Thông tư 99 customer sees ${run({ scale: "SMALL" }).shown}`);
