/* New glossary terms introduced by lesson 09. Merged into finance/glossary.js later. */
Object.assign(window.TERMS, {
 nhataitro:{w:"Finance provider (đơn vị tài trợ)",
   p:"The institution that actually puts up the money — a commercial bank, a general finance company, a factoring company, a foreign bank branch. Only a licensed credit institution may disburse a factoring advance in Vietnam, so a row in the marketplace catalogue is a contact, not a licence. Each provider registers the band of rates it is prepared to quote inside, and that band is the only thing the system may build an estimate from.",
   v:"Đơn vị tài trợ — bên bỏ tiền ra. Chỉ tổ chức tín dụng mới được giải ngân bao thanh toán (Luật Các TCTD 32/2024; TT 20/2024 Điều 2), nên một bản ghi trong marketplace chỉ là đầu mối, không phải giấy phép.",
   r:"scf-service · FinanceProvider (finance_providers), ProviderStatus = ACTIVE | INACTIVE | SUSPENDED — only ACTIVE is asked for a price. min_rate/max_rate are the sole source of an ESTIMATED quote; there is no rating column, it was dropped in V4 because nothing ever filled it (SCF-16, SCF-19)."},
 chaogia:{w:"Quote (báo giá)",
   p:"One provider's answer to one financing request: a rate, a fee in đồng, the amount that would actually land in the account, the number of days, and the moment the price stops being good. A quote is a price with an expiry date, not a rate card — and unlike the system's own estimate, it is the number somebody is willing to sign.",
   v:"Báo giá — câu trả lời của một đơn vị tài trợ cho một đề nghị: lãi suất, phí, số tiền thực nhận, kỳ hạn, hạn hiệu lực. Đây mới là con số có giá trị pháp lý, không phải công thức ước tính trong hệ thống.",
   r:"ProviderQuote (provider_quotes): discount_rate, fee_amount, net_proceeds, tenor_days, valid_until, terms (jsonb), rank_no, status = RECEIVED | SELECTED | DECLINED | EXPIRED. UNIQUE (offer_id, provider_id) — one price per provider per request (SCF-17)."},
 laisuatthucte:{w:"Effective annual rate (lãi suất thực tế)",
   p:"Every cost of the deal added together, divided by the money that actually reached the account, then scaled up to a year over the days the money is genuinely held. It is the only unit in which two differently-worded offers can be compared, and it is almost never the number printed on the offer.",
   v:"Lãi suất thực tế quy năm — tổng chi phí chia cho số tiền thực nhận, quy về một năm theo đúng số ngày dùng tiền. Đây là đơn vị duy nhất so sánh được hai báo giá viết bằng hai kiểu khác nhau.",
   r:"FinancingFormula.effectiveAnnualRatePercent — fee × 36 500 ÷ (requested × tenor), a 365-day year. It is returned by POST /offers/{id}/calculate and by nothing else: MarketplaceCompareResponse.Option carries discount_rate, fee_amount and net_proceeds, and no effective rate at all (SCF-02, SCF-17)."},
 phithuxep:{w:"Arrangement fee (phí thu xếp)",
   p:"A one-off charge for opening the facility, quoted as a percentage of the amount and taken out of the money at drawdown. It is not interest, it does not grow with the number of days, and it is quoted apart from the rate — which is precisely why it falls out of comparisons. It belongs in the numerator with everything else the deal costs.",
   v:"Phí thu xếp — khoản thu một lần khi mở khoản tài trợ, tính theo % số tiền, trừ thẳng lúc giải ngân. Không phải lãi, không theo số ngày, nhưng vẫn phải cộng vào tổng chi phí khi so sánh.",
   r:"No column of its own. fee_amount holds the single number a provider chose to report, and the fee structure behind it belongs in ProviderQuote.terms (jsonb) — which no code path in scf-service currently writes, so it is {} on every row."},
 chietkhauthanhtoansom:{w:"Early-payment discount (chiết khấu thanh toán sớm)",
   p:"Money off the invoice for paying before the agreed date. \"2/10 net 30\" means two percent off if you pay on day ten instead of day thirty. Read as a discount it looks trivial; read as a return on the twenty days of cash you gave up, it is about 37% a year, and it beats every financing rate a marketplace will show you.",
   v:"Chiết khấu thanh toán sớm — bên bán giảm giá nếu trả trước hạn. \"2/10 net 30\" là giảm 2% khi trả ngày thứ 10 thay vì ngày thứ 30; quy ra năm khoảng 37%/năm, cao hơn mọi lãi suất tài trợ trên bảng so sánh.",
   r:"Not modelled — financing_offers price money coming in from a provider, not a discount taken from a supplier. Taking one shortens DPO, so it reaches the system through PaymentSchedule (CF-15) and cash_flow_metrics.dpo_days."}
});
