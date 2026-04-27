// ===================== src/routes/AppRouter.jsx (FINAL) =====================
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DriverHome from "../driver/DriverHome";
import DriverRegister from "../driver/DriverRegister";
import DriverLogin from "../driver/DriverLogin";
import FleetManagement from "../FleetManagement";
import DispatchApp from "../DispatchApp";
import Login from "../Login";

export default function AppRouter() {
  const role = localStorage.getItem("role");

  return (
    <BrowserRouter>
      <Routes>

        {/* 로그인 페이지 */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Navigate to="/" replace />} />

        {/* 기사 */}
        <Route path="/driver-login" element={<DriverLogin />} />
        <Route path="/driver-register" element={<DriverRegister />} />
        <Route path="/driver-home" element={<DriverHome />} />

        {/* 직원 */}
        {role === "admin" && (
          <>
            <Route path="/app" element={<DispatchApp />} />
            <Route path="/fleet" element={<FleetManagement />} />
          </>
        )}

        {/* 기본 리다이렉트 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
