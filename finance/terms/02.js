/* New glossary terms introduced by lesson 02. Merged into finance/glossary.js later. */
Object.assign(window.TERMS, {
 vat:{w:"VAT (thuế giá trị gia tăng)",
   p:"A tax the buyer pays and the seller merely collects on the state's behalf. An invoice for 100 million of goods is presented at 110 million; the extra 10 million lands in the company's bank account and belongs to the tax authority from the moment it arrives. The company holds it until the declaration period, then hands it over. Treat it as revenue and every margin figure on the screen is ten percent too generous.",
   v:"Thuế GTGT — người mua chịu, doanh nghiệp chỉ thu hộ nhà nước rồi nộp lại. Tiền thuế nằm trong tài khoản nhưng chưa bao giờ là tiền của mình.",
   r:"invoices.net_amount + tax_amount = total_amount, held together by ck_invoices_total. The declaration side lives in transaction-service · TransactionTax with TaxType = VAT and declare_status NOT_DECLARED → DECLARED → PAID (TM-08)."},
 hoadondientu:{w:"E-invoice (hoá đơn điện tử)",
   p:"An invoice that exists as a signed electronic record with a code issued by the tax authority, not as a piece of paper. The state holds its own copy, so the seller's system is a second copy rather than the original. That is the reason so many rules here read as refusals: the document is not yours to edit.",
   v:"Hoá đơn điện tử — chứng từ ký số, có mã do cơ quan thuế cấp; nhà nước giữ bản của họ nên hệ thống của mình chỉ là bản sao thứ hai.",
   r:"invoices.invoice_series, tax_lookup_code, seller_tax_code, buyer_tax_code, and verification_status = UNVERIFIED | VERIFIED_MANUAL (SCF-01, P1). This system only records the result of issuing — the signing happens in external invoice software."},
 dieuchinh:{w:"Adjustment / replacement invoice (hoá đơn điều chỉnh / thay thế)",
   p:"The two legal ways to correct an issued invoice, now that cancelling one is not. A replacement voids the original whole and carries the debt across; an adjustment leaves the original standing and books the difference. Both are new records that point back at the invoice they correct — neither is a state of the original.",
   v:"Hai cách hợp pháp để sửa một hoá đơn đã phát hành: thay thế (vô hiệu hoá bản gốc) hoặc điều chỉnh (giữ bản gốc, ghi phần chênh). Cả hai đều là bản ghi mới.",
   r:"invoices.original_invoice_id + adjustment_kind = REPLACEMENT | ADJUSTMENT, forced to travel together by ck_invoices_adjustment. A replacement moves the original to status REPLACED (NĐ 70/2025/NĐ-CP, 06 §5)."},
 phanbothanhtoan:{w:"Payment allocation (phân bổ thanh toán)",
   p:"Deciding which invoices one incoming transfer pays off. A customer sends one round sum against four invoices, so somebody has to say how much of it lands where. When nobody says, the system settles the oldest due date first. Every slice is a row, and the invoice's paid amount is nothing but the sum of those rows.",
   v:"Phân bổ thanh toán — gạch một khoản tiền về vào các hoá đơn. Không ai chỉ định thì gạch theo hạn cũ nhất trước (FIFO).",
   r:"invoice_payments, at most one row per (invoice, transaction) — uk_invoice_payments_invoice_txn, the guard against double-crediting a redelivered Kafka message. allocation_method = MANUAL | FIFO; invoices.paid_amount is recomputed from the sum, never incremented (TM-21)."},
 quahan:{w:"Overdue (quá hạn)",
   p:"Past the due date with money still outstanding. It sounds like something a user reports, and it is not: it falls out of comparing two values the system already holds. Nobody presses a button, and the invoice does not have to be touched for it to happen.",
   v:"Quá hạn — đã qua ngày đến hạn mà chưa thu đủ. Không ai bấm nút; hệ thống tự suy ra từ due_date.",
   r:"InvoiceStatus.OVERDUE, set by the nightly scf job on due_date < today AND paid_amount < total_amount, for statuses ISSUED, PARTIALLY_PAID, FINANCING and FINANCED (06 §5.1, SCF-03). It publishes no event — credit-service counts its own days_overdue independently."}
});
