/* The rule engine behind lesson 12. No DOM in here, so tools/test-12.mjs can run it in node.

   Two questions, in this order:

   1. How big is this company?  Nghị định 80/2021/NĐ-CP Điều 5. The social-insurance
      headcount is a precondition (AND); revenue and capital are alternatives (OR); the
      thresholds differ between agriculture/industry/construction and trade/services.

   2. Given that, which controls apply?  The segregation exemptions are NOT all size-gated:
        · Doanh nghiệp tư nhân                                    — exempt at ANY size
        · Công ty TNHH MTV whose owner is an INDIVIDUAL           — exempt at ANY size
          (Luật Kế toán 2015 Điều 13 khoản 7 and Điều 52 khoản 4 — no size test in either)
        · any other legal form                                    — exempt only when it is
          BOTH micro AND free of state capital (Nghị định 174/2016/NĐ-CP Điều 19 khoản 3)

   And the control mode is a derived value, never a toggle: an incomplete or unverified
   legal profile falls back to the strictest mode (FRS SEC-09).                            */
(function (root) {
"use strict";

/* Nghị định 80/2021/NĐ-CP Điều 5. Headcount = số lao động tham gia BHXH bình quân năm.
   Revenue and capital in tỷ đồng. Read each row as: headcount AND (revenue OR capital). */
var SECTORS = {
  AGRI: { label: "Nông–lâm–thuỷ sản · công nghiệp · xây dựng",
          MICRO:  { hc: 10,  rev: 3,   cap: 3 },
          SMALL:  { hc: 100, rev: 50,  cap: 20 },
          MEDIUM: { hc: 200, rev: 200, cap: 100 } },
  TRADE: { label: "Thương mại · dịch vụ",
          MICRO:  { hc: 10,  rev: 10,  cap: 3 },
          SMALL:  { hc: 50,  rev: 100, cap: 50 },
          MEDIUM: { hc: 100, rev: 300, cap: 100 } }
};
var TIERS = ["MICRO", "SMALL", "MEDIUM"];

/* Keys are the LegalForm enum in masterdata-service, so the widget and the column agree. */
var FORMS = {
  SOLE_PROPRIETORSHIP: "Doanh nghiệp tư nhân",
  LLC_SINGLE:          "Công ty TNHH một thành viên",
  LLC_MULTI:           "Công ty TNHH hai thành viên trở lên",
  JSC:                 "Công ty cổ phần",
  OTHER:               "Loại hình khác"
};

function classify(o) {
  var t = SECTORS[o.sector] || SECTORS.TRADE;
  /* a company that has not traded yet has no revenue figure — Điều 5 then reads capital alone */
  var noRevenue = (o.revenue === null || o.revenue === undefined || o.revenue === "");
  var tests = [];
  for (var i = 0; i < TIERS.length; i++) {
    var tier = TIERS[i], b = t[tier];
    var hcOk = o.headcount <= b.hc;
    var revOk = !noRevenue && o.revenue <= b.rev;
    var capOk = o.capital <= b.cap;
    var pass = hcOk && (revOk || capOk);
    tests.push({ tier: tier, bound: b, hcOk: hcOk, revOk: revOk, capOk: capOk, pass: pass });
    if (pass) return { size: tier, scale: tier, sector: t.label, noRevenue: noRevenue, tests: tests };
  }
  /* Điều 5 defines three tiers and stops. A company above them is simply not an SME — and
     enterprise_scale has no value for that, so it stores MEDIUM: the strictest of the three.
     The column is a control mode wearing the name of a size. */
  return { size: "LARGE", scale: "MEDIUM", sector: t.label, noRevenue: noRevenue, tests: tests };
}

/* Smallest number of distinct human accounts that can satisfy a set of "these two roles must
   not be the same person" pairs. Four roles, so brute force is cheaper than being clever. */
var ROLES = ["MAKER", "CONTROL", "APPROVE", "EXECUTE"];
function minPeople(pairs) {
  for (var k = 1; k <= ROLES.length; k++) {
    var combos = Math.pow(k, ROLES.length);
    for (var m = 0; m < combos; m++) {
      var seat = {}, x = m, ok = true;
      for (var i = 0; i < ROLES.length; i++) { seat[ROLES[i]] = x % k; x = Math.floor(x / k); }
      for (var j = 0; j < pairs.length; j++) {
        if (seat[pairs[j][0]] === seat[pairs[j][1]]) { ok = false; break; }
      }
      if (ok) return k;
    }
  }
  return ROLES.length;
}

function assess(o) {
  var sized = classify(o);
  /* SEC-09 fallback: nothing declared, or declared and not verified → strictest mode */
  var known = o.profileVerified !== false;
  var micro = known && sized.size === "MICRO";

  var g1 = o.form === "SOLE_PROPRIETORSHIP";
  var g2 = o.form === "LLC_SINGLE" && o.ownerIsIndividual === true;
  var g3 = !g1 && !g2 && micro && !o.stateCapital;
  var exempt = known && (g1 || g2 || g3);

  var basis =
    !known ? { code: "FALLBACK", why: "Legal profile not declared or not verified. The strictest mode applies until it is — a missing fact is never read as permission (SEC-09)." }
    : g1 ? { code: "DIEU_13_7", why: "Doanh nghiệp tư nhân. Luật Kế toán 2015 Điều 13 khoản 7 and Điều 52 khoản 4 both carve it out, and neither carve-out mentions size at all." }
    : g2 ? { code: "DIEU_13_7", why: "Công ty TNHH một thành viên whose owner is an individual. Same two articles, same absence of a size test — this company is exempt however large it grows." }
    : g3 ? { code: "ND174_19_3", why: "Micro-enterprise with no state capital, under Nghị định 174/2016/NĐ-CP Điều 19 khoản 3 — the only one of the three groups the size test binds." }
    : o.stateCapital ? { code: "STATE_CAPITAL", why: "State capital in the company. Nghị định 174/2016/NĐ-CP Điều 19 khoản 3 never exempts it, at any size." }
    : (o.form === "LLC_SINGLE" && !o.ownerIsIndividual) ? { code: "OWNER_IS_ORG", why: "A one-member LLC owned by an organisation is not group two. It falls into group three, so it needs to be micro AND free of state capital — and it is not micro." }
    : { code: "TOO_BIG", why: "A " + FORMS[o.form] + " is only exempt as a micro-enterprise with no state capital, and this one classifies as " + sized.size.toLowerCase() + "." };

  /* Every identity check the workflow can impose, with where it comes from. The three
     product ones are SEC-08; the three legal ones are the closed list the statute names. */
  var checks = [
    { key: "APPROVER_IS_REQUESTER", pair: ["MAKER", "APPROVE"], source: "product",
      label: "The approver may not be the person who raised the request",
      article: "FRS SEC-08 · a control the company owes itself under Điều 39 khoản 2 Luật Kế toán 2015" },
    { key: "EXECUTED_BY_MAKER", pair: ["MAKER", "EXECUTE"], source: "product",
      label: "The cashier who confirms the money left may not be the person who raised it",
      article: "FRS SEC-08 · Thông tư 99/2025/TT-BTC Điều 3 khoản 2 obliges the company to write this rule, not the software" },
    { key: "EXECUTED_BY_APPROVER", pair: ["APPROVE", "EXECUTE"], source: "product",
      label: "The cashier may not be the person who approved the payment",
      article: "FRS SEC-08 · the half of SEC-08 that went unenforced until 05/08/2026" },
    { key: "DUAL_SIGNATURE_SAME_PERSON", pair: ["CONTROL", "APPROVE"], source: "law",
      label: "The chief accountant's signature and the approver's signature must be two people",
      article: "Luật Kế toán 2015 Điều 19 khoản 3 · Thông tư 99/2025/TT-BTC Điều 10 khoản 4" },
    { key: "ACCOUNTANT_NOT_CASHIER", pair: null, source: "law",
      label: "A manager, storekeeper, cashier or asset trader may not also do the accounting",
      article: "Luật Kế toán 2015 Điều 52 khoản 4 · Nghị định 174/2016/NĐ-CP Điều 19 khoản 3" },
    { key: "CHIEF_ACCOUNTANT_NOT_RELATIVE", pair: null, source: "law",
      label: "The chief accountant may not be a close relative of the legal representative or director",
      article: "Luật Kế toán 2015 Điều 52 khoản 3 · Nghị định 174/2016/NĐ-CP Điều 19 khoản 2" }
  ];
  checks.forEach(function (c) { c.kept = !exempt; });

  var pairs = checks.filter(function (c) { return c.kept && c.pair; }).map(function (c) { return c.pair; });

  /* The chief accountant's signature on a spending voucher never disappears — Điều 19 khoản 3
     Luật Kế toán 2015 requires it before the money moves. What a micro-enterprise changes is
     who may hold the pen: the step binds to an authority, not to a job title. */
  var steps = [
    { key: "MAKER", role: "ACCOUNTANT", label: "Raise the payment request",
      who: "Người lập chứng từ", status: "kept",
      law: "No statute names this step. It exists because somebody has to type it." },
    { key: "CONTROL", role: micro ? "CHIEF_ACCOUNTANT | PHU_TRACH_KE_TOAN | DELEGATE" : "CHIEF_ACCOUNTANT",
      label: "Sign as chief accountant", status: micro ? "rebound" : "kept",
      who: micro ? "Kế toán trưởng, phụ trách kế toán, or a person they authorised"
                 : "Kế toán trưởng — the job title itself",
      law: micro ? "Nghị định 174/2016/NĐ-CP Điều 20 khoản 2 điểm b · Thông tư 58/2026/TT-BTC Điều 3 khoản 2"
                 : "Luật Kế toán 2015 Điều 19 khoản 3" },
    { key: "APPROVE", role: "MANAGER | DIRECTOR", label: "Approve the spend",
      who: "Người có thẩm quyền duyệt chi", status: "kept",
      law: "Luật Kế toán 2015 Điều 19 khoản 3 — signed before the money moves, not after" },
    { key: "EXECUTE", role: "CASHIER", label: "Confirm the money left the account",
      who: "Thủ quỹ", status: "kept",
      law: "No statute names this step either. FRS SEC-08 does." }
  ];

  var need = minPeople(pairs);
  return {
    size: sized.size, scale: sized.scale, sector: sized.sector,
    noRevenue: sized.noRevenue, tests: sized.tests,
    known: known, micro: micro, exempt: exempt, basis: basis,
    mode: exempt ? "RELAXED" : "STRICT",
    chiefAccountantByTitle: !micro,
    steps: steps, checks: checks, minPeople: need,
    /* what a hard-coded chain does to this same company */
    naive: { minPeople: 3, requiresTitle: true,
             overStrict: need < 3,
             deadlock: micro }
  };
}

var BASE = { sector: "TRADE", headcount: 6, revenue: 8, capital: 2,
             form: "LLC_SINGLE", ownerIsIndividual: true, stateCapital: false, profileVerified: true };

/* Five profiles worth arguing about. The first is the one a naive implementation rejects. */
var PRESETS = [
  { key: "haidang", name: "TNHH MTV Hải Đăng",
    note: "Bán vật tư xây dựng. Giám đốc kiêm thủ kho và thủ quỹ, em gái ruột làm kế toán trưởng.",
    p: { sector: "TRADE", headcount: 6, revenue: 8, capital: 2, form: "LLC_SINGLE",
         ownerIsIndividual: true, stateCapital: false, profileVerified: true } },
  { key: "sonha", name: "DNTN Sơn Hà",
    note: "A private enterprise far too large to be an SME — and exempt anyway.",
    p: { sector: "AGRI", headcount: 260, revenue: 320, capital: 150, form: "SOLE_PROPRIETORSHIP",
         ownerIsIndividual: true, stateCapital: false, profileVerified: true } },
  { key: "thanhloi", name: "TNHH MTV Thành Lợi",
    note: "Same legal form as Hải Đăng, owner is a holding company. Not exempt.",
    p: { sector: "TRADE", headcount: 30, revenue: 60, capital: 20, form: "LLC_SINGLE",
         ownerIsIndividual: false, stateCapital: false, profileVerified: true } },
  { key: "dongaa", name: "CP Xây dựng Đông Á",
    note: "A joint-stock construction company with a real finance department.",
    p: { sector: "AGRI", headcount: 140, revenue: 90, capital: 60, form: "JSC",
         ownerIsIndividual: false, stateCapital: false, profileVerified: true } },
  { key: "chuakhai", name: "Chưa khai hồ sơ",
    note: "Signed up this morning, legal profile blank. Strictest mode until it is filled in.",
    p: { sector: "TRADE", headcount: 6, revenue: 8, capital: 2, form: "LLC_SINGLE",
         ownerIsIndividual: true, stateCapital: false, profileVerified: false } }
];

root.SIGN = { classify: classify, assess: assess, minPeople: minPeople,
              SECTORS: SECTORS, TIERS: TIERS, FORMS: FORMS, ROLES: ROLES,
              BASE: BASE, PRESETS: PRESETS };
if (typeof module !== "undefined" && module.exports) module.exports = root.SIGN;
})(typeof window !== "undefined" ? window : globalThis);
