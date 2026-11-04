// ======================= src/KpLogoMark.jsx =======================
// 🔷 로고 마크 — 2026-11-04 LogisWeb으로 교체(남색 타일 + 순환 노선 + 입체 트럭). 그림은 src/brand.jsx · src/brandAssets.js
//  ⚠️ index.html의 첫 화면(앱 파일을 받기 전 0.x초)에도 같은 그림(/brand/logisweb-mark.svg)이 들어 있다.
import React from "react";
import { LogisMark } from "./brand";

export default function KpLogoMark({ size = 96, animate = true }) {
  return <span className={animate ? "kp-mark" : ""} style={{ display: "inline-block", lineHeight: 0 }}><LogisMark size={size} /></span>;
}

// 스플래시 공용 CSS(애니메이션)
export const KP_MARK_CSS = `
  @keyframes kpMarkIn { 0% { opacity: 0; transform: scale(.86) } 100% { opacity: 1; transform: none } }
  .kp-mark { animation: kpMarkIn .45s cubic-bezier(.2,.9,.3,1.1) both; }
`;
