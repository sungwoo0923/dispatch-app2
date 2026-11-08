// ======================= functions/dispatchStatusCore.mjs =======================
// 🚚 2026-11-07 배차상태 공용 규칙(화면 없이 숫자만) — PC · 모바일 · 엑셀 올리기 · 서버 알림톡 트리거가 같은 기준을 쓴다
//  (화면은 src/dispatchStatus.js가 다시 내보낸다)
//  · 지급방식 "취소" → 배차취소(배차현황 목록에서 빠짐)
//  · 지입 기사 수락 전(기사확인상태 "대기") → 승인대기
//  · 차량번호가 있으면 배차완료(기사 이름·연락처는 기사관리에서 채워질 뿐 조건이 아니다) · 없으면 배차중
const CANCELED_STATES = ["취소", "배차취소", "오더취소", "취소됨"];

export const isPayCancel = (v) => String(v ?? "").trim() === "취소";
export const hasPlate = (o) => !!String(o?.차량번호 ?? "").trim();

export function dispatchStatusOf(o = {}) {
  if (isPayCancel(o.지급방식)) return "배차취소";
  if (hasPlate(o) && o.기사확인상태 === "대기") return "승인대기";
  return hasPlate(o) ? "배차완료" : "배차중";
}

// 지급방식을 바꿀 때 같이 바꿀 배차상태 — 바꿀 게 없으면 {}
//  · "취소"로 바꾸면 배차취소 · "취소"였던 걸 다른 값으로 바꾸면 차량번호 기준으로 되돌린다
//  · 화주사가 취소한 오더(상태 "취소" 등)는 지급방식만 바꿔서는 되살리지 않는다
//  · next: 이번 저장에서 함께 바뀌는 칸(차량번호 등)
export function payTypeStatusPatch(prev = {}, nextPay, next = {}) {
  const prevStatus = String(prev?.배차상태 ?? "").trim();
  if (isPayCancel(nextPay)) return prevStatus === "배차취소" ? {} : { 배차상태: "배차취소" };
  if (prevStatus !== "배차취소") return {};
  if (!isPayCancel(prev?.지급방식) && CANCELED_STATES.includes(String(prev?.상태 ?? "").trim())) return {};
  return { 배차상태: dispatchStatusOf({ ...prev, ...next, 지급방식: nextPay }) };
}
