// ======================= cafe-site/src/CafeApp.jsx =======================
// 배차마당 — 운송사/화주/기사 누구나 가입해 오더를 올리고 서로 배차를 잡는
// 카페형 오더 공유 사이트. 디자인은 운송 프로그램과 동일한 네이비/그레이 톤을 쓴다.
// ⭐ 2026-10-28 전체 리디자인 — 어두운 관제형 헤더 + 숫자 타일 + 카드/표, 휴대폰은 하단 탭바.
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
import { Logo, Icon, Stat, Panel, MONO } from "./ui";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <Logo dark size={46} />
      <div className="flex gap-2">
        {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-white/80 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}
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
    <div className="flex p-1 rounded-xl bg-white border border-[#E3E8F0] shrink-0">
      {[["card", "카드형", "grid"], ["table", "표", "table"]].map(([k, l, ic]) => (
        <button key={k} type="button" onClick={() => setViewMode(k)}
          className={`h-9 px-3 rounded-lg text-[12.5px] font-black inline-flex items-center gap-1.5 transition ${viewMode === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:bg-[#F5F8FD]"}`}>
          <Icon name={ic} size={14} />{l}
        </button>
      ))}
    </div>
  );

  // 카드/표 목록 — cardCols로 화면 폭에 맞게 칸 수를 늘린다
  const renderList = (list, cardCols) => (
    list.length === 0 ? (
      <div className="py-24 text-center bg-white border border-[#E3E8F0] rounded-[20px]">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5F8FD] flex items-center justify-center text-[#9AA9C3]"><Icon name="truck" size={24} /></div>
        <div className="mt-3 text-[14px] font-bold text-[#9AA9C3]">등록된 오더가 없습니다</div>
      </div>
    ) : viewMode === "table" ? (
      <CafeOrderTable orders={list} onClick={openOrder} />
    ) : (
      <div className={`grid gap-3 ${cardCols}`}>
        {list.map(o => <CafeOrderCard key={o.id} order={o} onClick={() => openOrder(o)} />)}
      </div>
    )
  );

  const countBy = (list, st) => list.filter(o => o.status === st).length;
  const TABS = [["board", "홈", "home", "HOME"], ["live", "실시간배차현황", "live", "LIVE"], ["mine", "내 등록 오더", "list", "MY ORDERS"], ["mypage", "마이페이지", "user", "MY PAGE"]];
  const go = (k) => { setTab(k); if (selectedOrderId) nav("/"); window.scrollTo({ top: 0 }); };
  const newOrder = () => { setEditingOrder(null); setFormOpen(true); };
  const selCls = "h-11 px-3 rounded-xl border border-[#E3E8F0] bg-white text-[13.5px] font-bold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";

  return (
    <div className="min-h-screen bg-[#EEF1F6] pb-20 lg:pb-0">
      {/* 상단 헤더 — 관제 화면 톤 */}
      <header className="sticky top-0 z-40 text-white shadow-[0_8px_24px_rgba(11,20,40,0.25)]" style={{ background: "linear-gradient(120deg,#0B1428 0%,#132240 55%,#1B2B4B 100%)" }}>
        <div className="w-full px-4 lg:px-7 h-[64px] flex items-center gap-5">
          <button type="button" onClick={() => go("board")} className="shrink-0"><Logo dark size={34} /></button>
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {TABS.map(([k, l, ic]) => (
              <button key={k} type="button" onClick={() => go(k)}
                className={`h-10 px-4 rounded-xl text-[13.5px] font-black inline-flex items-center gap-2 transition ${tab === k ? "bg-white text-[#0F1A30] shadow-[0_6px_16px_rgba(0,0,0,0.25)]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                <Icon name={ic} size={15} />{l}
                {k === "live" && <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] flex items-center justify-center ${tab === k ? "bg-[#0F1A30] text-white" : "bg-white/15"}`} style={{ fontFamily: MONO }}>{countBy(orders, "open")}</span>}
              </button>
            ))}
          </nav>
          <div className="flex-1 lg:hidden" />
          <button type="button" onClick={newOrder} className="hidden sm:inline-flex h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black items-center gap-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.25)]"><Icon name="plus" size={15} />오더 등록</button>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-[14px] font-black">{(profile.nickname || profile.name || "?").slice(0, 1)}</span>
            <div className="hidden md:block leading-tight">
              <div className="text-[13px] font-black">{profile.nickname || profile.name}</div>
              <div className="text-[11px] text-white/50 max-w-[140px] truncate">{profile.companyName}</div>
            </div>
            <button type="button" onClick={logout} title="로그아웃" className="w-9 h-9 rounded-xl text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center"><Icon name="logout" size={17} /></button>
          </div>
        </div>
      </header>

      <div className="w-full px-4 lg:px-7 py-5 lg:py-6">
        {tab === "board" && (
          <CafeHome orders={orders} profile={profile} onNewOrder={newOrder} onGoLive={goLive} onOpenOrder={openOrder} />
        )}

        {tab === "live" && (
          // 왼쪽 3 : 오른쪽 7 — 왼쪽에서 오더를 입력하면서 오른쪽에서 배차현황을 실시간으로 본다
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-start">
            <div className="lg:col-span-3 lg:sticky lg:top-[84px] lg:h-[calc(100vh-104px)]">
              <CafeOrderForm inline orders={orders} profile={profile} editing={null} />
            </div>
            <div className="lg:col-span-7 min-w-0 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[["전체 오더", orders.length, "", "ALL"], ["대기중", countBy(orders, "open"), "open", "OPEN"], ["신청중", countBy(orders, "applying"), "applying", "APPLY"], ["배차완료", countBy(orders, "confirmed"), "confirmed", "DONE"]].map(([l, v, st, en]) => (
                  <Stat key={l} label={l} value={v} en={en} active={statusFilter === st} onClick={() => setStatusFilter(st)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9AA9C3]" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="상·하차지, 주소, 화물내용 검색"
                    className="w-full h-11 pl-10 pr-3 rounded-xl border border-[#E3E8F0] bg-white text-[13.5px] font-semibold outline-none focus:border-[#4B6CB7]" />
                </div>
                <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} className={selCls}>
                  <option value="">차량종류 전체</option>
                  {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={payFilter} onChange={e => setPayFilter(e.target.value)} className={selCls}>
                  <option value="">지급방식 전체</option>
                  {PAY_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                {ViewToggle}
              </div>
              <div className="flex items-center gap-2 text-[12.5px] font-bold text-[#7A879C]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1B2B4B] animate-pulse" />실시간 · 검색결과 <b className="text-[#0F1A30]" style={{ fontFamily: MONO }}>{filtered.length}</b>건
              </div>
              {renderList(filtered, "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3")}
            </div>
          </div>
        )}

        {tab === "mine" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["내 등록 오더", myOrders.length, "TOTAL"], ["대기중", countBy(myOrders, "open"), "OPEN"], ["신청중", countBy(myOrders, "applying"), "APPLY"], ["배차완료", countBy(myOrders, "confirmed"), "DONE"]].map(([l, v, en]) => (
                <Stat key={l} label={l} value={v} en={en} />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>MY ORDERS</div>
                <div className="text-[18px] font-black text-[#0F1A30]">내가 등록한 오더 <span className="text-[#9AA9C3] text-[14px]" style={{ fontFamily: MONO }}>{myOrders.length}</span></div>
              </div>
              <div className="flex items-center gap-2">
                {ViewToggle}
                <button type="button" onClick={newOrder} className="h-11 px-4 rounded-xl text-white text-[13.5px] font-black inline-flex items-center gap-1.5" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}><Icon name="plus" size={15} />오더 등록</button>
              </div>
            </div>
            {renderList(myOrders, "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")}
          </div>
        )}

        {tab === "mypage" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="rounded-[22px] overflow-hidden bg-white border border-[#E3E8F0] shadow-[0_6px_20px_rgba(15,26,48,0.05)]">
              <div className="px-6 pt-6 pb-5 text-white" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
                <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>MEMBER CARD</div>
                <div className="flex items-center gap-3.5 mt-3">
                  <span className="w-14 h-14 rounded-2xl bg-white text-[#0F1A30] font-black text-[22px] flex items-center justify-center shrink-0">{(profile.nickname || profile.name || "?").slice(0, 1)}</span>
                  <div className="min-w-0">
                    <div className="text-[20px] font-black truncate">{profile.nickname || profile.name || "-"}</div>
                    <div className="text-[13px] text-white/60 truncate">{profile.companyName || "-"}</div>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-1">
                {[["회사명", profile.companyName], ["이름", profile.name], ["닉네임", profile.nickname], ["휴대폰번호", profile.phone], ["이메일(아이디)", profile.email]].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-3 py-2.5 border-b border-[#F1F4F9] last:border-0 text-[13.5px]">
                    <span className="text-[#7A879C] font-bold shrink-0">{l}</span>
                    <span className="text-[#0F1A30] font-bold truncate">{v || "-"}</span>
                  </div>
                ))}
                <button type="button" onClick={logout} className="w-full mt-3 h-11 rounded-xl border border-[#DCE3EE] text-[#5B6B85] font-bold text-[13.5px] hover:bg-[#F5F8FD] inline-flex items-center justify-center gap-2"><Icon name="logout" size={15} />로그아웃</button>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[["총 등록 오더", myOrders.length, "POSTED"], ["배차 대기", countBy(myOrders, "open"), "OPEN"], ["배차완료", countBy(myOrders, "confirmed"), "DONE"], ["내가 잡은 배차", orders.filter(o => o.applicantUid === profile.uid && o.status === "confirmed").length, "TAKEN"]].map(([l, v, en]) => (
                  <Stat key={l} label={l} value={v} en={en} />
                ))}
              </div>
              <Panel title="내가 배차신청한 오더" en="APPLIED">
                {(() => {
                  const applied = orders.filter(o => o.applicantUid === profile.uid);
                  if (applied.length === 0) return <div className="py-10 text-center text-[13px] font-bold text-[#9AA9C3]">배차신청한 오더가 없습니다.</div>;
                  return <CafeOrderTable orders={applied} onClick={openOrder} flat />;
                })()}
              </Panel>
              <Panel title="최근 내 등록 오더" en="RECENT" right={<button type="button" onClick={() => go("mine")} className="text-[12.5px] font-black text-[#4B6CB7]">전체보기 →</button>}>
                {myOrders.length === 0
                  ? <div className="py-10 text-center text-[13px] font-bold text-[#9AA9C3]">등록한 오더가 없습니다.</div>
                  : <CafeOrderTable orders={myOrders.slice(0, 5)} onClick={openOrder} flat />}
              </Panel>
            </div>
          </div>
        )}
      </div>

      {/* 휴대폰 하단 탭바 */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#E3E8F0] grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {TABS.slice(0, 2).map(([k, l, ic]) => (
          <button key={k} type="button" onClick={() => go(k)} className={`h-[62px] flex flex-col items-center justify-center gap-1 text-[11px] font-black ${tab === k ? "text-[#0F1A30]" : "text-[#9AA9C3]"}`}><Icon name={ic} size={20} />{l === "실시간배차현황" ? "실시간" : l}</button>
        ))}
        <button type="button" onClick={newOrder} className="h-[62px] flex items-center justify-center">
          <span className="w-12 h-12 rounded-2xl text-white flex items-center justify-center shadow-[0_8px_20px_rgba(15,26,48,0.35)]" style={{ background: "linear-gradient(135deg,#0F1A30,#2D4C82)" }}><Icon name="plus" size={22} /></span>
        </button>
        {TABS.slice(2).map(([k, l, ic]) => (
          <button key={k} type="button" onClick={() => go(k)} className={`h-[62px] flex flex-col items-center justify-center gap-1 text-[11px] font-black ${tab === k ? "text-[#0F1A30]" : "text-[#9AA9C3]"}`}><Icon name={ic} size={20} />{l === "내 등록 오더" ? "내 오더" : l}</button>
        ))}
      </nav>

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
  );
}
