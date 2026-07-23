// ======================= src/shipper/ShipperApp.jsx =======================
import React, { useEffect, useState, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { updateDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { hardReloadForUpdate } from "../UpdateBanner";
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
        evts.push({ id: `${d.id}-done`, type: "배차완료", time: doneAt, text: `${transportName}에서 ${from} → ${to} 배차완료` });
      }
      if (o.최종수정출처 === "transport") {
        const editAt = _tsToDate(o.최종수정일시);
        if (editAt && _isTodayKST(editAt)) {
          evts.push({ id: `${d.id}-edit`, type: "수정", time: editAt, text: `${transportName}에서 ${from} → ${to} 수정했습니다` });
        }
      }
    });
    evts.sort((a, b) => a.time - b.time);
    setLiveEvents(evts);
  });
  return () => unsub();
}, [companyName]);

// ================= 최고관리자 강제 업데이트 감지 =================
// 화주사 클라이언트가 서비스워커 자동 갱신을 놓치는 경우를 대비해, 최고관리자가
// systemConfig/forceUpdate에 올려둔 minVersion보다 현재 실행중인 버전이 낮으면
// 닫을 수 없는 업데이트 배너를 띄운다.
const [forceUpdateNeeded, setForceUpdateNeeded] = useState(false);
useEffect(() => {
  const unsub = onSnapshot(doc(db, "systemConfig", "forceUpdate"), (snap) => {
    if (!snap.exists()) return;
    const minVersion = snap.data().minVersion;
    if (!minVersion) return;
    const cur = String(__APP_VERSION__).split(".").map(Number);
    const min = String(minVersion).split(".").map(Number);
    for (let i = 0; i < Math.max(cur.length, min.length); i++) {
      const c = cur[i] || 0, m = min[i] || 0;
      if (c < m) { setForceUpdateNeeded(true); return; }
      if (c > m) { setForceUpdateNeeded(false); return; }
    }
    setForceUpdateNeeded(false);
  });
  return () => unsub();
}, []);

// ================= 전역 실시간 알림 배너 (어느 메뉴에 있어도 표시) =================
// 기존에는 이 감지 로직이 ShipperStatus.jsx(운송목록 페이지) 안에만 있어서, 그 화면에
// 들어가 있을 때만 알림이 떴다. ShipperApp은 /shipper/* 전체를 감싸는 항상 마운트된
// 컴포넌트라, 여기서 감지하면 어느 메뉴에 있어도 실시간으로 뜬다.
const [globalToasts, setGlobalToasts] = useState([]);
const globalToastIdRef = useRef(0);
const pushGlobalToast = (t) => {
  const id = ++globalToastIdRef.current;
  setGlobalToasts((prev) => [...prev, { ...t, id }].slice(-4));
  setTimeout(() => setGlobalToasts((prev) => prev.filter((x) => x.id !== id)), 7000);
};
const gPrevVehicleRef = useRef({});
const gPrevWatchedFieldsRef = useRef({});
const gPrevPendingRef = useRef({});
const gPendingFirstLoadRef = useRef(true);
const gPrevEditStampRef = useRef({});
const gEditStampFirstLoadRef = useRef(true);
const gPrevEditReqRef = useRef({});
const gEditReqFirstLoadRef = useRef(true);
const gPrevCancelReqRef = useRef({});
const gCancelReqFirstLoadRef = useRef(true);

useEffect(() => {
  if (!companyName) return;
  const q = query(collection(db, "orders"), where("shipperCompany", "==", companyName));
  const unsub = onSnapshot(q, (snap) => {
    const docs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => o.지급방식 !== "손실");

    const vehicleChangedThisPass = new Set();
    docs.forEach((o) => {
      const curPlate = String(o.차량번호 || "").trim();
      const prevPlate = gPrevVehicleRef.current[o.id];
      if (prevPlate !== undefined) {
        if (!prevPlate && curPlate) {
          vehicleChangedThisPass.add(o.id);
          pushGlobalToast({ type: "dispatch", order: o, title: "배차완료", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · ${o.차량번호} ${o.이름 || ""}` });
        } else if (prevPlate && curPlate && prevPlate !== curPlate) {
          vehicleChangedThisPass.add(o.id);
          pushGlobalToast({ type: "dispatch", order: o, title: "재배차완료", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · ${o.차량번호} ${o.이름 || ""}` });
        } else if (prevPlate && !curPlate) {
          vehicleChangedThisPass.add(o.id);
          pushGlobalToast({ type: "dispatch", order: o, title: "재배차 진행중", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · 기사 배정이 취소되어 재배차가 진행 중입니다` });
        }
      }
      gPrevVehicleRef.current[o.id] = curPlate;
    });

    const WATCHED_EDIT_FIELDS = ["청구운임", "지급방식", "화물내용", "차량종류", "차량톤수", "상차일", "상차시간", "하차일", "하차시간", "상차방법", "하차방법", "상차지명", "상차지주소", "하차지명", "하차지주소"];
    const otherFieldChangedThisPass = new Set();
    docs.forEach((o) => {
      const prevFields = gPrevWatchedFieldsRef.current[o.id];
      if (prevFields && WATCHED_EDIT_FIELDS.some((f) => String(prevFields[f] ?? "") !== String(o[f] ?? ""))) {
        otherFieldChangedThisPass.add(o.id);
      }
      gPrevWatchedFieldsRef.current[o.id] = Object.fromEntries(WATCHED_EDIT_FIELDS.map((f) => [f, o[f]]));
    });

    const approvedThisPass = new Set();
    if (gPendingFirstLoadRef.current) {
      gPendingFirstLoadRef.current = false;
      docs.forEach((o) => { gPrevPendingRef.current[o.id] = !!o.화주사확인대기; });
    } else {
      docs.forEach((o) => {
        const cur = !!o.화주사확인대기;
        const prev = gPrevPendingRef.current[o.id];
        if (prev === true && cur === false && !o.배차거절) {
          approvedThisPass.add(o.id);
          pushGlobalToast({ type: "dispatch", order: o, title: "배차요청 승인", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"} · 배차중으로 전환됨` });
        }
        gPrevPendingRef.current[o.id] = cur;
      });
    }

    if (gEditStampFirstLoadRef.current) {
      gEditStampFirstLoadRef.current = false;
      docs.forEach((o) => { gPrevEditStampRef.current[o.id] = o.최종수정일시?.seconds || 0; });
    } else {
      docs.forEach((o) => {
        const cur = o.최종수정일시?.seconds || 0;
        const prev = gPrevEditStampRef.current[o.id];
        const vehicleOnlyChange = vehicleChangedThisPass.has(o.id) && !otherFieldChangedThisPass.has(o.id);
        if (!approvedThisPass.has(o.id) && !vehicleOnlyChange && o.최종수정출처 === "transport" && cur && prev !== undefined && cur !== prev) {
          pushGlobalToast({ type: "shipperEdit", order: o, title: "배차정보 수정", desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}` });
        }
        gPrevEditStampRef.current[o.id] = cur;
      });
    }

    if (gEditReqFirstLoadRef.current) {
      gEditReqFirstLoadRef.current = false;
      docs.forEach((o) => { gPrevEditReqRef.current[o.id] = !!o.수정요청; });
    } else {
      docs.forEach((o) => {
        const wasPending = gPrevEditReqRef.current[o.id];
        if (wasPending && !o.수정요청) {
          pushGlobalToast({
            type: o.수정거절 ? "cancel" : "dispatch",
            order: o,
            title: o.수정거절 ? "수정요청 거절" : "수정요청 승인",
            desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}`,
          });
        }
        gPrevEditReqRef.current[o.id] = !!o.수정요청;
      });
    }

    if (gCancelReqFirstLoadRef.current) {
      gCancelReqFirstLoadRef.current = false;
      docs.forEach((o) => { gPrevCancelReqRef.current[o.id] = !!o.취소요청; });
    } else {
      docs.forEach((o) => {
        const wasPending = gPrevCancelReqRef.current[o.id];
        if (wasPending && !o.취소요청) {
          pushGlobalToast({
            type: o.취소거절 ? "dispatch" : "cancel",
            order: o,
            title: o.취소거절 ? "배차취소 거절" : "배차취소 승인",
            desc: `${o.거래처명 || ""} | ${o.상차지명 || "-"} → ${o.하차지명 || "-"}`,
          });
        }
        gPrevCancelReqRef.current[o.id] = !!o.취소요청;
      });
    }
  });
  return () => unsub();
}, [companyName]);

const handleGlobalToastClick = (t) => {
  setGlobalToasts((prev) => prev.filter((x) => x.id !== t.id));
  if (t.order?.id) {
    try { sessionStorage.setItem("shipperFocusOrderId", t.order.id); } catch {}
  }
  navigate("/shipper/transport");
};

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
      {/* ================= 강제 업데이트 배너 ================= */}
      {forceUpdateNeeded && (
        <div
          className="fixed top-0 left-0 right-0 z-[999999] flex items-center justify-center gap-4 px-5 py-2.5"
          style={{ background: "#1B2B4B", color: "white", fontSize: 13, fontWeight: 600 }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
            새 버전이 있습니다. 새로고침해서 업데이트해주세요.
          </span>
          <button
            onClick={hardReloadForUpdate}
            style={{ background: "white", color: "#1B2B4B", border: "none", borderRadius: 6, padding: "5px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            업데이트
          </button>
        </div>
      )}

      {/* ================= 전역 실시간 알림 배너 (어느 메뉴에 있어도 표시) ================= */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[999998] space-y-2 pointer-events-none" style={{ width: "min(560px, 92vw)" }}>
        <style>{`
          @keyframes shipperGlobalToastSlideDown { 0% { opacity:0; transform:translateY(-100%); } 100% { opacity:1; transform:translateY(0); } }
          .shipper-global-toast-enter { animation: shipperGlobalToastSlideDown 0.35s ease-out forwards; }
        `}</style>
        {globalToasts.map(t => (
          <div
            key={t.id}
            className="shipper-global-toast-enter pointer-events-auto cursor-pointer rounded-2xl shadow-2xl border overflow-hidden"
            style={{
              background: t.type === "cancel"
                ? "linear-gradient(135deg, #991b1b 0%, #ef4444 100%)"
                : t.type === "attach"
                ? "linear-gradient(135deg, #065f46 0%, #10b981 100%)"
                : "linear-gradient(135deg, #1B2B4B 0%, #2d4a7a 100%)",
            }}
            onClick={() => handleGlobalToastClick(t)}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {t.type === "cancel" ? (
                    <><circle cx="12" cy="12" r="9"/><line x1="7" y1="7" x2="17" y2="17"/></>
                  ) : (
                    <><rect x="1" y="7" width="14" height="11" rx="1.5"/><path d="M15 11h4l3 3.5V18h-7z"/><circle cx="6.5" cy="19.5" r="1.8"/><circle cx="17" cy="19.5" r="1.8"/></>
                  )}
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[13px] font-bold leading-snug">{t.title}</div>
                <div className="text-white/80 text-[12px] mt-0.5 leading-relaxed break-words">{t.desc}</div>
                <div className="text-white/50 text-[10px] mt-1">클릭하면 해당 오더로 이동합니다</div>
              </div>
              <button
                className="text-white/40 hover:text-white text-[18px] leading-none shrink-0 mt-0.5 px-1"
                onClick={(e) => { e.stopPropagation(); setGlobalToasts(prev => prev.filter(x => x.id !== t.id)); }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ================= HEADER ================= */}
      <header className="bg-[#2f3e55] text-white">
  <div className="px-8 py-4 flex items-center gap-4 relative">

    {/* 좌측 로고 + 실시간 현황판 */}
    <div className="flex items-center gap-4 min-w-0 flex-1">

      {/* 로고 */}
      <div
        onClick={() => navigate("/shipper")}
        className="text-lg font-bold cursor-pointer shrink-0"
      >
        KP-FLOW
      </div>
      <span className="text-[11px] font-mono text-white/50 shrink-0">v{__APP_VERSION__}</span>

      <ShipperLiveTicker events={liveEvents} onOpenBig={() => setLiveBigOpen(true)} />
    </div>

<nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6 text-sm font-semibold whitespace-nowrap">

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
    <div className="flex items-center gap-4 justify-end ml-auto shrink-0">
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
    <div className="hidden md:flex items-center gap-2 bg-white/8 border border-white/10 rounded-full pl-3 pr-1.5 py-1.5 min-w-0 max-w-[480px] flex-1">
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
              <span className="text-[12px] text-white/85 whitespace-nowrap">{current.text}</span>
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