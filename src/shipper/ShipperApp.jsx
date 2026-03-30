// ======================= src/shipper/ShipperApp.jsx =======================
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { updateDoc } from "firebase/firestore";
// pages
import ShipperHome from "./pages/ShipperHome";
import ShipperOrder from "./pages/ShipperOrder";
import ShipperStatus from "./pages/ShipperStatus";
import TransportManagement from "./pages/TransportManagement";
import ShipperSettings from "./pages/ShipperSettings";
import ChangePassword from "./pages/ChangePassword";

export default function ShipperApp() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [companyName, setCompanyName] = useState("");
const location = useLocation();
const [myInfoOpen, setMyInfoOpen] = useState(false);
const [form, setForm] = useState({
  name: "",
  phone: "",
  department: "",
  position: ""
});
  // ================= 화주 권한 확인 =================
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        navigate("/shipper-login");
        return;
      }

      const snap = await getDoc(doc(db, "users", u.uid));

if (!snap.exists()) {
  navigate("/no-access");
  return;
}

const data = snap.data();
if (data.deleted) {
  alert("삭제된 계정입니다.");
  await signOut(auth);
  navigate("/shipper-login");
  return;
}
if (!data.approved) {
  navigate("/shipper-pending");
  return;
}
setUser(u);
setUserData(data);
setForm({
  name: data.name || "",
  phone: data.phone || "",
  department: data.department || "",
  position: data.position || ""
});
setCompanyName(
  data.companyName ||
  data.company ||
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
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* ================= HEADER ================= */}
      <header className="bg-[#2f3e55] text-white">
  <div className="px-8 py-4 flex items-center justify-between">

    {/* 좌측 로고 + 메뉴 */}
    <div className="flex items-center gap-10">

      {/* 로고 */}
      <div
        onClick={() => navigate("/shipper")}
        className="text-lg font-bold cursor-pointer"
      >
        RUN25
      </div>

<nav className="flex gap-6 text-sm font-semibold">

  <MenuBtn
    label="대시보드"
    active={location.pathname === "/shipper"}
    onClick={() => navigate("/shipper")}
  />

  {/* 운송 */}
  {userData?.permissions?.transport && (
    <MenuBtn
      label="운송"
      active={location.pathname.includes("/shipper/transport")}
      onClick={() => navigate("/shipper/transport")}
    />
  )}

  {/* 정산 */}
  {userData?.permissions?.settlement && (
    <MenuBtn
      label="정산"
      active={location.pathname.includes("/shipper/settlement")}
      onClick={() => alert("정산 준비중")}
    />
  )}

  {/* 마스터 */}
  {userData?.permissions?.master && (
    <MenuBtn
      label="마스터설정"
      active={location.pathname.includes("/shipper/settings")}
      onClick={() => navigate("/shipper/settings")}
    />
  )}

</nav>
    </div>

    {/* 우측 */}
    <div className="flex items-center gap-4">
      <div className="text-sm text-right">
        <div>{companyName}</div>
        <div className="text-xs text-gray-300">{user.email}</div>
      </div>
<button
  onClick={() => setMyInfoOpen(true)}
  className="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded text-sm"
>
  내정보
</button>
      <button
        onClick={logout}
        className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm"
      >
        로그아웃
      </button>
    </div>
  </div>
</header>
      {/* ================= CONTENT ================= */}
      <main
  className={
    location.pathname.startsWith("/shipper/status") ||
location.pathname.startsWith("/shipper/transport")
      ? "w-full px-8 py-6"
      : "w-full px-8 py-6"
  }
>
        <Routes>
          <Route index element={<ShipperHome />} />
          <Route path="order" element={<ShipperOrder />} />
          <Route path="status" element={<ShipperStatus />} />
          <Route path="transport" element={<ShipperStatus />} />
          <Route path="settings" element={<ShipperSettings />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="*" element={<Navigate to="/shipper" replace />} />
        </Routes>
      </main>
      {myInfoOpen && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl w-[420px] p-6 shadow-xl">

      <h2 className="text-lg font-bold mb-4">내 정보</h2>

      {/* 아이디 */}
      <div className="mb-3">
        <label className="text-sm">아이디</label>
        <input
          value={user.email}
          disabled
          className="w-full border px-3 py-2 rounded bg-gray-100"
        />
      </div>

      {/* 이름 */}
      <div className="mb-3">
        <label className="text-sm">이름</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      {/* 핸드폰 */}
      <div className="mb-3">
        <label className="text-sm">핸드폰번호</label>
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      {/* 부서 */}
      <div className="mb-3">
        <label className="text-sm">부서</label>
        <select
          value={form.department}
          disabled={!userData?.permissions?.master}
          className="w-full border px-3 py-2 rounded"
        >
          <option>선택</option>
          <option>경영</option>
          <option>물류</option>
          <option>회계</option>
          <option>영업</option>
          <option>법무</option>
          <option>인사</option>
          <option>사무</option>
          <option>기술지원</option>
          <option>경비</option>
        </select>
      </div>

      {/* 직책 */}
      <div className="mb-3">
        <label className="text-sm">직책</label>
        <select
          value={form.position}
          disabled={!userData?.permissions?.master}
          className="w-full border px-3 py-2 rounded"
        >
          <option>선택</option>
          <option>대표</option>
          <option>부장</option>
          <option>차장</option>
          <option>과장</option>
          <option>대리</option>
          <option>사원</option>
          <option>인턴</option>
          <option>수습</option>
        </select>
      </div>

      {/* 비밀번호 변경 */}
      <button
        onClick={() => navigate("/shipper/change-password")}
        className="w-full bg-gray-800 text-white py-2 rounded mt-2"
      >
        비밀번호 변경
      </button>

      {/* 버튼 */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => setMyInfoOpen(false)}
          className="flex-1 border py-2 rounded"
        >
          닫기
        </button>
        <button
          onClick={async () => {
            await updateDoc(doc(db, "users", user.uid), form);
            alert("저장 완료");
            setMyInfoOpen(false);
          }}
          className="flex-1 bg-blue-500 text-white py-2 rounded"
        >
          저장
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
function MenuBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-md transition
        ${active
          ? "bg-white/20"
          : "hover:bg-white/10 text-gray-200"}
      `}
    >
      {label}
    </button>
  );
}