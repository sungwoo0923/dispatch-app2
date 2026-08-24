// src/planner/KPPlannerLogo.jsx
// ⭐ "나의 플래너"가 배차프로그램에서 완전히 분리된 별도 앱(KP-Planner)이 되면서
// 받은 로고를 코드로 재현한 것 — 실제 로고 이미지 파일이 준비되면 이 컴포넌트
// 내부를 <img src="..."/> 하나로 바꿔 끼우면 된다(사용하는 자리는 전부 동일).
// 태그라인 글씨가 안 보인다는 피드백으로, 굳이 CSS transform: scale()로 축소해서
// 쓰지 않도록 size별로 실제 폰트 크기를 따로 둔다(축소하면 작은 글자가 뭉개진다).
import React from "react";
import { PINK, INK } from "./plannerTheme";

const SIZES = {
  lg: { icon: 76, kp: 66, word: 40, tagline: 13, gap: 14, wordMt: 12, tagMt: 9 },
  md: { icon: 56, kp: 48, word: 30, tagline: 12, gap: 12, wordMt: 10, tagMt: 8 },
  sm: { icon: 34, kp: 0, word: 19, tagline: 0, gap: 8, wordMt: 0, tagMt: 0 },
};

export default function KPPlannerLogo({ size = "lg", showTagline = true }) {
  const s = SIZES[size] || SIZES.lg;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: s.gap }}>
        <svg width={s.icon} height={s.icon} viewBox="0 0 72 72" fill="none">
          <rect x="8" y="16" width="56" height="48" rx="8" fill="#fff" stroke={INK} strokeWidth="3" />
          <path d="M8 24a8 8 0 0 1 8-8h40a8 8 0 0 1 8 8v6H8v-6Z" fill={PINK} />
          <rect x="19" y="6" width="6" height="16" rx="3" fill={PINK} />
          <rect x="33" y="6" width="6" height="16" rx="3" fill={PINK} />
          <rect x="47" y="6" width="6" height="16" rx="3" fill={PINK} />
          {[0, 1].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={18 + col * 14}
                y={36 + row * 14}
                width="10"
                height="10"
                rx="2"
                fill={row === 0 && col === 0 ? PINK : "#F3D9E4"}
              />
            ))
          )}
          <path d="M20.5 41 L23 43.6 L27.5 38" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {s.kp > 0 && (
          <div style={{ fontFamily: "Arial, sans-serif", fontWeight: 900, fontSize: s.kp, lineHeight: 1, display: "flex" }}>
            <span style={{ color: INK }}>K</span>
            <span style={{ color: PINK }}>P</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: s.wordMt, fontWeight: 900, fontSize: s.word, letterSpacing: 0.5, fontFamily: "Arial, sans-serif", whiteSpace: "nowrap" }}>
        <span style={{ color: INK }}>KP-</span>
        <span style={{ color: PINK }}>PLANNER</span>
      </div>
      {showTagline && s.tagline > 0 && (
        <div style={{ marginTop: s.tagMt, display: "flex", alignItems: "center", gap: 10, color: INK, fontSize: s.tagline, fontWeight: 700, letterSpacing: 2.5, fontFamily: "Arial, sans-serif" }}>
          <span style={{ width: 18, height: 2, background: PINK, display: "inline-block" }} />
          SMART PLANNING SOLUTIONS
          <span style={{ width: 18, height: 2, background: PINK, display: "inline-block" }} />
        </div>
      )}
    </div>
  );
}
