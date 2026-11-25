// ======================= src/salesRule.js =======================
// 📏 2026-11-25 매출에 넣는 오더 한 규칙(배차완료 기준) — 계산 원본은 functions/salesRule.mjs 하나(서버와 같은 파일)
//  여기서는 다시 내보내기만 한다. 규칙 설명은 functions/salesRule.mjs 맨 위에.
export {
  CANCEL_STATES, isCancelledOrder, isShipperCopy, isDoneOrder, isSalesOrder, salesDateOf, salesMonthOf, salesBillDateOf, salesBillDayOf,
  fixedSalesRow, fixedSalesRows, salesRows, salesTotals, SALES_RULE_LABEL,
} from "../functions/salesRule.mjs";
