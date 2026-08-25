/* New glossary terms introduced by lesson 05. Merged into finance/glossary.js later. */
Object.assign(window.TERMS, {
  tuoino:{w:"Aging report (báo cáo tuổi nợ)",
    p:"The total owed, broken into buckets by how far past its due date each piece is: in term, 1–30 days over, 31–60, 61–90, and over 90. One total tells you almost nothing — ten billion all from last fortnight is a healthy business, ten billion with a third of it past ninety days is a company about to write something off. The bucket boundaries are a company setting, not a caption, because different industries collapse at different speeds.",
    v:"Báo cáo tuổi nợ — chia tổng dư nợ theo số ngày quá hạn: trong hạn, 1–30, 31–60, 61–90, trên 90 ngày. Một con số tổng không nói lên điều gì; hình dáng của nó mới nói.",
    r:"credit-service · GET /credit/reports/aging → AgingReportResponse with [current, bucket1..3, over]. Boundaries come from credit_settings.aging_buckets (default [30,60,90]), and only OUTSTANDING and OVERDUE exposures are counted (CM-20)."},
  butrucongno:{w:"Offsetting (bù trừ công nợ)",
    p:"When a partner is both your customer and your supplier, the two debts can cancel each other instead of two payments being wired in opposite directions. No money moves and both obligations are legally extinguished — this is a payment made out of paper, not a tidy-up. The legal basis is Điều 378 Bộ luật Dân sự 2015, offsetting of obligations.",
    v:"Bù trừ công nợ — đối tác vừa nợ mình vừa được mình nợ thì hai khoản triệt tiêu nhau, không bên nào phải chuyển tiền. Căn cứ Điều 378 Bộ luật Dân sự 2015.",
    r:"credit_exposures.offset_amount grows line by line; when amount − offset_amount reaches 0 the exposure becomes SETTLED with settled_date = the date of the minutes. No new status and no new event — offsetting is the second road to settlement (CM-21)."},
  bienbanbutru:{w:"Offset minutes (biên bản bù trừ công nợ)",
    p:"The document both parties sign to record an offset: which debts on each side, how much of each, and the one total that is being cancelled. Three things make it lawful rather than convenient — same partner, same currency, and the two sides totalling exactly the same amount. An unbalanced minutes has no total, so there is nothing for either party to be agreeing to.",
    v:"Biên bản bù trừ công nợ — văn bản hai bên ký, ghi rõ khoản nào bù khoản nào và tổng bị triệt tiêu. Cùng đối tác, cùng loại tiền, tổng hai phía phải bằng nhau tuyệt đối.",
    r:"credit_offsets + credit_offset_lines (lines are append-only, no setters). OffsetStatus is CONFIRMED → CANCELED with no DRAFT. All five invariants are checked in CreditOffsetService.create and return 422 — no CHECK constraint can see across rows (CM-21)."},
  xoasono:{w:"Write-off (xoá sổ nợ)",
    p:"Admitting a debt will never be collected and taking it out of the live books. The money is given up; the record is not. The row stays with everything that led to it, because a write-off is a decision somebody made on a date and the row is the evidence of it. \"We finally deleted those old debts\" describes something else entirely, and something nobody was authorised to do.",
    v:"Xoá sổ nợ — chấp nhận không đòi được nữa. Mất tiền chứ không mất bản ghi: bản ghi vẫn nằm đó làm bằng chứng cho một quyết định có người chịu trách nhiệm.",
    r:"ExposureStatus.WRITTEN_OFF — the row is kept as audit trail (SEC-04). Not the same as a cancelled transaction, where the exposure row is deleted outright because the debt never came into existence; confuse the two and every partner with a cancelled transaction looks like a bad debtor."},
});
