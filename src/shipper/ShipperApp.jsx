// ======================= src/shipper/ShipperApp.jsx =======================
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function ShipperApp() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [companyName, setCompanyName] = useState("");

  // ---------------- 로그인/권한 확인 ----------------
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        navigate("/login");
        return;
      }

      setUser(u);

      // Firestore에서 role/회사명 확인
      const snap = await getDoc(doc(db, "users", u.uid));
      if (!snap.exists()) {
        navigate("/login");
        return;
      }

      const data = snap.data();
      if (data.role !== "shipper") {
        // 화주가 아니면 접근 차단
        navigate("/no-access");
        return;
      }

      setCompanyName(data.companyId || "화주사");
    });

    return () => unsub();
  }, [navigate]);

  // ---------------- 로그아웃 ----------------
  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem("role");
    navigate("/login");
  };

  // ---------------- 로딩 ----------------
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        화주 권한 확인 중...
      </div>
    );
  }

  // ======================= UI =======================
  return (
    <div className="min-h-screen bg-gray-100">
      {/* ======================= HEADER ======================= */}
      <header className="bg-white shadow-md px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xl font-extrabold text-gray-800">
            RUN25 화주 포털
          </span>
          <span className="text-xs text-gray-500">
            {companyName}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
            {user.email}
          </span>
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm shadow-sm"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* ======================= CONTENT ======================= */}
      <main className="p-6 max-w-5xl mx-auto">
        {/* 안내 카드 */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-2">
            화주 전용 오더 관리
          </h2>
          <p className="text-sm text-gray-600">
            이 화면에서는 <b>오더 등록</b>과 <b>배차 진행 현황 확인</b>만 가능합니다.
            내부 배차·정산 시스템은 접근할 수 없습니다.
          </p>
        </div>

        {/* 액션 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 오더 등록 */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-md font-bold mb-2">📦 오더 등록</h3>
            <p className="text-sm text-gray-600 mb-4">
              배송 요청을 직접 등록할 수 있습니다.
            </p>
            <button
              onClick={() => alert("다음 단계: 오더 등록 폼 연결")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-semibold"
            >
              오더 등록하기
            </button>
          </div>

          {/* 배차 현황 */}
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-md font-bold mb-2">🚚 배차 현황</h3>
            <p className="text-sm text-gray-600 mb-4">
              배차 완료 여부 및 차량/기사 정보를 확인합니다.
            </p>
            <button
              onClick={() => alert("다음 단계: 배차 현황 리스트 연결")}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-md font-semibold"
            >
              배차 현황 보기
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
// ======================= END =======================
