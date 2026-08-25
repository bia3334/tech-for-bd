/* Regenerate <site>/data/lessons.js from <site>/roadmap.json + the lesson HTML files.
   Run after editing any lesson:
     node tools/build-index.mjs            → Tech for BD (root)
     node tools/build-index.mjs finance    → Finance for Tech                  */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
/* One site per directory. No argument = the root site (Tech for BD). */
const site = process.argv[2] ? root + process.argv[2].replace(/\/?$/, "/") : root;
const rm = JSON.parse(readFileSync(site + "roadmap.json", "utf8"));
/* roadmap.json is either a bare array, or { words, lessons } when the site is not in English. */
const roadmap = Array.isArray(rm) ? rm : rm.lessons;
const W = { lesson: "Lesson", test: "Test yourself", line: "Line worth stealing",
            soon: "not written yet", ...(rm.words || {}) };
const files = readdirSync(site + "lessons").filter(f => f.endsWith(".html"));

const strip = h => h
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, m => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[m]))
  .replace(/\s+/g, " ").trim();

const grab = (h, re) => (h.match(re) || [, ""])[1].trim();
const meta = (h, name) => grab(h, new RegExp(`<meta name="${name}" content="([^"]*)"`, "i"));

const lessons = [], docs = [];

for (const entry of roadmap) {
  const file = files.find(f => f.startsWith(entry.n + "-"));
  if (!file) {
    lessons.push({ ...entry, status: "planned", sections: [] });
    continue;
  }
  const html = readFileSync(site + "lessons/" + file, "utf8");
  const href = "lessons/" + file;
  const title = grab(html, /<h1>([\s\S]*?)<\/h1>/) || grab(html, /<title>([\s\S]*?)<\/title>/);
  const dek = strip(grab(html, /<p class="lede">([\s\S]*?)<\/p>/));
  const facts = [...grab(html, /<div class="facts">([\s\S]*?)<\/div>/).matchAll(/<span>([^<]*)<\/span>/g)].map(m => m[1]);
  const tags = (meta(html, "tfbd:tags") || entry.tags?.join(", ") || "").split(",").map(s => s.trim()).filter(Boolean);
  const terms = [...new Set([...html.matchAll(/data-t="([^"]+)"/g)].map(m => m[1]))];

  const sections = [];
  for (const m of html.matchAll(/<section id="(s\d+)">([\s\S]*?)<\/section>/g)) {
    const [, id, inner] = m;
    const label = strip(grab(inner, /<div class="sec-no">([\s\S]*?)<\/div>/)).replace(/^(\d+)\s*/, "");
    const h2 = strip(grab(inner, /<h2>([\s\S]*?)<\/h2>/));
    const text = strip(inner.replace(/<div class="sec-no">[\s\S]*?<\/div>/, "").replace(/<h2>[\s\S]*?<\/h2>/, ""));
    sections.push({ id, label, h2 });
    docs.push({ id: `${entry.n}#${id}`, type: "section", lesson: entry.n, href: `${href}#${id}`,
                title: h2, subtitle: `${W.lesson} ${entry.n} · ${label}`, text, tags });
  }


  /* the interactive parts live in the page script — pull the literals so they are searchable too */
  const literal = (name) => {
    const i = html.indexOf(`var ${name}=[`);
    if (i < 0) return [];
    const start = html.indexOf("[", i);
    let depth = 0, j = start, q = null;
    for (; j < html.length; j++) {
      const c = html[j], prev = html[j - 1];
      if (q) { if (c === q && prev !== "\\") q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "[") depth++;
      else if (c === "]" && --depth === 0) { j++; break; }
    }
    try { return new Function("return " + html.slice(start, j))(); } catch { return []; }
  };

  literal("QUIZ").forEach((q, i) => docs.push({
    id: `${entry.n}#q${i}`, type: "quiz", lesson: entry.n, href: `${href}#s05`,
    title: q.q, subtitle: `${W.lesson} ${entry.n} · ${W.test}`,
    text: [q.o[q.a], q.why].join(" "), tags, answer: q.o[q.a], why: q.why }));

  literal("PLAY").forEach((sc, i) => {
    const best = sc.o.find(o => o.v === "strong") || sc.o[0];
    docs.push({ id: `${entry.n}#p${i}`, type: "scene", lesson: entry.n, href: `${href}#s06`,
      title: sc.line, subtitle: sc.role, text: [best.t, best.f].join(" "), tags,
      answer: best.t, why: best.f });
  });

  [...html.matchAll(/<li><div><div class="say">([\s\S]*?)<\/div><div class="use">([\s\S]*?)<\/div>/g)]
    .forEach((m, i) => docs.push({
      id: `${entry.n}#l${i}`, type: "line", lesson: entry.n, href: `${href}#s07`,
      title: strip(m[1]), subtitle: `${W.lesson} ${entry.n} · ${W.line}`,
      text: strip(m[2]), tags, why: strip(m[2]) }));

  const lesson = { n: entry.n, href, title: strip(title), dek, minutes: facts[0] || entry.minutes || "",
                   facts, level: meta(html, "tfbd:level") || entry.level || "", tags, terms,
                   status: "published", sections };
  lessons.push(lesson);
  docs.push({ id: entry.n, type: "lesson", lesson: entry.n, href, title: lesson.title,
              subtitle: `${W.lesson} ${entry.n} · ${lesson.level}`,
              text: [dek, ...sections.map(s => s.h2 + " " + s.label)].join(" "), tags });
}

for (const l of lessons.filter(l => l.status === "planned")) {
  docs.push({ id: l.n, type: "planned", lesson: l.n, href: "", title: l.title,
              subtitle: `${W.lesson} ${l.n} · ${W.soon}`, text: l.dek, tags: l.tags || [] });
}

const out = `/* GENERATED by tools/build-index.mjs — do not edit by hand. */\nwindow.LIB = ${JSON.stringify({ lessons, docs }, null, 1)};\n`;
writeFileSync(site + "data/lessons.js", out);
console.log(`${process.argv[2] || "."}/data/lessons.js — ${lessons.length} lessons, ${docs.length} docs, ${(out.length / 1024).toFixed(1)} KB`);
