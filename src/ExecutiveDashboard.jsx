// ExecutiveDashboard.jsx — 경영 인텔리전스 대시보드 (totalMaster 전용)
import React, { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

// ─────────────────────────────────────────────────────────
//  PIN GATE
// ─────────────────────────────────────────────────────────
const PIN_KEY = "exec_intel_pin_v1";

function PinGate({ onVerified }) {
  const hasPin = !!localStorage.getItem(PIN_KEY);
  const [mode, setMode] = useState(hasPin ? "verify" : "setup1");
  const [entered, setEntered] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [animKey, setAnimKey] = useState(0);

  const bump = () => { setAnimKey(k => k + 1); setEntered(""); setError(""); };

  const handleKey = (d) => {
    if (d === "back") { setEntered(p => p.slice(0, -1)); return; }
    if (entered.length >= 6) return;
    const next = entered + d;
    setEntered(next);
    if (next.length < 6) return;

    setTimeout(() => {
      if (mode === "verify") {
        if (next === localStorage.getItem(PIN_KEY)) { onVerified(); }
        else { setError("비밀번호가 올바르지 않습니다"); bump(); }
      } else if (mode === "setup1") {
        setFirstPin(next); setEntered(""); setMode("setup2");
      } else if (mode === "setup2") {
        if (next === firstPin) { localStorage.setItem(PIN_KEY, next); onVerified(); }
        else { setError("비밀번호가 일치하지 않습니다"); setFirstPin(""); setMode("setup1"); bump(); }
      }
    }, 200);
  };

  const heading = mode === "verify" ? "보안 인증" : mode === "setup1" ? "비밀번호 설정" : "비밀번호 확인";
  const sub = mode === "verify" ? "6자리 비밀번호를 입력하세요" :
              mode === "setup1" ? "사용할 6자리 비밀번호를 입력하세요" :
              "비밀번호를 한 번 더 입력하여 확인하세요";

  return (
    <div className="min-h-[70vh] flex items-center justify-center" style={{ background: "#f4f6f9" }}>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10" style={{ width: 360 }}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1B2B4B] rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-lg">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-gray-300 uppercase mb-1.5">CONFIDENTIAL</div>
          <h2 className="text-[20px] font-extrabold text-[#1B2B4B]">{heading}</h2>
          <p className="text-[13px] text-gray-400 mt-2">{sub}</p>
        </div>

        <div key={animKey} className="flex justify-center gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-full border-2 transition-all duration-150"
              style={{ background: i < entered.length ? "#1B2B4B" : "white", borderColor: i < entered.length ? "#1B2B4B" : "#d1d5db" }} />
          ))}
        </div>

        {error && <div className="text-center text-[12px] text-red-500 font-semibold mb-4 bg-red-50 rounded-lg py-2">{error}</div>}

        <div className="grid grid-cols-3 gap-2.5">
          {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((d, i) => (
            <button key={i}
              onClick={() => d !== null && handleKey(d === "←" ? "back" : String(d))}
              disabled={d === null}
              className="h-[52px] rounded-xl text-[18px] font-semibold transition-all select-none"
              style={{
                cursor: d === null ? "default" : "pointer",
                opacity: d === null ? 0 : 1,
                background: d === "←" ? "#f3f4f6" : "#f8f9fb",
                color: d === "←" ? "#6b7280" : "#1B2B4B",
                border: "1px solid #e5e7eb",
                fontSize: d === "←" ? 15 : 18,
              }}
            >{d}</button>
          ))}
        </div>

        {mode === "verify" && (
          <button onClick={() => { localStorage.removeItem(PIN_KEY); setMode("setup1"); setEntered(""); setError(""); setFirstPin(""); }}
            className="w-full mt-5 text-center text-[12px] text-gray-300 hover:text-gray-500 transition">
            비밀번호를 잊으셨나요? — 재설정
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────
function toInt(v) { return parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0; }
function fmtW(v) {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억원`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}백만원`;
  if (v >= 1e4) return `${Math.round(v / 1e4)}만원`;
  return `${v.toLocaleString()}원`;
}
function fmtPct(a, b) { return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—"; }

function getYM(dateStr) { return dateStr?.slice(0, 7) ?? ""; }
function getY(dateStr) { return dateStr?.slice(0, 4) ?? ""; }

// ─────────────────────────────────────────────────────────
//  SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, primary }) {
  const up = trend >= 0;
  return (
    <div className="rounded-xl border p-5 flex flex-col justify-between" style={{ background: primary ? "#1B2B4B" : "white", borderColor: primary ? "#1B2B4B" : "#e5e7eb" }}>
      <div className="text-[12px] font-semibold mb-2" style={{ color: primary ? "rgba(255,255,255,0.5)" : "#9ca3af" }}>{label}</div>
      <div className="text-[24px] font-black leading-none" style={{ color: primary ? "white" : "#1B2B4B" }}>{value}</div>
      {sub && <div className="text-[12px] mt-1.5" style={{ color: primary ? "rgba(255,255,255,0.4)" : "#9ca3af" }}>{sub}</div>}
      {trend !== undefined && (
        <div className="text-[12px] font-semibold mt-2" style={{ color: up ? "#10b981" : "#ef4444" }}>
          {up ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}% 전월 대비
        </div>
      )}
    </div>
  );
}

function Card({ title, subtitle, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-50 flex items-baseline justify-between">
          <div className="text-[14px] font-bold text-[#1B2B4B]">{title}</div>
          {subtitle && <div className="text-[12px] text-gray-400">{subtitle}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function DataRow({ label, value, sub, barPct, rank }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-b-0">
      {rank !== undefined && (
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
          style={{ background: rank < 3 ? "#1B2B4B" : "#f3f4f6", color: rank < 3 ? "white" : "#6b7280" }}>
          {rank + 1}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-gray-800 truncate">{label}</span>
          <span className="text-[13px] font-bold text-[#1B2B4B] whitespace-nowrap flex-shrink-0">{value}</span>
        </div>
        {barPct !== undefined && (
          <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-[#1B2B4B] transition-all duration-700" style={{ width: `${barPct}%`, opacity: Math.max(0.3, 1 - rank * 0.1) }} />
          </div>
        )}
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function InsightBlock({ level, title, body }) {
  const colors = { info: { bg: "#f0f4f9", border: "#1B2B4B", dot: "#1B2B4B" }, warn: { bg: "#fdf8f0", border: "#b45309", dot: "#d97706" }, good: { bg: "#f0faf4", border: "#065f46", dot: "#059669" } };
  const c = colors[level] || colors.info;
  return (
    <div className="rounded-xl border-l-4 p-4" style={{ background: c.bg, borderLeftColor: c.border }}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.dot }} />
        <span className="text-[13px] font-bold" style={{ color: c.border }}>{title}</span>
      </div>
      <div className="text-[13px] text-gray-600 leading-relaxed pl-4">{body}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  TAB: 종합 개요
// ─────────────────────────────────────────────────────────
function OverviewTab({ data }) {
  const now = new Date();
  const cyStr = String(now.getFullYear());
  const lyStr = String(now.getFullYear() - 1);
  const cm = String(now.getMonth() + 1).padStart(2, "0");
  const pm = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0");
  const pmY = String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const cmPrefix = `${cyStr}-${cm}`;
  const pmPrefix = `${pmY}-${pm}`;

  const thisMonth = data.filter(d => getYM(d.상차일) === cmPrefix);
  const lastMonth = data.filter(d => getYM(d.상차일) === pmPrefix);
  const thisYear = data.filter(d => getY(d.상차일) === cyStr);
  const lastYear = data.filter(d => getY(d.상차일) === lyStr);

  const tmRev = thisMonth.reduce((s, d) => s + toInt(d.청구운임), 0);
  const lmRev = lastMonth.reduce((s, d) => s + toInt(d.청구운임), 0);
  const tyRev = thisYear.reduce((s, d) => s + toInt(d.청구운임), 0);
  const tyCost = thisYear.reduce((s, d) => s + toInt(d.기사운임), 0);
  const lyRev = lastYear.reduce((s, d) => s + toInt(d.청구운임), 0);
  const marginRate = tyRev > 0 ? ((tyRev - tyCost) / tyRev * 100) : 0;
  const tmTrend = lmRev > 0 ? ((tmRev - lmRev) / lmRev * 100) : 0;
  const yoyTrend = lyRev > 0 ? ((tyRev - lyRev) / lyRev * 100) : 0;

  const monthly12 = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const rows = data.filter(x => getYM(x.상차일) === prefix);
      return {
        month: `${String(d.getMonth() + 1).padStart(2, "0")}월`,
        매출: rows.reduce((s, x) => s + toInt(x.청구운임), 0),
        수익: rows.reduce((s, x) => s + toInt(x.청구운임) - toInt(x.기사운임), 0),
        건수: rows.length,
      };
    });
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard primary label="연간 누적 매출" value={fmtW(tyRev)} sub={`${cyStr}년 기준`} trend={yoyTrend} />
        <KpiCard label="이번 달 매출" value={fmtW(tmRev)} sub={`${cyStr}.${cm}`} trend={tmTrend} />
        <KpiCard label="연간 마진율" value={`${marginRate.toFixed(1)}%`} sub={`수익 ${fmtW(tyRev - tyCost)}`} />
        <KpiCard label="전체 오더" value={`${thisYear.length}건`} sub={`누적 ${data.length}건`} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="월별 매출 추이" subtitle="최근 12개월" className="col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthly12} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e4 ? `${(v/1e4).toFixed(0)}만` : v} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v, n) => [v.toLocaleString() + "원", n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Line type="monotone" dataKey="매출" stroke="#1B2B4B" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="수익" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="전월 대비" subtitle={`${pmY}.${pm} → ${cyStr}.${cm}`}>
          <div className="space-y-5">
            {[
              { label: "매출", curr: tmRev, prev: lmRev },
              { label: "오더 건수", curr: thisMonth.length, prev: lastMonth.length },
              { label: "수익", curr: thisMonth.reduce((s,d)=>s+toInt(d.청구운임)-toInt(d.기사운임),0), prev: lastMonth.reduce((s,d)=>s+toInt(d.청구운임)-toInt(d.기사운임),0) },
            ].map(({ label, curr, prev }) => {
              const pct = prev > 0 ? ((curr - prev) / prev * 100) : 0;
              const up = curr >= prev;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold text-gray-500">{label}</span>
                    <span className="text-[12px] font-bold" style={{ color: up ? "#059669" : "#ef4444" }}>
                      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[15px] font-extrabold text-[#1B2B4B]">{typeof curr === "number" && curr > 100 ? fmtW(curr) : `${curr}건`}</div>
                  <div className="text-[11px] text-gray-400">전월 {typeof prev === "number" && prev > 100 ? fmtW(prev) : `${prev}건`}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="월별 상세 실적표" subtitle={`${cyStr}년`}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                {["월","오더","총 매출","기사 운임","수익","마진율","전월 대비"].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 font-semibold text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly12.slice().reverse().map((row, i, arr) => {
                const margin = row.매출 > 0 ? (row.수익 / row.매출 * 100) : 0;
                const prevRow = arr[i + 1];
                const momChg = prevRow?.매출 > 0 ? ((row.매출 - prevRow.매출) / prevRow.매출 * 100) : null;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f9fafb" }} className="hover:bg-gray-50/50 transition">
                    <td className="py-2.5 px-3 font-bold text-[#1B2B4B]">{row.month}</td>
                    <td className="py-2.5 px-3 font-semibold text-gray-700">{row.건수}건</td>
                    <td className="py-2.5 px-3 font-semibold text-gray-900">{row.매출.toLocaleString()}원</td>
                    <td className="py-2.5 px-3 text-gray-500">{(row.매출 - row.수익).toLocaleString()}원</td>
                    <td className="py-2.5 px-3 font-semibold text-[#1B2B4B]">{row.수익.toLocaleString()}원</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "#f0f4f9", color: "#1B2B4B" }}>{margin.toFixed(1)}%</span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[13px]" style={{ color: momChg === null ? "#d1d5db" : momChg >= 0 ? "#059669" : "#ef4444" }}>
                      {momChg === null ? "—" : `${momChg >= 0 ? "▲" : "▼"}${Math.abs(momChg).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  TAB: 매출 분석
// ─────────────────────────────────────────────────────────
function RevenueTab({ data }) {
  const now = new Date();
  const cyStr = String(now.getFullYear());
  const lyStr = String(now.getFullYear() - 1);
  const cy = data.filter(d => getY(d.상차일) === cyStr);
  const ly = data.filter(d => getY(d.상차일) === lyStr);

  const yoyChart = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const mo = String(i + 1).padStart(2, "0");
    const cyRows = cy.filter(d => d.상차일?.startsWith(`${cyStr}-${mo}`));
    const lyRows = ly.filter(d => d.상차일?.startsWith(`${lyStr}-${mo}`));
    return {
      month: `${mo}월`,
      올해: cyRows.reduce((s, d) => s + toInt(d.청구운임), 0),
      전년: lyRows.reduce((s, d) => s + toInt(d.청구운임), 0),
      올해수익: cyRows.reduce((s, d) => s + toInt(d.청구운임) - toInt(d.기사운임), 0),
    };
  }), [data]);

  const payMap = useMemo(() => {
    const m = {};
    data.forEach(d => { const k = d.지급방식 || "미설정"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const totalPay = payMap.reduce((s, [, v]) => s + v, 0);

  const cyRev = cy.reduce((s, d) => s + toInt(d.청구운임), 0);
  const lyRev = ly.reduce((s, d) => s + toInt(d.청구운임), 0);
  const cyCost = cy.reduce((s, d) => s + toInt(d.기사운임), 0);
  const lyMarginR = lyRev > 0 ? ((lyRev - ly.reduce((s, d) => s + toInt(d.기사운임), 0)) / lyRev * 100) : 0;
  const cyMarginR = cyRev > 0 ? ((cyRev - cyCost) / cyRev * 100) : 0;
  const yoy = lyRev > 0 ? ((cyRev - lyRev) / lyRev * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard primary label="올해 누적 매출" value={fmtW(cyRev)} sub={cyStr} />
        <KpiCard label="전년 누적 매출" value={fmtW(lyRev)} sub={lyStr} />
        <KpiCard label="YoY 성장률" value={`${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`} sub="전년 대비" trend={yoy} />
        <KpiCard label="올해 마진율" value={`${cyMarginR.toFixed(1)}%`} sub={`전년 ${lyMarginR.toFixed(1)}%`} />
      </div>

      <Card title="연도별 월간 매출 비교" subtitle={`${lyStr} vs ${cyStr}`}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={yoyChart} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e4 ? `${(v/1e4).toFixed(0)}만` : v} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} />
            <Tooltip formatter={(v) => [v.toLocaleString() + "원"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="전년" fill="#d1d5db" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar dataKey="올해" fill="#1B2B4B" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card title="지급방식별 건수 분포" subtitle="전체 기간">
          <div className="space-y-2">
            {payMap.map(([label, cnt], i) => (
              <DataRow key={label} rank={i} label={label} value={`${cnt}건`} sub={fmtPct(cnt, totalPay)}
                barPct={Math.round(cnt / (payMap[0]?.[1] || 1) * 100)} />
            ))}
          </div>
        </Card>

        <Card title="올해 수익 월별 추이" subtitle="청구운임 - 기사운임">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={yoyChart} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e4 ? `${(v/1e4).toFixed(0)}만` : v} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v) => [v.toLocaleString() + "원", "수익"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Line type="monotone" dataKey="올해수익" stroke="#1B2B4B" strokeWidth={2.5} dot={{ r: 3, fill: "#1B2B4B" }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  TAB: 거래처 분석
// ─────────────────────────────────────────────────────────
function ClientTab({ data }) {
  const clients = useMemo(() => {
    const m = {};
    data.forEach(d => {
      const k = d.거래처명?.trim();
      if (!k) return;
      m[k] = m[k] || { count: 0, revenue: 0, profit: 0 };
      m[k].count++;
      m[k].revenue += toInt(d.청구운임);
      m[k].profit += toInt(d.청구운임) - toInt(d.기사운임);
    });
    return Object.entries(m)
      .map(([name, v]) => ({ name, ...v, margin: v.revenue > 0 ? (v.profit / v.revenue * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const totalRev = clients.reduce((s, c) => s + c.revenue, 0);
  const top5Rev = clients.slice(0, 5).reduce((s, c) => s + c.revenue, 0);
  const top5Pct = totalRev > 0 ? (top5Rev / totalRev * 100) : 0;
  const chartData = clients.slice(0, 10).map(c => ({ name: c.name, 매출: c.revenue }));
  const maxRev = clients[0]?.revenue || 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard primary label="등록 거래처" value={`${clients.length}곳`} />
        <KpiCard label="Top5 집중도" value={`${top5Pct.toFixed(1)}%`} sub={fmtW(top5Rev)} />
        <KpiCard label="거래처 평균 매출" value={fmtW(clients.length > 0 ? Math.round(totalRev / clients.length) : 0)} />
        <KpiCard label="총 거래 건수" value={`${data.length}건`} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="매출 Top 10 거래처" subtitle="전체 기간 누적">
          <div className="space-y-1">
            {clients.slice(0, 10).map((c, i) => (
              <DataRow key={c.name} rank={i} label={c.name}
                value={fmtW(c.revenue)}
                sub={`${c.count}건 · 마진 ${c.margin.toFixed(1)}%`}
                barPct={Math.round(c.revenue / maxRev * 100)} />
            ))}
          </div>
        </Card>

        <Card title="오더 건수 Top 10" subtitle="전체 기간">
          <div className="space-y-1">
            {[...clients].sort((a, b) => b.count - a.count).slice(0, 10).map((c, i, arr) => (
              <DataRow key={c.name} rank={i} label={c.name}
                value={`${c.count}건`}
                sub={`매출 ${fmtW(c.revenue)}`}
                barPct={Math.round(c.count / (arr[0]?.count || 1) * 100)} />
            ))}
          </div>
        </Card>
      </div>

      <Card title="거래처 매출 분포 (Top 10)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 60, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e4 ? `${(v/1e4).toFixed(0)}만` : v} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#374151" }} axisLine={false} tickLine={false} width={75} />
            <Tooltip formatter={(v) => [v.toLocaleString() + "원", "매출"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Bar dataKey="매출" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {chartData.map((_, i) => <Cell key={i} fill="#1B2B4B" opacity={Math.max(0.35, 1 - i * 0.065)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  TAB: 기사·차량 분석
// ─────────────────────────────────────────────────────────
function DriverTab({ data }) {
  const drivers = useMemo(() => {
    const m = {};
    data.forEach(d => {
      const k = d.이름?.trim();
      if (!k) return;
      m[k] = m[k] || { count: 0, pay: 0, plate: d.차량번호 || "" };
      m[k].count++;
      m[k].pay += toInt(d.기사운임);
    });
    return Object.entries(m)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const vehicles = useMemo(() => {
    const m = {};
    data.forEach(d => { const k = d.차량종류?.trim() || "미분류"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const tonnage = useMemo(() => {
    const m = {};
    data.forEach(d => { const k = d.차량톤수?.trim() || "미분류"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const totalCount = data.filter(d => d.이름?.trim()).length;
  const maxCount = drivers[0]?.count || 1;
  const maxPay = [...drivers].sort((a, b) => b.pay - a.pay)[0]?.pay || 1;
  const vMax = vehicles[0]?.[1] || 1;
  const tMax = tonnage[0]?.[1] || 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard primary label="등록 기사 수" value={`${drivers.length}명`} />
        <KpiCard label="1위 기사 건수" value={`${drivers[0]?.count || 0}건`} sub={drivers[0]?.name || "—"} />
        <KpiCard label="평균 기사운임" value={fmtW(drivers.length > 0 ? Math.round(drivers.reduce((s, d) => s + d.pay, 0) / drivers.length) : 0)} />
        <KpiCard label="차량 유형 수" value={`${vehicles.length}종`} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="운행 건수 Top 10 기사" subtitle="전체 기간">
          <div className="space-y-1">
            {drivers.slice(0, 10).map((d, i) => (
              <DataRow key={d.name} rank={i} label={d.name}
                value={`${d.count}건`}
                sub={`운임 ${fmtW(d.pay)} · ${d.plate || "번호 없음"}`}
                barPct={Math.round(d.count / maxCount * 100)} />
            ))}
          </div>
        </Card>

        <Card title="운임 지급액 Top 10 기사" subtitle="전체 기간">
          <div className="space-y-1">
            {[...drivers].sort((a, b) => b.pay - a.pay).slice(0, 10).map((d, i) => (
              <DataRow key={d.name} rank={i} label={d.name}
                value={fmtW(d.pay)}
                sub={`${d.count}건 · ${d.plate || "번호 없음"}`}
                barPct={Math.round(d.pay / maxPay * 100)} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="차량 유형별 운행 건수">
          <div className="space-y-1">
            {vehicles.map(([label, cnt], i) => (
              <DataRow key={label} rank={i} label={label} value={`${cnt}건`}
                sub={fmtPct(cnt, data.length)}
                barPct={Math.round(cnt / vMax * 100)} />
            ))}
          </div>
        </Card>

        <Card title="차량 톤수별 분포">
          <div className="space-y-1">
            {tonnage.map(([label, cnt], i) => (
              <DataRow key={label} rank={i} label={label} value={`${cnt}건`}
                sub={fmtPct(cnt, data.length)}
                barPct={Math.round(cnt / tMax * 100)} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  TAB: 운영 지표
// ─────────────────────────────────────────────────────────
function OperationsTab({ data }) {
  const now = new Date();
  const cyStr = String(now.getFullYear());

  const dispatchMethods = useMemo(() => {
    const m = {};
    data.forEach(d => { const k = d.배차방식?.trim() || "미설정"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const statuses = useMemo(() => {
    const m = {};
    data.forEach(d => { const k = d.배차상태?.trim() || "미설정"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const routes = useMemo(() => {
    const m = {};
    data.forEach(d => {
      const from = d.상차지명?.trim() || "";
      const to = d.하차지명?.trim() || "";
      if (!from || !to) return;
      const key = `${from} → ${to}`;
      m[key] = (m[key] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [data]);

  const unassigned = data.filter(d => !d.차량번호?.trim() && !d.이름?.trim()).length;
  const urgent = data.filter(d => d.긴급).length;
  const roundTrip = data.filter(d => d.운행유형 === "왕복").length;
  const mixed = data.filter(d => d.혼적).length;
  const dMax = dispatchMethods[0]?.[1] || 1;
  const rMax = routes[0]?.[1] || 1;

  const monthlyCount = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: `${String(d.getMonth() + 1).padStart(2, "0")}월`,
      건수: data.filter(x => getYM(x.상차일) === prefix).length,
    };
  }), [data]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard primary label="전체 오더" value={`${data.length}건`} />
        <KpiCard label="미배차" value={`${unassigned}건`} sub={fmtPct(unassigned, data.length)} />
        <KpiCard label="긴급 오더" value={`${urgent}건`} sub={fmtPct(urgent, data.length)} />
        <KpiCard label="왕복 / 혼적" value={`${roundTrip}건 / ${mixed}건`} sub="운행유형 기준" />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card title="배차 방식별 분포" subtitle="전체 기간">
          <div className="space-y-1">
            {dispatchMethods.map(([label, cnt], i) => (
              <DataRow key={label} rank={i} label={label} value={`${cnt}건`}
                sub={fmtPct(cnt, data.length)}
                barPct={Math.round(cnt / dMax * 100)} />
            ))}
          </div>
        </Card>

        <Card title="배차 상태 분포" subtitle="전체 기간">
          <div className="space-y-1">
            {statuses.map(([label, cnt], i) => (
              <DataRow key={label} rank={i} label={label} value={`${cnt}건`}
                sub={fmtPct(cnt, data.length)}
                barPct={Math.round(cnt / (statuses[0]?.[1] || 1) * 100)} />
            ))}
          </div>
        </Card>

        <Card title="주요 운송 경로 Top 10">
          <div className="space-y-1">
            {routes.map(([route, cnt], i) => (
              <DataRow key={route} rank={i} label={route} value={`${cnt}건`}
                barPct={Math.round(cnt / rMax * 100)} />
            ))}
          </div>
        </Card>
      </div>

      <Card title="월별 오더 건수 추이" subtitle="최근 12개월">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={monthlyCount} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} />
            <Tooltip formatter={(v) => [v + "건", "오더 건수"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Bar dataKey="건수" fill="#1B2B4B" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {monthlyCount.map((_, i) => <Cell key={i} fill="#1B2B4B" opacity={0.5 + (i / monthlyCount.length) * 0.5} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  TAB: AI 인사이트
// ─────────────────────────────────────────────────────────
function InsightsTab({ data }) {
  const now = new Date();
  const cy = String(now.getFullYear());
  const cm = String(now.getMonth() + 1).padStart(2, "0");
  const pm = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0");
  const pmY = String(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

  const insights = useMemo(() => {
    const result = [];
    if (!data.length) return result;

    const tmRows = data.filter(d => d.상차일?.startsWith(`${cy}-${cm}`));
    const lmRows = data.filter(d => d.상차일?.startsWith(`${pmY}-${pm}`));
    const cyRows = data.filter(d => getY(d.상차일) === cy);
    const tmRev = tmRows.reduce((s, d) => s + toInt(d.청구운임), 0);
    const lmRev = lmRows.reduce((s, d) => s + toInt(d.청구운임), 0);
    const cyRev = cyRows.reduce((s, d) => s + toInt(d.청구운임), 0);
    const cyCost = cyRows.reduce((s, d) => s + toInt(d.기사운임), 0);
    const unassigned = data.filter(d => !d.차량번호?.trim() && !d.이름?.trim());

    // 1. 전월 대비 매출
    if (lmRev > 0) {
      const chg = ((tmRev - lmRev) / lmRev * 100);
      result.push({
        level: chg >= 5 ? "good" : chg <= -10 ? "warn" : "info",
        title: `${cm}월 매출 전월 대비 ${chg >= 0 ? "상승" : "하락"}`,
        body: `이번 달 누적 매출 ${tmRev.toLocaleString()}원 — 전월(${lmRev.toLocaleString()}원) 대비 ${Math.abs(chg).toFixed(1)}% ${chg >= 0 ? "증가했습니다." : "감소했습니다."} ${chg <= -10 ? "매출 하락 원인을 파악하고 주요 거래처 유지 전략이 필요합니다." : chg >= 15 ? "매출 성과가 우수합니다. 이 흐름을 유지하기 위한 거래처 관리가 중요합니다." : ""}`,
      });
    }

    // 2. 마진율 분석
    const marginR = cyRev > 0 ? (cyRev - cyCost) / cyRev * 100 : 0;
    result.push({
      level: marginR >= 20 ? "good" : marginR >= 10 ? "info" : "warn",
      title: `연간 마진율 ${marginR.toFixed(1)}%`,
      body: `올해 수익 ${(cyRev - cyCost).toLocaleString()}원으로 마진율 ${marginR.toFixed(1)}%. ${marginR >= 20 ? "높은 수익성을 유지 중입니다." : marginR >= 10 ? "양호한 수준이나 운임 단가 최적화로 개선 여지가 있습니다." : "수수료율이 낮습니다. 청구운임 단가 검토를 권장합니다."}`,
    });

    // 3. 거래처 집중도
    const clientMap = {};
    data.forEach(d => { const k = d.거래처명?.trim(); if (k) { clientMap[k] = (clientMap[k] || 0) + toInt(d.청구운임); } });
    const sortedClients = Object.entries(clientMap).sort((a, b) => b[1] - a[1]);
    const totalRev = sortedClients.reduce((s, [, v]) => s + v, 0);
    const top3Rev = sortedClients.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    const top3Pct = totalRev > 0 ? (top3Rev / totalRev * 100) : 0;
    const top3Names = sortedClients.slice(0, 3).map(([n]) => n).join(", ");
    result.push({
      level: top3Pct >= 60 ? "warn" : top3Pct >= 40 ? "info" : "good",
      title: `상위 3개 거래처 집중도 ${top3Pct.toFixed(1)}%`,
      body: `${top3Names} 3곳이 전체 매출의 ${top3Pct.toFixed(1)}%를 차지합니다. ${top3Pct >= 60 ? "특정 거래처 의존도가 높아 계약 종료 리스크에 노출될 수 있습니다. 신규 거래처 발굴을 권장합니다." : top3Pct >= 40 ? "적정 수준의 집중도입니다. 균형 잡힌 포트폴리오 유지를 권장합니다." : "거래처가 잘 분산되어 있어 리스크가 낮습니다."}`,
    });

    // 4. 미배차 현황
    if (unassigned.length > 0) {
      const unPct = (unassigned.length / data.length * 100);
      result.push({
        level: unPct >= 10 ? "warn" : "info",
        title: `미배차 오더 ${unassigned.length}건 (${unPct.toFixed(1)}%)`,
        body: `전체 오더 중 ${unassigned.length}건이 차량번호 또는 기사명이 미등록된 상태입니다. ${unPct >= 10 ? "미배차율이 높습니다. 배차 프로세스 점검이 필요합니다." : "미배차 오더를 확인하고 배차를 완료해 주세요."}`,
      });
    }

    // 5. 성수기 분석
    const monthlyRev = {};
    data.forEach(d => {
      const m = getYM(d.상차일);
      if (m) { monthlyRev[m] = (monthlyRev[m] || 0) + toInt(d.청구운임); }
    });
    const sortedMonths = Object.entries(monthlyRev).sort((a, b) => b[1] - a[1]);
    if (sortedMonths.length >= 3) {
      const topMonth = sortedMonths[0];
      const lowMonth = sortedMonths[sortedMonths.length - 1];
      result.push({
        level: "info",
        title: `성수기·비수기 패턴 분석`,
        body: `최고 매출 월: ${topMonth[0]} (${topMonth[1].toLocaleString()}원) / 최저 매출 월: ${lowMonth[0]} (${lowMonth[1].toLocaleString()}원). 계절 패턴에 맞춰 비수기 신규 거래처 유치 전략을 수립하세요.`,
      });
    }

    // 6. 최우수 기사
    const driverMap = {};
    data.forEach(d => {
      const k = d.이름?.trim();
      if (!k) return;
      driverMap[k] = driverMap[k] || { count: 0, pay: 0 };
      driverMap[k].count++;
      driverMap[k].pay += toInt(d.기사운임);
    });
    const topDrivers = Object.entries(driverMap).sort((a, b) => b[1].count - a[1].count).slice(0, 3);
    if (topDrivers.length > 0) {
      result.push({
        level: "info",
        title: `핵심 기사 현황`,
        body: `상위 3인 기사: ${topDrivers.map(([n, v]) => `${n}(${v.count}건, ${v.pay.toLocaleString()}원)`).join(" / ")}. 핵심 기사와의 장기 관계 유지가 안정적 운영에 중요합니다.`,
      });
    }

    // 7. 배차방식 분석
    const dispMap = {};
    data.forEach(d => { const k = d.배차방식?.trim() || "미설정"; dispMap[k] = (dispMap[k] || 0) + 1; });
    const sortedDisp = Object.entries(dispMap).sort((a, b) => b[1] - a[1]);
    if (sortedDisp.length > 1) {
      const top = sortedDisp[0];
      result.push({
        level: "info",
        title: `배차 방식 현황`,
        body: `주요 배차 방식: "${top[0]}" ${top[1]}건 (${fmtPct(top[1], data.length)}). ${sortedDisp.length > 1 ? `그 외 ${sortedDisp.slice(1).map(([k, v]) => `${k}: ${v}건`).join(", ")}.` : ""} 배차 방식별 수익성을 정기적으로 비교 분석하세요.`,
      });
    }

    // 8. 성장률 전망
    const last6 = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return data.filter(x => getYM(x.상차일) === prefix).reduce((s, x) => s + toInt(x.청구운임), 0);
    }).filter(v => v > 0);
    if (last6.length >= 3) {
      const trend6 = last6.length > 1 ? (last6[last6.length - 1] - last6[0]) / last6[0] * 100 : 0;
      result.push({
        level: trend6 >= 10 ? "good" : trend6 <= -10 ? "warn" : "info",
        title: `최근 6개월 추세: ${trend6 >= 0 ? "상승" : "하락"} 기조`,
        body: `최근 6개월 매출 기준 ${Math.abs(trend6).toFixed(1)}% ${trend6 >= 0 ? "성장" : "감소"} 추세입니다. ${trend6 >= 10 ? "지속 성장을 위한 운영 역량 강화와 기사 확보가 필요합니다." : trend6 <= -10 ? "매출 감소 원인 분석 후 주요 거래처와 재계약 협의를 권장합니다." : "안정적인 기조를 유지하고 있습니다."}`,
      });
    }

    return result;
  }, [data]);

  const now2 = new Date();
  const genTime = `${now2.getFullYear()}.${String(now2.getMonth()+1).padStart(2,"0")}.${String(now2.getDate()).padStart(2,"0")} ${String(now2.getHours()).padStart(2,"0")}:${String(now2.getMinutes()).padStart(2,"0")}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] font-bold text-[#1B2B4B]">AI 데이터 분석 리포트</div>
          <div className="text-[12px] text-gray-400 mt-0.5">전체 {data.length}건의 배차 데이터 기반 자동 분석</div>
        </div>
        <div className="text-[12px] text-gray-400 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg">
          생성 시각: {genTime}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {insights.map((ins, i) => (
          <InsightBlock key={i} level={ins.level} title={ins.title} body={ins.body} />
        ))}
        {insights.length === 0 && (
          <div className="col-span-2 text-center py-16 text-gray-300 text-[14px]">분석할 데이터가 없습니다</div>
        )}
      </div>

      <div className="bg-[#f4f6f9] rounded-xl border border-gray-100 p-5">
        <div className="text-[12px] font-bold text-gray-400 mb-1">분석 기준 안내</div>
        <div className="text-[12px] text-gray-400 leading-relaxed">
          본 리포트는 등록된 배차 데이터를 기반으로 자동 생성됩니다. 마진율은 (청구운임 - 기사운임) / 청구운임으로 계산되며, 기타 비용(유류비, 보험료 등)은 포함되지 않습니다. 전략적 의사결정 시 실제 원가 구조를 추가로 반영하세요.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",    label: "종합 개요"   },
  { id: "revenue",     label: "매출 분석"   },
  { id: "client",      label: "거래처 분석" },
  { id: "driver",      label: "기사·차량"   },
  { id: "operations",  label: "운영 지표"   },
  { id: "insights",    label: "AI 인사이트" },
];

export default function ExecutiveDashboard({ dispatchData = [] }) {
  const [verified, setVerified] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  if (!verified) return <PinGate onVerified={() => setVerified(true)} />;

  return (
    <div style={{ minHeight: "80vh", background: "#f4f6f9" }}>
      {/* ── 헤더 ── */}
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-start justify-between rounded-t-xl mb-0">
        <div>
          <div className="text-[10px] font-bold tracking-[0.25em] text-white/30 uppercase mb-1">CONFIDENTIAL — EXECUTIVE USE ONLY</div>
          <h1 className="text-[18px] font-extrabold text-white">경영 인텔리전스 대시보드</h1>
          <div className="text-[12px] text-white/40 mt-0.5">전체 {dispatchData.length.toLocaleString()}건 배차 데이터 기반</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[12px] text-white/40">
            {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
          </div>
          <button onClick={() => setVerified(false)}
            className="text-[11px] text-white/25 hover:text-white/60 mt-1 transition block">
            잠금
          </button>
        </div>
      </div>

      {/* ── 탭 ── */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className="px-5 py-3.5 text-[13px] font-semibold border-b-2 transition whitespace-nowrap"
              style={{
                borderBottomColor: activeTab === t.id ? "#1B2B4B" : "transparent",
                color: activeTab === t.id ? "#1B2B4B" : "#9ca3af",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 콘텐츠 ── */}
      <div className="p-6">
        {activeTab === "overview"   && <OverviewTab    data={dispatchData} />}
        {activeTab === "revenue"    && <RevenueTab     data={dispatchData} />}
        {activeTab === "client"     && <ClientTab      data={dispatchData} />}
        {activeTab === "driver"     && <DriverTab      data={dispatchData} />}
        {activeTab === "operations" && <OperationsTab  data={dispatchData} />}
        {activeTab === "insights"   && <InsightsTab    data={dispatchData} />}
      </div>
    </div>
  );
}
