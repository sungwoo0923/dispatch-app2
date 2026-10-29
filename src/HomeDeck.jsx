// ======================= src/HomeDeck.jsx =======================
// 🛰 홈 대시보드(2026-10-28 리디자인) — 어두운 네이비 "관제 데크".
//  오늘 실적 · 매출 추이(7일/30일/올해) · 매익률 게이지 · 담당자별 매출 순위 · 거래처 Top 5.
//  ⭐ 알록달록 금지 — 네이비/하늘빛 계열만 쓴다.
//  지난 기간(실시간 범위 이전) 합계는 HomeDashboard가 하루 1번 계산해 둔 pastCache(v4)를 쓰고,
//  최근 7일은 실시간 오더(dispatchData)로 더한다.
import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart, Bar, BarChart, Cell, PieChart, Pie } from "recharts";
import { creatorOf } from "./monthCompare";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const C = { ink: "#E8EEF9", sub: "rgba(207,224,255,.62)", dim: "rgba(207,224,255,.38)", line: "rgba(143,176,240,.14)", glow: "#8FB0F0", hi: "#CFE0FF", accent: "#6E95E8" };
const toWon = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);
const isCancelled = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
const won = (n) => `${Math.round(n || 0).toLocaleString()}`;
const short = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n || 0).toLocaleString();
};

// 상차시간 → 시(0~23). "오전 9시" "09:00" "14시30분" "즉시" 등. 모르면 null
const hourOf = (t) => {
  const s = String(t || "");
  const m = s.match(/(오전|오후|새벽|아침|저녁|밤)?\s*(\d{1,2})\s*(?:시|:)/);
  if (!m) return null;
  let h = Number(m[2]);
  if (/오후|저녁|밤/.test(m[1] || "") && h < 12) h += 12;
  if (/새벽/.test(m[1] || "") && h === 12) h = 0;
  return h >= 0 && h <= 23 ? h : null;
};

// ─── 지난 기간 집계(하루 1번) — 일별 / 이번 달 담당자별 / 이번 달 거래처별 ─────────────
export function buildPastStats(rows, thisMonth) {
  const days = {}, staff = {}, clients = {};
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    const s = toWon(r.청구운임), p = s - toWon(r.기사운임);
    const e = days[d] || (days[d] = [0, 0, 0]);
    e[0] += s; e[1] += p; e[2] += 1;
    if (d.startsWith(thisMonth)) {
      const k = creatorOf(r) || "미지정";
      const st = staff[k] || (staff[k] = [0, 0, 0]);
      st[0] += s; st[1] += p; st[2] += 1;
      const cn = String(r.거래처명 || "").trim();
      if (cn) clients[cn] = (clients[cn] || 0) + s;
    }
  }
  return { days, staff, clients, month: thisMonth };
}

// ─── 작은 부품 ──────────────────────────────────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const p = (n) => String(n).padStart(2, "0");
  return (
    <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: "0.04em", lineHeight: 1 }}>
      {p(now.getHours())}<span className="hd-colon">:</span>{p(now.getMinutes())}
      <span style={{ fontSize: 17, color: C.dim, marginLeft: 4 }}>{p(now.getSeconds())}</span>
    </div>
  );
}

function Panel({ code, title, right, children, style }) {
  return (
    <div className="hd-panel" style={{ borderRadius: 18, padding: "16px 18px", display: "flex", flexDirection: "column", minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: C.glow, transform: "rotate(45deg)", boxShadow: `0 0 8px ${C.glow}` }} />
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", color: C.dim }}>{code}</span>
          <span style={{ fontSize: 16.5, fontWeight: 800, color: C.ink, whiteSpace: "nowrap" }}>{title}</span>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Delta({ cur, prev, unit = "%" }) {
  if (!prev) return <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>— 비교 없음</span>;
  const r = ((cur - prev) / Math.abs(prev)) * 100;
  const up = r >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: up ? C.hi : "rgba(207,224,255,.55)" }}>
      <svg width="9" height="9" viewBox="0 0 10 10"><path d={up ? "M5 1 9 8H1z" : "M5 9 1 2h8z"} fill="currentColor" /></svg>
      {Math.abs(r).toFixed(1)}{unit}
    </span>
  );
}

function Spark({ data, id }) {
  if (!data || data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.glow} stopOpacity={0.45} /><stop offset="100%" stopColor={C.glow} stopOpacity={0} /></linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={C.glow} strokeWidth={1.8} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Tile({ code, label, value, unit, foot, spark, sparkId, primary }) {
  return (
    <div className={primary ? "hd-tile hd-tile-on" : "hd-tile"} style={{ borderRadius: 16, padding: "14px 16px 10px", position: "relative", overflow: "hidden", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.sub }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", color: C.dim }}>{code}</span>
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 27, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
        {unit && <span style={{ fontSize: 13, fontWeight: 700, color: C.dim }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 4, minHeight: 18, fontSize: 12.5, fontWeight: 600, color: C.dim, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>{foot}</div>
      <div style={{ margin: "4px -16px -10px" }}><Spark data={spark} id={sparkId} /></div>
    </div>
  );
}

function DarkTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(11,20,40,.96)", border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", boxShadow: "0 10px 26px rgba(0,0,0,.35)" }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.dim, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, fontWeight: 700, color: C.ink }}>
          <span style={{ color: C.sub }}>{p.name}</span>
          <span style={{ fontFamily: MONO }}>{won(p.value)}{p.dataKey === "c" ? "건" : "원"}</span>
        </div>
      ))}
    </div>
  );
}

// 반원 게이지(매익률)
function Gauge({ value, max = 30, label, sub }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const R = 70, cx = 90, cy = 86;
  const arc = (p) => { const a = Math.PI * (1 - p); return [cx + R * Math.cos(a), cy - R * Math.sin(a)]; };
  const [ex, ey] = arc(pct);
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);
  return (
    <svg viewBox="0 0 180 104" width="100%" style={{ maxWidth: 240, display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id="hdGauge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2D4C82" /><stop offset="1" stopColor={C.hi} /></linearGradient>
      </defs>
      <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="rgba(143,176,240,.12)" strokeWidth="12" strokeLinecap="round" />
      {pct > 0.001 && <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${ex} ${ey}`} fill="none" stroke="url(#hdGauge)" strokeWidth="12" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${C.glow})` }} />}
      {ticks.map((t) => { const a = Math.PI * (1 - t); const r1 = R - 13, r2 = R - (t * 10 % 5 === 0 ? 20 : 17); return <line key={t} x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy - r2 * Math.sin(a)} stroke="rgba(207,224,255,.25)" strokeWidth="1" />; })}
      <text x={cx} y={cy - 18} textAnchor="middle" fill="#fff" fontFamily={MONO} fontSize="24" fontWeight="800">{label}</text>
      <text x={cx} y={cy - 2} textAnchor="middle" fill={C.dim} fontSize="10" fontWeight="700">{sub}</text>
      <text x={cx - R} y={cy + 14} textAnchor="middle" fill={C.dim} fontFamily={MONO} fontSize="8.5">0%</text>
      <text x={cx + R} y={cy + 14} textAnchor="middle" fill={C.dim} fontFamily={MONO} fontSize="8.5">{max}%</text>
    </svg>
  );
}

function Seg({ value, onChange, items }) {
  return (
    <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: "rgba(255,255,255,.05)", border: `1px solid ${C.line}` }}>
      {items.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} style={{ height: 28, padding: "0 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800, background: value === k ? "linear-gradient(135deg,#2D4C82,#4B6CB7)" : "transparent", color: value === k ? "#fff" : C.sub, boxShadow: value === k ? `0 0 12px rgba(110,149,232,.35)` : "none" }}>{l}</button>
      ))}
    </div>
  );
}

// ─── 본체 ──────────────────────────────────────────────────────────────────────
export default function HomeDeck({ dispatchData = [], pastCache, liveStart, users = [], myName = "", isMaster = false }) {
  const today = kstToday();
  const thisMonth = today.slice(0, 7);
  const [range, setRange] = useState("30d");
  const [rankBy, setRankBy] = useState("sale");

  // 최근(실시간) 오더 집계 — 일별 / 이번 달 담당자 / 이번 달 거래처
  const live = useMemo(() => {
    const rows = dispatchData.filter((r) => !isCancelled(r) && r.source !== "transport_transmit" && dateOf(r) >= liveStart);
    return { ...buildPastStats(rows, thisMonth), rows };
  }, [dispatchData, liveStart, thisMonth]);

  // 일별 합치기(지난 기간 캐시 + 실시간)
  const days = useMemo(() => {
    const m = {};
    Object.entries(pastCache?.days || {}).forEach(([d, v]) => { if (d < liveStart) m[d] = [...v]; });
    Object.entries(live.days).forEach(([d, v]) => { m[d] = [...v]; });
    return m;
  }, [pastCache, live, liveStart]);
  const dayVal = (d) => days[d] || [0, 0, 0];

  // KPI
  const t0 = dayVal(today), t1 = dayVal(addDay(today, -1));
  const sumRange = (from, to) => Object.entries(days).reduce((a, [d, v]) => (d >= from && d <= to ? [a[0] + v[0], a[1] + v[1], a[2] + v[2]] : a), [0, 0, 0]);
  const mNow = sumRange(`${thisMonth}-01`, today);
  const prevMonthStart = (() => { const d = new Date(`${thisMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const prevSameDay = (() => { const d = new Date(`${prevMonthStart}T00:00:00Z`); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(Number(today.slice(8)), last)); return d.toISOString().slice(0, 10); })();
  const mPrev = prevMonthStart.slice(0, 4) === today.slice(0, 4) ? sumRange(prevMonthStart, prevSameDay) : [0, 0, 0];
  const yNow = sumRange(`${today.slice(0, 4)}-01-01`, today);
  const dayOfMonth = Number(today.slice(8));
  const monthRate = mNow[0] ? (mNow[1] / mNow[0]) * 100 : 0;
  const todayRate = t0[0] ? (t0[1] / t0[0]) * 100 : 0;

  // 오늘 배차 진행률
  const todayRows = live.rows.filter((r) => dateOf(r) === today);
  const doneToday = todayRows.filter((r) => r.배차상태 === "배차완료").length;

  // 스파크라인(최근 14일)
  const last14 = Array.from({ length: 14 }, (_, i) => addDay(today, i - 13));
  const sparkS = last14.map((d) => ({ v: dayVal(d)[0] }));
  const sparkP = last14.map((d) => ({ v: dayVal(d)[1] }));
  const sparkC = last14.map((d) => ({ v: dayVal(d)[2] }));

  // 매출 추이
  const trend = useMemo(() => {
    if (range === "year") {
      const y = today.slice(0, 4);
      return Array.from({ length: 12 }, (_, i) => {
        const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
        const v = Object.entries(days).reduce((a, [d, x]) => (d.startsWith(ym) ? [a[0] + x[0], a[1] + x[1], a[2] + x[2]] : a), [0, 0, 0]);
        return { label: `${i + 1}월`, s: v[0], p: v[1], c: v[2], on: ym === thisMonth };
      });
    }
    const n = range === "7d" ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const d = addDay(today, i - (n - 1));
      const v = dayVal(d);
      return { label: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`, s: v[0], p: v[1], c: v[2], on: d === today };
    });
  }, [range, days, today, thisMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  const trendSum = trend.reduce((a, x) => [a[0] + x.s, a[1] + x.p, a[2] + x.c], [0, 0, 0]);
  const peak = trend.reduce((a, x) => (x.s > a.s ? x : a), { s: 0, label: "-" });

  // 담당자 이름(이메일 앞부분 → 회원 이름), 최고관리자는 순위에서 숨김
  const nameOf = useMemo(() => {
    const m = new Map();
    users.forEach((u) => {
      const local = String(u.email || "").split("@")[0];
      const info = { name: u.name || local, hidden: u.role === "totalMaster" || u.name === "최고관리자" };
      if (local) m.set(local, info);
      if (u.name) m.set(u.name, info);
    });
    return (k) => m.get(k) || { name: k, hidden: k === "최고관리자" };
  }, [users]);

  const staffRank = useMemo(() => {
    const m = new Map();
    const add = (src) => Object.entries(src || {}).forEach(([k, v]) => {
      const info = nameOf(k);
      if (info.hidden && !isMaster) return;
      if (info.hidden) return;
      const g = m.get(info.name) || { name: info.name, s: 0, p: 0, c: 0 };
      g.s += v[0]; g.p += v[1]; g.c += v[2];
      m.set(info.name, g);
    });
    if (pastCache?.month === thisMonth) add(pastCache.staff);
    add(live.staff);
    const list = [...m.values()].filter((g) => g.name !== "미지정" || g.s > 0);
    list.sort((a, b) => (rankBy === "profit" ? b.p - a.p : rankBy === "cnt" ? b.c - a.c : b.s - a.s));
    return list;
  }, [pastCache, live, nameOf, rankBy, thisMonth, isMaster]);
  const staffMax = Math.max(1, ...staffRank.map((g) => (rankBy === "profit" ? g.p : rankBy === "cnt" ? g.c : g.s)));
  const staffTotal = staffRank.reduce((a, g) => a + g.s, 0);

  const topClients = useMemo(() => {
    const m = {};
    const add = (src) => Object.entries(src || {}).forEach(([k, v]) => { if (/\d{2}년\d{1,2}월/.test(k)) return; m[k] = (m[k] || 0) + v; });
    if (pastCache?.month === thisMonth) add(pastCache.clients);
    add(live.clients);
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, v]) => ({ name, v }));
  }, [pastCache, live, thisMonth]);
  const clientTotal = topClients.reduce((a, c) => a + c.v, 0);

  // ── 아래 줄(운영 현황) — 오늘·내일 배차판 / 상차 시간대 / 차종 구성 / 주요 노선 / 요일 패턴 ──
  const tomorrow = addDay(today, 1);
  const ops = useMemo(() => {
    const t = live.rows.filter((r) => dateOf(r) === today);
    const tm = dispatchData.filter((r) => !isCancelled(r) && r.source !== "transport_transmit" && dateOf(r) === tomorrow);
    const done = (list) => list.filter((r) => r.배차상태 === "배차완료").length;
    const hours = Array.from({ length: 24 }, (_, h) => ({ h: `${h}`, t: 0, n: 0 }));
    let immediate = 0;
    t.forEach((r) => { const h = hourOf(r.상차시간); if (h == null) immediate += 1; else hours[h].t += 1; });
    tm.forEach((r) => { const h = hourOf(r.상차시간); if (h != null) hours[h].n += 1; });
    const span = hours.filter((x, i) => i >= 5 && i <= 20);
    const week = live.rows.filter((r) => dateOf(r) >= addDay(today, -6) && dateOf(r) <= today);
    const cars = {}, routes = {};
    week.forEach((r) => {
      const c = String(r.차량종류 || "미지정").trim() || "미지정";
      cars[c] = (cars[c] || 0) + 1;
      const k = `${r.상차지명 || "-"} → ${r.하차지명 || "-"}`;
      const e = routes[k] || (routes[k] = { k, cnt: 0, sale: 0 });
      e.cnt += 1; e.sale += toWon(r.청구운임);
    });
    const carList = Object.entries(cars).sort((a, b) => b[1] - a[1]);
    const carTop = carList.slice(0, 5).map(([name, v]) => ({ name, v }));
    const rest = carList.slice(5).reduce((a, [, v]) => a + v, 0);
    if (rest) carTop.push({ name: "기타", v: rest });
    return {
      today: { all: t.length, done: done(t), pending: t.length - done(t), immediate },
      tomorrow: { all: tm.length, done: done(tm), pending: tm.length - done(tm) },
      hours: span, cars: carTop, weekCnt: week.length,
      routes: Object.values(routes).sort((a, b) => b.cnt - a.cnt || b.sale - a.sale).slice(0, 5),
    };
  }, [live, dispatchData, today, tomorrow]);
  const weekdayAvg = useMemo(() => {
    const W = ["일", "월", "화", "수", "목", "금", "토"].map((l) => ({ l, sum: 0, n: 0 }));
    for (let i = 1; i <= 56; i++) { const dd = addDay(today, -i); const w = new Date(`${dd}T00:00:00Z`).getUTCDay(); const v = dayVal(dd); W[w].sum += v[2]; W[w].n += 1; }
    const tw = new Date(`${today}T00:00:00Z`).getUTCDay();
    return W.map((x, i) => ({ label: x.l, v: x.n ? Math.round((x.sum / x.n) * 10) / 10 : 0, on: i === tw }));
  }, [days, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const CAR_SHADES = ["#CFE0FF", "#8FB0F0", "#6E95E8", "#4B6CB7", "#2D4C82", "#1B2B4B"];

  const d = new Date();
  const dateText = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()]}`;
  const hour = d.getHours();
  const hello = hour < 12 ? "좋은 아침입니다" : hour < 18 ? "오늘도 수고 많으십니다" : "오늘 하루 고생하셨습니다";
  const ready = !!pastCache;
  const metric = (g) => (rankBy === "profit" ? g.p : rankBy === "cnt" ? g.c : g.s);

  return (
    <section className="hd-deck" style={{ position: "relative", overflow: "hidden", borderRadius: 26, padding: "22px 24px 24px", color: C.ink, minHeight: "calc(100vh - 120px)" }}>
      <style>{HD_CSS}</style>
      <div className="hd-scan" />

      {/* ── 머리줄 ── */}
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.28em", color: C.glow }}>KP-FLOW · OPERATIONS DECK</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px", borderRadius: 99, border: `1px solid rgba(143,176,240,.35)`, fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: C.hi }}>
              <span className="hd-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: C.hi, boxShadow: `0 0 8px ${C.glow}` }} />LIVE
            </span>
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", color: "#fff" }}>{myName ? `${myName}님, ${hello}` : hello}</h1>
          <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 600, color: C.sub }}>
            오늘 접수 <b style={{ color: "#fff", fontFamily: MONO }}>{t0[2].toLocaleString()}</b>건 · 배차완료 <b style={{ color: "#fff", fontFamily: MONO }}>{doneToday.toLocaleString()}</b>건 · 오늘 매출 <b style={{ color: "#fff", fontFamily: MONO }}>{won(t0[0])}</b>원
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <Clock />
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", color: C.dim }}>{dateText} · KST</div>
        </div>
      </div>

      {/* ── KPI 타일 ── */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12, marginBottom: 14 }}>
        <Tile primary code="ORDERS" label="오늘 접수" value={t0[2].toLocaleString()} unit="건" spark={sparkC} sparkId="hdS1"
          foot={<><Delta cur={t0[2]} prev={t1[2]} /><span>어제 대비</span></>} />
        <Tile code="REVENUE" label="오늘 매출" value={won(t0[0])} unit="원" spark={sparkS} sparkId="hdS2"
          foot={<><Delta cur={t0[0]} prev={t1[0]} /><span>어제 대비</span></>} />
        <Tile code="PROFIT" label="오늘 수익" value={won(t0[1])} unit="원" spark={sparkP} sparkId="hdS3"
          foot={<span>매익률 <b style={{ fontFamily: MONO, color: C.hi }}>{todayRate.toFixed(1)}%</b></span>} />
        <Tile code="MONTH" label="이번 달 매출" value={ready ? short(mNow[0]) : "…"} unit="원"
          foot={ready ? <><Delta cur={mNow[0]} prev={mPrev[0]} /><span>전월 같은 기간 대비</span></> : "계산 중…"} />
        <Tile code="YEAR" label="올해 매출" value={ready ? short(yNow[0]) : "…"} unit="원"
          foot={ready ? <span>누적 <b style={{ fontFamily: MONO, color: C.hi }}>{yNow[2].toLocaleString()}</b>건 · 수익 <b style={{ fontFamily: MONO, color: C.hi }}>{short(yNow[1])}</b></span> : "계산 중…"} />
      </div>

      {/* ── 매출 추이 + 게이지 ── */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,2.25fr) minmax(0,1fr)", gap: 14, marginBottom: 14 }}>
        <Panel code="TREND" title="매출 추이" right={<Seg value={range} onChange={setRange} items={[["7d", "7일"], ["30d", "30일"], ["year", "올해"]]} />}>
          <div style={{ display: "flex", gap: 22, marginBottom: 6, flexWrap: "wrap" }}>
            {[["기간 매출", won(trendSum[0]) + "원"], ["기간 수익", won(trendSum[1]) + "원"], ["매익률", trendSum[0] ? `${((trendSum[1] / trendSum[0]) * 100).toFixed(1)}%` : "-"], ["최고", `${peak.label} · ${short(peak.s)}`], ["건수", `${trendSum[2].toLocaleString()}건`]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 16.5, fontWeight: 800, color: "#fff" }}>{v}</div>
              </div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", fontSize: 12, fontWeight: 700, color: C.sub }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: C.glow }} />매출</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 0, borderTop: `2px dashed ${C.hi}` }} />수익</span>
            </div>
          </div>
          <div style={{ height: "clamp(260px, 34vh, 400px)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hdArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.5} /><stop offset="100%" stopColor={C.accent} stopOpacity={0} /></linearGradient>
                  <linearGradient id="hdBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.hi} /><stop offset="100%" stopColor="#2D4C82" /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(143,176,240,.08)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11.5, fill: "rgba(207,224,255,.5)", fontFamily: MONO }} interval={range === "30d" ? 3 : 0} dy={6} />
                <YAxis axisLine={false} tickLine={false} width={46} tick={{ fontSize: 11, fill: "rgba(207,224,255,.4)", fontFamily: MONO }} tickFormatter={short} />
                <Tooltip content={<DarkTip />} cursor={{ stroke: "rgba(143,176,240,.35)", strokeDasharray: "3 3" }} />
                {range === "year" ? (
                  <Bar dataKey="s" name="매출" radius={[6, 6, 0, 0]} barSize={22}>
                    {trend.map((x) => <Cell key={x.label} fill={x.on ? "url(#hdBar)" : "rgba(110,149,232,.35)"} />)}
                  </Bar>
                ) : (
                  <Area type="monotone" dataKey="s" name="매출" stroke={C.glow} strokeWidth={2.6} fill="url(#hdArea)" dot={false} activeDot={{ r: 5, fill: "#fff", stroke: C.glow, strokeWidth: 3 }} animationDuration={800} />
                )}
                <Line type="monotone" dataKey="p" name="수익" stroke={C.hi} strokeWidth={1.8} strokeDasharray="5 4" dot={false} animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel code="MARGIN" title="이번 달 매익률">
          <Gauge value={monthRate} label={`${monthRate.toFixed(1)}%`} sub={`${Number(thisMonth.slice(5))}월 수익 ÷ 매출`} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            {[["월 수익", short(mNow[1])], ["일평균 매출", short(dayOfMonth ? mNow[0] / dayOfMonth : 0)], ["월 건수", `${mNow[2].toLocaleString()}건`], ["건당 매출", short(mNow[2] ? mNow[0] / mNow[2] : 0)]].map(([k, v]) => (
              <div key={k} style={{ borderRadius: 11, padding: "9px 11px", background: "rgba(255,255,255,.035)", border: `1px solid ${C.line}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "#fff", marginTop: 2 }}>{ready ? v : "…"}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: C.sub, marginBottom: 6 }}>
              <span>오늘 배차 진행률</span>
              <span style={{ fontFamily: MONO, color: "#fff" }}>{doneToday}/{todayRows.length} · {todayRows.length ? Math.round((doneToday / todayRows.length) * 100) : 0}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(143,176,240,.12)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${todayRows.length ? (doneToday / todayRows.length) * 100 : 0}%`, borderRadius: 99, background: `linear-gradient(90deg,#2D4C82,${C.hi})`, boxShadow: `0 0 10px ${C.glow}`, transition: "width .6s" }} />
            </div>
          </div>
        </Panel>
      </div>

      {/* ── 담당자 순위 + 거래처 Top ── */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 14 }}>
        <Panel code="RANKING" title={`${Number(thisMonth.slice(5))}월 담당자별 매출 순위`} right={<Seg value={rankBy} onChange={setRankBy} items={[["sale", "매출"], ["profit", "수익"], ["cnt", "건수"]]} />}>
          {staffRank.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 14, color: C.dim }}>{ready ? "이번 달 실적이 아직 없습니다" : "계산 중…"}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: "clamp(330px, 36vh, 480px)", overflowY: "auto" }} className="hd-scroll">
              {staffRank.slice(0, 10).map((g, i) => {
                const v = metric(g);
                const share = staffTotal ? (g.s / staffTotal) * 100 : 0;
                return (
                  <div key={g.name} style={{ display: "grid", gridTemplateColumns: "34px minmax(90px,1.1fr) minmax(0,2fr) 104px 92px 64px", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: i === 0 ? "linear-gradient(90deg,rgba(110,149,232,.22),rgba(110,149,232,.04))" : "rgba(255,255,255,.025)", border: `1px solid ${i === 0 ? "rgba(143,176,240,.35)" : C.line}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, textAlign: "center", color: i < 3 ? "#fff" : C.dim, background: i < 3 ? `rgba(110,149,232,${0.45 - i * 0.12})` : "transparent", borderRadius: 8, padding: "3px 0" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                    <div style={{ height: 8, borderRadius: 99, background: "rgba(143,176,240,.1)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(2, (v / staffMax) * 100)}%`, borderRadius: 99, background: i === 0 ? `linear-gradient(90deg,#4B6CB7,${C.hi})` : "linear-gradient(90deg,#2D4C82,#6E95E8)" }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: "#fff", textAlign: "right" }}>{rankBy === "cnt" ? `${g.c}건` : short(v)}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.sub, textAlign: "right" }}>{g.c}건 · {g.s ? ((g.p / g.s) * 100).toFixed(1) : "0.0"}%</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.dim, textAlign: "right" }}>{share.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 16, fontSize: 12, fontWeight: 700, color: C.dim }}>
            <span>건수 · 매익률</span><span>매출 점유율</span>
          </div>
          {/* 담당자별 매출 비중(한 줄 막대) + 1인 평균 — 담당자가 적어도 칸이 비어 보이지 않게 */}
          {staffRank.length > 0 && (
            <div style={{ marginTop: "auto", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800, color: C.sub, marginBottom: 6 }}>
                <span>담당자별 매출 비중</span>
                <span>1인 평균 <b style={{ fontFamily: MONO, color: "#fff" }}>{short(staffTotal / staffRank.length)}</b> · 총 <b style={{ fontFamily: MONO, color: "#fff" }}>{short(staffTotal)}</b></span>
              </div>
              <div style={{ display: "flex", height: 14, borderRadius: 99, overflow: "hidden", background: "rgba(143,176,240,.1)" }}>
                {staffRank.slice(0, 8).map((g, i) => (
                  <div key={g.name} title={`${g.name} ${staffTotal ? ((g.s / staffTotal) * 100).toFixed(1) : 0}%`} style={{ width: `${staffTotal ? (g.s / staffTotal) * 100 : 0}%`, background: ["#CFE0FF", "#8FB0F0", "#6E95E8", "#4B6CB7", "#2D4C82", "#24396A", "#1B2B4B", "#16243F"][i], borderRight: "1px solid rgba(11,20,40,.6)" }} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 7 }}>
                {staffRank.slice(0, 8).map((g, i) => (
                  <span key={g.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: C.sub }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: ["#CFE0FF", "#8FB0F0", "#6E95E8", "#4B6CB7", "#2D4C82", "#24396A", "#1B2B4B", "#16243F"][i] }} />
                    {g.name} <b style={{ fontFamily: MONO, color: "#fff" }}>{staffTotal ? ((g.s / staffTotal) * 100).toFixed(0) : 0}%</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel code="CLIENTS" title={`${Number(thisMonth.slice(5))}월 Top 거래처`}>
          {topClients.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 14, color: C.dim }}>{ready ? "이번 달 오더가 아직 없습니다" : "계산 중…"}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {topClients.map((c, i) => (
                <div key={c.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: i === 0 ? "#fff" : C.dim }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, color: C.hi, whiteSpace: "nowrap" }}>{short(c.v)}<span style={{ color: C.dim, fontSize: 11.5, marginLeft: 6 }}>{clientTotal ? ((c.v / clientTotal) * 100).toFixed(0) : 0}%</span></span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "rgba(143,176,240,.1)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(c.v / topClients[0].v) * 100}%`, borderRadius: 99, background: i === 0 ? `linear-gradient(90deg,#4B6CB7,${C.hi})` : `rgba(110,149,232,${0.85 - i * 0.1})` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── 운영 현황(2026-10-28 추가) — 오늘·내일 배차판 / 상차 시간대 / 차종 / 주요 노선 / 요일 패턴 ── */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.2fr)", gap: 14, marginTop: 14 }}>
        <Panel code="BOARD" title="오늘 · 내일 배차판">
          {[["오늘", today, ops.today], ["내일", tomorrow, ops.tomorrow]].map(([k, dd, o]) => (
            <div key={k} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{k} <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>{dd.slice(5).replace("-", "/")}</span></span>
                <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: "#fff" }}>{o.all}<span style={{ fontSize: 12, color: C.dim, marginLeft: 3 }}>건</span></span>
              </div>
              <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "rgba(143,176,240,.12)", marginTop: 6 }}>
                <div style={{ width: `${o.all ? (o.done / o.all) * 100 : 0}%`, background: `linear-gradient(90deg,#4B6CB7,${C.hi})` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 12, fontWeight: 700, color: C.sub }}>
                <span>배차완료 <b style={{ fontFamily: MONO, color: C.hi }}>{o.done}</b></span>
                <span>배차중 <b style={{ fontFamily: MONO, color: "#fff" }}>{o.pending}</b></span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>오늘 "즉시·시간미정" 상차 <b style={{ fontFamily: MONO, color: C.sub }}>{ops.today.immediate}</b>건</div>
        </Panel>

        <Panel code="TIMELINE" title="상차 시간대 분포" right={<span style={{ display: "flex", gap: 10, fontSize: 11.5, fontWeight: 700, color: C.sub }}><span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: C.glow, marginRight: 4 }} />오늘</span><span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "rgba(143,176,240,.35)", marginRight: 4 }} />내일</span></span>}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ops.hours} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={1}>
                <CartesianGrid stroke="rgba(143,176,240,.08)" vertical={false} />
                <XAxis dataKey="h" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "rgba(207,224,255,.5)", fontFamily: MONO }} tickFormatter={(h) => `${h}시`} interval={1} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={24} tick={{ fontSize: 10.5, fill: "rgba(207,224,255,.4)", fontFamily: MONO }} />
                <Tooltip cursor={{ fill: "rgba(143,176,240,.08)" }} contentStyle={{ background: "rgba(11,20,40,.96)", border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontSize: 12.5, fontWeight: 700 }} labelFormatter={(h) => `${h}시 상차`} formatter={(v, n) => [`${v}건`, n === "t" ? "오늘" : "내일"]} />
                <Bar dataKey="t" fill={C.glow} radius={[4, 4, 0, 0]} barSize={9} />
                <Bar dataKey="n" fill="rgba(143,176,240,.35)" radius={[4, 4, 0, 0]} barSize={9} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel code="FLEET MIX" title="최근 7일 차종 구성">
          {ops.cars.length === 0 ? <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13.5, color: C.dim }}>데이터 없음</div> : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 120, height: 120, position: "relative", flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ops.cars} dataKey="v" nameKey="name" innerRadius={38} outerRadius={56} paddingAngle={2} stroke="none">
                      {ops.cars.map((x, i) => <Cell key={x.name} fill={CAR_SHADES[i % CAR_SHADES.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: "#fff" }}>{ops.weekCnt}</span>
                  <span style={{ fontSize: 10.5, color: C.dim, fontWeight: 700 }}>건</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                {ops.cars.map((x, i) => (
                  <div key={x.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: CAR_SHADES[i % CAR_SHADES.length] }} />
                    <span style={{ flex: 1, minWidth: 0, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                    <span style={{ fontFamily: MONO, color: C.sub }}>{ops.weekCnt ? Math.round((x.v / ops.weekCnt) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.sub, marginBottom: 4 }}>요일별 평균 오더 <span style={{ color: C.dim, fontWeight: 600 }}>(최근 8주)</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, alignItems: "end", height: 54 }}>
              {(() => { const mx = Math.max(1, ...weekdayAvg.map((w) => w.v)); return weekdayAvg.map((w) => (
                <div key={w.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={`${w.label}요일 평균 ${w.v}건`}>
                  <div style={{ width: "100%", height: Math.max(3, (w.v / mx) * 36), borderRadius: 4, background: w.on ? `linear-gradient(180deg,${C.hi},#4B6CB7)` : "rgba(110,149,232,.4)", boxShadow: w.on ? `0 0 8px ${C.glow}` : "none" }} />
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: w.on ? "#fff" : C.dim }}>{w.label}</span>
                </div>
              )); })()}
            </div>
          </div>
        </Panel>

        <Panel code="ROUTES" title="최근 7일 주요 노선">
          {ops.routes.length === 0 ? <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13.5, color: C.dim }}>데이터 없음</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {ops.routes.map((x, i) => (
                <div key={x.k}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: i === 0 ? "#fff" : C.dim }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.k}</span>
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: C.hi, whiteSpace: "nowrap" }}>{x.cnt}건 · {short(x.sale)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: "rgba(143,176,240,.1)", marginTop: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(x.cnt / ops.routes[0].cnt) * 100}%`, background: i === 0 ? `linear-gradient(90deg,#4B6CB7,${C.hi})` : "rgba(110,149,232,.7)", borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

const HD_CSS = `
  .hd-deck { background:
      linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/28px 28px,
      linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/28px 28px,
      radial-gradient(1200px 400px at 85% -10%, rgba(75,108,183,.35), transparent 60%),
      linear-gradient(160deg, #0B1428 0%, #111F3B 55%, #0E1830 100%);
    box-shadow: 0 24px 50px rgba(11,20,40,.35); border: 1px solid #0B1428; }
  .hd-panel { background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.025)); border: 1px solid rgba(143,176,240,.14); box-shadow: inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter: blur(6px); }
  .hd-tile { background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); border: 1px solid rgba(143,176,240,.14); transition: transform .15s, border-color .15s; }
  .hd-tile:hover { transform: translateY(-2px); border-color: rgba(143,176,240,.35); }
  .hd-tile-on { background: linear-gradient(140deg, rgba(75,108,183,.55), rgba(45,76,130,.25)); border-color: rgba(143,176,240,.4); box-shadow: 0 0 24px rgba(110,149,232,.18); }
  @keyframes hdColon { 0%,49% { opacity: 1 } 50%,100% { opacity: .25 } }
  .hd-colon { animation: hdColon 1s steps(1) infinite; }
  @keyframes hdPulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
  .hd-pulse { animation: hdPulse 1.6s ease-in-out infinite; }
  @keyframes hdScan { 0% { transform: translateY(-120%) } 100% { transform: translateY(900%) } }
  .hd-scan { position: absolute; left: 0; right: 0; top: 0; height: 90px; background: linear-gradient(180deg, rgba(143,176,240,0), rgba(143,176,240,.05), rgba(143,176,240,0)); animation: hdScan 9s linear infinite; pointer-events: none; }
  .hd-deck table tbody td, .hd-deck table tbody tr:hover td, .hd-deck table tbody tr:nth-child(even) td, .hd-deck table tbody tr:nth-child(odd) td { background: transparent !important; border-left: none !important; border-right: none !important; color: #E8EEF9 !important; font-size: 13.5px !important; }
  .hd-deck table tbody td.hd-sub { color: rgba(207,224,255,.62) !important; }
  .hd-deck table tbody tr { border-bottom: 1px solid rgba(143,176,240,.07); height: 44px; }
  .hd-deck table tbody tr:hover td { background: rgba(143,176,240,.06) !important; }
  .hd-deck table thead th { background: #111F3B !important; color: rgba(207,224,255,.45) !important; border-left: none !important; border-right: none !important; }
  .hd-scroll::-webkit-scrollbar { width: 6px } .hd-scroll::-webkit-scrollbar-thumb { background: rgba(143,176,240,.25); border-radius: 9px }
`;

// 화주사 대시보드(ShipperHome)도 같은 관제 데크 부품을 쓴다.
export { MONO as HD_MONO, C as HD_C, HD_CSS, Clock, Panel, Delta, Tile, DarkTip, Gauge, Seg, short as hdShort };
