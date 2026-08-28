/* Nines and the partition — the arithmetic behind lesson 05. No DOM in here, so
   tools/test-sd-05.mjs can run it in node.

   Two ideas, one file. First: what an availability target costs, in downtime and in
   the arithmetic of chaining dependencies. Second: during a network partition a
   system must choose — refuse writes to stay correct (CP), or accept them and let
   copies disagree (AP). There is no third choice; the sim only lets you pick which.  */
(function (root) {
"use strict";

var YEAR_MIN = 365 * 24 * 60;         /* minutes in a year */

var NINES = [
  { nines: "99%",      p: 0.99 },
  { nines: "99.9%",    p: 0.999 },
  { nines: "99.99%",   p: 0.9999 },
  { nines: "99.999%",  p: 0.99999 }
];

function downtime(p) {
  var perYear = (1 - p) * YEAR_MIN;
  return { perYear: perYear, perMonth: perYear / 12, perDay: perYear / 365 };
}

/* a request that needs N dependencies, each up with probability p, all in series */
function chain(p, n) { return Math.pow(p, n); }

/* two replicas, and the network between them has just split */
function partition(mode, opts) {
  opts = opts || {};
  var writes = opts.writes || 100;
  if (mode === "CP") {
    return {
      choice: "CP — consistency over availability",
      writesAccepted: 0, writesRefused: writes, staleReads: 0, conflicts: 0,
      afterHeal: "Nothing to reconcile. Every copy already agrees, because none of them moved while split.",
      felt: "Users on the reachable side get errors on writes for the length of the split. The data is never wrong.",
      good: "money, inventory, bookings, anything where two truths is worse than a pause",
      bad: "a like button, a status page, a feed — pausing those to protect them is a bad trade"
    };
  }
  return {
    choice: "AP — availability over consistency",
    writesAccepted: writes, writesRefused: 0,
    staleReads: writes,
    conflicts: Math.round(writes * (opts.conflictRate || 0.05)),
    afterHeal: "Both sides took writes; now they must be merged. Most just fold together; the overlaps are real conflicts a rule or a human must resolve.",
    felt: "Nobody sees an error. Readers on the far side see stale data during the split, and a few edits collide and need resolving after.",
    good: "a like button, a status page, a feed, a cart you would rather keep than lose",
    bad: "money, inventory, bookings — 'available' here means selling the same seat twice"
  };
}

root.NINES_CAP = { YEAR_MIN: YEAR_MIN, NINES: NINES, downtime: downtime, chain: chain, partition: partition };
})(typeof window !== "undefined" ? window : globalThis);
