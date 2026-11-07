// ======================= src/DailyReport.jsx =======================
// 📊 2026-11-06 일일 경영 보고(DAILY REPORT) — 임원 화면 역할용 새 메뉴(기존 "경영 브리핑" 임원 홈과 별개). 승인된 시안(exec-report v1 · 네이비 대시보드)을 그대로 옮겼다.
//  · 화면: 머리말(날짜·보고 기준·3문장 요약) → 핵심 지표 6개 → 30일 매출·수익률 → 월 누계 vs 전월 → 거래처 TOP 8
//          → 운영 현황(지입·직영·임대 · 노선) → 인력 현황 → 자금·정산 → 주의가 필요한 일 (월요일은 3일 합산 + 지난주 주간 요약)
//  · 데이터: 매출·수익 = 매출관리와 같은 오더(salesDispatchData · 배차완료 · 청구운임/수수료) · 청구 사업자 필터(companyBiz)
//           근무자 = attendance(출근 기록) · 차량 = drivers(등급 지입/직영/임대) · 자금 = acctLedger/acctRecurring/acctPayments
//           목표 = companySettings.매출목표.순수매출목표(연간) ÷ 12
//  · 받기 설정(DailyReportSettings) · 아침 요약 팝업(DailyReportPopupHost)도 이 파일에.
import React from "react";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { useOrderHistory } from "./orderHistory";
import { useCompanyBiz, bizOf } from "./companyBiz";
import { useCompanyRows } from "./companyColStore";
import { loadAcctPayments } from "./acctPayments";
import { useApprovalCounts } from "./Approval";
import { pickUnassignedOrders } from "./unassignedRule";
import { approvalLeaveOn } from "./attendanceUtils";
import { CARE_DATES } from "./vehicleCare";
import { isDemoOn } from "./devDemoData";
import { dailyReportDemo } from "./dailyReportDemo";
import {
  addDay, dowOf, isBizDay, kstToday, kstHm, md, mdDow, dotDate, DOW, rangeDays, dayDiff, reportBasis, buildReport, weeklySummary,
  marginOf, pctChange, man, fmt, eok, normPlate, isReceiveDay, mergePrefs, BRIEF_SECTIONS, BRIEF_TIMES, saleOf, profitOf, isDone, dateOf, isCancelledOrder,
} from "./dailyReportCore";
import { C, spark, revMargin, cumChart, donut, cashBars, weekBars } from "./dailyReportCharts";
import { useBriefingPrefs, saveBriefingPrefs, useBriefingCompany, saveBriefingRecipients, useCompanyPeople, canSeeBriefing, isBriefDemo, BRIEF_LABEL, BRIEF_EN } from "./dailyReport";
import { useRoleOptions } from "./customRoles";

const demoOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',system-ui,sans-serif";
const WORK = new Set(["출근", "외근", "조퇴"]);
const LEAVE = new Set(["연차", "오전반차", "오후반차", "병가", "경조사", "휴직", "육아휴직", "출산휴가", "휴무"]);
const STAFF_OUT = ["driver", "shipper", "cafeUser", "totalMaster"];
const hmOf = (iso) => { const m = String(iso || "").match(/T(\d{2}):(\d{2})/); if (m) return `${m[1]}:${m[2]}`; try { const d = new Date(iso); if (!Number.isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; } catch { /* 무시 */ } return ""; };
const toMin = (hm) => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const isLateRec = (rec, emp) => { if (!rec?.checkInTime || !emp?.workStartTime || rec.status !== "출근") return false; const a = toMin(hmOf(rec.checkInTime)); const b = toMin(emp.workStartTime); return a != null && b != null && a > b; };
const daysLabel = (days) => days.map((d) => DOW[d]).join("");

// ─────────────────────────── 작은 부품 ───────────────────────────
function useWidth(ref) {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const upd = () => setW(Math.floor(el.getBoundingClientRect().width));
    upd();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd); }
    const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, [ref]);
  return w;
}
function Measure({ children, style }) {
  const ref = React.useRef(null);
  const w = useWidth(ref);
  return <div ref={ref} style={{ width: "100%", minWidth: 0, ...style }}>{w > 0 ? children(w) : null}</div>;
}
const Svg = ({ html, style }) => <div style={{ lineHeight: 0, ...style }} dangerouslySetInnerHTML={{ __html: html }} />;
function Delta({ v, unit = "%", dp = 1, invert = false, size }) {
  if (v == null || !Number.isFinite(v)) return <span className="ebx-num" style={{ color: C.t3, fontSize: size }}>–</span>;
  const r = Number(v.toFixed(dp));
  const good = invert ? r < 0 : r > 0;
  const col = r === 0 ? C.t3 : good ? C.pos : C.neg;
  return <span className="ebx-num" style={{ color: col, fontWeight: 700, fontSize: size }}>{r === 0 ? "" : r > 0 ? "▲ " : "▼ "}{Math.abs(r).toFixed(dp)}{unit}</span>;
}
const Badge = ({ v }) => (v == null || !Number.isFinite(v) ? <span className="ebx-badge" style={{ color: C.t3, background: "#F1F3F7" }}>신규</span>
  : <span className="ebx-badge" style={{ color: v >= 0 ? C.pos : C.neg, background: v >= 0 ? C.posBg : C.negBg }}>{v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1)}%</span>);
const Tag = ({ children }) => <span className="ebx-tag">⚠ {children}</span>;
function Card({ children, style, title, sub, right, compact }) {
  return (
    <div className="ebx-card" style={{ padding: compact ? "18px 16px" : "22px 24px", minWidth: 0, ...style }}>
      {(title || sub || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div className="ebx-h2">{title}</div>
          {right || (sub ? <div className="ebx-sub">{sub}</div> : null)}
        </div>
      )}
      {children}
    </div>
  );
}
const Ico = {
  pdf: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>,
  mail: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  gear: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>,
  clock: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
};
const CSS = `
.ebx{font-family:${FONT};color:${C.t1};-webkit-font-smoothing:antialiased;letter-spacing:-0.01em;background:${C.page};text-align:left}
.ebx *{box-sizing:border-box}
.ebx .ebx-num{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:-0.02em}
.ebx .ebx-card{background:#fff;border-radius:16px;border:1px solid ${C.line};box-shadow:0 1px 2px rgba(15,26,48,.04),0 4px 16px rgba(15,26,48,.04)}
.ebx .ebx-h2{font-size:17px;font-weight:700;color:${C.t1};line-height:1.35}
.ebx .ebx-sub{font-size:12.5px;color:${C.t3};font-weight:400}
.ebx .ebx-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-size:12px;font-weight:500;padding:4px 10px;line-height:1.4}
.ebx .ebx-btn{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 16px;border-radius:10px;font-size:13.5px;font-weight:500;border:1px solid rgba(255,255,255,.18);color:#fff;background:rgba(255,255,255,.06);cursor:pointer;white-space:nowrap}
.ebx .ebx-btn:hover{background:rgba(255,255,255,.14)}
.ebx .ebx-badge{white-space:nowrap;display:inline-flex;align-items:center;border-radius:6px;font-size:11.5px;font-weight:700;padding:2px 6px;font-variant-numeric:tabular-nums}
.ebx .ebx-tag{white-space:nowrap;display:inline-flex;align-items:center;gap:3px;border-radius:6px;font-size:11px;font-weight:700;padding:2px 6px;background:${C.amberBg};color:#8A5A12}
.ebx .ebx-hdr b{color:#fff;font-weight:700}.ebx .ebx-hdr b.hpos{color:#8EE0AE}.ebx .ebx-hdr b.hneg{color:#FFB4A8}
.ebx .ebx-hs{display:flex;gap:10px;overflow-x:auto;padding:0 16px;scroll-padding:0 16px;scroll-snap-type:x mandatory;scrollbar-width:none}
.ebx .ebx-hs::-webkit-scrollbar{display:none}
.ebx .ebx-hs>.ebx-card{flex:0 0 74%;scroll-snap-align:start}
.ebx .ebx-act{font-size:12.5px;font-weight:500;color:${C.n3};border:1px solid ${C.line};border-radius:8px;padding:6px 10px;white-space:nowrap;background:#fff;cursor:pointer}
.ebx .ebx-act:hover{background:#F5F8FD}
@media print{.ebx .ebx-noprint{display:none!important}}
`;

// ─────────────────────────── 데이터 ───────────────────────────
function useDocData(col, id) {
  const [d, setD] = React.useState(null);
  React.useEffect(() => { if (!id) return undefined; return onSnapshot(doc(db, col, id), (s) => setD(s.exists() ? s.data() : {}), () => setD({})); }, [col, id]);
  return d;
}
function useQueryRows(col, conds, enabled = true) {
  const key = JSON.stringify(conds);
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!enabled || conds.some(([, v]) => !v)) return undefined;
    return onSnapshot(query(collection(db, col), ...conds.map(([k, v]) => where(k, "==", v))), (s) => setRows(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => setRows([]));
  }, [col, key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}
// 화면이 열릴 때 필요한 기간의 예전 오더를 불러온다(실시간 범위 밖) — PC/모바일 모두 OrderHistoryContext
function useHistory(from, to, loadRangeProp) {
  const { loadRange: ctx } = useOrderHistory();
  const loadRange = loadRangeProp || ctx;
  React.useEffect(() => { if (from && to && loadRange) loadRange(from, to); }, [from, to, loadRange]);
}

// 오더 + 회사 설정 → 보고서 숫자
export function useBriefingCore({ company, dispatchData, prefs, bizSel = "", loadRange, withYear = false }) {
  const demo = demoOn() ? dailyReportDemo(company) : null;
  const today = kstToday();
  const basis = React.useMemo(() => reportBasis(today, prefs), [today, prefs]);
  const pmStart = `${addDay(`${basis.end.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
  const from35 = addDay(basis.start, -35);
  const from = [withYear ? `${basis.end.slice(0, 4)}-01-01` : null, pmStart, from35].filter(Boolean).sort()[0];
  useHistory(demo ? null : from, today, loadRange);
  const biz = useCompanyBiz(company);
  const rowsAll = demo ? demo.rows : dispatchData || [];
  const rows = React.useMemo(() => (!bizSel || !biz.multi ? rowsAll : rowsAll.filter((r) => bizOf(r, biz.defaultName) === bizSel)), [rowsAll, bizSel, biz]);
  const cs = useDocData("companySettings", demo ? "" : company);
  const yearly = demo ? demo.yearlyTarget : Number(cs?.매출목표?.순수매출목표) || 0;
  const report = React.useMemo(() => buildReport({ rows, basis, monthlyTarget: yearly > 0 ? yearly / 12 : 0 }), [rows, basis, yearly]);
  const weekly = React.useMemo(() => (basis.weekly ? weeklySummary(rows, today) : null), [rows, basis.weekly, today]);
  return { demo, today, basis, rows, rowsAll, report, weekly, biz };
}

// 주의가 필요한 일 — 오더·결재·차량 서류·저마진·거래처 급감
export function buildActions({ report, unassigned = [], approvalsTodo = 0, drivers = [], today }) {
  const out = [];
  const overdue = unassigned.filter((r) => dateOf(r) && dateOf(r) <= today);
  if (overdue.length) {
    const r = [...overdue].sort((a, b) => (dateOf(a) + (a.상차시간 || "")).localeCompare(dateOf(b) + (b.상차시간 || "")))[0];
    const late = overdue.filter((x) => dateOf(x) < today).length;
    out.push({ s: "긴급", c: C.red, t: `미배차 ${overdue.length}건`, d: `${r.상차지명 || "-"}→${r.하차지명 || "-"} ${[r.차량톤수, r.차량종류].filter(Boolean).join(" ")} · ${r.거래처명 || "거래처 미지정"} · 상차 ${md(dateOf(r))} ${r.상차시간 || ""}${late ? ` · 지난 날짜 ${late}건` : ""}`.trim(), a: "배차 보기", go: "배차현황" });
  }
  if (approvalsTodo > 0) out.push({ s: "확인", c: C.amber, t: `결재 대기 ${approvalsTodo}건`, d: "내 결재 차례인 문서", a: "결재함", go: "결재함" });
  const exp = [];
  (drivers || []).forEach((dv) => { const ds = dv?.care?.dates || {}; CARE_DATES.forEach((cd) => { const v = ds[cd.key]; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return; const left = dayDiff(today, v); if (left >= 0 && left <= 30) exp.push({ left, txt: `${dv.차량번호 || dv.이름 || ""} ${cd.short} D-${left}` }); }); });
  if (exp.length) out.push({ s: "확인", c: C.amber, t: `차량 서류 만료 임박 ${exp.length}건`, d: exp.sort((a, b) => a.left - b.left).slice(0, 3).map((x) => x.txt).join(" · "), a: "목록 보기", go: "지입차관리" });
  const low = report.lowOrders || [];
  if (low.length) {
    const by = {}; low.forEach((r) => { const c = String(r.거래처명 || "미지정"); by[c] = (by[c] || 0) + 1; });
    const avgM = marginOf(report.cur) / 100;
    const loss = low.reduce((s, r) => s + (saleOf(r) * avgM - profitOf(r)), 0);
    out.push({ s: "참고", c: "#8A94A6", t: `저마진 오더 ${low.length}건`, d: `수익률 5% 미만 · ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c, n]) => `${c} ${n}건`).join(", ")}${loss > 0 ? ` · 평균 수익률 대비 −${fmt(man(loss))}만원` : ""}`, a: "오더 보기", go: "매출관리" });
  }
  const drop = (report.clients?.top || []).filter((c) => c.d != null && c.d <= -30);
  if (drop.length) out.push({ s: "참고", c: "#8A94A6", t: `매출 급감 거래처 ${drop.length}곳`, d: drop.slice(0, 3).map((c) => `${c.n} ${c.d.toFixed(0)}%`).join(" · ") + " (최근 4주 같은 요일 평균 대비)", a: "매출관리", go: "매출관리" });
  if (report.cur.cancel > 0) out.push({ s: "참고", c: "#8A94A6", t: `취소 오더 ${report.cur.cancel}건`, d: `보고 기준 기간 취소 · 전 기간 ${report.p1.cancel}건`, a: "배차 보기", go: "배차현황" });
  return out;
}

// ─────────────────────────── 3문장 요약 ───────────────────────────
// 조각: 문자열 | { b } 굵게 | { pos } 초록 | { neg } 빨강
function Narr({ parts }) {
  return <>{parts.map((p, i) => (typeof p === "string" ? <React.Fragment key={i}>{p}</React.Fragment> : p.pos != null ? <b key={i} className="hpos">{p.pos}</b> : p.neg != null ? <b key={i} className="hneg">{p.neg}</b> : <b key={i}>{p.b}</b>))}</>;
}
const pctTok = (v) => (v == null ? { b: "–" } : v >= 0 ? { pos: `${Math.abs(v).toFixed(1)}%` } : { neg: `${Math.abs(v).toFixed(1)}%` });
const upDown = (v, up = "늘었고", dn = "줄었고") => (v == null || v >= 0 ? up : dn);
export function narrative({ report, weekly, actions, ar = [] }) {
  const { basis, cur, p1, p7, month } = report;
  const out = [];
  const lbl = basis.multi ? `${Number(basis.start.slice(5, 7))}월 ${Number(basis.start.slice(8, 10))}일(${DOW[dowOf(basis.start)]})~${Number(basis.end.slice(8, 10))}일(${DOW[dowOf(basis.end)]}) ${basis.days.length}일간` : `${Number(basis.start.slice(5, 7))}월 ${Number(basis.start.slice(8, 10))}일(${DOW[dowOf(basis.start)]})`;
  const m = marginOf(cur); const dm = m - marginOf(p1);
  if (!cur.sale) out.push([`${lbl}에는 집계된 매출이 없습니다.`]);
  else if (basis.multi) out.push([`${lbl} 매출은 `, { b: `${fmt(man(cur.sale))}만원` }, ", 수익은 ", { b: `${fmt(man(cur.profit))}만원` }, "(수익률 ", { b: `${m.toFixed(1)}%` }, ")으로 지난주 같은 기간보다 ", pctTok(pctChange(cur.sale, p7.sale)), ` ${upDown(pctChange(cur.sale, p7.sale), "늘었습니다.", "줄었습니다.")}`]);
  else {
    const a1 = pctChange(cur.sale, p1.sale); const a7 = pctChange(cur.sale, p7.sale);
    const same = a1 != null && a7 != null && (a1 >= 0) === (a7 >= 0);
    const cmp = same ? ["으로 전일보다 ", pctTok(a1), ", 전주 같은 요일보다 ", pctTok(a7), ` ${upDown(a7)}`]
      : ["으로 전일보다 ", pctTok(a1), ` ${a1 == null ? "변동이 없고" : upDown(a1, "늘었으나", "줄었으나")} 전주 같은 요일보다는 `, pctTok(a7), ` ${upDown(a7)}`];
    out.push([`${lbl} 매출은 `, { b: `${fmt(man(cur.sale))}만원` }, ...cmp, ", 수익은 ", { b: `${fmt(man(cur.profit))}만원` }, "(수익률 ", { b: `${m.toFixed(1)}%` }, ", 전일 대비 ", dm >= 0 ? { pos: `+${dm.toFixed(1)}%p` } : { neg: `${dm.toFixed(1)}%p` }, ")입니다."]);
  }
  if (weekly && weekly.prev.sale) {
    const d = pctChange(weekly.cur.sale, weekly.prev.sale);
    out.push([`지난주(${md(weekly.range[0])}~${md(weekly.range[1])}) 주간 매출은 `, { b: `${fmt(man(weekly.cur.sale))}만원` }, "으로 전주보다 ", pctTok(d), ` ${d >= 0 ? "증가했고" : "감소했고"}, 평일 5일 중 ${weekly.over}일이 전주를 넘었습니다.`]);
  } else if (month.mtd) {
    const tp = month.target ? (month.forecast / month.target) * 100 : null;
    out.push(["이번 달 누계는 ", { b: `${fmt(man(month.mtd))}만원` }, ...(month.prevSame ? ["으로 전월 동기보다 ", pctTok(month.d), ` ${month.d >= 0 ? "앞서 있으며" : "뒤처져 있으며"}`] : ["이며"]), ", 이 속도라면 월말 ", { b: `${eok(month.forecast)}원` }, tp ? `(목표의 ${tp.toFixed(0)}%)` : "", "이 예상됩니다."]);
  }
  const lowSet = new Set((report.clients.top || []).filter((c) => c.margin < 8 && c.sale > 0).map((c) => c.n));
  const arHit = ar.find((a) => lowSet.has(a.client) && a.outstanding > 0);
  const urgent = actions.filter((a) => a.s === "긴급");
  if (arHit) {
    const lowN = (report.lowOrders || []).filter((r) => String(r.거래처명 || "") === arHit.client).length;
    out.push(["다만 ", { b: arHit.client }, `은 미수금 ${fmt(man(arHit.outstanding))}만원${lowN ? `과 저마진 오더 ${lowN}건이 겹쳐` : "이 있고 수익률도 낮아"} 거래 조건 점검이 필요합니다.`]);
  } else if (urgent.length) out.push(["다만 ", { b: urgent.map((a) => a.t).join(", ") }, "이 남아 있어 확인이 필요합니다."]);
  else if (lowSet.size) { const c = report.clients.top.find((x) => lowSet.has(x.n)); out.push(["저마진 거래처 ", { b: c.n }, `(수익률 ${c.margin.toFixed(1)}%)의 단가 점검이 필요합니다.`]); }
  else if (actions.length) out.push([`확인할 일 ${actions.length}건이 있습니다(아래 "주의가 필요한 일").`]);
  else out.push(["특이 사항은 없습니다."]);
  return out.slice(0, 3);
}

// ─────────────────────────── 보고서 화면 ───────────────────────────
export default function DailyReport({ company, dispatchData = [], drivers: driversIn = [], me = {}, role = "", profile = null, onGo, canGo = () => true, loadRange }) {
  const uid = me?.uid || "";
  const pf = useBriefingPrefs(uid);
  const prefs = pf.prefs;
  const sec = prefs.sections;
  const [bizSel, setBizSel] = React.useState("");
  const { demo, today, basis, rows, report, weekly, biz } = useBriefingCore({ company, dispatchData, prefs, bizSel, loadRange, withYear: sec.cash !== false });
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const W = useWidth(rootRef);
  const compact = W > 0 && W < 760;
  const mid = W > 0 && W < 1120;

  // 차량·사람·근태·자금
  const drivers = demo ? demo.drivers : driversIn || [];
  const peopleLive = useCompanyPeople(demo ? "" : company);
  const people = demo ? demo.people : peopleLive || [];
  const ym = today.slice(0, 7); const pym = addDay(`${ym}-01`, -1).slice(0, 7);
  const att1 = useQueryRows("attendance", [["companyName", company], ["month", ym]], !demo);
  const att2 = useQueryRows("attendance", [["companyName", company], ["month", pym]], !demo);
  const attByDate = React.useMemo(() => {
    if (demo) return demo.attendance;
    const m = {}; [...(att1 || []), ...(att2 || [])].forEach((a) => { if (a?.date) (m[a.date] = m[a.date] || []).push(a); }); return m;
  }, [demo, att1, att2]);
  const leaveAprs = useQueryRows("approvals", [["company", company], ["cat", "leave"]], !demo && sec.hr !== false) || [];
  const ledgerLive = useCompanyRows("acctLedger", demo || sec.cash === false ? "" : company);
  const recurLive = useCompanyRows("acctRecurring", demo || sec.cash === false ? "" : company);
  const ledger = demo ? demo.ledger : ledgerLive || [];
  const recurring = demo ? demo.recurring : recurLive || [];
  const [arPay, setArPay] = React.useState(null);
  React.useEffect(() => {
    if (demo) { setArPay(demo.arPayments); return undefined; }
    if (sec.cash === false || !company) return undefined;
    let alive = true;
    loadAcctPayments(db, Number(today.slice(0, 4)), company).then((d) => { if (alive) setArPay(d.ar || {}); }).catch(() => { if (alive) setArPay(null); });
    return () => { alive = false; };
  }, [demo, company, today, sec.cash]);
  const apc = useApprovalCounts();
  const approvalsTodo = demo ? demo.approvalsTodo : apc.todo || 0;
  const unassigned = React.useMemo(() => pickUnassignedOrders(demo ? demo.rows : dispatchData), [demo, dispatchData]);

  // 근무자(출근 기록) — 사무직
  const staff = React.useMemo(() => people.filter((u) => !STAFF_OUT.includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사"), [people]);
  const staffIds = React.useMemo(() => new Set(staff.map((u) => u.uid)), [staff]);
  const workOn = React.useCallback((d) => (attByDate[d] || []).filter((a) => staffIds.has(a.uid) && WORK.has(a.status)).length, [attByDate, staffIds]);
  const hasAtt = Object.values(attByDate).some((l) => l.length);
  const lastBiz = [...basis.days].reverse().find(isBizDay) || basis.start;
  const bizSpan = React.useMemo(() => { const out = []; let d = lastBiz; for (let i = 0; i < 40 && out.length < 10; i++) { if (isBizDay(d)) out.unshift(d); d = addDay(d, -1); } return out; }, [lastBiz]);

  // 미수금(회계관리 › 미수금 현황과 같은 계산: 올해 배차완료 청구액 − 수금 기록)
  const ar = React.useMemo(() => {
    if (!arPay) return [];
    const yr = today.slice(0, 4); const m = {};
    rows.forEach((r) => { if (!isDone(r) || isCancelledOrder(r) || dateOf(r).slice(0, 4) !== yr) return; const c = r.거래처명 || r.상차지명 || "미분류"; const e = m[c] || (m[c] = { inv: 0, oldest: "" }); e.inv += saleOf(r); if (!e.oldest || dateOf(r) < e.oldest) e.oldest = dateOf(r); });
    return Object.entries(m).map(([c, v]) => ({ client: c, outstanding: Math.max(0, v.inv - (arPay[c] || 0)), age: v.oldest ? dayDiff(v.oldest, today) : 0 })).filter((x) => x.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  }, [rows, arPay, today]);

  const actions = React.useMemo(() => buildActions({ report, unassigned, approvalsTodo, drivers, today }), [report, unassigned, approvalsTodo, drivers, today]);
  const narr = React.useMemo(() => narrative({ report, weekly, actions, ar }), [report, weekly, actions, ar]);

  const gutter = compact ? 16 : mid ? 24 : 40;
  const prevLbl = basis.multi ? "지난주" : "전일";
  const wkLbl = `전주 ${DOW[dowOf(basis.start)]}`;

  // ── PDF · 메일 ──
  const [busy, setBusy] = React.useState(false);
  const savePdf = async () => {
    const el = rootRef.current; if (!el || busy) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: C.page, ignoreElements: (n) => n?.classList?.contains?.("ebx-noprint") });
      const pdf = new jsPDF("p", "mm", "a4");
      const pw = 210, ph = 297, ih = (canvas.height * pw) / canvas.width; const img = canvas.toDataURL("image/jpeg", 0.92);
      let left = ih, pos = 0; pdf.addImage(img, "JPEG", 0, pos, pw, ih); left -= ph;
      while (left > 0) { pos = left - ih; pdf.addPage(); pdf.addImage(img, "JPEG", 0, pos, pw, ih); left -= ph; }
      pdf.save(`일일경영보고_${today}.pdf`);
    } catch (e) { alert(`PDF 저장 실패: ${e?.message || e}`); } finally { setBusy(false); }
  };
  const textOf = (parts) => parts.map((p) => (typeof p === "string" ? p : p.b ?? p.pos ?? p.neg)).join("");
  const sendMail = () => {
    const subj = `[${company}] 일일 경영 보고 ${dotDate(today)}`;
    const body = `${subj}\n보고 기준: ${basis.label}\n\n${narr.map(textOf).join("\n")}\n\n— LogisWeb 자동 생성 보고서`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  };

  // ── 머리말 ──
  const header = (
    <div className="ebx-hdr" style={{ background: `linear-gradient(135deg,${C.n0} 0%,${C.n1} 45%,${C.n2} 100%)`, color: "#fff", padding: compact ? "22px 16px 22px" : "34px 0 38px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: compact ? 0 : `0 ${gutter}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: C.n3, color: C.sky, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>L</div>
            <div style={{ fontSize: 13, color: "#B9C6E0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><b style={{ color: "#fff" }}>{company}</b> · LogisWeb · {basis.weekly ? "월요일 보고서" : "일일 경영 보고서"}</div>
          </div>
          {!compact && <div className="ebx-noprint" style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ebx-btn" onClick={savePdf} disabled={busy}>{Ico.pdf}{busy ? "저장 중…" : "PDF 저장"}</button>
            <button type="button" className="ebx-btn" onClick={sendMail}>{Ico.mail}메일로 보내기</button>
            <button type="button" className="ebx-btn" onClick={() => setSettingsOpen(true)} data-testid="brief-settings">{Ico.gear}설정</button>
          </div>}
        </div>
        <h1 style={{ marginTop: compact ? 18 : 26, fontSize: compact ? 24 : 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.25, color: "#fff" }}>
          {BRIEF_LABEL} <span style={{ color: C.sky, fontWeight: 500 }}>·</span> <span className="ebx-num" style={{ fontWeight: 800 }}>{dotDate(today)}</span>
        </h1>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="ebx-chip" style={{ background: "rgba(143,176,240,.16)", color: "#DCE6FA" }}>보고 기준: {basis.multi ? `${basis.label}${basis.weekly ? ` + 지난주(${md(addDay(today, -7))}~${md(addDay(today, -1))}) 주간 요약` : ""}` : dotDate(basis.start)}</span>
          <span className="ebx-chip" style={{ background: "rgba(255,255,255,.07)", color: "#B9C6E0" }}>{Ico.clock}매일 {prefs.time} · {prefs.days.length === 5 && [1, 2, 3, 4, 5].every((d) => prefs.days.includes(d)) ? "월~금" : daysLabel(prefs.days)}</span>
          {sec.actions !== false && actions.length > 0 && <span className="ebx-chip" style={{ background: "rgba(197,48,48,.22)", color: "#FFD5D5" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F08080" }} />주의 필요 {actions.length}건</span>}
          {biz.multi && (
            <span className="ebx-noprint" style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", maxWidth: "100%", overflowX: "auto" }}>
              {["", ...biz.names].map((n) => <button key={n || "all"} type="button" onClick={() => setBizSel(n)} style={{ height: 24, padding: "0 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: 0, cursor: "pointer", whiteSpace: "nowrap", background: bizSel === n ? "#fff" : "transparent", color: bizSel === n ? C.n1 : "#C9D4EA" }}>{n || "전체 사업자"}</button>)}
            </span>
          )}
        </div>
        {sec.headline !== false && <p style={{ marginTop: compact ? 16 : 22, maxWidth: 1000, fontSize: compact ? 14.5 : 16.5, lineHeight: 1.75, color: "#C9D4EA", fontWeight: 400, wordBreak: "keep-all" }}>{narr.map((s, i) => <React.Fragment key={i}><Narr parts={s} />{i < narr.length - 1 ? " " : ""}</React.Fragment>)}</p>}
        {compact && <div className="ebx-noprint" style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" className="ebx-btn" style={{ height: 34, fontSize: 12.5, padding: "0 12px" }} onClick={savePdf}>{Ico.pdf}PDF</button>
          <button type="button" className="ebx-btn" style={{ height: 34, fontSize: 12.5, padding: "0 12px" }} onClick={sendMail}>{Ico.mail}메일</button>
          <button type="button" className="ebx-btn" style={{ height: 34, fontSize: 12.5, padding: "0 12px" }} onClick={() => setSettingsOpen(true)} data-testid="brief-settings-m">{Ico.gear}설정</button>
        </div>}
      </div>
    </div>
  );

  // ── 핵심 지표 ──
  const { cur, p1, p7, month } = report;
  const sparkFoot = (extra) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.t3, marginTop: 2, gap: 4 }}><span>{md(report.spanDays[0])}</span><span>{extra || "14일 추이"}</span><span>{md(report.spanDays[13])}</span></div>;
  const tile = (t) => (
    <div key={t.k} className="ebx-card" style={{ padding: "18px 18px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 13, color: C.t2, fontWeight: 500 }}>{t.k}</div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 3 }}><span className="ebx-num" style={{ fontSize: 28, fontWeight: 800 }}>{t.v}</span><span style={{ fontSize: 13, color: C.t2 }}>{t.u}</span></div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", fontSize: 12, color: C.t3 }}>
        <span>{t.l1 || prevLbl}</span><span><Delta v={t.d1} unit={t.unit} dp={t.dp} /></span>
        {t.d2 !== undefined && <><span>{wkLbl}</span><span><Delta v={t.d2} unit={t.unit} dp={t.dp} /></span></>}
      </div>
      <Measure style={{ marginTop: 10 }}>{(w) => <Svg html={spark(t.sp, w, 30)} />}</Measure>
      {t.foot || sparkFoot(t.extra)}
    </div>
  );
  const mtdTile = (
    <div key="mtd" className="ebx-card" style={{ padding: "18px 18px 16px", background: "linear-gradient(180deg,#F7F9FE,#fff)", minWidth: 0 }}>
      <div style={{ fontSize: 13, color: C.t2, fontWeight: 500 }}>이번 달 누계</div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 3 }}><span className="ebx-num" style={{ fontSize: 28, fontWeight: 800 }}>{fmt(man(month.mtd))}</span><span style={{ fontSize: 13, color: C.t2 }}>만원</span></div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", fontSize: 12, color: C.t3 }}>
        <span>전월 동기</span><span><Delta v={month.d} /></span>
        <span>목표 대비</span><span className="ebx-num" style={{ color: C.t1 }}>{month.target ? `${((month.mtd / month.target) * 100).toFixed(1)}%` : "목표 미설정"}</span>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 99, background: "#E6EBF4", marginTop: 12 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, month.target ? (month.mtd / month.target) * 100 : 0)}%`, borderRadius: 99, background: C.n3 }} />
        <div style={{ position: "absolute", left: `${month.totalBiz ? (month.elapsed / month.totalBiz) * 100 : 0}%`, top: -4, width: 2, height: 16, borderRadius: 1, background: C.t1 }} />
      </div>
      <div style={{ marginTop: 7, fontSize: 10.5, color: C.t3 }}>세로선 = 경과 영업일 {month.elapsed}/{month.totalBiz}</div>
      <div style={{ marginTop: 7, fontSize: 12, color: C.t2, lineHeight: 1.45 }}>월말 예상<br /><b className="ebx-num" style={{ color: C.t1, fontSize: 13 }}>{eok(month.forecast)}</b> {month.target > 0 && <span className="ebx-num" style={{ color: month.forecast >= month.target ? C.pos : C.neg, fontWeight: 700 }}>{((month.forecast / month.target) * 100).toFixed(0)}%</span>}</div>
    </div>
  );
  const sp = report.spark;
  const workNow = workOn(lastBiz);
  const tiles = basis.multi ? [
    { k: `${basis.days.length}일 합산 매출`, v: fmt(man(cur.sale)), u: "만원", l1: "지난주 같은 기간", d1: pctChange(cur.sale, p7.sale), sp: sp.sale },
    { k: `${basis.days.length}일 수익 · 수익률`, v: fmt(man(cur.profit)), u: "만원", l1: "지난주 같은 기간", d1: pctChange(cur.profit, p7.profit), sp: sp.profit, extra: `수익률 ${marginOf(cur).toFixed(1)}%` },
    { k: `${basis.days.length}일 오더`, v: fmt(cur.all), u: "건", l1: "지난주 같은 기간", d1: pctChange(cur.all, p7.all), sp: sp.orders, extra: `배차완료 ${cur.all ? ((cur.done / cur.all) * 100).toFixed(1) : "0.0"}%` },
  ] : [
    { k: "전일 매출", v: fmt(man(cur.sale)), u: "만원", d1: pctChange(cur.sale, p1.sale), d2: pctChange(cur.sale, p7.sale), sp: sp.sale },
    { k: "수익 (수수료)", v: fmt(man(cur.profit)), u: "만원", d1: pctChange(cur.profit, p1.profit), d2: pctChange(cur.profit, p7.profit), sp: sp.profit },
    { k: "수익률", v: marginOf(cur).toFixed(1), u: "%", d1: marginOf(cur) - marginOf(p1), d2: marginOf(cur) - marginOf(p7), unit: "%p", sp: sp.margin },
    { k: "오더 · 배차율", v: fmt(cur.all), u: "건", d1: pctChange(cur.all, p1.all), d2: pctChange(cur.all, p7.all), sp: sp.orders, extra: <>배차완료 <b className="ebx-num">{cur.all ? ((cur.done / cur.all) * 100).toFixed(1) : "0.0"}%</b></> },
  ];
  if (basis.multi) { /* 월요일 — 시안처럼 4칸(3일 매출·수익·오더 + 월 누계) */ } else if (hasAtt || demo) tiles.push({ k: "근무자 수", v: fmt(workNow), u: "명", l1: "전 영업일", d1: workNow - workOn(bizSpan[bizSpan.length - 2] || lastBiz), d2: workNow - workOn(addDay(lastBiz, -7)), unit: "명", dp: 0, sp: bizSpan.map(workOn), foot: <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.t3, marginTop: 2 }}><span>{md(bizSpan[0])}</span><span>출근 기록 · {md(lastBiz)}</span><span>{md(lastBiz)}</span></div> });
  else if (!basis.multi) tiles.push({ k: "미배차 / 취소", v: `${unassigned.filter((r) => dateOf(r) <= today).length} / ${cur.cancel}`, u: "건", d1: cur.cancel - p1.cancel, d2: cur.cancel - p7.cancel, unit: "건", dp: 0, sp: report.spanDays.map((d) => report.byDay[d]?.cancel || 0), extra: "취소 14일 추이" });
  const kpiCols = basis.multi ? (compact ? 1 : mid ? 2 : 4) : (mid ? 3 : 6);
  const kpis = compact ? (
    <div style={{ padding: "18px 0 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 16px 10px", fontSize: 13 }}><b>핵심 지표</b><span style={{ color: C.t3 }}>{tiles.length + 1}개 · 밀어서 보기</span></div>
      <div className="ebx-hs">{[...tiles.map(tile), mtdTile]}</div>
    </div>
  ) : (
    <section style={{ display: "grid", gridTemplateColumns: `repeat(${kpiCols},minmax(0,1fr))`, gap: 14 }}>{[...tiles.map(tile), mtdTile]}</section>
  );

  // ── 지난주 주간 요약(월요일) ──
  const weeklyBlock = weekly && (
    <Card compact={compact} title="지난주 주간 요약 · 요일별 매출" right={<div style={{ display: "flex", gap: 14, fontSize: 12, color: C.t2 }}><span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.s1 }} />{md(weekly.range[0])}~{md(weekly.range[1])}</span><span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#C3CAD6" }} />{md(weekly.prevRange[0])}~{md(weekly.prevRange[1])}</span></div>}>
      <div className="ebx-sub" style={{ marginTop: 3 }}>지난주 vs 전주 · 단위 만원 · 막대 위 값은 전주 같은 요일 대비</div>
      <div style={{ display: "grid", gridTemplateColumns: mid ? "1fr" : "minmax(0,1.6fr) minmax(0,1fr)", gap: 28, marginTop: 16, alignItems: "start" }}>
        <Measure>{(w) => <Svg html={weekBars(w, compact ? 210 : 250, weekly.days, weekly.days.map((d, i) => (basis.days.includes(d.d) ? i : -1)).filter((i) => i >= 0), { compact })} />}</Measure>
        <div>
          {[["주간 매출", `${fmt(man(weekly.cur.sale))}만`, `${fmt(man(weekly.prev.sale))}만`, pctChange(weekly.cur.sale, weekly.prev.sale)], ["주간 수익", `${fmt(man(weekly.cur.profit))}만`, `${fmt(man(weekly.prev.profit))}만`, pctChange(weekly.cur.profit, weekly.prev.profit)], ["평균 수익률", `${marginOf(weekly.cur).toFixed(1)}%`, `${marginOf(weekly.prev).toFixed(1)}%`, marginOf(weekly.cur) - marginOf(weekly.prev), "%p"], ["오더", `${fmt(weekly.cur.all)}건`, `${fmt(weekly.prev.all)}건`, pctChange(weekly.cur.all, weekly.prev.all)], ["신규 거래처", `${weekly.fresh}곳`, "", null]].map((r, i) => (
            <div key={r[0]} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, alignItems: "baseline", padding: "11px 0", borderTop: i ? `1px solid ${C.grid}` : "none" }}>
              <span style={{ fontSize: 13, color: C.t2 }}>{r[0]}</span>
              <span><b className="ebx-num" style={{ fontSize: 16 }}>{r[1]}</b>{r[2] && <span className="ebx-num" style={{ fontSize: 11.5, color: C.t3, fontWeight: 400, marginLeft: 6 }}>전주 {r[2]}</span>}</span>
              <span style={{ minWidth: 56, textAlign: "right" }}>{r[3] == null ? <span className="ebx-num" style={{ color: C.pos, fontSize: 13 }}>{weekly.fresh ? `+${weekly.fresh}` : "–"}</span> : <Delta v={r[3]} unit={r[4] || "%"} size={13} />}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );

  // ── 30일 · 월 누계 ──
  const legendRev = <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.t2, flexWrap: "wrap" }}>{[["#B8C8E6", "평일"], ["#DCE3EF", "주말·휴일"], [C.n3, compact ? "보고 기준" : `보고 기준 (${md(basis.end)})`]].map(([c, l]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>)}</div>;
  const chart30 = sec.chart30 !== false && (
    <div className="ebx-card" style={{ padding: compact ? "18px 14px 14px" : "22px 24px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", padding: compact ? "0 4px" : 0 }}><div><div className="ebx-h2">최근 30일 매출 · 수익률</div><div className="ebx-sub" style={{ marginTop: 3 }}>{md(report.d30[0].d)} ~ {md(basis.end)} · 매출 단위 만원</div></div>{legendRev}</div>
      <Measure style={{ marginTop: 14 }}>{(w) => <Svg html={revMargin(w, report.d30, report.weekdayAvg, compact ? { barH: 140, lineH: 56, labelEvery: 7, compact: true } : { labelEvery: w < 560 ? 5 : 3 })} />}</Measure>
    </div>
  );
  const legendCum = <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.t2 }}>{[[C.s1, `${Number(month.ym.slice(5))}월`, false], [C.s1, "예상", true], [C.base, `${Number(month.pym.slice(5))}월`, false]].map(([c, l, dash]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: dash ? 0 : 3, borderRadius: 2, background: dash ? "transparent" : c, borderTop: dash ? `2px dashed ${c}` : "none" }} />{l}</span>)}</div>;
  const mtdCard = sec.mtd !== false && (
    <div className="ebx-card" style={{ padding: compact ? "18px 14px 14px" : "22px 24px", minWidth: 0 }}>
      <div style={{ padding: compact ? "0 4px" : 0 }}>
        <div className="ebx-h2">이번 달 누계 vs 전월 동기</div><div className="ebx-sub" style={{ marginTop: 3 }}>영업일 기준 · 주말 매출은 다음 영업일에 합산</div>
        <div style={{ display: "flex", gap: compact ? 18 : 22, marginTop: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 12, color: C.t2 }}>{Number(month.ym.slice(5))}월 누계 ({month.elapsed}영업일)</div><div className="ebx-num" style={{ fontSize: compact ? 19 : 22 }}>{fmt(man(month.mtd))}<span style={{ fontSize: 12, fontWeight: 400, color: C.t2 }}>만</span></div></div>
          <div><div style={{ fontSize: 12, color: C.t2 }}>전월 동기</div><div className="ebx-num" style={{ fontSize: compact ? 19 : 22, color: C.t2 }}>{fmt(man(month.prevSame))}<span style={{ fontSize: 12, fontWeight: 400 }}>만</span></div></div>
          <div><div style={{ fontSize: 12, color: C.t2 }}>증감</div><div style={{ fontSize: compact ? 19 : 22 }}><Delta v={month.d} /></div></div>
        </div>
        <div style={{ marginTop: 10 }}>{legendCum}</div>
      </div>
      <Measure style={{ marginTop: 6 }}>{(w) => <Svg html={cumChart(w, compact ? 200 : 236, { cur: month.cumCur.map(man), prev: month.cumPrev.map(man), target: man(month.target), forecast: man(month.forecast), total: month.totalBiz, curLabel: `${fmt(man(month.mtd))}만`, prevLabel: `${Number(month.pym.slice(5))}월` }, { compact })} />}</Measure>
    </div>
  );

  // ── 거래처 TOP 8 ──
  const cl = report.clients;
  const maxC = cl.top[0]?.sale || 1;
  const clientsCard = sec.clients !== false && (
    <Card compact={compact} title={`거래처 TOP ${Math.min(8, cl.top.length) || 8} 매출`} right={<div className="ebx-sub" style={compact ? { width: "100%" } : null}>{md(basis.end)}{basis.multi ? ` 외 ${basis.days.length - 1}일` : ""} · 단위 만원 · 증감은 최근 4주 같은 요일 평균 대비</div>}>
      <div style={{ marginTop: 12 }}>
        {!cl.top.length && <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: C.t3 }}>보고 기준 기간에 매출이 없습니다.</div>}
        {cl.top.map((c, i) => {
          const low = c.margin < 8;
          const share = cl.total ? ((c.sale / cl.total) * 100).toFixed(1) : "0.0";
          return compact ? (
            <div key={c.n} style={{ padding: "10px 0", borderTop: i ? `1px solid ${C.grid}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 500, minWidth: 0 }}><span className="ebx-num" style={{ fontSize: 11.5, color: C.t3, width: 12 }}>{i + 1}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.n}</span>{low && <Tag>저마진 {c.margin.toFixed(1)}%</Tag>}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><span className="ebx-num" style={{ fontSize: 13.5 }}>{fmt(man(c.sale))}<span style={{ fontWeight: 400, color: C.t3, fontSize: 11 }}>만 · {share}%</span></span><Badge v={c.d} /></span>
              </div>
              <div style={{ margin: "7px 0 0 18px", height: 8, width: `calc(${((c.sale / maxC) * 100).toFixed(1)}% - 18px)`, borderRadius: "0 4px 4px 0", background: C.n3, opacity: low ? 0.55 : 1 }} />
            </div>
          ) : (
            <div key={c.n} style={{ display: "grid", gridTemplateColumns: "18px minmax(60px,110px) 1fr 118px 150px", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i ? `1px solid ${C.grid}` : "none" }}>
              <span className="ebx-num" style={{ fontSize: 12, color: C.t3 }}>{i + 1}</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.n}>{c.n}</span>
              <div style={{ height: 12, width: `${((c.sale / maxC) * 100).toFixed(1)}%`, borderRadius: "0 4px 4px 0", background: C.n3, opacity: low ? 0.55 : 1 }} />
              <span className="ebx-num" style={{ fontSize: 13.5, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(man(c.sale))}<span style={{ fontWeight: 400, color: C.t3, fontSize: 11.5 }}>만 · {share}%</span></span>
              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center" }}>{low ? <Tag>저마진 {c.margin.toFixed(1)}%</Tag> : <span className="ebx-num" style={{ fontSize: 11.5, color: C.t3, fontWeight: 500 }}>마진 {c.margin.toFixed(1)}%</span>}<Badge v={c.d} /></div>
            </div>
          );
        })}
      </div>
      {cl.top.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.t2, flexDirection: compact ? "column" : "row", gap: 4 }}>
        <span>TOP {cl.top.length} 합계 <b className="ebx-num" style={{ color: C.t1 }}>{fmt(man(cl.topSum))}만</b> ({cl.total ? ((cl.topSum / cl.total) * 100).toFixed(1) : 0}%){cl.others ? ` · 기타 ${cl.others}곳 ${fmt(man(cl.total - cl.topSum))}만` : ""}</span><span>저마진 기준: 수익률 8% 미만</span>
      </div>}
    </Card>
  );

  // ── 운영 현황 ──
  const fleet = drivers.filter((d) => ["지입", "직영", "임대"].includes(String(d.등급 || "").trim()));
  const parts = [["지입", C.s1], ["직영", C.s2], ["임대", C.s3]].map(([n, c]) => ({ n, c, v: fleet.filter((d) => d.등급 === n).length, run: fleet.filter((d) => d.등급 === n && report.plates.has(normPlate(d.차량번호))).length }));
  const fleetN = fleet.length; const runN = parts.reduce((s, p) => s + p.run, 0);
  const fleetPlates = new Set(fleet.map((d) => normPlate(d.차량번호)));
  const extRun = [...report.plates].filter((p) => !fleetPlates.has(p)).length;
  const maxR = report.routes[0]?.[1] || 1;
  const opsCard = sec.ops !== false && (fleetN > 0 || report.routes.length > 0) && (
    <Card compact={compact} title="운영 현황" sub={`${md(basis.end)}${basis.multi ? ` 외 ${basis.days.length - 1}일` : ""} 기준`}>
      {fleetN > 0 && <div style={{ display: "grid", gridTemplateColumns: compact || W < 1250 && !mid ? "1fr" : "1fr 1fr", gap: 20, marginTop: 14 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Svg html={donut(120, parts, { thick: 16, center: `<text x="60" y="56" text-anchor="middle" font-size="22" font-weight="800" fill="${C.t1}">${fleetN}</text><text x="60" y="74" text-anchor="middle" font-size="11" fill="${C.t3}">전체 차량</text>` })} style={{ flex: "none" }} />
          <div style={{ display: "grid", gap: 8 }}>{parts.map((p) => <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: p.c }} /><span style={{ width: 34 }}>{p.n}</span><b className="ebx-num">{p.v}대</b><span className="ebx-num" style={{ color: C.t3, fontWeight: 400, fontSize: 12 }}>{fleetN ? ((p.v / fleetN) * 100).toFixed(0) : 0}%</span></div>)}</div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 13, color: C.t2 }}>가동률 (운행/전체)</span><span><b className="ebx-num" style={{ fontSize: 22 }}>{fleetN ? ((runN / fleetN) * 100).toFixed(1) : "0.0"}%</b> <span className="ebx-num" style={{ fontSize: 12, color: C.t3, fontWeight: 500 }}>{runN}/{fleetN}대</span></span></div>
          {parts.filter((p) => p.v > 0).map((u) => <div key={u.n} style={{ display: "grid", gridTemplateColumns: "34px 1fr 44px", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12.5 }}><span style={{ color: C.t2 }}>{u.n}</span><div style={{ height: 8, background: "#E6EBF4", borderRadius: 99 }}><div style={{ height: 8, width: `${(u.run / u.v) * 100}%`, background: C.n3, borderRadius: 99 }} /></div><span className="ebx-num" style={{ textAlign: "right" }}>{u.run}/{u.v}</span></div>)}
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8 }}>운행 = 보고 기준 기간 오더에 배정된 차량</div>
        </div>
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: compact || !fleetN ? "1fr" : "1fr 1.25fr", gap: 20, marginTop: fleetN ? 20 : 14, paddingTop: fleetN ? 18 : 0, borderTop: fleetN ? `1px solid ${C.grid}` : "none" }}>
        {fleetN > 0 && <div>
          <div style={{ fontSize: 13, color: C.t2, fontWeight: 500 }}>기사 운행 현황 <span style={{ color: C.t3, fontWeight: 400 }}>· 소속 {fleetN}대</span></div>
          <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", gap: 2, marginTop: 12 }}>{[[runN, C.n3], [fleetN - runN, "#B8C8E6"]].filter((a) => a[0] > 0).map((a, i) => <div key={i} style={{ flex: a[0], background: a[1] }} />)}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12.5, flexWrap: "wrap" }}>{[["운행", runN, C.n3], ["미운행", fleetN - runN, "#B8C8E6"], ["용차", extRun, C.amber]].map((a) => <span key={a[0]} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: a[2] }} />{a[0]} <b className="ebx-num">{a[1]}</b></span>)}</div>
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8 }}>용차 = 소속(지입·직영·임대) 외 차량 {extRun}대 운행</div>
        </div>}
        <div>
          <div style={{ fontSize: 13, color: C.t2, fontWeight: 500 }}>노선 TOP 5 <span style={{ color: C.t3, fontWeight: 400 }}>· 상차 → 하차</span></div>
          {!report.routes.length && <div style={{ fontSize: 12.5, color: C.t3, marginTop: 10 }}>오더가 없습니다.</div>}
          {report.routes.map(([k, n], i) => { const [a, b] = k.split("→"); return <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 70px 34px", gap: 8, alignItems: "center", marginTop: i ? 6 : 10, fontSize: 13 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a} <span style={{ color: C.t3 }}>→</span> {b}</span><div style={{ height: 6, background: "#E6EBF4", borderRadius: 99 }}><div style={{ height: 6, width: `${(n / maxR) * 100}%`, background: C.sky, borderRadius: 99 }} /></div><b className="ebx-num" style={{ textAlign: "right" }}>{n}건</b></div>; })}
        </div>
      </div>
    </Card>
  );

  // ── 인력 현황(오늘) ──
  const hrDay = isBizDay(today) ? today : lastBiz; // 휴일에 열면 마지막 영업일 기준
  const todayRecs = attByDate[hrDay] || [];
  const recOf = (u) => todayRecs.find((a) => a.uid === u.uid);
  const hr = React.useMemo(() => {
    let present = 0, late = 0, leave = 0, outside = 0; const lateList = [];
    staff.forEach((u) => {
      const rec = recOf(u); const st = rec?.status || approvalLeaveOn(leaveAprs, u.uid, hrDay);
      if (st && WORK.has(st)) { present += 1; if (st === "외근") outside += 1; if (isLateRec(rec, u)) { late += 1; lateList.push(`${u.name || ""}${u.team ? ` (${u.team})` : ""} ${hmOf(rec.checkInTime)}`); } }
      else if (st && LEAVE.has(st)) leave += 1;
    });
    const wk = addDay(today, -7);
    const hires = staff.filter((u) => /^\d{4}-\d{2}-\d{2}$/.test(String(u.hireDate || "")) && u.hireDate > wk && u.hireDate <= today);
    const quits = people.filter((u) => u.employmentStatus === "퇴사" && String(u.resignedAt || u.퇴사일 || u.resignDate || "").slice(0, 10) > wk);
    return { present, late, leave, outside, lateList, hires, quits };
  }, [staff, people, todayRecs, leaveAprs, today, hrDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const hrCard = sec.hr !== false && staff.length > 0 && (
    <Card compact={compact} title="인력 현황" sub={hrDay === today ? `사무직 · 오늘 ${kstHm()} 기준` : `사무직 · ${mdDow(hrDay)} 기준`}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 14 }}><span className="ebx-num" style={{ fontSize: 30, fontWeight: 800 }}>{hr.present}</span><span style={{ fontSize: 13, color: C.t2 }}>명 근무 중 <span style={{ color: C.t3 }}>/ {staff.length}명</span></span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginTop: 14 }}>{[["출근", hr.present - hr.outside, C.n3], ["지각", hr.late, C.amber], ["휴가", hr.leave, "#B8C8E6"], ["외근", hr.outside, C.sky]].map((s) => <div key={s[0]} style={{ background: "#F6F8FC", borderRadius: 12, padding: "10px 10px 9px", minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.t2 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: s[2] }} />{s[0]}</div><div className="ebx-num" style={{ fontSize: 20, marginTop: 2 }}>{s[1]}</div></div>)}</div>
      <div style={{ marginTop: 16, display: "grid", gap: 9, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: C.t2, flex: "none" }}>신규 입사 <span style={{ color: C.t3, fontSize: 11.5 }}>최근 7일</span></span><span style={{ textAlign: "right" }}><b className="ebx-num">{hr.hires.length}</b>명{hr.hires.length ? ` · ${hr.hires.slice(0, 2).map((u) => `${u.name || ""}${u.team ? ` (${u.team}, ${md(u.hireDate)})` : ""}`).join(", ")}` : ""}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: C.t2 }}>퇴사 <span style={{ color: C.t3, fontSize: 11.5 }}>최근 7일</span></span><span><b className="ebx-num">{hr.quits.length}</b>명</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: C.t2, flex: "none" }}>지각</span><span style={{ textAlign: "right" }}>{hr.lateList.length ? hr.lateList.slice(0, 2).join(", ") + (hr.lateList.length > 2 ? ` 외 ${hr.lateList.length - 2}명` : "") : "없음"}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: C.t2 }}>미출근 기록</span><span><b className="ebx-num">{Math.max(0, staff.length - hr.present - hr.leave)}</b>명 <span style={{ color: C.t3, fontSize: 11.5 }}>{hrDay === today ? "출근 체크 전 포함" : "휴가 외"}</span></span></div>
      </div>
    </Card>
  );

  // ── 자금 · 정산 ──
  const flow = (days) => ledger.reduce((a, r) => { if (!days.includes(String(r.date || ""))) return a; const v = Number(String(r.amount ?? 0).replace(/[^\d-]/g, "")) || 0; if (r.type === "수입") a.in += v; else a.out += v; return a; }, { in: 0, out: 0 });
  const fl = flow(basis.days);
  const bars = React.useMemo(() => { const out = []; let d = basis.end; for (let i = 0; i < 30 && out.length < 5; i++) { if (isBizDay(d)) out.unshift(d); d = addDay(d, -1); } return out; }, [basis.end]);
  const barData = bars.map((d) => { const f = flow([d]); return [md(d), man(f.in), man(f.out)]; });
  const hasLedger = ledger.length > 0;
  const arTotal = ar.reduce((s, a) => s + a.outstanding, 0);
  const ar30 = ar.filter((a) => a.age > 30).reduce((s, a) => s + a.outstanding, 0);
  const week = rangeDays(today, addDay(today, 6));
  const dues = [];
  (recurring || []).filter((r) => r.active !== false && (r.type || "지출") === "지출").forEach((r) => { const dd = Math.min(28, Math.max(1, Number(r.day) || 1)); const hit = week.find((d) => Number(d.slice(8, 10)) === dd); if (hit) dues.push({ d: hit, name: r.name || r.account || "고정비", amt: Number(String(r.amount ?? 0).replace(/[^\d-]/g, "")) || 0 }); });
  dues.sort((a, b) => a.d.localeCompare(b.d));
  const showCash = sec.cash !== false && (hasLedger || arTotal > 0 || dues.length > 0);
  const cashCard = showCash && (
    <Card compact={compact} title="자금 · 정산" sub="단위 만원">
      <div style={{ display: "grid", gridTemplateColumns: compact || !hasLedger ? "1fr" : "minmax(0,1fr) minmax(0,1.1fr)", gap: 24, marginTop: 14 }}>
        {hasLedger && <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><div style={{ fontSize: 12, color: C.t2, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: C.s1 }} />{basis.multi ? "기간" : "전일"} 수입</div><div className="ebx-num" style={{ fontSize: 21, marginTop: 2 }}>{fmt(man(fl.in))}</div></div>
            <div><div style={{ fontSize: 12, color: C.t2, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: C.s2 }} />{basis.multi ? "기간" : "전일"} 지출</div><div className="ebx-num" style={{ fontSize: 21, marginTop: 2 }}>{fmt(man(fl.out))}</div></div>
            <div><div style={{ fontSize: 12, color: C.t2 }}>순유입</div><div className="ebx-num" style={{ fontSize: 21, marginTop: 2, color: fl.in - fl.out >= 0 ? C.pos : C.neg }}>{fl.in - fl.out >= 0 ? "+" : "−"}{fmt(Math.abs(man(fl.in - fl.out)))}</div></div>
          </div>
          <Measure style={{ marginTop: 12 }}>{(w) => <Svg html={cashBars(w, 160, barData, { compact })} />}</Measure>
          <div style={{ fontSize: 11.5, color: C.t3 }}>최근 5영업일 수입·지출 · 수입·지출 장부 기준</div>
        </div>}
        <div>
          {arTotal > 0 && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 13, color: C.t2 }}>미수금 잔액 <span style={{ fontSize: 11.5, color: C.t3 }}>올해</span></span><span><b className="ebx-num" style={{ fontSize: 21 }}>{eok(arTotal).replace("만", "")}</b>{ar30 > 0 && <span style={{ fontSize: 12, color: C.t3 }}> · 30일 초과 <b className="ebx-num" style={{ color: C.neg }}>{fmt(man(ar30))}</b></span>}</span></div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 12, fontWeight: 500 }}>미수금 TOP 3 <span style={{ color: C.t3, fontWeight: 400 }}>· 회계관리 › 미수금 현황 기준</span></div>
            {ar.slice(0, 3).map((o) => <div key={o.client} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: `1px solid ${C.grid}`, fontSize: 13, marginTop: 4, gap: 8 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.client}</span><span style={{ whiteSpace: "nowrap" }}><b className="ebx-num">{fmt(man(o.outstanding))}</b> <span className="ebx-badge" style={{ marginLeft: 6, color: o.age > 30 ? C.neg : C.t2, background: o.age > 30 ? C.negBg : "#F1F3F7" }}>{o.age}일</span></span></div>)}
          </>}
          {dues.length > 0 && <>
            <div style={{ fontSize: 12, color: C.t2, marginTop: arTotal > 0 ? 14 : 0, fontWeight: 500 }}>이번 주 지급 예정 <span style={{ color: C.t3, fontWeight: 400 }}>· 고정비 · 합계 <b className="ebx-num" style={{ color: C.t1 }}>{fmt(man(dues.reduce((s, x) => s + x.amt, 0)))}</b></span></div>
            {dues.slice(0, 4).map((p, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.grid}`, fontSize: 12.5, marginTop: 4 }}><span className="ebx-num" style={{ fontWeight: 500, color: C.t2 }}>{mdDow(p.d).replace("(", " (")}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span><b className="ebx-num">{fmt(man(p.amt))}</b></div>)}
          </>}
          {!arTotal && !dues.length && <div style={{ fontSize: 12.5, color: C.t3 }}>미수금·지급 예정 기록이 없습니다.</div>}
        </div>
      </div>
    </Card>
  );

  // ── 주의가 필요한 일 ──
  const actionsCard = sec.actions !== false && (
    <Card compact={compact} title={<>주의가 필요한 일 <span className="ebx-num" style={{ color: C.t3, fontWeight: 500, fontSize: 14, marginLeft: 4 }}>{actions.length}</span></>} right={<div style={{ display: "flex", gap: 12, fontSize: 12, color: C.t2 }}>{[["긴급", C.red], ["확인", C.amber], ["참고", "#8A94A6"]].map((x) => <span key={x[0]} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: x[1] }} />{x[0]}</span>)}</div>}>
      <div style={{ marginTop: 10 }}>
        {!actions.length && <div style={{ padding: "18px 0", fontSize: 13, color: C.t3 }}>지금 확인할 일이 없습니다.</div>}
        {actions.map((a, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: compact ? "52px minmax(0,1fr)" : "64px 220px minmax(0,1fr) auto", gap: compact ? "4px 10px" : 14, alignItems: "center", padding: "12px 0", borderTop: i ? `1px solid ${C.grid}` : "none" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: a.c === "#8A94A6" ? C.t2 : a.c }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: a.c }} />{a.s}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{a.t}</span>
            {compact && <span />}
            <span style={{ fontSize: 13, color: C.t2, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{a.d}</span>
            {!compact && onGo && canGo(a.go) && <button type="button" className="ebx-act ebx-noprint" onClick={() => onGo(a.go)}>{a.a} ›</button>}
          </div>
        ))}
      </div>
    </Card>
  );

  const footer = (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: compact ? "8px 16px 36px" : `8px ${gutter}px 48px`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontSize: 12, color: C.t3 }}>
      <span>데이터 기준 시각 {dotDate(today)} {kstHm()} · 배차·정산·인사 데이터 자동 집계{bizSel ? ` · 청구 사업자: ${bizSel}` : ""}</span><span>LogisWeb 자동 생성 보고서 · 문의 관리자</span>
    </div>
  );

  const g = compact ? 14 : 20;
  const row = (cols, ...items) => { const list = items.filter(Boolean); if (!list.length) return null; return <section style={{ display: "grid", gridTemplateColumns: list.length > 1 && !mid ? cols : "minmax(0,1fr)", gap: g }}>{list}</section>; };
  return (
    <div ref={rootRef} className="ebx" data-testid="exec-briefing" style={{ borderRadius: compact ? 0 : 20, overflow: "hidden", minWidth: 0 }}>
      <style>{CSS}</style>
      {header}
      {W > 0 && <>
        {compact && sec.kpi !== false && kpis}
        <main style={{ maxWidth: 1280, margin: "0 auto", padding: compact ? "14px 16px 8px" : `28px ${gutter}px 24px`, display: "grid", gap: g }}>
          {!compact && sec.kpi !== false && kpis}
          {weeklyBlock}
          {row("minmax(0,1.62fr) minmax(0,1fr)", chart30 && <React.Fragment key="c30">{chart30}</React.Fragment>, mtdCard && <React.Fragment key="mtd">{mtdCard}</React.Fragment>)}
          {row("minmax(0,1fr) minmax(0,1fr)", clientsCard && <React.Fragment key="cl">{clientsCard}</React.Fragment>, opsCard && <React.Fragment key="ops">{opsCard}</React.Fragment>)}
          {row(hrCard && cashCard ? "minmax(0,1fr) minmax(0,2fr)" : "minmax(0,1fr)", hrCard && <React.Fragment key="hr">{hrCard}</React.Fragment>, cashCard && <React.Fragment key="cash">{cashCard}</React.Fragment>)}
          {actionsCard}
        </main>
        {footer}
      </>}
      {settingsOpen && <DailyReportSettings onClose={() => setSettingsOpen(false)} uid={uid} company={company} prefs={prefs} role={role} profile={profile} people={people} />}
    </div>
  );
}

// ─────────────────────────── 받기 설정 ───────────────────────────
function Toggle({ on, onClick, disabled }) {
  return <button type="button" role="switch" aria-checked={!!on} disabled={disabled} onClick={onClick} style={{ width: 42, height: 24, borderRadius: 99, background: disabled ? "#E6EAF0" : on ? C.n3 : "#D3D9E4", position: "relative", display: "inline-block", flex: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer", padding: 0 }}><span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)", transition: "left .15s" }} /></button>;
}
function Check({ on }) {
  return <span style={{ width: 18, height: 18, borderRadius: 5, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", ...(on ? { background: C.n3 } : { border: "1.5px solid #B7C0D0", background: "#fff" }) }}>{on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>}</span>;
}
export function nextSendOf(prefs, fromMs = Date.now()) {
  const p = mergePrefs(prefs);
  for (let i = 0; i < 15; i++) {
    const d = addDay(kstToday(), i);
    if (!isReceiveDay(d, p)) continue;
    if (i === 0 && kstHm() >= p.time) continue;
    void fromMs;
    return { d, t: p.time };
  }
  return null;
}
export function DailyReportSettings({ onClose, uid, company, prefs, role, profile, people: peopleIn }) {
  const [p, setP] = React.useState(() => mergePrefs(prefs));
  const [timeOpen, setTimeOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const narrow = typeof window !== "undefined" && window.innerWidth < 720;
  const canManage = (() => { try { return role === "totalMaster" || profile?.isMaster === true || ["admin", "allMgr"].includes(role) || ["대표", "대표이사", "사장"].includes(String(profile?.position || "").trim()) || isBriefDemo(); } catch { return false; } })();
  const co = useBriefingCompany(company);
  const [rcp, setRcp] = React.useState(null);
  React.useEffect(() => { if (rcp === null && co.raw !== undefined) setRcp({ ...(co.recipients || {}) }); }, [co.raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = (peopleIn || []).filter((u) => !STAFF_OUT.includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사");
  const { execKeys } = useRoleOptions(); // 기존 임원 화면 역할 목록(권한 관리 › 임원 화면)
  const isExecU = (u) => execKeys.includes(u.role) || (isBriefDemo() && /대표|이사|상무|전무/.test(String(u.position || "")));
  const isOn = (u) => !(rcp && rcp[u.uid] === false);
  const listed = people.filter(isExecU).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const anySection = Object.values(p.sections).some(Boolean);
  const save = async () => {
    if (!anySection) { setMsg("포함할 항목을 1개 이상 골라 주세요."); return; }
    if (!p.days.length) { setMsg("받는 요일을 1개 이상 골라 주세요."); return; }
    setSaving(true); setMsg("");
    try {
      await saveBriefingPrefs(uid, company, { time: p.time, days: p.days, weekend: p.weekend, monday: p.monday, channels: p.channels, sections: p.sections });
      if (canManage && rcp) await saveBriefingRecipients(company, rcp);
      onClose();
    } catch (e) { setMsg(`저장 실패: ${e?.code === "permission-denied" ? "권한이 없습니다(보안 규칙 배포가 필요할 수 있습니다)." : e?.message || e}`); } finally { setSaving(false); }
  };
  const nx = nextSendOf(p);
  const row = (label, desc, ctrl) => (
    <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "180px minmax(0,1fr)", gap: narrow ? 12 : 24, padding: "22px 0", borderTop: `1px solid ${C.grid}` }}>
      <div><div style={{ fontSize: 14.5, fontWeight: 700 }}>{label}</div>{desc && <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>}</div>
      <div style={{ minWidth: 0 }}>{ctrl}</div>
    </div>
  );
  const toggleDay = (d) => set({ days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d].sort() });
  const nextMon = (() => { let d = kstToday(); for (let i = 0; i < 8; i++) { d = addDay(d, 1); if (dowOf(d) === 1) break; } return d; })();
  return (
    <div className="ebx" data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483500, background: "rgba(11,20,40,.55)", display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", overflowY: "auto", padding: narrow ? 0 : "40px 16px" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div role="dialog" aria-modal="true" aria-label="일일 경영 보고 받기 설정" data-testid="brief-settings-dialog" className="ebx-card" style={{ width: narrow ? "100%" : 860, maxWidth: "100%", borderRadius: narrow ? 0 : 16, height: "fit-content", minHeight: narrow ? "100%" : undefined }}>
        <div style={{ padding: narrow ? "22px 18px 6px" : "26px 32px 6px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><div style={{ fontSize: 12.5, color: C.n3, fontWeight: 700 }}>{BRIEF_LABEL} <span style={{ letterSpacing: ".18em", fontSize: 10.5, color: C.t3, marginLeft: 6 }}>{BRIEF_EN}</span></div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, letterSpacing: "-0.03em" }}>받기 설정</div><div style={{ fontSize: 13, color: C.t2, marginTop: 6 }}>일일 경영 보고서를 언제, 어떻게{canManage ? ", 누구에게" : ""} 보낼지 정합니다.</div></div>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ fontSize: 26, color: C.t3, background: "none", border: 0, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: narrow ? "0 18px" : "0 32px" }}>
          {row("받는 시간", "영업일 아침, 선택한 시각에 발송", (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ width: 220, position: "relative" }}>
                <button type="button" data-testid="brief-time" onClick={() => setTimeOpen((v) => !v)} style={{ width: "100%", height: 42, border: `1.5px solid ${C.n3}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", fontSize: 14, fontWeight: 700, background: "#fff", color: C.t1, boxShadow: timeOpen ? "0 0 0 3px rgba(45,76,130,.12)" : "none", cursor: "pointer" }}><span className="ebx-num">{p.time}</span><span style={{ color: C.t3 }}>{timeOpen ? "▴" : "▾"}</span></button>
                {timeOpen && <div className="ebx-card" style={{ marginTop: 6, padding: 6, borderRadius: 12 }}>{BRIEF_TIMES.map((t) => <button type="button" key={t} onClick={() => { set({ time: t }); setTimeOpen(false); }} style={{ width: "100%", height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", fontSize: 13, border: 0, cursor: "pointer", background: t === p.time ? "#EEF3FC" : "transparent", color: t === p.time ? C.n3 : C.t1, fontWeight: t === p.time ? 700 : 500 }}><span className="ebx-num" style={{ fontWeight: "inherit" }}>{t}</span>{t === p.time ? "✓" : ""}</button>)}</div>}
              </div>
              <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6, background: "#F6F8FC", borderRadius: 12, padding: "12px 14px", maxWidth: 250 }}>전날 마감 데이터를 기준으로 보고합니다. <b>06:00</b> 이전 시각은 선택할 수 없습니다.</div>
            </div>
          ))}
          {row("받는 요일", "공휴일은 자동으로 건너뜁니다", (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{[1, 2, 3, 4, 5, 6, 0].map((d) => { const wkd = d === 0 || d === 6; const on = p.days.includes(d) && (!wkd || p.weekend); return <button type="button" key={d} disabled={wkd && !p.weekend} onClick={() => toggleDay(d)} style={{ width: 40, height: 40, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, cursor: wkd && !p.weekend ? "not-allowed" : "pointer", ...(on ? { background: C.n3, color: "#fff", border: 0 } : { background: "#fff", border: `1px solid ${C.line}`, color: C.t3 }) }}>{DOW[d]}</button>; })}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, fontSize: 13.5, flexWrap: "wrap" }}><Toggle on={p.weekend} onClick={() => set({ weekend: !p.weekend, days: !p.weekend ? [...new Set([...p.days, 6, 0])] : p.days.filter((d) => d !== 0 && d !== 6) })} /><span>주말 포함</span><span style={{ color: C.t3, fontSize: 12 }}>{p.weekend ? "켜짐 · 토·일에도 보냄" : "꺼짐 · 토·일에는 보내지 않음"}</span></div>
            </>
          ))}
          {row("월요일 보고 범위", "주말 동안 쌓인 실적을 한 번에", (
            <div style={{ display: "grid", gap: 10 }}>{[["merge3", "금·토·일 3일 합산", `${mdDow(addDay(nextMon, -3))} ~ ${mdDow(addDay(nextMon, -1))} 실적을 합쳐 보고`], ["weekly", "지난주 주간 요약", "요일별 매출 비교, 주간 합계·전주 대비"]].map(([k, t, d]) => <button type="button" key={k} onClick={() => set({ monday: { ...p.monday, [k]: !p.monday[k] } })} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", background: "#FAFBFE", textAlign: "left", cursor: "pointer" }}><Check on={p.monday[k]} /><span><b style={{ fontSize: 14, color: C.t1 }}>{t}</b><div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{d}</div></span></button>)}</div>
          ))}
          {row("받는 방법", "", (
            <div style={{ display: "grid", gap: 4 }}>{[["popup", "앱 팝업", "LogisWeb 첫 접속 시 요약 팝업"], ["push", "모바일 푸시", "LogisWeb 앱 잠금화면 알림"], ["email", "이메일", "요약 메일 · 내 계정 이메일로(공용 메일 서버)"]].map(([k, t, d]) => <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", gap: 12 }}><div><div style={{ fontSize: 14, fontWeight: 500 }}>{t}</div><div style={{ fontSize: 12, color: C.t3 }}>{d}</div></div><Toggle on={p.channels[k]} onClick={() => set({ channels: { ...p.channels, [k]: !p.channels[k] } })} /></div>)}</div>
          ))}
          {row("포함할 항목", "최소 1개 이상", (
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: "10px 20px" }}>{BRIEF_SECTIONS.map(([k, l]) => <button type="button" key={k} onClick={() => set({ sections: { ...p.sections, [k]: !p.sections[k] } })} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: p.sections[k] ? C.t1 : C.t2, background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}><Check on={p.sections[k]} />{l}</button>)}</div>
          ))}
          {canManage && row("받는 사람", "임원 화면 역할 직원은 기본으로 받습니다. 끄면 그 사람에게 팝업·푸시·메일이 가지 않습니다(메뉴는 그대로).", (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              {!listed.length && <div style={{ padding: "14px", fontSize: 13, color: C.t3 }}>임원 화면 역할인 직원이 없습니다(권한 관리 › 역할의 기본 화면 "임원 화면").</div>}
              {listed.map((u, i) => {
                const tags = [u.isMaster ? "마스터" : null, String(u.position || "").trim() || null, u.team && u.team !== u.position ? u.team : null].filter(Boolean).slice(0, 2);
                return (
                  <div key={u.uid} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto auto", gap: 12, alignItems: "center", padding: "11px 14px", borderTop: i ? `1px solid ${C.grid}` : "none" }}>
                    <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8EEF9", color: C.n3, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{String(u.name || u.email || "?").slice(0, 1)}</span>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name || "(이름 없음)"} <span style={{ fontWeight: 400, fontSize: 12.5, color: C.t2 }}>{u.position || ""}</span></div><div style={{ fontSize: 12, color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email || ""}</div></div>
                    <span style={{ display: "flex", gap: 4 }}>{!narrow && tags.map((t) => <span key={t} style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, ...(["대표", "대표이사", "사장"].includes(t) ? { background: C.n1, color: "#fff" } : { background: "#EEF2F8", color: C.n3 }) }}>{t}</span>)}</span>
                    <Toggle on={isOn(u)} onClick={() => setRcp((r) => ({ ...(r || {}), [u.uid]: !isOn(u) }))} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: narrow ? "16px 18px" : "18px 32px", borderTop: `1px solid ${C.line}`, background: "#FAFBFD", borderRadius: narrow ? 0 : "0 0 16px 16px" }}>
          <span style={{ fontSize: 12.5, color: C.t2 }}>{msg ? <b style={{ color: C.neg }}>{msg}</b> : nx ? <>다음 발송: <b className="ebx-num" style={{ color: C.t1 }}>{mdDow(nx.d).replace("(", " (")} {nx.t}</b>{dowOf(nx.d) === 1 && (p.monday.merge3 || p.monday.weekly) ? ` · ${[p.monday.merge3 && "금~일 합산", p.monday.weekly && "주간 요약"].filter(Boolean).join(" + ")}` : ""}</> : "받는 요일이 없습니다"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ height: 42, padding: "0 18px", borderRadius: 11, border: `1px solid ${C.line}`, fontSize: 14, color: C.t2, background: "#fff", cursor: "pointer" }}>취소</button>
            <button type="button" data-testid="brief-save" disabled={saving} onClick={save} style={{ height: 42, padding: "0 26px", borderRadius: 11, background: C.n1, color: "#fff", fontSize: 14, fontWeight: 700, border: 0, cursor: "pointer" }}>{saving ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 아침 요약 팝업 ───────────────────────────
//  월~금(설정한 요일), 받는 시간이 지난 뒤 그날 처음 들어오면 한 번. [오늘 하루 보지 않기] 체크 후 닫으면 그날은 다시 안 뜸.
//  [나중에]는 이번 접속에서만 닫기(다음 접속 때 다시). 대표·임원(또는 받는 사람으로 켠 직원)만, 받는 사람에서 끈 사람은 제외.
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* 무시 */ } };
export function DailyReportPopupHost({ company, dispatchData = [], drivers = [], me = {}, role = "", isExec = false, customRole = null, profile = null, onOpenReport, loadRange, mobile = false }) {
  const uid = me?.uid || "";
  const pf = useBriefingPrefs(uid);
  const co = useBriefingCompany(company);
  const today = kstToday();
  const [now, setNow] = React.useState(kstHm());
  React.useEffect(() => { const t = setInterval(() => setNow(kstHm()), 60000); return () => clearInterval(t); }, []);
  const forced = (() => { try { return import.meta.env.DEV && new URLSearchParams(window.location.search).get("briefPopup") === "1"; } catch { return false; } })();
  const previewOnly = (() => { try { return import.meta.env.DEV && isBriefDemo() && !isDemoOn(); } catch { return false; } })(); // 둘러보기(demo 없이)는 팝업 안 띄움
  const allowed = !previewOnly && canSeeBriefing({ isExec }) && co.recipients[uid] !== false;
  const p = pf.prefs;
  const dismissKey = `kpBriefDismiss:${uid}:${today}`;
  const laterKey = `kpBriefLater:${uid}:${today}`;
  const [closed, setClosed] = React.useState(false);
  const eligible = !!uid && pf.ready && profile !== null && allowed && p.channels.popup !== false && (forced || (isReceiveDay(today, p) && now >= p.time && lsGet(dismissKey) !== "1" && pf.raw?.popupDismissed !== today && ssGet(laterKey) !== "1"));
  const show = eligible && !closed;
  if (!show) return null;
  return <PopupBody {...{ company, dispatchData, drivers, prefs: p, uid, loadRange, mobile, onOpenReport }} onClose={(mode, noToday) => {
    setClosed(true);
    if (noToday || mode === "open") { lsSet(dismissKey, "1"); saveBriefingPrefs(uid, company, { popupDismissed: today }).catch(() => {}); }
    else ssSet(laterKey, "1");
    if (mode === "open") onOpenReport?.();
  }} />;
}
function PopupBody({ company, dispatchData, drivers, prefs, loadRange, mobile, onClose }) {
  const { demo, today, basis, report } = useBriefingCore({ company, dispatchData, prefs, loadRange });
  const apc = useApprovalCounts();
  const unassigned = React.useMemo(() => pickUnassignedOrders(demo ? demo.rows : dispatchData), [demo, dispatchData]);
  const actions = React.useMemo(() => buildActions({ report, unassigned, approvalsTodo: demo ? demo.approvalsTodo : apc.todo || 0, drivers: demo ? demo.drivers : drivers, today }), [report, unassigned, apc.todo, demo, drivers, today]);
  const [noToday, setNoToday] = React.useState(false);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose("later", noToday); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, noToday]);
  const { cur, p1, p7, month } = report;
  const m = marginOf(cur);
  const urgent = actions.filter((a) => a.s === "긴급");
  const d7 = pctChange(cur.sale, p7.sale);
  const fpct = month.target ? (month.forecast / month.target) * 100 : null;
  const nums = [
    [basis.multi ? `${basis.days.length}일 합산 매출` : "전일 매출", fmt(man(cur.sale)), "만원", <><Delta v={pctChange(cur.sale, basis.multi ? p7.sale : p1.sale)} /> <span style={{ color: C.t3 }}>{basis.multi ? "지난주 대비" : "전일"}</span></>],
    ["수익 · 수익률", fmt(man(cur.profit)), "만원", <><b className="ebx-num" style={{ color: C.t1 }}>{m.toFixed(1)}%</b> <Delta v={m - marginOf(basis.multi ? p7 : p1)} unit="%p" /></>],
    ["이번 달 누계", fmt(man(month.mtd)), "만원", month.target ? <>목표 <b className="ebx-num" style={{ color: C.t1 }}>{((month.mtd / month.target) * 100).toFixed(1)}%</b> · 예상 {fpct.toFixed(0)}%</> : <>월말 예상 <b className="ebx-num" style={{ color: C.t1 }}>{eok(month.forecast)}</b></>],
  ];
  return (
    <div className="ebx" data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483400, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", padding: mobile ? 0 : 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose("later", noToday); }}>
      <style>{CSS}</style>
      <div role="dialog" aria-modal="true" aria-label="오늘의 일일 경영 보고" data-testid="brief-popup" style={{ width: mobile ? "100%" : 600, maxWidth: "100%", maxHeight: "94vh", overflowY: "auto", borderRadius: mobile ? "24px 24px 0 0" : 24, background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)" }}>
        <div style={{ background: `linear-gradient(135deg,${C.n0},${C.n2})`, padding: mobile ? "22px 20px 20px" : "26px 28px 24px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="ebx-chip" style={{ background: "rgba(143,176,240,.18)", color: "#DCE6FA" }}>{Ico.clock}{prefs.time} · {dotDate(today)}</span><button type="button" aria-label="닫기" onClick={() => onClose("later", noToday)} style={{ color: "#8E9BB5", fontSize: 24, lineHeight: 1, background: "none", border: 0, cursor: "pointer" }}>×</button></div>
          <div style={{ fontSize: mobile ? 21 : 24, fontWeight: 800, marginTop: 16, letterSpacing: "-0.03em" }}>오늘의 일일 경영 보고</div>
          <div style={{ fontSize: 13, color: "#B9C6E0", marginTop: 4 }}>보고 기준: {basis.multi ? basis.label : mdDow(basis.start).replace("(", " (")} · {company}</div>
        </div>
        <div style={{ padding: mobile ? "18px 16px 6px" : "22px 28px 8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 10 }}>{nums.map((n) => <div key={n[0]} style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: mobile ? "12px 14px" : "14px 14px 12px", display: mobile ? "flex" : "block", justifyContent: "space-between", alignItems: "center", gap: 8 }}><div><div style={{ fontSize: 12.5, color: C.t2 }}>{n[0]}</div><div style={{ marginTop: mobile ? 2 : 6 }}><span className="ebx-num" style={{ fontSize: mobile ? 22 : 26, fontWeight: 800 }}>{n[1]}</span><span style={{ fontSize: 12, color: C.t2 }}> {n[2]}</span></div></div><div style={{ fontSize: 12, marginTop: mobile ? 0 : 6, color: C.t3, textAlign: mobile ? "right" : "left" }}>{n[3]}</div></div>)}</div>
          <div style={{ marginTop: 16, background: "#F5F7FC", borderRadius: 14, padding: "14px 16px", fontSize: 14, lineHeight: 1.65, color: C.t1, wordBreak: "keep-all" }}>
            매출은 {basis.multi ? "지난주 같은 기간" : "전주 같은 요일"}보다 <b style={{ color: d7 == null || d7 >= 0 ? C.pos : C.neg }}>{d7 == null ? "–" : `${Math.abs(d7).toFixed(1)}%`}</b> {d7 == null || d7 >= 0 ? "늘었고" : "줄었고"} {fpct ? (fpct >= 100 ? <>월말 목표 달성(예상 {fpct.toFixed(0)}%)이 유력합니다.</> : <>월말에는 목표의 {fpct.toFixed(0)}% 수준이 예상됩니다.</>) : <>월말 {eok(month.forecast)}원이 예상됩니다.</>} {actions.length ? <><b>주의 필요 {actions.length}건</b>{urgent.length ? ` 중 긴급 ${urgent.length}건(${urgent.map((a) => a.t).join(", ")})이 있습니다.` : "이 있습니다."}</> : "확인할 일은 없습니다."}
          </div>
          {actions.length > 0 && <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>{actions.slice(0, 3).map((a) => <span key={a.t} className="ebx-chip" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.t1 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: a.c }} />{a.t}</span>)}</div>}
        </div>
        <div style={{ display: "flex", gap: 10, padding: mobile ? "14px 16px calc(18px + env(safe-area-inset-bottom,0px))" : "18px 28px 24px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.t2, marginRight: "auto", cursor: "pointer", ...(mobile ? { width: "100%", marginBottom: 2 } : {}) }}><input type="checkbox" checked={noToday} onChange={(e) => setNoToday(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.n3 }} data-testid="brief-notoday" />오늘 하루 보지 않기</label>
          <button type="button" onClick={() => onClose("later", noToday)} style={{ flex: mobile ? "1 1 0" : "none", height: 44, padding: "0 20px", borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 14, fontWeight: 500, color: C.t2, background: "#fff", cursor: "pointer" }}>나중에</button>
          <button type="button" data-testid="brief-open" onClick={() => onClose("open", true)} style={{ flex: mobile ? "2 1 0" : "none", height: 44, padding: "0 22px", borderRadius: 12, background: C.n1, color: "#fff", fontSize: 14, fontWeight: 700, border: 0, cursor: "pointer" }}>전체 보고서 보기 →</button>
        </div>
      </div>
    </div>
  );
}
