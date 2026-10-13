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
import { VEHICLE_TYPES, PAY_TYPES } from "./cafeConstants";
import { subscribeCafeOrders, subscribeMyCafeOrders } from "./cafeApi";
import CafeOrderCard from "./CafeOrderCard";
import CafeOrderForm from "./CafeOrderForm";
import CafeOrderDetail from "./CafeOrderDetail";
import CafeOrderTable from "./CafeOrderTable";
import CafeHome from "./CafeHome";
import { CafeEditProvider, EditModeToggle, T, TOTAL_MASTER_EMAIL } from "./CafeEditMode";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fa]">
      <div className="flex gap-2">
        {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#1B2B4B] animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}
      </div>
    </div>
  );
}

export default function CafeApp() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = 확인 중, null = 로그아웃 상태
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("board"); // board | live | mine | mypage
  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [q, setQ] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" = 전체
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewMode, setViewMode] = useState("card"); // card | table
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
        role: d.role || "",
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

  const filtered = useMemo(() => {
    const base = statusFilter ? orders.filter(o => o.status === statusFilter) : orders;
    const _q = q.trim().toLowerCase();
    return base.filter(o => {
      if (vehicleFilter && o.차량종류 !== vehicleFilter) return false;
      if (payFilter && o.지급방식 !== payFilter) return false;
      if (_q) {
        const hay = `${o.상차지명 || ""} ${o.하차지명 || ""} ${o.상차지주소 || ""} ${o.하차지주소 || ""} ${o.화물내용 || ""}`.toLowerCase();
        if (!hay.includes(_q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, q, vehicleFilter, payFilter]);

  // URL(/orders/:id)에 대응하는 오더를 상세 모달로 표시 — 실시간 갱신도 그대로 반영된다
  // (신청중 → 배차완료 전환 등).
  const selectedOrder = selectedOrderId
    ? (orders.find(o => o.id === selectedOrderId) || myOrders.find(o => o.id === selectedOrderId) || null)
    : null;

  const openOrder = (o) => nav(`/orders/${o.id}`);
  const closeOrder = () => nav("/");

  const logout = async () => { await signOut(auth); nav("/login", { replace: true }); };

  // 로그인 상태 확인 중
  if (authUser === undefined) return <LoadingScreen />;
  // 미로그인 → 로그인 페이지로
  if (authUser === null) return <Navigate to="/login" replace />;
  // 로그인은 됐지만 프로필(users/{uid}) 아직 로딩 중
  if (!profile) return <LoadingScreen />;

  const listToShow = tab === "mine" ? myOrders : filtered;

  const goLive = (vehicle) => {
    setTab("live");
    setVehicleFilter(typeof vehicle === "string" ? vehicle : "");
    if (selectedOrderId) nav("/");
  };

  const ViewToggle = (
    <div className="flex border border-gray-200 rounded-lg overflow-hidden shrink-0">
      {[["card", "카드형"], ["table", "기본형"]].map(([k, l]) => (
        <button key={k} onClick={() => setViewMode(k)}
          className={`px-3 py-2 text-[12.5px] font-bold transition ${viewMode === k ? "bg-[#1B2B4B] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
          <T k={`view.${k}`}>{l}</T>
        </button>
      ))}
    </div>
  );

  // 카드/표 목록 — cardCols로 화면 폭에 맞게 칸 수를 늘린다
  const renderList = (list, cardCols) => (
    list.length === 0 ? (
      <div className="py-24 text-center text-[13px] text-gray-400 bg-white border border-gray-200 rounded-xl"><T k="list.empty">등록된 오더가 없습니다.</T></div>
    ) : viewMode === "table" ? (
      <CafeOrderTable orders={list} onClick={openOrder} />
    ) : (
      <div className={`grid gap-3 ${cardCols}`}>
        {list.map(o => <CafeOrderCard key={o.id} order={o} onClick={() => openOrder(o)} />)}
      </div>
    )
  );

  const countBy = (list, st) => list.filter(o => o.status === st).length;

  // 최고관리자(운송 프로그램과 동일 기준) — 편집모드 버튼 노출용. 실제 저장 권한은 firestore.rules에서 재검증.
  const isAdmin = profile.role === "totalMaster" || profile.email === TOTAL_MASTER_EMAIL;

  return (
    <CafeEditProvider isAdmin={isAdmin}>
    <div className="min-h-screen bg-[#f4f6fa]">
      {/* 상단 네비 */}
      <div className="bg-[#1B2B4B] sticky top-0 z-40">
        <div className="w-full px-4 lg:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => { setTab("board"); if (selectedOrderId) nav("/"); }}>
            <div className="w-7 h-7 rounded-md bg-white/15 flex items-center justify-center text-white font-black text-[13px]">배</div>
            <T k="nav.brand" className="text-white font-black text-[15px] tracking-tight">배차마당</T>
          </div>
          <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
            {[["board", "홈"], ["live", "실시간배차현황"], ["mine", "내 등록 오더"], ["mypage", "마이페이지"]].map(([k, l]) => (
              <button key={k} onClick={() => { setTab(k); if (selectedOrderId) nav("/"); }}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition whitespace-nowrap ${tab === k ? "bg-white text-[#1B2B4B]" : "text-white/70 hover:bg-white/10"}`}>
                <T k={`nav.${k}`}>{l}</T>
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <EditModeToggle />
            <span className="text-white/70 text-[12px] hidden sm:inline">{profile.companyName} · {profile.nickname}</span>
            <button onClick={logout} className="text-white/60 hover:text-white text-[12px] font-semibold"><T k="nav.logout">로그아웃</T></button>
          </div>
        </div>
      </div>

      <div className="w-full px-4 lg:px-6 py-5">
        {tab === "board" && (
          <CafeHome
            orders={orders}
            profile={profile}
            onNewOrder={() => { setEditingOrder(null); setFormOpen(true); }}
            onGoLive={goLive}
            onOpenOrder={openOrder}
          />
        )}

        {tab === "live" && (
          // 왼쪽 3 : 오른쪽 7 — 왼쪽에서 오더를 입력하면서 오른쪽에서 배차현황을 실시간으로 본다
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-start">
            <div className="lg:col-span-3 lg:sticky lg:top-[72px] lg:h-[calc(100vh-92px)]">
              <CafeOrderForm inline orders={orders} profile={profile} editing={null} />
            </div>

            <div className="lg:col-span-7 min-w-0">
              {/* 현황 요약 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  ["전체 오더", orders.length, ""],
                  ["대기중", countBy(orders, "open"), "open"],
                  ["신청중", countBy(orders, "applying"), "applying"],
                  ["배차완료", countBy(orders, "confirmed"), "confirmed"],
                ].map(([l, v, st]) => (
                  // 편집모드 키: live.stat.all / open / applying / confirmed
                  <button key={l} onClick={() => setStatusFilter(st)}
                    className={`text-left bg-white border rounded-xl px-4 py-3 transition ${statusFilter === st ? "border-[#1B2B4B] ring-1 ring-[#1B2B4B]" : "border-gray-200 hover:border-gray-300"}`}>
                    <T k={`live.stat.${st || "all"}`} className="block text-[11px] font-bold text-gray-400">{l}</T>
                    <div className="text-[22px] font-black text-[#1B2B4B] mt-0.5">{v}</div>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="상/하차지, 주소, 화물내용 검색"
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
                {ViewToggle}
                <button onClick={() => { setEditingOrder(null); setFormOpen(true); }}
                  className="px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition shrink-0">
                  <T k="live.btnNew">+ 오더 등록</T>
                </button>
              </div>

              <div className="text-[12px] text-gray-400 mb-2"><T k="live.resultCount">검색결과</T> {filtered.length}건</div>
              {renderList(filtered, "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3")}
            </div>
          </div>
        )}

        {tab === "mine" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                ["all", "내 등록 오더", myOrders.length],
                ["open", "대기중", countBy(myOrders, "open")],
                ["applying", "신청중", countBy(myOrders, "applying")],
                ["confirmed", "배차완료", countBy(myOrders, "confirmed")],
              ].map(([key, l, v]) => (
                <div key={key} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <T k={`mine.stat.${key}`} className="block text-[11px] font-bold text-gray-400">{l}</T>
                  <div className="text-[22px] font-black text-[#1B2B4B] mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[13px] text-gray-500"><T k="mine.count">내가 등록한 오더</T> {myOrders.length}건</div>
              <div className="flex items-center gap-2">
                {ViewToggle}
                <button onClick={() => { setEditingOrder(null); setFormOpen(true); }}
                  className="px-4 py-2 rounded-lg bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition">
                  <T k="mine.btnNew">+ 오더 등록</T>
                </button>
              </div>
            </div>
            {renderList(myOrders, "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")}
          </>
        )}

        {tab === "mypage" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full bg-[#1B2B4B] text-white font-black text-[18px] flex items-center justify-center shrink-0">
                  {(profile.nickname || profile.name || "?").slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="text-[16px] font-bold text-gray-900 truncate">{profile.nickname || profile.name || "-"}</div>
                  <div className="text-[12px] text-gray-400 truncate">{profile.companyName || "-"}</div>
                </div>
              </div>
              <div className="space-y-3 text-[13px]">
                {[
                  ["회사명", profile.companyName],
                  ["이름", profile.name],
                  ["닉네임", profile.nickname],
                  ["휴대폰번호", profile.phone],
                  ["이메일(아이디)", profile.email],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-gray-100 pb-2 last:border-0">
                    <T k={`mypage.field.${l}`} className="text-gray-400 font-semibold">{l}</T>
                    <span className="text-gray-800 font-medium">{v || "-"}</span>
                  </div>
                ))}
              </div>
              <button onClick={logout}
                className="w-full mt-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-[13px] hover:bg-gray-50 transition">
                <T k="mypage.logout">로그아웃</T>
              </button>
            </div>

            <div className="lg:col-span-2 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["total", "총 등록 오더", myOrders.length],
                  ["open", "배차 대기", countBy(myOrders, "open")],
                  ["confirmed", "배차완료", countBy(myOrders, "confirmed")],
                  ["won", "내가 잡은 배차", orders.filter(o => o.applicantUid === profile.uid && o.status === "confirmed").length],
                ].map(([key, l, v]) => (
                  <div key={key} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <T k={`mypage.stat.${key}`} className="block text-[11px] font-bold text-gray-400">{l}</T>
                    <div className="text-[22px] font-black text-[#1B2B4B] mt-0.5">{v}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 text-[14px] font-bold text-gray-900"><T k="mypage.applied.title">내가 배차신청한 오더</T></div>
                {(() => {
                  const applied = orders.filter(o => o.applicantUid === profile.uid);
                  if (applied.length === 0) return <div className="py-10 text-center text-[12.5px] text-gray-400"><T k="mypage.applied.empty">배차신청한 오더가 없습니다.</T></div>;
                  return <CafeOrderTable orders={applied} onClick={openOrder} />;
                })()}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                  <T k="mypage.recent.title" className="text-[14px] font-bold text-gray-900">최근 내 등록 오더</T>
                  <button onClick={() => setTab("mine")} className="text-[12px] font-bold text-gray-400 hover:text-[#1B2B4B]"><T k="mypage.recent.more">전체보기 →</T></button>
                </div>
                {myOrders.length === 0
                  ? <div className="py-10 text-center text-[12.5px] text-gray-400"><T k="mypage.recent.empty">등록한 오더가 없습니다.</T></div>
                  : <CafeOrderTable orders={myOrders.slice(0, 5)} onClick={openOrder} />}
              </div>
            </div>
          </div>
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
          onClose={closeOrder}
          onEdit={(o) => { closeOrder(); setEditingOrder(o); setFormOpen(true); }}
        />
      )}
    </div>
    </CafeEditProvider>
  );
}
