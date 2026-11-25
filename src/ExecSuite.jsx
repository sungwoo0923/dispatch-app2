// ======================= src/ExecSuite.jsx =======================
// 👔 임원 화면(2026-10-31) — 대표·전무·이사(부서 "임원")가 로그인하면 보는 경영 화면. PC·모바일 공용(반응형).
//  · 경영 브리핑(ExecDashboard): 오늘의 한 줄 브리핑 · 이번 달 매출/이익/월말 예상 · 올해 월별 추이 · 나의 결재 대기
//    · 오늘의 현장(오더·미배차) · 오늘의 사람(출근·부재) · 주의 신호(결재 지연·거래처 쏠림·이익률 하락·기사 서류)
//    · 거래처 TOP 5 · 이번 주 부재 일정
//  · 결재함(ExecApprovals): 최종 결재자 화면 — 결재 현황 요약 + 전자결재(결재함·기안함·결재선·인수인계)
//  · 직원 일정(TeamSchedule): 연차·반차·외근·출장·병가·경조사를 달력으로(결재 완료 = 확정, 진행 중 = 점선)
//  매출 통계는 홈과 같은 방식 — 올해 지난 기간 합계(하루 1번 계산·저장, homePastStats v4) + 최근 실시간 오더.
import { OrdersWeatherDeck } from "./publicDataMain"; // 🌦 2026-11-18 운행 지역 날씨(골드)
import React from "react";
import { arrowFocus } from "./useListKeys";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from "recharts";
import { db, DEFAULT_COMPANY } from "./firebase";
import { ShellIcon } from "./AdminShell";
import KpSubNav from "./KpSubNav";
import CustomDatePicker from "./CustomDatePicker";
import ApprovalCenter, { myTurn, useApprovalCounts, useApprovalSettings, setAutoApproveDaily } from "./Approval";
import HandoverCenter, { useHandoverUnread } from "./HandoverCenter";
import { approvalNavItems } from "./menuTree"; // ⭐ 2026-11-10 메뉴 통일
const ContractStudioX = React.lazy(() => import("./ContractStudio")); // ⭐ 2026-11-10 부서·임원 화면 전자결재 › 계약서
import { buildPastStats } from "./HomeDeck";
import { fkNum } from "./forkliftCore";
import { useRouteCarrierFilter } from "./routeCarriers"; // ⭐ 2026-11-05 고정노선 운송업체 설정(끈 업체 오더는 매출에서 뺌)
import { pcLiveWindowStart, pcPrevDay, useOrderHistory } from "./orderHistory";
import { isUnassignedOrder } from "./unassignedRule"; // ⭐ 2026-11-07 미배차 공용 기준
import { isTMUser } from "./staffFilter";
import { personName } from "./userNames";
import { useCompanyDriverDocs, docProblems } from "./driverRequiredDocs";
import { useFundsSummary, isCeoPosition } from "./FundsBoard";
import { AttendanceQuickButton } from "./attendanceQuick";
import { getNationalHolidayLabel } from "./attendanceUtils";
import AttendanceApprovalInbox from "./AttendanceApprovalInbox";
import { PersonalSchedule, PersonalModeSwitch, usePersonalMode, birthdaysOn, BirthChip } from "./PersonalSchedule"; // ⭐ 2026-11-03 개인일정·생일
import { kpConfirm } from "./kpDialog";
import { profitColor, profitRateColor } from "./marginPct"; // ⭐ 2026-11-17 이익 색(플러스 빨강 · 마이너스 파랑)
// 👑 2026-11-17 임원 디자인 시스템(남색 + 골드) · 경영 브리핑 계산
import { EX, EX_NUM, EX_FONT, GOLD_GRAD, GoldRule, ExecPage, ExecPanel, ExecKpis, ExecGrid, ExecTabs, Num, Money, Delta, Eyebrow, Meter, Ring, RankBars, Chip, Empty, ExecClock, Legend, chartTheme, ExecTooltip, useBoxWidth, useExecMode, moneyParts, fmtWon, fmtMoney, fmtEokMan, fmtPct, pctChange } from "./execUi";
import { monthPipeline, laborByMonth, teamComposition, teamContribution, attendanceToday, briefSentences, TEAM_NONE } from "./execBriefingCore";
import { liveRows, monthsBack } from "./execAnalyticsCore";
import { staffRanking, monthSpans } from "./dailyReportCore";
import { receivablesOf } from "./arAging";
import { useUserNameMap, orderStaffNameRaw, ORDER_MGR_FIXED } from "./detailGetters";
import { useCompanyRows } from "./companyColStore";
import { loadAcctPayments } from "./acctPayments";
import { computeFunds } from "./fundsCalc";
import { isDemoOn } from "./devDemoData";
import { execAnalyticsDemo } from "./execAnalyticsDemo";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const GOLD = "#D7BC82";
const ICE = "#8FB0F0";
const toWon = (v) => fkNum(v); // 🛠 2026-11-25 수익(orderProfit)과 같은 금액 읽기
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
  const carrierF = useRouteCarrierFilter(company); // ⭐ 2026-11-05
  const [past, setPast] = React.useState(() => pastCache || readPastCache(company, ls));
  React.useEffect(() => { if (pastCache) setPast(pastCache); }, [pastCache]);
  React.useEffect(() => {
    if (pastCache || !company || !carrierF.ready) return undefined;
    if (past && (past.cs || "") === carrierF.sig) return undefined; // ⭐ 2026-11-05 운송업체 설정이 바뀌면 다시 계산
    let alive = true;
    const y = new Date().getFullYear();
    Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", `${y}-01-01`), where("상차일", "<=", pcPrevDay(ls))))))
      .then((snaps) => {
        const rows = snaps.flatMap((sn) => sn.docs.map((d) => d.data() || {})).filter((r) => (r.companyName || DEFAULT_COMPANY) === company && r.source !== "transport_transmit" && !isCancelled(r) && carrierF.isCountable(r));
        const thisMonth = kstToday().slice(0, 7);
        const sum = rows.reduce((a, r) => ({ year: a.year + toWon(r.청구운임) }), { year: 0 });
        const c = { ...sum, ...buildPastStats(rows, thisMonth), v: 4, company, liveStart: ls, calYear: y, savedAt: Date.now(), cs: carrierF.sig };
        if (alive) setPast(c);
      })
      .catch(() => { if (alive) setPast({ days: {}, clients: {}, month: "", cs: carrierF.sig }); });
    return () => { alive = false; };
  }, [company, ls, carrierF.ready, carrierF.sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return React.useMemo(() => {
    const thisMonth = kstToday().slice(0, 7);
    const liveRows = (dispatchData || []).filter((r) => !isCancelled(r) && r.source !== "transport_transmit" && dateOf(r) >= ls && carrierF.isCountable(r)); // ⭐ 2026-11-05
    const live = buildPastStats(liveRows, thisMonth);
    const days = {};
    Object.entries(past?.days || {}).forEach(([d, v]) => { if (d < ls) days[d] = [...v]; });
    Object.entries(live.days).forEach(([d, v]) => { const e = days[d] || (days[d] = [0, 0, 0]); e[0] += v[0]; e[1] += v[1]; e[2] += v[2]; });
    const clients = {};
    if (past?.month === thisMonth) Object.entries(past.clients || {}).forEach(([k, v]) => { clients[k] = (clients[k] || 0) + v; });
    Object.entries(live.clients).forEach(([k, v]) => { clients[k] = (clients[k] || 0) + v; });
    return { days, clients, ready: !!past };
  }, [past, dispatchData, ls, carrierF]);
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
// ⭐ 2026-11-02 점검 — 직원 일정용: cat==leave 조건을 붙여야 일반 직원·경리·조회전용도 보안 규칙상 조회 가능(전체 approvals 조회는 거부되어 빈 달력)
const useLeaveApprovalsOf = (company) => useCompanyQuery("approvals", company, "company", { cat: "leave" }) || [];
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

// ─────────────────────────── 디자인 조각(다크 · 임원 — src/execUi.jsx 디자인 시스템) ───────────────────────────
// 바탕(남색 + 은은한 격자) — 결재함 · 직원 일정처럼 밝은 화면 안에 들어가는 임원용 띠에 쓴다
const SHELL_BG = `radial-gradient(1200px 500px at 85% -10%, rgba(215,188,130,.10), transparent 60%), radial-gradient(900px 500px at -10% 10%, rgba(75,108,183,.18), transparent 55%), linear-gradient(180deg, ${EX.bg1}, ${EX.bg0})`;
const GRID = "linear-gradient(rgba(143,176,240,.045) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(143,176,240,.045) 1px, transparent 1px) 0 0/28px 28px";
// 직원 일정(다른 부서 화면) 머리 — 예전 모양 그대로
const SHELL_BG_OLD = "radial-gradient(1200px 500px at 85% -10%, rgba(110,149,232,.22), transparent 60%), radial-gradient(900px 400px at -10% 110%, rgba(215,188,130,.10), transparent 60%), linear-gradient(160deg,#060C1A 0%,#0B1530 45%,#0E1C3C 100%)";
const GRID_OLD = "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/26px 26px";
const demoOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const pColor = (v) => profitColor(v, { dark: true, neutral: EX.text });
const rColor = (v) => profitRateColor(v, { dark: true, neutral: EX.sub });
// 작은 꼬리 글씨(근거 · 기준)
const Basis = ({ children, className = "" }) => <div className={`text-[12px] font-semibold leading-relaxed ${className}`} style={{ color: EX.mute }}>{children}</div>;
// 패널 머리 오른쪽 링크
const GoLink = ({ children, onClick }) => <button type="button" onClick={onClick} className="h-9 px-3 rounded-xl text-[12.5px] font-extrabold whitespace-nowrap transition hover:brightness-125" style={{ color: EX.sub, background: "rgba(255,255,255,.04)", border: `1px solid ${EX.line}` }}>{children} ›</button>;
// 축 금액(억 · 만)
const axisMoney = (v) => { const a = Math.abs(v); if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, "")}억`; if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString("ko-KR")}만`; return `${v}`; };

// 요소 폭(줄이지 않은 실제 값 — execUi useBoxWidth 는 200 아래를 200으로 본다)
function useRawWidth() {
  const ref = React.useRef(null); const [w, setW] = React.useState(0);
  React.useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === "undefined") return undefined; const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w];
}
// 핵심 숫자 타일 — execUi Kpi 와 같은 모양에 "값 색(이익 빨강/파랑)"과 "오른쪽 게이지" 자리를 더했다
function BTile({ en, label, money, value, unit, color, accent = false, delta, deltaLabel, deltaSuffix = "%", foot, side, onClick, title, testId, muted = false }) {
  const parts = money != null ? moneyParts(money) : [value, unit];
  const Tag = onClick ? "button" : "div";
  const [rowRef, rowW] = useRawWidth(); // 오른쪽 게이지는 숫자와 겹치지 않을 만큼 넓을 때만
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={title} data-testid={testId}
      className={`relative flex flex-col justify-start text-left rounded-[20px] p-4 md:p-5 min-w-0 overflow-hidden transition ${onClick ? "hover:-translate-y-0.5 cursor-pointer" : ""}`}
      style={{ background: accent ? "linear-gradient(160deg, rgba(215,188,130,.16), rgba(215,188,130,.04) 55%, rgba(255,255,255,.02))" : EX.panel, border: `1px solid ${accent ? EX.lineHi : EX.line}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)" }}>
      {accent && <div className="absolute top-0 left-5 right-5 h-px" style={{ background: GOLD_GRAD }} />}
      {en && <Eyebrow color={accent ? EX.gold : EX.ice} size={10}>{en}</Eyebrow>}
      <div className="mt-1 text-[13px] md:text-[13.5px] font-bold truncate" style={{ color: EX.sub }}>{label}</div>
      <div ref={rowRef} className="mt-2.5 flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">{muted ? <span className="text-[16px] md:text-[17px] font-black" style={{ color: EX.mute }}>{value}</span> : <Num value={parts[0]} unit={parts[1]} size={accent ? 34 : 30} color={color || (accent ? EX.goldHi : EX.text)} />}</div>
        {side && rowW >= 150 && <div className="shrink-0 -my-2">{side}</div>}
      </div>
      {delta !== undefined && <div className="mt-2.5"><Delta v={delta} label={deltaLabel} suffix={deltaSuffix} size={12.5} /></div>}
      {foot && <div className={`${delta !== undefined ? "mt-1" : "mt-2.5"} text-[12px] font-semibold truncate`} style={{ color: EX.mute }}>{foot}</div>}
    </Tag>
  );
}

// 작은 통계 칸(패널 안)
function Stat({ label, children, sub, tone }) {
  return (
    <div className="rounded-2xl px-3 md:px-3.5 py-3 min-w-0" style={{ background: "rgba(255,255,255,.035)", border: `1px solid ${tone === "warn" ? "rgba(245,196,107,.35)" : EX.line}` }}>
      <div className="text-[12px] font-bold whitespace-nowrap truncate" style={{ color: EX.mute }}>{label}</div>
      <div className="mt-1.5">{children}</div>
      {sub && <div className="mt-1 text-[11.5px] font-semibold truncate" style={{ color: EX.faint }}>{sub}</div>}
    </div>
  );
}

// 사업 흐름 — 오더 접수 → 배차완료 → 청구 → 입금 → 기사 지급 → 매출총이익
//  넓으면 한 줄(단계 사이 ›), 중간이면 2~3칸, 폰처럼 좁으면 한 단계 한 줄(왼쪽 이름 · 오른쪽 숫자)
function FlowValue({ step, size }) {
  return step.money != null ? <Money v={step.money} size={size} color={step.color || EX.text} /> : <Num value={step.value} unit={step.unit} size={size} color={step.color || EX.text} />;
}
function FlowNode({ i, n, step, mode }) {
  const box = { background: step.hero ? "linear-gradient(160deg, rgba(215,188,130,.16), rgba(215,188,130,.03))" : "rgba(255,255,255,.035)", border: `1px solid ${step.hero ? EX.lineHi : EX.line}` };
  const badge = <span className="w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-[10.5px] font-black" style={{ ...EX_NUM, background: step.hero ? GOLD_GRAD : "rgba(143,176,240,.14)", color: step.hero ? "#1A1408" : EX.ice }}>{i + 1}</span>;
  const rate = step.rate != null && <span className="shrink-0 text-[11.5px] font-black whitespace-nowrap" style={{ ...EX_NUM, color: step.rateColor || EX.goldHi }}>{step.rateLabel} {fmtPct(step.rate)}</span>;
  if (mode === "list") {
    return (
      <div className="rounded-2xl px-3.5 py-3" style={box}>
        <div className="flex items-center gap-3 min-w-0">
          {badge}
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-extrabold truncate" style={{ color: EX.text }}>{step.label}</div>
            <div className="text-[11.5px] font-semibold truncate" style={{ color: EX.mute }}>{step.sub}</div>
          </div>
          <div className="shrink-0 text-right">
            <FlowValue step={step} size={20} />
            {rate && <div className="mt-1">{rate}</div>}
          </div>
        </div>
        {step.meter != null && <div className="mt-2 ml-[34px]"><Meter value={step.meter} max={100} height={3} color={step.meterColor || EX.gold} /></div>}
      </div>
    );
  }
  return (
    <div className="relative min-w-0 flex">
      <div className="relative flex-1 min-w-0 rounded-[18px] px-4 py-3.5" style={box}>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 min-w-0">{badge}<span className="text-[13px] font-extrabold truncate" style={{ color: EX.sub }}>{step.label}</span></span>
          {rate}
        </div>
        <div className="mt-2.5"><FlowValue step={step} size={mode === "row" ? 26 : 24} /></div>
        {step.meter != null && <div className="mt-2.5"><Meter value={step.meter} max={100} height={4} color={step.meterColor || EX.gold} /></div>}
        <div className="mt-2 text-[11.5px] font-semibold truncate" style={{ color: EX.mute }}>{step.sub}</div>
      </div>
      {mode === "row" && i < n - 1 && <span aria-hidden className="absolute top-1/2 -right-[13px] z-10 w-[18px] h-[18px] -translate-y-1/2 grid place-items-center rounded-full text-[11px] font-black" style={{ background: EX.bg1, border: `1px solid ${EX.lineHi}`, color: EX.gold }}>›</span>}
    </div>
  );
}
function BusinessFlow({ steps }) {
  const [ref, w] = useBoxWidth(1200);
  const mode = w >= 1080 ? "row" : w >= 600 ? "grid" : "list";
  const cols = mode === "row" ? steps.length : mode === "grid" ? (w >= 820 ? 3 : 2) : 1;
  return (
    <div ref={ref} className={`grid ${mode === "row" ? "gap-[18px]" : mode === "grid" ? "gap-3" : "gap-2"}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {steps.map((s, i) => <FlowNode key={s.label} i={i} n={steps.length} step={s} mode={mode} />)}
    </div>
  );
}
// 매출 = 매입(기사 지급) + 매출총이익 — 한 줄 막대
function SplitBar({ sale, cost, profit }) {
  if (!sale) return null;
  const c = Math.max(0, Math.min(100, (cost / sale) * 100)); const p = Math.max(0, 100 - c);
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.06)" }}>
        <div style={{ width: `${c}%`, background: `linear-gradient(90deg, ${EX.iceDeep}, ${EX.ice})` }} />
        <div style={{ width: `${p}%`, background: GOLD_GRAD, boxShadow: "0 0 14px rgba(215,188,130,.35)" }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap text-[12px] font-bold" style={{ color: EX.sub }}>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: EX.ice }} />매입(운송원가) <b style={{ ...EX_NUM, color: EX.text }}>{fmtPct(c)}</b></span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: EX.gold }} />매출총이익 <b style={{ ...EX_NUM, color: rColor(profit) }}>{fmtPct(sale ? (profit / sale) * 100 : null)}</b></span>
      </div>
    </div>
  );
}
// 팀 구성 — 한 줄 쌓은 막대 + 범례
function TeamStack({ teams, total }) {
  if (!total) return <Empty text="재직 직원 정보가 없습니다" sub="인사관리부에서 직원 소속 팀을 등록하면 표시됩니다." />;
  return (
    <div>
      <div className="flex h-3.5 rounded-full overflow-hidden gap-[2px]">
        {teams.map((t, i) => <div key={t.team} title={`${t.team} ${t.n}명`} style={{ width: `${(t.n / total) * 100}%`, background: EX.series[i % EX.series.length], opacity: t.team === TEAM_NONE ? 0.35 : 0.92 }} />)}
      </div>
      <div className="mt-3 grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(132px,100%), 1fr))" }}>
        {teams.map((t, i) => (
          <div key={t.team} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: EX.series[i % EX.series.length], opacity: t.team === TEAM_NONE ? 0.35 : 1 }} />
            <span className="text-[13px] font-bold truncate" style={{ color: EX.sub }}>{t.team}</span>
            <span className="ml-auto text-[13.5px] font-black" style={{ ...EX_NUM, color: EX.text }}>{t.n}<span className="text-[11.5px] font-bold ml-0.5" style={{ color: EX.mute }}>명</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── 경영 브리핑(회사 종합 현황판) ───────────────────────────
//  위에서 아래로 "시작 → 과정 → 결과": 인사 · 한 줄 요약 → 핵심 숫자 → 이번 달 사업 흐름 → 조직 · 인건비 / 팀 · 담당자 기여
//  → 월별 추이 / 결재 대기 → 주의 신호 / 거래처 TOP
export function ExecDashboard({ company, dispatchData = [], onGo, pastCache, liveStart, me = {}, att = null }) {
  const demo = React.useMemo(() => (demoOn() ? execAnalyticsDemo(company) : null), [company]);
  const today = kstToday();
  const year = today.slice(0, 4);
  const thisMonth = today.slice(0, 7);
  const prevMonth = (() => { const d = new Date(`${thisMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const data = demo ? demo.rows : dispatchData;
  const demoPast = React.useMemo(() => (demo ? { days: {}, clients: {}, month: "", cs: "" } : null), [demo]);
  const { days, clients, ready } = useYearDays({ company, dispatchData: data, pastCache: demo ? demoPast : pastCache, liveStart: demo ? `${year}-01-01` : liveStart });
  const co = demo ? "" : company;
  const meX = demo ? { ...demo.me, ...Object.fromEntries(Object.entries(me || {}).filter(([, v]) => v)) } : me || {};
  const isCeo = isCeoPosition(meX?.position);
  const apSet = useApprovalSettings(company);
  const autoDaily = apSet.autoApproveDaily === true;
  const fundsLive = useFundsSummary(company, isCeo && !demo);
  const F = React.useMemo(() => (demo ? { ready: true, has: true, ...computeFunds(demo.funds, demo.ledger) } : fundsLive), [demo, fundsLive]);
  const apLive = useApprovalsOf(co);
  const approvals = demo ? demo.approvals : apLive;
  const staffLive = useStaff(co);
  const staff = React.useMemo(() => (demo ? demo.people.filter((p) => p.employmentStatus !== "퇴사").map((p) => ({ ...p, id: p.uid })) : staffLive.staff), [demo, staffLive.staff]);
  const drivers = staffLive.drivers;
  const attLive = useCompanyQuery("attendance", co, "companyName", { date: today }) || [];
  const attendance = demo ? demo.attendance[today] || [] : attLive;
  const docsBy = useCompanyDriverDocs(co);
  const ledgerLive = useCompanyRows("acctLedger", co);
  const ledger = demo ? demo.ledger : ledgerLive || [];
  const fixedLive = useCompanyRows("fixedClients", co);
  const [range, setRange] = React.useState("year");
  const [contribTab, setContribTab] = React.useState("team");

  // 올해 오더(사업 흐름 · 담당자 기여 · 미수금) — 경영 분석과 같은 방식으로 기간을 불러온다(한 번 받은 기간은 다시 받지 않는다)
  const { loadRange } = useOrderHistory() || {};
  const loadFrom = [`${year}-01-01`, `${prevMonth}-01`].sort()[0];
  const [yearLoaded, setYearLoaded] = React.useState(!!demo);
  React.useEffect(() => {
    if (demo || !loadRange) return undefined;
    let alive = true;
    Promise.resolve(loadRange(loadFrom, today)).then((r) => { if (alive && r !== null) setYearLoaded(true); }).catch(() => {});
    return () => { alive = false; };
  }, [demo, loadRange, loadFrom, today]);
  const [arPay, setArPay] = React.useState(null);
  React.useEffect(() => {
    if (demo) { setArPay(demo.arPayments); return undefined; }
    if (!company) return undefined;
    let alive = true;
    loadAcctPayments(db, Number(year), company).then((d) => { if (alive) setArPay(d.ar || {}); }).catch(() => { if (alive) setArPay(null); });
    return () => { alive = false; };
  }, [demo, company, year]);
  const carrierF = useRouteCarrierFilter(company);
  const rows = React.useMemo(() => liveRows(data).filter((r) => carrierF.isCountable(r)), [data, carrierF]);

  // ── 매출 · 이익(홈과 같은 집계: 지난 기간 저장값 + 실시간) ──
  const dayNo = Number(today.slice(8, 10));
  const dim = new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 0)).getUTCDate();
  const sumWhere = (fn) => Object.entries(days).reduce((a, [d, v]) => (fn(d) ? [a[0] + v[0], a[1] + v[1], a[2] + v[2]] : a), [0, 0, 0]);
  const [mSale, mProfit, mCnt] = sumWhere((d) => d.startsWith(thisMonth));
  const [pSale, pProfit] = sumWhere((d) => d.startsWith(prevMonth) && Number(d.slice(8, 10)) <= dayNo);
  const [ySale, yProfit, yCnt] = sumWhere((d) => d.startsWith(year));
  const prevAvail = prevMonth.slice(0, 4) === year;
  const mMargin = mSale ? (mProfit / mSale) * 100 : null;
  const pMargin = pSale ? (pProfit / pSale) * 100 : null;
  const yMargin = ySale ? (yProfit / ySale) * 100 : null;
  const forecast = dayNo ? (mSale / dayNo) * dim : 0;
  const [pFullSale] = sumWhere((d) => d.startsWith(prevMonth));
  const md = prevAvail ? pctChange(mSale, pSale) : null;
  const monthSale = (ym) => sumWhere((d) => d.startsWith(ym))[0];

  const monthlyAll = Array.from({ length: Number(thisMonth.slice(5, 7)) }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    const [s, p] = sumWhere((d) => d.startsWith(m));
    return { k: `${i + 1}월`, m, sale: s, profit: p, margin: s ? (p / s) * 100 : null, cur: m === thisMonth };
  });
  const firstOn = monthlyAll.findIndex((x) => x.sale > 0);
  const monthly = firstOn > 0 ? monthlyAll.slice(firstOn) : monthlyAll;
  const daily = Array.from({ length: 30 }, (_, i) => { const d = addDay(today, i - 29); const v = days[d] || [0, 0, 0]; return { k: d.slice(5).replace("-", "."), sale: v[0], profit: v[1] }; });

  // ── 이번 달 사업 흐름 ──
  const pipe = React.useMemo(() => monthPipeline(rows, thisMonth, today), [rows, thisMonth, today]);
  const todayRows = (data || []).filter((r) => dateOf(r) === today && !isCancelled(r) && r.source !== "transport_transmit");
  const doneToday = todayRows.filter((r) => String(r.배차상태 || "").trim() === "배차완료");
  const unassigned = todayRows.filter(isUnassignedOrder);
  const todaySale = (days[today] || [0])[0];

  // ── 미수금(회계관리 · 경영 분석과 같은 계산 — 올해 배차완료 + 고정거래처, 부가세 포함 − 수금 기록) ──
  const ar = React.useMemo(() => {
    if (!arPay || !yearLoaded) return null;
    const list = receivablesOf({ orders: rows, fixedRows: demo ? [] : fixedLive || [], paid: arPay, today }).filter((x) => x.outstanding > 0);
    const total = list.reduce((s, x) => s + x.outstanding, 0);
    const over30 = list.reduce((s, x) => s + (x.aging?.b60 || 0) + (x.aging?.b90 || 0) + (x.aging?.over || 0), 0);
    return { total, over30, clients: list.length };
  }, [arPay, yearLoaded, rows, fixedLive, demo, today]);

  // ── 결재 ──
  const meUid = meX?.uid;
  const mine = approvals.filter((a) => myTurn(a, meUid)).sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  const pendingAll = approvals.filter((a) => a.status === "pending");
  const late = pendingAll.filter((a) => Date.now() - tsMs(a.createdAt) > 48 * 3600e3);
  const expMonth = approvals.filter((a) => a.cat === "expense" && a.status === "approved" && new Date(tsMs(a.createdAt) + 9 * 3600e3).toISOString().startsWith(thisMonth)).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  // ── 사람 ──
  const evs = approvals.flatMap(eventsOf);
  const awayToday = evs.filter((e) => e.date === today && !/조퇴|지각/.test(e.label));
  const awayUniq = [...new Map(awayToday.map((e) => [e.uid, e])).values()];
  const attToday = attendanceToday(staff, attendance, awayUniq.filter((e) => e.status === "approved").map((e) => e.uid));
  const teams = teamComposition(staff);
  const week = Array.from({ length: 7 }, (_, i) => addDay(today, i));
  const weekEvs = evs.filter((e) => week.includes(e.date));

  // ── 인건비(회계 장부 기준) ──
  const laborMonths = monthsBack(thisMonth, 6);
  const labor = React.useMemo(() => laborByMonth(ledger, laborMonths), [ledger, laborMonths.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const laborBase = labor[4]?.total ? labor[4] : labor[5]?.total ? labor[5] : null; // 지난달(다 마감된 달) 우선
  const laborBaseSale = laborBase && laborBase.m.slice(0, 4) === year ? monthSale(laborBase.m) : 0;
  const laborAccs = laborBase ? Object.entries(laborBase.byAcc).sort((a, b) => b[1] - a[1]) : [];

  // ── 팀 · 담당자 기여(일일 경영 보고와 같은 담당자 기준) ──
  const nameMap = useUserNameMap();
  const staffOf = React.useCallback((r) => { const n = orderStaffNameRaw(r, nameMap); return (n && n !== ORDER_MGR_FIXED ? n : "") || String(r?.배차확정자 || "").trim() || n || "미지정"; }, [nameMap]);
  const teamByName = React.useMemo(() => { const m = {}; staff.forEach((u) => { const n = String(personName(u) || u.name || "").trim(); if (n) m[n] = String(u.team || "").trim(); }); return m; }, [staff]);
  const rank = React.useMemo(() => { const sp = monthSpans(today); return staffRanking(rows, sp.cur, sp.prev, staffOf, (n) => n === "최고관리자"); }, [rows, today, staffOf]);
  const teamRows = React.useMemo(() => teamContribution(rank.list, (n) => teamByName[n] || ""), [rank, teamByName]);

  // ── 거래처 ──
  const topClients = Object.entries(clients).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const clientTotal = Object.values(clients).reduce((s, v) => s + v, 0);
  const topShare = clientTotal && topClients[0] ? (topClients[0][1] / clientTotal) * 100 : 0;
  const docIssue = drivers.filter((d) => { const p = docProblems(docsBy?.[d.id]); return p.missing || p.bad; }).length;

  // ── 주의 신호 ──
  const signals = [
    unassigned.length > 0 && { tone: "bad", t: `오늘 미배차 ${unassigned.length}건`, s: `오늘 오더 ${todayRows.length}건 중 · 아직 배차가 확정되지 않았습니다`, go: null },
    late.length > 0 && { tone: "bad", t: `결재 지연 ${late.length}건`, s: "상신 후 48시간을 초과하여 진행 중입니다", go: "결재함" },
    ar && ar.over30 > 0 && { tone: "warn", t: `30일 초과 미수금 ${fmtEokMan(ar.over30)}`, s: `미수 거래처 ${ar.clients}곳 · 선입선출(오래된 청구부터 수금 반영) 기준`, go: "경영분석" },
    topShare >= 30 && { tone: "warn", t: `거래처 매출 집중도 ${topShare.toFixed(0)}%`, s: `${topClients[0]?.[0]} · 이번 달 매출 비중`, go: "매출관리" },
    prevAvail && pSale > 0 && mSale > 0 && mMargin < pMargin - 2 && { tone: "warn", t: `매출총이익률 ${(pMargin - mMargin).toFixed(1)}%p 하락`, s: `전월 동기 ${pMargin.toFixed(1)}% → 이번 달 ${mMargin.toFixed(1)}%`, go: "인사이트" },
    docIssue > 0 && { tone: "warn", t: `기사 서류 미비 ${docIssue}명`, s: "미제출 · 반려 · 만료 서류가 있습니다", go: null },
    expMonth > 0 && { tone: "info", t: `이번 달 승인 지출 ${fmtEokMan(expMonth)}`, s: "전자결재 비용 · 지출 결의 승인 합계", go: "결재함" },
  ].filter(Boolean);

  // ── 인사 · 한 줄 요약 ──
  const hour = kstNow().getUTCHours();
  const greet = hour < 12 ? "좋은 아침입니다" : hour < 18 ? "좋은 오후입니다" : "오늘도 수고 많으셨습니다";
  const honor = meX?.position ? `${meX.position}님` : "임원님";
  const brief = briefSentences({ mSale, md, prevAvail, mMargin, forecast, pFullSale: prevAvail ? pFullSale : 0, mineCount: mine.length, title: honor, awayCount: awayUniq.length, fmt: fmtEokMan });
  const stamp = `${today.slice(5).replace("-", ".")} ${String(hour).padStart(2, "0")}:${String(kstNow().getUTCMinutes()).padStart(2, "0")}`;

  // ── 사업 흐름 단계(믿을 수 있는 자료가 없는 단계는 뺀다) ──
  const flow = [
    { label: "오더 접수", value: pipe.orders.toLocaleString("ko-KR"), unit: "건", sub: `일평균 ${pipe.perDay.toFixed(1)}건 · ${pipe.days}일 누계` },
    { label: "배차완료", value: pipe.done.toLocaleString("ko-KR"), unit: "건", rate: pipe.doneRate, rateLabel: "완료율", meter: pipe.doneRate ?? 0, meterColor: EX.ice, sub: pipe.open ? `배차 진행 중 ${pipe.open.toLocaleString("ko-KR")}건` : "전 오더 배차완료" },
    { label: "청구 매출", money: pipe.sale, sub: `건당 평균 ${fmtMoney(pipe.perOrder)} · 부가세 별도` },
    pipe.useDeposit && { label: "입금 확인", money: pipe.deposited, rate: pipe.depositRate, rateLabel: "입금률", meter: pipe.depositRate ?? 0, sub: `미입금액 ${fmtMoney(Math.max(0, pipe.sale - pipe.deposited))}` },
    { label: "운송원가", money: pipe.cost, rate: pipe.costRate, rateLabel: "매출 대비", rateColor: EX.ice, ...(pipe.usePay ? { meter: pipe.payRate ?? 0, meterColor: EX.ice, sub: `기사운임 지급률 ${fmtPct(pipe.payRate)}` } : { sub: "기사운임 + 회사 부담 지게차 · 특수운임" }) },
    { label: "매출총이익", money: pipe.profit, color: pColor(pipe.profit), hero: true, rate: pipe.margin, rateLabel: "이익률", rateColor: rColor(pipe.margin), sub: `건당 ${fmtMoney(pipe.done ? pipe.profit / pipe.done : 0)}` },
  ].filter(Boolean);

  const chartTip = (props) => <ExecTooltip {...props} unit="" fmt={(v, p) => (p.dataKey === "margin" ? fmtPct(v) : `${fmtWon(v)}원`)} />;
  const dot = (tone) => (tone === "bad" ? EX.danger : tone === "warn" ? EX.warn : EX.ice);

  return (
    <ExecPage testId="exec-briefing" className="-mx-1 md:mx-0">
      {/* ── 0. 인사 · 한 줄 요약 · 시계 · 출근 ── (머리 오른쪽 부품이 커서 화면 폭이 아니라 내용 폭에 맞춰 줄바꿈) */}
      <header className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="min-w-0 flex-[1_1_460px]">
          <div className="flex items-center gap-3"><Eyebrow>EXECUTIVE BRIEFING</Eyebrow><div className="flex-1 max-w-[220px]"><GoldRule /></div></div>
          <h1 className="mt-1.5 text-[24px] md:text-[30px] font-black tracking-[-0.02em] leading-tight" style={{ color: EX.text, wordBreak: "keep-all" }}>
            {[personName(meX) || "임원", meX?.position].filter(Boolean).join(" ")}님, <span style={{ color: EX.sub, fontWeight: 800 }}>{greet}</span>
          </h1>
          <p className="mt-2 text-[14px] md:text-[15px] font-medium leading-[1.7] max-w-[900px]" style={{ color: EX.sub, wordBreak: "keep-all" }} data-testid="exec-brief-text">
            {ready ? <><span style={{ color: EX.text, fontWeight: 700 }}>{brief[0]}</span> {brief.slice(1).join(" ")}</> : "오늘의 경영 지표를 집계하고 있습니다…"}
            <span className="ml-2 text-[12px] font-semibold whitespace-nowrap" style={{ ...EX_NUM, color: EX.faint }}>{stamp} 기준</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* ⭐ 2026-11-01 출근 · 퇴근 — 시계 옆에서 바로 */}
          {att && <AttendanceQuickButton {...att} variant="deck" />}
          <ExecClock />
        </div>
      </header>

      {/* ── 1. 핵심 숫자 ── */}
      <div>
        <ExecKpis min={150}>
          <BTile accent en="REVENUE · MTD" label="이번 달 매출" money={mSale} delta={md} deltaLabel="전월 동기" foot={`오더 ${mCnt.toLocaleString("ko-KR")}건`} onClick={() => onGo?.("매출관리")} />
          <BTile en="GROSS PROFIT" label="매출총이익" money={mProfit} color={pColor(mProfit)} delta={prevAvail && pMargin != null && mMargin != null ? mMargin - pMargin : undefined} deltaSuffix="%p" deltaLabel="전월 동기"
            foot={<>매출총이익률 <b style={{ ...EX_NUM, color: rColor(mMargin) }}>{fmtPct(mMargin)}</b></>} />
          <BTile en="FORECAST" label="월말 예상 매출" money={forecast} foot={prevAvail ? `전월 실적 ${fmtMoney(pFullSale)}` : undefined} delta={prevAvail && pFullSale ? pctChange(forecast, pFullSale) : undefined} deltaLabel="전월 대비"
            side={<Ring value={(dayNo / dim) * 100} size={52} stroke={4.5} label={`${dayNo}/${dim}`} sub="일" />} title="이번 달 경과일 비율 · 현 추세 기준(일평균 매출 × 이번 달 일수)" />
          {isCeo && (F.has
            ? <BTile en="TREASURY" label="보유 자금" money={F.cash} onClick={() => onGo?.("자금현황")} foot={F.runway != null ? `운영 가능 기간 ${F.runway.toFixed(1)}개월` : "자금현황 ›"}
              delta={undefined} title="예금 · 현금 잔액(경리 입력 기준): 선택하면 자금현황으로 이동합니다" />
            : <BTile en="TREASURY" label="보유 자금" muted value={F.ready ? "자금관리 입력 전" : "불러오는 중…"} foot="경리 담당자가 예금 잔액을 입력하면 표시됩니다" onClick={() => onGo?.("자금현황")} />)}
          {ar ? <BTile en="RECEIVABLES" label="미수금" money={ar.total} foot={ar.over30 > 0 ? <span style={{ color: EX.warn }}>30일 초과 {fmtMoney(ar.over30)}</span> : `${ar.clients}곳 · 부가세 포함`} onClick={() => onGo?.("경영분석")} title="올해 배차완료 + 고정거래처 청구액(부가세 포함) − 수금액" />
            : <BTile en="RECEIVABLES" label="미수금" muted value="집계 중…" foot="올해 청구 · 수금 내역을 불러오고 있습니다" />}
          <BTile en="YEAR TO DATE" label="올해 누적 매출" money={ySale} foot={<>매출총이익 <b style={{ ...EX_NUM, color: pColor(yProfit) }}>{fmtMoney(yProfit)}</b> · {fmtPct(yMargin)}</>} />
        </ExecKpis>
        {/* ⭐ 2026-11-07 규칙 점검 — 매출관리(배차완료만)와 숫자가 다른 이유를 화면에 적어 둔다 */}
        <Basis className="mt-2.5 px-1"><span data-kp="exec-basis">매출 기준: 취소 · 운송사 전송을 제외한 전체 오더(배차중 · 승인대기 포함) · 매출관리는 배차완료 오더만 집계하므로 수치가 다를 수 있습니다</span>{isCeo && F.has ? " · 보유 자금은 경리 입력 예금 · 현금 잔액 기준" : ""}</Basis>
      </div>

      {/* 🌦 2026-11-18 운행 지역 날씨 — 임원 화면(골드) · 오늘 · 내일 오더 지역 · 기상특보 */}
      <OrdersWeatherDeck orders={dispatchData} theme="gold" />
      {/* ── 2. 이번 달 사업 흐름 ── */}
      <ExecPanel en={`BUSINESS FLOW · ${thisMonth.replace("-", ".")}`} title="이번 달 오더 · 정산 현황" sub={`오더 접수부터 매출총이익까지 · ${Number(thisMonth.slice(5))}월 1일 ~ ${dayNo}일 · 금액은 배차완료 오더 기준`}
        right={<GoLink onClick={() => onGo?.("정산관리")}>정산관리</GoLink>}>
        {!pipe.orders ? <Empty text="이번 달 접수된 오더가 아직 없습니다" sub={yearLoaded ? "배차 화면에 오더가 등록되면 표시됩니다" : "오더를 불러오고 있습니다"} /> : (
          <>
            <BusinessFlow steps={flow} />
            <div className="mt-4 grid gap-4 md:gap-6 items-center" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px,100%), 1fr))" }}>
              <div>
                <div className="mb-2 text-[12.5px] font-extrabold" style={{ color: EX.sub }}>청구 매출(100%) = 운송원가 + 매출총이익</div>
                <SplitBar sale={pipe.sale} cost={pipe.cost} profit={pipe.profit} />
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${EX.line}` }}>
                <div className="flex items-center justify-between gap-2"><Eyebrow size={10} color={EX.ice}>TODAY · {today.slice(5).replace("-", ".")}</Eyebrow><span className="text-[11.5px] font-bold" style={{ color: EX.mute }}>배차율 <b style={{ ...EX_NUM, color: EX.text }}>{todayRows.length ? Math.round((doneToday.length / todayRows.length) * 100) : 0}%</b></span></div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[["오더", todayRows.length, "건"], ["배차완료", doneToday.length, "건"], ["미배차", unassigned.length, "건", unassigned.length > 0], ["매출", null, null]].map(([l, v, u, bad]) => (
                    <div key={l} className="min-w-0">
                      <div className="text-[11.5px] font-bold" style={{ color: EX.mute }}>{l}</div>
                      <div className="mt-0.5">{v == null ? <Money v={todaySale} size={18} /> : <Num value={v} unit={u} size={18} color={bad ? EX.danger : EX.text} />}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2"><Meter value={doneToday.length} max={Math.max(1, todayRows.length)} height={4} color={EX.ice} /></div>
              </div>
            </div>
            <Basis className="mt-3">접수 = 이번 달 상차일 오더(취소 · 운송사 전송 제외) · 운송원가 = 기사운임 + 회사 부담 지게차 · 특수운임{pipe.useDeposit ? " · 입금 = 정산관리 [입금완료] 처리분" : ""}{pipe.usePay ? " · 지급 = 정산관리 [지급완료] 처리분" : ""}</Basis>
          </>
        )}
      </ExecPanel>

      {/* ── 3. 조직 · 인건비 / 팀 · 담당자 기여 ── */}
      <ExecGrid cols="minmax(0,1fr) minmax(0,1.1fr)" breakAt={1000}>
        <ExecPanel en="ORGANIZATION · PEOPLE" title="조직 · 인건비" sub={`재직 ${staff.length}명 · 팀 ${teams.filter((t) => t.team !== TEAM_NONE).length}개`} right={<GoLink onClick={() => onGo?.("직원정보")}>직원 정보</GoLink>}>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="오늘 출근" sub={attToday.total ? `재직 ${attToday.total}명` : "직원 정보 없음"}><Num value={attToday.in} unit="명" size={24} /></Stat>
            <Stat label="휴가 · 외근" sub={awayUniq.length ? awayUniq.slice(0, 2).map((e) => e.name).join(" · ") + (awayUniq.length > 2 ? ` 외 ${awayUniq.length - 2}명` : "") : "없음"}><Num value={awayUniq.length} unit="명" size={24} /></Stat>
            <Stat label="근태 미기록" sub={hour < 10 ? "출근 시간 전" : "근태 확인 필요"} tone={hour >= 10 && attToday.none > 0 ? "warn" : undefined}><Num value={attToday.none} unit="명" size={24} color={hour >= 10 && attToday.none > 0 ? EX.warn : EX.text} /></Stat>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-baseline justify-between gap-2"><span className="text-[13px] font-extrabold" style={{ color: EX.sub }}>팀별 인원 구성</span><span className="text-[12px] font-semibold" style={{ color: EX.mute }}>인사 정보(소속 팀) 기준</span></div>
            <TeamStack teams={teams} total={staff.length} />
          </div>
          <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${EX.line}` }}>
            <div className="mb-2.5 flex items-baseline justify-between gap-2"><span className="text-[13px] font-extrabold" style={{ color: EX.sub }}>인건비</span><Chip tone="mute">회계 장부 기준</Chip></div>
            {!laborBase ? <Empty text="회계 장부에 인건비 지출 내역이 아직 없습니다" sub="경리 담당자가 회계 장부에 급여 · 상여 · 4대보험을 입력하면 표시됩니다." /> : (
              <div className="grid gap-4 items-end" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px,100%), 1fr))" }}>
                <div className="min-w-0">
                  <div className="text-[12px] font-bold" style={{ color: EX.mute }}>{Number(laborBase.m.slice(5))}월 인건비{laborBase.m === thisMonth ? "(진행 중)" : ""}</div>
                  <div className="mt-1.5"><Money v={laborBase.total} size={28} /></div>
                  <div className="mt-2 space-y-1 text-[12.5px] font-semibold" style={{ color: EX.sub }}>
                    {laborBaseSale > 0 && <div className="flex justify-between gap-3"><span style={{ color: EX.mute }}>매출 대비</span><b style={EX_NUM}>{fmtPct((laborBase.total / laborBaseSale) * 100)}</b></div>}
                    {staff.length > 0 && <div className="flex justify-between gap-3"><span style={{ color: EX.mute }}>재직 1인당 평균</span><b style={EX_NUM}>{fmtMoney(laborBase.total / staff.length)}</b></div>}
                    {laborAccs.slice(0, 3).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="truncate" style={{ color: EX.mute }}>{k}</span><b style={EX_NUM}>{fmtMoney(v)}</b></div>)}
                  </div>
                </div>
                <div className="h-[132px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={labor.map((x) => ({ k: `${Number(x.m.slice(5))}월`, v: x.total, cur: x.m === laborBase.m }))} margin={{ top: 18, right: 2, left: 2, bottom: 0 }}>
                      <defs><linearGradient id="exLabor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={EX.goldHi} /><stop offset="100%" stopColor={EX.goldDeep} stopOpacity={0.75} /></linearGradient></defs>
                      <XAxis dataKey="k" {...chartTheme.axis} tick={{ ...chartTheme.axis.tick, fontSize: 11 }} interval={0} />
                      <Tooltip content={(p) => <ExecTooltip {...p} unit="" fmt={(v) => `${fmtWon(v)}원`} />} cursor={chartTheme.cursor} />
                      <Bar dataKey="v" name="인건비" radius={[6, 6, 2, 2]} maxBarSize={26} label={{ position: "top", content: ({ x, y, width, index, value }) => (labor[index]?.m === laborBase.m && value ? <text x={x + width / 2} y={y - 6} textAnchor="middle" fill={EX.goldHi} fontSize={11} fontWeight={800} fontFamily={EX_NUM.fontFamily}>{axisMoney(value)}</text> : null) }}>
                        {labor.map((x) => <Cell key={x.m} fill={x.m === laborBase.m ? "url(#exLabor)" : "rgba(143,176,240,.28)"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <Basis className="mt-2.5">급여 · 상여 · 퇴직급여 · 4대보험 계정 지출 합계 · 개인별 급여 상세는 보안상 표시하지 않습니다{laborBase && laborBase.m !== thisMonth ? " · 이번 달은 급여 지급 전일 수 있어 지난달 기준" : ""}</Basis>
          </div>
          <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${EX.line}` }}>
            <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[13px] font-extrabold" style={{ color: EX.sub }}>향후 7일 부재 일정</span><GoLink onClick={() => onGo?.("직원일정")}>달력</GoLink></div>
            <div className="grid grid-cols-7 gap-1 md:gap-1.5">
              {week.map((d) => {
                const list = weekEvs.filter((e) => e.date === d);
                const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                return (
                  <div key={d} className="rounded-xl px-1 py-1.5 min-h-[74px] min-w-0" style={{ background: d === today ? "rgba(215,188,130,.08)" : "rgba(255,255,255,.025)", border: `1px solid ${d === today ? EX.lineHi : EX.line}` }}>
                    <div className="text-center text-[11px] font-extrabold" style={{ color: dow === 0 || getNationalHolidayLabel(d) ? EX.up : dow === 6 ? EX.down : EX.mute }}>{DOW[dow]}</div>
                    <div className="text-center text-[14px] font-black" style={{ ...EX_NUM, color: EX.text }}>{Number(d.slice(8))}</div>
                    <div className="mt-1 space-y-0.5">
                      {list.slice(0, 2).map((e) => <div key={`${e.id}${e.date}`} title={`${e.name} ${e.label}${e.status !== "approved" ? "(결재 중)" : ""}`} className="rounded-md px-1 py-[1px] text-[10.5px] md:text-[11px] font-bold truncate text-center" style={e.status === "approved" ? { background: "rgba(215,188,130,.16)", color: EX.goldHi } : { border: `1px dashed ${EX.faint}`, color: EX.sub }}>{e.name}</div>)}
                      {list.length > 2 && <div className="text-[10.5px] text-center font-bold" style={{ color: EX.mute }}>+{list.length - 2}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ExecPanel>

        <ExecPanel en="CONTRIBUTION · MTD" title="매출 · 매출총이익 기여도" sub={`팀 · 담당자별 실적 기여 · ${Number(thisMonth.slice(5))}월 1~${dayNo}일`}
          right={<ExecTabs size="sm" items={[["team", "팀별"], ["staff", "담당자별"]]} value={contribTab} onChange={setContribTab} />}>
          {!rank.list.length ? <Empty text="이번 달 담당자별 실적이 아직 없습니다" sub={yearLoaded ? "오더가 등록되면 담당자 · 팀별로 집계됩니다" : "오더를 불러오고 있습니다"} /> : contribTab === "team" ? (
            <div className="space-y-3">
              {teamRows.map((t, i) => {
                const mx = teamRows[0]?.sale || 1;
                return (
                  <div key={t.team} className="rounded-2xl px-3.5 py-3" style={{ background: i === 0 ? "rgba(215,188,130,.06)" : "rgba(255,255,255,.025)", border: `1px solid ${i === 0 ? EX.lineHi : EX.line}` }}>
                    <div className="flex items-baseline justify-between gap-3 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-[14.5px] font-black truncate" style={{ color: EX.text }}>{t.team}</span>
                        <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: EX.mute }}>담당 {t.people}명 · {t.cnt.toLocaleString("ko-KR")}건</span>
                      </div>
                      <span className="shrink-0 text-[12px] font-black" style={{ ...EX_NUM, color: EX.goldHi }}>{fmtPct(t.share)}</span>
                    </div>
                    <div className="mt-2"><Meter value={t.sale} max={mx} height={6} color={i === 0 ? EX.gold : EX.ice} /></div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[12.5px]">
                      <div className="min-w-0"><div className="font-semibold" style={{ color: EX.mute }}>매출</div><div className="font-black" style={{ ...EX_NUM, color: EX.text }}>{fmtMoney(t.sale)}</div></div>
                      <div className="min-w-0"><div className="font-semibold" style={{ color: EX.mute }}>매출총이익</div><div className="font-black" style={{ ...EX_NUM, color: pColor(t.profit) }}>{fmtMoney(t.profit)} <span className="font-bold text-[11.5px]" style={{ color: rColor(t.margin) }}>{fmtPct(t.margin)}</span></div></div>
                      <div className="min-w-0 text-right"><div className="font-semibold" style={{ color: EX.mute }}>전월 동기</div><div><Delta v={t.d} size={12.5} /></div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <RankBars rows={rank.list.slice(0, 8).map((x, i) => ({ key: x.n, label: x.n, sub: teamByName[x.n] || "", value: x.sale, profit: x.profit, margin: x.margin, d: x.d, color: i === 0 ? EX.gold : EX.ice }))}
              valueFmt={fmtMoney}
              right={(r) => <span className="w-[54px] text-right text-[12px] font-black" style={{ ...EX_NUM, color: rColor(r.margin) }}>{fmtPct(r.margin)}</span>} />
          )}
          <Basis className="mt-3">담당 = 오더를 등록한 직원(고정노선은 배차확정자) · 팀 = 직원 정보의 소속 팀{contribTab === "staff" ? " · 우측 수치는 매출총이익률" : ""}{rank.list.length ? ` · 회사 전체 ${fmtMoney(rank.total)}` : ""}</Basis>
        </ExecPanel>
      </ExecGrid>

      {/* ── 4. 월별 추이 · 결재 대기 ── */}
      <ExecGrid cols="minmax(0,1.6fr) minmax(0,1fr)" breakAt={1100}>
        <ExecPanel en={`PERFORMANCE · ${year}`} title={range === "year" ? "월별 매출 · 매출총이익" : "최근 30일 매출 · 매출총이익"} sub={range === "year" ? "막대 = 금액 · 골드 선 = 매출총이익률" : "일별 · 상차일 기준"}
          right={<ExecTabs size="sm" items={[["year", "올해"], ["30", "30일"]]} value={range} onChange={setRange} />}>
          <div className="mb-2"><Legend items={range === "year" ? [["매출", EX.ice], ["매출총이익", EX.iceDeep], ["이익률", EX.gold, "line"]] : [["매출", EX.ice], ["매출총이익", EX.gold, "line"]]} /></div>
          <div className="h-[260px] md:h-[300px] -ml-1">
            <ResponsiveContainer width="100%" height="100%">
              {range === "year" ? (
                <ComposedChart data={monthly} margin={{ top: 22, right: 4, left: 0, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="exSale" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#CFE0FF" stopOpacity={0.95} /><stop offset="100%" stopColor={EX.iceDeep} stopOpacity={0.5} /></linearGradient>
                    <linearGradient id="exSaleCur" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={EX.goldHi} /><stop offset="100%" stopColor={EX.goldDeep} stopOpacity={0.7} /></linearGradient>
                  </defs>
                  <CartesianGrid {...chartTheme.grid} />
                  <XAxis dataKey="k" {...chartTheme.axis} />
                  <YAxis yAxisId="w" tickFormatter={axisMoney} {...chartTheme.axis} width={50} />
                  <YAxis yAxisId="m" orientation="right" tickFormatter={(v) => `${v}%`} {...chartTheme.axis} tick={{ ...chartTheme.axis.tick, fill: "rgba(215,188,130,.7)" }} width={40} />
                  <Tooltip content={chartTip} cursor={chartTheme.cursor} />
                  <Bar yAxisId="w" dataKey="sale" name="매출" radius={[7, 7, 2, 2]} maxBarSize={30}
                    label={{ position: "top", content: ({ x, y, width, index, value }) => (monthly[index]?.cur ? <text x={x + width / 2} y={y - 7} textAnchor="middle" fill={EX.goldHi} fontSize={11.5} fontWeight={800} fontFamily={EX_NUM.fontFamily}>{axisMoney(value)}</text> : null) }}>
                    {monthly.map((x) => <Cell key={x.k} fill={x.cur ? "url(#exSaleCur)" : "url(#exSale)"} />)}
                  </Bar>
                  <Bar yAxisId="w" dataKey="profit" name="매출총이익" fill="rgba(75,108,183,.55)" radius={[7, 7, 2, 2]} maxBarSize={30} />
                  <Line yAxisId="m" dataKey="margin" name="이익률" stroke={EX.gold} strokeWidth={2.2} connectNulls dot={{ r: 3, fill: EX.bg1, stroke: EX.gold, strokeWidth: 2 }} activeDot={{ r: 5, fill: EX.gold }} />
                </ComposedChart>
              ) : (
                <AreaChart data={daily} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="exArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={EX.ice} stopOpacity={0.5} /><stop offset="100%" stopColor={EX.ice} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...chartTheme.grid} />
                  <XAxis dataKey="k" interval={4} {...chartTheme.axis} />
                  <YAxis tickFormatter={axisMoney} {...chartTheme.axis} width={50} />
                  <Tooltip content={chartTip} cursor={{ stroke: EX.lineHi }} />
                  <Area dataKey="sale" name="매출" stroke="#CFE0FF" strokeWidth={2} fill="url(#exArea)" />
                  <Area dataKey="profit" name="매출총이익" stroke={EX.gold} strokeWidth={1.8} fill="transparent" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          <Basis className="mt-2">{range === "year" ? `골드 막대 = 이번 달(${dayNo}일까지) · 이익률 = 매출총이익 ÷ 매출` : "매출총이익 = 청구운임 − 기사운임 − 회사 부담 지게차 · 특수운임"}</Basis>
        </ExecPanel>

        <ExecPanel en="APPROVAL · YOUR TURN" title="나의 결재 대기" right={<GoLink onClick={() => onGo?.("결재함")}>결재함</GoLink>}>
          {/* 🤖 일일 업무일지 자동 승인 — 켜면 상신과 동시에 승인, 끄면 임원이 직접 확인 */}
          <button type="button" onClick={() => setAutoApproveDaily(company, !autoDaily, personName(me) || "")} aria-pressed={autoDaily}
            className="w-full mb-3 rounded-2xl px-3.5 py-2.5 flex items-center gap-3 text-left transition"
            style={{ background: autoDaily ? "rgba(215,188,130,.10)" : "rgba(255,255,255,.035)", border: `1px solid ${autoDaily ? EX.lineHi : EX.line}` }}>
            <span className="min-w-0 flex-1"><span className="block text-[14px] font-black" style={{ color: EX.text }}>일일 업무일지 자동 승인</span><span className="block text-[12.5px] font-medium" style={{ color: EX.mute }}>{autoDaily ? "켜짐: 상신 즉시 자동 승인됩니다" : "꺼짐: 임원이 직접 검토 후 승인합니다"}</span></span>
            <span className="relative w-[52px] h-[30px] rounded-full shrink-0 transition" style={{ background: autoDaily ? GOLD_GRAD : "rgba(255,255,255,.15)" }}>
              <span className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow transition-all ${autoDaily ? "left-[25px]" : "left-[3px]"}`} />
            </span>
          </button>
          <div className="flex items-end gap-3 mb-3">
            <Num value={mine.length} unit="건" size={40} color={mine.length ? EX.goldHi : EX.faint} />
            <span className="pb-1 text-[12.5px] font-semibold" style={{ color: EX.mute }}>전사 진행 중 {pendingAll.length}건{late.length ? <> · <span style={{ color: EX.danger }}>48시간 초과 {late.length}건</span></> : ""}</span>
          </div>
          {!mine.length ? <Empty text="현재 결재 대기 문서가 없습니다" sub="새 문서가 상신되면 이곳에 즉시 표시됩니다." /> : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {mine.slice(0, 8).map((a) => {
                const h = Math.max(0, Math.floor((Date.now() - tsMs(a.createdAt)) / 3600e3));
                return (
                  <button key={a.id} type="button" onClick={() => onGo?.(`결재함:${a.id}`)} className="w-full text-left rounded-2xl px-3 py-2.5 flex items-center gap-3 transition hover:brightness-125" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${EX.line}` }}>
                    <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(143,176,240,.12)", color: EX.ice }}><ShellIcon name={a.cat === "expense" ? "wallet" : a.cat === "leave" ? "clock" : "file"} size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-black truncate" style={{ color: EX.text }}>{a.title || a.formLabel || "결재 문서"}</span>
                      <span className="block text-[12.5px] font-medium truncate" style={{ color: EX.mute }}>{a.drafter?.name || ""}{a.drafter?.team ? ` · ${a.drafter.team}` : ""}{a.amount ? <> · <span style={EX_NUM}>{fmtWon(a.amount)}원</span></> : ""}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-black" style={{ ...EX_NUM, color: h >= 48 ? EX.danger : EX.mute }}>{h >= 24 ? `${Math.floor(h / 24)}일 전` : `${h}시간 전`}</span>
                  </button>
                );
              })}
            </div>
          )}
        </ExecPanel>
      </ExecGrid>

      {/* ── 5. 주의 신호 · 거래처 TOP ── */}
      <ExecGrid cols="minmax(0,1fr) minmax(0,1fr)" breakAt={900}>
        <ExecPanel en="SIGNALS" title="주의 신호" sub={signals.length ? `확인이 필요한 항목 ${signals.length}건` : "자동 점검 결과"}>
          {!signals.length ? <Empty text="특이 사항이 없습니다" sub="미배차 · 결재 지연 · 미수금 · 거래처 매출 집중도 · 매출총이익률 · 기사 서류를 자동 점검합니다." /> : (
            <div className="space-y-1.5">
              {signals.slice(0, 6).map((x) => (
                <button key={x.t} type="button" disabled={!x.go} onClick={() => x.go && onGo?.(x.go)} className="w-full min-h-[52px] text-left rounded-2xl px-3.5 py-2.5 flex items-center gap-3 transition enabled:hover:brightness-125" style={{ background: "rgba(255,255,255,.035)", border: `1px solid ${EX.line}` }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot(x.tone), boxShadow: `0 0 10px ${dot(x.tone)}` }} />
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-black truncate" style={{ color: EX.text }}>{x.t}</span><span className="block text-[12.5px] font-medium truncate" style={{ color: EX.mute }}>{x.s}</span></span>
                  {x.go && <span className="text-[15px]" style={{ color: EX.faint }}>›</span>}
                </button>
              ))}
            </div>
          )}
        </ExecPanel>
        <ExecPanel en="CLIENTS · THIS MONTH" title="거래처 매출 TOP 5" sub={clientTotal ? `이번 달 거래처 ${Object.keys(clients).length}곳 · 상위 5곳 비중 ${fmtPct((topClients.reduce((s, [, v]) => s + v, 0) / clientTotal) * 100)}` : undefined} right={<GoLink onClick={() => onGo?.("매출관리")}>매출관리</GoLink>}>
          <RankBars rows={topClients.map(([n, v], i) => ({ key: n, label: n, value: v, color: i === 0 ? EX.gold : EX.ice }))} valueFmt={fmtMoney} empty="이번 달 매출이 아직 없습니다"
            right={(r) => <span className="w-[48px] text-right text-[12px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{clientTotal ? fmtPct((r.value / clientTotal) * 100) : "—"}</span>} />
        </ExecPanel>
      </ExecGrid>
    </ExecPage>
  );
}

// 밝은 화면(결재함 · 직원 일정) 위에 얹는 임원용 남색 띠 — 제목 · 요약 숫자
function ExecBand({ en, title, sub, right, children }) {
  return (
    <section className="relative overflow-hidden rounded-[22px] px-4 md:px-6 py-4 md:py-5" style={{ background: SHELL_BG, color: EX.text, fontFamily: EX_FONT, border: `1px solid ${EX.line}`, boxShadow: "0 18px 40px rgba(5,10,22,.18)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: GRID }} />
      <div className="relative">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3"><Eyebrow size={10.5}>{en}</Eyebrow><div className="hidden sm:block w-[140px]"><GoldRule /></div></div>
            {title && <div className="mt-1 text-[19px] md:text-[22px] font-black tracking-[-0.01em]">{title}</div>}
            {sub && <div className="mt-0.5 text-[12.5px] md:text-[13px] font-medium" style={{ color: EX.mute }}>{sub}</div>}
          </div>
          {right && <div className="flex flex-wrap items-center gap-1.5">{right}</div>}
        </div>
        {children && <div className="mt-3.5">{children}</div>}
      </div>
    </section>
  );
}
function BandStats({ items }) {
  return (
    <div className="grid gap-2 md:gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(150px,100%), 1fr))" }}>
      {items.map((x) => (
        <div key={x.label} className="relative rounded-2xl px-3.5 py-3 min-w-0 overflow-hidden" style={{ background: x.accent ? "linear-gradient(160deg, rgba(215,188,130,.16), rgba(215,188,130,.03))" : "rgba(255,255,255,.04)", border: `1px solid ${x.accent ? EX.lineHi : x.warn ? "rgba(255,122,107,.35)" : EX.line}` }}>
          {x.accent && <div className="absolute top-0 left-4 right-4 h-px" style={{ background: GOLD_GRAD }} />}
          <div className="text-[12px] font-bold whitespace-nowrap truncate" style={{ color: EX.mute }}>{x.label}</div>
          <div className="mt-1.5">{x.node}</div>
        </div>
      ))}
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
        <ExecBand en="FINAL APPROVER · OVERVIEW" title="결재 현황" sub="최종 결재자 기준 · 상신 후 48시간 초과 시 지연으로 분류합니다">
          <BandStats items={[
            { label: "나의 결재 대기", node: <Num value={mine} unit="건" size={26} color={mine ? EX.goldHi : EX.text} />, accent: mine > 0 },
            { label: "전사 진행 중", node: <Num value={pending.length} unit="건" size={26} /> },
            { label: "48시간 초과", node: <Num value={late} unit="건" size={26} color={late ? EX.danger : EX.text} />, warn: late > 0 },
            { label: "이번 달 승인 지출", node: <Money v={expMonth} size={26} /> },
          ]} />
        </ExecBand>
        {/* ⭐ 2026-11-01 인사팀 본인의 출근기록 수정·출근 요청은 임원이 여기서 승인(먼저 승인한 1명으로 종결) */}
        {page === "inbox" && <AttendanceApprovalInbox company={company} me={me} role={me?.role} />}
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
// 임원 화면용(남색 바탕) — 연차 = 골드 · 출장/외근 = 아이스 · 병가/경조 = 분홍 · 결재 중 = 점선
const KIND_STYLE_X = (label, status) => {
  if (status !== "approved") return { background: "transparent", color: "rgba(232,238,250,.7)", border: "1px dashed rgba(232,238,250,.35)" };
  const c = /연차|휴가|반차|반반차/.test(label) ? ["rgba(215,188,130,.18)", "#F1DDAE", "rgba(215,188,130,.45)"] : /출장|외근/.test(label) ? ["rgba(143,176,240,.16)", "#CFE0FF", "rgba(143,176,240,.4)"] : /병가|경조/.test(label) ? ["rgba(229,155,176,.16)", "#F5C6D3", "rgba(229,155,176,.4)"] : ["rgba(255,255,255,.08)", "rgba(232,238,250,.85)", "rgba(255,255,255,.18)"];
  return { background: c[0], color: c[1], border: `1px solid ${c[2]}` };
};
// ⭐ 2026-11-03 [개인일정] 스위치 — 켜면 나만 보는 개인 일정 달력(계정별로 기억 · 다른 메뉴 다녀와도 그대로)
export function TeamSchedule({ company }) {
  const [personal, setPersonal] = usePersonalMode();
  const { staff } = useStaff(company);
  const sw = <PersonalModeSwitch on={personal} onChange={setPersonal} />;
  return personal ? <PersonalSchedule company={company} modeSwitch={sw} staff={staff} /> : <TeamScheduleCompany company={company} modeSwitch={sw} />;
}
function TeamScheduleCompany({ company, modeSwitch }) {
  // ⭐ 2026-11-02 점검 — 회사 전체 approvals 조회 대신 연차(leave)만 조회(eventsOf도 leave만 사용)
  const approvals = useLeaveApprovalsOf(company);
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
  const pickBirth = birthdaysOn(staff, pick); // ⭐ 2026-11-03 생일
  // 👑 2026-11-17 임원 화면(결재함 · 직원 일정 메뉴)에서는 남색 + 골드 달력, 다른 부서 화면은 지금 모양 그대로
  const X = useExecMode();
  const stats = [["오늘 부재", new Set((by[today] || []).map((e) => e.uid)).size, "명"], ["이번 주 부재", new Set(evs.filter((e) => week.includes(e.date)).map((e) => e.uid)).size, "명"], ["이달 연차 사용", leaveDays, "일"], ["결재 진행 중", new Set(monthEv.filter((e) => e.status !== "approved").map((e) => e.id)).size, "건"]];
  const monthNav = (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={() => move(-1)} aria-label="이전 달" className="w-9 h-9 rounded-xl font-black" style={X ? { background: "rgba(255,255,255,.06)", border: `1px solid ${EX.line}`, color: EX.text } : { background: "rgba(255,255,255,.1)" }}>‹</button>
      <span className="h-9 px-3.5 rounded-xl font-black grid place-items-center tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", ...(X ? { background: GOLD_GRAD, color: "#1A1408" } : { background: "#fff", color: "#0B1530" }) }}>{ym.replace("-", ".")}</span>
      <button type="button" onClick={() => move(1)} aria-label="다음 달" className="w-9 h-9 rounded-xl font-black" style={X ? { background: "rgba(255,255,255,.06)", border: `1px solid ${EX.line}`, color: EX.text } : { background: "rgba(255,255,255,.1)" }}>›</button>
    </span>
  );
  const KS = (label, status) => (X ? KIND_STYLE_X(label, status) : KIND_STYLE(label, status));
  const T = X
    ? { card: "border", cardSt: { background: "linear-gradient(180deg, #0C1730, #081124)", borderColor: EX.line, boxShadow: "0 18px 40px rgba(5,10,22,.18)" }, line: "border-white/[0.08]", cell: "border-white/[0.06]", empty: "bg-black/20", pick: "bg-[#D7BC82]/[0.10] ring-1 ring-inset ring-[#D7BC82]/60", hover: "hover:bg-white/[0.04]", sun: "text-[#FF8A7A]", sat: "text-[#7FB0FF]", dow: "text-white/55", ink: "text-white", mute: "text-white/45", today: "text-[#1A1408]", divide: "divide-white/[0.07]", avatar: "bg-white/[0.08] text-[#F1DDAE]" }
    : { card: "bg-white border border-[#E3E8F0]", cardSt: undefined, line: "border-[#EEF1F6]", cell: "border-[#F1F4F9]", empty: "bg-[#FAFBFD]", pick: "bg-[#F2F6FD] ring-2 ring-inset ring-[#2D4C82]", hover: "hover:bg-[#F8FAFD]", sun: "text-[#D92D20]", sat: "text-[#2D4C82]", dow: "text-[#5B6B85]", ink: "text-[#0F1A30]", mute: "text-[#7A879C]", today: "bg-[#0F1A30] text-white", divide: "divide-[#EEF2F8]", avatar: "bg-[#1B2B4B] text-white" };
  return (
    <div className="space-y-3">
      {X ? (
        <ExecBand en="TEAM · SCHEDULE" title="직원 일정" sub="전자결재 연차 · 반차 · 외근 · 출장 · 병가 · 경조사 기준: 결재 완료는 확정, 결재 진행 중은 점선으로 표시합니다" right={<>{modeSwitch}{monthNav}</>}>
          <BandStats items={stats.map(([l, v, u]) => ({ label: l, node: <Num value={v} unit={u} size={24} /> }))} />
        </ExecBand>
      ) : (
      <div className="relative overflow-hidden rounded-[22px] px-4 md:px-6 py-4 text-white" style={{ background: SHELL_BG_OLD }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: GRID_OLD }} />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: GOLD }}>TEAM · SCHEDULE</div>
            <div className="text-[20px] md:text-[24px] font-black mt-0.5">직원 일정</div>
            <div className="text-[12.5px] text-white/55">전자결재 연차·반차·외근·출장·병가·경조사: 결재 완료는 확정, 진행 중은 점선</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {modeSwitch}
            {monthNav}
          </div>
        </div>
        <div className="relative mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[["오늘 부재", `${new Set((by[today] || []).map((e) => e.uid)).size}명`], ["이번 주 부재", `${new Set(evs.filter((e) => week.includes(e.date)).map((e) => e.uid)).size}명`], ["이달 연차 사용", `${leaveDays}일`], ["결재 진행 중", `${new Set(monthEv.filter((e) => e.status !== "approved").map((e) => e.id)).size}건`]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-2.5"><div className="text-[11.5px] font-bold text-white/55 whitespace-nowrap">{l}</div><div className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}</div></div>
          ))}
        </div>
      </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {teams.map((t) => <button key={t} type="button" onClick={() => setTeam(t)} className={`h-9 px-3.5 rounded-full text-[13px] font-black border whitespace-nowrap shrink-0 ${X ? "" : team === t ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE]"}`}
          style={X ? (team === t ? { background: GOLD_GRAD, color: "#1A1408", borderColor: "transparent" } : { background: "rgba(255,255,255,.04)", color: EX.sub, borderColor: EX.line }) : undefined}>{t}</button>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div className={`rounded-[20px] overflow-hidden ${T.card}`} style={T.cardSt}>
          <div className={`grid grid-cols-7 border-b ${T.line}`}>
            {DOW.map((d, i) => <div key={d} className={`py-2 text-center text-[12px] font-black ${i === 0 ? T.sun : i === 6 ? T.sat : T.dow}`}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const list = d ? by[d] || [] : [];
              const bd = d ? birthdaysOn(staff, d) : [];
              return (
                <button key={i} type="button" disabled={!d} onClick={() => d && setPick(d)}
                  className={`text-left min-h-[64px] md:min-h-[104px] p-1 md:p-1.5 border-b border-r align-top ${T.cell} ${!d ? T.empty : pick === d ? T.pick : T.hover}`}>
                  {d && (
                    <>
                      <div className="flex items-center gap-1 min-w-0">
                        <div className={`text-[12px] md:text-[13px] font-black tabular-nums shrink-0 ${d === today ? `w-6 h-6 rounded-full grid place-items-center ${T.today}` : (i % 7 === 0 || getNationalHolidayLabel(d)) ? T.sun : i % 7 === 6 ? T.sat : T.ink}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", ...(d === today && X ? { background: GOLD_GRAD } : {}) }}>{Number(d.slice(8))}</div>
                        {getNationalHolidayLabel(d) && <span className={`hidden md:inline text-[10.5px] font-bold truncate ${T.sun}`}>{getNationalHolidayLabel(d)}</span>}
                      </div>
                      <div className="hidden md:block mt-1 space-y-0.5">
                        {bd.map((u) => <BirthChip key={u.id} name={personName(u) || u.name} dark={X} />)}
                        {list.slice(0, 3).map((e) => <div key={`${e.id}${e.date}`} className="rounded-md px-1.5 py-[1px] text-[11px] font-bold truncate" style={KS(e.label, e.status)}>{e.name} {e.label}</div>)}
                        {list.length > 3 && <div className={`text-[10.5px] font-bold px-1 ${T.mute}`}>+{list.length - 3}명</div>}
                      </div>
                      {(list.length > 0 || bd.length > 0) && <div className="md:hidden mt-1 flex items-center gap-0.5 flex-wrap">{bd.length > 0 && <span className="text-[9px] leading-none">🎂</span>}{list.slice(0, 4).map((e) => <span key={`${e.id}${e.date}`} className="w-1.5 h-1.5 rounded-full" style={{ background: e.status === "approved" ? (X ? EX.gold : "#1B2B4B") : (X ? EX.faint : "#9AA9C3") }} />)}{list.length > 4 && <span className={`text-[9px] font-black ${T.dow}`}>+{list.length - 4}</span>}</div>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className={`rounded-[20px] overflow-hidden self-start ${T.card}`} style={T.cardSt}>
          <div className={`px-4 pt-3.5 pb-2.5 border-b ${T.line}`}>
            <div className={`text-[9.5px] font-extrabold tracking-[0.24em] ${X ? "text-[#8FB0F0]" : "text-[#4B6CB7]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>DAY DETAIL</div>
            <div className={`text-[15px] font-black ${T.ink}`}>{pick.replace(/-/g, ".")} ({DOW[new Date(`${pick}T00:00:00Z`).getUTCDay()]}) · {pickList.length}명</div>
          </div>
          {pickBirth.length > 0 && <div className="px-4 pt-3 flex flex-wrap gap-1.5">{pickBirth.map((u) => <BirthChip key={u.id} name={personName(u) || u.name} big dark={X} />)}</div>}
          {!pickList.length ? <div className={`py-10 text-center text-[13px] font-bold ${T.mute}`}>해당 일자에 부재 일정이 없습니다</div> : (
            <div className={`divide-y ${T.divide}`}>
              {pickList.map((e) => (
                <div key={`${e.id}${e.date}`} className="px-4 py-2.5 flex items-center gap-3">
                  <span className={`w-9 h-9 rounded-xl grid place-items-center text-[13px] font-black shrink-0 ${T.avatar}`}>{String(e.name || "?").slice(0, 1)}</span>
                  <div className="min-w-0 flex-1"><div className={`text-[14px] font-black truncate ${T.ink}`}>{e.name}</div><div className={`text-[11.5px] truncate ${T.mute}`}>{[e.team, e.position].filter(Boolean).join(" · ")}</div></div>
                  <span className="text-[11.5px] font-black px-2 py-0.5 rounded-lg whitespace-nowrap" style={KS(e.label, e.status)}>{e.label}{e.status !== "approved" ? " · 결재 중" : ""}</span>
                </div>
              ))}
            </div>
          )}
          <div className={`px-4 py-3 border-t flex items-center gap-2 flex-wrap text-[11px] font-bold ${T.line} ${T.dow}`}>
            {[["연차·반차", "연차"], ["출장·외근", "출장"], ["병가·경조사", "병가"]].map(([l, k]) => <span key={l} className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-3 h-3 rounded" style={KS(k, "approved")} />{l}</span>)}
            <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-3 h-3 rounded" style={KS("연차", "pending")} />결재 중</span>
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
      groups={[{ label: "전자결재", items: approvalNavItems("", { inbox: { badge: counts.todo }, handover: { badge: hoUnread }, mine: { badge: counts.mineNew } }) }]}>{/* ⭐ 2026-11-10 메뉴 통일(menuTree) — 계약서 포함 */}
      {page === "contract"
        ? <React.Suspense fallback={null}><ContractStudioX company={company} me={me} /></React.Suspense>
        : page === "handover"
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
export const canWriteExecSchedule = ({ dept, role, team } = {}) => dept === "exec" || dept === "hr" || ["hrManager", "hrAcct", "allMgr", "totalMaster"].includes(role) || team === "인사팀";
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
  // ⌨ 버튼에서 ↓ 로 열고(지금 시 칸으로) 방향키로 칸 이동 · Enter 고르기 · Esc 닫기
  const btnRef = React.useRef(null); const popRef = React.useRef(null);
  const onKey = (e) => {
    if (e.nativeEvent?.isComposing) return;
    if (!open) { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setTimeout(() => popRef.current?.querySelector('[data-cur="1"]')?.focus(), 0); } return; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btnRef.current?.focus(); return; }
    arrowFocus(e, popRef.current, { cols: 6 });
  };
  return (
    <div ref={ref} className="relative" onKeyDown={onKey}>
      <button ref={btnRef} type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-12 w-full px-3.5 rounded-xl bg-white/[0.06] border border-white/15 text-left flex items-center gap-2 hover:border-[#D7BC82]">
        <span className="text-[15px]" style={{ color: GOLD }}>◷</span>
        <span className="text-[15px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{hmLabel(value)}</span>
      </button>
      {open && (
        <div ref={popRef} className="absolute z-[100001] left-0 right-0 mt-1.5 rounded-2xl p-3 shadow-[0_20px_44px_rgba(0,0,0,0.5)] border border-white/15" style={{ background: SHELL_BG, minWidth: 260 }}>
          <div className="grid grid-cols-2 gap-1 mb-2">{[["오전", 0], ["오후", 12]].map(([l, base]) => <button key={l} type="button" onClick={() => set((h % 12) + base, m)} className={chip((h < 12) === (base === 0))} style={(h < 12) === (base === 0) ? gold : undefined}>{l}</button>)}</div>
          <div className="text-[11px] font-extrabold tracking-[0.2em] text-white/45 mb-1" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>HOUR</div>
          <div className="grid grid-cols-6 gap-1 mb-2">{Array.from({ length: 12 }, (_, i) => i).map((i) => { const hh = (h < 12 ? 0 : 12) + i; return <button key={i} type="button" data-cur={hh === h ? "1" : undefined} onClick={() => set(hh, m)} className={chip(hh === h)} style={hh === h ? gold : undefined}>{i === 0 ? 12 : i}</button>; })}</div>
          <div className="text-[11px] font-extrabold tracking-[0.2em] text-white/45 mb-1" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MINUTE</div>
          <div className="grid grid-cols-6 gap-1">{[0, 10, 20, 30, 40, 50].map((mm) => <button key={mm} type="button" onClick={() => { set(h, mm); setOpen(false); }} className={chip(mm === m)} style={mm === m ? gold : undefined}>{String(mm).padStart(2, "0")}</button>)}</div>
        </div>
      )}
    </div>
  );
}

// ⭐ 2026-11-03 [개인일정] 스위치(직원 일정과 같은 설정을 같이 씀)
export function ExecScheduleBoard(props) {
  const [personal, setPersonal] = usePersonalMode();
  const { staff } = useStaff(props.company);
  const sw = <PersonalModeSwitch on={personal} onChange={setPersonal} />;
  return personal ? <PersonalSchedule company={props.company} modeSwitch={sw} staff={staff} /> : <ExecScheduleCompany {...props} modeSwitch={sw} />;
}
function ExecScheduleCompany({ company, me = {}, canWrite = false, modeSwitch }) {
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
  const remove = async (e) => { if (!(await kpConfirm("이 일정을 삭제하시겠습니까?"))) return; const { doc: fdoc, deleteDoc } = await import("firebase/firestore"); await runDelete({ label: "일정", task: () => deleteDoc(fdoc(db, "execSchedules", e.id)) }); setEdit(null); }; // ⭐ 2026-11-05 삭제 진행 창
  const dayList = by[pick] || [];
  const inpD = "h-12 w-full px-3.5 rounded-xl bg-white/[0.06] border border-white/15 text-white text-[15px] font-bold outline-none focus:border-[#D7BC82] placeholder:text-white/30 [color-scheme:dark]";
  return (
    <div className="relative rounded-[26px] overflow-hidden text-white" style={{ background: SHELL_BG }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: GRID }} />
      <div className="relative px-4 py-5 md:px-8 md:py-7 space-y-4 md:space-y-5" style={{ fontFamily: EX_FONT }}>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-3"><Eyebrow>EXECUTIVE · SCHEDULE</Eyebrow><div className="hidden md:block w-[180px]"><GoldRule /></div></div>
            <h1 className="mt-1.5 text-[24px] md:text-[30px] font-black tracking-[-0.02em] leading-tight" style={{ color: EX.text }}>임원 스케줄</h1>
            <div className="mt-1 text-[13px] md:text-[14px] font-medium" style={{ color: EX.sub }}>{canWrite ? "등록한 일정은 전 직원에게 공개됩니다 · 날짜를 두 번 누르면 바로 등록할 수 있습니다" : "대표 · 임원의 회의 · 외근 · 출장 일정입니다"}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {modeSwitch}
            <span className="inline-flex items-center gap-1.5">
            <button type="button" onClick={() => move(-1)} className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 font-black">‹</button>
            <span className="h-10 px-4 rounded-xl font-black grid place-items-center tabular-nums text-[15px]" style={{ ...EX_NUM, background: "rgba(255,255,255,.06)", border: `1px solid ${EX.lineHi}`, color: EX.goldHi }}>{ym.replace("-", ".")}</span>
            <button type="button" onClick={() => move(1)} className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 font-black">›</button>
            {canWrite && <button type="button" onClick={() => setEdit(blank())} className="h-10 px-4 rounded-xl text-[#1A1408] text-[14px] font-black ml-1 whitespace-nowrap" style={{ background: GOLD_GRAD, boxShadow: "0 8px 22px rgba(215,188,130,.25)" }}>+ 일정 등록</button>}
            </span>
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
                const bd = d ? birthdaysOn(allStaff, d) : [];
                return (
                  <button key={i} type="button" disabled={!d} onClick={() => d && setPick(d)} onDoubleClick={() => d && canWrite && setEdit(blank(d))}
                    className={`text-left min-h-[70px] md:min-h-[112px] p-1 md:p-2 border-b border-r border-white/[0.06] ${!d ? "bg-black/10" : pick === d ? "bg-[#D7BC82]/[0.10] ring-1 ring-inset ring-[#D7BC82]/60" : "hover:bg-white/[0.04]"}`}>
                    {d && (
                      <>
                        <div className="flex items-center gap-1 min-w-0">
                        <div className={`text-[13px] md:text-[14px] font-black tabular-nums shrink-0 ${d === today ? "w-7 h-7 rounded-full grid place-items-center text-[#1A1405]" : (i % 7 === 0 || getNationalHolidayLabel(d)) ? "text-[#FFB4A8]" : i % 7 === 6 ? "text-[#AFC6F5]" : "text-white/85"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", ...(d === today ? { background: GOLD } : {}) }}>{Number(d.slice(8))}</div>
                        {getNationalHolidayLabel(d) && <span className="hidden md:inline text-[10.5px] font-bold text-[#FFB4A8] truncate">{getNationalHolidayLabel(d)}</span>}
                      </div>
                        <div className="hidden md:block mt-1 space-y-1">
                          {bd.map((u) => <BirthChip key={u.id} name={personName(u) || u.name} dark />)}
                          {l.slice(0, 3).map((e) => <div key={`${e.id}${d}`} className="rounded-md px-1.5 py-[2px] text-[11.5px] font-bold truncate bg-white/[0.08] border-l-2" style={{ borderColor: KIND_DOT[e.kind] || GOLD }}>{e.start ? `${e.start} ` : ""}{e.name} · {e.title}</div>)}
                          {l.length > 3 && <div className="text-[11px] text-white/50 px-1">+{l.length - 3}</div>}
                        </div>
                        {(l.length > 0 || bd.length > 0) && <div className="md:hidden mt-1 flex gap-0.5 flex-wrap">{bd.length > 0 && <span className="text-[9px] leading-none">🎂</span>}{l.slice(0, 4).map((e) => <span key={`${e.id}${d}`} className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_DOT[e.kind] || GOLD }} />)}</div>}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-4">
            <ExecPanel en="DAY DETAIL" title={`${pick.replace(/-/g, ".")} (${DOW[new Date(`${pick}T00:00:00Z`).getUTCDay()]})`}>
              {birthdaysOn(allStaff, pick).length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{birthdaysOn(allStaff, pick).map((u) => <BirthChip key={u.id} name={personName(u) || u.name} big dark />)}</div>}
              {!dayList.length ? <div className="py-6 text-center text-[14px] font-bold text-white/40">일정이 없습니다{canWrite ? " · 날짜를 두 번 누르면 등록할 수 있습니다" : ""}</div> : dayList.map((e) => (
                <button key={e.id} type="button" disabled={!canWrite} onClick={() => setEdit({ ...blank(), ...e })} className="w-full text-left rounded-2xl bg-white/[0.05] border border-white/[0.08] px-3.5 py-3 mb-2 enabled:hover:bg-white/[0.09]">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: KIND_DOT[e.kind] || GOLD }} /><span className="text-[12px] font-black text-white/60">{e.kind}</span><span className="ml-auto text-[13px] font-black tabular-nums text-white/80" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{e.start}{e.end ? `–${e.end}` : ""}</span></div>
                  <div className="text-[16px] font-black mt-1">{e.title}</div>
                  <div className="text-[13px] text-white/55 mt-0.5">{[`${e.name} ${e.position || ""}`.trim(), e.place].filter(Boolean).join(" · ")}</div>
                  {e.memo && <div className="text-[12.5px] text-white/45 mt-1">{e.memo}</div>}
                </button>
              ))}
            </ExecPanel>
            <ExecPanel en="UPCOMING" title="다가오는 일정">
              {!upcoming.length ? <div className="py-4 text-[14px] font-bold text-white/40">예정된 일정이 없습니다</div> : upcoming.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2 border-b border-white/[0.06] last:border-b-0">
                  <span className="w-12 shrink-0 text-center"><span className="block text-[11px] font-black text-white/45">{DOW[new Date(`${e.date}T00:00:00Z`).getUTCDay()]}</span><span className="block text-[17px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{e.date.slice(5).replace("-", ".")}</span></span>
                  <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-black truncate">{e.title}</span><span className="block text-[12.5px] text-white/50 truncate">{e.name} · {e.kind}{e.start ? ` · ${e.start}` : ""}</span></span>
                </div>
              ))}
            </ExecPanel>
          </div>
        </div>
      </div>
      {edit && (
        <div className="fixed inset-0 z-[100000] bg-black/55 flex justify-end" onClick={() => setEdit(null)}>
          <div className="h-full w-full md:w-[560px] flex flex-col text-white shadow-[-24px_0_60px_rgba(0,0,0,0.5)]" style={{ background: SHELL_BG }} onClick={(ev) => ev.stopPropagation()}>
            <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
              <div className="flex-1"><div className="text-[11px] font-extrabold tracking-[0.3em]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: GOLD }}>{edit.id ? "EDIT SCHEDULE" : "NEW SCHEDULE"}</div><div className="text-[22px] font-black">{edit.id ? "일정 수정" : "일정 등록"}</div></div>
              <button type="button" onClick={() => setEdit(null)} className="w-10 h-10 rounded-xl bg-white/10">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {execPeople.length > 0 && (
                <div><div className="text-[13px] font-black text-white/70 mb-1.5">일정 대상자 <span className="text-white/40 font-bold">(인사팀 대리 등록 가능)</span></div>
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
