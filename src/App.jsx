// ======================= src/App.jsx =======================

import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

// PC / MOBILE
import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";

// 공용 화면
import Login from "./Login";
import Signup from "./Signup";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ 화면 크기 기준 모바일 여부
  const [isMobileDevice, setIsMobileDevice] = useState(null);

  // 로그인 상태 관찰
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ 진짜 단순하게: 화면 가로 1024px 이하면 "모바일"로 취급
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const isMobile = width <= 1024;
      setIsMobileDevice(isMobile);

      // 🔍 혹시 몰라 콘솔에 찍어두기 (개발용)
      console.log("[RUN25] width:", width, "=> isMobile:", isMobile);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

  // 아직 로그인/디바이스 체크 중이면 로딩 화면
  if (loading || isMobileDevice === null) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        로그인 / 디바이스 확인 중...
      </div>
    );
  }

  const role = localStorage.getItem("role") || "user";

  return (
    <Router>
      <Routes>
        {/* 루트 → /app으로 이동 */}
        <Route path="/" element={<Navigate to="/app" replace />} />

        {/* 로그인 / 회원가입 */}
        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />
        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* 🔥 PC / Mobile 자동 분기 (화면 크기 기준) */}
        <Route
          path="/app"
          element={
            user ? (
              
              <MobileApp role={role} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* 공용 페이지 */}
        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/upload" element={<UploadPage />} />

        {/* 나머지는 전부 /app으로 */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>

      {/* 🔧 디버그용 표시 (원하면 지워도 됨) */}
      <div
        style={{
          position: "fixed",
          bottom: 4,
          right: 4,
          fontSize: "10px",
          background: "rgba(0,0,0,0.6)",
          color: "white",
          padding: "2px 6px",
          borderRadius: "999px",
          zIndex: 9999,
        }}
      >
        VIEW: {isMobileDevice ? "MOBILE" : "PC"}
      </div>
    </Router>
  );
}

// ======================= END =======================
