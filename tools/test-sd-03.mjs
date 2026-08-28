/* One runnable check for the estimation maths behind System Design lesson 03:
     node tools/test-sd-03.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "system-design/sim-03.js", "utf8"))();
const { PRESETS, LIMITS, estimate, fmtNum, fmtBytes, fmtBps } = globalThis.ESTIMATE;
const near = (a, b, rel = 0.01) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} ≉ ${b}`);

// the shortener from lesson 01 fits on one machine on every axis
const s = estimate(PRESETS.shortener);
near(s.writeQps, 1.157);
near(s.readQps, 115.7);
assert.equal(s.hard, "none");
assert.match(s.hardText, /one machine/);

// a photo app: the QPS is easy, the bytes are not — 40 TB a day makes storage the hard part
const p = estimate(PRESETS.photos);
near(p.writesPerDay, 2e7);
near(p.bytesPerDay, 4e13);
assert.equal(p.hard, "storage");
assert.ok(p.egressBps > LIMITS.egressBps, "…and the door is also too small, just less so");
assert.ok(p.ratios.find(r => r.dim === "storage").ratio > p.ratios.find(r => r.dim === "bandwidth").ratio);

// chat: tiny messages, so bytes are modest — it is the write rate that hurts
const c = estimate(PRESETS.chat);
assert.equal(c.hard, "writes");
const cr = Object.fromEntries(c.ratios.map(r => [r.dim, r.ratio]));
assert.ok(cr.storage < cr.writes / 5, "storage crosses the line too (200M tiny rows a day add up) but writes are the hard part by a wide margin");

// sensors reporting every ten seconds: a write-only system
const io = estimate(PRESETS.sensors);
assert.equal(io.hard, "writes");
assert.ok(io.readQps < 2);

// the working is written down, one line per derived number, and the totals agree with it
assert.equal(s.working.length, 8);
assert.ok(s.working.every(([k, v]) => k && v.includes("=") || v.includes("≈")));
near(s.bytesTotal, s.bytesPerYear * PRESETS.shortener.years);

// per-day to per-second is "divide by about a hundred thousand"
near(estimate({ ...PRESETS.shortener, dau: 864000, writes: 100 }).writeQps, 1000);

// units on screen: bits are not bytes
assert.equal(fmtBps(1e9), "1 Gbps");
assert.equal(fmtBytes(125e6), "125 MB");
assert.equal(fmtNum(0.1), "0.1");
assert.equal(fmtNum(2.3e7), "23M");

console.log("ok — estimation: four numbers, one hard part, the working written down");
