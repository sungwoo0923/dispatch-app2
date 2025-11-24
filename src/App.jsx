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

// PC 버전
import DispatchApp from "./DispatchApp";

// 모바일 버전 (⭐ 새로 만들 MobileApp.jsx)
import MobileApp from "./mobile/MobileApp";


// 공용
import Login from "./Login";
import Signup from "./Signup";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare"; // 표준운임표

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔥 모바일 판별
  const [isMobile, setIsMobile] = useState(false);

  // -- 로그인 상태 관찰
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // -- 모바일 / PC 자동 판별
  useEffect(() => {
  const ua = navigator.userAgent.toLowerCase();
  const mobileCheck = /iphone|ipad|ipod|android|mobi/i.test(ua);
  setIsMobile(mobileCheck);
}, []);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        🔐 로그인 상태 확인 중...
      </div>
    );
  }

  const role = localStorage.getItem("role") || "user";

  return (
    <Router>
      <Routes>
        {/* 기본 루트 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 로그인 */}
        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />

        {/* 회원가입 */}
        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* 메인 앱 경로 */}
        <Route
          path="/app"
          element={
            user ? (
              // 🔥 PC/모바일 UI 자동 분리
              isMobile ? <MobileApp role={role} /> : <DispatchApp role={role} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* 표준운임표 */}
        <Route path="/standard-fare" element={<StandardFare />} />

        {/* 권한 없음 */}
        <Route path="/no-access" element={<NoAccess />} />

        {/* 첨부파일 업로드 페이지 */}
        <Route path="/upload" element={<UploadPage />} />

        {/* 나머지는 로그인으로 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
