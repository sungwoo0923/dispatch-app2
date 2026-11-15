// ======================= src/brand.jsx =======================
// 🔷 LogisWeb 브랜드 공용 부품 — 프로그램(PC·모바일)·첫 화면·관리자센터 어디서든 이것만 쓴다
//  🔷 2026-11-15 로고 색 2차 — 바탕에 맞춰 두 벌(그림은 tools/brand/make-logo-assets.py 가 만든다)
//    어두운 바탕(기본) : 마크 /brand/logisweb-mark.png · 글자 /brand/logisweb-wordmark.png (LOGIS 흰색 · WEB #7A93C4) — 투명 바탕
//    밝은 바탕(light)  : 마크 /brand/logisweb-mark-onlight.png · 글자 /brand/logisweb-wordmark-onlight.png (LOGIS #14213D · WEB #3A5590)
//    → 밝은 화면에서 남색 칩을 따로 깔지 않는다. 예전 chip 옵션은 "밝은 바탕용 로고"로 바꿔 보여 준다.
//  · BRAND: 이름 글자(문장 속에 쓰는 이름)
//  · <LogisMark size light> : LW 마크(투명 바탕)
//  · <LogisWordmark height tag light> : 글자 로고 LOGISWEB
import React from "react";
import { WORD } from "./brandAssets";

export const BRAND = "LogisWeb";
export const BRAND_UPPER = "LOGISWEB";
export const BRAND_TAGLINE = "LOGISTICS DISPATCH NETWORK";
export const BRAND_WHITE = "#FFFFFF"; // 로고 LOGIS 색(어두운 바탕)
export const BRAND_SKY = "#7A93C4";   // 로고 WEB 색(어두운 바탕)
export const BRAND_NAVY = "#14213D";  // 로고 LOGIS 색(밝은 바탕)
export const BRAND_BLUE = "#3A5590";  // 로고 WEB 색(밝은 바탕)
export const MARK_SRC = "/brand/logisweb-mark.png";
export const MARK_LIGHT_SRC = "/brand/logisweb-mark-onlight.png";
export const WORD_SRC = "/brand/logisweb-wordmark.png";
export const WORD_LIGHT_SRC = "/brand/logisweb-wordmark-onlight.png";
export const LOGO_SRC = "/brand/logisweb-logo.png";
export const WORD_RATIO = 8.8736; // 글자 로고 가로 ÷ 세로(make-logo-assets.py 가 알려 준 값 · 1544×174)
const LIGHT_TAG = "rgba(20,33,61,.5)"; // 밝은 바탕에서 아래 작은 글자 색

// light = 밝은 바탕(흰색 · #EEF1F6 · #F2F4F8 등) 위에 놓을 때
export function LogisMark({ size = 40, light = false, className = "", style, title = BRAND }) {
  return (
    <img src={light ? MARK_LIGHT_SRC : MARK_SRC} width={size} height={size} alt={title} draggable={false} className={className}
      style={{ display: "block", flexShrink: 0, width: size, height: size, objectFit: "contain", ...style }} />
  );
}

// 글자 로고 — height = 글자 높이(px). tag면 아래에 LOGISTICS DISPATCH NETWORK · sub="dispatch"면 DISPATCH
//  🔷 2026-11-15 light 면 밝은 바탕용 글자(남색 · 파랑)
export function LogisWordmark({ height = 16, tag = false, sub = null, light = false, tagColor, className = "", style, title = BRAND }) {
  const w = height * WORD_RATIO;
  if (!tagColor) tagColor = light ? LIGHT_TAG : "rgba(207,214,228,.6)";
  const img = <img src={light ? WORD_LIGHT_SRC : WORD_SRC} alt={title} draggable={false} style={{ display: "block", height, width: w }} />;
  const subPaths = sub === "dispatch" ? WORD.dispatch : tag ? WORD.tag : null;
  if (!subPaths) return <span className={className} style={{ display: "block", flexShrink: 0, lineHeight: 0, ...style }}>{img}</span>;
  const subW = sub === "dispatch" ? WORD.dw : WORD.tw;
  const sw = w * (sub === "dispatch" ? 0.42 : 0.86);
  const sh = (sw * WORD.tcap) / subW;
  return (
    <span className={className} style={{ display: "inline-flex", flexDirection: "column", alignItems: sub === "dispatch" ? "flex-start" : "center", gap: height * (sub === "dispatch" ? 0.36 : 0.42), flexShrink: 0, lineHeight: 0, ...style }}>
      {img}
      <svg viewBox={`0 ${WORD.ttop} ${subW} ${WORD.tcap}`} width={sw} height={sh} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
        <g fill={tagColor}>{subPaths.map((d, i) => <path key={i} d={d} />)}</g>
      </svg>
    </span>
  );
}

// 마크 + 글자 가로 묶음. light(예전 이름 chip)면 밝은 바탕용 로고 — 칩은 깔지 않는다(2026-11-15)
export function LogisLockup({ mark = 32, word = 14, sub = null, gap = 10, chip = false, light = false, className = "", style }) {
  const lt = light || chip;
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap, ...style }}>
      <LogisMark size={mark} light={lt} />
      <LogisWordmark height={word} sub={sub} light={lt} />
    </span>
  );
}

// 인쇄 문서(새 창에 HTML 글자로 쓰는 견적서·보고서)용 — 글자 로고 <img> 문자열. 기본은 어두운 바탕용, light 면 흰 종이용
export function logisWordmarkSvg(height = 10, light = false) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<img src="${origin}${light ? WORD_LIGHT_SRC : WORD_SRC}" alt="${BRAND}" height="${height}" width="${(height * WORD_RATIO).toFixed(1)}" style="display:inline-block;vertical-align:middle" />`;
}

// 영문 머리말 태그 —예전 "KP-FLOW · OPERATIONS DECK"처럼 이름 + 구역명을 쓰던 곳.
//  이름 자리는 글자 로고로 그리고, 뒤의 " · 구역명"은 부모 글씨 모양(색·글꼴)을 그대로 따른다.
//  light(예전 이름 chip)면 밝은 바탕용 글자 로고 — 2026-11-15부터 남색 칩은 깔지 않는다
export function LogisTag({ height = 8, text = "", chip = false, light = false, gap = 6, className = "", style }) {
  return (
    <span className={`inline-flex items-center align-middle ${className}`} style={{ gap, whiteSpace: "nowrap", ...style }}>
      <LogisWordmark height={height} light={light || chip} />
      {text ? <span>· {text}</span> : null}
    </span>
  );
}
