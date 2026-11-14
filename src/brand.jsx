// ======================= src/brand.jsx =======================
// 🔷 LogisWeb 브랜드 공용 부품 — 프로그램(PC·모바일)·첫 화면·관리자센터 어디서든 이것만 쓴다
//  🔷 2026-11-14 새 로고(LW 마크 + LOGISWEB) — 그림은 원본 한 장에서 tools/brand/make-logo-assets.py 가 만든다
//    마크 = /brand/logisweb-mark.png(원본 남색 바탕 · 둥근 모서리) · 글자 = /brand/logisweb-wordmark.png(투명 바탕 · 원본 색)
//  · BRAND: 이름 글자(문장 속에 쓰는 이름)
//  · <LogisMark size> : 앱 아이콘과 같은 마크(남색 타일 + 순환 노선 + 입체 트럭)
//  · <LogisWordmark height tag> : 글자 로고 "LOGIS"(흰색) + "WEB"(하늘색 #8FB0F0) — 글꼴 없이 벡터라 어디서나 같은 모양
//      어두운 바탕 위에 그대로 쓴다. 밝은 바탕에서는 <LogisLockup chip>처럼 남색 칩 위에 올려 색감을 지킨다.
import React from "react";
import { WORD } from "./brandAssets";

export const BRAND = "LogisWeb";
export const BRAND_UPPER = "LOGISWEB";
export const BRAND_TAGLINE = "LOGISTICS DISPATCH NETWORK";
export const BRAND_WHITE = "#C6C9CF"; // 새 로고 LOGIS 색
export const BRAND_SKY = "#6D7EA3";   // 새 로고 WEB 색
export const MARK_SRC = "/brand/logisweb-mark.png";
export const WORD_SRC = "/brand/logisweb-wordmark.png";
export const LOGO_SRC = "/brand/logisweb-logo.png";
export const WORD_RATIO = 8.0256; // 글자 로고 가로 ÷ 세로(make-logo-assets.py 가 알려 준 값)

export function LogisMark({ size = 40, className = "", style, title = BRAND }) {
  return (
    <img src={MARK_SRC} width={size} height={size} alt={title} draggable={false} className={className}
      style={{ display: "block", flexShrink: 0, width: size, height: size, borderRadius: Math.round(size * 0.22), objectFit: "cover", ...style }} />
  );
}

// 글자 로고 — height = 글자 높이(px). tag면 아래에 LOGISTICS DISPATCH NETWORK · sub="dispatch"면 DISPATCH
//  🔷 2026-11-14 새 로고 글자(투명 PNG · 원본 색). logisColor · webColor 는 예전 호출을 위해 받기만 한다(새 로고 색 고정)
export function LogisWordmark({ height = 16, tag = false, sub = null, tagColor = "rgba(207,214,228,.6)", className = "", style, title = BRAND }) {
  const w = height * WORD_RATIO;
  const img = <img src={WORD_SRC} alt={title} draggable={false} style={{ display: "block", height, width: w }} />;
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

// 인쇄 문서(새 창에 HTML 글자로 쓰는 견적서·보고서)용 — 글자 로고 SVG 문자열. 어두운 바탕 위에 넣는다.
export function logisWordmarkSvg(height = 10) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `<img src="${origin}${WORD_SRC}" alt="${BRAND}" height="${height}" width="${(height * WORD_RATIO).toFixed(1)}" style="display:inline-block;vertical-align:middle" />`;
}

// 영문 머리말 태그 —예전 "KP-FLOW · OPERATIONS DECK"처럼 이름 + 구역명을 쓰던 곳.
//  이름 자리는 글자 로고(흰색·하늘색)로 그리고, 뒤의 " · 구역명"은 부모 글씨 모양(색·글꼴)을 그대로 따른다.
//  chip이면 글자 로고만 작은 남색 칩 위에 올린다(밝은 바탕용).
export function LogisTag({ height = 8, text = "", chip = false, gap = 6, className = "", style }) {
  const word = <LogisWordmark height={height} />;
  return (
    <span className={`inline-flex items-center align-middle ${className}`} style={{ gap, whiteSpace: "nowrap", ...style }}>
      {chip
        ? <span style={{ display: "inline-flex", alignItems: "center", background: "linear-gradient(120deg,#0B1428,#1B2B4B)", padding: `${Math.round(height * 0.5)}px ${Math.round(height * 0.85)}px`, borderRadius: Math.round(height * 0.7) }}>{word}</span>
        : word}
      {text ? <span>· {text}</span> : null}
    </span>
  );
}
