// ======================= src/routes/AppRouter.jsx (FINAL) =======================
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DriverHome from "../driver/DriverHome";
import DriverRegister from "../driver/DriverRegister";
import DriverLogin from "../driver/DriverLogin";
import FleetManagement from "../FleetManagement";
import DispatchApp from "../DispatchApp";
import Login from "../Login";
import SignupUser from "../SignupUser"; // 🔥 추가

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
        <Route path="/signup" element={<SignupUser />} /> {/* 🔥 추가 */}
        <Route path="/driver-login" element={<DriverLogin />} />
        <Route path="/driver-register" element={<DriverRegister />} />

        {/* 기사용 라우팅 */}
        <Route
          path="/driver-home"
          element={
            role === "driver" ? <DriverHome /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/driver/*"
          element={
            role === "driver" ? <DriverHome /> : <Navigate to="/" replace />
          }
        />

        {/* 관리자용 라우팅 */}
        <Route
          path="/app"
          element={
            role === "admin" ? <DispatchApp /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/fleet"
          element={
            role === "admin" ? <FleetManagement /> : <Navigate to="/" replace />
          }
        />

        {/* 그 외 경로 → 로그인 */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}
