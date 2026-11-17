// ======================= src/execUi.jsx =======================
// 👑 2026-11-17 임원 화면 디자인 시스템 — 대표 · 임원이 보는 모든 화면(경영 브리핑 · 일일 경영 보고 · 경영 분석 · 결재 대기 ·
//  직원 정보 · 자금현황 · 스케줄 · 영업관리)이 같은 색 · 글씨 · 숫자 표기 · 그래프 규칙을 쓴다.
//
//  ■ 원칙 — "S급 비서가 대표에게 올리는 보고서판"
//   1) 결론 먼저: 화면 맨 위 한 줄 요약(브리핑 문장) → 핵심 숫자 4~6개 → 근거 그래프 → 세부 표 순서.
//   2) 숫자는 하나의 규칙: 금액은 fmtWon(원 단위 콤마) 또는 fmtMan(만원) · fmtEok(억) 중 화면 안에서 하나로.
//      단위는 숫자보다 작고 옅게(Num). 숫자 글꼴은 tabular(자릿수 정렬).
//   3) 색의 뜻은 고정: 골드 = 강조 · 선택 · 대표 지표 / 아이스 블루 = 보조 지표 · 그래프 2계열 /
//      증감은 한국 금융 관례 — 오르면 빨강(UP) · 내리면 파랑(DOWN). (비용처럼 "늘면 나쁜" 값은 invert 로 뜻만 바꾸지 색 규칙은 같다)
//   4) 글씨 크기 단계(PC 기준 · 모바일은 한 단계 작게): 화면 제목 28 · 패널 제목 17 · 큰 숫자 30~40 · 본문 14 · 보조 12.5 · 영문 꼬리표 11(자간 넓게)
//   5) 반응형: 한 줄 타일은 auto-fit 격자(최소 폭)로 — 폰에서는 2칸 · 1칸으로 자연스럽게 내려온다. 가로 스크롤 금지.
//   6) 비어 있을 때도 정중하게: Empty 로 "무엇이 없고 · 누가 채우면 보이는지"를 한 문장으로.
//
//  ■ 쓰는 법
//   <ExecPage en="MANAGEMENT ANALYTICS" title="경영 분석" sub="..." right={...}>
//     <ExecKpis>{[<Kpi .../>, ...]}</ExecKpis>
//     <ExecGrid cols="2fr 1fr"><ExecPanel en="TREND" title="월별 손익">…</ExecPanel>…</ExecGrid>
//   </ExecPage>
//   recharts 그래프는 chartTheme(축 · 격자 · 툴팁) + ExecTooltip 을 쓴다.
import React from "react";

// ── 색 · 글꼴 ──
export const EX = {
  bg0: "#050A16", // 가장 깊은 바탕
  bg1: "#0A1328", // 바탕
  bg2: "#0F1B36", // 패널 안쪽 강조
  panel: "rgba(255,255,255,0.035)",
  panelHi: "rgba(255,255,255,0.06)",
  line: "rgba(255,255,255,0.08)",
  lineHi: "rgba(215,188,130,0.35)",
  text: "#F4F6FB",
  sub: "rgba(232,238,250,0.72)",
  mute: "rgba(232,238,250,0.48)",
  faint: "rgba(232,238,250,0.28)",
  gold: "#D7BC82",
  goldHi: "#F1DDAE",
  goldDeep: "#A8874A",
  ice: "#8FB0F0",
  iceDeep: "#4B6CB7",
  up: "#FF8A7A", // 오름(한국 관례 — 빨강)
  down: "#7FB0FF", // 내림(파랑)
  ok: "#8FD9B6",
  warn: "#F5C46B",
  danger: "#FF7A6B",
  series: ["#D7BC82", "#8FB0F0", "#6E8BC9", "#B9A4E8", "#7FD1C2", "#E59BB0"],
};
export const EX_FONT = "'Pretendard','Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
export const EX_NUM = { fontFamily: EX_FONT, fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum' 1" };
export const GOLD_GRAD = "linear-gradient(135deg,#F1DDAE 0%,#D7BC82 45%,#A8874A 100%)";
const GRID_BG = "linear-gradient(rgba(143,176,240,.045) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(143,176,240,.045) 1px, transparent 1px) 0 0/28px 28px";

// ── 임원 화면 여부(공용 화면이 임원 모양으로 바뀔 때 쓴다 — DispatchApp · MobilePcViews 가 감싼다) ──
export const ExecModeContext = React.createContext(false);
export const useExecMode = () => React.useContext(ExecModeContext);

// ── 숫자 표기 ──
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const fmtWon = (v) => `${Math.round(n0(v)).toLocaleString("ko-KR")}`; // 1,234,567
export const fmtMan = (v) => `${Math.round(n0(v) / 1e4).toLocaleString("ko-KR")}`; // 만원 단위 숫자
// 금액을 사람이 읽기 좋은 [숫자, 단위]로 — 1억 이상: "2.41" 억 / 1만 이상: "1,451" 만 / 그 아래: 원
export function moneyParts(v, { eokDigits = 2 } = {}) {
  const x = n0(v); const a = Math.abs(x);
  if (a >= 1e8) return [(x / 1e8).toFixed(a >= 1e10 ? 0 : eokDigits).replace(/\.?0+$/, ""), "억원"];
  if (a >= 1e4) return [Math.round(x / 1e4).toLocaleString("ko-KR"), "만원"];
  return [Math.round(x).toLocaleString("ko-KR"), "원"];
}
export const fmtMoney = (v, o) => moneyParts(v, o).join("");
// 2억 6,310만원 — 보고서 문장용(정확한 크기감)
export function fmtEokMan(v) {
  const x = Math.round(n0(v) / 1e4); const sign = x < 0 ? "−" : ""; const a = Math.abs(x);
  const eok = Math.floor(a / 1e4); const man = a % 1e4;
  if (!eok) return `${sign}${man.toLocaleString("ko-KR")}만원`;
  return `${sign}${eok}억${man ? ` ${man.toLocaleString("ko-KR")}만` : ""}원`;
}
export const fmtPct = (v, dp = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(dp)}%`);
export const pctChange = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);

// ── 기본 부품 ──
// 숫자 + 작은 단위
export function Num({ value, unit, size = 34, color = EX.text, unitColor = EX.mute, weight = 900, className = "", style }) {
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap leading-none ${className}`} style={{ ...EX_NUM, ...style }}>
      <span style={{ fontSize: size, fontWeight: weight, color, letterSpacing: "-0.02em" }}>{value}</span>
      {unit && <span style={{ fontSize: Math.max(12, Math.round(size * 0.42)), fontWeight: 700, color: unitColor }}>{unit}</span>}
    </span>
  );
}
// 금액 한 번에(자동 억 · 만 · 원)
export function Money({ v, size = 34, color, ...rest }) {
  const [a, u] = moneyParts(v);
  return <Num value={a} unit={u} size={size} color={color} {...rest} />;
}
// 증감 ▲▼ — 오르면 빨강 · 내리면 파랑(invert: 비용처럼 늘면 나쁜 값 — 화살표 색은 그대로, 굵은 테두리로 "주의" 표시만)
export function Delta({ v, suffix = "%", dp = 1, size = 13, label, invert = false }) {
  if (v == null || !Number.isFinite(v)) return <span style={{ ...EX_NUM, fontSize: size, color: EX.faint, fontWeight: 700 }}>—</span>;
  const up = v > 0; const flat = Math.abs(v) < 0.05;
  const c = flat ? EX.mute : up ? EX.up : EX.down;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ ...EX_NUM, fontSize: size, fontWeight: 800, color: c }}>
      {label && <span style={{ color: EX.mute, fontWeight: 600 }}>{label}</span>}
      <span>{flat ? "—" : up ? "▲" : "▼"}{flat ? "" : `${Math.abs(v).toFixed(dp)}${suffix}`}</span>
      {invert && !flat && up && <span style={{ fontSize: size - 2, color: EX.warn, fontWeight: 700 }}>주의</span>}
    </span>
  );
}
// 영문 꼬리표(골드 · 넓은 자간)
export function Eyebrow({ children, color = EX.gold, size = 11, className = "" }) {
  return <div className={`whitespace-nowrap ${className}`} style={{ ...EX_NUM, fontSize: size, fontWeight: 800, letterSpacing: "0.28em", color }}>{children}</div>;
}
export function GoldRule({ className = "" }) {
  return <div className={className} style={{ height: 1, background: "linear-gradient(90deg, rgba(215,188,130,.65), rgba(215,188,130,.08) 70%, transparent)" }} />;
}

// 화면 전체 틀 — 딥 네이비 + 은은한 격자 + 골드 머리
export function ExecPage({ en, title, sub, right, children, className = "", testId, compact = false }) {
  return (
    <div data-exec-page data-testid={testId} className={`relative rounded-none md:rounded-[28px] overflow-hidden ${className}`}
      style={{ background: `radial-gradient(1200px 500px at 85% -10%, rgba(215,188,130,.10), transparent 60%), radial-gradient(900px 500px at -10% 10%, rgba(75,108,183,.18), transparent 55%), linear-gradient(180deg, ${EX.bg1}, ${EX.bg0})`, color: EX.text, fontFamily: EX_FONT }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: GRID_BG, maskImage: "linear-gradient(180deg, #000 0%, rgba(0,0,0,.35) 60%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, rgba(0,0,0,.35) 60%, transparent 100%)" }} />
      <div className={`relative ${compact ? "px-4 py-4" : "px-4 py-5 md:px-8 md:py-7"}`}>
        {(en || title) && (
          <header className="flex flex-col md:flex-row md:items-end gap-3 md:gap-6 mb-5 md:mb-7">
            <div className="min-w-0 flex-1">
              {en && <div className="flex items-center gap-3"><Eyebrow>{en}</Eyebrow><div className="hidden md:block flex-1 max-w-[220px]"><GoldRule /></div></div>}
              {title && <h1 className="mt-1.5 text-[24px] md:text-[30px] font-black tracking-[-0.02em] leading-tight" style={{ color: EX.text }}>{title}</h1>}
              {sub && <div className="mt-1.5 text-[13px] md:text-[14.5px] font-medium leading-relaxed" style={{ color: EX.sub }}>{sub}</div>}
            </div>
            {right && <div className="flex flex-wrap items-center gap-2 md:justify-end">{right}</div>}
          </header>
        )}
        <div className="space-y-4 md:space-y-5">{children}</div>
      </div>
    </div>
  );
}

// 유리 패널
export function ExecPanel({ en, title, sub, right, children, className = "", pad = true, glow = false, style }) {
  return (
    <section className={`relative rounded-[22px] overflow-hidden min-w-0 ${className}`}
      style={{ background: glow ? "linear-gradient(180deg, rgba(215,188,130,.10), rgba(255,255,255,.03))" : EX.panel, border: `1px solid ${glow ? EX.lineHi : EX.line}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.05), 0 24px 48px rgba(0,0,0,.28)", backdropFilter: "blur(6px)", ...style }}>
      {(en || title || right) && (
        <div className="px-4 md:px-6 pt-4 md:pt-5 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {en && <Eyebrow color={EX.ice} size={10.5}>{en}</Eyebrow>}
            {title && <div className="mt-1 text-[16px] md:text-[17.5px] font-black tracking-[-0.01em] truncate" style={{ color: EX.text }}>{title}</div>}
            {sub && <div className="mt-0.5 text-[12.5px] font-medium" style={{ color: EX.mute }}>{sub}</div>}
          </div>
          {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
        </div>
      )}
      <div className={pad ? "px-4 md:px-6 pb-4 md:pb-5" : ""}>{children}</div>
    </section>
  );
}

// 핵심 숫자 타일
export function Kpi({ en, label, value, unit, money, delta, deltaLabel, invert, foot, accent = false, spark, size, onClick, title }) {
  const big = size || (accent ? 36 : 32);
  const parts = money != null ? moneyParts(money) : [value, unit];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={title}
      className={`relative text-left rounded-[20px] p-4 md:p-5 min-w-0 overflow-hidden transition ${onClick ? "hover:-translate-y-0.5 cursor-pointer" : ""}`}
      style={{ background: accent ? "linear-gradient(160deg, rgba(215,188,130,.16), rgba(215,188,130,.04) 55%, rgba(255,255,255,.02))" : EX.panel, border: `1px solid ${accent ? EX.lineHi : EX.line}`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)" }}>
      {accent && <div className="absolute top-0 left-5 right-5 h-px" style={{ background: GOLD_GRAD }} />}
      {en && <Eyebrow color={accent ? EX.gold : EX.ice} size={10}>{en}</Eyebrow>}
      <div className="mt-1 text-[13px] md:text-[13.5px] font-bold truncate" style={{ color: EX.sub }}>{label}</div>
      <div className="mt-2.5"><Num value={parts[0]} unit={parts[1]} size={big} color={accent ? EX.goldHi : EX.text} /></div>
      {(delta !== undefined || foot) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 min-w-0">
          {delta !== undefined ? <Delta v={delta} label={deltaLabel} invert={invert} /> : <span />}
          {foot && <span className="text-[12px] font-semibold truncate" style={{ color: EX.mute }}>{foot}</span>}
        </div>
      )}
      {spark && spark.length > 1 && <div className="mt-3 -mx-1"><Sparkline data={spark} color={accent ? EX.gold : EX.ice} /></div>}
    </Tag>
  );
}
// 타일 줄 — 화면 폭에 맞춰 자동으로 칸 수가 바뀐다
export function ExecKpis({ children, min = 200, className = "" }) {
  return <div className={`grid gap-3 md:gap-4 ${className}`} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}>{children}</div>;
}
// 반응형 격자 — 넓은 화면에서만 cols 를 쓰고, 좁으면 한 줄
export function ExecGrid({ cols = "1fr 1fr", children, className = "", breakAt = 1100 }) {
  const ref = React.useRef(null); const [w, setW] = React.useState(1400);
  React.useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === "undefined") return undefined; const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el); return () => ro.disconnect(); }, []);
  return <div ref={ref} className={`grid gap-4 md:gap-5 ${className}`} style={{ gridTemplateColumns: w >= breakAt ? cols : "minmax(0,1fr)" }}>{children}</div>;
}
// 내용 폭(그래프 크기 계산용)
export function useBoxWidth(initial = 600) {
  const ref = React.useRef(null); const [w, setW] = React.useState(initial);
  React.useEffect(() => { const el = ref.current; if (!el || typeof ResizeObserver === "undefined") return undefined; const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, w];
}

// 골드 탭(세그먼트)
export function ExecTabs({ items, value, onChange, size = "md", className = "" }) {
  return (
    <div className={`inline-flex max-w-full overflow-x-auto no-scrollbar rounded-2xl p-1 gap-1 ${className}`} role="tablist" style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${EX.line}` }}>
      {items.map(([k, label, badge]) => {
        const on = k === value;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange?.(k)}
            className={`shrink-0 rounded-xl font-extrabold whitespace-nowrap transition ${size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-4 text-[13.5px]"}`}
            style={on ? { background: GOLD_GRAD, color: "#1A1408", boxShadow: "0 6px 18px rgba(215,188,130,.25)" } : { color: EX.sub }}>
            {label}{badge ? <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10.5px]" style={{ background: on ? "rgba(26,20,8,.18)" : "rgba(215,188,130,.22)", color: on ? "#1A1408" : EX.goldHi }}>{badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
// 버튼
export function ExecButton({ children, onClick, kind = "ghost", icon, className = "", disabled, title, type = "button" }) {
  const st = kind === "gold" ? { background: GOLD_GRAD, color: "#1A1408", border: "1px solid transparent", boxShadow: "0 8px 22px rgba(215,188,130,.25)" }
    : { background: "rgba(255,255,255,.05)", color: EX.text, border: `1px solid ${EX.line}` };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`h-10 px-4 rounded-xl text-[13px] font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap transition hover:brightness-110 disabled:opacity-40 ${className}`} style={st}>
      {icon}{children}
    </button>
  );
}
// 진행 막대
export function Meter({ value = 0, max = 100, color = EX.gold, height = 8, marker, className = "" }) {
  const p = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  const m = marker != null && max ? Math.max(0, Math.min(100, (marker / max) * 100)) : null;
  return (
    <div className={`relative w-full rounded-full overflow-visible ${className}`} style={{ height, background: "rgba(255,255,255,.07)" }}>
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: color === EX.gold ? GOLD_GRAD : color, boxShadow: `0 0 12px ${color === EX.gold ? "rgba(215,188,130,.35)" : "transparent"}` }} />
      {m != null && <div className="absolute -top-1 w-[2px] rounded" style={{ left: `calc(${m}% - 1px)`, height: height + 8, background: EX.text, opacity: 0.7 }} />}
    </div>
  );
}
// 원형 게이지
export function Ring({ value = 0, size = 72, stroke = 7, color = EX.gold, label, sub }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const p = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} style={{ filter: `drop-shadow(0 0 6px ${color}66)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none" style={EX_NUM}>
        <span style={{ fontSize: size * 0.24, fontWeight: 900, color: EX.text }}>{label ?? `${Math.round(p)}%`}</span>
        {sub && <span className="mt-1" style={{ fontSize: Math.max(9.5, size * 0.13), fontWeight: 700, color: EX.mute }}>{sub}</span>}
      </div>
    </div>
  );
}
// 작은 추이선
export function Sparkline({ data = [], color = EX.ice, height = 36, fill = true }) {
  const [ref, w] = useBoxWidth(160);
  const vals = data.map((x) => (typeof x === "number" ? x : Number(x?.v) || 0));
  const mn = Math.min(...vals); const mx = Math.max(...vals); const span = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / Math.max(1, vals.length - 1)) * (w - 4) + 2, height - 3 - ((v - mn) / span) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const id = React.useId().replace(/:/g, "");
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={height} className="block">
        <defs><linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {fill && pts.length > 1 && <path d={`${d} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#sg${id})`} />}
        <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} stroke={EX.bg1} strokeWidth="1.5" />}
      </svg>
    </div>
  );
}
// 순위 막대 목록
export function RankBars({ rows = [], valueFmt = fmtMoney, color = EX.gold, max, empty = "표시할 자료가 없습니다", right }) {
  if (!rows.length) return <Empty text={empty} />;
  const mx = max || Math.max(...rows.map((r) => Math.abs(r.value) || 0), 1);
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.key || r.label || i} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="w-5 shrink-0 text-right text-[12px] font-black" style={{ ...EX_NUM, color: i < 3 ? EX.gold : EX.faint }}>{i + 1}</span>
              <span className="text-[13.5px] font-bold truncate" style={{ color: EX.text }}>{r.label}</span>
              {r.sub && <span className="text-[12px] font-semibold truncate" style={{ color: EX.mute }}>{r.sub}</span>}
            </div>
            <div className="shrink-0 flex items-baseline gap-2">
              <span className="text-[14px] font-black" style={{ ...EX_NUM, color: EX.text }}>{valueFmt(r.value)}</span>
              {right ? right(r) : null}
            </div>
          </div>
          <div className="mt-1.5 ml-7"><Meter value={Math.abs(r.value)} max={mx} color={r.color || color} height={5} /></div>
        </li>
      ))}
    </ol>
  );
}
// 비어 있을 때
export function Empty({ text = "표시할 자료가 없습니다", sub, icon }) {
  return (
    <div className="rounded-2xl py-8 px-4 text-center" style={{ border: `1px dashed ${EX.line}` }}>
      {icon && <div className="mb-2 flex justify-center" style={{ color: EX.faint }}>{icon}</div>}
      <div className="text-[14px] font-bold" style={{ color: EX.sub }}>{text}</div>
      {sub && <div className="mt-1 text-[12.5px] font-medium" style={{ color: EX.mute }}>{sub}</div>}
    </div>
  );
}
// 상태 칩
export function Chip({ children, tone = "gold", className = "" }) {
  const t = { gold: [EX.goldHi, "rgba(215,188,130,.14)", "rgba(215,188,130,.35)"], ice: [EX.ice, "rgba(143,176,240,.12)", "rgba(143,176,240,.3)"], up: [EX.up, "rgba(255,138,122,.12)", "rgba(255,138,122,.3)"], down: [EX.down, "rgba(127,176,255,.12)", "rgba(127,176,255,.3)"], ok: [EX.ok, "rgba(143,217,182,.12)", "rgba(143,217,182,.3)"], warn: [EX.warn, "rgba(245,196,107,.12)", "rgba(245,196,107,.3)"], mute: [EX.sub, "rgba(255,255,255,.05)", EX.line] }[tone] || [];
  return <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11.5px] font-extrabold whitespace-nowrap ${className}`} style={{ color: t[0], background: t[1], border: `1px solid ${t[2]}` }}>{children}</span>;
}
// 표(임원 톤) — cols: [{ key, label, align, render, width }]
export function ExecTable({ cols = [], rows = [], rowKey = (r, i) => r.id || i, empty = "표시할 자료가 없습니다", onRow, maxHeight }) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto -mx-1" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className="w-full min-w-[520px] text-[13.5px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>{cols.map((c) => <th key={c.key} className={`sticky top-0 px-3 py-2.5 text-[11.5px] font-extrabold tracking-[0.04em] whitespace-nowrap ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`} style={{ color: EX.mute, background: EX.bg1, borderBottom: `1px solid ${EX.line}`, width: c.width }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "cursor-pointer hover:bg-white/[0.04]" : ""}>
              {cols.map((c) => <td key={c.key} className={`px-3 py-2.5 whitespace-nowrap ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"}`} style={{ ...(c.align === "right" ? EX_NUM : null), color: EX.text, borderBottom: "1px solid rgba(255,255,255,.05)" }}>{c.render ? c.render(r, i) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── recharts 공용 모양 ──
export const chartTheme = {
  grid: { stroke: "rgba(255,255,255,.06)", strokeDasharray: "3 6", vertical: false },
  axis: { stroke: "rgba(255,255,255,.12)", tick: { fill: "rgba(232,238,250,.55)", fontSize: 11.5, fontWeight: 600, fontFamily: EX_FONT }, tickLine: false, axisLine: false },
  cursor: { fill: "rgba(215,188,130,.07)" },
};
export function ExecTooltip({ active, payload, label, fmt = fmtWon, unit = "원", labelFmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3.5 py-2.5 text-[13px] shadow-2xl" style={{ background: "rgba(8,14,30,.96)", border: `1px solid ${EX.lineHi}`, color: EX.text, ...EX_NUM }}>
      <div className="mb-1.5 text-[12px] font-extrabold" style={{ color: EX.gold }}>{labelFmt ? labelFmt(label) : label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-5">
          <span className="inline-flex items-center gap-1.5" style={{ color: EX.sub }}><span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />{p.name}</span>
          <b className="font-black">{typeof p.value === "number" ? `${fmt(p.value, p)}${p.unit ?? unit}` : p.value}</b>
        </div>
      ))}
    </div>
  );
}
// 그래프 범례
export function Legend({ items = [] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map(([label, color, kind]) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: EX.sub }}>
          {kind === "line" ? <span className="w-4 h-[2px] rounded" style={{ background: color }} /> : <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} />}{label}
        </span>
      ))}
    </div>
  );
}

// 지금 시각(KST) · 날짜
export function ExecClock({ compact = false }) {
  const [t, setT] = React.useState(() => new Date(Date.now() + 9 * 3600e3));
  React.useEffect(() => { const i = setInterval(() => setT(new Date(Date.now() + 9 * 3600e3)), 1000); return () => clearInterval(i); }, []);
  const p = (n) => String(n).padStart(2, "0");
  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3.5 h-11" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${EX.line}`, ...EX_NUM }}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: EX.gold }} />
      {!compact && <span className="text-[12px] font-bold" style={{ color: EX.sub }}>{t.getUTCFullYear()}.{p(t.getUTCMonth() + 1)}.{p(t.getUTCDate())} <span style={{ color: EX.faint, letterSpacing: ".15em" }}>{DOW[t.getUTCDay()]}</span></span>}
      <span className="text-[17px] font-black" style={{ color: EX.text }}>{p(t.getUTCHours())}<span className="animate-pulse" style={{ color: EX.gold }}>:</span>{p(t.getUTCMinutes())}</span>
    </div>
  );
}

// 임원 화면용 바깥 틀(DispatchApp · 모바일이 임원 메뉴를 그릴 때 감싼다) — 회색 바탕 대신 깊은 남색
export function ExecCanvas({ children }) {
  return (
    <ExecModeContext.Provider value={true}>
      <div data-exec-canvas className="min-w-0" style={{ fontFamily: EX_FONT }}>{children}</div>
    </ExecModeContext.Provider>
  );
}
