/* One runnable check for the request-trace maths behind System Design lesson 02:
     node tools/test-sd-02.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "system-design/sim-02.js", "utf8"))();
const { BASE, RTT, QUERY, trace } = globalThis.TRACE;
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// a warm connection, one indexed query, same region: one trip across the WAN plus a few ms inside
const base = trace(BASE);
near(base.total, 30 + 0.5 + 3 + 2.5);
assert.equal(base.hops.length, 4);
assert.equal(base.top2[0].kind, "wan");
assert.match(base.advice, /Nothing to fix/);

// a cold connection across an ocean: three handshakes before the request moves, and the two biggest hops are most of it
const cold = trace({ ...BASE, distance: "continent", warm: false });
near(cold.total, 20 + 150 + 150 + 150 + 0.5 + 3 + 2.5);
assert.ok(cold.share > 0.6, "top two hops carry most of the time");
assert.match(cold.advice, /Keep connections alive/);

// N+1: fifty indexed queries one after another beat the whole network hop
const n1 = trace({ ...BASE, queries: 50 });
near(n1.hops[3].ms, 50 * 2.5);
assert.equal(n1.top2[0].kind, "db");
assert.match(n1.advice, /per row/);

// …and firing them together collapses it back to about one query
const par = trace({ ...BASE, queries: 50, parallel: true });
near(par.hops[3].ms, 2.5 + 49 * 0.1);
assert.ok(par.hops[3].ms < n1.hops[3].ms / 10);

// a table scan is a different order of magnitude from an indexed read
const scan = trace({ ...BASE, distance: "city", query: "scan" });
assert.equal(scan.top2[0].kind, "db");
assert.match(scan.advice, /index/i);
assert.equal(QUERY.scan / QUERY.indexed, 20);

// totals always add up, and the share is a fraction
for (const r of [base, cold, n1, par, scan]) {
  near(r.hops.reduce((a, h) => a + h.ms, 0), r.total);
  assert.ok(r.share > 0 && r.share <= 1);
}
assert.ok(RTT.continent > RTT.region && RTT.region > RTT.city);

console.log("ok — request trace: two hops carry the time, and both are round trips");
