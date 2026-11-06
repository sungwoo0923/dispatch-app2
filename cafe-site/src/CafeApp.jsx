// ======================= cafe-site/src/CafeApp.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브(예전 배차마당) 전체 리디자인 — 운송사끼리 오더를 주고받는 실시간 거래소.
//  화면: 마켓(필터 · 카드/표) / 내가 올린 오더 / 내가 잡은 오더 / 알림 / 내 정보. 휴대폰은 하단 탭바.
//  이 사이트는 운송 프로그램 본체와 따로 배포되는 독립 사이트라 스스로 onAuthStateChanged로 로그인 상태를 관리한다.
//  ※ 오더 올리기·잡기는 로지스웹 운송사 직원 계정만(firestore.rules isMarketCompany). 그 외 계정은 둘러보기만.
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { VEHICLE_TYPES, SIDO, TON_BUCKETS, MARKET_NAME, PROGRAM_URL, ACTIVE_MATCH, isV2, pickRegion, fareNum, tonNum } from "./cafeConstants";
import { subscribeCafeOrders, subscribeMyCafeOrders, subscribeNotices, markNoticeRead, importToMyProgram, syncTakerStatus, syncPosterMirror } from "./cafeApi";
import CafeOrderCard from "./CafeOrderCard";
import CafeOrderForm from "./CafeOrderForm";
import CafeOrderDetail from "./CafeOrderDetail";
import CafeOrderTable from "./CafeOrderTable";
import CafeHome from "./CafeHome";
import { Logo, Icon, Stat, Panel, Empty, NUM, GRID_BG, Stars, selectCls, btnPrimary, btnPrimaryStyle, btnGhost, timeAgo } from "./ui";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={GRID_BG}>
      <Logo dark size={48} />
      <div className="flex gap-2">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#8FB0F0] animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
    </div>
  );
}

const NON_COMPANY = ["cafeUser", "driver", "shipper", "viewer"];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DEFAULT_FILTER = { q: "", from: "", to: "", day: "", date: "", vehicle: "", ton: "", fareMin: "", fareMax: "", urgent: false, closed: false, sort: "new" };
const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };

export default function CafeApp() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = 확인 중, null = 로그아웃
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState("market"); // market | posts | claims | notices | me
  const [orders, setOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [notices, setNotices] = useState([]);
  const [f, setF] = useState(DEFAULT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => readLS("hubView", "card"));
  const [postFilter, setPostFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // { order, detail, settle }
  const nav = useNavigate();
  const { id: selectedOrderId } = useParams();

  useEffect(() => onAuthStateChanged(auth, (u) => setAuthUser(u || null)), []);
  useEffect(() => {
    if (!authUser?.uid) { setProfile(null); return; }
    getDoc(doc(db, "users", authUser.uid)).then(snap => {
      const d = snap.data() || {};
      const role = d.role || "";
      setProfile({
        uid: authUser.uid, email: authUser.email, role,
        companyName: d.companyName || "", name: d.name || "", nickname: d.nickname || "", phone: d.phone || "",
        isCompany: !!d.companyName && d.approved !== false && !NON_COMPANY.includes(role) && d.employmentStatus !== "퇴사",
      });
    }).catch(() => setProfile({ uid: authUser.uid, email: authUser.email, companyName: "", isCompany: false }));
  }, [authUser]);
  useEffect(() => subscribeCafeOrders(setOrders), []);
  useEffect(() => { if (profile?.uid) return subscribeMyCafeOrders(profile.uid, setMyOrders); }, [profile?.uid]);
  useEffect(() => { if (profile?.uid) return subscribeNotices(profile.uid, setNotices); }, [profile?.uid]);
  useEffect(() => writeLS("hubView", viewMode), [viewMode]);

  // ⭐ 거래 연동(서버 함수가 없어도 동작) — 내가 받은 오더는 내 프로그램에 넣고 진행 단계를 올리고,
  //  내가 올린 오더는 상대 진행을 내 원래 오더에 반영한다. 같은 상태로는 한 번만.
  const synced = useRef(new Map());
  useEffect(() => {
    if (!profile?.isCompany) return;
    const runOnce = () => {
      orders.forEach((o) => {
        if (!isV2(o)) return;
        const key = `${o.id}|${o.status}|${o.takerOrderId || ""}`;
        const last = synced.current.get(key) || 0;
        if (Date.now() - last < 60000) return;
        if (o.takerUid === profile.uid && ACTIVE_MATCH.includes(o.status)) {
          synced.current.set(key, Date.now());
          if (!o.takerOrderId) importToMyProgram(o, profile).catch(() => {});
          else if (o.status !== "delivered") syncTakerStatus(o, profile).catch(() => {});
        }
      });
      myOrders.forEach((o) => {
        if (!isV2(o) || !o.posterOrderId || !ACTIVE_MATCH.includes(o.status)) return;
        const key = `p|${o.id}|${o.status}|${o.driverMasked || ""}`;
        if (synced.current.has(key)) return;
        synced.current.set(key, Date.now());
        syncPosterMirror(o, profile).catch(() => {});
      });
    };
    runOnce();
    const iv = setInterval(() => { synced.current.forEach((v, k) => { if (!k.startsWith("p|")) synced.current.set(k, 0); }); runOnce(); }, 90000);
    return () => clearInterval(iv);
  }, [orders, myOrders, profile]);

  // 운송사 신뢰도 — 허브에서 거래(매칭 이후)된 건수 + 상대가 남긴 별점 평균
  const trust = useMemo(() => {
    const m = new Map();
    const get = (c) => { if (!m.has(c)) m.set(c, { deals: 0, sum: 0, rated: 0 }); return m.get(c); };
    orders.forEach((o) => {
      if (!isV2(o) || !ACTIVE_MATCH.includes(o.status)) return;
      if (o.companyName) { const t = get(o.companyName); t.deals++; if (o.ratingByTaker?.score) { t.sum += o.ratingByTaker.score; t.rated++; } }
      if (o.takerCompany) { const t = get(o.takerCompany); t.deals++; if (o.ratingByPoster?.score) { t.sum += o.ratingByPoster.score; t.rated++; } }
    });
    m.forEach((t) => { t.avg = t.rated ? t.sum / t.rated : 0; });
    return m;
  }, [orders]);
  const trustOf = (c) => trust.get(c) || (c ? { deals: 0, rated: 0, avg: 0 } : null);

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dToday = ymd(today);
    const dTom = ymd(new Date(today.getTime() + 86400000));
    const dWeek = ymd(new Date(today.getTime() + 6 * 86400000));
    const bucket = TON_BUCKETS.find((b) => b[0] === f.ton);
    const min = Number(f.fareMin || 0) * 10000;
    const max = Number(f.fareMax || 0) * 10000;
    const q = f.q.trim().toLowerCase();
    const list = orders.filter((o) => {
      if (!f.closed && o.status !== "open") return false;
      if (f.urgent && !o.긴급) return false;
      if (f.from && pickRegion(o, "상차").sido !== f.from) return false;
      if (f.to && pickRegion(o, "하차").sido !== f.to) return false;
      if (f.day === "today" && o.상차일 !== dToday) return false;
      if (f.day === "tomorrow" && o.상차일 !== dTom) return false;
      if (f.day === "week" && !(o.상차일 >= dToday && o.상차일 <= dWeek)) return false;
      if (f.day === "date" && f.date && o.상차일 !== f.date) return false;
      if (f.vehicle && !String(o.차량종류 || "").includes(f.vehicle)) return false;
      if (bucket && bucket[2] != null) { const t = o.톤수값 || tonNum(o.차량톤수); if (!(t >= bucket[2] && t <= bucket[3])) return false; }
      const fare = o.운임값 || fareNum(o.운임);
      if (min && fare < min) return false;
      if (max && (!fare || fare > max)) return false;
      if (q) {
        const up = pickRegion(o, "상차"); const dn = pickRegion(o, "하차");
        const hay = `${up.sido} ${up.sigungu} ${dn.sido} ${dn.sigungu} ${o.화물내용 || ""} ${o.companyName || ""} ${o.차량종류 || ""} ${isV2(o) ? "" : `${o.상차지명 || ""} ${o.하차지명 || ""}`}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (f.sort === "date") list.sort((a, b) => String(a.상차일 || "9").localeCompare(String(b.상차일 || "9")));
    if (f.sort === "fare") list.sort((a, b) => (b.운임값 || fareNum(b.운임)) - (a.운임값 || fareNum(a.운임)));
    if (f.sort === "new") list.sort((a, b) => (b.긴급 ? 1 : 0) - (a.긴급 ? 1 : 0) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    return list;
  }, [orders, f]);
  const activeFilterN = ["from", "to", "day", "vehicle", "ton", "fareMin", "fareMax"].filter((k) => f[k]).length + (f.urgent ? 1 : 0) + (f.closed ? 1 : 0);

  const claims = useMemo(() => orders.filter((o) => isV2(o) && profile && ((o.requesterUids || []).includes(profile.uid) || o.takerUid === profile.uid)), [orders, profile]);
  const unread = notices.filter((n) => !n.read).length;

  const selectedOrder = selectedOrderId ? (orders.find(o => o.id === selectedOrderId) || myOrders.find(o => o.id === selectedOrderId) || null) : null;
  const openOrder = (o) => nav(`/orders/${o.id}`);
  const closeOrder = () => nav("/");
  const logout = async () => { await signOut(auth); nav("/login", { replace: true }); };

  if (authUser === undefined) return <LoadingScreen />;
  if (authUser === null) return <Navigate to="/login" replace />;
  if (!profile) return <LoadingScreen />;

  const setFilter = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const go = (k) => { setTab(k); if (selectedOrderId) nav("/"); window.scrollTo({ top: 0 }); };
  const newOrder = () => { if (!profile.isCompany) { alert("오더 올리기는 로지스웹 운송사 계정만 할 수 있습니다."); return; } setEditing(null); setFormOpen(true); };

  const TABS = [
    ["market", "마켓", "market"],
    ["posts", "올린 오더", "list", myOrders.filter((o) => o.status === "open" && (o.requesterUids || []).length).length],
    ["claims", "잡은 오더", "truck", claims.filter((o) => o.takerUid === profile.uid && o.status === "matched").length],
    ["notices", "알림", "bell", unread],
    ["me", "내 정보", "user"],
  ];
  const ViewToggle = (
    <div className="flex p-1 rounded-xl bg-white ring-1 ring-inset ring-[#E2E7EF] shrink-0">
      {[["card", "카드", "grid"], ["table", "표", "table"]].map(([k, l, ic]) => (
        <button key={k} type="button" onClick={() => setViewMode(k)} aria-pressed={viewMode === k}
          className={`h-9 px-3 rounded-lg text-[14px] font-bold inline-flex items-center gap-1.5 transition ${viewMode === k ? "bg-[#0F1A30] text-white" : "text-[#55657F] hover:bg-[#F5F8FD]"}`}>
          <Icon name={ic} size={15} />{l}
        </button>
      ))}
    </div>
  );
  const renderList = (list, cols, empty) => (
    list.length === 0 ? empty : viewMode === "table" ? (
      <CafeOrderTable orders={list} onClick={openOrder} trustOf={trustOf} myUid={profile.uid} />
    ) : (
      <div className={`grid gap-3.5 ${cols}`}>
        {list.map(o => <CafeOrderCard key={o.id} order={o} onClick={() => openOrder(o)} trust={trustOf(o.companyName)} mine={o.posterUid === profile.uid} requested={(o.requesterUids || []).includes(profile.uid)} />)}
      </div>
    )
  );
  const chip = (on) => `h-10 px-3.5 rounded-xl text-[14px] font-bold transition ${on ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] ring-1 ring-inset ring-[#DCE3EE] hover:ring-[#2D4C82]"}`;

  const Filters = (
    <div className="space-y-4">
      <div className="relative">
        <Icon name="search" size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8592A8]" />
        <input value={f.q} onChange={e => setFilter("q", e.target.value)} placeholder="지역 · 화물 · 운송사 검색" className="w-full h-11 pl-10 pr-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-medium outline-none focus:border-[#2D4C82]" />
      </div>
      <div>
        <div className="text-[13.5px] font-bold text-[#55657F] mb-1.5">지역 (시·도)</div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          <select value={f.from} onChange={e => setFilter("from", e.target.value)} className={`${selectCls} w-full`} aria-label="상차 시도"><option value="">상차 전체</option>{SIDO.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <button type="button" onClick={() => setF((p) => ({ ...p, from: p.to, to: p.from }))} className="w-9 h-9 rounded-lg text-[#55657F] hover:bg-[#EEF2F8] flex items-center justify-center" title="상·하차 바꾸기"><Icon name="swap" size={16} /></button>
          <select value={f.to} onChange={e => setFilter("to", e.target.value)} className={`${selectCls} w-full`} aria-label="하차 시도"><option value="">하차 전체</option>{SIDO.map(s => <option key={s} value={s}>{s}</option>)}</select>
        </div>
      </div>
      <div>
        <div className="text-[13.5px] font-bold text-[#55657F] mb-1.5">상차일</div>
        <div className="flex flex-wrap gap-1.5">
          {[["", "전체"], ["today", "오늘"], ["tomorrow", "내일"], ["week", "7일 이내"]].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter("day", k)} className={chip(f.day === k)}>{l}</button>)}
          <input type="date" value={f.date} onChange={(e) => setF((p) => ({ ...p, date: e.target.value, day: e.target.value ? "date" : "" }))} className={`h-10 px-3 rounded-xl text-[14px] font-semibold outline-none ${f.day === "date" ? "bg-[#0F1A30] text-white" : "bg-white ring-1 ring-inset ring-[#DCE3EE] text-[#3A4A66]"}`} aria-label="날짜 지정" />
        </div>
      </div>
      <div>
        <div className="text-[13.5px] font-bold text-[#55657F] mb-1.5">차종 · 톤수</div>
        <select value={f.vehicle} onChange={e => setFilter("vehicle", e.target.value)} className={`${selectCls} w-full mb-1.5`} aria-label="차종"><option value="">차종 전체</option>{VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}</select>
        <div className="flex flex-wrap gap-1.5">{TON_BUCKETS.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter("ton", k)} className={chip(f.ton === k)}>{l}</button>)}</div>
      </div>
      <div>
        <div className="text-[13.5px] font-bold text-[#55657F] mb-1.5">운임 범위 (만원)</div>
        <div className="flex items-center gap-1.5">
          <input inputMode="numeric" value={f.fareMin} onChange={e => setFilter("fareMin", e.target.value.replace(/[^\d]/g, ""))} placeholder="최소" className="w-full h-11 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold outline-none focus:border-[#2D4C82]" style={NUM} />
          <span className="text-[#8592A8]">~</span>
          <input inputMode="numeric" value={f.fareMax} onChange={e => setFilter("fareMax", e.target.value.replace(/[^\d]/g, ""))} placeholder="최대" className="w-full h-11 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold outline-none focus:border-[#2D4C82]" style={NUM} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setFilter("urgent", !f.urgent)} className={chip(f.urgent)}><span className="inline-flex items-center gap-1"><Icon name="bolt" size={14} />긴급만</span></button>
        <button type="button" onClick={() => setFilter("closed", !f.closed)} className={chip(f.closed)}>마감 포함</button>
      </div>
      {activeFilterN > 0 && <button type="button" onClick={() => setF((p) => ({ ...DEFAULT_FILTER, q: p.q, sort: p.sort }))} className="text-[14px] font-bold text-[#2D4C82]">필터 초기화 ({activeFilterN})</button>}
    </div>
  );

  const myPostsShown = myOrders.filter((o) => postFilter === "all" ? true : postFilter === "open" ? o.status === "open" : postFilter === "active" ? ["matched", "dispatched", "applying"].includes(o.status) : ["delivered", "confirmed", "cancelled"].includes(o.status));

  return (
    <div className="min-h-screen bg-[#F2F4F8] pb-[84px] lg:pb-0">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-40 text-white" style={{ background: "linear-gradient(110deg,#0B1428 0%,#0F1A30 45%,#1B2B4B 100%)", boxShadow: "0 10px 30px rgba(11,20,40,.28)" }}>
        <div className="max-w-[1480px] mx-auto px-4 lg:px-7 h-[66px] flex items-center gap-4">
          <button type="button" onClick={() => go("market")} className="shrink-0" aria-label={MARKET_NAME}><Logo dark size={36} sub={false} /></button>
          <nav className="hidden lg:flex items-center gap-1 flex-1 ml-4">
            {TABS.filter(([k]) => k !== "notices").map(([k, l, ic, n]) => (
              <button key={k} type="button" onClick={() => go(k)}
                className={`h-10 px-4 rounded-xl text-[15px] font-bold inline-flex items-center gap-2 transition ${tab === k ? "bg-white/[0.12] text-white ring-1 ring-inset ring-white/15" : "text-white/65 hover:bg-white/[0.07] hover:text-white"}`}>
                <Icon name={ic} size={16} />{l}
                {n > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#8FB0F0] text-[#0F1A30] text-[13px] font-extrabold flex items-center justify-center" style={NUM}>{n}</span>}
              </button>
            ))}
          </nav>
          <div className="flex-1 lg:hidden" />
          <button type="button" onClick={() => go("notices")} className="relative w-10 h-10 rounded-xl text-white/80 hover:bg-white/10 flex items-center justify-center" aria-label="알림">
            <Icon name="bell" size={19} />
            {unread > 0 && <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#8FB0F0] text-[#0F1A30] text-[12px] font-extrabold flex items-center justify-center">{unread}</span>}
          </button>
          {profile.isCompany && <button type="button" onClick={newOrder} className="hidden sm:inline-flex h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-bold items-center gap-1.5 shadow-[0_6px_16px_rgba(0,0,0,.25)]"><Icon name="plus" size={16} />오더 올리기</button>}
          <button type="button" onClick={() => go("me")} className="hidden md:flex items-center gap-2.5 shrink-0 pl-1">
            <span className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-inset ring-white/15 flex items-center justify-center text-[15px] font-bold">{(profile.companyName || profile.name || "?").slice(0, 1)}</span>
            <span className="leading-tight text-left">
              <span className="block text-[14px] font-bold max-w-[150px] truncate">{profile.companyName || profile.email}</span>
              <span className="block text-[13px] text-white/50 max-w-[150px] truncate">{profile.name || profile.nickname || (profile.isCompany ? "운송사" : "둘러보기")}</span>
            </span>
          </button>
        </div>
      </header>

      <main className="max-w-[1480px] mx-auto px-4 lg:px-7 py-5 lg:py-7">
        {!profile.isCompany && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl bg-white ring-1 ring-inset ring-[#D5E0F2] px-4 py-3.5">
            <Icon name="shield" size={20} className="text-[#2D4C82] shrink-0 mt-0.5" />
            <div className="text-[14px] text-[#1B2B4B] leading-relaxed flex-1">지금은 <b>둘러보기</b> 상태입니다. 오더 올리기·잡기는 <b>로지스웹 운송사 계정</b>으로 로그인하면 할 수 있습니다.</div>
            <a href={PROGRAM_URL} target="_blank" rel="noreferrer" className="shrink-0 text-[14px] font-bold text-[#2D4C82] whitespace-nowrap">로지스웹 ↗</a>
          </div>
        )}

        {tab === "market" && (
          <div className="space-y-5">
            <CafeHome orders={orders} profile={profile} onNewOrder={newOrder} onPickRoute={(a, b) => setF((p) => ({ ...p, from: a, to: b }))} />
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
              <aside className="hidden lg:block lg:sticky lg:top-[90px]">
                <Panel title="오더 찾기" sub={`조건에 맞는 오더 ${filtered.length}건`} bodyClass="p-4">{Filters}</Panel>
              </aside>
              <div className="min-w-0 space-y-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 mr-auto">
                    <span className="w-2 h-2 rounded-full bg-[#2D4C82] animate-pulse" />
                    <h2 className="text-[18px] font-extrabold text-[#0F1A30]">{f.closed ? "전체 오더" : "모집중 오더"}</h2>
                    <span className="text-[16px] font-bold text-[#8592A8]" style={NUM}>{filtered.length}</span>
                  </div>
                  <button type="button" onClick={() => setFilterOpen(true)} className={`lg:hidden ${btnGhost} !h-10 !text-[14px]`}><Icon name="sliders" size={16} />필터{activeFilterN ? ` ${activeFilterN}` : ""}</button>
                  <select value={f.sort} onChange={e => setFilter("sort", e.target.value)} className={selectCls} aria-label="정렬">
                    <option value="new">최신·긴급순</option><option value="date">상차일 빠른순</option><option value="fare">운임 높은순</option>
                  </select>
                  {ViewToggle}
                </div>
                {renderList(filtered, "grid-cols-1 md:grid-cols-2 2xl:grid-cols-3",
                  <Empty icon="search" title="조건에 맞는 오더가 없습니다" desc="필터를 넓히거나, 우리 회사의 남는 오더를 먼저 올려 보세요." action={activeFilterN ? <button type="button" onClick={() => setF(DEFAULT_FILTER)} className={btnGhost}>필터 초기화</button> : null} />)}
              </div>
            </div>
          </div>
        )}

        {tab === "posts" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="올린 오더" value={myOrders.length} unit="건" active={postFilter === "all"} onClick={() => setPostFilter("all")} />
              <Stat label="모집중" value={myOrders.filter(o => o.status === "open").length} unit="건" active={postFilter === "open"} onClick={() => setPostFilter("open")} />
              <Stat label="진행중" value={myOrders.filter(o => ["matched", "dispatched", "applying"].includes(o.status)).length} unit="건" active={postFilter === "active"} onClick={() => setPostFilter("active")} />
              <Stat label="완료 · 취소" value={myOrders.filter(o => ["delivered", "confirmed", "cancelled"].includes(o.status)).length} unit="건" active={postFilter === "done"} onClick={() => setPostFilter("done")} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-extrabold text-[#0F1A30]">우리 회사가 올린 오더</h2>
                <div className="text-[14px] text-[#8592A8]">요청이 들어오면 상세에서 [수락] — 수락한 운송사의 배차 진행이 원래 오더에 자동 반영됩니다.</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">{ViewToggle}</div>
            </div>
            {renderList(myPostsShown, "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
              <Empty icon="list" title="올린 오더가 없습니다" desc="로지스웹 배차 프로그램의 [저장 + 허브 등록] 버튼이나 여기 [오더 올리기]로 올릴 수 있습니다." action={profile.isCompany ? <button type="button" onClick={newOrder} className={btnPrimary} style={btnPrimaryStyle}><Icon name="plus" size={16} />오더 올리기</button> : null} />)}
          </div>
        )}

        {tab === "claims" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="요청 대기" value={claims.filter(o => o.status === "open").length} unit="건" />
              <Stat label="매칭(배차 전)" value={claims.filter(o => o.takerUid === profile.uid && o.status === "matched").length} unit="건" />
              <Stat label="배차완료" value={claims.filter(o => o.takerUid === profile.uid && o.status === "dispatched").length} unit="건" />
              <Stat label="운송완료" value={claims.filter(o => o.takerUid === profile.uid && o.status === "delivered").length} unit="건" />
            </div>
            <div>
              <h2 className="text-[18px] font-extrabold text-[#0F1A30]">우리 회사가 잡은 오더</h2>
              <div className="text-[14px] text-[#8592A8]">수락된 오더는 로지스웹 배차 프로그램에 거래처 = 올린 운송사로 자동 등록됩니다. 프로그램에서 기사를 배차하세요.</div>
            </div>
            {renderList(claims, "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
              <Empty icon="truck" title="잡은 오더가 없습니다" desc="마켓에서 오더를 열고 [이 오더 잡기]를 눌러 보세요." action={<button type="button" onClick={() => go("market")} className={btnGhost}>마켓으로</button>} />)}
          </div>
        )}

        {tab === "notices" && (
          <Panel title="알림" sub={unread ? `읽지 않은 알림 ${unread}건` : "모두 읽었습니다"} className="max-w-[860px]"
            right={unread > 0 ? <button type="button" onClick={() => notices.filter(n => !n.read).forEach(n => markNoticeRead(n.id))} className="text-[14px] font-bold text-[#2D4C82]">모두 읽음</button> : null}>
            {notices.length === 0 ? <div className="py-14 text-center text-[14px] text-[#8592A8]">알림이 없습니다</div> : (
              <ul className="divide-y divide-[#EEF1F6]">
                {notices.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => { markNoticeRead(n.id); if (n.orderId) nav(`/orders/${n.orderId}`); }} className={`w-full text-left px-5 py-4 flex gap-3.5 hover:bg-[#F7F9FC] ${n.read ? "" : "bg-[#F3F7FE]"}`}>
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${n.read ? "bg-[#F2F5FA] text-[#8592A8]" : "bg-[#0F1A30] text-[#8FB0F0]"}`}><Icon name={n.type === "request" ? "inbox" : n.type === "accepted" ? "check" : n.type === "delivered" ? "shield" : n.type === "dispatched" ? "truck" : "bell"} size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="text-[15px] font-extrabold text-[#0F1A30]">{n.title}</span>{!n.read && <span className="w-2 h-2 rounded-full bg-[#2D4C82]" />}<span className="ml-auto text-[13px] text-[#A3AEC0] shrink-0">{timeAgo(n.createdAt)}</span></span>
                        <span className="block text-[14px] text-[#55657F] mt-0.5 leading-relaxed">{n.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {tab === "me" && (() => {
          const t = trustOf(profile.companyName);
          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              <div className="rounded-[22px] overflow-hidden bg-white ring-1 ring-inset ring-[#E2E7EF]">
                <div className="px-6 pt-6 pb-5 text-white" style={GRID_BG}>
                  <div className="text-[13px] font-semibold text-[#8FB0F0]">{profile.isCompany ? "로지스웹 운송사 계정" : "둘러보기 계정"}</div>
                  <div className="flex items-center gap-3.5 mt-3">
                    <span className="w-14 h-14 rounded-2xl bg-white text-[#0F1A30] font-extrabold text-[22px] flex items-center justify-center shrink-0">{(profile.companyName || profile.name || "?").slice(0, 1)}</span>
                    <div className="min-w-0">
                      <div className="text-[20px] font-extrabold truncate">{profile.companyName || "-"}</div>
                      <div className="text-[14px] text-white/60 truncate">{profile.name || profile.nickname || profile.email}</div>
                    </div>
                  </div>
                  {t && <div className="mt-4 flex items-center gap-2 text-[14px]"><Stars value={t.avg} size={15} /><span className="text-white/75">{t.rated ? `${t.avg.toFixed(1)}점 · ` : ""}허브 거래 {t.deals}건</span></div>}
                </div>
                <div className="p-5 space-y-1">
                  {[["회사명", profile.companyName], ["이름", profile.name], ["휴대폰번호", profile.phone], ["이메일(아이디)", profile.email]].map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-3 py-2.5 border-b border-[#F1F4F9] last:border-0 text-[14px]">
                      <span className="text-[#8592A8] font-semibold shrink-0">{l}</span><span className="text-[#0F1A30] font-bold truncate">{v || "-"}</span>
                    </div>
                  ))}
                  <button type="button" onClick={logout} className={`${btnGhost} w-full mt-3`}><Icon name="logout" size={16} />로그아웃</button>
                </div>
              </div>
              <div className="lg:col-span-2 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="올린 오더" value={myOrders.length} unit="건" />
                  <Stat label="넘긴 오더(매칭)" value={myOrders.filter(o => ACTIVE_MATCH.includes(o.status)).length} unit="건" />
                  <Stat label="잡은 오더" value={claims.filter(o => o.takerUid === profile.uid).length} unit="건" />
                  <Stat label="받은 평가" value={t?.rated ? t.avg.toFixed(1) : "-"} unit={t?.rated ? "점" : ""} />
                </div>
                <Panel title="거래 방법" bodyClass="p-5">
                  <ol className="grid sm:grid-cols-3 gap-3">
                    {[["1", "오더 올리기", "배차 프로그램의 [저장 + 허브 등록] 또는 여기서 올립니다. 다른 운송사에는 시·구와 운임만 보입니다."],
                      ["2", "잡기 요청 → 수락", "다른 운송사가 [이 오더 잡기]로 요청하면 한 곳을 골라 수락합니다. 수락 순간 주소·연락처가 공개됩니다."],
                      ["3", "자동 연동", "받은 운송사 프로그램에 오더가 생기고, 그쪽 배차·운송완료가 올린 운송사 원래 오더에 그대로 반영됩니다."]].map(([n, h, d]) => (
                      <li key={n} className="rounded-2xl bg-[#F7F9FC] p-4">
                        <span className="w-8 h-8 rounded-lg bg-[#0F1A30] text-[#8FB0F0] text-[14px] font-bold flex items-center justify-center">{n}</span>
                        <div className="mt-2.5 text-[15px] font-extrabold text-[#0F1A30]">{h}</div>
                        <div className="mt-1 text-[14px] text-[#55657F] leading-relaxed">{d}</div>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </div>
            </div>
          );
        })()}
      </main>

      {/* 휴대폰 하단 탭바 */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#E2E7EF] grid grid-cols-5 pb-[env(safe-area-inset-bottom)]" aria-label="하단 메뉴">
        {[TABS[0], TABS[1]].map(([k, l, ic, n]) => (
          <button key={k} type="button" onClick={() => go(k)} className={`relative h-[64px] flex flex-col items-center justify-center gap-1 text-[13px] font-bold ${tab === k ? "text-[#0F1A30]" : "text-[#8592A8]"}`}>
            <Icon name={ic} size={21} />{l}{n > 0 && <span className="absolute top-2 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2D4C82] text-white text-[12px] flex items-center justify-center">{n}</span>}
          </button>
        ))}
        <button type="button" onClick={newOrder} className="h-[64px] flex items-center justify-center" aria-label="오더 올리기">
          <span className="w-12 h-12 rounded-2xl text-white flex items-center justify-center shadow-[0_8px_20px_rgba(15,26,48,.35)]" style={btnPrimaryStyle}><Icon name="plus" size={22} /></span>
        </button>
        {[TABS[2], TABS[4]].map(([k, l, ic, n]) => (
          <button key={k} type="button" onClick={() => go(k)} className={`relative h-[64px] flex flex-col items-center justify-center gap-1 text-[13px] font-bold ${tab === k ? "text-[#0F1A30]" : "text-[#8592A8]"}`}>
            <Icon name={ic} size={21} />{l}{n > 0 && <span className="absolute top-2 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2D4C82] text-white text-[12px] flex items-center justify-center">{n}</span>}
          </button>
        ))}
      </nav>

      {filterOpen && (
        <div className="fixed inset-0 z-[9998] bg-[#0B1428]/55 flex items-end lg:hidden" onClick={() => setFilterOpen(false)}>
          <div className="w-full bg-[#F2F4F8] rounded-t-[24px] max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-[#E2E7EF]">
              <div className="text-[18px] font-extrabold text-[#0F1A30]">오더 찾기</div>
              <button type="button" onClick={() => setFilterOpen(false)} className="w-10 h-10 rounded-xl flex items-center justify-center text-[#55657F]" aria-label="닫기"><Icon name="close" size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto">{Filters}</div>
            <div className="p-4 border-t border-[#E2E7EF] bg-white pb-[max(16px,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => setFilterOpen(false)} className={`${btnPrimary} w-full`} style={btnPrimaryStyle}>{filtered.length}건 보기</button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <CafeOrderForm orders={orders} profile={profile} editing={editing?.order || null} editingDetail={editing?.detail} editingSettle={editing?.settle}
          onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={() => { setFormOpen(false); setEditing(null); }} />
      )}
      {selectedOrder && (
        <CafeOrderDetail order={selectedOrder} profile={profile} onClose={closeOrder} trustOf={trustOf}
          onEdit={(o, detail, settle) => { closeOrder(); setEditing({ order: o, detail, settle }); setFormOpen(true); }} />
      )}
    </div>
  );
}
