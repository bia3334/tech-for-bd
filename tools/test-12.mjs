/* One runnable check for the rule engine behind lesson 12:  node tools/test-12.mjs
   The whole lesson turns on which exemptions are size-gated and which are not, so those
   are the checks that matter — plus the fallback, which is the one nobody writes a test for. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-12.js", "utf8"))();
const SIGN = globalThis.SIGN;
const { BASE, PRESETS } = SIGN;
const run = (o) => SIGN.assess({ ...BASE, ...o });
const size = (o) => SIGN.classify({ ...BASE, ...o }).size;

/* ---- Nghị định 80/2021 Điều 5: headcount is AND, revenue and capital are OR ---- */

// trade/services, right on the micro line
assert.equal(size({ sector: "TRADE", headcount: 10, revenue: 10, capital: 3 }), "MICRO");
// one head over, and the economic test never gets a vote
assert.equal(size({ sector: "TRADE", headcount: 11, revenue: 1, capital: 1 }), "SMALL");
// revenue over its bound but capital under it — OR, so still micro
assert.equal(size({ sector: "TRADE", headcount: 8, revenue: 40, capital: 2 }), "MICRO");
// both economic tests over, headcount fine — not micro
assert.equal(size({ sector: "TRADE", headcount: 8, revenue: 40, capital: 40 }), "SMALL");

// the two sectors genuinely differ: 6 tỷ of revenue is micro in trade and not in construction
assert.equal(size({ sector: "TRADE", headcount: 8, revenue: 6, capital: 9 }), "MICRO");
assert.equal(size({ sector: "AGRI",  headcount: 8, revenue: 6, capital: 9 }), "SMALL");
// and the headcount bound for "small" is 50 in trade, 100 in construction — the line most often miscopied
assert.equal(size({ sector: "TRADE", headcount: 70, revenue: 20, capital: 10 }), "MEDIUM");
assert.equal(size({ sector: "AGRI",  headcount: 70, revenue: 20, capital: 10 }), "SMALL");

// a company that has not traded yet is judged on capital alone
assert.equal(size({ sector: "TRADE", headcount: 4, revenue: null, capital: 2 }), "MICRO");
assert.equal(size({ sector: "TRADE", headcount: 4, revenue: null, capital: 30 }), "SMALL");
assert.equal(SIGN.classify({ ...BASE, revenue: null }).noRevenue, true);

// above medium there is no tier — but enterprise_scale has to store something, and it stores MEDIUM
const huge = SIGN.classify({ ...BASE, headcount: 900, revenue: 900, capital: 900 });
assert.equal(huge.size, "LARGE");
assert.equal(huge.scale, "MEDIUM");
assert.ok(SIGN.TIERS.indexOf("LARGE") < 0, "Điều 5 defines three tiers, not four");

/* ---- the exemption that is NOT size-gated ---- */

// doanh nghiệp tư nhân: exempt however large it grows
const soleHuge = run({ form: "SOLE_PROPRIETORSHIP", headcount: 260, revenue: 320, capital: 150 });
assert.equal(soleHuge.size, "LARGE");
assert.equal(soleHuge.exempt, true);
assert.equal(soleHuge.basis.code, "DIEU_13_7");
assert.equal(soleHuge.minPeople, 1);

// one-member LLC owned by an individual: same, at any size
assert.equal(run({ form: "LLC_SINGLE", ownerIsIndividual: true, headcount: 90, revenue: 90, capital: 40 }).exempt, true);

// the modelling trap — same legal form, owner is an organisation, so group three and the size test bites
const org = run({ form: "LLC_SINGLE", ownerIsIndividual: false, headcount: 30, revenue: 60, capital: 20 });
assert.equal(org.size, "SMALL");
assert.equal(org.exempt, false);
assert.equal(org.basis.code, "OWNER_IS_ORG");
// shrink the same company to micro and group three lets it through
assert.equal(run({ form: "LLC_SINGLE", ownerIsIndividual: false, headcount: 4, revenue: 2, capital: 1 }).basis.code, "ND174_19_3");

// state capital is never exempt, at any size
const state = run({ form: "JSC", headcount: 4, revenue: 2, capital: 1, stateCapital: true });
assert.equal(state.size, "MICRO");
assert.equal(state.exempt, false);
assert.equal(state.basis.code, "STATE_CAPITAL");
// …and being micro still drops the chief-accountant title requirement. Two independent axes.
assert.equal(state.chiefAccountantByTitle, false);

/* ---- the fallback nobody writes a test for ---- */

const blank = run({ profileVerified: false });
assert.equal(blank.exempt, false);
assert.equal(blank.mode, "STRICT");
assert.equal(blank.chiefAccountantByTitle, true, "an unverified profile must not buy the micro relaxation");
assert.equal(blank.basis.code, "FALLBACK");
assert.equal(blank.minPeople, 3);
// the very same company, once verified, is exempt — so the fallback is doing real work
assert.equal(run({ profileVerified: true }).exempt, true);

/* ---- what the exemption actually changes in the chain ---- */

const strict = run({ form: "JSC", headcount: 140, revenue: 90, capital: 60, sector: "AGRI" });
assert.equal(strict.mode, "STRICT");
assert.equal(strict.minPeople, 3, "maker, approver and cashier must be three different people");
assert.ok(strict.checks.every(c => c.kept));
assert.equal(strict.steps.length, 4);
assert.equal(strict.steps.find(s => s.key === "CONTROL").role, "CHIEF_ACCOUNTANT");

const relaxed = run(PRESETS[0].p);
assert.equal(relaxed.size, "MICRO");
assert.equal(relaxed.exempt, true);
assert.equal(relaxed.minPeople, 1, "one lawful person must be able to run the whole chain");
assert.ok(relaxed.checks.every(c => !c.kept));
// the chief accountant's signature is REBOUND, never removed — Điều 19 khoản 3 still wants it
assert.equal(relaxed.steps.length, 4);
const control = relaxed.steps.find(s => s.key === "CONTROL");
assert.equal(control.status, "rebound");
assert.match(control.role, /PHU_TRACH_KE_TOAN/);
assert.ok(relaxed.steps.every(s => s.status !== "dropped"), "no step ever disappears from the chain");

// three of the six checks are law and three are product — the distinction the lesson is about
assert.equal(strict.checks.filter(c => c.source === "law").length, 3);
assert.equal(strict.checks.filter(c => c.source === "product").length, 3);

// and a naive hard-coded chain gets both of them wrong on the exempt company
assert.equal(relaxed.naive.overStrict, true, "a fixed three-account floor refuses a lawful company");
assert.equal(relaxed.naive.deadlock, true, "a hard-coded chief-accountant title deadlocks a micro-enterprise");
assert.equal(strict.naive.overStrict, false);
assert.equal(strict.naive.deadlock, false);

/* ---- the account floor is derived from the checks, not asserted ---- */

assert.equal(SIGN.minPeople([]), 1);
assert.equal(SIGN.minPeople([["MAKER", "EXECUTE"]]), 2);
assert.equal(SIGN.minPeople([["MAKER", "APPROVE"], ["MAKER", "EXECUTE"], ["APPROVE", "EXECUTE"]]), 3);
// add the chief accountant's own signature and it takes a fourth person
assert.equal(SIGN.minPeople([["MAKER", "APPROVE"], ["MAKER", "EXECUTE"], ["APPROVE", "EXECUTE"],
                             ["CONTROL", "APPROVE"], ["CONTROL", "MAKER"], ["CONTROL", "EXECUTE"]]), 4);

/* ---- every preset stays the thing it was written to prove ---- */
const byKey = Object.fromEntries(PRESETS.map(p => [p.key, run(p.p)]));
assert.equal(byKey.haidang.exempt, true);
assert.equal(byKey.sonha.exempt, true);
assert.equal(byKey.sonha.size, "LARGE");
assert.equal(byKey.thanhloi.exempt, false);
assert.equal(byKey.dongaa.exempt, false);
assert.equal(byKey.chuakhai.exempt, false);
assert.equal(PRESETS.length, 5);
assert.ok(PRESETS.every(p => SIGN.FORMS[p.p.form]), "every preset must name a real LegalForm value");

console.log(`ok — Hải Đăng: ${byKey.haidang.size}, exempt under ${byKey.haidang.basis.code}, ${byKey.haidang.minPeople} account needed` +
            ` · Sơn Hà: ${byKey.sonha.size} and exempt anyway · Đông Á: ${byKey.dongaa.size}, ${byKey.dongaa.minPeople} accounts` +
            ` · blank profile falls back to ${byKey.chuakhai.mode}`);
