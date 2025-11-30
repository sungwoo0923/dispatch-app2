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

// 🔍 모바일 감지 (카카오 인앱 포함)
function detectMobileDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isKakao = ua.includes("kakaotalk");
  const isAndroid = ua.includes("android");
  const isIOS = /iphone|ipad|ipod/.test(ua);

  // 📌 카카오톡 인앱은 PC처럼 보여도 무조건 모바일 UI 적용!
  if (isKakao && (isAndroid || isIOS)) return true;

  // 📌 일반 모바일 브라우저도 모바일 UI
  if (isAndroid || isIOS) return true;

  // 🔹 나머지는 PC
  return false;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobileDevice, setIsMobileDevice] = useState(null);

  // 로그인 상태 관찰
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 모바일/PC 판별 실행
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

  const role = localStorage.getItem("role") || "user";

  return (
    <Router>
      <Routes>
        {/* 루트 → /app */}
        <Route path="/" element={<Navigate to="/app" replace />} />

        {/* 로그인/회원가입 */}
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

        {/* ❓그 외 → /app */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>

      {/* 🔧 Debug 표시 */}
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
        VIEW: {isMobileDevice ? "💚 MOBILE UI" : "💻 PC UI"}
      </div>
    </Router>
  );
}

// ======================= END =======================
