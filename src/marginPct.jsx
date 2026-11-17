// ======================= src/marginPct.jsx =======================
// ⭐ 2026-11-17 정산관리 — 수익 · 수수료 옆에 "매출 대비 몇 %"를 같이 보여 주는 작은 조각(PC · 모바일 같은 모양)
//  · 1,200,000 (12.5%) — 플러스는 빨강 · 마이너스는 파랑 · 0이거나 매출이 없으면 회색(또는 숨김)
//  · 색은 정산관리 수수료 합계 색(플러스 빨강 · 마이너스 파랑)과 같다
import React from "react";

export const MARGIN_RED = "#E5484D";
export const MARGIN_BLUE = "#2D6BE0";
export const MARGIN_GRAY = "#9AA9C3";

// 매출 대비 비율(%) — 매출이 0이면 null
export function marginRate(profit, sales) {
  const s = Number(sales) || 0;
  if (!s) return null;
  return ((Number(profit) || 0) / s) * 100;
}

// "12.5%" · "-3.0%" — 매출이 없으면 ""
export function marginPctText(profit, sales, digits = 1) {
  const r = marginRate(profit, sales);
  if (r == null || !Number.isFinite(r)) return "";
  return `${r.toFixed(digits)}%`;
}

export const marginColor = (profit, sales, { dark = false } = {}) => {
  const r = marginRate(profit, sales);
  if (r == null || Math.abs(r) < 0.05) return dark ? "rgba(255,255,255,0.55)" : MARGIN_GRAY;
  if (r > 0) return dark ? "#FF8A8E" : MARGIN_RED;
  return dark ? "#8FB0F0" : MARGIN_BLUE;
};

// <MarginPct profit={수익} sales={매출} /> → "(12.5%)"
//  hideZero: 매출이 없거나 0%면 아무것도 안 그림 · dark: 남색 바탕 위(밝은 빨강 · 밝은 파랑)
export function MarginPct({ profit, sales, hideZero = false, dark = false, paren = true, digits = 1, className = "", style = null }) {
  const r = marginRate(profit, sales);
  const zero = r == null || !Number.isFinite(r) || Math.abs(r) < 0.05;
  if (zero && (hideZero || r == null)) return null;
  const txt = `${(zero ? 0 : r).toFixed(digits)}%`;
  return (
    <span className={`ml-1 text-[0.86em] font-bold whitespace-nowrap ${className}`} style={{ color: marginColor(profit, sales, { dark }), fontVariantNumeric: "tabular-nums", ...(style || {}) }}
      title="매출 대비 비율" data-kp="margin-pct">
      {paren ? `(${txt})` : txt}
    </span>
  );
}

// <MarginAmt profit sales /> → "1,200,000원 (12.5%)" — 금액 색도 같은 규칙
export function MarginAmt({ profit, sales, unit = "", dark = false, colorAmount = false, className = "", hideZero = false }) {
  const v = Math.round(Number(profit) || 0);
  return (
    <span className={`whitespace-nowrap ${className}`} style={colorAmount ? { color: marginColor(profit, sales, { dark }) } : undefined}>
      {v.toLocaleString()}{unit}<MarginPct profit={profit} sales={sales} dark={dark} hideZero={hideZero} />
    </span>
  );
}

// ⭐ 2026-11-17 이익 · 수익 · 수수료 · 마진 · 순이익 금액 색 — 플러스 빨강 · 마이너스 파랑 · 0은 원래 글자색(한국 금융 표기)
//  · profitColor(v) → 색 문자열(0이면 neutral — 기본 undefined = 원래 글자색 그대로)
//  · dark: 남색 바탕 위(밝은 빨강 · 밝은 파랑)
export const profitColor = (v, { dark = false, neutral = undefined } = {}) => {
  const n = Number(v) || 0;
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return neutral;
  if (n > 0) return dark ? "#FF8A8E" : MARGIN_RED;
  return dark ? "#8FB0F0" : MARGIN_BLUE;
};
// className 으로 쓰기 — 플러스 "text-[#E5484D]" · 마이너스 "text-[#2D6BE0]" · 0이면 neutral(기본 "")
export const profitCls = (v, neutral = "") => {
  const n = Number(v) || 0;
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return neutral;
  return n > 0 ? "text-[#E5484D]" : "text-[#2D6BE0]";
};
export const profitRateCls = (pct, neutral = "") => {
  const r = Number(pct) || 0;
  if (!Number.isFinite(r) || Math.abs(r) < 0.05) return neutral;
  return r > 0 ? "text-[#E5484D]" : "text-[#2D6BE0]";
};
// style 에 펼쳐 쓰기 — style={{ ...profitStyle(v) }}
export const profitStyle = (v, opts) => { const c = profitColor(v, opts); return c ? { color: c } : {}; };
// 이익률(%) 색 — 0.05% 미만은 0으로 본다
export const profitRateColor = (pct, { dark = false, neutral = undefined } = {}) => {
  const r = Number(pct) || 0;
  if (!Number.isFinite(r) || Math.abs(r) < 0.05) return neutral;
  if (r > 0) return dark ? "#FF8A8E" : MARGIN_RED;
  return dark ? "#8FB0F0" : MARGIN_BLUE;
};

// <ProfitAmt value={이익} /> → "1,200,000"(빨강/파랑) · children 을 주면 그 글자를 같은 색으로
//  format: (v) => 글자(기본 toLocaleString) · unit: 뒤 글자 · sales 를 주면 옆에 (12.5%)
export function ProfitAmt({ value, children, format, unit = "", dark = false, sales, hideZeroPct = true, className = "", style = null }) {
  const v = Number(value) || 0;
  const txt = children != null ? children : (format ? format(v) : Math.round(v).toLocaleString());
  return (
    <span className={`whitespace-nowrap ${className}`} style={{ fontVariantNumeric: "tabular-nums", ...(style || {}), ...profitStyle(v, { dark }) }} data-kp="profit-amt">
      {txt}{unit}{sales != null && <MarginPct profit={v} sales={sales} dark={dark} hideZero={hideZeroPct} />}
    </span>
  );
}
