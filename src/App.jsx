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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // 로그인 상태 확인 중 여부

  // ✅ Firebase 인증 상태 감시
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ 로그인 여부 확인 중 표시
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        🔐 로그인 상태 확인 중...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* 기본 진입 시 로그인으로 이동 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 로그인 화면 */}
        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />

        {/* 회원가입 화면 */}
        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* 메인 앱 - 로그인 필요 */}
        <Route
          path="/app"
          element={user ? <DispatchApp /> : <Navigate to="/login" replace />}
        />

        {/* 잘못된 주소 → 로그인으로 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
