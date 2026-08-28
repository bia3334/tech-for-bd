/* Back-of-the-envelope estimation — the arithmetic behind lesson 03. No DOM in here,
   so tools/test-sd-03.mjs can run it in node.

   Four numbers come out of any set of inputs: reads a second, writes a second, bytes a
   year, bits a second out of the door. Each is compared to what one well-run machine or
   one network link can do; the one furthest past its limit is the hard part.          */
(function (root) {
"use strict";

var DAY = 86400, PEAK = 3, HOT = 0.2;          /* seconds; peak ≈ 3× average; 20% of items take 80% of reads */

/* what one box, or one link, can be asked to do — round on purpose, good to a factor of three */
var LIMITS = { readQps: 5000, writeQps: 500, bytesPerYear: 10e12, egressBps: 1e9 };

var PRESETS = {
  shortener: { dau: 1e6, writes: 0.1, reads: 10,   wbytes: 500, rbytes: 500, years: 5 },
  photos:    { dau: 1e7, writes: 2,   reads: 50,   wbytes: 2e6, rbytes: 2e5, years: 5 },
  chat:      { dau: 5e6, writes: 40,  reads: 100,  wbytes: 200, rbytes: 200, years: 2 },
  sensors:   { dau: 1e5, writes: 8640, reads: 1,   wbytes: 100, rbytes: 1e4, years: 1 }
};

function estimate(r) {
  var writesPerDay = r.dau * r.writes, readsPerDay = r.dau * r.reads;
  var writeQps = writesPerDay / DAY, readQps = readsPerDay / DAY;
  var bytesPerDay = writesPerDay * r.wbytes, bytesPerYear = bytesPerDay * 365;
  var e = {
    writesPerDay: writesPerDay, readsPerDay: readsPerDay,
    writeQps: writeQps, writePeak: writeQps * PEAK,
    readQps: readQps, readPeak: readQps * PEAK,
    bytesPerDay: bytesPerDay, bytesPerYear: bytesPerYear, bytesTotal: bytesPerYear * r.years,
    ingressBps: writeQps * PEAK * r.wbytes * 8, egressBps: readQps * PEAK * r.rbytes * 8,
    hotBytes: HOT * writesPerDay * r.wbytes
  };
  e.ratios = [
    { dim: "reads",     ratio: e.readPeak / LIMITS.readQps,        limit: LIMITS.readQps + " reads/s on one machine" },
    { dim: "writes",    ratio: e.writePeak / LIMITS.writeQps,      limit: LIMITS.writeQps + " writes/s on one machine" },
    { dim: "storage",   ratio: e.bytesPerYear / LIMITS.bytesPerYear, limit: "10 TB a year on one machine" },
    { dim: "bandwidth", ratio: e.egressBps / LIMITS.egressBps,     limit: "1 Gbps out of one link" }
  ];
  var worst = e.ratios.reduce(function (a, b) { return b.ratio > a.ratio ? b : a; });
  e.hard = worst.ratio >= 1 ? worst.dim : "none";
  e.hardText = worst.ratio >= 1
    ? ({ reads: "Reads — the path that serves", writes: "Writes — the path that stores",
         storage: "Storage — bytes that never stop arriving", bandwidth: "Bandwidth — bytes leaving the building" })[worst.dim]
      + ", at " + worst.ratio.toFixed(worst.ratio < 10 ? 1 : 0) + "× what " + worst.limit + " can do"
    : "None yet — every number fits on one machine. Write down the input at which that stops being true.";

  /* the working, line by line — an estimate without its inputs written down is a rumour */
  e.working = [
    ["Writes a day",   fmtNum(r.dau) + " users × " + fmtNum(r.writes) + " writes = " + fmtNum(writesPerDay)],
    ["Writes a second", fmtNum(writesPerDay) + " ÷ 86,400 ≈ " + fmtNum(writeQps) + " · peak ×3 ≈ " + fmtNum(e.writePeak)],
    ["Reads a day",    fmtNum(r.dau) + " users × " + fmtNum(r.reads) + " reads = " + fmtNum(readsPerDay)],
    ["Reads a second", fmtNum(readsPerDay) + " ÷ 86,400 ≈ " + fmtNum(readQps) + " · peak ×3 ≈ " + fmtNum(e.readPeak)],
    ["Storage a year", fmtNum(writesPerDay) + " × " + fmtBytes(r.wbytes) + " × 365 = " + fmtBytes(bytesPerYear)],
    ["Storage kept",   fmtBytes(bytesPerYear) + " × " + r.years + (r.years === 1 ? " year = " : " years = ") + fmtBytes(e.bytesTotal)],
    ["Out of the door at peak", fmtNum(e.readPeak) + " × " + fmtBytes(r.rbytes) + " × 8 bits = " + fmtBps(e.egressBps)],
    ["Hot set to cache", "20% of a day's items × " + fmtBytes(r.wbytes) + " = " + fmtBytes(e.hotBytes)]
  ];
  return e;
}

function fmtNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  if (n >= 10) return String(Math.round(n));
  return n >= 1 ? n.toFixed(1).replace(/\.0$/, "") : n.toFixed(2).replace(/0$/, "");
}
function fmtBytes(b) {
  if (b >= 1e15) return (b / 1e15).toFixed(1).replace(/\.0$/, "") + " PB";
  if (b >= 1e12) return (b / 1e12).toFixed(1).replace(/\.0$/, "") + " TB";
  if (b >= 1e9) return (b / 1e9).toFixed(0) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(0) + " MB";
  if (b >= 1e3) return (b / 1e3).toFixed(0) + " KB";
  return Math.round(b) + " B";
}
function fmtBps(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(1).replace(/\.0$/, "") + " Gbps";
  if (b >= 1e6) return (b / 1e6).toFixed(0) + " Mbps";
  return (b / 1e3).toFixed(0) + " kbps";
}

root.ESTIMATE = { DAY: DAY, PEAK: PEAK, HOT: HOT, LIMITS: LIMITS, PRESETS: PRESETS, estimate: estimate,
                  fmtNum: fmtNum, fmtBytes: fmtBytes, fmtBps: fmtBps };
})(typeof window !== "undefined" ? window : globalThis);
