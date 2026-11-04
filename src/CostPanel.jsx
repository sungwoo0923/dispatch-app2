// ======================= src/CostPanel.jsx =======================
// 💰 관리센터 › 청구 › 비용 · 손익(2026-11-04, 최고관리자 전용) — "얼마 벌고, 얼마 쓰고, 몇 곳이면 남는가"
//  ① 손익 요약: 이달 매출(수납 관리 청구액 = 기본료 + 초과 + 추가 항목) vs 이달 지출(서버 변동비 + 고정비) → 순이익 · 이익률
//  ② 지출 항목별 월 비용: Firestore · Functions · Storage · Vercel · 도메인 · 앱 마켓 · Claude Code · 전자세금계산서 · 문자 · Tmap · Vision …
//  ③ 운송사별 원가: 회사 활동량(오더·직원·지입차·저장 용량 + 앱 표본 읽기/쓰기)으로 서버비를 나누고, 매출과 비교(적자만 빨간색)
//  ④ 손익분기: 회사 수 0~100곳일 때 매출·비용 곡선 + 손익분기점 · 현재 위치 + 시뮬레이터
//  ⑤ 서버 사용량: Cloud Monitoring 실측(1시간마다 · platformUsage) — 오늘·이달 읽기/쓰기 vs 무료량, 월말 예상 청구
//  · 단가·무료량·환율·고정비: [비용 기준 설정] → platformConfig/costModel (최고관리자만 — 고객사에는 절대 보이지 않음)
//  ⭐ 알록달록 금지 — 네이비 계열만, 빨간색은 손실에만.
import React from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceDot, Cell } from "recharts";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { usePlatformLive, mergeCompanies } from "./PlatformLive";
import { estimateBill } from "./PlatformMonitor";
import { useSalesPricing, applyPlanBill, itemsTotal, monthlyOf } from "./SalesQuote";
import { PLAN_IDS, planIncludes } from "./plans";
import { COST_DEFAULT, CLAUDE_TIERS, VERCEL_PLANS, mergeCost, fixedCosts, variableCosts, estimateDaily, estimateMonth, breakEvenCurve, daysInMonth } from "./costModel";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const NAVY = "#1B2B4B", INK = "#0F1A30", MID = "#4B6CB7", SOFT = "#8FB0F0", RED = "#B42318";
const pad = (x) => String(x).padStart(2, "0");
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const won = (v) => `${Math.round(num(v)).toLocaleString()}원`;
const wonS = (v) => { const x = Math.round(num(v)); return `${x < 0 ? "−" : ""}${Math.abs(x).toLocaleString()}원`; };
const cnt = (v) => Math.round(num(v)).toLocaleString();
const short = (v) => { const a = Math.abs(num(v)); return a >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : a >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()}만` : `${Math.round(v)}`; };
const TT = { borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12.5, fontWeight: 700, boxShadow: "0 10px 26px rgba(16,24,40,.10)" };

// ─── 공용 부품(관리센터와 같은 모양) ───
function Card({ code, title, right, children, bodyClass = "p-5" }) {
  return (
    <div className="bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 min-h-[46px] sm:min-h-[50px] py-1.5 bg-[#F7F9FC] border-b border-[#E8EDF4] flex-wrap">
        <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
          <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={{ fontFamily: MONO }}>{code}</span>
          <span className="text-[15px] sm:text-[16px] font-black text-[#0F1A30] truncate whitespace-nowrap">{title}</span></div>
        {right}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}
function Hero({ en, title, desc, right }) {
  return (
    <div className="relative overflow-hidden rounded-[18px] sm:rounded-[22px] px-4 py-3.5 sm:px-6 sm:py-5 mb-3 sm:mb-4 text-white flex items-center justify-between gap-3 sm:gap-4 flex-wrap"
      style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, radial-gradient(600px 200px at 85% -20%, rgba(75,108,183,.45), transparent 60%), linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div className="min-w-0"><div className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.28em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>{en}</div>
        <div className="text-[19px] sm:text-[24px] font-black mt-0.5 tracking-tight whitespace-nowrap">{title}</div>
        {desc && <div className="hidden sm:block text-[13.5px] text-white/65 mt-0.5">{desc}</div>}</div>
      {right}
    </div>
  );
}
function Kpi({ k, v, sub, dark = false, loss = false }) {
  return (
    <div className={`rounded-[16px] px-4 py-3.5 border min-w-0 ${dark ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
      <div className={`text-[12.5px] font-bold ${dark ? "text-white/60" : "text-[#7A879C]"}`}>{k}</div>
      <div className="text-[21px] sm:text-[23px] font-black mt-0.5 tabular-nums whitespace-nowrap" style={{ fontFamily: MONO, color: loss ? (dark ? "#FDA29B" : RED) : undefined }}>{v}</div>
      {sub && <div className={`text-[11.5px] font-semibold mt-0.5 truncate ${dark ? "text-white/50" : "text-[#9AA9C3]"}`}>{sub}</div>}
    </div>
  );
}
const Tag = ({ children }) => <span className="inline-block px-1.5 py-0.5 rounded-md bg-[#EEF2F8] text-[#5B6B85] text-[10px] font-black tracking-wide align-middle whitespace-nowrap">{children}</span>;
const Btn = ({ dark, children, className = "", ...p }) => (
  <button type="button" {...p} className={`h-10 px-4 rounded-xl text-[13px] font-black inline-flex items-center gap-1.5 transition disabled:opacity-50 whitespace-nowrap ${dark ? "bg-[#0F1A30] text-white hover:bg-[#1B2B4B]" : "bg-white border border-[#DCE3EE] text-[#1B2B4B] hover:border-[#4B6CB7]"} ${className}`}>{children}</button>
);
function Meter({ used, limit }) {
  const r = limit ? used / limit : 0;
  return (
    <div className="h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: r > 1 ? INK : r >= 0.8 ? NAVY : MID }} /></div>
  );
}

// ─── 데이터 ───
function useDocLive(path) {
  const [v, setV] = React.useState(undefined);
  React.useEffect(() => onSnapshot(doc(db, ...path.split("/")), (s) => setV(s.exists() ? s.data() : null), () => setV(null)), [path]);
  return v;
}
function useQueryLive(col, field, value) {
  const [v, setV] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, col), where(field, "==", value)), (s) => setV(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setV([])), [col, field, value]);
  return v;
}
function useColMap(col) {
  const [v, setV] = React.useState({});
  React.useEffect(() => onSnapshot(collection(db, col), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setV(m); }, () => {}), [col]);
  return v;
}
const qtyOf = (items, key) => (Array.isArray(items) ? items : []).filter((x) => x.key === key).reduce((a, x) => a + num(x.qty), 0);
const PRICING_FALLBACK = { base: 99000, includedSeats: 3, seat: 15000, includedOrders: 1000, perOrder: 50 };

// 이 패널의 모든 숫자를 한 번에 계산
function useCostData() {
  const live = usePlatformLive();
  const sales = useSalesPricing();
  const saved = useDocLive("platformConfig/costModel");
  const stats = useDocLive("siteConfig/platformStats");
  const pricingDoc = useDocLive("siteConfig/platformPricing");
  const status = useDocLive("platformUsage/_status");
  const today = kstToday(); const ym = today.slice(0, 7);
  const monthDoc = useDocLive(`platformUsage/m_${ym}`);
  const daily = useQueryLive("platformUsage", "month", ym);
  const counters = useQueryLive("usageCounters", "month", ym);
  const invoices = useQueryLive("platformInvoices", "month", ym);
  const plans = useColMap("companyPlans");
  const model = React.useMemo(() => mergeCost(saved || null), [saved]);
  const ready = sales && stats !== undefined && saved !== undefined && pricingDoc !== undefined && daily && counters && invoices;

  const data = React.useMemo(() => {
    if (!ready) return null;
    const dim = daysInMonth(ym); const dayNo = Number(today.slice(8));
    const pricing = { ...PRICING_FALLBACK, ...(pricingDoc || {}) };
    const invMap = {}; (invoices || []).forEach((v) => { invMap[v.company] = v; });
    const ctrMap = {}; (counters || []).forEach((v) => { ctrMap[v.company] = v; });
    // ① 회사별 매출 — 수납 관리와 같은 계산(확정 금액이 있으면 그 값)
    const cos = mergeCompanies(stats?.companies || [], live).filter((c) => c.kind !== "shipper").map((c) => {
      const planId = plans[c.name]?.planId || "";
      const bill = applyPlanBill(estimateBill(c, pricing, dim, dim), c, planId, sales);
      const inv = invMap[c.name] || null;
      const extra = itemsTotal(inv?.items);
      const revenue = inv && inv.amount != null ? num(inv.amount) : num(bill.total) + extra;
      const toDate = c.m?.toDate ?? (c.m?.cnt || 0);
      const ordersMonth = Math.max(c.m?.cnt || 0, dayNo >= 7 ? Math.round((toDate / dayNo) * dim) : Math.round((toDate / Math.max(1, dayNo)) * dim));
      const act = { ordersMonth, staff: c.staff || 0, fleet: c.fleetJ || 0, storageGB: (c.storageKB || 0) / 1048576, taxInvoices: qtyOf(inv?.items, "taxInvoice") };
      const ctr = ctrMap[c.name] || null;
      return { c, name: c.name, planId, plan: bill.usage?.plan || null, bill, inv, extra, revenue, act, ctr, items: inv?.items || [], status: inv?.status || "미청구" };
    }).filter((r) => r.revenue > 0 || r.act.ordersMonth > 0 || r.act.staff > 0);

    // ② 서버 사용량 — 실측(Cloud Monitoring)이 있으면 실측, 없으면 활동량 추정
    const measuredDays = (daily || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id) && d.source === "monitoring").sort((a, b) => a.id.localeCompare(b.id));
    const measured = measuredDays.length > 0 && measuredDays.some((d) => num(d.reads) + num(d.writes) > 0);
    const complete = measuredDays.filter((d) => d.id < today);
    const recent = complete.slice(-7);
    const avg = (k) => (recent.length ? recent.reduce((a, d) => a + num(d[k]), 0) / recent.length : 0);
    const avgDay = { reads: avg("reads"), writes: avg("writes"), deletes: avg("deletes") };
    const sumActs = cos.reduce((a, r) => { a.orders += r.act.ordersMonth; a.storageGB += r.act.storageGB; a.tax += r.act.taxInvoices; return a; }, { orders: 0, storageGB: 0, tax: 0 });
    const msgs = cos.reduce((a, r) => { a.alimtalk += qtyOf(r.items, "alimtalk"); a.sms += qtyOf(r.items, "sms"); a.lms += qtyOf(r.items, "lms"); return a; }, { alimtalk: 0, sms: 0, lms: 0 });
    const paying = cos.filter((r) => r.revenue > 0).length;
    const lastBytes = (k) => measuredDays.reduce((a, d) => Math.max(a, num(d[k])), 0);
    const fsGib = lastBytes("fsBytes") ? lastBytes("fsBytes") / 2 ** 30 : sumActs.storageGB + (stats?.companies || []).reduce((a, c) => a + num(c.totalOrders), 0) * 2 / 1048576;
    const gcsGb = lastBytes("gcsBytes") / 1e9;
    const mtdFn = measured ? measuredDays.reduce((a, d) => a + num(d.fnCalls), 0) : 0;
    const extraBase = {
      fsGib, gcsGb, orders: sumActs.orders, visionCalls: num(monthDoc?.visionCalls),
      taxInvoices: sumActs.tax + (model.etax?.platformIssue ? paying : 0), ...msgs,
    };
    let variable, varMtd, source;
    if (measured) {
      const projDays = [...complete, ...Array.from({ length: Math.max(0, dim - complete.length) }, () => avgDay)];
      const egressProj = measuredDays.reduce((a, d) => a + num(d.egressBytes), 0) / 1e9 * (dim / Math.max(1, measuredDays.length));
      variable = variableCosts(model, projDays, { ...extraBase, fnCalls: mtdFn * (dim / Math.max(1, measuredDays.length)), egressGb: egressProj, billDays: dim });
      varMtd = variableCosts(model, measuredDays, { ...extraBase, fnCalls: mtdFn, egressGb: measuredDays.reduce((a, d) => a + num(d.egressBytes), 0) / 1e9, billDays: measuredDays.length });
      source = "measured";
    } else {
      variable = estimateMonth(model, cos.map((r) => r.act), { days: dim, storedGib: fsGib });
      variable.rows = variable.rows.map((r) => (r.key === "gcs" ? { ...r, usage: gcsGb } : r));
      varMtd = null; source = "estimate";
    }
    const fixed = fixedCosts(model);
    const revenue = cos.reduce((a, r) => a + r.revenue, 0);
    const baseRev = cos.reduce((a, r) => a + (r.inv && r.inv.amount != null ? 0 : num(r.bill.base)), 0);
    const overRev = cos.reduce((a, r) => a + (r.inv && r.inv.amount != null ? 0 : num(r.bill.total) - num(r.bill.base)), 0);
    const extraRev = cos.reduce((a, r) => a + (r.inv && r.inv.amount != null ? 0 : r.extra), 0);
    const fixedRev = cos.reduce((a, r) => a + (r.inv && r.inv.amount != null ? r.revenue : 0), 0);
    const cost = variable.total + fixed.total;

    // ③ 운송사별 배분 — 앱 표본(usageCounters)이 있으면 그 비율, 없으면 활동량 추정
    const est = cos.map((r) => estimateDaily(model, r.act));
    const fleetW = cos.map((r) => num(r.act.fleet) * num(model.coef.writesPerFleetDay));
    const withCtr = cos.map((r, i) => (r.ctr ? i : -1)).filter((i) => i >= 0);
    const kR = withCtr.length ? withCtr.reduce((a, i) => a + num(cos[i].ctr.reads), 0) / Math.max(1, withCtr.reduce((a, i) => a + est[i].reads * dayNo, 0)) : 1;
    const kW = withCtr.length ? withCtr.reduce((a, i) => a + num(cos[i].ctr.writes), 0) / Math.max(1, withCtr.reduce((a, i) => a + (est[i].writes - fleetW[i]) * dayNo, 0)) : 1;
    const wR = cos.map((r, i) => (r.ctr ? num(r.ctr.reads) : est[i].reads * dayNo * kR));
    const wW = cos.map((r, i) => (r.ctr ? num(r.ctr.writes) : (est[i].writes - fleetW[i]) * dayNo * kW) + fleetW[i] * dayNo);
    const wS = cos.map((r) => r.act.storageGB + r.act.ordersMonth * num(model.coef.mbPerOrder) / 1024);
    const wO = cos.map((r) => r.act.ordersMonth);
    const share = (w, i) => { const t = w.reduce((a, x) => a + x, 0); return t > 0 ? w[i] / t : 1 / Math.max(1, cos.length); };
    const rowK = (k) => variable.rows.find((x) => x.key === k)?.krw || 0;
    const fixedShareBase = paying || cos.length || 1;
    const fx = num(model.fx) * (1 + num(model.usdTaxPct) / 100);
    const perCo = cos.map((r, i) => {
      const server = rowK("fsRead") * share(wR, i) + (rowK("fsWrite") + rowK("fsDel")) * share(wW, i) + (rowK("fsGib") + rowK("gcs") + rowK("egress")) * share(wS, i) + (rowK("fn") + rowK("tmap")) * share(wO, i);
      const direct = r.act.taxInvoices * num(model.etax?.krw) + (model.etax?.platformIssue && r.revenue > 0 ? num(model.etax?.krw) : 0)
        + qtyOf(r.items, "alimtalk") * num(model.msg?.alimtalk) + qtyOf(r.items, "sms") * num(model.msg?.sms) + qtyOf(r.items, "lms") * num(model.msg?.lms);
      const d = est[i];
      const gross = ((d.reads * 30) / 1e5 * num(model.fs.read) + (d.writes * 30) / 1e5 * num(model.fs.write) + wS[i] * num(model.fs.gib)) * fx + direct;
      const fixedShare = r.revenue > 0 || !paying ? fixed.total / fixedShareBase : 0;
      const variableCost = server + direct;
      const margin = r.revenue - variableCost - fixedShare;
      // 추천 — 요금제 전환 · 추가 청구
      const recs = [];
      if (!r.planId) recs.push("요금제 지정 필요(지금은 기존 청구 기준)");
      if (r.plan && sales?.plans) {
        const inp = { staff: r.act.staff, orders: r.act.ordersMonth, fleet: r.act.fleet, storageGB: r.act.storageGB };
        const cur = monthlyOf(r.plan, sales, inp).total;
        const alt = sales.plans.filter((p) => PLAN_IDS.includes(p.id) && PLAN_IDS.indexOf(p.id) > PLAN_IDS.indexOf(r.planId)).map((p) => ({ p, t: monthlyOf(p, sales, inp).total })).sort((a, b) => a.t - b.t)[0];
        if (r.bill.usage?.over > 0 && alt && alt.t <= cur * 1.1) recs.push(`${alt.p.name} 전환 권유(월 ${won(alt.t)} · 기능↑)`);
        else if (r.bill.usage?.over > 0) recs.push(`초과 요금 ${won(r.bill.usage.over)} 청구`);
        if (r.act.fleet > 0 && !planIncludes(r.planId, "fleet")) recs.push(`지입차 ${r.act.fleet}대 — 스탠다드부터 관리 기능`);
      }
      if (margin < 0) recs.push("적자 — 추가 청구 또는 요금 조정");
      if (qtyOf(r.items, "taxInvoice") === 0 && r.act.ordersMonth > 1500) recs.push("전자세금계산서·알림톡 사용 시 추가 항목 청구");
      return { ...r, server, direct, gross, variableCost, fixedShare, margin, marginRate: r.revenue > 0 ? margin / r.revenue : null, reads: wR[i], writes: wW[i], recs };
    }).sort((a, b) => a.margin - b.margin);

    // 평균(손익분기 기본값)
    const n = Math.max(1, cos.length);
    const avgAct = { ordersMonth: sumActs.orders / n, staff: cos.reduce((a, r) => a + r.act.staff, 0) / n, fleet: cos.reduce((a, r) => a + r.act.fleet, 0) / n, storageGB: sumActs.storageGB / n, taxInvoices: 0 };
    return {
      ym, today, dim, dayNo, model, cos: perCo, revenue, baseRev, overRev, extraRev, fixedRev, cost, profit: revenue - cost, margin: revenue > 0 ? (revenue - cost) / revenue : null,
      variable, varMtd, fixed, source, measuredDays, avgDay, status, monthDoc, counters, paying, avgAct, avgRevenue: paying ? revenue / paying : 0, sales, fsGib, gcsGb,
    };
  }, [ready, ym, today, live, sales, stats, pricingDoc, invoices, counters, daily, plans, model, monthDoc, status]);
  return { data, model, saved };
}

// ═══════════════════════ 본체 ═══════════════════════
const VIEWS = [["summary", "손익 요약", "P&L"], ["companies", "운송사별 원가", "PER CARRIER"], ["breakeven", "손익분기 · 시뮬레이터", "BREAK-EVEN"], ["server", "서버 사용량(실측)", "METERED"]];
export default function CostPanel({ openUsage }) {
  const { data, model, saved } = useCostData();
  const [view, setViewState] = React.useState(() => { try { return localStorage.getItem("pcCostView") || "summary"; } catch { return "summary"; } });
  const setView = (v) => { setViewState(v); try { localStorage.setItem("pcCostView", v); } catch { /* 무시 */ } };
  const [settings, setSettings] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const refresh = async () => {
    setBusy(true); setMsg("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/platformUsageNow`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      setMsg(j.skipped ? `방금 가져왔습니다 — ${Math.ceil((j.nextInSec || 0) / 60)}분 뒤 다시 누를 수 있어요` : j.ok === false ? "가져오지 못했습니다 — 아래 '서버 사용량' 안내를 확인해 주세요" : "구글 클라우드에서 사용량을 새로 가져왔습니다");
    } catch (e) { setMsg(`가져오기 실패: ${e.message || e} (함수를 아직 배포하지 않았다면 정상입니다 — 추정값으로 보여드립니다)`); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Hero en="BILLING · COST · P&L" title="비용 · 손익" desc="이달 매출과 서버·운영 지출, 운송사별 원가, 몇 곳부터 남는지(손익분기)를 한 화면에서 봅니다. 모든 단가는 [비용 기준 설정]에서 고칩니다."
        right={<div className="flex gap-2 flex-wrap">
          <button type="button" onClick={refresh} disabled={busy} className="h-10 px-4 rounded-xl bg-white/10 ring-1 ring-white/25 text-white text-[13px] font-black disabled:opacity-60">{busy ? "가져오는 중…" : "사용량 지금 가져오기"}</button>
          <button type="button" onClick={() => setSettings(true)} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black">비용 기준 설정</button>
        </div>} />
      {msg && <div className="rounded-xl border border-[#DCE3EE] bg-white px-4 py-2.5 text-[13px] font-bold text-[#1B2B4B] flex justify-between gap-3"><span>{msg}</span><button type="button" onClick={() => setMsg("")} className="text-[#9AA9C3]">닫기</button></div>}
      <div className="flex gap-1.5 flex-wrap">
        {VIEWS.map(([k, l, en]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`h-10 px-4 rounded-xl text-[13px] font-black border inline-flex items-center gap-2 ${view === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#1B2B4B] border-[#DCE3EE] hover:border-[#4B6CB7]"}`}>
            <span className={`text-[9.5px] tracking-[0.18em] ${view === k ? "text-[#8FB0F0]" : "text-[#94A3B8]"}`} style={{ fontFamily: MONO }}>{en}</span>{l}
          </button>
        ))}
      </div>
      {!data ? <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>
        : view === "summary" ? <SummaryView d={data} openUsage={openUsage} />
          : view === "companies" ? <CompaniesView d={data} />
            : view === "breakeven" ? <BreakEvenView d={data} />
              : <ServerView d={data} model={model} saved={saved} onRefresh={refresh} busy={busy} />}
      {settings && <SettingsModal model={model} onClose={() => setSettings(false)} />}
    </div>
  );
}

// ─── ① 손익 요약 ───
function SourceNote({ d }) {
  return d.source === "measured"
    ? <Tag>서버 실측 · 구글 클라우드 모니터링</Tag>
    : <Tag>활동량 추정 — 실측 연결 전</Tag>;
}
function SummaryView({ d, openUsage }) {
  const rows = [...d.variable.rows, ...d.fixed.rows];
  const groups = {};
  rows.forEach((r) => { groups[r.group] = (groups[r.group] || 0) + r.krw; });
  const bars = Object.entries(groups).map(([g, v]) => ({ g, v: Math.round(v) })).sort((a, b) => b.v - a.v);
  const loss = d.profit < 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi k={`${Number(d.ym.slice(5))}월 매출 (VAT 별도)`} v={won(d.revenue)} sub={`청구 대상 ${d.paying}곳 · 월말 예상`} />
        <Kpi k="이달 지출" v={won(d.cost)} sub={`서버 ${won(d.variable.total)} + 고정 ${won(d.fixed.total)}`} />
        <Kpi dark k="순이익" v={wonS(d.profit)} loss={loss} sub={loss ? "적자 — 운송사별 원가에서 원인 확인" : "매출 − 지출(월말 예상)"} />
        <Kpi k="이익률" v={d.margin == null ? "-" : `${(d.margin * 100).toFixed(1)}%`} loss={d.margin != null && d.margin < 0} sub="순이익 ÷ 매출" />
        <Kpi k="1곳당 평균" v={won(d.avgRevenue)} sub={`원가 ${won(d.paying ? d.cost / d.paying : 0)} / 곳`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card code="REVENUE" title="이달 매출 구성">
          {[["요금제 기본료", d.baseRev], ["사용량 초과(직원·오더·지입차·저장)", d.overRev], ["추가 청구 항목(세금계산서·문자·개발 등)", d.extraRev], ["확정 청구액(수납 관리에서 금액을 직접 정한 곳)", d.fixedRev]].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0 border-[#EEF1F6]">
              <span className="text-[13.5px] font-bold text-[#3A4A66]">{k}</span><span className="text-[14.5px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{won(v)}</span>
            </div>
          ))}
          <div className="mt-2 pt-3 border-t border-dashed border-[#DCE3EE] flex justify-between items-end">
            <span className="text-[12px] font-bold text-[#7A879C]">합계 · VAT 별도</span><span className="text-[22px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(d.revenue)}</span>
          </div>
          <div className="mt-3 text-[12px] text-[#7A879C] leading-relaxed">매출은 <b>청구 › 수납 관리</b>의 이달 청구액(확정 전이면 예상액)과 같습니다. 초과 요금 계산은 <button type="button" onClick={openUsage} className="underline font-bold text-[#1B2B4B]">사용량·한도</button>, 추가 항목은 수납 관리 › [추가 항목]에서 넣습니다.</div>
        </Card>
        <Card code="SPEND" title="지출 카테고리별 (이달 · 월말 예상)" right={<SourceNote d={d} />}>
          <div className="h-[230px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 70, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#EEF1F6" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={short} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                <YAxis type="category" dataKey="g" width={108} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#3A4A66", fontWeight: 700 }} />
                <Tooltip cursor={{ fill: "rgba(27,43,75,.05)" }} contentStyle={TT} formatter={(v) => [won(v), "월 비용"]} />
                <Bar dataKey="v" fill={NAVY} radius={[0, 4, 4, 0]} barSize={14} label={{ position: "right", formatter: (v) => won(v), fontSize: 11, fill: "#5B6B85", fontWeight: 700 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <CostTable d={d} />
    </div>
  );
}
function CostTable({ d }) {
  const m = d.model;
  return (
    <Card code="COST LINES" title="지출 항목별 월 비용" right={<span className="text-[11.5px] font-bold text-[#7A879C]">단가 기준일 {m.asOf} · 환율 {cnt(m.fx)}원/$ · 해외결제 +{num(m.usdTaxPct)}% <Tag>검증 필요</Tag></span>} bodyClass="p-0">
      <div className="overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 920 }}>
        <thead><tr className="bg-[#1B2B4B] text-white">{["분류", "항목", "단가", "무료 제공", "이달 사용량", "과금 대상", "월 비용"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {d.variable.rows.map((r) => (
            <tr key={r.key} className="border-t border-[#EEF1F6]">
              <td className="px-3 py-2 font-bold text-[#5B6B85] whitespace-nowrap">{r.group}</td>
              <td className="px-3 py-2 font-black text-[#0F1A30] whitespace-nowrap">{r.label}</td>
              <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{r.unit}</td>
              <td className="px-3 py-2 text-center text-[#7A879C] whitespace-nowrap">{r.free}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{r.usage < 100 && r.usage % 1 ? r.usage.toFixed(2) : cnt(r.usage)} <span className="text-[#9AA9C3]">{r.usageUnit}</span></td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-[#5B6B85]" style={{ fontFamily: MONO }}>{r.billable < 100 && r.billable % 1 ? r.billable.toFixed(2) : cnt(r.billable)}</td>
              <td className="px-3 py-2 text-right font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.krw)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[#DCE3EE] bg-[#F7F9FC]"><td colSpan={6} className="px-3 py-2 font-black text-right">서버 · 사용량 변동비 소계</td><td className="px-3 py-2 text-right font-black tabular-nums" style={{ fontFamily: MONO }}>{won(d.variable.total)}</td></tr>
          {d.fixed.rows.map((r) => (
            <tr key={r.key} className={`border-t border-[#EEF1F6] ${r.off ? "opacity-45" : ""}`}>
              <td className="px-3 py-2 font-bold text-[#5B6B85] whitespace-nowrap">{r.group}</td>
              <td className="px-3 py-2 font-black text-[#0F1A30] whitespace-nowrap">{r.label}{r.off ? " (꺼짐)" : ""}</td>
              <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{r.unit}</td>
              <td className="px-3 py-2 text-center text-[#9AA9C3]">-</td><td className="px-3 py-2 text-right text-[#9AA9C3]">고정</td><td />
              <td className="px-3 py-2 text-right font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.krw)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[#DCE3EE] bg-[#F7F9FC]"><td colSpan={6} className="px-3 py-2 font-black text-right">고정비 소계</td><td className="px-3 py-2 text-right font-black tabular-nums" style={{ fontFamily: MONO }}>{won(d.fixed.total)}</td></tr>
          <tr className="bg-[#0F1A30] text-white"><td colSpan={6} className="px-3 py-2.5 font-black text-right">이달 지출 합계 (월말 예상)</td><td className="px-3 py-2.5 text-right font-black tabular-nums" style={{ fontFamily: MONO }}>{won(d.cost)}</td></tr>
        </tbody>
      </table></div>
      <div className="px-5 py-3 border-t border-[#EEF1F6] text-[11.5px] text-[#7A879C] leading-relaxed">
        출처: {m.source}. ⚠ Firestore 단가는 다중 리전(nam5) 기준 — 서울(asia-northeast3) 등 단일 리전은 단가가 다를 수 있으니 구글 클라우드 콘솔 › 결제 › 보고서와 맞춰 보세요.
        Cloud Storage 무료 5GB는 예전 버킷(*.appspot.com)·미국 리전만 해당합니다. 24시콜(화물정보망)·PG 수수료는 고객사가 직접 계약하는 비용이라 넣지 않았습니다.
      </div>
    </Card>
  );
}

// ─── ③ 운송사별 원가 ───
function CompaniesView({ d }) {
  const [sort, setSort] = React.useState("margin");
  const list = [...d.cos].sort((a, b) => (sort === "margin" ? a.margin - b.margin : sort === "revenue" ? b.revenue - a.revenue : b.variableCost - a.variableCost));
  const lossN = list.filter((r) => r.margin < 0).length;
  const chart = list.slice(0, 20).map((r) => ({ name: r.name.length > 7 ? `${r.name.slice(0, 7)}…` : r.name, margin: Math.round(r.margin) }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi k="운송사" v={`${list.length}곳`} sub={`청구 대상 ${d.paying}곳`} />
        <Kpi k="적자 운송사" v={`${lossN}곳`} loss={lossN > 0} sub={lossN ? list.filter((r) => r.margin < 0).slice(0, 3).map((r) => r.name).join(" · ") : "없음"} />
        <Kpi k="서버비가 가장 큰 곳" v={(() => { const t = [...list].sort((a, b) => b.server - a.server)[0]; return t ? t.name : "-"; })()} sub="활동량·앱 표본 기준" />
        <Kpi dark k="1곳당 고정비 몫" v={won(d.fixed.total / Math.max(1, d.paying || list.length))} sub="고정비 ÷ 청구 대상 회사 수" />
      </div>
      {chart.length > 0 && (
        <Card code="MARGIN" title="운송사별 월 이익 (매출 − 변동 원가 − 고정비 몫)">
          <div className="h-[230px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#EEF1F6" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 11, fill: "#5B6B85", fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} width={52} tickFormatter={short} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                <Tooltip cursor={{ fill: "rgba(27,43,75,.05)" }} contentStyle={TT} formatter={(v) => [wonS(v), "월 이익"]} />
                <ReferenceLine y={0} stroke={INK} strokeOpacity={0.3} />
                <Bar dataKey="margin" radius={[4, 4, 0, 0]} barSize={18}>{chart.map((x) => <Cell key={x.name} fill={x.margin < 0 ? RED : NAVY} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <Card code="PER CARRIER" title={`${Number(d.ym.slice(5))}월 운송사별 원가 · 이익`} right={<div className="flex gap-1">{[["margin", "이익 낮은 순"], ["revenue", "매출 순"], ["cost", "원가 순"]].map(([k, l]) => <button key={k} type="button" onClick={() => setSort(k)} className={`h-8 px-2.5 rounded-lg text-[12px] font-black border ${sort === k ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#5B6B85]"}`}>{l}</button>)}</div>} bodyClass="p-0">
        {list.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">집계된 운송사가 없습니다 — 사용량·한도에서 [지금 갱신]을 눌러 주세요.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 1240 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["운송사", "요금제", "월 오더(예상)", "직원 · 지입", "앱 표본 읽기/쓰기", "매출", "서버 원가", "직접비(문자·세금계산서)", "고정비 몫", "이익 · 이익률", "추천"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{list.map((r) => {
              const neg = r.margin < 0;
              return (
                <tr key={r.name} className="border-t border-[#EEF1F6]">
                  <td className="px-3 py-2.5 font-black text-[#0F1A30] whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">{r.plan ? <span className="inline-block px-2 py-0.5 rounded-lg bg-[#0F1A30] text-white text-[11.5px] font-black">{r.plan.name}</span> : <span className="text-[11.5px] font-bold text-[#9AA9C3]">미지정</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{cnt(r.act.ordersMonth)}건<div className="text-[10.5px] text-[#9AA9C3]">일 {cnt(r.act.ordersMonth / 30)}건</div></td>
                  <td className="px-3 py-2.5 text-center tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{r.act.staff}명 · {r.act.fleet}대</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-[#5B6B85]" style={{ fontFamily: MONO }}>{r.ctr ? `${short(r.ctr.reads)} / ${short(r.ctr.writes)}` : <span className="text-[#C0CAD9]">표본 없음</span>}<div className="text-[10.5px] text-[#9AA9C3]">배분 {short(r.reads)} / {short(r.writes)}</div></td>
                  <td className="px-3 py-2.5 text-right font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.server)}<div className="text-[10.5px] text-[#9AA9C3]" title="무료 제공량이 없다고 볼 때(규모가 커졌을 때) 단가 기준">단가 기준 {won(r.gross)}</div></td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{won(r.direct)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-[#5B6B85]" style={{ fontFamily: MONO }}>{won(r.fixedShare)}</td>
                  <td className="px-3 py-2.5 text-right font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO, color: neg ? RED : INK }}>{wonS(r.margin)}<div className="text-[10.5px] font-bold" style={{ color: neg ? RED : "#9AA9C3" }}>{r.marginRate == null ? "-" : `${(r.marginRate * 100).toFixed(0)}%`}</div></td>
                  <td className="px-3 py-2.5 text-[12px] font-bold text-[#3A4A66] min-w-[220px]">{r.recs.length ? r.recs.map((x) => <div key={x} className={x.startsWith("적자") ? "text-[#B42318]" : ""}>· {x}</div>) : <span className="text-[#9AA9C3]">-</span>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <div className="px-5 py-3 border-t border-[#EEF1F6] text-[11.5px] text-[#7A879C] leading-relaxed">
          · 서버 원가 = 이달 서버비(무료 제공량 반영)를 회사 활동량으로 나눈 몫입니다. 앱 표본(직원·기사 화면이 실제로 받은 문서 수)이 있으면 그 비율을 쓰고, 지입차 GPS 기록(안드로이드 기사앱)은 대수로 더합니다.<br />
          · "단가 기준"은 무료 제공량이 없다고 봤을 때의 원가 — 회사가 늘어 무료량을 넘으면 이 값에 가까워집니다. 고정비 몫은 고정비를 청구 대상 회사 수로 똑같이 나눈 값입니다.
        </div>
      </Card>
    </div>
  );
}

// ─── ④ 손익분기 · 시뮬레이터 ───
function BreakEvenView({ d }) {
  const sales = d.sales;
  const planList = (sales?.plans || []).filter((p) => PLAN_IDS.includes(p.id));
  const recPlan = planList.find((p) => p.recommended) || planList[2] || planList[0];
  const seed = React.useCallback(() => {
    const curPlan = (() => { const ids = d.cos.map((r) => r.planId).filter(Boolean); if (!ids.length) return recPlan?.id; const c = {}; ids.forEach((i) => { c[i] = (c[i] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; })();
    return { n: Math.max(1, d.cos.length), planId: curPlan || "standard", daily: Math.round((d.avgAct.ordersMonth || 3000) / 30) || 100, staff: Math.round(d.avgAct.staff) || 8, fleet: Math.round(d.avgAct.fleet) || 0, extra: 0 };
  }, [d, recPlan]);
  const [sim, setSim] = React.useState(seed);
  const set = (k, v) => setSim((s) => ({ ...s, [k]: v }));
  const plan = planList.find((p) => p.id === sim.planId) || recPlan;
  const act = { ordersMonth: sim.daily * 30, staff: sim.staff, fleet: sim.fleet, storageGB: (sim.daily * 30 * num(d.model.coef.mbPerOrder)) / 1024 * 6, taxInvoices: 0 };
  const rev1 = plan ? monthlyOf(plan, sales, { staff: sim.staff, orders: sim.daily * 30, fleet: sim.fleet, storageGB: act.storageGB }).total + num(sim.extra) : 0;
  const curve = React.useMemo(() => breakEvenCurve(d.model, { avgRevenue: rev1, avgAct: act, maxN: 100, fixed: d.fixed.total }), [d.model, rev1, sim.daily, sim.staff, sim.fleet, d.fixed.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = curve.pts[Math.min(100, sim.n)] || curve.pts[0];
  const cur = curve.pts[Math.min(100, d.cos.length)] || curve.pts[0];
  // 요금제별 — 한도까지 쓸 때 원가와 마진(미팅 설명용)
  const perPlan = planList.map((p) => {
    const a = { ordersMonth: num(p.orders), staff: num(p.seats), fleet: num(p.fleet), storageGB: Math.min(num(p.storageGB) || 10, num(p.orders) * num(d.model.coef.mbPerOrder) / 1024 * 12) };
    const marginal = estimateMonth(d.model, [a], { days: 30 });
    const fx = num(d.model.fx) * (1 + num(d.model.usdTaxPct) / 100); const e = estimateDaily(d.model, a);
    const gross = ((e.reads * 30) / 1e5 * num(d.model.fs.read) + (e.writes * 30) / 1e5 * num(d.model.fs.write) + a.storageGB * num(d.model.fs.gib) + (a.ordersMonth * num(d.model.coef.fnPerOrder)) / 1e6 * num(d.model.fn.perM)) * fx;
    return { p, a, gross, net: marginal.total, margin: num(p.price) - gross, rate: num(p.price) ? (num(p.price) - gross) / num(p.price) : 0 };
  });
  const numBox = ({ k, l, unit, min = 0, max, step = 1 }) => (
    <label key={k} className="block">
      <div className="flex justify-between text-[12.5px] font-bold text-[#5B6B85]"><span>{l}</span><span className="tabular-nums text-[#0F1A30] font-black" style={{ fontFamily: MONO }}>{cnt(sim[k])}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={sim[k]} onChange={(e) => set(k, Number(e.target.value))} className="w-full accent-[#1B2B4B]" />
    </label>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi dark k="손익분기점" v={curve.be == null ? "100곳 넘음" : `${curve.be}곳`} sub={`이 조건(${plan?.name || "-"} · 일 ${sim.daily}건)으로 이만큼부터 흑자`} />
        <Kpi k="지금 위치" v={`${d.cos.length}곳`} sub={`이 조건이면 월 ${wonS(cur.profit)}`} loss={cur.profit < 0} />
        <Kpi k={`${sim.n}곳일 때 월 이익`} v={wonS(at.profit)} loss={at.profit < 0} sub={`매출 ${won(at.rev)} · 비용 ${won(at.cost)}`} />
        <Kpi k="고정비 (월)" v={won(d.fixed.total)} sub="회사 수와 상관없이 나가는 돈" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Card code="BREAK-EVEN" title="운송사 수에 따른 월 매출 · 비용" right={<div className="hidden sm:flex items-center gap-3 text-[11px] font-bold text-[#5B6B85]">
          <span className="flex items-center gap-1"><i className="w-3 h-[3px] rounded bg-[#1B2B4B]" />매출</span>
          <span className="flex items-center gap-1"><i className="w-3 border-t-2 border-dashed border-[#4B6CB7]" />비용(고정+서버)</span>
        </div>}>
          <div className="h-[320px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curve.pts} margin={{ top: 22, right: 16, left: 4, bottom: 4 }}>
                <defs><linearGradient id="beRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2D4C82" stopOpacity={0.18} /><stop offset="100%" stopColor="#2D4C82" stopOpacity={0.01} /></linearGradient></defs>
                <CartesianGrid stroke="#EEF1F6" vertical={false} />
                <XAxis dataKey="n" type="number" domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} label={{ value: "운송사 수(곳)", position: "insideBottomRight", offset: -2, fontSize: 11, fill: "#7A879C" }} />
                <YAxis axisLine={false} tickLine={false} width={56} tickFormatter={short} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                <Tooltip contentStyle={TT} labelFormatter={(x) => `운송사 ${x}곳`} formatter={(v, k) => [won(v), { rev: "매출", cost: "비용", profit: "이익" }[k] || k]} />
                <Area type="monotone" dataKey="rev" stroke={NAVY} strokeWidth={2.4} fill="url(#beRev)" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="cost" stroke={MID} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                {curve.be != null && <ReferenceLine x={curve.be} stroke={INK} strokeOpacity={0.5} strokeDasharray="3 3" label={{ value: `손익분기 ${curve.be}곳`, position: "top", fill: INK, fontSize: 11.5, fontWeight: 800 }} />}
                <ReferenceLine x={Math.min(100, d.cos.length)} stroke={MID} strokeOpacity={0.6} label={{ value: "지금", position: "insideTopLeft", fill: MID, fontSize: 11, fontWeight: 800 }} />
                <ReferenceDot x={Math.min(100, sim.n)} y={at.rev} r={5} fill={NAVY} stroke="#fff" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[11.5px] text-[#9AA9C3]">곡선은 오른쪽 시뮬레이터 조건(요금제·일 오더·직원·지입차)의 회사가 늘어난다고 볼 때입니다. 비용은 고정비 + 서버비(무료 제공량 반영) — 서버비는 회사가 많아질수록 무료량을 넘어 조금씩 늘어납니다.</div>
        </Card>
        <Card code="SIMULATOR" title="시뮬레이터" right={<Btn onClick={() => setSim(seed())} className="h-8 px-3 text-[12px]">지금 평균으로</Btn>}>
          <div className="space-y-3.5">
            <div>
              <div className="text-[12.5px] font-bold text-[#5B6B85] mb-1">평균 요금제</div>
              <div className="grid grid-cols-4 gap-1">{planList.map((p) => <button key={p.id} type="button" onClick={() => set("planId", p.id)} className={`h-9 rounded-lg text-[12px] font-black border ${sim.planId === p.id ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "border-[#DCE3EE] text-[#1B2B4B]"}`}>{p.name}</button>)}</div>
            </div>
            {numBox({ k: "n", l: "운송사 수", unit: "곳", min: 1, max: 100, })}
            {numBox({ k: "daily", l: "평균 일 오더", unit: "건", min: 0, max: 400, step: 5, })}
            {numBox({ k: "staff", l: "평균 직원 계정", unit: "명", min: 1, max: 40, })}
            {numBox({ k: "fleet", l: "평균 지입차(GPS)", unit: "대", min: 0, max: 60, })}
            {numBox({ k: "extra", l: "1곳당 추가 청구(문자·세금계산서 등)", unit: "원", min: 0, max: 200000, step: 5000, })}
            <div className="rounded-xl bg-[#F7F9FC] border border-[#EEF1F6] p-3 space-y-1.5 text-[13px]">
              {[["1곳 월 청구(요금제+초과+추가)", won(rev1)], [`${sim.n}곳 매출`, won(at.rev)], ["고정비", won(d.fixed.total)], ["서버 변동비", won(at.variable)]].map(([k, v]) => <div key={k} className="flex justify-between gap-2"><span className="font-bold text-[#5B6B85]">{k}</span><span className="font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</span></div>)}
              <div className="flex justify-between gap-2 pt-1.5 border-t border-dashed border-[#DCE3EE]"><span className="font-black">월 이익</span><span className="font-black tabular-nums text-[15px]" style={{ fontFamily: MONO, color: at.profit < 0 ? RED : INK }}>{wonS(at.profit)}</span></div>
            </div>
          </div>
        </Card>
      </div>
      <Card code="PLAN UNIT ECONOMICS" title="요금제별 — 포함 한도를 꽉 채워 쓸 때 원가 · 마진" bodyClass="p-0">
        <div className="overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 820 }}>
          <thead><tr className="bg-[#1B2B4B] text-white">{["요금제", "월 요금", "포함 한도(직원 · 오더 · 지입)", "하루 읽기 / 쓰기(추정)", "서버 원가(단가 기준)", "마진", "마진율"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{perPlan.map(({ p, a, gross, margin, rate }) => { const e = estimateDaily(d.model, a); return (
            <tr key={p.id} className="border-t border-[#EEF1F6]">
              <td className="px-3 py-2.5 font-black">{p.name}</td>
              <td className="px-3 py-2.5 text-right font-black tabular-nums" style={{ fontFamily: MONO }}>{won(p.price)}</td>
              <td className="px-3 py-2.5 text-center tabular-nums" style={{ fontFamily: MONO }}>{num(p.seats)}명 · {cnt(p.orders)}건 · {num(p.fleet)}대</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-[#5B6B85]" style={{ fontFamily: MONO }}>{short(e.reads)} / {short(e.writes)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums" style={{ fontFamily: MONO }}>{won(gross)}</td>
              <td className="px-3 py-2.5 text-right font-black tabular-nums" style={{ fontFamily: MONO, color: margin < 0 ? RED : INK }}>{wonS(margin)}</td>
              <td className="px-3 py-2.5 text-right font-black tabular-nums" style={{ fontFamily: MONO, color: rate < 0 ? RED : INK }}>{(rate * 100).toFixed(1)}%</td>
            </tr>); })}</tbody>
        </table></div>
        <div className="px-5 py-3 border-t border-[#EEF1F6] text-[11.5px] text-[#7A879C]">고정비는 빼지 않은 값(공헌이익)입니다. 원가는 [비용 기준 설정] › 활동량 환산 계수로 추정 — 실측이 쌓이면 '서버 사용량'에서 [실측으로 계수 맞추기]를 누르세요.</div>
      </Card>
    </div>
  );
}

// ─── ⑤ 서버 사용량(실측) ───
function ServerView({ d, model, saved, onRefresh, busy }) {
  const st = d.status;
  const days = d.measuredDays;
  const todayRow = days.find((x) => x.id === d.today) || null;
  const fsFree = model.fs;
  const chart = Array.from({ length: d.dim }, (_, i) => {
    const key = `${d.ym}-${pad(i + 1)}`; const r = days.find((x) => x.id === key);
    return { d: i + 1, reads: r ? num(r.reads) : null, writes: r ? num(r.writes) : null };
  });
  const mtd = d.varMtd;
  const fsRowsM = mtd ? mtd.rows.filter((r) => ["fsRead", "fsWrite", "fsDel", "fsGib", "fn", "gcs", "egress"].includes(r.key)) : [];
  const fsRowsP = d.variable.rows.filter((r) => ["fsRead", "fsWrite", "fsDel", "fsGib", "fn", "gcs", "egress"].includes(r.key));
  const mtdBill = fsRowsM.reduce((a, r) => a + r.krw, 0), projBill = fsRowsP.reduce((a, r) => a + r.krw, 0);
  const [cmsg, setCmsg] = React.useState("");
  // 실측으로 계수 맞추기 — 최근 7일 실측 평균 ÷ 활동량 추정
  const calibrate = async () => {
    const est = d.cos.reduce((a, r) => { const e = estimateDaily(model, r.act); a.r += e.reads; a.w += e.writes; return a; }, { r: 0, w: 0 });
    if (!d.avgDay.reads || !est.r) { setCmsg("실측(최근 완료된 날)이 아직 없습니다."); return; }
    const kr = d.avgDay.reads / est.r, kw = d.avgDay.writes / Math.max(1, est.w);
    const c = model.coef;
    const coef = { ...c, readsPerOrder: Math.round(c.readsPerOrder * kr), readsPerStaffDay: Math.round(c.readsPerStaffDay * kr), readsPerFleetDay: Math.round(c.readsPerFleetDay * kr), writesPerOrder: Math.max(1, Math.round(c.writesPerOrder * kw * 10) / 10), writesPerStaffDay: Math.round(c.writesPerStaffDay * kw), writesPerFleetDay: Math.round(c.writesPerFleetDay * kw) };
    if (!window.confirm(`최근 7일 실측 평균(읽기 ${cnt(d.avgDay.reads)} · 쓰기 ${cnt(d.avgDay.writes)}/일)에 맞춰 환산 계수를 바꿀까요?\n읽기 ×${kr.toFixed(2)} · 쓰기 ×${kw.toFixed(2)}\n(시뮬레이터·요금제별 마진·운송사별 배분이 이 계수를 씁니다)`)) return;
    try { await setDoc(doc(db, "platformConfig", "costModel"), { ...(saved || {}), coef, updatedAt: serverTimestamp() }, { merge: true }); setCmsg("계수를 실측에 맞췄습니다."); } catch (e) { setCmsg(`저장 실패: ${e.message}`); }
  };
  const noData = !days.length;
  const perm = st && st.ok === false;
  return (
    <div className="space-y-4">
      {(perm || noData) && (
        <div className="rounded-2xl border border-[#DCE3EE] bg-white px-5 py-4 text-[13px] text-[#1B2B4B] leading-relaxed">
          <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>SETUP · CLOUD MONITORING</div>
          <div className="text-[15.5px] font-black mt-0.5">{perm ? "서버 사용량을 읽을 권한이 없습니다" : "아직 실측 사용량이 없습니다"}</div>
          {perm && st?.errors?.reads && <div className="mt-1 text-[12px] text-[#7A879C] break-all" style={{ fontFamily: MONO }}>{st.errors.reads}</div>}
          <ol className="mt-2 list-decimal pl-5 space-y-1">
            <li>터미널에서 함수 배포: <code className="px-1.5 py-0.5 rounded bg-[#F2F5FA]" style={{ fontFamily: MONO }}>firebase deploy --only functions:platformUsageHourly,functions:platformUsageNow</code> (한 번)</li>
            <li>구글 클라우드 콘솔(console.cloud.google.com) → 프로젝트 <b>dispatch-app-9b92f</b> → 왼쪽 메뉴 <b>IAM 및 관리자 › IAM</b></li>
            <li><b>dispatch-app-9b92f@appspot.gserviceaccount.com</b> 줄의 연필(수정) → <b>다른 역할 추가</b> → <b>모니터링 뷰어(Monitoring Viewer)</b> → 저장 (이미 '편집자'면 필요 없음)</li>
            <li>콘솔 위 검색창에 "Cloud Monitoring API" → <b>사용</b>(이미 켜져 있으면 그대로)</li>
            <li>이 화면 위 <b>[사용량 지금 가져오기]</b> — 이달 1일부터 채워집니다. 그다음부터는 매시간 20분에 자동.</li>
          </ol>
          <div className="mt-2 text-[12px] text-[#7A879C]">그동안은 <b>활동량 추정</b>과 <b>앱 표본</b>(아래)으로 계산합니다.</div>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-[16px] px-4 py-3.5 border bg-white border-[#E3E8F0]">
          <div className="text-[12.5px] font-bold text-[#7A879C]">오늘 읽기 / 하루 무료</div>
          <div className="text-[21px] font-black tabular-nums mt-0.5" style={{ fontFamily: MONO }}>{todayRow ? cnt(todayRow.reads) : "-"}<span className="text-[11px] text-[#9AA9C3] ml-1">/ {cnt(fsFree.freeRead)}</span></div>
          <div className="mt-2"><Meter used={num(todayRow?.reads)} limit={num(fsFree.freeRead)} /></div>
        </div>
        <div className="rounded-[16px] px-4 py-3.5 border bg-white border-[#E3E8F0]">
          <div className="text-[12.5px] font-bold text-[#7A879C]">오늘 쓰기 / 하루 무료</div>
          <div className="text-[21px] font-black tabular-nums mt-0.5" style={{ fontFamily: MONO }}>{todayRow ? cnt(todayRow.writes) : "-"}<span className="text-[11px] text-[#9AA9C3] ml-1">/ {cnt(fsFree.freeWrite)}</span></div>
          <div className="mt-2"><Meter used={num(todayRow?.writes)} limit={num(fsFree.freeWrite)} /></div>
        </div>
        <Kpi k="이달 지금까지 서버 청구" v={mtd ? won(mtdBill) : "-"} sub={mtd ? `읽기 ${short(mtd.reads)} · 쓰기 ${short(mtd.writes)}건` : "실측 연결 후 표시"} />
        <Kpi dark k="월말 예상 서버 청구" v={won(projBill)} sub={d.source === "measured" ? "최근 7일 평균으로 남은 날 계산" : "활동량 추정"} />
      </div>
      {!noData && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[["reads", "하루 읽기", num(fsFree.freeRead)], ["writes", "하루 쓰기", num(fsFree.freeWrite)]].map(([k, t, free]) => (
            <Card key={k} code={k === "reads" ? "READS / DAY" : "WRITES / DAY"} title={`${Number(d.ym.slice(5))}월 ${t} (무료 ${cnt(free)}건 선)`} right={st?.at ? <span className="text-[11.5px] font-bold text-[#7A879C]">갱신 {new Date(st.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> : null}>
              <div className="h-[200px] -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#EEF1F6" vertical={false} />
                    <XAxis dataKey="d" axisLine={false} tickLine={false} interval={4} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                    <YAxis axisLine={false} tickLine={false} width={48} tickFormatter={short} tick={{ fontSize: 11, fill: "#9AA9C3", fontFamily: MONO }} />
                    <Tooltip contentStyle={TT} labelFormatter={(x) => `${Number(d.ym.slice(5))}월 ${x}일`} formatter={(v) => [`${cnt(v)}건`, t]} />
                    <ReferenceLine y={free} stroke={MID} strokeDasharray="5 4" label={{ value: "무료", position: "insideTopRight", fill: MID, fontSize: 11, fontWeight: 800 }} />
                    <Line type="monotone" dataKey={k} stroke={NAVY} strokeWidth={2} dot={{ r: 3, fill: NAVY, stroke: "#fff", strokeWidth: 1.5 }} connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card code="SERVER BILL" title="서버 항목 — 이달 지금까지 · 월말 예상" right={<div className="flex gap-2"><Btn onClick={calibrate} disabled={d.source !== "measured"} className="h-8 px-3 text-[12px]">실측으로 계수 맞추기</Btn><Btn onClick={onRefresh} disabled={busy} className="h-8 px-3 text-[12px]">{busy ? "…" : "지금 가져오기"}</Btn></div>} bodyClass="p-0">
        <div className="overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 720 }}>
          <thead><tr className="bg-[#1B2B4B] text-white">{["항목", "무료 제공", "지금까지 사용", "지금까지 비용", "월말 예상 사용", "월말 예상 비용"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{fsRowsP.map((p) => { const m = fsRowsM.find((x) => x.key === p.key); const f = (v) => (v < 100 && v % 1 ? v.toFixed(2) : cnt(v)); return (
            <tr key={p.key} className="border-t border-[#EEF1F6]">
              <td className="px-3 py-2 font-black whitespace-nowrap">{p.group} · {p.label}</td>
              <td className="px-3 py-2 text-center text-[#7A879C] whitespace-nowrap">{p.free}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: MONO }}>{m ? `${f(m.usage)} ${p.usageUnit}` : "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: MONO }}>{m ? won(m.krw) : "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: MONO }}>{f(p.usage)} {p.usageUnit}</td>
              <td className="px-3 py-2 text-right font-black tabular-nums" style={{ fontFamily: MONO }}>{won(p.krw)}</td>
            </tr>); })}</tbody>
        </table></div>
        {cmsg && <div className="px-5 py-2.5 border-t border-[#EEF1F6] text-[13px] font-bold">{cmsg}</div>}
        <div className="px-5 py-3 border-t border-[#EEF1F6] text-[11.5px] text-[#7A879C] leading-relaxed">Firestore 무료량은 하루 단위라, 날마다 무료량을 넘은 만큼만 더합니다. 구글 클라우드 지표는 몇 분 늦게 들어오고, 실제 청구서와 몇 % 차이가 날 수 있습니다(실제 청구 기준: 콘솔 › 결제).</div>
      </Card>
      <Card code="APP SAMPLE" title="앱 표본 — 운송사별 화면이 받은 문서 수(이달)" bodyClass="p-0">
        {!(d.counters || []).length ? <div className="py-10 text-center text-[#9AA9C3] text-[13px]">아직 표본이 없습니다 — 규칙 배포 후 직원이 접속하면 10분마다 쌓입니다.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 560 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["운송사", "읽기", "쓰기", "접속(세션)", "세션당 읽기"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold">{h}</th>)}</tr></thead>
            <tbody>{[...d.counters].sort((a, b) => num(b.reads) - num(a.reads)).map((c) => (
              <tr key={c.id} className="border-t border-[#EEF1F6]">
                <td className="px-3 py-2 font-black">{c.company}</td>
                {[c.reads, c.writes, c.sessions, num(c.reads) / Math.max(1, num(c.sessions))].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: MONO }}>{cnt(v)}</td>)}
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="px-5 py-3 border-t border-[#EEF1F6] text-[11.5px] text-[#7A879C]">직원·기사 화면(웹·앱)이 서버에서 받은 문서와 저장 횟수만 셉니다(서버 함수·안드로이드 위치 기록 제외). 회사별로 서버비를 나누는 비율로 씁니다.</div>
      </Card>
    </div>
  );
}

// ─── 비용 기준 설정(모달) ───
const getP = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => { const ks = p.split("."); const out = { ...o }; let cur = out; ks.slice(0, -1).forEach((k) => { cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; }); cur[ks[ks.length - 1]] = v; return out; };
const FIELDS = [
  ["환율 · 공통", [["fx", "환율", "원/$"], ["usdTaxPct", "해외 결제 가산(부가세·카드 수수료)", "%"]]],
  ["Firestore (Blaze)", [["fs.read", "읽기 10만 건당", "$"], ["fs.write", "쓰기 10만 건당", "$"], ["fs.del", "삭제 10만 건당", "$"], ["fs.gib", "저장 1GiB · 월", "$"], ["fs.freeRead", "무료 읽기(하루)", "건"], ["fs.freeWrite", "무료 쓰기(하루)", "건"], ["fs.freeDel", "무료 삭제(하루)", "건"], ["fs.freeGib", "무료 저장", "GiB"]]],
  ["Cloud Functions", [["fn.perM", "호출 100만 회당", "$"], ["fn.freeM", "무료 호출(월)", "백만 회"], ["fn.avgSec", "평균 실행 시간", "초"], ["fn.memGB", "평균 메모리", "GB"]]],
  ["Cloud Storage", [["gcs.gb", "저장 1GB · 월", "$"], ["gcs.freeGb", "무료 저장", "GB"], ["gcs.egress", "송신 1GB", "$"], ["gcs.freeEgressGb", "무료 송신(월)", "GB"]]],
  ["호스팅 · 도메인", [["vercel.seats", "Vercel 멤버 수", "명"], ["hostingKrw", "Firebase Hosting(월)", "원"], ["domainKrwYear", "도메인(1년)", "원"]]],
  ["앱 마켓", [["play.usd", "Google Play 등록(1회)", "$"], ["play.months", "나눠 반영할 기간", "개월"], ["apple.usdYear", "Apple 개발자(1년)", "$"]]],
  ["전자세금계산서 · 문자", [["etax.krw", "세금계산서 ASP 1건 원가", "원"], ["msg.alimtalk", "알림톡 1건 원가", "원"], ["msg.sms", "SMS 1건 원가", "원"], ["msg.lms", "LMS 1건 원가", "원"]]],
  ["지도 · 글자 인식 · 메일", [["tmap.krw", "Tmap 무료 초과 1건", "원"], ["tmap.freeDay", "Tmap 무료(하루)", "건"], ["tmap.perOrder", "오더 1건당 Tmap 호출", "회"], ["vision.per1k", "Vision 1,000건당", "$"], ["vision.free", "Vision 무료(월)", "건"], ["emailKrw", "메일 발송(월 정액)", "원"]]],
  ["활동량 → 서버 사용량 환산 계수", [["coef.readsPerOrder", "오더 1건당 읽기(한 달)", "건"], ["coef.writesPerOrder", "오더 1건당 쓰기", "건"], ["coef.readsPerStaffDay", "직원 1명 하루 읽기", "건"], ["coef.writesPerStaffDay", "직원 1명 하루 쓰기", "건"], ["coef.readsPerFleetDay", "지입차 1대 하루 읽기(퍼짐)", "건"], ["coef.writesPerFleetDay", "지입차 1대 하루 쓰기(GPS)", "건"], ["coef.fnPerOrder", "오더 1건당 함수 실행", "회"], ["coef.mbPerOrder", "오더 1건당 저장", "MB"], ["coef.workDays", "월 근무일", "일"]]],
];
function SettingsModal({ model, onClose }) {
  const [m, setM] = React.useState(model);
  const [saving, setSaving] = React.useState(false);
  const up = (p, v) => setM((x) => setP(x, p, v));
  const save = async () => {
    setSaving(true);
    try { await setDoc(doc(db, "platformConfig", "costModel"), { ...m, updatedAt: serverTimestamp() }); onClose(); }
    catch (e) { window.alert(`저장 실패: ${e.message}`); setSaving(false); }
  };
  const inp = "h-9 w-28 px-2.5 rounded-lg border border-[#DCE3EE] text-right text-[14px] font-black text-[#1B2B4B] outline-none focus:border-[#4B6CB7]";
  const fx = fixedCosts(m);
  return (
    <div className="fixed inset-0 z-[100060] bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[1100px] max-h-[94vh] flex flex-col rounded-[24px] bg-[#F4F6FA] shadow-[0_40px_100px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="px-6 py-4 text-white flex items-start justify-between gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>COST MODEL · SETTINGS</div>
            <div className="text-[20px] font-black mt-0.5">비용 기준 설정</div>
            <div className="text-[12.5px] text-white/65 mt-0.5">모든 단가는 {m.asOf} 기준 공개 가격 <b>추정치</b>입니다 — 실제 청구서(구글 클라우드 결제 · 카드 명세)와 맞춰 고쳐 주세요.</div>
          </div>
          <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold">닫기 ✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
              <div className="text-[13px] font-black mb-2">Claude Code 구독</div>
              <div className="grid gap-1.5">{CLAUDE_TIERS.map((t) => <label key={t.id} className="flex items-center gap-2 text-[13px] font-bold"><input type="radio" name="claude" checked={m.claude === t.id} onChange={() => up("claude", t.id)} />{t.label}</label>)}</div>
            </div>
            <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
              <div className="text-[13px] font-black mb-2">Vercel 요금제</div>
              <div className="grid gap-1.5">{VERCEL_PLANS.map((t) => <label key={t.id} className="flex items-center gap-2 text-[13px] font-bold"><input type="radio" name="vercel" checked={m.vercel?.plan === t.id} onChange={() => up("vercel.plan", t.id)} />{t.label}</label>)}</div>
            </div>
            <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 space-y-1.5">
              <div className="text-[13px] font-black mb-1">켜기 · 끄기</div>
              {[["play.on", "Google Play 등록비 반영"], ["apple.on", "Apple 개발자 연회비 반영(iOS 앱 출시 시)"], ["etax.platformIssue", "고객사 월 청구서도 전자세금계산서로 발행"]].map(([p, l]) => <label key={p} className="flex items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={!!getP(m, p)} onChange={(e) => up(p, e.target.checked)} />{l}</label>)}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map(([title, rows]) => (
              <div key={title} className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
                <div className="flex items-center justify-between"><div className="text-[13.5px] font-black">{title}</div><Tag>검증 필요</Tag></div>
                {rows.map(([p, l, u]) => (
                  <div key={p} className="flex items-center justify-between gap-3 py-1.5 border-t first:border-t-0 border-[#EEF1F6] mt-1">
                    <span className="text-[13px] font-bold text-[#3A4A66]">{l}<span className="ml-1.5 text-[11px] text-[#9AA9C3]">기본 {String(getP(COST_DEFAULT, p))}</span></span>
                    <span className="inline-flex items-center gap-1.5"><input type="number" step="any" value={getP(m, p) ?? ""} onChange={(e) => up(p, e.target.value === "" ? "" : Number(e.target.value))} className={inp} style={{ fontFamily: MONO }} /><span className="text-[12px] font-bold text-[#7A879C] w-12">{u}</span></span>
                  </div>
                ))}
              </div>
            ))}
            <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
              <div className="flex items-center justify-between"><div className="text-[13.5px] font-black">기타 고정비 (월)</div><button type="button" onClick={() => up("custom", [...(m.custom || []), { label: "새 항목", krw: 0 }])} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black">+ 추가</button></div>
              {(m.custom || []).map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-t first:border-t-0 border-[#EEF1F6] mt-1">
                  <input value={c.label} onChange={(e) => up("custom", m.custom.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} className="h-9 flex-1 min-w-0 px-2.5 rounded-lg border border-[#DCE3EE] text-[13px] font-bold" />
                  <input type="number" value={c.krw} onChange={(e) => up("custom", m.custom.map((x, k) => (k === i ? { ...x, krw: Number(e.target.value) || 0 } : x)))} className={inp} style={{ fontFamily: MONO }} /><span className="text-[12px] font-bold text-[#7A879C]">원</span>
                  <button type="button" onClick={() => up("custom", m.custom.filter((_, k) => k !== i))} className="text-[#9AA9C3] px-1">✕</button>
                </div>
              ))}
              <div className="mt-2 text-[11.5px] text-[#7A879C]">운영자 인건비 목표를 넣으면 "내 월급까지 벌려면 몇 곳"이 손익분기점으로 바로 보입니다.</div>
            </div>
          </div>
          <div className="rounded-2xl bg-[#0F1A30] text-white px-5 py-3 text-[13px] flex flex-wrap gap-x-6 gap-y-1">
            <span>고정비 합계 <b style={{ fontFamily: MONO }}>{won(fx.total)}</b>/월</span>
            {fx.rows.filter((r) => r.krw > 0).map((r) => <span key={r.key} className="text-white/65">{r.label} {won(r.krw)}</span>)}
          </div>
          <div className="text-[11.5px] text-[#7A879C] leading-relaxed">출처: {m.source}</div>
        </div>
        <div className="px-5 py-3 bg-white border-t border-[#E3E8F0] flex justify-between gap-2 flex-wrap">
          <Btn onClick={() => window.confirm("모든 값을 기본값(추정치)으로 되돌릴까요? (저장을 눌러야 적용)") && setM(mergeCost({ ...COST_DEFAULT, coef: m.coef }))}>기본 단가로 되돌리기(계수 유지)</Btn>
          <div className="flex gap-2"><Btn onClick={onClose}>취소</Btn><Btn dark onClick={save} disabled={saving}>{saving ? "저장 중…" : "저장"}</Btn></div>
        </div>
      </div>
    </div>
  );
}
