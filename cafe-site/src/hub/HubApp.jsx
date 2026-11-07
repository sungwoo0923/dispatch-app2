// ======================= cafe-site/src/hub/HubApp.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브 — 화물 콜 앱(차주 · 화주 · 운송사). 휴대폰과 PC가 같은 화면(반응형).
//  휴대폰: 위 앱바(잔액) + 아래 탭바 + 화물등록 버튼(화주 · 운송사) · 끌어내려 새로고침
//  PC: 왼쪽 메뉴 + 필터 패널 + 카드 2열 + 오른쪽 상세 서랍 · [새로고침] 버튼
// ⭐ 2026-11-07 (3차)
//  · 오더 보드(차주 · 운송사) = 상차 지역이 "내 위치 지역 + 오더 설정의 상차 지역 3곳"인 오더만(서버에서 걸러 받음)
//  · 탭: 오더 · 내 배차 · 등록내역(기간 · 단계 · 결제 · 검색 · 내꺼보기) · 고객관리(허브 전용 회원) · 마이페이지 · 알림 · 관리자
//  · 위 앱바에 잔액(사용 가능 예치금)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { HI, Btn, Chip, Badge, Card, Empty, Seg, HubMark, NAVY_BG, HUB_CSS, NUMS, useToast, Avatar, selectCls, inputCls, Drawer, Field } from "./hubUi";
import { ROLES, canPost, canTake, SIDO_LIST, sigunguOf, HUB_VEHICLES, HUB_TONS, tonValue, regionLL, kmBetweenLL, nearestRegion, ago, ACTIVE, speakText, routeText, manwon, kstYmd, tsMs, DOC_TYPES, isLinked, stageOf, payKind } from "./hubConstants";
import { subscribeMember, subscribeBoard, refreshBoard, subscribeMine, subscribeCompanyPosts, subscribeNotices, markRead, updatePrefs, localSession, subscribeHubConfig, subscribeWallet, subscribeAnnouncements, enableHubPush, pushEnabledHere, disableHubPush, fetchPrivate, subscribeDevice } from "./hubApi";
import { getDeviceId, isMobileDevice, DriverPcBlock } from "./hubDevice";
import { applyHubLists } from "./hubConstants";
import HubWallet, { wonFull } from "./HubWallet";
import { useHubLocationShare } from "./hubLiveShare";
import HubOrderCard, { HubOrderRow } from "./HubOrderCard";
import HubOrderDetail from "./HubOrderDetail";
import HubPostForm from "./HubPostForm";
import HubAdmin from "./HubAdmin";
import HubPlaces from "./HubPlaces";
import { kpAlert } from "../../../src/kpDialog"; // 브라우저 기본 알림창 대신 프로그램 디자인 알림창

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } };
const DEFAULT_F = { from: [], to: [], vehicle: "", ton: "", day: "", urgent: false, fav: false, sort: "new" };
const TON_RANGES = [["", "전체 톤수"], ["s", "1.4톤 이하", 0, 1.4], ["m", "2.5~3.5톤", 2.5, 3.5], ["l", "5톤(축)", 4.5, 6], ["xl", "8~11톤", 8, 11], ["xxl", "14톤 이상", 14, 99]];
const TAB_ALIAS = { wallet: "my", me: "my" };

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
  if (o.showAt && o.showAt > Date.now()) return false;
  if (a.regions?.length && !a.regions.includes(o.상차시도)) return false;
  if (a.vehicles?.length && !a.vehicles.some((v) => String(o.차량종류 || "").includes(v))) return false;
  const t = o.톤수값 || tonValue(o.차량톤수);
  if (a.tonMin && t < Number(a.tonMin)) return false;
  if (a.tonMax && t > Number(a.tonMax)) return false;
  if (a.minFare && (Number(o.운임) || 0) < Number(a.minFare) * 10000) return false;
  return true;
}
// 보드 지역 키 — 시·도만이면 "경기", 시·군·구까지면 "경기 화성시"
const keyOf = (r, level = "sgg") => (r?.sido ? (level === "sido" || !r.sigungu ? r.sido : `${r.sido} ${r.sigungu}`) : "");

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
          <div className="text-[28px] font-extrabold mt-1 tracking-[-0.02em]">{pending ? "서류를 확인하고 있어요" : rejected ? "가입 신청이 반려됐어요" : "이용이 멈춘 계정이에요"}</div>
          <div className="text-[15.5px] text-white/65 mt-2 leading-relaxed">{pending ? "보통 하루 안에 승인돼요." : m.rejectReason ? `사유: ${m.rejectReason}` : "고객센터로 연락해 주세요."}</div>
        </div>
      </div>
      <div className="max-w-[560px] mx-auto px-4 -mt-9 space-y-3 pb-10">
        <Card className="p-5">
          <ol className="space-y-3">
            {[["신청서 제출", true], ["서류 확인", !pending], [rejected ? "반려" : m.status === "suspended" ? "정지" : "승인", false]].map(([t, done], i) => (
              <li key={t} className="flex items-center gap-3"><span className={`w-9 h-9 rounded-full inline-flex items-center justify-center text-[15px] font-extrabold ${done ? "bg-[#2D4C82] text-white" : i === 1 && pending ? "bg-[#0F1A30] text-[#8FB0F0] animate-pulse" : "bg-[#EEF2F8] text-[#5F6E87]"}`}>{done ? <HI name="check" size={17} /> : i + 1}</span><span className="text-[16px] font-bold text-[#0F1A30]">{t}</span></li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2">제출한 정보</div>
          <div className="text-[15.5px] text-[#3A4A66] leading-relaxed">{m.name}, {m.phone}<br />{m.companyName}{m.vehicle ? `, ${m.vehicle.plate} ${m.vehicle.ton} ${m.vehicle.type}` : ""}<br />서류 {docs.length}개: {docs.map((k) => DOC_TYPES[k]).join(", ")}</div>
        </Card>
        {(pending || rejected) && m.source === "signup" && <Btn size="xl" className="w-full" onClick={() => nav("/signup?edit=1")} data-testid="gate-edit">{rejected ? "고쳐서 다시 신청하기" : "신청서 고치기"}</Btn>}
      </div>
    </div>
  );
}

// ── 오더 설정(차주 · 운송사) — 내 위치 지역(GPS 자동 · 직접 고르기) + 상차 지역 3곳
function BoardSettings({ me, auto, onClose, toast }) {
  const cur = me.prefs?.board || {};
  const [my, setMy] = useState(cur.my || auto || { sido: "", sigungu: "" });
  const [manual, setManual] = useState(!!cur.my);
  const [level, setLevel] = useState(cur.level || "sgg");
  const [extra, setExtra] = useState(() => [0, 1, 2].map((i) => cur.extra?.[i] || { sido: "", sigungu: "" }));
  const setEx = (i, k, v) => setExtra((p) => p.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === "sido" ? { sigungu: "" } : {}) } : r)));
  const save = () => {
    const board = { my: manual && my.sido ? my : null, level, extra: extra.filter((r) => r.sido) };
    updatePrefs(me.uid, { ...(me.prefs || {}), board }).then(() => { toast?.("오더 설정을 저장했어요"); onClose(); }).catch(() => toast?.("저장하지 못했어요"));
  };
  const RegionPick = ({ v, onSido, onSgg, testid, disabled }) => (
    <div className="grid grid-cols-2 gap-2">
      <select className={selectCls} value={v.sido} disabled={disabled} onChange={(e) => onSido(e.target.value)} data-testid={`${testid}-sido`}><option value="">시·도</option>{SIDO_LIST.map((s) => <option key={s}>{s}</option>)}</select>
      <select className={selectCls} value={v.sigungu} disabled={disabled || !v.sido} onChange={(e) => onSgg(e.target.value)} data-testid={`${testid}-sgg`}><option value="">전체</option>{sigunguOf(v.sido).map((s) => <option key={s}>{s}</option>)}</select>
    </div>
  );
  return (
    <Drawer onClose={onClose} title="오더 설정" sub="이 지역에서 상차하는 오더만 보여요" testid="board-settings">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2"><HI name="gps" size={18} className="text-[#2D4C82]" /><span className="text-[16px] font-extrabold text-[#0F1A30]">내 위치</span><span className="ml-auto text-[14px] font-bold text-[#55657F]" data-testid="bs-auto">{auto ? `${auto.sido} ${auto.sigungu || ""}` : "위치를 찾고 있어요"}</span></div>
          <Seg value={manual ? "manual" : "gps"} onChange={(v) => { setManual(v === "manual"); if (v === "gps" && auto) setMy(auto); }} options={[["gps", "자동(GPS)"], ["manual", "직접 고르기"]]} />
          <RegionPick v={manual ? my : auto || my} disabled={!manual} onSido={(s) => setMy({ sido: s, sigungu: "" })} onSgg={(g) => setMy((p) => ({ ...p, sigungu: g }))} testid="bs-my" />
          <Field label="범위"><Seg value={level} onChange={setLevel} options={[["sgg", "시·군·구"], ["sido", "시·도 전체"]]} /></Field>
        </Card>
        <Card className="p-4 space-y-3">
          <div className="text-[16px] font-extrabold text-[#0F1A30]">상차 지역 더 보기 <span className="text-[14px] font-bold text-[#5F6E87]">최대 3곳</span></div>
          {extra.map((r, i) => <RegionPick key={i} v={r} onSido={(s) => setEx(i, "sido", s)} onSgg={(g) => setEx(i, "sigungu", g)} testid={`bs-ex${i}`} />)}
        </Card>
      </div>
      <div className="p-4 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]"><Btn size="xl" className="w-full" onClick={save} data-testid="bs-save">저장</Btn></div>
    </Drawer>
  );
}

// ── 등록내역(24시콜 등록내역 구조 참고) — 기간 · 단계 · 결제 · 화물번호/차주전화 검색 · 내꺼보기
const PST = [["all", "전체"], ["open", "접수"], ["done", "배차완료"], ["cancelled", "화물취소"]];
const PPAY = [["all", "전체"], ["card", "카드"], ["deposit", "인수증"], ["cash", "선착불"]];
const ppayOf = (m) => (m === "카드" ? "card" : payKind(m));
function PostsView({ me, posts, openOrder, onPost }) {
  const [from, setFrom] = useState(kstYmd(-30));
  const [to, setTo] = useState(kstYmd(1));
  const [st, setSt] = useState(["all"]);
  const [pay, setPay] = useState(["all"]);
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(true);
  const [co, setCo] = useState([]);
  const [phones, setPhones] = useState({});
  useEffect(() => (mine ? undefined : subscribeCompanyPosts(me, setCo)), [mine, me.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = mine ? posts : co;
  const digits = q.replace(/[^\d]/g, "");
  useEffect(() => {
    if (digits.length < 4) return;
    src.filter((o) => o.takerUid && o.posterUid === me.uid && phones[o.id] === undefined).slice(0, 80).forEach((o) => fetchPrivate(o.id, "match").then((m) => setPhones((p) => ({ ...p, [o.id]: m?.phone || "" }))));
  }, [digits.length >= 4, src.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const tog = (arr, setArr, k) => setArr(k === "all" ? ["all"] : ((x) => (x.length ? x : ["all"]))([...arr.filter((v) => v !== "all" && v !== k), ...(arr.includes(k) ? [] : [k])]));
  const rows = useMemo(() => src.filter((o) => {
    const day = tsMs(o.createdAt) ? new Date(tsMs(o.createdAt) + 9 * 3600e3).toISOString().slice(0, 10) : o.상차일 || "";
    if (from && day < from) return false;
    if (to && day > to) return false;
    const sg = stageOf(o);
    if (!st.includes("all") && !st.some((k) => (k === "open" ? sg === "open" : k === "cancelled" ? sg === "cancelled" : !["open", "cancelled"].includes(sg)))) return false;
    if (!pay.includes("all") && !pay.includes(ppayOf(o.지급방식))) return false;
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      const hit = o.id.toLowerCase().includes(k) || (digits.length >= 4 && String(phones[o.id] || "").replace(/[^\d]/g, "").includes(digits));
      if (!hit) return false;
    }
    return true;
  }), [src, from, to, st, pay, q, phones, digits]);
  const Box = ({ on, onClick, children, testid }) => <button type="button" onClick={onClick} aria-pressed={on} data-testid={testid} className={`h-10 px-3 rounded-xl text-[14.5px] font-bold inline-flex items-center gap-1.5 ${on ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] ring-1 ring-inset ring-[#D6DEEA]"}`}><span className={`w-4 h-4 rounded-[5px] inline-flex items-center justify-center ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "ring-1 ring-inset ring-[#C7D3E8]"}`}>{on && <HI name="check" size={11} stroke={3} />}</span>{children}</button>;
  return (
    <div className="space-y-3 max-w-[1100px]" data-testid="list-posts">
      <Card className="p-4 space-y-3" data-testid="posts-filter">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="pv-from" /><span className="text-[#5F6E87] font-bold">~</span><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} data-testid="pv-to" /></div>
        <div className="flex flex-wrap gap-1.5 items-center"><span className="w-10 text-[14px] font-bold text-[#5F6E87]">상태</span>{PST.map(([k, l]) => <Box key={k} on={st.includes(k)} onClick={() => tog(st, setSt, k)} testid={`pv-st-${k}`}>{l}</Box>)}</div>
        <div className="flex flex-wrap gap-1.5 items-center"><span className="w-10 text-[14px] font-bold text-[#5F6E87]">결제</span>{PPAY.map(([k, l]) => <Box key={k} on={pay.includes(k)} onClick={() => tog(pay, setPay, k)} testid={`pv-pay-${k}`}>{l}</Box>)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="relative"><HI name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5F6E87]" /><input className={`${inputCls} pl-10`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="화물번호 또는 차주 전화" data-testid="pv-q" /></div>
          <Box on={mine} onClick={() => setMine((v) => !v)} testid="pv-mine">내꺼보기</Box>
        </div>
      </Card>
      <div className="flex items-center px-1"><span className="text-[14.5px] font-bold text-[#55657F]">{rows.length}건</span>{onPost && <Btn size="md" className="ml-auto hidden lg:inline-flex" onClick={onPost}><HI name="plus" size={16} />화물등록</Btn>}</div>
      {rows.length === 0 ? <Empty icon="list" title="등록한 화물이 없어요" /> : <div className="space-y-2" data-testid="posts-rows">{rows.map((o) => <HubOrderRow key={o.id} o={o} onOpen={() => openOrder(o)} takerPhone={digits.length >= 4 ? phones[o.id] : ""} />)}</div>}
    </div>
  );
}

export default function HubApp() {
  const [authUser, setAuthUser] = useState(undefined);
  const [me, setMe] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [cfg, setCfg] = useState({});
  const [wallet, setWallet] = useState(null);
  const [anns, setAnns] = useState([]);
  const [board, setBoard] = useState([]);
  const [posts, setPosts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [notices, setNotices] = useState([]);
  const [fresh, setFresh] = useState(() => new Set());
  const [tab, setTab] = useState(() => { const t = readLS("hubTab", "board"); return TAB_ALIAS[t] || t; });
  const [f, setF] = useState(() => ({ ...DEFAULT_F, ...readLS("hubBoardF", {}) }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [boardSet, setBoardSet] = useState(false);
  const [form, setForm] = useState(null); // { editing? }
  const [myPos, setMyPos] = useState(null);
  const [gpsRegion, setGpsRegion] = useState(() => readLS("hubGpsRegion", null));
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
    getDoc(doc(db, "users", authUser.uid)).then((s) => setIsAdmin(authUser.email === TOTAL_MASTER_EMAIL || (s.exists() && s.data().role === "totalMaster"))).catch(() => setIsAdmin(authUser.email === TOTAL_MASTER_EMAIL)).finally(() => setAdminChecked(true));
    return subscribeMember(authUser.uid, (m) => setMe(m ? { ...m, uid: authUser.uid } : null));
  }, [authUser]);
  // 한 계정 한 기기 — 다른 기기에서 로그인하면 여기서 로그아웃
  useEffect(() => {
    if (!me?.activeSession) return;
    const mine = localSession();
    if (mine && me.activeSession !== mine) { signOut(auth).then(() => { kpAlert("다른 기기에서 로그인해서 이 기기는 로그아웃했어요.", { title: "로그아웃했어요" }); nav("/login", { replace: true }); }); }
  }, [me?.activeSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⭐ 2026-11-07 허브 가입 차주는 등록 휴대폰에서만 — 앱이 켜질 때(로그인 유지 상태 포함) · 다른 휴대폰으로 옮겨질 때 확인
  const devCheck = !!me && me.role === "driver" && me.source === "signup";
  const [devOk, setDevOk] = useState(undefined);
  useEffect(() => {
    if (!devCheck || !authUser) { setDevOk(undefined); return undefined; }
    let alive = true, unsub = () => {};
    getDeviceId().then((mine) => {
      if (!alive) return;
      unsub = subscribeDevice(authUser.uid, (d) => {
        if (d === undefined) return; // 읽기 실패(잠깐 끊김)는 그대로 둔다
        if (d?.id && d.id === mine) { setDevOk(true); return; }
        setDevOk(false);
        try { sessionStorage.setItem("hubLoginNotice", d?.id ? "다른 휴대폰에서 로그인해서 이 휴대폰은 로그아웃했어요" : "본인 휴대폰 확인이 필요해요. 다시 로그인해 주세요"); } catch { /* 무시 */ }
        signOut(auth).then(() => nav("/login?role=driver&mode=hub", { replace: true }));
      });
    });
    return () => { alive = false; unsub(); };
  }, [devCheck, authUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const approved = me?.status === "approved";
  const takerish = !!me && approved && (me.role === "driver" || me.role === "carrier");
  useEffect(() => { if (!authUser) return undefined; return subscribeHubConfig((c) => { applyHubLists(c?.lists); setCfg(c || {}); }); }, [authUser]);
  useEffect(() => { if (!approved) return undefined; return subscribeWallet(me.uid, setWallet); }, [approved, me?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved && !isAdmin) return undefined; return subscribeAnnouncements(setAnns); }, [approved, isAdmin]);
  // 내 위치 지역(GPS) — 오더 보드 기본 지역
  useEffect(() => {
    if (!takerish || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const r = nearestRegion(p.coords.latitude, p.coords.longitude);
      if (r) { const v = { sido: r.sido, sigungu: r.sigungu || "" }; setGpsRegion(v); writeLS("hubGpsRegion", v); setMyPos({ ...r, ll: [p.coords.latitude, p.coords.longitude] }); }
    }, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  }, [takerish]);
  const bset = me?.prefs?.board || {};
  const myRegion = bset.my || gpsRegion || (me?.home?.sido ? { sido: me.home.sido, sigungu: me.home.sigungu || "" } : null);
  const boardKeys = useMemo(() => {
    if (!takerish) return null;
    const ks = [keyOf(myRegion, bset.level), ...(bset.extra || []).map((r) => keyOf(r))].filter(Boolean);
    return ks.length ? [...new Set(ks)] : null;
  }, [takerish, myRegion?.sido, myRegion?.sigungu, bset.level, JSON.stringify(bset.extra || [])]); // eslint-disable-line react-hooks/exhaustive-deps
  const keysStr = boardKeys ? boardKeys.join("|") : "";
  const onAdded = useCallback((o) => {
    const m = meRef.current;
    if (!m) return;
    setFresh((p) => new Set(p).add(o.id));
    const a = m.prefs?.alert;
    if (alertMatches(o, a, m)) {
      beep();
      try { navigator.vibrate?.([220, 120, 220]); } catch { /* 무시 */ }
      if (a.tts) speak(speakText(o));
      toast(`새 콜 ${routeText(o)} ${manwon(o.운임)}`, 4000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved) return; return subscribeBoard((rows) => { setBoard(rows); setLastSync(Date.now()); }, onAdded, boardKeys); }, [approved, onAdded, keysStr]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved || !canPost(me)) return; return subscribeMine(me.uid, "posterUid", setPosts); }, [approved, me?.uid, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved || !(me.role === "driver" || me.role === "carrier")) return; return subscribeMine(me.uid, "takerUid", setJobs); }, [approved, me?.uid, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!approved) return; return subscribeNotices(me.uid, setNotices); }, [approved, me?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => writeLS("hubBoardF", f), [f]);
  useEffect(() => writeLS("hubTab", tab), [tab]);
  useEffect(() => { if (loc.pathname === "/admin") setTab("admin"); }, [loc.pathname]);

  const doRefresh = async () => {
    setRefreshing(true);
    try { const rows = await refreshBoard(boardKeys); setBoard(rows); setLastSync(Date.now()); toast(`모집중 ${rows.length}건`); } catch { toast("새로고침하지 못했어요"); }
    finally { setRefreshing(false); setPull(0); }
  };
  const touch = useRef(null);
  const onTouchStart = (e) => { touch.current = window.scrollY <= 0 ? e.touches[0].clientY : null; };
  const onTouchMove = (e) => { if (touch.current == null) return; const d = e.touches[0].clientY - touch.current; setPull(d > 0 ? Math.min(110, d * 0.55) : 0); };
  const onTouchEnd = () => { if (pull > 64 && !refreshing) doRefresh(); else setPull(0); touch.current = null; };

  const favorites = me?.prefs?.favorites || [];
  const favSet = useMemo(() => new Set(favorites.map((x) => x.uid)), [favorites]);
  const activeJob = jobs.find((j) => ACTIVE.includes(j.status));
  const liveShare = useHubLocationShare(approved ? me : null, jobs);

  const filtered = useMemo(() => {
    const today = kstYmd(), tom = kstYmd(1);
    const rng = TON_RANGES.find((r) => r[0] === f.ton);
    const now = Date.now();
    const list = board.filter((o) => {
      if (o.showAt && o.showAt > now && o.posterUid !== me?.uid) return false; // 차주앱 표시 예약
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
  }, [board, f, favSet, myPos, me?.uid]);

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
  if (me === null && !adminChecked) return <Loading />;
  if (me === null && isAdmin) return <AdminOnly admin={{ uid: authUser.uid, email: authUser.email }} cfg={cfg} logout={logout} />;
  if (me === null) return <Navigate to="/signup" replace />;
  // 차주 화면은 휴대폰에서만(화주 · 운송사는 PC도)
  if (me.role === "driver" && !isMobileDevice()) return <DriverPcBlock onLogout={logout} />;
  if (devCheck && devOk !== true) return <Loading />;
  if (!approved) return <Gate m={me} logout={logout} />;

  const poster = canPost(me);
  const taker = canTake(me);
  const linked = isLinked(me);
  const unread = notices.filter((n) => !n.read).length;
  const activeJobs = jobs.filter((j) => ACTIVE.includes(j.status)).length;
  const postsWaiting = posts.filter((p) => p.status === "assigned").length;
  const TABS = [
    ["board", "오더", "board", 0],
    ...(takerish ? [["jobs", "내 배차", "truck", activeJobs]] : []),
    ...(poster ? [["posts", "등록내역", "list", postsWaiting]] : []),
    ...(poster && !linked ? [["places", "고객관리", "pin", 0]] : []),
    ["my", "마이페이지", "user", 0],
    ["notices", "알림", "bell", unread],
    ...(isAdmin ? [["admin", "관리자", "shield", 0]] : []),
  ];
  const MTABS = TABS.filter(([k]) => k !== "notices" && k !== "admin").slice(0, 5);
  const go = (k) => { setTab(k); if (openId || loc.pathname === "/admin") nav("/"); window.scrollTo({ top: 0 }); };
  const openOrder = (o) => nav(`/order/${o.id}`);
  const closeOrder = () => nav(tab === "admin" ? "/admin" : "/");
  const setFilter = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleIn = (k, v) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const askNear = () => {
    if (!navigator.geolocation) { toast("이 기기는 위치를 쓸 수 없어요"); return; }
    navigator.geolocation.getCurrentPosition((p) => { const r = nearestRegion(p.coords.latitude, p.coords.longitude); setMyPos({ ...r, ll: [p.coords.latitude, p.coords.longitude] }); setFilter("sort", "near"); toast(`${r.sido} ${r.sigungu || ""} 가까운 순`); },
      () => toast("위치 권한을 켜면 가까운 순으로 보여 드려요"), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  };
  const activeN = f.from.length + f.to.length + (f.vehicle ? 1 : 0) + (f.ton ? 1 : 0) + (f.day ? 1 : 0) + (f.urgent ? 1 : 0) + (f.fav ? 1 : 0);
  const alertOn = !!me.prefs?.alert?.on;
  const regionLabel = boardKeys ? boardKeys.join(", ") : "전국";

  const FilterBody = (
    <div className="space-y-5">
      <div>
        <div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">하차 지역</div>
        <div className="flex flex-wrap gap-1.5">{SIDO_LIST.map((s) => <Chip key={s} on={f.to.includes(s)} onClick={() => toggleIn("to", s)} className="h-10 px-3.5">{s}</Chip>)}</div>
      </div>
      {!takerish && (
        <div>
          <div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">상차 지역</div>
          <div className="flex flex-wrap gap-1.5">{SIDO_LIST.map((s) => <Chip key={s} on={f.from.includes(s)} onClick={() => toggleIn("from", s)} className="h-10 px-3.5" data-testid={`f-from-${s}`}>{s}</Chip>)}</div>
        </div>
      )}
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
      <Btn kind="ghost" size="md" className="w-full" onClick={() => setF({ ...DEFAULT_F, sort: f.sort })}>초기화</Btn>
    </div>
  );

  const RegionBar = takerish && (
    <button type="button" onClick={() => setBoardSet(true)} className="w-full rounded-2xl bg-white ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 flex items-center gap-2.5 text-left" data-testid="region-bar">
      <span className="w-9 h-9 rounded-xl bg-[#0F1A30] text-[#8FB0F0] inline-flex items-center justify-center shrink-0"><HI name="gps" size={17} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-bold text-[#5F6E87]">상차 지역</span><span className="block text-[15.5px] font-extrabold text-[#0F1A30] truncate" data-testid="region-keys">{regionLabel}</span></span>
      <span className="h-9 px-3 rounded-xl bg-[#EAF0FA] text-[14px] font-bold text-[#1B2B4B] inline-flex items-center shrink-0" data-testid="btn-board-settings">오더 설정</span>
    </button>
  );

  const SortBar = (
    <div className="flex items-center gap-2 overflow-x-auto hub-scroll -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
      <button type="button" onClick={() => setFilterOpen(true)} className="lg:hidden h-11 px-4 rounded-full bg-[#0F1A30] text-white text-[15px] font-bold inline-flex items-center gap-1.5 shrink-0" data-testid="btn-filter"><HI name="sliders" size={16} />필터{activeN ? ` ${activeN}` : ""}</button>
      {[["new", "최신순"], ["fare", "운임 높은순"], ["perkm", "km당 운임"], ["time", "상차 빠른순"]].map(([k, l]) => <Chip key={k} on={f.sort === k} onClick={() => setFilter("sort", k)}>{l}</Chip>)}
      <Chip on={f.sort === "near"} onClick={askNear} data-testid="btn-near"><HI name="gps" size={15} />가까운 순</Chip>
    </div>
  );

  const urgentN = filtered.filter(({ o }) => o.긴급).length;
  const shownAnns = anns.filter((a) => a.active !== false && a.pinned);
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
          {shownAnns.length > 0 && (
            <div className="space-y-2" data-testid="announce-banner">
              {shownAnns.slice(0, 2).map((a) => (
                <div key={a.id} className="rounded-[20px] px-4 py-3 text-white flex gap-3 items-start" style={NAVY_BG}>
                  <HI name="megaphone" size={19} className="text-[#8FB0F0] shrink-0 mt-0.5" />
                  <div className="min-w-0"><div className="text-[15.5px] font-extrabold">{a.title}</div>{a.body && <div className="text-[14px] text-white/70 leading-snug whitespace-pre-line line-clamp-2">{a.body}</div>}</div>
                </div>
              ))}
            </div>
          )}
          {liveShare?.job && (
            <button type="button" onClick={() => openOrder(liveShare.job)} className="w-full rounded-2xl bg-white ring-1 ring-inset ring-[#DCE3EE] px-4 py-3 flex items-center gap-2.5 text-left" data-testid="live-share-bar">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${liveShare.on ? "bg-[#34D399] animate-pulse" : "bg-[#A3AEC0]"}`} />
              <span className="text-[14.5px] font-bold text-[#1B2B4B] truncate">{liveShare.denied ? "위치 권한을 켜 주세요" : `운송중 ${routeText(liveShare.job)}`}</span>
              <HI name="chevron" size={18} className="ml-auto text-[#5F6E87] shrink-0" />
            </button>
          )}
          {RegionBar}
          <div className="grid grid-cols-3 gap-2.5">
            {[["모집중", filtered.length, "건"], ["긴급", urgentN, "건"], [takerish ? "내 배차" : "내 화물 배차", takerish ? activeJobs : postsWaiting, "건"]].map(([l, v, u]) => (
              <div key={l} className="rounded-[18px] lg:rounded-[20px] bg-white ring-1 ring-inset ring-[#E2E7EF] px-3.5 py-2.5 lg:px-4 lg:py-3">
                <div className="text-[13.5px] lg:text-[14px] font-bold text-[#5F6E87] truncate">{l}</div>
                <div className="flex items-baseline gap-1 mt-0.5"><span className="text-[22px] lg:text-[26px] font-extrabold text-[#0F1A30] leading-none" style={NUMS} data-testid={l === "모집중" ? "stat-open" : undefined}>{v}</span><span className="text-[14px] font-bold text-[#66758E]">{u}</span></div>
              </div>
            ))}
          </div>
          {SortBar}
          {takerish && returns.length > 0 && (
            <Card className="p-4" data-testid="return-trips">
              <div className="flex items-center gap-2 mb-3"><span className="w-9 h-9 rounded-xl bg-[#0F1A30] text-[#8FB0F0] inline-flex items-center justify-center"><HI name="return" size={18} /></span><div className="min-w-0"><div className="text-[16px] font-extrabold text-[#0F1A30]">귀로 추천</div><div className="text-[14px] text-[#5F6E87] truncate">{activeJob.하차시도} {activeJob.하차시군구} 하차 뒤 실을 수 있어요</div></div></div>
              <div className="flex gap-2.5 overflow-x-auto hub-scroll -mx-1 px-1 pb-1">
                {returns.map((o) => (
                  <button key={o.id} type="button" onClick={() => openOrder(o)} className="shrink-0 w-[230px] text-left rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] p-3.5 hover:ring-[#2D4C82]">
                    <div className="text-[15.5px] font-extrabold text-[#0F1A30] truncate">{o.상차시군구 || o.상차시도} → {o.하차시도} {o.하차시군구}</div>
                    <div className="text-[14px] text-[#55657F] mt-0.5 truncate">{o.차량톤수} {o.차량종류} {o.상차일 === kstYmd() ? "오늘" : o.상차일}</div>
                    <div className="text-[19px] font-extrabold text-[#1B2B4B] mt-1.5" style={NUMS}>{manwon(o.운임)}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {filtered.length === 0
            ? <Empty icon="board" title={board.length ? "조건에 맞는 오더가 없어요" : takerish ? "이 지역에 모집중인 오더가 없어요" : "모집중인 오더가 없어요"} desc={takerish ? "오더 설정에서 상차 지역을 더해 보세요" : "새 오더가 올라오면 바로 보여요"} action={takerish ? <Btn kind="ghost" onClick={() => setBoardSet(true)}>오더 설정</Btn> : activeN ? <Btn kind="ghost" onClick={() => setF({ ...DEFAULT_F })}>필터 초기화</Btn> : null} />
            : <div className="grid xl:grid-cols-2 gap-3.5" data-testid="board-list">{filtered.map(({ o, near }) => <HubOrderCard key={o.id} o={o} onOpen={() => openOrder(o)} mine={o.posterUid === me.uid} fav={favSet.has(o.posterUid)} fresh={fresh.has(o.id)} extraKm={f.sort === "near" ? near : 0} />)}</div>}
        </div>
      </div>
    </div>
  );

  const JobsView = () => {
    const groups = [["운송중", jobs.filter((o) => ACTIVE.includes(o.status))], ["운송완료", jobs.filter((o) => o.status === "delivered")], ["취소", jobs.filter((o) => o.status === "cancelled")]];
    if (!jobs.length) return <Empty icon="truck" title="배차받은 오더가 없어요" desc="오더에서 배차신청을 눌러 보세요" />;
    return (
      <div className="space-y-6" data-testid="list-jobs">
        {groups.filter(([, g]) => g.length).map(([t, g]) => (
          <section key={t}>
            <div className="text-[16px] font-extrabold text-[#0F1A30] mb-2.5">{t} <span className="text-[#5F6E87]">{g.length}</span></div>
            <div className="grid xl:grid-cols-2 gap-3.5">{g.map((o) => <HubOrderCard key={o.id} o={o} onOpen={() => openOrder(o)} compact />)}</div>
          </section>
        ))}
      </div>
    );
  };

  const NoticesView = (
    <Card className="overflow-hidden" data-testid="notices">
      {notices.length === 0 ? <div className="p-10 text-center text-[15.5px] text-[#5F6E87]">새 알림이 없어요</div> : notices.map((n) => (
        <button key={n.id} type="button" onClick={() => { markRead(n.id); if (n.orderId) nav(`/order/${n.orderId}`); }} className={`w-full text-left px-5 py-4 flex gap-3.5 border-b border-[#EEF1F6] last:border-0 ${n.read ? "" : "bg-[#F3F7FE]"}`}>
          <span className={`w-11 h-11 rounded-2xl inline-flex items-center justify-center shrink-0 ${n.read ? "bg-[#F2F5FA] text-[#5F6E87]" : "bg-[#0F1A30] text-[#8FB0F0]"}`}><HI name={{ assigned: "bolt", confirmed: "check", quickCancel: "clock", released: "alert", cancelled: "close", delivered: "flag", pod: "file", invoice: "receipt", settle: "won", wallet: "wallet", return: "return" }[n.type] || "bell"} size={19} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-extrabold text-[#0F1A30]">{n.title}</span><span className="block text-[15px] text-[#55657F] leading-snug mt-0.5">{n.body}</span></span>
          <span className="text-[13.5px] text-[#5F6E87] shrink-0">{ago(n.createdAt)}</span>
        </button>
      ))}
    </Card>
  );

  const titles = { board: "실시간 오더", jobs: "내 배차", posts: "등록내역", places: "고객관리", my: "마이페이지", notices: "알림", admin: "허브 관리자" };
  let body = null;
  if (tab === "board") body = BoardView;
  else if (tab === "jobs" && takerish) body = <JobsView />;
  else if (tab === "posts" && poster) body = <PostsView me={me} posts={posts} openOrder={openOrder} onPost={() => setForm({})} />;
  else if (tab === "places" && poster && !linked) body = <HubPlaces me={me} toast={toast} />;
  else if (tab === "notices") body = NoticesView;
  else if (tab === "my") body = (
    <HubWallet me={me} cfg={cfg} toast={toast} jobs={jobs} posts={posts} notices={notices} openOrder={openOrder} logout={logout} isAdmin={isAdmin}>
      <div className="mt-3 space-y-2">
        <PushCard me={me} toast={toast} />
        {takerish && <AlertCard me={me} onOpen={() => setAlertOpen(true)} light />}
        {me.source === "logisweb-staff" && <a href="/exchange" className="h-12 px-4 rounded-2xl bg-[#F5F7FB] flex items-center gap-2 text-[16px] font-bold text-[#1B2B4B]"><HI name="swap" size={18} />운송사 거래소<HI name="chevron" size={18} className="ml-auto" /></a>}
      </div>
    </HubWallet>
  );
  else if (tab === "admin" && isAdmin) body = <HubAdmin admin={{ uid: me.uid, email: authUser.email }} me={me} cfg={cfg} toast={toast} />;
  else body = BoardView;

  const editOrder = async (o) => { const detail = await fetchPrivate(o.id, "detail"); setForm({ editing: { id: o.id, pub: o, detail } }); };
  const Balance = ({ dark }) => (
    <button type="button" onClick={() => go("my")} data-testid={dark ? "balance-m" : "balance"} className={`h-11 px-3 rounded-2xl inline-flex items-center gap-1.5 shrink-0 ${dark ? "bg-white/10 text-white" : "bg-white ring-1 ring-inset ring-[#E2E7EF] text-[#0F1A30]"}`}>
      <span className={`text-[13px] font-bold ${dark ? "text-white/60" : "text-[#5F6E87]"}`}>잔액</span><span className="text-[15px] font-extrabold" style={NUMS}>{wonFull(wallet?.available)}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#EEF1F6] lg:pl-[272px]">
      <style>{HUB_CSS}</style>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[272px] flex-col text-white z-40" style={NAVY_BG}>
        <div className="px-5 h-[76px] flex items-center"><HubMark size={38} /></div>
        {poster && <div className="px-4"><Btn kind="accent" size="lg" className="w-full" onClick={() => setForm({})} data-testid="btn-post"><HI name="plus" size={19} />화물등록</Btn></div>}
        <nav className="mt-4 px-3 space-y-1 flex-1">
          {TABS.map(([k, l, ic, n]) => (
            <button key={k} type="button" onClick={() => go(k)} data-testid={`nav-${k}`} aria-current={tab === k ? "page" : undefined}
              className={`w-full h-12 px-3.5 rounded-2xl flex items-center gap-3 text-[16px] font-bold transition ${tab === k ? "bg-white text-[#0F1A30]" : "text-white/75 hover:bg-white/[0.08] hover:text-white"}`}>
              <HI name={ic} size={19} className={tab === k ? "text-[#2D4C82]" : "text-[#8FB0F0]"} />{l}
              {n > 0 && <span className={`ml-auto min-w-[24px] h-6 px-2 rounded-full text-[13px] font-extrabold inline-flex items-center justify-center ${tab === k ? "bg-[#0F1A30] text-white" : "bg-[#8FB0F0] text-[#0B1428]"}`}>{n}</span>}
            </button>
          ))}
        </nav>
        <div className="m-3 p-3.5 rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 flex items-center gap-3">
          <Avatar path={me.photoPath} name={me.name} size={42} dark />
          <div className="min-w-0 flex-1"><div className="text-[15px] font-extrabold truncate">{me.name}</div><div className="text-[13px] text-white/55 truncate">{ROLES[me.role]?.label} {me.companyName}</div></div>
          <button type="button" onClick={logout} aria-label="로그아웃" className="w-10 h-10 rounded-xl hover:bg-white/10 inline-flex items-center justify-center text-white/70"><HI name="logout" size={18} /></button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-[#EEF1F6]/90 backdrop-blur-md border-b border-[#E2E7EF] lg:bg-[#EEF1F6]/80">
        <div className="lg:hidden text-white px-4 pt-[env(safe-area-inset-top)]" style={NAVY_BG}>
          <div className="h-[60px] flex items-center gap-2">
            <img src="/brand/logisweb-mark-square.svg" alt="" className="w-9 h-9 rounded-[10px]" />
            <div className="min-w-0 flex-1"><div className="text-[18px] font-extrabold leading-tight truncate">{titles[tab]}</div><div className="text-[13px] font-semibold text-white/55 truncate">{ROLES[me.role]?.label} {me.name}</div></div>
            <Balance dark />
            <button type="button" onClick={() => go("notices")} aria-label="알림" data-testid="btn-bell-m" className={`relative w-11 h-11 rounded-2xl inline-flex items-center justify-center shrink-0 ${tab === "notices" ? "bg-[#8FB0F0] text-[#0B1428]" : "bg-white/10"}`}><HI name="bell" size={19} />{unread > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#8FB0F0] text-[#0B1428] text-[13px] font-extrabold inline-flex items-center justify-center" data-testid="bell-count">{unread}</span>}</button>
          </div>
        </div>
        <div className="hidden lg:flex h-[72px] items-center gap-3 px-8">
          <div className="min-w-0"><div className="text-[24px] font-extrabold text-[#0F1A30] tracking-[-0.02em]">{titles[tab]}</div></div>
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white ring-1 ring-inset ring-[#E2E7EF] text-[13.5px] font-bold text-[#1B2B4B]"><span className="w-2 h-2 rounded-full bg-[#2D4C82] animate-pulse" />실시간 {new Date(lastSync).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <div className="ml-auto flex items-center gap-2">
            <Balance />
            {taker && <Btn kind={alertOn ? "primary" : "ghost"} size="md" onClick={() => setAlertOpen(true)} data-testid="btn-alert"><HI name="volume" size={17} />콜 알림 {alertOn ? "켜짐" : "꺼짐"}</Btn>}
            <Btn kind="ghost" size="md" onClick={doRefresh} data-testid="btn-refresh"><HI name="refresh" size={17} className={refreshing ? "animate-spin" : ""} />새로고침</Btn>
            <button type="button" onClick={() => go("notices")} aria-label="알림" className="relative w-11 h-11 rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] inline-flex items-center justify-center text-[#1B2B4B]"><HI name="bell" size={19} />{unread > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#0F1A30] text-white text-[13px] font-extrabold inline-flex items-center justify-center">{unread}</span>}</button>
          </div>
        </div>
      </header>

      <main className="px-4 lg:px-8 py-4 lg:py-6 pb-[calc(110px+env(safe-area-inset-bottom))] lg:pb-10 max-w-[1440px]">{body}</main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E7EF] pb-[env(safe-area-inset-bottom)]">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${MTABS.length}, minmax(0,1fr))` }}>
          {MTABS.map(([k, l, ic, n]) => (
            <button key={k} type="button" onClick={() => go(k)} data-testid={`tab-${k}`} aria-current={tab === k ? "page" : undefined} className={`relative h-[64px] flex flex-col items-center justify-center gap-1 text-[13px] font-bold ${tab === k ? "text-[#0F1A30]" : "text-[#5F6E87]"}`}>
              <span className={`w-12 h-8 rounded-full inline-flex items-center justify-center transition ${tab === k ? "bg-[#0F1A30] text-[#8FB0F0]" : ""}`}><HI name={ic} size={20} /></span>{l}
              {n > 0 && <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2D4C82] text-white text-[13px] font-extrabold inline-flex items-center justify-center">{n}</span>}
            </button>
          ))}
        </div>
      </nav>
      {poster && ["board", "posts"].includes(tab) && (
        <button type="button" onClick={() => setForm({})} data-testid="fab-post" className="lg:hidden fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 h-14 pl-4 pr-5 rounded-full text-white text-[16px] font-extrabold inline-flex items-center gap-2 shadow-[0_16px_36px_rgba(11,20,40,.4)]" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>
          <HI name="plus" size={22} />화물등록
        </button>
      )}

      {filterOpen && <Drawer onClose={() => setFilterOpen(false)} title="필터" sub={`${filtered.length}건`}><div className="flex-1 overflow-y-auto p-4">{FilterBody}</div><div className="p-4 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]"><Btn size="xl" className="w-full" onClick={() => setFilterOpen(false)}>{filtered.length}건 보기</Btn></div></Drawer>}
      {alertOpen && <AlertSettings me={me} onClose={() => setAlertOpen(false)} toast={toast} />}
      {boardSet && <BoardSettings me={me} auto={gpsRegion} onClose={() => setBoardSet(false)} toast={toast} />}
      {openId && <HubOrderDetail key={openId} id={openId} me={me} onClose={closeOrder} toast={toast} favorites={favorites} isAdmin={isAdmin} liveShare={liveShare} onNeedBank={() => { closeOrder(); go("my"); setTimeout(() => document.getElementById("my-bank")?.scrollIntoView({ block: "start" }), 300); }} onEdit={(o) => { closeOrder(); editOrder(o); }} />}
      {form && <HubPostForm me={me} editing={form.editing} cfg={cfg} wallet={wallet} openWallet={() => { setForm(null); go("my"); }} onClose={() => setForm(null)} toast={toast} onDone={() => { if (tab !== "board") setTab("posts"); }} />}
      {toastNode}
    </div>
  );
}

function AlertCard({ me, onOpen, light }) {
  const a = me.prefs?.alert;
  return (
    <button type="button" onClick={onOpen} className={`w-full text-left rounded-[22px] p-4 ${light ? "bg-[#F5F7FB] text-[#0F1A30]" : "text-white"}`} style={light ? undefined : NAVY_BG} data-testid="alert-card">
      <div className="flex items-center gap-2"><HI name="volume" size={18} className={light ? "text-[#2D4C82]" : "text-[#8FB0F0]"} /><span className="text-[16px] font-extrabold">콜 알림</span><Badge tone={a?.on ? "accent" : "line"} className="ml-auto">{a?.on ? "켜짐" : "꺼짐"}</Badge></div>
      <div className={`text-[14.5px] mt-2 leading-relaxed ${light ? "text-[#55657F]" : "text-white/65"}`}>{a?.on ? `${a.regions?.length ? a.regions.join(", ") : "전국"} 상차, ${a.vehicles?.length ? a.vehicles.join(", ") : "모든 차종"}${a.tts ? ", 읽어주기" : ""}` : "내 차에 맞는 새 콜을 소리로 알려 드려요"}</div>
    </button>
  );
}

function AlertSettings({ me, onClose, toast }) {
  const cur = me.prefs?.alert || {};
  const [a, setA] = useState({ on: cur.on ?? false, tts: cur.tts ?? true, regions: cur.regions ?? (me.regions || []), vehicles: cur.vehicles ?? (me.vehicle?.type ? [me.vehicle.type] : []), tonMin: cur.tonMin ?? "", tonMax: cur.tonMax ?? (tonValue(me.vehicle?.ton) || ""), minFare: cur.minFare ?? "" });
  const tog = (k, v) => setA((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const save = () => { unlockAudio(); updatePrefs(me.uid, { ...(me.prefs || {}), alert: a }).then(() => { toast(a.on ? "콜 알림을 켰어요" : "콜 알림을 껐어요"); onClose(); }).catch(() => toast("저장하지 못했어요")); };
  return (
    <Drawer onClose={onClose} title="콜 알림" sub="조건에 맞는 새 오더만 울려요" testid="alert-settings">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <label className="flex items-center gap-3 p-4 rounded-2xl text-white cursor-pointer" style={NAVY_BG}>
          <input type="checkbox" checked={a.on} onChange={(e) => { unlockAudio(); setA((p) => ({ ...p, on: e.target.checked })); }} className="w-6 h-6 accent-[#8FB0F0]" data-testid="alert-on" />
          <span className="text-[17px] font-extrabold">새 콜 알림 받기</span><span className="ml-auto text-[14px] text-white/60">소리와 진동</span>
        </label>
        <label className="flex items-center gap-3 p-4 rounded-2xl bg-white ring-1 ring-inset ring-[#E2E7EF] cursor-pointer">
          <input type="checkbox" checked={a.tts} onChange={(e) => setA((p) => ({ ...p, tts: e.target.checked }))} className="w-5 h-5 accent-[#1B2B4B]" />
          <span className="text-[16px] font-bold text-[#0F1A30]">경로와 운임 읽어주기</span>
          <button type="button" onClick={(e) => { e.preventDefault(); unlockAudio(); beep(); speak("경기 화성시 출발, 부산 강서구 도착. 11톤 윙바디. 운임 68만원."); }} className="ml-auto h-10 px-3 rounded-xl bg-[#EAF0FA] text-[14px] font-bold text-[#1B2B4B]">미리 듣기</button>
        </label>
        <div><div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">상차 지역 <span className="text-[#5F6E87] font-semibold">(비우면 전국)</span></div><div className="flex flex-wrap gap-1.5">{SIDO_LIST.map((s) => <Chip key={s} on={a.regions.includes(s)} onClick={() => tog("regions", s)} className="h-10 px-3.5">{s}</Chip>)}</div></div>
        <div><div className="text-[15px] font-extrabold text-[#0F1A30] mb-2">차종</div><div className="flex flex-wrap gap-1.5">{HUB_VEHICLES.map((s) => <Chip key={s} on={a.vehicles.includes(s)} onClick={() => tog("vehicles", s)} className="h-10 px-3.5">{s}</Chip>)}</div></div>
        <div className="grid grid-cols-3 gap-2.5">
          <Field label="최소 톤"><select className={selectCls} value={a.tonMin} onChange={(e) => setA((p) => ({ ...p, tonMin: e.target.value }))}><option value="">-</option>{HUB_TONS.map((t) => <option key={t} value={tonValue(t)}>{t}</option>)}</select></Field>
          <Field label="최대 톤"><select className={selectCls} value={a.tonMax} onChange={(e) => setA((p) => ({ ...p, tonMax: e.target.value }))}><option value="">-</option>{HUB_TONS.map((t) => <option key={t} value={tonValue(t)}>{t}</option>)}</select></Field>
          <Field label="최소 운임(만원)"><input className={inputCls} inputMode="numeric" value={a.minFare} onChange={(e) => setA((p) => ({ ...p, minFare: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))} placeholder="0" /></Field>
        </div>
      </div>
      <div className="p-4 bg-white border-t border-[#E2E7EF] pb-[max(16px,env(safe-area-inset-bottom))]"><Btn size="xl" className="w-full" onClick={save} data-testid="alert-save">저장</Btn></div>
    </Drawer>
  );
}

function PushCard({ me, toast }) {
  const [on, setOn] = useState(() => pushEnabledHere(me));
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await disableHubPush(me); setOn(false); toast("푸시 알림을 껐어요"); }
      else { await enableHubPush(me); setOn(true); toast("푸시 알림을 켰어요"); }
    } catch (e) { toast(e?.message || "푸시 알림을 켜지 못했어요", 4200); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-[18px] bg-[#F5F7FB] p-3.5 flex items-center gap-3" data-testid="push-card">
      <span className={`w-10 h-10 rounded-2xl inline-flex items-center justify-center shrink-0 ${on ? "bg-[#0F1A30] text-[#8FB0F0]" : "bg-white text-[#55657F]"}`}><HI name="bell" size={18} /></span>
      <div className="min-w-0 flex-1"><div className="text-[15.5px] font-extrabold text-[#0F1A30]">푸시 알림 {on ? "켜짐" : "꺼짐"}</div><div className="text-[13.5px] text-[#55657F]">앱을 닫아도 알려 드려요</div></div>
      <Btn kind={on ? "ghost" : "primary"} size="md" disabled={busy} onClick={toggle} data-testid="push-toggle">{on ? "끄기" : "켜기"}</Btn>
    </div>
  );
}

function AdminOnly({ admin, cfg, logout }) {
  const [toastNode, toast] = useToast();
  return (
    <div className="min-h-screen bg-[#EEF1F6]">
      <style>{HUB_CSS}</style>
      <header className="text-white px-4 lg:px-8 pt-[env(safe-area-inset-top)]" style={NAVY_BG}>
        <div className="h-[64px] max-w-[1440px] flex items-center gap-3"><HubMark size={34} /><span className="text-[16px] font-extrabold text-[#8FB0F0] hidden sm:inline">허브 관리자</span><button type="button" onClick={logout} className="ml-auto h-11 px-4 rounded-2xl bg-white/10 text-[15px] font-bold" data-testid="btn-logout">로그아웃</button></div>
      </header>
      <main className="px-4 lg:px-8 py-4 lg:py-6 max-w-[1440px]"><HubAdmin admin={admin} cfg={cfg} toast={toast} /></main>
      {toastNode}
    </div>
  );
}
