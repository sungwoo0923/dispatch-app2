// ======================= cafe-site/src/hub/HubApp.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브 — 화물 콜 앱(차주 · 화주 · 운송사). 휴대폰과 PC가 같은 화면(반응형).
//  휴대폰: 위 앱바 + 아래 탭바 + 오더 등록 버튼(화주·운송사) · 끌어내려 새로고침
//  PC: 왼쪽 메뉴 + 필터 패널 + 카드 2열 + 오른쪽 상세 서랍 · [새로고침] 버튼
//  탭: 오더(보드) · 내 배차(차주·운송사) · 내 오더(화주·운송사) · 알림 · 내 정보 · 회원 승인(관리자)
//  실시간: onSnapshot. 새 콜 알림(소리 · 진동 · 읽어주기)은 내 알림 조건(지역 · 차종 · 톤수 · 최소 운임)에 맞을 때만.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { HI, Btn, Chip, Badge, Card, Empty, Seg, HubMark, NAVY_BG, HUB_CSS, NUMS, useToast, Avatar, selectCls, inputCls, Drawer, Field } from "./hubUi";
import { ROLES, SOURCE_LABEL, canPost, canTake, SIDO_LIST, HUB_VEHICLES, HUB_TONS, tonValue, regionLL, kmBetweenLL, nearestRegion, ago, STATUS, ACTIVE, speakText, routeText, manwon, kstYmd, tsMs, fareFitness, DOC_TYPES } from "./hubConstants";
import { subscribeMember, subscribeBoard, refreshBoard, subscribeMine, subscribeNotices, markRead, updatePrefs, localSession, subscribeStats, ratingAvg, fetchPrivate } from "./hubApi";
import HubOrderCard from "./HubOrderCard";
import HubOrderDetail from "./HubOrderDetail";
import HubPostForm from "./HubPostForm";
import HubAdmin from "./HubAdmin";

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };
const DEFAULT_F = { from: [], to: [], vehicle: "", ton: "", day: "", urgent: false, fav: false, sort: "new" };
const TON_RANGES = [["", "전체 톤수"], ["s", "1.4톤 이하", 0, 1.4], ["m", "2.5~3.5톤", 2.5, 3.5], ["l", "5톤(축)", 4.5, 6], ["xl", "8~11톤", 8, 11], ["xxl", "14톤 이상", 14, 99]];

// ── 새 콜 알림음(짧은 두 번) · 진동 · 읽어주기
let audioCtx = null;
function unlockAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch { /* 무시 */ } }
function beep() {
  try {
    unlockAudio();
    const t0 = audioCtx.currentTime;
    [0, 0.22].forEach((d, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = i ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + d); o.stop(t0 + d + 0.2);
    });
  } catch { /* 무시 */ }
}
function speak(text) {
  try { if (!window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(text); u.lang = "ko-KR"; u.rate = 1.05; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch { /* 무시 */ }
}
export function alertMatches(o, a, me) {
  if (!a?.on || o.posterUid === me.uid) return false;
  if (a.regions?.length && !a.regions.includes(o.상차시도)) return false;
  if (a.vehicles?.length && !a.vehicles.some((v) => String(o.차량종류 || "").includes(v))) return false;
  const t = o.톤수값 || tonValue(o.차량톤수);
  if (a.tonMin && t < Number(a.tonMin)) return false;
  if (a.tonMax && t > Number(a.tonMax)) return false;
  if (a.minFare && (Number(o.운임) || 0) < Number(a.minFare) * 10000) return false;
  return true;
}

function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={NAVY_BG}>
      <style>{HUB_CSS}</style>
      <HubMark size={48} />
      <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-[#8FB0F0] animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
    </div>
  );
}

// 승인 대기 · 거절 · 정지 화면
function Gate({ m, logout }) {
  const nav = useNavigate();
  const pending = m.status === "pending";
  const rejected = m.status === "rejected";
  const docs = Object.keys(m.docs || {});
  return (
    <div className="min-h-screen bg-[#EEF1F6]" data-testid={`gate-${m.status}`}>
      <style>{HUB_CSS}</style>
      <div className="px-5 pt-[max(24px,env(safe-area-inset-top))] pb-16 text-white" style={NAVY_BG}>
        <div className="max-w-[560px] mx-auto flex items-center justify-between"><HubMark size={38} /><button type="button" onClick={logout} className="h-11 px-4 rounded-2xl bg-white/10 text-[15px] font-bold">로그아웃</button></div>
        <div className="max-w-[560px] mx-auto mt-8">
          <div className="text-[15px] font-bold text-[#8FB0F0]">{ROLES[m.role]?.label} 가입 신청</div>
          <div className="text-[28px] font-extrabold mt-1 tracking-[-0.02em]">{pending ? "관리자가 서류를 확인하고 있어요" : rejected ? "가입 신청이 반려되었습니다" : "이용이 정지된 계정입니다"}</div>
          <div className="text-[15.5px] text-white/65 mt-2 leading-relaxed">{pending ? "보통 영업일 기준 하루 안에 승인됩니다. 승인되면 바로 오더 보드가 열립니다." : m.rejectReason ? `사유: ${m.rejectReason}` : "관리자에게 문의해 주세요."}</div>
        </div>
      </div>
      <div className="max-w-[560px] mx-auto px-4 -mt-9 space-y-3 pb-10">
        <Card className="p-5">
          <ol className="space-y-3">
            {[["신청서 제출", true], ["서류 확인", !pending], [rejected ? "반려" : m.status === "suspended" ? "정지" : "승인", false]].map(([t, done], i) => (
              <li key={t} className="flex items-center gap-3"><span className={`w-9 h-9 rounded-full inline-flex items-center justify-center text-[15px] font-extrabold ${done ? "bg-[#2D4C82] text-white" : i === 1 && pending ? "bg-[#0F1A30] text-[#8FB0F0] animate-pulse" : "bg-[#EEF2F8] text-[#8592A8]"}`}>{done ? <HI name="check" size={17} /> : i + 1}</span><span className="text-[16px] font-bold text-[#0F1A30]">{t}</span></li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2">제출한 정보</div>
          <div className="text-[15.5px] text-[#3A4A66] leading-relaxed">{m.name} · {m.phone}<br />{m.companyName}{m.vehicle ? ` · ${m.vehicle.plate} ${m.vehicle.ton} ${m.vehicle.type}` : ""}<br />서류 {docs.length}개: {docs.map((k) => DOC_TYPES[k]).join(", ")}</div>
        </Card>
        {(pending || rejected) && m.source === "signup" && <Btn size="xl" className="w-full" onClick={() => nav("/signup?edit=1")} data-testid="gate-edit">{rejected ? "고쳐서 다시 신청하기" : "신청서 고치기"}</Btn>}
      </div>
    </div>
  );
}

export default function HubApp() {
  const [authUser, setAuthUser] = useState(undefined);
  const [me, setMe] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [board, setBoard] = useState([]);
  const [posts, setPosts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [notices, setNotices] = useState([]);
  const [fresh, setFresh] = useState(() => new Set());
  const [tab, setTab] = useState(() => readLS("hubTab", "board"));
  const [f, setF] = useState(() => ({ ...DEFAULT_F, ...readLS("hubBoardF", {}) }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [form, setForm] = useState(null); // { editing? }
  const [myPos, setMyPos] = useState(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState(Date.now());
  const [toastNode, toast] = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const { id: openId } = useParams();
  const meRef = useRef(null);
  meRef.current = me;

  useEffect(() => onAuthStateChanged(auth, (u) => setAuthUser(u || null)), []);
  useEffect(() => {
    if (!authUser) { setMe(authUser === null ? null : undefined); return; }
    getDoc(doc(db, "users", authUser.uid)).then((s) => setIsAdmin(authUser.email === TOTAL_MASTER_EMAIL || (s.exists() && s.data().role === "totalMaster"))).catch(() => setIsAdmin(authUser.email === TOTAL_MASTER_EMAIL));
    return subscribeMember(authUser.uid, (m) => setMe(m ? { ...m, uid: authUser.uid } : null));
  }, [authUser]);
  // 한 계정 한 기기 — 다른 기기에서 로그인하면 여기서 로그아웃
  useEffect(() => {
    if (!me?.activeSession) return;
    const mine = localSession();
    if (mine && me.activeSession !== mine) { signOut(auth).then(() => { alert("다른 기기에서 같은 계정으로 로그인해 이 기기는 로그아웃되었습니다."); nav("/login", { replace: true }); }); }
  }, [me?.activeSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const approved = me?.status === "approved";
  const onAdded = useCallback((o) => {
    const m = meRef.current;
    if (!m) return;
    setFresh((p) => new Set(p).add(o.id));
    const a = m.prefs?.alert;
    if (alertMatches(o, a, m)) {
      beep();
      try { navigator.vibrate?.([220, 120, 220]); } catch { /* 무시 */ }
      if (a.tts) speak(speakText(o));
      toast(`새 콜 · ${routeText(o)} · ${manwon(o.운임)}`, 4000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved) return; return subscribeBoard((rows) => { setBoard(rows); setLastSync(Date.now()); }, onAdded); }, [approved, onAdded]);
  useEffect(() => { if (!approved || !canPost(me)) return; return subscribeMine(me.uid, "posterUid", setPosts); }, [approved, me?.uid, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved || !canTake(me)) return; return subscribeMine(me.uid, "takerUid", setJobs); }, [approved, me?.uid, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved) return; return subscribeNotices(me.uid, setNotices); }, [approved, me?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => writeLS("hubBoardF", f), [f]);
  useEffect(() => writeLS("hubTab", tab), [tab]);
  useEffect(() => { if (loc.pathname === "/admin") setTab("admin"); }, [loc.pathname]);

  const doRefresh = async () => {
    setRefreshing(true);
    try { const rows = await refreshBoard(); setBoard(rows); setLastSync(Date.now()); toast(`새로고침 · 모집중 ${rows.length}건`); } catch { toast("새로고침하지 못했습니다"); }
    finally { setRefreshing(false); setPull(0); }
  };
  // 휴대폰 끌어내려 새로고침
  const touch = useRef(null);
  const onTouchStart = (e) => { touch.current = window.scrollY <= 0 ? e.touches[0].clientY : null; };
  const onTouchMove = (e) => { if (touch.current == null) return; const d = e.touches[0].clientY - touch.current; setPull(d > 0 ? Math.min(110, d * 0.55) : 0); };
  const onTouchEnd = () => { if (pull > 64 && !refreshing) doRefresh(); else setPull(0); touch.current = null; };

  const favorites = me?.prefs?.favorites || [];
  const favSet = useMemo(() => new Set(favorites.map((x) => x.uid)), [favorites]);
  const activeJob = jobs.find((j) => ACTIVE.includes(j.status));

  const filtered = useMemo(() => {
    const today = kstYmd(), tom = kstYmd(1);
    const rng = TON_RANGES.find((r) => r[0] === f.ton);
    const list = board.filter((o) => {
      if (f.from.length && !f.from.includes(o.상차시도)) return false;
      if (f.to.length && !f.to.includes(o.하차시도)) return false;
      if (f.vehicle && !String(o.차량종류 || "").includes(f.vehicle)) return false;
      if (rng && rng[2] != null) { const t = o.톤수값 || tonValue(o.차량톤수); if (t < rng[2] || t > rng[3]) return false; }
      if (f.day === "today" && o.상차일 !== today) return false;
      if (f.day === "tomorrow" && o.상차일 !== tom) return false;
      if (f.urgent && !o.긴급) return false;
      if (f.fav && !favSet.has(o.posterUid)) return false;
      return true;
    }).map((o) => ({ o, near: myPos ? kmBetweenLL(myPos.ll, regionLL(o.상차시도, o.상차시군구)) : 0 }));
    const perKm = (o) => (o.거리km ? (Number(o.운임) || 0) / o.거리km : 0);
    const s = {
      new: (a, b) => (b.o.긴급 ? 1 : 0) - (a.o.긴급 ? 1 : 0) || tsMs(b.o.createdAt) - tsMs(a.o.createdAt),
      fare: (a, b) => (Number(b.o.운임) || 0) - (Number(a.o.운임) || 0),
      perkm: (a, b) => perKm(b.o) - perKm(a.o),
      time: (a, b) => `${a.o.상차일} ${a.o.상차시간 || "99"}`.localeCompare(`${b.o.상차일} ${b.o.상차시간 || "99"}`),
      near: (a, b) => (a.near || 9999) - (b.near || 9999),
    }[f.sort] || (() => 0);
    return list.sort(s);
  }, [board, f, favSet, myPos]);

  // 귀로(돌아오는 길) 추천 — 진행 중 배차의 하차 지역에서 출발하는 오더, 내 출발지(차고지)로 돌아가면 위로
  const returns = useMemo(() => {
    if (!activeJob) return [];
    const home = me?.home?.sido || activeJob.상차시도;
    const endLL = regionLL(activeJob.하차시도, activeJob.하차시군구);
    return board.filter((o) => o.posterUid !== me?.uid && (o.상차시도 === activeJob.하차시도 || kmBetweenLL(endLL, regionLL(o.상차시도, o.상차시군구)) <= 60) && (o.상차일 || "") >= (activeJob.하차일 || activeJob.상차일 || ""))
      .map((o) => ({ o, score: (o.하차시도 === home ? 100 : 0) + (o.하차시도 === activeJob.상차시도 ? 50 : 0) + (Number(o.운임) || 0) / 100000 }))
      .sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.o);
  }, [activeJob, board, me?.home?.sido, me?.uid]);

  if (authUser === undefined || me === undefined) return <Loading />;
  if (authUser === null) return <Navigate to="/login" replace />;
  const logout = async () => { await signOut(auth); nav("/login", { replace: true }); };
  if (me === null) {
    // 로그인했지만 허브 회원 정보가 없다 — 가입 이어서 작성
    return <Navigate to="/signup" replace />;
  }
  if (!approved) return <Gate m={me} logout={logout} />;

  const poster = canPost(me);
  const taker = canTake(me);
  const unread = notices.filter((n) => !n.read).length;
  const activeJobs = jobs.filter((j) => ACTIVE.includes(j.status)).length;
  const postsWaiting = posts.filter((p) => p.status === "assigned").length;
  const TABS = [
    ["board", "오더", "board", 0],
    ...(taker ? [["jobs", "내 배차", "truck", activeJobs]] : []),
    ...(poster ? [["posts", "내 오더", "list", postsWaiting]] : []),
    ["notices", "알림", "bell", unread],
    ["me", "내 정보", "user", 0],
    ...(isAdmin ? [["admin", "회원 승인", "shield", 0]] : []),
  ];
  const go = (k) => { setTab(k); if (openId || loc.pathname === "/admin") nav("/"); window.scrollTo({ top: 0 }); };
  const openOrder = (o) => nav(`/order/${o.id}`);
  const closeOrder = () => nav(tab === "admin" ? "/admin" : "/");
  const setFilter = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleIn = (k, v) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const askNear = () => {
    if (!navigator.geolocation) { toast("이 기기는 위치를 쓸 수 없습니다"); return; }
    navigator.geolocation.getCurrentPosition((p) => { const r = nearestRegion(p.coords.latitude, p.coords.longitude); setMyPos({ ...r, ll: [p.coords.latitude, p.coords.longitude] }); setFilter("sort", "near"); toast(`내 위치 · ${r.sido} ${r.sigungu || ""} 근처 순`); },
      () => toast("위치 권한을 허용하면 가까운 오더부터 보여드립니다"), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  };
  const routes = me.prefs?.routes || [];
  const saveRoute = () => {
    if (!f.from.length && !f.to.length) { toast("상차 · 하차 지역을 먼저 고르세요"); return; }
    const r = { from: f.from.slice(0, 3), to: f.to.slice(0, 3) };
    const list = [r, ...routes.filter((x) => JSON.stringify(x) !== JSON.stringify(r))].slice(0, 8);
    updatePrefs(me.uid, { ...(me.prefs || {}), routes: list }).then(() => toast("관심 노선에 저장했습니다")).catch(() => toast("저장하지 못했습니다"));
  };
  const activeN = f.from.length + f.to.length + (f.vehicle ? 1 : 0) + (f.ton ? 1 : 0) + (f.day ? 1 : 0) + (f.urgent ? 1 : 0) + (f.fav ? 1 : 0);
  const alertOn = !!me.prefs?.alert?.on;

  // ── 필터 패널(PC 왼쪽 · 휴대폰 시트)
  const FilterBody = (
    <div className="space-y-5">
      <div>
        <div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">상차 지역</div>
        <div className="flex flex-wrap gap-1.5">{SIDO_LIST.map((s) => <Chip key={s} on={f.from.includes(s)} onClick={() => toggleIn("from", s)} className="h-10 px-3.5" data-testid={`f-from-${s}`}>{s}</Chip>)}</div>
      </div>
      <div>
        <div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">하차 지역</div>
        <div className="flex flex-wrap gap-1.5">{SIDO_LIST.map((s) => <Chip key={s} on={f.to.includes(s)} onClick={() => toggleIn("to", s)} className="h-10 px-3.5">{s}</Chip>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="차종"><select className={selectCls} value={f.vehicle} onChange={(e) => setFilter("vehicle", e.target.value)}><option value="">전체 차종</option>{HUB_VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="톤수"><select className={selectCls} value={f.ton} onChange={(e) => setFilter("ton", e.target.value)}>{TON_RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <div>
        <div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">상차일</div>
        <Seg value={f.day} onChange={(v) => setFilter("day", v)} options={[["", "전체"], ["today", "오늘"], ["tomorrow", "내일"]]} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip on={f.urgent} onClick={() => setFilter("urgent", !f.urgent)}><HI name="bolt" size={15} />긴급만</Chip>
        <Chip on={f.fav} onClick={() => setFilter("fav", !f.fav)}><HI name="heart" size={15} />즐겨찾는 등록자</Chip>
      </div>
      <div className="flex gap-2">
        <Btn kind="soft" size="md" className="flex-1" onClick={saveRoute}><HI name="star" size={16} />관심 노선 저장</Btn>
        <Btn kind="ghost" size="md" onClick={() => setF({ ...DEFAULT_F, sort: f.sort })}>초기화</Btn>
      </div>
    </div>
  );

  const SortBar = (
    <div className="flex items-center gap-2 overflow-x-auto hub-scroll -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
      <button type="button" onClick={() => setFilterOpen(true)} className="lg:hidden h-11 px-4 rounded-full bg-[#0F1A30] text-white text-[15px] font-bold inline-flex items-center gap-1.5 shrink-0" data-testid="btn-filter"><HI name="sliders" size={16} />필터{activeN ? ` ${activeN}` : ""}</button>
      {[["new", "최신순"], ["fare", "운임 높은순"], ["perkm", "km당 운임"], ["time", "상차 빠른순"]].map(([k, l]) => <Chip key={k} on={f.sort === k} onClick={() => setFilter("sort", k)}>{l}</Chip>)}
      <Chip on={f.sort === "near"} onClick={askNear} data-testid="btn-near"><HI name="gps" size={15} />내 주변</Chip>
      {routes.map((r, i) => <Chip key={i} on={JSON.stringify(f.from) === JSON.stringify(r.from) && JSON.stringify(f.to) === JSON.stringify(r.to)} onClick={() => setF((p) => ({ ...p, from: r.from, to: r.to }))}><HI name="route" size={15} />{(r.from.join("·") || "전국")}→{(r.to.join("·") || "전국")}</Chip>)}
    </div>
  );

  const urgentN = board.filter((o) => o.긴급).length;
  const BoardView = (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="lg:hidden flex justify-center overflow-hidden transition-[height]" style={{ height: pull }}><span className={`mt-3 w-10 h-10 rounded-full bg-white shadow inline-flex items-center justify-center text-[#2D4C82] ${refreshing ? "animate-spin" : ""}`} style={{ transform: `rotate(${pull * 3}deg)` }}><HI name="refresh" size={19} /></span></div>
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-5">
        <aside className="hidden lg:block">
          <div className="sticky top-[88px] space-y-3">
            <Card className="p-5">{FilterBody}</Card>
            {taker && <AlertCard me={me} onOpen={() => setAlertOpen(true)} />}
          </div>
        </aside>
        <div className="min-w-0 space-y-3.5">
          <div className="grid grid-cols-3 gap-2.5">
            {[["모집중", board.length, "건"], ["긴급", urgentN, "건"], [taker ? "내 배차 진행" : "내 오더 배차", taker ? activeJobs : postsWaiting, "건"]].map(([l, v, u]) => (
              <div key={l} className="rounded-[18px] lg:rounded-[20px] bg-white ring-1 ring-inset ring-[#E2E7EF] px-3.5 py-2.5 lg:px-4 lg:py-3">
                <div className="text-[13.5px] lg:text-[14px] font-bold text-[#8592A8] truncate">{l}</div>
                <div className="flex items-baseline gap-1 mt-0.5"><span className="text-[22px] lg:text-[26px] font-extrabold text-[#0F1A30] leading-none" style={NUMS} data-testid={l === "모집중" ? "stat-open" : undefined}>{v}</span><span className="text-[14px] font-bold text-[#A3AEC0]">{u}</span></div>
              </div>
            ))}
          </div>
          {SortBar}
          {taker && returns.length > 0 && (
            <Card className="p-4" data-testid="return-trips">
              <div className="flex items-center gap-2 mb-3"><span className="w-9 h-9 rounded-xl bg-[#0F1A30] text-[#8FB0F0] inline-flex items-center justify-center"><HI name="return" size={18} /></span><div className="min-w-0"><div className="text-[16px] font-extrabold text-[#0F1A30]">귀로 추천</div><div className="text-[14px] text-[#8592A8] truncate">{activeJob.하차시도} {activeJob.하차시군구} 하차 후 바로 실을 수 있는 오더</div></div></div>
              <div className="flex gap-2.5 overflow-x-auto hub-scroll -mx-1 px-1 pb-1">
                {returns.map((o) => (
                  <button key={o.id} type="button" onClick={() => openOrder(o)} className="shrink-0 w-[230px] text-left rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] p-3.5 hover:ring-[#2D4C82]">
                    <div className="text-[15.5px] font-extrabold text-[#0F1A30] truncate">{o.상차시군구 || o.상차시도} → {o.하차시도} {o.하차시군구}</div>
                    <div className="text-[14px] text-[#55657F] mt-0.5 truncate">{o.차량톤수} {o.차량종류} · {o.상차일 === kstYmd() ? "오늘" : o.상차일}</div>
                    <div className="text-[19px] font-extrabold text-[#1B2B4B] mt-1.5" style={NUMS}>{manwon(o.운임)}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {filtered.length === 0
            ? <Empty icon="board" title={board.length ? "조건에 맞는 오더가 없습니다" : "지금 모집중인 오더가 없습니다"} desc={board.length ? "필터를 줄여 보세요." : "새 오더가 올라오면 바로 여기 나타납니다."} action={activeN ? <Btn kind="ghost" onClick={() => setF({ ...DEFAULT_F })}>필터 초기화</Btn> : null} />
            : <div className="grid xl:grid-cols-2 gap-3.5" data-testid="board-list">{filtered.map(({ o, near }) => <HubOrderCard key={o.id} o={o} onOpen={() => openOrder(o)} mine={o.posterUid === me.uid} fav={favSet.has(o.posterUid)} fresh={fresh.has(o.id)} extraKm={f.sort === "near" ? near : 0} />)}</div>}
        </div>
      </div>
    </div>
  );

  const ListView = ({ rows, kind }) => {
    const groups = kind === "jobs"
      ? [["진행 중", rows.filter((o) => ACTIVE.includes(o.status))], ["완료", rows.filter((o) => o.status === "delivered")], ["취소", rows.filter((o) => o.status === "cancelled")]]
      : [["배차 대기", rows.filter((o) => o.status === "open")], ["진행 중", rows.filter((o) => ACTIVE.includes(o.status))], ["완료", rows.filter((o) => o.status === "delivered")], ["취소", rows.filter((o) => o.status === "cancelled")]];
    if (!rows.length) return <Empty icon={kind === "jobs" ? "truck" : "list"} title={kind === "jobs" ? "배차받은 오더가 없습니다" : "올린 오더가 없습니다"} desc={kind === "jobs" ? "오더 보드에서 [배차신청]을 눌러 보세요." : "[오더 등록]으로 첫 오더를 올려 보세요."} action={kind === "posts" ? <Btn onClick={() => setForm({})}><HI name="plus" size={18} />오더 등록</Btn> : null} />;
    return (
      <div className="space-y-6" data-testid={`list-${kind}`}>
        {groups.filter(([, g]) => g.length).map(([t, g]) => (
          <section key={t}>
            <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2.5">{t} <span className="text-[#8592A8]">{g.length}</span></div>
            <div className="grid xl:grid-cols-2 gap-3.5">{g.map((o) => <HubOrderCard key={o.id} o={o} onOpen={() => openOrder(o)} mine={o.posterUid === me.uid} compact />)}</div>
          </section>
        ))}
      </div>
    );
  };

  const NoticesView = (
    <Card className="overflow-hidden" data-testid="notices">
      {notices.length === 0 ? <div className="p-10 text-center text-[15.5px] text-[#8592A8]">새 알림이 없습니다.</div> : notices.map((n) => (
        <button key={n.id} type="button" onClick={() => { markRead(n.id); if (n.orderId) nav(`/order/${n.orderId}`); }} className={`w-full text-left px-5 py-4 flex gap-3.5 border-b border-[#EEF1F6] last:border-0 ${n.read ? "" : "bg-[#F3F7FE]"}`}>
          <span className={`w-11 h-11 rounded-2xl inline-flex items-center justify-center shrink-0 ${n.read ? "bg-[#F2F5FA] text-[#8592A8]" : "bg-[#0F1A30] text-[#8FB0F0]"}`}><HI name={{ assigned: "bolt", quickCancel: "clock", released: "alert", cancelled: "close", loaded: "box", delivered: "flag" }[n.type] || "bell"} size={19} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-extrabold text-[#0F1A30]">{n.title}</span><span className="block text-[15px] text-[#55657F] leading-snug mt-0.5">{n.body}</span></span>
          <span className="text-[13.5px] text-[#8592A8] shrink-0">{ago(n.createdAt)}</span>
        </button>
      ))}
    </Card>
  );

  const titles = { board: "실시간 오더", jobs: "내 배차", posts: "내 오더", notices: "알림", me: "내 정보", admin: "허브 회원 승인" };
  let body = null;
  if (tab === "board") body = BoardView;
  else if (tab === "jobs" && taker) body = ListView({ rows: jobs, kind: "jobs" });
  else if (tab === "posts" && poster) body = ListView({ rows: posts, kind: "posts" });
  else if (tab === "notices") body = NoticesView;
  else if (tab === "me") body = <MeView me={me} isAdmin={isAdmin} logout={logout} openAlert={() => setAlertOpen(true)} favorites={favorites} toast={toast} />;
  else if (tab === "admin" && isAdmin) body = <HubAdmin admin={{ uid: me.uid, email: authUser.email }} toast={toast} />;
  else body = BoardView;

  const editOrder = async (o) => { const detail = await fetchPrivate(o.id, "detail"); setForm({ editing: { id: o.id, pub: o, detail } }); };

  return (
    <div className="min-h-screen bg-[#EEF1F6] lg:pl-[272px]">
      <style>{HUB_CSS}</style>
      {/* PC 왼쪽 메뉴 */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[272px] flex-col text-white z-40" style={NAVY_BG}>
        <div className="px-5 h-[76px] flex items-center"><HubMark size={38} /></div>
        {poster && <div className="px-4"><Btn kind="accent" size="lg" className="w-full" onClick={() => setForm({})} data-testid="btn-post"><HI name="plus" size={19} />오더 등록</Btn></div>}
        <nav className="mt-4 px-3 space-y-1 flex-1">
          {TABS.map(([k, l, ic, n]) => (
            <button key={k} type="button" onClick={() => go(k)} data-testid={`nav-${k}`} aria-current={tab === k ? "page" : undefined}
              className={`w-full h-12 px-3.5 rounded-2xl flex items-center gap-3 text-[16px] font-bold transition ${tab === k ? "bg-white text-[#0F1A30]" : "text-white/75 hover:bg-white/[0.08] hover:text-white"}`}>
              <HI name={ic} size={19} className={tab === k ? "text-[#2D4C82]" : "text-[#8FB0F0]"} />{l}
              {n > 0 && <span className={`ml-auto min-w-[24px] h-6 px-2 rounded-full text-[13px] font-extrabold inline-flex items-center justify-center ${tab === k ? "bg-[#0F1A30] text-white" : "bg-[#8FB0F0] text-[#0B1428]"}`}>{n}</span>}
            </button>
          ))}
          {me.source === "logisweb-staff" && <a href="/exchange" className="w-full h-12 px-3.5 rounded-2xl flex items-center gap-3 text-[16px] font-bold text-white/60 hover:bg-white/[0.08]"><HI name="swap" size={19} className="text-[#8FB0F0]" />운송사 거래소</a>}
        </nav>
        <div className="m-3 p-3.5 rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 flex items-center gap-3">
          <Avatar path={me.photoPath} name={me.name} size={42} dark />
          <div className="min-w-0 flex-1"><div className="text-[15px] font-extrabold truncate">{me.name}</div><div className="text-[13px] text-white/55 truncate">{ROLES[me.role]?.label} · {me.companyName}</div></div>
          <button type="button" onClick={logout} aria-label="로그아웃" className="w-10 h-10 rounded-xl hover:bg-white/10 inline-flex items-center justify-center text-white/70"><HI name="logout" size={18} /></button>
        </div>
      </aside>

      {/* 위 앱바 */}
      <header className="sticky top-0 z-30 bg-[#EEF1F6]/90 backdrop-blur-md border-b border-[#E2E7EF] lg:bg-[#EEF1F6]/80">
        <div className="lg:hidden text-white px-4 pt-[env(safe-area-inset-top)]" style={NAVY_BG}>
          <div className="h-[60px] flex items-center gap-2">
            <img src="/brand/logisweb-mark-square.svg" alt="" className="w-9 h-9 rounded-[10px]" />
            <div className="min-w-0 flex-1"><div className="text-[18px] font-extrabold leading-tight truncate">{titles[tab]}</div><div className="text-[13px] font-semibold text-white/55 truncate">{ROLES[me.role]?.label} · {me.name}</div></div>
            {taker && <button type="button" onClick={() => setAlertOpen(true)} aria-label="콜 알림 설정" data-testid="btn-alert-m" className={`w-11 h-11 rounded-2xl inline-flex items-center justify-center ${alertOn ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-white/10"}`}><HI name="volume" size={19} /></button>}
            <button type="button" onClick={doRefresh} aria-label="새로고침" className="w-11 h-11 rounded-2xl bg-white/10 inline-flex items-center justify-center"><HI name="refresh" size={19} className={refreshing ? "animate-spin" : ""} /></button>
          </div>
        </div>
        <div className="hidden lg:flex h-[72px] items-center gap-3 px-8">
          <div className="min-w-0"><div className="text-[24px] font-extrabold text-[#0F1A30] tracking-[-0.02em]">{titles[tab]}</div></div>
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white ring-1 ring-inset ring-[#E2E7EF] text-[13.5px] font-bold text-[#1B2B4B]"><span className="w-2 h-2 rounded-full bg-[#2D4C82] animate-pulse" />실시간 · {new Date(lastSync).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <div className="ml-auto flex items-center gap-2">
            {taker && <Btn kind={alertOn ? "primary" : "ghost"} size="md" onClick={() => setAlertOpen(true)} data-testid="btn-alert"><HI name="volume" size={17} />콜 알림 {alertOn ? "켜짐" : "꺼짐"}</Btn>}
            <Btn kind="ghost" size="md" onClick={doRefresh} data-testid="btn-refresh"><HI name="refresh" size={17} className={refreshing ? "animate-spin" : ""} />새로고침</Btn>
            <button type="button" onClick={() => go("notices")} aria-label="알림" className="relative w-11 h-11 rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] inline-flex items-center justify-center text-[#1B2B4B]"><HI name="bell" size={19} />{unread > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#0F1A30] text-white text-[12px] font-extrabold inline-flex items-center justify-center">{unread}</span>}</button>
          </div>
        </div>
      </header>

      <main className="px-4 lg:px-8 py-4 lg:py-6 pb-[calc(110px+env(safe-area-inset-bottom))] lg:pb-10 max-w-[1440px]">{body}</main>

      {/* 휴대폰 아래 탭바 */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E7EF] pb-[env(safe-area-inset-bottom)]">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(TABS.length, 5)}, minmax(0,1fr))` }}>
          {TABS.slice(0, 5).map(([k, l, ic, n]) => (
            <button key={k} type="button" onClick={() => go(k)} data-testid={`tab-${k}`} aria-current={tab === k ? "page" : undefined} className={`relative h-[64px] flex flex-col items-center justify-center gap-1 text-[13.5px] font-bold ${tab === k ? "text-[#0F1A30]" : "text-[#8592A8]"}`}>
              <span className={`w-12 h-8 rounded-full inline-flex items-center justify-center transition ${tab === k ? "bg-[#0F1A30] text-[#8FB0F0]" : ""}`}><HI name={ic} size={20} /></span>{l}
              {n > 0 && <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2D4C82] text-white text-[11.5px] font-extrabold inline-flex items-center justify-center">{n}</span>}
            </button>
          ))}
        </div>
      </nav>
      {poster && tab !== "admin" && tab !== "me" && (
        <button type="button" onClick={() => setForm({})} data-testid="fab-post" className="lg:hidden fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 h-14 pl-4 pr-5 rounded-full text-white text-[16px] font-extrabold inline-flex items-center gap-2 shadow-[0_16px_36px_rgba(11,20,40,.4)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
          <HI name="plus" size={22} />오더 등록
        </button>
      )}

      {filterOpen && <Drawer onClose={() => setFilterOpen(false)} title="필터" sub={`조건에 맞는 오더 ${filtered.length}건`}><div className="flex-1 overflow-y-auto p-4">{FilterBody}</div><div className="p-4 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]"><Btn size="xl" className="w-full" onClick={() => setFilterOpen(false)}>{filtered.length}건 보기</Btn></div></Drawer>}
      {alertOpen && <AlertSettings me={me} onClose={() => setAlertOpen(false)} toast={toast} />}
      {openId && <HubOrderDetail key={openId} id={openId} me={me} onClose={closeOrder} toast={toast} favorites={favorites} onEdit={(o) => { closeOrder(); editOrder(o); }} />}
      {form && <HubPostForm me={me} editing={form.editing} onClose={() => setForm(null)} toast={toast} onDone={() => { if (tab !== "board") setTab("posts"); }} />}
      {toastNode}
    </div>
  );
}

function AlertCard({ me, onOpen }) {
  const a = me.prefs?.alert;
  return (
    <button type="button" onClick={onOpen} className="w-full text-left rounded-[22px] p-4 text-white" style={NAVY_BG}>
      <div className="flex items-center gap-2"><HI name="volume" size={18} className="text-[#8FB0F0]" /><span className="text-[16px] font-extrabold">콜 알림</span><Badge tone={a?.on ? "accent" : "line"} className="ml-auto">{a?.on ? "켜짐" : "꺼짐"}</Badge></div>
      <div className="text-[14.5px] text-white/65 mt-2 leading-relaxed">{a?.on ? `${a.regions?.length ? a.regions.join("·") : "전국"} 상차 · ${a.vehicles?.length ? a.vehicles.join("·") : "모든 차종"}${a.tts ? " · 읽어주기" : ""}` : "내 차에 맞는 새 콜이 오면 소리·진동·음성으로 알려드립니다."}</div>
    </button>
  );
}

// 콜 알림 설정 — 지역 · 차종 · 톤수 · 최소 운임 · 읽어주기
function AlertSettings({ me, onClose, toast }) {
  const cur = me.prefs?.alert || {};
  const [a, setA] = useState({ on: cur.on ?? false, tts: cur.tts ?? true, regions: cur.regions ?? (me.regions || []), vehicles: cur.vehicles ?? (me.vehicle?.type ? [me.vehicle.type] : []), tonMin: cur.tonMin ?? "", tonMax: cur.tonMax ?? (tonValue(me.vehicle?.ton) || ""), minFare: cur.minFare ?? "" });
  const tog = (k, v) => setA((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const save = () => { unlockAudio(); updatePrefs(me.uid, { ...(me.prefs || {}), alert: a }).then(() => { toast(a.on ? "콜 알림을 켰습니다" : "콜 알림을 껐습니다"); onClose(); }).catch(() => toast("저장하지 못했습니다")); };
  return (
    <Drawer onClose={onClose} title="콜 알림 설정" sub="조건에 맞는 새 오더만 울립니다" testid="alert-settings">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <label className="flex items-center gap-3 p-4 rounded-2xl text-white cursor-pointer" style={NAVY_BG}>
          <input type="checkbox" checked={a.on} onChange={(e) => { unlockAudio(); setA((p) => ({ ...p, on: e.target.checked })); }} className="w-6 h-6 accent-[#8FB0F0]" data-testid="alert-on" />
          <span className="text-[17px] font-extrabold">새 콜 알림 받기</span><span className="ml-auto text-[14px] text-white/60">소리 · 진동</span>
        </label>
        <label className="flex items-center gap-3 p-4 rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] cursor-pointer">
          <input type="checkbox" checked={a.tts} onChange={(e) => setA((p) => ({ ...p, tts: e.target.checked }))} className="w-5 h-5 accent-[#1B2B4B]" />
          <span className="text-[16px] font-bold text-[#0F1A30]">경로 · 운임 읽어주기(음성)</span>
          <button type="button" onClick={(e) => { e.preventDefault(); unlockAudio(); beep(); speak("경기 화성시 출발, 부산 강서구 도착. 11톤 윙바디. 운임 68만원."); }} className="ml-auto h-10 px-3 rounded-xl bg-[#EAF0FA] text-[14px] font-bold text-[#1B2B4B]">미리 듣기</button>
        </label>
        <div><div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">상차 지역 <span className="text-[#8592A8] font-semibold">(비우면 전국)</span></div><div className="flex flex-wrap gap-1.5">{SIDO_LIST.map((s) => <Chip key={s} on={a.regions.includes(s)} onClick={() => tog("regions", s)} className="h-10 px-3.5">{s}</Chip>)}</div></div>
        <div><div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">차종</div><div className="flex flex-wrap gap-1.5">{HUB_VEHICLES.map((s) => <Chip key={s} on={a.vehicles.includes(s)} onClick={() => tog("vehicles", s)} className="h-10 px-3.5">{s}</Chip>)}</div></div>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="최소 톤"><select className={selectCls} value={a.tonMin} onChange={(e) => setA((p) => ({ ...p, tonMin: e.target.value }))}><option value="">-</option>{HUB_TONS.map((t) => <option key={t} value={tonValue(t)}>{t}</option>)}</select></Field>
          <Field label="최대 톤"><select className={selectCls} value={a.tonMax} onChange={(e) => setA((p) => ({ ...p, tonMax: e.target.value }))}><option value="">-</option>{HUB_TONS.map((t) => <option key={t} value={tonValue(t)}>{t}</option>)}</select></Field>
          <Field label="최소 운임(만원)"><input className={inputCls} inputMode="numeric" value={a.minFare} onChange={(e) => setA((p) => ({ ...p, minFare: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))} placeholder="0" /></Field>
        </div>
        <div className="text-[14px] text-[#8592A8] leading-relaxed">화면이 켜져 있을 때 울립니다. 휴대폰을 잠가 두어도 받으려면 앱 알림(푸시) 연결이 필요합니다.</div>
      </div>
      <div className="p-4 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]"><Btn size="xl" className="w-full" onClick={save} data-testid="alert-save">저장</Btn></div>
    </Drawer>
  );
}

function MeView({ me, isAdmin, logout, openAlert, favorites, toast }) {
  const [st, setSt] = useState(null);
  useEffect(() => subscribeStats(me.uid, setSt), [me.uid]);
  const avg = ratingAvg(st);
  const removeFav = (uid) => updatePrefs(me.uid, { ...(me.prefs || {}), favorites: favorites.filter((x) => x.uid !== uid) }).then(() => toast("즐겨찾기에서 뺐습니다"));
  const rows = [["유형", `${ROLES[me.role]?.label} · ${SOURCE_LABEL[me.source] || ""}`], ["이름", me.name], ["휴대폰", me.phone], ["회사", me.companyName], ["사업자번호", me.bizNo], ["사업자 상태", me.bizStatus],
    ...(me.vehicle ? [["차량", `${me.vehicle.plate} · ${me.vehicle.ton} ${me.vehicle.type}`], ["적재함", me.vehicle.length ? `${me.vehicle.length}m × ${me.vehicle.width || "-"}m` : ""]] : []), ["이메일", me.email]].filter(([, v]) => v);
  return (
    <div className="grid lg:grid-cols-2 gap-4 max-w-[1100px]" data-testid="me-view">
      <div className="space-y-4">
        <div className="rounded-[24px] p-5 text-white" style={NAVY_BG}>
          <div className="flex items-center gap-4">
            <Avatar path={me.photoPath} name={me.name} size={68} dark />
            <div className="min-w-0"><div className="text-[22px] font-extrabold truncate">{me.name}</div><div className="text-[15px] text-white/60 truncate">{me.companyName}</div>
              <div className="mt-1.5 flex gap-1.5 flex-wrap"><Badge tone="accent">{ROLES[me.role]?.label}</Badge>{me.docsVerified && <Badge tone="out"><HI name="shield" size={13} />서류 인증</Badge>}</div></div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5">
            {[["평점", avg ? avg.toFixed(1) : "-"], ["평가", st?.ratingCount || 0], [me.role === "shipper" ? "등록" : "완료", me.role === "shipper" ? st?.posted || 0 : st?.completed || 0]].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/10 px-3 py-2.5"><div className="text-[13.5px] text-white/55 font-bold">{l}</div><div className="text-[22px] font-extrabold" style={NUMS}>{v}</div></div>
            ))}
          </div>
        </div>
        <Card className="p-4"><div className="divide-y divide-[#EEF1F6]">{rows.map(([k, v]) => <div key={k} className="flex py-2.5 text-[15.5px]"><span className="w-24 shrink-0 font-semibold text-[#8592A8]">{k}</span><span className="font-bold text-[#0F1A30] break-all">{v}</span></div>)}</div>
          <div className="mt-2 text-[14px] text-[#8592A8] leading-relaxed">{me.source === "signup" ? "차량 · 서류 변경은 관리자 재심사가 필요합니다. 고객센터로 문의해 주세요." : "정보 변경은 로지스웹 프로그램에서 해 주세요."}</div>
        </Card>
      </div>
      <div className="space-y-4">
        {canTake(me) && <AlertCard me={me} onOpen={openAlert} />}
        <Card className="p-4">
          <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2 flex items-center gap-2"><HI name="heart" size={18} className="text-[#2D4C82]" />즐겨찾기 {favorites.length ? favorites.length : ""}</div>
          {favorites.length === 0 ? <div className="text-[15px] text-[#8592A8]">오더 상세에서 하트를 누르면 여기에 모입니다.</div> : favorites.map((x) => (
            <div key={x.uid} className="flex items-center gap-2 py-2 border-t border-[#EEF1F6]"><span className="text-[15.5px] font-bold text-[#0F1A30] flex-1 truncate">{x.name}</span><button type="button" onClick={() => removeFav(x.uid)} className="h-10 px-3 rounded-xl text-[14px] font-bold text-[#55657F] hover:bg-[#F2F5FA]">빼기</button></div>
          ))}
        </Card>
        <Card className="p-4 space-y-2">
          {me.source === "logisweb-staff" && <a href="/exchange" className="h-12 px-4 rounded-2xl bg-[#F5F7FB] flex items-center gap-2 text-[16px] font-bold text-[#1B2B4B]"><HI name="swap" size={18} />운송사 간 오더 거래소 <HI name="chevron" size={18} className="ml-auto" /></a>}
          {isAdmin && <a href="/admin" className="h-12 px-4 rounded-2xl bg-[#F5F7FB] flex items-center gap-2 text-[16px] font-bold text-[#1B2B4B]"><HI name="shield" size={18} />허브 회원 승인 <HI name="chevron" size={18} className="ml-auto" /></a>}
          <Btn kind="ghost" className="w-full" onClick={logout} data-testid="btn-logout"><HI name="logout" size={18} />로그아웃</Btn>
        </Card>
      </div>
    </div>
  );
}
