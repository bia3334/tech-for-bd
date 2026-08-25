/* Một check chạy được cho phần tính tiền của bài 01:  node tools/test-ccc.mjs   */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
new Function(readFileSync(root + "finance/sim-ccc.js", "utf8"))();
const { simulate, BASE } = globalThis.CCC;
const run = (o) => simulate({ ...BASE, ...o });

const base = run({});

// khung mô phỏng
assert.equal(base.series.length, 91);
assert.equal(base.series[0], BASE.cash0);
assert.equal(base.ccc, BASE.dio + BASE.dso - BASE.dpo);
assert.equal(base.ccc, 35);

// luận điểm của cả bài: có lãi trên sổ, mà vẫn âm tiền mặt
assert.ok(base.profit > 0, "kịch bản mặc định phải có lãi, đang là " + base.profit);
assert.ok(base.minCash < 0, "kịch bản mặc định phải âm tiền, đang là " + base.minCash);
assert.ok(base.negDays > 0);

// chiết khấu hoá đơn: hết âm tiền, nhưng lãi phải giảm đúng bằng phí
const disc = run({ discount: true });
assert.ok(disc.minCash >= 0, "bật chiết khấu thì không được âm tiền, đang là " + disc.minCash);
assert.equal(disc.negDays, 0);
assert.equal(disc.profit, base.profit - disc.fees);
assert.ok(disc.fees > 0);

// phí tỉ lệ với số ngày ứng trước — ứng 90 ngày phải đắt gấp đôi ứng 45 ngày
assert.equal(run({ discount: true, dso: 90 }).fees, 2 * run({ discount: true, dso: 45 }).fees);

// ba cần gạt của CCC, mỗi cái phải kéo tiền mặt đi đúng chiều
assert.ok(run({ dso: 15 }).minCash > base.minCash, "thu tiền sớm hơn phải đỡ kẹt hơn");
assert.ok(run({ dpo: 60 }).minCash > base.minCash, "trả nhà cung cấp muộn hơn phải đỡ kẹt hơn");
assert.ok(run({ dio: 5 }).minCash > base.minCash, "hàng nằm kho ít ngày hơn phải đỡ kẹt hơn");
assert.equal(run({ dso: 15 }).ccc, 5);

// bán chạy gấp đôi: lãi trên sổ tăng, mà cái hố tiền mặt lại sâu hơn
const big = run({ cogs: BASE.cogs * 2, revenue: BASE.revenue * 2 });
assert.ok(big.profit > base.profit, "quy mô gấp đôi phải lãi nhiều hơn");
assert.ok(big.minCash < base.minCash, "quy mô gấp đôi phải kẹt tiền nặng hơn — đó là chết vì tăng trưởng");

// tiền chỉ chạy khi có sự kiện, và mọi sự kiện đều nằm trong cửa sổ
assert.ok(base.events.every(e => e.d >= 0 && e.d <= 90));
assert.ok(base.events.some(e => e.label === "Khách thanh toán"));

console.log(`ok — CCC ${base.ccc} ngày · lãi ${(base.profit / 1e6).toFixed(1)}tr · thiếu ${(-base.minCash / 1e6).toFixed(1)}tr tiền mặt` +
            ` · bật chiết khấu: lãi ${(disc.profit / 1e6).toFixed(1)}tr, không ngày nào âm`);
