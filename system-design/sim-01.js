/* The design loop run on a URL shortener — the arithmetic behind lesson 01. No DOM in
   here, so tools/test-sd-01.mjs can run it in node.

   The point of the sim is not the numbers, it is which boxes the numbers *earn*. A box
   with no number behind it is decoration; the sketch() below refuses to draw one.     */
(function (root) {
"use strict";

var DAY = 86400;
var ROW_BYTES = 500;          /* short key + long URL + owner + two timestamps, generously */
var PEAK = 3;                 /* rule of thumb: peak traffic ≈ 3 × the daily average       */

/* the requirements a design session starts from — every knob is a question you asked */
var BASE = { dau: 1e6, writesPerUser: 0.1, readRatio: 100, years: 5, p99ms: 100, analytics: false };

function estimate(r) {
  var writesPerDay = r.dau * r.writesPerUser;
  var writeQps = writesPerDay / DAY;
  var readQps = writeQps * r.readRatio;
  var rows = writesPerDay * 365 * r.years;
  return { writesPerDay: writesPerDay, writeQps: writeQps, readQps: readQps,
           peakReadQps: readQps * PEAK, rows: rows, bytes: rows * ROW_BYTES };
}

/* which boxes the numbers justify, and the ONE thing that is the hard part.
   Thresholds are round numbers on purpose — an estimate is only ever good to a factor
   of two or three, so a threshold with more digits would be pretending.              */
function sketch(r) {
  var e = estimate(r);
  var boxes = ["Client", "Load balancer", "App servers (stateless)", "Database"];
  var earned = [];             /* [box, the number that earned it] */

  if (e.peakReadQps > 1000 || r.p99ms <= 50) {
    boxes.splice(3, 0, "Cache");
    earned.push(["Cache", e.peakReadQps > 1000
      ? Math.round(e.peakReadQps) + " reads/s at peak is more than one database should answer alone"
      : "a p99 of " + r.p99ms + " ms leaves no room for a disk read on the redirect path"]);
  }
  if (e.writeQps > 50) {
    boxes.push("Key generation service");
    earned.push(["Key generation service", Math.round(e.writeQps) + " new links/s — generating and checking uniqueness inside the write transaction starts to collide"]);
  }
  if (e.bytes > 1e12) {
    boxes.push("Partitioned storage");
    earned.push(["Partitioned storage", fmtBytes(e.bytes) + " over " + r.years + " years will not sit comfortably on one machine"]);
  }
  if (r.analytics) {
    boxes.push("Click queue + analytics store");
    earned.push(["Click queue + analytics store", "counting every click synchronously would put a write on the hottest read path in the system"]);
  }

  var hard, tradeoff;
  if (r.analytics) {
    hard = "Counting clicks without slowing the redirect";
    tradeoff = "Counts arrive seconds late and may be off by a few during an outage — in exchange the redirect never waits for a write.";
  } else if (e.peakReadQps > 1000) {
    hard = "The redirect path — reads";
    tradeoff = "A cache answers most redirects, so an edited or deleted link can keep resolving until its entry expires. Pick the TTL knowing that.";
  } else if (e.bytes > 1e12) {
    hard = "Storage growth";
    tradeoff = "Partitioning by short key spreads the data, and makes 'all links owned by user X' a scatter query. Decide which query matters more.";
  } else if (e.writeQps > 50) {
    hard = "Unique keys under concurrent writes";
    tradeoff = "Pre-generating keys removes the collision check from the write path, at the cost of a service that can itself run out or go down.";
  } else {
    hard = "Nothing yet — one app server and one database is the honest answer";
    tradeoff = "Every box you add now is a bet on traffic you have not seen. Keep the diagram small and write down when each box would earn its place.";
  }
  return { est: e, boxes: boxes, earned: earned, hard: hard, tradeoff: tradeoff };
}

function fmtNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1);
}
function fmtBytes(b) {
  if (b >= 1e15) return (b / 1e15).toFixed(1) + " PB";
  if (b >= 1e12) return (b / 1e12).toFixed(1) + " TB";
  if (b >= 1e9) return (b / 1e9).toFixed(0) + " GB";
  return (b / 1e6).toFixed(0) + " MB";
}

root.LOOP = { BASE: BASE, ROW_BYTES: ROW_BYTES, PEAK: PEAK, estimate: estimate, sketch: sketch,
              fmtNum: fmtNum, fmtBytes: fmtBytes };
})(typeof window !== "undefined" ? window : globalThis);
