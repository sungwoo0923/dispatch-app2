// ======================= src/App.jsx (FINAL FIXED) =======================

import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";

// 기사 화면
import DriverHome from "./driver/DriverHome";
import DriverLogin from "./driver/DriverLogin";
import DriverRegister from "./driver/DriverRegister";

// 공용
import Login from "./Login";
import Signup from "./Signup";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";

function detectMobileDevice() {
  const ua = navigator.userAgent.toLowerCase();
  return (
    ua.includes("android") ||
    ua.includes("iphone") ||
    ua.includes("ipad") ||
    ua.includes("ipod") ||
    ua.includes("kakaotalk")
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobileDevice, setIsMobileDevice] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setIsMobileDevice(detectMobileDevice());
  }, []);

  if (loading || isMobileDevice === null) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        로그인 / 디바이스 확인 중...
      </div>
    );
  }

  const role = localStorage.getItem("role"); // driver | admin | user

  return (
    <Router>
      <Routes>

        {/* 초기 진입 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 로그인 */}
        <Route
          path="/login"
          element={
            !user
              ? <Login />
              : role === "driver"
                ? <Navigate to="/driver-home" replace />
                : <Navigate to="/app" replace />
          }
        />

        <Route path="/signup" element={<Signup />} />

        {/* 🔥 기사 페이지는 무조건 오픈 */}
        <Route path="/driver-login" element={<DriverLogin />} />
        <Route path="/driver-register" element={<DriverRegister />} />
        <Route path="/driver-home" element={<DriverHome />} />


        {/* 🔵 관리자/직원 페이지 */}
        {role !== "driver" && (
          <>
            <Route
              path="/app"
              element={
                user
                  ? (
                    isMobileDevice
                      ? <MobileApp role={role} />
                      : <DispatchApp role={role} />
                  )
                  : <Navigate to="/login" replace />
              }
            />
            <Route path="/standard-fare" element={<StandardFare />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/no-access" element={<NoAccess />} />
          </>
        )}

        {/* 보호 라우팅 */}
        <Route
          path="*"
          element={
            user
              ? role === "driver"
                ? <Navigate to="/driver-home" replace />
                : <Navigate to="/app" replace />
              : <Navigate to="/login" replace />
          }
        />

      </Routes>
    </Router>
  );
}

// ======================= END =======================
