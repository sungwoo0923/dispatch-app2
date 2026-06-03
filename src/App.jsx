// ======================= src/App.jsx =======================

import React, { useState, useEffect, useRef } from "react";
import UpdateBanner from "./UpdateBanner";
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

import DispatchApp from "./DispatchApp";
import MobileApp from "./mobile/MobileApp";
import ShipperMobileApp from "./mobile/ShipperMobileApp";

import DriverHome from "./driver/DriverHome";
import DriverLogin from "./driver/DriverLogin";
import DriverRegister from "./driver/DriverRegister";

import Login from "./Login";
import TransportLogin from "./TransportLogin";
import Signup from "./Signup";
import ShipperLogin from "./shipper/ShipperLogin";
import ShipperSignup from "./shipper/ShipperSignup";
import ShipperPending from "./shipper/ShipperPending";

import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import DriverSearchPage from "./DriverSearchPage";
import StandardFare from "./StandardFare";
import ChangePassword from "./ChangePassword";

/* =======================================================================
   디바이스 감지
======================================================================= */
function isSmartPhone() {
  const ua = navigator.userAgent.toLowerCase();
  const isIpad =
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    ua.includes("ipad");
  if (isIpad) return false;
  if (ua.includes("tablet")) return false;
  const isPhoneUA = /iphone|ipod|android(?!.*tablet)/.test(ua);
  const isSmallScreen = window.innerWidth < 768;
  return isPhoneUA || isSmallScreen;
}

// ★ 태블릿 감지 (iPad, Android 태블릿, 터치 지원 중간 사이즈)
function isTabletDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isIpad =
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    ua.includes("ipad");
  const isAndroidTablet = ua.includes("android") && !ua.includes("mobile");
  const isMidScreen = window.innerWidth >= 768 && window.innerWidth <= 1366;
  const hasTouch = navigator.maxTouchPoints > 1;
  return isIpad || isAndroidTablet || (isMidScreen && hasTouch);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [userCompany, setUserCompany] = useState("");
  // updateReady 팝업 제거됨 - UpdateBanner가 자동 처리
  const [splashDone, setSplashDone] = useState(false);

  // ★ 태블릿 감지 상태
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkTablet = () => setIsTablet(isTabletDevice());
    checkTablet();
    window.addEventListener("resize", checkTablet);
    return () => window.removeEventListener("resize", checkTablet);
  }, []);

  // ★ 태블릿 viewport 동적 조정
  useEffect(() => {
    if (!isTablet) return;

    // viewport meta 태그 강제 설정 (태블릿에서 PC 레이아웃 정상 표시)
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }

    // 태블릿: 최소 너비 1200px로 설정하여 PC 레이아웃 그대로 표시
    meta.content = "width=1200, initial-scale=1, user-scalable=yes";

    return () => {
      // 클린업: 원래 viewport로 복원
      if (meta) {
        meta.content = "width=device-width, initial-scale=1";
      }
    };
  }, [isTablet]);

  // ★ 태블릿용 전역 CSS 주입
  useEffect(() => {
    if (!isTablet) return;

    const styleId = "tablet-global-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
        style.textContent = `
      /* ═══════════ 태블릿 전용 CSS ═══════════ */

      /* 상단 메뉴: 전체 가로 스크롤 + 스크롤바 표시 */
      header nav,
      .menu-tab-container,
      .tab-scroll-container {
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        flex-wrap: nowrap !important;
        scrollbar-width: thin !important;
      }

      header nav::-webkit-scrollbar {
        height: 4px !important;
        display: block !important;
      }
      header nav::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.3) !important;
        border-radius: 4px !important;
      }
      header nav::-webkit-scrollbar-track {
        background: transparent !important;
      }

      /* 메뉴 버튼 축소 방지 */
      header nav > button,
      .menu-tab-container > button,
      .tab-scroll-container > button {
        flex-shrink: 0 !important;
        white-space: nowrap !important;
      }

      /* 입력 필드 태블릿 대응 */
      @media (min-width: 768px) and (max-width: 1400px) and (pointer: coarse) {
        input[type="text"],
        input[type="date"],
        input[type="number"],
        input[type="tel"],
        input[type="email"],
        input[type="search"],
        input[type="password"],
        select,
        textarea {
          min-height: 42px !important;
          font-size: 14px !important;
          padding: 8px 12px !important;
        }

        /* 8칸 그리드 → 세로모드 4칸, 가로모드 6칸 */
        .grid.grid-cols-8 {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        }

        form.grid.grid-cols-8 {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 12px !important;
        }

        .col-span-2 {
          grid-column: span 2 / span 2 !important;
        }

        .col-span-8 {
          grid-column: 1 / -1 !important;
        }

        /* 팝업 최대 너비 */
        .fixed [class*="w-["] {
          max-width: 92vw !important;
        }

        /* 대시보드 너비 자동 조정 */
        .w-\\[1300px\\] {
          width: 100% !important;
          max-width: 100% !important;
        }

        /* 메인 레이아웃: flex row → column */
        .flex.items-start.gap-6.w-full {
          flex-direction: column !important;
        }
        .flex.items-start.gap-6.w-full > .flex-1,
        .flex.items-start.gap-6.w-full > div {
          width: 100% !important;
          max-width: 100% !important;
        }

        /* 헤더 높이 확보 */
        header .flex.items-center.px-6.h-14 {
          height: auto !important;
          min-height: 56px !important;
          padding: 8px 16px !important;
          flex-wrap: wrap !important;
        }

        /* 로고 영역 축소 */
        header .min-w-\\[180px\\] {
          min-width: auto !important;
        }

        /* 유저 영역 축소 */
        header .min-w-\\[180px\\]:last-child {
          min-width: auto !important;
        }
      }

      /* 가로 모드 */
      @media (orientation: landscape) and (max-width: 1400px) and (pointer: coarse) {
        .grid.grid-cols-8,
        form.grid.grid-cols-8 {
          grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        }
      }

      /* 태블릿 테이블 스크롤 */
      @media (max-width: 1400px) and (pointer: coarse) {
        table {
          display: block;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        thead, tbody, tr {
          display: table;
          width: 100%;
          table-layout: fixed;
        }
      }
    `;

    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [isTablet]);

  // 스플래시
  useEffect(() => {
    if (isSmartPhone()) {
      const timer = setTimeout(() => setSplashDone(true), 3000);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setSplashDone(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateShownRef = useRef(false);

  // 카카오 인앱 브라우저 → 크롬 강제
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("kakaotalk")) {
      location.href =
        "intent://dispatch-app2.vercel.app/app#Intent;scheme=https;package=com.android.chrome;end";
    }
  }, []);

  // 업데이트 이벤트 - UpdateBanner.jsx가 처리하므로 App에서는 제거

  // 인증 + 역할
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
          const dataRole = data.role || "user";
          setRole(dataRole);
          // approved !== false allows old accounts (undefined) and explicitly true
          // only blocks accounts explicitly set to false (new unapproved signups)
          setApproved(data.approved !== false);
          if (dataRole === "totalMaster") {
            // totalMaster uses the company they typed at login, not their Firestore doc
            const loginCompany = localStorage.getItem("loginCompany") || "";
            setUserCompany(loginCompany);
            localStorage.setItem("userCompany", loginCompany);
          } else {
            setUserCompany(data.companyName || "");
            localStorage.setItem("userCompany", data.companyName || "");
          }
          localStorage.setItem("role", dataRole);
        } else {
          setRole(null);
          setApproved(false);
          setUserCompany("");
        }
        setLoading(false);
      });
      return () => unsubUser();
    });
    return () => unsub();
  }, []);

  // 공개 라우트는 인증/스플래시 없이 바로 렌더링 (Android PWA start_url 우회)
  const PUBLIC_ROUTES = { "/driver-upload": DriverSearchPage, "/upload": UploadPage };
  const publicMatch = PUBLIC_ROUTES[window.location.pathname];
  if (publicMatch) {
    const PublicComp = publicMatch;
    return <Router><Routes><Route path="*" element={<PublicComp />} /></Routes></Router>;
  }

  // 로딩/스플래시
  if (loading || !splashDone) {
    return (
      <div
        style={{
          position: "fixed", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(160deg, #080f1e 0%, #1B2B4B 55%, #1e3660 100%)",
          userSelect: "none", WebkitUserSelect: "none",
        }}
      >
        <style>{`
          @keyframes splashBgPulse {
            0%, 100% { opacity: 0.12; transform: scale(1); }
            50% { opacity: 0.28; transform: scale(1.12); }
          }
          @keyframes splashLogoIn {
            0%   { opacity: 0; transform: scale(0.72) translateY(18px); }
            65%  { opacity: 1; transform: scale(1.05) translateY(-3px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes splashLineIn {
            0%   { opacity: 0; width: 0; }
            100% { opacity: 1; width: 48px; }
          }
          @keyframes splashDotPulse {
            0%, 100% { opacity: 0.25; transform: scale(0.75); }
            50%       { opacity: 1;    transform: scale(1); }
          }
          .splash-glow {
            position: absolute;
            width: 340px; height: 340px; border-radius: 50%;
            background: radial-gradient(circle, rgba(91,154,245,0.22) 0%, transparent 70%);
            animation: splashBgPulse 2.8s ease-in-out infinite;
            pointer-events: none;
          }
          .splash-logo-img {
            animation: splashLogoIn 0.85s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.1s both;
            filter: drop-shadow(0 6px 28px rgba(91,154,245,0.45));
            pointer-events: none;
            -webkit-user-drag: none;
            user-drag: none;
          }
          .splash-line {
            height: 2px; background: linear-gradient(90deg, transparent, rgba(91,154,245,0.6), transparent);
            border-radius: 2px;
            animation: splashLineIn 0.5s ease-out 0.75s both;
          }
          .splash-dot { width: 7px; height: 7px; border-radius: 50%; background: #5b9af5; }
          .splash-dot-1 { animation: splashDotPulse 1.1s ease-in-out 1.0s infinite; }
          .splash-dot-2 { animation: splashDotPulse 1.1s ease-in-out 1.2s infinite; }
          .splash-dot-3 { animation: splashDotPulse 1.1s ease-in-out 1.4s infinite; }
        `}</style>

        <div className="splash-glow" />

        <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img
            src="/icons/sflow-logo.png"
            alt="KP-Flow Logistics"
            draggable={false}
            onDragStart={e => e.preventDefault()}
            className="splash-logo-img"
            style={{ width: "62vw", maxWidth: "260px", mixBlendMode: "screen" }}
          />
          <div className="splash-line" style={{ marginTop: "20px" }} />
          {loading && (
            <div style={{ display: "flex", gap: "9px", marginTop: "18px" }}>
              <div className="splash-dot splash-dot-1" />
              <div className="splash-dot splash-dot-2" />
              <div className="splash-dot splash-dot-3" />
            </div>
          )}
        </div>
      </div>
    );
  }

  const isMobile = isSmartPhone();

  return (
    <>
      {/* 자동 업데이트 배너 (팝업 없이 상단 배너로 표시 후 자동 새로고침) */}
      <UpdateBanner />

      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          <Route
            path="/login"
            element={
              user
                ? role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : role === "shipper"
                    ? (approved ? <Navigate to="/shipper" replace /> : <Navigate to="/shipper-pending" replace />)
                    : <Navigate to="/app" replace />
                : <Login />
            }
          />

          <Route path="/signup" element={<Signup />} />

          <Route
            path="/transport-login"
            element={(() => {
              const validating = sessionStorage.getItem("transportValidating") === "true";
              const skip = sessionStorage.getItem("skipLoginPopup") === "true";
              if (user && !validating && !skip) {
                return role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : role === "shipper"
                    ? (approved ? <Navigate to="/shipper" replace /> : <Navigate to="/shipper-pending" replace />)
                    : <Navigate to="/app" replace />;
              }
              return <TransportLogin />;
            })()}
          />

          <Route
            path="/shipper-login"
            element={(() => {
              const shipperValidating = sessionStorage.getItem("shipperValidating") === "true";
              const skip = sessionStorage.getItem("skipLoginPopup") === "true";
              if (user && role === "shipper" && !shipperValidating && !skip) {
                return approved ? <Navigate to="/shipper" replace /> : <Navigate to="/shipper-pending" replace />;
              }
              return <ShipperLogin />;
            })()}
          />

          <Route path="/shipper-signup" element={<ShipperSignup />} />

          <Route
            path="/shipper-pending"
            element={
              user && role === "shipper"
                ? (approved ? <Navigate to="/shipper" replace /> : <ShipperPending />)
                : <Navigate to="/shipper-login" replace />
            }
          />

          <Route
            path="/shipper/*"
            element={
              user && (role === "shipper" || user.email === "tjddnqkf@naver.com")
                ? ((approved || user.email === "tjddnqkf@naver.com")
                    ? (isMobile ? <ShipperMobileApp /> : <ShipperApp />)
                    : <Navigate to="/shipper-pending" replace />)
                : <Navigate to="/shipper-login" replace />
            }
          />

          <Route
            path="/driver-login"
            element={user && role === "driver" ? <Navigate to="/driver-home" replace /> : <DriverLogin />}
          />
          <Route
            path="/driver-register"
            element={user && role === "driver" ? <Navigate to="/driver-home" replace /> : <DriverRegister />}
          />
          <Route
            path="/driver-home"
            element={user && role === "driver" ? <DriverHome /> : <Navigate to="/driver-login" replace />}
          />

          <Route
            path="/app"
            element={
              user && role !== "shipper" && role !== "driver" && approved
                ? (isMobile ? <MobileApp role={role} user={user} userCompany={userCompany} /> : <DispatchApp role={role} user={user} userCompany={userCompany} />)
                : <Navigate to="/login" replace />
            }
          />

          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/standard-fare" element={<StandardFare />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/driver-upload" element={<DriverSearchPage />} />
          <Route path="/no-access" element={<NoAccess />} />

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
