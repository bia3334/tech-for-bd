/* One runnable check for the session-placement maths behind System Design lesson 04:
     node tools/test-sd-04.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "system-design/sim-04.js", "utf8"))();
const { simulate, SKEW } = globalThis.SESSIONS;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const sum = a => a.reduce((x, y) => x + y, 0);

// one server, session in memory: nothing is wrong yet
const one = simulate({ servers: 1, state: "memory", event: "traffic" });
near(one.relogin, 0);
assert.match(one.verdict, /Nothing is wrong yet/);

// three servers, session in memory: two requests in three land on a stranger
const three = simulate({ servers: 3, state: "memory", event: "traffic" });
near(three.relogin, 2 / 3);
assert.equal(three.spread, "even");
near(sum(three.shares), 1);

// kill one of the three: a third of the sessions are gone, and the survivors still lose the coin toss
const kill = simulate({ servers: 3, state: "memory", event: "kill" });
near(kill.lost, 1 / 3);
near(kill.relogin, 1 / 3 + (2 / 3) * (1 - 1 / 2));
assert.equal(kill.status[2], "dead");
near(kill.shares[2], 0);

// a rolling deploy with sessions in memory logs everyone out, however many servers
for (const n of [1, 2, 6]) near(simulate({ servers: n, state: "memory", event: "deploy" }).relogin, 1);

// sticky: nobody logs out, but the load is uneven and a dead server takes its users
const sticky = simulate({ servers: 3, state: "sticky", event: "traffic" });
near(sticky.relogin, 0);
assert.equal(sticky.spread, "uneven");
assert.ok(sticky.shares[0] > sticky.shares[1], "server 1 runs hot");
const stickyKill = simulate({ servers: 3, state: "sticky", event: "kill" });
near(stickyKill.lost, SKEW[2] / (SKEW[0] + SKEW[1] + SKEW[2]));
near(simulate({ servers: 3, state: "sticky", event: "deploy" }).relogin, 1);

// a shared store or a signed token: no event touches a session
for (const state of ["store", "token"]) for (const event of ["traffic", "kill", "deploy"]) {
  const r = simulate({ servers: 4, state, event });
  near(r.relogin, 0); near(r.lost, 0); assert.equal(r.spread, "even");
}
assert.match(simulate({ servers: 2, state: "token", event: "traffic" }).cost, /expires/);
assert.match(simulate({ servers: 2, state: "store", event: "traffic" }).cost, /must not die/);

console.log("ok — sessions: a server that remembers cannot be replaced; one that forgets can be multiplied");
