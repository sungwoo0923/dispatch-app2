// ======================= src/routes/AppRouter.jsx (FIXED + ADD REGISTER) =======================
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

        {/* 기사 전용 라우팅 */}
        <Route path="/driver-login" element={<DriverLogin />} />
        <Route path="/driver-register" element={<DriverRegister />} />

        {role === "driver" && (
          <Route path="/driver-home" element={<DriverHome />} />
        )}

        {/* 일반 사용자 라우팅 */}
        {role !== "driver" && (
          <>
            <Route path="/" element={<Login />} />
            <Route path="/app" element={<DispatchApp />} />
            <Route path="/fleet" element={<FleetManagement />} />
          </>
        )}

        {/* 기본 라우팅 처리 (404 보호 + 자동 리다이렉트) */}
        <Route
          path="*"
          element={
            role === "driver"
              ? <Navigate to="/driver-home" replace />
              : <Navigate to="/" replace />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}
// ===================================================================
