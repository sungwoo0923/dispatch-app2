// ======================= src/routes/AppRouter.jsx (FINAL) =======================
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

        {/* 공통 로그인/회원가입 */}
        <Route path="/" element={<Login />} />
        <Route path="/driver-login" element={<DriverLogin />} />
        <Route path="/driver-register" element={<DriverRegister />} />

        {/* 기사 전용 */}
        {role === "driver" && (
          <>
            <Route path="/driver-home" element={<DriverHome />} />
            <Route path="/*" element={<DriverHome />} />
          </>
        )}

        {/* 관리자 전용 */}
        {role === "admin" && (
          <>
            <Route path="/app" element={<DispatchApp />} />
            <Route path="/fleet" element={<FleetManagement />} />
          </>
        )}

        {/* 보호 라우팅 */}
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
