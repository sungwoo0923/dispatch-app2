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
import { isFleetGrade } from "./fleetGradesCore"; // 🚛 지입차 구분(지입·직영·임대·분양) 한 곳
import React from "react";
import { withStickyOff } from "./stickyTableHead";
import { planIncludes, useCompanyPlanId } from "./plans"; // 💳 2026-11-09 요금제 잠금
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { OrdersWeatherStrip } from "./publicDataMain"; // 🌦 2026-11-07 운행 지역 날씨 · 특보
import { useOrderHistory } from "./orderHistory";
import { useCompanyBiz, bizOf } from "./companyBiz";
import { useCompanyRows } from "./companyColStore";
import { loadAcctPayments } from "./acctPayments";
import { isLateAt } from "./lateRule";
import { receivablesOf } from "./arAging"; // ⭐ 2026-11-07 미수금 공용 계산(부가세 포함 · 고정거래처 포함)
import { pickUnassignedOrders } from "./unassignedRule";
import { isPopupOn, usePopupPrefs } from "./popupPrefs"; // ⭐ 2026-11-07 팝업 알림 설정
import { approvalLeaveOn } from "./attendanceUtils";
import { isDemoOn } from "./devDemoData";
import { dailyReportDemo } from "./dailyReportDemo";
import { orderStaffNameRaw, useUserNameMap, ORDER_MGR_FIXED } from "./detailGetters";
import { computeFunds, isCard, isCredit, last4 } from "./fundsCalc";
import {
  addDay, dowOf, isBizDay, kstToday, kstHm, md, mdDow, dotDate, DOW, rangeDays, reportBasis, buildReport, weeklySummary,
  marginOf, pctChange, man, fmt, eok, normPlate, isReceiveDay, mergePrefs, BRIEF_SECTIONS, SECTION_KEYS, BRIEF_TIMES, dateOf, isCancelledOrder,
  staffRanking, monthSpans, clientMoves,
} from "./dailyReportCore";
import { C, CT_DARK, CT_PAPER, spark, revMargin, cumChart, donut, weekBars, netFlowBars, trendLine } from "./dailyReportCharts";
import { EX, EX_NUM, EX_FONT, GOLD_GRAD, ExecPage, ExecPanel, ExecTabs, Eyebrow, Num, Chip } from "./execUi"; // 👑 2026-11-17 임원 디자인 시스템
import { useBriefingPrefs, saveBriefingPrefs, useBriefingCompany, saveBriefingRecipients, useCompanyPeople, canSeeBriefing, isBriefDemo, BRIEF_LABEL, BRIEF_EN } from "./dailyReport";
import { useRoleOptions } from "./customRoles";
import { profitColor, profitRateColor } from "./marginPct"; // ⭐ 2026-11-17 수익 · 수익률 색(플러스 빨강 · 마이너스 파랑)

const demoOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const FONT = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',system-ui,sans-serif";
const WORK = new Set(["출근", "외근", "조퇴"]);
const LEAVE = new Set(["연차", "오전반차", "오후반차", "병가", "경조사", "휴직", "육아휴직", "출산휴가", "휴무"]);
const STAFF_OUT = ["driver", "shipper", "cafeUser", "totalMaster"];
const hmOf = (iso) => { const m = String(iso || "").match(/T(\d{2}):(\d{2})/); if (m) return `${m[1]}:${m[2]}`; try { const d = new Date(iso); if (!Number.isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; } catch { /* 무시 */ } return ""; };
const toMin = (hm) => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const isLateRec = (rec, emp) => (!!rec?.checkInTime && rec.status === "출근" && isLateAt(hmOf(rec.checkInTime), emp)); // ⏰ 2026-11-07 출근시간 없으면 09:00(src/lateRule.js)
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
const upDown = (v, up = "증가했고", dn = "감소했고") => (v == null || v >= 0 ? up : dn);
export function narrative({ report, weekly, ar = [], topStaff = null }) {
  const { basis, cur, p1, p7, month } = report;
  const out = [];
  const lbl = basis.multi ? `${Number(basis.start.slice(5, 7))}월 ${Number(basis.start.slice(8, 10))}일(${DOW[dowOf(basis.start)]})~${Number(basis.end.slice(8, 10))}일(${DOW[dowOf(basis.end)]}) ${basis.days.length}일간` : `${Number(basis.start.slice(5, 7))}월 ${Number(basis.start.slice(8, 10))}일(${DOW[dowOf(basis.start)]})`;
  const m = marginOf(cur); const dm = m - marginOf(p1);
  if (!cur.sale) out.push([`${lbl}에는 집계된 매출이 없습니다.`]);
  else if (basis.multi) out.push([`${lbl} 매출은 `, { b: `${fmt(man(cur.sale))}만원` }, ", 매출총이익은 ", { b: `${fmt(man(cur.profit))}만원` }, "(매출총이익률 ", { b: `${m.toFixed(1)}%` }, ")이며, 매출은 전주 동기간 대비 ", pctTok(pctChange(cur.sale, p7.sale)), ` ${upDown(pctChange(cur.sale, p7.sale), "증가했습니다.", "감소했습니다.")}`]);
  else {
    const a1 = pctChange(cur.sale, p1.sale); const a7 = pctChange(cur.sale, p7.sale);
    const same = a1 != null && a7 != null && (a1 >= 0) === (a7 >= 0);
    const cmp = same ? ["으로 전일 대비 ", pctTok(a1), ", 전주 동요일 대비 ", pctTok(a7), ` ${upDown(a7)}`]
      : ["으로 전일 대비 ", pctTok(a1), ` ${a1 == null ? "증감 산출이 불가하며" : upDown(a1, "증가했으나", "감소했으나")} 전주 동요일 대비로는 `, pctTok(a7), ` ${upDown(a7)}`];
    out.push([`${lbl} 매출은 `, { b: `${fmt(man(cur.sale))}만원` }, ...cmp, ", 매출총이익은 ", { b: `${fmt(man(cur.profit))}만원` }, "(매출총이익률 ", { b: `${m.toFixed(1)}%` }, ", 전일 대비 ", dm > 0 ? { up: `+${dm.toFixed(1)}%p` } : dm < 0 ? { dn: `${dm.toFixed(1)}%p` } : { b: "0.0%p" }, ")입니다."]);
  }
  if (weekly && weekly.prev.sale) {
    const d = pctChange(weekly.cur.sale, weekly.prev.sale);
    out.push([`지난주(${md(weekly.range[0])}~${md(weekly.range[1])}) 주간 매출은 `, { b: `${fmt(man(weekly.cur.sale))}만원` }, "으로 전주 대비 ", pctTok(d), ` ${d >= 0 ? "증가했으며" : "감소했으며"}, 평일 5일 중 ${weekly.over}일이 전주 동요일 실적을 상회했습니다.`]);
  } else if (month.mtd) {
    const tp = month.target ? (month.forecast / month.target) * 100 : null;
    out.push(["이번 달 누계 매출은 ", { b: `${fmt(man(month.mtd))}만원` }, ...(month.prevSame ? ["으로 전월 동기 대비 ", pctTok(month.d), ` ${month.d >= 0 ? "증가했으며" : "감소했으며"}`] : ["이며"]), ", 현 추세 기준 월말 매출은 ", { b: `${eok(month.forecast)}원` }, tp ? `(목표 대비 ${tp.toFixed(0)}%)` : "", "으로 예상됩니다."]);
  }
  const lowSet = new Set((report.clients.top || []).filter((c) => c.margin < 8 && c.sale > 0).map((c) => c.n));
  const arHit = ar.find((a) => lowSet.has(a.client) && a.outstanding > 0);
  if (arHit) {
    const lowN = (report.lowOrders || []).filter((r) => String(r.거래처명 || "") === arHit.client).length;
    out.push(["다만 ", { b: arHit.client }, `의 경우 미수금 ${fmt(man(arHit.outstanding))}만원${lowN ? `과 저마진 오더 ${lowN}건이 함께 발생하고 있어` : "이 남아 있고 매출총이익률도 낮아"} 거래 조건 점검이 필요합니다.`]);
  } else if (lowSet.size) { const c = report.clients.top.find((x) => lowSet.has(x.n)); out.push(["저마진 거래처 ", { b: c.n }, `(매출총이익률 ${c.margin.toFixed(1)}%)의 단가 점검이 필요합니다.`]); }
  else if (topStaff) out.push(["담당자별로는 ", { b: topStaff.n }, "님이 매출 ", { b: `${fmt(man(topStaff.sale))}만원` }, "으로 가장 높은 실적을 기록했습니다."]);
  else out.push(["그 밖의 특이 사항은 없습니다."]);
  return out.slice(0, 3);
}

// ─────────────────────────── 👑 임원 디자인(딥 네이비 + 골드) ───────────────────────────
//  2026-11-17 화면 = 다크(TH_DARK · execUi 부품) / PDF 저장 = 흰 종이(TH_PAPER · 인쇄해도 잘 읽히게, 같은 구성)
//  보고서 본문은 reportBody(T, W) 하나로 두 모양을 그린다 — PDF 는 화면 밖에 종이판(폭 1080)을 따로 그려 찍는다.
const TH_DARK = {
  dark: true, ch: CT_DARK, text: EX.text, sub: EX.sub, mute: EX.mute, faint: EX.faint, line: EX.line, row: "rgba(255,255,255,0.06)",
  stat: "rgba(255,255,255,0.035)", gold: EX.gold, goldHi: EX.goldHi, emph: EX.goldHi, ice: EX.ice, up: EX.up, down: EX.down, warn: EX.warn,
  track: "rgba(255,255,255,0.07)", iceBar: "rgba(143,176,240,0.55)", violet: "#B9A4E8",
};
const TH_PAPER = {
  dark: false, ch: CT_PAPER, text: "#0A1328", sub: "#3B4560", mute: "#646C82", faint: "#A3A9B8", line: "#E4DFD3", row: "#EEEAE1",
  stat: "#FAF8F3", gold: "#A8874A", goldHi: "#8C6B2E", emph: "#0A1328", ice: "#3F63B0", up: "#D92D20", down: "#1E5BD8", warn: "#B7791F",
  track: "#ECE8DE", iceBar: "#9DB2DD", violet: "#7D63C9",
};
const sgnC = (T, v, neutral) => (v > 0 ? T.up : v < 0 ? T.down : neutral ?? T.text);
// 증감 — 오르면 빨강 ▲ · 내리면 파랑 ▼ · 같으면 옅게
function Dl({ T, v, unit = "%", dp = 1, size = 13.5 }) {
  if (v == null || !Number.isFinite(v)) return <span style={{ ...EX_NUM, color: T.faint, fontSize: size, fontWeight: 700 }}>—</span>;
  const r = Number(v.toFixed(dp));
  return <span style={{ ...EX_NUM, color: r > 0 ? T.up : r < 0 ? T.down : T.mute, fontWeight: 800, fontSize: size, whiteSpace: "nowrap" }}>{r > 0 ? "▲ " : r < 0 ? "▼ " : ""}{Math.abs(r).toFixed(dp)}{unit}</span>;
}
const DlN = ({ T, v, size }) => (v == null || !Number.isFinite(v) ? <span style={{ color: T.gold, fontWeight: 800, fontSize: size, whiteSpace: "nowrap" }}>신규</span> : <Dl T={T} v={v} size={size} />);
const ManDl = ({ T, won, size }) => { const v = man(won); return <span style={{ ...EX_NUM, color: sgnC(T, v, T.mute), fontWeight: 800, fontSize: size, whiteSpace: "nowrap" }}>{v > 0 ? "+" : v < 0 ? "−" : ""}{fmt(Math.abs(v))}만</span>; };
const clampP = (p) => Math.max(0, Math.min(100, Number(p) || 0));
function Track({ T, pct, color, h = 6, marker = null }) {
  return (
    <div style={{ position: "relative", height: h, borderRadius: 99, background: T.track }}>
      <div style={{ width: `${clampP(pct)}%`, minWidth: pct > 0 ? 3 : 0, height: "100%", borderRadius: 99, background: color || GOLD_GRAD }} />
      {marker != null && <div style={{ position: "absolute", left: `calc(${clampP(marker)}% - 1px)`, top: -4, width: 2, height: h + 8, borderRadius: 2, background: T.text, opacity: 0.75 }} />}
    </div>
  );
}
const Swatch = ({ c, size = 9 }) => <span style={{ width: size, height: size, borderRadius: 3, background: c, flex: "none", display: "inline-block" }} />;
function KeyLegend({ T, items }) {
  return <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, fontWeight: 700, color: T.sub }}>{items.map(([c, l, kind]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>{kind === "line" ? <span style={{ width: 16, height: 2, borderRadius: 2, background: c }} /> : kind === "dash" ? <span style={{ width: 16, borderTop: `2px dashed ${c}` }} /> : <Swatch c={c} />}{l}</span>)}</div>;
}
// 패널 — 화면은 execUi ExecPanel, 종이는 같은 구조의 흰 카드
function Panel({ T, en, title, sub, right, children, glow }) {
  if (T.dark) return <ExecPanel en={en} title={title} sub={sub} right={right} glow={glow} style={{ height: "100%" }}>{children}</ExecPanel>;
  return (
    <section style={{ background: "#fff", border: `1px solid ${glow ? "#D9C9A3" : T.line}`, borderRadius: 18, minWidth: 0, height: "100%", position: "relative", overflow: "hidden" }}>
      {glow && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: GOLD_GRAD }} />}
      {(en || title || right) && (
        <div style={{ padding: "18px 22px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {en && <Eyebrow color={T.ice} size={10.5}>{en}</Eyebrow>}
            {title && <div style={{ marginTop: 4, fontSize: 17, fontWeight: 900, letterSpacing: "-0.01em", color: T.text }}>{title}</div>}
            {sub && <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 500, color: T.mute }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: "0 22px 18px" }}>{children}</div>
    </section>
  );
}
// 버튼(execUi ExecButton 과 같은 모양 · data-testid 를 달 수 있게)
function XBtn({ children, onClick, icon, disabled, testId, className = "", small = false, gold = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className={`${small ? "h-9 px-3 text-[12.5px]" : "h-10 px-4 text-[13px]"} rounded-xl font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap transition hover:brightness-110 disabled:opacity-40 ${className}`} style={gold ? { background: GOLD_GRAD, color: "#1A1408", border: "1px solid transparent" } : { background: "rgba(255,255,255,.05)", color: EX.text, border: `1px solid ${EX.line}` }}>{icon}{children}</button>;
}
const SubHead = ({ T, title, right, style }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", ...style }}><span style={{ fontSize: 14.5, fontWeight: 900, color: T.text }}>{title}</span>{right && <span style={{ fontSize: 12, fontWeight: 600, color: T.mute }}>{right}</span>}</div>;
const Empty2 = ({ T, text }) => <div style={{ border: `1px dashed ${T.line}`, borderRadius: 14, padding: "22px 14px", textAlign: "center", fontSize: 13.5, fontWeight: 700, color: T.sub }}>{text}</div>;
// 3문장 요약 — 굵게 = 골드(종이: 진한 남색) · 오름 빨강 · 내림 파랑
function NarrT({ T, parts }) {
  return <>{parts.map((p, i) => (typeof p === "string" ? <React.Fragment key={i}>{p}</React.Fragment>
    : <b key={i} style={{ ...EX_NUM, fontWeight: 800, color: p.up != null ? T.up : p.dn != null ? T.down : T.emph }}>{p.up ?? p.dn ?? p.b}</b>))}</>;
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
  const [trendN, setTrendN] = React.useState(14);
  const rootRef = React.useRef(null);
  const W = useWidth(rootRef);

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

  // 미수금(회계관리 › 미수금 현황과 같은 계산) — ⭐ 2026-11-07 functions/arCore.mjs 공용
  const fixedLive = useCompanyRows("fixedClients", cashCo);
  const ar = React.useMemo(() => {
    if (!arPay) return [];
    return receivablesOf({ orders: rows, fixedRows: demo ? [] : fixedLive || [], paid: arPay, today })
      .filter((x) => x.outstanding > 0)
      .map((x) => ({ client: x.client, outstanding: x.outstanding, age: x.oldest, aging: x.aging }));
  }, [rows, arPay, today, fixedLive, demo]);

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
  const fleet = React.useMemo(() => drivers.filter((d) => isFleetGrade(d.등급)), [drivers]);
  const fleetPlates = React.useMemo(() => new Set(fleet.map((d) => normPlate(d.차량번호)).filter(Boolean)), [fleet]);
  const utilTrend = React.useMemo(() => {
    if (!fleetPlates.size) return [];
    const want = new Set(bizSpan14); const by = {};
    rows.forEach((r) => { const d = dateOf(r); if (!want.has(d) || isCancelledOrder(r) || r.source === "transport_transmit") return; const p = normPlate(r.차량번호); if (p && fleetPlates.has(p)) (by[d] = by[d] || new Set()).add(p); });
    return bizSpan14.map((d) => [md(d), ((by[d]?.size || 0) / fleetPlates.size) * 100]);
  }, [rows, bizSpan14, fleetPlates]);

  const narr = React.useMemo(() => narrative({ report, weekly, ar, topStaff: staffRank.basis.list.find((x) => x.n !== "미지정") || null }), [report, weekly, ar, staffRank]);

  // 인력 현황(오늘)
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
  // 순현금흐름 — 최근 10주(월~일) 주간 합계
  const netWeeks = React.useMemo(() => { const mon = addDay(basis.end, -((dowOf(basis.end) + 6) % 7)); return Array.from({ length: 10 }, (_, i) => rangeDays(addDay(mon, -7 * (9 - i)), addDay(mon, -7 * (9 - i) + 6))); }, [basis.end]);

  // ── 공통 숫자 ──
  const { cur, p1, p7, month } = report;
  const sp = report.spark;
  const workNow = workOn(lastBiz);
  const prevLbl = basis.multi ? "전주 동기간" : "전일";
  const wkLbl = `전주 ${DOW[dowOf(basis.start)]}요일`;
  const goalPct = month.target ? (month.mtd / month.target) * 100 : null;
  const doneRate = cur.all ? (cur.done / cur.all) * 100 : 0;
  const basisTxt = basis.multi ? `${basis.label}${basis.weekly ? ` + 지난주(${md(addDay(today, -7))}~${md(addDay(today, -1))}) 주간 요약` : ""}` : dotDate(basis.start);
  const scheduleTxt = `매일 ${prefs.time} · ${prefs.days.length === 5 && [1, 2, 3, 4, 5].every((d) => prefs.days.includes(d)) ? "월~금" : daysLabel(prefs.days)}`;

  // 자금
  const flow = (days) => { const set = new Set(days); return ledger.reduce((a, r) => { if (!set.has(String(r.date || ""))) return a; const v = toInt(r.amount); if (r.type === "수입") a.in += v; else a.out += v; return a; }, { in: 0, out: 0 }); };
  const fl = flow(basis.days);
  const hasLedger = ledger.length > 0;
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
  const net = fl.in - fl.out;

  // 운영
  const fleetN = fleet.length;
  const extRun = [...report.plates].filter((p) => !fleetPlates.has(p)).length;
  const maxR = report.routes[0]?.[1] || 1;

  // 추이(14일 · 30일)
  const tDays = trendN === 14 ? report.d30.slice(-14) : report.d30;
  const tSum = tDays.reduce((a, x) => { const v = report.byDay[x.d]; return v ? { sale: a.sale + v.sale, profit: a.profit + v.profit } : a; }, { sale: 0, profit: 0 });
  const tWk = tDays.filter((x) => !x.off && x.sale > 0);
  const tAvg = trendN === 30 ? report.weekdayAvg : (tWk.length ? tWk.reduce((s, x) => s + x.sale, 0) / tWk.length : 0);
  const tBest = tDays.reduce((b, x) => (!b || x.sale > b.sale ? x : b), null);

  // 월 목표
  const remainBiz = Math.max(0, month.totalBiz - month.elapsed);
  const needDaily = month.target && remainBiz ? Math.max(0, month.target - month.mtd) / remainBiz : 0;
  const curDaily = month.elapsed ? month.mtd / month.elapsed : 0;
  const fpct = month.target ? (month.forecast / month.target) * 100 : null;

  // ── 타일 ──
  const tiles = basis.multi ? [
    { en: "SALES", k: `${basis.days.length}일 합산 매출`, v: fmt(man(cur.sale)), u: "만원", cmp: [["전주 동기간", pctChange(cur.sale, p7.sale)]], sp: sp.sale, hero: true },
    { en: "GROSS PROFIT", k: `${basis.days.length}일 매출총이익`, v: fmt(man(cur.profit)), u: "만원", prof: cur.profit, cmp: [["전주 동기간", pctChange(cur.profit, p7.profit)]], sp: sp.profit, note: `매출총이익률 ${marginOf(cur).toFixed(1)}%` },
    { en: "ORDERS", k: `${basis.days.length}일 오더`, v: fmt(cur.all), u: "건", cmp: [["전주 동기간", pctChange(cur.all, p7.all)]], sp: sp.orders, note: `배차완료율 ${doneRate.toFixed(1)}%` },
  ] : [
    { en: "SALES", k: "전일 매출", v: fmt(man(cur.sale)), u: "만원", cmp: [["전일", pctChange(cur.sale, p1.sale)], [wkLbl, pctChange(cur.sale, p7.sale)]], sp: sp.sale, hero: true },
    { en: "GROSS PROFIT", k: "매출총이익", v: fmt(man(cur.profit)), u: "만원", prof: cur.profit, cmp: [["전일", pctChange(cur.profit, p1.profit)], [wkLbl, pctChange(cur.profit, p7.profit)]], sp: sp.profit },
    { en: "GROSS MARGIN", k: "매출총이익률", v: marginOf(cur).toFixed(1), u: "%", prof: marginOf(cur), cmp: [["전일", marginOf(cur) - marginOf(p1)], [wkLbl, marginOf(cur) - marginOf(p7)]], unit: "%p", sp: sp.margin },
    { en: "ORDERS", k: "오더", v: fmt(cur.all), u: "건", cmp: [["전일", pctChange(cur.all, p1.all)], [wkLbl, pctChange(cur.all, p7.all)]], sp: sp.orders, note: `배차완료율 ${doneRate.toFixed(1)}%` },
  ];
  if (!basis.multi && (hasAtt || demo)) tiles.push({ en: "STAFF", k: "근무자", v: fmt(workNow), u: "명", cmp: [["전 영업일", workNow - workOn(bizSpan[bizSpan.length - 2] || lastBiz)], [wkLbl, workNow - workOn(addDay(lastBiz, -7))]], unit: "명", dp: 0, sp: bizSpan.map(workOn), note: `출근 기록 기준 ${md(lastBiz)}`, range: `최근 ${bizSpan.length}영업일` });
  else if (!basis.multi) tiles.push({ en: "OPEN ORDERS", k: "미배차 · 취소", v: `${unassigned.filter((r) => dateOf(r) <= today).length} · ${cur.cancel}`, u: "건", cmp: [["취소 · 전일", cur.cancel - p1.cancel], ["취소 · " + wkLbl, cur.cancel - p7.cancel]], unit: "건", dp: 0, sp: report.spanDays.map((d) => report.byDay[d]?.cancel || 0), note: "취소 건수 14일 추이" });

  // ── PDF · 메일 ──
  const [busy, setBusy] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);
  const printRef = React.useRef(null);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const savePdf = async () => {
    if (busy) return;
    setBusy(true); setPrinting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      // 종이판(화면 밖)이 그려지고 차트 폭이 잡힐 때까지 잠깐 기다린다
      for (let i = 0; i < 60 && !(printRef.current && printRef.current.querySelector("svg")); i++) await sleep(50);
      await sleep(300);
      try { await document.fonts?.ready; } catch { /* 무시 */ }
      const el = printRef.current; if (!el) throw new Error("보고서를 준비하지 못했습니다");
      const cssW = el.offsetWidth;
      const breaks = [...el.querySelectorAll("[data-pdf-block]")].map((n) => { let y = 0; let x = n; while (x && x !== el) { y += x.offsetTop; x = x.offsetParent; } return y; }).filter((y) => y > 0).sort((a, b) => a - b);
      const canvas = await withStickyOff(() => html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#FFFFFF", ignoreElements: (n) => n?.classList?.contains?.("ebx-noprint") })); // 📌 찍는 동안 표 머리줄 고정 끔
      const pdf = new jsPDF("p", "mm", "a4");
      const M = 8, pw = 210 - M * 2, ph = 297 - M * 2;
      const k = canvas.width / cssW; const pageCss = (cssW * ph) / pw; const total = canvas.height / k;
      // 패널 사이에서 쪽을 나눈다(패널이 두 쪽에 걸쳐 잘리지 않게)
      let start = 0; let first = true;
      while (start < total - 2) {
        let end = Math.min(total, start + pageCss);
        if (end < total) { const cut = breaks.filter((b) => b > start + pageCss * 0.35 && b <= end).pop(); if (cut) end = cut; }
        const sh = Math.round((end - start) * k); const part = document.createElement("canvas");
        part.width = canvas.width; part.height = sh;
        const g = part.getContext("2d"); g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, part.width, sh); g.drawImage(canvas, 0, Math.round(start * k), canvas.width, sh, 0, 0, canvas.width, sh);
        if (!first) pdf.addPage();
        pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", M, M, pw, (sh * pw) / canvas.width);
        first = false; start = end;
      }
      pdf.save(`일일경영보고_${today}.pdf`);
    } catch (e) { alert(`PDF 저장 실패: ${e?.message || e}`); } finally { setPrinting(false); setBusy(false); }
  };
  const textOf = (parts) => parts.map((p) => (typeof p === "string" ? p : p.b ?? p.up ?? p.dn)).join("");
  const sendMail = () => {
    const subj = `[${company}] 일일 경영 보고 ${dotDate(today)}`;
    const dTxt = (v, u = "%") => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(u === "%p" || u === "%" ? 1 : 0)}${u}`);
    const kpiLines = tiles.map((t) => `· ${t.k} ${t.v}${t.u}  (${t.cmp.map(([l, v]) => `${l} 대비 ${dTxt(v, t.unit || "%")}`).join(" · ")})`);
    kpiLines.push(`· 이번 달 누계 매출 ${fmt(man(month.mtd))}만원  (전월 동기 대비 ${dTxt(month.d)}${goalPct != null ? ` · 목표 달성률 ${goalPct.toFixed(1)}%` : ""})`);
    const body = `${subj}\n보고 기준: ${basis.label}\n\n■ 요약\n${narr.map(textOf).join("\n")}\n\n■ 핵심 지표\n${kpiLines.join("\n")}\n\n※ 차트를 포함한 전체 보고서는 [PDF 저장]으로 내려받아 첨부하시기 바랍니다.\nLogisWeb 자동 생성 보고서`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  };

  // ─────────── 본문(테마 T · 폭 W) ───────────
  const reportBody = (T, W, { paper = false } = {}) => {
    const compact = W < 640;
    const wide = W >= (paper ? 900 : 1120);
    const th = T.ch;
    const g = compact ? 14 : 18;
    const block = (key, node) => (node ? <div key={key} data-pdf-block style={{ minWidth: 0 }}>{node}</div> : null);
    const row = (key, cols, ...items) => { const list = items.filter(Boolean); if (!list.length) return null; return <div key={key} data-pdf-block style={{ display: "grid", gridTemplateColumns: list.length > 1 && wide ? cols : "minmax(0,1fr)", gap: g, alignItems: "stretch", minWidth: 0 }}>{list.map((x, i) => <div key={i} style={{ minWidth: 0 }}>{x}</div>)}</div>; };
    const numS = compact ? 22 : 24; // 패널 안 숫자(같은 성격 = 같은 크기)
    const statCell = (l, v, u, sub, color, key) => (
      <div key={key || l} style={{ background: T.stat, border: `1px solid ${T.line}`, borderRadius: 16, padding: compact ? "12px 13px" : "14px 16px", minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
        <div style={{ marginTop: 6 }}><Num value={v} unit={u} size={numS} color={color || T.text} unitColor={T.mute} /></div>
        {sub && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: T.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
    );
    const lineRow = (k, left, right, sub, i) => (
      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${T.row}` : "none" }}>
        <span style={{ minWidth: 0 }}><span style={{ fontSize: 14, fontWeight: 700, color: T.text, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{left}</span>{sub && <span style={{ fontSize: 12, color: T.mute, display: "block", marginTop: 1 }}>{sub}</span>}</span>
        <span style={{ whiteSpace: "nowrap" }}>{right}</span>
      </div>
    );
    const amt = (won, opt = {}) => <b style={{ ...EX_NUM, fontSize: opt.size || 15, fontWeight: 800, color: opt.color || T.text }}>{opt.sign && won > 0 ? "+" : ""}{won < 0 ? "−" : ""}{fmt(Math.abs(man(won)))}</b>;

    // ── 1) 결론 ──
    const summary = sec.headline !== false && (
      <Panel T={T} glow en="EXECUTIVE SUMMARY" title="경영 요약" sub={bizSel ? `청구 사업자 ${bizSel} 기준` : undefined}>
        <ol style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: compact ? 12 : 14 }}>
          {narr.map((s, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: compact ? "26px minmax(0,1fr)" : "34px minmax(0,1fr)", gap: compact ? 8 : 12, alignItems: "baseline", paddingTop: i ? (compact ? 12 : 14) : 0, borderTop: i ? `1px solid ${T.row}` : "none" }}>
              <span style={{ ...EX_NUM, fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", color: i ? T.faint : T.gold }}>{String(i + 1).padStart(2, "0")}</span>
              <p style={{ margin: 0, fontSize: i ? (compact ? 14.5 : 15.5) : (compact ? 17 : 20), fontWeight: i ? 500 : 600, lineHeight: i ? 1.7 : 1.6, letterSpacing: "-0.015em", color: i ? T.sub : T.text, wordBreak: "keep-all" }}><NarrT T={T} parts={s} /></p>
            </li>
          ))}
        </ol>
      </Panel>
    );

    // ── 2) 핵심 지표 ──
    const tileBox = (accent, children, key) => (
      <div key={key} style={{ position: "relative", borderRadius: 20, padding: compact ? "14px 14px 12px" : "18px 18px 14px", minWidth: 0, overflow: "hidden", background: accent ? (T.dark ? "linear-gradient(160deg, rgba(215,188,130,.16), rgba(215,188,130,.04) 55%, rgba(255,255,255,.02))" : "#FBF7EE") : (T.dark ? EX.panel : "#fff"), border: `1px solid ${accent ? (T.dark ? EX.lineHi : "#D9C9A3") : T.line}`, boxShadow: T.dark ? "inset 0 1px 0 rgba(255,255,255,.05)" : "none" }}>
        {accent && <div style={{ position: "absolute", top: 0, left: 18, right: 18, height: 1.5, background: GOLD_GRAD }} />}
        {children}
      </div>
    );
    const tileHead = (en, k, accent) => <><Eyebrow color={accent ? T.gold : T.ice} size={10}>{en}</Eyebrow><div style={{ marginTop: 4, fontSize: compact ? 13 : 13.5, fontWeight: 800, color: T.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k}</div></>;
    const bigS = compact ? 28 : 34;
    const tile = (t) => tileBox(!!t.hero, <>
      {tileHead(t.en, t.k, t.hero)}
      <div style={{ marginTop: 10 }}><Num value={t.v} unit={t.u} size={t.hero ? bigS + 2 : bigS} color={t.hero ? T.emph === T.text ? T.text : T.goldHi : t.prof != null ? profitColor(t.prof, { dark: T.dark, neutral: T.text }) : T.text} unitColor={T.mute} /></div>
      <div style={{ marginTop: 10, display: "grid", gap: 3 }}>
        {t.cmp.map(([l, v]) => <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5, color: T.mute, fontWeight: 600 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l} 대비</span><Dl T={T} v={v} unit={t.unit} dp={t.dp} size={13} /></div>)}
      </div>
      <Measure style={{ marginTop: 10 }}>{(w) => <Svg html={spark(t.sp, w, compact ? 30 : 36, { th, color: t.hero ? th.gold : th.ice })} />}</Measure>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 4, fontSize: 11.5, fontWeight: 600, color: T.faint }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.note || "14일 추이"}</span>{!compact && <span style={{ ...EX_NUM, whiteSpace: "nowrap" }}>{t.range || `${md(report.spanDays[0])}~${md(report.spanDays[13])}`}</span>}</div>
    </>, t.k);
    const mtdTile = tileBox(false, <>
      {tileHead("MONTH TO DATE", "이번 달 누계")}
      <div style={{ marginTop: 10 }}><Num value={fmt(man(month.mtd))} unit="만원" size={bigS} color={T.text} unitColor={T.mute} /></div>
      <div style={{ marginTop: 10, display: "grid", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5, color: T.mute, fontWeight: 600 }}><span>전월 동기 대비</span><Dl T={T} v={month.d} size={13} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5, color: T.mute, fontWeight: 600 }}><span>월 목표 달성률</span><b style={{ ...EX_NUM, fontSize: 13, fontWeight: 900, color: goalPct != null ? T.gold : T.faint }}>{goalPct != null ? `${goalPct.toFixed(1)}%` : "미설정"}</b></div>
      </div>
      <div style={{ marginTop: 16 }}><Track T={T} pct={goalPct || 0} h={7} marker={month.totalBiz ? (month.elapsed / month.totalBiz) * 100 : null} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 10, fontSize: 11.5, fontWeight: 600, color: T.faint }}><span>세로선 = 경과 영업일</span><span style={EX_NUM}>{month.elapsed}/{month.totalBiz}일</span></div>
    </>, "mtd");
    const kpis = sec.kpi !== false && <div data-pdf-block style={{ display: "grid", gridTemplateColumns: paper ? `repeat(${basis.multi ? 4 : 3},minmax(0,1fr))` : wide && !basis.multi ? "repeat(6,minmax(0,1fr))" : `repeat(auto-fit, minmax(min(${compact ? 150 : 200}px, 100%), 1fr))`, gap: compact ? 10 : 14 }}>{[...tiles.map(tile), mtdTile]}</div>;

    // ── 3) 매출 · 수익률 추이 ──
    const trendTabs = !paper && <ExecTabs size="sm" items={[[14, "14일"], [30, "30일"]]} value={trendN} onChange={setTrendN} />;
    const trend = sec.chart30 !== false && (
      <Panel T={T} en="SALES TREND" title="매출 · 매출총이익률 추이" sub={`최근 ${trendN}일 · ${md(tDays[0].d)} ~ ${md(basis.end)} · 매출 단위 만원`} right={trendTabs}>
        <div style={{ marginTop: 4 }}><KeyLegend T={T} items={[[T.iceBar, "평일 매출"], [T.dark ? "rgba(143,176,240,.18)" : "#E4EAF5", "주말·휴일"], [T.gold, "보고 기준"], [T.ice, "매출총이익률", "line"], [T.gold, "평일 평균", "dash"]]} /></div>
        <Measure style={{ marginTop: 12 }}>{(w) => <Svg html={revMargin(w, tDays, tAvg, compact ? { th, barH: 160, lineH: 64, labelEvery: trendN === 14 ? 3 : 7, compact: true } : { th, barH: paper ? 180 : wide ? 240 : 210, lineH: paper ? 66 : 84, valueLabels: trendN === 14, labelEvery: trendN === 14 ? (w < 640 ? 2 : 1) : Math.max(2, Math.ceil((30 * 84) / Math.max(200, w - 140))) })} />}</Measure>
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 14 }}>
          {statCell(`${trendN}일 매출`, fmt(man(tSum.sale)), "만원", `매출총이익 ${fmt(man(tSum.profit))}만원`)}
          {statCell(`${trendN}일 매출총이익률`, marginOf(tSum).toFixed(1), "%", `보고 기준 ${marginOf(cur).toFixed(1)}%`, profitRateColor(marginOf(tSum), { dark: T.dark, neutral: T.text }))}
          {statCell("평일 일평균 매출", fmt(man(tAvg)), "만원", "주말·휴일 제외")}
          {statCell("최고 매출일", tBest ? fmt(man(tBest.sale)) : "—", tBest ? "만원" : "", tBest ? mdDow(tBest.d) : "")}
        </div>
      </Panel>
    );

    // ── 4) 월 목표 ──
    const monthCard = sec.mtd !== false && (
      <Panel T={T} en="MONTHLY TARGET" title={`${Number(month.ym.slice(5))}월 목표 달성 현황`} sub="영업일 기준 · 주말 매출은 다음 영업일에 합산 · 단위 만원">
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 6 }}>
          {statCell("월 목표", month.target ? fmt(man(month.target)) : "미설정", month.target ? "만원" : "", month.target ? `목표 잔여액 ${fmt(man(Math.max(0, month.target - month.mtd)))}만원` : "회사 설정에서 입력하면 표시됩니다")}
          {statCell("월말 예상 매출", fmt(man(month.forecast)), "만원", fpct != null ? `목표 대비 ${fpct.toFixed(0)}%` : `전월 실적 ${fmt(man(month.cumPrev[month.cumPrev.length - 1] || 0))}만원`, fpct != null && fpct >= 100 ? T.gold : T.text)}
          {statCell("일평균 매출", fmt(man(curDaily)), "만원", month.target && remainBiz ? (curDaily >= needDaily ? `필요 일평균 ${fmt(man(needDaily))}만 · 목표 달성 가능` : `필요 일평균 ${fmt(man(needDaily))}만 · ${fmt(man(needDaily - curDaily))}만 미달`) : `잔여 영업일 ${remainBiz}일`)}
        </div>
        <SubHead T={T} title="누계 매출 · 전월 동기 비교" right={<KeyLegend T={T} items={[[T.gold, `${Number(month.ym.slice(5))}월 누계`, "line"], [T.gold, "월말 예상", "dash"], [th.base, `${Number(month.pym.slice(5))}월`, "line"]]} />} style={{ marginTop: 18 }} />
        <Measure style={{ marginTop: 6 }}>{(w) => <Svg html={cumChart(w, compact ? 220 : paper ? 250 : wide ? 340 : 260, { cur: month.cumCur.map(man), prev: month.cumPrev.map(man), target: man(month.target), forecast: man(month.forecast), total: month.totalBiz, curLabel: `${fmt(man(month.mtd))}만`, prevLabel: `${Number(month.pym.slice(5))}월` }, { compact, th })} />}</Measure>
      </Panel>
    );

    // ── 5) 담당자 순위 ──
    const sr = staffMode === "month" ? staffRank.month : staffRank.basis;
    const srCmp = staffMode === "month" ? "전월 동기간" : basis.multi ? "전주 동기간" : "전 영업일";
    const srLabel = staffMode === "month" ? `${md(mSpan.cur[0])}~${md(basis.end)}` : basis.multi ? basis.label : mdDow(basis.start);
    const srTop = sr.list.slice(0, 10);
    const srMax = srTop[0]?.sale || 1;
    const SR_COLS = "22px minmax(56px,1fr) 118px 72px 58px 40px 72px";
    const staffCard = sec.staff !== false && (
      <Panel T={T} en="SALES BY MANAGER" title="담당자별 매출 순위" sub={`${srLabel} · 증감은 ${srCmp} 대비 · 단위 만원`} right={!paper && <ExecTabs size="sm" items={[["basis", basis.multi ? `${basis.days.length}일 합산` : "전일"], ["month", "이번 달"]]} value={staffMode} onChange={setStaffMode} />}>
        <div style={{ marginTop: 6 }}>
          {!srTop.length && <Empty2 T={T} text="해당 기간에 집계된 담당자별 매출이 없습니다." />}
          {!compact && srTop.length > 0 && <div style={{ display: "grid", gridTemplateColumns: SR_COLS, gap: 10, padding: "0 0 8px", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.04em", color: T.faint, borderBottom: `1px solid ${T.line}` }}><span>순위</span><span>담당자</span><span style={{ textAlign: "right" }}>매출 · 비중</span><span style={{ textAlign: "right" }}>매출총이익</span><span style={{ textAlign: "right" }}>이익률</span><span style={{ textAlign: "right" }}>건수</span><span style={{ textAlign: "right" }}>증감</span></div>}
          {srTop.map((s, i) => {
            const barC = i < 3 ? GOLD_GRAD : T.iceBar;
            return compact ? (
              <div key={s.n} style={{ padding: "12px 0", borderTop: i ? `1px solid ${T.row}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}><span style={{ ...EX_NUM, fontSize: 13, fontWeight: 900, color: i < 3 ? T.gold : T.faint, width: 16, textAlign: "right" }}>{i + 1}</span><b style={{ fontSize: 15, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.n}</b></span>
                  <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>{amt(s.sale, { size: 15.5 })}<DlN T={T} v={s.d} size={12.5} /></span>
                </div>
                <div style={{ margin: "7px 0 0 26px" }}><Track T={T} pct={(s.sale / srMax) * 100} color={barC} h={5} /></div>
                <div style={{ margin: "7px 0 0 26px", fontSize: 12.5, color: T.mute }}>매출총이익 <b style={{ ...EX_NUM, color: profitColor(s.profit, { dark: T.dark, neutral: T.text }) }}>{fmt(man(s.profit))}만</b> · 이익률 <b style={{ ...EX_NUM, color: T.text }}>{s.margin.toFixed(1)}%</b> · <b style={{ ...EX_NUM, color: T.text }}>{fmt(s.cnt)}</b>건</div>
              </div>
            ) : (
              <div key={s.n} style={{ padding: "11px 0 10px", borderTop: i ? `1px solid ${T.row}` : "none" }}>
                <div style={{ display: "grid", gridTemplateColumns: SR_COLS, gap: 10, alignItems: "baseline" }}>
                  <span style={{ ...EX_NUM, fontSize: 13.5, fontWeight: 900, color: i < 3 ? T.gold : T.faint }}>{i + 1}</span>
                  <b style={{ fontSize: 14.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.n}>{s.n}</b>
                  <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>{amt(s.sale)}<span style={{ ...EX_NUM, fontSize: 12, fontWeight: 600, color: T.mute }}> · {pctStr(s.sale, sr.total, 0)}</span></span>
                  <span style={{ ...EX_NUM, fontSize: 14, fontWeight: 700, textAlign: "right", color: profitColor(s.profit, { dark: T.dark, neutral: T.text }) }}>{fmt(man(s.profit))}</span>
                  <span style={{ ...EX_NUM, fontSize: 14, fontWeight: 700, textAlign: "right", color: T.sub }}>{s.margin.toFixed(1)}%</span>
                  <span style={{ ...EX_NUM, fontSize: 14, fontWeight: 700, textAlign: "right", color: T.sub }}>{fmt(s.cnt)}</span>
                  <span style={{ textAlign: "right" }}><DlN T={T} v={s.d} size={13} /></span>
                </div>
                <div style={{ margin: "7px 0 0 32px", width: "calc(100% - 32px)" }}><Track T={T} pct={(s.sale / srMax) * 100} color={barC} h={4} /></div>
              </div>
            );
          })}
        </div>
        {srTop.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 12, marginTop: 4, borderTop: `1px solid ${T.line}`, fontSize: 13, color: T.mute }}>
          <span>합계 <b style={{ ...EX_NUM, color: T.text, fontSize: 15 }}>{fmt(man(sr.total))}만원</b> <Dl T={T} v={pctChange(sr.total, sr.prevTotal)} size={12.5} /> · 담당자 {sr.list.length}명{sr.list.length > srTop.length ? ` (상위 ${srTop.length}명)` : ""}</span>
          {!paper && onGo && canGo("매출관리") && <XBtn onClick={() => onGo("매출관리")} className="ebx-noprint" small>매출관리에서 보기 →</XBtn>}
        </div>}
      </Panel>
    );

    // ── 6) 거래처 ──
    const cl = report.clients;
    const maxC = cl.top[0]?.sale || 1;
    const clientsCard = sec.clients !== false && (
      <Panel T={T} en="TOP CLIENTS" title={`거래처 TOP ${Math.min(8, cl.top.length) || 8}`} sub={`${md(basis.end)}${basis.multi ? ` 외 ${basis.days.length - 1}일` : ""} · 단위 만원 · 증감은 최근 4주 동요일 평균 대비`}>
        <div style={{ marginTop: 6 }}>
          {!cl.top.length && <Empty2 T={T} text="보고 기준 기간에 집계된 매출이 없습니다." />}
          {cl.top.map((c, i) => {
            const low = c.margin < 8;
            return (
              <div key={c.n} style={{ padding: "10px 0", borderTop: i ? `1px solid ${T.row}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}><span style={{ ...EX_NUM, fontSize: 13, fontWeight: 900, color: i < 3 ? T.gold : T.faint, width: 16, textAlign: "right" }}>{i + 1}</span><span style={{ fontSize: 14.5, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.n}</span>{low && <span style={{ fontSize: 11, fontWeight: 800, color: T.warn, border: `1px solid ${T.warn}`, borderRadius: 99, padding: "0 7px", lineHeight: "18px", whiteSpace: "nowrap" }}>저마진</span>}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 12, whiteSpace: "nowrap" }}>{amt(c.sale)}{!compact && <span style={{ ...EX_NUM, fontSize: 12.5, color: low ? T.warn : T.mute, fontWeight: low ? 800 : 600, minWidth: 82, textAlign: "right" }}>이익률 {c.margin.toFixed(1)}%</span>}<span style={{ minWidth: 64, textAlign: "right" }}><DlN T={T} v={c.d} size={13} /></span></span>
                </div>
                <div style={{ margin: "7px 0 0 26px" }}><Track T={T} pct={(c.sale / maxC) * 100} color={low ? T.iceBar : GOLD_GRAD} h={4} /></div>
              </div>
            );
          })}
        </div>
        {cl.top.length > 0 && <div style={{ paddingTop: 12, marginTop: 4, borderTop: `1px solid ${T.line}`, fontSize: 12.5, color: T.mute, lineHeight: 1.6 }}>TOP {cl.top.length} 합계 <b style={{ ...EX_NUM, color: T.text }}>{fmt(man(cl.topSum))}만원</b> ({cl.total ? ((cl.topSum / cl.total) * 100).toFixed(1) : 0}%){cl.others ? ` · 기타 ${cl.others}개사 ${fmt(man(cl.total - cl.topSum))}만원` : ""} · 저마진 = 매출총이익률 8% 미만</div>}
      </Panel>
    );
    const moveList = (list, up) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: up ? T.up : T.down, paddingBottom: 6 }}>{up ? "▲ 매출 증가 거래처" : "▼ 매출 감소 거래처"}</div>
        {!list.length && <div style={{ fontSize: 13, color: T.faint, marginTop: 6 }}>해당 없음</div>}
        {list.map((c, i) => <div key={c.n} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "9px 0", borderTop: `1px solid ${i ? T.row : T.line}` }}><span style={{ fontSize: 14, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.n}</span><span style={{ display: "flex", gap: 8, alignItems: "baseline" }}><ManDl T={T} won={c.diff} size={13.5} /><span style={{ ...EX_NUM, fontSize: 12, color: T.mute, fontWeight: 600, minWidth: 34, textAlign: "right" }}>{c.d == null ? "신규" : `${Math.abs(c.d).toFixed(0)}%`}</span></span></div>)}
      </div>
    );
    const movesCard = sec.clients !== false && (moves.up.length > 0 || moves.down.length > 0) && (
      <Panel T={T} en="CLIENT MOVES" title="거래처별 매출 증감" sub={`당월 ${md(mSpan.cur[0])}~${md(basis.end)} vs 전월 동기간 · 증감액 순`}>
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: compact ? 16 : 22, marginTop: 6 }}>{moveList(moves.up, true)}{moveList(moves.down, false)}</div>
      </Panel>
    );

    // ── 7) 자금 ──
    const agingParts = [["30일 이내", aging.b30, T.iceBar], ["31~60일", aging.b60, T.ice], ["61~90일", aging.b90, T.warn], ["90일 초과", aging.over, T.up]];
    const accBars = (list, col) => { const top = list[0]?.[1] || 0; return list.slice(0, 5).map(([k2, v]) => (
      <div key={k2} style={{ display: "grid", gridTemplateColumns: "minmax(64px,96px) minmax(0,1fr) auto", gap: 10, alignItems: "center", marginTop: 8, fontSize: 13 }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.sub, fontWeight: 600 }}>{k2}</span>
        <Track T={T} pct={top ? (v / top) * 100 : 0} color={col} h={5} />
        <b style={{ ...EX_NUM, textAlign: "right", color: T.text, fontWeight: 800 }}>{fmt(man(v))}</b>
      </div>
    )); };
    const cashCard = showCash && (
      <Panel T={T} en="CASH POSITION" title="자금 현황" sub="단위 만원 · 회계 장부(수입·지출) · 자금관리 · 미수금 현황 기준">
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : wide ? `repeat(${F ? 5 : 4},minmax(0,1fr))` : "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 6 }}>
          {F && statCell("보유 자금", fmt(man(F.cash)), "만원", F.runway != null ? `운영 가능 기간 약 ${F.runway.toFixed(1)}개월` : "통장·현금 잔액 합계", T.dark ? T.goldHi : T.text)}
          {statCell(`${basis.multi ? "기간" : "전일"} 현금 유입`, fmt(man(fl.in)), "만원", basis.multi ? `${basis.days.length}일 합산` : mdDow(basis.start))}
          {statCell(`${basis.multi ? "기간" : "전일"} 현금 유출`, fmt(man(fl.out)), "만원", basis.multi ? `${basis.days.length}일 합산` : mdDow(basis.start))}
          {statCell("순현금흐름", `${net > 0 ? "+" : net < 0 ? "−" : ""}${fmt(Math.abs(man(net)))}`, "만원", "현금 유입 − 현금 유출", sgnC(T, net))}
          {statCell("미수금", fmt(man(arTotal)), "만원", ar30 > 0 ? `30일 초과 미수금 ${fmt(man(ar30))}만원` : "당해 연도 청구분 · 부가세 포함")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : wide ? "minmax(0,1fr) minmax(0,1.3fr) minmax(0,1fr)" : "1fr 1fr", gap: compact ? 24 : 30, marginTop: 22, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            <SubHead T={T} title="통장 · 계좌별 잔액" />
            {!fundsList.length && <div style={{ fontSize: 13, color: T.mute, marginTop: 8, lineHeight: 1.6 }}>등록된 계좌가 없습니다. 자금관리에서 계좌를 등록하면 잔액이 표시됩니다.</div>}
            <div style={{ marginTop: 4 }}>{fundsList.map((f, i) => lineRow(f.id, f.name || f.bank || f.kind, <b style={{ ...EX_NUM, fontSize: 15, fontWeight: 800, color: f.kind === "대출" ? T.mute : T.text }}>{f.kind === "대출" ? "−" : ""}{fmt(man(f.balance))}</b>, [f.bank, last4(f), isCredit(f) ? "잔여 한도" : f.kind === "대출" ? "대출 잔액" : isCard(f) ? "체크카드" : f.kind].filter(Boolean).join(" · "), i))}</div>
            {F && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              {statCell("대출 잔액", fmt(man(F.loan)), "만원", null, null, "loan")}
              {statCell("당월 카드 사용액", fmt(man(F.cardMonth)), "만원", null, null, "card")}
            </div>}
            {hasLedger && <>
              <SubHead T={T} title="월별 현금흐름" style={{ marginTop: 22 }} />
              <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr 1fr", gap: 0, marginTop: 6, fontSize: 13.5 }}>
                {["", "현금 유입", "현금 유출", "순현금흐름"].map((h) => <span key={h || "m"} style={{ color: T.faint, fontWeight: 800, fontSize: 11.5, textAlign: h ? "right" : "left", padding: "4px 0", borderBottom: `1px solid ${T.line}` }}>{h}</span>)}
                {monthFlow.map((x) => { const nv = x.in - x.out; const cs = { padding: "8px 0", borderBottom: `1px solid ${T.row}` }; return [<span key={`${x.m}a`} style={{ ...cs, color: T.mute, fontWeight: 700 }}>{Number(x.m.slice(5))}월</span>, <span key={`${x.m}b`} style={{ ...cs, ...EX_NUM, textAlign: "right", color: T.text, fontWeight: 700 }}>{fmt(man(x.in))}</span>, <span key={`${x.m}c`} style={{ ...cs, ...EX_NUM, textAlign: "right", color: T.text, fontWeight: 700 }}>{fmt(man(x.out))}</span>, <span key={`${x.m}d`} style={{ ...cs, ...EX_NUM, textAlign: "right", fontWeight: 800, color: sgnC(T, nv) }}>{nv > 0 ? "+" : nv < 0 ? "−" : ""}{fmt(Math.abs(man(nv)))}</span>]; })}
              </div>
            </>}
          </div>
          {hasLedger || arTotal > 0 ? <div style={{ minWidth: 0 }}>
            {hasLedger && <>
              <SubHead T={T} title="순현금흐름 추이" right={`최근 ${netData.length}주 · 주간 현금 유입 − 현금 유출`} />
              <Measure style={{ marginTop: 6 }}>{(w) => <Svg html={netFlowBars(w, compact ? 190 : 210, netData, { compact, th, labelEvery: compact ? 3 : w < 520 ? 2 : 1 })} />}</Measure>
              <SubHead T={T} title="당월 계정별 입출금" style={{ marginTop: 18 }} />
              <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: compact ? 14 : 20, marginTop: 2 }}>
                <div><div style={{ fontSize: 12.5, fontWeight: 700, color: T.mute, marginTop: 8 }}>입금액 <b style={{ ...EX_NUM, color: T.text }}>{fmt(man(accIn.reduce((s, x) => s + x[1], 0)))}</b></div>{accBars(accIn, GOLD_GRAD)}{!accIn.length && <div style={{ fontSize: 13, color: T.faint, marginTop: 8 }}>내역 없음</div>}</div>
                <div><div style={{ fontSize: 12.5, fontWeight: 700, color: T.mute, marginTop: 8 }}>출금액 <b style={{ ...EX_NUM, color: T.text }}>{fmt(man(accOut.reduce((s, x) => s + x[1], 0)))}</b></div>{accBars(accOut, T.iceBar)}{!accOut.length && <div style={{ fontSize: 13, color: T.faint, marginTop: 8 }}>내역 없음</div>}</div>
              </div>
            </>}
            {arTotal > 0 && <>
              <SubHead T={T} title="미수금 연령" right={<b style={{ ...EX_NUM, fontSize: 15, color: T.text }}>{fmt(man(arTotal))}</b>} style={{ marginTop: hasLedger ? 24 : 0 }} />
              <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 2, marginTop: 10, background: T.track }}>{agingParts.filter((a) => a[1] > 0).map((a) => <div key={a[0]} style={{ flex: a[1], background: a[2] }} />)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginTop: 10, fontSize: 12.5 }}>{agingParts.map(([l, v, c]) => <span key={l} style={{ display: "flex", alignItems: "center", gap: 7, color: T.mute, fontWeight: 600 }}><Swatch c={c} size={8} />{l} <b style={{ ...EX_NUM, color: T.text, marginLeft: "auto", fontWeight: 800 }}>{fmt(man(v))}</b></span>)}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.mute, marginTop: 14 }}>미수금 상위 거래처</div>
              {ar.slice(0, 5).map((o, i) => lineRow(o.client, o.client, <span style={{ display: "inline-flex", gap: 10, alignItems: "baseline" }}>{amt(o.outstanding, { size: 14.5 })}<span style={{ ...EX_NUM, fontSize: 12.5, color: o.aging.oldest > 30 ? T.warn : T.mute, fontWeight: o.aging.oldest > 30 ? 800 : 600, minWidth: 44, textAlign: "right" }}>경과 {o.aging.oldest}일</span></span>, null, i))}
            </>}
          </div> : null}
          <div style={{ minWidth: 0 }}>
            <SubHead T={T} title="이번 주 지급 예정액" right={<b style={{ ...EX_NUM, fontSize: 15, color: T.text }}>{fmt(man(dues.reduce((s, x) => s + x.amt, 0)))}</b>} />
            {!dues.length && <div style={{ fontSize: 13, color: T.mute, marginTop: 8 }}>이번 주 지급 예정인 고정비가 없습니다.</div>}
            <div style={{ marginTop: 4 }}>{dues.slice(0, 5).map((p, i) => lineRow(`w${i}`, p.name, amt(p.amt, { size: 14.5 }), `${mdDow(p.d)}${p.d === today ? " · 오늘" : ""}`, i))}</div>
            {duesMonth.length > 0 && <>
              <SubHead T={T} title="다음 주 ~ 월말 지급 예정액" right={<b style={{ ...EX_NUM, fontSize: 15, color: T.text }}>{fmt(man(duesMonth.reduce((s, x) => s + x.amt, 0)))}</b>} style={{ marginTop: 22 }} />
              <div style={{ marginTop: 4 }}>{duesMonth.slice(0, 6).map((p, i) => lineRow(`m${i}`, p.name, amt(p.amt, { size: 14.5 }), mdDow(p.d), i))}</div>
            </>}
          </div>
        </div>
      </Panel>
    );

    // ── 8) 운영 ──
    const parts = [["지입", T.gold], ["직영", T.ice], ["임대", T.violet]].map(([n, c]) => ({ n, c, v: fleet.filter((d) => d.등급 === n).length, run: fleet.filter((d) => d.등급 === n && report.plates.has(normPlate(d.차량번호))).length }));
    const runN = parts.reduce((s, p) => s + p.run, 0);
    const opsCard = sec.ops !== false && (fleetN > 0 || report.routes.length > 0) && (
      <Panel T={T} en="OPERATIONS" title="운영 현황" sub={`${md(basis.end)}${basis.multi ? ` 외 ${basis.days.length - 1}일` : ""} 기준 · 운행 = 해당일 오더에 배정된 소속 차량`}>
        {fleetN > 0 && <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "auto minmax(0,1fr)", gap: compact ? 16 : 30, marginTop: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Svg html={donut(128, parts, { thick: 12, track: T.track, center: `<text x="64" y="66" text-anchor="middle" font-size="28" font-weight="900" fill="${T.text}">${fleetN}</text><text x="64" y="86" text-anchor="middle" font-size="12" font-weight="600" fill="${T.mute}">전체 차량</text>` })} style={{ flex: "none" }} />
            <div style={{ display: "grid", gap: 8 }}>{parts.map((p) => <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><Swatch c={p.c} /><span style={{ width: 32, color: T.sub, fontWeight: 600 }}>{p.n}</span><b style={{ ...EX_NUM, fontSize: 15, color: T.text }}>{p.v}대</b><span style={{ ...EX_NUM, color: T.mute, fontWeight: 600, fontSize: 12.5 }}>{fleetN ? ((p.v / fleetN) * 100).toFixed(0) : 0}%</span></div>)}</div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}><span style={{ fontSize: 13, fontWeight: 700, color: T.mute }}>가동률 (운행 / 전체)</span><Num value={fleetN ? ((runN / fleetN) * 100).toFixed(1) : "0.0"} unit="%" size={numS} color={T.dark ? T.goldHi : T.text} unitColor={T.mute} /></div>
            {parts.filter((p) => p.v > 0).map((u) => <div key={u.n} style={{ display: "grid", gridTemplateColumns: "34px 1fr 52px", gap: 10, alignItems: "center", marginTop: 9, fontSize: 13 }}><span style={{ color: T.mute, fontWeight: 600 }}>{u.n}</span><Track T={T} pct={(u.run / u.v) * 100} color={u.c} h={6} /><span style={{ ...EX_NUM, textAlign: "right", color: T.text, fontWeight: 700 }}>{u.run}/{u.v}</span></div>)}
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12.5, flexWrap: "wrap", color: T.mute, fontWeight: 600 }}>{[["운행", runN], ["미가동", fleetN - runN], ["용차(외부 차량)", extRun]].map((a) => <span key={a[0]}>{a[0]} <b style={{ ...EX_NUM, color: T.text, fontSize: 14 }}>{a[1]}대</b></span>)}</div>
          </div>
        </div>}
        {utilTrend.length > 1 && <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
          <SubHead T={T} title="차량 가동률 추이" right={`최근 ${utilTrend.length}영업일 · 소속 ${fleetPlates.size}대`} />
          <Measure style={{ marginTop: 6 }}>{(w) => <Svg html={trendLine(w, compact ? 180 : 200, utilTrend, { compact, th, labelEvery: compact ? 4 : w < 700 ? 3 : 2 })} />}</Measure>
        </div>}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
          <SubHead T={T} title="노선 TOP 5" right="상차 → 하차" />
          {!report.routes.length && <div style={{ fontSize: 13, color: T.mute, marginTop: 8 }}>집계된 오더가 없습니다.</div>}
          {report.routes.map(([k2, n2], i) => { const [a, b] = k2.split("→"); return <div key={k2} style={{ display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr) 64px 44px" : "minmax(0,1fr) 150px 48px", gap: 12, alignItems: "center", marginTop: i ? 8 : 10, fontSize: 13.5 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text, fontWeight: 600 }}>{a} <span style={{ color: T.gold }}>→</span> {b}</span><Track T={T} pct={(n2 / maxR) * 100} color={T.iceBar} h={5} /><b style={{ ...EX_NUM, textAlign: "right", color: T.text }}>{n2}건</b></div>; })}
        </div>
      </Panel>
    );

    // ── 9) 인력 ──
    const hrCard = sec.hr !== false && staff.length > 0 && (
      <Panel T={T} en="PEOPLE" title="인력 현황" sub={hrDay === today ? `사무직 · 오늘 ${kstHm()} 기준` : `사무직 · ${mdDow(hrDay)} 기준`}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}><Num value={hr.present} unit="명 근무 중" size={34} color={T.dark ? T.goldHi : T.text} unitColor={T.sub} /><span style={{ ...EX_NUM, fontSize: 13, color: T.mute, fontWeight: 600 }}>/ 전체 {staff.length}명</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginTop: 14 }}>{[["출근", hr.present - hr.outside, T.gold], ["지각", hr.late, T.warn], ["휴가", hr.leave, T.iceBar], ["외근", hr.outside, T.ice]].map((s) => <div key={s[0]} style={{ background: T.stat, border: `1px solid ${T.line}`, borderRadius: 14, padding: "10px 11px" }}><div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: T.mute }}><Swatch c={s[2]} size={7} />{s[0]}</div><div style={{ ...EX_NUM, fontSize: 22, fontWeight: 900, color: T.text, marginTop: 4 }}>{s[1]}</div></div>)}</div>
        <div style={{ marginTop: 12, fontSize: 13.5 }}>
          {[
            ["입사자 (최근 7일)", <><b style={EX_NUM}>{hr.hires.length}</b>명{hr.hires.length ? ` · ${hr.hires.slice(0, 2).map((u) => `${u.name || ""}${u.team ? ` (${u.team})` : ""}`).join(", ")}` : ""}</>],
            ["퇴사자 (최근 7일)", <><b style={EX_NUM}>{hr.quits.length}</b>명</>],
            ["지각", hr.lateList.length ? hr.lateList.slice(0, 2).join(", ") + (hr.lateList.length > 2 ? ` 외 ${hr.lateList.length - 2}명` : "") : "없음"],
            ["출근 미기록", <><b style={EX_NUM}>{Math.max(0, staff.length - hr.present - hr.leave)}</b>명{hrDay === today ? " (출근 처리 전 인원 포함)" : ""}</>],
          ].map(([l, v], i) => <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: i ? `1px solid ${T.row}` : "none" }}><span style={{ color: T.mute, fontWeight: 600, flex: "none" }}>{l}</span><span style={{ textAlign: "right", wordBreak: "keep-all", color: T.text, fontWeight: 600 }}>{v}</span></div>)}
        </div>
      </Panel>
    );

    // ── 10) 주간 요약(월요일) ──
    const weeklyBlock = weekly && (
      <Panel T={T} en="WEEKLY REVIEW" title="지난주 주간 요약" sub="요일별 매출 · 지난주 vs 전주 · 단위 만원" right={!compact && <KeyLegend T={T} items={[[T.gold, `${md(weekly.range[0])}~${md(weekly.range[1])}`], [th.barOff, `${md(weekly.prevRange[0])}~${md(weekly.prevRange[1])}`]]} />}>
        <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1.6fr) minmax(0,1fr)" : "1fr", gap: 26, marginTop: 6, alignItems: "start" }}>
          <Measure>{(w) => <Svg html={weekBars(w, compact ? 230 : 270, weekly.days, weekly.days.map((d, i) => (basis.days.includes(d.d) ? i : -1)).filter((i) => i >= 0), { compact, th })} />}</Measure>
          <div>
            {[["주간 매출", `${fmt(man(weekly.cur.sale))}만원`, `${fmt(man(weekly.prev.sale))}만`, pctChange(weekly.cur.sale, weekly.prev.sale)], ["주간 매출총이익", `${fmt(man(weekly.cur.profit))}만원`, `${fmt(man(weekly.prev.profit))}만`, pctChange(weekly.cur.profit, weekly.prev.profit), undefined, profitColor(weekly.cur.profit, { dark: T.dark, neutral: T.text })], ["매출총이익률", `${marginOf(weekly.cur).toFixed(1)}%`, `${marginOf(weekly.prev).toFixed(1)}%`, marginOf(weekly.cur) - marginOf(weekly.prev), "%p"], ["오더", `${fmt(weekly.cur.all)}건`, `${fmt(weekly.prev.all)}건`, pctChange(weekly.cur.all, weekly.prev.all)], ["신규 거래처", `${weekly.fresh}곳`, "", null]].map((r, i) => (
              <div key={r[0]} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, alignItems: "baseline", padding: "11px 0", borderTop: i ? `1px solid ${T.row}` : "none" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.mute }}>{r[0]}</span>
                <span><b style={{ ...EX_NUM, fontSize: 17, fontWeight: 900, color: r[5] || T.text }}>{r[1]}</b>{r[2] && <span style={{ ...EX_NUM, fontSize: 12, color: T.faint, fontWeight: 600, marginLeft: 8 }}>전주 {r[2]}</span>}</span>
                <span style={{ minWidth: 70, textAlign: "right" }}>{r[3] == null ? <span style={{ ...EX_NUM, color: weekly.fresh ? T.up : T.faint, fontSize: 13.5, fontWeight: 800 }}>{weekly.fresh ? `+${weekly.fresh}` : "—"}</span> : <Dl T={T} v={r[3]} unit={r[4] || "%"} size={13.5} />}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    );

    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: g }}>
        {block("sum", summary)}
        {kpis}
        {!paper && <div data-pdf-block className="ebx-noprint"><OrdersWeatherStrip orders={dispatchData} title="오늘 운행 지역 날씨 · 특보" large={!compact} dark /></div>}
        {block("wk", weeklyBlock)}
        {row("trend", "minmax(0,1.55fr) minmax(0,1fr)", trend, monthCard)}
        {row("staff", paper ? "minmax(0,1fr)" : "minmax(0,1.25fr) minmax(0,1fr)", staffCard, clientsCard)}
        {block("cash", cashCard)}
        {wide && opsCard && (hrCard || movesCard)
          ? row("ops", "minmax(0,1.4fr) minmax(0,1fr)", opsCard, <div style={{ display: "grid", gap: g, alignContent: "start", minWidth: 0, height: "100%" }}>{hrCard}{movesCard}</div>)
          : <>{block("ops1", opsCard)}{block("hr1", hrCard)}{block("mv1", movesCard)}</>}
        <div data-pdf-block style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 6, fontSize: 12, fontWeight: 500, color: T.faint, lineHeight: 1.6 }}>
          <span>{dotDate(today)} {kstHm()} 집계 · 배차·정산·인사 데이터 자동 집계 · 매출 = 취소 · 운송사 전송 제외 전체 오더 기준(배차중 포함, 매출관리 화면은 배차완료 기준){bizSel ? ` · 청구 사업자 ${bizSel}` : ""}</span><span style={{ letterSpacing: "0.04em" }}>LogisWeb 자동 생성 보고서</span>
        </div>
      </div>
    );
  };

  const compactScr = W > 0 && W < 640;
  const actions = (
    <div className="ebx-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <XBtn onClick={savePdf} disabled={busy} icon={Ico.pdf} testId="brief-pdf">{busy ? "생성 중…" : compactScr ? "PDF" : "PDF 저장"}</XBtn>
      <XBtn onClick={sendMail} icon={Ico.mail} testId="brief-mail">{compactScr ? "메일" : "메일로 보내기"}</XBtn>
      <XBtn onClick={() => setSettingsOpen(true)} icon={Ico.gear} testId={compactScr ? "brief-settings-m" : "brief-settings"}>설정</XBtn>
    </div>
  );
  const dateNode = <span style={{ ...EX_NUM, color: EX.goldHi, fontWeight: 900 }}>{dotDate(today)}</span>;
  return (
    <div className="ebx" data-testid="exec-briefing" style={{ background: "transparent", minWidth: 0, fontFamily: EX_FONT }}>
      <ExecPage en={basis.weekly ? "MONDAY MANAGEMENT REPORT" : "DAILY MANAGEMENT REPORT"} title={<span style={{ display: "inline-flex", flexWrap: "wrap", columnGap: 14, alignItems: "baseline" }}><span>{BRIEF_LABEL}</span><span style={{ whiteSpace: "nowrap" }}>{dateNode}</span></span>}
        sub={<span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "center" }}><b style={{ color: EX.text, fontWeight: 800 }}>{company}</b><span>보고 기준 <span style={{ ...EX_NUM, color: EX.text, fontWeight: 700 }}>{basisTxt}</span></span><span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: EX.mute }}>{Ico.clock}{scheduleTxt}</span></span>}
        right={actions}>
        {biz.multi && <div className="ebx-noprint"><ExecTabs size="sm" value={bizSel} onChange={setBizSel} items={[["", "전체 사업자"], ...biz.names.map((n) => [n, n])]} /></div>}
        <div ref={rootRef} style={{ minWidth: 0 }}>{W > 0 && reportBody(TH_DARK, W)}</div>
      </ExecPage>
      {printing && (
        <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, zIndex: -1, pointerEvents: "none" }}>
          <div ref={printRef} data-testid="brief-print" style={{ width: 1080, background: "#FFFFFF", color: TH_PAPER.text, fontFamily: EX_FONT, padding: "36px 40px 28px", boxSizing: "border-box" }}>
            <div data-pdf-block style={{ paddingBottom: 18, marginBottom: 18, borderBottom: `1px solid ${TH_PAPER.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><Eyebrow color={TH_PAPER.gold}>{basis.weekly ? "MONDAY MANAGEMENT REPORT" : "DAILY MANAGEMENT REPORT"}</Eyebrow><span style={{ fontSize: 12.5, fontWeight: 800, color: TH_PAPER.sub }}>{company}</span></div>
              <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900, letterSpacing: "-0.02em", color: TH_PAPER.text }}>{BRIEF_LABEL} <span style={{ color: TH_PAPER.faint, fontWeight: 400 }}>·</span> <span style={{ ...EX_NUM, color: TH_PAPER.goldHi }}>{dotDate(today)}</span></div>
              <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 500, color: TH_PAPER.sub }}>보고 기준 {basisTxt}{bizSel ? ` · 청구 사업자 ${bizSel}` : ""} · {scheduleTxt}</div>
              <div style={{ marginTop: 14, height: 2, background: GOLD_GRAD, width: 120, borderRadius: 2 }} />
            </div>
            <PaperBody render={(w) => reportBody(TH_PAPER, w, { paper: true })} />
          </div>
        </div>
      )}
      {settingsOpen && <DailyReportSettings onClose={() => setSettingsOpen(false)} uid={uid} company={company} prefs={prefs} role={role} profile={profile} people={people} />}
    </div>
  );
}
// 종이판 본문 — 폭을 재서 그린다
function PaperBody({ render }) {
  const ref = React.useRef(null);
  const w = useWidth(ref);
  return <div ref={ref} style={{ minWidth: 0 }}>{w > 0 && render(w)}</div>;
}

// ─────────────────────────── 받기 설정 ───────────────────────────
const SD = TH_DARK; // 설정 · 팝업도 같은 임원 다크
function Toggle({ on, onClick, disabled }) {
  return <button type="button" role="switch" aria-checked={!!on} disabled={disabled} onClick={onClick} style={{ width: 50, height: 28, borderRadius: 99, background: disabled ? "rgba(255,255,255,.06)" : on ? GOLD_GRAD : "rgba(255,255,255,.14)", position: "relative", display: "inline-block", flex: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer", padding: 0, boxShadow: on ? "0 4px 14px rgba(215,188,130,.25)" : "none" }}><span style={{ position: "absolute", top: 3, left: on ? 25 : 3, width: 22, height: 22, borderRadius: "50%", background: on ? "#1A1408" : "#E8EEF8", transition: "left .15s" }} /></button>;
}
function Check({ on }) {
  return <span style={{ width: 22, height: 22, borderRadius: 7, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", ...(on ? { background: GOLD_GRAD } : { border: "1.5px solid rgba(232,238,250,.3)", background: "transparent" }) }}>{on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1A1408" strokeWidth="3.5"><path d="M5 12l5 5 9-10" /></svg>}</span>;
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
const modalBg = `radial-gradient(900px 400px at 90% -10%, rgba(215,188,130,.12), transparent 60%), radial-gradient(700px 400px at -10% 0%, rgba(75,108,183,.20), transparent 55%), linear-gradient(180deg, ${EX.bg1}, ${EX.bg0})`;
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
    if (!anySection) { setMsg("포함 항목을 1개 이상 선택해 주십시오."); return; }
    if (!p.days.length) { setMsg("수신 요일을 1개 이상 선택해 주십시오."); return; }
    setSaving(true); setMsg("");
    try {
      await saveBriefingPrefs(uid, company, { time: p.time, days: p.days, weekend: p.weekend, monday: p.monday, channels: p.channels, sections: p.sections });
      if (canManage && rcp) await saveBriefingRecipients(company, rcp);
      onClose();
    } catch (e) { setMsg(`저장 실패: ${e?.code === "permission-denied" ? "권한이 없습니다(보안 규칙 배포가 필요할 수 있습니다)." : e?.message || e}`); } finally { setSaving(false); }
  };
  const nx = nextSendOf(p);
  const row = (label, desc, ctrl) => (
    <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "200px minmax(0,1fr)", gap: narrow ? 12 : 26, padding: "22px 0", borderTop: `1px solid ${SD.line}` }}>
      <div><div style={{ fontSize: 15.5, fontWeight: 900, color: SD.text }}>{label}</div>{desc && <div style={{ fontSize: 12.5, color: SD.mute, marginTop: 5, lineHeight: 1.55 }}>{desc}</div>}</div>
      <div style={{ minWidth: 0 }}>{ctrl}</div>
    </div>
  );
  const toggleDay = (d) => set({ days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d].sort() });
  const nextMon = (() => { let d = kstToday(); for (let i = 0; i < 8; i++) { d = addDay(d, 1); if (dowOf(d) === 1) break; } return d; })();
  const optBox = { display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${SD.line}`, borderRadius: 14, padding: "14px 16px", background: "rgba(255,255,255,.03)", textAlign: "left", cursor: "pointer", color: SD.text };
  return (
    <div className="ebx" data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483500, background: "rgba(3,7,16,.66)", backdropFilter: "blur(3px)", display: "flex", alignItems: narrow ? "stretch" : "flex-start", justifyContent: "center", overflowY: "auto", padding: narrow ? 0 : "40px 16px", fontFamily: EX_FONT }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="일일 경영 보고 수신 설정" data-testid="brief-settings-dialog" style={{ width: narrow ? "100%" : 920, maxWidth: "100%", borderRadius: narrow ? 0 : 26, height: "fit-content", minHeight: narrow ? "100%" : undefined, background: modalBg, border: narrow ? "none" : `1px solid ${EX.lineHi}`, boxShadow: "0 40px 100px rgba(0,0,0,.55)", color: SD.text, overflow: "hidden" }}>
        <div style={{ padding: narrow ? "22px 18px 14px" : "28px 34px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Eyebrow>{BRIEF_EN}</Eyebrow><span style={{ fontSize: 12.5, fontWeight: 700, color: SD.mute }}>{BRIEF_LABEL}</span></div><div style={{ fontSize: narrow ? 24 : 28, fontWeight: 900, marginTop: 6, letterSpacing: "-0.02em" }}>수신 설정</div><div style={{ fontSize: 14, color: SD.sub, marginTop: 4 }}>보고서의 발송 시각{canManage ? ", 수신 방법, 수신 대상" : "과 수신 방법"}을 설정합니다.</div></div>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ fontSize: 28, color: SD.mute, background: "rgba(255,255,255,.05)", border: `1px solid ${SD.line}`, borderRadius: 12, cursor: "pointer", lineHeight: 1, width: 42, height: 42 }}>×</button>
        </div>
        <div style={{ padding: narrow ? "0 18px" : "0 34px" }}>
          {row("수신 시각", "영업일 아침, 지정한 시각에 발송됩니다.", (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ width: 220, position: "relative" }}>
                <button type="button" data-testid="brief-time" onClick={() => setTimeOpen((v) => !v)} style={{ width: "100%", height: 48, border: `1px solid ${EX.lineHi}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", fontSize: 18, fontWeight: 900, background: "rgba(215,188,130,.08)", color: SD.goldHi, cursor: "pointer" }}><span style={EX_NUM}>{p.time}</span><span style={{ color: SD.mute, fontSize: 13 }}>{timeOpen ? "▲" : "▼"}</span></button>
                {timeOpen && <div style={{ marginTop: 6, padding: 6, borderRadius: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: EX.bg2, border: `1px solid ${SD.line}`, boxShadow: "0 20px 40px rgba(0,0,0,.4)" }}>{BRIEF_TIMES.map((t) => <button type="button" key={t} onClick={() => { set({ time: t }); setTimeOpen(false); }} style={{ height: 40, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 15, border: 0, cursor: "pointer", background: t === p.time ? "rgba(215,188,130,.16)" : "transparent", color: t === p.time ? SD.goldHi : SD.sub, fontWeight: t === p.time ? 900 : 600 }}><span style={{ ...EX_NUM, fontWeight: "inherit" }}>{t}</span>{t === p.time ? "✓" : ""}</button>)}</div>}
              </div>
              <div style={{ fontSize: 13, color: SD.sub, lineHeight: 1.65, background: "rgba(255,255,255,.04)", border: `1px solid ${SD.line}`, borderRadius: 14, padding: "12px 14px", maxWidth: 300 }}>전일 마감 데이터 기준으로 보고됩니다. <b style={{ color: SD.text }}>06:00</b> 이전 시각은 선택할 수 없습니다.</div>
            </div>
          ))}
          {row("수신 요일", "공휴일은 자동으로 제외됩니다.", (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{[1, 2, 3, 4, 5, 6, 0].map((d) => { const wkd = d === 0 || d === 6; const on = p.days.includes(d) && (!wkd || p.weekend); return <button type="button" key={d} disabled={wkd && !p.weekend} onClick={() => toggleDay(d)} style={{ width: 46, height: 46, borderRadius: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15.5, fontWeight: 900, cursor: wkd && !p.weekend ? "not-allowed" : "pointer", ...(on ? { background: GOLD_GRAD, color: "#1A1408", border: 0, boxShadow: "0 6px 16px rgba(215,188,130,.22)" } : { background: "rgba(255,255,255,.04)", border: `1px solid ${SD.line}`, color: wkd && !p.weekend ? SD.faint : SD.sub }) }}>{DOW[d]}</button>; })}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, fontSize: 14.5, flexWrap: "wrap" }}><Toggle on={p.weekend} onClick={() => set({ weekend: !p.weekend, days: !p.weekend ? [...new Set([...p.days, 6, 0])] : p.days.filter((d) => d !== 0 && d !== 6) })} /><span style={{ fontWeight: 700 }}>주말 포함</span><span style={{ color: SD.mute, fontSize: 13 }}>{p.weekend ? "토·일에도 발송" : "토·일 발송 안 함"}</span></div>
            </>
          ))}
          {row("월요일 보고 범위", "주말 실적을 합산하여 보고합니다.", (
            <div style={{ display: "grid", gap: 10 }}>{[["merge3", "금·토·일 3일 합산", `${mdDow(addDay(nextMon, -3))} ~ ${mdDow(addDay(nextMon, -1))} 실적을 합산하여 보고`], ["weekly", "지난주 주간 요약", "요일별 매출 비교 · 주간 합계 · 전주 대비 증감"]].map(([k, t, d]) => <button type="button" key={k} onClick={() => set({ monday: { ...p.monday, [k]: !p.monday[k] } })} style={{ ...optBox, ...(p.monday[k] ? { borderColor: EX.lineHi, background: "rgba(215,188,130,.06)" } : null) }}><Check on={p.monday[k]} /><span><b style={{ fontSize: 14.5, color: SD.text }}>{t}</b><div style={{ fontSize: 12.5, color: SD.mute, marginTop: 3 }}>{d}</div></span></button>)}</div>
          ))}
          {row("수신 방법", "", (
            <div style={{ display: "grid", gap: 2 }}>{[["popup", "앱 팝업", "LogisWeb 최초 접속 시 요약 팝업 표시"], ["push", "모바일 푸시", "LogisWeb 앱 잠금화면 알림"], ["email", "이메일", "요약 메일 · 계정 이메일 주소로 발송"]].map(([k, t, d], i) => <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", gap: 14, borderTop: i ? `1px solid ${SD.row}` : "none" }}><div><div style={{ fontSize: 14.5, fontWeight: 800 }}>{t}</div><div style={{ fontSize: 12.5, color: SD.mute }}>{d}</div></div><Toggle on={p.channels[k]} onClick={() => set({ channels: { ...p.channels, [k]: !p.channels[k] } })} /></div>)}</div>
          ))}
          {row("포함 항목", "1개 이상 선택합니다.", (
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: "12px 22px" }}>{BRIEF_SECTIONS.map(([k, l]) => <button type="button" key={k} onClick={() => set({ sections: { ...p.sections, [k]: !p.sections[k] } })} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14.5, fontWeight: 700, color: p.sections[k] ? SD.text : SD.mute, background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", minHeight: 36 }}><Check on={p.sections[k]} />{l}</button>)}</div>
          ))}
          {canManage && row("수신 대상", "임원 화면 역할 직원은 기본 수신 대상입니다. 해제하면 해당 직원에게 팝업·푸시·메일이 발송되지 않습니다(메뉴 열람은 유지).", (
            <div style={{ border: `1px solid ${SD.line}`, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,.02)" }}>
              {!listed.length && <div style={{ padding: 16, fontSize: 13.5, color: SD.mute }}>임원 화면 역할로 지정된 직원이 없습니다(권한 관리 › 역할의 기본 화면 "임원 화면").</div>}
              {listed.map((u, i) => {
                const tags = [u.isMaster ? "마스터" : null, String(u.position || "").trim() || null, u.team && u.team !== u.position ? u.team : null].filter(Boolean).slice(0, 2);
                return (
                  <div key={u.uid} style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto auto", gap: 12, alignItems: "center", padding: "12px 14px", borderTop: i ? `1px solid ${SD.row}` : "none" }}>
                    <span style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(215,188,130,.12)", border: `1px solid ${EX.lineHi}`, color: SD.goldHi, fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{String(u.name || u.email || "?").slice(0, 1)}</span>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name || "(이름 없음)"} <span style={{ fontWeight: 500, fontSize: 12.5, color: SD.mute }}>{u.position || ""}</span></div><div style={{ fontSize: 12.5, color: SD.mute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email || ""}</div></div>
                    <span style={{ display: "flex", gap: 6 }}>{!narrow && tags.map((t) => <Chip key={t} tone={["대표", "대표이사", "사장"].includes(t) ? "gold" : "ice"}>{t}</Chip>)}</span>
                    <Toggle on={isOn(u)} onClick={() => setRcp((r) => ({ ...(r || {}), [u.uid]: !isOn(u) }))} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", padding: narrow ? "16px 18px calc(16px + env(safe-area-inset-bottom,0px))" : "18px 34px", borderTop: `1px solid ${SD.line}`, background: "rgba(0,0,0,.18)" }}>
          <span style={{ fontSize: 13.5, color: SD.mute }}>{msg ? <b style={{ color: SD.up }}>{msg}</b> : nx ? <>다음 발송 <b style={{ ...EX_NUM, color: SD.goldHi }}>{mdDow(nx.d).replace("(", " (")} {nx.t}</b>{dowOf(nx.d) === 1 && (p.monday.merge3 || p.monday.weekly) ? ` · ${[p.monday.merge3 && "금~일 합산", p.monday.weekly && "주간 요약"].filter(Boolean).join(" + ")}` : ""}</> : "선택된 수신 요일이 없습니다"}</span>
          <div style={{ display: "flex", gap: 10, ...(narrow ? { width: "100%" } : {}) }}>
            <button type="button" onClick={onClose} style={{ flex: narrow ? 1 : "none", height: 48, padding: "0 22px", borderRadius: 13, border: `1px solid ${SD.line}`, fontSize: 15, fontWeight: 800, color: SD.sub, background: "rgba(255,255,255,.05)", cursor: "pointer" }}>취소</button>
            <button type="button" data-testid="brief-save" disabled={saving} onClick={save} style={{ flex: narrow ? 2 : "none", height: 48, padding: "0 32px", borderRadius: 13, background: GOLD_GRAD, color: "#1A1408", fontSize: 15, fontWeight: 900, border: 0, cursor: "pointer", boxShadow: "0 8px 22px rgba(215,188,130,.25)" }}>{saving ? "저장 중" : "저장"}</button>
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
  // 💳 2026-11-09 요금제 — 일일 경영 보고는 스탠다드부터(메뉴가 잠긴 요금제에는 아침 팝업도 띄우지 않는다)
  const planId = useCompanyPlanId(company);
  const allowed = !previewOnly && canSeeBriefing({ isExec }) && co.recipients[uid] !== false && planIncludes(planId, "export");
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
  const T = SD;
  const { cur, p1, p7, month } = report;
  const m = marginOf(cur);
  const d7 = pctChange(cur.sale, p7.sale);
  const fpct = month.target ? (month.forecast / month.target) * 100 : null;
  const gp = month.target ? (month.mtd / month.target) * 100 : null;
  const nums = [
    { en: "SALES", k: basis.multi ? `${basis.days.length}일 합산 매출` : "전일 매출", v: fmt(man(cur.sale)), c: T.goldHi, foot: <><Dl T={T} v={pctChange(cur.sale, basis.multi ? p7.sale : p1.sale)} size={13} /> <span style={{ color: T.mute }}>{basis.multi ? "전주 동기간 대비" : "전일 대비"}</span></>, hero: true },
    { en: "GROSS PROFIT", k: "매출총이익 · 이익률", v: fmt(man(cur.profit)), c: profitColor(cur.profit, { dark: true, neutral: T.text }), foot: <><b style={{ ...EX_NUM, color: T.text }}>{m.toFixed(1)}%</b> <Dl T={T} v={m - marginOf(basis.multi ? p7 : p1)} unit="%p" size={13} /></> },
    { en: "MONTH TO DATE", k: "이번 달 누계", v: fmt(man(month.mtd)), c: T.text, foot: gp != null ? <>목표 달성률 <b style={{ ...EX_NUM, color: T.gold }}>{gp.toFixed(1)}%</b> · 월말 예상 {fpct.toFixed(0)}%</> : <>월말 예상 <b style={{ ...EX_NUM, color: T.text }}>{eok(month.forecast)}원</b></>, meter: gp },
  ];
  const pad = mobile ? 18 : 30;
  return (
    <div className="ebx" data-kp-dialog style={{ position: "fixed", inset: 0, zIndex: 2147483400, background: "rgba(3,7,16,.62)", backdropFilter: "blur(4px)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center", padding: mobile ? 0 : 16, fontFamily: EX_FONT }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose("later", noToday); }}>
      <div role="dialog" aria-modal="true" aria-label="오늘의 일일 경영 보고" data-testid="brief-popup" style={{ position: "relative", width: mobile ? "100%" : 760, maxWidth: "100%", maxHeight: "94vh", overflowY: "auto", borderRadius: mobile ? "26px 26px 0 0" : 28, background: modalBg, border: `1px solid ${EX.lineHi}`, borderBottom: mobile ? "none" : undefined, boxShadow: "0 40px 100px rgba(0,0,0,.6)", color: T.text }}>
        <div style={{ position: "absolute", top: 0, left: 28, right: 28, height: 1.5, background: GOLD_GRAD }} />
        <div style={{ padding: mobile ? `20px ${pad}px 4px` : `28px ${pad}px 6px` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}><Eyebrow>MORNING BRIEFING</Eyebrow><span style={{ ...EX_NUM, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: T.mute, whiteSpace: "nowrap" }}>{Ico.clock}{prefs.time}</span></span>
            <button type="button" aria-label="닫기" onClick={() => onClose("later", noToday)} style={{ color: T.mute, fontSize: 26, lineHeight: 1, background: "rgba(255,255,255,.05)", border: `1px solid ${T.line}`, borderRadius: 12, cursor: "pointer", width: 40, height: 40, flex: "none" }}>×</button>
          </div>
          <div style={{ fontSize: mobile ? 23 : 28, fontWeight: 900, marginTop: 10, letterSpacing: "-0.02em", lineHeight: 1.25 }}>오늘의 일일 경영 보고</div>
          <div style={{ fontSize: 13.5, color: T.sub, marginTop: 6, lineHeight: 1.5 }}><span style={{ ...EX_NUM, color: T.goldHi, fontWeight: 800 }}>{dotDate(today)}</span> · 보고 기준 {basis.multi ? basis.label : mdDow(basis.start).replace("(", " (")} · {company}</div>
        </div>
        <div style={{ padding: `16px ${pad}px 4px` }}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 10 }}>
            {nums.map((n) => (
              <div key={n.k} style={{ position: "relative", borderRadius: 18, padding: mobile ? "13px 15px" : "16px 16px 14px", overflow: "hidden", background: n.hero ? "linear-gradient(160deg, rgba(215,188,130,.16), rgba(215,188,130,.04) 55%, rgba(255,255,255,.02))" : EX.panel, border: `1px solid ${n.hero ? EX.lineHi : T.line}`, display: mobile ? "flex" : "block", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <Eyebrow color={n.hero ? T.gold : T.ice} size={9.5}>{n.en}</Eyebrow>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.sub, marginTop: 3 }}>{n.k}</div>
                  <div style={{ marginTop: mobile ? 4 : 8 }}><Num value={n.v} unit="만원" size={mobile ? 26 : 30} color={n.c} unitColor={T.mute} /></div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: mobile ? 0 : 10, color: T.mute, textAlign: mobile ? "right" : "left", whiteSpace: "nowrap" }}>
                  {n.foot}
                  {n.meter != null && <div style={{ marginTop: 8, width: mobile ? 110 : "100%", marginLeft: mobile ? "auto" : 0 }}><Track T={T} pct={n.meter} h={5} marker={month.totalBiz ? (month.elapsed / month.totalBiz) * 100 : null} /></div>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, borderRadius: 18, padding: mobile ? "14px 16px" : "16px 20px", background: "rgba(215,188,130,.06)", border: `1px solid ${EX.lineHi}`, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 12, alignItems: "baseline" }}>
            <span style={{ ...EX_NUM, fontSize: 11, fontWeight: 900, letterSpacing: ".16em", color: T.gold }}>요약</span>
            <p style={{ margin: 0, fontSize: mobile ? 15 : 16.5, fontWeight: 600, lineHeight: 1.7, color: T.text, wordBreak: "keep-all" }}>
              {d7 == null ? <>매출은 {basis.multi ? "전주 동기간" : "전주 동요일"} 비교 데이터가 없으며, </> : <>매출은 {basis.multi ? "전주 동기간" : "전주 동요일"} 대비 <b style={{ ...EX_NUM, color: Math.abs(d7) < 0.05 ? T.mute : d7 > 0 ? T.up : T.down }}>{`${d7 > 0 ? "▲ " : d7 < 0 ? "▼ " : ""}${Math.abs(d7).toFixed(1)}%`}</b> {d7 >= 0 ? "증가했으며" : "감소했으며"}, </>}{fpct ? (fpct >= 100 ? <>현 추세 기준 월말 목표 달성(예상 달성률 <b style={{ ...EX_NUM, color: T.goldHi }}>{fpct.toFixed(0)}%</b>)이 유력합니다.</> : <>현 추세 기준 월말 매출은 목표 대비 <b style={{ ...EX_NUM, color: T.goldHi }}>{fpct.toFixed(0)}%</b> 수준으로 예상됩니다.</>) : <>현 추세 기준 월말 매출은 <b style={{ ...EX_NUM, color: T.goldHi }}>{eok(month.forecast)}원</b>으로 예상됩니다.</>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, padding: mobile ? `14px ${pad}px calc(18px + env(safe-area-inset-bottom,0px))` : `20px ${pad}px 26px`, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, color: T.sub, marginRight: "auto", cursor: "pointer", minHeight: 40, ...(mobile ? { width: "100%" } : {}) }}><input type="checkbox" checked={noToday} onChange={(e) => setNoToday(e.target.checked)} style={{ width: 20, height: 20, accentColor: EX.gold }} data-testid="brief-notoday" />오늘 하루 보지 않기</label>
          <button type="button" onClick={() => onClose("later", noToday)} style={{ flex: mobile ? "1 1 0" : "none", height: 50, padding: "0 22px", borderRadius: 14, border: `1px solid ${T.line}`, fontSize: 15, fontWeight: 800, color: T.sub, background: "rgba(255,255,255,.05)", cursor: "pointer" }}>나중에 보기</button>
          <button type="button" data-testid="brief-open" onClick={() => onClose("open", true)} style={{ flex: mobile ? "2 1 0" : "none", height: 50, padding: "0 26px", borderRadius: 14, background: GOLD_GRAD, color: "#1A1408", fontSize: 15, fontWeight: 900, border: 0, cursor: "pointer", boxShadow: "0 8px 22px rgba(215,188,130,.25)" }}>전체 보고서 보기 →</button>
        </div>
      </div>
    </div>
  );
}

// 📈 2026-11-08 경영 분석·결재 대기·직원 정보(ExecAnalytics.jsx · ExecStaffInfo.jsx)가 같은 부품·글자 크기·색을 쓴다
export { Delta, Chg, ManDiff, Card, Measure, Svg, Seg, Legend, useWidth, CSS as EBX_CSS, useQueryRows as useEbxQuery };
