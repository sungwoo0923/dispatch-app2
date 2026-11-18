// ======================= src/adminCenter/admUi.jsx =======================
// 🛰 2026-11-18 관리자센터 리디자인 — 공용 부품(어두운 디지털 + 샴페인 골드, 대표/임원 화면과 같은 결)
//  · 색: 바탕 #05080F → #0E1A33, 포인트 골드 #D7BC82, 보조 아이스 #8FB0F0
//  · 숫자는 tabular-nums, 영문 코드는 넓은 자간 — 홈 관제 데크(HomeDeck)와 같은 문법
//  · ADM_CSS 는 관리자센터 안에서만 적용된다(.kp-adm). 예전 밝은 화면(흰 카드 · 남색 글씨)도
//    본문(.adm-main) 안에서는 같은 어두운 톤으로 바꿔 보여준다 — 데이터 · 동작은 그대로.
import React from "react";

export const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const NUM = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
export const G = {
  gold: "#D7BC82", goldHi: "#F3E3BC", goldDim: "rgba(215,188,130,.62)", goldLine: "rgba(215,188,130,.18)", goldInk: "#1A1405",
  ice: "#8FB0F0", iceHi: "#CFE0FF", iceDim: "rgba(143,176,240,.55)",
  ink: "#EEF2FA", sub: "rgba(226,232,245,.78)", dim: "rgba(201,213,236,.58)", line: "rgba(215,188,130,.14)", line2: "rgba(143,176,240,.12)",
  bad: "#FF8A7A", warn: "#F2C46D", ok: "#7FD1AE",
  panel: "#0C1529", panel2: "#111C34", base: "#070C18",
};
export const GOLD_BTN = { background: "linear-gradient(180deg,#F3E3BC 0%,#D7BC82 100%)", color: G.goldInk };

export const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
export const short = (n) => {
  const v = Number(n) || 0; const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
  return Math.round(v).toLocaleString();
};
export const compact = (n) => {
  const v = Number(n) || 0; const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
};
export const pad2 = (n) => String(n).padStart(2, "0");
export const kstNow = () => new Date(Date.now() + 9 * 3600e3);
export const kstToday = () => kstNow().toISOString().slice(0, 10);

// ─── 시계 ───
export function AdmClock({ big = false }) {
  const [t, setT] = React.useState(() => kstNow());
  React.useEffect(() => { const i = setInterval(() => setT(kstNow()), 1000); return () => clearInterval(i); }, []);
  return (
    <span className="whitespace-nowrap" style={{ ...NUM, fontSize: big ? 34 : 14, fontWeight: 800, color: "#fff", letterSpacing: "0.04em", lineHeight: 1 }}>
      {pad2(t.getUTCHours())}<span className="adm-colon" style={{ color: G.gold }}>:</span>{pad2(t.getUTCMinutes())}
      <span style={{ fontSize: big ? 17 : 12, color: G.dim, marginLeft: 3 }}>{pad2(t.getUTCSeconds())}</span>
    </span>
  );
}

// ─── 살아 있음 점 ───
export function LivePulse({ color = G.gold, size = 8 }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: color, opacity: 0.55 }} />
      <span className="relative rounded-full" style={{ width: size, height: size, background: color, boxShadow: `0 0 10px ${color}` }} />
    </span>
  );
}

// ─── 추정치 표시 ───
export function EstTag({ children = "추정", title }) {
  return <span title={title} className="inline-flex items-center h-[18px] px-1.5 rounded-[5px] text-[10.5px] font-black whitespace-nowrap align-middle" style={{ color: G.warn, border: `1px solid rgba(242,196,109,.4)`, background: "rgba(242,196,109,.08)" }}>{children}</span>;
}
export function RealTag({ children = "실측" }) {
  return <span className="inline-flex items-center h-[18px] px-1.5 rounded-[5px] text-[10.5px] font-black whitespace-nowrap align-middle" style={{ color: G.ok, border: "1px solid rgba(127,209,174,.4)", background: "rgba(127,209,174,.08)" }}>{children}</span>;
}

// ─── 화면 머리(골드 라인) ───
export function AdmHero({ en, title, desc, right, children }) {
  return (
    <div className="adm-hero relative overflow-hidden rounded-[20px] sm:rounded-[24px] px-4 py-4 sm:px-6 sm:py-5 mb-3 sm:mb-4 text-white">
      <div className="relative flex items-center justify-between gap-3 sm:gap-5 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] sm:text-[11.5px] font-extrabold tracking-[0.32em] whitespace-nowrap" style={{ ...NUM, color: G.gold }}>{en}</span>
            <span className="hidden sm:block h-px w-[120px]" style={{ background: `linear-gradient(90deg, ${G.gold}, transparent)` }} />
          </div>
          <div className="text-[20px] sm:text-[26px] font-black mt-1 tracking-tight whitespace-nowrap">{title}</div>
          {desc && <div className="hidden sm:block text-[13.5px] mt-1 max-w-[860px] leading-relaxed" style={{ color: G.sub }}>{desc}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ─── 패널 ───
export function AdmPanel({ code, title, right, children, className = "", bodyClass = "p-4 sm:p-5", style }) {
  return (
    <section className={`adm-panel rounded-[18px] min-w-0 overflow-hidden ${className}`} style={style}>
      {(code || title || right) && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-3.5 sm:pt-4 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-[7px] h-[7px] rotate-45 rounded-[2px] shrink-0" style={{ background: G.gold, boxShadow: `0 0 8px ${G.gold}` }} />
            {code && <span className="text-[10.5px] font-extrabold tracking-[0.22em] whitespace-nowrap" style={{ ...NUM, color: G.goldDim }}>{code}</span>}
            {title && <span className="text-[15px] sm:text-[16.5px] font-black whitespace-nowrap truncate" style={{ color: G.ink }}>{title}</span>}
          </div>
          {right}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

// ─── 큰 숫자 타일 ───
export function AdmKpi({ code, label, value, unit, foot, primary = false, valueColor, children, onClick, tag }) {
  const El = onClick ? "button" : "div";
  return (
    <El type={onClick ? "button" : undefined} onClick={onClick} className={`adm-kpi ${primary ? "adm-kpi-on" : ""} relative text-left rounded-[18px] px-4 pt-3.5 pb-3 min-w-0 overflow-hidden ${onClick ? "cursor-pointer" : ""}`}>
      <span className="absolute top-0 left-4 right-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${primary ? G.gold : "rgba(215,188,130,.4)"}, transparent)` }} />
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[13px] sm:text-[13.5px] font-bold whitespace-nowrap truncate" style={{ color: G.sub }}>{label} {tag}</span>
        <span className="text-[10px] font-extrabold tracking-[0.2em] whitespace-nowrap shrink-0" style={{ ...NUM, color: primary ? G.gold : G.dim }}>{code}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1 min-w-0">
        <span className="text-[25px] sm:text-[30px] font-black leading-none whitespace-nowrap truncate" style={{ ...NUM, letterSpacing: "-0.02em", color: valueColor || (primary ? G.goldHi : "#fff") }}>{value}</span>
        {unit && <span className="text-[13px] font-bold shrink-0" style={{ color: G.dim }}>{unit}</span>}
      </div>
      {foot != null && <div className="mt-1.5 text-[12.5px] font-semibold whitespace-nowrap truncate" style={{ color: G.dim }}>{foot}</div>}
      {children}
    </El>
  );
}

// ─── 가로 막대(사용량 / 한도) ───
export function Meter({ used = 0, limit = 0, height = 6, color }) {
  const r = limit > 0 ? used / limit : 0;
  const pct = Math.max(0, Math.min(100, r * 100));
  const c = color || (r > 1 ? G.bad : r >= 0.8 ? G.warn : G.gold);
  return (
    <div className="relative rounded-full overflow-hidden" style={{ height, background: "rgba(255,255,255,.07)" }}>
      <div className="h-full rounded-full" style={{ width: `${limit > 0 ? pct : 0}%`, background: r > 1 ? c : `linear-gradient(90deg, rgba(215,188,130,.45), ${c})`, boxShadow: `0 0 8px ${c}55` }} />
    </div>
  );
}

// ─── 원형 링 ───
export function Ring({ value = 0, size = 64, stroke = 6, color = G.gold, label, sub }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      {label != null && <text x="50%" y={sub ? "47%" : "53%"} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontFamily={MONO} fontSize={size * 0.22} fontWeight="800">{label}</text>}
      {sub && <text x="50%" y="68%" textAnchor="middle" dominantBaseline="middle" fill={G.dim} fontSize={size * 0.13} fontWeight="700">{sub}</text>}
    </svg>
  );
}

// ─── 반원 게이지 ───
export function ArcGauge({ value = 0, label, sub, color = G.gold, max = 1 }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const R = 70, cx = 90, cy = 86;
  const pt = (p) => { const a = Math.PI * (1 - p); return [cx + R * Math.cos(a), cy - R * Math.sin(a)]; };
  const [ex, ey] = pt(pct);
  const id = React.useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 180 104" width="100%" style={{ maxWidth: 230, display: "block", margin: "0 auto" }}>
      <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8C7442" /><stop offset="1" stopColor={color} /></linearGradient></defs>
      <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="12" strokeLinecap="round" />
      {pct > 0.002 && <path d={`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${ex} ${ey}`} fill="none" stroke={`url(#g${id})`} strokeWidth="12" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />}
      {Array.from({ length: 11 }, (_, i) => i / 10).map((t) => { const a = Math.PI * (1 - t); const r1 = R - 13, r2 = R - (i5(t) ? 20 : 17); return <line key={t} x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy - r2 * Math.sin(a)} stroke="rgba(215,188,130,.3)" strokeWidth="1" />; })}
      <text x={cx} y={cy - 18} textAnchor="middle" fill="#fff" fontFamily={MONO} fontSize="22" fontWeight="800">{label}</text>
      <text x={cx} y={cy - 2} textAnchor="middle" fill={G.dim} fontSize="10" fontWeight="700">{sub}</text>
    </svg>
  );
}
const i5 = (t) => Math.round(t * 10) % 5 === 0;

// ─── 차트 말풍선 ───
export function AdmTip({ active, payload, label, fmt = (v) => Number(v || 0).toLocaleString(), unit = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(7,12,24,.96)", border: `1px solid ${G.goldLine}`, borderRadius: 10, padding: "9px 12px", boxShadow: "0 12px 28px rgba(0,0,0,.45)" }}>
      <div style={{ ...NUM, fontSize: 12.5, color: G.goldDim, marginBottom: 4 }}>{label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, fontWeight: 700, color: G.ink }}>
          <span style={{ color: G.sub, display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill, display: "inline-block" }} />{p.name}</span>
          <span style={NUM}>{fmt(p.value, p)}{unit}</span>
        </div>
      ))}
    </div>
  );
}
export const AXIS = { axisLine: false, tickLine: false, tick: { fontSize: 11, fill: "rgba(201,213,236,.55)", fontFamily: MONO } };

// ─── 세그먼트(작은 탭) ───
export function Seg({ value, onChange, items, size = "md" }) {
  return (
    <div className="adm-seg inline-flex gap-0.5 p-[3px] rounded-[11px] shrink-0 max-w-full overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {items.map(([k, l, badge]) => {
        const on = value === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)}
            className={`${size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]"} rounded-[8px] font-black whitespace-nowrap inline-flex items-center gap-1.5 transition`}
            style={on ? { ...GOLD_BTN, boxShadow: "0 4px 14px rgba(215,188,130,.25)" } : { color: G.sub }}>
            {l}{badge ? <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black inline-flex items-center justify-center" style={on ? { background: G.goldInk, color: G.goldHi } : { background: "rgba(215,188,130,.2)", color: G.goldHi }}>{badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── 버튼 ───
export function AdmBtn({ gold = false, children, className = "", ...p }) {
  return (
    <button type="button" {...p} className={`adm-btn h-10 px-4 rounded-xl text-[13.5px] font-black inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition disabled:opacity-45 ${gold ? "adm-btn-gold" : ""} ${className}`}>{children}</button>
  );
}

// ─── 빈 화면 / 불러오는 중 ───
export function AdmEmpty({ children = "불러오는 중이에요" }) {
  return <div className="py-12 text-center text-[13.5px] font-bold" style={{ color: G.dim }}>{children}</div>;
}

// ─── 관리자센터 전체 CSS ───
//  ⚠ 아래 "예전 화면 어둡게" 규칙은 .adm-main 안에서만 — 팝업(kpConfirm 등)은 body 에 붙으므로 그대로 밝게 보인다.
const SURF = ["bg-white", "bg-[#FFFFFF]", "bg-[#fff]"];
const SURF2 = ["bg-[#F7F9FC]", "bg-[#F5F8FD]", "bg-[#F8FAFC]", "bg-[#F4F7FC]", "bg-[#F1F4F9]", "bg-[#EEF1F6]", "bg-[#EEF2F8]", "bg-[#EEF3FC]", "bg-[#EEF3FB]", "bg-[#F4F6FA]", "bg-[#F9FAFC]", "bg-[#FBFCFE]", "bg-[#F4F7FB]", "bg-[#FAFBFD]", "bg-[#F6F8FC]", "bg-[#F0F5FD]", "bg-[#EAF0FB]", "bg-[#E9F0FC]", "bg-[#DCE6F7]", "bg-[#E3EBFB]", "bg-gray-50", "bg-gray-100", "bg-slate-50", "bg-[#FFFBF5]", "bg-[#F8FAFD]"];
const INK = ["text-[#0F1A30]", "text-[#1B2B4B]", "text-[#26324A]", "text-[#0B1428]", "text-gray-900", "text-gray-800", "text-slate-900", "text-slate-800"];
const SUBT = ["text-[#3A4A66]", "text-[#2D4C82]", "text-[#4B6CB7]", "text-[#2D5BD8]", "text-gray-700", "text-gray-600", "text-slate-700", "text-slate-600"];
const DIMT = ["text-[#5B6B85]", "text-[#7A879C]", "text-[#7A8AA6]", "text-[#7A89A3]", "text-[#9AA9C3]", "text-[#94A3B8]", "text-[#9AA4B5]", "text-[#A3AEC2]", "text-[#64748b]", "text-gray-500", "text-gray-400", "text-slate-500", "text-slate-400"];
const BRD = ["border-[#DCE3EE]", "border-[#E3E8F0]", "border-[#EEF1F6]", "border-[#E8EDF4]", "border-[#DCE6F5]", "border-[#C9D3E4]", "border-[#E6EBF4]", "border-[#D5DBE5]", "border-gray-200", "border-gray-100", "border-gray-300", "border-slate-200", "ring-[#E3E8F0]", "ring-[#DCE3EE]", "divide-[#EEF1F6]"];
const DARKBTN = ["bg-[#0F1A30]", "bg-[#1B2B4B]", "bg-[#2D4C82]"];
const REDT = ["text-[#B42318]", "text-[#B4342A]", "text-[#C2352B]", "text-[#D64545]", "text-red-600", "text-red-500"];
const sel = (list, scope = ".kp-adm .adm-main", suffix = "") => list.map((c) => `${scope} [class~="${c}"]${suffix}`).join(",\n");

export const ADM_CSS = `
.kp-adm { color: ${G.ink}; background:
  radial-gradient(1100px 420px at 85% -12%, rgba(215,188,130,.10), transparent 60%),
  radial-gradient(900px 500px at -10% 110%, rgba(75,108,183,.16), transparent 60%),
  linear-gradient(160deg, #04070F 0%, #0A1328 50%, #070D1C 100%); background-attachment: fixed; }
.kp-adm .adm-grid { position: fixed; inset: 0; pointer-events: none; background:
  linear-gradient(rgba(215,188,130,.035) 1px, transparent 1px) 0 0/32px 32px,
  linear-gradient(90deg, rgba(215,188,130,.035) 1px, transparent 1px) 0 0/32px 32px; }
.kp-adm .adm-panel { background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018)); border: 1px solid ${G.line}; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 18px 40px rgba(0,0,0,.22); }
.kp-adm .adm-hero { background:
  linear-gradient(rgba(215,188,130,.05) 1px, transparent 1px) 0 0/22px 22px,
  linear-gradient(90deg, rgba(215,188,130,.05) 1px, transparent 1px) 0 0/22px 22px,
  radial-gradient(640px 220px at 88% -30%, rgba(215,188,130,.22), transparent 62%),
  linear-gradient(120deg, #060B17 0%, #0E1A33 60%, #1A2746 100%);
  border: 1px solid rgba(215,188,130,.22); box-shadow: 0 18px 44px rgba(0,0,0,.35); }
.kp-adm .adm-hero::after { content: ""; position: absolute; left: 24px; right: 24px; top: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(243,227,188,.8), transparent); }
.kp-adm .adm-kpi { background: linear-gradient(150deg, rgba(255,255,255,.07), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.08); transition: transform .15s, border-color .15s; }
.kp-adm .adm-kpi:hover { transform: translateY(-2px); border-color: rgba(215,188,130,.35); }
.kp-adm .adm-kpi-on { background: linear-gradient(140deg, rgba(215,188,130,.20), rgba(140,116,66,.10) 55%, rgba(255,255,255,.02)); border-color: rgba(215,188,130,.42); box-shadow: 0 0 26px rgba(215,188,130,.12); }
.kp-adm .adm-seg { background: rgba(255,255,255,.04); border: 1px solid ${G.line}; }
.kp-adm .adm-seg::-webkit-scrollbar { display: none; }
.kp-adm .adm-btn { background: rgba(255,255,255,.06); color: ${G.ink}; border: 1px solid ${G.line}; }
.kp-adm .adm-btn:hover:not(:disabled) { border-color: rgba(215,188,130,.5); background: rgba(215,188,130,.08); }
.kp-adm .adm-btn-gold { background: linear-gradient(180deg,#F3E3BC 0%,#D7BC82 100%); color: ${G.goldInk}; border-color: transparent; box-shadow: 0 6px 18px rgba(215,188,130,.22); }
.kp-adm .adm-btn-gold:hover:not(:disabled) { filter: brightness(1.05); background: linear-gradient(180deg,#F7EBCB 0%,#DCC28A 100%); }
.kp-adm .adm-row:hover { background: rgba(215,188,130,.05); }
.kp-adm .adm-scroll { scrollbar-width: thin; scrollbar-color: rgba(215,188,130,.25) transparent; }
.kp-adm .adm-scroll::-webkit-scrollbar { width: 6px; height: 6px } .kp-adm .adm-scroll::-webkit-scrollbar-thumb { background: rgba(215,188,130,.25); border-radius: 9px }
@keyframes admColon { 0%,49% { opacity: 1 } 50%,100% { opacity: .25 } }
.kp-adm .adm-colon { animation: admColon 1s steps(1) infinite; }
@keyframes admScan { 0% { transform: translateY(-120%) } 100% { transform: translateY(1100%) } }
.kp-adm .adm-scan { position: absolute; left: 0; right: 0; top: 0; height: 80px; background: linear-gradient(180deg, rgba(215,188,130,0), rgba(215,188,130,.05), rgba(215,188,130,0)); animation: admScan 10s linear infinite; pointer-events: none; }
@keyframes admFlow { from { stroke-dashoffset: 24 } to { stroke-dashoffset: 0 } }
.kp-adm .adm-flow { stroke-dasharray: 4 8; animation: admFlow 1.2s linear infinite; }
@keyframes admIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.kp-adm .adm-in { animation: admIn .28s ease both; }
@media (prefers-reduced-motion: reduce) { .kp-adm .adm-scan, .kp-adm .adm-flow, .kp-adm .adm-colon, .kp-adm .adm-in { animation: none } }

/* ── 예전 밝은 화면을 본문 안에서 어둡게(데이터 · 동작은 그대로) ── */
${sel(SURF)}, .kp-adm .adm-main .pm-tile, .kp-adm .adm-main [style*="background: rgb(255, 255, 255)"], .kp-adm .adm-main [style*="background-color: rgb(255, 255, 255)"] { background: ${G.panel} !important; border-color: ${G.line} !important; box-shadow: none !important; }
${sel(SURF2)}, .kp-adm .adm-main [style*="background: rgb(247, 249, 252)"], .kp-adm .adm-main [style*="background: rgb(244, 247, 252)"], .kp-adm .adm-main [style*="background: rgb(238, 243, 251)"] { background: ${G.panel2} !important; }
${sel(INK)}, .kp-adm .adm-main [style*="color: rgb(15, 26, 48)"], .kp-adm .adm-main [style*="color: rgb(27, 43, 75)"], .kp-adm .adm-main [style*="color: rgb(17, 24, 39)"] { color: ${G.ink} !important; }
${sel(SUBT)}, .kp-adm .adm-main [style*="color: rgb(75, 85, 99)"], .kp-adm .adm-main [style*="color: rgb(55, 65, 81)"] { color: #C9D5EC !important; }
${sel(DIMT)}, .kp-adm .adm-main [style*="color: rgb(148, 163, 184)"], .kp-adm .adm-main [style*="color: rgb(107, 114, 128)"], .kp-adm .adm-main [style*="color: rgb(156, 163, 175)"], .kp-adm .adm-main [style*="color: rgb(100, 116, 139)"] { color: ${G.dim} !important; }
${sel(BRD)}, .kp-adm .adm-main [style*="border: 1px solid rgb(227, 232, 240)"], .kp-adm .adm-main [style*="border-bottom: 1px solid rgb(232, 237, 244)"], .kp-adm .adm-main [style*="border: 1px solid rgb(220, 227, 239)"] { border-color: ${G.line} !important; --tw-ring-color: ${G.line} !important; }
${sel(REDT)} { color: ${G.bad} !important; }
${sel(DARKBTN, ".kp-adm .adm-main button")}, ${sel(DARKBTN, ".kp-adm .adm-main a")} { background: linear-gradient(180deg,#F3E3BC 0%,#D7BC82 100%) !important; color: ${G.goldInk} !important; border-color: transparent !important; }
${sel(DARKBTN, ".kp-adm .adm-main button", ' [class~="text-white"]')} { color: ${G.goldInk} !important; }
.kp-adm .adm-main thead tr, ${sel(["bg-[#1B2B4B]", "bg-[#0F1A30]"], ".kp-adm .adm-main thead")} { background: #0A1226 !important; }
.kp-adm .adm-main thead th { color: ${G.goldDim} !important; background: #0A1226 !important; border-color: ${G.line} !important; }
.kp-adm .adm-main tbody tr { border-color: rgba(215,188,130,.08) !important; }
.kp-adm .adm-main tbody td { border-color: rgba(215,188,130,.08) !important; }
.kp-adm .adm-main tbody tr:hover > td { background: rgba(215,188,130,.04); }
.kp-adm .adm-main .pm-row:hover { background: rgba(215,188,130,.05) !important; }
.kp-adm .adm-main .pm-hero, .kp-adm .adm-main .kp-hero { background:
  radial-gradient(640px 220px at 88% -30%, rgba(215,188,130,.22), transparent 62%), linear-gradient(120deg, #060B17 0%, #0E1A33 60%, #1A2746 100%) !important; border: 1px solid rgba(215,188,130,.22); }
.kp-adm .adm-main .pm-tile-dark { background: linear-gradient(140deg, rgba(215,188,130,.20), rgba(140,116,66,.10) 55%, rgba(255,255,255,.02)) !important; border: 1px solid rgba(215,188,130,.4) !important; box-shadow: none !important; }
.kp-adm .adm-main input:not([type=checkbox]):not([type=radio]):not([type=range]), .kp-adm .adm-main select, .kp-adm .adm-main textarea {
  background-color: #0A1226 !important; color: ${G.ink} !important; border-color: rgba(215,188,130,.22) !important; }
.kp-adm .adm-main input::placeholder, .kp-adm .adm-main textarea::placeholder { color: rgba(201,213,236,.38) !important; }
.kp-adm .adm-main input:focus, .kp-adm .adm-main select:focus, .kp-adm .adm-main textarea:focus { border-color: ${G.gold} !important; box-shadow: 0 0 0 3px rgba(215,188,130,.15) !important; outline: none; }
.kp-adm .adm-main [class~="bg-[#FFF8EC]"], .kp-adm .adm-main [class~="bg-amber-50"], .kp-adm .adm-main [class~="bg-[#FFF4E5]"] { background: rgba(242,196,109,.07) !important; border-color: rgba(242,196,109,.3) !important; }
.kp-adm .adm-main [class~="text-[#8A4B08]"], .kp-adm .adm-main [class~="text-amber-800"], .kp-adm .adm-main [class~="text-[#B54708]"] { color: ${G.warn} !important; }
.kp-adm .adm-main [class~="bg-[#FEF3F2]"], .kp-adm .adm-main [class~="bg-red-50"] { background: rgba(255,138,122,.08) !important; }
.kp-adm .adm-main .recharts-cartesian-grid line, .kp-adm .adm-main [stroke="#EEF1F6"], .kp-adm .adm-main [stroke="#E3E8F0"], .kp-adm .adm-main [stroke="#EEF2F7"] { stroke: rgba(215,188,130,.08) !important; }
.kp-adm .adm-main .recharts-cartesian-axis-tick-value { fill: rgba(201,213,236,.6) !important; }
.kp-adm .adm-main [fill="#1B2B4B"], .kp-adm .adm-main [fill="#0F1A30"] { fill: ${G.gold} !important; }
.kp-adm .adm-main [stroke="#1B2B4B"], .kp-adm .adm-main [stroke="#0F1A30"] { stroke: ${G.gold} !important; }
.kp-adm .adm-main .recharts-default-tooltip { background: rgba(7,12,24,.96) !important; border-color: ${G.goldLine} !important; color: ${G.ink} !important; }
.kp-adm .adm-main .recharts-tooltip-cursor { fill: rgba(215,188,130,.06) !important; }
.kp-adm .adm-main hr { border-color: ${G.line}; }

/* ── 🛰 2026-11-18 2차 — 남은 흰 바탕 · 남색 · 파란색을 관제 대시보드와 같은 골드로 통일 ── */
/* 공용 표 줄무늬(index.css: 홀수 흰색 · 짝수 연회색 · 진한 글자)를 관리자센터에서는 끈다 */
.kp-adm .adm-main table tbody td, .kp-adm .adm-main table tbody tr:nth-child(odd) td, .kp-adm .adm-main table tbody tr:nth-child(even) td { background-color: transparent !important; color: ${G.ink} !important; border-color: rgba(215,188,130,.08) !important; border-left-color: transparent !important; border-right-color: transparent !important; }
.kp-adm .adm-main table tbody tr:nth-child(even) td { background-color: rgba(255,255,255,.018) !important; }
.kp-adm .adm-main table tbody tr:hover td { background-color: rgba(215,188,130,.06) !important; }
.kp-adm .adm-main table thead th { border-right-color: transparent !important; }
/* 밝은 바탕(#F… · #E… · #D… 계열) → 어두운 칸 */
.kp-adm .adm-main [class^="bg-[#F"], .kp-adm .adm-main [class*=" bg-[#F"], .kp-adm .adm-main [class^="bg-[#E"], .kp-adm .adm-main [class*=" bg-[#E"], .kp-adm .adm-main [class^="bg-[#D"], .kp-adm .adm-main [class*=" bg-[#D"], .kp-adm .adm-main [class^="bg-[#C"], .kp-adm .adm-main [class*=" bg-[#C"],
.kp-adm .adm-main [class*=" bg-gray-"], .kp-adm .adm-main [class^="bg-gray-"], .kp-adm .adm-main [class*=" bg-slate-"], .kp-adm .adm-main [class*=" bg-blue-50"], .kp-adm .adm-main [class*=" bg-blue-100"], .kp-adm .adm-main [class*=" bg-indigo-50"] { background-color: ${G.panel2} !important; }
.kp-adm .adm-main [class*="hover:bg-[#F"]:hover, .kp-adm .adm-main [class*="hover:bg-[#E"]:hover, .kp-adm .adm-main [class*="hover:bg-white"]:hover, .kp-adm .adm-main [class*="hover:bg-gray"]:hover, .kp-adm .adm-main [class*="hover:bg-blue"]:hover { background-color: rgba(215,188,130,.07) !important; }
/* 부드러운 색 상자(경고 · 오류 · 완료)는 어두운 바탕 위 색 테두리로 */
.kp-adm .adm-main [class*=" bg-[#FFF"], .kp-adm .adm-main [class^="bg-[#FFF"], .kp-adm .adm-main [class*=" bg-amber-"], .kp-adm .adm-main [class*=" bg-yellow-"] { background-color: rgba(242,196,109,.08) !important; }
.kp-adm .adm-main [class*=" bg-[#FD"], .kp-adm .adm-main [class*=" bg-[#FE"], .kp-adm .adm-main [class*=" bg-red-50"], .kp-adm .adm-main [class*=" bg-red-100"] { background-color: rgba(255,138,122,.09) !important; }
.kp-adm .adm-main [class*=" bg-[#E8F7EF]"], .kp-adm .adm-main [class*=" bg-[#ECFDF3]"], .kp-adm .adm-main [class*=" bg-green-50"], .kp-adm .adm-main [class*=" bg-emerald-50"] { background-color: rgba(127,209,174,.09) !important; }
/* 남색 바탕(칩 · 선택 표시 · 진한 카드) → 골드(선택) 또는 어두운 골드 테두리 칸 */
.kp-adm .adm-main [class~="bg-[#2D4C82]"], .kp-adm .adm-main [class~="bg-[#4B6CB7]"], .kp-adm .adm-main [class~="bg-[#6E95E8]"], .kp-adm .adm-main [class~="bg-[#8FB0F0]"], .kp-adm .adm-main [class~="bg-[#CFE0FF]"], .kp-adm .adm-main [class*=" bg-blue-5"], .kp-adm .adm-main [class*=" bg-blue-6"], .kp-adm .adm-main [class*=" bg-blue-7"], .kp-adm .adm-main [class*=" bg-indigo-6"] { background: linear-gradient(180deg,#F3E3BC 0%,#D7BC82 100%) !important; color: ${G.goldInk} !important; border-color: transparent !important; }
.kp-adm .adm-main [class~="bg-[#1B2B4B]"]:not(button):not(a):not(tr):not(thead), .kp-adm .adm-main [class~="bg-[#0F1A30]"]:not(button):not(a):not(tr):not(thead), .kp-adm .adm-main [class~="bg-[#0B1428]"]:not(button):not(a), .kp-adm .adm-main [class~="bg-[#243a60]"], .kp-adm .adm-main [class~="bg-[#243d6a]"] { background: rgba(215,188,130,.12) !important; border-color: rgba(215,188,130,.35) !important; color: ${G.goldHi} !important; }
.kp-adm .adm-main [class~="bg-[#1B2B4B]"]:not(button):not(a) [class~="text-white"], .kp-adm .adm-main [class~="bg-[#0F1A30]"]:not(button):not(a) [class~="text-white"] { color: ${G.goldHi} !important; }
.kp-adm .adm-main [class~="bg-[#1B2B4B]"][class~="text-white"]:not(button):not(a), .kp-adm .adm-main [class~="bg-[#0F1A30]"][class~="text-white"]:not(button):not(a) { color: ${G.goldHi} !important; }
.kp-adm .adm-main [class~="bg-[#0B1428]"] { color: ${G.goldHi} !important; }
/* 파란 글자 → 골드 */
.kp-adm .adm-main [class~="text-[#8FB0F0]"], .kp-adm .adm-main [class~="text-[#CFE0FF]"], .kp-adm .adm-main [class~="text-[#6E95E8]"], .kp-adm .adm-main [class~="text-[#2D5BD8]"], .kp-adm .adm-main [class~="text-[#C9D6EE]"], .kp-adm .adm-main [class*=" text-blue-"], .kp-adm .adm-main [class^="text-blue-"], .kp-adm .adm-main [class*=" text-indigo-"] { color: ${G.gold} !important; }
.kp-adm .adm-main [class~="text-[#2D4C82]"], .kp-adm .adm-main [class~="text-[#4B6CB7]"], .kp-adm .adm-main [class~="text-[#1F2A44]"], .kp-adm .adm-main [class~="text-[#0B1428]"] { color: ${G.goldHi} !important; }
.kp-adm .adm-main [class~="text-[#5A6A85]"], .kp-adm .adm-main [class~="text-[#55657F]"], .kp-adm .adm-main [class~="text-[#64748B]"], .kp-adm .adm-main [class~="text-[#C0CAD9]"], .kp-adm .adm-main [class~="text-[#B6C2D6]"], .kp-adm .adm-main [class~="text-[#C3CCDA]"], .kp-adm .adm-main [class~="text-[#AAB4C5]"], .kp-adm .adm-main [class~="text-[#A7B3C6]"] { color: ${G.dim} !important; }
.kp-adm .adm-main [class~="text-[#0F7A43]"], .kp-adm .adm-main [class~="text-[#067647]"], .kp-adm .adm-main [class~="text-[#1B7F4B]"], .kp-adm .adm-main [class*=" text-green-"], .kp-adm .adm-main [class*=" text-emerald-"] { color: ${G.ok} !important; }
.kp-adm .adm-main [class~="text-[#D92D20]"], .kp-adm .adm-main [class~="text-[#B42318]"] { color: ${G.bad} !important; }
.kp-adm .adm-main [class~="text-[#A35F00]"], .kp-adm .adm-main [class~="text-[#9A5B00]"], .kp-adm .adm-main [class~="text-[#8A6A16]"], .kp-adm .adm-main [class~="text-[#7A5B00]"], .kp-adm .adm-main [class~="text-[#7A4B00]"], .kp-adm .adm-main [class~="text-[#6B4A00]"] { color: ${G.warn} !important; }
/* 남색 · 파란 · 밝은 테두리 → 골드 선 */
.kp-adm .adm-main [class*=" border-[#C"], .kp-adm .adm-main [class*=" border-[#D"], .kp-adm .adm-main [class*=" border-[#E"], .kp-adm .adm-main [class*=" border-[#F0"], .kp-adm .adm-main [class*=" border-[#F1"], .kp-adm .adm-main [class*=" border-[#B"], .kp-adm .adm-main [class*=" border-[#9"], .kp-adm .adm-main [class*=" border-[#6"], .kp-adm .adm-main [class*=" border-blue-"], .kp-adm .adm-main [class*=" border-gray-"], .kp-adm .adm-main [class*=" border-slate-"] { border-color: ${G.line} !important; }
.kp-adm .adm-main [class~="border-[#1B2B4B]"], .kp-adm .adm-main [class~="border-[#0F1A30]"], .kp-adm .adm-main [class~="border-[#2D4C82]"], .kp-adm .adm-main [class~="border-[#4B6CB7]"], .kp-adm .adm-main [class~="border-[#8FB0F0]"], .kp-adm .adm-main [class~="border-[#0B1428]"] { border-color: rgba(215,188,130,.5) !important; }
.kp-adm .adm-main [class*="hover:border-[#4B6CB7]"]:hover, .kp-adm .adm-main [class*="hover:border-[#8FB0F0]"]:hover, .kp-adm .adm-main [class*="hover:border-[#1B2B4B]"]:hover, .kp-adm .adm-main [class*="hover:border-[#2D4C82]"]:hover { border-color: ${G.gold} !important; }
.kp-adm .adm-main [class*="ring-[#8FB0F0]"], .kp-adm .adm-main [class*="ring-[#4B6CB7]"], .kp-adm .adm-main [class*="ring-[#1B2B4B]"], .kp-adm .adm-main [class*="ring-[#2D4C82]"], .kp-adm .adm-main [class*="ring-blue-"] { --tw-ring-color: rgba(215,188,130,.6) !important; }
.kp-adm .adm-main [class*="accent-[#"] { accent-color: ${G.gold} !important; }
.kp-adm .adm-main input[type=checkbox], .kp-adm .adm-main input[type=radio] { accent-color: ${G.gold}; }
/* 화면 안 인라인 색(style 속성) — 남색 그라데이션 · 흰 칸 · 파란 글자 */
.kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(45, 76, 130)"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(27, 43, 75)"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(75, 108, 183)"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgba(75, 108, 183"] {
  background: linear-gradient(140deg, rgba(215,188,130,.16), rgba(140,116,66,.08) 55%, rgba(255,255,255,.02)) !important; border-color: rgba(215,188,130,.4) !important; }
.kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(255, 255, 255)"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(247, 249, 252)"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(244, 247, 252)"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(238, 243, 251)"] {
  background: linear-gradient(150deg, rgba(255,255,255,.06), rgba(255,255,255,.02)) !important; border-color: ${G.line} !important; }
.kp-adm .adm-main [style*="background: rgb(45, 76, 130)"], .kp-adm .adm-main [style*="background: rgb(75, 108, 183)"], .kp-adm .adm-main [style*="background: rgb(143, 176, 240)"], .kp-adm .adm-main [style*="background: rgb(110, 149, 232)"], .kp-adm .adm-main [style*="background: rgb(207, 224, 255)"], .kp-adm .adm-main [style*="background-color: rgb(45, 76, 130)"] { background: ${G.gold} !important; }
.kp-adm .adm-main [style*="background: rgb(27, 43, 75)"], .kp-adm .adm-main [style*="background: rgb(15, 26, 48)"], .kp-adm .adm-main [style*="background-color: rgb(27, 43, 75)"], .kp-adm .adm-main [style*="background-color: rgb(15, 26, 48)"] { background: rgba(215,188,130,.12) !important; border-color: rgba(215,188,130,.35) !important; }
.kp-adm .adm-main [style*="background: rgb(203, 211, 225)"], .kp-adm .adm-main [style*="background: rgb(201, 211, 228)"], .kp-adm .adm-main [style*="background: rgb(243, 246, 250)"], .kp-adm .adm-main [style*="background: rgb(238, 242, 248)"], .kp-adm .adm-main [style*="background: rgb(244, 246, 250)"], .kp-adm .adm-main [style*="background: rgb(233, 237, 243)"], .kp-adm .adm-main [style*="background: rgb(248, 250, 252)"] { background: ${G.panel2} !important; }
.kp-adm .adm-main [style^="color: rgb(143, 176, 240)"], .kp-adm .adm-main [style*="; color: rgb(143, 176, 240)"], .kp-adm .adm-main [style^="color: rgb(207, 224, 255)"], .kp-adm .adm-main [style*="; color: rgb(207, 224, 255)"], .kp-adm .adm-main [style^="color: rgb(110, 149, 232)"], .kp-adm .adm-main [style*="; color: rgb(110, 149, 232)"] { color: ${G.gold} !important; }
.kp-adm .adm-main [style^="color: rgb(45, 76, 130)"], .kp-adm .adm-main [style*="; color: rgb(45, 76, 130)"], .kp-adm .adm-main [style^="color: rgb(75, 108, 183)"], .kp-adm .adm-main [style*="; color: rgb(75, 108, 183)"] { color: ${G.goldHi} !important; }
.kp-adm .adm-main [style*="border: 1px solid rgb(45, 76, 130)"], .kp-adm .adm-main [style*="border: 1px solid rgb(15, 26, 48)"], .kp-adm .adm-main [style*="border: 1px solid rgb(27, 43, 75)"] { border-color: rgba(215,188,130,.4) !important; }
.kp-adm .adm-main [stroke="#2D4C82"], .kp-adm .adm-main [stroke="#4B6CB7"], .kp-adm .adm-main [stop-color="#2D4C82"] { stroke: ${G.goldHi}; stop-color: ${G.goldHi}; }
.kp-adm .adm-main button[class~="bg-[#1B2B4B]"], .kp-adm .adm-main button[class~="bg-[#0F1A30]"], .kp-adm .adm-main button[class~="bg-[#2D4C82]"], .kp-adm .adm-main a[class~="bg-[#1B2B4B]"], .kp-adm .adm-main a[class~="bg-[#0F1A30]"], .kp-adm .adm-main th[class~="bg-[#2D4C82]"] { background: linear-gradient(180deg,#F3E3BC 0%,#D7BC82 100%) !important; color: ${G.goldInk} !important; border-color: transparent !important; }
.kp-adm .adm-main button[class~="bg-[#1B2B4B]"] *, .kp-adm .adm-main button[class~="bg-[#0F1A30]"] * { color: inherit; }
.kp-adm .adm-main th[class~="bg-[#2D4C82]"] { background: rgba(215,188,130,.14) !important; color: ${G.goldHi} !important; }
.kp-adm .adm-main [style*="color: rgba(143, 176, 240"], .kp-adm .adm-main [style*="color: rgba(207, 224, 255"] { color: ${G.goldDim} !important; }
.kp-adm .adm-main [style*="background: rgb(110, 139, 196)"] { background: ${G.goldDim} !important; }
.kp-adm .adm-main [style*="solid rgb(238, 241, 246)"], .kp-adm .adm-main [style*="solid rgb(232, 237, 244)"], .kp-adm .adm-main [style*="solid rgb(220, 227, 238)"], .kp-adm .adm-main [style*="solid rgb(227, 232, 240)"], .kp-adm .adm-main [style*="solid rgb(201, 211, 228)"] { border-color: ${G.line} !important; }
.kp-adm .adm-main [style*="background: rgb(253, 236, 236)"], .kp-adm .adm-main [style*="background: rgb(254, 243, 242)"] { background: rgba(255,138,122,.09) !important; }
.kp-adm .adm-main [style*="background: rgb(232, 247, 239)"], .kp-adm .adm-main [style*="background: rgb(236, 253, 243)"] { background: rgba(127,209,174,.09) !important; }
.kp-adm .adm-main [style*="background: linear-gradient"][style*="rgba(143, 176, 240"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(11, 20, 40)"], .kp-adm .adm-main [style*="background: linear-gradient"][style*="rgb(22, 38, 74)"] {
  background: linear-gradient(rgba(215,188,130,.05) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(215,188,130,.05) 1px, transparent 1px) 0 0/22px 22px, radial-gradient(520px 200px at 90% -30%, rgba(215,188,130,.2), transparent 62%), linear-gradient(120deg, #060B17 0%, #0E1A33 60%, #1A2746 100%) !important; border: 1px solid rgba(215,188,130,.22); }
.kp-adm .adm-main [style^="color: rgb(58, 74, 102)"], .kp-adm .adm-main [style*="; color: rgb(58, 74, 102)"], .kp-adm .adm-main [style^="color: rgb(31, 42, 68)"], .kp-adm .adm-main [style*="; color: rgb(31, 42, 68)"] { color: #C9D5EC !important; }
.kp-adm .adm-main [style^="color: rgb(91, 107, 133)"], .kp-adm .adm-main [style*="; color: rgb(91, 107, 133)"], .kp-adm .adm-main [style^="color: rgb(122, 135, 156)"], .kp-adm .adm-main [style*="; color: rgb(122, 135, 156)"], .kp-adm .adm-main [style^="color: rgb(154, 169, 195)"], .kp-adm .adm-main [style*="; color: rgb(154, 169, 195)"] { color: ${G.dim} !important; }
.kp-adm .adm-main [fill="#2D4C82"], .kp-adm .adm-main [fill="#4B6CB7"] { fill: ${G.goldHi} !important; }
`;
