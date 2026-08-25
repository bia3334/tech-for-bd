/* Lint every page of both sites — the part node can check without a browser:
     node tools/test-pages.mjs
   Catches: a syntax error in an inline script, getElementById pointing at an id that
   does not exist, data-t pointing at a term that is not in the glossary, unbalanced tags. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const sites = [".", "finance"];
let pages = 0;

for (const name of sites) {
  const dir = name === "." ? root : root + name + "/";
  globalThis.window = {};
  new Function(readFileSync(dir + "glossary.js", "utf8")).call(globalThis);
  const terms = globalThis.window.TERMS;

  for (const file of [...readdirSync(dir + "lessons").filter(f => f.endsWith(".html")), "index.html"]) {
    const path = file === "index.html" ? dir + file : dir + "lessons/" + file;
    if (!existsSync(path)) continue;
    const html = readFileSync(path, "utf8");
    const where = name + "/" + file;
    pages++;

    // every inline script must at least compile
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => new Function(m[1]), `${where}: script has a script that will not compile`);
    }

    // every id the script reaches for must exist in the markup
    const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    for (const m of html.matchAll(/getElementById\("([^"]+)"\)/g)) {
      assert.ok(declared.has(m[1]), `${where}: getElementById("${m[1]}") matches no element`);
    }

    // every tappable term must be in the glossary
    for (const m of html.matchAll(/data-t="([^"]+)"/g)) {
      assert.ok(terms[m[1]], `${where}: data-t="${m[1]}" is not in glossary.js`);
    }

    // block tags must balance
    const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
    for (const tag of ["section", "div", "ul", "ol", "li"]) {
      const open = (body.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length;
      const close = (body.match(new RegExp(`</${tag}>`, "g")) || []).length;
      assert.equal(open, close, `${where}: <${tag}> opened ${open} times, closed ${close}`);
    }
  }
}
console.log(`ok — ${pages} pages, scripts compile, ids and data-t all resolve`);
