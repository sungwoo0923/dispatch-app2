// ======================= src/App.jsx (FINAL + UPDATE BANNER ONCE FIX) =======================

import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import ShipperApp from "./shipper/ShipperApp";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";

// Main Apps
import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";
import ShipperMobileApp from "./mobile/ShipperMobileApp";

// Driver / Employee
import DriverHome from "./driver/DriverHome";
import DriverLogin from "./driver/DriverLogin";
import DriverRegister from "./driver/DriverRegister";

// Common Screens
import Login from "./Login";
import Signup from "./Signup";
import ShipperLogin from "./shipper/ShipperLogin";
import ShipperSignup from "./shipper/ShipperSignup";
import ShipperPending from "./shipper/ShipperPending";

import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";
import ChangePassword from "./ChangePassword";

/* =======================================================================
   스마트폰(진짜 모바일)만 MobileApp
======================================================================= */
function isSmartPhone() {
  const ua = navigator.userAgent.toLowerCase();

  const isIpad =
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    ua.includes("ipad");

  if (isIpad) return false;
  if (ua.includes("tablet")) return false;

  const isSmallScreen = window.innerWidth < 768;
  const isPhoneUA = /iphone|ipod|android(?!.*tablet)/.test(ua);

  return isPhoneUA || isSmallScreen;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // 🔥 모바일 스플래시 최소 2.5초 유지
// 교체 후
  // 🔥 모바일만 스플래시 3초, PC는 즉시
  useEffect(() => {
    if (isSmartPhone()) {
      const timer = setTimeout(() => setSplashDone(true), 3000);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setSplashDone(true), 1500); // PC 1.5초
      return () => clearTimeout(timer);
    }
  }, []);

  // 🔒 업데이트 배너 1회만 표시하기 위한 락
  const updateShownRef = useRef(false);
  // ======================= KAKAO IN-APP → CHROME FORCE =======================
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isKakao = ua.includes("kakaotalk");

    if (isKakao) {
      location.href =
        "intent://dispatch-app2.vercel.app/app#Intent;scheme=https;package=com.android.chrome;end";
    }
  }, []);
  // ======================= UPDATE EVENT (ONCE) =======================
  useEffect(() => {
    const onUpdate = () => {
      // 이미 한 번 떴으면 무시
      if (updateShownRef.current) return;

      updateShownRef.current = true;
      setUpdateReady(true);
    };

    window.addEventListener("app-update-ready", onUpdate);
    return () => window.removeEventListener("app-update-ready", onUpdate);
  }, []);

  // ======================= AUTH + ROLE =======================
useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => {
    if (!u) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    setUser(u);

    const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRole(data.role || "shipper");
        setApproved(data.approved === true);
      } else {
        setRole("shipper");
        setApproved(false);
      }

      setLoading(false);
    });

    return () => unsubUser();
  });

  return () => unsub();
}, []);

  // 🔒 role 확정 전 차단
if (loading || !splashDone) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen"
        style={{ backgroundColor: "#ffffff" }}
      >
        <style>{`
          @keyframes fadeInUp {
            0%   { opacity: 0; transform: translateY(16px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          .splash-logo {
            animation: fadeInUp 0.9s ease-out forwards;
          }
          .splash-sub {
            animation: fadeInUp 0.9s ease-out 0.5s forwards;
            opacity: 0;
          }
        `}</style>

        <img
          src="/icons/sflow-logo.png"
          alt="KP-Flow Logistics"
          className="splash-logo"
          style={{ width: "60vw", maxWidth: "320px" }}
        />

        <div
          className="splash-sub text-sm mt-4"
          style={{ color: "#aaaaaa" }}
        >
          {loading ? "권한 확인 중..." : ""}
        </div>
      </div>
    );
  }
  const isMobile = isSmartPhone();

return (
  <>
    {/* ======================= UPDATE BANNER ======================= */}
    {updateReady && (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[99999]">
    <div className="bg-white rounded-2xl shadow-2xl w-[380px] overflow-hidden animate-[fadeInUp_0.3s_ease-out]">

      {/* 헤더 */}
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div>
          <h3 className="text-white text-[15px] font-bold">새 업데이트가 있습니다</h3>
          <p className="text-white/50 text-[11px] mt-0.5">KP-Flow Logistics</p>
        </div>
      </div>

      {/* 본문 */}
      <div className="px-6 py-5">
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-blue-500 text-sm mt-0.5">💡</span>
            <div className="text-[12px] text-blue-700 leading-relaxed">
              최신 버전이 준비되었습니다.<br />
              업데이트를 적용하면 자동으로 새로고침됩니다.
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition"
            onClick={() => setUpdateReady(false)}
          >
            나중에
          </button>
          <button
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition"
            onClick={() => {
              setUpdateReady(false);
              if (window.__APPLYING_UPDATE__) return;
              window.__APPLYING_UPDATE__ = true;
              window.applyAppUpdate?.();
            }}
          >
            지금 업데이트
          </button>
        </div>
      </div>

    </div>
  </div>
)}

    <Router>
      <Routes>

        {/* ================= 기본 ================= */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ================= 로그인 ================= */}
        <Route
  path="/login"
  element={
    (() => {
      const skip = sessionStorage.getItem("skipLoginPopup");

      if (user && skip !== "true") {
        return role === "driver"
          ? <Navigate to="/driver-home" replace />
          : role === "shipper"
            ? (approved
                ? <Navigate to="/shipper" replace />
                : <Navigate to="/shipper-pending" replace />
              )
            : <Navigate to="/app" replace />;
      }

      return <Login />;
    })()
  }
/>

        <Route path="/signup" element={<Signup />} />

        {/* ================= 화주 로그인 ================= */}
<Route
  path="/shipper-login"
  element={
    (() => {
      const skip = sessionStorage.getItem("skipLoginPopup");

      if (user && role === "shipper" && skip !== "true") {
        return approved
          ? <Navigate to="/shipper" replace />
          : <Navigate to="/shipper-pending" replace />;
      }

      return <ShipperLogin />;
    })()
  }
/>

        {/* ================= 회원가입 ================= */}
        <Route path="/shipper-signup" element={<ShipperSignup />} />

        {/* ================= 승인 대기 ================= */}
        <Route
          path="/shipper-pending"
          element={
            user && role === "shipper"
              ? (approved
                  ? <Navigate to="/shipper" replace />
                  : <ShipperPending />
                )
              : <Navigate to="/shipper-login" replace />
          }
        />

        {/* ================= 화주 메인 ================= */}
         <Route
          path="/shipper/*"
          element={
            user && role === "shipper"
              ? (approved
                  ? (isMobile ? <ShipperMobileApp /> : <ShipperApp />)
                  : <Navigate to="/shipper-pending" replace />
                )
              : <Navigate to="/shipper-login" replace />
          }
        />

        {/* ================= 기사 ================= */}
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

        <Route
          path="/driver-home"
          element={
            user && role === "driver"
              ? <DriverHome />
              : <Navigate to="/driver-login" replace />
          }
        />

        {/* ================= 내부 직원 ================= */}
        <Route
          path="/app"
          element={
            user && role !== "shipper" && role !== "driver"
              ? (isMobile
                  ? <MobileApp role={role} user={user} />
                  : <DispatchApp role={role} user={user} />)
              : <Navigate to="/login" replace />
          }
        />

        {/* ================= 공통 ================= */}
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/no-access" element={<NoAccess />} />

        {/* ================= fallback ================= */}
        <Route
          path="*"
          element={
            user
              ? role === "shipper"
                ? <Navigate to="/shipper" replace />
                : role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : <Navigate to="/app" replace />
              : <Navigate to="/login" replace />
          }
        />

      </Routes>
    </Router>
  </>
);
}

// ======================= END =======================