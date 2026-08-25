/* The security behind one financing offer — lesson 08. No DOM in here, so
   tools/test-08.mjs can run it in node.

   One facility: 5.4 billion advanced against invoices, secured by a pledge over stock.
   It answers two questions that people keep treating as one:

   1. How much does the pledge support?
        limit = Σ pledged_value of the PLEDGED rows × advance_rate            (SCF-13)
      Nobody agrees that number. It is recomputed from a valuation, so it moves whenever
      the valuation moves — and alertFires() is the warning that goes with it (SCF-14).

   2. When the buyer never pays, who is out of pocket?
      Decided by factoring_product — the three legal branches of TT 20/2024/TT-NHNN
      Điều 3 khoản 9–11 — months before anybody defaulted.                             */
(function (root) {
"use strict";

/* Indicative all-in rates, %/year, on the amount advanced. The ordering is the point:
   the branch where the seller carries the risk is the cheapest of the two seller
   products, and the branch priced off a large buyer's standing is cheaper than both. */
var RATES = {
  SELLER_WITH_RECOURSE: 11.0,
  SELLER_WITHOUT_RECOURSE: 15.5,
  BUYER: 9.5
};

var PRODUCTS = ["SELLER_WITH_RECOURSE", "SELLER_WITHOUT_RECOURSE", "BUYER"];

function pctOf(amount, rate) {
  return Math.round(amount * rate / 100);
}

function fee(drawn, product, tenorDays) {
  return Math.round(drawn * RATES[product] / 100 * tenorDays / 365);
}

/* Who is left holding whatever the collateral did not cover. The two branches that end
   with the financier are NOT a copy-paste accident: in đồng they really are the same,
   and the difference between them is who the financier's customer was — which shows up
   in the fee, not in the split. */
function settle(product, residual) {
  if (product === "SELLER_WITH_RECOURSE") {
    return { seller: residual, financier: 0,
             chased: "the seller — it gave an undertaking to repay (cam kết hoàn trả)" };
  }
  if (product === "BUYER") {
    return { seller: 0, financier: residual,
             chased: "the buyer — the buyer was the financier's customer from the start" };
  }
  return { seller: 0, financier: residual,
           chased: "the buyer, and whatever the buyer does not pay stays with the financier" };
}

/* Does this revaluation publish scf.collateral-below-threshold.v1?

   Mirrors PledgeService.syncAfterRevaluation: pledged_value still holds the PREVIOUS
   valuation when the comparison is made, so "was above, is now below" reads straight
   out of the data and the event fires once, on the crossing. A missing threshold means
   no margin call was agreed — it does NOT mean a threshold of zero. */
function alertFires(previousValue, newValue, threshold) {
  if (threshold === null || threshold === undefined) return false;
  return previousValue >= threshold && newValue < threshold;
}

function compute(o) {
  var limit = pctOf(o.stockValue, o.advanceRate);
  var headroom = limit - o.drawn;
  var shortfall = Math.max(0, -headroom);

  /* what the lender believes it fetches in a hurry — never the shelf value */
  var forcedSale = pctOf(o.stockValue, o.forcedSaleRate);
  var recovered = Math.min(o.drawn, forcedSale);
  var residual = o.drawn - recovered;

  var s = settle(o.product, residual);

  return {
    limit: limit,
    headroom: headroom,
    shortfall: shortfall,
    utilisation: limit > 0 ? Math.round(o.drawn / limit * 1000) / 10 : Infinity,
    haircut: o.stockValue - limit,

    /* the stock value at which cover is exactly lost, and the two ways back over the line */
    coverStockValue: Math.round(o.drawn / (o.advanceRate / 100)),
    /* ...and the lower value at which a liquidation stops repaying the whole debt. The two
       are different numbers and a long way apart: losing cover is not yet losing money. */
    salvageStockValue: Math.round(o.drawn / (o.forcedSaleRate / 100)),
    topUpStock: shortfall > 0 ? Math.round(shortfall / (o.advanceRate / 100)) : 0,
    rateNeeded: Math.round(o.drawn / o.stockValue * 10000) / 100,

    belowThreshold: o.threshold !== null && o.threshold !== undefined
                    && o.stockValue < o.threshold,

    forcedSale: forcedSale,
    recovered: recovered,
    residual: residual,
    sellerLoss: s.seller,
    financierLoss: s.financier,
    chased: s.chased,

    feeRate: RATES[o.product],
    fee: fee(o.drawn, o.product, o.tenorDays),

    /* the same default, priced and split three ways */
    compare: PRODUCTS.map(function (p) {
      var one = settle(p, residual);
      return { product: p, rate: RATES[p], fee: fee(o.drawn, p, o.tenorDays),
               seller: one.seller, financier: one.financier };
    })
  };
}

var BASE = {
  stockValue: 10000e6,     /* Σ pledged_value at the last revaluation — shelf value */
  advanceRate: 60,         /* financing_offers.advance_rate, %                       */
  drawn: 5400e6,           /* advanced 90 days ago and still outstanding             */
  threshold: 9500e6,       /* collateral_pledges.min_value_threshold — agreed, not computed */
  forcedSaleRate: 70,      /* the financier's own forced-sale estimate, % of shelf value    */
  tenorDays: 90,
  product: "SELLER_WITH_RECOURSE"
};

root.SEC = { compute: compute, settle: settle, fee: fee, alertFires: alertFires,
             pctOf: pctOf, RATES: RATES, PRODUCTS: PRODUCTS, BASE: BASE };
if (typeof module !== "undefined" && module.exports) module.exports = root.SEC;
})(typeof window !== "undefined" ? window : globalThis);
