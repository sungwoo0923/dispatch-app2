// ======================= src/RevenueDashboard.jsx =======================
// 📊 매출관리 › 매출 대시보드(2026-10-28 리디자인) — 필요한 숫자만 한 화면에.
//  월 실적 KPI · 누적 매출 레이스(이번 달 vs 전월) · 월별 추이 · 목표 달성 링 · 거래처 Top10 · 증감 거래처 · 담당자 · 요일.
//  ⭐ 알록달록 금지 — 네이비 계열만.
import React, { useMemo } from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, BarChart } from "recharts";
import { creatorOf } from "./monthCompare";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const NAVY = "#1B2B4B";
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const short = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n || 0).toLocaleString();
};
const statOf = (list) => {
  let sale = 0, driver = 0;
  list.forEach((r) => { sale += toInt(r.청구운임); driver += toInt(r.기사운임); });
  return { sale, profit: sale - driver, cnt: list.length, rate: sale ? ((sale - driver) / sale) * 100 : 0 };
};

function Delta({ cur, prev, suffix = "" }) {
  if (!prev) return <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#9ca3af" }}>비교 없음</span>;
  const r = ((cur - prev) / Math.abs(prev)) * 100;
  return <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: r >= 0 ? NAVY : "#64748b" }}>{r >= 0 ? "▲" : "▼"} {Math.abs(r).toFixed(1)}%{suffix}</span>;
}

function Tile({ code, label, value, unit, foot, dark }) {
  return (
    <div style={{
      borderRadius: 16, padding: "15px 17px 13px", minWidth: 0,
      background: dark ? "linear-gradient(135deg,#0F1A30 0%,#1B2B4B 60%,#2D4C82 100%)" : "#fff",
      border: dark ? "1px solid #0F1A30" : "1px solid #E3E8F0",
      boxShadow: dark ? "0 10px 24px rgba(15,26,48,.25)" : "0 1px 2px rgba(16,24,40,.04), 0 8px 20px rgba(16,24,40,.05)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: dark ? "rgba(255,255,255,.82)" : "#4b5563", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", color: dark ? "rgba(143,176,240,.9)" : "#94A3B8" }}>{code}</span>
      </div>
      <div style={{ marginTop: 9, display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 27, fontWeight: 800, color: dark ? "#fff" : "#0F1A30", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{value}</span>
        {unit && <span style={{ fontSize: 13, fontWeight: 700, color: dark ? "rgba(207,224,255,.55)" : "#9ca3af" }}>{unit}</span>}
      </div>
      {foot && <div style={{ marginTop: 5, fontSize: 12.5, fontWeight: 600, color: dark ? "rgba(207,224,255,.65)" : "#6b7280", display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>{foot}</div>}
    </div>
  );
}

export function RvCard({ code, title, right, children, style, bodyStyle }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E3E8F0", borderRadius: 18, boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 10px 26px rgba(16,24,40,.05)", overflow: "hidden", minWidth: 0, ...style }}>
      <div style={{ padding: "12px 18px", background: "#F7F9FC", borderBottom: "1px solid #E8EDF4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: NAVY, transform: "rotate(45deg)" }} />
          {code && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "#94A3B8" }}>{code}</span>}
          <span style={{ fontSize: 16.5, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap" }}>{title}</span>
        </span>
        {right}
      </div>
      <div style={{ padding: 16, ...bodyStyle }}>{children}</div>
    </div>
  );
}

function Ring({ pct, label, sub }) {
  const p = Math.max(0, Math.min(1, pct));
  const R = 58, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 150 150" width="150" height="150" style={{ display: "block" }}>
      <defs><linearGradient id="rvRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4B6CB7" /><stop offset="1" stopColor={NAVY} /></linearGradient></defs>
      <circle cx="75" cy="75" r={R} fill="none" stroke="#E8EDF4" strokeWidth="13" />
      <circle cx="75" cy="75" r={R} fill="none" stroke="url(#rvRing)" strokeWidth="13" strokeLinecap="round" strokeDasharray={`${C * p} ${C}`} transform="rotate(-90 75 75)" />
      {Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return <line key={i} x1={75 + 44 * Math.cos(a)} y1={75 + 44 * Math.sin(a)} x2={75 + 47 * Math.cos(a)} y2={75 + 47 * Math.sin(a)} stroke="#D5DCE8" strokeWidth="1" />; })}
      <text x="75" y="76" textAnchor="middle" fontFamily={MONO} fontSize="24" fontWeight="800" fill="#0F1A30">{label}</text>
      <text x="75" y="96" textAnchor="middle" fontSize="11" fontWeight="700" fill="#6b7280">{sub}</text>
    </svg>
  );
}

const tipStyle = { borderRadius: 10, border: "1px solid #E3E8F0", boxShadow: "0 8px 22px rgba(15,26,48,.12)", fontSize: 13, fontWeight: 700 };

export default function RevenueDashboard({ rows = [], targetMonth, forecast, yearTarget = 0, yearPureSale = 0, rankRows = [], isRankExcluded = () => false, hasExcluded = false, onOpenClient }) {
  const [Y, M] = targetMonth.split("-").map(Number);
  const daysInMonth = new Date(Y, M, 0).getDate();
  const prevYm = (() => { const d = new Date(Y, M - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const isCurrent = today.startsWith(targetMonth);
  const cutDay = isCurrent ? Number(today.slice(8)) : daysInMonth;

  const monthRows = useMemo(() => rows.filter((r) => String(r.상차일 || "").startsWith(targetMonth)), [rows, targetMonth]);
  const prevRows = useMemo(() => rows.filter((r) => String(r.상차일 || "").startsWith(prevYm)), [rows, prevYm]);
  const prevSame = useMemo(() => prevRows.filter((r) => Number(String(r.상차일).slice(8, 10)) <= cutDay), [prevRows, cutDay]);
  const m = statOf(monthRows), pm = statOf(prevSame), pmAll = statOf(prevRows);

  // 일별 + 누적 레이스
  const daily = useMemo(() => {
    const cur = Array(daysInMonth + 1).fill(0), curP = Array(daysInMonth + 1).fill(0), prev = Array(32).fill(0);
    monthRows.forEach((r) => { const d = Number(String(r.상차일).slice(8, 10)); cur[d] += toInt(r.청구운임); curP[d] += toInt(r.청구운임) - toInt(r.기사운임); });
    prevRows.forEach((r) => { const d = Number(String(r.상차일).slice(8, 10)); if (d <= 31) prev[d] += toInt(r.청구운임); });
    let a = 0, b = 0;
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      a += cur[d]; b += prev[d];
      const wd = new Date(Y, M - 1, d).getDay();
      return { day: `${d}`, sale: d <= cutDay ? cur[d] : null, profit: d <= cutDay ? curP[d] : null, cum: d <= cutDay ? a : null, prevCum: b, wkend: wd === 0 || wd === 6 };
    });
  }, [monthRows, prevRows, daysInMonth, cutDay, Y, M]);

  // 월별(올해)
  const monthly = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const ym = `${Y}-${String(i + 1).padStart(2, "0")}`;
    const s = statOf(rows.filter((r) => String(r.상차일 || "").startsWith(ym)));
    return { label: `${i + 1}월`, sale: s.sale, rate: s.sale ? Number(s.rate.toFixed(1)) : null, on: ym === targetMonth };
  }), [rows, Y, targetMonth]);

  // 거래처 Top10 + 증감
  const clients = useMemo(() => {
    const cur = {}, prev = {};
    rankRows.filter((r) => String(r.상차일 || "").startsWith(targetMonth)).forEach((r) => { const k = String(r.거래처명 || "").trim(); if (k) cur[k] = (cur[k] || 0) + toInt(r.청구운임); });
    prevSame.forEach((r) => { const k = String(r.거래처명 || "").trim(); if (k && !isRankExcluded(k)) prev[k] = (prev[k] || 0) + toInt(r.청구운임); });
    const top = Object.entries(cur).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, v]) => ({ name, v, p: prev[name] || 0 }));
    const diff = [...new Set([...Object.keys(cur), ...Object.keys(prev)])].map((k) => ({ name: k, d: (cur[k] || 0) - (prev[k] || 0), v: cur[k] || 0, p: prev[k] || 0 }));
    return {
      top, total: Object.values(cur).reduce((a, b) => a + b, 0),
      up: diff.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5),
      down: diff.filter((x) => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 5),
      newCnt: Object.keys(cur).filter((k) => !prev[k] && !prevRows.some((r) => r.거래처명 === k)).length,
    };
  }, [rankRows, prevSame, prevRows, targetMonth, isRankExcluded]);

  // 담당자
  const staff = useMemo(() => {
    const g = {};
    monthRows.forEach((r) => {
      if (r.__fixed) return;
      const k = creatorOf(r) || "미지정";
      if (k === "최고관리자") return;
      const e = g[k] || (g[k] = { name: k, sale: 0, profit: 0, cnt: 0 });
      e.sale += toInt(r.청구운임); e.profit += toInt(r.청구운임) - toInt(r.기사운임); e.cnt += 1;
    });
    return Object.values(g).sort((a, b) => b.sale - a.sale).slice(0, 8);
  }, [monthRows]);

  // 요일
  const weekday = useMemo(() => {
    const W = ["일", "월", "화", "수", "목", "금", "토"].map((l) => ({ l, sale: 0, days: new Set() }));
    monthRows.forEach((r) => { const d = String(r.상차일); const w = new Date(d).getDay(); if (!isNaN(w)) { W[w].sale += toInt(r.청구운임); W[w].days.add(d); } });
    return W.map((w) => ({ label: w.l, avg: w.days.size ? Math.round(w.sale / w.days.size) : 0 }));
  }, [monthRows]);
  const bestWd = weekday.reduce((a, w) => (w.avg > a.avg ? w : a), { avg: 0, label: "-" });

  const achieve = yearTarget > 0 ? yearPureSale / yearTarget : 0;
  const elapsedYear = (() => { const s = new Date(Y, 0, 1), e = new Date(Y + 1, 0, 1), n = Math.min(Date.now(), e.getTime()); return Math.max(0, Math.min(1, (n - s) / (e - s))); })();
  const staffMax = Math.max(1, ...staff.map((s) => s.sale));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
        <Tile dark code="REVENUE" label={`${M}월 매출`} value={short(m.sale)} unit="원" foot={<><Delta cur={m.sale} prev={pm.sale} /><span>전월 같은 기간</span></>} />
        <Tile code="PROFIT" label={`${M}월 수익`} value={short(m.profit)} unit="원" foot={<><Delta cur={m.profit} prev={pm.profit} /><span>전월 같은 기간</span></>} />
        <Tile code="MARGIN" label="매익률" value={m.rate.toFixed(1)} unit="%" foot={<span>전월 <b style={{ fontFamily: MONO, color: NAVY }}>{pmAll.rate.toFixed(1)}%</b> · {(m.rate - pmAll.rate >= 0 ? "+" : "") + (m.rate - pmAll.rate).toFixed(1)}%p</span>} />
        <Tile code="ORDERS" label="오더 건수" value={m.cnt.toLocaleString()} unit="건" foot={<span>건당 <b style={{ fontFamily: MONO, color: NAVY }}>{short(m.cnt ? m.sale / m.cnt : 0)}</b>원 · <Delta cur={m.cnt} prev={pm.cnt} /></span>} />
        <Tile code="FORECAST" label="월말 예상 매출" value={isCurrent && forecast ? short(forecast.sale) : short(m.sale)} unit="원" foot={isCurrent && forecast ? <span>예상 {forecast.count.toLocaleString()}건 · 수익 {short(forecast.profit)}</span> : <span>마감된 달</span>} />
      </div>

      {/* 누적 레이스 + 목표 */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2.2fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="DAILY" title={`${M}월 일별 매출 · 누적 비교`} right={
          <div style={{ display: "flex", gap: 14, fontSize: 12.5, fontWeight: 700, color: "#4b5563" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#9FB2D6" }} />일 매출</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: NAVY }} />이번 달 누적</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, borderTop: "2px dashed #94A3B8" }} />전월 누적</span>
          </div>
        }>
          <div style={{ height: 270 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#EEF1F6" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} interval={1} tick={{ fontSize: 11, fill: "#6b7280", fontFamily: MONO }} />
                <YAxis yAxisId="d" axisLine={false} tickLine={false} width={52} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={short} />
                <YAxis yAxisId="c" orientation="right" axisLine={false} tickLine={false} width={58} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={short} />
                <Tooltip contentStyle={tipStyle} formatter={(v, n) => [v == null ? "-" : `${Number(v).toLocaleString()}원`, { sale: "일 매출", cum: "이번 달 누적", prevCum: "전월 누적", profit: "일 수익" }[n] || n]} labelFormatter={(l) => `${M}월 ${l}일`} />
                <Bar yAxisId="d" dataKey="sale" radius={[4, 4, 0, 0]} barSize={12}>
                  {daily.map((d) => <Cell key={d.day} fill={d.wkend ? "#C9D3E4" : "#9FB2D6"} />)}
                </Bar>
                <Line yAxisId="c" type="monotone" dataKey="prevCum" stroke="#94A3B8" strokeWidth={1.8} strokeDasharray="5 4" dot={false} />
                <Line yAxisId="c" type="monotone" dataKey="cum" stroke={NAVY} strokeWidth={3} dot={false} activeDot={{ r: 5, fill: "#fff", stroke: NAVY, strokeWidth: 3 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </RvCard>

        <RvCard code="TARGET" title={`${Y}년 목표 달성`}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Ring pct={achieve} label={yearTarget > 0 ? `${(achieve * 100).toFixed(1)}%` : "—"} sub={yearTarget > 0 ? "목표 대비" : "목표 미설정"} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
              {[[hasExcluded ? "순수 운송 매출" : "운송 매출", `${short(yearPureSale)}원`], ["연간 목표", yearTarget > 0 ? `${short(yearTarget)}원` : "회사관리에서 설정"], ["남은 금액", yearTarget > 0 ? `${short(Math.max(0, yearTarget - yearPureSale))}원` : "-"]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{k}</div>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "#0F1A30" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          {yearTarget > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: "#4b5563", marginBottom: 5 }}>
                <span>연도 진행 <b style={{ fontFamily: MONO }}>{(elapsedYear * 100).toFixed(0)}%</b></span>
                <span style={{ color: achieve >= elapsedYear ? NAVY : "#64748b" }}>{achieve >= elapsedYear ? "목표 페이스 이상" : "목표 페이스 미달"}</span>
              </div>
              <div style={{ position: "relative", height: 8, borderRadius: 99, background: "#E8EDF4" }}>
                <div style={{ height: "100%", width: `${Math.min(100, achieve * 100)}%`, borderRadius: 99, background: `linear-gradient(90deg,#4B6CB7,${NAVY})` }} />
                <span style={{ position: "absolute", top: -3, left: `calc(${elapsedYear * 100}% - 1px)`, width: 2, height: 14, background: "#0F1A30" }} />
              </div>
            </div>
          )}
        </RvCard>
      </div>

      {/* 월별 + 요일 */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2.2fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="MONTHLY" title={`${Y}년 월별 매출 · 매익률`}>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="rvBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2D4C82" /><stop offset="1" stopColor={NAVY} /></linearGradient></defs>
                <CartesianGrid stroke="#EEF1F6" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#4b5563", fontWeight: 700 }} />
                <YAxis yAxisId="s" axisLine={false} tickLine={false} width={60} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={short} />
                <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} width={36} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tipStyle} formatter={(v, n) => (n === "rate" ? [`${v}%`, "매익률"] : [`${Number(v).toLocaleString()}원`, "매출"])} />
                <Bar yAxisId="s" dataKey="sale" radius={[6, 6, 0, 0]} barSize={26}>
                  {monthly.map((d) => <Cell key={d.label} fill={d.on ? NAVY : "#9FB2D6"} />)}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="rate" stroke="#6E8BC4" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#6E8BC4", strokeWidth: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </RvCard>
        <RvCard code="WEEKDAY" title="요일별 평균 매출" right={<span style={{ fontSize: 12.5, fontWeight: 700, color: "#6b7280" }}>최고 <b style={{ color: NAVY }}>{bestWd.label}요일</b></span>}>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekday} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12.5, fill: "#4b5563", fontWeight: 700 }} />
                <YAxis hide />
                <Tooltip contentStyle={tipStyle} formatter={(v) => [`${Number(v).toLocaleString()}원`, "하루 평균"]} />
                <Bar dataKey="avg" radius={[6, 6, 0, 0]} barSize={22}>
                  {weekday.map((w) => <Cell key={w.label} fill={w.label === bestWd.label ? NAVY : "#9FB2D6"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </RvCard>
      </div>

      {/* 거래처 · 증감 · 담당자 */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <RvCard code="TOP 10" title={`${M}월 거래처 매출 순위`} right={<span style={{ fontSize: 12.5, fontWeight: 700, color: "#6b7280" }}>신규 거래처 <b style={{ fontFamily: MONO, color: NAVY }}>{clients.newCnt}</b>곳</span>}>
          {clients.top.length === 0 ? <div style={{ padding: "30px 0", textAlign: "center", color: "#9ca3af" }}>이 달 매출이 없습니다</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clients.top.map((c, i) => (
                <button key={c.name} type="button" onClick={() => onOpenClient?.(c.name)} style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 84px 66px", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: 0, cursor: onOpenClient ? "pointer" : "default", textAlign: "left" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: i < 3 ? NAVY : "#94A3B8" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "#0F1A30", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    <span style={{ display: "block", height: 5, borderRadius: 99, background: "#EEF1F6", marginTop: 4, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${(c.v / clients.top[0].v) * 100}%`, background: i === 0 ? NAVY : "#6E8BC4", borderRadius: 99 }} />
                    </span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: "#0F1A30", textAlign: "right" }}>{short(c.v)}<span style={{ display: "block", fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>{clients.total ? ((c.v / clients.total) * 100).toFixed(1) : 0}%</span></span>
                  <span style={{ textAlign: "right" }}><Delta cur={c.v} prev={c.p} /></span>
                </button>
              ))}
            </div>
          )}
        </RvCard>

        <RvCard code="MOVERS" title="전월 대비 증감 거래처">
          {[["늘어난 곳", clients.up], ["줄어든 곳", clients.down]].map(([t, list]) => (
            <div key={t} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#6b7280", marginBottom: 6 }}>{t}</div>
              {list.length === 0 ? <div style={{ fontSize: 13, color: "#9ca3af", padding: "4px 0 8px" }}>없음</div> : list.map((x) => (
                <div key={x.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #EEF1F6" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0F1A30", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, color: x.d >= 0 ? NAVY : "#64748b", whiteSpace: "nowrap" }}>{x.d >= 0 ? "+" : "−"}{short(Math.abs(x.d))}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "#9ca3af" }}>※ 전월 같은 기간(1일~{cutDay}일) 기준</div>
        </RvCard>

        <RvCard code="STAFF" title="담당자별 매출">
          {staff.length === 0 ? <div style={{ padding: "30px 0", textAlign: "center", color: "#9ca3af" }}>데이터 없음</div> : staff.map((s, i) => (
            <div key={s.name} style={{ padding: "6px 0", borderTop: i ? "1px solid #EEF1F6" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#0F1A30" }}><span style={{ fontFamily: MONO, color: i < 3 ? NAVY : "#94A3B8", marginRight: 7 }}>{String(i + 1).padStart(2, "0")}</span>{s.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800, color: "#0F1A30" }}>{short(s.sale)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1, height: 5, borderRadius: 99, background: "#EEF1F6", overflow: "hidden" }}><div style={{ height: "100%", width: `${(s.sale / staffMax) * 100}%`, background: i === 0 ? NAVY : "#6E8BC4" }} /></div>
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap" }}>{s.cnt}건 · {s.sale ? ((s.profit / s.sale) * 100).toFixed(1) : "0.0"}%</span>
              </div>
            </div>
          ))}
        </RvCard>
      </div>
    </div>
  );
}
