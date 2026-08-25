/* One runnable check for the comparison maths behind lesson 09:  node tools/test-09.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-09.js", "utf8"))();
const { AMOUNT, QUOTES, price, compare, earlyPayYield } = globalThis.OFFERS;

const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: got ${a}, expected ${b} ± ${tol}`);

// the headline order never changes — 1.2 beats 2 beats 3, and that is the whole trap
const at90 = compare(AMOUNT, 90);
assert.deepEqual(at90.byHeadline, ["A", "B", "C"]);

// ... and over 90 days the true order is exactly the reverse of it
assert.deepEqual(at90.byTrueCost, ["C", "B", "A"]);
assert.ok(at90.reversed, "at 90 days the ranking must fully reverse");
assert.equal(at90.best.id, "C");
assert.equal(at90.worst.id, "A");

// the arithmetic the lesson walks through by hand, to the đồng
const a90 = at90.rows.find(r => r.id === "A");
assert.equal(a90.headlineCost, 18_000_000);   // 500m × 1.2% × 3 months
assert.equal(a90.arrangeCost, 2_000_000);     // 500m × 0.4%, once
assert.equal(a90.cost, 20_000_000);
assert.equal(a90.received, 480_000_000);
near(a90.annual, 16.898, 0.01, "quote A over 90 days");
assert.equal(at90.spread, 20_000_000 - at90.best.cost);

// a flat fee is a rate in disguise: identical cost, three times the rate over a third of the time
const b = d => compare(AMOUNT, d).rows.find(r => r.id === "B");
assert.equal(b(30).cost, b(90).cost, "a flat fee must not move with the number of days");
near(b(90).annual, 15.145, 0.01, "2% flat over 90 days");
near(b(30).annual, 45.436, 0.01, "2% flat over 30 days");
near(b(30).annual / b(90).annual, 3, 1e-9, "same headline, three times the cost");

// the minimum drawdown bites: B charges its 2% on 900m however little you take
assert.equal(b(90).base, 900e6);
assert.equal(compare(200e6, 90).rows.find(r => r.id === "B").cost, b(90).cost);

// shorten the period and the ranking flips — three different orders across the slider
assert.deepEqual(compare(AMOUNT, 30).byTrueCost, ["A", "C", "B"]);
assert.deepEqual(compare(AMOUNT, 75).byTrueCost, ["C", "A", "B"]);
assert.deepEqual(compare(AMOUNT, 120).byTrueCost, ["C", "B", "A"]);
assert.ok(!compare(AMOUNT, 30).reversed);

// at any single tenor, đồng and percentage rank the same way — they only disagree
// ACROSS tenors, which is exactly why sorting on net_proceeds alone is not safe forever
for (const days of [15, 30, 45, 60, 75, 90, 105, 120]) {
  const c = compare(AMOUNT, days);
  const byMoney = c.rows.slice().sort((x, y) => x.cost - y.cost).map(r => r.id);
  const byRate = c.rows.slice().sort((x, y) => x.annual - y.annual).map(r => r.id);
  assert.deepEqual(byMoney, byRate, `${days} days: đồng and % must rank the same way`);
  assert.equal(c.spread, c.worst.cost - c.best.cost);
}

// every fee the provider mentioned sits inside the cost, and what is left is what arrives
for (const days of [15, 60, 120]) {
  for (const r of compare(AMOUNT, days).rows) {
    assert.equal(r.cost, r.headlineCost + r.arrangeCost + r.unusedCost);
    assert.equal(r.received, AMOUNT - r.cost);
    assert.ok(r.annual > 0);
    // discount basis against yield basis: cost over what arrived always exceeds cost over face
    assert.ok(r.cost / r.received > r.cost / AMOUNT);
  }
}
assert.equal(QUOTES.length, 3);
assert.equal(price(QUOTES[0], AMOUNT, 0).annual, 0, "zero days must not divide by zero");

// 2/10 net 30 — the discount everyone reads as small
near(earlyPayYield(2, 10, 30), 37.245, 0.01, "2/10 net 30");
assert.ok(earlyPayYield(2, 10, 30) > compare(AMOUNT, 90).worst.annual,
  "taking the early-payment discount must beat every financing rate on the board");
assert.equal(earlyPayYield(2, 30, 30), 0, "no days saved is no return");

console.log(`ok — over 90 days the board reads ${at90.byTrueCost.join(" < ")}, the exact reverse of` +
  ` the headline order ${at90.byHeadline.join(" < ")} · cheapest ${(at90.best.cost / 1e6).toFixed(1)}m` +
  ` against dearest ${(at90.worst.cost / 1e6).toFixed(1)}m · over 30 days it flips to` +
  ` ${compare(AMOUNT, 30).byTrueCost.join(" < ")} · 2/10 net 30 = ${earlyPayYield(2, 10, 30).toFixed(1)}% a year`);
