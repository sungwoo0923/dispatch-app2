// ======================= src/arAging.js =======================
// 💰 2026-11-07 미수금 공용 계산(화면 없이 숫자만) — 회계관리(회계 개요 · 회계 장부)·일일 경영 보고·경영 분석·AI 비서가 같은 방식을 쓴다
//  · 계산은 functions/arCore.mjs 한 곳(서버 AI 비서도 같은 파일) — 여기서는 다시 내보내기만
//  · agingOf(invoices, paid, today): 오래된 청구부터 수금된 것으로 보고 남은 청구를 경과일로 나눈다 → { b30, b60, b90, over, oldest }
//  · receivablesOf({ orders, fixedRows, paid, today }): 올해 배차완료 + 고정거래처 · 청구액 부가세 포함(거래처정산과 같은 식) − 수금 기록
export { agingOf, openInvoices, receivablesOf, arInvoicesByClient, vatIncluded, isArOrder, arClientOf, fixedArRows, paidAmountOf, vatEstimate, isTaxInvoiceSale, isInvoiceDriver, invoiceDriverPlates, AR_VAT_RATE, PREPAID_PAYS, isPrepaidPay, stmtIncludePrepaidOf, statementRowsOf } from "../functions/arCore.mjs";

// ⭐ 2026-11-18 수금 기록 + 정산관리 [입금완료] 오더(부가세 포함)를 같이 본 거래처별 수금액 — 둘 중 큰 쪽(같은 돈을 두 번 세지 않게)
//  회계 장부 · 회계 개요가 같은 값을 쓴다(지급 쪽이 지급등록액과 [지급완료] 중 큰 쪽을 쓰는 것과 같은 방식)
import { isArOrder as _isAr, arClientOf as _arc, vatIncluded as _vi, paidAmountOf as _pa } from "../functions/arCore.mjs";
export function paidWithSettled(orders, paid = {}) {
  const st = {};
  (orders || []).forEach((r) => { if (_isAr(r) && r.입금상태 === "입금완료") { const c = _arc(r); st[c] = (st[c] || 0) + _vi(parseInt(String(r.청구운임 ?? "0").replace(/[^\d-]/g, ""), 10) || 0); } });
  const out = { ...(paid || {}) };
  Object.entries(st).forEach(([c, v]) => { const p = _pa(out[c]); out[c] = Math.max(p, v); });
  return out;
}
