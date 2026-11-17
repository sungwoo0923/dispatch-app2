// ======================= src/ExecAnalytics.jsx =======================
// 📈 2026-11-08 임원 화면 새 메뉴 — 경영 분석(손익 · 거래처 · 기사·차량 · 단가 · 현금흐름 · 영업 · 사업계획) · 결재 대기
// 👑 2026-11-17 임원 디자인 시스템(src/execUi.jsx — 깊은 남색 + 골드)으로 전면 개편
//  · 구성: 결론 한 줄(Brief) → 핵심 숫자 타일 → 근거 그래프(recharts · 마우스를 올리면 값) → 세부 표
//  · 금액 표기: 핵심 숫자 타일은 자동(억 · 만원), 패널 안 그래프 · 표 · 목록은 "만원" 하나로 · 문장은 "2억 6,310만원"
//  · 이익 · 이익률 · 증감 색: 플러스(오름) 빨강 · 마이너스(내림) 파랑 — 앱 전체 규칙
//  · 보는 사람: 기존 임원 판정 그대로(PC isExec · 모바일 isExecM → 임원 화면 메뉴에서만 연다)
//  · 데이터(모두 읽기만, 임원 역할이 이미 읽을 수 있는 컬렉션):
//    오더 = 매출관리와 같은 salesDispatchData(+ 화면이 열릴 때 지난 13개월을 loadRange로 불러옴) · 차량 = drivers(등급 지입·직영·임대)
//    장부 = acctLedger · 고정비 = acctRecurring · 자금 = acctFunds(computeFunds) · 수금 = acctPayments · 결재 = approvals(회사 전체: isCompanyAdmin에 임원 역할 포함)
//  · 계산은 src/execAnalyticsCore.js(순수 함수 — 바꾸지 않음) · 이 화면 전용 부품은 src/execAnalyticsUi.jsx
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, Cell, LabelList, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, LineChart, Line, ComposedChart, Area, ScatterChart, Scatter, ZAxis } from "recharts";
import { db, auth } from "./firebase";
import { useOrderHistory } from "./orderHistory";
import { useCompanyRows } from "./companyColStore";
import { loadAcctPayments } from "./acctPayments";
import { computeFunds, isCredit } from "./fundsCalc";
import { isDemoOn } from "./devDemoData";
import { execAnalyticsDemo } from "./execAnalyticsDemo";
import { myTurn, useApprovals, ApprovalDocPreview } from "./Approval";
import { addDay, kstToday, md, dateOf, toWon, isBizDay, rangeDays, dayDiff, mdDow } from "./dailyReportCore";
import { plMonthly, receivables, dsoOf, clientTable, vehicleTable, priceWatch, cashForecast, salesTrend, liveRows, fleetIndex, monthsBack, ymOf, ymLabel, COGS_ACCOUNTS } from "./execAnalyticsCore";
import { planExecution, planStatus } from "./bizPlan"; // 📑 2026-11-08 사업계획 탭
import { bizPlanDemo } from "./bizPlanDemo";
import { EX, EX_NUM, GOLD_GRAD, ExecPage, ExecPanel, Kpi, ExecKpis, ExecGrid, ExecTabs, ExecButton, Delta, Meter, Ring, RankBars, ExecTable, Chip, Empty, chartTheme, Legend, fmtMoney, fmtEokMan, pctChange, useBoxWidth } from "./execUi";
import { mn, cm, pct, pc, Brief, B, Toolbar, Basis, SubHead, MiniStat, TipBox, SortTable, Modal, Paper } from "./execAnalyticsUi";
// ⚠ 아래 두 줄은 직원 정보(src/ExecStaffInfo.jsx)가 아직 쓰는 옛 틀 ExecShell 전용 — 경영 분석 · 결재 대기 화면은 쓰지 않는다
import { C } from "./dailyReportCharts";
import { EBX_CSS, useWidth } from "./DailyReport";

const demoOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
const dot = (d) => String(d || "").replace(/-/g, ".");
const ymKo = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
const locale = (v) => (Number.isFinite(v) ? `${v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("ko-KR")}` : "");
const AX = chartTheme.axis;
const TICK = AX.tick;
const VIOLET = EX.series[3];

// ─────────────────────────── 옛 틀(직원 정보 화면 호환용) ───────────────────────────
const EXTRA = `
.ebx .exa-tbl{width:100%;border-collapse:collapse;font-size:16px}
.ebx .exa-tbl th{font-size:15px;font-weight:700;color:${C.t2};text-align:left;padding:12px 12px;border-bottom:1px solid ${C.line};white-space:nowrap;background:#F8FAFD;position:sticky;top:0}
.ebx .exa-tbl th.num,.ebx .exa-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
.ebx .exa-tbl th button{all:unset;cursor:pointer;display:inline-flex;gap:4px;align-items:center}
.ebx .exa-tbl th button:focus-visible{outline:2px solid ${C.n3};outline-offset:2px;border-radius:4px}
.ebx .exa-tbl td{padding:13px 12px;border-bottom:1px solid ${C.grid};white-space:nowrap}
.ebx .exa-tbl tbody tr.click{cursor:pointer}
.ebx .exa-tbl tbody tr.click:hover{background:#F5F8FD}
.ebx .exa-tbl tbody tr.on{background:#EEF3FC}
.ebx .exa-mcard{border-top:1px solid ${C.grid};padding:14px 2px;display:block;width:100%;text-align:left;background:none;border-left:0;border-right:0;border-bottom:0;font:inherit;color:inherit}
.ebx .exa-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;margin-top:8px;font-size:15px}
.ebx .exa-kv span{color:${C.t2}}
.ebx .exa-tag{display:inline-flex;align-items:center;font-size:14px;font-weight:700;padding:2px 9px;border-radius:8px;border:1.5px solid #D5DBE5;color:${C.t2};white-space:nowrap}
.ebx .exa-tag.hi{border-color:${C.up};color:${C.up}}
.ebx .exa-tag.mid{border-color:${C.amber};color:${C.amber}}
.ebx .exa-tag.lo{border-color:${C.down};color:${C.down}}
.ebx .exa-bar{height:10px;border-radius:99px;background:#E8EDF5;overflow:hidden}
.ebx .exa-bar i{display:block;height:100%;border-radius:99px;background:${C.n3}}
.ebx .exa-open{height:42px;padding:0 16px;border-radius:10px;border:1px solid ${C.n3};background:#fff;color:${C.n3};font-size:15px;font-weight:800;cursor:pointer;white-space:nowrap}
.ebx .exa-open:hover{background:#F0F5FD}
`;

// 직원 정보(ExecStaffInfo)가 import 하는 옛 틀 — 담당자가 옮기면 지워도 된다
export function ExecShell({ en, title, sub, right, children, testId }) {
  const ref = React.useRef(null);
  const W = useWidth(ref);
  const compact = W > 0 && W < 760;
  const gutter = compact ? 16 : W < 1280 ? 24 : W >= 1760 ? 48 : 36;
  const inner = { maxWidth: 2400, margin: "0 auto", padding: `0 ${gutter}px` };
  return (
    <div ref={ref} className="ebx" data-testid={testId} style={{ borderRadius: compact ? 0 : 20, overflow: "hidden", minWidth: 0, minHeight: 400 }}>
      <style>{EBX_CSS + EXTRA}</style>
      <div style={{ background: `linear-gradient(135deg,${C.n0} 0%,${C.n1} 45%,${C.n2} 100%)`, color: "#fff", padding: compact ? "22px 0 22px" : "30px 0 30px" }}>
        <div style={inner}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.18em", color: C.sky }}>{en}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: compact ? 28 : 36, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, color: "#fff" }}>{title}</h1>
              {sub && <p style={{ marginTop: 8, fontSize: compact ? 16 : 17, color: "#C9D4EA", wordBreak: "keep-all" }}>{sub}</p>}
            </div>
            {right}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 2400, margin: "0 auto", padding: `${compact ? 16 : 24}px ${gutter}px 40px`, display: "grid", gap: compact ? 14 : 20 }}>
        {W > 0 && children({ W, compact, wide: W >= 1280, xl: W >= 1760 })}
      </div>
    </div>
  );
}
// ─────────────────────────── 데이터 ───────────────────────────
function useExecData({ company, dispatchData, drivers, loadRange: lrProp, months = 13, cash = false }) {
  const demo = demoOn() ? execAnalyticsDemo(company) : null;
  const today = kstToday();
  const { loadRange: ctx } = useOrderHistory() || {};
  const loadRange = lrProp || ctx;
  const from = `${monthsBack(today.slice(0, 7), months)[0]}-01`;
  React.useEffect(() => { if (!demo && loadRange) loadRange(from, today); }, [demo, loadRange, from, today]);
  const co = demo ? "" : company;
  const ledgerLive = useCompanyRows("acctLedger", co);
  const recurLive = useCompanyRows("acctRecurring", co);
  const fundsLive = useCompanyRows("acctFunds", cash ? co : "");
  const fixedLive = useCompanyRows("fixedClients", co); // ⭐ 2026-11-07 고정거래처도 미수금에(회계관리와 같게)
  const [arPay, setArPay] = React.useState(null);
  React.useEffect(() => {
    if (demo) { setArPay(demo.arPayments); return undefined; }
    if (!company) return undefined;
    let alive = true;
    loadAcctPayments(db, Number(today.slice(0, 4)), company).then((d) => { if (alive) setArPay(d.ar || {}); }).catch(() => { if (alive) setArPay(null); });
    return () => { alive = false; };
  }, [demo, company, today]);
  const rows = React.useMemo(() => liveRows(demo ? demo.rows : dispatchData), [demo, dispatchData]);
  const drv = demo ? demo.drivers : drivers;
  const fleet = React.useMemo(() => fleetIndex(drv), [drv]);
  return { demo, today, rows, fleet, ledger: demo ? demo.ledger : ledgerLive || [], recurring: demo ? demo.recurring : recurLive || [], funds: demo ? demo.funds : fundsLive || [], arPay, fixedRows: demo ? [] : fixedLive || [] };
}

// ─────────────────────────── 경영 분석(탭) ───────────────────────────
export const ANALYSIS_TABS = [["pl", "손익"], ["client", "거래처"], ["fleet", "기사·차량"], ["price", "단가"], ["cash", "현금흐름"], ["sales", "영업"], ["plan", "사업계획"]];
export default function ExecAnalysis({ company, dispatchData = [], drivers = [], loadRange, initialTab, canCash = false }) {
  // ⭐ 2026-11-08 현금흐름(자금 잔액)은 대표 직책만 — 자금현황 메뉴와 같은 기준
  const tabs = canCash ? ANALYSIS_TABS : ANALYSIS_TABS.filter(([k]) => k !== "cash");
  const [tab0, setTab] = React.useState(() => { try { return initialTab || sessionStorage.getItem("kpExecAnaTab") || "pl"; } catch { return initialTab || "pl"; } });
  const tab = tabs.some(([k]) => k === tab0) ? tab0 : "pl";
  const go = (k) => { setTab(k); try { sessionStorage.setItem("kpExecAnaTab", k); } catch { /* 무시 */ } };
  const data = useExecData({ company, dispatchData, drivers, loadRange, cash: canCash });
  const [ref, W] = useBoxWidth(1200);
  const v = { W, compact: W < 640, wide: W >= 1100 };
  return (
    <ExecPage testId="exec-analysis" en="MANAGEMENT ANALYTICS" title="경영 분석"
      sub={`${company ? `${company} · ` : ""}오더 · 장부 · 자금 기준 · ${mdDow(data.today)} 현재`}
      right={<div data-testid="exa-tabs" className="max-w-full min-w-0">{/* 📱 휴대폰에서는 옆으로 밀어서 보기 */}<ExecTabs items={tabs} value={tab} onChange={go} /></div>}>
      <div ref={ref} className="min-w-0 space-y-4 md:space-y-5">
        {tab === "pl" ? <PlTab {...data} {...v} />
          : tab === "client" ? <ClientTab {...data} {...v} />
            : tab === "fleet" ? <FleetTab {...data} {...v} />
              : tab === "price" ? <PriceTab {...data} {...v} />
                : tab === "cash" && canCash ? <CashTab {...data} {...v} />
                  : tab === "plan" ? <PlanTab company={company} demo={!!data.demo} today={data.today} {...v} />
                    : <SalesTab {...data} {...v} />}
      </div>
    </ExecPage>
  );
}

// 그래프 x축 글씨(선택한 칸은 골드)
const monthTick = (selK) => function MonthTick({ x, y, payload }) {
  const on = payload.value === selK;
  return <text x={x} y={y + 14} textAnchor="middle" fontSize={11.5} fontWeight={on ? 900 : 600} fill={on ? EX.goldHi : TICK.fill} style={EX_NUM}>{payload.value}</text>;
};
const GradDefs = () => (
  <defs>
    <linearGradient id="exaGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F1DDAE" /><stop offset="100%" stopColor="#A8874A" /></linearGradient>
    <linearGradient id="exaIce" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8FB0F0" stopOpacity=".5" /><stop offset="100%" stopColor="#8FB0F0" stopOpacity=".16" /></linearGradient>
    <linearGradient id="exaGoldArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D7BC82" stopOpacity=".32" /><stop offset="100%" stopColor="#D7BC82" stopOpacity="0" /></linearGradient>
    <linearGradient id="exaIceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8FB0F0" stopOpacity=".28" /><stop offset="100%" stopColor="#8FB0F0" stopOpacity="0" /></linearGradient>
  </defs>
);
const clickIdx = (s) => { const i = Number(s?.activeTooltipIndex ?? s?.activeIndex); return Number.isFinite(i) ? i : null; };
const PERIODS = [["30", "최근 30일"], ["90", "최근 3개월"], ["365", "최근 12개월"]];
const PERIOD_L = { 30: "최근 30일", 90: "최근 3개월", 365: "최근 12개월" };
function periodOf(today, k) { const n = Number(k); const to = today; const from = addDay(today, -(n - 1)); return { from, to, pFrom: addDay(from, -n), pTo: addDay(from, -1), n }; }

// ═════════════════════════ 손익 ═════════════════════════
function PlTab({ rows, fleet, ledger, recurring, today, compact }) {
  const months = React.useMemo(() => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return monthsBack(d.toISOString().slice(0, 7), 12); }, [today]); // 마감된 12개월(이번 달은 진행 중이라 뺌)
  const pl = React.useMemo(() => plMonthly({ rows, fleet, ledger, recurring, months }), [rows, fleet, ledger, recurring, months]);
  const [sel, setSel] = React.useState(months.length - 1); // 지난달(마감된 달)
  const cur = pl[sel] || pl[pl.length - 1]; const prev = pl[sel - 1];
  const M = Number(cur.m.slice(5, 7));
  const ltm = pl.reduce((a, m) => ({ sale: a.sale + m.sale, op: a.op + m.op, gross: a.gross + m.gross }), { sale: 0, op: 0, gross: 0 });
  const dSale = prev ? pctChange(cur.sale, prev.sale) : null;
  const chart = pl.map((m, i) => ({ k: ymLabel(m.m), i, sale: Math.round(m.sale / 1e4), op: Math.round(m.op / 1e4), gm: m.sale ? Number(m.gm.toFixed(1)) : null, om: m.sale ? Number(m.om.toFixed(1)) : null, raw: m }));
  const hasData = pl.some((m) => m.sale > 0);
  if (!hasData) return <ExecPanel en="PROFIT & LOSS" title="손익"><Empty text="최근 12개월에 마감된 오더가 없습니다" sub="배차가 쌓이면 월별 매출 · 영업이익이 이곳에 정리됩니다." /></ExecPanel>;
  return (<>
    <Brief basis={`${ymKo(cur.m)} 마감 · 상차일 기준`}>
      {M}월 매출은 <B>{fmtEokMan(cur.sale)}</B>
      {dSale != null ? <>으로 전월보다 <B color={dSale >= 0 ? EX.up : EX.down}>{Math.abs(dSale).toFixed(1)}% {dSale >= 0 ? "늘었" : "줄었"}</B>고, </> : "이고, "}
      영업{cur.op < 0 ? "손실" : "이익"}은 <B color={pc(cur.op)}>{fmtEokMan(Math.abs(cur.op))}</B>(이익률 {pct(cur.om)})입니다.
      {" "}최근 12개월 누적 매출은 <B>{fmtEokMan(ltm.sale)}</B>입니다.
    </Brief>
    <ExecKpis min={196}>
      <Kpi accent en="REVENUE" label={`${M}월 매출`} money={cur.sale} delta={dSale ?? undefined} deltaLabel="전월 대비" spark={pl.map((m) => m.sale)} />
      <Kpi en="COST OF SALES" label="매입(운임)" money={cur.cost} delta={prev ? pctChange(cur.cost, prev.cost) : undefined} deltaLabel="전월 대비" invert foot={`용차 비중 ${cur.cost ? Math.round((cur.hire / cur.cost) * 100) : 0}%`} />
      <Kpi en="SG&A" label="판관비" money={cur.sgaTotal} delta={prev ? pctChange(cur.sgaTotal, prev.sgaTotal) : undefined} deltaLabel="전월 대비" invert foot={cur.est ? "고정비로 추정" : "장부 기준"} />
      <Kpi en="OPERATING PROFIT" label="영업이익" money={cur.op} foot={<span className="inline-flex items-center gap-2">이익률 <b style={{ ...EX_NUM, color: pc(cur.om) }}>{pct(cur.om)}</b>{prev && <Delta v={cur.om - prev.om} suffix="%p" size={12} />}</span>} spark={pl.map((m) => m.op)} />
      <Kpi en="LAST 12 MONTHS" label="최근 12개월 매출" money={ltm.sale} foot={<span>영업이익 <b style={{ ...EX_NUM, color: pc(ltm.op) }}>{fmtMoney(ltm.op)}</b> · {pct(ltm.sale ? (ltm.op / ltm.sale) * 100 : 0)}</span>} />
    </ExecKpis>
    <ExecGrid cols="minmax(0,1.55fr) minmax(0,1fr)">
      <ExecPanel en="MONTHLY P&L" title="월별 손익 추이" sub="마감된 최근 12개월 · 단위 만원 · 막대를 누르면 그달 구성을 봅니다"
        right={!compact && <Legend items={[["매출(선택한 달)", EX.gold], ["영업이익 +", EX.up], ["영업이익 −", EX.down]]} />}>
        <PlChart data={chart} sel={sel} setSel={setSel} compact={compact} />
        <Basis>매출 = 청구운임 · 매입 = 기사운임(소속 차량은 기사 운임, 그 외 용차) + 지게차 · 외부 특수운임(회사가 따로 지급) · 판관비 = 장부 지출에서 운송 원가 계정({COGS_ACCOUNTS.slice(0, 3).join(" · ")} 등)을 뺀 금액 · 장부가 없는 달은 고정비로 추정 · 진행 중인 이번 달은 넣지 않았습니다.</Basis>
      </ExecPanel>
      <PlStructure cur={cur} M={M} compact={compact} />
    </ExecGrid>
    <ExecPanel en="MARGIN TREND" title="이익률 추이" sub="매출총이익률(매출 − 매입) · 영업이익률(매출총이익 − 판관비) · 마감된 최근 12개월"
      right={<Legend items={[["매출총이익률", EX.gold, "line"], ["영업이익률", EX.ice, "line"]]} />}>
      <MarginChart data={chart} compact={compact} selK={chart[sel]?.k} />
    </ExecPanel>
  </>);
}
function PlChart({ data, sel, setSel, compact }) {
  const selK = data[sel]?.k;
  const onClick = (s) => { const i = clickIdx(s); if (i != null) setSel(i); };
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null; const m = payload[0].payload.raw;
    return <TipBox title={ymKo(m.m)} rows={[["매출", EX.gold, `${mn(m.sale)}만원`], ["매입", EX.ice, `${mn(m.cost)}만원`], ["판관비", VIOLET, `${mn(m.sgaTotal)}만원${m.est ? " · 추정" : ""}`], ["영업이익", pc(m.op), `${mn(m.op)}만원`, pc(m.op)], ["영업이익률", null, pct(m.om), pc(m.om)]]} foot="누르면 그달 손익 구조를 봅니다" />;
  };
  const tick = monthTick(selK);
  return (
    <div className="select-none mt-1">
      <div className="text-[12px] font-extrabold" style={{ color: EX.sub }}>매출</div>
      <ResponsiveContainer width="100%" height={compact ? 180 : 230}>
        <BarChart data={data} syncId="exa-pl" margin={{ top: 24, right: 6, left: 0, bottom: 0 }} onClick={onClick} barCategoryGap="24%">
          <GradDefs />
          <CartesianGrid {...chartTheme.grid} />
          <XAxis dataKey="k" hide />
          <YAxis {...AX} width={58} tickFormatter={locale} tickCount={4} />
          <Tooltip content={<Tip />} cursor={chartTheme.cursor} />
          <Bar dataKey="sale" radius={[6, 6, 0, 0]} maxBarSize={42} style={{ cursor: "pointer" }} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.k + i} fill={i === sel ? "url(#exaGold)" : "url(#exaIce)"} />)}
            <LabelList dataKey="sale" content={(p) => (p.index === sel ? <text x={p.x + p.width / 2} y={p.y - 8} textAnchor="middle" fontSize={12.5} fontWeight={900} fill={EX.goldHi} style={EX_NUM}>{locale(p.value)}</text> : null)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 text-[12px] font-extrabold" style={{ color: EX.sub }}>영업이익</div>
      <ResponsiveContainer width="100%" height={compact ? 140 : 160}>
        <BarChart data={data} syncId="exa-pl" margin={{ top: 20, right: 6, left: 0, bottom: 0 }} onClick={onClick} barCategoryGap="24%">
          <CartesianGrid {...chartTheme.grid} />
          <XAxis dataKey="k" {...AX} tick={tick} interval={compact ? 1 : 0} height={26} />
          <YAxis {...AX} width={58} tickFormatter={locale} tickCount={3} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,.22)" />
          <Tooltip content={() => null} cursor={chartTheme.cursor} />
          <Bar dataKey="op" radius={[3, 3, 3, 3]} maxBarSize={42} style={{ cursor: "pointer" }} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.k + i} fill={d.op >= 0 ? EX.up : EX.down} fillOpacity={i === sel ? 0.95 : 0.4} />)}
            <LabelList dataKey="op" content={(p) => {
              if (compact && p.index !== sel) return null;
              const top = Math.min(p.y, p.y + p.height), bot = Math.max(p.y, p.y + p.height); const on = p.index === sel;
              return <text x={p.x + p.width / 2} y={p.value >= 0 ? top - 6 : bot + 13} textAnchor="middle" fontSize={on ? 12.5 : 11} fontWeight={on ? 900 : 700} fill={pc(p.value)} fillOpacity={on ? 1 : 0.75} style={EX_NUM}>{locale(p.value)}</text>;
            }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function PlStructure({ cur, M, compact }) {
  const sale = cur.sale || 0;
  const share = (v) => (sale ? (v / sale) * 100 : 0);
  const items = [{ key: "own", label: "기사 운임(소속 차량)", value: cur.own, g: "매입" }, { key: "hire", label: "용차 운임", value: cur.hire, g: "매입" }, { key: "paid", label: "지게차 · 외부 지급", value: cur.paid, g: "매입" },
    ...Object.entries(cur.sga).map(([k, v]) => ({ key: `s-${k}`, label: k, value: v, g: "판관비" }))].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const TOP = 8; const rest = items.slice(TOP);
  const list = rest.length ? [...items.slice(0, TOP), { key: "rest", label: `그 밖의 판관비 ${rest.length}개 항목`, value: rest.reduce((s, x) => s + x.value, 0), g: "판관비" }] : items;
  const mx = Math.max(1, ...list.map((x) => x.value));
  // 매출 100% 막대 — 매입 · 판관비 · 영업이익
  const segs = [["매입", cur.cost, EX.ice], ["판관비", cur.sgaTotal, VIOLET], ["영업이익", Math.max(0, cur.op), EX.gold]];
  const segSum = segs.reduce((s, x) => s + x[1], 0) || 1;
  const stmt = [["매출", cur.sale, 100, "", EX.text], ["매입(운임)", -cur.cost, share(cur.cost), "−", EX.sub], ["매출총이익", cur.gross, cur.gm, "=", EX.text], ["판관비", -cur.sgaTotal, share(cur.sgaTotal), "−", EX.sub]];
  return (
    <ExecPanel en="COST STRUCTURE" title={`${M}월 손익 구조`} sub={`매출 대비 비중 · 단위 만원${cur.est ? " · 판관비는 고정비로 추정" : ""}`}>
      <div className="flex h-3 w-full overflow-hidden rounded-full gap-[2px] mt-1" role="img" aria-label="매출 구성">
        {segs.filter((s) => s[1] > 0).map(([l, v, c]) => <div key={l} title={`${l} ${pct((v / segSum) * 100)}`} style={{ width: `${(v / segSum) * 100}%`, background: c === EX.gold ? GOLD_GRAD : c }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segs.map(([l, v, c]) => <span key={l} className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: EX.sub }}><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} />{l} <b style={{ ...EX_NUM, color: EX.text }}>{pct(share(l === "영업이익" ? cur.op : v))}</b></span>)}
      </div>
      <div className="mt-4">
        {stmt.map(([l, v, p, sign, c]) => (
          <div key={l} className="flex items-baseline justify-between gap-3 py-[7px]" style={{ borderTop: sign === "=" ? `1px solid ${EX.line}` : 0 }}>
            <span className="text-[13.5px] font-bold" style={{ color: c }}><span className="inline-block w-4" style={{ color: EX.faint }}>{sign}</span>{l}</span>
            <span className="flex items-baseline gap-3" style={EX_NUM}><b className="text-[14.5px] font-black" style={{ color: c }}>{mn(Math.abs(v))}</b><span className="w-[52px] text-right text-[12px] font-bold" style={{ color: EX.mute }}>{pct(p)}</span></span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 pt-3 mt-1" style={{ borderTop: `1px solid ${EX.lineHi}` }}>
          <span className="text-[14.5px] font-black" style={{ color: EX.goldHi }}><span className="inline-block w-4" style={{ color: EX.gold }}>=</span>영업{cur.op < 0 ? "손실" : "이익"}</span>
          <span className="flex items-baseline gap-3" style={EX_NUM}><b className="text-[20px] font-black" style={{ color: pc(cur.op) }}>{mn(cur.op)}</b><span className="w-[52px] text-right text-[12.5px] font-extrabold" style={{ color: pc(cur.om) }}>{pct(cur.om)}</span></span>
        </div>
      </div>
      <SubHead right="금액 · 매출 대비">비용 항목 순위</SubHead>
      <ol className="space-y-2">
        {list.map((x, i) => (
          <li key={x.key} className="grid items-center gap-3" style={{ gridTemplateColumns: compact ? "minmax(0,1fr) auto" : "minmax(0,150px) minmax(0,1fr) 64px 46px" }}>
            <span className="flex items-center gap-2 min-w-0 text-[13px] font-bold" style={{ color: i < 3 ? EX.text : EX.sub }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: x.g === "매입" ? EX.ice : VIOLET }} /><span className="truncate">{x.label}</span>
            </span>
            {!compact && <Meter value={x.value} max={mx} color={x.g === "매입" ? EX.ice : VIOLET} height={5} />}
            <span className="text-right text-[13.5px] font-black" style={{ ...EX_NUM, color: EX.text }}>{mn(x.value)}{compact && <span className="ml-2 text-[12px] font-bold" style={{ color: EX.mute }}>{pct(share(x.value))}</span>}</span>
            {!compact && <span className="text-right text-[12px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{pct(share(x.value))}</span>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-4 text-[11.5px] font-bold" style={{ color: EX.mute }}><span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: EX.ice }} />매입</span><span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: VIOLET }} />판관비</span></div>
    </ExecPanel>
  );
}
function MarginChart({ data, compact, selK }) {
  const n = data.length; const last = data[n - 1] || {};
  const close = last.gm != null && last.om != null && Math.abs(last.gm - last.om) < 2.5;
  const end = (name, color, dy = 0) => function EndLabel(p) {
    if (compact || p.index !== n - 1 || p.value == null) return null;
    return <text x={p.x + 12} y={p.y + 4 + dy} fontSize={12} fontWeight={800} fill={EX.text} style={EX_NUM}><tspan fill={color}>●</tspan> {name} {pct(p.value)}</text>;
  };
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null; const d = payload[0].payload;
    return <TipBox title={ymKo(d.raw.m)} rows={[["매출총이익률", EX.gold, pct(d.gm), pc(d.gm)], ["영업이익률", EX.ice, pct(d.om), pc(d.om)]]} />;
  };
  return (
    <ResponsiveContainer width="100%" height={compact ? 220 : 260}>
      <LineChart data={data} margin={{ top: 16, right: compact ? 12 : 138, left: 0, bottom: 0 }}>
        <CartesianGrid {...chartTheme.grid} />
        <XAxis dataKey="k" {...AX} tick={monthTick(selK)} interval={compact ? 1 : 0} height={26} />
        <YAxis {...AX} width={46} tickFormatter={(v) => `${v}%`} tickCount={5} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,.25)" />
        <Tooltip content={<Tip />} cursor={{ stroke: "rgba(215,188,130,.35)", strokeDasharray: "3 4" }} />
        <Line dataKey="gm" name="매출총이익률" stroke={EX.gold} strokeWidth={2.2} dot={{ r: 2.5, fill: EX.bg1, stroke: EX.gold, strokeWidth: 1.6 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false}>
          <LabelList dataKey="gm" content={end("매출총이익률", EX.gold, close ? -8 : 0)} />
        </Line>
        <Line dataKey="om" name="영업이익률" stroke={EX.ice} strokeWidth={2.2} dot={{ r: 2.5, fill: EX.bg1, stroke: EX.ice, strokeWidth: 1.6 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false}>
          <LabelList dataKey="om" content={end("영업이익률", EX.ice, close ? 8 : 0)} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

// ═════════════════════════ 거래처 ═════════════════════════
const RiskChip = ({ v }) => <Chip tone={v === "높음" ? "up" : v === "주의" ? "warn" : "mute"}>{v}</Chip>;
const AGE_B = [["30일 이내", 0, 30], ["31~60일", 31, 60], ["61~90일", 61, 90], ["90일 넘음", 91, Infinity]];
const AGE_C = [EX.ice, EX.warn, "#F29A6B", EX.danger];
const ageBuckets = (open = []) => AGE_B.map(([l, a, b]) => [l, open.filter((o) => o.age >= a && o.age <= b).reduce((s, o) => s + o.amt, 0)]);
function ClientTab({ rows, arPay, today, W, compact, fixedRows = [] }) {
  const wide = W >= 1100;
  const [pk, setPk] = React.useState("90");
  const P = periodOf(today, pk);
  const rec = React.useMemo(() => receivables(rows, arPay, today, fixedRows), [rows, arPay, today, fixedRows]);
  const list = React.useMemo(() => clientTable(rows, P.from, P.to, P.pFrom, P.pTo, rec), [rows, P.from, P.to, P.pFrom, P.pTo, rec]);
  const [sort, setSort] = React.useState({ k: "sale", dir: "desc" });
  const [sel, setSel] = React.useState(null);
  const tot = list.reduce((a, c) => ({ sale: a.sale + c.sale, profit: a.profit + c.profit, pSale: a.pSale + c.pSale }), { sale: 0, profit: 0, pSale: 0 });
  // 미수는 기간과 상관없이 지금 남아 있는 금액(거래처 전체)
  const arAll = Object.entries(rec).map(([n, r]) => ({ n, ...r }));
  const out = arAll.reduce((s, r) => s + r.outstanding, 0); const o30 = arAll.reduce((s, r) => s + r.over30, 0);
  const bySale = [...list].sort((a, b) => b.sale - a.sale);
  const top5 = bySale.slice(0, 5).reduce((s, c) => s + c.sale, 0); const top5Share = tot.sale ? (top5 / tot.sale) * 100 : 0;
  let cum = 0; const abc = { A: { n: 0, sale: 0 }, B: { n: 0, sale: 0 }, C: { n: 0, sale: 0 } };
  bySale.forEach((c) => { const before = tot.sale ? cum / tot.sale : 1; cum += c.sale; const g = before < 0.8 ? "A" : before < 0.95 ? "B" : "C"; abc[g].n += 1; abc[g].sale += c.sale; });
  const hi = list.filter((c) => c.risk === "높음").length;
  const cur = list.find((c) => c.n === sel) || null;
  const cols = [
    { k: "n", l: "거래처", cell: (r) => <span className="font-extrabold">{r.n}</span> },
    { k: "sale", l: "매출(만원)", short: "매출", num: true, cell: (r) => mn(r.sale) },
    { k: "profit", l: "이익(만원)", short: "이익", num: true, cell: (r) => <span style={{ color: pc(r.profit) }}>{mn(r.profit)}</span> },
    { k: "margin", l: "이익률", num: true, cell: (r) => <span style={{ color: pc(r.margin) }}>{pct(r.margin)}</span> },
    { k: "avg", l: "평균 단가(만원)", short: "평균 단가", num: true, cell: (r) => mn(r.avg) },
    { k: "cnt", l: "건수", num: true, cell: (r) => `${r.cnt.toLocaleString("ko-KR")}건` },
    { k: "dSale", l: "매출 증감", short: "증감", num: true, get: (r) => r.dSale ?? -999, cell: (r) => (r.dSale == null ? <Chip tone="gold">신규</Chip> : <Delta v={r.dSale} size={12.5} />) },
    { k: "avgAge", l: "평균 미수일", short: "미수일", num: true, get: (r) => r.ar.avgAge, cell: (r) => (r.ar.outstanding ? `${Math.round(r.ar.avgAge)}일` : "—") },
    { k: "over30", l: "30일+ 미수(만원)", short: "30일+ 미수", num: true, get: (r) => r.ar.over30, cell: (r) => (r.ar.over30 ? <span style={{ color: EX.warn }}>{mn(r.ar.over30)}</span> : "—") },
    { k: "risk", l: "입금 지연 위험", short: "위험", get: (r) => ({ 높음: 2, 주의: 1, 정상: 0 }[r.risk]), cell: (r) => <RiskChip v={r.risk} /> },
  ];
  const aging = ageBuckets(arAll.flatMap((r) => r.open || []));
  const agingMax = Math.max(1, ...aging.map((x) => x[1]));
  const overdue = arAll.filter((r) => r.over30 > 0).sort((a, b) => b.over30 - a.over30).slice(0, 5);
  return (<>
    <Toolbar basis={`${dot(P.from).slice(5)} ~ ${dot(P.to).slice(5)} · 증감은 바로 앞 같은 기간 대비`}><ExecTabs size="sm" items={PERIODS} value={pk} onChange={setPk} /></Toolbar>
    {!list.length ? <ExecPanel title="거래처 수익성"><Empty text="이 기간에 오더가 없습니다" sub="기간을 늘려 보세요." /></ExecPanel> : <>
      <Brief basis="취소 · 전송 제외 오더 · 상차일 기준">
        {PERIOD_L[pk]} 거래처 <B>{list.length}곳</B>에서 매출 <B>{fmtEokMan(tot.sale)}</B>(이익률 {pct(tot.sale ? (tot.profit / tot.sale) * 100 : 0)})을 올렸습니다.
        {" "}상위 5곳이 매출의 <B>{top5Share.toFixed(0)}%</B>를 차지하며,{" "}
        {!arPay ? "수금 기록이 없어 미수금은 계산하지 않았습니다." : o30 ? <>30일 넘게 받지 못한 미수가 <B color={EX.warn}>{fmtEokMan(o30)}</B> 있습니다.</> : "30일 넘은 미수는 없습니다."}
      </Brief>
      <ExecKpis min={196}>
        <Kpi accent en="REVENUE" label={`${PERIOD_L[pk]} 매출`} money={tot.sale} delta={tot.pSale ? pctChange(tot.sale, tot.pSale) : undefined} deltaLabel="직전 대비" />
        <Kpi en="GROSS PROFIT" label="이익(매출 − 매입)" money={tot.profit} foot={<span>이익률 <b style={{ ...EX_NUM, color: pc(tot.profit) }}>{pct(tot.sale ? (tot.profit / tot.sale) * 100 : 0)}</b></span>} />
        <Kpi en="CLIENTS" label="거래처" value={list.length.toLocaleString("ko-KR")} unit="곳" foot={`상위 5곳 비중 ${top5Share.toFixed(0)}%`} />
        <Kpi en="RECEIVABLES" label="미수금" money={out} foot={arPay ? "올해 청구(부가세 포함) − 수금" : "수금 기록 없음"} />
        <Kpi en="OVER 30 DAYS" label="30일 넘은 미수" money={o30} foot={`입금 지연 위험 높음 ${hi}곳`} />
      </ExecKpis>
      <ExecGrid cols="minmax(0,1fr) minmax(0,1fr)">
        <ExecPanel en="CONCENTRATION" title="매출 집중도" sub={`${PERIOD_L[pk]} · 매출 큰 순 누적 · 단위 만원`}>
          <div className="flex h-3.5 w-full overflow-hidden rounded-full gap-[2px]">
            {[["A", EX.gold], ["B", EX.ice], ["C", "rgba(232,238,250,.28)"]].filter(([g]) => abc[g].sale > 0).map(([g, c]) => <div key={g} style={{ width: `${(abc[g].sale / (tot.sale || 1)) * 100}%`, background: g === "A" ? GOLD_GRAD : c }} />)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[["A", "핵심", "매출 80%까지", EX.gold], ["B", "중요", "다음 15%", EX.ice], ["C", "일반", "나머지 5%", EX.sub]].map(([g, l, s, c]) => (
              <div key={g} className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${EX.line}` }}>
                <div className="text-[11.5px] font-extrabold" style={{ color: c }}>{g} · {l}</div>
                <div className="mt-0.5 flex items-baseline gap-1" style={EX_NUM}><b className="text-[19px] font-black" style={{ color: EX.text }}>{abc[g].n}</b><span className="text-[12px] font-bold" style={{ color: EX.mute }}>곳</span></div>
                <div className="text-[11.5px] font-semibold" style={{ color: EX.mute }}>{s}</div>
              </div>
            ))}
          </div>
          <SubHead right="매출 · 비중">매출 상위 거래처</SubHead>
          <RankBars rows={bySale.slice(0, 7).map((c) => ({ key: c.n, label: c.n, value: c.sale }))} valueFmt={mn}
            right={(r) => <span className="w-[44px] text-right text-[12px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{pct(tot.sale ? (r.value / tot.sale) * 100 : 0, 0)}</span>} />
        </ExecPanel>
        <ExecPanel en="RECEIVABLES AGING" title="미수 나이" sub={`지금 남은 미수 ${mn(out)}만원 · 청구일부터 지난 날 · 단위 만원`}>
          {!arPay ? <Empty text="수금 기록이 없습니다" sub="회계관리 › 수금 기록이 있어야 미수를 계산합니다." /> : !out ? <Empty text="남은 미수가 없습니다" /> : <>
            <div className="space-y-3 mt-1">
              {aging.map(([l, v], i) => (
                <div key={l} className="grid items-center gap-3" style={{ gridTemplateColumns: "76px minmax(0,1fr) 72px 40px" }}>
                  <span className="text-[13px] font-bold" style={{ color: EX.sub }}>{l}</span>
                  <Meter value={v} max={agingMax} color={AGE_C[i]} height={8} />
                  <span className="text-right text-[13.5px] font-black" style={{ ...EX_NUM, color: EX.text }}>{mn(v)}</span>
                  <span className="text-right text-[12px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{pct(out ? (v / out) * 100 : 0, 0)}</span>
                </div>
              ))}
            </div>
            <SubHead right="30일 넘은 미수">늦어지는 거래처</SubHead>
            {!overdue.length ? <Empty text="30일 넘은 미수가 없습니다" /> : (
              <div>
                {overdue.map((r, i) => (
                  <div key={r.n} className="flex items-baseline justify-between gap-3 py-2.5" style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>
                    <span className="min-w-0 truncate text-[13.5px] font-bold" style={{ color: EX.text }}>{r.n} <span className="text-[12px] font-semibold" style={{ color: EX.mute }}>평균 {Math.round(r.avgAge)}일</span></span>
                    <b className="shrink-0 text-[14px] font-black" style={{ ...EX_NUM, color: EX.warn }}>{mn(r.over30)}</b>
                  </div>
                ))}
              </div>
            )}
          </>}
          <Basis>미수 = 올해 배차완료 · 고정거래처 청구액(부가세 포함) − 수금 기록 · 오래된 청구부터 수금된 것으로 봅니다.</Basis>
        </ExecPanel>
      </ExecGrid>
      <ExecGrid cols={cur ? "minmax(0,1.7fr) minmax(360px,1fr)" : "minmax(0,1fr)"} breakAt={1280}>
        <ExecPanel en="CLIENT PROFITABILITY" title="거래처 수익성" sub={`${PERIOD_L[pk]} · 제목을 누르면 정렬 · 줄을 누르면 노선별 상세`}>
          <SortTable testId="exa-client-table" cols={cols} rows={list} sort={sort} setSort={setSort} compact={compact} selKey={sel}
            onRow={(r) => { setSel(r.n === sel ? null : r.n); if (W < 1280) setTimeout(() => document.getElementById("exa-client-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); }} />
        </ExecPanel>
        {cur && <ClientDetail c={cur} compact={compact} onClose={() => setSel(null)} />}
      </ExecGrid>
    </>}
  </>);
}
function ClientDetail({ c, onClose }) {
  const ab = ageBuckets(c.ar.open); const abMax = Math.max(1, ...ab.map((x) => x[1]));
  const rMax = Math.max(1, ...c.routes.slice(0, 8).map((r) => r.sale));
  return (
    <div id="exa-client-detail" className="min-w-0">
      <ExecPanel glow en="CLIENT DETAIL" title={c.n} sub={`${c.cnt.toLocaleString("ko-KR")}건 · 마지막 오더 ${c.last ? md(c.last) : "—"} · 단위 만원`} right={<ExecButton onClick={onClose}>닫기</ExecButton>}>
        <div className="grid grid-cols-2 gap-2.5 mt-1">
          <MiniStat label="매출" value={mn(c.sale)} unit="만원" foot={c.dSale == null ? "새 거래처" : <Delta v={c.dSale} size={12} label="직전 대비" />} />
          <MiniStat label="이익률" value={pct(c.margin)} color={pc(c.margin)} foot={c.pMargin != null ? <Delta v={c.margin - c.pMargin} suffix="%p" size={12} label="직전 대비" /> : "직전 기록 없음"} />
          <MiniStat label="평균 단가" value={mn(c.avg)} unit="만원" foot={c.dAvg != null ? <Delta v={c.dAvg} size={12} label="직전 대비" /> : null} />
          <MiniStat label="미수금" value={mn(c.ar.outstanding)} unit="만원" foot={c.ar.outstanding ? `평균 ${Math.round(c.ar.avgAge)}일 경과` : "남은 미수 없음"} />
        </div>
        <SubHead right="매출 · 이익률">노선별</SubHead>
        <div className="space-y-2.5">
          {c.routes.slice(0, 8).map((r) => {
            const m = r.sale ? (r.profit / r.sale) * 100 : 0;
            return (
              <div key={r.rt} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: EX.text }}>{r.rt} <span className="text-[12px] font-semibold" style={{ color: EX.mute }}>{r.cnt}건</span></span>
                  <span className="shrink-0 flex items-baseline gap-3" style={EX_NUM}><b className="text-[13.5px] font-black" style={{ color: EX.text }}>{mn(r.sale)}</b><span className="w-[48px] text-right text-[12.5px] font-extrabold" style={{ color: pc(m) }}>{pct(m)}</span></span>
                </div>
                <div className="mt-1.5"><Meter value={r.sale} max={rMax} color={EX.ice} height={4} /></div>
              </div>
            );
          })}
        </div>
        {c.ar.outstanding > 0 && <>
          <SubHead>미수 나이</SubHead>
          <div className="space-y-2">
            {ab.map(([l, v], i) => (
              <div key={l} className="grid items-center gap-3" style={{ gridTemplateColumns: "72px minmax(0,1fr) 64px" }}>
                <span className="text-[12.5px] font-bold" style={{ color: EX.sub }}>{l}</span>
                <Meter value={v} max={abMax} color={AGE_C[i]} height={6} />
                <b className="text-right text-[13px] font-black" style={{ ...EX_NUM, color: v && i ? EX.warn : EX.text }}>{mn(v)}</b>
              </div>
            ))}
          </div>
        </>}
      </ExecPanel>
    </div>
  );
}

// ═════════════════════════ 기사·차량 ═════════════════════════
const TYPES = ["지입", "직영", "임대"];
const TYPE_C = { 지입: EX.gold, 직영: EX.ice, 임대: VIOLET };
function FleetTab({ rows, fleet, today, compact }) {
  const [pk, setPk] = React.useState("30");
  const [type, setType] = React.useState("all");
  const P = periodOf(today, pk);
  const list = React.useMemo(() => vehicleTable(rows, fleet, P.from, P.to), [rows, fleet, P.from, P.to]);
  const shown = list.filter((v) => type === "all" || v.type === type);
  const [sort, setSort] = React.useState({ k: "profit", dir: "desc" });
  const idle = list.filter((v) => !v.last || dayDiff(v.last, today) >= 7).sort((a, b) => (a.last || "").localeCompare(b.last || ""));
  const byType = TYPES.map((t) => { const l = list.filter((v) => v.type === t); const s = l.reduce((a, v) => ({ sale: a.sale + v.sale, profit: a.profit + v.profit, util: a.util + v.util }), { sale: 0, profit: 0, util: 0 }); return { t, n: l.length, ...s, util: l.length ? s.util / l.length : 0 }; });
  const avgUtil = list.length ? list.reduce((s, v) => s + v.util, 0) / list.length : 0;
  const totP = list.reduce((s, v) => s + v.profit, 0); const totS = list.reduce((s, v) => s + v.sale, 0);
  const low = list.filter((v) => v.util < 50).length;
  const cols = [
    { k: "plate", l: "차량", get: (r) => r.plate, cell: (r) => <span className="font-extrabold">{r.plate} <span className="font-semibold" style={{ color: EX.mute }}>{r.name}</span></span> },
    { k: "profit", l: "이익(만원)", short: "이익", num: true, cell: (r) => <span style={{ color: pc(r.profit) }}>{mn(r.profit)}</span> },
    { k: "type", l: "구분", get: (r) => r.type, cell: (r) => <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: EX.sub }}><span className="w-2 h-2 rounded-full" style={{ background: TYPE_C[r.type] }} />{r.type}</span> },
    { k: "sale", l: "매출(만원)", short: "매출", num: true, cell: (r) => mn(r.sale) },
    { k: "pay", l: "기사 운임(만원)", short: "기사 운임", num: true, cell: (r) => mn(r.pay) },
    { k: "margin", l: "이익률", num: true, cell: (r) => <span style={{ color: pc(r.margin) }}>{pct(r.margin)}</span> },
    { k: "days", l: "가동일", num: true, cell: (r) => `${r.days}일` },
    { k: "util", l: "가동률", num: true, cell: (r) => <span className="inline-flex items-center gap-2 justify-end"><span className="hidden md:block w-14"><Meter value={r.util} max={100} color={r.util < 50 ? EX.warn : EX.ice} height={4} /></span><span style={{ color: r.util < 50 ? EX.warn : EX.text }}>{pct(r.util, 0)}</span></span> },
    { k: "last", l: "마지막 운행", short: "최근 운행", get: (r) => r.last || "", cell: (r) => (r.last ? md(r.last) : "없음") },
  ];
  if (!fleet.size) return <ExecPanel en="FLEET" title="기사 · 차량 수익성"><Empty text="등급이 있는 소속 차량이 없습니다" sub="기사관리에서 지입 · 직영 · 임대 등급을 넣으면 차량별 가동률과 이익이 보입니다." /></ExecPanel>;
  const pts = shown.map((v) => ({ x: Math.round(v.util), y: Math.round(v.profit / 1e4), v }));
  const ScTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null; const v = payload[0].payload.v;
    return <TipBox title={`${v.plate} · ${v.name || "기사 미등록"}`} rows={[["구분", TYPE_C[v.type], v.type], ["가동률", null, `${pct(v.util, 0)} (${v.days}일)`], ["매출", null, `${mn(v.sale)}만원`], ["이익", null, `${mn(v.profit)}만원`, pc(v.profit)]]} />;
  };
  return (<>
    <Toolbar basis={`${dot(P.from).slice(5)} ~ ${dot(P.to).slice(5)} · 영업일 ${list[0]?.bizDays || 0}일 기준 가동률`}>
      <ExecTabs size="sm" items={PERIODS} value={pk} onChange={setPk} />
      <ExecTabs size="sm" items={[["all", "전체"], ...TYPES.map((t) => [t, t])]} value={type} onChange={setType} />
    </Toolbar>
    <Brief basis="소속 차량(지입 · 직영 · 임대) · 배차 기록 기준">
      소속 차량 <B>{list.length}대</B>의 평균 가동률은 <B>{avgUtil.toFixed(0)}%</B>이며, {PERIOD_L[pk]} 이익은 <B color={pc(totP)}>{fmtEokMan(totP)}</B>입니다.
      {" "}{idle.length ? <>7일 넘게 운행이 없는 차량이 <B color={EX.warn}>{idle.length}대</B> 있습니다.</> : "모든 차량이 최근 7일 안에 운행했습니다."}
    </Brief>
    <ExecKpis min={196}>
      <Kpi accent en="UTILIZATION" label="평균 가동률" value={avgUtil.toFixed(0)} unit="%" foot="가동일 ÷ 영업일" />
      <Kpi en="FLEET" label="소속 차량" value={list.length.toLocaleString("ko-KR")} unit="대" foot={byType.map((x) => `${x.t} ${x.n}`).join(" · ")} />
      <Kpi en="FLEET PROFIT" label="소속 차량 이익" money={totP} foot={<span>매출 {fmtMoney(totS)} · 이익률 <b style={{ ...EX_NUM, color: pc(totP) }}>{pct(totS ? (totP / totS) * 100 : 0)}</b></span>} />
      <Kpi en="LOW UTILIZATION" label="가동률 50% 미만" value={low.toLocaleString("ko-KR")} unit="대" foot="배차 우선 검토 대상" />
      <Kpi en="IDLE" label="쉬는 차량" value={idle.length.toLocaleString("ko-KR")} unit="대" foot="7일 넘게 운행 없음" />
    </ExecKpis>
    <ExecGrid cols="minmax(0,1.5fr) minmax(0,1fr)">
      <ExecPanel en="UTILIZATION × PROFIT" title="가동률과 이익" sub="점 하나가 차량 한 대 · 오른쪽 위일수록 많이 달리고 많이 남깁니다 · 이익 단위 만원"
        right={!compact && <Legend items={TYPES.map((t) => [t, TYPE_C[t]])} />}>
        <ResponsiveContainer width="100%" height={compact ? 250 : 300}>
          <ScatterChart margin={{ top: 18, right: 14, left: 0, bottom: 4 }}>
            <CartesianGrid {...chartTheme.grid} vertical />
            <XAxis type="number" dataKey="x" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} {...AX} height={26} />
            <YAxis type="number" dataKey="y" {...AX} width={56} tickFormatter={locale} />
            <ZAxis range={[78, 78]} />
            <ReferenceArea x1={0} x2={50} fill="rgba(245,196,107,.05)" />
            <ReferenceLine x={Math.round(avgUtil)} stroke={EX.gold} strokeDasharray="4 4" label={{ value: `평균 ${avgUtil.toFixed(0)}%`, position: "top", fill: EX.gold, fontSize: 11.5, fontWeight: 800 }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,.25)" />
            <Tooltip content={<ScTip />} cursor={{ stroke: EX.line, strokeDasharray: "3 3" }} />
            {TYPES.map((t) => <Scatter key={t} name={t} data={pts.filter((p) => p.v.type === t)} fill={TYPE_C[t]} fillOpacity={0.88} stroke={EX.bg1} strokeWidth={1.5} isAnimationActive={false} />)}
          </ScatterChart>
        </ResponsiveContainer>
        <Basis className="mt-2">옅은 노란 칸 = 가동률 50% 미만. 이익 = 매출 − 기사 운임 − 회사가 따로 지급한 지게차 · 외부 운임.</Basis>
      </ExecPanel>
      <div className="grid gap-4 md:gap-5 content-start min-w-0">
        <ExecPanel en="BY TYPE" title="구분별 가동률" sub={`${PERIOD_L[pk]} · 이익 단위 만원`}>
          <div className="grid grid-cols-3 gap-2.5">
            {byType.map((x) => (
              <div key={x.t} className="rounded-2xl px-2 py-3.5 flex flex-col items-center text-center" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${EX.line}` }}>
                <Ring value={x.util} size={compact ? 64 : 76} stroke={6} color={TYPE_C[x.t]} />
                <div className="mt-2 text-[13px] font-extrabold" style={{ color: EX.text }}>{x.t} <span className="font-semibold" style={{ color: EX.mute }}>{x.n}대</span></div>
                <div className="mt-0.5 text-[13px] font-black" style={{ ...EX_NUM, color: pc(x.profit) }}>{mn(x.profit)}</div>
              </div>
            ))}
          </div>
        </ExecPanel>
        <ExecPanel en="IDLE VEHICLES" title="쉬는 차량" sub="7일 넘게 운행 기록 없음 · 오래된 순">
          <div id="exa-idle">
            {!idle.length ? <Empty text="모든 차량이 최근 7일 안에 운행했습니다" /> : idle.slice(0, 8).map((v, i) => (
              <div key={v.key} className="flex items-baseline justify-between gap-3 py-2.5" style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>
                <span className="min-w-0 truncate text-[13.5px] font-extrabold" style={{ color: EX.text }}>{v.plate} <span className="text-[12.5px] font-semibold" style={{ color: EX.mute }}>{v.name} · {v.type}</span></span>
                <b className="shrink-0 text-[13.5px] font-black" style={{ ...EX_NUM, color: EX.warn }}>{v.last ? `${dayDiff(v.last, today)}일째` : "기록 없음"}</b>
              </div>
            ))}
            {idle.length > 8 && <div className="pt-2 text-[12px] font-semibold" style={{ color: EX.mute }}>외 {idle.length - 8}대 — 아래 표에서 ‘마지막 운행’으로 정렬해 보세요.</div>}
          </div>
        </ExecPanel>
      </div>
    </ExecGrid>
    <ExecPanel en="VEHICLE P&L" title="차량별 수익성" sub={`${type === "all" ? "소속 차량 전체" : `${type} 차량`} ${shown.length}대 · 제목을 누르면 정렬`}>
      <SortTable testId="exa-fleet-table" cols={cols} rows={shown} sort={sort} setSort={setSort} rowKey={(r) => r.key} compact={compact} />
    </ExecPanel>
  </>);
}

// ═════════════════════════ 단가 ═════════════════════════
function DivergeList({ rows, compact }) {
  if (!rows.length) return <Empty text="크게 움직인 단가가 없습니다" />;
  const mx = Math.max(5, ...rows.map((r) => Math.abs(r.d)));
  return (
    <div>
      <div className="grid items-center gap-3 mb-1.5 text-[11px] font-extrabold" style={{ gridTemplateColumns: compact ? "minmax(0,1fr) minmax(0,1.2fr) 58px" : "minmax(0,1fr) minmax(0,1.6fr) 64px", color: EX.faint }}>
        <span /><div className="flex justify-between"><span>◀ 내림</span><span>오름 ▶</span></div><span />
      </div>
      {rows.map((r) => {
        const w = (Math.abs(r.d) / mx) * 50; const up = r.d >= 0;
        return (
          <div key={r.k} className="grid items-center gap-3 py-[7px]" style={{ gridTemplateColumns: compact ? "minmax(0,1fr) minmax(0,1.2fr) 58px" : "minmax(0,1fr) minmax(0,1.6fr) 64px" }}>
            <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: EX.text }} title={r.label}>{r.label}{r.sub && <span className="ml-1 text-[12px] font-semibold" style={{ color: EX.mute }}>{r.sub}</span>}</span>
            <div className="relative h-[14px]">
              <div className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px" style={{ background: "rgba(255,255,255,.18)" }} />
              <div className="absolute top-[3px] h-2 rounded-full" style={{ [up ? "left" : "right"]: "50%", width: `${w}%`, background: up ? EX.up : EX.down, opacity: 0.9 }} />
            </div>
            <span className="text-right"><Delta v={r.d} size={12.5} /></span>
          </div>
        );
      })}
    </div>
  );
}
function PriceTab({ rows, today, compact }) {
  const cur = [addDay(today, -27), today]; const prev = [addDay(today, -83), addDay(today, -28)];
  const pw = React.useMemo(() => priceWatch(rows, cur, prev), [rows, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = React.useState("route");
  const [sort, setSort] = React.useState({ k: "d", dir: "desc" });
  const noun = view === "route" ? "노선" : "거래처";
  const base = (view === "route" ? pw.routes : pw.clients).filter((x) => x.cnt >= 5 && x.pCnt >= 5 && x.d != null).map((x) => ({ ...x, absD: Math.abs(x.d) }));
  const warn = pw.routes.filter((x) => x.cnt >= 5 && (x.margin < 8 || (x.pMargin != null && x.margin - x.pMargin <= -3))).sort((a, b) => a.margin - b.margin);
  const up = base.filter((x) => x.d >= 3).length; const dn = base.filter((x) => x.d <= -3).length;
  const avgD = base.length ? base.reduce((s, x) => s + x.d * x.cnt, 0) / (base.reduce((s, x) => s + x.cnt, 0) || 1) : null;
  const top = [...base].sort((a, b) => b.absD - a.absD).slice(0, 10).map((x) => ({ k: x.k, d: x.d, label: view === "route" ? x.rt : x.n, sub: view === "route" ? x.ton : "" }));
  const cols = [
    { k: "k", l: view === "route" ? "노선 · 톤수" : "거래처", get: (r) => r.k, cell: (r) => <span className="font-extrabold">{view === "route" ? <>{r.rt} <span className="font-semibold" style={{ color: EX.mute }}>{r.ton}</span></> : r.n}</span> },
    { k: "d", l: "단가 변동", num: true, get: (r) => r.absD, cell: (r) => <Delta v={r.d} size={13} /> },
    { k: "avg", l: "최근 4주 단가(만원)", short: "지금 단가", num: true, cell: (r) => mn(r.avg) },
    { k: "pAvg", l: "직전 8주 단가(만원)", short: "직전 단가", num: true, cell: (r) => mn(r.pAvg) },
    { k: "cnt", l: "건수", num: true, cell: (r) => `${r.cnt}건` },
    { k: "margin", l: "이익률", num: true, cell: (r) => <span style={{ color: pc(r.margin) }}>{pct(r.margin)}</span> },
  ];
  return (<>
    <Toolbar basis={`최근 4주(${md(cur[0])} ~ ${md(cur[1])}) 평균 단가 대비 직전 8주 · 양쪽 모두 5건 이상만 비교`}>
      <ExecTabs size="sm" items={[["route", "노선별"], ["client", "거래처별"]]} value={view} onChange={setView} />
    </Toolbar>
    <Brief basis="건당 평균 청구운임 기준" tone={warn.length ? "warn" : "gold"}>
      최근 4주 단가가 3% 넘게 오른 {noun}은 <B color={EX.up}>{up}곳</B>, 내린 {noun}은 <B color={EX.down}>{dn}곳</B>입니다.
      {" "}{warn.length ? <>이익률이 8% 아래이거나 3%p 넘게 떨어진 노선 <B color={EX.warn}>{warn.length}곳</B>은 운임 재협의를 검토하시기 바랍니다.</> : "이익률이 급격히 나빠진 노선은 없습니다."}
    </Brief>
    <ExecKpis min={196}>
      <Kpi accent en="PRICE INDEX" label="평균 단가 변동" value={avgD == null ? "—" : `${avgD >= 0 ? "+" : "−"}${Math.abs(avgD).toFixed(1)}`} unit={avgD == null ? "" : "%"} foot="건수 가중 · 직전 8주 대비" />
      <Kpi en="COMPARED" label={`비교한 ${noun}`} value={base.length.toLocaleString("ko-KR")} unit="곳" foot="양쪽 5건 이상" />
      <Kpi en="PRICE UP" label="단가 오름(3% 이상)" value={up.toLocaleString("ko-KR")} unit="곳" />
      <Kpi en="PRICE DOWN" label="단가 내림(3% 이상)" value={dn.toLocaleString("ko-KR")} unit="곳" />
      <Kpi en="LOW MARGIN" label="저마진 경고 노선" value={warn.length.toLocaleString("ko-KR")} unit="곳" foot="이익률 8% 미만 · 3%p 넘게 하락" />
    </ExecKpis>
    <ExecGrid cols="minmax(0,1.35fr) minmax(0,1fr)">
      <ExecPanel en="PRICE MOVERS" title={`단가 변동 큰 ${noun}`} sub="오름 · 내림 모두 변동 폭 큰 순 10곳 · 직전 8주 대비">
        <DivergeList rows={top} compact={compact} />
      </ExecPanel>
      <ExecPanel en="EARLY WARNING" title="저마진 노선 조기 경고" sub="최근 4주 5건 이상 · 이익률 낮은 순 · 단위 만원">
        <div id="exa-lowmargin">
          {!warn.length ? <Empty text="경고할 노선이 없습니다" sub="모든 노선의 이익률이 8% 이상이고 급락하지 않았습니다." /> : warn.slice(0, 10).map((r, i) => (
            <div key={r.k} className="py-2.5" style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13.5px] font-extrabold" style={{ color: EX.text }}>{r.rt} <span className="text-[12.5px] font-semibold" style={{ color: EX.mute }}>{r.ton}</span></span>
                <b className="shrink-0 text-[14.5px] font-black" style={{ ...EX_NUM, color: pc(r.margin) }}>{pct(r.margin)}</b>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[12px] font-semibold" style={{ color: EX.mute }}>
                <span style={EX_NUM}>{r.cnt}건 · 매출 {mn(r.sale)}</span>
                <span className="inline-flex items-center gap-1.5">{r.pMargin != null ? <>직전 {pct(r.pMargin)} <Delta v={r.margin - r.pMargin} suffix="%p" size={12} /></> : "직전 기록 없음"}</span>
              </div>
            </div>
          ))}
        </div>
      </ExecPanel>
    </ExecGrid>
    <ExecPanel en="PRICE WATCH" title="단가 변동 전체" sub={`${noun} ${base.length}곳 · 변동 큰 순(오름 · 내림 모두) · 제목을 누르면 정렬`}>
      {!base.length ? <Empty text={`비교할 만큼 오더가 쌓인 ${noun}이 없습니다`} /> : <SortTable testId="exa-price-table" cols={cols} rows={base} sort={sort} setSort={setSort} rowKey={(r) => r.k} compact={compact} />}
    </ExecPanel>
  </>);
}

// ═════════════════════════ 현금흐름 ═════════════════════════
function CashTab({ rows, ledger, recurring, funds, arPay, today, compact, W, fixedRows = [] }) {
  const [weeks, setWeeks] = React.useState(8);
  const F = React.useMemo(() => (funds.length ? computeFunds(funds, ledger) : null), [funds, ledger]);
  const rec = React.useMemo(() => receivables(rows, arPay, today, fixedRows), [rows, arPay, today, fixedRows]);
  const dso = React.useMemo(() => dsoOf(rows, rec, today), [rows, rec, today]);
  const fc = React.useMemo(() => {
    const cash = F ? F.cash : 0;
    const cardDue = F ? F.list.filter(isCredit).reduce((s, f) => s + (f.usedMonth || 0), 0) : 0;
    // 기사 운송료(최근 3개월 월평균) — 고정비에 운송료 지급이 따로 있으면 넣지 않는다
    const ms = [1, 2, 3].map((n) => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); });
    const hasDrvRec = (recurring || []).some((x) => x.active !== false && /운송료|기사/.test(`${x.name || ""}${x.account || ""}`));
    const drvPay = hasDrvRec ? 0 : ms.reduce((s, m) => s + rows.filter((r) => ymOf(dateOf(r)) === m).reduce((a, r) => a + toWon(r.기사운임), 0), 0) / 3;
    const last30 = rangeDays(addDay(today, -30), addDay(today, -1)); const bizN = last30.filter(isBizDay).length || 1;
    const set = new Set(last30); const sale30 = rows.reduce((s, r) => (set.has(dateOf(r)) ? s + toWon(r.청구운임) : s), 0);
    const totOut = Object.values(rec).reduce((s, r) => s + r.outstanding, 0);
    const wDso = totOut ? Object.entries(rec).reduce((s, [c, r]) => s + r.outstanding * (dso[c] || 60), 0) / totOut : 45;
    return { ...cashForecast({ today, cash, rec, dso, recurring, cardDue, driverPay: drvPay, weeks, newSalesDaily: sale30 / bizN, newDso: wDso }), cardDue, drvPay, wDso, totOut };
  }, [F, rows, rec, dso, recurring, today, weeks]);
  const fixedMonth = (recurring || []).filter((x) => x.active !== false && (x.type || "지출") === "지출").reduce((s, x) => s + toWon(x.amount), 0);
  const safe = Math.max(fixedMonth, 3e7);
  const inSum = fc.weeks.reduce((s, w) => s + w.in, 0); const outSum = fc.weeks.reduce((s, w) => s + w.out, 0);
  const endBal = fc.weeks[fc.weeks.length - 1]?.end || fc.start;
  const lowWeeks = fc.weeks.filter((w) => w.low < safe);
  if (!F && !fc.totOut && !fixedMonth) return <ExecPanel en="CASH FLOW" title="현금흐름 예측"><Empty text="예측할 자료가 없습니다" sub="자금관리에 계좌를 넣거나 미수 · 고정비 기록이 쌓이면 앞으로의 잔액을 예측합니다." /></ExecPanel>;
  const big = (w) => [...w.list].sort((a, b) => b.amt - a.amt).slice(0, 3);
  const pts = [{ lbl: "오늘", low: fc.start, end: fc.start, a: today }, ...fc.weeks.map((w) => ({ lbl: md(w.a), low: w.low, end: w.end, a: w.a, b: w.b, in: w.in, out: w.out }))].map((p) => ({ ...p, lowM: Math.round(p.low / 1e4), endM: Math.round(p.end / 1e4) }));
  const safeM = Math.round(safe / 1e4);
  const lo = Math.min(0, ...pts.map((p) => Math.min(p.lowM, p.endM)));
  const CashTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null; const p = payload[0].payload;
    return <TipBox title={p.b ? `${md(p.a)} ~ ${md(p.b)} 주` : "오늘"} rows={[["주 최저 잔액", EX.gold, `${cm(p.lowM)}만원`, p.low < safe ? EX.warn : null], ["주 끝 잔액", EX.ice, `${cm(p.endM)}만원`], p.b && ["예상 수금", null, `+${mn(p.in)}만원`], p.b && ["예상 지출", null, `−${mn(p.out)}만원`]]} foot={p.low < safe ? "안전 잔액보다 낮습니다" : null} />;
  };
  const wk = W >= 1300 ? 4 : W >= 760 ? 2 : 1;
  return (<>
    <Toolbar basis={`안전 잔액 = 한 달 고정비(최소 3,000만원) ${mn(safe)}만원`}>
      <ExecTabs size="sm" items={[["4", "4주"], ["6", "6주"], ["8", "8주"]]} value={String(weeks)} onChange={(k) => setWeeks(Number(k))} />
    </Toolbar>
    <Brief tone={lowWeeks.length ? "warn" : "gold"} basis={F ? "통장 · 현금 기준(카드 한도 · 대출 제외)" : "자금 계좌 없음 · 0원에서 시작"}>
      지금 보유 자금은 <B>{fmtEokMan(fc.start)}</B>이며, {weeks}주 뒤에는 <B>{fmtEokMan(endBal)}</B>으로 예상됩니다.
      {" "}{lowWeeks.length
        ? <span data-testid="exa-cash-warn"><B color={EX.warn}>{lowWeeks.map((w) => `${md(w.a)}`).join(" · ")} 주</B>에 잔액이 안전 잔액 아래로 내려갈 수 있습니다(가장 낮을 때 <B color={EX.warn}>{fmtEokMan(fc.min.bal)}</B>).</span>
        : <>예측 기간 내내 안전 잔액({fmtEokMan(safe)}) 이상을 유지합니다.</>}
    </Brief>
    <ExecKpis min={196}>
      <Kpi accent en="CASH ON HAND" label="지금 보유 자금" money={fc.start} foot={F ? "통장 · 현금" : "자금 계좌 없음"} />
      <Kpi en="INFLOW" label={`${weeks}주 예상 수금`} money={inSum} foot={`평균 입금 ${Math.round(fc.wDso)}일`} />
      <Kpi en="OUTFLOW" label={`${weeks}주 예상 지출`} money={outSum} foot="고정비 · 운송료 · 카드 대금" />
      <Kpi en="ENDING BALANCE" label={`${weeks}주 뒤 잔액`} money={endBal} delta={fc.start ? pctChange(endBal, fc.start) : undefined} deltaLabel="지금 대비" />
      <Kpi en="LOW POINT" label="가장 낮은 잔액" money={fc.min.bal} foot={fc.min.bal < safe ? `${md(fc.min.d)} 주 · 안전 잔액 아래` : `${md(fc.min.d)} 주`} />
    </ExecKpis>
    <ExecPanel en="CASH FORECAST" title="잔액 예측" sub={`오늘부터 ${weeks}주 · 주별 가장 낮은 잔액과 주 끝 잔액 · 단위 만원`}
      right={!compact && <Legend items={[["주 최저 잔액", EX.gold, "line"], ["주 끝 잔액", EX.ice, "line"], ["안전 잔액 아래", "rgba(245,196,107,.45)"]]} />}>
      <ResponsiveContainer width="100%" height={compact ? 250 : 310}>
        <ComposedChart data={pts} margin={{ top: 22, right: compact ? 12 : 26, left: 4, bottom: 0 }}>
          <GradDefs />
          <CartesianGrid {...chartTheme.grid} />
          <XAxis dataKey="lbl" {...AX} interval={compact ? 1 : 0} height={26} />
          <YAxis {...AX} width={64} tickFormatter={locale} domain={[lo, "auto"]} />
          <ReferenceArea y1={lo} y2={safeM} fill="rgba(245,196,107,.07)" stroke="none" />
          <ReferenceLine y={safeM} stroke={EX.warn} strokeDasharray="5 5" strokeOpacity={0.8} label={{ value: `안전 잔액 ${locale(safeM)}`, position: "insideBottomRight", fill: EX.warn, fontSize: 11.5, fontWeight: 800 }} />
          {lo < 0 && <ReferenceLine y={0} stroke="rgba(255,255,255,.25)" />}
          <Tooltip content={<CashTip />} cursor={{ stroke: "rgba(215,188,130,.35)", strokeDasharray: "3 4" }} />
          <Area dataKey="lowM" stroke="none" fill="url(#exaGoldArea)" isAnimationActive={false} />
          <Line dataKey="endM" stroke={EX.ice} strokeWidth={1.8} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
          <Line dataKey="lowM" stroke={EX.gold} strokeWidth={2.6} isAnimationActive={false}
            dot={(p) => <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={p.payload.low < safe ? 5.5 : 3.5} fill={p.payload.low < safe ? EX.warn : EX.bg1} stroke={p.payload.low < safe ? EX.bg1 : EX.gold} strokeWidth={p.payload.low < safe ? 1.5 : 2} />}
            activeDot={{ r: 6 }}>
            <LabelList dataKey="lowM" content={(p) => (p.index === pts.length - 1 ? <text x={p.x} y={p.y - 12} textAnchor="end" fontSize={12.5} fontWeight={900} fill={EX.goldHi} style={EX_NUM}>{locale(p.value)}</text> : null)} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ExecPanel>
    <ExecPanel en="WEEKLY SCHEDULE" title="주별 입출금 예정" sub="큰 금액 순 3건까지 · 단위 만원">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${wk},minmax(0,1fr))` }}>
        {fc.weeks.map((w) => {
          const bad = w.low < safe;
          return (
            <div key={w.a} className="rounded-2xl p-4 min-w-0" style={{ background: bad ? "rgba(245,196,107,.06)" : "rgba(255,255,255,.03)", border: `1px solid ${bad ? "rgba(245,196,107,.4)" : EX.line}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-[13.5px] font-extrabold" style={{ ...EX_NUM, color: EX.text }}>{md(w.a)} ~ {md(w.b)}</b>
                <span className="text-[11.5px] font-bold" style={{ color: EX.mute }}>주 끝 <b className="text-[14px] font-black" style={{ ...EX_NUM, color: bad ? EX.warn : EX.goldHi }}>{cm(w.end / 1e4)}</b></span>
              </div>
              <div className="mt-2 flex gap-4 text-[12px] font-bold" style={{ color: EX.mute }}>
                <span>수금 <b style={{ ...EX_NUM, color: EX.text }}>+{mn(w.in)}</b></span><span>지출 <b style={{ ...EX_NUM, color: EX.text }}>−{mn(w.out)}</b></span>
              </div>
              <div className="mt-2.5 pt-2.5 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                {big(w).map((e, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="min-w-0 truncate" style={{ color: EX.sub }}><span style={{ ...EX_NUM, color: EX.mute }}>{md(e.d)}</span> {e.label}</span>
                    <span className="shrink-0 font-extrabold" style={{ ...EX_NUM, color: e.kind === "in" ? EX.text : EX.sub }}>{e.kind === "in" ? "+" : "−"}{mn(e.amt)}</span>
                  </div>
                ))}
                {!w.list.length && <span className="text-[12px]" style={{ color: EX.faint }}>예정 없음</span>}
              </div>
            </div>
          );
        })}
      </div>
      <Basis>가정: 미수는 청구일 + 거래처 평균 입금 기간(미수 ÷ 최근 90일 일평균 매출, 15~120일)에 들어오고, 이미 지난 미수는 이번 주 50% · 다음 주 30%만 넣습니다. 앞으로 생길 매출은 평균 입금 기간 뒤부터 들어옵니다. 고정비 · 급여는 자금관리 고정비 등록일, 카드 대금은 이번 달 사용액을 다음 달 15일, 기사 운송료는 최근 3개월 월평균({mn(fc.drvPay)}만원)을 매달 10일에 지급하는 것으로 봅니다(고정비에 운송료가 있으면 그 값을 씁니다).</Basis>
    </ExecPanel>
  </>);
}

// ═════════════════════════ 영업 ═════════════════════════
function SalesTab({ rows, today, compact }) {
  const months = React.useMemo(() => monthsBack(today.slice(0, 7), 12), [today]);
  const st = React.useMemo(() => salesTrend(rows, today, months), [rows, today, months]);
  const [sel, setSel] = React.useState(null);
  const fresh = st.fresh;
  const freshRev = fresh.reduce((s, c) => s + (c.ramp.filter((v) => v != null).slice(-1)[0] || 0), 0);
  const lostM = st.churn.reduce((s, c) => s + c.monthly, 0);
  const recent3 = st.perMonth.slice(-3).reduce((s, m) => s + m.n.length, 0);
  const prev3 = st.perMonth.slice(-6, -3).reduce((s, m) => s + m.n.length, 0);
  const a = st.activeBy; const aNow = a[a.length - 1]?.n || 0; const aPrev = a[a.length - 2]?.n || 0;
  const newData = st.perMonth.map((m) => ({ k: ymLabel(m.m), m: m.m, v: m.n.length, names: m.n }));
  const actData = a.map((m) => ({ k: ymLabel(m.m), m: m.m, v: m.n }));
  const selRow = newData.find((d) => d.m === sel);
  const ramp = fresh.map((c) => ({ ...c, id: c.n }));
  const rampCols = [
    { key: "n", label: "거래처", render: (c) => <span className="font-extrabold">{c.n}</span> },
    { key: "first", label: "첫 오더", render: (c) => <span style={{ ...EX_NUM, color: EX.sub }}>{dot(c.first).slice(2)}</span> },
    ...[0, 1, 2].map((i) => ({ key: `r${i}`, label: `${i + 1}개월째(만원)`, align: "right", render: (c) => { const v = c.ramp[i]; const p = c.ramp[i - 1]; return v == null ? <span style={{ color: EX.faint }}>—</span> : <span className="inline-flex items-center gap-2 justify-end">{mn(v)}{i > 0 && p ? <Delta v={((v - p) / p) * 100} dp={0} size={11.5} /> : null}</span>; } })),
    { key: "total", label: "누적 매출(만원)", align: "right", render: (c) => mn(c.total) },
    { key: "cnt", label: "건수", align: "right", render: (c) => `${c.cnt.toLocaleString("ko-KR")}건` },
    { key: "st", label: "상태", align: "center", render: (c) => <Chip tone={c.active ? "ok" : "warn"}>{c.active ? "거래 중" : "뜸함"}</Chip> },
  ];
  return (<>
    <Brief basis="거래처별 첫 오더 · 마지막 오더 기준">
      최근 3개월 동안 새 거래처 <B>{recent3}곳</B>이 들어왔습니다{prev3 ? <>(직전 3개월 {prev3}곳)</> : ""}.
      {" "}{st.churn.length ? <>60일 넘게 오더가 끊긴 거래처 <B color={EX.warn}>{st.churn.length}곳</B>(월평균 매출 {fmtEokMan(lostM)})은 다시 연락해 보실 만합니다.</> : "60일 넘게 끊긴 거래처는 없습니다."}
    </Brief>
    <ExecKpis min={196}>
      <Kpi accent en="NEW CLIENTS" label="최근 3개월 신규" value={String(recent3)} unit="곳" delta={prev3 ? pctChange(recent3, prev3) : undefined} deltaLabel="직전 3개월 대비" />
      <Kpi en="12-MONTH NEW" label="12개월 신규" value={String(fresh.length)} unit="곳" foot={`지금도 거래 ${fresh.filter((c) => c.active).length}곳`} />
      <Kpi en="ACTIVE" label="이번 달 거래처" value={String(aNow)} unit="곳" delta={aPrev ? pctChange(aNow, aPrev) : undefined} deltaLabel="전월 대비" spark={a.map((m) => m.n)} />
      <Kpi en="NEW REVENUE" label="신규 거래처 최근 달 매출" money={freshRev} foot="12개월 신규 합계" />
      <Kpi en="CHURNED" label="끊긴 거래처" value={String(st.churn.length)} unit="곳" foot={`월평균 매출 ${fmtMoney(lostM)}`} />
    </ExecKpis>
    <ExecGrid cols="minmax(0,1fr) minmax(0,1fr)">
      <ExecPanel en="NEW CLIENTS" title="월별 신규 거래처" sub="그달 첫 오더가 들어온 거래처 수 · 막대를 누르면 목록">
        <ResponsiveContainer width="100%" height={compact ? 200 : 230}>
          <BarChart data={newData} margin={{ top: 22, right: 6, left: 0, bottom: 0 }} onClick={(s) => { const i = clickIdx(s); if (i != null) setSel(sel === newData[i].m ? null : newData[i].m); }} barCategoryGap="26%">
            <GradDefs />
            <CartesianGrid {...chartTheme.grid} />
            <XAxis dataKey="k" {...AX} tick={monthTick(selRow?.k ?? newData[newData.length - 1]?.k)} interval={compact ? 1 : 0} height={26} />
            <YAxis {...AX} width={30} allowDecimals={false} />
            <Tooltip cursor={chartTheme.cursor} content={({ active, payload }) => (active && payload?.length ? <TipBox title={ymKo(payload[0].payload.m)} rows={[["신규 거래처", EX.gold, `${payload[0].payload.v}곳`]]} foot={payload[0].payload.names.slice(0, 4).join(", ") || null} /> : null)} />
            <Bar dataKey="v" radius={[6, 6, 0, 0]} maxBarSize={38} style={{ cursor: "pointer" }} isAnimationActive={false}>
              {newData.map((d, i) => <Cell key={d.m} fill={(sel ? d.m === sel : i === newData.length - 1) ? "url(#exaGold)" : "url(#exaIce)"} />)}
              <LabelList dataKey="v" content={(p) => (p.value ? <text x={p.x + p.width / 2} y={p.y - 7} textAnchor="middle" fontSize={11.5} fontWeight={800} fill={EX.sub} style={EX_NUM}>{p.value}</text> : null)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 min-h-[24px] text-[13px]" style={{ color: EX.sub }}>
          {selRow ? <><b style={{ color: EX.goldHi }}>{ymKo(selRow.m)} 신규</b> <span style={{ wordBreak: "keep-all" }}>{selRow.names.join(", ") || "없음"}</span></> : <span style={{ color: EX.mute }}>막대를 누르면 그달 새로 들어온 거래처를 봅니다.</span>}
        </div>
      </ExecPanel>
      <ExecPanel en="ACTIVE CLIENTS" title="거래처 수 추이" sub="그달 오더가 한 건이라도 있었던 거래처 · 최근 12개월">
        <ResponsiveContainer width="100%" height={compact ? 200 : 230}>
          <ComposedChart data={actData} margin={{ top: 22, right: 18, left: 0, bottom: 0 }}>
            <GradDefs />
            <CartesianGrid {...chartTheme.grid} />
            <XAxis dataKey="k" {...AX} interval={compact ? 2 : 1} height={26} />
            <YAxis {...AX} width={34} allowDecimals={false} domain={[0, "auto"]} />
            <Tooltip cursor={{ stroke: "rgba(215,188,130,.35)", strokeDasharray: "3 4" }} content={({ active, payload }) => (active && payload?.length ? <TipBox title={ymKo(payload[0].payload.m)} rows={[["거래처", EX.gold, `${payload[0].payload.v}곳`]]} /> : null)} />
            <Area dataKey="v" stroke={EX.gold} strokeWidth={2.4} fill="url(#exaGoldArea)" dot={false} activeDot={{ r: 5 }} isAnimationActive={false}>
              <LabelList dataKey="v" content={(p) => (p.index === actData.length - 1 ? <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={12.5} fontWeight={900} fill={EX.goldHi} style={EX_NUM}>{p.value}곳</text> : null)} />
            </Area>
          </ComposedChart>
        </ResponsiveContainer>
      </ExecPanel>
    </ExecGrid>
    <ExecPanel en="RAMP-UP" title="신규 거래처 매출 램프업" sub={`첫 오더 달부터 3개월 매출 · 최근 달 합계 ${mn(freshRev)}만원 · 증감은 전월 대비`}>
      {!fresh.length ? <Empty text="최근 12개월에 새로 들어온 거래처가 없습니다" /> : <ExecTable cols={rampCols} rows={ramp} rowKey={(r) => r.n} maxHeight={520} />}
    </ExecPanel>
    <ExecPanel en="CHURN WATCH" title="끊긴 거래처" sub="60일 넘게 오더 없음 · 3건 이상 거래했던 곳 · 월평균 매출 큰 순 · 단위 만원">
      <div id="exa-churn">
        {!st.churn.length ? <Empty text="끊긴 거래처가 없습니다" /> : st.churn.map((c, i) => (
          <div key={c.n} className="grid items-baseline gap-3 py-2.5" style={{ gridTemplateColumns: compact ? "minmax(0,1fr) auto" : "minmax(0,1fr) 150px 150px 120px", borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>
            <span className="min-w-0 truncate text-[13.5px] font-extrabold" style={{ color: EX.text }}>{c.n}</span>
            {!compact && <span className="text-[12.5px] font-semibold" style={{ ...EX_NUM, color: EX.mute }}>마지막 오더 {dot(c.last).slice(2)}</span>}
            {!compact && <span className="text-right text-[13.5px] font-black" style={{ ...EX_NUM, color: EX.text }}><span className="text-[12px] font-bold mr-1.5" style={{ color: EX.mute }}>월평균</span>{mn(c.monthly)}</span>}
            <span className="text-right"><Chip tone="warn">{c.gap}일째 없음</Chip></span>
          </div>
        ))}
      </div>
    </ExecPanel>
  </>);
}

// ═════════════════════════ 사업계획(📑 2026-11-08) ═════════════════════════
//  최종 승인된 사업계획서 · 예산 대비 집행액(관련 사업계획으로 연결된 지출결의서·구매요청서·법인카드 사용보고의 승인 금액)
//  읽기: firestore.rules — 임원(직책·임원 부서·임원 역할)은 같은 회사 사업계획서와 사업계획에 연결된 문서를 읽는다
function useBizPlans(company, demo) {
  const uid = auth.currentUser?.uid || "";
  const mine = useApprovals(demo ? "" : uid);
  const [co, setCo] = React.useState(null);
  React.useEffect(() => {
    if (demo || !company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("form", "==", "bizplan")),
      (snap) => setCo(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCo([]));
  }, [company, demo]);
  const plans = React.useMemo(() => {
    if (demo) return bizPlanDemo(company).plans;
    const m = new Map(); [...(co || []), ...(mine || []).filter((d) => d.form === "bizplan" && d.company === company)].forEach((d) => m.set(d.id, d));
    return [...m.values()].filter((d) => d.form === "bizplan" && d.status === "approved");
  }, [demo, co, mine, company]);
  const ids = plans.map((p) => p.id).sort().join(",");
  const [exps, setExps] = React.useState({});
  React.useEffect(() => {
    if (demo || !company || !ids) return undefined;
    const list = ids.split(",");
    const offs = [];
    for (let i = 0; i < list.length; i += 30) {
      const chunk = list.slice(i, i + 30); const k = `c${i}`;
      offs.push(onSnapshot(query(collection(db, "approvals"), where("company", "==", company), where("planId", "in", chunk)),
        (snap) => setExps((p) => ({ ...p, [k]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })), () => setExps((p) => ({ ...p, [k]: [] }))));
    }
    return () => offs.forEach((f) => f());
  }, [company, ids, demo]);
  const expenses = React.useMemo(() => (demo ? bizPlanDemo(company).expenses : [...new Map(Object.values(exps).flat().concat((mine || []).filter((d) => d.planId)).map((d) => [d.id, d])).values()]), [demo, exps, mine, company]);
  return { plans, expenses, loading: !demo && co === null };
}
const rateStr = (r) => (r == null ? "—" : `${r.toFixed(r >= 100 ? 0 : 1)}%`);
const PLAN_TONE = { over: "up", run: "gold", ready: "ice", done: "mute" };
function PlanBar({ ex }) {
  const w = ex.rate == null ? 0 : Math.min(100, ex.rate);
  return (
    <div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ex.rate || 0)} aria-label="예산 대비 집행률"><Meter value={w} max={100} color={ex.over ? EX.danger : EX.gold} height={7} /></div>
      <div className="mt-1.5 flex justify-between text-[12px] font-bold">
        <span style={{ color: EX.mute }}>집행률</span>
        <b style={{ ...EX_NUM, color: ex.over ? EX.danger : EX.text }}>{rateStr(ex.rate)}{ex.over ? ` · ${mn(ex.spent - ex.budget)}만원 초과` : ""}</b>
      </div>
    </div>
  );
}
function PlanTab({ company, demo, today, W, compact }) {
  const { plans, expenses, loading } = useBizPlans(company, demo);
  const [sel, setSel] = React.useState(null);
  const rows = React.useMemo(() => plans.map((p) => { const ex = planExecution(p, expenses); return { ...p, ex, st: planStatus(p, today, ex) }; })
    .sort((a, b) => Number(b.st.key === "over") - Number(a.st.key === "over") || String(b.data?.period?.start || "").localeCompare(String(a.data?.period?.start || ""))), [plans, expenses, today]);
  const tot = rows.reduce((a, r) => ({ budget: a.budget + r.ex.budget, spent: a.spent + r.ex.spent, pend: a.pend + r.ex.pendingAmt }), { budget: 0, spent: 0, pend: 0 });
  const overN = rows.filter((r) => r.ex.over).length;
  const runN = rows.filter((r) => r.st.key === "run").length;
  const cur = rows.find((r) => r.id === sel);
  const cols = W >= 1400 ? 3 : W >= 760 ? 2 : 1;
  return (<>
    {rows.length > 0 && <Brief tone={overN ? "warn" : "gold"} basis="최종 승인된 사업계획서 · 연결된 지출 문서의 승인 금액">
      승인된 사업계획 <B>{rows.length}건</B>(진행 중 {runN}건)의 예산 <B>{fmtEokMan(tot.budget)}</B> 가운데 <B>{rateStr(tot.budget ? (tot.spent / tot.budget) * 100 : null)}</B>를 집행했습니다.
      {" "}{overN ? <>예산을 넘긴 계획이 <B color={EX.danger}>{overN}건</B> 있습니다.</> : "예산을 넘긴 계획은 없습니다."}
    </Brief>}
    <ExecKpis min={196}>
      <Kpi accent en="BUDGET" label="총 예산" money={tot.budget} foot={`승인된 계획 ${rows.length}건`} />
      <Kpi en="SPENT" label="집행액" money={tot.spent} foot={tot.budget ? `예산의 ${rateStr((tot.spent / tot.budget) * 100)}` : "예산 없음"} />
      <Kpi en="REMAINING" label="남은 예산" money={tot.budget - tot.spent} foot={tot.pend ? `결재 중 지출 ${fmtMoney(tot.pend)}` : "결재 중 지출 없음"} />
      <Kpi en="OVER BUDGET" label="예산 초과" value={String(overN)} unit="건" foot={`진행 중 ${runN}건`} />
    </ExecKpis>
    <ExecPanel en="BUSINESS PLANS" title="사업계획별 예산 집행" sub="최종 승인된 사업계획서 · 집행액은 관련 사업계획으로 연결된 지출 문서의 승인 금액 · 단위 만원 · 누르면 상세">
      {loading && !rows.length ? <Empty text="불러오는 중입니다" /> : !rows.length ? <Empty text="최종 승인된 사업계획서가 아직 없습니다" sub="전자결재 › 업무 기안 · 품의 › 사업계획서로 올릴 수 있습니다." /> : (
        <div data-testid="exa-plan-cards" className="grid gap-3 md:gap-4" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => setSel(r.id)} data-testid="exa-plan-card" data-over={r.ex.over ? "1" : "0"}
              className="text-left rounded-[20px] p-4 md:p-5 grid gap-3 min-w-0 transition hover:-translate-y-0.5"
              style={{ background: r.ex.over ? "rgba(255,122,107,.06)" : "rgba(255,255,255,.03)", border: `1px solid ${r.ex.over ? "rgba(255,122,107,.4)" : EX.line}` }}>
              <div className="flex justify-between gap-3 items-start">
                <b className="text-[15.5px] font-black leading-snug min-w-0" style={{ color: EX.text, wordBreak: "keep-all" }}>{r.data?.name || r.title}</b>
                <Chip tone={PLAN_TONE[r.st.key] || "mute"}>{r.st.label}</Chip>
              </div>
              <div className="text-[12.5px] font-semibold" style={{ ...EX_NUM, color: EX.mute }}>{r.data?.period?.start ? `${dot(r.data.period.start)} ~ ${dot(r.data.period.end)}` : "기간 미정"}{r.data?.dept || r.data?.owner ? ` · ${[r.data.dept, r.data.owner].filter(Boolean).join(" ")}` : ""}</div>
              <div className="grid grid-cols-3 gap-2">
                {[["예산", r.ex.budget], ["집행액", r.ex.spent], ["잔액", r.ex.remain]].map(([l, v]) => (
                  <div key={l} className="min-w-0"><div className="text-[11.5px] font-bold" style={{ color: EX.mute }}>{l}</div><b className="text-[16px] font-black" style={{ ...EX_NUM, color: l === "잔액" && v < 0 ? EX.danger : l === "집행액" ? EX.goldHi : EX.text }}>{mn(v)}</b></div>
                ))}
              </div>
              <PlanBar ex={r.ex} />
              <div className="text-[12px] font-semibold" style={{ color: EX.mute }}>승인 지출 {r.ex.count}건{r.ex.pendingCount ? ` · 결재 중 ${r.ex.pendingCount}건 ${mn(r.ex.pendingAmt)}만원` : ""}{r.ex.paid ? ` · 지급 완료 ${mn(r.ex.paid)}만원` : ""}</div>
            </button>
          ))}
        </div>
      )}
      <Basis>지출결의서 · 구매요청서 · 법인카드 사용보고를 쓸 때 ‘관련 사업계획’을 고르면 여기 집행액에 더해집니다.</Basis>
    </ExecPanel>
    {cur && <PlanDetail r={cur} company={company} demo={demo} compact={compact} onClose={() => setSel(null)} />}
  </>);
}
function PlanDetail({ r, company, demo, compact, onClose }) {
  const uid = auth.currentUser?.uid || "";
  const part = !demo && (r.participants || []).includes(uid);
  const openFull = () => { window.__kpOpenApproval = { id: r.id, page: "inbox" }; window.dispatchEvent(new Event("kp-open-approval")); onClose(); };
  const docs = [...r.ex.docs.map((d) => ({ ...d, _st: d.paid?.at ? "지급 완료" : "승인" })), ...r.ex.pendingDocs.map((d) => ({ ...d, _st: "결재 중" }))].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  return (
    <Modal label="사업계획 상세" testId="exa-plan-detail" onClose={onClose} compact={compact} width={920}>
      <div className="flex justify-between gap-3 items-start">
        <div className="min-w-0"><div className="text-[10.5px] font-extrabold tracking-[0.28em]" style={{ color: EX.gold }}>BUSINESS PLAN</div><h2 className="mt-1 text-[20px] md:text-[22px] font-black" style={{ color: EX.text, wordBreak: "keep-all" }}>{r.data?.name || r.title}</h2><div className="mt-1 text-[12.5px] font-semibold" style={{ color: EX.mute }}>{r.docNo} · 기안 {r.drafter?.name || "—"} · {r.st.label}</div></div>
        <div className="flex gap-2 shrink-0">{part && <ExecButton kind="gold" onClick={openFull}>결재 문서 열기</ExecButton>}<ExecButton onClick={onClose}>닫기</ExecButton></div>
      </div>
      <div className="grid gap-2.5 mt-5" style={{ gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))" }}>
        <MiniStat label="예산" value={cm(r.ex.budget)} unit="원" />
        <MiniStat label="집행액" value={cm(r.ex.spent)} unit="원" color={EX.goldHi} />
        <MiniStat label="잔액" value={cm(r.ex.remain)} unit="원" color={r.ex.remain < 0 ? EX.danger : undefined} />
        <MiniStat label="집행률" value={rateStr(r.ex.rate)} color={r.ex.over ? EX.danger : undefined} />
      </div>
      <div className="mt-4"><PlanBar ex={r.ex} /></div>
      <SubHead right="단위 원">연결된 지출 {docs.length}건</SubHead>
      {!docs.length ? <Empty text="아직 연결된 지출이 없습니다" /> : (
        <div data-testid="exa-plan-expenses">
          {docs.map((d, i) => (
            <div key={d.id} className="flex gap-3 items-baseline py-2.5 text-[13.5px]" style={{ borderTop: i ? "1px solid rgba(255,255,255,.06)" : 0 }}>
              <span className="w-12 shrink-0 text-[12.5px] font-semibold" style={{ ...EX_NUM, color: EX.mute }}>{(() => { const ms = tsMs(d.createdAt); return ms ? md(new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)) : ""; })()}</span>
              <span className="flex-1 min-w-0 truncate font-bold" style={{ color: EX.text }}>{d.title || d.formLabel}<span className="font-semibold text-[12.5px]" style={{ color: EX.mute }}> · {d.formLabel}</span></span>
              <Chip tone={d._st === "결재 중" ? "warn" : d._st === "지급 완료" ? "ok" : "ice"}>{d._st}</Chip>
              <b className="w-[110px] shrink-0 text-right font-black" style={{ ...EX_NUM, color: EX.text }}>{cm(d.amount)}</b>
            </div>
          ))}
        </div>
      )}
      <div className="mt-5"><Paper><ApprovalDocPreview d={r} company={company} /></Paper></div>
    </Modal>
  );
}

// ═════════════════════════ 결재 대기 ═════════════════════════
const CAT_L = { expense: "지출", leave: "근태", report: "보고 · 품의", hr: "인사", contract: "계약" };
const H48 = 48 * 3600e3;
const ageStr = (ms) => { const h = Math.max(0, (Date.now() - ms) / 3600e3); return h < 1 ? "1시간 미만" : h < 24 ? `${Math.floor(h)}시간` : `${Math.floor(h / 24)}일 ${Math.floor(h % 24)}시간`; };
const ageTone = (ms) => { const h = (Date.now() - ms) / 3600e3; return h >= 48 ? EX.danger : h >= 24 ? EX.warn : EX.ok; };
function useCompanyApprovals(company, enabled) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!enabled || !company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [company, enabled]);
  return rows;
}
export function ExecApprovalQueue({ company, me = {} }) {
  const demo = demoOn() ? execAnalyticsDemo(company) : null;
  const uid = demo ? demo.me.uid : me?.uid;
  const mineList = useApprovals(demo ? "" : uid);
  const coList = useCompanyApprovals(company, !demo);
  const all = React.useMemo(() => {
    if (demo) return demo.approvals;
    const m = new Map(); [...(coList || []), ...(mineList || [])].forEach((d) => m.set(d.id, d)); return [...m.values()];
  }, [demo, coList, mineList]);
  const [ref, W] = useBoxWidth(1200);
  const compact = W < 640; const wide = W >= 1100;
  const [scope, setScope] = React.useState("mine");
  const [order, setOrder] = React.useState("old");
  const [prev, setPrev] = React.useState(null);
  const pending = all.filter((d) => d.status === "pending" || (d.status === "approved" && d.cancel?.status === "pending"));
  const mine = pending.filter((d) => myTurn(d, uid));
  const list = (scope === "mine" ? mine : pending).map((d) => {
    const isCancel = d.status === "approved";
    const ln = isCancel ? d.cancel.line : d.line; const st = isCancel ? d.cancel.step : d.step;
    return { ...d, n: d.id, who: ln?.[st]?.name || "—", whoPos: ln?.[st]?.position || "", created: tsMs(d.createdAt), amt: Number(d.amount) || 0, isCancel, mineTurn: myTurn(d, uid), part: (d.participants || []).includes(uid), stepN: (st || 0) + 1, lineN: ln?.length || 0 };
  }).sort((a, b) => (order === "amt" ? b.amt - a.amt : order === "new" ? b.created - a.created : a.created - b.created));
  const sum = (l) => l.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const lateL = (l) => l.filter((d) => Date.now() - tsMs(d.createdAt) > H48);
  const mineLate = lateL(mine).length; const allLate = lateL(pending).length;
  const byCat = Object.entries(pending.reduce((m, d) => { const k = CAT_L[d.cat] || "기타"; const e = m[k] || (m[k] = { n: 0, amt: 0 }); e.n += 1; e.amt += Number(d.amount) || 0; return m; }, {})).sort((a, b) => b[1].n - a[1].n);
  const ageB = [["24시간 이내", 0, 24, EX.ok], ["1~2일", 24, 48, EX.warn], ["2일 넘음", 48, Infinity, EX.danger]].map(([l, a, b, c]) => [l, pending.filter((d) => { const h = (Date.now() - tsMs(d.createdAt)) / 3600e3; return h >= a && h < b; }).length, c]);
  const oldest = mine.length ? Math.min(...mine.map((d) => tsMs(d.createdAt))) : 0;
  const open = (d) => {
    if (d.part && !demo) { window.__kpOpenApproval = { id: d.id, page: "inbox" }; window.dispatchEvent(new Event("kp-open-approval")); return; }
    setPrev(d);
  };
  const grid = wide ? "6px minmax(0,1fr) 110px 150px 120px 112px 104px" : "6px minmax(0,1fr) auto";
  return (
    <ExecPage testId="exec-approvals" en="APPROVAL QUEUE" title="결재 대기" sub="결재하실 차례인 문서와 회사 전체에서 기다리는 문서 · 누르면 바로 열립니다">
      <div ref={ref} className="min-w-0 space-y-4 md:space-y-5">
        <Brief tone={mineLate ? "warn" : "gold"} basis={`${mdDow(kstToday())} 현재 · 결재 취소 요청 포함`}>
          {mine.length ? <>결재하실 문서가 <B>{mine.length}건</B>{sum(mine) ? <>(금액 {fmtEokMan(sum(mine))})</> : ""} 있습니다.{" "}{mineLate ? <>이 중 <B color={EX.warn}>{mineLate}건</B>은 48시간 넘게 기다리고 있습니다.</> : "모두 48시간 안에 올라온 문서입니다."}</> : "지금 결재하실 문서는 없습니다."}
          {" "}회사 전체로는 <B>{pending.length}건</B>이 결재를 기다리고 있습니다.
        </Brief>
        <ExecKpis min={200}>
          <Kpi accent en="MY TURN" label="내 차례" value={String(mine.length)} unit="건" foot={sum(mine) ? `금액 ${fmtMoney(sum(mine))}` : "금액 없는 문서"} onClick={() => setScope("mine")} />
          <Kpi en="MY TURN · 48H+" label="내 차례 중 48시간 초과" value={String(mineLate)} unit="건" foot={mine.length ? `가장 오래 ${ageStr(oldest)}` : "기다리는 문서 없음"} />
          <Kpi en="COMPANY-WIDE" label="회사 전체 대기" value={String(pending.length)} unit="건" foot={sum(pending) ? `금액 ${fmtMoney(sum(pending))}` : "—"} onClick={() => setScope("all")} />
          <Kpi en="COMPANY · 48H+" label="전체 중 48시간 초과" value={String(allLate)} unit="건" foot="결재 지연 문서" />
        </ExecKpis>
        <ExecGrid cols="minmax(0,1fr) 340px">
          <ExecPanel en="QUEUE" title={scope === "mine" ? "내 차례 문서" : "회사 전체 대기 문서"} sub={order === "old" ? "오래 기다린 순" : order === "amt" ? "금액 큰 순" : "최근 올라온 순"}
            right={<ExecTabs size="sm" items={[["mine", "내 차례", mine.length], ["all", "회사 전체", pending.length]]} value={scope} onChange={setScope} />}>
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {[["old", "오래 기다린 순"], ["amt", "금액 큰 순"], ["new", "최근 순"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setOrder(k)} className="h-9 px-3 rounded-xl text-[12.5px] font-extrabold" style={order === k ? { background: "rgba(215,188,130,.14)", color: EX.goldHi, border: `1px solid ${EX.lineHi}` } : { color: EX.sub, border: `1px solid ${EX.line}` }}>{l}</button>
              ))}
              <span className="ml-auto inline-flex items-center gap-3 text-[11.5px] font-bold" style={{ color: EX.mute }}>{[["24시간 이내", EX.ok], ["1~2일", EX.warn], ["2일 넘음", EX.danger]].map(([l, c]) => <span key={l} className="inline-flex items-center gap-1"><span className="w-1.5 h-3 rounded-full" style={{ background: c }} />{l}</span>)}</span>
            </div>
            {!list.length ? <Empty text={scope === "mine" ? "결재하실 문서가 없습니다" : "기다리는 결재가 없습니다"} sub="새 문서가 올라오면 이곳에 바로 나타납니다." /> : (
              <div data-testid="exa-ap-table">
                {wide && (
                  <div className="grid items-center gap-4 px-3 pb-2 text-[11.5px] font-extrabold tracking-[0.03em]" style={{ gridTemplateColumns: grid, color: EX.mute, borderBottom: `1px solid ${EX.line}` }}>
                    <span /><span>문서</span><span>기안자</span><span>지금 결재자</span><span className="text-right">금액(원)</span><span className="text-right">기다린 시간</span><span />
                  </div>
                )}
                {list.map((r) => {
                  const tone = ageTone(r.created); const late = Date.now() - r.created > H48;
                  return (
                    <div key={r.id} role="button" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === "Enter") open(r); }}
                      className="grid items-center gap-x-4 gap-y-2 px-3 py-3.5 cursor-pointer rounded-xl hover:bg-white/[0.04] transition"
                      style={{ gridTemplateColumns: grid, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                      <span className="self-stretch w-1.5 rounded-full" style={{ background: tone, boxShadow: late ? `0 0 10px ${tone}88` : "none" }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {r.isCancel && <Chip tone="warn">결재 취소</Chip>}
                          <b className="truncate text-[14.5px] font-extrabold" style={{ color: EX.text }}>{r.title || r.formLabel}</b>
                        </div>
                        <div className="mt-0.5 text-[12px] font-semibold truncate" style={{ color: EX.mute }}>
                          {r.formLabel}{r.docNo ? ` · ${r.docNo}` : ""}{r.lineN ? ` · ${r.stepN}/${r.lineN}단계` : ""}
                          {!wide && <> · {r.drafter?.name || "—"} 기안{r.amt ? <> · <span style={EX_NUM}>{cm(r.amt)}원</span></> : ""}</>}
                        </div>
                      </div>
                      {wide && <span className="text-[13.5px] font-bold truncate" style={{ color: EX.sub }}>{r.drafter?.name || "—"}</span>}
                      {wide && <span className="text-[13.5px] font-bold truncate">{r.mineTurn ? <Chip tone="gold">나</Chip> : <span style={{ color: EX.sub }}>{r.who}{r.whoPos ? <span style={{ color: EX.mute }}> {r.whoPos}</span> : ""}</span>}</span>}
                      {wide && <span className="text-right text-[14px] font-black" style={{ ...EX_NUM, color: r.amt ? EX.text : EX.faint }}>{r.amt ? cm(r.amt) : "—"}</span>}
                      <span className={`text-right text-[13px] font-extrabold whitespace-nowrap ${wide ? "" : "row-start-1 col-start-3"}`} style={{ ...EX_NUM, color: late ? EX.danger : tone === EX.warn ? EX.warn : EX.sub }}>{ageStr(r.created)}</span>
                      <span className={`flex justify-end ${wide ? "" : "col-start-2 col-span-2"}`}>
                        <ExecButton kind={r.mineTurn ? "gold" : "ghost"} onClick={(e) => { e.stopPropagation(); open(r); }} className="!h-9"><span data-testid="exa-ap-open">{r.mineTurn ? "결재하기" : "보기"}</span></ExecButton>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ExecPanel>
          <div className="grid gap-4 md:gap-5 content-start min-w-0">
            <ExecPanel en="AGING" title="대기 시간" sub="회사 전체 대기 문서 · 올라온 때부터">
              <div className="flex h-3 w-full overflow-hidden rounded-full gap-[2px]">
                {ageB.filter((x) => x[1] > 0).map(([l, n, c]) => <div key={l} style={{ width: `${(n / (pending.length || 1)) * 100}%`, background: c, opacity: 0.85 }} />)}
                {!pending.length && <div className="w-full" style={{ background: "rgba(255,255,255,.07)" }} />}
              </div>
              <div className="mt-3 space-y-2">
                {ageB.map(([l, n, c]) => (
                  <div key={l} className="flex items-baseline justify-between text-[13px]">
                    <span className="inline-flex items-center gap-2 font-bold" style={{ color: EX.sub }}><span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}</span>
                    <b className="font-black" style={{ ...EX_NUM, color: EX.text }}>{n}<span className="ml-0.5 text-[12px] font-bold" style={{ color: EX.mute }}>건</span></b>
                  </div>
                ))}
              </div>
            </ExecPanel>
            <ExecPanel en="BY CATEGORY" title="종류별 대기" sub="회사 전체 · 건수 큰 순 · 금액 단위 만원">
              <RankBars rows={byCat.map(([k, v]) => ({ key: k, label: k, value: v.n, sub: v.amt ? `${mn(v.amt)}만원` : "" }))} valueFmt={(v) => `${v}건`} color={EX.ice} empty="기다리는 문서가 없습니다" />
            </ExecPanel>
          </div>
        </ExecGrid>
        {prev && <ApPreview d={prev} company={company} onClose={() => setPrev(null)} compact={compact} />}
      </div>
    </ExecPage>
  );
}
function ApPreview({ d, company, onClose, compact }) {
  return (
    <Modal label="결재 문서 미리보기" onClose={onClose} compact={compact} width={880}>
      <div className="flex justify-between gap-3 items-start">
        <div className="min-w-0">
          <div className="text-[10.5px] font-extrabold tracking-[0.28em]" style={{ color: EX.gold }}>DOCUMENT · READ ONLY</div>
          <h2 className="mt-1 text-[20px] md:text-[22px] font-black" style={{ color: EX.text, wordBreak: "keep-all" }}>{d.title || d.formLabel}</h2>
          <div className="mt-1 text-[12.5px] font-semibold" style={{ color: EX.mute }}>{d.formLabel} · 기안 {d.drafter?.name || "—"}{d.amount ? <> · <span style={EX_NUM}>{cm(d.amount)}원</span></> : ""} · 읽기 전용</div>
        </div>
        <ExecButton onClick={onClose}>닫기</ExecButton>
      </div>
      {d.summary && <p className="mt-4 text-[14px] font-medium leading-relaxed" style={{ color: EX.sub }}>{d.summary}</p>}
      <div className="mt-4"><Paper><ApprovalDocPreview d={d} company={company} /></Paper></div>
      {!d.part && <Basis>결재선에 들어 있지 않은 문서라 이곳에서는 보기만 할 수 있습니다. 결재는 지금 결재자가 처리합니다.</Basis>}
    </Modal>
  );
}
