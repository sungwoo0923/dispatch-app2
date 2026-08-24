// src/planner/PlannerSplash.jsx — 앱 실행 시 첫 화면(로딩 중에도 잠깐 보임).
// 사용자가 준 로고가 아직 최종본이 아니라, 지금은 흰 배경 위에 로고만 놓는다.
import React from "react";
import KPPlannerLogo from "./KPPlannerLogo";

export default function PlannerSplash() {
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <KPPlannerLogo size="lg" />
    </div>
  );
}
