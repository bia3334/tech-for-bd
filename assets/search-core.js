/* Search core — no DOM in here, so tools/test-search.mjs can run it in node. */
(function (root) {
"use strict";
var MiniSearch = root.MiniSearch || (typeof require === "function" && require("./minisearch.min.js"));

var LIB = window.LIB, TERMS = window.TERMS;

/* Length-preserving diacritic fold, so "tien" finds "tiền" and the
   highlighter can still map matches back onto the original characters. */
function fold(s) {
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s[i].normalize("NFD")[0] || s[i];
    out += c === "đ" || c === "Đ" ? "d" : c;
  }
  return out.toLowerCase();
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

var LABEL = { lesson: "Lesson", section: "Section", term: "Glossary",
              quiz: "Question", line: "Line to steal", scene: "Objection",
              planned: "Coming" };
var ORDER = ["lesson", "term", "line", "scene", "section", "quiz", "planned"];

/* ---------- documents ---------- */
var docs = LIB.docs.map(function (d) {
  return { id: d.id, type: d.type, title: d.title, subtitle: d.subtitle,
           text: d.text, tags: (d.tags || []).join(" "), href: d.href,
           why: d.why, answer: d.answer, lesson: d.lesson };
});
Object.keys(TERMS).forEach(function (k) {
  var t = TERMS[k];
  docs.push({ id: "t-" + k, type: "term", title: t.w, subtitle: "Glossary · plain English + Tiếng Việt",
              text: [t.p, t.v, t.r || ""].join(" "), tags: "glossary term định nghĩa",
              term: k, lesson: t.l || "01" });
});
var byId = {};
docs.forEach(function (d) { byId[d.id] = d; });

var mini = new MiniSearch({
  fields: ["title", "subtitle", "text", "tags"],
  storeFields: ["id"],
  processTerm: function (t) { return fold(t); },
  tokenize: function (s) { return s.split(/[\n\r\p{Z}\p{P}]+/u).filter(Boolean); }
});
mini.addAll(docs);

/* ---------- highlighting ---------- */
function ranges(text, toks) {
  var f = fold(text), r = [];
  toks.forEach(function (t) {
    for (var i = f.indexOf(t); i > -1; i = f.indexOf(t, i + t.length)) r.push([i, i + t.length]);
  });
  r.sort(function (a, b) { return a[0] - b[0]; });
  var m = [];
  r.forEach(function (x) {
    var last = m[m.length - 1];
    if (last && x[0] <= last[1]) last[1] = Math.max(last[1], x[1]);
    else m.push([x[0], x[1]]);
  });
  return m;
}
function hl(text, toks) {
  if (!toks.length) return esc(text);
  var m = ranges(text, toks);
  if (!m.length) return esc(text);
  var out = "", p = 0;
  m.forEach(function (x) {
    out += esc(text.slice(p, x[0])) + "<mark>" + esc(text.slice(x[0], x[1])) + "</mark>";
    p = x[1];
  });
  return out + esc(text.slice(p));
}
function snip(text, toks, len) {
  len = len || 230;
  var m = toks.length ? ranges(text, toks) : [];
  var at = m.length ? m[0][0] : 0;
  var start = at > 90 ? at - 70 : 0;
  if (start) { var sp = text.indexOf(" ", start); if (sp > -1 && sp < start + 30) start = sp + 1; }
  var cut = text.slice(start, start + len);
  return (start ? "… " : "") + cut + (start + len < text.length ? " …" : "");
}


root.TFBD = { fold: fold, esc: esc, hl: hl, snip: snip, ranges: ranges,
              docs: docs, byId: byId, mini: mini, LABEL: LABEL, ORDER: ORDER,
              search: function (qs) {
                var found = mini.search(qs, { boost: { title: 4, tags: 2.5, subtitle: 1.5 }, prefix: true, fuzzy: 0.2, combineWith: "AND" });
                if (!found.length) found = mini.search(qs, { boost: { title: 4 }, prefix: true, fuzzy: 0.3, combineWith: "OR" });
                return found.map(function (r) { return byId[r.id]; }).filter(Boolean);
              },
              tokens: function (qs) { return qs.split(/[\n\r\p{Z}\p{P}]+/u).filter(Boolean).map(fold); } };
})(typeof window !== "undefined" ? window : globalThis);
