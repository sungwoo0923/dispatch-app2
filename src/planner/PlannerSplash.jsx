// src/planner/PlannerSplash.jsx — 앱 실행 시 첫 화면. 로고가 천천히 페이드인되고,
// 로그인 상태 확인이 끝나면 천천히 페이드아웃된 뒤 로그인 화면으로 넘어간다
// (그냥 순간적으로 반짝이고 사라지는 느낌이 아니라, 스플래시 화면답게 보이도록).
// ⭐ 실제 브랜드 로고 이미지(사용자가 보내준 원본 파일)를 그대로 쓴다.
import React, { useEffect, useState } from "react";

const FADE_MS = 450;

export default function PlannerSplash({ fadeOut = false }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const shown = visible && !fadeOut;

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "scale(1)" : "scale(0.96)",
          transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
          width: "min(78vw, 380px)",
        }}
      >
        <img src="/planner/kp-planner-logo-full.png" alt="KP-Planner" style={{ width: "100%", display: "block" }} />
      </div>
    </div>
  );
}
