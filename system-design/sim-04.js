/* Two servers, one login — the arithmetic behind lesson 04. No DOM in here, so
   tools/test-sd-04.mjs can run it in node.

   The question the sim answers is the only one that matters when a second server
   appears: where does the session live, and what happens to it when a request lands
   somewhere else, when a server dies, and when every server restarts for a deploy.  */
(function (root) {
"use strict";

/* how unevenly sticky sessions spread users — one server always ends up hot */
var SKEW = [1.6, 0.8, 1.0, 0.6, 1.2, 0.8];

var STATE = {
  memory: { name: "In the server's own memory",
            cost: "Free today. Every extra server, every crash and every deploy is paid for by users logging in again." },
  sticky: { name: "In memory, with sticky sessions",
            cost: "The load balancer pins each user to one server. Load goes uneven, a dead server takes its users with it, and a deploy still empties the memory." },
  store:  { name: "In a shared store",
            cost: "Any server answers any request. The store is now a box that must not die — one more thing to run, and one more datacenter round trip per request." },
  token:  { name: "Inside a signed token the client carries",
            cost: "No store and no extra round trip. But a token cannot be taken back before it expires — a real logout needs a deny-list, which is a small store again." }
};

var BASE = { servers: 2, state: "memory", event: "traffic" };

function simulate(r) {
  var n = r.servers, status = [], alive = n, i;
  for (i = 0; i < n; i++) status.push("up");
  if (r.event === "kill" && n > 1) { status[n - 1] = "dead"; alive = n - 1; }
  if (r.event === "deploy") for (i = 0; i < n; i++) status[i] = "restarted";

  /* share of traffic each live server carries */
  var shares = [], total = 0;
  for (i = 0; i < n; i++) {
    var w = status[i] === "dead" ? 0 : (r.state === "sticky" ? SKEW[i] : 1);
    shares.push(w); total += w;
  }
  shares = shares.map(function (w) { return w / total; });
  var spread = r.state === "sticky" ? "uneven" : "even";

  /* what fraction of users are asked to log in again, and how many sessions are gone for good */
  var relogin = 0, lost = 0;
  if (r.state === "memory") {
    if (r.event === "deploy") { lost = 1; relogin = 1; }
    else {
      lost = r.event === "kill" && n > 1 ? 1 / n : 0;          /* sessions that lived on the dead box */
      relogin = lost + (1 - lost) * (alive > 1 ? 1 - 1 / alive : 0);   /* plus everyone whose next request lands elsewhere */
    }
  } else if (r.state === "sticky") {
    if (r.event === "deploy") { lost = 1; relogin = 1; }
    else if (r.event === "kill" && n > 1) {
      var sk = 0; for (i = 0; i < n; i++) sk += SKEW[i];
      lost = SKEW[n - 1] / sk; relogin = lost;
    }
  }
  /* store and token: nothing depends on which server answers */

  var verdict;
  if (relogin === 0 && r.state === "memory") verdict = "One server, so every request lands where the session is. Nothing is wrong yet — add a second server and watch.";
  else if (r.state === "memory" && r.event === "traffic") verdict = Math.round(relogin * 100) + "% of requests land on a server that has never heard of this user. They are logged in on one box and a stranger on the others.";
  else if (r.state === "memory" && r.event === "kill") verdict = "The dead server took " + Math.round(lost * 100) + "% of the sessions with it, and the survivors still lose the coin toss on their next request.";
  else if (r.event === "deploy" && lost === 1) verdict = "A rolling deploy restarts every process once. Every session was in a process. Every user logs in again — on every deploy.";
  else if (r.state === "sticky" && r.event === "traffic") verdict = "Nobody is logged out — but look at the spread. Server 1 is carrying " + Math.round(shares[0] * 100) + "% of the traffic, and nothing rebalances it.";
  else if (r.state === "sticky" && r.event === "kill") verdict = "Sticky means the dead server's users were only ever on that server. " + Math.round(lost * 100) + "% of them start again.";
  else if (r.event === "kill") verdict = "A server died and no user noticed. Its traffic moved to the others and their sessions were never on it.";
  else if (r.event === "deploy") verdict = "Every process restarted and nobody was logged out, because nothing a request needs lived in a process. This is what stateless buys.";
  else verdict = "Any server answers any request. The load balancer can send each one anywhere, and it does.";

  return { status: status, shares: shares, spread: spread, relogin: relogin, lost: lost,
           cost: STATE[r.state].cost, stateName: STATE[r.state].name, verdict: verdict };
}

root.SESSIONS = { STATE: STATE, SKEW: SKEW, BASE: BASE, simulate: simulate };
})(typeof window !== "undefined" ? window : globalThis);
