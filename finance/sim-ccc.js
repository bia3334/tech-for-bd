/* Mô phỏng dòng tiền của một vòng kinh doanh lặp lại — dùng trong bài 01.
   Không có DOM ở đây, nên tools/test-ccc.mjs chạy được nó bằng node.

   Một chu kỳ: nhập hàng ngày t → bán ngày t+DIO (xuất hoá đơn, CHƯA có tiền)
               → khách trả ngày t+DIO+DSO · mình trả nhà cung cấp ngày t+DPO.
   Chu kỳ mới mở mỗi 30 ngày. Lương và chi phí cố định trả cuối mỗi tháng.      */
(function (root) {
"use strict";

function simulate(o) {
  var days = o.days || 90;
  var ev = [];
  function add(d, label, amount) {
    if (d >= 0 && d <= days) ev.push({ d: d, label: label, amount: amount });
  }

  var sold = 0, fees = 0;
  for (var start = 0; start < days; start += 30) {
    add(start + o.dpo, "Trả nhà cung cấp", -o.cogs);

    var saleDay = start + o.dio;
    if (saleDay > days) continue;          /* chưa bán được trong cửa sổ 90 ngày */
    sold++;
    if (o.discount) {
      /* bán luôn khoản phải thu: nhận tiền ngay hôm xuất hoá đơn, trừ phí theo số ngày ứng trước */
      var fee = Math.round(o.revenue * o.feeRate * o.dso / 30);
      fees += fee;
      add(saleDay, "Chiết khấu hoá đơn", o.revenue - fee);
    } else {
      add(saleDay + o.dso, "Khách thanh toán", o.revenue);
    }
  }
  for (var m = 30; m <= days; m += 30) add(m, "Lương + chi phí cố định", -o.opex);
  ev.sort(function (a, b) { return a.d - b.d; });

  var series = [], cash = o.cash0, i = 0, minCash = cash, negDays = 0;
  for (var d = 0; d <= days; d++) {
    while (i < ev.length && ev[i].d === d) cash += ev[i++].amount;
    series.push(cash);
    if (cash < minCash) minCash = cash;
    if (cash < 0) negDays++;
  }

  return {
    ccc: o.dio + o.dso - o.dpo,
    series: series,
    minCash: minCash,
    negDays: negDays,
    /* lãi trên sổ: ghi nhận lúc BÁN, không phải lúc thu tiền — đó là cả bài học */
    profit: sold * (o.revenue - o.cogs) - o.opex * Math.floor(days / 30) - fees,
    fees: fees,
    events: ev
  };
}

var BASE = { days: 90, cash0: 300e6, cogs: 300e6, revenue: 360e6, opex: 40e6,
             dio: 20, dso: 45, dpo: 30, feeRate: 0.012, discount: false };

root.CCC = { simulate: simulate, BASE: BASE };
if (typeof module !== "undefined" && module.exports) module.exports = root.CCC;
})(typeof window !== "undefined" ? window : globalThis);
