// ======================= src/App.jsx (PWA INSTALL SAFE FULL VERSION) =======================

import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

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

// Shipper
import ShipperApp from "./shipper/ShipperApp";
import ShipperLogin from "./shipper/ShipperLogin";
import ShipperSignup from "./shipper/ShipperSignup";
import ShipperPending from "./shipper/ShipperPending";

// Common
import Login from "./Login";
import Signup from "./Signup";
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";
import ChangePassword from "./ChangePassword";

/* =======================================================================
   스마트폰 판별 (아이패드 제외)
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

/* =======================================================================
   🔥 PWA 설치 전용 엔트리 (/app)
   ❗ 절대 redirect / auth 체크 / navigate 없음
======================================================================= */
function AppInstallEntry() {
  useEffect(() => {
    // 홈 화면에서 앱으로 실행된 경우만 이동
    if (window.matchMedia('(display-mode: standalone)').matches) {
      // 살짝 딜레이 주는 게 iOS에서 안정적
      setTimeout(() => {
        window.location.replace("/app/main");
      }, 300);
    }
  }, []);

  return (
    <div className="flex items-center justify-center h-screen text-gray-500">
      앱을 불러오는 중입니다…
    </div>
  );
}


/* =======================================================================
   실제 앱 엔트리 (/app/main)
======================================================================= */
function AppMain({ user, role }) {
  const isMobile = isSmartPhone();

  if (!user) return <Navigate to="/login" replace />;
  if (role === "driver") return <Navigate to="/driver-home" replace />;
  if (role === "shipper") return <Navigate to="/shipper" replace />;

  return isMobile ? (
    <MobileApp role={role} user={user} />
  ) : (
    <DispatchApp role={role} user={user} />
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  // ======================= AUTH =======================
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setRole(null);
        setApproved(false);
        setLoading(false);
        return;
      }

      setUser(u);

      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const data = snap.data();
        setRole(data.role || null);
        setApproved(data.approved === true);
      } else {
        setRole(null);
        setApproved(false);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        권한 확인 중…
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* ================= PWA INSTALL ENTRY ================= */}
        <Route path="/app" element={<AppInstallEntry />} />

        {/* ================= REAL APP ================= */}
        <Route
          path="/app/main"
          element={<AppMain user={user} role={role} />}
        />

        {/* ================= AUTH ================= */}
        <Route
          path="/login"
          element={
            user
              ? role === "driver"
                ? <Navigate to="/driver-home" replace />
                : role === "shipper"
                  ? <Navigate to="/shipper" replace />
                  : <Navigate to="/app/main" replace />
              : <Login />
          }
        />

        <Route path="/signup" element={<Signup />} />

        {/* ================= DRIVER ================= */}
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

        {/* ================= SHIPPER ================= */}
        <Route
          path="/shipper"
          element={
            user && role === "shipper"
              ? <ShipperApp />
              : <Navigate to="/shipper-login" replace />
          }
        />

        <Route
          path="/shipper-login"
          element={
            user && role === "shipper"
              ? <Navigate to="/shipper" replace />
              : <ShipperLogin />
          }
        />

        <Route path="/shipper-signup" element={<ShipperSignup />} />

        <Route
          path="/shipper-pending"
          element={<ShipperPending />}
        />

        {/* ================= COMMON ================= */}
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/standard-fare" element={<StandardFare />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/no-access" element={<NoAccess />} />

        {/* ================= ROOT ================= */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ================= FALLBACK ================= */}
        <Route
          path="*"
          element={
            user
              ? role === "driver"
                ? <Navigate to="/driver-home" replace />
                : role === "shipper"
                  ? <Navigate to="/shipper" replace />
                  : <Navigate to="/app/main" replace />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </Router>
  );
}

// ======================= END =======================
