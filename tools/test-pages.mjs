/* Soi mọi trang bài học của cả hai site — thứ mà node chạy được mà không cần trình duyệt:
     node tools/test-pages.mjs
   Bắt được: script trong trang sai cú pháp, getElementById trỏ vào id không tồn tại,
   data-t trỏ vào từ không có trong từ điển, và thẻ section/div lệch nhau.                */
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

    // script trong trang phải biên dịch được
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => new Function(m[1]), `${where}: script sai cú pháp`);
    }

    // mọi id được gọi trong script đều phải tồn tại trong markup
    const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    for (const m of html.matchAll(/getElementById\("([^"]+)"\)/g)) {
      assert.ok(declared.has(m[1]), `${where}: getElementById("${m[1]}") không có phần tử nào mang id đó`);
    }

    // mọi từ bấm được đều phải có trong từ điển
    for (const m of html.matchAll(/data-t="([^"]+)"/g)) {
      assert.ok(terms[m[1]], `${where}: data-t="${m[1]}" không có trong glossary.js`);
    }

    // thẻ khối phải cân
    const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
    for (const tag of ["section", "div", "ul", "ol", "li"]) {
      const open = (body.match(new RegExp(`<${tag}[\\s>]`, "g")) || []).length;
      const close = (body.match(new RegExp(`</${tag}>`, "g")) || []).length;
      assert.equal(open, close, `${where}: <${tag}> mở ${open} lần, đóng ${close} lần`);
    }
  }
}
console.log(`ok — ${pages} trang, script biên dịch được, id và data-t đều khớp`);
