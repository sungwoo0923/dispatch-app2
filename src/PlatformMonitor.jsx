// ======================= src/PlatformMonitor.jsx =======================
// 🛰 관리센터(최고관리자 전용, 2026-10-28) — "운송사 하나"가 아니라 이 프로그램 전체를 관제한다.
//  가입한 운송사·화주사별 계정·접속·오더·데이터량·성장률·건강도, 그리고 예상 청구액(요금제는 화면에서 바꿈).
//  숫자는 서버(platformStats 함수)가 모아 siteConfig/platformStats 한 문서로 저장한다(⭐ 2026-11-02: 06~23시 매시간 + 새벽 4시 전체).
//  ⭐ 2026-11-02 관리자센터 — 계정·접속 숫자는 PlatformLive가 users·loginSessions를 실시간으로 읽어 덮어쓴다(사람 uid 기준).
//  ⭐ 알록달록 금지 — 네이비 계열만. 경고도 굵기·테두리로만 구분한다.
import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, AreaChart, Area, PieChart, Pie } from "recharts";
import { db, auth, FUNCTIONS_BASE } from "./firebase";
import KpSubNav from "./KpSubNav";
import { COMPANY_FEATURES, useCompanyFeatures, setCompanyFeature } from "./companyFeatures"; // ⭐ 2026-11-02 회사별 맞춤 기능
import CompanyApplications from "./CompanyApplications";
import { PricingEditor, QuoteBuilder, QuoteHistory, useSalesPricing, applyPlanBill } from "./SalesQuote";
// ⭐ 2026-11-02 관리자센터 — 실시간 계정·접속(users·loginSessions) + 운영 위젯
import { usePlatformLive, mergeCompanies, mergeShippers, StatsStamp, LiveNowPanel, SignupTimeline, PendingPanel, DupeWarning, HealthCard, StaffList, Spark, PLAN_NAMES } from "./PlatformLive";
import { CustomSelect } from "./CustomSelect";
import { fmtMoney, parseMoney } from "./formatInput";
import { LogisTag } from "./brand"; // 🔷 2026-11-04 LogisWeb 로고

// 📱 폰(관리자 관리센터 모바일) — 가로 칸 수를 줄인다
export function usePhone() {
  const q = "(max-width: 767px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setOn(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return on;
}
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const NAVY = "#1B2B4B";
const DEFAULT_PRICING = { base: 99000, includedSeats: 3, seat: 15000, includedOrders: 1000, perOrder: 50, shipperBase: 0 };
const won = (n) => `${Math.round(n || 0).toLocaleString()}원`;
const short = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n || 0).toLocaleString();
};
const daysAgo = (ymd, today) => (ymd ? Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${ymd}T00:00:00Z`)) / 86400000) : null);
const ago = (ms) => {
  if (!ms) return "-";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
};
const ymdOf = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : "-");

// 요금 계산(월말 환산 오더 기준)
export function estimateBill(c, p, dayNo, daysInMonth) {
  const projected = dayNo ? Math.round((c.m?.cnt || 0) / dayNo * daysInMonth) : 0;
  const seats = Math.max(0, (c.staff || 0) - p.includedSeats) * p.seat;
  const orders = Math.max(0, projected - p.includedOrders) * p.perOrder;
  return { projected, base: p.base, seats, orders, total: p.base + seats + orders };
}

// 건강도 0~100 — 최근 14일 중 오더 있는 날, 24시간 접속, 전월 같은 기간 대비 성장
function healthOf(c, today) {
  const days = Object.keys(c.daily || {}).filter((d) => daysAgo(d, today) < 14).length;
  const act = Math.min(1, days / 10) * 55;
  const online = Math.min(1, (c.online || 0) / Math.max(1, Math.min(c.staff || 1, 5))) * 25;
  const g = c.pmSame?.cnt ? (c.m.cnt - c.pmSame.cnt) / c.pmSame.cnt : c.m?.cnt ? 0.2 : -1;
  const grow = Math.max(0, Math.min(1, (g + 0.5) / 0.8)) * 20;
  const idle = daysAgo(c.lastOrder, today);
  const v = Math.round(act + online + grow);
  return !c.lastOrder || idle >= 14 ? Math.min(v, 15) : v; // 휴면이면 접속만 있어도 낮게
}
function statusOf(c, today) {
  const idle = daysAgo(c.lastOrder, today);
  if (c.appliedAt && Date.now() - c.appliedAt < 30 * 86400000) return { key: "new", label: "신규" };
  if (!c.lastOrder || idle >= 14) return { key: "dormant", label: "휴면" };
  if (c.pmSame?.cnt >= 20 && c.m.cnt < c.pmSame.cnt * 0.7) return { key: "drop", label: "감소" };
  return { key: "active", label: "활성" };
}

// ─── 작은 부품 ────────────────────────────────────────────────────────────────
// ⭐ 2026-11-02 관리자센터 — 타일에 스파크라인(spark)·누르기(onClick) 추가
function Tile({ code, label, value, unit, foot, dark, spark, onClick }) {
  return (
    <div onClick={onClick} className={dark ? "pm-tile-dark" : "pm-tile"} style={{ borderRadius: 16, padding: "15px 17px 13px", minWidth: 0, position: "relative", overflow: "hidden", cursor: onClick ? "pointer" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: dark ? "rgba(255,255,255,.8)" : "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.16em", color: dark ? "rgba(143,176,240,.85)" : "#94A3B8", whiteSpace: "nowrap" }}>{code}</span>
      </div>
      {spark && <div className="pm-spark" style={{ position: "absolute", right: 14, top: 40, width: "42%", opacity: 0.55, pointerEvents: "none" }}><Spark values={spark} width={120} height={30} stroke={dark ? "#8FB0F0" : "#2D4C82"} /></div>}
      <div style={{ marginTop: 9, display: "flex", alignItems: "baseline", gap: 5, minWidth: 0, position: "relative" }}>
        <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 800, color: dark ? "#fff" : "#0F1A30", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{value}</span>
        {unit && <span style={{ fontSize: 14, fontWeight: 700, color: dark ? "rgba(207,224,255,.55)" : "#9ca3af" }}>{unit}</span>}
      </div>
      {foot && <div style={{ marginTop: 5, fontSize: 13.5, fontWeight: 600, color: dark ? "rgba(207,224,255,.6)" : "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{foot}</div>}
    </div>
  );
}
function Card({ code, title, right, children, style }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E3E8F0", borderRadius: 18, boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 10px 26px rgba(16,24,40,.05)", overflow: "hidden", minWidth: 0, ...style }}>
      <div style={{ padding: "13px 18px", background: "#F7F9FC", borderBottom: "1px solid #E8EDF4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, rowGap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0, whiteSpace: "nowrap" }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: NAVY, transform: "rotate(45deg)" }} />
          <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.18em", color: "#94A3B8" }}>{code}</span>
          <span style={{ fontSize: 16.5, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap" }}>{title}</span>
        </span>
        {right}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
function Delta({ cur, prev }) {
  if (!prev) return <span style={{ fontFamily: MONO, fontSize: 13.5, color: "#9ca3af" }}>—</span>;
  const r = ((cur - prev) / prev) * 100;
  return <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: r >= 0 ? NAVY : "#64748b" }}>{r >= 0 ? "▲" : "▼"} {Math.abs(r).toFixed(1)}%</span>;
}
function StatusChip({ s }) {
  const st = {
    active: { background: NAVY, color: "#fff", border: `1px solid ${NAVY}` },
    new: { background: "#EEF3FB", color: NAVY, border: "1px solid #C9D3E4" },
    drop: { background: "#fff", color: NAVY, border: `1.5px solid ${NAVY}` },
    dormant: { background: "#fff", color: "#64748b", border: "1px dashed #94A3B8" },
  }[s.key];
  return <span style={{ ...st, display: "inline-block", padding: "2px 9px", borderRadius: 6, fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap" }}>{s.label}</span>;
}
function MiniBars({ daily = {}, today }) {
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (29 - i)); return d.toISOString().slice(0, 10); });
  const max = Math.max(1, ...days.map((d) => daily[d] || 0));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 26, width: 120 }}>
      {days.map((d) => <span key={d} style={{ flex: 1, height: `${Math.max(6, ((daily[d] || 0) / max) * 100)}%`, borderRadius: 1.5, background: daily[d] ? (d === today ? NAVY : "#6E8BC4") : "#E3E8F0" }} />)}
    </div>
  );
}
function HealthBar({ v }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ width: 54, height: 6, borderRadius: 99, background: "#E8EDF4", overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", borderRadius: 99, background: v >= 60 ? NAVY : v >= 30 ? "#6E8BC4" : "#B6C2D6" }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, color: "#0F1A30" }}>{v}</span>
    </div>
  );
}

// ─── 본체 ────────────────────────────────────────────────────────────────────
// ⭐ 2026-10-29 — 관리자 관리센터(PlatformCenter, /platform)가 상단·왼쪽 메뉴를 직접 그리고 이 화면은 내용만 그린다(bare).
//    bare가 아니면 예전처럼 왼쪽 메뉴까지 스스로 그린다.
// ⭐ 2026-11-02 관리자센터 — 계정·접속 숫자는 실시간(PlatformLive)으로 덮어쓰고, 오더·운송액은 집계 문서 + "집계 시각 · 다시 집계"
function NavWrap({ bare, children, ...p }) { return bare ? <>{children}</> : <KpSubNav {...p}>{children}</KpSubNav>; }
const STATUS_COLORS = { active: "#1B2B4B", new: "#6E8BC4", drop: "#2D4C82", dormant: "#C9D3E4" };
const STATUS_NAMES = { active: "활성", new: "신규", drop: "감소", dormant: "휴면" };
export default function PlatformMonitor({ demoStats = null, tab: tabProp, onTab, bare = false, onContract, focusCompany, onFocusDone }) { // demoStats: 화면 점검용(실제 화면에선 안 씀)
  const [tabState, setTabState] = useState(() => { try { return localStorage.getItem("pmTab") || "overview"; } catch { return "overview"; } });
  const tab = tabProp || tabState;
  const setTab = onTab || setTabState;
  const [openQuote, setOpenQuote] = useState(null); // 견적 이력 → "열기"로 불러온 견적
  const [stats, setStats] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("orders");
  const [detailName, setDetailName] = useState(null);
  const [view, setView] = useState(() => { try { return localStorage.getItem("pmCoView") || "cards"; } catch { return "cards"; } });
  const [filter, setFilter] = useState("all");
  const phone = usePhone();
  const live = usePlatformLive();

  useEffect(() => { if (!tabProp) { try { localStorage.setItem("pmTab", tab); } catch { /* 무시 */ } } }, [tab, tabProp]);
  useEffect(() => { try { localStorage.setItem("pmCoView", view); } catch { /* 무시 */ } }, [view]);
  // 다른 화면(실시간 접속 등)에서 회사를 누르면 상세 패널을 연다
  useEffect(() => { if (focusCompany) { setDetailName(focusCompany); onFocusDone?.(); } }, [focusCompany, onFocusDone]);
  useEffect(() => {
    if (demoStats) { setStats(demoStats); setLoaded(true); return undefined; }
    // ⭐ 2026-11-02 관리자센터 — 로그인 직후 권한 확인이 늦으면 첫 구독이 거절될 수 있어 몇 번 다시 붙는다
    let u1 = () => {}; let tries = 0; let timer = null; let dead = false;
    const sub = () => {
      u1 = onSnapshot(doc(db, "siteConfig", "platformStats"), (s) => { setStats(s.exists() ? s.data() : null); setLoaded(true); }, () => {
        setLoaded(true);
        if (!dead && tries++ < 5) timer = setTimeout(sub, 2000 * tries);
      });
    };
    sub();
    const u2 = onSnapshot(doc(db, "siteConfig", "platformPricing"), (s) => { if (s.exists()) setPricing({ ...DEFAULT_PRICING, ...s.data() }); }, () => {});
    return () => { dead = true; clearTimeout(timer); u1(); u2(); };
  }, [demoStats]);

  const refresh = async () => {
    setBusy(true); setMsg("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/platformStats`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
      setMsg(j.skipped ? `방금 집계했습니다 — ${Math.ceil(j.nextInSec / 60)}분 뒤에 다시 집계할 수 있습니다.` : `집계 완료 — 운송사 ${j.companies}곳 · 화주사 ${j.shippers}곳`);
    } catch (e) {
      setMsg(`집계 실패: ${e.message || e}${/Failed to fetch|404/.test(String(e.message)) ? " (서버 함수 배포가 필요합니다)" : ""}`);
    } finally { setBusy(false); }
  };

  const S = stats || (live?.ready ? {} : null); // 집계 전이어도 실시간 숫자는 보여 준다
  const today = stats?.today || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dayNo = Number(today.slice(8));
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  // ⭐ 2026-11-02 관리자센터2 — 요금제가 지정된 회사(청구 › 수납 관리)는 요금제 관리 가격으로 청구 계산(예전엔 모든 회사를 공통 기본료로 계산해 요금제 가격과 달랐다)
  const sales = useSalesPricing();
  const companies = useMemo(() => mergeCompanies(stats?.companies, live).map((c) => {
    const bill = applyPlanBill(estimateBill(c, pricing, dayNo, daysInMonth), c, c.plan?.planId, sales);
    const inactiveDays = c.lastSeen ? Math.floor((Date.now() - c.lastSeen) / 86400000) : null;
    return { ...c, bill, health: healthOf(c, today), status: statusOf(c, today), idle: daysAgo(c.lastOrder, today), inactiveDays };
  }), [stats, live, pricing, dayNo, daysInMonth, today, sales]);
  const shippers = useMemo(() => mergeShippers(stats?.shippers, live), [stats, live]);
  const detail = detailName ? companies.find((c) => c.name === detailName) || null : null;

  const T = useMemo(() => {
    const t = { staff: 0, drivers: 0, online: 0, onlineNow: 0, mCnt: 0, pmCnt: 0, gmv: 0, pmGmv: 0, mrr: 0, total: 0, pending: 0 };
    companies.forEach((c) => {
      t.staff += c.staff; t.drivers += c.drivers; t.online += c.online; t.onlineNow += c.onlineNow || 0; t.mCnt += c.m.cnt; t.pmCnt += c.pmSame?.cnt || 0;
      t.gmv += c.m.sale; t.pmGmv += c.pmSame?.sale || 0; t.mrr += c.bill.total; t.total += c.totalOrders; t.pending += c.pending;
    });
    t.shipperUsers = shippers.reduce((a, s) => a + (s.users || 0), 0);
    t.shipperOnline = shippers.reduce((a, s) => a + (s.online || 0), 0);
    return t;
  }, [companies, shippers]);
  const LT = live?.ready ? live.totals : { onlineNow: T.onlineNow, online24h: T.online + T.shipperOnline, pcNow: 0, mobileNow: 0 };

  const daily = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (29 - i));
    const k = d.toISOString().slice(0, 10);
    const v = stats?.platformDaily?.[k] || { cnt: 0, sale: 0 };
    return { label: `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`, cnt: v.cnt, sale: v.sale, on: k === today };
  }), [stats, today]);

  const alerts = useMemo(() => {
    const a = [];
    companies.forEach((c) => {
      if ((c.staff || c.m.cnt) && (c.inactiveDays == null || c.inactiveDays >= 7)) a.push({ c, text: c.inactiveDays == null ? "접속 기록 없음" : `${c.inactiveDays}일째 아무도 접속 안 함`, level: 2 });
      if (c.status.key === "dormant" && c.staff) a.push({ c, text: c.lastOrder ? `${c.idle}일째 오더 없음` : "아직 오더 없음", level: 2 });
      if (c.status.key === "drop") a.push({ c, text: `전월 같은 기간 대비 오더 ${Math.round((1 - c.m.cnt / c.pmSame.cnt) * 100)}% 감소`, level: 2 });
      if (c.pending) a.push({ c, text: `직원 승인 대기 ${c.pending}명`, level: 1 });
      if (c.status.key === "new") a.push({ c, text: `신규 가입 · ${ymdOf(c.appliedAt)}`, level: 0 });
    });
    shippers.filter((s) => s.status === "pending").forEach((s) => a.push({ c: { name: s.name }, text: "화주사 가입 승인 대기", level: 1 }));
    return a.sort((x, y) => y.level - x.level);
  }, [companies, shippers]);

  // 주의가 필요한 정도(높을수록 먼저)
  const riskOf = (c) => ((c.staff || c.m.cnt) && (c.inactiveDays == null || c.inactiveDays >= 7) ? 100 : 0) + (c.status.key === "dormant" ? 50 : 0) + (c.status.key === "drop" ? 40 : 0) + (c.pending || 0) * 6 + (c.planReqs?.length || 0) * 12 + (c.status.key === "new" ? 8 : 0);
  const FILTERS = [
    ["all", "전체", () => true],
    ["online", "지금 접속", (c) => c.onlineNow > 0],
    ["inactive", "7일+ 미접속", (c) => c.inactiveDays == null || c.inactiveDays >= 7],
    ["dormant", "휴면·감소", (c) => ["dormant", "drop"].includes(c.status.key)],
    ["new", "신규", (c) => c.status.key === "new"],
    ["pending", "승인 대기", (c) => c.pending > 0],
  ];
  const sorted = useMemo(() => {
    const k = q.trim();
    const f = (FILTERS.find((x) => x[0] === filter) || FILTERS[0])[2];
    const list = companies.filter((c) => (!k || c.name.includes(k) || (c.code || "").includes(k)) && f(c));
    const by = {
      orders: (a, b) => b.m.cnt - a.m.cnt, gmv: (a, b) => b.m.sale - a.m.sale, bill: (a, b) => b.bill.total - a.bill.total,
      health: (a, b) => b.health - a.health, staff: (a, b) => b.staff - a.staff, data: (a, b) => b.totalOrders - a.totalOrders, recent: (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0),
      online: (a, b) => (b.onlineNow - a.onlineNow) || (b.online - a.online), risk: (a, b) => riskOf(b) - riskOf(a),
    }[sortKey] || ((a, b) => b.m.cnt - a.m.cnt);
    return [...list].sort(by);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, q, sortKey, filter]);

  const statusPie = useMemo(() => ["active", "new", "drop", "dormant"].map((k) => ({ k, name: STATUS_NAMES[k], value: companies.filter((c) => c.status.key === k).length })), [companies]);

  const savePricing = async (next) => {
    setPricing(next);
    try { await setDoc(doc(db, "siteConfig", "platformPricing"), next, { merge: true }); } catch (e) { setMsg(`요금제 저장 실패: ${e.message}`); }
  };

  const headBar = (
    <div className="pm-hero" style={{ borderRadius: phone ? 18 : 22, padding: phone ? "14px 16px" : "20px 24px", marginBottom: phone ? 12 : 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: phone ? 10 : 16, flexWrap: "wrap", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, letterSpacing: "0.28em", color: "#8FB0F0" }}>{/* ⭐ 2026-11-02 관리자센터2 — 다른 화면처럼 "구역 · 메뉴" 표기 */}{{ companies: "CLIENTS · CARRIERS", shippers: "CLIENTS · SHIPPERS", billing: "BILLING · INVOICE", overview: "DASHBOARD · OVERVIEW" }[tab] || <LogisTag height={9.5} text="PLATFORM CONTROL" />}</div>
        <h1 style={{ margin: "6px 0 0", fontSize: phone ? 19 : 25, fontWeight: 900, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{{ companies: "운송사 관제", shippers: "화주사 관제", billing: "요금·청구" }[tab] || "플랫폼 관제센터"}</h1>
        <p style={{ margin: "5px 0 0", fontSize: phone ? 12 : 14, color: "rgba(207,224,255,.72)", fontWeight: 600, whiteSpace: phone ? "normal" : undefined }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 9, background: live?.ready ? "#CFE0FF" : "#64748b", boxShadow: live?.ready ? "0 0 8px #8FB0F0" : "none" }} />계정·접속은 실시간</span>
          {" · "}오더·운송액은 집계 기준(06~23시 매시간)
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {msg && <span style={{ fontSize: 14, fontWeight: 700, color: "#CFE0FF", maxWidth: 380 }}>{msg}</span>}
        <StatsStamp updatedAtMs={stats?.updatedAtMs} busy={busy} onRefresh={refresh} />
      </div>
    </div>
  );

  const empty = loaded && !stats && (
    <Card code="SETUP" title="아직 오더 집계가 없습니다" style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
        위의 <b>다시 집계</b>를 누르면 가입사별 오더·운송액을 바로 모읍니다. 이후에는 낮 시간(06~23시) 매시간 자동으로 갱신됩니다. 계정·접속 숫자는 집계와 상관없이 실시간입니다.<br />
        <span style={{ color: "#6b7280", fontSize: 14.5 }}>※ 처음 한 번은 PC에서 서버 배포(firebase deploy --only functions)가 필요합니다.</span>
      </div>
    </Card>
  );

  const th = { padding: "10px 10px", fontSize: 13.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", textAlign: "center" };
  const td = { padding: "10px 10px", fontSize: 14.5, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", textAlign: "center", borderTop: "1px solid #EEF1F6" };
  const grid3 = { display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "stretch" };
  const risky = [...companies].filter((c) => riskOf(c) > 0).sort((a, b) => riskOf(b) - riskOf(a));
  const healthPick = (risky.length ? risky : [...companies].sort((a, b) => b.m.cnt - a.m.cnt)).slice(0, phone ? 4 : 6);
  const openCo = (name) => setDetailName(name);

  return (
    <NavWrap bare={bare} code="PLATFORM" title="관리센터" icon="server" active={tab} onSelect={setTab}
      groups={[
        { label: "관제", items: [
          { key: "overview", label: "플랫폼 개요", en: "OVERVIEW", icon: "pulse" },
          { key: "companies", label: "운송사 관제", en: "CARRIERS", icon: "building", badge: alerts.filter((a) => a.level === 2).length },
          { key: "shippers", label: "화주사 관제", en: "SHIPPERS", icon: "link" },
        ] },
        { label: "운영", items: [
          { key: "billing", label: "요금·청구", en: "BILLING", icon: "money" },
          { key: "applications", label: "가입신청관리", en: "APPLICATIONS", icon: "inbox", badge: shippers.filter((s) => s.status === "pending").length },
        ] },
        // ⭐ 2026-10-29 영업 — 요금제(언제든 수정) · 견적서 작성/인쇄 · 견적 이력(상태 관리)
        { label: "영업", items: [
          { key: "sales:plans", label: "요금제 관리", en: "PRICING", icon: "sheet" },
          { key: "sales:quote", label: "견적서 작성", en: "QUOTATION", icon: "file" },
          { key: "sales:history", label: "견적 이력", en: "PIPELINE", icon: "history" },
        ] },
      ]}>
      <style>{PM_CSS}</style>
      {tab !== "applications" && !tab.startsWith("sales:") && headBar}
      {tab !== "applications" && !tab.startsWith("sales:") && empty}
      {tab === "sales:plans" && <PricingEditor />}
      {tab === "sales:quote" && <QuoteBuilder initial={openQuote} />}
      {tab === "sales:history" && <QuoteHistory onOpen={(x) => { setOpenQuote(x); setTab("sales:quote"); }} onContract={onContract} />}

      {/* ═══ 플랫폼 개요 ═══ */}
      {tab === "overview" && S && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DupeWarning compact />
          <div style={{ display: "grid", gridTemplateColumns: phone ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: phone ? 8 : 12 }}>
            <Tile dark code="LIVE" label="지금 접속 중" value={LT.onlineNow} unit="명" foot={live?.ready ? `PC ${LT.pcNow} · 모바일 ${LT.mobileNow} · 24시간 ${LT.online24h}명` : "불러오는 중…"} onClick={() => setTab("live")} />
            <Tile code="CARRIERS" label="가입 운송사" value={companies.length} unit="곳" foot={`활성 ${companies.filter((c) => c.status.key === "active").length} · 신규 ${companies.filter((c) => c.status.key === "new").length} · 휴면 ${companies.filter((c) => c.status.key === "dormant").length}`} onClick={() => setTab("companies")} />
            <Tile code="ACCOUNTS" label="전체 계정" value={(T.staff + T.drivers + T.shipperUsers).toLocaleString()} unit="명" foot={`직원 ${T.staff} · 기사 ${T.drivers} · 화주 ${T.shipperUsers}${T.pending ? ` · 대기 ${T.pending}` : ""}`} />
            <Tile code="QUEUE" label="처리 대기" value={live?.pending?.total ?? 0} unit="건" foot={live ? `가입 ${live.pending.transport.length + live.pending.shipper.length} · 요금제 ${live.pending.planReqs.length} · 문의 ${live.pending.inquiries.length}${live.pending.support?.length ? ` · 원격지원 ${live.pending.support.length}` : ""}` : "-"} onClick={() => setTab("todo")} />
            <Tile code="ORDERS" label="이번 달 오더" value={T.mCnt.toLocaleString()} unit="건" spark={daily.map((d) => d.cnt)} foot={<>전월 같은 기간 <Delta cur={T.mCnt} prev={T.pmCnt} /></>} />
            <Tile code="GMV" label="이번 달 처리 운송액" value={short(T.gmv)} unit="원" spark={daily.map((d) => d.sale)} foot={<>전월 같은 기간 <Delta cur={T.gmv} prev={T.pmGmv} /></>} />
            <Tile dark code="MRR" label="예상 월 청구액" value={short(T.mrr)} unit="원" foot={`가입사 평균 ${short(companies.length ? T.mrr / companies.length : 0)}원 · 월말 환산`} onClick={() => setTab("billing")} />
            <Tile code="SHIPPERS" label="가입 화주사" value={shippers.length} unit="곳" foot={`화주 계정 ${T.shipperUsers}명 · 24시간 접속 ${T.shipperOnline}명`} onClick={() => setTab("shippers")} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14, alignItems: "stretch" }}>
            <Card code="VOLUME" title="플랫폼 일별 오더 (최근 30일)" style={{ gridColumn: phone ? undefined : "span 1" }} right={<span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: NAVY }}>{daily.reduce((a, d) => a + d.cnt, 0).toLocaleString()}건</span>}>
              <div style={{ height: phone ? 190 : 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="pmBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2D4C82" /><stop offset="1" stopColor={NAVY} /></linearGradient></defs>
                    <CartesianGrid stroke="#EEF1F6" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} interval={phone ? 6 : 3} tick={{ fontSize: 13, fill: "#6b7280", fontFamily: MONO }} />
                    <YAxis axisLine={false} tickLine={false} width={34} tick={{ fontSize: 12.5, fill: "#9ca3af", fontFamily: MONO }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(27,43,75,.05)" }} formatter={(v, n) => [n === "cnt" ? `${v.toLocaleString()}건` : won(v), n === "cnt" ? "오더" : "운송액"]} contentStyle={{ borderRadius: 10, border: "1px solid #E3E8F0", fontSize: 14, fontWeight: 700 }} />
                    <Bar dataKey="cnt" radius={[5, 5, 0, 0]}>{daily.map((d) => <Cell key={d.label} fill={d.on ? NAVY : "url(#pmBar)"} fillOpacity={d.on ? 1 : 0.55} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <LiveNowPanel compact onMore={() => setTab("live")} onCompany={openCo} />
          </div>

          <div style={grid3}>
            <PendingPanel go={setTab} />
            <SignupTimeline max={9} onCompany={openCo} />
            <Card code="STATUS" title="고객사 상태" right={<span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: NAVY }}>{alerts.length}건 확인</span>}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 112, height: 112, flexShrink: 0, position: "relative" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusPie} dataKey="value" innerRadius={36} outerRadius={54} paddingAngle={2} stroke="none" isAnimationActive={false}>
                        {statusPie.map((d) => <Cell key={d.k} fill={STATUS_COLORS[d.k]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <b style={{ fontFamily: MONO, fontSize: 20, color: "#0F1A30" }}>{companies.length}</b><span style={{ fontSize: 11.5, color: "#94A3B8", fontWeight: 800 }}>운송사</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                  {statusPie.map((d) => (
                    <button key={d.k} type="button" onClick={() => { setFilter(d.k === "new" ? "new" : d.k === "active" ? "all" : "dormant"); setTab("companies"); }} style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLORS[d.k], flexShrink: 0 }} />
                      <span style={{ fontSize: 14.5, fontWeight: 700, color: "#374151" }}>{d.name}</span>
                      <b style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 14.5, color: "#0F1A30" }}>{d.value}</b>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 210, overflowY: "auto" }}>
                {alerts.length === 0 ? <div style={{ padding: "16px 0", textAlign: "center", color: "#6b7280", fontSize: 14.5 }}>특이사항이 없습니다</div> : alerts.slice(0, 30).map((a, i) => (
                  <div key={i} onClick={() => a.c.m && openCo(a.c.name)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 10, cursor: a.c.m ? "pointer" : "default", border: a.level === 2 ? `1.5px solid ${NAVY}` : "1px solid #E3E8F0", background: a.level === 2 ? "#F4F7FC" : "#fff" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.level === 2 ? NAVY : a.level === 1 ? "#6E8BC4" : "#B6C2D6", flexShrink: 0 }} />
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45%" }}>{a.c.name}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "#4b5563", marginLeft: "auto", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card code="HEALTH" title={risky.length ? "주의가 필요한 고객사" : "고객사 건강 카드"} right={<button type="button" onClick={() => setTab("companies")} style={{ height: 34, padding: "0 12px", borderRadius: 9, border: "1px solid #DCE3EF", background: "#fff", fontSize: 14, fontWeight: 800, color: NAVY, cursor: "pointer", whiteSpace: "nowrap" }}>전체 {companies.length}곳 보기 ›</button>}>
            {healthPick.length === 0 ? <div style={{ padding: "24px 0", textAlign: "center", color: "#6b7280" }}>가입한 운송사가 없습니다</div> : (
              <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
                {healthPick.map((c) => <HealthCard key={c.name} c={c} today={today} onOpen={() => openCo(c.name)} />)}
              </div>
            )}
          </Card>

          <Card code="TOP USAGE" title="사용량 상위 운송사 (이번 달)">
            <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
              {[...companies].sort((a, b) => b.m.cnt - a.m.cnt).slice(0, 8).map((c, i) => (
                <button key={c.name} type="button" onClick={() => openCo(c.name)} style={{ textAlign: "left", cursor: "pointer", display: "grid", gridTemplateColumns: "30px 1fr auto", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12, border: i === 0 ? `1.5px solid ${NAVY}` : "1px solid #E3E8F0", background: i === 0 ? "#F4F7FC" : "#fff" }}>
                  <span style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 800, color: i < 3 ? NAVY : "#94A3B8" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>직원 {c.staff} · 지금 {c.onlineNow} · 24h {c.online} · {short(c.m.sale)}원</span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span style={{ display: "block", fontFamily: MONO, fontSize: 17, fontWeight: 800, color: NAVY }}>{c.m.cnt.toLocaleString()}<span style={{ fontSize: 13, color: "#9ca3af" }}>건</span></span>
                    <Delta cur={c.m.cnt} prev={c.pmSame?.cnt} />
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ═══ 운송사 관제 ═══ */}
      {tab === "companies" && S && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DupeWarning compact />
          <Card code="CARRIERS" title={`운송사 ${sorted.length === companies.length ? companies.length : `${sorted.length} / ${companies.length}`}곳`} right={
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명·코드 검색" style={{ height: 40, width: phone ? "100%" : 200, padding: "0 12px", borderRadius: 10, border: "1px solid #DCE3EF", fontSize: 14.5, outline: "none" }} />
              <CustomSelect value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #DCE3EF", padding: "0 24px 0 10px", fontSize: 14.5, fontWeight: 700, color: NAVY, background: "#fff" }}>
                {[["orders", "이번 달 오더순"], ["risk", "주의 필요순"], ["online", "지금 접속순"], ["recent", "최근 접속순"], ["gmv", "운송액순"], ["bill", "청구액순"], ["health", "건강도순"], ["staff", "계정 수순"], ["data", "데이터량순"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </CustomSelect>
              <div style={{ display: "inline-flex", padding: 3, borderRadius: 11, background: "#EEF2F8" }}>
                {[["cards", "카드"], ["table", "표"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setView(k)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", fontSize: 14.5, fontWeight: 800, cursor: "pointer", background: view === k ? NAVY : "transparent", color: view === k ? "#fff" : "#5B6B85" }}>{l}</button>
                ))}
              </div>
            </div>
          }>
            <div className="pm-chips" style={{ display: "flex", gap: 6, flexWrap: phone ? "nowrap" : "wrap", overflowX: phone ? "auto" : undefined, marginBottom: 14 }}>
              {FILTERS.map(([k, l, f]) => {
                const n = companies.filter(f).length; const on = filter === k;
                return <button key={k} type="button" onClick={() => setFilter(k)} style={{ flexShrink: 0, height: 36, padding: "0 13px", borderRadius: 99, border: `1px solid ${on ? NAVY : "#DCE3EE"}`, background: on ? NAVY : "#fff", color: on ? "#fff" : "#3A4A66", fontSize: 14.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{l} <span style={{ fontFamily: MONO, opacity: 0.7 }}>{n}</span></button>;
              })}
            </div>
            {view === "cards" ? (
              sorted.length === 0 ? <div style={{ padding: "30px 0", textAlign: "center", color: "#6b7280" }}>조건에 맞는 운송사가 없습니다</div> : (
                <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(290px, 1fr))", gap: 12 }}>
                  {sorted.map((c) => <HealthCard key={c.name} c={c} today={today} onOpen={() => openCo(c.name)} />)}
                </div>
              )
            ) : (
              <div style={{ overflowX: "auto", margin: "0 -16px -16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.3fr) 64px 92px 96px 96px 118px 92px 84px 128px 88px 78px 118px 92px", minWidth: 1320 }}>
                  {["운송사", "상태", "건강도", "계정(직원/기사)", "지금 접속", "접속 24h", "이번 달 오더", "전월 동기", "최근 30일", "운송액", "최근 오더", "누적 데이터", "예상 청구"].map((h) => (
                    <div key={h} style={{ ...th, background: "linear-gradient(90deg,#0F1A30,#1B2B4B)" }}>{h}</div>
                  ))}
                  {sorted.map((c) => (
                    <React.Fragment key={c.name}>
                      <div onClick={() => openCo(c.name)} className="pm-row" style={{ ...td, textAlign: "left", cursor: "pointer" }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#0F1A30" }}>{c.name}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: "#94A3B8" }}>{c.code || "-"} · 가입 {ymdOf(c.appliedAt)}</div>
                      </div>
                      <div style={td}><StatusChip s={c.status} /></div>
                      <div style={{ ...td, display: "flex", justifyContent: "center" }}><HealthBar v={c.health} /></div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.staff} / {c.drivers}{c.pending ? <span style={{ display: "block", fontSize: 13, color: NAVY }}>대기 {c.pending}</span> : null}</div>
                      <div style={{ ...td, fontFamily: MONO, fontSize: 15.5, color: c.onlineNow ? NAVY : "#9ca3af" }}>{c.onlineNow || 0}</div>
                      <div style={{ ...td }}><span style={{ fontFamily: MONO }}>{c.online}</span><span style={{ display: "block", fontSize: 13, color: "#6b7280" }}>PC {c.onlinePc} · 모바일 {c.onlineMobile} · {ago(c.lastSeen)}</span></div>
                      <div style={{ ...td, fontFamily: MONO, fontSize: 15.5, color: NAVY }}>{c.m.cnt.toLocaleString()}</div>
                      <div style={td}><Delta cur={c.m.cnt} prev={c.pmSame?.cnt} /></div>
                      <div style={{ ...td, display: "flex", justifyContent: "center" }}><MiniBars daily={c.daily} today={today} /></div>
                      <div style={{ ...td, fontFamily: MONO }}>{short(c.m.sale)}</div>
                      <div style={{ ...td, fontFamily: MONO, fontSize: 14 }}>{c.lastOrder ? c.lastOrder.slice(5) : "-"}{c.idle != null && c.idle > 0 ? <span style={{ display: "block", fontSize: 13, color: "#6b7280" }}>{c.idle}일 전</span> : null}</div>
                      <div style={{ ...td, fontFamily: MONO, fontSize: 14 }}>{c.totalOrders.toLocaleString()}건<span style={{ display: "block", fontSize: 13, color: "#6b7280" }}>거래처 {c.clients} · 하차지 {c.places}</span></div>
                      <div style={{ ...td, fontFamily: MONO, fontSize: 15, color: NAVY }}>{short(c.bill.total)}원</div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══ 화주사 관제 ═══ */}
      {tab === "shippers" && S && (
        <Card code="SHIPPERS" title={`화주사 ${shippers.length}곳`}>
          <div style={{ overflowX: "auto", margin: -16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,1.4fr) 90px minmax(150px,1.2fr) 100px 90px 100px 110px 120px", minWidth: 1040 }}>
              {["화주사", "가입 상태", "연동 운송사", "연동 상태", "계정", "지금 접속", "접속 24h", "가입일"].map((h) => <div key={h} style={{ ...th, background: "linear-gradient(90deg,#0F1A30,#1B2B4B)" }}>{h}</div>)}
              {[...shippers].sort((a, b) => (b.onlineNow || 0) - (a.onlineNow || 0) || (b.users || 0) - (a.users || 0)).map((s) => (
                <React.Fragment key={s.name}>
                  <div style={{ ...td, textAlign: "left" }}><div style={{ fontSize: 15, fontWeight: 800 }}>{s.name}</div><div style={{ fontFamily: MONO, fontSize: 13, color: "#94A3B8" }}>{s.code || "-"}</div></div>
                  <div style={td}><StatusChip s={s.status === "approved" ? { key: "active", label: "승인" } : { key: "new", label: "대기" }} /></div>
                  <div style={td}>{s.linked || "-"}</div>
                  <div style={td}>{s.linkStatus === "approved" ? "연동됨" : s.linked ? "연동 대기" : "-"}</div>
                  <div style={{ ...td, fontFamily: MONO }}>{s.users || 0}</div>
                  <div style={{ ...td, fontFamily: MONO, color: s.onlineNow ? NAVY : "#9ca3af" }}>{s.onlineNow || 0}</div>
                  <div style={{ ...td, fontFamily: MONO }}>{s.online || 0}<span style={{ display: "block", fontSize: 13, color: "#6b7280", fontFamily: "inherit" }}>{ago(s.lastSeen)}</span></div>
                  <div style={{ ...td, fontFamily: MONO, fontSize: 14 }}>{ymdOf(s.appliedAt)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ═══ 요금·청구 ═══ */}
      {tab === "billing" && (
        <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "minmax(280px,360px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
          <Card code="PLAN" title="요금제 설정">
            <div style={{ fontSize: 14.5, color: "#5B6B85", marginBottom: 12, lineHeight: 1.65 }}>요금제가 <b style={{ color: NAVY }}>지정되지 않은</b> 운송사에만 쓰는 공통 기준입니다. 요금제가 지정된 운송사(청구 › 수납 관리)는 <b style={{ color: NAVY }}>영업 › 요금제 관리</b>의 가격·포함량·추가 요금으로 계산됩니다.</div>
            {[["base", "기본료(월)", "원"], ["includedSeats", "기본 포함 직원 계정", "명"], ["seat", "추가 계정 1명당", "원"], ["includedOrders", "기본 포함 오더(월)", "건"], ["perOrder", "초과 오더 1건당", "원"]].map(([k, l, u]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid #EEF1F6" }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: "#374151" }}>{l}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input inputMode="numeric" value={fmtMoney(pricing[k] ?? "")} onChange={(e) => setPricing({ ...pricing, [k]: parseMoney(e.target.value) || 0 })} onBlur={() => savePricing(pricing)}
                    style={{ width: 110, height: 34, borderRadius: 8, border: "1px solid #DCE3EF", padding: "0 10px", fontFamily: MONO, fontSize: 15, fontWeight: 800, color: NAVY, textAlign: "right" }} />
                  <span style={{ fontSize: 14, color: "#6b7280", width: 18 }}>{u}</span>
                </span>
              </label>
            ))}
          </Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: phone ? "minmax(0,1fr)" : "repeat(3,minmax(0,1fr))", gap: phone ? 8 : 12 }}>
              <Tile dark code="MRR" label="예상 월 청구 합계" value={short(T.mrr)} unit="원" foot={`연 환산 ${short(T.mrr * 12)}원`} />
              <Tile code="ARPA" label="가입사 평균 청구" value={short(companies.length ? T.mrr / companies.length : 0)} unit="원" foot={`${companies.length}곳 기준`} />
              <Tile code="TAKE" label="운송액 대비 청구 비율" value={T.gmv ? ((T.mrr / (T.gmv / dayNo * daysInMonth)) * 100).toFixed(2) : "0.00"} unit="%" foot="월말 환산 운송액 기준" />
            </div>
            <Card code="INVOICE" title={`${Number(today.slice(5, 7))}월 예상 청구서`}>
              <div style={{ overflowX: "auto", margin: -16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.3fr) 110px 90px 110px 100px 100px 100px 120px", minWidth: 930 }}>
                  {["운송사", "요금제", "직원 계정", "월말 예상 오더", "기본료", "계정 추가", "오더 초과", "합계"].map((h) => <div key={h} style={{ ...th, background: "linear-gradient(90deg,#0F1A30,#1B2B4B)" }}>{h}</div>)}
                  {[...companies].sort((a, b) => b.bill.total - a.bill.total).map((c) => (
                    <React.Fragment key={c.name}>
                      <div style={{ ...td, textAlign: "left", fontWeight: 800 }}>{c.name}</div>
                      <div style={{ ...td, fontWeight: 800, color: c.bill.planName ? NAVY : "#94A3B8" }}>{c.bill.planName || "공통 기준"}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.staff}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.projected.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.base.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.seats.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.orders.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO, color: NAVY, fontSize: 15 }}>{c.bill.total.toLocaleString()}</div>
                    </React.Fragment>
                  ))}
                  <div style={{ ...td, textAlign: "left", fontWeight: 900, background: "#F4F7FC" }}>합계 (VAT 별도)</div>
                  {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ ...td, background: "#F4F7FC" }} />)}
                  <div style={{ ...td, fontFamily: MONO, color: NAVY, fontSize: 16, fontWeight: 900, background: "#F4F7FC" }}>{Math.round(T.mrr).toLocaleString()}</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "applications" && <CompanyApplications />}

      {/* 운송사 상세 — ⭐ 2026-11-02 관리자센터: 폰은 전체 화면, PC는 오른쪽 패널(최대 640px) · 직원 목록(권한·마지막 접속) · 요금제/청구 상태 */}
      {detail && (
        <div onClick={() => setDetailName(null)} style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(15,23,42,.45)", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="pm-drawer" style={{ width: phone ? "100%" : "min(640px, 94vw)", height: "100%", background: "#F4F6FA", overflowY: "auto", boxShadow: "-20px 0 40px rgba(0,0,0,.2)", display: "flex", flexDirection: "column" }}>
            <div className="pm-hero" style={{ position: "sticky", top: 0, zIndex: 2, padding: phone ? "calc(14px + env(safe-area-inset-top, 0px)) 16px 14px" : "20px 24px", color: "#fff" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12.5, letterSpacing: "0.24em", color: "#8FB0F0", fontWeight: 800 }}>CARRIER · {detail.code || "-"}</div>
                  <div style={{ fontSize: phone ? 21 : 24, fontWeight: 900, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail.name}</div>
                </div>
                <button type="button" onClick={() => setDetailName(null)} aria-label="닫기" style={{ width: 40, height: 40, borderRadius: 11, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <StatusChip s={detail.status} />
                <span style={{ fontSize: 14, color: "rgba(207,224,255,.8)" }}>건강도 <b style={{ fontFamily: MONO, color: "#fff" }}>{detail.health}</b> · 가입 {ymdOf(detail.appliedAt)} · 대표 {detail.rep || "-"} {detail.phone ? `· ${detail.phone}` : ""}</span>
              </div>
            </div>
            <div style={{ padding: phone ? 12 : 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {(detail.inactiveDays == null || detail.inactiveDays >= 7) && (detail.staff > 0 || detail.m.cnt > 0) && (
                <div style={{ borderRadius: 12, background: "#0F1A30", color: "#fff", padding: "10px 14px", fontSize: 14.5, fontWeight: 800 }}>
                  {detail.inactiveDays == null ? "이 회사는 접속 기록이 없습니다" : `${detail.inactiveDays}일째 아무도 접속하지 않았습니다`} — 연락해 사용 여부를 확인해 보세요.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
                <Tile dark code="LIVE" label="지금 접속" value={detail.onlineNow || 0} unit="명" foot={`24시간 ${detail.online}명 · PC ${detail.onlinePc} · 모바일 ${detail.onlineMobile}`} />
                <Tile code="STAFF" label="직원 계정" value={detail.staff} unit="명" foot={`관리자 ${detail.admins} · 승인 대기 ${detail.pending} · 기사 ${detail.drivers}`} />
                <Tile code="ORDERS" label="이번 달 오더" value={detail.m.cnt.toLocaleString()} unit="건" foot={<>전월 같은 기간 <Delta cur={detail.m.cnt} prev={detail.pmSame?.cnt} /></>} />
                <Tile code="GMV" label="이번 달 운송액" value={short(detail.m.sale)} unit="원" foot={`매익률 ${detail.m.sale ? ((detail.m.profit / detail.m.sale) * 100).toFixed(1) : "0.0"}%`} />
                <Tile code="LAST" label="전월 전체" value={detail.pm.cnt.toLocaleString()} unit="건" foot={`${short(detail.pm.sale)}원`} />
                <Tile dark code="BILL" label="예상 청구액" value={short(detail.bill.total)} unit="원" foot={`월말 예상 ${detail.bill.projected.toLocaleString()}건`} />
              </div>
              <Card code="DAILY" title="최근 30일 오더">
                <div style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily.map((d, i) => { const dd = new Date(`${today}T00:00:00Z`); dd.setUTCDate(dd.getUTCDate() - (29 - i)); return { label: d.label, v: detail.daily?.[dd.toISOString().slice(0, 10)] || 0 }; })} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                      <defs><linearGradient id="pmArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NAVY} stopOpacity={0.35} /><stop offset="1" stopColor={NAVY} stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="label" axisLine={false} tickLine={false} interval={5} tick={{ fontSize: 12.5, fill: "#6b7280", fontFamily: MONO }} />
                      <YAxis hide />
                      <Tooltip formatter={(v) => [`${v}건`, "오더"]} contentStyle={{ borderRadius: 10, fontSize: 14, fontWeight: 700 }} />
                      <Area type="monotone" dataKey="v" stroke={NAVY} strokeWidth={2.4} fill="url(#pmArea)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card code="STAFF" title={`직원 ${detail.staffList?.length || 0}명`} right={<span style={{ fontSize: 13.5, fontWeight: 700, color: "#6b7280" }}>지금 접속 순 · 실시간</span>}>
                <StaffList list={detail.staffList || []} />
              </Card>
              {/* ⭐ 2026-11-02 운임규칙 — 회사별 맞춤 기능(최고관리자만 켜고 끔) */}
              <CompanyFeaturesCard company={detail.name} />
              <Card code="PLAN" title="요금제 · 청구 상태">
                {[
                  ["요금제", detail.plan?.planId ? `${PLAN_NAMES[detail.plan.planId] || detail.plan.planId}${detail.plan.since ? ` (${detail.plan.since}부터)` : ""}` : "미지정(전체 기능)"],
                  ["이달 청구 상태", detail.invoice ? `${detail.invoice.status || "미청구"}${detail.invoice.amount ? ` · ${Number(detail.invoice.amount).toLocaleString()}원` : ""}${detail.invoice.paidAt ? ` · 입금 ${detail.invoice.paidAt}` : ""}` : "미청구"],
                  ["입금 알림", detail.invoice?.payNotice ? `${detail.invoice.payNotice.name || ""} ${detail.invoice.payNotice.date || ""}` : "-"],
                  ["요금제 변경 요청", detail.planReqs?.length ? detail.planReqs.map((r) => `→ ${PLAN_NAMES[r.to] || r.toName || r.to}`).join(", ") : "없음"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid #EEF1F6", fontSize: 14.5 }}>
                    <span style={{ color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{k}</span><b style={{ color: "#0F1A30", textAlign: "right" }}>{v}</b>
                  </div>
                ))}
                <button type="button" onClick={() => { setDetailName(null); setTab("payments"); }} style={{ marginTop: 10, width: "100%", height: 42, borderRadius: 11, border: "none", background: NAVY, color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>수납 관리에서 요금제·청구 처리 ›</button>
              </Card>
              <Card code="USAGE" title="사용 현황">
                {[["마지막 접속", detail.lastSeen ? `${ago(detail.lastSeen)} (${new Date(detail.lastSeen).toLocaleString("ko-KR", { hour12: false })})` : "기록 없음"], ["마지막 오더", detail.lastOrder || "-"], ["퇴사 처리 계정", `${detail.quit || 0}명`], ["지입·기사 등록", `${detail.fleet}명`], ["누적 오더", `${detail.totalOrders.toLocaleString()}건`], ["거래처 / 하차지", `${detail.clients} / ${detail.places}`]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid #EEF1F6", fontSize: 14.5 }}>
                    <span style={{ color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{k}</span><b style={{ color: "#0F1A30", textAlign: "right" }}>{v}</b>
                  </div>
                ))}
              </Card>
              <Card code="INVOICE" title="예상 청구 내역">
                {[["기본료", detail.bill.base], [`계정 추가 (${Math.max(0, detail.staff - pricing.includedSeats)}명)`, detail.bill.seats], [`오더 초과 (${Math.max(0, detail.bill.projected - pricing.includedOrders).toLocaleString()}건)`, detail.bill.orders]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #EEF1F6", fontSize: 14.5 }}><span style={{ color: "#374151", fontWeight: 600 }}>{k}</span><b style={{ fontFamily: MONO }}>{won(v)}</b></div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", borderTop: `2px solid ${NAVY}`, fontSize: 16 }}><b>합계 (VAT 별도)</b><b style={{ fontFamily: MONO, color: NAVY }}>{won(detail.bill.total)}</b></div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </NavWrap>
  );
}

// ⭐ 2026-11-02 회사별 맞춤 기능 — src/companyFeatures.js의 COMPANY_FEATURES를 돌며 토글(새 기능은 배열에 한 줄만 추가)
function CompanyFeaturesCard({ company }) {
  const feat0 = useCompanyFeatures(company);
  const [feat, setFeat] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // 마지막 변경자 표시용(규칙: 최고관리자만 이 화면을 연다)
  useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "companyFeatures", company), (snap) => setFeat(snap.exists() ? snap.data() : {}), () => setFeat({}));
  }, [company]);
  const toggle = async (key, on) => {
    setBusy(key); setErr("");
    try { await setCompanyFeature(company, key, on, auth?.currentUser?.email || ""); }
    catch (e) { setErr(`저장 실패: ${e?.code || e?.message || e}`); } finally { setBusy(""); }
  };
  return (
    <Card code="FEATURES" title="회사별 맞춤 기능">
      <div data-company-features="1">
        {COMPANY_FEATURES.map((f) => {
          const on = feat0[f.key] === true;
          return (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #EEF1F6" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#0F1A30" }}>{f.label}</div>
                <div style={{ fontSize: 13.5, color: "#6b7280", fontWeight: 600, marginTop: 2, lineHeight: 1.45 }}>{f.desc}</div>
              </div>
              <button type="button" role="switch" aria-checked={on} aria-label={`${f.label} 켜기`} data-feature={f.key} disabled={!feat0.loaded || busy === f.key}
                onClick={() => toggle(f.key, !on)}
                style={{ position: "relative", width: 56, height: 30, borderRadius: 999, border: "none", background: on ? "#2D4C82" : "#CBD3E1", cursor: "pointer", flexShrink: 0, opacity: !feat0.loaded || busy === f.key ? 0.5 : 1 }}>
                <span style={{ position: "absolute", top: 3, left: on ? 29 : 3, width: 24, height: 24, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .15s" }} />
              </button>
            </div>
          );
        })}
        {feat?.updatedBy && <div style={{ fontSize: 13, color: "#8A97B0", marginTop: 4 }}>마지막 변경: {feat.updatedBy}{feat.updatedAt ? ` · ${new Date(feat.updatedAt).toLocaleString("ko-KR", { hour12: false })}` : ""}</div>}
        {err && <div style={{ fontSize: 13.5, color: "#B91C1C", fontWeight: 800, marginTop: 6 }}>{err}</div>}
      </div>
    </Card>
  );
}

const PM_CSS = `
  .pm-hero { background:
      linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px,
      linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px,
      linear-gradient(120deg, #0B1428 0%, #1B2B4B 60%, #2D4C82 100%); }
  .pm-tile { background: #fff; border: 1px solid #E3E8F0; box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 8px 20px rgba(16,24,40,.05); }
  .pm-tile-dark { background: linear-gradient(135deg,#0F1A30 0%,#1B2B4B 60%,#2D4C82 100%); border: 1px solid #0F1A30; box-shadow: 0 10px 24px rgba(15,26,48,.25); }
  .pm-row:hover { background: #F4F7FC; }
  @keyframes pmSpin { to { transform: rotate(360deg) } }
  .pm-spin { animation: pmSpin 1s linear infinite; }
  .pm-tile, .pm-tile-dark { container-type: inline-size; }
  @container (max-width: 310px) { .pm-spark { display: none; } } /* ⭐ 2026-11-02 관리자센터 — 좁은 타일은 숫자와 겹치므로 숨김 */
  .pm-chips { scrollbar-width: none; }
  .pm-chips::-webkit-scrollbar { display: none; }
`;
