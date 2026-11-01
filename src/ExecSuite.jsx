// ======================= src/ExecSuite.jsx =======================
// 👔 임원 화면(2026-10-31) — 대표·전무·이사(부서 "임원")가 로그인하면 보는 경영 화면. PC·모바일 공용(반응형).
//  · 경영 브리핑(ExecDashboard): 오늘의 한 줄 브리핑 · 이번 달 매출/이익/월말 예상 · 올해 월별 추이 · 나의 결재 대기
//    · 오늘의 현장(오더·미배차) · 오늘의 사람(출근·부재) · 주의 신호(결재 지연·거래처 쏠림·이익률 하락·기사 서류)
//    · 거래처 TOP 5 · 이번 주 부재 일정
//  · 결재함(ExecApprovals): 최종 결재자 화면 — 결재 현황 요약 + 전자결재(결재함·기안함·결재선·인수인계)
//  · 직원 일정(TeamSchedule): 연차·반차·외근·출장·병가·경조사를 달력으로(결재 완료 = 확정, 진행 중 = 점선)
//  매출 통계는 홈과 같은 방식 — 올해 지난 기간 합계(하루 1번 계산·저장, homePastStats v4) + 최근 실시간 오더.
import React from "react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from "recharts";
import { db, DEFAULT_COMPANY } from "./firebase";
import { ShellIcon } from "./AdminShell";
import KpSubNav from "./KpSubNav";
import CustomDatePicker from "./CustomDatePicker";
import ApprovalCenter, { myTurn, useApprovalCounts, useApprovalSettings, setAutoApproveDaily } from "./Approval";
import HandoverCenter, { useHandoverUnread } from "./HandoverCenter";
import { buildPastStats } from "./HomeDeck";
import { pcLiveWindowStart, pcPrevDay } from "./orderHistory";
import { isTMUser } from "./staffFilter";
import { personName } from "./userNames";
import { useCompanyDriverDocs, docProblems } from "./driverRequiredDocs";
import { useFundsSummary, isCeoPosition } from "./FundsBoard";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const GOLD = "#D7BC82";
const ICE = "#8FB0F0";
const toWon = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const kstToday = () => kstNow().toISOString().slice(0, 10);
const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);
const isCancelled = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);
const short = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e10 ? 0 : 1)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n || 0).toLocaleString();
};
const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

// ─────────────────────────── 데이터 ───────────────────────────
function readPastCache(company, liveStart) {
  try {
    const c = JSON.parse(localStorage.getItem("homePastStats") || "null");
    return c && c.v === 4 && c.company === company && c.liveStart === liveStart && c.calYear === new Date().getFullYear() ? c : null;
  } catch { return null; }
}
// 올해 일별 매출·이익·건수 = 지난 기간(하루 1번 계산해 둔 값) + 실시간 오더
export function useYearDays({ company, dispatchData = [], pastCache, liveStart }) {
  const ls = liveStart || pcLiveWindowStart();
  const [past, setPast] = React.useState(() => pastCache || readPastCache(company, ls));
  React.useEffect(() => { if (pastCache) setPast(pastCache); }, [pastCache]);
  React.useEffect(() => {
    if (pastCache || past || !company) return undefined;
    let alive = true;
    const y = new Date().getFullYear();
    Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", `${y}-01-01`), where("상차일", "<=", pcPrevDay(ls))))))
      .then((snaps) => {
        const rows = snaps.flatMap((sn) => sn.docs.map((d) => d.data() || {})).filter((r) => (r.companyName || DEFAULT_COMPANY) === company && r.source !== "transport_transmit" && !isCancelled(r));
        const thisMonth = kstToday().slice(0, 7);
        const sum = rows.reduce((a, r) => ({ year: a.year + toWon(r.청구운임) }), { year: 0 });
        const c = { ...sum, ...buildPastStats(rows, thisMonth), v: 4, company, liveStart: ls, calYear: y, savedAt: Date.now() };
        if (alive) setPast(c);
      })
      .catch(() => { if (alive) setPast({ days: {}, clients: {}, month: "" }); });
    return () => { alive = false; };
  }, [company, ls]); // eslint-disable-line react-hooks/exhaustive-deps
  return React.useMemo(() => {
    const thisMonth = kstToday().slice(0, 7);
    const liveRows = (dispatchData || []).filter((r) => !isCancelled(r) && r.source !== "transport_transmit" && dateOf(r) >= ls);
    const live = buildPastStats(liveRows, thisMonth);
    const days = {};
    Object.entries(past?.days || {}).forEach(([d, v]) => { if (d < ls) days[d] = [...v]; });
    Object.entries(live.days).forEach(([d, v]) => { const e = days[d] || (days[d] = [0, 0, 0]); e[0] += v[0]; e[1] += v[1]; e[2] += v[2]; });
    const clients = {};
    if (past?.month === thisMonth) Object.entries(past.clients || {}).forEach(([k, v]) => { clients[k] = (clients[k] || 0) + v; });
    Object.entries(live.clients).forEach(([k, v]) => { clients[k] = (clients[k] || 0) + v; });
    return { days, clients, ready: !!past };
  }, [past, dispatchData, ls]);
}
function useCompanyQuery(name, company, field = "companyName", extra = null) {
  const [rows, setRows] = React.useState(null);
  const key = extra ? JSON.stringify(extra) : "";
  React.useEffect(() => {
    if (!company) return undefined;
    const cs = [where(field, "==", company)];
    if (extra) Object.entries(extra).forEach(([k, v]) => cs.push(where(k, "==", v)));
    return onSnapshot(query(collection(db, name), ...cs), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [name, company, field, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}
const useApprovalsOf = (company) => useCompanyQuery("approvals", company, "company") || [];
function useStaff(company) {
  const users = useCompanyQuery("users", company) || [];
  return React.useMemo(() => {
    const all = users.filter((u) => (u.companyName || DEFAULT_COMPANY) === company);
    const staff = all.filter((u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u) && u.approved !== false && u.employmentStatus !== "퇴사");
    return { all, staff, drivers: all.filter((u) => u.role === "driver" && u.approved !== false) };
  }, [users, company]);
}

// 결재 문서 → 날짜별 부재 일정
const LEAVE_LABEL = { annual: "연차", half: "반차", early: "조퇴·지각", outside: "외근", trip: "출장", family: "경조사", sick: "병가", holiday: "대체휴무", parental: "육아휴직", maternity: "출산휴가" };
export function eventsOf(a) {
  if (!a || a.cat !== "leave" || !["approved", "pending"].includes(a.status)) return [];
  const d = a.data || {};
  let label = LEAVE_LABEL[a.form];
  if (!label) return [];
  if (a.form === "annual" && d.kind) label = d.kind;
  if (a.form === "half" && d.ampm) label = String(d.ampm).replace(/\s/g, "");
  let from = ""; let to = "";
  if (d.period?.start) { from = d.period.start; to = d.period.end || d.period.start; }
  else if (a.form === "holiday") { from = to = d.offDate || ""; }
  else { from = to = d.date || d.eventDate || ""; }
  if (!from) return [];
  const out = [];
  for (let x = from, i = 0; x <= to && i < 40; x = addDay(x, 1), i += 1) {
    const dow = new Date(`${x}T00:00:00Z`).getUTCDay();
    if ((dow === 0 || dow === 6) && from !== to) continue;
    out.push({ date: x, label, uid: a.drafterUid, name: a.drafter?.name || "", team: a.drafter?.team || "", position: a.drafter?.position || "", status: a.status, id: a.id });
  }
  return out;
}

// ─────────────────────────── 디자인 조각(다크 · 임원) ───────────────────────────
const SHELL_BG = "radial-gradient(1200px 500px at 85% -10%, rgba(110,149,232,.22), transparent 60%), radial-gradient(900px 400px at -10% 110%, rgba(215,188,130,.10), transparent 60%), linear-gradient(160deg,#060C1A 0%,#0B1530 45%,#0E1C3C 100%)";
const GRID = "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/26px 26px";
function Panel({ en, title, right, children, className = "", pad = true }) {
  return (
    <div className={`relative rounded-[22px] border border-white/[0.08] bg-white/[0.035] backdrop-blur-sm overflow-hidden min-w-0 ${className}`}
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.05), 0 20px 40px rgba(0,0,0,.25)" }}>
      {(en || title) && (
        <div className="px-4 md:px-5 pt-4 pb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {en && <div className="text-[11px] font-extrabold tracking-[0.28em] whitespace-nowrap" style={{ fontFamily: MONO, color: ICE }}>{en}</div>}
            {title && <div className="text-[18px] font-black text-white tracking-tight truncate mt-0.5">{title}</div>}
          </div>
          {right}
        </div>
      )}
      <div className={pad ? "px-4 md:px-5 pb-4" : ""}>{children}</div>
    </div>
  );
}
function Delta({ v, suffix = "%", invert = false }) {
  if (v == null || !isFinite(v)) return <span className="text-white/35 text-[13px] font-bold" style={{ fontFamily: MONO }}>—</span>;
  const up = v >= 0; const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[13px] font-black tabular-nums whitespace-nowrap ${good ? "text-[#9FE3C4]" : "text-[#FFB4A8]"}`} style={{ fontFamily: MONO }}>
      {up ? "▲" : "▼"}{Math.abs(v).toFixed(1)}{suffix}
    </span>
  );
}
function Clock() {
  const [t, setT] = React.useState(kstNow());
  React.useEffect(() => { const i = setInterval(() => setT(kstNow()), 1000); return () => clearInterval(i); }, []);
  const p = (n) => String(n).padStart(2, "0");
  return (
    <div className="tabular-nums leading-none text-white" style={{ fontFamily: MONO }}>
      <span className="text-[34px] md:text-[40px] font-black">{p(t.getUTCHours())}<span className="animate-pulse" style={{ color: GOLD }}>:</span>{p(t.getUTCMinutes())}</span>
      <span className="text-[15.5px] md:text-[17px] font-bold text-white/40 ml-1">{p(t.getUTCSeconds())}</span>
    </div>
  );
}
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/15 bg-[#0B1530]/95 px-3 py-2 text-[13.5px] text-white shadow-xl">
      <div className="font-black mb-1" style={{ fontFamily: MONO }}>{label}</div>
      {payload.map((p) => <div key={p.dataKey} className="flex items-center gap-2 tabular-nums"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name} <b style={{ fontFamily: MONO }}>{p.dataKey === "margin" ? `${Number(p.value).toFixed(1)}%` : `${Math.round(p.value).toLocaleString()}원`}</b></div>)}
    </div>
  );
};
function Ring({ value, size = 64, label }) {
  const r = (size - 8) / 2; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(1, value || 0));
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth="6" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={GOLD} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="900" fontFamily={MONO}>{label}</text>
    </svg>
  );
}

// ─────────────────────────── 경영 브리핑 ───────────────────────────
export function ExecDashboard({ company, dispatchData = [], onGo, pastCache, liveStart, me = {} }) {
  const { days, clients, ready } = useYearDays({ company, dispatchData, pastCache, liveStart });
  const isCeo = isCeoPosition(me?.position);
  const apSet = useApprovalSettings(company);
  const autoDaily = apSet.autoApproveDaily === true;
  const F = useFundsSummary(company, isCeo);
  const approvals = useApprovalsOf(company);
  const { staff, drivers } = useStaff(company);
  const today = kstToday();
  const attendance = useCompanyQuery("attendance", company, "companyName", { date: today }) || [];
  const docsBy = useCompanyDriverDocs(company);
  const [range, setRange] = React.useState("year");

  const thisMonth = today.slice(0, 7);
  const dayNo = Number(today.slice(8, 10));
  const prevMonth = (() => { const d = new Date(`${thisMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const dim = new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 0)).getUTCDate();
  const sumWhere = (fn) => Object.entries(days).reduce((a, [d, v]) => (fn(d) ? [a[0] + v[0], a[1] + v[1], a[2] + v[2]] : a), [0, 0, 0]);
  const [mSale, mProfit, mCnt] = sumWhere((d) => d.startsWith(thisMonth));
  const [pSale, pProfit] = sumWhere((d) => d.startsWith(prevMonth) && Number(d.slice(8, 10)) <= dayNo);
  const [ySale, yProfit, yCnt] = sumWhere((d) => d.startsWith(thisMonth.slice(0, 4)));
  const prevAvail = prevMonth.slice(0, 4) === thisMonth.slice(0, 4);
  const mMargin = mSale ? (mProfit / mSale) * 100 : 0;
  const pMargin = pSale ? (pProfit / pSale) * 100 : 0;
  const forecast = dayNo ? (mSale / dayNo) * dim : 0;
  const [pFullSale] = sumWhere((d) => d.startsWith(prevMonth));

  const monthly = Array.from({ length: Number(thisMonth.slice(5, 7)) }, (_, i) => {
    const m = `${thisMonth.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
    const [s, p] = sumWhere((d) => d.startsWith(m));
    return { k: `${i + 1}월`, sale: s, profit: p, margin: s ? (p / s) * 100 : 0 };
  });
  const daily = Array.from({ length: 30 }, (_, i) => { const d = addDay(today, i - 29); const v = days[d] || [0, 0, 0]; return { k: d.slice(5).replace("-", "."), sale: v[0], profit: v[1] }; });

  // 오늘의 현장
  const todayRows = (dispatchData || []).filter((r) => dateOf(r) === today && !isCancelled(r) && r.source !== "transport_transmit");
  const unassigned = todayRows.filter((r) => (r.배차상태 || "") !== "배차완료");
  const todaySale = (days[today] || [0])[0];

  // 결재
  const mine = approvals.filter((a) => myTurn(a, me?.uid)).sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  const pendingAll = approvals.filter((a) => a.status === "pending");
  const late = pendingAll.filter((a) => Date.now() - tsMs(a.createdAt) > 48 * 3600e3);
  const expMonth = approvals.filter((a) => a.cat === "expense" && a.status === "approved" && new Date(tsMs(a.createdAt) + 9 * 3600e3).toISOString().startsWith(thisMonth)).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  // 사람
  const evs = approvals.flatMap(eventsOf);
  const awayToday = evs.filter((e) => e.date === today && !/조퇴|지각/.test(e.label));
  const awayUniq = [...new Map(awayToday.map((e) => [e.uid, e])).values()];
  const attMap = Object.fromEntries(attendance.map((a) => [a.uid, a]));
  const inNow = staff.filter((u) => attMap[u.id] && (attMap[u.id].status === "출근" || attMap[u.id].checkInTime)).length;
  const week = Array.from({ length: 7 }, (_, i) => addDay(today, i));
  const weekEvs = evs.filter((e) => week.includes(e.date));

  // 거래처
  const topClients = Object.entries(clients).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const clientTotal = Object.values(clients).reduce((s, v) => s + v, 0);
  const topShare = clientTotal && topClients[0] ? (topClients[0][1] / clientTotal) * 100 : 0;
  const docIssue = drivers.filter((d) => { const p = docProblems(docsBy?.[d.id]); return p.missing || p.bad; }).length;

  // 주의 신호
  const signals = [
    unassigned.length > 0 && { tone: "bad", t: `오늘 미배차 ${unassigned.length}건`, s: `오늘 오더 ${todayRows.length}건 중`, go: null },
    late.length > 0 && { tone: "bad", t: `결재 지연 ${late.length}건`, s: "상신 후 48시간 넘게 진행 중", go: "결재함" },
    topShare >= 30 && { tone: "warn", t: `거래처 쏠림 ${topShare.toFixed(0)}%`, s: `${topClients[0]?.[0]} — 이번 달 매출 비중`, go: "매출관리" },
    prevAvail && pSale > 0 && mSale > 0 && mMargin < pMargin - 2 && { tone: "warn", t: `이익률 ${(pMargin - mMargin).toFixed(1)}%p 하락`, s: `전월 동기 ${pMargin.toFixed(1)}% → ${mMargin.toFixed(1)}%`, go: "인사이트" },
    docIssue > 0 && { tone: "warn", t: `기사 서류 미비 ${docIssue}명`, s: "미제출·반려·만료", go: null },
    expMonth > 0 && { tone: "info", t: `이번 달 승인 지출 ${short(expMonth)}원`, s: "전자결재 비용·지출 결의", go: "결재함" },
  ].filter(Boolean);

  const hour = kstNow().getUTCHours();
  const greet = hour < 12 ? "좋은 아침입니다" : hour < 18 ? "좋은 오후입니다" : "수고 많으셨습니다";
  const md = pct(mSale, pSale);
  const brief = [
    `이번 달 매출은 ${short(mSale)}원${prevAvail && pSale ? `으로 전월 같은 기간보다 ${md >= 0 ? `${md.toFixed(1)}% 늘었습니다` : `${Math.abs(md).toFixed(1)}% 줄었습니다`}` : "입니다"}.`,
    forecast > 0 && `지금 속도면 월말 ${short(forecast)}원이 예상됩니다.`,
    mine.length ? `결재 ${mine.length}건이 대표님 결재를 기다리고 있습니다.` : "기다리는 결재는 없습니다.",
    awayUniq.length ? `오늘 ${awayUniq.length}명이 휴가·외근 중입니다.` : "",
  ].filter(Boolean).join(" ").replace("대표님", me?.position ? `${me.position}님` : "임원님");

  const dstr = `${today.replace(/-/g, ".")} ${DOW[new Date(`${today}T00:00:00Z`).getUTCDay()]}요일`;
  return (
    <div className="relative rounded-[26px] overflow-hidden text-white -mx-1 md:mx-0" style={{ background: SHELL_BG }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: GRID }} />
      <div className="relative p-3 md:p-6 space-y-3 md:space-y-4">
        {/* ── 머리말 · 오늘의 브리핑 ── */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-extrabold tracking-[0.34em]" style={{ fontFamily: MONO, color: GOLD }}>EXECUTIVE · BRIEFING</span>
              <span className="h-px flex-1 min-w-[40px] max-w-[160px]" style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
            </div>
            <div className="mt-2 text-[26px] md:text-[34px] font-black tracking-tight leading-tight">
              {[personName(me) || "임원", me?.position].filter(Boolean).join(" ")}님, <span className="text-white/60">{greet}</span>
            </div>
            <p className="mt-2 text-[15px] md:text-[16.5px] leading-relaxed text-white/75 max-w-[880px]">{ready ? brief : "오늘의 경영 지표를 정리하고 있습니다…"}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-left lg:text-right">
              <Clock />
              <div className="mt-1.5 text-[13px] font-bold text-white/45 tracking-[0.12em]" style={{ fontFamily: MONO }}>{dstr} · KST</div>
            </div>
          </div>
        </div>

        {/* ── 핵심 지표 ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          {[
            { l: "이번 달 매출", v: `${short(mSale)}원`, sub: <><Delta v={prevAvail ? md : null} /><span className="text-white/40"> 전월 동기</span></>, en: "REVENUE · MTD" },
            { l: "매출총이익", v: `${short(mProfit)}원`, sub: <><span className="text-white/70 font-black" style={{ fontFamily: MONO }}>{mMargin.toFixed(1)}%</span><span className="text-white/40"> 이익률 </span><Delta v={prevAvail && pSale ? mMargin - pMargin : null} suffix="%p" /></>, en: "GROSS PROFIT" },
            { l: "월말 예상 매출", v: `${short(forecast)}원`, sub: <><span className="text-white/40">전월 실적 </span><span className="text-white/70 font-black" style={{ fontFamily: MONO }}>{prevAvail ? `${short(pFullSale)}원` : "—"}</span></>, en: "FORECAST", ring: forecast ? Math.min(1, mSale / forecast) : 0, ringLabel: `${dayNo}/${dim}` },
            { l: "올해 누적 매출", v: `${short(ySale)}원`, sub: <><span className="text-white/40">이익 </span><span className="text-white/70 font-black" style={{ fontFamily: MONO }}>{short(yProfit)}원</span><span className="text-white/40"> · {yCnt.toLocaleString()}건</span></>, en: "YEAR TO DATE" },
          ].map((k) => (
            <div key={k.l} className="relative rounded-[20px] border border-white/[0.09] px-3.5 md:px-5 py-3 md:py-4 overflow-hidden min-w-0" style={{ background: "linear-gradient(150deg, rgba(255,255,255,.07), rgba(255,255,255,.02))" }}>
              <div className="absolute top-0 left-4 right-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}66, transparent)` }} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10.5px] md:text-[11px] font-extrabold tracking-[0.24em] text-white/40 whitespace-nowrap" style={{ fontFamily: MONO }}>{k.en}</div>
                  <div className="text-[13.5px] md:text-[14.5px] font-bold text-white/70 mt-0.5 whitespace-nowrap">{k.l}</div>
                  <div className="text-[24px] md:text-[34px] font-black tabular-nums leading-tight mt-1 whitespace-nowrap" style={{ fontFamily: MONO }}>{k.v}</div>
                </div>
                {k.ring != null && <span className="hidden md:block"><Ring value={k.ring} label={k.ringLabel} /></span>}
              </div>
              <div className="mt-1 text-[12.5px] md:text-[13px] whitespace-nowrap truncate">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── 💰 자금(대표만) ── */}
        {isCeo && (
          <button type="button" onClick={() => onGo?.("자금현황")} className="w-full text-left rounded-[22px] border border-[#D7BC82]/30 px-4 md:px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3" style={{ background: "linear-gradient(120deg, rgba(215,188,130,.12), rgba(255,255,255,.03))" }}>
            <span className="min-w-[140px]"><span className="block text-[11px] font-extrabold tracking-[0.28em]" style={{ fontFamily: MONO, color: GOLD }}>TREASURY · 자금</span><span className="block text-[13px] text-white/55 mt-0.5">{F.has ? "통장·현금 잔액(경리 입력 기준)" : "경리가 자금 상태를 입력하면 보입니다"}</span></span>
            {[["보유 자금", F.has ? `${short(F.cash)}원` : "—"], ["이번 달 순현금흐름", F.has ? `${F.thisMonth.in - F.thisMonth.out >= 0 ? "+" : ""}${short(F.thisMonth.in - F.thisMonth.out)}원` : "—"], ["운영 가능 기간", F.runway != null && F.has ? `${F.runway.toFixed(1)}개월` : "—"], ["대출 잔액", F.has ? `${short(F.loan)}원` : "—"]].map(([l, v]) => (
              <span key={l}><span className="block text-[12.5px] font-bold text-white/55">{l}</span><span className="block text-[24px] md:text-[28px] font-black tabular-nums leading-tight" style={{ fontFamily: MONO }}>{v}</span></span>
            ))}
            <span className="ml-auto text-[14px] font-black text-white/60">자세히 ›</span>
          </button>
        )}

        {/* ── 매출 추이 · 나의 결재 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 md:gap-4">
          <Panel en={`PERFORMANCE · ${thisMonth.slice(0, 4)}`} title={range === "year" ? "월별 매출 · 이익 · 이익률" : "최근 30일 매출 · 이익"}
            right={<div className="flex rounded-xl bg-white/[0.06] p-0.5 shrink-0">{[["year", "올해"], ["30", "30일"]].map(([k, l]) => <button key={k} type="button" onClick={() => setRange(k)} className={`h-8 px-3 rounded-[10px] text-[13.5px] font-black whitespace-nowrap ${range === k ? "bg-white text-[#0B1530]" : "text-white/60"}`}>{l}</button>)}</div>}>
            <div className="h-[250px] md:h-[300px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                {range === "year" ? (
                  <ComposedChart data={monthly} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="exSale" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#CFE0FF" stopOpacity={0.95} /><stop offset="100%" stopColor="#6E95E8" stopOpacity={0.55} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(143,176,240,.10)" vertical={false} />
                    <XAxis dataKey="k" tick={{ fill: "rgba(207,224,255,.55)", fontSize: 12.5, fontFamily: MONO }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="w" tickFormatter={short} tick={{ fill: "rgba(207,224,255,.4)", fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={46} />
                    <YAxis yAxisId="m" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fill: "rgba(215,188,130,.6)", fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(143,176,240,.06)" }} />
                    <Bar yAxisId="w" dataKey="sale" name="매출" fill="url(#exSale)" radius={[6, 6, 0, 0]} maxBarSize={30} />
                    <Bar yAxisId="w" dataKey="profit" name="이익" fill="rgba(143,176,240,.35)" radius={[6, 6, 0, 0]} maxBarSize={30} />
                    <Line yAxisId="m" dataKey="margin" name="이익률" stroke={GOLD} strokeWidth={2.2} dot={{ r: 3, fill: GOLD, strokeWidth: 0 }} />
                  </ComposedChart>
                ) : (
                  <AreaChart data={daily} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="exArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8FB0F0" stopOpacity={0.55} /><stop offset="100%" stopColor="#8FB0F0" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(143,176,240,.10)" vertical={false} />
                    <XAxis dataKey="k" interval={4} tick={{ fill: "rgba(207,224,255,.55)", fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={short} tick={{ fill: "rgba(207,224,255,.4)", fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip content={<ChartTip />} />
                    <Area dataKey="sale" name="매출" stroke="#CFE0FF" strokeWidth={2} fill="url(#exArea)" />
                    <Area dataKey="profit" name="이익" stroke={GOLD} strokeWidth={1.6} fill="transparent" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel en="APPROVAL · YOUR TURN" title="나의 결재 대기"
            right={<button type="button" onClick={() => onGo?.("결재함")} className="h-8 px-3 rounded-[10px] border border-white/15 text-[13.5px] font-black text-white/85 whitespace-nowrap hover:bg-white/10">결재함 ›</button>}>
            {/* 🤖 일일 업무일지 자동 승인 — 켜면 상신과 동시에 승인, 끄면 임원이 직접 확인 */}
            <button type="button" onClick={() => setAutoApproveDaily(company, !autoDaily, personName(me) || "")}
              className={`w-full mb-3 rounded-2xl px-3.5 py-2.5 flex items-center gap-3 border text-left transition ${autoDaily ? "border-[#D7BC82]/50 bg-[#D7BC82]/[0.10]" : "border-white/10 bg-white/[0.04]"}`}>
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-black">일일 업무일지 자동 승인</span><span className="block text-[12.5px] text-white/50">{autoDaily ? "켜짐 — 올라오는 즉시 승인 처리됩니다" : "꺼짐 — 임원이 직접 확인하고 승인합니다"}</span></span>
              <span className={`relative w-[52px] h-[30px] rounded-full shrink-0 transition ${autoDaily ? "" : "bg-white/15"}`} style={autoDaily ? { background: "linear-gradient(180deg,#F3E3BC,#D7BC82)" } : undefined}>
                <span className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow transition-all ${autoDaily ? "left-[25px]" : "left-[3px]"}`} />
              </span>
            </button>
            <div className="flex items-end gap-3 mb-2">
              <span className="text-[44px] font-black leading-none tabular-nums" style={{ fontFamily: MONO, color: mine.length ? "#fff" : "rgba(255,255,255,.35)" }}>{mine.length}</span>
              <span className="text-[13.5px] font-bold text-white/50 pb-1">건 · 회사 진행 중 {pendingAll.length}건{late.length ? ` · 지연 ${late.length}` : ""}</span>
            </div>
            {!mine.length ? (
              <div className="rounded-2xl border border-dashed border-white/15 py-8 text-center text-[14.5px] font-bold text-white/45">지금 결재할 문서가 없습니다</div>
            ) : (
              <div className="space-y-1.5 max-h-[214px] overflow-y-auto pr-1">
                {mine.slice(0, 8).map((a) => {
                  const h = Math.max(0, Math.floor((Date.now() - tsMs(a.createdAt)) / 3600e3));
                  return (
                    <button key={a.id} type="button" onClick={() => onGo?.(`결재함:${a.id}`)} className="w-full text-left rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] px-3 py-2.5 flex items-center gap-3 transition">
                      <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}><ShellIcon name={a.cat === "expense" ? "wallet" : a.cat === "leave" ? "clock" : "file"} size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-black truncate">{a.title || a.formLabel || "결재 문서"}</span>
                        <span className="block text-[13px] text-white/50 truncate">{a.drafter?.name || ""}{a.drafter?.team ? ` · ${a.drafter.team}` : ""}{a.amount ? ` · ${Number(a.amount).toLocaleString()}원` : ""}</span>
                      </span>
                      <span className={`shrink-0 text-[12.5px] font-black tabular-nums ${h >= 48 ? "text-[#FFB4A8]" : "text-white/45"}`} style={{ fontFamily: MONO }}>{h >= 24 ? `${Math.floor(h / 24)}일` : `${h}시간`}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* ── 현장 · 사람 · 주의 신호 ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <Panel en="LOGISTICS · TODAY" title="물류운송현황" >
            <div className="grid grid-cols-2 gap-2">
              {[["오늘 오더", `${todayRows.length}`, "건"], ["배차 완료", `${todayRows.length - unassigned.length}`, "건"], ["미배차", `${unassigned.length}`, "건", unassigned.length > 0], ["오늘 매출", short(todaySale), "원"]].map(([l, v, u, bad]) => (
                <div key={l} className="rounded-2xl bg-white/[0.05] border border-white/[0.06] px-3 py-2.5">
                  <div className="text-[12.5px] font-bold text-white/50 whitespace-nowrap">{l}</div>
                  <div className={`text-[26px] font-black tabular-nums leading-tight ${bad ? "text-[#FFB4A8]" : ""}`} style={{ fontFamily: MONO }}>{v}<span className="text-[13.5px] text-white/40 ml-0.5">{u}</span></div>
                </div>
              ))}
            </div>
            <div className="mt-2.5">
              <div className="flex justify-between text-[12.5px] font-bold text-white/50 mb-1"><span>배차율</span><span style={{ fontFamily: MONO }}>{todayRows.length ? Math.round(((todayRows.length - unassigned.length) / todayRows.length) * 100) : 0}%</span></div>
              <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${todayRows.length ? ((todayRows.length - unassigned.length) / todayRows.length) * 100 : 0}%`, background: `linear-gradient(90deg, ${ICE}, #CFE0FF)` }} /></div>
            </div>
          </Panel>

          <Panel en="STAFF · TODAY" title="직원현황" right={<button type="button" onClick={() => onGo?.("직원일정")} className="text-[13.5px] font-black text-white/60 whitespace-nowrap hover:text-white">일정 ›</button>}>
            <div className="grid grid-cols-3 gap-2">
              {[["재직", staff.length], ["출근", inNow], ["부재", awayUniq.length]].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-white/[0.05] border border-white/[0.06] px-2.5 py-2 text-center">
                  <div className="text-[12.5px] font-bold text-white/50">{l}</div>
                  <div className="text-[26px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 space-y-1 max-h-[96px] overflow-y-auto">
              {!awayUniq.length ? <div className="text-[14px] font-bold text-white/40 py-2">오늘 부재 인원 없음</div> : awayUniq.map((e) => (
                <div key={e.uid} className="flex items-center gap-2 text-[14px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.status === "approved" ? GOLD : "rgba(255,255,255,.35)" }} />
                  <span className="font-black whitespace-nowrap">{e.name}</span>
                  <span className="text-white/45 truncate">{[e.team, e.position].filter(Boolean).join(" · ")}</span>
                  <span className="ml-auto text-[12.5px] font-black text-white/70 whitespace-nowrap">{e.label}{e.status !== "approved" ? "(결재 중)" : ""}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel en="SIGNALS" title="주의 신호">
            {!signals.length ? (
              <div className="rounded-2xl border border-dashed border-white/15 py-8 text-center text-[14.5px] font-bold text-white/45">특이 사항이 없습니다</div>
            ) : (
              <div className="space-y-1.5">
                {signals.slice(0, 5).map((x) => (
                  <button key={x.t} type="button" disabled={!x.go} onClick={() => x.go && onGo?.(x.go)} className="w-full text-left rounded-2xl bg-white/[0.04] border border-white/[0.06] px-3 py-2 flex items-center gap-2.5 enabled:hover:bg-white/[0.08]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.tone === "bad" ? "#FF8A7A" : x.tone === "warn" ? GOLD : ICE, boxShadow: `0 0 10px ${x.tone === "bad" ? "#FF8A7A" : x.tone === "warn" ? GOLD : ICE}` }} />
                    <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-black truncate">{x.t}</span><span className="block text-[12.5px] text-white/45 truncate">{x.s}</span></span>
                    {x.go && <span className="text-white/35 text-[14.5px]">›</span>}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── 거래처 · 이번 주 부재 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3 md:gap-4">
          <Panel en="CLIENTS · THIS MONTH" title="거래처 매출 TOP 5" right={<button type="button" onClick={() => onGo?.("매출관리")} className="text-[13.5px] font-black text-white/60 whitespace-nowrap hover:text-white">매출관리 ›</button>}>
            {!topClients.length ? <div className="py-8 text-center text-[14.5px] font-bold text-white/40">이번 달 매출이 아직 없습니다</div> : (
              <div className="space-y-2.5">
                {topClients.map(([n, v], i) => (
                  <div key={n}>
                    <div className="flex items-center gap-2 text-[14.5px]">
                      <span className="w-5 text-[12.5px] font-black text-white/40" style={{ fontFamily: MONO }}>{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-black truncate flex-1">{n}</span>
                      <span className="font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{short(v)}원</span>
                      <span className="w-12 text-right text-[12.5px] text-white/45 tabular-nums" style={{ fontFamily: MONO }}>{clientTotal ? ((v / clientTotal) * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div className="ml-7 mt-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${clientTotal ? (v / topClients[0][1]) * 100 : 0}%`, background: i === 0 ? `linear-gradient(90deg, ${GOLD}, #F1DFB4)` : `linear-gradient(90deg, #6E95E8, #CFE0FF)` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel en="TEAM · NEXT 7 DAYS" title="이번 주 부재 일정" right={<button type="button" onClick={() => onGo?.("직원일정")} className="text-[13.5px] font-black text-white/60 whitespace-nowrap hover:text-white">달력 ›</button>}>
            <div className="grid grid-cols-7 gap-1 md:gap-1.5">
              {week.map((d) => {
                const list = weekEvs.filter((e) => e.date === d);
                const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                return (
                  <div key={d} className={`rounded-xl md:rounded-2xl border px-1 md:px-2 py-2 min-h-[92px] min-w-0 ${d === today ? "border-[#D7BC82]/60 bg-[#D7BC82]/[0.07]" : "border-white/[0.07] bg-white/[0.03]"}`}>
                    <div className={`text-center text-[12px] font-black ${dow === 0 ? "text-[#FFB4A8]" : dow === 6 ? "text-[#AFC6F5]" : "text-white/55"}`}>{DOW[dow]}</div>
                    <div className="text-center text-[16.5px] font-black tabular-nums" style={{ fontFamily: MONO }}>{Number(d.slice(8))}</div>
                    <div className="mt-1 space-y-0.5">
                      {list.slice(0, 3).map((e) => <div key={`${e.id}${e.date}`} title={`${e.name} ${e.label}`} className={`rounded-md px-1 py-[1px] text-[11.5px] md:text-[12px] font-bold truncate ${e.status === "approved" ? "bg-white/[0.10] text-white/90" : "border border-dashed border-white/25 text-white/60"}`}>{e.name}</div>)}
                      {list.length > 3 && <div className="text-[11.5px] text-white/45 text-center">+{list.length - 3}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 결재함(최종 결재자) ───────────────────────────
export function ExecApprovals({ company, me }) {
  const [page, setPage] = React.useState("inbox");
  const [openId, setOpenId] = React.useState(() => { try { const v = sessionStorage.getItem("kpExecApOpen"); sessionStorage.removeItem("kpExecApOpen"); return v || null; } catch { return null; } });
  const counts = useApprovalCounts();
  const hoUnread = useHandoverUnread(me?.uid);
  const approvals = useApprovalsOf(company);
  const thisMonth = kstToday().slice(0, 7);
  const mine = approvals.filter((a) => myTurn(a, me?.uid)).length;
  const pending = approvals.filter((a) => a.status === "pending");
  const late = pending.filter((a) => Date.now() - tsMs(a.createdAt) > 48 * 3600e3).length;
  const doneMonth = approvals.filter((a) => a.status === "approved" && new Date(tsMs(a.updatedAt || a.createdAt) + 9 * 3600e3).toISOString().startsWith(thisMonth));
  const expMonth = doneMonth.filter((a) => a.cat === "expense").reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return (
    <KpSubNav code="EXECUTIVE APPROVAL" title="결재함" icon="stamp" active={page} onSelect={setPage}
      groups={[{ label: "결재", items: [
        { key: "inbox", label: "결재함", en: "INBOX", icon: "stamp", badge: counts.todo },
        { key: "mine", label: "내 기안함", en: "MY DOCUMENTS", icon: "send", badge: counts.mineNew },
        { key: "draft", label: "업무 기안·품의", en: "PROPOSAL", icon: "file" },
        { key: "handover", label: "인수인계", en: "HANDOVER", icon: "link", badge: hoUnread },
        { key: "lines", label: "결재선 관리", en: "LINES", icon: "route" },
      ] }]}>
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-[22px] px-4 md:px-6 py-4 text-white" style={{ background: SHELL_BG }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: GRID }} />
          <div className="relative">
            <div className="text-[10.5px] font-extrabold tracking-[0.3em]" style={{ fontFamily: MONO, color: GOLD }}>FINAL APPROVER · OVERVIEW</div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
              {[["나의 결재 대기", `${mine}건`], ["회사 진행 중", `${pending.length}건`], ["48시간 지연", `${late}건`], ["이번 달 승인 지출", `${short(expMonth)}원`]].map(([l, v], i) => (
                <div key={l} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-2.5 min-w-0">
                  <div className="text-[11.5px] font-bold text-white/55 whitespace-nowrap">{l}</div>
                  <div className={`text-[20px] md:text-[22px] font-black tabular-nums whitespace-nowrap ${i === 2 && late ? "text-[#FFB4A8]" : ""}`} style={{ fontFamily: MONO }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {page === "handover"
          ? <HandoverCenter company={company} me={me} isViewer={me?.role === "viewer"} />
          : <ApprovalCenter company={company} me={me} page={page} setPage={setPage} openId={openId} onOpened={() => setOpenId(null)} />}
      </div>
    </KpSubNav>
  );
}

// ─────────────────────────── 직원 일정(달력) ───────────────────────────
const KIND_STYLE = (label, status) => {
  const pend = status !== "approved";
  const base = /연차|휴가|반차|반반차/.test(label) ? ["#1B2B4B", "#fff"] : /출장|외근/.test(label) ? ["#DCE6F8", "#1B2B4B"] : /병가|경조/.test(label) ? ["#F3E7CC", "#6B5320"] : ["#EEF2F8", "#3A4A66"];
  return pend ? { background: "transparent", color: "#5B6B85", border: "1px dashed #9AA9C3" } : { background: base[0], color: base[1], border: `1px solid ${base[0]}` };
};
export function TeamSchedule({ company }) {
  const approvals = useApprovalsOf(company);
  const { staff } = useStaff(company);
  const today = kstToday();
  const [ym, setYm] = React.useState(today.slice(0, 7));
  const [team, setTeam] = React.useState("전체");
  const [pick, setPick] = React.useState(today);
  const teamOf = Object.fromEntries(staff.map((u) => [u.id, u.team || "미배정"]));
  const evs = approvals.flatMap(eventsOf).map((e) => ({ ...e, team: teamOf[e.uid] || e.team || "미배정" })).filter((e) => team === "전체" || e.team === team);
  const teams = ["전체", ...Array.from(new Set(staff.map((u) => u.team || "미배정")))];
  const first = new Date(`${ym}-01T00:00:00Z`);
  const startDow = first.getUTCDay();
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((startDow + dim) / 7) * 7 }, (_, i) => { const n = i - startDow + 1; return n >= 1 && n <= dim ? `${ym}-${String(n).padStart(2, "0")}` : null; });
  const by = {}; evs.forEach((e) => { (by[e.date] = by[e.date] || []).push(e); });
  const move = (n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setYm(d.toISOString().slice(0, 7)); };
  const week = Array.from({ length: 7 }, (_, i) => addDay(today, i));
  const monthEv = evs.filter((e) => e.date.startsWith(ym));
  const leaveDays = monthEv.filter((e) => e.status === "approved" && /연차|휴가/.test(e.label)).length + monthEv.filter((e) => e.status === "approved" && /반차/.test(e.label)).length * 0.5;
  const pickList = (by[pick] || []).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[22px] px-4 md:px-6 py-4 text-white" style={{ background: SHELL_BG }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: GRID }} />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em]" style={{ fontFamily: MONO, color: GOLD }}>TEAM · SCHEDULE</div>
            <div className="text-[20px] md:text-[24px] font-black mt-0.5">직원 일정</div>
            <div className="text-[12.5px] text-white/55">전자결재 연차·반차·외근·출장·병가·경조사 — 결재 완료는 확정, 진행 중은 점선</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => move(-1)} className="w-9 h-9 rounded-xl bg-white/10 font-black">‹</button>
            <span className="h-9 px-3.5 rounded-xl bg-white text-[#0B1530] font-black grid place-items-center tabular-nums" style={{ fontFamily: MONO }}>{ym.replace("-", ".")}</span>
            <button type="button" onClick={() => move(1)} className="w-9 h-9 rounded-xl bg-white/10 font-black">›</button>
          </div>
        </div>
        <div className="relative mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[["오늘 부재", `${new Set((by[today] || []).map((e) => e.uid)).size}명`], ["이번 주 부재", `${new Set(evs.filter((e) => week.includes(e.date)).map((e) => e.uid)).size}명`], ["이달 연차 사용", `${leaveDays}일`], ["결재 진행 중", `${new Set(monthEv.filter((e) => e.status !== "approved").map((e) => e.id)).size}건`]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-2.5"><div className="text-[11.5px] font-bold text-white/55 whitespace-nowrap">{l}</div><div className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div></div>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {teams.map((t) => <button key={t} type="button" onClick={() => setTeam(t)} className={`h-9 px-3.5 rounded-full text-[13px] font-black border whitespace-nowrap shrink-0 ${team === t ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}>{t}</button>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#EEF1F6]">
            {DOW.map((d, i) => <div key={d} className={`py-2 text-center text-[12px] font-black ${i === 0 ? "text-[#D92D20]" : i === 6 ? "text-[#2D4C82]" : "text-[#5B6B85]"}`}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const list = d ? by[d] || [] : [];
              return (
                <button key={i} type="button" disabled={!d} onClick={() => d && setPick(d)}
                  className={`text-left min-h-[64px] md:min-h-[104px] p-1 md:p-1.5 border-b border-r border-[#F1F4F9] align-top ${!d ? "bg-[#FAFBFD]" : pick === d ? "bg-[#F2F6FD] ring-2 ring-inset ring-[#2D4C82]" : "hover:bg-[#F8FAFD]"}`}>
                  {d && (
                    <>
                      <div className={`text-[12px] md:text-[13px] font-black tabular-nums ${d === today ? "w-6 h-6 rounded-full bg-[#0F1A30] text-white grid place-items-center" : i % 7 === 0 ? "text-[#D92D20]" : i % 7 === 6 ? "text-[#2D4C82]" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{Number(d.slice(8))}</div>
                      <div className="hidden md:block mt-1 space-y-0.5">
                        {list.slice(0, 3).map((e) => <div key={`${e.id}${e.date}`} className="rounded-md px-1.5 py-[1px] text-[11px] font-bold truncate" style={KIND_STYLE(e.label, e.status)}>{e.name} {e.label}</div>)}
                        {list.length > 3 && <div className="text-[10.5px] font-bold text-[#7A879C] px-1">+{list.length - 3}명</div>}
                      </div>
                      {list.length > 0 && <div className="md:hidden mt-1 flex items-center gap-0.5 flex-wrap">{list.slice(0, 4).map((e) => <span key={`${e.id}${e.date}`} className="w-1.5 h-1.5 rounded-full" style={{ background: e.status === "approved" ? "#1B2B4B" : "#9AA9C3" }} />)}{list.length > 4 && <span className="text-[9px] font-black text-[#5B6B85]">+{list.length - 4}</span>}</div>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden self-start">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-[#EEF1F6]">
            <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>DAY DETAIL</div>
            <div className="text-[15px] font-black text-[#0F1A30]">{pick.replace(/-/g, ".")} ({DOW[new Date(`${pick}T00:00:00Z`).getUTCDay()]}) · {pickList.length}명</div>
          </div>
          {!pickList.length ? <div className="py-10 text-center text-[13px] font-bold text-[#9AA9C3]">이 날은 부재 일정이 없습니다</div> : (
            <div className="divide-y divide-[#EEF2F8]">
              {pickList.map((e) => (
                <div key={`${e.id}${e.date}`} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[13px] font-black shrink-0">{String(e.name || "?").slice(0, 1)}</span>
                  <div className="min-w-0 flex-1"><div className="text-[14px] font-black text-[#0F1A30] truncate">{e.name}</div><div className="text-[11.5px] text-[#7A879C] truncate">{[e.team, e.position].filter(Boolean).join(" · ")}</div></div>
                  <span className="text-[11.5px] font-black px-2 py-0.5 rounded-lg whitespace-nowrap" style={KIND_STYLE(e.label, e.status)}>{e.label}{e.status !== "approved" ? " · 결재 중" : ""}</span>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-3 border-t border-[#EEF1F6] flex items-center gap-2 flex-wrap text-[11px] font-bold text-[#5B6B85]">
            {[["연차·반차", "연차"], ["출장·외근", "출장"], ["병가·경조사", "병가"]].map(([l, k]) => <span key={l} className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-3 h-3 rounded" style={KIND_STYLE(k, "approved")} />{l}</span>)}
            <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-3 h-3 rounded" style={KIND_STYLE("연차", "pending")} />결재 중</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 전자결재(부서 화면 상단 메뉴) ───────────────────────────
// 경리·인사 권한 상단 메뉴 › 전자결재 — 홈 왼쪽 전자결재와 같은 화면을 바로
export function ApprovalWorkspace({ company, me }) {
  const [page, setPage] = React.useState("inbox");
  const counts = useApprovalCounts();
  const hoUnread = useHandoverUnread(me?.uid);
  return (
    <KpSubNav code="E-APPROVAL" title="전자결재" icon="stamp" active={page} onSelect={setPage}
      groups={[{ label: "전자결재", items: [
        { key: "inbox", label: "결재함", en: "INBOX", icon: "stamp", badge: counts.todo },
        { key: "leave", label: "근태·휴가 신청", en: "ATTENDANCE", icon: "clock" },
        { key: "expense", label: "비용·지출 결의", en: "EXPENSE", icon: "wallet" },
        { key: "draft", label: "업무 기안·품의", en: "PROPOSAL", icon: "file" },
        { key: "report", label: "업무 보고·인사", en: "REPORT", icon: "list" },
        { key: "handover", label: "인수인계", en: "HANDOVER", icon: "link", badge: hoUnread },
        { key: "mine", label: "내 기안함", en: "MY DOCUMENTS", icon: "send", badge: counts.mineNew },
        { key: "lines", label: "결재선 관리", en: "LINES", icon: "route" },
      ] }]}>
      {page === "handover"
        ? <HandoverCenter company={company} me={me} isViewer={me?.role === "viewer"} />
        : <ApprovalCenter company={company} me={me} page={page} setPage={setPage} />}
    </KpSubNav>
  );
}

// ─────────────────────────── 임원 스케줄(2026-10-31) ───────────────────────────
// 임원(대표·전무·이사)이 각자 일정을 올리면 모든 직원이 볼 수 있다(홈 › 임원 일정 · 모바일 사내 업무).
//  execSchedules: { companyName, uid, name, position, title, kind, date, endDate, start, end, place, memo, createdAt }
export const EXEC_KINDS = ["회의", "미팅", "외근", "출장", "행사", "휴가", "기타"];
const KIND_DOT = { 회의: "#8FB0F0", 미팅: "#D7BC82", 외근: "#9FE3C4", 출장: "#F1DFB4", 행사: "#CFE0FF", 휴가: "#FFB4A8", 기타: "#AFC6F5" };
export function useExecSchedules(company) {
  return useCompanyQuery("execSchedules", company) || [];
}
const daysOf = (e) => { const out = []; for (let x = e.date, i = 0; x && x <= (e.endDate || e.date) && i < 40; x = addDay(x, 1), i += 1) out.push(x); return out; };
// ⭐ 2026-11-01 임원 일정은 임원 + 인사 쪽(인사관리자·통합인사·인사팀 직원) 모두 등록
export const canWriteExecSchedule = ({ dept, role, team } = {}) => dept === "exec" || dept === "hr" || ["hrManager", "hrAcct", "totalMaster"].includes(role) || team === "인사팀";
// 🕘 2026-11-01 시간 고르기(임원 일정) — 오전/오후 · 시 · 10분 단위, 어두운 금색 테마
const addMin = (hm, m) => { const [h, mm] = String(hm || "00:00").split(":").map(Number); const t = Math.min(23 * 60 + 50, h * 60 + mm + m); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const hmLabel = (hm) => { if (!hm) return "시간 선택"; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`; };
function TimePick({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { if (!open) return undefined; const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, [open]);
  const [h, m] = String(value || "09:00").split(":").map(Number);
  const set = (nh, nm) => onChange(`${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`);
  const chip = (on) => `h-9 rounded-lg text-[13.5px] font-black tabular-nums ${on ? "text-[#1A1405]" : "bg-white/[0.06] text-white/80 hover:bg-white/[0.12]"}`;
  const gold = { background: `linear-gradient(180deg,#F1DFB4,${GOLD})` };
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="h-12 w-full px-3.5 rounded-xl bg-white/[0.06] border border-white/15 text-left flex items-center gap-2 hover:border-[#D7BC82]">
        <span className="text-[15px]" style={{ color: GOLD }}>◷</span>
        <span className="text-[15px] font-black tabular-nums" style={{ fontFamily: MONO }}>{hmLabel(value)}</span>
      </button>
      {open && (
        <div className="absolute z-[100001] left-0 right-0 mt-1.5 rounded-2xl p-3 shadow-[0_20px_44px_rgba(0,0,0,0.5)] border border-white/15" style={{ background: SHELL_BG, minWidth: 260 }}>
          <div className="grid grid-cols-2 gap-1 mb-2">{[["오전", 0], ["오후", 12]].map(([l, base]) => <button key={l} type="button" onClick={() => set((h % 12) + base, m)} className={chip((h < 12) === (base === 0))} style={(h < 12) === (base === 0) ? gold : undefined}>{l}</button>)}</div>
          <div className="text-[11px] font-extrabold tracking-[0.2em] text-white/45 mb-1" style={{ fontFamily: MONO }}>HOUR</div>
          <div className="grid grid-cols-6 gap-1 mb-2">{Array.from({ length: 12 }, (_, i) => i).map((i) => { const hh = (h < 12 ? 0 : 12) + i; return <button key={i} type="button" onClick={() => set(hh, m)} className={chip(hh === h)} style={hh === h ? gold : undefined}>{i === 0 ? 12 : i}</button>; })}</div>
          <div className="text-[11px] font-extrabold tracking-[0.2em] text-white/45 mb-1" style={{ fontFamily: MONO }}>MINUTE</div>
          <div className="grid grid-cols-6 gap-1">{[0, 10, 20, 30, 40, 50].map((mm) => <button key={mm} type="button" onClick={() => { set(h, mm); setOpen(false); }} className={chip(mm === m)} style={mm === m ? gold : undefined}>{String(mm).padStart(2, "0")}</button>)}</div>
        </div>
      )}
    </div>
  );
}

export function ExecScheduleBoard({ company, me = {}, canWrite = false }) {
  const list = useExecSchedules(company);
  const { staff: allStaff } = useStaff(company);
  // 임원(부서 임원·대표/전무/이사 등) — 인사팀이 대신 등록할 때 누구 일정인지 고른다
  const execPeople = allStaff.filter((u) => u.team === "임원" || /대표|사장|전무|상무|이사/.test(String(u.position || "")));
  const today = kstToday();
  const [ym, setYm] = React.useState(today.slice(0, 7));
  const [pick, setPick] = React.useState(today);
  const [who, setWho] = React.useState("전체");
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const people = ["전체", ...Array.from(new Set(list.map((e) => e.name).filter(Boolean)))];
  const shown = list.filter((e) => who === "전체" || e.name === who);
  const by = {}; shown.forEach((e) => daysOf(e).forEach((d) => { (by[d] = by[d] || []).push(e); }));
  Object.values(by).forEach((l) => l.sort((a, b) => String(a.start || "").localeCompare(String(b.start || ""))));
  const first = new Date(`${ym}-01T00:00:00Z`); const startDow = first.getUTCDay();
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((startDow + dim) / 7) * 7 }, (_, i) => { const n = i - startDow + 1; return n >= 1 && n <= dim ? `${ym}-${String(n).padStart(2, "0")}` : null; });
  const move = (n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setYm(d.toISOString().slice(0, 7)); };
  const upcoming = shown.filter((e) => (e.endDate || e.date) >= today).sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || ""))).slice(0, 8);
  const meIsExec = execPeople.some((u) => u.id === me.uid);
  const blank = (d) => ({ title: "", kind: "회의", date: d || pick, endDate: d || pick, start: "10:00", end: "11:00", place: "", memo: "", ownerUid: meIsExec ? me.uid : (execPeople[0]?.id || "") });
  const save = async () => {
    const e = edit; if (!e.title.trim()) return alert("일정 제목을 입력해 주세요.");
    setBusy(true);
    try {
      const data = { companyName: company, title: e.title.trim(), kind: e.kind, date: e.date, endDate: e.endDate && e.endDate >= e.date ? e.endDate : e.date, start: e.start || "", end: e.end || "", place: e.place.trim(), memo: e.memo.trim() };
      const { doc: fdoc, addDoc, updateDoc, serverTimestamp } = await import("firebase/firestore");
      const owner = execPeople.find((u) => u.id === e.ownerUid);
      const who = owner ? { uid: owner.id, name: personName(owner) || owner.name || "", position: owner.position || "" } : (e.id ? {} : { uid: me.uid || "", name: me.name || "", position: me.position || "" });
      const byMe = owner && owner.id !== me.uid ? { writerUid: me.uid || "", writerName: me.name || "" } : {};
      if (e.id) await updateDoc(fdoc(db, "execSchedules", e.id), { ...data, ...who, ...byMe, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "execSchedules"), { ...data, ...who, ...byMe, createdAt: serverTimestamp() });
      setEdit(null);
    } finally { setBusy(false); }
  };
  const remove = async (e) => { if (!window.confirm("이 일정을 지울까요?")) return; const { doc: fdoc, deleteDoc } = await import("firebase/firestore"); await deleteDoc(fdoc(db, "execSchedules", e.id)); setEdit(null); };
  const dayList = by[pick] || [];
  const inpD = "h-12 w-full px-3.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-[15px] font-bold outline-none focus:border-[#D7BC82] placeholder:text-white/30 [color-scheme:dark]";
  return (
    <div className="relative rounded-[26px] overflow-hidden text-white" style={{ background: SHELL_BG }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: GRID }} />
      <div className="relative p-3 md:p-6 space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.32em]" style={{ fontFamily: MONO, color: GOLD }}>EXECUTIVE · SCHEDULE</div>
            <div className="text-[24px] md:text-[30px] font-black mt-1">임원 스케줄</div>
            <div className="text-[13.5px] text-white/55 mt-0.5">{canWrite ? "등록한 일정은 모든 직원이 볼 수 있습니다" : "대표·임원의 회의·외근·출장 일정입니다"}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => move(-1)} className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 font-black">‹</button>
            <span className="h-10 px-4 rounded-xl bg-white text-[#0B1530] font-black grid place-items-center tabular-nums text-[15px]" style={{ fontFamily: MONO }}>{ym.replace("-", ".")}</span>
            <button type="button" onClick={() => move(1)} className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 font-black">›</button>
            {canWrite && <button type="button" onClick={() => setEdit(blank())} className="h-10 px-4 rounded-xl text-[#1A1405] text-[14px] font-black ml-1" style={{ background: "linear-gradient(180deg,#F3E3BC,#D7BC82)" }}>+ 일정 등록</button>}
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {people.map((p) => <button key={p} type="button" onClick={() => setWho(p)} className={`h-9 px-3.5 rounded-full text-[13px] font-black whitespace-nowrap shrink-0 border ${who === p ? "text-[#1A1405] border-transparent" : "text-white/70 border-white/15 bg-white/[0.04]"}`} style={who === p ? { background: "linear-gradient(180deg,#F3E3BC,#D7BC82)" } : undefined}>{p}</button>)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] overflow-hidden">
            <div className="grid grid-cols-7 border-b border-white/[0.08]">{DOW.map((d, i) => <div key={d} className={`py-2.5 text-center text-[13px] font-black ${i === 0 ? "text-[#FFB4A8]" : i === 6 ? "text-[#AFC6F5]" : "text-white/55"}`}>{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const l = d ? by[d] || [] : [];
                return (
                  <button key={i} type="button" disabled={!d} onClick={() => d && setPick(d)} onDoubleClick={() => d && canWrite && setEdit(blank(d))}
                    className={`text-left min-h-[70px] md:min-h-[112px] p-1 md:p-2 border-b border-r border-white/[0.06] ${!d ? "bg-black/10" : pick === d ? "bg-[#D7BC82]/[0.10] ring-1 ring-inset ring-[#D7BC82]/60" : "hover:bg-white/[0.04]"}`}>
                    {d && (
                      <>
                        <div className={`text-[13px] md:text-[14px] font-black tabular-nums ${d === today ? "w-7 h-7 rounded-full grid place-items-center text-[#1A1405]" : i % 7 === 0 ? "text-[#FFB4A8]" : i % 7 === 6 ? "text-[#AFC6F5]" : "text-white/85"}`} style={{ fontFamily: MONO, ...(d === today ? { background: GOLD } : {}) }}>{Number(d.slice(8))}</div>
                        <div className="hidden md:block mt-1 space-y-1">
                          {l.slice(0, 3).map((e) => <div key={`${e.id}${d}`} className="rounded-md px-1.5 py-[2px] text-[11.5px] font-bold truncate bg-white/[0.08] border-l-2" style={{ borderColor: KIND_DOT[e.kind] || GOLD }}>{e.start ? `${e.start} ` : ""}{e.name} · {e.title}</div>)}
                          {l.length > 3 && <div className="text-[11px] text-white/50 px-1">+{l.length - 3}</div>}
                        </div>
                        {l.length > 0 && <div className="md:hidden mt-1 flex gap-0.5 flex-wrap">{l.slice(0, 4).map((e) => <span key={`${e.id}${d}`} className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_DOT[e.kind] || GOLD }} />)}</div>}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-4">
            <Panel en="DAY DETAIL" title={`${pick.replace(/-/g, ".")} (${DOW[new Date(`${pick}T00:00:00Z`).getUTCDay()]})`}>
              {!dayList.length ? <div className="py-6 text-center text-[14px] font-bold text-white/40">일정이 없습니다{canWrite ? " · 날짜를 두 번 누르면 등록" : ""}</div> : dayList.map((e) => (
                <button key={e.id} type="button" disabled={!canWrite} onClick={() => setEdit({ ...blank(), ...e })} className="w-full text-left rounded-2xl bg-white/[0.05] border border-white/[0.08] px-3.5 py-3 mb-2 enabled:hover:bg-white/[0.09]">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: KIND_DOT[e.kind] || GOLD }} /><span className="text-[12px] font-black text-white/60">{e.kind}</span><span className="ml-auto text-[13px] font-black tabular-nums text-white/80" style={{ fontFamily: MONO }}>{e.start}{e.end ? `–${e.end}` : ""}</span></div>
                  <div className="text-[16px] font-black mt-1">{e.title}</div>
                  <div className="text-[13px] text-white/55 mt-0.5">{[`${e.name} ${e.position || ""}`.trim(), e.place].filter(Boolean).join(" · ")}</div>
                  {e.memo && <div className="text-[12.5px] text-white/45 mt-1">{e.memo}</div>}
                </button>
              ))}
            </Panel>
            <Panel en="UPCOMING" title="다가오는 일정">
              {!upcoming.length ? <div className="py-4 text-[14px] font-bold text-white/40">예정된 일정이 없습니다</div> : upcoming.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2 border-b border-white/[0.06] last:border-b-0">
                  <span className="w-12 shrink-0 text-center"><span className="block text-[11px] font-black text-white/45">{DOW[new Date(`${e.date}T00:00:00Z`).getUTCDay()]}</span><span className="block text-[17px] font-black tabular-nums" style={{ fontFamily: MONO }}>{e.date.slice(5).replace("-", ".")}</span></span>
                  <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-black truncate">{e.title}</span><span className="block text-[12.5px] text-white/50 truncate">{e.name} · {e.kind}{e.start ? ` · ${e.start}` : ""}</span></span>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      </div>
      {edit && (
        <div className="fixed inset-0 z-[100000] bg-black/55 flex justify-end" onClick={() => setEdit(null)}>
          <div className="h-full w-full md:w-[560px] flex flex-col text-white shadow-[-24px_0_60px_rgba(0,0,0,0.5)]" style={{ background: SHELL_BG }} onClick={(ev) => ev.stopPropagation()}>
            <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
              <div className="flex-1"><div className="text-[11px] font-extrabold tracking-[0.3em]" style={{ fontFamily: MONO, color: GOLD }}>{edit.id ? "EDIT SCHEDULE" : "NEW SCHEDULE"}</div><div className="text-[22px] font-black">{edit.id ? "일정 수정" : "일정 등록"}</div></div>
              <button type="button" onClick={() => setEdit(null)} className="w-10 h-10 rounded-xl bg-white/10">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {execPeople.length > 0 && (
                <div><div className="text-[13px] font-black text-white/70 mb-1.5">누구 일정인가요 <span className="text-white/40 font-bold">(인사팀이 대신 등록 가능)</span></div>
                  <div className="flex flex-wrap gap-1.5">{execPeople.map((u) => <button key={u.id} type="button" onClick={() => setEdit((p) => ({ ...p, ownerUid: u.id }))} className={`h-10 px-4 rounded-xl text-[14px] font-black ${(edit.ownerUid || (edit.uid && edit.uid === u.id ? u.id : "")) === u.id || (!edit.ownerUid && edit.uid === u.id) ? "text-[#1A1405]" : "bg-white/[0.06] border border-white/10 text-white/80"}`} style={(edit.ownerUid === u.id || (!edit.ownerUid && edit.uid === u.id)) ? { background: `linear-gradient(180deg,#F1DFB4,${GOLD})` } : undefined}>{personName(u) || u.name} <span className="text-[12px] opacity-70">{u.position}</span></button>)}</div>
                </div>
              )}
              <div><div className="text-[13px] font-black text-white/70 mb-1.5">제목</div><input value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} className={inpD} placeholder="예: ○○물류 대표 미팅" /></div>
              <div><div className="text-[13px] font-black text-white/70 mb-1.5">구분</div><div className="flex flex-wrap gap-1.5">{EXEC_KINDS.map((k) => <button key={k} type="button" onClick={() => setEdit((p) => ({ ...p, kind: k }))} className={`h-10 px-4 rounded-full text-[14px] font-black border ${edit.kind === k ? "text-[#1A1405] border-transparent" : "text-white/70 border-white/15"}`} style={edit.kind === k ? { background: "linear-gradient(180deg,#F3E3BC,#D7BC82)" } : undefined}>{k}</button>)}</div></div>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-[13px] font-black text-white/70 mb-1.5">시작일</div><CustomDatePicker value={edit.date} onChange={(e) => setEdit((p) => ({ ...p, date: e.target.value, endDate: !p.endDate || p.endDate < e.target.value ? e.target.value : p.endDate }))} className={inpD} showIcon /></div>
                <div><div className="text-[13px] font-black text-white/70 mb-1.5">종료일</div><CustomDatePicker value={edit.endDate} onChange={(e) => setEdit((p) => ({ ...p, endDate: e.target.value && e.target.value < p.date ? p.date : e.target.value }))} className={inpD} showIcon /></div>
                <div><div className="text-[13px] font-black text-white/70 mb-1.5">시작 시각</div><TimePick value={edit.start} onChange={(v) => setEdit((p) => ({ ...p, start: v, end: p.end && p.end <= v ? addMin(v, 60) : p.end }))} /></div>
                <div><div className="text-[13px] font-black text-white/70 mb-1.5">종료 시각</div><TimePick value={edit.end} onChange={(v) => setEdit((p) => ({ ...p, end: v }))} /></div>
              </div>
              <div><div className="text-[13px] font-black text-white/70 mb-1.5">장소</div><input value={edit.place} onChange={(e) => setEdit((p) => ({ ...p, place: e.target.value }))} className={inpD} placeholder="예: 본사 2층 회의실" /></div>
              <div><div className="text-[13px] font-black text-white/70 mb-1.5">메모</div><textarea value={edit.memo} onChange={(e) => setEdit((p) => ({ ...p, memo: e.target.value }))} rows={4} className={`${inpD} h-auto py-3`} placeholder="참석자·준비 사항 등" /></div>
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
              {edit.id && <button type="button" onClick={() => remove(edit)} className="h-12 px-4 rounded-xl border border-white/15 text-[14px] font-bold text-[#FFB4A8]">삭제</button>}
              <button type="button" onClick={() => setEdit(null)} className="h-12 px-5 rounded-xl border border-white/15 text-[14px] font-bold text-white/80">취소</button>
              <button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl text-[#1A1405] text-[15px] font-black disabled:opacity-50" style={{ background: "linear-gradient(180deg,#F3E3BC,#D7BC82)" }}>{busy ? "저장 중…" : "저장 · 전 직원 공개"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
