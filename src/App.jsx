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

// 🔔 FCM 푸시 알림
import { requestForToken, onMessageListener } from "./firebaseMessaging";

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
  const [isMobile, setIsMobile] = useState(false);

  // 로그인 상태 관찰
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 🔔 로그인 후에만 알림 등록
  useEffect(() => {
    if (!user) return;
    if (window.location.pathname !== "/app") return;

    requestForToken();

    const unsubscribe = onMessageListener((payload) => {
      console.log("FCM Received:", payload);
      const title = payload?.notification?.title || "새 알림";
      const body = payload?.notification?.body || "";
      alert(`${title}\n${body}`);
    });

    return () => unsubscribe?.();
  }, [user]);

  // 모바일 판단
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

  const role = localStorage.getItem("role") || "user";

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />

        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

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

        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

// ======================= END =======================
