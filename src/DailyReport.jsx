// ======================= src/DailyReport.jsx =======================
// 📊 2026-11-06 일일 경영 보고(DAILY REPORT) — 임원 화면 역할용 새 메뉴(기존 "경영 브리핑" 임원 홈과 별개).
//  ⭐ 2026-11-08 임원 피드백 반영 — 화면 전체 폭(반응형) · 큰 글씨(본문 16px 이상 · 라벨 15px 이상 · 핵심 숫자 크게)
//     · "주의가 필요한 일" 없앰(팝업 칩·푸시 문구 포함) · 담당자별 매출 · 자금 현황 자세히(계좌별 잔액·입출금 요약·지급 예정·미수 나이·순현금흐름)
//     · 월 목표 진척 · 거래처 증감 · 차량 가동률 추이 추가 · 증감 색은 글자색만(상승 빨강 ▲ · 하락 파랑 ▼ · 변화 없음 회색)
//  · 화면: 머리말(날짜·보고 기준·3문장 요약) → 핵심 지표 → (월요일: 지난주 주간 요약) → 30일 매출·수익률 · 월 목표 진척
//          → 담당자별 매출 · 거래처 TOP 8/증감 → 자금 현황 → 운영 현황(가동률 추이) · 인력 현황
//  · 데이터: 매출·수익 = 매출관리와 같은 오더(salesDispatchData · 청구운임/기사운임) · 청구 사업자 필터(companyBiz)
//           담당자 = 오더 등록 직원(src/detailGetters.js orderStaffNameRaw · 배차표 "배차담당자"와 같은 기준, 고정노선 오더는 배차확정자)
//           근무자 = attendance(출근 기록) · 차량 = drivers(등급 지입/직영/임대)
//           자금 = acctFunds(통장·현금·카드·대출, src/fundsCalc.js computeFunds) · acctLedger(수입·지출 장부) · acctRecurring(고정비) · acctPayments(수금)
//           목표 = companySettings.매출목표.순수매출목표(연간) ÷ 12
//  · 받기 설정(DailyReportSettings) · 아침 요약 팝업(DailyReportPopupHost)도 이 파일에.
import React from "react";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { useOrderHistory } from "./orderHistory";
import { useCompanyBiz, bizOf } from "./companyBiz";
import { useCompanyRows } from "./companyColStore";
import { loadAcctPayments } from "./acctPayments";
import { pickUnassignedOrders } from "./unassignedRule";
import { isPopupOn, usePopupPrefs } from "./popupPrefs"; // ⭐ 2026-11-07 팝업 알림 설정
import { approvalLeaveOn } from "./attendanceUtils";
import { isDemoOn } from "./devDemoData";
import { dailyReportDemo } from "./dailyReportDemo";
import { orderStaffNameRaw, useUserNameMap, ORDER_MGR_FIXED } from "./detailGetters";
import { computeFunds, isCard, isCredit, last4 } from "./fundsCalc";
import {
  addDay, dowOf, isBizDay, kstToday, kstHm, md, mdDow, dotDate, DOW, rangeDays, dayDiff, reportBasis, buildReport, weeklySummary,
  marginOf, pctChange, man, fmt, eok, normPlate, isReceiveDay, mergePrefs, BRIEF_SECTIONS, SECTION_KEYS, BRIEF_TIMES, saleOf, isDone, dateOf, isCancelledOrder,
  staffRanking, monthSpans, clientMoves, agingOf,
} from "./dailyReportCore";
import { C, spark, revMargin, cumChart, donut, weekBars, netFlowBars, trendLine } from "./dailyReportCharts";
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
const toInt = (v) => Number(String(v ?? 0).replace(/[^\d-]/g, "")) || 0;
const pctStr = (a, b, dp = 1) => (b ? `${((a / b) * 100).toFixed(dp)}%` : "–");

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
// 증감 — 글자색만(상승 빨강 ▲ · 하락 파랑 ▼ · 변화 없음 회색) · light = 어두운 바탕용 밝은 색
function Delta({ v, unit = "%", dp = 1, size, light = false, sign = false }) {
  if (v == null || !Number.isFinite(v)) return <span className="ebx-num" style={{ color: light ? "#9AA8C2" : C.flat, fontSize: size, fontWeight: 700 }}>–</span>;
  const r = Number(v.toFixed(dp));
  const col = r > 0 ? (light ? C.upL : C.up) : r < 0 ? (light ? C.downL : C.down) : (light ? "#9AA8C2" : C.flat);
  return <span className="ebx-num" style={{ color: col, fontWeight: 800, fontSize: size, whiteSpace: "nowrap" }}>{r > 0 ? "▲ " : r < 0 ? "▼ " : ""}{sign && r ? (r > 0 ? "+" : "−") : ""}{Math.abs(r).toFixed(dp)}{unit}</span>;
}
const Chg = ({ v, size }) => (v == null || !Number.isFinite(v) ? <span className="ebx-num" style={{ color: C.flat, fontWeight: 700, fontSize: size }}>신규</span> : <Delta v={v} size={size} />);
// 원 → 만원 증감 표시(+1,234만 빨강 / −1,234만 파랑)
const ManDiff = ({ won, size }) => { const v = man(won); const col = v > 0 ? C.up : v < 0 ? C.down : C.flat; return <span className="ebx-num" style={{ color: col, fontWeight: 800, fontSize: size, whiteSpace: "nowrap" }}>{v > 0 ? "▲ +" : v < 0 ? "▼ −" : ""}{fmt(Math.abs(v))}만</span>; };
function Card({ children, style, title, sub, right, compact, id }) {
  return (
    <section id={id} className="ebx-card" style={{ padding: compact ? "22px 18px" : "28px 30px", minWidth: 0, ...style }}>
      {(title || sub || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}><h2 className="ebx-h2">{title}</h2>{sub && <div className="ebx-sub" style={{ marginTop: 6 }}>{sub}</div>}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
const Dot = ({ c, r = 4 }) => <span style={{ width: r * 3, height: r * 3, borderRadius: r, background: c, flex: "none", display: "inline-block" }} />;
const Legend = ({ items }) => <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 15, color: C.t2 }}>{items.map(([c, l, dash]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 7 }}>{dash ? <span style={{ width: 18, borderTop: `3px dashed ${c}` }} /> : <Dot c={c} />}{l}</span>)}</div>;
function Seg({ value, onChange, items, dark }) {
  return (
    <div className="ebx-seg ebx-noprint" role="tablist" style={dark ? { background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.16)" } : null}>
      {items.map(([k, l]) => <button key={k || "all"} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={value === k ? "on" : ""} style={dark && value !== k ? { color: "#C9D4EA" } : null}>{l}</button>)}
    </div>
  );
}
const Ico = {
  pdf: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>,
  mail: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  gear: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>,
  clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
};
const CSS = `
.ebx{font-family:${FONT};color:${C.t1};-webkit-font-smoothing:antialiased;letter-spacing:-0.01em;background:${C.page};text-align:left;font-size:16px;line-height:1.5}
.ebx *{box-sizing:border-box}
.ebx h1,.ebx h2,.ebx p{margin:0}
.ebx .ebx-num{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:-0.02em}
.ebx .ebx-card{background:#fff;border-radius:20px;border:1px solid ${C.line};box-shadow:0 1px 2px rgba(15,26,48,.04),0 6px 20px rgba(15,26,48,.05)}
.ebx .ebx-h2{font-size:22px;font-weight:800;color:${C.t1};line-height:1.3;letter-spacing:-0.025em}
.ebx .ebx-sub{font-size:15px;color:${C.t2};font-weight:400;line-height:1.5}
.ebx .ebx-lbl{font-size:15px;color:${C.t2};font-weight:600}
.ebx .ebx-h3{font-size:17px;font-weight:800;color:${C.t1}}
.ebx .ebx-chip{display:inline-flex;align-items:center;gap:8px;border-radius:999px;font-size:15px;font-weight:600;padding:7px 14px;line-height:1.4}
.ebx .ebx-btn{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 20px;border-radius:12px;font-size:16px;font-weight:700;border:1px solid rgba(255,255,255,.22);color:#fff;background:rgba(255,255,255,.07);cursor:pointer;white-space:nowrap}
.ebx .ebx-btn:hover{background:rgba(255,255,255,.16)}
.ebx .ebx-tag{white-space:nowrap;display:inline-flex;align-items:center;border-radius:8px;font-size:14px;font-weight:700;padding:1px 8px;border:1.5px solid #D5DBE5;color:${C.t2}}
.ebx .ebx-seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:#F1F4F9;border:1px solid ${C.line};max-width:100%;overflow-x:auto}
.ebx .ebx-seg button{height:38px;padding:0 16px;border-radius:9px;font-size:15px;font-weight:700;border:0;cursor:pointer;white-space:nowrap;background:transparent;color:${C.t2}}
.ebx .ebx-seg button.on{background:#fff;color:${C.n1};box-shadow:0 1px 3px rgba(15,26,48,.12)}
.ebx .ebx-row{border-top:1px solid ${C.grid}}
.ebx .ebx-link{font-size:15px;font-weight:700;color:${C.n3};border:1px solid ${C.line};border-radius:10px;padding:8px 14px;white-space:nowrap;background:#fff;cursor:pointer}
.ebx .ebx-link:hover{background:#F5F8FD}
.ebx .ebx-hdr b{color:#fff;font-weight:800}.ebx .ebx-hdr b.hup{color:${C.upL}}.ebx .ebx-hdr b.hdn{color:${C.downL}}
.ebx .ebx-stat{background:#F6F8FC;border-radius:16px;padding:16px 18px;min-width:0}
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

// ─────────────────────────── 3문장 요약 ───────────────────────────
// 조각: 문자열 | { b } 굵게 | { up } 상승(빨강) | { dn } 하락(파랑)
function Narr({ parts }) {
  return <>{parts.map((p, i) => (typeof p === "string" ? <React.Fragment key={i}>{p}</React.Fragment> : p.up != null ? <b key={i} className="hup">{p.up}</b> : p.dn != null ? <b key={i} className="hdn">{p.dn}</b> : <b key={i}>{p.b}</b>))}</>;
}
const pctTok = (v) => (v == null ? { b: "–" } : v > 0 ? { up: `${Math.abs(v).toFixed(1)}%` } : v < 0 ? { dn: `${Math.abs(v).toFixed(1)}%` } : { b: "0.0%" });
const upDown = (v, up = "늘었고", dn = "줄었고") => (v == null || v >= 0 ? up : dn);
export function narrative({ report, weekly, ar = [], topStaff = null }) {
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
    out.push([`${lbl} 매출은 `, { b: `${fmt(man(cur.sale))}만원` }, ...cmp, ", 수익은 ", { b: `${fmt(man(cur.profit))}만원` }, "(수익률 ", { b: `${m.toFixed(1)}%` }, ", 전일 대비 ", dm > 0 ? { up: `+${dm.toFixed(1)}%p` } : dm < 0 ? { dn: `${dm.toFixed(1)}%p` } : { b: "0.0%p" }, ")입니다."]);
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
  if (arHit) {
    const lowN = (report.lowOrders || []).filter((r) => String(r.거래처명 || "") === arHit.client).length;
    out.push(["다만 ", { b: arHit.client }, `은 미수금 ${fmt(man(arHit.outstanding))}만원${lowN ? `과 저마진 오더 ${lowN}건이 겹쳐` : "이 있고 수익률도 낮아"} 거래 조건 점검이 필요합니다.`]);
  } else if (lowSet.size) { const c = report.clients.top.find((x) => lowSet.has(x.n)); out.push(["저마진 거래처 ", { b: c.n }, `(수익률 ${c.margin.toFixed(1)}%)의 단가 점검이 필요합니다.`]); }
  else if (topStaff) out.push(["담당자 중에서는 ", { b: topStaff.n }, "님이 매출 ", { b: `${fmt(man(topStaff.sale))}만원` }, "으로 가장 많았습니다."]);
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
  const [staffMode, setStaffMode] = React.useState("basis");
  const rootRef = React.useRef(null);
  const W = useWidth(rootRef);
  const compact = W > 0 && W < 760;
  const wide = W >= 1280;
  const xl = W >= 1760;

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
  const cashCo = demo || sec.cash === false ? "" : company;
  const ledgerLive = useCompanyRows("acctLedger", cashCo);
  const recurLive = useCompanyRows("acctRecurring", cashCo);
  const fundsLive = useCompanyRows("acctFunds", cashCo);
  const ledger = demo ? demo.ledger : ledgerLive || [];
  const recurring = demo ? demo.recurring : recurLive || [];
  const fundRows = demo ? demo.funds : fundsLive || [];
  const F = React.useMemo(() => (fundRows.length ? computeFunds(fundRows, ledger) : null), [fundRows, ledger]);
  const [arPay, setArPay] = React.useState(null);
  React.useEffect(() => {
    if (demo) { setArPay(demo.arPayments); return undefined; }
    if (sec.cash === false || !company) return undefined;
    let alive = true;
    loadAcctPayments(db, Number(today.slice(0, 4)), company).then((d) => { if (alive) setArPay(d.ar || {}); }).catch(() => { if (alive) setArPay(null); });
    return () => { alive = false; };
  }, [demo, company, today, sec.cash]);
  const unassigned = React.useMemo(() => pickUnassignedOrders(demo ? demo.rows : dispatchData), [demo, dispatchData]);

  // 근무자(출근 기록) — 사무직
  const staff = React.useMemo(() => people.filter((u) => !STAFF_OUT.includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사"), [people]);
  const staffIds = React.useMemo(() => new Set(staff.map((u) => u.uid)), [staff]);
  const workOn = React.useCallback((d) => (attByDate[d] || []).filter((a) => staffIds.has(a.uid) && WORK.has(a.status)).length, [attByDate, staffIds]);
  const hasAtt = Object.values(attByDate).some((l) => l.length);
  const lastBiz = [...basis.days].reverse().find(isBizDay) || basis.start;
  const bizSpan = React.useMemo(() => { const out = []; let d = lastBiz; for (let i = 0; i < 40 && out.length < 10; i++) { if (isBizDay(d)) out.unshift(d); d = addDay(d, -1); } return out; }, [lastBiz]);
  const bizSpan14 = React.useMemo(() => { const out = []; let d = lastBiz; for (let i = 0; i < 60 && out.length < 14; i++) { if (isBizDay(d)) out.unshift(d); d = addDay(d, -1); } return out; }, [lastBiz]);

  // 미수금(회계관리 › 미수금 현황과 같은 계산: 올해 배차완료 청구액 − 수금 기록) + 나이(오래된 청구부터 수금된 것으로 보고)
  const ar = React.useMemo(() => {
    if (!arPay) return [];
    const yr = today.slice(0, 4); const m = {};
    rows.forEach((r) => { if (!isDone(r) || isCancelledOrder(r) || dateOf(r).slice(0, 4) !== yr) return; const c = r.거래처명 || r.상차지명 || "미분류"; const e = m[c] || (m[c] = { inv: 0, oldest: "", list: [] }); const s = saleOf(r); e.inv += s; e.list.push({ d: dateOf(r), amt: s }); if (!e.oldest || dateOf(r) < e.oldest) e.oldest = dateOf(r); });
    return Object.entries(m).map(([c, v]) => ({ client: c, outstanding: Math.max(0, v.inv - (arPay[c] || 0)), age: v.oldest ? dayDiff(v.oldest, today) : 0, aging: agingOf(v.list, arPay[c] || 0, today) })).filter((x) => x.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
  }, [rows, arPay, today]);

  // 담당자별 매출 — 등록 직원(고정노선 오더는 배차확정자)
  const nameMap = useUserNameMap();
  const staffOf = React.useCallback((r) => { const n = orderStaffNameRaw(r, nameMap); return (n && n !== ORDER_MGR_FIXED ? n : "") || String(r?.배차확정자 || "").trim() || n || "미지정"; }, [nameMap]);
  const mSpan = React.useMemo(() => monthSpans(basis.end), [basis.end]);
  const staffRank = React.useMemo(() => {
    const hide = (n) => n === "최고관리자";
    return {
      basis: staffRanking(rows, basis.days, basis.prev1, staffOf, hide),
      month: staffRanking(rows, mSpan.cur, mSpan.prev, staffOf, hide),
    };
  }, [rows, basis, mSpan, staffOf]);
  const moves = React.useMemo(() => clientMoves(report.byClientDay, mSpan.cur, mSpan.prev, 4), [report.byClientDay, mSpan]);

  // 차량 가동률 추이(최근 14영업일 · 운행 = 그날 오더에 배정된 소속 차량)
  const fleet = React.useMemo(() => drivers.filter((d) => ["지입", "직영", "임대"].includes(String(d.등급 || "").trim())), [drivers]);
  const fleetPlates = React.useMemo(() => new Set(fleet.map((d) => normPlate(d.차량번호)).filter(Boolean)), [fleet]);
  const utilTrend = React.useMemo(() => {
    if (!fleetPlates.size) return [];
    const want = new Set(bizSpan14); const by = {};
    rows.forEach((r) => { const d = dateOf(r); if (!want.has(d) || isCancelledOrder(r) || r.source === "transport_transmit") return; const p = normPlate(r.차량번호); if (p && fleetPlates.has(p)) (by[d] = by[d] || new Set()).add(p); });
    return bizSpan14.map((d) => [md(d), ((by[d]?.size || 0) / fleetPlates.size) * 100]);
  }, [rows, bizSpan14, fleetPlates]);

  const narr = React.useMemo(() => narrative({ report, weekly, ar, topStaff: staffRank.basis.list.find((x) => x.n !== "미지정") || null }), [report, weekly, ar, staffRank]);

  const gutter = compact ? 16 : W < 1280 ? 24 : xl ? 48 : 36;
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
  const textOf = (parts) => parts.map((p) => (typeof p === "string" ? p : p.b ?? p.up ?? p.dn)).join("");
  const sendMail = () => {
    const subj = `[${company}] 일일 경영 보고 ${dotDate(today)}`;
    const body = `${subj}\n보고 기준: ${basis.label}\n\n${narr.map(textOf).join("\n")}\n\nLogisWeb 자동 생성 보고서`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  };

  const inner = { maxWidth: 2400, margin: "0 auto", padding: `0 ${gutter}px` };

  // ── 머리말 ──
  const header = (
    <div className="ebx-hdr" style={{ background: `linear-gradient(135deg,${C.n0} 0%,${C.n1} 45%,${C.n2} 100%)`, color: "#fff", padding: compact ? "24px 0 26px" : "36px 0 40px" }}>
      <div style={inner}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.n3, color: C.sky, fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>L</div>
            <div style={{ fontSize: 16, color: "#C9D4EA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><b style={{ color: "#fff" }}>{company}</b> · {basis.weekly ? "월요일 보고서" : "일일 경영 보고서"}</div>
          </div>
          {!compact && <div className="ebx-noprint" style={{ display: "flex", gap: 10 }}>
            <button type="button" className="ebx-btn" onClick={savePdf} disabled={busy}>{Ico.pdf}{busy ? "저장 중" : "PDF 저장"}</button>
            <button type="button" className="ebx-btn" onClick={sendMail}>{Ico.mail}메일로 보내기</button>
            <button type="button" className="ebx-btn" onClick={() => setSettingsOpen(true)} data-testid="brief-settings">{Ico.gear}설정</button>
          </div>}
        </div>
        <h1 style={{ marginTop: compact ? 20 : 28, fontSize: compact ? 28 : 42, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.2, color: "#fff" }}>
          {BRIEF_LABEL} <span style={{ color: C.sky, fontWeight: 500 }}>·</span> <span className="ebx-num" style={{ fontWeight: 800 }}>{dotDate(today)}</span>
        </h1>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className="ebx-chip" style={{ background: "rgba(143,176,240,.18)", color: "#E3EBFB" }}>보고 기준 {basis.multi ? `${basis.label}${basis.weekly ? ` + 지난주(${md(addDay(today, -7))}~${md(addDay(today, -1))}) 주간 요약` : ""}` : dotDate(basis.start)}</span>
          <span className="ebx-chip" style={{ background: "rgba(255,255,255,.08)", color: "#C9D4EA" }}>{Ico.clock}매일 {prefs.time} · {prefs.days.length === 5 && [1, 2, 3, 4, 5].every((d) => prefs.days.includes(d)) ? "월~금" : daysLabel(prefs.days)}</span>
          {biz.multi && <Seg dark value={bizSel} onChange={setBizSel} items={[["", "전체 사업자"], ...biz.names.map((n) => [n, n])]} />}
        </div>
        {sec.headline !== false && <p style={{ marginTop: compact ? 18 : 24, maxWidth: xl ? 1520 : 1180, fontSize: compact ? 17 : xl ? 21 : 20, lineHeight: 1.75, color: "#DCE4F2", fontWeight: 400, wordBreak: "keep-all" }}>{narr.map((s, i) => <React.Fragment key={i}><Narr parts={s} />{i < narr.length - 1 ? " " : ""}</React.Fragment>)}</p>}
        {compact && <div className="ebx-noprint" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 18 }}>
          <button type="button" className="ebx-btn" style={{ padding: 0, justifyContent: "center" }} onClick={savePdf}>{Ico.pdf}PDF</button>
          <button type="button" className="ebx-btn" style={{ padding: 0, justifyContent: "center" }} onClick={sendMail}>{Ico.mail}메일</button>
          <button type="button" className="ebx-btn" style={{ padding: 0, justifyContent: "center" }} onClick={() => setSettingsOpen(true)} data-testid="brief-settings-m">{Ico.gear}설정</button>
        </div>}
      </div>
    </div>
  );

  // ── 핵심 지표 ──
  const { cur, p1, p7, month } = report;
  const sp = report.spark;
  const workNow = workOn(lastBiz);
  const tiles = basis.multi ? [
    { k: `${basis.days.length}일 합산 매출`, v: fmt(man(cur.sale)), u: "만원", l1: "지난주 같은 기간", d1: pctChange(cur.sale, p7.sale), sp: sp.sale, hero: true },
    { k: `${basis.days.length}일 수익`, v: fmt(man(cur.profit)), u: "만원", l1: "지난주 같은 기간", d1: pctChange(cur.profit, p7.profit), sp: sp.profit, note: `수익률 ${marginOf(cur).toFixed(1)}%` },
    { k: `${basis.days.length}일 오더`, v: fmt(cur.all), u: "건", l1: "지난주 같은 기간", d1: pctChange(cur.all, p7.all), sp: sp.orders, note: `배차완료 ${cur.all ? ((cur.done / cur.all) * 100).toFixed(1) : "0.0"}%` },
  ] : [
    { k: "전일 매출", v: fmt(man(cur.sale)), u: "만원", d1: pctChange(cur.sale, p1.sale), d2: pctChange(cur.sale, p7.sale), sp: sp.sale, hero: true },
    { k: "수익", v: fmt(man(cur.profit)), u: "만원", d1: pctChange(cur.profit, p1.profit), d2: pctChange(cur.profit, p7.profit), sp: sp.profit },
    { k: "수익률", v: marginOf(cur).toFixed(1), u: "%", d1: marginOf(cur) - marginOf(p1), d2: marginOf(cur) - marginOf(p7), unit: "%p", sp: sp.margin },
    { k: "오더", v: fmt(cur.all), u: "건", d1: pctChange(cur.all, p1.all), d2: pctChange(cur.all, p7.all), sp: sp.orders, note: `배차완료 ${cur.all ? ((cur.done / cur.all) * 100).toFixed(1) : "0.0"}%` },
  ];
  if (!basis.multi && (hasAtt || demo)) tiles.push({ k: "근무자", v: fmt(workNow), u: "명", l1: "전 영업일", d1: workNow - workOn(bizSpan[bizSpan.length - 2] || lastBiz), d2: workNow - workOn(addDay(lastBiz, -7)), unit: "명", dp: 0, sp: bizSpan.map(workOn), note: `출근 기록 ${md(lastBiz)}` });
  else if (!basis.multi) tiles.push({ k: "미배차 · 취소", v: `${unassigned.filter((r) => dateOf(r) <= today).length} · ${cur.cancel}`, u: "건", d1: cur.cancel - p1.cancel, d2: cur.cancel - p7.cancel, unit: "건", dp: 0, sp: report.spanDays.map((d) => report.byDay[d]?.cancel || 0), note: "취소 14일 추이" });
  const numFs = compact ? 32 : xl ? 48 : 42;
  const tile = (t) => {
    const dark = !!t.hero;
    const lc = dark ? "#B9C6E0" : C.t2;
    return (
      <div key={t.k} className="ebx-card" style={{ padding: compact ? "18px 16px 14px" : "24px 24px 18px", minWidth: 0, ...(dark ? { background: `linear-gradient(150deg,${C.n1},${C.n2})`, border: "1px solid #24365A", color: "#fff" } : null) }}>
        <div style={{ fontSize: compact ? 15 : 17, color: lc, fontWeight: 700 }}>{t.k}</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}><span className="ebx-num" style={{ fontSize: numFs, fontWeight: 800, lineHeight: 1.1, color: dark ? "#fff" : C.t1 }}>{t.v}</span><span style={{ fontSize: compact ? 15 : 18, color: lc, fontWeight: 600 }}>{t.u}</span></div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 15, color: lc, alignItems: "baseline" }}>
          <span>{compact && t.l1 === "지난주 같은 기간" ? "지난주" : t.l1 || prevLbl}</span><span style={{ textAlign: "right" }}><Delta v={t.d1} unit={t.unit} dp={t.dp} size={compact ? 16 : 17} light={dark} /></span>
          {t.d2 !== undefined && <><span>{wkLbl}</span><span style={{ textAlign: "right" }}><Delta v={t.d2} unit={t.unit} dp={t.dp} size={compact ? 16 : 17} light={dark} /></span></>}
        </div>
        <Measure style={{ marginTop: 14 }}>{(w) => <Svg html={spark(t.sp, w, compact ? 34 : 42, dark ? { color: C.sky } : undefined)} />}</Measure>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: dark ? "#9FB0CF" : C.t3, marginTop: 4, gap: 6 }}><span>{t.note || "14일 추이"}</span>{!compact && <span>{md(report.spanDays[0])}~{md(report.spanDays[13])}</span>}</div>
      </div>
    );
  };
  const goalPct = month.target ? (month.mtd / month.target) * 100 : null;
  const mtdTile = (
    <div key="mtd" className="ebx-card" style={{ padding: compact ? "18px 16px 16px" : "24px 24px 20px", background: "linear-gradient(180deg,#F5F8FE,#fff)", minWidth: 0 }}>
      <div style={{ fontSize: compact ? 15 : 17, color: C.t2, fontWeight: 700 }}>이번 달 누계</div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}><span className="ebx-num" style={{ fontSize: numFs, fontWeight: 800, lineHeight: 1.1 }}>{fmt(man(month.mtd))}</span><span style={{ fontSize: compact ? 15 : 18, color: C.t2, fontWeight: 600 }}>만원</span></div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 15, color: C.t2, alignItems: "baseline" }}>
        <span>전월 동기</span><span style={{ textAlign: "right" }}><Delta v={month.d} size={compact ? 16 : 17} /></span>
        <span>목표 달성</span><span className="ebx-num" style={{ textAlign: "right", fontSize: compact ? 16 : 17, color: C.t1 }}>{goalPct != null ? `${goalPct.toFixed(1)}%` : "미설정"}</span>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 99, background: "#E3E9F3", marginTop: 16 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, goalPct || 0)}%`, borderRadius: 99, background: C.s1 }} />
        <div style={{ position: "absolute", left: `${month.totalBiz ? (month.elapsed / month.totalBiz) * 100 : 0}%`, top: -5, width: 3, height: 22, borderRadius: 2, background: C.t1 }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 14, color: C.t3 }}>세로선 = 지난 영업일 {month.elapsed}/{month.totalBiz}</div>
    </div>
  );
  const kpiCols = basis.multi ? (compact ? 2 : W < 1100 ? 2 : 4) : (compact ? 2 : W < 1100 ? 3 : 6);
  const kpis = sec.kpi !== false && <section style={{ display: "grid", gridTemplateColumns: `repeat(${kpiCols},minmax(0,1fr))`, gap: compact ? 10 : 16 }}>{[...tiles.map(tile), mtdTile]}</section>;

  // ── 지난주 주간 요약(월요일) ──
  const weeklyBlock = weekly && (
    <Card compact={compact} title="지난주 주간 요약" sub={`요일별 매출 · 지난주 vs 전주 · 단위 만원`} right={<Legend items={[[C.s1, `${md(weekly.range[0])}~${md(weekly.range[1])}`], ["#C3CAD6", `${md(weekly.prevRange[0])}~${md(weekly.prevRange[1])}`]]} />}>
      <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1.6fr) minmax(0,1fr)" : "1fr", gap: 32, marginTop: 18, alignItems: "start" }}>
        <Measure>{(w) => <Svg html={weekBars(w, compact ? 240 : 290, weekly.days, weekly.days.map((d, i) => (basis.days.includes(d.d) ? i : -1)).filter((i) => i >= 0), { compact })} />}</Measure>
        <div>
          {[["주간 매출", `${fmt(man(weekly.cur.sale))}만`, `${fmt(man(weekly.prev.sale))}만`, pctChange(weekly.cur.sale, weekly.prev.sale)], ["주간 수익", `${fmt(man(weekly.cur.profit))}만`, `${fmt(man(weekly.prev.profit))}만`, pctChange(weekly.cur.profit, weekly.prev.profit)], ["평균 수익률", `${marginOf(weekly.cur).toFixed(1)}%`, `${marginOf(weekly.prev).toFixed(1)}%`, marginOf(weekly.cur) - marginOf(weekly.prev), "%p"], ["오더", `${fmt(weekly.cur.all)}건`, `${fmt(weekly.prev.all)}건`, pctChange(weekly.cur.all, weekly.prev.all)], ["신규 거래처", `${weekly.fresh}곳`, "", null]].map((r, i) => (
            <div key={r[0]} className={i ? "ebx-row" : ""} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "baseline", padding: "13px 0" }}>
              <span className="ebx-lbl">{r[0]}</span>
              <span><b className="ebx-num" style={{ fontSize: 20 }}>{r[1]}</b>{r[2] && <span className="ebx-num" style={{ fontSize: 15, color: C.t3, fontWeight: 400, marginLeft: 8 }}>전주 {r[2]}</span>}</span>
              <span style={{ minWidth: 76, textAlign: "right" }}>{r[3] == null ? <span className="ebx-num" style={{ color: weekly.fresh ? C.up : C.flat, fontSize: 17, fontWeight: 800 }}>{weekly.fresh ? `+${weekly.fresh}` : "–"}</span> : <Delta v={r[3]} unit={r[4] || "%"} size={17} />}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );

  // ── 30일 매출 · 수익률 ──
  const d30Sum = report.d30.reduce((a, x) => { const v = report.byDay[x.d]; return v ? { sale: a.sale + v.sale, profit: a.profit + v.profit } : a; }, { sale: 0, profit: 0 });
  const d30Best = report.d30.reduce((b, x) => (!b || x.sale > b.sale ? x : b), null);
  const chart30 = sec.chart30 !== false && (
    <Card compact={compact} title="최근 30일 매출 · 수익률" sub={`${md(report.d30[0].d)} ~ ${md(basis.end)} · 매출 단위 만원`} right={<Legend items={[["#B8C8E6", "평일"], ["#DCE3EF", "주말·휴일"], [C.n3, "보고 기준"]]} />}>
      <Measure style={{ marginTop: 18 }}>{(w) => <Svg html={revMargin(w, report.d30, report.weekdayAvg, compact ? { barH: 170, lineH: 70, labelEvery: 7, compact: true } : { barH: xl ? 300 : 270, lineH: 96, labelEvery: Math.max(2, Math.ceil((30 * 92) / Math.max(200, w - 150))) })} />}</Measure>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: compact ? 10 : 14, marginTop: 18 }}>
        {[["30일 매출", `${fmt(man(d30Sum.sale))}만`, `수익 ${fmt(man(d30Sum.profit))}만`], ["30일 수익률", `${marginOf(d30Sum).toFixed(1)}%`, `보고 기준 ${marginOf(cur).toFixed(1)}%`], ["평일 평균", `${fmt(man(report.weekdayAvg))}만`, "주말·휴일 제외"], ["최고 매출일", d30Best ? `${fmt(man(d30Best.sale))}만` : "–", d30Best ? mdDow(d30Best.d) : ""]].map(([l, v, n]) => <div key={l} className="ebx-stat" style={{ padding: "14px 16px" }}><div className="ebx-lbl">{l}</div><b className="ebx-num" style={{ fontSize: compact ? 20 : 23, display: "block", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</b><div style={{ fontSize: 14, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</div></div>)}
      </div>
    </Card>
  );

  // ── 월 목표 진척 · 누계 vs 전월 ──
  const remainBiz = Math.max(0, month.totalBiz - month.elapsed);
  const needDaily = month.target && remainBiz ? Math.max(0, month.target - month.mtd) / remainBiz : 0;
  const curDaily = month.elapsed ? month.mtd / month.elapsed : 0;
  const fpct = month.target ? (month.forecast / month.target) * 100 : null;
  const mtdCard = sec.mtd !== false && (
    <Card compact={compact} title="월 목표 진척" sub={`${Number(month.ym.slice(5))}월 · 영업일 기준 · 주말 매출은 다음 영업일에 합산`}>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "auto minmax(0,1fr)", gap: compact ? 16 : 26, alignItems: "center", marginTop: 18 }}>
        <Svg style={{ justifySelf: compact ? "center" : "start" }} html={donut(compact ? 150 : 168, [{ v: Math.min(month.mtd, month.target || month.mtd), c: C.s1 }, { v: Math.max(0, (month.target || 0) - month.mtd), c: "#E3E9F3" }], { thick: 18, center: `<text x="${(compact ? 150 : 168) / 2}" y="${(compact ? 150 : 168) / 2 + 4}" text-anchor="middle" font-size="${compact ? 30 : 34}" font-weight="800" fill="${C.t1}">${goalPct != null ? `${goalPct.toFixed(0)}%` : "–"}</text><text x="${(compact ? 150 : 168) / 2}" y="${(compact ? 150 : 168) / 2 + 28}" text-anchor="middle" font-size="15" fill="${C.t2}">${goalPct != null ? "목표 달성" : "목표 미설정"}</text>` })} />
        <div style={{ display: "grid", gap: 0, minWidth: 0 }}>
          {[
            ["누계", `${fmt(man(month.mtd))}만`, <Delta key="d" v={month.d} size={15} />, "전월 동기 대비"],
            ["월 목표", month.target ? `${fmt(man(month.target))}만` : "미설정", null, month.target ? `남은 금액 ${fmt(man(Math.max(0, month.target - month.mtd)))}만` : "회사 설정에서 입력"],
            ["월말 예상", eok(month.forecast), null, fpct != null ? `목표의 ${fpct.toFixed(0)}%` : `전월 ${eok(month.cumPrev[month.cumPrev.length - 1] || 0)}`],
            ["하루 평균", `${fmt(man(curDaily))}만`, null, month.target && remainBiz ? (curDaily >= needDaily ? `필요 ${fmt(man(needDaily))}만 · 지금 속도로 달성` : `필요 ${fmt(man(needDaily))}만 · 하루 ${fmt(man(needDaily - curDaily))}만 더`) : `남은 영업일 ${remainBiz}일`],
          ].map(([l, v, d, n]) => (
            <div key={l} className={l === "누계" ? "" : "ebx-row"} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "0 14px", alignItems: "baseline", padding: "10px 0" }}>
              <span className="ebx-lbl">{l}</span>
              <span style={{ textAlign: "right" }}><b className="ebx-num" style={{ fontSize: compact ? 21 : 23 }}>{v}</b>{d && <span style={{ marginLeft: 8 }}>{d}</span>}</span>
              <span />
              <span style={{ fontSize: 14, color: C.t2, textAlign: "right", wordBreak: "keep-all" }}>{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}><span className="ebx-h3">누계 vs 전월 동기</span><Legend items={[[C.s1, `${Number(month.ym.slice(5))}월`], [C.s1, "예상", true], [C.base, `${Number(month.pym.slice(5))}월`]]} /></div>
      <Measure style={{ marginTop: 8 }}>{(w) => <Svg html={cumChart(w, compact ? 230 : 260, { cur: month.cumCur.map(man), prev: month.cumPrev.map(man), target: man(month.target), forecast: man(month.forecast), total: month.totalBiz, curLabel: `${fmt(man(month.mtd))}만`, prevLabel: `${Number(month.pym.slice(5))}월` }, { compact })} />}</Measure>
    </Card>
  );

  // ── 담당자별 매출 ──
  const sr = staffMode === "month" ? staffRank.month : staffRank.basis;
  const srCmp = staffMode === "month" ? "전월 같은 기간" : basis.multi ? "지난주 같은 기간" : "전 영업일";
  const srLabel = staffMode === "month" ? `${md(mSpan.cur[0])}~${md(basis.end)}` : basis.multi ? basis.label : mdDow(basis.start);
  const srTop = sr.list.slice(0, 10);
  const srMax = srTop[0]?.sale || 1;
  const staffCard = sec.staff !== false && (
    <Card compact={compact} title="담당자별 매출" sub={`${srLabel} · 증감은 ${srCmp} 대비 · 단위 만원`} right={<Seg value={staffMode} onChange={setStaffMode} items={[["basis", basis.multi ? `${basis.days.length}일 합산` : "전일"], ["month", "이번 달"]]} />}>
      <div style={{ marginTop: 16 }}>
        {!srTop.length && <div style={{ padding: "28px 0", textAlign: "center", fontSize: 16, color: C.t2 }}>이 기간에 담당자별 매출이 없습니다.</div>}
        {!compact && srTop.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "30px minmax(70px,1fr) 128px 80px 76px 56px 92px", gap: 14, padding: "0 0 10px", fontSize: 14, fontWeight: 700, color: C.t3 }}><span>순위</span><span>담당자</span><span style={{ textAlign: "right" }}>매출</span><span style={{ textAlign: "right" }}>수익</span><span style={{ textAlign: "right" }}>수익률</span><span style={{ textAlign: "right" }}>건수</span><span style={{ textAlign: "right" }}>증감</span></div>}
        {srTop.map((s, i) => compact ? (
          <div key={s.n} className="ebx-row" style={{ padding: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}><span className="ebx-num" style={{ fontSize: 16, color: i < 3 ? C.n3 : C.t3, width: 18 }}>{i + 1}</span><b style={{ fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.n}</b></span>
              <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}><b className="ebx-num" style={{ fontSize: 18 }}>{fmt(man(s.sale))}<span style={{ fontSize: 15, fontWeight: 500, color: C.t2 }}>만</span></b><Chg v={s.d} size={15} /></span>
            </div>
            <div style={{ margin: "8px 0 0 28px", height: 10, width: `calc(${((s.sale / srMax) * 100).toFixed(1)}% - 28px)`, minWidth: 4, borderRadius: "0 5px 5px 0", background: i < 3 ? C.n3 : "#9DB2D8" }} />
            <div style={{ margin: "8px 0 0 28px", fontSize: 15, color: C.t2 }}>수익 <b className="ebx-num" style={{ color: C.t1 }}>{fmt(man(s.profit))}만</b> · 수익률 <b className="ebx-num" style={{ color: C.t1 }}>{s.margin.toFixed(1)}%</b> · <b className="ebx-num" style={{ color: C.t1 }}>{fmt(s.cnt)}</b>건</div>
          </div>
        ) : (
          <div key={s.n} className="ebx-row" style={{ padding: "12px 0 10px" }}>
           <div style={{ display: "grid", gridTemplateColumns: "30px minmax(70px,1fr) 128px 80px 76px 56px 92px", gap: 14, alignItems: "baseline" }}>
            <span className="ebx-num" style={{ fontSize: 17, color: i < 3 ? C.n3 : C.t3, fontWeight: 800 }}>{i + 1}</span>
            <b style={{ fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.n}>{s.n}</b>
            <span className="ebx-num" style={{ fontSize: 18, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(man(s.sale))}<span style={{ fontSize: 15, fontWeight: 500, color: C.t2 }}>만 · {pctStr(s.sale, sr.total, 0)}</span></span>
            <span className="ebx-num" style={{ fontSize: 17, textAlign: "right" }}>{fmt(man(s.profit))}</span>
            <span className="ebx-num" style={{ fontSize: 17, textAlign: "right", color: s.margin < 8 ? C.t2 : C.t1 }}>{s.margin.toFixed(1)}%</span>
            <span className="ebx-num" style={{ fontSize: 17, textAlign: "right" }}>{fmt(s.cnt)}</span>
            <span style={{ textAlign: "right" }}><Chg v={s.d} size={16} /></span>
           </div>
           <div style={{ margin: "8px 0 0 44px", height: 10, width: `calc(${((s.sale / srMax) * 100).toFixed(1)}% - 44px)`, minWidth: 4, borderRadius: "0 5px 5px 0", background: i < 3 ? C.n3 : "#9DB2D8" }} />
          </div>
        ))}
      </div>
      {srTop.length > 0 && <div className="ebx-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 14, marginTop: 2, fontSize: 15, color: C.t2 }}>
        <span>합계 <b className="ebx-num" style={{ color: C.t1, fontSize: 17 }}>{fmt(man(sr.total))}만</b> <Delta v={pctChange(sr.total, sr.prevTotal)} size={15} /> · 담당자 {sr.list.length}명{sr.list.length > srTop.length ? ` (상위 ${srTop.length}명 표시)` : ""}</span>
        {onGo && canGo("매출관리") && <button type="button" className="ebx-link ebx-noprint" onClick={() => onGo("매출관리")}>매출관리에서 보기</button>}
      </div>}
    </Card>
  );

  // ── 거래처 TOP 8 · 증감 ──
  const cl = report.clients;
  const maxC = cl.top[0]?.sale || 1;
  const moveList = (list, up) => (
    <div style={{ minWidth: 0 }}>
      <div className="ebx-lbl" style={{ display: "flex", alignItems: "center", gap: 8, color: up ? C.up : C.down }}>{up ? "▲ 늘어난 곳" : "▼ 줄어든 곳"}</div>
      {!list.length && <div style={{ fontSize: 15, color: C.t3, marginTop: 8 }}>없음</div>}
      {list.map((c) => <div key={c.n} className="ebx-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "10px 0", marginTop: 4 }}><span style={{ fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.n}</span><span style={{ display: "flex", gap: 8, alignItems: "baseline" }}><ManDiff won={c.diff} size={16} />{!compact && <span className="ebx-num" style={{ fontSize: 14, color: C.t3, fontWeight: 500 }}>{c.d == null ? "신규" : `${Math.abs(c.d).toFixed(0)}%`}</span>}</span></div>)}
    </div>
  );
  const clientsCard = sec.clients !== false && (
    <Card compact={compact} title={`거래처 TOP ${Math.min(8, cl.top.length) || 8}`} sub={`${md(basis.end)}${basis.multi ? ` 외 ${basis.days.length - 1}일` : ""} · 단위 만원 · 증감은 최근 4주 같은 요일 평균 대비`}>
      <div style={{ marginTop: 14 }}>
        {!cl.top.length && <div style={{ padding: "28px 0", textAlign: "center", fontSize: 16, color: C.t2 }}>보고 기준 기간에 매출이 없습니다.</div>}
        {cl.top.map((c, i) => {
          const low = c.margin < 8;
          return (
            <div key={c.n} className={i ? "ebx-row" : ""} style={{ padding: "11px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}><span className="ebx-num" style={{ fontSize: 16, color: C.t3, width: 16 }}>{i + 1}</span><span style={{ fontSize: 17, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.n}</span>{low && <span className="ebx-tag">저마진</span>}</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 12, whiteSpace: "nowrap" }}><b className="ebx-num" style={{ fontSize: 18 }}>{fmt(man(c.sale))}<span style={{ fontWeight: 500, color: C.t2, fontSize: 15 }}>만</span></b>{!compact && <span className="ebx-num" style={{ fontSize: 15, color: low ? C.t1 : C.t2, fontWeight: low ? 800 : 500, minWidth: 92, textAlign: "right" }}>수익률 {c.margin.toFixed(1)}%</span>}<span style={{ minWidth: 72, textAlign: "right" }}><Chg v={c.d} size={16} /></span></span>
              </div>
              <div style={{ margin: "7px 0 0 26px", height: 10, width: `calc(${((c.sale / maxC) * 100).toFixed(1)}% - 26px)`, minWidth: 4, borderRadius: "0 5px 5px 0", background: low ? "#9DB2D8" : C.n3 }} />
            </div>
          );
        })}
      </div>
      {cl.top.length > 0 && <div className="ebx-row" style={{ paddingTop: 12, fontSize: 15, color: C.t2 }}>TOP {cl.top.length} 합계 <b className="ebx-num" style={{ color: C.t1 }}>{fmt(man(cl.topSum))}만</b> ({cl.total ? ((cl.topSum / cl.total) * 100).toFixed(1) : 0}%){cl.others ? ` · 기타 ${cl.others}곳 ${fmt(man(cl.total - cl.topSum))}만` : ""} · 저마진 = 수익률 8% 미만</div>}
    </Card>
  );
  const movesCard = sec.clients !== false && (moves.up.length > 0 || moves.down.length > 0) && (
    <Card compact={compact} title="거래처 증감" sub={`이번 달 ${md(mSpan.cur[0])}~${md(basis.end)} vs 전월 같은 기간 · 금액 차이 순`}>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: compact ? 16 : 24, marginTop: 16 }}>{moveList(moves.up, true)}{moveList(moves.down, false)}</div>
    </Card>
  );

  // ── 운영 현황 ──
  const parts = [["지입", C.s1], ["직영", C.s2], ["임대", C.s3]].map(([n, c]) => ({ n, c, v: fleet.filter((d) => d.등급 === n).length, run: fleet.filter((d) => d.등급 === n && report.plates.has(normPlate(d.차량번호))).length }));
  const fleetN = fleet.length; const runN = parts.reduce((s, p) => s + p.run, 0);
  const extRun = [...report.plates].filter((p) => !fleetPlates.has(p)).length;
  const maxR = report.routes[0]?.[1] || 1;
  const opsCard = sec.ops !== false && (fleetN > 0 || report.routes.length > 0) && (
    <Card compact={compact} title="운영 현황" sub={`${md(basis.end)}${basis.multi ? ` 외 ${basis.days.length - 1}일` : ""} 기준 · 운행 = 그날 오더에 배정된 소속 차량`}>
      {fleetN > 0 && <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "auto minmax(0,1fr)", gap: compact ? 18 : 32, marginTop: 18, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <Svg html={donut(140, parts, { thick: 18, center: `<text x="70" y="70" text-anchor="middle" font-size="30" font-weight="800" fill="${C.t1}">${fleetN}</text><text x="70" y="92" text-anchor="middle" font-size="15" fill="${C.t2}">전체 차량</text>` })} style={{ flex: "none" }} />
          <div style={{ display: "grid", gap: 10 }}>{parts.map((p) => <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}><Dot c={p.c} /><span style={{ width: 38 }}>{p.n}</span><b className="ebx-num" style={{ fontSize: 18 }}>{p.v}대</b><span className="ebx-num" style={{ color: C.t2, fontWeight: 500, fontSize: 15 }}>{fleetN ? ((p.v / fleetN) * 100).toFixed(0) : 0}%</span></div>)}</div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}><span className="ebx-lbl">가동률 (운행/전체)</span><span><b className="ebx-num" style={{ fontSize: 30 }}>{fleetN ? ((runN / fleetN) * 100).toFixed(1) : "0.0"}%</b> <span className="ebx-num" style={{ fontSize: 15, color: C.t2, fontWeight: 500 }}>{runN}/{fleetN}대</span></span></div>
          {parts.filter((p) => p.v > 0).map((u) => <div key={u.n} style={{ display: "grid", gridTemplateColumns: "40px 1fr 56px", gap: 10, alignItems: "center", marginTop: 10, fontSize: 16 }}><span style={{ color: C.t2 }}>{u.n}</span><div style={{ height: 12, background: "#E6EBF4", borderRadius: 99 }}><div style={{ height: 12, width: `${(u.run / u.v) * 100}%`, background: C.n3, borderRadius: 99 }} /></div><span className="ebx-num" style={{ textAlign: "right" }}>{u.run}/{u.v}</span></div>)}
          <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 15, flexWrap: "wrap", color: C.t2 }}>{[["운행", runN, C.n3], ["미운행", fleetN - runN, "#B8C8E6"], ["용차", extRun, C.amber]].map((a) => <span key={a[0]} style={{ display: "flex", alignItems: "center", gap: 7 }}><Dot c={a[2]} />{a[0]} <b className="ebx-num" style={{ color: C.t1, fontSize: 17 }}>{`${a[1]}대`}</b></span>)}</div>
        </div>
      </div>}
      {utilTrend.length > 1 && <div style={{ marginTop: 22, paddingTop: 20, borderTop: `1px solid ${C.grid}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}><span className="ebx-h3">차량 가동률 추이</span><span className="ebx-sub">최근 {utilTrend.length}영업일 · 소속 {fleetPlates.size}대</span></div>
        <Measure style={{ marginTop: 8 }}>{(w) => <Svg html={trendLine(w, compact ? 190 : 210, utilTrend, { compact, labelEvery: compact ? 4 : w < 700 ? 3 : 2, color: C.n3 })} />}</Measure>
      </div>}
      <div style={{ marginTop: 22, paddingTop: 20, borderTop: `1px solid ${C.grid}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}><span className="ebx-h3">노선 TOP 5</span><span className="ebx-sub">상차 → 하차</span></div>
        {!report.routes.length && <div style={{ fontSize: 16, color: C.t2, marginTop: 10 }}>오더가 없습니다.</div>}
        {report.routes.map(([k, n], i) => { const [a, b] = k.split("→"); return <div key={k} style={{ display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr) 70px 50px" : "minmax(0,1fr) 160px 56px", gap: 12, alignItems: "center", marginTop: i ? 8 : 12, fontSize: 16 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a} <span style={{ color: C.t3 }}>→</span> {b}</span><div style={{ height: 10, background: "#E6EBF4", borderRadius: 99 }}><div style={{ height: 10, width: `${(n / maxR) * 100}%`, background: C.sky, borderRadius: 99 }} /></div><b className="ebx-num" style={{ textAlign: "right" }}>{n}건</b></div>; })}
      </div>
    </Card>
  );

  // ── 인력 현황(오늘) ──
  const hrDay = isBizDay(today) ? today : lastBiz; // 휴일에 열면 마지막 영업일 기준
  const todayRecs = attByDate[hrDay] || [];
  const hr = React.useMemo(() => {
    const recOf = (u) => todayRecs.find((a) => a.uid === u.uid);
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
  }, [staff, people, todayRecs, leaveAprs, today, hrDay]);
  const hrCard = sec.hr !== false && staff.length > 0 && (
    <Card compact={compact} title="인력 현황" sub={hrDay === today ? `사무직 · 오늘 ${kstHm()} 기준` : `사무직 · ${mdDow(hrDay)} 기준`}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 16 }}><span className="ebx-num" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>{hr.present}</span><span style={{ fontSize: 17, color: C.t2 }}>명 근무 중 <span style={{ color: C.t3 }}>/ {staff.length}명</span></span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 16 }}>{[["출근", hr.present - hr.outside, C.n3], ["지각", hr.late, C.amber], ["휴가", hr.leave, "#B8C8E6"], ["외근", hr.outside, C.sky]].map((s) => <div key={s[0]} className="ebx-stat" style={{ padding: "12px 12px 10px" }}><div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: C.t2 }}><Dot c={s[2]} r={3} />{s[0]}</div><div className="ebx-num" style={{ fontSize: 26, marginTop: 2 }}>{s[1]}</div></div>)}</div>
      <div style={{ marginTop: 18, display: "grid", gap: 0, fontSize: 16 }}>
        {[
          ["신규 입사 (최근 7일)", <><b className="ebx-num">{hr.hires.length}</b>명{hr.hires.length ? ` · ${hr.hires.slice(0, 2).map((u) => `${u.name || ""}${u.team ? ` (${u.team})` : ""}`).join(", ")}` : ""}</>],
          ["퇴사 (최근 7일)", <><b className="ebx-num">{hr.quits.length}</b>명</>],
          ["지각", hr.lateList.length ? hr.lateList.slice(0, 2).join(", ") + (hr.lateList.length > 2 ? ` 외 ${hr.lateList.length - 2}명` : "") : "없음"],
          ["미출근 기록", <><b className="ebx-num">{Math.max(0, staff.length - hr.present - hr.leave)}</b>명{hrDay === today ? " (출근 체크 전 포함)" : ""}</>],
        ].map(([l, v], i) => <div key={l} className={i ? "ebx-row" : ""} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 0" }}><span style={{ color: C.t2, flex: "none" }}>{l}</span><span style={{ textAlign: "right", wordBreak: "keep-all" }}>{v}</span></div>)}
      </div>
    </Card>
  );

  // ── 자금 현황 ──
  const flow = (days) => { const set = new Set(days); return ledger.reduce((a, r) => { if (!set.has(String(r.date || ""))) return a; const v = toInt(r.amount); if (r.type === "수입") a.in += v; else a.out += v; return a; }, { in: 0, out: 0 }); };
  const fl = flow(basis.days);
  const hasLedger = ledger.length > 0;
  // 순현금흐름 — 최근 10주(월~일) 주간 합계(급여·운송료 지급일이 하루에 몰려도 흐름이 보이게)
  const netWeeks = React.useMemo(() => { const mon = addDay(basis.end, -((dowOf(basis.end) + 6) % 7)); return Array.from({ length: 10 }, (_, i) => rangeDays(addDay(mon, -7 * (9 - i)), addDay(mon, -7 * (9 - i) + 6))); }, [basis.end]);
  const netData = netWeeks.map((w) => { const f = flow(w); return [md(w[0]), man(f.in - f.out)]; });
  const months3 = [2, 1, 0].map((n) => { const dt = new Date(`${ym}-01T00:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() - n); return dt.toISOString().slice(0, 7); });
  const monthFlow = months3.map((m) => ({ m, ...ledger.reduce((a, r) => { if (!String(r.date || "").startsWith(m)) return a; const v = toInt(r.amount); if (r.type === "수입") a.in += v; else a.out += v; return a; }, { in: 0, out: 0 }) }));
  const byAcc = (type) => { const m = {}; ledger.forEach((r) => { if (!String(r.date || "").startsWith(ym) || (type === "수입" ? r.type !== "수입" : r.type === "수입")) return; const k = String(r.account || "기타").trim() || "기타"; m[k] = (m[k] || 0) + toInt(r.amount); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const accIn = byAcc("수입"); const accOut = byAcc("지출");
  const arTotal = ar.reduce((s, a) => s + a.outstanding, 0);
  const aging = ar.reduce((a, x) => ({ b30: a.b30 + x.aging.b30, b60: a.b60 + x.aging.b60, b90: a.b90 + x.aging.b90, over: a.over + x.aging.over }), { b30: 0, b60: 0, b90: 0, over: 0 });
  const ar30 = aging.b60 + aging.b90 + aging.over;
  const monthEnd = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const week = rangeDays(today, addDay(today, 6));
  const dues = []; const duesMonth = [];
  (recurring || []).filter((r) => r.active !== false && (r.type || "지출") === "지출").forEach((r) => {
    const dd = Math.min(28, Math.max(1, Number(r.day) || 1)); const item = { name: r.name || r.account || "고정비", amt: toInt(r.amount) };
    const hit = week.find((d) => Number(d.slice(8, 10)) === dd); if (hit) dues.push({ d: hit, ...item });
    const inM = `${ym}-${String(dd).padStart(2, "0")}`; if (inM > week[6] && inM <= monthEnd) duesMonth.push({ d: inM, ...item }); // 이번 주 다음 날 ~ 월말
  });
  dues.sort((a, b) => a.d.localeCompare(b.d)); duesMonth.sort((a, b) => a.d.localeCompare(b.d));
  const fundsList = F ? F.list : [];
  const showCash = sec.cash !== false && (hasLedger || arTotal > 0 || dues.length > 0 || duesMonth.length > 0 || fundsList.length > 0);
  const statBox = (l, v, sub, color) => (
    <div className="ebx-stat" style={{ padding: compact ? "14px 14px" : "18px 20px" }}>
      <div className="ebx-lbl">{l}</div>
      <div className="ebx-num" style={{ fontSize: compact ? 24 : xl ? 34 : 30, fontWeight: 800, marginTop: 4, color: color || C.t1, lineHeight: 1.15 }}>{v}</div>
      {sub && <div style={{ fontSize: 14, color: C.t2, marginTop: 4 }}>{sub}</div>}
    </div>
  );
  const net = fl.in - fl.out;
  const listRow = (k, left, right, sub) => <div key={k} className="ebx-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "11px 0" }}><span style={{ minWidth: 0 }}><span style={{ fontSize: 16, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{left}</span>{sub && <span style={{ fontSize: 14, color: C.t2, display: "block" }}>{sub}</span>}</span><span style={{ whiteSpace: "nowrap" }}>{right}</span></div>;
  const accBars = (list, col, total) => list.slice(0, 5).map(([k, v]) => (
    <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(70px,110px) minmax(0,1fr) auto", gap: 10, alignItems: "center", marginTop: 9, fontSize: 16 }}>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: C.t2 }}>{k}</span>
      <div style={{ height: 10, background: "#EEF1F6", borderRadius: 99 }}><div style={{ height: 10, width: `${total ? (v / total) * 100 : 0}%`, background: col, borderRadius: 99 }} /></div>
      <b className="ebx-num" style={{ textAlign: "right" }}>{fmt(man(v))}</b>
    </div>
  ));
  const cashCols = compact ? "1fr" : wide ? "minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr)" : "1fr 1fr";
  const cashCard = showCash && (
    <Card compact={compact} id="ebx-cash" title="자금 현황" sub={`단위 만원 · 수입·지출 장부 · 자금 관리 · 미수금 현황 기준`}>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : `repeat(${F ? 5 : 4},minmax(0,1fr))`, gap: compact ? 10 : 14, marginTop: 18 }}>
        {F && statBox("보유 자금", fmt(man(F.cash)), F.runway != null ? `월평균 지출 기준 ${F.runway.toFixed(1)}개월` : "통장·현금 합계")}
        {statBox(`${basis.multi ? "기간" : "전일"} 입금`, fmt(man(fl.in)), basis.multi ? (compact ? `${basis.days.length}일 합산` : basis.label) : mdDow(basis.start))}
        {statBox(`${basis.multi ? "기간" : "전일"} 출금`, fmt(man(fl.out)), basis.multi ? (compact ? `${basis.days.length}일 합산` : basis.label) : mdDow(basis.start))}
        {statBox("순유입", `${net > 0 ? "+" : net < 0 ? "−" : ""}${fmt(Math.abs(man(net)))}`, "입금 − 출금", net > 0 ? C.up : net < 0 ? C.down : C.t1)}
        {statBox("미수금", fmt(man(arTotal)), ar30 > 0 ? `30일 넘은 미수 ${fmt(man(ar30))}만` : "올해 청구 기준")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: cashCols, gap: compact ? 26 : 32, marginTop: 26, alignItems: "start" }}>
        {/* 1) 계좌별 잔액 · 월별 입출금 */}
        <div style={{ minWidth: 0 }}>
          <div className="ebx-h3">통장·계좌별 잔액</div>
          {!fundsList.length && <div style={{ fontSize: 15, color: C.t2, marginTop: 10, lineHeight: 1.6 }}>등록된 계좌가 없습니다. 자금 관리에서 통장을 등록하면 잔액이 보입니다.</div>}
          {fundsList.map((f) => listRow(f.id, f.name || f.bank || f.kind, <b className="ebx-num" style={{ fontSize: 18, color: f.kind === "대출" ? C.t2 : C.t1 }}>{f.kind === "대출" ? "−" : ""}{fmt(man(f.balance))}</b>, [f.bank, last4(f), isCredit(f) ? "남은 한도" : f.kind === "대출" ? "대출 잔액" : isCard(f) ? "체크카드" : f.kind].filter(Boolean).join(" · ")))}
          {F && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <div className="ebx-stat" style={{ padding: "12px 14px" }}><div className="ebx-lbl">대출 잔액</div><b className="ebx-num" style={{ fontSize: 20 }}>{fmt(man(F.loan))}</b></div>
            <div className="ebx-stat" style={{ padding: "12px 14px" }}><div className="ebx-lbl">카드 이번 달</div><b className="ebx-num" style={{ fontSize: 20 }}>{fmt(man(F.cardMonth))}</b></div>
          </div>}
          {hasLedger && <>
            <div className="ebx-h3" style={{ marginTop: 22 }}>월별 입출금</div>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr", gap: "0 10px", marginTop: 8, fontSize: 15 }}>
              {["", "입금", "출금", "순액"].map((h) => <span key={h || "m"} style={{ color: C.t3, fontWeight: 700, textAlign: h ? "right" : "left", padding: "4px 0" }}>{h}</span>)}
              {monthFlow.map((x) => [<span key={`${x.m}a`} className="ebx-row" style={{ padding: "9px 0", color: C.t2 }}>{Number(x.m.slice(5))}월</span>, <span key={`${x.m}b`} className="ebx-row ebx-num" style={{ padding: "9px 0", textAlign: "right", fontSize: 16 }}>{fmt(man(x.in))}</span>, <span key={`${x.m}c`} className="ebx-row ebx-num" style={{ padding: "9px 0", textAlign: "right", fontSize: 16 }}>{fmt(man(x.out))}</span>, <span key={`${x.m}d`} className="ebx-row ebx-num" style={{ padding: "9px 0", textAlign: "right", fontSize: 16, color: x.in - x.out > 0 ? C.up : x.in - x.out < 0 ? C.down : C.t1 }}>{x.in - x.out > 0 ? "+" : x.in - x.out < 0 ? "−" : ""}{fmt(Math.abs(man(x.in - x.out)))}</span>])}
            </div>
          </>}
        </div>
        {/* 2) 순현금흐름 추이 · 계정과목별 입출금 */}
        {hasLedger || arTotal > 0 ? <div style={{ minWidth: 0 }}>
          {hasLedger && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}><span className="ebx-h3">순현금흐름 추이</span><span className="ebx-sub">최근 {netData.length}주 · 주간 입금 − 출금 · 날짜는 주 시작일</span></div>
          <Measure style={{ marginTop: 8 }}>{(w) => <Svg html={netFlowBars(w, compact ? 200 : 230, netData, { compact, labelEvery: compact ? 3 : w < 520 ? 2 : 1 })} />}</Measure>
          <div className="ebx-h3" style={{ marginTop: 22 }}>이번 달 입출금 내역</div>
          <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: compact ? 14 : 22, marginTop: 4 }}>
            <div><div className="ebx-lbl" style={{ marginTop: 8 }}>입금 <b className="ebx-num" style={{ color: C.t1 }}>{fmt(man(accIn.reduce((s, x) => s + x[1], 0)))}</b></div>{accBars(accIn, C.s1, accIn[0]?.[1] || 0)}{!accIn.length && <div style={{ fontSize: 15, color: C.t3, marginTop: 8 }}>없음</div>}</div>
            <div><div className="ebx-lbl" style={{ marginTop: 8 }}>출금 <b className="ebx-num" style={{ color: C.t1 }}>{fmt(man(accOut.reduce((s, x) => s + x[1], 0)))}</b></div>{accBars(accOut, C.s2, accOut[0]?.[1] || 0)}{!accOut.length && <div style={{ fontSize: 15, color: C.t3, marginTop: 8 }}>없음</div>}</div>
          </div>
          </>}
          {arTotal > 0 && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginTop: hasLedger ? 26 : 0 }}><span className="ebx-h3">미수금 나이</span><b className="ebx-num" style={{ fontSize: 18 }}>{fmt(man(arTotal))}</b></div>
            <div style={{ display: "flex", height: 16, borderRadius: 99, overflow: "hidden", gap: 2, marginTop: 12 }}>{[[aging.b30, "#9DB2D8"], [aging.b60, C.s1], [aging.b90, C.n3], [aging.over, C.n1]].filter((a) => a[0] > 0).map((a, i) => <div key={i} style={{ flex: a[0], background: a[1] }} />)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px", marginTop: 10, fontSize: 15 }}>{[["30일 이내", aging.b30, "#9DB2D8"], ["31~60일", aging.b60, C.s1], ["61~90일", aging.b90, C.n3], ["90일 넘음", aging.over, C.n1]].map(([l, v, c]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 7, color: C.t2 }}><Dot c={c} r={3} />{l} <b className="ebx-num" style={{ color: C.t1, marginLeft: "auto" }}>{fmt(man(v))}</b></span>)}</div>
            <div className="ebx-lbl" style={{ marginTop: 14 }}>미수금 많은 거래처</div>
            {ar.slice(0, 5).map((o) => listRow(o.client, o.client, <span style={{ display: "inline-flex", gap: 10, alignItems: "baseline" }}><b className="ebx-num" style={{ fontSize: 17 }}>{fmt(man(o.outstanding))}</b><span className="ebx-num" style={{ fontSize: 15, color: o.aging.oldest > 30 ? C.t1 : C.t2, fontWeight: o.aging.oldest > 30 ? 800 : 500, minWidth: 52, textAlign: "right" }}>{o.aging.oldest}일</span></span>))}
          </>}
        </div> : null}
        {/* 3) 지급 예정 · 미수금 */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}><span className="ebx-h3">이번 주 지급 예정</span><b className="ebx-num" style={{ fontSize: 18 }}>{fmt(man(dues.reduce((s, x) => s + x.amt, 0)))}</b></div>
          {!dues.length && <div style={{ fontSize: 15, color: C.t2, marginTop: 8 }}>이번 주 고정비 지급이 없습니다.</div>}
          {dues.slice(0, 5).map((p, i) => listRow(`w${i}`, p.name, <b className="ebx-num" style={{ fontSize: 17 }}>{fmt(man(p.amt))}</b>, `${mdDow(p.d)}${p.d === today ? " · 오늘" : ""}`))}
          {duesMonth.length > 0 && <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginTop: 26 }}><span className="ebx-h3">다음 주 ~ 월말 지급</span><b className="ebx-num" style={{ fontSize: 18 }}>{fmt(man(duesMonth.reduce((s, x) => s + x.amt, 0)))}</b></div>
            {duesMonth.slice(0, 6).map((p, i) => listRow(`m${i}`, p.name, <b className="ebx-num" style={{ fontSize: 17 }}>{fmt(man(p.amt))}</b>, mdDow(p.d)))}
          </>}
        </div>
      </div>
    </Card>
  );

  const footer = (
    <div style={{ ...inner, paddingTop: 10, paddingBottom: compact ? 36 : 52, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 14, color: C.t2 }}>
      <span>데이터 기준 {dotDate(today)} {kstHm()} · 배차·정산·인사 데이터 자동 집계 · 매출 = 취소 제외 전체 오더(배차중 포함 · 매출관리는 배차완료만){bizSel ? ` · 청구 사업자 ${bizSel}` : ""}</span><span>LogisWeb 자동 생성 보고서</span>
    </div>
  );

  const g = compact ? 14 : 22;
  const row = (cols, ...items) => { const list = items.filter(Boolean); if (!list.length) return null; return <div style={{ display: "grid", gridTemplateColumns: list.length > 1 && wide ? cols : "minmax(0,1fr)", gap: g, alignItems: "stretch" }}>{list.map((x, i) => <React.Fragment key={i}>{x}</React.Fragment>)}</div>; };
  return (
    <div ref={rootRef} className="ebx" data-testid="exec-briefing" style={{ borderRadius: compact ? 0 : 20, overflow: "hidden", minWidth: 0 }}>
      <style>{CSS}</style>
      {header}
      {W > 0 && <>
        <main style={{ ...inner, paddingTop: compact ? 16 : 28, paddingBottom: 24, display: "grid", gap: g }}>
          {kpis}
          {weeklyBlock}
          {row("minmax(0,1.5fr) minmax(0,1fr)", chart30, mtdCard)}
          {row("minmax(0,1.2fr) minmax(0,1fr)", staffCard, clientsCard)}
          {cashCard}
          {wide && opsCard && (hrCard || movesCard)
            ? row("minmax(0,1.5fr) minmax(0,1fr)", opsCard, <div style={{ display: "grid", gap: g, alignContent: "start", minWidth: 0 }}>{hrCard}{movesCard}</div>)
            : <>{opsCard}{hrCard}{movesCard}</>}
        </main>
        {footer}
      </>}
      {settingsOpen && <DailyReportSettings onClose={() => setSettingsOpen(false)} uid={uid} company={company} prefs={prefs} role={role} profile={profile} people={people} />}
    </div>
  );
}

// ─────────────────────────── 받기 설정 ───────────────────────────
function Toggle({ on, onClick, disabled }) {
  return <button type="button" role="switch" aria-checked={!!on} disabled={disabled} onClick={onClick} style={{ width: 52, height: 30, borderRadius: 99, background: disabled ? "#E6EAF0" : on ? C.n3 : "#C9D1DE", position: "relative", display: "inline-block", flex: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer", padding: 0 }}><span style={{ position: "absolute", top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)", transition: "left .15s" }} /></button>;
}
function Check({ on }) {
  return <span style={{ width: 24, height: 24, borderRadius: 7, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", ...(on ? { background: C.n3 } : { border: "2px solid #B7C0D0", background: "#fff" }) }}>{on && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>}</span>;
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
  const anySection = SECTION_KEYS.some((k) => p.sections[k]);
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
    <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "210px minmax(0,1fr)", gap: narrow ? 14 : 28, padding: "26px 0", borderTop: `1px solid ${C.grid}` }}>
      <div><div style={{ fontSize: 18, fontWeight: 800 }}>{label}</div>{desc && <div style={{ fontSize: 15, color: C.t2, marginTop: 6, lineHeight: 1.55 }}>{desc}</div>}</div>
      <div style={{ minWidth: 0 }}>{ctrl}</div>
    </div>
  );
  const toggleDay = (d) => set({ days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d].sort() });
  const nextMon = (() => { let d = kstToday(); for (let i = 0; i < 8; i++) { d = addDay(d, 1); if (dowOf(d) === 1) break; } return d; })();
  return (
    <div className="ebx" data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483500, background: "rgba(11,20,40,.55)", display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", overflowY: "auto", padding: narrow ? 0 : "40px 16px" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div role="dialog" aria-modal="true" aria-label="일일 경영 보고 받기 설정" data-testid="brief-settings-dialog" className="ebx-card" style={{ width: narrow ? "100%" : 960, maxWidth: "100%", borderRadius: narrow ? 0 : 20, height: "fit-content", minHeight: narrow ? "100%" : undefined }}>
        <div style={{ padding: narrow ? "24px 18px 8px" : "30px 36px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><div style={{ fontSize: 15, color: C.n3, fontWeight: 800 }}>{BRIEF_LABEL} <span style={{ letterSpacing: ".16em", fontSize: 14, color: C.t3, marginLeft: 6 }}>{BRIEF_EN}</span></div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 4, letterSpacing: "-0.03em" }}>받기 설정</div><div style={{ fontSize: 16, color: C.t2, marginTop: 6 }}>보고서를 언제, 어떻게{canManage ? ", 누구에게" : ""} 보낼지 정합니다.</div></div>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ fontSize: 34, color: C.t2, background: "none", border: 0, cursor: "pointer", lineHeight: 1, width: 48, height: 48 }}>×</button>
        </div>
        <div style={{ padding: narrow ? "0 18px" : "0 36px" }}>
          {row("받는 시간", "영업일 아침, 고른 시각에 보냅니다", (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ width: 240, position: "relative" }}>
                <button type="button" data-testid="brief-time" onClick={() => setTimeOpen((v) => !v)} style={{ width: "100%", height: 52, border: `2px solid ${C.n3}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", fontSize: 19, fontWeight: 800, background: "#fff", color: C.t1, boxShadow: timeOpen ? "0 0 0 3px rgba(45,76,130,.12)" : "none", cursor: "pointer" }}><span className="ebx-num">{p.time}</span><span style={{ color: C.t2 }}>{timeOpen ? "▴" : "▾"}</span></button>
                {timeOpen && <div className="ebx-card" style={{ marginTop: 6, padding: 6, borderRadius: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>{BRIEF_TIMES.map((t) => <button type="button" key={t} onClick={() => { set({ time: t }); setTimeOpen(false); }} style={{ height: 44, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 17, border: 0, cursor: "pointer", background: t === p.time ? "#EAF0FB" : "transparent", color: t === p.time ? C.n3 : C.t1, fontWeight: t === p.time ? 800 : 600 }}><span className="ebx-num" style={{ fontWeight: "inherit" }}>{t}</span>{t === p.time ? "✓" : ""}</button>)}</div>}
              </div>
              <div style={{ fontSize: 15, color: C.t2, lineHeight: 1.65, background: "#F6F8FC", borderRadius: 14, padding: "14px 16px", maxWidth: 300 }}>전날 마감 데이터로 보고합니다. <b>06:00</b> 전 시각은 고를 수 없습니다.</div>
            </div>
          ))}
          {row("받는 요일", "공휴일은 자동으로 건너뜁니다", (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{[1, 2, 3, 4, 5, 6, 0].map((d) => { const wkd = d === 0 || d === 6; const on = p.days.includes(d) && (!wkd || p.weekend); return <button type="button" key={d} disabled={wkd && !p.weekend} onClick={() => toggleDay(d)} style={{ width: 52, height: 52, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, cursor: wkd && !p.weekend ? "not-allowed" : "pointer", ...(on ? { background: C.n3, color: "#fff", border: 0 } : { background: "#fff", border: `1.5px solid ${C.line}`, color: C.t3 }) }}>{DOW[d]}</button>; })}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, fontSize: 17, flexWrap: "wrap" }}><Toggle on={p.weekend} onClick={() => set({ weekend: !p.weekend, days: !p.weekend ? [...new Set([...p.days, 6, 0])] : p.days.filter((d) => d !== 0 && d !== 6) })} /><span>주말 포함</span><span style={{ color: C.t2, fontSize: 15 }}>{p.weekend ? "토·일에도 보냄" : "토·일에는 보내지 않음"}</span></div>
            </>
          ))}
          {row("월요일 보고 범위", "주말 실적을 한 번에 봅니다", (
            <div style={{ display: "grid", gap: 12 }}>{[["merge3", "금·토·일 3일 합산", `${mdDow(addDay(nextMon, -3))} ~ ${mdDow(addDay(nextMon, -1))} 실적을 합쳐 보고`], ["weekly", "지난주 주간 요약", "요일별 매출 비교, 주간 합계와 전주 대비"]].map(([k, t, d]) => <button type="button" key={k} onClick={() => set({ monday: { ...p.monday, [k]: !p.monday[k] } })} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "16px 18px", background: "#FAFBFE", textAlign: "left", cursor: "pointer" }}><Check on={p.monday[k]} /><span><b style={{ fontSize: 17, color: C.t1 }}>{t}</b><div style={{ fontSize: 15, color: C.t2, marginTop: 3 }}>{d}</div></span></button>)}</div>
          ))}
          {row("받는 방법", "", (
            <div style={{ display: "grid", gap: 4 }}>{[["popup", "앱 팝업", "LogisWeb에 처음 들어올 때 요약 팝업"], ["push", "모바일 푸시", "LogisWeb 앱 잠금화면 알림"], ["email", "이메일", "요약 메일 · 내 계정 이메일로"]].map(([k, t, d]) => <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: 14 }}><div><div style={{ fontSize: 17, fontWeight: 700 }}>{t}</div><div style={{ fontSize: 15, color: C.t2 }}>{d}</div></div><Toggle on={p.channels[k]} onClick={() => set({ channels: { ...p.channels, [k]: !p.channels[k] } })} /></div>)}</div>
          ))}
          {row("포함할 항목", "1개 이상 고릅니다", (
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: "14px 24px" }}>{BRIEF_SECTIONS.map(([k, l]) => <button type="button" key={k} onClick={() => set({ sections: { ...p.sections, [k]: !p.sections[k] } })} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 17, color: p.sections[k] ? C.t1 : C.t2, background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", minHeight: 32 }}><Check on={p.sections[k]} />{l}</button>)}</div>
          ))}
          {canManage && row("받는 사람", "임원 화면 역할 직원은 기본으로 받습니다. 끄면 그 사람에게 팝업·푸시·메일이 가지 않습니다(메뉴는 그대로).", (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
              {!listed.length && <div style={{ padding: 16, fontSize: 16, color: C.t2 }}>임원 화면 역할인 직원이 없습니다(권한 관리 › 역할의 기본 화면 "임원 화면").</div>}
              {listed.map((u, i) => {
                const tags = [u.isMaster ? "마스터" : null, String(u.position || "").trim() || null, u.team && u.team !== u.position ? u.team : null].filter(Boolean).slice(0, 2);
                return (
                  <div key={u.uid} style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto auto", gap: 14, alignItems: "center", padding: "14px 16px", borderTop: i ? `1px solid ${C.grid}` : "none" }}>
                    <span style={{ width: 40, height: 40, borderRadius: "50%", background: "#E8EEF9", color: C.n3, fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{String(u.name || u.email || "?").slice(0, 1)}</span>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name || "(이름 없음)"} <span style={{ fontWeight: 500, fontSize: 15, color: C.t2 }}>{u.position || ""}</span></div><div style={{ fontSize: 15, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email || ""}</div></div>
                    <span style={{ display: "flex", gap: 6 }}>{!narrow && tags.map((t) => <span key={t} style={{ fontSize: 14, fontWeight: 800, padding: "4px 10px", borderRadius: 999, ...(["대표", "대표이사", "사장"].includes(t) ? { background: C.n1, color: "#fff" } : { background: "#EEF2F8", color: C.n3 }) }}>{t}</span>)}</span>
                    <Toggle on={isOn(u)} onClick={() => setRcp((r) => ({ ...(r || {}), [u.uid]: !isOn(u) }))} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", padding: narrow ? "18px 18px calc(18px + env(safe-area-inset-bottom,0px))" : "20px 36px", borderTop: `1px solid ${C.line}`, background: "#FAFBFD", borderRadius: narrow ? 0 : "0 0 20px 20px" }}>
          <span style={{ fontSize: 16, color: C.t2 }}>{msg ? <b style={{ color: C.err }}>{msg}</b> : nx ? <>다음 발송 <b className="ebx-num" style={{ color: C.t1 }}>{mdDow(nx.d).replace("(", " (")} {nx.t}</b>{dowOf(nx.d) === 1 && (p.monday.merge3 || p.monday.weekly) ? ` · ${[p.monday.merge3 && "금~일 합산", p.monday.weekly && "주간 요약"].filter(Boolean).join(" + ")}` : ""}</> : "받는 요일이 없습니다"}</span>
          <div style={{ display: "flex", gap: 10, ...(narrow ? { width: "100%" } : {}) }}>
            <button type="button" onClick={onClose} style={{ flex: narrow ? 1 : "none", height: 52, padding: "0 24px", borderRadius: 13, border: `1.5px solid ${C.line}`, fontSize: 17, fontWeight: 700, color: C.t2, background: "#fff", cursor: "pointer" }}>취소</button>
            <button type="button" data-testid="brief-save" disabled={saving} onClick={save} style={{ flex: narrow ? 2 : "none", height: 52, padding: "0 34px", borderRadius: 13, background: C.n1, color: "#fff", fontSize: 17, fontWeight: 800, border: 0, cursor: "pointer" }}>{saving ? "저장 중" : "저장"}</button>
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
  const popupOn = isPopupOn(usePopupPrefs(uid), "briefing"); // ⭐ 2026-11-07 팝업 알림 설정(계정별) · 꺼도 메뉴의 보고서는 그대로
  const eligible = popupOn && !!uid && pf.ready && profile !== null && allowed && p.channels.popup !== false && (forced || (isReceiveDay(today, p) && now >= p.time && lsGet(dismissKey) !== "1" && pf.raw?.popupDismissed !== today && ssGet(laterKey) !== "1"));
  const show = eligible && !closed;
  void drivers; void role; void customRole;
  if (!show) return null;
  return <PopupBody {...{ company, dispatchData, prefs: p, uid, loadRange, mobile, onOpenReport }} onClose={(mode, noToday) => {
    setClosed(true);
    if (noToday || mode === "open") { lsSet(dismissKey, "1"); saveBriefingPrefs(uid, company, { popupDismissed: today }).catch(() => {}); }
    else ssSet(laterKey, "1");
    if (mode === "open") onOpenReport?.();
  }} />;
}
function PopupBody({ company, dispatchData, prefs, loadRange, mobile, onClose }) {
  const { today, basis, report } = useBriefingCore({ company, dispatchData, prefs, loadRange });
  const [noToday, setNoToday] = React.useState(false);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose("later", noToday); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, noToday]);
  const { cur, p1, p7, month } = report;
  const m = marginOf(cur);
  const d7 = pctChange(cur.sale, p7.sale);
  const fpct = month.target ? (month.forecast / month.target) * 100 : null;
  const nums = [
    [basis.multi ? `${basis.days.length}일 합산 매출` : "전일 매출", fmt(man(cur.sale)), "만원", <><Delta v={pctChange(cur.sale, basis.multi ? p7.sale : p1.sale)} size={16} /> <span style={{ color: C.t2 }}>{basis.multi ? "지난주 대비" : "전일 대비"}</span></>],
    ["수익 · 수익률", fmt(man(cur.profit)), "만원", <><b className="ebx-num" style={{ color: C.t1 }}>{m.toFixed(1)}%</b> <Delta v={m - marginOf(basis.multi ? p7 : p1)} unit="%p" size={16} /></>],
    ["이번 달 누계", fmt(man(month.mtd)), "만원", month.target ? <>목표 <b className="ebx-num" style={{ color: C.t1 }}>{((month.mtd / month.target) * 100).toFixed(1)}%</b> · 예상 {fpct.toFixed(0)}%</> : <>월말 예상 <b className="ebx-num" style={{ color: C.t1 }}>{eok(month.forecast)}</b></>],
  ];
  return (
    <div className="ebx" data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483400, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", padding: mobile ? 0 : 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose("later", noToday); }}>
      <style>{CSS}</style>
      <div role="dialog" aria-modal="true" aria-label="오늘의 일일 경영 보고" data-testid="brief-popup" style={{ width: mobile ? "100%" : 760, maxWidth: "100%", maxHeight: "94vh", overflowY: "auto", borderRadius: mobile ? "26px 26px 0 0" : 26, background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)" }}>
        <div style={{ background: `linear-gradient(135deg,${C.n0},${C.n2})`, padding: mobile ? "24px 20px 22px" : "30px 34px 28px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="ebx-chip" style={{ background: "rgba(143,176,240,.18)", color: "#E3EBFB" }}>{Ico.clock}{prefs.time} · {dotDate(today)}</span><button type="button" aria-label="닫기" onClick={() => onClose("later", noToday)} style={{ color: "#B9C6E0", fontSize: 32, lineHeight: 1, background: "none", border: 0, cursor: "pointer", width: 44, height: 44 }}>×</button></div>
          <div style={{ fontSize: mobile ? 26 : 32, fontWeight: 800, marginTop: 16, letterSpacing: "-0.03em" }}>오늘의 일일 경영 보고</div>
          <div style={{ fontSize: 16, color: "#C9D4EA", marginTop: 6 }}>보고 기준 {basis.multi ? basis.label : mdDow(basis.start).replace("(", " (")} · {company}</div>
        </div>
        <div style={{ padding: mobile ? "20px 16px 6px" : "26px 34px 8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 12 }}>{nums.map((n) => <div key={n[0]} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: mobile ? "14px 16px" : "18px 18px 16px", display: mobile ? "flex" : "block", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div><div style={{ fontSize: 16, color: C.t2, fontWeight: 700 }}>{n[0]}</div><div style={{ marginTop: mobile ? 2 : 6 }}><span className="ebx-num" style={{ fontSize: mobile ? 30 : 36, fontWeight: 800 }}>{n[1]}</span><span style={{ fontSize: 16, color: C.t2 }}> {n[2]}</span></div></div><div style={{ fontSize: 15, marginTop: mobile ? 0 : 8, color: C.t2, textAlign: mobile ? "right" : "left" }}>{n[3]}</div></div>)}</div>
          <div style={{ marginTop: 18, background: "#F4F7FC", borderRadius: 16, padding: "18px 20px", fontSize: 18, lineHeight: 1.7, color: C.t1, wordBreak: "keep-all" }}>
            매출은 {basis.multi ? "지난주 같은 기간" : "전주 같은 요일"}보다 <b style={{ color: d7 == null || d7 === 0 ? C.flat : d7 > 0 ? C.up : C.down }}>{d7 == null ? "–" : `${d7 > 0 ? "▲" : d7 < 0 ? "▼" : ""} ${Math.abs(d7).toFixed(1)}%`}</b> {d7 == null || d7 >= 0 ? "늘었고" : "줄었고"} {fpct ? (fpct >= 100 ? <>월말 목표 달성(예상 {fpct.toFixed(0)}%)이 유력합니다.</> : <>월말에는 목표의 {fpct.toFixed(0)}% 수준이 예상됩니다.</>) : <>월말 {eok(month.forecast)}원이 예상됩니다.</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, padding: mobile ? "16px 16px calc(20px + env(safe-area-inset-bottom,0px))" : "22px 34px 28px", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: C.t2, marginRight: "auto", cursor: "pointer", minHeight: 44, ...(mobile ? { width: "100%" } : {}) }}><input type="checkbox" checked={noToday} onChange={(e) => setNoToday(e.target.checked)} style={{ width: 22, height: 22, accentColor: C.n3 }} data-testid="brief-notoday" />오늘 하루 보지 않기</label>
          <button type="button" onClick={() => onClose("later", noToday)} style={{ flex: mobile ? "1 1 0" : "none", height: 54, padding: "0 24px", borderRadius: 14, border: `1.5px solid ${C.line}`, fontSize: 17, fontWeight: 700, color: C.t2, background: "#fff", cursor: "pointer" }}>나중에</button>
          <button type="button" data-testid="brief-open" onClick={() => onClose("open", true)} style={{ flex: mobile ? "2 1 0" : "none", height: 54, padding: "0 28px", borderRadius: 14, background: C.n1, color: "#fff", fontSize: 17, fontWeight: 800, border: 0, cursor: "pointer" }}>전체 보고서 보기</button>
        </div>
      </div>
    </div>
  );
}

// 📈 2026-11-08 경영 분석·결재 대기·직원 정보(ExecAnalytics.jsx · ExecStaffInfo.jsx)가 같은 부품·글자 크기·색을 쓴다
export { Delta, Chg, ManDiff, Card, Measure, Svg, Seg, Legend, useWidth, CSS as EBX_CSS, useQueryRows as useEbxQuery };
