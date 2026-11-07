// ======================= src/ExecAnalytics.jsx =======================
// 📈 2026-11-08 임원 화면 새 메뉴 — 경영 분석(손익 · 거래처 · 기사·차량 · 단가 · 현금흐름 · 영업) · 결재 대기
//  · 보는 사람: 기존 임원 판정 그대로(PC isExec · 모바일 isExecM → 임원 화면 메뉴에서만 연다)
//  · 화면 규칙: 일일 경영 보고와 같은 부품·글자(본문 16px · 라벨 15px · 핵심 숫자 크게) · 증감은 글자색만(상승 빨강 ▲ · 하락 파랑 ▼)
//  · 데이터(모두 읽기만, 임원 역할이 이미 읽을 수 있는 컬렉션):
//    오더 = 매출관리와 같은 salesDispatchData(+ 화면이 열릴 때 지난 13개월을 loadRange로 불러옴) · 차량 = drivers(등급 지입·직영·임대)
//    장부 = acctLedger · 고정비 = acctRecurring · 자금 = acctFunds(computeFunds) · 수금 = acctPayments · 결재 = approvals(회사 전체: isCompanyAdmin에 임원 역할 포함)
//  · 계산은 src/execAnalyticsCore.js(순수 함수) · 차트는 src/execCharts.js
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { useOrderHistory } from "./orderHistory";
import { useCompanyRows } from "./companyColStore";
import { loadAcctPayments } from "./acctPayments";
import { computeFunds, isCredit } from "./fundsCalc";
import { isDemoOn } from "./devDemoData";
import { execAnalyticsDemo } from "./execAnalyticsDemo";
import { myTurn, useApprovals, ApprovalDocPreview } from "./Approval";
import { C } from "./dailyReportCharts";
import { addDay, kstToday, fmt, man, eok, md, dateOf, toWon, isBizDay, rangeDays, dayDiff, mdDow } from "./dailyReportCore";
import { Delta, Card, Measure, Svg, Seg, Legend, useWidth, EBX_CSS } from "./DailyReport";
import { plMonthly, receivables, dsoOf, clientTable, vehicleTable, priceWatch, cashForecast, salesTrend, liveRows, fleetIndex, monthsBack, ymOf, COGS_ACCOUNTS } from "./execAnalyticsCore";
import { plBars, lines, cashLine, countBars } from "./execCharts";

const demoOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const won = (v) => `${fmt(man(v))}만`;
const pct = (v, dp = 1) => (v == null || !Number.isFinite(v) ? "–" : `${v.toFixed(dp)}%`);
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);
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

// ─────────────────────────── 공용 ───────────────────────────
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
function Stat({ l, v, u, sub, d, dUnit, compact, tone }) {
  return (
    <div className="ebx-card" style={{ padding: compact ? "16px 16px" : "22px 24px", minWidth: 0 }}>
      <div style={{ fontSize: compact ? 15 : 17, color: C.t2, fontWeight: 700 }}>{l}</div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}><span className="ebx-num" style={{ fontSize: compact ? 28 : 38, fontWeight: 800, lineHeight: 1.15, color: tone || C.t1 }}>{v}</span>{u && <span style={{ fontSize: compact ? 15 : 17, color: C.t2, fontWeight: 600 }}>{u}</span>}</div>
      {(sub || d !== undefined) && <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 15, color: C.t2 }}>{sub && <span>{sub}</span>}{d !== undefined && <Delta v={d} unit={dUnit || "%"} size={16} />}</div>}
    </div>
  );
}
const Stats = ({ items, compact, cols }) => <section style={{ display: "grid", gridTemplateColumns: `repeat(${compact ? 2 : cols || items.length},minmax(0,1fr))`, gap: compact ? 10 : 16 }}>{items.map((x) => <Stat key={x.l} compact={compact} {...x} />)}</section>;
const Empty = ({ children }) => <div style={{ padding: "28px 4px", fontSize: 16, color: C.t2 }}>{children}</div>;
const Note = ({ children }) => <p style={{ marginTop: 14, fontSize: 15, color: C.t3, lineHeight: 1.6, wordBreak: "keep-all" }}>{children}</p>;

// 정렬되는 표 — PC는 표, 좁은 화면은 카드(제목 + 주요 값)
function SortTable({ cols, rows, sort, setSort, onRow, selKey, rowKey = (r) => r.n, compact, limit = 0, testId }) {
  const sorted = React.useMemo(() => {
    const c = cols.find((x) => x.k === sort.k); if (!c) return rows;
    const g = c.get || ((r) => r[c.k]);
    return [...rows].sort((a, b) => { const x = g(a), y = g(b); const v = typeof x === "string" ? String(x).localeCompare(String(y), "ko") : (x ?? -Infinity) - (y ?? -Infinity); return sort.dir === "asc" ? v : -v; });
  }, [rows, cols, sort]);
  const [more, setMore] = React.useState(false);
  const cap = limit || (compact && !more ? 10 : 0); // 휴대폰은 10개 먼저
  const shown = cap ? sorted.slice(0, cap) : sorted;
  const cell = (c, r) => (c.cell ? c.cell(r) : r[c.k]);
  if (compact) {
    return (
      <div data-testid={testId} style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <span className="ebx-lbl">정렬</span>
          <Seg value={sort.k} onChange={(k) => setSort({ k, dir: sort.k === k && sort.dir === "desc" ? "asc" : "desc" })} items={cols.filter((c) => c.sort !== false && c.num).slice(0, 4).map((c) => [c.k, c.short || c.l])} />
        </div>
        {shown.map((r) => {
          const k = rowKey(r); const Tag = onRow ? "button" : "div";
          return (
            <Tag key={k} type={onRow ? "button" : undefined} className="exa-mcard" onClick={onRow ? () => onRow(r) : undefined} style={selKey === k ? { background: "#EEF3FC" } : null}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}><b style={{ fontSize: 17, fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell(cols[0], r)}</b>{cols[1] && <span className="ebx-num" style={{ fontSize: 17 }}>{cell(cols[1], r)}</span>}</div>
              <div className="exa-kv">{cols.slice(2).filter((c) => !c.hideCompact).map((c) => <div key={c.k} style={{ display: "flex", justifyContent: "space-between", gap: 8, minWidth: 0 }}><span>{c.short || c.l}</span><b className="ebx-num" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{cell(c, r)}</b></div>)}</div>
            </Tag>
          );
        })}
        {!limit && sorted.length > shown.length && <button type="button" className="ebx-link" style={{ width: "100%", marginTop: 8, height: 46 }} onClick={() => setMore(true)}>전체 {sorted.length}개 보기</button>}
      </div>
    );
  }
  return (
    <div data-testid={testId} style={{ overflowX: "auto", marginTop: 14, maxHeight: limit ? undefined : 640, overflowY: limit ? undefined : "auto", borderRadius: 12 }}>
      <table className="exa-tbl">
        <thead><tr>{cols.map((c) => <th key={c.k} className={c.num ? "num" : ""} style={c.w ? { width: c.w } : null} aria-sort={sort.k === c.k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>{c.sort === false ? c.l : <button type="button" onClick={() => setSort({ k: c.k, dir: sort.k === c.k && sort.dir === "desc" ? "asc" : "desc" })}>{c.l}<span style={{ color: sort.k === c.k ? C.n3 : "#C3CAD6", fontSize: 12 }}>{sort.k === c.k ? (sort.dir === "asc" ? "▲" : "▼") : "▼"}</span></button>}</th>)}</tr></thead>
        <tbody>{shown.map((r) => { const k = rowKey(r); return <tr key={k} className={`${onRow ? "click" : ""} ${selKey === k ? "on" : ""}`} onClick={onRow ? () => onRow(r) : undefined}>{cols.map((c) => <td key={c.k} className={c.num ? "num" : ""}>{cell(c, r)}</td>)}</tr>; })}</tbody>
      </table>
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
  return { demo, today, rows, fleet, ledger: demo ? demo.ledger : ledgerLive || [], recurring: demo ? demo.recurring : recurLive || [], funds: demo ? demo.funds : fundsLive || [], arPay };
}

// ─────────────────────────── 경영 분석(탭) ───────────────────────────
export const ANALYSIS_TABS = [["pl", "손익"], ["client", "거래처"], ["fleet", "기사·차량"], ["price", "단가"], ["cash", "현금흐름"], ["sales", "영업"]];
export default function ExecAnalysis({ company, dispatchData = [], drivers = [], loadRange, initialTab, canCash = false }) {
  // ⭐ 2026-11-08 현금흐름(자금 잔액)은 대표 직책만 — 자금현황 메뉴와 같은 기준
  const tabs = canCash ? ANALYSIS_TABS : ANALYSIS_TABS.filter(([k]) => k !== "cash");
  const [tab0, setTab] = React.useState(() => { try { return initialTab || sessionStorage.getItem("kpExecAnaTab") || "pl"; } catch { return initialTab || "pl"; } });
  const tab = tabs.some(([k]) => k === tab0) ? tab0 : "pl";
  const go = (k) => { setTab(k); try { sessionStorage.setItem("kpExecAnaTab", k); } catch { /* 무시 */ } };
  const data = useExecData({ company, dispatchData, drivers, loadRange, cash: canCash });
  return (
    <ExecShell testId="exec-analysis" en="MANAGEMENT ANALYTICS" title="경영 분석" sub={`${company || ""} · 오더·장부·자금 기준 · ${mdDow(data.today)} 현재`}
      right={<div data-testid="exa-tabs"><Seg dark value={tab} onChange={go} items={tabs} /></div>}>
      {(v) => (
        tab === "pl" ? <PlTab {...data} {...v} />
          : tab === "client" ? <ClientTab {...data} {...v} />
            : tab === "fleet" ? <FleetTab {...data} {...v} />
              : tab === "price" ? <PriceTab {...data} {...v} />
                : tab === "cash" && canCash ? <CashTab {...data} {...v} />
                  : <SalesTab {...data} {...v} />
      )}
    </ExecShell>
  );
}

// ── 손익 ──
function PlTab({ rows, fleet, ledger, recurring, today, compact, wide }) {
  const months = React.useMemo(() => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return monthsBack(d.toISOString().slice(0, 7), 12); }, [today]); // 마감된 12개월(이번 달은 진행 중이라 뺌)
  const pl = React.useMemo(() => plMonthly({ rows, fleet, ledger, recurring, months }), [rows, fleet, ledger, recurring, months]);
  const [sel, setSel] = React.useState(months.length - 1); // 지난달(마감된 달)
  const cur = pl[sel] || pl[pl.length - 1]; const prev = pl[sel - 1];
  const sum = (k) => pl.reduce((s, m) => s + m[k], 0);
  const tot = { sale: sum("sale"), op: sum("op") };
  const accs = Object.entries(cur.sga).sort((a, b) => b[1] - a[1]);
  const costRows = [["기사 운임(소속 차량)", cur.own], ["용차 운임", cur.hire], ...accs];
  const costMax = Math.max(1, ...costRows.map((x) => x[1]));
  return (<>
    <Stats compact={compact} items={[
      { l: `${Number(cur.m.slice(5, 7))}월 매출`, v: fmt(man(cur.sale)), u: "만원", d: prev ? (prev.sale ? ((cur.sale - prev.sale) / prev.sale) * 100 : null) : undefined, sub: "전월 대비" },
      { l: "매입(운임)", v: fmt(man(cur.cost)), u: "만원", sub: `용차 ${cur.cost ? ((cur.hire / cur.cost) * 100).toFixed(0) : 0}%`, d: prev && prev.cost ? ((cur.cost - prev.cost) / prev.cost) * 100 : undefined },
      { l: "판관비", v: fmt(man(cur.sgaTotal)), u: "만원", sub: cur.est ? "고정비로 추정" : "장부 기준", d: prev && prev.sgaTotal ? ((cur.sgaTotal - prev.sgaTotal) / prev.sgaTotal) * 100 : undefined },
      { l: "영업이익", v: fmt(man(cur.op)), u: "만원", sub: `이익률 ${cur.om.toFixed(1)}%`, d: prev ? cur.om - prev.om : undefined, dUnit: "%p" },
      { l: "최근 12개월 매출", v: (tot.sale / 1e8).toFixed(1), u: "억원", sub: `영업이익 ${eok(tot.op)}원 · ${tot.sale ? ((tot.op / tot.sale) * 100).toFixed(1) : "0.0"}%` },
    ]} cols={5} />
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1.55fr) minmax(0,1fr)" : "1fr", gap: compact ? 14 : 20, alignItems: "start" }}>
      <Card compact={compact} title="월별 손익 추이" sub="마감된 최근 12개월 · 매출 억원 · 영업이익 만원 · 막대를 누르면 그달 비용 구성을 봅니다" right={<Legend items={[[C.n3, "선택한 달"], ["#B8C8E6", "다른 달"]]} />}>
        <Measure style={{ marginTop: 16 }}>{(w) => <div style={{ position: "relative" }}>
          <Svg html={plBars(w, pl, { compact })} />
          <div style={{ position: "absolute", inset: `0 12px 0 ${compact ? 46 : 62}px`, display: "grid", gridTemplateColumns: `repeat(${pl.length},1fr)` }}>{pl.map((m, i) => <button key={m.m} type="button" aria-label={`${m.m} 보기`} onClick={() => setSel(i)} style={{ background: i === sel ? "rgba(143,176,240,.12)" : "transparent", border: 0, cursor: "pointer", borderRadius: 8 }} />)}</div>
        </div>}</Measure>
        <Note>매출 = 청구운임 · 매입 = 기사운임(소속 차량은 기사 운임, 그 외 용차) · 판관비 = 장부 지출에서 운송 원가 계정({COGS_ACCOUNTS.slice(0, 3).join("·")} 등) 제외 · 장부가 없는 달은 고정비로 추정 · 이번 달은 진행 중이라 넣지 않음</Note>
      </Card>
      <Card compact={compact} title={`${Number(cur.m.slice(5, 7))}월 비용 구성`} sub={`매출 ${won(cur.sale)} 중 비용 ${won(cur.cost + cur.sgaTotal)}${cur.est ? " · 판관비 추정" : ""}`}>
        <div style={{ marginTop: 14 }}>
          {costRows.map(([k, v], i) => (
            <div key={k} className={i ? "ebx-row" : ""} style={{ padding: "11px 0", display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr) auto" : "minmax(0,170px) minmax(0,1fr) 110px 60px", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 16, color: i < 2 ? C.t1 : C.t2, fontWeight: i < 2 ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
              {!compact && <div className="exa-bar"><i style={{ width: `${(v / costMax) * 100}%`, background: i < 2 ? C.n3 : "#8EA6D3" }} /></div>}
              <span className="ebx-num" style={{ textAlign: "right", fontSize: 16 }}>{won(v)}</span>
              {!compact && <span className="ebx-num" style={{ textAlign: "right", fontSize: 15, color: C.t2, fontWeight: 500 }}>{cur.sale ? ((v / cur.sale) * 100).toFixed(1) : "0.0"}%</span>}
            </div>
          ))}
        </div>
        <div className="ebx-row" style={{ marginTop: 6, paddingTop: 14, display: "flex", justifyContent: "space-between", fontSize: 17 }}><b>영업이익</b><b className="ebx-num" style={{ fontSize: 20 }}>{won(cur.op)} <span style={{ fontSize: 15, color: C.t2, fontWeight: 600 }}>({cur.om.toFixed(1)}%)</span></b></div>
      </Card>
    </div>
    <Card compact={compact} title="이익률 추이" sub="매출총이익률(매출 − 매입) · 영업이익률(− 판관비) · 최근 12개월" right={<Legend items={[[C.s1, "매출총이익률"], [C.n1, "영업이익률"]]} />}>
      <Measure style={{ marginTop: 14 }}>{(w) => <Svg html={lines(w, compact ? 230 : 260, pl.map((m) => `${Number(m.m.slice(5, 7))}월`), [{ name: "총이익률", color: C.s1, vals: pl.map((m) => (m.sale ? m.gm : null)) }, { name: "영업이익률", color: C.n1, vals: pl.map((m) => (m.sale ? m.om : null)) }], { compact, labelEvery: compact ? 2 : 1 })} />}</Measure>
    </Card>
  </>);
}

// ── 거래처 ──
const PERIODS = [["30", "최근 30일"], ["90", "최근 3개월"], ["365", "최근 12개월"]];
function periodOf(today, k) { const n = Number(k); const to = today; const from = addDay(today, -(n - 1)); return { from, to, pFrom: addDay(from, -n), pTo: addDay(from, -1), n }; }
const RiskTag = ({ v }) => <span className={`exa-tag ${v === "높음" ? "hi" : v === "주의" ? "mid" : ""}`}>{v}</span>;
function ClientTab({ rows, arPay, today, compact, W }) {
  const wide = W >= 1600; // 표가 넓어 옆 칸은 1600px 이상에서만
  const [pk, setPk] = React.useState("90");
  const P = periodOf(today, pk);
  const rec = React.useMemo(() => receivables(rows, arPay, today), [rows, arPay, today]);
  const list = React.useMemo(() => clientTable(rows, P.from, P.to, P.pFrom, P.pTo, rec), [rows, P.from, P.to, P.pFrom, P.pTo, rec]);
  const [sort, setSort] = React.useState({ k: "sale", dir: "desc" });
  const [sel, setSel] = React.useState(null);
  const tot = list.reduce((a, c) => ({ sale: a.sale + c.sale, profit: a.profit + c.profit, out: a.out + c.ar.outstanding, o30: a.o30 + c.ar.over30 }), { sale: 0, profit: 0, out: 0, o30: 0 });
  const top5 = [...list].sort((a, b) => b.sale - a.sale).slice(0, 5).reduce((s, c) => s + c.sale, 0);
  const cur = list.find((c) => c.n === sel) || null;
  const cols = [
    { k: "n", l: "거래처", cell: (r) => <span style={{ fontWeight: 700 }}>{r.n}</span> },
    { k: "sale", l: "매출", num: true, cell: (r) => won(r.sale) },
    { k: "profit", l: "이익", num: true, cell: (r) => won(r.profit) },
    { k: "margin", l: "이익률", num: true, cell: (r) => pct(r.margin) },
    { k: "avg", l: "평균 단가", short: "단가", num: true, cell: (r) => won(r.avg) },
    { k: "cnt", l: "건수", num: true, cell: (r) => `${fmt(r.cnt)}건` },
    { k: "dSale", l: "매출 증감", short: "증감", num: true, get: (r) => r.dSale ?? -999, cell: (r) => (r.dSale == null ? <span style={{ color: C.flat }}>신규</span> : <Delta v={r.dSale} size={16} />) },
    { k: "avgAge", l: "평균 미수일", short: "미수일", num: true, get: (r) => r.ar.avgAge, cell: (r) => (r.ar.outstanding ? `${Math.round(r.ar.avgAge)}일` : "–") },
    { k: "over30", l: "30일+ 미수", short: "30일+", num: true, get: (r) => r.ar.over30, cell: (r) => (r.ar.over30 ? won(r.ar.over30) : "–") },
    { k: "risk", l: "입금 지연 위험", short: "위험", get: (r) => ({ 높음: 2, 주의: 1, 정상: 0 }[r.risk]), cell: (r) => <RiskTag v={r.risk} /> },
  ];
  return (<>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><span className="ebx-lbl">기간</span><Seg value={pk} onChange={(k) => { setPk(k); }} items={PERIODS} /><span className="ebx-sub">{md(P.from)}~{md(P.to)} · 증감은 바로 앞 같은 기간 대비</span></div>
    <Stats compact={compact} items={[
      { l: "거래처", v: fmt(list.length), u: "곳", sub: `상위 5곳 비중 ${tot.sale ? ((top5 / tot.sale) * 100).toFixed(0) : 0}%` },
      { l: "매출", v: fmt(man(tot.sale)), u: "만원", sub: `이익률 ${pct(tot.sale ? (tot.profit / tot.sale) * 100 : 0)}` },
      { l: "미수금", v: fmt(man(tot.out)), u: "만원", sub: arPay ? "올해 청구 − 수금" : "수금 기록 없음" },
      { l: "30일 넘은 미수", v: fmt(man(tot.o30)), u: "만원", tone: tot.o30 ? C.err : undefined, sub: `위험 높음 ${list.filter((c) => c.risk === "높음").length}곳` },
    ]} />
    <div style={{ display: "grid", gridTemplateColumns: wide && cur ? "minmax(0,1.7fr) minmax(360px,1fr)" : "1fr", gap: compact ? 14 : 20, alignItems: "start" }}>
      <Card compact={compact} title="거래처 수익성" sub="제목을 누르면 정렬 · 줄을 누르면 노선별 상세">
        {!list.length ? <Empty>이 기간에 오더가 없습니다.</Empty> : <SortTable testId="exa-client-table" cols={cols} rows={list} sort={sort} setSort={setSort} onRow={(r) => { setSel(r.n === sel ? null : r.n); if (!wide) setTimeout(() => document.getElementById("exa-client-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} selKey={sel} compact={compact} />}
      </Card>
      {cur && <ClientDetail c={cur} compact={compact} onClose={() => setSel(null)} />}
    </div>
  </>);
}
function ClientDetail({ c, compact, onClose }) {
  return (
    <Card compact={compact} title={c.n} sub={`매출 ${won(c.sale)} · 이익률 ${pct(c.margin)} · ${fmt(c.cnt)}건 · 마지막 오더 ${c.last ? md(c.last) : "-"}`} right={<button type="button" className="ebx-link" onClick={onClose}>닫기</button>} id="exa-client-detail">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 16 }}>
        {[["평균 단가", won(c.avg), c.dAvg], ["이익률", pct(c.margin), c.pMargin != null ? c.margin - c.pMargin : null, "%p"], ["미수금", won(c.ar.outstanding)], ["평균 미수일", c.ar.outstanding ? `${Math.round(c.ar.avgAge)}일` : "–"]].map(([l, v, d, u]) => (
          <div key={l} className="ebx-stat"><div className="ebx-lbl">{l}</div><div className="ebx-num" style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{v}</div>{d !== undefined && <div style={{ marginTop: 2 }}><Delta v={d} unit={u || "%"} size={15} /></div>}</div>
        ))}
      </div>
      <h3 className="ebx-h3" style={{ marginTop: 22 }}>노선별</h3>
      <div style={{ marginTop: 8 }}>
        {c.routes.slice(0, 8).map((r, i) => (
          <div key={r.rt} className={i ? "ebx-row" : ""} style={{ padding: "11px 0", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 14, alignItems: "baseline", fontSize: 16 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.rt} <span style={{ color: C.t3, fontSize: 15 }}>{r.cnt}건</span></span>
            <span className="ebx-num">{won(r.sale)}</span>
            <span className="ebx-num" style={{ color: r.sale && r.profit / r.sale < 0.08 ? C.err : C.t2, fontWeight: 600, minWidth: 56, textAlign: "right" }}>{pct(r.sale ? (r.profit / r.sale) * 100 : 0)}</span>
          </div>
        ))}
      </div>
      {c.ar.outstanding > 0 && <>
        <h3 className="ebx-h3" style={{ marginTop: 22 }}>미수 나이</h3>
        {(() => { const b = { "30일 이내": 0, "31~60일": 0, "61~90일": 0, "90일 넘음": 0 }; c.ar.open.forEach((o) => { b[o.age <= 30 ? "30일 이내" : o.age <= 60 ? "31~60일" : o.age <= 90 ? "61~90일" : "90일 넘음"] += o.amt; }); return Object.entries(b).map(([k, v], i) => <div key={k} className={i ? "ebx-row" : ""} style={{ padding: "10px 0", display: "flex", justifyContent: "space-between", fontSize: 16 }}><span style={{ color: C.t2 }}>{k}</span><b className="ebx-num" style={{ color: v && k !== "30일 이내" ? C.err : C.t1 }}>{won(v)}</b></div>); })()}
      </>}
    </Card>
  );
}

// ── 기사·차량 ──
function FleetTab({ rows, fleet, today, compact, W }) {
  const wide = W >= 1600; // 표가 넓어 옆 칸은 1600px 이상에서만
  const [pk, setPk] = React.useState("30");
  const [type, setType] = React.useState("");
  const P = periodOf(today, pk);
  const list = React.useMemo(() => vehicleTable(rows, fleet, P.from, P.to), [rows, fleet, P.from, P.to]);
  const shown = list.filter((v) => !type || v.type === type);
  const [sort, setSort] = React.useState({ k: "profit", dir: "desc" });
  const idle = list.filter((v) => !v.last || dayDiff(v.last, today) >= 7).sort((a, b) => (a.last || "").localeCompare(b.last || ""));
  const byType = ["지입", "직영", "임대"].map((t) => { const l = list.filter((v) => v.type === t); const s = l.reduce((a, v) => ({ sale: a.sale + v.sale, profit: a.profit + v.profit, util: a.util + v.util }), { sale: 0, profit: 0, util: 0 }); return { t, n: l.length, ...s, util: l.length ? s.util / l.length : 0 }; });
  const avgUtil = list.length ? list.reduce((s, v) => s + v.util, 0) / list.length : 0;
  const cols = [
    { k: "plate", l: "차량", get: (r) => r.plate, cell: (r) => <span style={{ fontWeight: 700 }}>{r.plate} <span style={{ color: C.t2, fontWeight: 500 }}>{r.name}</span></span> },
    { k: "profit", l: "이익", num: true, cell: (r) => won(r.profit) },
    { k: "type", l: "구분", cell: (r) => <span className="exa-tag">{r.type}</span> },
    { k: "sale", l: "매출", num: true, cell: (r) => won(r.sale) },
    { k: "pay", l: "기사 운임", short: "운임", num: true, cell: (r) => won(r.pay) },
    { k: "margin", l: "이익률", num: true, cell: (r) => pct(r.margin) },
    { k: "days", l: "가동일수", short: "가동일", num: true, cell: (r) => `${r.days}일` },
    { k: "util", l: "가동률", num: true, cell: (r) => <span style={{ color: r.util < 50 ? C.err : C.t1 }}>{pct(r.util, 0)}</span> },
    { k: "last", l: "마지막 운행", short: "최근 운행", cell: (r) => (r.last ? md(r.last) : "없음") },
  ];
  if (!fleet.size) return <Card compact={compact} title="기사·차량 수익성"><Empty>기사관리에 등급(지입·직영·임대)이 있는 소속 차량이 없습니다.</Empty></Card>;
  return (<>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><span className="ebx-lbl">기간</span><Seg value={pk} onChange={setPk} items={PERIODS} /><Seg value={type} onChange={setType} items={[["", "전체"], ["지입", "지입"], ["직영", "직영"], ["임대", "임대"]]} /><span className="ebx-sub">영업일 {list[0]?.bizDays || 0}일 기준 가동률</span></div>
    <Stats compact={compact} items={[
      { l: "소속 차량", v: fmt(list.length), u: "대", sub: byType.map((x) => `${x.t} ${x.n}`).join(" · ") },
      { l: "평균 가동률", v: avgUtil.toFixed(0), u: "%", sub: `가동일 ÷ 영업일` },
      { l: "소속 차량 이익", v: fmt(man(list.reduce((s, v) => s + v.profit, 0))), u: "만원", sub: `매출 ${won(list.reduce((s, v) => s + v.sale, 0))}` },
      { l: "쉬는 차량", v: fmt(idle.length), u: "대", tone: idle.length ? C.err : undefined, sub: "7일 넘게 운행 없음" },
    ]} />
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1.7fr) minmax(340px,1fr)" : "1fr", gap: compact ? 14 : 20, alignItems: "start" }}>
      <Card compact={compact} title="차량별 수익성" sub="소속 차량(지입·직영·임대) · 제목을 누르면 정렬">
        <SortTable testId="exa-fleet-table" cols={cols} rows={shown} sort={sort} setSort={setSort} rowKey={(r) => r.key} compact={compact} />
      </Card>
      <div style={{ display: "grid", gap: compact ? 14 : 20 }}>
        <Card compact={compact} title="구분별" sub="평균 가동률 · 이익">
          {byType.map((x, i) => (
            <div key={x.t} className={i ? "ebx-row" : ""} style={{ padding: "13px 0", marginTop: i ? 0 : 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}><b>{x.t} <span style={{ color: C.t2, fontWeight: 500 }}>{x.n}대</span></b><span className="ebx-num">{won(x.profit)}</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px", gap: 10, alignItems: "center", marginTop: 8 }}><div className="exa-bar"><i style={{ width: `${Math.min(100, x.util)}%` }} /></div><span className="ebx-num" style={{ textAlign: "right", fontSize: 15 }}>{x.util.toFixed(0)}%</span></div>
            </div>
          ))}
        </Card>
        <Card compact={compact} title="쉬는 차량" sub="7일 넘게 운행 기록 없음 · 오래된 순" id="exa-idle">
          {!idle.length ? <Empty>모든 차량이 최근 7일 안에 운행했습니다.</Empty> : idle.map((v, i) => (
            <div key={v.key} className={i ? "ebx-row" : ""} style={{ padding: "12px 0", marginTop: i ? 0 : 8, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 16 }}>
              <span style={{ minWidth: 0 }}><b>{v.plate}</b> <span style={{ color: C.t2 }}>{v.name} · {v.type}</span></span>
              <b className="ebx-num" style={{ color: C.err, whiteSpace: "nowrap" }}>{v.last ? `${dayDiff(v.last, today)}일째` : "기록 없음"}</b>
            </div>
          ))}
        </Card>
      </div>
    </div>
  </>);
}

// ── 단가 ──
function PriceTab({ rows, today, compact, W }) {
  const wide = W >= 1600; // 표가 넓어 옆 칸은 1600px 이상에서만
  const cur = [addDay(today, -27), today]; const prev = [addDay(today, -83), addDay(today, -28)];
  const pw = React.useMemo(() => priceWatch(rows, cur, prev), [rows, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = React.useState("route");
  const [sort, setSort] = React.useState({ k: "d", dir: "desc" });
  const base = (view === "route" ? pw.routes : pw.clients).filter((x) => x.cnt >= 5 && x.pCnt >= 5 && x.d != null).map((x) => ({ ...x, absD: Math.abs(x.d) }));
  const warn = pw.routes.filter((x) => x.cnt >= 5 && (x.margin < 8 || (x.pMargin != null && x.margin - x.pMargin <= -3))).sort((a, b) => a.margin - b.margin);
  const up = base.filter((x) => x.d >= 3).length; const dn = base.filter((x) => x.d <= -3).length;
  const cols = [
    { k: "k", l: view === "route" ? "노선 · 톤수" : "거래처", get: (r) => r.k, cell: (r) => <span style={{ fontWeight: 700 }}>{view === "route" ? <>{r.rt} <span style={{ color: C.t2, fontWeight: 500 }}>{r.ton}</span></> : r.n}</span> },
    { k: "d", l: "단가 변동", num: true, get: (r) => r.absD, cell: (r) => <Delta v={r.d} size={16} /> },
    { k: "avg", l: "최근 4주 단가", short: "지금 단가", num: true, cell: (r) => won(r.avg) },
    { k: "pAvg", l: "직전 8주 단가", short: "전 단가", num: true, cell: (r) => won(r.pAvg) },
    { k: "cnt", l: "건수", num: true, cell: (r) => `${r.cnt}건` },
    { k: "margin", l: "이익률", num: true, cell: (r) => <span style={{ color: r.margin < 8 ? C.err : C.t1 }}>{pct(r.margin)}</span> },
  ];
  return (<>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><Seg value={view} onChange={setView} items={[["route", "노선별"], ["client", "거래처별"]]} /><span className="ebx-sub">최근 4주({md(cur[0])}~{md(cur[1])}) 평균 단가 vs 직전 8주 · 양쪽 5건 이상만</span></div>
    <Stats compact={compact} items={[
      { l: "비교한 " + (view === "route" ? "노선" : "거래처"), v: fmt(base.length), u: "곳" },
      { l: "단가 오름 (3% 이상)", v: fmt(up), u: "곳", tone: up ? C.up : undefined },
      { l: "단가 내림 (3% 이상)", v: fmt(dn), u: "곳", tone: dn ? C.down : undefined },
      { l: "저마진 경고 노선", v: fmt(warn.length), u: "곳", tone: warn.length ? C.err : undefined, sub: "이익률 8% 미만 또는 3%p 넘게 하락" },
    ]} />
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1.6fr) minmax(360px,1fr)" : "1fr", gap: compact ? 14 : 20, alignItems: "start" }}>
      <Card compact={compact} title="단가 변동" sub="변동 큰 순(오름·내림 모두) · 제목을 누르면 정렬">
        {!base.length ? <Empty>비교할 만큼 오더가 쌓인 {view === "route" ? "노선" : "거래처"}이 없습니다.</Empty> : <SortTable testId="exa-price-table" cols={cols} rows={base} sort={sort} setSort={setSort} rowKey={(r) => r.k} compact={compact} />}
      </Card>
      <Card compact={compact} title="저마진 노선 조기 경고" sub="최근 4주 5건 이상 · 이익률 낮은 순" id="exa-lowmargin">
        {!warn.length ? <Empty>경고할 노선이 없습니다.</Empty> : warn.slice(0, 12).map((r, i) => (
          <div key={r.k} className={i ? "ebx-row" : ""} style={{ padding: "13px 0", marginTop: i ? 0 : 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 16 }}><b style={{ minWidth: 0 }}>{r.rt} <span style={{ color: C.t2, fontWeight: 500 }}>{r.ton}</span></b><b className="ebx-num" style={{ color: C.err }}>{pct(r.margin)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 15, color: C.t2, marginTop: 4 }}><span>{r.cnt}건 · 매출 {won(r.sale)}</span><span>{r.pMargin != null ? <>직전 {pct(r.pMargin)} <Delta v={r.margin - r.pMargin} unit="%p" size={15} /></> : "직전 기록 없음"}</span></div>
          </div>
        ))}
      </Card>
    </div>
  </>);
}

// ── 현금흐름 ──
function CashTab({ rows, ledger, recurring, funds, arPay, today, compact, wide }) {
  const [weeks, setWeeks] = React.useState(8);
  const F = React.useMemo(() => (funds.length ? computeFunds(funds, ledger) : null), [funds, ledger]);
  const rec = React.useMemo(() => receivables(rows, arPay, today), [rows, arPay, today]);
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
  if (!F && !fc.totOut && !fixedMonth) return <Card compact={compact} title="현금흐름 예측"><Empty>자금관리에 계좌가 없고 미수·고정비 기록도 없어 예측할 수 없습니다.</Empty></Card>;
  const big = (w) => [...w.list].sort((a, b) => b.amt - a.amt).slice(0, 3);
  return (<>
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}><span className="ebx-lbl">기간</span><Seg value={String(weeks)} onChange={(k) => setWeeks(Number(k))} items={[["4", "4주"], ["6", "6주"], ["8", "8주"]]} /><span className="ebx-sub">안전 잔액 = 한 달 고정비 {won(safe)}</span></div>
    {lowWeeks.length > 0 && <div className="ebx-card" data-testid="exa-cash-warn" style={{ padding: compact ? "16px" : "18px 24px", borderColor: "#F3C2BD" }}>
      <b style={{ fontSize: 18, color: C.err }}>잔액 주의</b>
      <span style={{ fontSize: 16, color: C.t1, marginLeft: 10, wordBreak: "keep-all" }}>{lowWeeks.map((w) => `${md(w.a)} 주`).join(", ")}에 잔액이 안전 잔액보다 낮아질 수 있습니다. 가장 낮을 때 {eok(fc.min.bal)}원.</span>
    </div>}
    <Stats compact={compact} items={[
      { l: "지금 보유 자금", v: fmt(man(fc.start)), u: "만원", sub: F ? "통장·현금(카드 한도·대출 제외)" : "자금 계좌 없음" },
      { l: `${weeks}주 예상 수금`, v: fmt(man(inSum)), u: "만원", sub: `미수 ${won(fc.totOut)} · 평균 입금 ${Math.round(fc.wDso)}일` },
      { l: `${weeks}주 예상 지출`, v: fmt(man(outSum)), u: "만원", sub: "고정비·운송료·카드 대금" },
      { l: `${weeks}주 뒤 잔액`, v: fmt(man(endBal)), u: "만원", d: fc.start ? ((endBal - fc.start) / Math.abs(fc.start)) * 100 : null, sub: "지금 대비" },
      { l: "가장 낮은 잔액", v: fmt(man(fc.min.bal)), u: "만원", tone: fc.min.bal < safe ? C.err : undefined, sub: `${md(fc.min.d)} 주` },
    ]} cols={5} />
    <Card compact={compact} title="잔액 예측" sub="주별 가장 낮은 잔액(실선) · 주 끝 잔액(점선) · 빨간 점 = 안전 잔액 아래" right={<Legend items={[[C.n3, "주 최저 잔액"], ["#9FB0CF", "주 끝 잔액", true], [C.err, "안전 잔액", true]]} />}>
      <Measure style={{ marginTop: 14 }}>{(w) => <Svg html={cashLine(w, compact ? 250 : 300, fc.weeks, fc.start, safe, { compact })} />}</Measure>
    </Card>
    <Card compact={compact} title="주별 입출금 예정" sub="큰 금액 순 3건까지">
      <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(4,minmax(0,1fr))" : compact ? "1fr" : "repeat(2,minmax(0,1fr))", gap: compact ? 10 : 14, marginTop: 14 }}>
        {fc.weeks.map((w) => (
          <div key={w.a} className="ebx-stat" style={w.low < safe ? { boxShadow: `inset 0 0 0 1.5px ${C.err}` } : null}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 16 }}>{md(w.a)}~{md(w.b)}</b><b className="ebx-num" style={{ fontSize: 16, color: w.low < safe ? C.err : C.t1 }}>{eok(w.end)}</b></div>
            <div style={{ display: "flex", gap: 14, fontSize: 15, color: C.t2, marginTop: 4 }}><span>수금 <b className="ebx-num" style={{ color: C.t1 }}>{won(w.in)}</b></span><span>지출 <b className="ebx-num" style={{ color: C.t1 }}>{won(w.out)}</b></span></div>
            <div style={{ marginTop: 8, display: "grid", gap: 4 }}>{big(w).map((e, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 15 }}><span style={{ color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{md(e.d)} {e.label}</span><span className="ebx-num" style={{ color: e.kind === "in" ? C.t1 : C.t2, whiteSpace: "nowrap" }}>{e.kind === "in" ? "+" : "−"}{won(e.amt)}</span></div>)}{!w.list.length && <span style={{ fontSize: 15, color: C.t3 }}>예정 없음</span>}</div>
          </div>
        ))}
      </div>
      <Note>가정: 미수는 청구일 + 거래처 평균 입금 기간(미수 ÷ 최근 90일 일평균 매출, 15~120일)에 들어오고, 이미 지난 미수는 이번 주 50% · 다음 주 30%만 넣습니다. 앞으로 생길 매출은 평균 입금 기간 뒤부터 들어옵니다. 고정비·급여는 자금관리 고정비 등록일, 카드 대금은 이번 달 사용액을 다음 달 15일, 기사 운송료는 최근 3개월 월평균({won(fc.drvPay)})을 매달 10일에 지급하는 것으로 봅니다(고정비에 운송료가 있으면 그 값을 씁니다).</Note>
    </Card>
  </>);
}

// ── 영업 ──
function SalesTab({ rows, today, compact, wide }) {
  const months = React.useMemo(() => monthsBack(today.slice(0, 7), 12), [today]);
  const st = React.useMemo(() => salesTrend(rows, today, months), [rows, today, months]);
  const [sel, setSel] = React.useState(null);
  const fresh = st.fresh;
  const freshRev = fresh.reduce((s, c) => s + (c.ramp.filter((v) => v != null).slice(-1)[0] || 0), 0);
  const lostM = st.churn.reduce((s, c) => s + c.monthly, 0);
  const recent3 = st.perMonth.slice(-3).reduce((s, m) => s + m.n.length, 0);
  const prev3 = st.perMonth.slice(-6, -3).reduce((s, m) => s + m.n.length, 0);
  return (<>
    <Stats compact={compact} items={[
      { l: "최근 3개월 신규", v: fmt(recent3), u: "곳", d: prev3 ? ((recent3 - prev3) / prev3) * 100 : null, sub: "직전 3개월 대비" },
      { l: "12개월 신규", v: fmt(fresh.length), u: "곳", sub: `지금도 거래 ${fresh.filter((c) => c.active).length}곳` },
      { l: "이번 달 거래처", v: fmt(st.activeBy[st.activeBy.length - 1]?.n || 0), u: "곳", d: st.activeBy[st.activeBy.length - 2]?.n ? (((st.activeBy[st.activeBy.length - 1].n - st.activeBy[st.activeBy.length - 2].n) / st.activeBy[st.activeBy.length - 2].n) * 100) : null, sub: "전월 대비" },
      { l: "끊긴 거래처", v: fmt(st.churn.length), u: "곳", tone: st.churn.length ? C.err : undefined, sub: `60일 넘게 오더 없음 · 월 ${won(lostM)}` },
    ]} />
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1fr) minmax(0,1fr)" : "1fr", gap: compact ? 14 : 20, alignItems: "start" }}>
      <Card compact={compact} title="월별 신규 거래처" sub="그달 첫 오더가 들어온 거래처 수 · 막대를 누르면 목록">
        <Measure style={{ marginTop: 14 }}>{(w) => <div style={{ position: "relative" }}>
          <Svg html={countBars(w, compact ? 200 : 230, st.perMonth.map((m) => [`${Number(m.m.slice(5, 7))}월`, m.n.length]), { compact })} />
          <div style={{ position: "absolute", inset: "0 10px 0 10px", display: "grid", gridTemplateColumns: `repeat(${st.perMonth.length},1fr)` }}>{st.perMonth.map((m) => <button key={m.m} type="button" aria-label={`${m.m} 신규 거래처`} onClick={() => setSel(sel === m.m ? null : m.m)} style={{ background: sel === m.m ? "rgba(143,176,240,.14)" : "transparent", border: 0, cursor: "pointer", borderRadius: 8 }} />)}</div>
        </div>}</Measure>
        {sel && <div style={{ marginTop: 10, fontSize: 16 }}><b>{Number(sel.slice(5, 7))}월 신규</b> <span style={{ color: C.t2 }}>{(st.perMonth.find((m) => m.m === sel)?.n || []).join(", ") || "없음"}</span></div>}
      </Card>
      <Card compact={compact} title="거래처 수 추이" sub="그달 오더가 있던 거래처">
        <Measure style={{ marginTop: 14 }}>{(w) => <Svg html={lines(w, compact ? 200 : 230, st.activeBy.map((m) => `${Number(m.m.slice(5, 7))}월`), [{ name: "거래처", color: C.n3, vals: st.activeBy.map((m) => m.n) }], { unit: "곳", compact, labelEvery: compact ? 3 : 2, min: 0, dp: 0 })} />}</Measure>
      </Card>
    </div>
    <Card compact={compact} title="신규 거래처 매출 램프업" sub={`첫 오더 달부터 3개월 매출 · 최근 달 합계 ${won(freshRev)}`}>
      {!fresh.length ? <Empty>최근 12개월에 새로 들어온 거래처가 없습니다.</Empty> : compact ? fresh.map((c) => (
        <div key={c.n} className="exa-mcard">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 17 }}>{c.n}</b><span className={`exa-tag ${c.active ? "" : "mid"}`}>{c.active ? "거래 중" : "뜸함"}</span></div>
          <div className="exa-kv"><div style={{ display: "flex", justifyContent: "space-between" }}><span>첫 오더</span><b className="ebx-num">{c.first.replace(/-/g, ".").slice(2)}</b></div><div style={{ display: "flex", justifyContent: "space-between" }}><span>누적</span><b className="ebx-num">{won(c.total)}</b></div>{c.ramp.map((v, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between" }}><span>{i + 1}개월째</span><b className="ebx-num">{v == null ? "–" : won(v)}</b></div>)}</div>
        </div>
      )) : (
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table className="exa-tbl"><thead><tr><th>거래처</th><th>첫 오더</th><th className="num">1개월째</th><th className="num">2개월째</th><th className="num">3개월째</th><th className="num">누적 매출</th><th className="num">건수</th><th>상태</th></tr></thead>
            <tbody>{fresh.map((c) => <tr key={c.n}><td style={{ fontWeight: 700 }}>{c.n}</td><td className="ebx-num" style={{ fontWeight: 500 }}>{c.first.replace(/-/g, ".")}</td>{c.ramp.map((v, i) => <td key={i} className="num">{v == null ? "–" : <>{won(v)}{i > 0 && c.ramp[i - 1] ? <span style={{ marginLeft: 8 }}><Delta v={((v - c.ramp[i - 1]) / c.ramp[i - 1]) * 100} dp={0} size={14} /></span> : null}</>}</td>)}<td className="num">{won(c.total)}</td><td className="num">{fmt(c.cnt)}건</td><td><span className={`exa-tag ${c.active ? "" : "mid"}`}>{c.active ? "거래 중" : "뜸함"}</span></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Card>
    <Card compact={compact} title="끊긴 거래처" sub="60일 넘게 오더 없음 · 3건 이상 거래했던 곳 · 월평균 매출 큰 순" id="exa-churn">
      {!st.churn.length ? <Empty>끊긴 거래처가 없습니다.</Empty> : st.churn.map((c, i) => (
        <div key={c.n} className={i ? "ebx-row" : ""} style={{ padding: "13px 0", marginTop: i ? 0 : 8, display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr) auto" : "minmax(0,1fr) 160px 160px 140px", gap: 12, alignItems: "baseline", fontSize: 16 }}>
          <b style={{ minWidth: 0 }}>{c.n}</b>
          {!compact && <span style={{ color: C.t2 }}>마지막 {c.last.replace(/-/g, ".")}</span>}
          {!compact && <span className="ebx-num" style={{ textAlign: "right" }}>월 {won(c.monthly)}</span>}
          <b className="ebx-num" style={{ color: C.err, textAlign: "right" }}>{c.gap}일째 없음</b>
        </div>
      ))}
    </Card>
  </>);
}

// ─────────────────────────── 결재 대기 ───────────────────────────
const CAT_L = { expense: "지출", leave: "근태", report: "보고·품의", hr: "인사", contract: "계약" };
const ageStr = (ms) => { const h = Math.max(0, (Date.now() - ms) / 3600e3); return h < 1 ? "방금" : h < 24 ? `${Math.floor(h)}시간` : `${Math.floor(h / 24)}일 ${Math.floor(h % 24)}시간`; };
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
  const [scope, setScope] = React.useState("mine");
  const [prev, setPrev] = React.useState(null);
  const pending = all.filter((d) => d.status === "pending" || (d.status === "approved" && d.cancel?.status === "pending"));
  const mine = pending.filter((d) => myTurn(d, uid));
  const list = (scope === "mine" ? mine : pending).map((d) => {
    const isCancel = d.status === "approved";
    const ln = isCancel ? d.cancel.line : d.line; const st = isCancel ? d.cancel.step : d.step;
    const ms = tsMs(d.updatedAt) || tsMs(d.createdAt);
    return { ...d, n: d.id, who: ln?.[st]?.name || "-", whoPos: ln?.[st]?.position || "", ms, created: tsMs(d.createdAt), amt: Number(d.amount) || 0, isCancel, mineTurn: myTurn(d, uid), part: (d.participants || []).includes(uid) };
  });
  const [sort, setSort] = React.useState({ k: "created", dir: "desc" });
  const sum = (l) => l.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const late = (l) => l.filter((d) => Date.now() - tsMs(d.createdAt) > 48 * 3600e3).length;
  const byCat = Object.entries(pending.reduce((m, d) => { const k = CAT_L[d.cat] || "기타"; const e = m[k] || (m[k] = { n: 0, amt: 0 }); e.n += 1; e.amt += Number(d.amount) || 0; return m; }, {})).sort((a, b) => b[1].n - a[1].n);
  const open = (d) => {
    if (d.part && !demo) { window.__kpOpenApproval = { id: d.id, page: "inbox" }; window.dispatchEvent(new Event("kp-open-approval")); return; }
    setPrev(d);
  };
  const cols = [
    { k: "title", l: "문서", get: (r) => r.title || "", cell: (r) => <span style={{ display: "inline-flex", flexDirection: "column", maxWidth: 420, whiteSpace: "normal" }}><b style={{ fontWeight: 700 }}>{r.isCancel ? "[결재 취소] " : ""}{r.title || r.formLabel}</b><span style={{ fontSize: 14, color: C.t2 }}>{r.formLabel} · {r.docNo || ""}</span></span> },
    { k: "amt", l: "금액", num: true, cell: (r) => (r.amt ? `${fmt(r.amt)}원` : "–") },
    { k: "drafter", l: "기안자", get: (r) => r.drafter?.name || "", cell: (r) => r.drafter?.name || "-" },
    { k: "who", l: "지금 결재자", short: "결재자", cell: (r) => <span>{r.mineTurn ? <b style={{ color: C.n3 }}>나</b> : `${r.who}${r.whoPos ? ` ${r.whoPos}` : ""}`}</span> },
    { k: "created", l: "기다린 시간", short: "대기", num: true, get: (r) => -r.created, cell: (r) => <span style={{ color: Date.now() - r.created > 48 * 3600e3 ? C.err : C.t1, fontWeight: 700 }}>{ageStr(r.created)}</span> },
    { k: "act", l: "", sort: false, hideCompact: true, cell: (r) => <button type="button" className="exa-open" onClick={(e) => { e.stopPropagation(); open(r); }} data-testid="exa-ap-open">{r.mineTurn ? "결재하기" : "보기"}</button> },
  ];
  return (
    <ExecShell testId="exec-approvals" en="APPROVAL QUEUE" title="결재 대기" sub="내 차례인 문서와 회사 전체 대기 문서 · 누르면 바로 열립니다">
      {({ compact, wide }) => (<>
        <Stats compact={compact} items={[
          { l: "내 차례", v: fmt(mine.length), u: "건", tone: mine.length ? C.n3 : undefined, sub: `금액 ${fmt(man(sum(mine)))}만원` },
          { l: "내 차례 48시간 넘음", v: fmt(late(mine)), u: "건", tone: late(mine) ? C.err : undefined, sub: mine.length ? `가장 오래 ${ageStr(Math.min(...mine.map((d) => tsMs(d.createdAt))))}` : "없음" },
          { l: "회사 전체 대기", v: fmt(pending.length), u: "건", sub: `금액 ${fmt(man(sum(pending)))}만원` },
          { l: "전체 48시간 넘음", v: fmt(late(pending)), u: "건", tone: late(pending) ? C.err : undefined },
        ]} />
        <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1fr) 340px" : "1fr", gap: compact ? 14 : 20, alignItems: "start" }}>
          <Card compact={compact} title={scope === "mine" ? "내 차례 문서" : "회사 전체 대기 문서"} sub="오래 기다린 순" right={<Seg value={scope} onChange={setScope} items={[["mine", `내 차례 ${mine.length}`], ["all", `전체 ${pending.length}`]]} />}>
            {!list.length ? <Empty>{scope === "mine" ? "내 차례인 결재가 없습니다." : "기다리는 결재가 없습니다."}</Empty> : <SortTable testId="exa-ap-table" cols={cols} rows={list} sort={sort} setSort={setSort} onRow={open} compact={compact} />}
          </Card>
          <Card compact={compact} title="종류별 대기" sub="회사 전체">
            {!byCat.length ? <Empty>없습니다.</Empty> : byCat.map(([k, v], i) => <div key={k} className={i ? "ebx-row" : ""} style={{ padding: "12px 0", marginTop: i ? 0 : 8, display: "flex", justifyContent: "space-between", fontSize: 16 }}><span>{k} <b className="ebx-num">{v.n}</b>건</span><b className="ebx-num">{v.amt ? won(v.amt) : "–"}</b></div>)}
          </Card>
        </div>
        {prev && <ApPreview d={prev} company={company} onClose={() => setPrev(null)} canOpen={prev.part && !demo} compact={compact} />}
      </>)}
    </ExecShell>
  );
}
function ApPreview({ d, company, onClose, compact }) {
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div data-kp-dialog role="dialog" aria-modal="true" aria-label="결재 문서 미리보기" style={{ position: "fixed", inset: 0, zIndex: 2147483400, background: "rgba(11,20,40,.55)", display: "flex", alignItems: compact ? "flex-end" : "center", justifyContent: "center", padding: compact ? 0 : 24 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ebx-card" style={{ width: "min(860px,100%)", maxHeight: compact ? "92vh" : "88vh", overflow: "auto", padding: compact ? 16 : 24, borderRadius: compact ? "20px 20px 0 0" : 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}><h2 className="ebx-h2">{d.title || d.formLabel}</h2><div className="ebx-sub" style={{ marginTop: 4 }}>{d.formLabel} · 기안 {d.drafter?.name || "-"}{d.amount ? ` · ${fmt(d.amount)}원` : ""} · 읽기 전용</div></div>
          <button type="button" className="ebx-link" onClick={onClose}>닫기</button>
        </div>
        {d.summary && <p style={{ marginTop: 12, fontSize: 16 }}>{d.summary}</p>}
        <div style={{ marginTop: 16 }}><ApprovalDocPreview d={d} company={company} /></div>
        {!d.part && <Note>결재선에 들어 있지 않은 문서라 여기서는 보기만 됩니다. 결재는 지금 결재자가 처리합니다.</Note>}
      </div>
    </div>
  );
}

