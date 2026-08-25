/* One runnable check for the search core:  node tools/test-search.mjs        */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
globalThis.window = globalThis;
globalThis.MiniSearch = require(root + "assets/minisearch.min.js");
new Function(readFileSync(root + "assets/glossary.js", "utf8"))();
new Function(readFileSync(root + "data/lessons.js", "utf8"))();
new Function(readFileSync(root + "assets/search-core.js", "utf8"))();
const C = globalThis.TFBD;

const ids = q => C.search(q).map(d => d.id);
const has = (q, id) => assert.ok(ids(q).includes(id), `"${q}" should find ${id} — got ${ids(q).slice(0, 5)}`);

// every document is searchable at all
assert.ok(C.docs.length > 30, "index too small: " + C.docs.length);
C.docs.forEach(d => assert.ok(d.title && d.text, "empty doc " + d.id));

has("ttl", "t-ttl");                    // exact term
has("cach", "t-cache");                 // prefix
has("cahce", "t-cache");                // typo → fuzzy
has("idempotency", "t-idem");
has("double tap", "t-idem");            // phrase only in the "in the room" note
has("tapping Transfer twice", "01#l3");  // the line worth stealing
has("Head of Risk", "01#p2");           // roleplay scene
has("8pm", "01");                       // the lesson itself
has("Nghị định 13", "04");              // Vietnamese with diacritics
has("nghi dinh", "04");                 // …and without
has("chuyển tiền", "t-idem");           // Vietnamese-only body text
has("chuyen tien", "t-idem");
has("queue", "06");                     // a planned lesson is still findable

// ranking: searching a term's own word puts the term at the top
assert.equal(C.search("TTL time to live")[0].id, "t-ttl");

// highlighting escapes HTML and survives missing diacritics
const toks = C.tokens("nghi dinh");
assert.match(C.hl("Nghị định 13/2023", toks), /<mark>Nghị<\/mark> <mark>định<\/mark>/);
assert.equal(C.hl('<img src=x onerror=1>', []), "&lt;img src=x onerror=1&gt;");
assert.ok(!C.hl('<b>hi</b>', C.tokens("hi")).includes("<b>"), "must escape tags it did not add");

// snippet centres on the match instead of always starting at 0
const long = "x".repeat(300) + " needle " + "y".repeat(300);
assert.ok(C.snip(long, C.tokens("needle")).includes("needle"));
assert.ok(C.snip(long, C.tokens("needle")).startsWith("…"));

console.log(`ok — ${C.docs.length} documents, ${Object.keys(globalThis.TERMS).length} glossary terms`);
