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
import ShipperSettlement from "./pages/ShipperSettlement";
import TransportManagement from "./pages/TransportManagement";
import ShipperSettings from "./pages/ShipperSettings";
import ChangePassword from "./pages/ChangePassword";
import ShipperNotice from "./pages/ShipperNotice";
import ShipperInquiry from "./pages/ShipperInquiry";
import InternalMessenger from "../InternalMessenger";

const myInfoLabelCls = "block text-xs font-bold text-gray-600 mb-1";
const myInfoInputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-[#1B2B4B]/40 focus:border-[#1B2B4B] outline-none";

export default function ShipperApp() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [companyName, setCompanyName] = useState("");
const location = useLocation();
const [myInfoOpen, setMyInfoOpen] = useState(false);
const [transportMenuOpen, setTransportMenuOpen] = useState(false);
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
if (!data.approved && u.email !== "tjddnqkf@naver.com") {
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
const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
const isTotalMasterUser = user?.email === TOTAL_MASTER_EMAIL;
const isMaster = isTotalMasterUser || userData?.permissions?.master;
const isSubMaster = isTotalMasterUser || userData?.permissions?.subMaster;
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
        KP-FLOW
      </div>

<nav className="flex gap-6 text-sm font-semibold">

  <MenuBtn
    label="대시보드"
    active={location.pathname === "/shipper"}
    onClick={() => navigate("/shipper")}
  />

{/* 운송 (호버 시 하위메뉴) */}
{(isMaster || isSubMaster || userData?.permissions?.transport) && (
  <div
    className="relative"
    onMouseEnter={() => setTransportMenuOpen(true)}
    onMouseLeave={() => setTransportMenuOpen(false)}
  >
    <MenuBtn
      label="운송"
      active={location.pathname.includes("/shipper/transport") || location.pathname.includes("/shipper/order")}
      onClick={() => navigate("/shipper/transport")}
    />
    {transportMenuOpen && (
      <div className="absolute left-0 top-full pt-2 z-50">
        <div className="w-48 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 overflow-hidden">
          <button
            onClick={() => { navigate("/shipper/transport"); setTransportMenuOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
          >
            운송목록
          </button>
          <button
            onClick={() => { navigate("/shipper/order"); setTransportMenuOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-[#eef1f7] hover:text-[#1B2B4B] transition"
          >
            일반배차등록
          </button>
          <button
            onClick={() => setTransportMenuOpen(false)}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-300 cursor-not-allowed"
            title="준비 중인 기능입니다"
          >
            대량배차등록 <span className="text-[10px] text-gray-300">(준비중)</span>
          </button>
        </div>
      </div>
    )}
  </div>
)}

{/* 정산 */}
{(isMaster || isSubMaster || userData?.permissions?.settlement) && (
  <MenuBtn
    label="정산"
    active={location.pathname.includes("/shipper/settlement")}
    onClick={() => navigate("/shipper/settlement")}
  />
)}

{/* 마스터 */}
{(isMaster || isSubMaster) && (
  <MenuBtn
    label="마스터설정"
    active={location.pathname.includes("/shipper/settings")}
    onClick={() => navigate("/shipper/settings")}
  />
)}

<MenuBtn
  label="공지사항"
  active={location.pathname.includes("/shipper/notice")}
  onClick={() => navigate("/shipper/notice")}
/>

<MenuBtn
  label="문의사항"
  active={location.pathname.includes("/shipper/inquiry")}
  onClick={() => navigate("/shipper/inquiry")}
/>

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
  className="bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1.5 rounded-lg text-sm font-semibold transition"
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
          <Route path="settlement" element={<ShipperSettlement />} />
          <Route path="settings" element={<ShipperSettings />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="notice" element={<ShipperNotice />} />
          <Route path="inquiry" element={<ShipperInquiry />} />
          <Route path="*" element={<Navigate to="/shipper" replace />} />
        </Routes>
      </main>
      <InternalMessenger
        user={user}
        userCompany={companyName}
        linkedCompanyName={userData?.linkedTransportCompany?.companyName || ""}
        themeColor="#1B2B4B"
        excludeRoles={["driver", "viewer"]}
      />
      {myInfoOpen && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setMyInfoOpen(false)}>
    <div className="bg-white rounded-2xl w-[420px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
        <h2 className="text-white font-bold text-[15px]">내 정보</h2>
        <button onClick={() => setMyInfoOpen(false)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
      </div>

      <div className="p-6 space-y-3.5 max-h-[70vh] overflow-y-auto">

      {/* 아이디 */}
      <div>
        <label className={myInfoLabelCls}>아이디</label>
        <input
          value={user.email}
          disabled
          className={myInfoInputCls + " bg-gray-100 text-gray-500"}
        />
      </div>

      {/* 이름 */}
      <div>
        <label className={myInfoLabelCls}>이름</label>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={myInfoInputCls}
        />
      </div>

      {/* 핸드폰 */}
      <div>
        <label className={myInfoLabelCls}>핸드폰번호</label>
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className={myInfoInputCls}
        />
      </div>

      {/* 부서 */}
      <div>
        <label className={myInfoLabelCls}>부서</label>
        <select
  value={form.department}
  onChange={(e) => setForm({ ...form, department: e.target.value })}
  disabled={!(isMaster || isSubMaster)}
          className={myInfoInputCls + (!(isMaster || isSubMaster) ? " bg-gray-100 text-gray-500" : "")}
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
      <div>
        <label className={myInfoLabelCls}>직책</label>
        <select
  value={form.position}
  onChange={(e) => setForm({ ...form, position: e.target.value })}
  disabled={!(isMaster || isSubMaster)}
          className={myInfoInputCls + (!(isMaster || isSubMaster) ? " bg-gray-100 text-gray-500" : "")}
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

      {/* 내 권한 */}
      <div>
        <label className={myInfoLabelCls}>내 권한</label>
        <div className={myInfoInputCls + " bg-gray-50 font-semibold text-[#1B2B4B]"}>
          {userData?.permissions?.master
            ? "마스터"
            : userData?.permissions?.subMaster
            ? "부마스터"
            : userData?.permissions?.settlement && userData?.permissions?.transport
            ? "정산 · 운송"
            : userData?.permissions?.settlement
            ? "정산"
            : userData?.permissions?.transport
            ? "운송"
            : "일반"}
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <button
        onClick={() => navigate("/shipper/change-password")}
        className="w-full border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-lg text-sm font-semibold transition"
      >
        비밀번호 변경
      </button>
      </div>

      {/* 버튼 */}
      <div className="border-t border-gray-100 px-6 py-4 flex gap-2">
        <button
          onClick={() => setMyInfoOpen(false)}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-semibold transition"
        >
          닫기
        </button>
        <button
          onClick={async () => {
            await updateDoc(doc(db, "users", user.uid), form);
            alert("저장 완료");
            setMyInfoOpen(false);
          }}
          className="flex-1 bg-[#1B2B4B] hover:opacity-90 text-white py-2.5 rounded-lg text-sm font-bold transition"
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
        px-3 py-1.5 rounded-md transition-all
        ${active
          ? "bg-[#28406b] text-white font-semibold ring-1 ring-emerald-400/30"
          : "text-gray-200 hover:text-white hover:bg-[#28406b] hover:ring-1 hover:ring-emerald-400/30"}
      `}
    >
      {label}
    </button>
  );
}