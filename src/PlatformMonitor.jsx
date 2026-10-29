// ======================= src/PlatformMonitor.jsx =======================
// 🛰 관리센터(최고관리자 전용, 2026-10-28) — "운송사 하나"가 아니라 이 프로그램 전체를 관제한다.
//  가입한 운송사·화주사별 계정·접속·오더·데이터량·성장률·건강도, 그리고 예상 청구액(요금제는 화면에서 바꿈).
//  숫자는 서버(platformStats 함수)가 매일 새벽 4시에 모아 siteConfig/platformStats 한 문서로 저장한다.
//  ⭐ 알록달록 금지 — 네이비 계열만. 경고도 굵기·테두리로만 구분한다.
import React, { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, AreaChart, Area } from "recharts";
import { db, auth, FUNCTIONS_BASE } from "./firebase";
import KpSubNav from "./KpSubNav";
import CompanyApplications from "./CompanyApplications";
import { PricingEditor, QuoteBuilder, QuoteHistory } from "./SalesQuote";

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
function Tile({ code, label, value, unit, foot, dark }) {
  return (
    <div className={dark ? "pm-tile-dark" : "pm-tile"} style={{ borderRadius: 16, padding: "15px 17px 13px", minWidth: 0, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: dark ? "rgba(255,255,255,.8)" : "#4b5563", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", color: dark ? "rgba(143,176,240,.85)" : "#94A3B8" }}>{code}</span>
      </div>
      <div style={{ marginTop: 9, display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 800, color: dark ? "#fff" : "#0F1A30", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{value}</span>
        {unit && <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "rgba(207,224,255,.55)" : "#9ca3af" }}>{unit}</span>}
      </div>
      {foot && <div style={{ marginTop: 5, fontSize: 12.5, fontWeight: 600, color: dark ? "rgba(207,224,255,.6)" : "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{foot}</div>}
    </div>
  );
}
function Card({ code, title, right, children, style }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E3E8F0", borderRadius: 18, boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 10px 26px rgba(16,24,40,.05)", overflow: "hidden", minWidth: 0, ...style }}>
      <div style={{ padding: "13px 18px", background: "#F7F9FC", borderBottom: "1px solid #E8EDF4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: NAVY, transform: "rotate(45deg)" }} />
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "#94A3B8" }}>{code}</span>
          <span style={{ fontSize: 16.5, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap" }}>{title}</span>
        </span>
        {right}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
function Delta({ cur, prev }) {
  if (!prev) return <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#9ca3af" }}>—</span>;
  const r = ((cur - prev) / prev) * 100;
  return <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: r >= 0 ? NAVY : "#64748b" }}>{r >= 0 ? "▲" : "▼"} {Math.abs(r).toFixed(1)}%</span>;
}
function StatusChip({ s }) {
  const st = {
    active: { background: NAVY, color: "#fff", border: `1px solid ${NAVY}` },
    new: { background: "#EEF3FB", color: NAVY, border: "1px solid #C9D3E4" },
    drop: { background: "#fff", color: NAVY, border: `1.5px solid ${NAVY}` },
    dormant: { background: "#fff", color: "#64748b", border: "1px dashed #94A3B8" },
  }[s.key];
  return <span style={{ ...st, display: "inline-block", padding: "2px 9px", borderRadius: 6, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>{s.label}</span>;
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
      <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: "#0F1A30" }}>{v}</span>
    </div>
  );
}

// ─── 본체 ────────────────────────────────────────────────────────────────────
// ⭐ 2026-10-29 — 관리자 관리센터(PlatformCenter, /platform)가 상단·왼쪽 메뉴를 직접 그리고 이 화면은 내용만 그린다(bare).
//    bare가 아니면 예전처럼 왼쪽 메뉴까지 스스로 그린다.
function NavWrap({ bare, children, ...p }) { return bare ? <>{children}</> : <KpSubNav {...p}>{children}</KpSubNav>; }
export default function PlatformMonitor({ demoStats = null, tab: tabProp, onTab, bare = false, onContract }) { // demoStats: 화면 점검용(실제 화면에선 안 씀)
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
  const [detail, setDetail] = useState(null);

  useEffect(() => { if (!tabProp) { try { localStorage.setItem("pmTab", tab); } catch { /* 무시 */ } } }, [tab, tabProp]);
  useEffect(() => {
    if (demoStats) { setStats(demoStats); setLoaded(true); return undefined; }
    const u1 = onSnapshot(doc(db, "siteConfig", "platformStats"), (s) => { setStats(s.exists() ? s.data() : null); setLoaded(true); }, () => setLoaded(true));
    const u2 = onSnapshot(doc(db, "siteConfig", "platformPricing"), (s) => { if (s.exists()) setPricing({ ...DEFAULT_PRICING, ...s.data() }); }, () => {});
    return () => { u1(); u2(); };
  }, [demoStats]);

  const refresh = async () => {
    setBusy(true); setMsg("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/platformStats`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
      setMsg(j.skipped ? `방금 갱신했습니다 — ${Math.ceil(j.nextInSec / 60)}분 뒤에 다시 갱신할 수 있습니다.` : `갱신 완료 — 운송사 ${j.companies}곳 · 화주사 ${j.shippers}곳`);
    } catch (e) {
      setMsg(`갱신 실패: ${e.message || e}${/Failed to fetch|404/.test(String(e.message)) ? " (서버 함수 배포가 필요합니다)" : ""}`);
    } finally { setBusy(false); }
  };

  const today = stats?.today || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dayNo = Number(today.slice(8));
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const companies = useMemo(() => (stats?.companies || []).map((c) => {
    const bill = estimateBill(c, pricing, dayNo, daysInMonth);
    return { ...c, bill, health: healthOf(c, today), status: statusOf(c, today), idle: daysAgo(c.lastOrder, today) };
  }), [stats, pricing, dayNo, daysInMonth, today]);
  const shippers = stats?.shippers || [];

  const T = useMemo(() => {
    const t = { staff: 0, drivers: 0, online: 0, mCnt: 0, pmCnt: 0, gmv: 0, pmGmv: 0, mrr: 0, total: 0, pending: 0 };
    companies.forEach((c) => {
      t.staff += c.staff; t.drivers += c.drivers; t.online += c.online; t.mCnt += c.m.cnt; t.pmCnt += c.pmSame?.cnt || 0;
      t.gmv += c.m.sale; t.pmGmv += c.pmSame?.sale || 0; t.mrr += c.bill.total; t.total += c.totalOrders; t.pending += c.pending;
    });
    t.shipperUsers = shippers.reduce((a, s) => a + (s.users || 0), 0);
    t.shipperOnline = shippers.reduce((a, s) => a + (s.online || 0), 0);
    return t;
  }, [companies, shippers]);

  const daily = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (29 - i));
    const k = d.toISOString().slice(0, 10);
    const v = stats?.platformDaily?.[k] || { cnt: 0, sale: 0 };
    return { label: `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`, cnt: v.cnt, sale: v.sale, on: k === today };
  }), [stats, today]);

  const alerts = useMemo(() => {
    const a = [];
    companies.forEach((c) => {
      if (c.status.key === "dormant" && c.staff) a.push({ c, text: c.lastOrder ? `${c.idle}일째 오더 없음` : "아직 오더 없음", level: 2 });
      if (c.status.key === "drop") a.push({ c, text: `전월 같은 기간 대비 오더 ${Math.round((1 - c.m.cnt / c.pmSame.cnt) * 100)}% 감소`, level: 2 });
      if (c.pending) a.push({ c, text: `승인 대기 계정 ${c.pending}명`, level: 1 });
      if (c.status.key === "new") a.push({ c, text: `신규 가입 · ${ymdOf(c.appliedAt)}`, level: 0 });
    });
    shippers.filter((s) => s.status === "pending").forEach((s) => a.push({ c: { name: s.name }, text: "화주사 가입 승인 대기", level: 1 }));
    return a.sort((x, y) => y.level - x.level);
  }, [companies, shippers]);

  const sorted = useMemo(() => {
    const k = q.trim();
    const list = companies.filter((c) => !k || c.name.includes(k) || (c.code || "").includes(k));
    const by = {
      orders: (a, b) => b.m.cnt - a.m.cnt, gmv: (a, b) => b.m.sale - a.m.sale, bill: (a, b) => b.bill.total - a.bill.total,
      health: (a, b) => b.health - a.health, staff: (a, b) => b.staff - a.staff, data: (a, b) => b.totalOrders - a.totalOrders, recent: (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0),
    }[sortKey];
    return [...list].sort(by);
  }, [companies, q, sortKey]);

  const savePricing = async (next) => {
    setPricing(next);
    try { await setDoc(doc(db, "siteConfig", "platformPricing"), next, { merge: true }); } catch (e) { setMsg(`요금제 저장 실패: ${e.message}`); }
  };

  const updatedText = stats?.updatedAtMs ? `${new Date(stats.updatedAtMs).toLocaleString("ko-KR", { hour12: false })} 기준` : "아직 집계 전";
  const headBar = (
    <div className="pm-hero" style={{ borderRadius: 22, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.28em", color: "#8FB0F0" }}>KP-FLOW · PLATFORM CONTROL</div>
        <h1 style={{ margin: "6px 0 0", fontSize: 25, fontWeight: 900, letterSpacing: "-0.02em" }}>플랫폼 관제센터</h1>
        <p style={{ margin: "5px 0 0", fontSize: 14.5, color: "rgba(207,224,255,.72)", fontWeight: 600 }}>가입한 운송사·화주사의 사용 현황과 예상 청구액을 한눈에 봅니다 · <span style={{ fontFamily: MONO }}>{updatedText}</span></p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: "#CFE0FF", maxWidth: 380 }}>{msg}</span>}
        <button type="button" onClick={refresh} disabled={busy} style={{ height: 40, padding: "0 16px", borderRadius: 11, border: "1px solid rgba(207,224,255,.3)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: busy ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={busy ? "pm-spin" : ""}><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" /><path d="M5 3v5h5M19 21v-5h-5" /></svg>
          {busy ? "집계 중…" : "지금 갱신"}
        </button>
      </div>
    </div>
  );

  const empty = loaded && !stats && (
    <Card code="SETUP" title="아직 집계된 데이터가 없습니다">
      <div style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
        위의 <b>지금 갱신</b>을 누르면 가입사별 사용량을 바로 모읍니다. 이후에는 매일 새벽 4시에 자동으로 갱신됩니다.<br />
        <span style={{ color: "#6b7280", fontSize: 13.5 }}>※ 처음 한 번은 PC에서 서버 배포(firebase deploy --only functions)가 필요합니다.</span>
      </div>
    </Card>
  );

  const th = { padding: "10px 10px", fontSize: 12.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", textAlign: "center" };
  const td = { padding: "10px 10px", fontSize: 14, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", textAlign: "center", borderTop: "1px solid #EEF1F6" };

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
      {tab === "overview" && stats && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
            <Tile dark code="CARRIERS" label="가입 운송사" value={companies.length} unit="곳" foot={`활성 ${companies.filter((c) => c.status.key === "active").length} · 신규 ${companies.filter((c) => c.status.key === "new").length} · 휴면 ${companies.filter((c) => c.status.key === "dormant").length}`} />
            <Tile code="SHIPPERS" label="가입 화주사" value={shippers.length} unit="곳" foot={`화주 계정 ${T.shipperUsers}명 · 접속 ${T.shipperOnline}명`} />
            <Tile code="ACCOUNTS" label="전체 계정" value={(T.staff + T.drivers + T.shipperUsers).toLocaleString()} unit="명" foot={`직원 ${T.staff} · 기사 ${T.drivers} · 화주 ${T.shipperUsers}`} />
            <Tile code="ONLINE 24H" label="최근 24시간 접속" value={T.online + T.shipperOnline} unit="명" foot={`운송사 ${T.online} · 화주사 ${T.shipperOnline}`} />
            <Tile code="ORDERS" label="이번 달 오더" value={T.mCnt.toLocaleString()} unit="건" foot={<>전월 같은 기간 <Delta cur={T.mCnt} prev={T.pmCnt} /></>} />
            <Tile code="GMV" label="이번 달 처리 운송액" value={short(T.gmv)} unit="원" foot={<>전월 같은 기간 <Delta cur={T.gmv} prev={T.pmGmv} /></>} />
            <Tile dark code="MRR" label="예상 월 청구액" value={short(T.mrr)} unit="원" foot={`가입사 평균 ${short(companies.length ? T.mrr / companies.length : 0)}원 · 월말 환산`} />
            <Tile code="DATA" label="누적 오더(데이터량)" value={T.total.toLocaleString()} unit="건" foot={`거래처 ${companies.reduce((a, c) => a + c.clients, 0).toLocaleString()} · 하차지 ${companies.reduce((a, c) => a + c.places, 0).toLocaleString()}`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.9fr) minmax(0,1fr)", gap: 14 }}>
            <Card code="VOLUME" title="플랫폼 일별 오더 (최근 30일)" right={<span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: NAVY }}>{daily.reduce((a, d) => a + d.cnt, 0).toLocaleString()}건</span>}>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="pmBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2D4C82" /><stop offset="1" stopColor={NAVY} /></linearGradient></defs>
                    <CartesianGrid stroke="#EEF1F6" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} interval={3} tick={{ fontSize: 11.5, fill: "#6b7280", fontFamily: MONO }} />
                    <YAxis axisLine={false} tickLine={false} width={34} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} />
                    <Tooltip cursor={{ fill: "rgba(27,43,75,.05)" }} formatter={(v, n) => [n === "cnt" ? `${v.toLocaleString()}건` : won(v), n === "cnt" ? "오더" : "운송액"]} contentStyle={{ borderRadius: 10, border: "1px solid #E3E8F0", fontSize: 13, fontWeight: 700 }} />
                    <Bar dataKey="cnt" radius={[5, 5, 0, 0]}>{daily.map((d) => <Cell key={d.label} fill={d.on ? NAVY : "url(#pmBar)"} fillOpacity={d.on ? 1 : 0.55} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card code="ALERTS" title="확인이 필요한 곳" right={<span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: NAVY }}>{alerts.length}</span>}>
              {alerts.length === 0 ? <div style={{ padding: "30px 0", textAlign: "center", color: "#6b7280", fontSize: 14 }}>특이사항이 없습니다</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 240, overflowY: "auto" }}>
                  {alerts.slice(0, 30).map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: a.level === 2 ? `1.5px solid ${NAVY}` : "1px solid #E3E8F0", background: a.level === 2 ? "#F4F7FC" : "#fff" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.level === 2 ? NAVY : a.level === 1 ? "#6E8BC4" : "#B6C2D6", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap" }}>{a.c.name}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#4b5563", marginLeft: "auto", textAlign: "right" }}>{a.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card code="TOP USAGE" title="사용량 상위 운송사 (이번 달)">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
              {[...companies].sort((a, b) => b.m.cnt - a.m.cnt).slice(0, 8).map((c, i) => (
                <button key={c.name} type="button" onClick={() => setDetail(c)} style={{ textAlign: "left", cursor: "pointer", display: "grid", gridTemplateColumns: "30px 1fr auto", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12, border: i === 0 ? `1.5px solid ${NAVY}` : "1px solid #E3E8F0", background: i === 0 ? "#F4F7FC" : "#fff" }}>
                  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: i < 3 ? NAVY : "#94A3B8" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "#6b7280" }}>직원 {c.staff} · 접속 {c.online} · {short(c.m.sale)}원</span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span style={{ display: "block", fontFamily: MONO, fontSize: 17, fontWeight: 800, color: NAVY }}>{c.m.cnt.toLocaleString()}<span style={{ fontSize: 12, color: "#9ca3af" }}>건</span></span>
                    <Delta cur={c.m.cnt} prev={c.pmSame?.cnt} />
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ═══ 운송사 관제 ═══ */}
      {tab === "companies" && stats && (
        <Card code="CARRIERS" title={`운송사 ${companies.length}곳`} right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명·코드 검색" style={{ height: 34, width: 200, padding: "0 12px", borderRadius: 9, border: "1px solid #DCE3EF", fontSize: 14, outline: "none" }} />
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={{ height: 34, borderRadius: 9, border: "1px solid #DCE3EF", padding: "0 8px", fontSize: 14, fontWeight: 700, color: NAVY }}>
              {[["orders", "이번 달 오더순"], ["gmv", "운송액순"], ["bill", "청구액순"], ["health", "건강도순"], ["staff", "계정 수순"], ["data", "데이터량순"], ["recent", "최근 접속순"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        }>
          <div style={{ overflowX: "auto", margin: -16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.3fr) 64px 92px 88px 118px 92px 84px 128px 88px 78px 118px 92px", minWidth: 1220 }}>
              {["운송사", "상태", "건강도", "계정(직원/기사)", "접속 24h", "이번 달 오더", "전월 동기", "최근 30일", "운송액", "최근 오더", "누적 데이터", "예상 청구"].map((h) => (
                <div key={h} style={{ ...th, background: "linear-gradient(90deg,#0F1A30,#1B2B4B)" }}>{h}</div>
              ))}
              {sorted.map((c) => (
                <React.Fragment key={c.name}>
                  <div onClick={() => setDetail(c)} className="pm-row" style={{ ...td, textAlign: "left", cursor: "pointer" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0F1A30" }}>{c.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, color: "#94A3B8" }}>{c.code || "-"} · 가입 {ymdOf(c.appliedAt)}</div>
                  </div>
                  <div style={td}><StatusChip s={c.status} /></div>
                  <div style={{ ...td, display: "flex", justifyContent: "center" }}><HealthBar v={c.health} /></div>
                  <div style={{ ...td, fontFamily: MONO }}>{c.staff} / {c.drivers}{c.pending ? <span style={{ display: "block", fontSize: 11.5, color: NAVY }}>대기 {c.pending}</span> : null}</div>
                  <div style={{ ...td }}><span style={{ fontFamily: MONO }}>{c.online}</span><span style={{ display: "block", fontSize: 11.5, color: "#6b7280" }}>PC {c.onlinePc} · 모바일 {c.onlineMobile} · {ago(c.lastSeen)}</span></div>
                  <div style={{ ...td, fontFamily: MONO, fontSize: 15.5, color: NAVY }}>{c.m.cnt.toLocaleString()}</div>
                  <div style={td}><Delta cur={c.m.cnt} prev={c.pmSame?.cnt} /></div>
                  <div style={{ ...td, display: "flex", justifyContent: "center" }}><MiniBars daily={c.daily} today={today} /></div>
                  <div style={{ ...td, fontFamily: MONO }}>{short(c.m.sale)}</div>
                  <div style={{ ...td, fontFamily: MONO, fontSize: 13 }}>{c.lastOrder ? c.lastOrder.slice(5) : "-"}{c.idle != null && c.idle > 0 ? <span style={{ display: "block", fontSize: 11.5, color: "#6b7280" }}>{c.idle}일 전</span> : null}</div>
                  <div style={{ ...td, fontFamily: MONO, fontSize: 13 }}>{c.totalOrders.toLocaleString()}건<span style={{ display: "block", fontSize: 11.5, color: "#6b7280" }}>거래처 {c.clients} · 하차지 {c.places}</span></div>
                  <div style={{ ...td, fontFamily: MONO, fontSize: 15, color: NAVY }}>{short(c.bill.total)}원</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ═══ 화주사 관제 ═══ */}
      {tab === "shippers" && stats && (
        <Card code="SHIPPERS" title={`화주사 ${shippers.length}곳`}>
          <div style={{ overflowX: "auto", margin: -16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,1.4fr) 90px minmax(150px,1.2fr) 100px 100px 110px 120px", minWidth: 960 }}>
              {["화주사", "가입 상태", "연동 운송사", "연동 상태", "계정", "접속 24h", "가입일"].map((h) => <div key={h} style={{ ...th, background: "linear-gradient(90deg,#0F1A30,#1B2B4B)" }}>{h}</div>)}
              {[...shippers].sort((a, b) => (b.users || 0) - (a.users || 0)).map((s) => (
                <React.Fragment key={s.name}>
                  <div style={{ ...td, textAlign: "left" }}><div style={{ fontSize: 15, fontWeight: 800 }}>{s.name}</div><div style={{ fontFamily: MONO, fontSize: 11.5, color: "#94A3B8" }}>{s.code || "-"}</div></div>
                  <div style={td}><StatusChip s={s.status === "approved" ? { key: "active", label: "승인" } : { key: "new", label: "대기" }} /></div>
                  <div style={td}>{s.linked || "-"}</div>
                  <div style={td}>{s.linkStatus === "approved" ? "연동됨" : s.linked ? "연동 대기" : "-"}</div>
                  <div style={{ ...td, fontFamily: MONO }}>{s.users || 0}</div>
                  <div style={{ ...td, fontFamily: MONO }}>{s.online || 0}<span style={{ display: "block", fontSize: 11.5, color: "#6b7280", fontFamily: "inherit" }}>{ago(s.lastSeen)}</span></div>
                  <div style={{ ...td, fontFamily: MONO, fontSize: 13 }}>{ymdOf(s.appliedAt)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ═══ 요금·청구 ═══ */}
      {tab === "billing" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,360px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
          <Card code="PLAN" title="요금제 설정">
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 1.6 }}>운송사 1곳당 매달 청구할 금액 기준입니다. 바꾸면 바로 저장되고 오른쪽 예상 청구액이 다시 계산됩니다.</div>
            {[["base", "기본료(월)", "원"], ["includedSeats", "기본 포함 직원 계정", "명"], ["seat", "추가 계정 1명당", "원"], ["includedOrders", "기본 포함 오더(월)", "건"], ["perOrder", "초과 오더 1건당", "원"]].map(([k, l, u]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid #EEF1F6" }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: "#374151" }}>{l}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="number" min="0" value={pricing[k]} onChange={(e) => setPricing({ ...pricing, [k]: Number(e.target.value) || 0 })} onBlur={() => savePricing(pricing)}
                    style={{ width: 110, height: 34, borderRadius: 8, border: "1px solid #DCE3EF", padding: "0 10px", fontFamily: MONO, fontSize: 15, fontWeight: 800, color: NAVY, textAlign: "right" }} />
                  <span style={{ fontSize: 13, color: "#6b7280", width: 18 }}>{u}</span>
                </span>
              </label>
            ))}
          </Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
              <Tile dark code="MRR" label="예상 월 청구 합계" value={short(T.mrr)} unit="원" foot={`연 환산 ${short(T.mrr * 12)}원`} />
              <Tile code="ARPA" label="가입사 평균 청구" value={short(companies.length ? T.mrr / companies.length : 0)} unit="원" foot={`${companies.length}곳 기준`} />
              <Tile code="TAKE" label="운송액 대비 청구 비율" value={T.gmv ? ((T.mrr / (T.gmv / dayNo * daysInMonth)) * 100).toFixed(2) : "0.00"} unit="%" foot="월말 환산 운송액 기준" />
            </div>
            <Card code="INVOICE" title={`${Number(today.slice(5, 7))}월 예상 청구서`}>
              <div style={{ overflowX: "auto", margin: -16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.3fr) 90px 110px 100px 100px 100px 120px", minWidth: 820 }}>
                  {["운송사", "직원 계정", "월말 예상 오더", "기본료", "계정 추가", "오더 초과", "합계"].map((h) => <div key={h} style={{ ...th, background: "linear-gradient(90deg,#0F1A30,#1B2B4B)" }}>{h}</div>)}
                  {[...companies].sort((a, b) => b.bill.total - a.bill.total).map((c) => (
                    <React.Fragment key={c.name}>
                      <div style={{ ...td, textAlign: "left", fontWeight: 800 }}>{c.name}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.staff}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.projected.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.base.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.seats.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO }}>{c.bill.orders.toLocaleString()}</div>
                      <div style={{ ...td, fontFamily: MONO, color: NAVY, fontSize: 15 }}>{c.bill.total.toLocaleString()}</div>
                    </React.Fragment>
                  ))}
                  <div style={{ ...td, textAlign: "left", fontWeight: 900, background: "#F4F7FC" }}>합계 (VAT 별도)</div>
                  <div style={{ ...td, background: "#F4F7FC" }} /><div style={{ ...td, background: "#F4F7FC" }} /><div style={{ ...td, background: "#F4F7FC" }} /><div style={{ ...td, background: "#F4F7FC" }} /><div style={{ ...td, background: "#F4F7FC" }} />
                  <div style={{ ...td, fontFamily: MONO, color: NAVY, fontSize: 16, fontWeight: 900, background: "#F4F7FC" }}>{Math.round(T.mrr).toLocaleString()}</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "applications" && <CompanyApplications />}

      {/* 운송사 상세 */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 99990, background: "rgba(15,23,42,.45)", display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(520px,100%)", height: "100%", background: "#F4F6FA", overflowY: "auto", boxShadow: "-20px 0 40px rgba(0,0,0,.2)" }}>
            <div className="pm-hero" style={{ padding: "22px 24px", color: "#fff", position: "relative" }}>
              <button type="button" onClick={() => setDetail(null)} style={{ position: "absolute", right: 16, top: 14, border: "none", background: "transparent", color: "rgba(255,255,255,.8)", fontSize: 24, cursor: "pointer" }}>✕</button>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.24em", color: "#8FB0F0", fontWeight: 800 }}>CARRIER · {detail.code || "-"}</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{detail.name}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}><StatusChip s={detail.status} /><span style={{ fontSize: 13.5, color: "rgba(207,224,255,.75)" }}>건강도 <b style={{ fontFamily: MONO, color: "#fff" }}>{detail.health}</b> · 가입 {ymdOf(detail.appliedAt)}</span></div>
              <div style={{ marginTop: 6, fontSize: 13.5, color: "rgba(207,224,255,.75)" }}>대표 {detail.rep || "-"} · {detail.phone || "-"}</div>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                      <XAxis dataKey="label" axisLine={false} tickLine={false} interval={5} tick={{ fontSize: 11, fill: "#6b7280", fontFamily: MONO }} />
                      <YAxis hide />
                      <Tooltip formatter={(v) => [`${v}건`, "오더"]} contentStyle={{ borderRadius: 10, fontSize: 13, fontWeight: 700 }} />
                      <Area type="monotone" dataKey="v" stroke={NAVY} strokeWidth={2.4} fill="url(#pmArea)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card code="USAGE" title="사용 현황">
                {[["직원 계정", `${detail.staff}명 (관리자 ${detail.admins})`], ["승인 대기", `${detail.pending}명`], ["기사 계정", `${detail.drivers}명`], ["지입·기사 등록", `${detail.fleet}명`], ["24시간 접속", `${detail.online}명 (PC ${detail.onlinePc} · 모바일 ${detail.onlineMobile})`], ["마지막 접속", ago(detail.lastSeen)], ["마지막 오더", detail.lastOrder || "-"], ["누적 오더", `${detail.totalOrders.toLocaleString()}건`], ["거래처 / 하차지", `${detail.clients} / ${detail.places}`]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #EEF1F6", fontSize: 14.5 }}>
                    <span style={{ color: "#6b7280", fontWeight: 600 }}>{k}</span><b style={{ color: "#0F1A30" }}>{v}</b>
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
`;
