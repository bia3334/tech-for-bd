/* The regime resolver behind lesson 15. No DOM in here, so tools/test-15.mjs can run it in node.

   Two statutes replaced the whole corporate accounting regime across 2026, and they pull in
   opposite directions:

     Thông tư 99/2025/TT-BTC   from 01/01/2026, retires Thông tư 200/2014/TT-BTC.
                               Small, medium and large enterprises. Hands the company the pen:
                               it designs its own document forms and renames or restructures
                               its own level-2 and level-3 sub-accounts, with no request filed
                               with the Bộ Tài chính first. Two conditions only — the
                               consolidated figures on the financial statements are not
                               distorted, and the company issues internal accounting rules
                               recording the change.

     Thông tư 58/2026/TT-BTC   from 01/07/2026, replaces Thông tư 132/2018/TT-BTC. Micro
                               enterprises, and for the first time hộ kinh doanh. Ties the
                               accounting regime to how the business pays tax, and splits it
                               into four groups. Two of the four file no financial statements
                               with the state at all.

   So the book list is not a constant. It is a value derived from a legal profile — the same
   shape as the approval chain in lesson 12, and the same rule: derive it, never toggle it.   */
(function (root) {
"use strict";

var ENTITIES = { ENTERPRISE: "Doanh nghiệp", HOUSEHOLD: "Hộ kinh doanh" };
/* Four sizes here because Thông tư 99 names four; the project's EnterpriseScale enum stores only
   MICRO/SMALL/MEDIUM and folds large firms into MEDIUM, since no behaviour turns on the difference.
   Nothing here turns on it either — only MICRO changes which statute applies. */
var SCALES   = { MICRO: "Siêu nhỏ", SMALL: "Nhỏ", MEDIUM: "Vừa", LARGE: "Lớn" };
var VAT      = { DIRECT: "GTGT trực tiếp (tỷ lệ % trên doanh thu)", DEDUCTION: "GTGT khấu trừ" };
var CIT      = { REVENUE_PERCENT: "TNDN theo tỷ lệ % trên doanh thu", TAXABLE_INCOME: "TNDN trên thu nhập tính thuế" };

/* The four groups of Thông tư 58/2026/TT-BTC, in the order the statute lists them.
   The grid is (VAT method) × (corporate income tax basis) — nothing else decides it. */
var GROUPS = {
  "DIRECT|REVENUE_PERCENT": {
    n: 1,
    label: "Nhóm 1 — GTGT trực tiếp và TNDN theo tỷ lệ % trên doanh thu",
    fs: false,
    books: [
      { code: "S1-DNSN", name: "Sổ chi tiết doanh thu bán hàng hoá, dịch vụ",
        note: "The only book. Both taxes are a percentage of revenue, so revenue is the only figure the state needs." }
    ],
    why: "Both taxes are computed off revenue, so revenue is the only thing that has to be recorded."
  },
  "DIRECT|TAXABLE_INCOME": {
    n: 2,
    label: "Nhóm 2 — GTGT trực tiếp và TNDN trên thu nhập tính thuế",
    fs: true,
    fsDeadline: "trong 90 ngày kể từ ngày kết thúc năm tài chính",
    books: [
      { code: "—", name: "Sổ chi tiết doanh thu và chi phí", note: "" },
      { code: "—", name: "Sổ chi tiết vật liệu, sản phẩm, hàng hoá", note: "" },
      { code: "—", name: "Sổ tài sản cố định", note: "" },
      { code: "—", name: "Sổ chi tiết tiền", note: "" }
    ],
    booksNote: "The source annex names these four books by subject and gives no form codes for this group. " +
               "Do not put a code on the screen until somebody has read the statute — a plausible code is worse than a blank.",
    why: "Taxable income means costs have to be proved, so the four detail books appear and a financial statement follows."
  },
  "DEDUCTION|REVENUE_PERCENT": {
    n: 3,
    label: "Nhóm 3 — GTGT khấu trừ và TNDN theo tỷ lệ % trên doanh thu",
    fs: false,
    books: [
      { code: "S3a-DNSN", name: "Sổ chi tiết doanh thu bán hàng hoá, dịch vụ", note: "" },
      { code: "S3b-DNSN", name: "Sổ theo dõi nghĩa vụ thuế GTGT",
        note: "Input VAT against output VAT. The deduction method needs both sides of the tax, which the direct method never has to look at." }
    ],
    why: "Deduction needs input VAT tracked against output VAT — but income tax is still a percentage of revenue, so no financial statement is filed."
  },
  "DEDUCTION|TAXABLE_INCOME": {
    n: 4,
    label: "Nhóm 4 — GTGT khấu trừ và TNDN trên thu nhập tính thuế",
    fs: true,
    fsDeadline: "theo chế độ báo cáo tài chính áp dụng cho doanh nghiệp siêu nhỏ",
    books: [
      { code: "S2a-DNSN", name: "Sổ kế toán chi tiết — mẫu S2a", note: "" },
      { code: "S2b-DNSN", name: "Sổ kế toán chi tiết — mẫu S2b", note: "" },
      { code: "S2c-DNSN", name: "Sổ kế toán chi tiết — mẫu S2c", note: "" },
      { code: "S2d-DNSN", name: "Sổ kế toán chi tiết — mẫu S2d", note: "" }
    ],
    booksNote: "The annex names the set S2a to S2d without naming each book in it. The codes are real, the titles here are placeholders.",
    why: "The most closely watched group inside the micro band: both taxes need real accounting, so the full detail set and a financial statement are compulsory."
  }
};

/* What Thông tư 99 hands a small, medium or large enterprise instead of a fixed book list. */
var TT99_BOOKS = [
  { code: "Tự thiết kế", name: "Biểu mẫu chứng từ và sổ kế toán do doanh nghiệp tự ban hành",
    note: "No request filed with the Bộ Tài chính first — the requirement that stood for over a decade under Thông tư 200/2014 is gone." },
  { code: "TK cấp 2 · 3", name: "Tên gọi, số hiệu và kết cấu tài khoản chi tiết cấp 2, cấp 3 do doanh nghiệp tự đặt",
    note: "Which is why the chart of accounts has to be metadata. A hard-coded account list is code written against a regime that ended." }
];

/* The screens and export buttons the application may render. `on` is derived, never a setting. */
function screensFor(r, o) {
  var tt99 = r.regime === "TT99";
  var deduction = o.vat === "DEDUCTION";
  var income = o.cit === "TAXABLE_INCOME";
  return [
    { id: "sale-book", label: "Sổ doanh thu bán hàng hoá, dịch vụ", on: true,
      why: "Every regime and every group records revenue. This is the one screen nobody can be without." },
    { id: "cost-books", label: "Sổ chi tiết chi phí, vật tư, tài sản cố định và tiền", on: tt99 || income,
      why: income || tt99
        ? "Income tax on taxable income means deductible costs have to be proved, book by book."
        : "Income tax is a flat percentage of revenue. Costs change nothing the state will ever ask about." },
    { id: "vat-book", label: "Sổ theo dõi nghĩa vụ thuế GTGT (đầu vào / đầu ra)", on: deduction,
      why: deduction
        ? "The deduction method nets input VAT against output VAT, so both sides must be tracked."
        : "Direct VAT is a percentage of revenue. There is no input side to deduct, so there is nothing to track." },
    { id: "coa", label: "Cấu hình hệ thống tài khoản kế toán", on: tt99,
      why: tt99
        ? "Thông tư 99 lets this company rename and restructure its own level-2 and level-3 sub-accounts. The screen exists because the autonomy exists."
        : "Thông tư 58 fixes the book set by tax method. There is nothing here for the customer to configure." },
    { id: "doc-designer", label: "Thiết kế biểu mẫu chứng từ riêng", on: tt99,
      why: tt99
        ? "Own document forms, no filing with the Ministry beforehand — on two conditions the product has to enforce."
        : "Not available under Thông tư 58, and offering it would invite the customer to build something the statute does not recognise." },
    { id: "fs-position", label: "Báo cáo tình hình tài chính", on: r.fsRequired,
      why: r.fsRequired
        ? "This company files a financial statement, so it needs the statement of financial position."
        : "This company files no financial statement with the state at all. Rendering the export is not generosity." },
    { id: "fs-result", label: "Báo cáo kết quả hoạt động kinh doanh", on: r.fsRequired,
      why: r.fsRequired
        ? "Part of the same filing."
        : "Same filing, same answer: there is no filing." },
    { id: "fs-cash", label: "Báo cáo lưu chuyển tiền tệ", on: tt99,
      why: tt99
        ? "Part of the full set under Thông tư 99."
        : "Not part of what a micro-enterprise files. Do not offer it because the code already has the query." },
    { id: "fs-file", label: "Nộp báo cáo tài chính cho cơ quan thuế", on: r.fsRequired,
      why: r.fsRequired
        ? "There is a deadline attached: " + r.fsDeadline + "."
        : "No obligation, therefore no deadline, therefore no reminder, therefore no red badge in the sidebar." },
    { id: "cit-worksheet", label: "Bảng xác định thu nhập tính thuế và chi phí được trừ", on: income,
      why: income
        ? "Taxable income has to be computed from something, and this is where deductible costs get argued."
        : "Income tax is a percentage of revenue. This worksheet would ask the customer questions the law never asks them." }
  ];
}

function resolve(o) {
  var household = o.entity === "HOUSEHOLD";
  var micro = o.scale === "MICRO";
  var tt58 = household || micro;
  var r = {
    entity: o.entity, entityLabel: ENTITIES[o.entity],
    scale: household ? null : o.scale,
    scaleLabel: household ? "—" : SCALES[o.scale],
    vatLabel: VAT[o.vat], citLabel: CIT[o.cit],
    regime: tt58 ? "TT58" : "TT99",
    caveat: null
  };

  if (tt58) {
    var g = GROUPS[o.vat + "|" + o.cit];
    r.regimeLabel = "Thông tư 58/2026/TT-BTC";
    r.effective = "01/07/2026";
    r.replaces = "Thông tư 132/2018/TT-BTC";
    r.group = g.n;
    r.groupLabel = g.label;
    r.groupWhy = g.why;
    r.books = g.books;
    r.booksNote = g.booksNote || null;
    r.fsRequired = g.fs;
    r.fsDeadline = g.fsDeadline || null;
    r.coaConfigurable = false;
    if (household) {
      r.caveat = "Thông tư 58 extends to hộ kinh doanh for the first time. The project's research annex says so and " +
                 "stops there — it never spells out a separate book set for a household business. This resolver therefore " +
                 "reads a hộ kinh doanh through the same four groups as a micro-enterprise. That is an assumption, not a " +
                 "finding: read the statute before it decides a screen.";
    }
  } else {
    r.regimeLabel = "Thông tư 99/2025/TT-BTC";
    r.effective = "01/01/2026";
    r.replaces = "Thông tư 200/2014/TT-BTC";
    r.group = 0;
    r.groupLabel = "Không phân nhóm — Thông tư 99 áp cho doanh nghiệp nhỏ, vừa và lớn";
    r.groupWhy = "Thông tư 99 does not group by tax method. It hands the company the pen and takes two conditions in exchange.";
    r.books = TT99_BOOKS;
    r.booksNote = "Conditions on the autonomy: the consolidated figures on the financial statements must not be distorted, " +
                  "and the company must issue internal accounting rules recording the change.";
    r.fsRequired = true;
    r.fsDeadline = "theo chế độ báo cáo tài chính hiện hành";
    r.coaConfigurable = true;
  }

  r.screens = screensFor(r, o);
  r.shown = 0;
  r.hidden = 0;
  r.screens.forEach(function (s) { if (s.on) r.shown++; else r.hidden++; });
  return r;
}

var BASE = { entity: "ENTERPRISE", scale: "MICRO", vat: "DIRECT", cit: "REVENUE_PERCENT" };

/* Six customers, one per outcome. The first is the one worth engineering for. */
var PRESETS = [
  { key: "baoan", name: "TNHH Bảo An",
    note: "Micro, direct VAT, income tax as a flat percentage of revenue. One book, and no filing at all.",
    p: { entity: "ENTERPRISE", scale: "MICRO", vat: "DIRECT", cit: "REVENUE_PERCENT" } },
  { key: "minhkhoi", name: "TNHH Minh Khôi",
    note: "Micro, direct VAT, income tax on taxable income. Four detail books and a financial statement inside 90 days.",
    p: { entity: "ENTERPRISE", scale: "MICRO", vat: "DIRECT", cit: "TAXABLE_INCOME" } },
  { key: "haidang", name: "TNHH MTV Hải Đăng",
    note: "Micro on the deduction method but still taxed on revenue — S3a and S3b, and no financial statement.",
    p: { entity: "ENTERPRISE", scale: "MICRO", vat: "DEDUCTION", cit: "REVENUE_PERCENT" } },
  { key: "anphat", name: "TNHH An Phát",
    note: "Micro, deduction, taxable income. The strictest corner of Thông tư 58 — S2a to S2d and a full filing.",
    p: { entity: "ENTERPRISE", scale: "MICRO", vat: "DEDUCTION", cit: "TAXABLE_INCOME" } },
  { key: "dongaa", name: "CP Xây dựng Đông Á",
    note: "A small joint-stock company. Thông tư 99: designs its own forms and its own sub-accounts.",
    p: { entity: "ENTERPRISE", scale: "SMALL", vat: "DEDUCTION", cit: "TAXABLE_INCOME" } },
  { key: "coba", name: "HKD Tạp hoá Cô Ba",
    note: "A household business. Thông tư 58 reaches one for the first time — and the source stops there.",
    p: { entity: "HOUSEHOLD", scale: "MICRO", vat: "DIRECT", cit: "REVENUE_PERCENT" } }
];

root.BOOKS = { resolve: resolve, ENTITIES: ENTITIES, SCALES: SCALES, VAT: VAT, CIT: CIT,
               GROUPS: GROUPS, BASE: BASE, PRESETS: PRESETS };
if (typeof module !== "undefined" && module.exports) module.exports = root.BOOKS;
})(typeof window !== "undefined" ? window : globalThis);
