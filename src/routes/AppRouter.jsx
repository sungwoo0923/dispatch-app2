// ======================= src/routes/AppRouter.jsx (FINAL) =======================
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DriverHome from "../driver/DriverHome";
import DriverRegister from "../driver/DriverRegister";
import DriverLogin from "../driver/DriverLogin";
import FleetManagement from "../FleetManagement";
import DispatchApp from "../DispatchApp";
import Login from "../Login";

export default function AppRouter() {
  const [role, setRole] = useState(localStorage.getItem("role"));

  useEffect(() => {
    const syncRole = () => setRole(localStorage.getItem("role"));
    window.addEventListener("storage", syncRole);
    return () => window.removeEventListener("storage", syncRole);
  }, []);

  return (
    <BrowserRouter>
      <Routes>

        {/* 로그인 및 회원가입 */}
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

        {/* 로그인 상태 아니면 로그인 화면 */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}
