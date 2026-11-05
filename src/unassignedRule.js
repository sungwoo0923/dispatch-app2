// src/unassignedRule.js — 미배차 판정 한 가지 기준(PC·모바일·고정노선현황 공용)
// ⭐ 2026-11-05 PC·모바일 일치 — 예전엔 PC(DispatchApp)·모바일(MobileApp)·고정노선 머리띠가 각자 비슷한 규칙을 따로 들고 있어
//   메뉴 숫자와 목록 건수가 화면마다 1~2건씩 달랐다. 여기 하나만 쓴다.
export const UNASSIGNED_CANCELED = ["취소", "배차취소", "오더취소", "취소됨"];
export const isUnassignedOrder = (r) => {
  if (!r) return false;
  const st = String(r.배차상태 || "").trim();
  if (st && st !== "배차중") return false; // 승인대기·배차완료·배차취소 등은 미배차가 아님
  if (String(r.차량번호 || "").trim()) return false; // 차량이 이미 붙은 오더는 배차된 것
  if (UNASSIGNED_CANCELED.includes(String(r.상태 || "").trim()) || r.지급방식 === "취소") return false;
  if (r.source === "transport_transmit") return false;
  if (!String(r.상차지명 || "").trim() && !String(r.하차지명 || "").trim()) return false; // 빈 줄(상·하차지 없음)
  if (!String(r.상차일 || "").trim()) return false; // 날짜 없는 오더
  return true;
};
// 같은 오더(같은 문서)가 실시간·예전 오더 양쪽에서 들어와도 한 번만
export const pickUnassignedOrders = (rows) => {
  const seen = new Set();
  return (rows || []).filter((r) => {
    if (!isUnassignedOrder(r)) return false;
    const k = `${r.__col || ""}/${r._id || ""}`;
    if (r._id && seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
