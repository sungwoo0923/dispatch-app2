// ===================== App.jsx =====================
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DispatchApp from "./DispatchApp";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 기본 루트 접속 시 로그인 포함된 DispatchApp */}
        <Route path="/" element={<DispatchApp />} />

        {/* 로그인 후 대시보드도 DispatchApp과 동일 */}
        <Route path="/dashboard" element={<DispatchApp />} />
      </Routes>
    </Router>
  );
}
