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
import { doc, getDoc } from "firebase/firestore";

// Main Apps
import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";

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

  // 🔒 업데이트 배너 1회만 표시하기 위한 락
  const updateShownRef = useRef(false);

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
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser(u);

      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const data = snap.data();
        setRole(data.role);
        setApproved(data.approved === true);
      } else {
        setRole(null);
        setApproved(false);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  // 🔒 role 확정 전 차단
  if (loading || (user && !role)) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        권한 확인 중...
      </div>
    );
  }

  // 🔒 화주 승인 대기
  if (user && role === "shipper" && approved === false) {
    return <Navigate to="/shipper-pending" replace />;
  }

  const isMobile = isSmartPhone();

  return (
    <>
      {/* ======================= UPDATE BANNER (ONCE) ======================= */}
      {updateReady && (
        <div className="fixed bottom-6 right-6 bg-white shadow-xl border rounded-lg p-4 z-[9999] w-72">
          <div className="font-bold mb-2">🔄 새 업데이트가 있습니다</div>
          <div className="text-sm text-gray-600 mb-3">
            최신 버전을 적용하려면 업데이트를 눌러주세요.
          </div>
          <button
  className="w-full bg-black text-white py-2 rounded-md"
  onClick={() => {
    // 🔥 UI 즉시 종료
    setUpdateReady(false);

    // 혹시 모를 중복 클릭 방지
    if (window.__APPLYING_UPDATE__) return;
    window.__APPLYING_UPDATE__ = true;

    window.applyAppUpdate?.();
  }}
>
  지금 업데이트
</button>
        </div>
      )}

      <Router>
        <Routes>
          {/* 기본 */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* 로그인 */}
          <Route
            path="/login"
            element={
              user
                ? role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : role === "shipper"
                    ? <Navigate to="/shipper" replace />
                    : <Navigate to="/app" replace />
                : <Login />
            }
          />

          <Route path="/signup" element={<Signup />} />

          {/* 화주 */}
          <Route
            path="/shipper-login"
            element={
              user && role === "shipper"
                ? <Navigate to="/shipper" replace />
                : <ShipperLogin />
            }
          />
          <Route path="/shipper-signup" element={<ShipperSignup />} />
          <Route path="/shipper-pending" element={<ShipperPending />} />

          {/* 기사 */}
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

          {/* 내부 */}
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

          {/* 공통 */}
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/standard-fare" element={<StandardFare />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/no-access" element={<NoAccess />} />

          {/* fallback */}
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
