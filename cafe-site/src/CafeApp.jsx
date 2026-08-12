// ======================= cafe-site/src/CafeApp.jsx =======================
// 배차마당 — 운송사/화주/기사 누구나 가입해 오더를 올리고 서로 배차를 잡는
// 카페형 오더 공유 사이트. 디자인은 운송 프로그램과 동일한 네이비/그레이 톤을 쓴다.
// 이 사이트는 운송 프로그램(dispatch-app2) 본체와 완전히 분리된 독립 사이트라
// 외부 라우터가 로그인 사용자를 prop으로 내려주지 않는다. 따라서 이 컴포넌트가
// 스스로 onAuthStateChanged로 로그인 상태를 관리한다.
import React, { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { VEHICLE_TYPES, PAY_TYPES, PAGE_SIZE, CAFE_ROLES } from "./cafeConstants";
import { subscribeCafeOrders, subscribeMyCafeOrders, subscribeCafeNotifications } from "./cafeApi";
import CafeOrderCard from "./CafeOrderCard";
import CafeOrderForm from "./CafeOrderForm";
import CafeOrderDetail from "./CafeOrderDetail";
import CafeOrderTable from "./CafeOrderTable";
import CafeSettlementList from "./CafeSettlementList";
import CafeBrand from "./CafeBrand";
import CafeNotificationBell from "./CafeNotificationBell";
import Pagination from "./Pagination";

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fa]">
      <div className="flex gap-2">
        {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#1B2B4B] animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </div>
    </div>
  );
}

const TABS = [
  ["board", "홈"],
  ["live", "실시간배차현황"],
  ["mine", "내 등록 오더"],
  ["settlement", "정산현황"],
  ["mypage", "마이페이지"],
];

export default function CafeApp() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = 확인 중, null = 로그아웃 상태
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("board");
  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [q, setQ] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  // 가입 후 첫 접속이든 재접속이든, 목록은 항상 "기본형(표)"으로 시작한다(요청사항).
  const [viewMode, setViewMode] = useState("table"); // table | card
  const [page, setPage] = useState(1);
  const nav = useNavigate();
  const { id: selectedOrderId } = useParams();

  // 이 사이트만의 Firebase Auth 상태 구독 — 별도 사이트라 외부에서 user를 받지 않는다.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u || null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUser?.uid) { setProfile(null); return; }
    getDoc(doc(db, "users", authUser.uid)).then(snap => {
      const d = snap.data() || {};
      setProfile({
        uid: authUser.uid, email: authUser.email,
        companyName: d.companyName || "", name: d.name || "", nickname: d.nickname || "", phone: d.phone || "",
        cafeRole: d.cafeRole || "shipper", bizNumber: d.bizNumber || "",
        vehicleNumber: d.vehicleNumber || "", vehicleType: d.vehicleType || "",
      });
    });
  }, [authUser]);

  useEffect(() => {
    const unsub = subscribeCafeOrders(setOrders);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeMyCafeOrders(profile.uid, setMyOrders);
    return () => unsub();
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeCafeNotifications(profile.uid, setNotifications);
    return () => unsub();
  }, [profile?.uid]);

  const filtered = useMemo(() => {
    const base = tab === "live" ? orders.filter(o => o.status === "open") : orders;
    const _q = q.trim().toLowerCase();
    return base.filter(o => {
      if (vehicleFilter && o.차량종류 !== vehicleFilter) return false;
      if (payFilter && o.지급방식 !== payFilter) return false;
      if (_q) {
        const hay = `${o.상차지명 || ""} ${o.하차지명 || ""} ${o.화물내용 || ""}`.toLowerCase();
        if (!hay.includes(_q)) return false;
      }
      return true;
    });
  }, [orders, tab, q, vehicleFilter, payFilter]);

  // URL(/orders/:id)에 대응하는 오더를 상세 모달로 표시 — 실시간 갱신도 그대로 반영된다
  // (신청중 → 배차완료 전환 등).
  const selectedOrder = selectedOrderId
    ? (orders.find(o => o.id === selectedOrderId) || myOrders.find(o => o.id === selectedOrderId) || null)
    : null;

  const openOrder = (o) => nav(`/orders/${o.id}`);
  const closeOrder = () => nav("/");

  const logout = async () => { await signOut(auth); nav("/login", { replace: true }); };

  const gotoNotification = (n) => { if (n.orderId) openOrder({ id: n.orderId }); };

  // 탭/검색/필터가 바뀌면 페이지는 1로 되돌린다.
  useEffect(() => { setPage(1); }, [tab, q, vehicleFilter, payFilter]);

  // 로그인 상태 확인 중
  if (authUser === undefined) return <LoadingScreen />;
  // 미로그인 → 로그인 페이지로
  if (authUser === null) return <Navigate to="/login" replace />;
  // 로그인은 됐지만 프로필(users/{uid}) 아직 로딩 중
  if (!profile) return <LoadingScreen />;

  const listToShow = tab === "mine" ? myOrders : filtered;
  const totalPages = Math.max(1, Math.ceil(listToShow.length / PAGE_SIZE));
  const pageRows = listToShow.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasNewApply = myOrders.some(o => o.posterUnread);
  const roleLabel = CAFE_ROLES.find(r => r.key === profile.cafeRole)?.label?.split(" ")[0] || "";

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      {/* 상단 네비 */}
      <div className="bg-[#1B2B4B] sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center gap-6">
          <button onClick={() => { setTab("board"); if (selectedOrderId) nav("/"); }} className="shrink-0">
            <CafeBrand size="sm" dark />
          </button>
          <nav className="flex items-center gap-1 flex-1">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => { setTab(k); if (selectedOrderId) nav("/"); }}
                className={`relative px-3 py-1.5 rounded-lg text-[13px] font-semibold transition ${tab === k ? "bg-white text-[#1B2B4B]" : "text-white/70 hover:bg-white/10"}`}>
                {l}
                {k === "mine" && hasNewApply && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-cafe-blink">NEW</span>
                )}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <CafeNotificationBell notifications={notifications} onGoto={gotoNotification} />
            <span className="text-white/70 text-[12px] hidden sm:inline">
              {profile.companyName} · {profile.nickname}
              {roleLabel && <span className="ml-1 px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[10px] font-bold">{roleLabel}</span>}
            </span>
            <button onClick={logout} className="text-white/60 hover:text-white text-[12px] font-semibold">로그아웃</button>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {tab === "mypage" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
              <div className="text-[15px] font-bold text-gray-900 mb-4">마이페이지</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-400 font-semibold">회원구분</span>
                  <span className="text-gray-800 font-medium">{CAFE_ROLES.find(r => r.key === profile.cafeRole)?.label || "-"}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-400 font-semibold">회사명</span>
                  <span className="text-gray-800 font-medium">{profile.companyName || "-"}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-400 font-semibold">이름</span>
                  <span className="text-gray-800 font-medium">{profile.name || "-"}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-400 font-semibold">닉네임</span>
                  <span className="text-gray-800 font-medium">{profile.nickname || "-"}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-400 font-semibold">휴대폰번호</span>
                  <span className="text-gray-800 font-medium">{profile.phone || "-"}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-400 font-semibold">이메일(아이디)</span>
                  <span className="text-gray-800 font-medium">{profile.email || "-"}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-gray-400 font-semibold">사업자등록번호</span>
                  <span className="text-gray-800 font-medium">{profile.bizNumber || "-"}</span>
                </div>
                {profile.cafeRole === "driver" && (
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-400 font-semibold">차량번호</span>
                    <span className="text-gray-800 font-medium">{profile.vehicleNumber || "-"}{profile.vehicleType ? ` · ${profile.vehicleType}` : ""}</span>
                  </div>
                )}
              </div>
              <button onClick={logout}
                className="w-full mt-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-[13px] hover:bg-gray-50 transition">
                로그아웃
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="text-[15px] font-bold text-gray-900 mb-4">활동 요약</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-gray-500 font-semibold">내가 등록한 오더</span>
                  <span className="text-[15px] font-black text-[#1B2B4B]">{myOrders.length}건</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-gray-500 font-semibold">내가 신청한 오더</span>
                  <span className="text-[15px] font-black text-[#1B2B4B]">{orders.filter(o => o.applicantUid === profile.uid).length}건</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-gray-500 font-semibold">안읽은 알림</span>
                  <span className="text-[15px] font-black text-red-500">{notifications.filter(n => !n.read).length}건</span>
                </div>
              </div>
            </div>
          </div>
        ) : tab === "settlement" ? (
          <>
            <div className="text-[13px] text-gray-500 mb-4">배차완료 이후 오더의 정산(인수증/명세서, 정산완료) 현황입니다.</div>
            <CafeSettlementList orders={orders} profile={profile} onOpen={openOrder} />
          </>
        ) : (
          <>
            {tab !== "mine" && (
              <>
                {/* 현황 요약 — 휑해 보이지 않게 한눈에 보이는 숫자 몇 개 */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    ["전체 오더", orders.length],
                    ["대기중", orders.filter(o => o.status === "open").length],
                    ["오늘 등록", orders.filter(o => o.createdAt?.toDate && sameDay(o.createdAt.toDate(), new Date())).length],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                      <div className="text-[11px] font-bold text-gray-400">{l}</div>
                      <div className="text-[22px] font-black text-[#1B2B4B] mt-0.5">{v}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="상/하차지, 화물내용 검색"
                    className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white" />
                  <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white">
                    <option value="">차량종류 전체</option>
                    {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B] bg-white">
                    <option value="">지급방식 전체</option>
                    {PAY_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden shrink-0">
                    {[["table", "기본형"], ["card", "카드형"]].map(([k, l]) => (
                      <button key={k} onClick={() => setViewMode(k)}
                        className={`px-3 py-2 text-[12.5px] font-bold transition ${viewMode === k ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setEditingOrder(null); setFormOpen(true); }}
                    className="px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition shrink-0">
                    + 오더 등록
                  </button>
                </div>
              </>
            )}

            {tab === "mine" && (
              <div className="flex items-center justify-between mb-5">
                <div className="text-[13px] text-gray-500">내가 등록한 오더 {myOrders.length}건</div>
                <div className="flex items-center gap-2">
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden shrink-0">
                    {[["table", "기본형"], ["card", "카드형"]].map(([k, l]) => (
                      <button key={k} onClick={() => setViewMode(k)}
                        className={`px-3 py-2 text-[12.5px] font-bold transition ${viewMode === k ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setEditingOrder(null); setFormOpen(true); }}
                    className="px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition">
                    + 오더 등록
                  </button>
                </div>
              </div>
            )}

            {listToShow.length === 0 ? (
              <div className="py-24 text-center text-[13px] text-gray-400">등록된 오더가 없습니다.</div>
            ) : viewMode === "table" ? (
              <CafeOrderTable orders={pageRows} onClick={openOrder} showUnread={tab === "mine"} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {pageRows.map(o => (
                  <CafeOrderCard key={o.id} order={o} onClick={() => openOrder(o)} showUnread={tab === "mine"} />
                ))}
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>

      {formOpen && (
        <CafeOrderForm
          orders={orders}
          profile={profile}
          editing={editingOrder}
          onClose={() => { setFormOpen(false); setEditingOrder(null); }}
          onSaved={() => { setFormOpen(false); setEditingOrder(null); }}
        />
      )}

      {selectedOrder && (
        <CafeOrderDetail
          order={selectedOrder}
          profile={profile}
          notifications={notifications}
          onClose={closeOrder}
          onEdit={(o) => { closeOrder(); setEditingOrder(o); setFormOpen(true); }}
        />
      )}
    </div>
  );
}
