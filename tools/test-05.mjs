/* One runnable check for the aging + offsetting logic behind lesson 05:
     node tools/test-05.mjs                                                    */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-05.js", "utf8"))();
const A = globalThis.AGE;
const { BASE } = A;
const items = BASE.items, on = BASE.asOf, bounds = BASE.bounds;

// ── the buckets ──────────────────────────────────────────────────────────────
assert.deepEqual(A.labels(bounds), ["In term", "1–30", "31–60", "61–90", "Over 90"]);

const r = A.aging(items, "RECEIVABLE", on, bounds);
const p = A.aging(items, "PAYABLE", on, bounds);
assert.equal(r.total, 440e6);
assert.equal(p.total, 260e6);
// same 440 million, and the shape is the whole story: a third of it past ninety days
assert.deepEqual(r.buckets.map(v => v / 1e6), [90, 120, 80, 0, 150]);
assert.deepEqual(p.buckets.map(v => v / 1e6), [130, 70, 0, 60, 0]);
assert.ok(r.tail / r.total > 0.33, "the receivable tail must be a third of the book");

// a debt due on the as-of day itself is still in term, one day later it is not
const due = { dir: "RECEIVABLE", cur: "VND", amount: 1, offset: 0, due: "2026-03-31" };
assert.equal(A.slot(due, "2026-03-31", bounds), 0);
assert.equal(A.slot(due, "2026-04-01", bounds), 1);
assert.equal(A.slot(due, "2026-04-30", bounds), 1);
assert.equal(A.slot(due, "2026-05-01", bounds), 2);
assert.equal(A.slot(due, "2026-07-01", bounds), 4);
// boundaries are configuration, not captions — move them and the report moves
assert.equal(A.slot(due, "2026-04-30", [7, 14, 21]), 4);

// written off is still a row and no longer a bucket
assert.equal(A.statusOf(items.find(i => i.id === "R0"), on), "WRITTEN_OFF");
assert.equal(r.buckets.reduce((a, b) => a + b, 0) + 40e6, 480e6);

// ── the minutes will not confirm until the two sides are exactly equal ───────
const bad = A.check(items, { R3: 150e6, P2: 130e6 }, on);
assert.equal(bad.ok, false);
assert.equal(bad.gap, 20e6);
const oneSided = A.check(items, { R3: 150e6, R1: 20e6 }, on);
assert.equal(oneSided.ok, false, "receivables alone cancel nothing");
const tooBig = A.check(items, { R3: 200e6, P2: 130e6, P1: 70e6 }, on);
assert.equal(tooBig.ok, false, "a line may not exceed what is left of the debt");
const woLine = A.check(items, { R0: 40e6, P3: 40e6 }, on);
assert.equal(woLine.ok, false, "a written-off debt has no obligation left to offset");
const mixed = A.check(items.concat([{ id: "PX", dir: "PAYABLE", cur: "USD", amount: 150e6, offset: 0, due: "2026-03-01" }]),
                      { R3: 150e6, PX: 150e6 }, on);
assert.equal(mixed.ok, false, "two currencies never offset against each other");

const good = A.check(items, { R3: 150e6, P2: 130e6, P1: 20e6 }, on);
assert.equal(good.ok, true, good.why);
assert.equal(good.recv, good.pay);
assert.equal(good.recv, 150e6);

// ── confirming settles what it clears and leaves the remainder alive ─────────
const done = A.confirmOffset(items, { R3: 150e6, P2: 130e6, P1: 20e6 }, on);
assert.equal(done.ok, true);
assert.equal(done.total, 150e6);
const byId = Object.fromEntries(done.items.map(i => [i.id, i]));
assert.equal(A.statusOf(byId.R3, on), "SETTLED", "offsetting is the second road to settlement");
assert.equal(A.statusOf(byId.P2, on), "SETTLED");
assert.equal(A.remaining(byId.P1), 50e6, "a part-offset debt keeps living for the rest");
assert.equal(A.statusOf(byId.P1, on), "OVERDUE");

const r2 = A.aging(done.items, "RECEIVABLE", on, bounds);
assert.equal(r2.tail, 0, "the over-90 tail was the debt that got offset");
assert.equal(r2.total, 290e6);
assert.equal(A.aging(done.items, "PAYABLE", on, bounds).total, 110e6);
// no money left the account, and 150 million of debt is gone from both sides
assert.equal(r.total - r2.total, p.total - A.aging(done.items, "PAYABLE", on, bounds).total);

// ── cancelling restores every balance, but not the day ───────────────────────
const back = A.cancelOffset(done.items, done.lines);
const bId = Object.fromEntries(back.map(i => [i.id, i]));
assert.deepEqual(back.map(i => i.offset), items.map(() => 0));
assert.equal(A.aging(back, "RECEIVABLE", on, bounds).total, r.total);
assert.equal(A.aging(back, "PAYABLE", on, bounds).total, p.total);

// P2 was in term on the day it was offset and is overdue by the day it comes back
assert.equal(A.statusOf(bId.P2, on), "OUTSTANDING");
assert.equal(A.statusOf(bId.P2, BASE.cancelOn), "OVERDUE");
assert.equal(A.daysOverdue(bId.P2, BASE.cancelOn), 10);
assert.equal(A.slot(bId.P2, BASE.cancelOn, bounds), 1);

console.log(`ok — receivable ${r.total / 1e6}m with ${(100 * r.tail / r.total).toFixed(0)}% past 90 days` +
            ` · minutes of ${done.total / 1e6}m clears the tail, leaves ${A.remaining(byId.P1) / 1e6}m` +
            ` · cancelled on ${BASE.cancelOn}, NCC-2026-0081 comes back 10 days overdue`);
