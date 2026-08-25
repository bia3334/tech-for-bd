/* One runnable check for the money maths behind lesson 08:  node tools/test-08.mjs
   Two claims the lesson rests on, and both are checkable:
     the limit moves when nothing else does, and the enum decides who is out of pocket. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-08.js", "utf8"))();
const SEC = globalThis.SEC;
const { BASE, PRODUCTS, RATES } = SEC;
const run = (o) => SEC.compute({ ...BASE, ...o });

const base = run({});

// the frame — 10 billion of stock at 60% supports 6 billion, and 5.4 is drawn
assert.equal(base.limit, 6000e6);
assert.equal(base.limit, SEC.pctOf(BASE.stockValue, BASE.advanceRate));
assert.equal(base.headroom, 600e6);
assert.equal(base.shortfall, 0);
assert.equal(base.utilisation, 90);
assert.equal(base.haircut, 4000e6);
assert.equal(base.belowThreshold, false);

// SCF-13: the borrower breaches by doing nothing at all. Same drawn, same advance rate,
// a 12% write-down in the warehouse — and the facility is 120 million over its limit.
const written = run({ stockValue: 8800e6 });
assert.equal(written.limit, 5280e6);
assert.ok(written.shortfall > 0, "a 12% write-down must break the cover");
assert.equal(written.shortfall, 120e6);
assert.equal(written.shortfall, BASE.drawn - written.limit);

// the tipping point is exactly coverStockValue, on both sides of it
assert.equal(base.coverStockValue, 9000e6);
assert.equal(run({ stockValue: base.coverStockValue }).shortfall, 0);
assert.ok(run({ stockValue: base.coverStockValue - 100e6 }).shortfall > 0);

// ...and the two ways back over the line both land on it: pledge more stock, or get the
// advance rate raised. (The rate is displayed to two decimals, so it lands within rounding.)
assert.equal(SEC.pctOf(8800e6 + written.topUpStock, BASE.advanceRate), BASE.drawn);
assert.equal(written.topUpStock, 200e6);
assert.ok(Math.abs(SEC.pctOf(8800e6, written.rateNeeded) - BASE.drawn) < 1e6);
assert.ok(written.rateNeeded > BASE.advanceRate);

// SCF-14: the event fires on the CROSSING, not every night it is below threshold
assert.equal(SEC.alertFires(10000e6, 9400e6, BASE.threshold), true, "crossing must publish");
assert.equal(SEC.alertFires(9400e6, 9000e6, BASE.threshold), false, "already below — silence");
assert.equal(SEC.alertFires(9000e6, 9600e6, BASE.threshold), false, "coming back up is not an alert");
assert.equal(SEC.alertFires(9600e6, 9100e6, BASE.threshold), true, "crossing again must publish again");
// a pledge with no threshold means no margin call was agreed — not a threshold of zero
assert.equal(SEC.alertFires(10000e6, 0, null), false);
assert.equal(SEC.alertFires(10000e6, 0, undefined), false);

// the warning is meant to arrive BEFORE cover is lost, so the two lines are not the same line
assert.ok(BASE.threshold > base.coverStockValue);
const warned = run({ stockValue: 9200e6 });
assert.equal(warned.belowThreshold, true);
assert.equal(warned.shortfall, 0, "warned but still covered — that is the point of a margin call");

// liquidation: the financier never recovers more than it is owed, and the shortfall on
// the LIMIT is a different number from the shortfall after selling the stock
assert.equal(base.forcedSale, 7000e6);
assert.equal(base.recovered, BASE.drawn);
assert.equal(base.residual, 0);
const broke = run({ stockValue: 6000e6 });
assert.equal(broke.forcedSale, 4200e6);
assert.equal(broke.residual, 1200e6);
assert.ok(broke.residual !== broke.shortfall, "cover lost and money lost are two different numbers");

// losing cover and losing money are two lines, and the second is well below the first
assert.ok(base.salvageStockValue < base.coverStockValue);
assert.equal(run({ stockValue: base.salvageStockValue }).residual, 0);
assert.ok(run({ stockValue: base.salvageStockValue - 100e6 }).residual > 0);
assert.ok(run({ stockValue: base.coverStockValue - 100e6 }).residual === 0,
  "over the limit but a forced sale still repays in full — that is the gap the widget teaches");

// factoring_product decides who eats the residual — and nothing else about the facility
for (const stockValue of [10000e6, 8800e6, 7000e6, 6000e6, 3000e6]) {
  const ref = run({ stockValue });
  for (const product of PRODUCTS) {
    const r = run({ stockValue, product });
    assert.equal(r.limit, ref.limit, "the enum must not move the limit");
    assert.equal(r.shortfall, ref.shortfall);
    assert.equal(r.residual, ref.residual);
    assert.equal(r.sellerLoss + r.financierLoss, r.residual,
      `the loss must land on somebody · ${product} @ ${stockValue}`);
  }
  assert.equal(run({ stockValue, product: "SELLER_WITH_RECOURSE" }).financierLoss, 0);
  assert.equal(run({ stockValue, product: "SELLER_WITHOUT_RECOURSE" }).sellerLoss, 0);
  assert.equal(run({ stockValue, product: "BUYER" }).sellerLoss, 0);
}
assert.equal(run({ stockValue: 6000e6, product: "SELLER_WITH_RECOURSE" }).sellerLoss, 1200e6);
assert.equal(run({ stockValue: 6000e6, product: "SELLER_WITHOUT_RECOURSE" }).financierLoss, 1200e6);

// with recourse the seller keeps the risk, so it is the cheaper of the two seller products —
// that is why an SME picks it, and the gap is what the risk was priced at
const withR = SEC.fee(BASE.drawn, "SELLER_WITH_RECOURSE", BASE.tenorDays);
const withoutR = SEC.fee(BASE.drawn, "SELLER_WITHOUT_RECOURSE", BASE.tenorDays);
const buyerR = SEC.fee(BASE.drawn, "BUYER", BASE.tenorDays);
assert.ok(buyerR < withR && withR < withoutR, "reverse factoring cheapest, without-recourse dearest");
assert.equal(withR, Math.round(BASE.drawn * RATES.SELLER_WITH_RECOURSE / 100 * BASE.tenorDays / 365));
assert.ok(withoutR - withR > 55e6, "the price of the risk must be visible in đồng");
// the fee is a price, not a loss: it does not move when the buyer defaults
assert.equal(run({ stockValue: 3000e6 }).fee, base.fee);
assert.deepEqual(base.compare.map(c => c.product), PRODUCTS);

// residual depends on what the stock fetches, never on the advance rate — raising the
// advance rate cures a limit breach and recovers not one đồng more in a liquidation
for (const advanceRate of [40, 50, 60, 75, 90]) {
  assert.equal(run({ stockValue: 6000e6, advanceRate }).residual, broke.residual);
}
assert.ok(run({ stockValue: 8800e6, advanceRate: 70 }).shortfall === 0);
assert.ok(run({ advanceRate: 40 }).limit < base.limit);

const m = (n) => (n / 1e6).toFixed(1) + "m ₫";
const b = (n) => (n / 1e9).toFixed(2) + " bn ₫";
console.log(`ok — pledge supports ${b(base.limit)} against ${b(BASE.drawn)} drawn · a 12% write-down` +
            ` puts it ${m(written.shortfall)} over a limit nobody moved · with recourse costs ${m(withR)}` +
            ` where without costs ${m(withoutR)}`);
