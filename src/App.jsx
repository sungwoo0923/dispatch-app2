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

  // 📌 모바일 감지 — UserAgent ❌ / 화면 폭 + 터치만 ✔
  const isMobileDevice = window.innerWidth < 1000 && navigator.maxTouchPoints > 0;

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
        {/* 루트 → /app */}
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

        {/* 📌 PC / Mobile 자동 분기 */}
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

        {/* 공용 */}
        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/upload" element={<UploadPage />} />

        {/* 기타 → 앱 */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Router>
  );
}

// ======================= END =======================
