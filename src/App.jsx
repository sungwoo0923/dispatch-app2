// ======================= src/App.jsx (ROLE FIRESTORE VER) =======================
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";

// Driver
import DriverHome from "./driver/DriverHome";
import DriverLogin from "./driver/DriverLogin";
import DriverRegister from "./driver/DriverRegister";

// Common
import Login from "./Login";
import Signup from "./Signup";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
// ⭐ 새 버전 감지 → 자동 새로고침 (무한루프 방지)
useEffect(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const refreshed = sessionStorage.getItem("app-refreshed");

      if (!refreshed) {
        console.log("%cSW 업데이트 → 새로고침 진행", "color:#22cc22;font-weight:bold;");
        sessionStorage.setItem("app-refreshed", "yes");
        window.location.reload();
      } else {
        console.log("%c이미 새로고침됨 → 무한루프 방지", "color:#ffaa00;font-weight:bold;");
      }
    });
  }
}, []);
  // Auth + Role 실시간 반영
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(u);

      // Firestore role 불러오기
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const r = snap.data().role;
        setRole(r);
        localStorage.setItem("role", r); // 캐시 유지
      } else {
        setRole(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        권한 확인 중...
      </div>
    );
  }

  const isMobile = /android|iphone|ipad|ipod|kakaotalk/i.test(
    navigator.userAgent
  );

  return (
    <Router>
      <Routes>

        {/* 기본 라우팅 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 직원/관리자 로그인 */}
        <Route
          path="/login"
          element={
            user
              ? (role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : <Navigate to="/app" replace />)
              : <Login />
          }
        />

        <Route path="/signup" element={<Signup />} />

        {/* 기사 로그인/가입 */}
        <Route
          path="/driver-login"
          element={
            user && role === "driver"
              ? <Navigate to="/driver-home" replace />
              : <DriverLogin />
          }
        />
        <Route
          path="/driver-register"
          element={
            user && role === "driver"
              ? <Navigate to="/driver-home" replace />
              : <DriverRegister />
          }
        />

        {/* 기사 전용 홈 */}
        <Route
          path="/driver-home"
          element={
            user && role === "driver"
              ? <DriverHome />
              : <Navigate to="/driver-login" replace />
          }
        />

        {/* 직원/관리자 Web UI */}
        <Route
          path="/app"
          element={
            user && role !== "driver"
              ? (isMobile
                  ? <MobileApp role={role} />
                  : <DispatchApp role={role} />)
              : <Navigate to="/login" replace />
          }
        />

        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/no-access" element={<NoAccess />} />

        {/* 보호 라우팅 */}
        <Route
          path="*"
          element={
            user
              ? (role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : <Navigate to="/app" replace />)
              : <Navigate to="/login" replace />
          }
        />

      </Routes>
    </Router>
  );
}
// ======================= END =======================
