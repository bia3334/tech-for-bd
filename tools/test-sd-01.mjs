/* One runnable check for the design-loop maths behind System Design lesson 01:
     node tools/test-sd-01.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "system-design/sim-01.js", "utf8"))();
const { BASE, estimate, sketch, fmtNum, fmtBytes } = globalThis.LOOP;

// the base case: a million users, one in ten makes a link a day, each link read 100 times
const e = estimate(BASE);
assert.equal(e.writesPerDay, 1e5);
assert.ok(Math.abs(e.writeQps - 1.157) < 0.01, "≈1.16 writes/s");
assert.ok(Math.abs(e.readQps - 115.7) < 0.1, "≈116 reads/s");
assert.equal(e.rows, 1e5 * 365 * 5);
assert.equal(e.bytes, e.rows * 500);                  // ≈ 91 GB

// at that size the honest sketch is small, and no box appears without a number behind it
const s = sketch(BASE);
assert.deepEqual(s.boxes, ["Client", "Load balancer", "App servers (stateless)", "Database"]);
assert.equal(s.earned.length, 0);
assert.match(s.hard, /Nothing yet/);

// a hundred times the users: reads become the hard part and the cache earns its place
const big = sketch({ ...BASE, dau: 1e8 });
assert.ok(big.boxes.includes("Cache"));
assert.match(big.hard, /reads/);
assert.ok(big.earned.some(([box]) => box === "Cache"));

// a tight latency target earns the cache even at low traffic
assert.ok(sketch({ ...BASE, p99ms: 50 }).boxes.includes("Cache"));
assert.ok(!sketch({ ...BASE, p99ms: 100 }).boxes.includes("Cache"));

// analytics is a write on the read path — it becomes the hard part over everything else
const an = sketch({ ...BASE, dau: 1e8, analytics: true });
assert.match(an.hard, /clicks/);
assert.ok(an.boxes.includes("Click queue + analytics store"));

// ten years of a big site crosses a terabyte → partitioned storage
const ten = sketch({ ...BASE, dau: 1e8, years: 10 });
assert.ok(ten.est.bytes > 1e12);
assert.ok(ten.boxes.includes("Partitioned storage"));

// every sketch names exactly one hard part and one trade-off
for (const r of [BASE, big, an, ten]) {
  const x = r === BASE ? s : r;
  assert.ok(x.hard && x.tradeoff);
}

// formatting used on screen
assert.equal(fmtNum(1157), "1.2k");
assert.equal(fmtNum(1.157), "1.2");
assert.equal(fmtBytes(91.25e9), "91 GB");
assert.equal(fmtBytes(1.8e12), "1.8 TB");

console.log("ok — design loop: boxes are earned by numbers, one hard part per sketch");
