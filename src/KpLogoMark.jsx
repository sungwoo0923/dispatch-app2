// ======================= src/KpLogoMark.jsx =======================
// 🔷 디지털 로고 마크 — 첫 화면(스플래시)용. 네이비 타일 안에 회로선처럼 그린 "KP" + 빛 지나감.
//  ⚠️ index.html의 첫 화면(앱 파일을 받기 전 0.x초)에도 같은 그림이 그대로 들어 있다 — 모양을 바꾸면 둘 다 바꿀 것.
import React from "react";

export default function KpLogoMark({ size = 96, animate = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="KP-Flow" className={animate ? "kp-mark" : ""} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="kpmBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2D4C82" /><stop offset="1" stopColor="#0B1428" /></linearGradient>
        <linearGradient id="kpmEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#CFE0FF" /><stop offset="1" stopColor="#4B6CB7" stopOpacity="0.4" /></linearGradient>
        <linearGradient id="kpmGlint" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <clipPath id="kpmClip"><rect x="2" y="2" width="60" height="60" rx="16" /></clipPath>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#kpmBg)" />
      <rect x="2.6" y="2.6" width="58.8" height="58.8" rx="15.4" fill="none" stroke="url(#kpmEdge)" strokeWidth="1.2" />
      {/* 디지털 모서리 표시 */}
      <path d="M10 16v-6h6M54 16v-6h-6M10 48v6h6M54 48v6h-6" fill="none" stroke="#8FB0F0" strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
      {/* 속도선 */}
      <path d="M9 27h6M7 32h8M9 37h6" stroke="#8FB0F0" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" className="kp-mark-speed" />
      {/* K P — 회로선 */}
      <g fill="none" stroke="#FFFFFF" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" className="kp-mark-draw">
        <path d="M20 20v24" />
        <path d="M31 20 20.5 32 31 44" />
        <path d="M37 44V20h6.5a6 6 0 0 1 0 12H37" />
      </g>
      {/* 회로 배선 + 접점 */}
      <path d="M49.5 26H54M31 44h4l2.5 2.5" fill="none" stroke="#8FB0F0" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="55.6" cy="26" r="1.7" fill="#0B1428" stroke="#CFE0FF" strokeWidth="1.2" />
      <circle cx="38.8" cy="47.8" r="1.4" fill="#CFE0FF" />
      <rect x="17" y="51" width="15" height="1.6" rx="0.8" fill="#8FB0F0" opacity="0.8" />
      {animate && <rect x="-30" y="0" width="22" height="64" fill="url(#kpmGlint)" clipPath="url(#kpmClip)" className="kp-mark-glint" transform="skewX(-18)" />}
    </svg>
  );
}

// 스플래시 공용 CSS(애니메이션)
export const KP_MARK_CSS = `
  @keyframes kpMarkIn { 0% { opacity: 0; transform: scale(.86) } 100% { opacity: 1; transform: none } }
  @keyframes kpMarkDraw { from { stroke-dashoffset: 60 } to { stroke-dashoffset: 0 } }
  @keyframes kpMarkGlint { 0% { transform: skewX(-18deg) translateX(0) } 60%,100% { transform: skewX(-18deg) translateX(120px) } }
  @keyframes kpMarkSpeed { 0%,100% { opacity: .35; transform: translateX(0) } 50% { opacity: 1; transform: translateX(-2px) } }
  .kp-mark { animation: kpMarkIn .45s cubic-bezier(.2,.9,.3,1.1) both; }
  .kp-mark .kp-mark-draw path { stroke-dasharray: 60; animation: kpMarkDraw .6s ease-out both; }
  .kp-mark .kp-mark-glint { animation: kpMarkGlint 1.8s ease-in-out .4s infinite; }
  .kp-mark .kp-mark-speed { animation: kpMarkSpeed .9s ease-in-out infinite; }
`;
