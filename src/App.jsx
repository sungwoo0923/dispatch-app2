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

// 모바일 감지
function detectMobileDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isKakao = ua.includes("kakaotalk");
  const isAndroid = ua.includes("android");
  const isIOS = /iphone|ipad|ipod/.test(ua);
  if (isKakao && (isAndroid || isIOS)) return true;
  if (isAndroid || isIOS) return true;
  return false;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobileDevice, setIsMobileDevice] = useState(null);

  // 🔥 업데이트 상태 추가
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const handler = () => setUpdateReady(true);
    window.addEventListener("app-update-ready", handler);
    return () => window.removeEventListener("app-update-ready", handler);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

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
    <>
      {/* 🔵 업데이트 알림 배너 */}
      {updateReady && (
        <div className="fixed top-0 left-0 right-0 z-[99999] bg-blue-600 text-white text-sm py-2 text-center shadow-md animate-pulse">
          새 버전이 배포되었습니다.
          <button
            className="font-bold underline ml-2"
            onClick={() => window.location.reload(true)}
          >
            새로고침
          </button>
        </div>
      )}

      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={user ? <Navigate to="/app" replace /> : <Login />} />
          <Route path="/signup" element={user ? <Navigate to="/app" replace /> : <Signup />} />

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

          <Route path="/standard-fare" element={<StandardFare />} />
          <Route path="/no-access" element={<NoAccess />} />
          <Route path="/upload" element={<UploadPage />} />

          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>

        {/* Debug 표시 */}
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
    </>
  );
}
