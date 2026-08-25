/* New glossary terms introduced by lesson 10. Merged into finance/glossary.js later. */
Object.assign(window.TERMS, {
 ngansach:{w:"Budget (ngân sách)",
   p:"A company deciding in advance how much a department, project or category may spend in a period — and then holding people to it. It is permission, not prediction: a forecast says what will probably happen, a budget says what is allowed to happen. That is why the number does not move when reality disagrees with it; somebody has to change it on purpose.",
   v:"Ngân sách — quyết định trước rằng một phòng ban, dự án hay danh mục được chi bao nhiêu trong kỳ. Là sự cho phép, không phải dự báo: dự báo nói điều sắp xảy ra, ngân sách nói điều được phép xảy ra.",
   r:"budget-service · Budget, table budgets. scope_type = COMPANY | DEPARTMENT | PROJECT | CATEGORY (BM-01), period_type = MONTHLY | QUARTERLY | ANNUAL (BM-02), status DRAFT → PENDING_APPROVAL → ACTIVE → LOCKED → CLOSED. Only ACTIVE takes part in the spending check."},
 phanbo:{w:"Allocation (phân bổ ngân sách)",
   p:"Cutting one line's plan across the periods of the year, so that spending a whole quarter's money in January is visible as a problem rather than as ordinary progress. Either split evenly, or given period by period when the money is genuinely lumpy — a trade fair in March is not one twelfth per month.",
   v:"Phân bổ ngân sách — chia kế hoạch của một dòng ra từng kỳ, chia đều hoặc theo lịch cụ thể. Nhờ vậy tiêu hết tiền cả quý ngay trong tháng đầu mới nhìn ra là bất thường.",
   r:"BudgetAllocation, table budget_allocations, AllocationMode = EVEN | MANUAL (BM-03). The sum of allocated_amount for a line must equal that line's planned_amount — enforced in BudgetAllocationService, not by a CHECK, because it spans two tables."},
 camket:{w:"Commitment (cam kết ngân sách)",
   p:"Money that has been approved but not yet paid. A purchase order signed on Monday is gone even though the bank balance has not moved — the company is contractually obliged and the budget must already know. This is the state everybody forgets, and forgetting it is how two spends that each fit are approved on the same afternoon and together do not.",
   v:"Cam kết ngân sách — tiền đã được duyệt nhưng chưa chi. Đơn hàng ký hôm thứ hai là tiền đã mất, dù số dư ngân hàng chưa động. Quên trạng thái này là lý do hai khoản chi cùng được duyệt rồi cùng vượt hạn mức.",
   r:"BudgetCommitment, table budget_commitments, CommitmentStatus = COMMITTED | CONSUMED | RELEASED (BM-10), held on budget_lines.committed_amount. UNIQUE (budget_line_id, transaction_id) is the last line of defence against a redelivered Kafka event committing the same money twice."},
 thucchi:{w:"Actual spend (thực chi)",
   p:"Money that has genuinely left the account against this budget line. It arrives late in the story: a spend is planned, then committed at approval, and only becomes actual on the day the payment executes. A budget report that shows actual alone is showing you the past, several weeks after the decisions that produced it were made.",
   v:"Thực chi — tiền đã thật sự rời khỏi tài khoản cho dòng ngân sách này. Chỉ ghi nhận vào ngày thanh toán chạy, tức là sau quyết định chi vài tuần.",
   r:"budget_lines.actual_amount (BM-06, BM-08). Written when transaction.executed arrives: the commitment moves COMMITTED → CONSUMED, committed_amount goes down and actual_amount goes up by the same figure — total used does not change at that moment."},
 chenhlech:{w:"Variance (chênh lệch ngân sách)",
   p:"The gap between what was allowed and what has been used, reported at the end of a period and watched during it. Positive means money left unspent; negative means the line is over. The interesting question is never the size of the gap but its cause — a cheaper supplier and a project that never started produce the same number and mean opposite things.",
   v:"Chênh lệch ngân sách — khoảng cách giữa kế hoạch và số đã dùng. Dương là còn dư, âm là đã vượt. Điều đáng hỏi không phải độ lớn của chênh lệch mà nguyên nhân của nó.",
   r:"BudgetUtilizationRow.varianceAmount (BM-11) = planned − (committed + actual) — note that commitments are subtracted, so the field carries exactly the same value as availableAmount beside it, and both are the generated column budget_lines.available_amount."}
});
