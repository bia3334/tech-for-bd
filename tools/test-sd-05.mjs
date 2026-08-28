/* One runnable check for the availability + CAP maths behind System Design lesson 05:
     node tools/test-sd-05.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "system-design/sim-05.js", "utf8"))();
const { downtime, chain, partition } = globalThis.NINES_CAP;
const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// three nines is ~8.8 hours a year, four is ~53 minutes, five is ~5 minutes
near(downtime(0.999).perYear, 525.6);
near(downtime(0.999).perYear / 60, 8.76, 0.01);
near(downtime(0.9999).perYear, 52.56);
near(downtime(0.99).perYear, 5256);   // ~3.65 days
near(downtime(0.99999).perYear, 5.256, 0.01);

// each extra nine is roughly ten times less downtime
near(downtime(0.999).perYear / downtime(0.9999).perYear, 10, 0.01);

// chaining dependencies destroys nines
near(chain(0.999, 1), 0.999, 1e-6);
near(chain(0.999, 10), 0.990, 0.001);   // ~99.0% end to end: a whole nine gone
assert.ok(chain(0.999, 10) < 0.999, "ten 3-nines dependencies in series lose a nine");
assert.ok(chain(0.9999, 100) < chain(0.9999, 10), "more dependencies, less availability");
assert.ok(chain(0.999, 5) < 0.999, "a 3-nines service made of five 3-nines parts is not 3-nines");

// CAP: pick one, the sim refuses to pretend otherwise
const cp = partition("CP", { writes: 100 });
assert.equal(cp.writesAccepted, 0);
assert.equal(cp.writesRefused, 100);
assert.equal(cp.conflicts, 0);
assert.match(cp.choice, /consistency/i);

const ap = partition("AP", { writes: 100, conflictRate: 0.05 });
assert.equal(ap.writesAccepted, 100);
assert.equal(ap.writesRefused, 0);
assert.equal(ap.staleReads, 100);
assert.equal(ap.conflicts, 5);
assert.match(ap.choice, /availability/i);

// genuinely opposite: what one refuses, the other accepts
assert.equal(cp.writesAccepted + ap.writesRefused, 0);
assert.ok(ap.conflicts > cp.conflicts);

console.log("ok — nines cost tenfold each, chains erode them, and a partition forces one choice");
