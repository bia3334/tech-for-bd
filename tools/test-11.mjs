/* One runnable check for the forecast maths behind lesson 11:  node tools/test-11.mjs
   The lesson's whole claim is that a threshold has a measurable cost on each side, so
   the checks that matter are the ones pinning down what each setting misses and what it
   costs in noise. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-11.js", "utf8"))();
const F = globalThis.FORECAST;
const run = (scenario, threshold) => F.forecast({ scenario, threshold });
const m = (n) => (n / 1e6).toFixed(1) + "m";

// ---- the frame -------------------------------------------------------------
const base = run("base", 50e6);
assert.equal(base.series.length, 91);
assert.equal(base.series[0], F.OPENING);
assert.equal(base.periods.length, 13, "90 days at weekly granularity is 13 periods");
assert.equal(base.periods[base.periods.length - 1].end, 90, "the last period must close on day 90");
base.periods.forEach((p) => assert.equal(p.closing, base.series[p.end],
  "a period's projected_closing is the balance on its last day, nothing else"));

// nothing is random, nothing reads a clock: the same input is the same answer
assert.deepEqual(run("late", 25e6).series, run("late", 25e6).series);

// ---- the forecast is an inventory, not a trend ------------------------------
// all five CF-10 sources are represented, and only one of them is statistical
const sources = new Set(F.BOOK.map((r) => r.src));
["recurring", "schedule", "invoice", "scheduled", "budget"].forEach((s) =>
  assert.ok(sources.has(s), `the book must contain a ${s} row`));
assert.ok(!sources.has("history"), "history is the daily drift, not a dated obligation");
// the drift is the only smooth part: a day with no obligation moves by exactly DRIFT
assert.equal(base.series[8] - base.series[7], F.DRIFT);

// ---- the baseline survives; one changed assumption kills it -----------------
assert.ok(base.minCash > 0, "the baseline must never go negative, got " + m(base.minCash));
assert.equal(base.episodes.length, 0);

const late = run("late", 0);
assert.equal(late.episodes.length, 2, "one customer 30 days late opens two holes");
assert.equal(late.episodes[0].start, 50);
assert.equal(late.episodes[1].start, 62);
assert.ok(late.minCash < 0);
// profit did not move — the same invoice, the same amount, thirty days later
assert.equal(late.rows.reduce((s, r) => s + r.a, 0), base.rows.reduce((s, r) => s + r.a, 0));

// ---- a threshold of zero is not a warning, it is a post-mortem --------------
assert.equal(late.alerts.length, 2, "at threshold 0 only the already-negative weeks fire");
assert.equal(late.caught, 1, "and the first hole is missed entirely");
assert.ok(late.alerts[0].d > late.episodes[0].start,
  "the first alert must land AFTER the account was already empty");
assert.equal(late.alerts[0].severity, "CRITICAL", "a negative closing is CRITICAL, per ShortfallDetector");

const lateOk = run("late", 25e6);
assert.equal(lateOk.caught, 2, "lifting the threshold above zero catches both holes");
assert.equal(lateOk.alerts.length, 4);
assert.equal(lateOk.episodes[0].notice, 22, "22 days of notice on the first hole");
assert.equal(lateOk.alerts[0].severity, "WARNING", "still positive but under the threshold is WARNING");

// the same trap in the other two scenarios: zero catches nothing in advance
assert.equal(run("declined", 0).caught, 0, "declining the offer: four alerts, none of them early");
assert.equal(run("declined", 0).alerts.length, 4);
assert.equal(run("declined", 25e6).caught, 2);
assert.equal(run("order", 0).caught, 1);
assert.equal(run("order", 25e6).caught, 2);

// a hole that opens and closes inside one period is invisible at the period end
const declined = run("declined", 0);
assert.equal(declined.episodes[0].start, 32);
assert.equal(declined.episodes[0].end, 33);
assert.ok(declined.periods.every((p) => p.end < 32 || p.end > 33),
  "the two-day hole falls between two period ends, so no period closing can see it");

// ---- and the other side: raising it forever is not free --------------------
let prev = -1;
for (let t = 0; t <= 400e6; t += 25e6) {
  const n = run("late", t).alerts.length;
  assert.ok(n >= prev, "alert count must never fall as the threshold rises");
  prev = n;
}
assert.equal(run("late", 400e6).alerts.length, 13, "a high enough threshold fires every single week");
assert.ok(run("late", 150e6).alerts.length >= 10, "150m already fires in most weeks");

// there is a band, it is well above zero, and it is narrow enough to argue about
const b = F.band("late", 5, 5e6);
assert.ok(b.lo > 0, "the defensible band never starts at zero");
assert.ok(b.hi > b.lo);
assert.ok(b.lo <= 25e6 && b.hi >= 90e6, `expected a usable band around 20m..95m, got ${m(b.lo)}..${m(b.hi)}`);

console.log(`ok — baseline survives (low point ${m(base.minCash)}, 1 alert in 13 weeks)` +
  ` · 30 days late: ${late.episodes.length} shortfalls, threshold 0 catches ${late.caught}` +
  ` in advance, threshold 25m catches ${lateOk.caught} with ${lateOk.alerts.length} alerts` +
  ` · defensible band ${m(b.lo)} .. ${m(b.hi)}`);
