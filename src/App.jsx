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
import { onAuthStateChanged, signOut } from "firebase/auth";
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
// 폴더블 폰 등 안드로이드 폰은 제외 ("mobile" UA 포함)
function isTabletDevice() {
  const ua = navigator.userAgent.toLowerCase();
  // 폰 UA → 태블릿으로 취급하지 않음
  const isPhone = /iphone|ipod/.test(ua) || (ua.includes("android") && ua.includes("mobile"));
  if (isPhone) return false;
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

  // ★ 스플래시 후 데스크톱 viewport 복원 (index.html 기본값: user-scalable=no)
  useEffect(() => {
    const isMobile = isSmartPhone();
    const isTab = isTabletDevice();
    if (!isMobile && !isTab && !loading && splashDone) {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover";
    }
  }, [loading, splashDone]);

  // ★ 작은 화면(폰)이 데스크탑 사이트를 요청한 경우 viewport 스케일 보정
  // 단, 실제 모바일 앱(MobileApp)을 보여줄 때는 절대 적용하지 않음
  useEffect(() => {
    if (isTablet) return; // 태블릿 전용 effect가 이미 처리함
    if (isSmartPhone()) {
      // 모바일 앱 모드: 데스크탑 사이트 보다가 모바일로 돌아온 경우
      // viewport를 모바일 기본값으로 명시적 복원 (user-scalable=no 포함)
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
      return;
    }
    // 이 시점에서는 phone UA가 아닌데 screen.width < 768 → 안드로이드 폰이 데스크탑 요청한 경우
    const applyScale = () => {
      const screenW = window.screen.width || window.innerWidth;
      if (screenW >= 768) return; // 실제 폰 화면이 아니면 무시
      const meta = document.querySelector('meta[name="viewport"]');
      if (!meta) return;
      const w = Math.min(screenW, window.innerWidth);
      const TARGET = 1200;
      const scale = Math.min(1, w / TARGET).toFixed(3);
      meta.content = `width=${TARGET}, initial-scale=${scale}, minimum-scale=0.2, maximum-scale=5.0, user-scalable=yes`;
    };
    applyScale();
    window.addEventListener("resize", applyScale);
    const onOri = () => setTimeout(applyScale, 150);
    window.addEventListener("orientationchange", onOri);
    return () => {
      window.removeEventListener("resize", applyScale);
      window.removeEventListener("orientationchange", onOri);
    };
  }, [isTablet]);

  // ★ 태블릿 viewport 동적 조정 (가로/세로 모드 모두 대응)
  useEffect(() => {
    if (!isTablet) return;

    const updateViewport = () => {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "viewport";
        document.head.appendChild(meta);
      }
      // Use the smaller of screen.width (physical device CSS px) and innerWidth
      // so that phones requesting desktop mode (innerWidth ~1024) still scale
      // down based on the actual device screen size (e.g. 390px)
      const w = Math.min(window.screen.width || window.innerWidth, window.innerWidth);
      const TARGET = 1200;
      const scale = Math.min(1, (w / TARGET)).toFixed(3);
      meta.content = `width=${TARGET}, initial-scale=${scale}, minimum-scale=0.3, maximum-scale=5.0, user-scalable=yes`;
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    const onOrientationChange = () => setTimeout(updateViewport, 120);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", onOrientationChange);
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover";
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

  // 네트워크 문제로 Firestore 응답 없을 때 영구 로딩 방지 (8초 타임아웃)
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, [loading]);

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
          if (data.employmentStatus === "퇴사") {
            alert("퇴사 처리된 계정입니다. 관리자에게 문의해주세요.");
            signOut(auth);
            setUser(null);
            setRole(null);
            setLoading(false);
            return;
          }
          const dataRole = data.role || "user";
          setRole(dataRole);
          // approved !== false allows old accounts (undefined) and explicitly true
          // only blocks accounts explicitly set to false (new unapproved signups)
          setApproved(data.approved !== false);
          if (dataRole === "totalMaster") {
            // totalMaster uses the company they typed at login, not their Firestore doc
            const loginCompany = localStorage.getItem("loginCompany") || "";
            setUserCompany(loginCompany);
            try { localStorage.setItem("userCompany", loginCompany); } catch {}
          } else {
            setUserCompany(data.companyName || "");
            try { localStorage.setItem("userCompany", data.companyName || ""); } catch {};
          }
          // localStorage가 꽉 찬 경우 대용량 항목 먼저 정리 후 저장
          const safeSetItem = (key, val) => {
            try { localStorage.setItem(key, val); } catch {
              ["mobileNotifs", "attachments", "detailAttachments"].forEach(k => { try { localStorage.removeItem(k); } catch {} });
              // shownNotifs_ prefix 항목도 정리
              Object.keys(localStorage).filter(k2 => k2.startsWith("shownNotifs_") || k2.startsWith("attach_")).forEach(k2 => { try { localStorage.removeItem(k2); } catch {} });
              try { localStorage.setItem(key, val); } catch {}
            }
          };
          safeSetItem("role", dataRole);
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
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff", userSelect: "none", WebkitUserSelect: "none" }}>
        <style>{`
          @keyframes splashLogoIn {
            0%   { opacity: 0; transform: scale(0.8) translateY(12px); }
            70%  { opacity: 1; transform: scale(1.03) translateY(-2px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes splashDotPulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50%       { opacity: 1;   transform: scale(1); }
          }
          .splash-logo-img { animation: splashLogoIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.1s both; pointer-events: none; -webkit-user-drag: none; }
          .splash-dot { width: 7px; height: 7px; border-radius: 50%; background: #1B2B4B; }
          .splash-dot-1 { animation: splashDotPulse 1.1s ease-in-out 0.9s infinite; }
          .splash-dot-2 { animation: splashDotPulse 1.1s ease-in-out 1.1s infinite; }
          .splash-dot-3 { animation: splashDotPulse 1.1s ease-in-out 1.3s infinite; }
        `}</style>
        <img
          src="/icons/sflow-logo.png"
          alt="KP-Flow Logistics"
          draggable={false}
          onDragStart={e => e.preventDefault()}
          className="splash-logo-img"
          style={{ width: "60vw", maxWidth: "280px" }}
        />
        {loading && (
          <div style={{ display: "flex", gap: "9px", marginTop: "28px" }}>
            <div className="splash-dot splash-dot-1" />
            <div className="splash-dot splash-dot-2" />
            <div className="splash-dot splash-dot-3" />
          </div>
        )}
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
            element={user && role === "driver" && approved ? <Navigate to="/driver-home" replace /> : <DriverLogin />}
          />
          <Route
            path="/driver-register"
            element={user && role === "driver" && approved ? <Navigate to="/driver-home" replace /> : <DriverRegister />}
          />
          <Route
            path="/driver-home"
            element={user && role === "driver" && approved ? <DriverHome /> : <Navigate to="/driver-login" replace />}
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
