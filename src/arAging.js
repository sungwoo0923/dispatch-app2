// ======================= src/arAging.js =======================
// 💰 2026-11-07 미수금 공용 계산(화면 없이 숫자만) — 회계관리(회계 개요 · 회계 장부)·일일 경영 보고·경영 분석·AI 비서가 같은 방식을 쓴다
//  · 계산은 functions/arCore.mjs 한 곳(서버 AI 비서도 같은 파일) — 여기서는 다시 내보내기만
//  · agingOf(invoices, paid, today): 오래된 청구부터 수금된 것으로 보고 남은 청구를 경과일로 나눈다 → { b30, b60, b90, over, oldest }
//  · receivablesOf({ orders, fixedRows, paid, today }): 올해 배차완료 + 고정거래처 · 청구액 부가세 포함(거래처정산과 같은 식) − 수금 기록
export { agingOf, openInvoices, receivablesOf, arInvoicesByClient, vatIncluded, isArOrder, arClientOf, fixedArRows, paidAmountOf, vatEstimate, isTaxInvoiceSale, isInvoiceDriver, invoiceDriverPlates, AR_VAT_RATE, PREPAID_PAYS, isPrepaidPay, stmtIncludePrepaidOf, statementRowsOf } from "../functions/arCore.mjs";

// 🔗 2026-11-25 받은 돈은 한 곳(정본 = arPayments 입금 기록 — 회계 [입금 처리] · 미수금관리 · 은행 자동 매칭 모두)
//  + 오더에 남은 [정산완료] 달 · 입금 확인 [입금완료] · 예전 회계 [입금 처리] 합계 중 arPayments 와 안 이어진 몫(한 번만 — functions/arCore.mjs arPaidByClient)
//  예전 "둘 중 큰 쪽" 식은 없앴다(새 회계 입금이 정산관리 기록에 묻혀 안 보이던 문제)
export { settlePaidByClient, arPaidByClient, legacyAcctArOf, AR_LEGACY_CUTOFF, arPayDateOf, monthOf, loadYmOf, isSettledIn, settledDateIn } from "../functions/arCore.mjs";
import { arPaidByClient as _apc } from "../functions/arCore.mjs";
// acct: loadAcctPayments 결과({ ar, log }) · arPayments: 입금 기록 목록
export function paidWithSettled(orders, acct = {}, arPayments = [], year = "") {
  return _apc({ orders, arPayments, acct: acct && (acct.ar || acct.log) ? acct : { ar: acct || {} }, year });
}
