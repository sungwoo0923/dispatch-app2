// 배차마당(cafe-site)의 자체 최상위 라우터. 운송 프로그램(dispatch-app2) 본체
// 라우터 아래(/cafe/*)에 붙어있던 예전 구조와 달리, 이 사이트는
// 자기 자신이 루트("/")를 갖는 완전히 독립된 사이트다.
// ⭐ 2026-11-06 로지스웹 허브 = 화물 콜 앱(차주 · 화주 · 운송사) — 첫 화면이 콜 앱(hub/HubApp)이 되고,
//  운송사끼리 오더를 주고받던 거래소(CafeApp)는 /exchange 아래로 옮겼다(운송사 직원 계정 전용 · 기능 그대로).
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CafeApp from "./CafeApp";
import HubApp from "./hub/HubApp";
import HubLogin from "./hub/HubLogin";
import HubSignup from "./hub/HubSignup";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<HubLogin />} />
        <Route path="/signup" element={<HubSignup />} />
        <Route path="/order/:id" element={<HubApp />} />
        <Route path="/admin" element={<HubApp />} />
        {/* 운송사 간 오더 거래소(예전 화면) */}
        <Route path="/exchange/orders/:id" element={<CafeApp />} />
        <Route path="/exchange" element={<CafeApp />} />
        <Route path="/orders/:id" element={<Navigate to="/exchange" replace />} />
        <Route path="/*" element={<HubApp />} />
      </Routes>
    </BrowserRouter>
  );
}
