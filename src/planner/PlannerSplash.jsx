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

  // ⭐ 예전엔 minHeight:100vh인 일반 문서 흐름 안의 div였는데, 모바일 브라우저의
  // 100vh는 주소창이 접힌 상태 기준이라 실제 보이는 화면보다 살짝 크다 — 그
  // 차이만큼 페이지가 스크롤 가능해져서, 로고가 정중앙보다 아래에 있거나 손으로
  // 화면을 스크롤하면 같이 움직이는 문제가 있었다. position:fixed + inset:0으로
  // 뷰포트에 완전히 고정해서 스크롤과 무관하게 항상 정중앙에 있게 한다.
  return (
    <div style={{ position: "fixed", inset: 0, background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", overscrollBehavior: "none" }}>
      <div
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "scale(1)" : "scale(0.96)",
          transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
          width: "min(78vw, 380px)",
        }}
      >
        <img
          src="/planner/kp-planner-logo-full.png"
          alt="KP-Planner"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          style={{ width: "100%", display: "block", userSelect: "none", WebkitUserSelect: "none" }}
        />
      </div>
    </div>
  );
}
