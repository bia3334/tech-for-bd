/* Library UI. Search itself lives in search-core.js. */
(function () {
"use strict";
var LIB = window.LIB, TERMS = window.TERMS, C = window.TFBD;
var fold = C.fold, esc = C.esc, hl = C.hl, snip = C.snip;
var docs = C.docs, byId = C.byId, LABEL = C.LABEL, ORDER = C.ORDER;
var PLURAL = { lesson: "Lessons", section: "Sections", term: "Glossary",
               quiz: "Questions", line: "Lines to steal", scene: "Objections",
               planned: "Coming up" };

/* ---------- browse ---------- */
function progress(n) {
  try {
    var raw = localStorage.getItem("tfbd-l" + parseInt(n, 10));
    if (!raw) return 0;
    var o = JSON.parse(raw);
    return ["sim", "quiz", "play"].filter(function (k) { return o[k]; }).length;
  } catch (e) { return 0; }
}
function tagHtml(tags) {
  return (tags || []).map(function (t) {
    return '<span class="tag" data-tag="' + esc(t) + '">' + esc(t) + "</span>";
  }).join("");
}
(function renderLessons() {
  var box = document.getElementById("lessons"), out = "";
  LIB.lessons.forEach(function (l) {
    var live = l.status === "published";
    var done = live ? progress(l.n) : 0;
    var dots = live ? '<span class="dots">' + [0, 1, 2].map(function (i) {
      return '<i class="dot' + (i < done ? " on" : "") + '"></i>';
    }).join("") + "</span>" : '<span class="dots mono">soon</span>';
    out += (live ? '<a class="card" href="' + esc(l.href) + '">' : '<div class="card planned">') +
      '<div class="card-n"><span>' + esc(l.n) + "</span>" +
        (l.level ? '<span class="lv">' + esc(l.level) + "</span>" : "") + "</div>" +
      "<h3>" + esc(l.title) + "</h3><p>" + esc(l.dek || "") + "</p>" +
      '<div class="card-f"><span>' + esc(l.minutes || "") + "</span>" + dots + "</div>" +
      '<div class="tags">' + tagHtml(l.tags) + "</div>" +
      (live ? "</a>" : "</div>");
  });
  box.innerHTML = out;
  var live = LIB.lessons.filter(function (l) { return l.status === "published"; }).length;
  document.getElementById("lcount").textContent = live + " of " + LIB.lessons.length + " written";
  document.getElementById("cnt").textContent = live + (live === 1 ? " lesson · " : " lessons · ") + Object.keys(TERMS).length + " terms · " + docs.length + " entries";
})();

function defHtml(t, toks) {
  toks = toks || [];
  return '<div class="def"><div class="w">' + hl(t.w, toks) + "</div>" +
    '<div class="p">' + hl(t.p, toks) + "</div>" +
    '<div class="v">' + hl(t.v, toks) + "</div>" +
    (t.r ? '<div class="r"><i>In the room</i>' + hl(t.r, toks) + "</div>" : "") + "</div>";
}
(function renderGloss() {
  var box = document.getElementById("gloss"), slot = document.getElementById("gdef");
  box.innerHTML = Object.keys(TERMS).map(function (k) {
    return '<button class="gchip" type="button" data-term="' + k + '">' + esc(TERMS[k].w.split(" (")[0]) + "</button>";
  }).join("");
  box.addEventListener("click", function (e) {
    var b = e.target.closest("[data-term]"); if (!b) return;
    var open = slot.dataset.k === b.dataset.term;
    slot.innerHTML = open ? "" : defHtml(TERMS[b.dataset.term]);
    slot.dataset.k = open ? "" : b.dataset.term;
    if (!open) slot.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
})();

/* ---------- filters ---------- */
var filter = "all";
var chipBox = document.getElementById("chips");
function renderChips(counts) {
  var types = ORDER.filter(function (t) { return counts[t]; });
  var total = Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0);
  chipBox.innerHTML = ['<button class="chip" type="button" data-f="all" aria-pressed="' + (filter === "all") +
      '">Everything<span class="n">' + total + "</span></button>"]
    .concat(types.map(function (t) {
      return '<button class="chip" type="button" data-f="' + t + '" aria-pressed="' + (filter === t) + '">' +
        PLURAL[t] + '<span class="n">' + counts[t] + "</span></button>";
    })).join("");
}
chipBox.addEventListener("click", function (e) {
  var b = e.target.closest("[data-f]"); if (!b) return;
  filter = b.dataset.f === filter ? "all" : b.dataset.f;
  run();
});

/* ---------- results ---------- */
var input = document.getElementById("q"), clr = document.getElementById("clr");
var results = document.getElementById("results"), browse = document.getElementById("browse");
var hitsBox = document.getElementById("hits"), noneBox = document.getElementById("none"), rmeta = document.getElementById("rmeta");
var sel = -1, current = [];

function hitHtml(d, toks, i) {
  var body = d.type === "term"
    ? '<p class="hit-x">' + hl(TERMS[d.term].p, toks) + '<span class="vi">' + hl(TERMS[d.term].v, toks) + "</span></p>"
    : '<p class="hit-x">' + hl(snip(d.answer ? d.answer + " — " + (d.why || "") : d.text, toks), toks) + "</p>";
  var tag = d.href ? "a" : "button";
  return "<" + tag + ' class="hit" data-i="' + i + '" data-id="' + esc(d.id) + '"' +
      (d.href ? ' href="' + esc(d.href) + '"' : ' type="button"') + ">" +
    '<div class="hit-h"><span class="kind ' + d.type + '">' + LABEL[d.type] + "</span>" +
      '<span class="hit-t">' + hl(d.title, toks) + "</span></div>" +
    '<div class="hit-s">' + hl(d.subtitle || "", toks) + "</div>" + body +
    "</" + tag + ">";
}

function run() {
  var qs = input.value.trim();
  clr.style.display = qs ? "block" : "none";
  if (!qs) {
    results.hidden = true; browse.hidden = false; chipBox.innerHTML = ""; sel = -1;
    document.body.classList.remove("searching");
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    return;
  }
  try { history.replaceState(null, "", "?q=" + encodeURIComponent(qs)); } catch (e) {}
  var all = C.search(qs);
  var counts = {};
  all.forEach(function (d) { counts[d.type] = (counts[d.type] || 0) + 1; });
  renderChips(counts);
  current = filter === "all" ? all : all.filter(function (d) { return d.type === filter; });

  var toks = C.tokens(qs);
  browse.hidden = true; results.hidden = false; sel = -1;
  document.body.classList.add("searching");
  rmeta.textContent = current.length + (current.length === 1 ? " result" : " results") + " for “" + qs + "”";
  hitsBox.innerHTML = current.map(function (d, i) { return hitHtml(d, toks, i); }).join("");
  hitsBox.hidden = !current.length;
  noneBox.hidden = !!current.length;
  if (!current.length) {
    noneBox.innerHTML = "<b>Nothing matches that yet.</b>Only lesson 01 is written, so most of the library is still ahead. " +
      "Try a plainer word — <em>cache</em>, <em>core</em>, <em>OTP</em>, <em>rủi ro</em> — or clear the search and browse what exists.";
  }
}

hitsBox.addEventListener("click", function (e) {
  var h = e.target.closest(".hit"); if (!h || h.tagName === "A") return;
  var d = byId[h.dataset.id];
  if (d && d.type === "term") {
    var open = h.nextElementSibling && h.nextElementSibling.classList.contains("def");
    if (open) h.nextElementSibling.remove();
    else h.insertAdjacentHTML("afterend", defHtml(TERMS[d.term]));
  }
});
document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-tag]"); if (!t) return;
  e.preventDefault();
  input.value = t.dataset.tag; filter = "all"; run(); input.focus();
});

var timer;
input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 90); });
clr.addEventListener("click", function () { input.value = ""; filter = "all"; run(); input.focus(); });

/* keyboard: / focuses, ↑↓ walks results, Enter opens, Esc clears */
document.addEventListener("keydown", function (e) {
  if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); input.select(); return; }
  if (e.key === "Escape" && (document.activeElement === input || sel > -1)) { input.value = ""; filter = "all"; run(); return; }
  if (results.hidden || !current.length) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && !(e.key === "Enter" && sel > -1)) return;
  e.preventDefault();
  var nodes = hitsBox.querySelectorAll(".hit");
  if (e.key === "Enter") { nodes[sel].click(); return; }
  if (sel > -1) nodes[sel].classList.remove("sel");
  sel = (sel + (e.key === "ArrowDown" ? 1 : nodes.length - 1)) % nodes.length;
  nodes[sel].classList.add("sel");
  nodes[sel].scrollIntoView({ block: "nearest" });
});

var q0 = new URLSearchParams(location.search).get("q");
if (q0) { input.value = q0; run(); }
})();
