// ======================= src/urgentOrder.jsx =======================
// ⭐ 2026-11-06 긴급 오더 눈에 띄게 — 실시간배차현황·배차현황·미배차현황·고정노선현황·모바일 카드 공용
//   · 등록할 때 켜는 "긴급" 칩(form.긴급 = true)을 그대로 읽는다
//   · 줄: 빨간 왼쪽 막대 + 연한 빨강 바탕 / 칸: "긴급" 빨간 알약
import React from "react";

export const isUrgentOrder = (r) => !!r && (r.긴급 === true || r.긴급 === "true" || r.긴급 === "Y");

// 표 줄(<tr>)에 붙이는 스타일 — 왕복(남색 막대)보다 긴급이 우선
export const URGENT_BAR = "#DC2626";
export const URGENT_TINT = "#FEF2F2";
export function urgentRowStyle(r, base = {}, { tint = true } = {}) {
  if (!isUrgentOrder(r)) return base;
  return { ...base, borderLeft: `4px solid ${URGENT_BAR}`, boxShadow: `inset 4px 0 0 ${URGENT_BAR}`, ...(tint ? { backgroundColor: URGENT_TINT } : {}) };
}

export function UrgentBadge({ row, className = "", size = "sm" }) {
  if (row && !isUrgentOrder(row)) return null;
  const sz = size === "lg" ? "text-[12px] px-2 py-[2px]" : "text-[11px] px-1.5 py-[1px]";
  return (
    <span data-urgent-badge="1" title="긴급 오더"
      className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-md bg-[#DC2626] text-white font-black leading-[1.35] align-middle ${sz} ${className}`}>
      긴급
    </span>
  );
}
