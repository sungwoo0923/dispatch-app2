// ======================= src/App.jsx =======================

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

// 🔔 FCM 푸시 알림
import { requestForToken, onMessageListener } from "./firebaseMessaging";

// PC / MOBILE
import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";
import MobileDriverApp from "./mobile/MobileDriverApp"; // 🔥 추가

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
  const [role, setRole] = useState("user"); // 🔥 Firestore 역할 반영

  // 🔐 로그인 상태 변동 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);

      if (u) {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        const r = snap.exists() ? snap.data().role : "user";
        setRole(r);
        localStorage.setItem("role", r);
      } else {
        setRole("user");
      }
    });
    return () => unsub();
  }, []);

  // 📱 디바이스 판단
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
        로그인 확인 중...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* 기본 = 로그인 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 로그인 & 회원가입 */}
        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />
        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* 🔥 핵심: 권한 + 디바이스 분기 */}
        <Route
          path="/app"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : role === "driver" ? (
              isMobile ? (
                <MobileDriverApp /> // 드라이버는 무조건 모바일앱
              ) : (
                <NoAccess /> // PC 접속 차단
              )
            ) : isMobile ? (
              <MobileApp role={role} /> // 일반 사용자 Mobile 화면
            ) : (
              <DispatchApp role={role} /> // 일반 사용자 PC 화면
            )
          }
        />

        {/* PC전용 / 설정 페이지 */}
        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

// ======================= END =======================
