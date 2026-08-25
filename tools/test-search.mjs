/* One runnable check for the search core, per site:
     node tools/test-search.mjs            → Tech for BD (root)
     node tools/test-search.mjs finance    → Finance for Tech                    */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
const name = process.argv[2] || ".";
const site = name === "." ? root : root + name.replace(/\/?$/, "/");
globalThis.window = globalThis;
globalThis.MiniSearch = require(root + "assets/minisearch.min.js");
new Function(readFileSync(site + "glossary.js", "utf8"))();
new Function(readFileSync(site + "data/lessons.js", "utf8"))();
new Function(readFileSync(root + "assets/search-core.js", "utf8"))();
const C = globalThis.TFBD;

const ids = q => C.search(q).map(d => d.id);
const has = (q, id) => assert.ok(ids(q).includes(id), `"${q}" should find ${id} — got ${ids(q).slice(0, 5)}`);

/* What each site expects to be findable. One row per kind of document. */
const CASES = {
  ".": {
    find: [
      ["ttl", "t-ttl"],                       // exact term
      ["cach", "t-cache"],                    // prefix
      ["cahce", "t-cache"],                   // typo → fuzzy
      ["idempotency", "t-idem"],
      ["double tap", "t-idem"],               // phrase only in the "in the room" note
      ["tapping Transfer twice", "01#l3"],    // the line worth stealing
      ["Head of Risk", "01#p2"],              // roleplay scene
      ["8pm", "01"],                          // the lesson itself
      ["Nghị định 13", "04"],                 // Vietnamese with diacritics
      ["nghi dinh", "04"],                    // …and without
      ["chuyển tiền", "t-idem"],              // Vietnamese-only body text
      ["chuyen tien", "t-idem"],
      ["queue", "06"]                         // a planned lesson is still findable
    ],
    top: [["TTL time to live", "t-ttl"]]
  },
  finance: {
    find: [
      ["dso", "t-dso"],                       // exact term
      ["dòng tiền", "t-dongtien"],            // with diacritics
      ["dong tien", "t-dongtien"],            // …and without
      ["khoản phải thu", "t-phaithu"],
      ["chiet khau hoa don", "t-chietkhau"],
      ["cash_flow_metrics", "t-ccc"],         // only in the "in the code" note
      ["ba mươi lăm", "01"],                  // the lesson itself
      ["runway_days", "01#q3"],               // a quiz question
      ["Kế toán trưởng", "01#p1"],            // roleplay scene
      ["null", "01#l2"],                      // the question worth asking
      ["Án lệ", "05"],                        // a planned lesson
      ["an le", "05"]
    ],
    top: [["CCC chu kỳ chuyển đổi tiền mặt", "t-ccc"]]
  }
};
const expect = CASES[name.replace(/\/$/, "")];
assert.ok(expect, "no test cases for site " + name);

// every document is searchable at all
assert.ok(C.docs.length > 30, "index too small: " + C.docs.length);
C.docs.forEach(d => assert.ok(d.title && d.text, "empty doc " + d.id));

expect.find.forEach(([q, id]) => has(q, id));
expect.top.forEach(([q, id]) => assert.equal(C.search(q)[0].id, id, `"${q}" should rank ${id} first`));

// highlighting escapes HTML and survives missing diacritics
const toks = C.tokens("nghi dinh");
assert.match(C.hl("Nghị định 13/2023", toks), /<mark>Nghị<\/mark> <mark>định<\/mark>/);
assert.equal(C.hl('<img src=x onerror=1>', []), "&lt;img src=x onerror=1&gt;");
assert.ok(!C.hl('<b>hi</b>', C.tokens("hi")).includes("<b>"), "must escape tags it did not add");

// snippet centres on the match instead of always starting at 0
const long = "x".repeat(300) + " needle " + "y".repeat(300);
assert.ok(C.snip(long, C.tokens("needle")).includes("needle"));
assert.ok(C.snip(long, C.tokens("needle")).startsWith("…"));

console.log(`ok ${name} — ${C.docs.length} documents, ${Object.keys(globalThis.TERMS).length} glossary terms`);
