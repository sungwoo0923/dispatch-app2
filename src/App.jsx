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

  // 로그인 상태 관찰
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 📌 진짜 모바일 판별 (Android UA 변경 대응)
  const isMobileDevice = (() => {
    const ua = navigator.userAgent.toLowerCase();
    const touch = navigator.maxTouchPoints > 0;
    const small = window.innerWidth <= 1024;
    const android = ua.includes("android");
    const ios = /iphone|ipad|ipod/.test(ua);

    if (android || ios) return true;
    if (touch && small) return true;
    return false;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        로그인 확인 중...
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

        {/* 🔥 PC / Mobile 자동 분기 */}
        <Route
          path="/app"
          element={
            user ? (
              isMobileDevice ? (
                <MobileApp role={role} />
              ) : (
                <DispatchApp role={role} />
              )
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
    </Router>
  );
}

// ======================= END =======================
