/* One runnable check for the three statements behind lesson 14:  node tools/test-14.mjs */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-14.js", "utf8"))();
const { OPENING, EVENTS, byId, run, view, moves } = globalThis.FS;
const v = (...ids) => view(run(ids));

const open = v();

// the opening position is a real balance sheet, not a pile of numbers
assert.equal(open.bs.assets, open.bs.claims, "the opening sheet must balance");
assert.equal(open.bs.assets, OPENING.cash + OPENING.ar + OPENING.inv + OPENING.fa);
assert.equal(open.profit, 0);
assert.equal(open.cfo, 0);
assert.equal(open.gap, 0, "profit and operating cash start equal — that is the whole point");

// THE moment: selling on credit books profit on sheet two and moves sheet three not at all
const sold = v("sell");
assert.equal(sold.profit, 60e6, "200m of goods costing 140m is 60m of profit");
assert.equal(sold.cf.op, 0, "selling on credit must not move operating cash by one đồng");
assert.equal(sold.cf.net, 0, "nor any other line of sheet three");
assert.equal(sold.bs.cash, OPENING.cash, "and not the bank balance either");
assert.equal(sold.gap, 60e6, "so the gap opens by exactly the profit");
const m = moves(byId("sell"));
assert.ok(m.bs && m.is && !m.cf, "sheet 1 and 2 move, sheet 3 does not");

// every prefix of every ordering keeps both invariants — this is the model's spine
const ids = EVENTS.map(e => e.id);
for (let cut = 0; cut <= ids.length; cut++) {
  for (const rot of [ids, [...ids].reverse(), [ids[4], ids[0], ids[6], ids[2], ids[5], ids[1], ids[3]]]) {
    const s = v(...rot.slice(0, cut));
    assert.ok(s.balanced, `assets must equal claims after ${cut} events`);
    assert.ok(s.cashOk, `cash must equal opening + operating + investing + financing after ${cut} events`);
    // the tie-back to lesson 01: the gap IS the working capital put into the cycle
    assert.equal(s.gap, s.wc, `profit − operating cash must equal the change in working capital after ${cut} events`);
  }
}

// two events, the same 150m more in the bank, filed on two different lines of sheet three
const earned = v("collect"), borrowed = v("advance");
assert.equal(earned.bs.cash - OPENING.cash, 120e6);
assert.equal(borrowed.bs.cash - OPENING.cash, 150e6);
assert.equal(earned.cf.op, 120e6);
assert.equal(earned.cf.fin, 0);
assert.equal(borrowed.cf.op, 0, "an advance is not money the business earned");
assert.equal(borrowed.cf.fin, 150e6);
assert.equal(borrowed.profit, 0, "and borrowing is never income");
assert.equal(borrowed.bs.debt, 150e6, "it arrives with a liability attached");

// buying stock for cash: real money out, and nothing at all on sheet two
const stocked = v("buystock");
assert.equal(stocked.profit, 0, "stock is not a cost until it is sold");
assert.equal(stocked.cf.op, -100e6);
assert.equal(stocked.bs.inv, OPENING.inv + 100e6);

// the van is the only event that lands in investing, and it never touches profit
const van = v("van");
assert.equal(van.cf.inv, -300e6);
assert.equal(van.cf.op, 0);
assert.equal(van.profit, 0);
assert.equal(EVENTS.filter(e => e.d.cfi).length, 1);

// salaries: the one ordinary event that moves all three sheets together
const paid = v("salaries");
assert.equal(paid.profit, -50e6);
assert.equal(paid.cf.op, -50e6);
assert.equal(paid.gap, 0, "a cash cost opens no gap — only working capital does");
const ms = moves(byId("salaries"));
assert.ok(ms.bs && ms.is && ms.cf);

// the whole run: magnificently profitable, and operating cash has gone backwards
const all = v(...ids);
assert.ok(all.profit > 0, "the company must end profitable, got " + all.profit);
assert.ok(all.cfo < 0, "and still bleeding operating cash, got " + all.cfo);
assert.ok(all.bs.cash > 0, "without ever going overdrawn — that is what hides it");
assert.equal(all.gap, all.profit - all.cfo);

// deterministic: same ids, same answer, and order does not change the closing position
assert.deepEqual(v(...ids), v(...ids));
assert.deepEqual(v(...[...ids].reverse()).bs, all.bs);

// unknown ids are ignored rather than thrown — a bad id must not blank the widget
assert.deepEqual(v("nonsense"), open);

console.log(`ok — sheet balances after every event · selling on credit books ${(sold.profit / 1e6).toFixed(0)}m of profit` +
            ` and moves sheet three by ${sold.cf.net} · full run: profit ${(all.profit / 1e6).toFixed(0)}m,` +
            ` operating cash ${(all.cfo / 1e6).toFixed(0)}m, gap ${(all.gap / 1e6).toFixed(0)}m = working capital`);
