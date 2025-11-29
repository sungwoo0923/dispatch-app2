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

import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";
import MobileDriverApp from "./mobile/MobileDriverApp";

import Login from "./Login";
import Signup from "./Signup";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [role, setRole] = useState("user");

  // 로그인 감지
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

  // 📱 모바일 디바이스 판별 (Android 문제 해결)
  useEffect(() => {
    const checkMobile = () => {
      const ua = navigator.userAgent || navigator.vendor || window.opera;

      const isAndroid = /android/i.test(ua);
      const isIOS = /iphone|ipad|ipod/i.test(ua);
      const touch = navigator.maxTouchPoints > 0;
      const sizeCheck = window.innerWidth <= 1024;

      const final =
        isAndroid || isIOS || (touch && sizeCheck);

      setIsMobile(final);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
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
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route
          path="/login"
          element={user ? <Navigate to="/app" replace /> : <Login />}
        />
        <Route
          path="/signup"
          element={user ? <Navigate to="/app" replace /> : <Signup />}
        />

        {/* 🔥 핵심 분기 */}
        <Route
          path="/app"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : role === "driver" ? (
              isMobile ? <MobileDriverApp /> : <NoAccess />
           ) : isMobile || true ? (
  <MobileApp role={role} />
) : (
  <DispatchApp role={role} />
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
