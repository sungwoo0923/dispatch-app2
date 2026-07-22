// ======================= src/shipper/ShipperApp.jsx =======================
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { updateDoc, collection, query, where, onSnapshot } from "firebase/firestore";
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

// ── 실시간 현황판: 운송사가 오늘 배차완료/수정한 이벤트만 뽑아낸다(화주사 자신의 등록은 제외) ──
const _todayKST = () => {
  const kst = new Date(Date.now() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
};
const _tsToDate = (v) => {
  if (!v) return null;
  if (typeof v === "number") return new Date(v);
  if (v?.toDate) return v.toDate();
  if (v?.seconds) return new Date(v.seconds * 1000);
  return null;
};
const _isTodayKST = (d) => {
  if (!d) return false;
  const kst = new Date(d.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10) === _todayKST();
};
const _fmtTimeKST = (d) => {
  const kst = new Date(d.getTime() + 9 * 3600000);
  const hh = kst.getUTCHours(), mm = kst.getUTCMinutes();
  const isAM = hh < 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${isAM ? "오전" : "오후"} ${h12}:${String(mm).padStart(2, "0")}`;
};

export default function ShipperApp() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [companyName, setCompanyName] = useState("");
const location = useLocation();
const [myInfoOpen, setMyInfoOpen] = useState(false);
const [transportMenuOpen, setTransportMenuOpen] = useState(false);
const [liveEvents, setLiveEvents] = useState([]);
const [liveBigOpen, setLiveBigOpen] = useState(false);
const [form, setForm] = useState({
  name: "",
  phone: "",
  department: "",
  position: ""
});

// ================= 실시간 현황판: 오늘 운송사가 배차완료/수정한 이벤트만 수집 =================
useEffect(() => {
  if (!companyName) return;
  const q = query(collection(db, "orders"), where("shipperCompany", "==", companyName));
  const unsub = onSnapshot(q, (snap) => {
    const evts = [];
    snap.docs.forEach((d) => {
      const o = d.data();
      const from = o.상차지명 || "-";
      const to = o.하차지명 || "-";
      const transportName = o.운송사명 || "운송사";
      const doneAt = _tsToDate(o.배차완료일시);
      if (doneAt && _isTodayKST(doneAt)) {
        evts.push({ id: `${d.id}-done`, type: "배차완료", time: doneAt, text: `${transportName}에서 ${from} → ${to} 배차를 완료했습니다.` });
      }
      if (o.최종수정출처 === "transport") {
        const editAt = _tsToDate(o.최종수정일시);
        if (editAt && _isTodayKST(editAt)) {
          evts.push({ id: `${d.id}-edit`, type: "수정", time: editAt, text: `${transportName}에서 ${from} → ${to} 오더를 수정했습니다.` });
        }
      }
    });
    evts.sort((a, b) => a.time - b.time);
    setLiveEvents(evts);
  });
  return () => unsub();
}, [companyName]);
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
  <div className="px-8 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">

    {/* 좌측 로고 + 실시간 현황판 */}
    <div className="flex items-center gap-4 min-w-0">

      {/* 로고 */}
      <div
        onClick={() => navigate("/shipper")}
        className="text-lg font-bold cursor-pointer shrink-0"
      >
        KP-FLOW
      </div>

      <ShipperLiveTicker events={liveEvents} onOpenBig={() => setLiveBigOpen(true)} />
    </div>

<nav className="flex items-center justify-center gap-6 text-sm font-semibold">

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

    {/* 우측 */}
    <div className="flex items-center gap-4 justify-end">
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

      {liveBigOpen && (
        <ShipperLiveBigModal events={liveEvents} onClose={() => setLiveBigOpen(false)} />
      )}
    </div>
  );
}

function ShipperLiveTicker({ events, onOpenBig }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (events.length <= 1) { setIdx(0); return; }
    const t = setInterval(() => setIdx((i) => (i + 1) % events.length), 3800);
    return () => clearInterval(t);
  }, [events.length]);

  const current = events[idx] || null;

  return (
    <div className="hidden md:flex items-center gap-2 bg-white/8 border border-white/10 rounded-full pl-3 pr-1.5 py-1.5 min-w-0 max-w-[420px] flex-1">
      <style>{`
        @keyframes shipperTickerSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .shipper-ticker-slide { animation: shipperTickerSlideIn 0.4s ease; }
      `}</style>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0 h-[18px] overflow-hidden relative">
        <div key={current ? current.id : "empty"} className="shipper-ticker-slide absolute inset-0 flex items-center gap-1.5">
          {current ? (
            <>
              <span className="text-[12px] text-white/85 truncate">{current.text}</span>
              <span className="text-[11px] text-white/40 shrink-0">{_fmtTimeKST(current.time)}</span>
            </>
          ) : (
            <span className="text-[12px] text-white/40">오늘 발생한 이벤트가 없습니다</span>
          )}
        </div>
      </div>
      <button
        onClick={onOpenBig}
        className="shrink-0 text-white/50 hover:text-white text-[11px] font-semibold px-2 py-1 rounded-full hover:bg-white/10 transition whitespace-nowrap"
      >
        크게보기
      </button>
    </div>
  );
}

function ShipperLiveBigModal({ events, onClose }) {
  const listRef = React.useRef(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events.length]);

  const todayLabel = (() => {
    const kst = new Date(Date.now() + 9 * 3600000);
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  })();

  return (
    <div className="fixed inset-0 bg-black/50 z-[999999] flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[480px] max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-bold text-[15px]">실시간 현황판</h3>
            <p className="text-white/50 text-[11px] mt-0.5">{todayLabel} 오늘 발생한 이벤트</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
          {events.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-16">오늘 발생한 이벤트가 없습니다</div>
          ) : (
            events.map((e) => (
              <div key={e.id} className="bg-white rounded-xl px-4 py-3 border border-gray-100 flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${e.type === "배차완료" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <div className="flex-1 min-w-0 text-[13px] text-gray-800">{e.text}</div>
                <span className="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">{_fmtTimeKST(e.time)}</span>
              </div>
            ))
          )}
        </div>
      </div>
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