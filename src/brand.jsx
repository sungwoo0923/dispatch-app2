// ======================= src/brand.jsx =======================
// 🔷 LogisWeb 브랜드 공용 부품 — 프로그램(PC·모바일)·첫 화면·관리자센터 어디서든 이것만 쓴다
//  · BRAND: 이름 글자(문장 속에 쓰는 이름)
//  · <LogisMark size> : 앱 아이콘과 같은 마크(남색 타일 + 순환 노선 + 입체 트럭)
//  · <LogisWordmark height tag> : 글자 로고 "LOGIS"(흰색) + "WEB"(하늘색 #8FB0F0) — 글꼴 없이 벡터라 어디서나 같은 모양
//      어두운 바탕 위에 그대로 쓴다. 밝은 바탕에서는 <LogisLockup chip>처럼 남색 칩 위에 올려 색감을 지킨다.
import React from "react";
import { MARK_INNER, WORD } from "./brandAssets";

export const BRAND = "LogisWeb";
export const BRAND_UPPER = "LOGISWEB";
export const BRAND_TAGLINE = "LOGISTICS DISPATCH NETWORK";
export const BRAND_WHITE = "#FFFFFF";
export const BRAND_SKY = "#8FB0F0";

let _seq = 0;
export function LogisMark({ size = 40, className = "", style, title = BRAND }) {
  const id = React.useMemo(() => `lw${(_seq += 1)}`, []);
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label={title} className={className}
      style={{ display: "block", flexShrink: 0, ...style }} dangerouslySetInnerHTML={{ __html: MARK_INNER.split("__ID__").join(id) }} />
  );
}

// 글자 로고 — height = 대문자 높이(px). tag면 아래에 LOGISTICS DISPATCH NETWORK
export function LogisWordmark({ height = 16, tag = false, sub = null, logisColor = BRAND_WHITE, webColor = BRAND_SKY, tagColor = "rgba(207,224,255,.55)", className = "", style, title = BRAND }) {
  const w = WORD.lw + WORD.gap + WORD.ww;
  const subPaths = sub === "dispatch" ? WORD.dispatch : tag ? WORD.tag : null;
  const subW = sub === "dispatch" ? WORD.dw : WORD.tw;
  const sc = subPaths ? (sub === "dispatch" ? (w * 0.42) / subW : (w * 0.86) / subW) : 0;
  const gapY = WORD.cap * (sub === "dispatch" ? 0.36 : 0.42);
  const H = subPaths ? WORD.cap + gapY + WORD.tcap * sc : WORD.cap;
  const subX = sub === "dispatch" ? 0 : (w - subW * sc) / 2;
  return (
    <svg viewBox={`0 0 ${w.toFixed(0)} ${H.toFixed(0)}`} height={(height * H) / WORD.cap} role="img" aria-label={title} className={className}
      style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}>
      <g transform={`translate(0 ${-WORD.top})`}>
        <g fill={logisColor}>{WORD.logis.map((d, i) => <path key={i} d={d} />)}</g>
        <g fill={webColor} transform={`translate(${WORD.lw + WORD.gap} 0)`}>{WORD.web.map((d, i) => <path key={i} d={d} />)}</g>
      </g>
      {subPaths && (
        <g fill={tagColor} transform={`translate(${subX} ${WORD.cap + gapY}) scale(${sc}) translate(0 ${-WORD.ttop})`}>
          {subPaths.map((d, i) => <path key={i} d={d} />)}
        </g>
      )}
    </svg>
  );
}

// 마크 + 글자 가로 묶음. chip이면 남색 바탕(밝은 화면에서도 흰색·하늘색 유지)
export function LogisLockup({ mark = 32, word = 14, sub = null, gap = 10, chip = false, className = "", style }) {
  return (
    <span className={`inline-flex items-center ${className}`}
      style={{ gap, ...(chip ? { background: "linear-gradient(120deg,#0B1428,#1B2B4B)", padding: "6px 12px 6px 6px", borderRadius: 14 } : null), ...style }}>
      <LogisMark size={mark} />
      <LogisWordmark height={word} sub={sub} />
    </span>
  );
}
