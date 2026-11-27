// ======================= src/payCore.js =======================
// 💸 2026-11-25 지급한 금액 기록(순수 함수 — 화면 · 테스트 같이 씀, scripts/payCore.test.mjs)
//
// 문제: [지급완료] 뒤에 기사운임을 고치거나 오더를 취소하면, 장부(acctLedger "기사운임 지급" 지급일별 합계)는
//  예전 금액인데 [지급 취소]는 지금 기사운임을 빼서 장부가 틀어졌다(10만 지급 → 12만 수정 → 지급 취소 → 장부 −2만).
// 해결:
//  · 지급완료 때 오더에 지급액(그때 기사운임) · 지급액기록일을 남긴다. 장부 더하기 · 빼기는 늘 지급액으로.
//    예전 오더(지급액 없음)는 지금 기사운임으로 본다(예전과 같음).
//  · 지급 뒤 기사운임이 바뀌면 장부는 그대로 두고 "지급 후 운임 변경 N원"으로 표시 → [추가 지급]/[환수 처리]를 눌러야
//    오더별 조정 한 줄(auto_drvpayadj_회사_오더ID, 금액은 누적 조정액 — 여러 번 눌러도 같은 값)로 장부에 들어간다.
//  · 지급 뒤 취소(차량 빼기 · 배차취소)는 장부를 건드리지 않고 "지급 후 취소"로 표시. [지급 취소]를 누르면 지급액만큼 빠진다.
//  · 지입차 일괄 지급명세서로 지급한 오더(지급명세서ID)는 명세서 한 줄이 장부에 들어가므로 오더별 줄은 만들지 않는다.

export const toInt = (v) => { const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : 0; };
export const CANCEL_STATES = ["취소", "배차취소", "오더취소", "취소됨"];
export const isPaidOrder = (o) => String(o?.지급상태 || "") === "지급완료";
const hasVal = (v) => v != null && String(v).trim() !== "";

// 장부 지급일 줄에 들어간 금액(지급완료 때 기록) — 없으면(예전 오더) 지금 기사운임
export const basePaidOf = (o) => (hasVal(o?.지급액) ? toInt(o.지급액) : toInt(o?.기사운임));
export const adjPaidOf = (o) => toInt(o?.지급조정액);
// 실제로 기사님께 준 돈(지급완료가 아니면 0)
export const paidTotalOf = (o) => (isPaidOrder(o) ? basePaidOf(o) + adjPaidOf(o) : 0);
// 지급 뒤 운임 변경 차액: + 더 줘야 함(추가 지급) · − 더 줬음(환수)
export const payGapOf = (o) => (isPaidOrder(o) ? toInt(o?.기사운임) - paidTotalOf(o) : 0);
export const isPaidThenCanceled = (o) => isPaidOrder(o) && !!o?.지급후취소;

const CLEAR = { 지급액: null, 지급액기록일: null, 지급조정액: null, 지급조정일: null, 지급후취소: null, 지급부가세: null };

// 💸 2026-11-27 세금계산서 받는 기사(기사관리 '세금계산서 발행') — 실제 이체액 = 기사운임 + 부가세 10%
//  오더의 지급액은 그대로 공급가(기사운임)라 지급 후 운임 변경 계산은 예전과 같고, 부가세는 지급부가세 칸에 따로 남긴다.
//  장부 줄 금액 = 지급액 + 지급부가세(통장에서 나간 돈), 공급가 · 부가세 칸도 같이 쌓는다
export const PAY_VAT_RATE = 0.1;
export const paidVatOf = (o) => toInt(o?.지급부가세);
const vatOn = (amount, rate) => (rate ? Math.round(toInt(amount) * rate) : 0);
const bump = (date, supply, vat, count) => ({ date, amount: supply + vat, supply, vat, count });
// 이체할 금액(확인창 · 대량이체와 같은 식) — invoice: 세금계산서 받는 기사인지
export const payTransferOf = (o, invoice) => { const f = toInt(o?.기사운임); const v = invoice ? vatOn(f, PAY_VAT_RATE) : 0; return { supply: f, vat: v, total: f + v }; };

// 지급 상태 바꾸기 → { patch, bumps:[{date, amount, count}], adjAmount: null(그대로) | 숫자(조정 줄을 이 금액으로, 0이면 지움) }
//  next: { status: "지급완료" | "지급중", date, keepAmount }  keepAmount = 지급일만 옮기기(금액 그대로)
export function payLedgerPlan(row, next = {}, today = "") {
  const status = next.status === "지급완료" ? "지급완료" : "지급중";
  const date = status === "지급완료" ? String(next.date || today || "").slice(0, 10) : "";
  const was = isPaidOrder(row);
  const fare = toInt(row?.기사운임);
  const base = basePaidOf(row);
  const baseVat = paidVatOf(row); // 지급 때 같이 이체한 부가세(예전 오더 · 계산서 안 받는 기사는 0)
  const rate = next.vatRate ? Number(next.vatRate) : 0; // 💸 2026-11-27 세금계산서 받는 기사면 0.1
  const oldDate = String(row?.지급일 || today || "").slice(0, 10);
  const viaStatement = !!row?.지급명세서ID; // 장부는 지급명세서 한 줄로
  const bumps = [];
  let patch; let adjAmount = null;
  if (status === "지급완료" && was && next.keepAmount) {
    patch = { 지급상태: "지급완료", 지급일: date, ...(hasVal(row?.지급액) ? {} : { 지급액: base, 지급액기록일: today }) };
    if (date !== oldDate && base) bumps.push(bump(oldDate, -base, -baseVat, -1), bump(date, base, baseVat, 1));
  } else if (status === "지급완료") {
    const vat = vatOn(fare, rate);
    patch = { 지급상태: "지급완료", 지급일: date, 지급액: fare, 지급액기록일: today, 지급조정액: null, 지급조정일: null, 지급후취소: null, 지급부가세: vat || null };
    if (was && base) bumps.push(bump(oldDate, -base, -baseVat, -1));
    if (fare) bumps.push(bump(date, fare, vat, 1));
    if (adjPaidOf(row)) adjAmount = 0;
  } else {
    patch = { 지급상태: status, 지급일: "", ...CLEAR };
    if (was && base) bumps.push(bump(oldDate, -base, -baseVat, -1));
    if (adjPaidOf(row)) adjAmount = 0;
  }
  return { patch, bumps: viaStatement ? [] : bumps, adjAmount: viaStatement ? null : adjAmount };
}

// [추가 지급]/[환수 처리] — 차액을 조정 줄로(누적 금액이라 여러 번 눌러도 같은 값). 차액이 없으면 null
export function settleGapPlan(row, today = "") {
  const gap = payGapOf(row);
  if (!gap) return null;
  const adj = adjPaidOf(row) + gap;
  // 💸 2026-11-27 지급 때 부가세를 같이 이체한 오더면 조정액의 부가세도(장부 = 조정액 + 부가세)
  const adjVat = paidVatOf(row) ? vatOn(adj, PAY_VAT_RATE) : 0;
  return { gap, adjAmount: adj, adjVat, patch: { 지급조정액: adj, 지급조정일: today, ...(hasVal(row?.지급액) ? {} : { 지급액: basePaidOf(row), 지급액기록일: today }) } };
}

// 오더 수정(patchDispatch) 전 확인 — 지급완료 오더의 기사운임 변경 · 취소
//  → { warn: "" | 문구, extra: 같이 저장할 칸 }  (예전 오더는 바꾸기 전 기사운임을 지급액으로 고정)
export function paidEditGuard(prev, patch = {}, today = "") {
  if (!prev || !isPaidOrder(prev)) return { warn: "", extra: {} };
  const extra = {};
  const lock = () => { if (!hasVal(prev.지급액)) { extra.지급액 = toInt(prev.기사운임); extra.지급액기록일 = today; } };
  const fareChanged = "기사운임" in patch && toInt(patch.기사운임) !== toInt(prev.기사운임);
  const plateCleared = "차량번호" in patch && !String(patch.차량번호 || "").trim() && String(prev.차량번호 || "").trim();
  const canceled = plateCleared || CANCEL_STATES.includes(String(patch.배차상태 || "")) || CANCEL_STATES.includes(String(patch.상태 || ""));
  const who = `${prev.이름 || "기사님"}${prev.차량번호 ? `(${prev.차량번호})` : ""}`;
  const paid = paidTotalOf(prev).toLocaleString();
  let warn = "";
  if (canceled && !prev.지급후취소) {
    lock();
    extra.지급후취소 = { at: today, 차량번호: String(prev.차량번호 || ""), 이름: String(prev.이름 || ""), 지급액: paidTotalOf(prev) };
    warn = `이미 지급한 오더예요.\n${who}께 ${paid}원을 지급했어요.\n취소해도 장부의 지급 기록은 그대로 남고, 용차지급관리에 "지급 후 취소"로 표시돼요.\n돈을 돌려받았다면 용차지급관리에서 [지급 취소]를 눌러 주세요.`;
  } else if (fareChanged) {
    lock();
    const nextGap = toInt(patch.기사운임) - (hasVal(prev.지급액) ? toInt(prev.지급액) : toInt(prev.기사운임)) - adjPaidOf(prev);
    warn = `이미 지급한 오더예요.\n${who}께 ${paid}원을 지급했어요.\n기사운임을 ${toInt(patch.기사운임).toLocaleString()}원으로 바꾸면 장부는 그대로 두고, 용차지급관리에 "지급 후 운임 변경 ${nextGap > 0 ? "+" : ""}${nextGap.toLocaleString()}원"으로 표시돼요.\n그래도 바꿀까요?`;
  }
  return { warn, extra };
}
// 지급완료 오더 삭제 전 확인 문구(없으면 "")
export function paidDeleteWarn(list = []) {
  const paid = (list || []).filter((o) => o && isPaidOrder(o));
  if (!paid.length) return "";
  const sum = paid.reduce((s, o) => s + paidTotalOf(o), 0);
  return `이미 지급한 오더가 ${paid.length}건(${sum.toLocaleString()}원) 있어요.\n지워도 장부의 지급 기록은 그대로 남아요.\n돈을 돌려받았다면 먼저 용차지급관리에서 [지급 취소]를 눌러 주세요.\n그래도 지울까요?`;
}

// ── 지입차 일괄 지급명세서 [지급 완료] ──
// 명세서에 들어간 오더 → 지급완료 패치(지급명세서ID로 연결, 장부는 명세서 한 줄)
export function statementPayPatch(order, { stmtId, date, today = "" }) {
  return { 지급상태: "지급완료", 지급일: String(date || today).slice(0, 10), 지급액: toInt(order?.기사운임 ?? order?.fare), 지급액기록일: today, 지급명세서ID: stmtId, 지급조정액: null, 지급조정일: null, 지급후취소: null };
}
// [지급 취소] — 이 명세서로 지급한 오더만 되돌린다(다른 경로로 지급한 오더는 그대로)
export function statementUnpayPatch(order, stmtId) {
  if (!order || order.지급명세서ID !== stmtId) return null;
  return { 지급상태: "지급중", 지급일: "", 지급명세서ID: null, ...CLEAR };
}
