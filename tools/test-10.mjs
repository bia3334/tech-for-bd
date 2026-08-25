/* One runnable check for the budget arithmetic behind lesson 10:
     node tools/test-10.mjs                                                    */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-10.js", "utf8"))();
const B = globalThis.BUD;
const m = (n) => n / 1e6;

// ── nothing has happened yet ─────────────────────────────────────────────────
const zero = B.tally(B.fresh());
assert.equal(zero.planned, 400e6);
assert.equal(zero.committed, 0);
assert.equal(zero.actual, 0);
assert.equal(zero.remaining, 400e6);
assert.equal(zero.available, 400e6);
assert.equal(zero.usagePercent, 0);
// with nothing committed the two headroom numbers agree — which is exactly why the
// bug survives every demo that starts from an empty budget
assert.equal(zero.remaining, zero.available);

// ── approving moves committed and leaves the bank account alone ──────────────
const after1 = B.approve(B.fresh(), "PR-01").reqs;
const t1 = B.tally(after1);
assert.equal(t1.committed, 120e6);
assert.equal(t1.actual, 0, "approval must not touch actual — no money has moved");
assert.equal(t1.remaining, 400e6, "plan minus actual cannot see an approval at all");
assert.equal(t1.available, 280e6, "plan minus committed minus actual can");
assert.equal(t1.usagePercent, 30);

// ── paying moves the same money from committed to actual, total unchanged ────
const after2 = B.step(after1, "PR-01", "CONSUMED");
const t2 = B.tally(after2);
assert.equal(t2.committed, 0);
assert.equal(t2.actual, 120e6);
assert.equal(t2.available, t1.available, "payment must not change available — the money was already spoken for");
assert.equal(t2.remaining, 280e6, "only now does remaining notice");
assert.equal(t2.used, t1.used);

// ── cancelling gives the headroom back and never touches actual ──────────────
const released = B.step(after1, "PR-01", "RELEASED");
assert.equal(B.tally(released).committed, 0);
assert.equal(B.tally(released).actual, 0);
assert.equal(B.tally(released).available, 400e6);
assert.equal(B.find(released, "PR-01").state, "RELEASED", "the row is kept, not deleted (SEC-04)");

// ── only the three real transitions exist ────────────────────────────────────
assert.ok(B.can(B.fresh(), "PR-01", "COMMITTED"));
assert.ok(!B.can(B.fresh(), "PR-01", "CONSUMED"), "a draft cannot be paid — approval comes first");
assert.ok(!B.can(after2, "PR-01", "CONSUMED"), "paying twice is not a transition");
assert.ok(!B.can(released, "PR-01", "COMMITTED"), "a released commitment does not come back");
assert.equal(B.tally(B.step(B.fresh(), "PR-01", "CONSUMED")).actual, 0, "a refused transition moves no money");

// ── the trap: remaining looks healthy while available is already negative ────
const trapped = B.tally(B.trap());
assert.equal(trapped.committed, 300e6);
assert.equal(trapped.actual, 120e6);
assert.equal(trapped.remaining, 280e6, "the dashboard number says 280 million left");
assert.equal(trapped.available, -20e6, "the true number is already 20 million over");
assert.ok(trapped.remaining > 0 && trapped.available < 0, "that gap is the whole lesson");
assert.equal(trapped.usagePercent, 105);
// variance as this system computes it is the same arithmetic as available
assert.equal(trapped.variance, trapped.available);

// ── one more request, checked two ways ───────────────────────────────────────
const nxt = B.nextDraft(B.trap());
assert.equal(nxt.id, "PR-05");
const real = B.check(trapped, nxt.amount, "available");
const naive = B.check(trapped, nxt.amount, "remaining");
assert.equal(real.usagePercent, 115);
assert.equal(real.action, "REQUIRE_APPROVAL", "115% of plan has to escalate");
assert.equal(real.level, 100);
assert.equal(real.headroom, -20e6);
assert.equal(real.shortBy, 60e6);
assert.equal(naive.usagePercent, 40, "counting only money that left the bank hides 300 million");
assert.equal(naive.action, "ALLOW", "the screen reading plan minus actual waves it through");
assert.equal(naive.headroom, 280e6);
assert.equal(naive.shortBy, 0);
assert.notEqual(real.action, naive.action, "same request, same budget, two different answers");
// escalating is not refusing — the business does not stop when a number is exceeded
assert.equal(real.allowed, true);

// ── thresholds: the highest level crossed decides, and the boundary is inclusive ─
const t = B.tally(B.fresh());
assert.equal(B.check(t, 319e6, "available").action, "ALLOW");
assert.equal(B.check(t, 320e6, "available").action, "NOTIFY");    // exactly 80%
assert.equal(B.check(t, 320e6, "available").level, 80);
assert.equal(B.check(t, 360e6, "available").level, 90);           // 90 beats 80
assert.equal(B.check(t, 400e6, "available").action, "REQUIRE_APPROVAL");
assert.equal(B.check(t, 400e6, "available").level, 100);          // 100 beats both
// the amount being asked for counts towards the percentage, before it is approved
assert.equal(B.check(t, 400e6, "available").usagePercent, 100);

// ── the percentage column is NUMERIC(5,2) and behaves like one ───────────────
assert.equal(B.pct(1, 3), 33.33);
assert.equal(B.pct(1e9, 1e3), 999.99, "capped, or PostgreSQL rejects the insert");
assert.equal(B.pct(0, 0), 0, "a plan of zero, nothing spent");
assert.equal(B.pct(1, 0), 100, "a plan of zero, spent against — used up, not a crash");

// ── the invariant every screen depends on ───────────────────────────────────
for (const reqs of [B.fresh(), after1, after2, released, B.trap()]) {
  const x = B.tally(reqs);
  assert.equal(x.available, x.planned - x.committed - x.actual);
  assert.equal(x.remaining - x.available, x.committed, "the gap between the two numbers IS the commitments");
}

console.log(`ok — trap state: planned ${m(trapped.planned)}m · committed ${m(trapped.committed)}m · actual ${m(trapped.actual)}m` +
            ` · remaining ${m(trapped.remaining)}m says fine, available ${m(trapped.available)}m says over` +
            ` · PR-05 checked: ${naive.action} the wrong way, ${real.action} the right way`);
