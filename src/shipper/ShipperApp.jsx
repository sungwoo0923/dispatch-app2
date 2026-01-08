// ======================= src/shipper/ShipperApp.jsx =======================
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

// pages
import ShipperHome from "./pages/ShipperHome";
import ShipperOrder from "./pages/ShipperOrder";
import ShipperStatus from "./pages/ShipperStatus";

export default function ShipperApp() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [companyName, setCompanyName] = useState("");
const location = useLocation();
  // ================= 화주 권한 확인 =================
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        navigate("/shipper-login");
        return;
      }

      const snap = await getDoc(doc(db, "users", u.uid));
      if (!snap.exists() || snap.data().role !== "shipper") {
        navigate("/no-access");
        return;
      }

      setUser(u);
      setCompanyName(
        snap.data().companyName ||
        snap.data().company ||
        "화주사"
      );
    });

    return () => unsub();
  }, [navigate]);

  // ================= 로그아웃 =================
  const logout = async () => {
    await signOut(auth);
    navigate("/shipper-login");
  };

  // ================= 로딩 =================
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500">
        화주 권한 확인 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ================= HEADER ================= */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          {/* 🔙 홈으로 */}
          <button
            onClick={() => navigate("/shipper")}
            className="text-xl font-extrabold text-blue-600 hover:opacity-80"
          >
            RUN25 화주 포털
          </button>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-semibold">{companyName}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>

            <button
              onClick={logout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* ================= CONTENT ================= */}
      <main
  className={
    location.pathname.startsWith("/shipper/status")
      ? "w-full px-8 py-6"
      : "max-w-6xl mx-auto p-6"
  }
>
        <Routes>
          <Route index element={<ShipperHome />} />
          <Route path="order" element={<ShipperOrder />} />
          <Route path="status" element={<ShipperStatus />} />
          <Route path="*" element={<Navigate to="/shipper" replace />} />
        </Routes>
      </main>
    </div>
  );
}
