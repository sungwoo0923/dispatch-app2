// src/planner/KPPlannerLogo.jsx
// ⭐ "나의 플래너"가 배차프로그램에서 완전히 분리된 별도 앱(KP-Planner)이 되면서
// 받은 로고를 코드로 재현한 것 — 실제 로고 이미지 파일이 준비되면 이 컴포넌트
// 내부를 <img src="..."/> 하나로 바꿔 끼우면 된다(사용하는 자리는 전부 동일).
import React from "react";

const NAVY = "#1B2540";
const PINK = "#EC6FA0";

export default function KPPlannerLogo({ scale = 1, showTagline = true }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${scale})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="64" height="64" viewBox="0 0 72 72" fill="none">
          <rect x="8" y="16" width="56" height="48" rx="8" fill="#fff" stroke={NAVY} strokeWidth="3" />
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
                fill={row === 0 && col === 0 ? PINK : "#D9DEE8"}
              />
            ))
          )}
          <path d="M20.5 41 L23 43.6 L27.5 38" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ fontFamily: "Arial, sans-serif", fontWeight: 900, fontSize: 56, lineHeight: 1, display: "flex" }}>
          <span style={{ color: NAVY }}>K</span>
          <span style={{ color: PINK }}>P</span>
        </div>
      </div>
      <div style={{ marginTop: 12, fontWeight: 900, fontSize: 34, letterSpacing: 0.5, fontFamily: "Arial, sans-serif", whiteSpace: "nowrap" }}>
        <span style={{ color: NAVY }}>KP-</span>
        <span style={{ color: PINK }}>PLANNER</span>
      </div>
      {showTagline && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, color: NAVY, fontSize: 11, fontWeight: 700, letterSpacing: 2.5, fontFamily: "Arial, sans-serif" }}>
          <span style={{ width: 18, height: 2, background: PINK, display: "inline-block" }} />
          SMART PLANNING SOLUTIONS
          <span style={{ width: 18, height: 2, background: PINK, display: "inline-block" }} />
        </div>
      )}
    </div>
  );
}
