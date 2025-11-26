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

  const [isMobile, setIsMobile] = useState(false);

  // 🔐 로그인 상태 관찰
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 📱 모바일/PC 자동 판단 + ?view=pc 강제 옵션
  useEffect(() => {
    const checkDevice = () => {
      const ua = navigator.userAgent.toLowerCase();

      const isIOS =
        /iphone|ipad|ipod/.test(ua) ||
        (ua.includes("macintosh") && "ontouchend" in document);
      const isAndroid = ua.includes("android");

      const mobileCheck = isIOS || isAndroid;

      const params = new URLSearchParams(window.location.search);
      const forcePc = params.get("view") === "pc";
      const forceMobile = params.get("view") === "mobile";

      let final = mobileCheck;
      if (forcePc) final = false;
      if (forceMobile) final = true;

      setIsMobile(final);

      console.log("=== Device Detect ===");
      console.log("UA:", navigator.userAgent);
      console.log("isIOS:", isIOS);
      console.log("isAndroid:", isAndroid);
      console.log("mobileCheck:", mobileCheck);
      console.log("forcePc:", forcePc);
      console.log("forceMobile:", forceMobile);
      console.log("final:", final);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    window.addEventListener("popstate", checkDevice);
    return () => {
      window.removeEventListener("resize", checkDevice);
      window.removeEventListener("popstate", checkDevice);
    };
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

        {/* 메인 앱 - 모바일/PC 분기 */}
        <Route
          path="/app"
          element={
            user ? (
              isMobile ? (
                <MobileApp role={role} />
              ) : (
                <DispatchApp role={role} />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* 표준운임표 */}
        <Route path="/standard-fare" element={<StandardFare />} />

        {/* 권한 없음 */}
        <Route path="/no-access" element={<NoAccess />} />

        {/* 파일 업로드 */}
        <Route path="/upload" element={<UploadPage />} />

        {/* 잘못된 경로 → 로그인 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

// ======================= END =======================
