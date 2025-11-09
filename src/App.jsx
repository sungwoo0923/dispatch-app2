// src/App.jsx
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import Login from "./Login";
import Signup from "./Signup";
import DispatchApp from "./DispatchApp";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";   // ✅ 추가

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Firebase 로그인 상태 감시
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ 로그인 상태 확인 중 표시
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        🔐 로그인 상태 확인 중...
      </div>
    );
  }

  // ✅ 저장된 역할값 (없으면 user 취급)
  const role = localStorage.getItem("role") || "user";

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ✅ 로그인 / 회원가입 */}
        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />
        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* ✅ 메인 앱 (로그인 필요) */}
        <Route
          path="/app"
          element={user ? <DispatchApp role={role} /> : <Navigate to="/login" replace />}
        />

        {/* 🚫 권한 없음 화면 */}
        <Route path="/no-access" element={<NoAccess />} />

        {/* ✅ 공개 업로드 페이지 (로그인 필요 없음) */}
        <Route path="/upload" element={<UploadPage />} />

        {/* ❌ 잘못된 URL → 로그인 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
