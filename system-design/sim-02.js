/* One request, hop by hop — the arithmetic behind lesson 02. No DOM in here, so
   tools/test-sd-02.mjs can run it in node.

   The timings are typical, not measured on any one system: a round trip inside a
   datacenter is well under a millisecond, across a city a few, across a region tens,
   across an ocean well over a hundred. Everything the lesson claims follows from the
   shape of those numbers, not their last digit.                                      */
(function (root) {
"use strict";

var RTT = { city: 5, region: 30, continent: 150 };   /* ms, user ↔ datacenter, one round trip */
var DNS_COLD = 20;                                    /* ms, a resolver that has to go and ask   */
var LB = 0.5, APP = 3, DC_HOP = 0.5;                  /* ms inside the datacenter                */
var QUERY = { indexed: 2, scan: 40 };                 /* ms the database spends on one query     */
var PARALLEL_OVERHEAD = 0.1;                          /* ms per extra query when fired together  */

var BASE = { distance: "region", warm: true, queries: 1, query: "indexed", parallel: false };

function trace(r) {
  var rtt = RTT[r.distance], hops = [];
  if (!r.warm) {
    hops.push({ hop: "DNS lookup", ms: DNS_COLD, kind: "cold" });
    hops.push({ hop: "TCP handshake", ms: rtt, kind: "cold" });
    hops.push({ hop: "TLS handshake (1.3 — one round trip)", ms: rtt, kind: "cold" });
  }
  hops.push({ hop: "Request out and response back", ms: rtt, kind: "wan" });
  hops.push({ hop: "Load balancer", ms: LB, kind: "dc" });
  hops.push({ hop: "Application code", ms: APP, kind: "dc" });
  var per = DC_HOP + QUERY[r.query];
  var db = r.parallel ? per + (r.queries - 1) * PARALLEL_OVERHEAD : per * r.queries;
  hops.push({ hop: "Database — " + r.queries + (r.queries === 1 ? " query" : " queries") +
                   (r.queries > 1 ? (r.parallel ? ", fired together" : ", one after another") : ""),
              ms: db, kind: "db" });

  var total = hops.reduce(function (a, h) { return a + h.ms; }, 0);
  var sorted = hops.slice().sort(function (a, b) { return b.ms - a.ms; });
  var top2 = sorted.slice(0, 2);
  var share = (top2[0].ms + top2[1].ms) / total;

  var big = top2[0], advice;
  if (big.kind === "cold" || (!r.warm && top2[1].kind === "cold"))
    advice = "Three handshakes before a byte of your request moves. Keep connections alive and resume TLS sessions — on the second request every one of them is gone.";
  else if (big.kind === "db" && r.queries > 1 && !r.parallel)
    advice = "One trip to the database per row. Fetch them in one query, or at the very least fire them together — the database is not slow, it is being asked " + r.queries + " times.";
  else if (big.kind === "db" && r.query === "scan")
    advice = QUERY.scan + " ms for one query is a table scan, not a query. An index turns it into " + QUERY.indexed + ".";
  else if (big.kind === "wan" && r.distance === "continent")
    advice = "The biggest hop is distance, and no code makes light faster. Serve from somewhere closer to the user, and make fewer trips across that gap.";
  else
    advice = "Nothing to fix. This is what a healthy request looks like: one trip across the network, one to the database, and code that barely registers.";

  return { hops: hops, total: total, top2: top2, share: share, advice: advice };
}

root.TRACE = { RTT: RTT, DNS_COLD: DNS_COLD, LB: LB, APP: APP, DC_HOP: DC_HOP, QUERY: QUERY, BASE: BASE, trace: trace };
})(typeof window !== "undefined" ? window : globalThis);
