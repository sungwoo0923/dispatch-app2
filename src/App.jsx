// ======================= src/App.jsx (ROLE FIRESTORE VER - FINAL) =======================

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
import NoAccess from "./NoAccess";
import UploadPage from "./UploadPage";
import StandardFare from "./StandardFare";
import ChangePassword from "./ChangePassword";

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // ⭐ 업데이트 알림 표시 여부
  const [updateReady, setUpdateReady] = useState(false);

  // =====================================================================
  // SW에서 보내는 "NEW_VERSION" 메시지 → updateReady = true
  // =====================================================================
  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener("app-update-ready", onUpdate);
    return () => window.removeEventListener("app-update-ready", onUpdate);
  }, []);

  // =====================================================================
  // 인증 + ROLE 가져오기
  // =====================================================================
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
        const r = snap.data().role;
        setRole(r);
        localStorage.setItem("role", r);
      } else {
        setRole(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        권한 확인 중...
      </div>
    );
  }

  const isMobile = /android|iphone|ipad|ipod|kakaotalk/i.test(
    navigator.userAgent
  );

  // =====================================================================
  // ⭐ 업데이트 적용 함수 → 실제로 SKIP_WAITING 실행
  // =====================================================================
  const applyUpdate = async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    // SW 교체 후 페이지 새로고침
    window.location.reload();
  };

  // =====================================================================
  // JSX RETURN
  // =====================================================================
  return (
    <>
      {/* ================== 업데이트 알림 토스트 UI ================== */}
      {updateReady && (
        <div className="fixed bottom-6 right-6 bg-white shadow-xl border rounded-lg p-4 z-[9999] w-72">
          <div className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <span>🔄 새 업데이트가 있습니다</span>
          </div>

          <p className="text-sm text-gray-600 mb-3">
            최신 기능을 적용하려면 업데이트를 진행하세요.
          </p>

          <div className="flex gap-2">
            <button
              onClick={applyUpdate}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm"
            >
              지금 업데이트
            </button>

            <button
              onClick={() => setUpdateReady(false)}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded text-sm"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* ========================= 라우터 ========================== */}
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* 직원/관리자 로그인 */}
          <Route
            path="/login"
            element={
              user
                ? role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : <Navigate to="/app" replace />
                : <Login />
            }
          />

          <Route path="/signup" element={<Signup />} />

          {/* 기사 로그인/회원가입 */}
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

          {/* 기사 홈 */}
          <Route
            path="/driver-home"
            element={
              user && role === "driver"
                ? <DriverHome />
                : <Navigate to="/driver-login" replace />
            }
          />

          {/* 직원/관리자 메인 */}
          <Route
            path="/app"
            element={
              user && role !== "driver"
                ? (isMobile
                    ? <MobileApp role={role} />
                    : <DispatchApp role={role} />)
                : <Navigate to="/login" replace />
            }
          />

          {/* 공용 페이지 */}
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/standard-fare" element={<StandardFare />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/no-access" element={<NoAccess />} />

          {/* 모든 미지정 경로 처리 */}
          <Route
            path="*"
            element={
              user
                ? role === "driver"
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
