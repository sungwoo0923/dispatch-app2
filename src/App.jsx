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

// 모바일 버전
import MobileDispatcherApp from "./mobile/MobileDispatcherApp"; // 기존 MobileApp 대체
import MobileDriverApp from "./mobile/MobileDriverApp"; // 신규 기사용 앱

// 공용 화면
import Login from "./Login";
import Signup from "./Signup";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";
import SettlementPage from "./SettlementPage";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isMobile, setIsMobile] = useState(false);
  const [role, setRole] = useState("user");

  // 디바이스 판별
  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  // 로그인 상태 관찰 + role 로드
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      const savedRole = localStorage.getItem("role") || "user";
      setRole(savedRole);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        로그인 확인 중...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />

        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* PC / Mobile + Role 분기 */}
        <Route
          path="/app"
          element={
            user ? (
              isMobile ? (
                role === "driver" ? (
                  <MobileDriverApp /> // 기사용 Tracking App
                ) : (
                  <MobileDispatcherApp /> // 배차직원용 기존 App
                )
              ) : (
                <DispatchApp role={role} />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* 기타 공용 페이지 */}
        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/upload" element={<UploadPage />} />
{/* PC 정산 페이지 */}
<Route path="/settlement" element={<SettlementPage />} />

        {/* 나머지는 /app 으로 */}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Router>
  );
}
// ======================= END =======================
