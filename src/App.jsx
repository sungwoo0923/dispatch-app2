// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./Login";
import Signup from "./Signup";
import DispatchApp from "./DispatchApp";
import { useState, useEffect } from "react";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="text-center mt-20">로그인 확인 중...</div>;

  return (
    <Router>
      <Routes>
        {/* 기본 진입 시 로그인으로 리다이렉트 */}
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

        {/* 보호된 메인 앱 (로그인 필요) */}
        <Route
          path="/app"
          element={user ? <DispatchApp /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </Router>
  );
}
