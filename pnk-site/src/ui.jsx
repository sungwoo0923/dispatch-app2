// ======================= pnk-site/src/ui.jsx =======================
// 공용 화면 조각 — 공식 홈페이지와 같은 톤(화이트 · 스톤 · 차콜 · 토프), 대시보드 시각화 조각(Kpi · Spark · Ring · Meter · ChartTip)
/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createPortal } from "react-dom";
import Icon from "./icons";
// 로지스웹 프로그램의 달력 · 시간 · 월 고르기를 그대로 쓴다(Firebase를 쓰지 않는 순수 화면 조각 — 허브도 같은 방식)
import CustomDatePicker from "../../src/CustomDatePicker.jsx";
import { HourMinuteSelect, TimeSelect } from "../../src/kpTimePick.jsx";
import { MonthPicker } from "../../src/kpInputs.jsx";

export const cx = (...a) => a.filter(Boolean).join(" ");

// 카드 · 화면 머리 · 숫자 카드 — 공식 홈페이지와 같은 톤(흰 카드 · 얇은 테두리 · 영문 작은 라벨 Cormorant)
const CARD = "bg-white rounded-[14px] border border-line shadow-[0_1px_2px_rgba(31,29,26,0.04)]";
export function Eyebrow({ children, className = "", light }) {
  return <div className={cx("eng text-[11px] font-semibold", light ? "text-[#CDBB9C]" : "text-gold-deep", className)}>{children}</div>;
}
export function Card({ title, en, right, children, className = "", pad = true, dark }) {
  return (
    <section className={cx(dark ? "rounded-[14px] bg-navy-900 text-[#F3EFE9] border border-[#2E2A25]" : CARD, className)}>
      {(title || right) && (
        <div className={cx("flex items-center gap-3 px-5 min-h-[58px] py-2 border-b", dark ? "border-white/10" : "border-[#EFECE6]")}>
          <div className="min-w-0 flex-1">
            {en && <Eyebrow light={dark}>{en}</Eyebrow>}
            <h2 className={cx("text-[15px] font-bold truncate", dark ? "text-white" : "text-navy-950")}>{title}</h2>
          </div>
          {right}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

// 화면 머리 — 영문 라벨 · 제목 · 한 줄 요약 · 오른쪽 버튼(모든 화면이 같은 자리 · 같은 모양)
export function Hero({ title, desc, en, children }) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-6 min-h-[44px]">
      <div className="min-w-0 flex-1">
        {en && <Eyebrow className="mb-1">{en}</Eyebrow>}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[24px] md:text-[26px] font-semibold tracking-[-0.03em] text-navy-950 whitespace-nowrap">{title}</h1>
          {desc && <p className="text-[13.5px] font-medium text-navy-600 min-w-0">{desc}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
export function HeroBtn({ icon, children, onClick, active, sub }) {
  return (
    <button type="button" onClick={onClick} className={cx("inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] text-[13.5px] font-bold transition whitespace-nowrap",
      sub && !active ? "bg-white text-navy border border-[#DDD8D1] hover:border-navy-500" : "bg-navy text-white hover:bg-navy-700")}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

export function Stat({ icon, label, value, sub, onClick }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick} className={cx(CARD, "text-left px-5 py-4 flex items-center gap-4 min-w-0", onClick && "hover:border-navy-500 transition")}>
      <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border border-[#DDD8D1] text-navy-700"><Icon name={icon} size={19} /></div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-navy-600 truncate">{label}</div>
        <div className="text-[24px] font-semibold text-navy-950 tnum leading-tight truncate tracking-[-0.02em]">{value}</div>
        {sub && <div className="text-[12px] font-medium text-[#98928B] truncate">{sub}</div>}
      </div>
    </C>
  );
}

// ───────── 시각화 조각(대시보드 · 분석 화면 공용) ─────────
export const CH = { ink: "#2A2723", gold: "#B59B74", goldHi: "#D8C3A0", taupe: "#8B7A64", stone: "#D8D1C6", mist: "#EDE8E0", grid: "#EFECE6", axis: "#98928B", up: "#B42318", down: "#2F6B4F" };
export const CH_SERIES = ["#2A2723", "#B59B74", "#8B7A64", "#C9BBA6", "#6B655C", "#E2D8C8", "#3A3631", "#A39B8F"];
export const axisProps = { tick: { fontSize: 11.5, fill: "#98928B" }, axisLine: false, tickLine: false };
export function ChartTip({ active, payload, label, unit = "", fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] bg-navy-900 text-white px-3 py-2 shadow-xl text-[12px] min-w-[120px]">
      {label != null && <div className="eng text-[10px] text-[#CDBB9C] mb-1">{label}</div>}
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 tnum"><span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill || p.stroke }} /><span className="text-white/70">{p.name}</span><b className="ml-auto font-semibold">{fmt ? fmt(p.value) : `${Number(p.value).toLocaleString("ko-KR")}${unit}`}</b></div>
      ))}
    </div>
  );
}
// 작은 선 그래프(숫자 카드 안)
export function Spark({ data = [], color = "#B59B74", height = 34, fill = true }) {
  const id = React.useId().replace(/:/g, "");
  const n = data.length; if (n < 2) return <div style={{ height }} />;
  const max = Math.max(...data, 1), min = Math.min(...data, 0), w = 100, h = 30;
  const pts = data.map((v, i) => [(i / (n - 1)) * w, h - ((v - min) / (max - min || 1)) * (h - 4) - 2]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height }} aria-hidden="true">
      <defs><linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {fill && <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#sp${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
// 동그라미 진행률
export function Ring({ value = 0, max = 100, size = 64, stroke = 6, color = "#B59B74", track = "#EDE8E0", children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
// 가로 막대 진행률
export function Meter({ value = 0, max = 100, color = "#B59B74", track = "#EDE8E0", height = 6 }) {
  const p = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return <div className="w-full rounded-full overflow-hidden" style={{ height, background: track }}><div className="h-full rounded-full" style={{ width: `${p}%`, background: color, transition: "width .8s cubic-bezier(.2,.7,.2,1)" }} /></div>;
}
// 증감 표시(▲ 12% / ▼ 3%)
export function Delta({ now, prev, unit = "%", invert = false }) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  const d = ((now - prev) / Math.abs(prev)) * 100; if (!Number.isFinite(d)) return null;
  const good = invert ? d < 0 : d > 0;
  return <span className={cx("inline-flex items-center gap-0.5 text-[11.5px] font-semibold tnum", d === 0 ? "text-[#98928B]" : good ? "text-[#2F6B4F]" : "text-[#B42318]")}>{d > 0 ? "▲" : d < 0 ? "▼" : "–"} {Math.abs(Math.round(d))}{unit}</span>;
}
// 큰 숫자 카드(대시보드) — 라벨 · 숫자 · 단위 · 증감 · 작은 그래프 / dark: 차콜 바탕
export function Kpi({ en, label, value, unit, sub, delta, spark, dark, onClick, accent, className = "" }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("relative text-left rounded-[14px] px-5 pt-4 pb-3 min-w-0 overflow-hidden flex flex-col transition",
        dark ? "bg-navy-900 text-white border border-[#2E2A25]" : "bg-white border border-line hover:border-[#CFC7BB]", onClick && "cursor-pointer", className)}>
      {accent && <span className="absolute left-5 right-5 top-0 h-px gold-grad" />}
      {en && <Eyebrow light={dark}>{en}</Eyebrow>}
      <div className={cx("text-[12.5px] font-semibold mt-0.5 truncate", dark ? "text-white/70" : "text-navy-600")}>{label}</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 min-w-0">
        <span className={cx(String(value).length > 5 ? "text-[22px]" : "text-[28px]", "leading-none font-semibold tnum tracking-[-0.03em] whitespace-nowrap", dark && accent ? "gold-text" : dark ? "text-white" : "text-navy-950")}>{value}</span>
        {unit && <span className={cx("text-[13px] font-medium", dark ? "text-white/60" : "text-[#98928B]")}>{unit}</span>}
        {delta && <span className="ml-auto">{delta}</span>}
      </div>
      {sub && <div className={cx("mt-1.5 text-[12px] truncate", dark ? "text-white/55" : "text-[#98928B]")}>{sub}</div>}
      {spark && <div className="mt-2 -mx-1">{spark}</div>}
    </C>
  );
}
// 오른쪽 위 "전체 보기" 링크 모양
export const moreCls = "text-[12px] font-semibold text-gold-deep hover:text-navy-950 transition";

export function Btn({ kind = "primary", icon, children, className = "", ...p }) {
  const k = {
    primary: "bg-navy text-white hover:bg-navy-700",
    ghost: "bg-white text-navy border border-[#E9E6E1] hover:border-navy-500",
    soft: "bg-navy-100 text-navy hover:bg-[#F2EDE8]",
    danger: "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50",
  }[kind];
  return (
    <button type="button" {...p} className={cx("inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[13px] font-bold transition disabled:opacity-50 whitespace-nowrap", k, className)}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

export const inputCls = "w-full h-10 px-3 rounded-xl border border-[#E9E6E1] bg-white text-[14px] outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100";
export function Field({ label, children, hint, className = "" }) {
  return (
    <label className={cx("block", className)}>
      <span className="block mb-1 text-[12.5px] font-bold text-[#57514A]">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11.5px] text-[#98928B]">{hint}</span>}
    </label>
  );
}
export const Input = React.forwardRef(function Input(p, ref) { return <input ref={ref} {...p} className={cx(inputCls, p.className)} />; });
// ⭐ 드롭다운 — 검색 + 직접 입력(custom) 가능. 쓰는 법은 예전 <select>와 같다: value · onChange({ target: { value } }) · options([문자열] 또는 [{ key, label }])
//  · custom: 목록에 없는 값을 직접 써서 넣을 수 있다(부서 · 직책 · 항목 등). 목록에 없는 기존 값도 그대로 보인다.
//  · 항목이 7개 이상이거나 custom이면 위에 검색칸이 뜬다. 방향키 ↑↓ · Enter · Esc.
export function Select({ options = [], value = "", onChange, custom = false, placeholder = "선택", className = "", disabled = false, searchPlaceholder }) {
  const opts = options.map((o) => (typeof o === "string" ? { key: o, label: o } : o));
  const cur = opts.find((o) => String(o.key) === String(value));
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const [rect, setRect] = React.useState(null);
  const btn = React.useRef(null);
  const menu = React.useRef(null);
  const search = React.useRef(null);
  const showSearch = custom || opts.length >= 7;
  const ql = q.trim().toLowerCase();
  const list = ql ? opts.filter((o) => `${o.label} ${o.key}`.toLowerCase().includes(ql)) : opts;
  const canAdd = custom && q.trim() && !opts.some((o) => String(o.label).toLowerCase() === ql);
  const rows = canAdd ? [...list, { key: q.trim(), label: `"${q.trim()}" 직접 입력`, add: true }] : list;
  const place = () => { const r = btn.current?.getBoundingClientRect(); if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width, up: window.innerHeight - r.bottom < 300 && r.top > 300, bottom: window.innerHeight - r.top + 4 }); };
  const openIt = () => { if (disabled) return; place(); setQ(""); setHi(Math.max(0, opts.findIndex((o) => String(o.key) === String(value)))); setOpen(true); };
  const pick = (o) => { onChange?.({ target: { value: o.key } }); setOpen(false); btn.current?.focus(); };
  React.useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => search.current?.focus(), 10);
    const off = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const re = () => place();
    document.addEventListener("mousedown", off); window.addEventListener("resize", re); window.addEventListener("scroll", re, true);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", off); window.removeEventListener("resize", re); window.removeEventListener("scroll", re, true); };
  }, [open]);
  React.useEffect(() => { menu.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi, open]);
  const key = (e) => {
    if (e.nativeEvent?.isComposing) return;
    if (!open) { if (["Enter", " ", "ArrowDown"].includes(e.key)) { e.preventDefault(); openIt(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (rows[hi]) pick(rows[hi]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); }
  };
  return (
    <>
      <button ref={btn} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : openIt())} onKeyDown={key}
        className={cx(inputCls, "flex items-center gap-2 text-left disabled:bg-[#F8F7F6] disabled:text-[#98928B]", open && "border-navy-500 ring-2 ring-navy-100", className)}>
        <span className={cx("flex-1 truncate", !cur && !value && "text-[#B6B0A9]")}>{cur ? cur.label : value || placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={cx("shrink-0 text-[#98928B] transition", open && "rotate-180")}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && rect && createPortal(
        <div ref={menu} onKeyDown={key} style={{ position: "fixed", left: rect.left, width: Math.max(rect.width, 200), ...(rect.up ? { bottom: rect.bottom } : { top: rect.top }), zIndex: 9999 }}
          className="bg-white rounded-xl border border-line shadow-[0_16px_40px_rgba(38,33,25,0.18)] overflow-hidden">
          {showSearch && (
            <div className="p-2 border-b border-[#F4F2F0]">
              <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder={searchPlaceholder || (custom ? "검색 또는 직접 입력" : "검색")}
                className="w-full h-9 px-3 rounded-lg bg-navy-50 text-[13.5px] outline-none focus:ring-2 focus:ring-navy-100" />
            </div>
          )}
          <ul className="max-h-[260px] overflow-y-auto py-1">
            {rows.map((o, i) => (
              <li key={`${o.add ? "+" : ""}${o.key}`} data-i={i}>
                <button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(o)}
                  className={cx("w-full text-left px-3 py-2 text-[13.5px] flex items-center gap-2", i === hi && "bg-navy-50", String(o.key) === String(value) && !o.add && "font-black text-navy", o.add && "text-navy-500 font-bold")}>
                  <span className="flex-1 truncate">{o.label}</span>
                  {String(o.key) === String(value) && !o.add && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="m5 12 5 5 9-10" /></svg>}
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-3 py-3 text-[13px] text-[#98928B]">검색 결과가 없습니다.</li>}
          </ul>
        </div>, document.body)}
    </>
  );
}

// 📅 날짜 · 시간 · 월 — 로지스웹 프로그램과 같은 달력(CustomDatePicker · 공휴일 표시) · 시간 목록(10분 단위) · 월 선택
export function DateInput({ value, onChange, placeholder = "날짜 선택", className = "", ...p }) {
  return <CustomDatePicker value={value || ""} onChange={onChange} placeholder={placeholder} showIcon className={cx(inputCls, className)} {...p} />;
}
export function TimeInput({ value, onChange, placeholder = "시간 선택", className = "" }) {
  return <TimeSelect value={value || ""} onChange={onChange} placeholder={placeholder} className={cx(inputCls, className)} />;
}
// 1분 단위(시 · 분 두 칸) — 출퇴근 기록 고치기처럼 정확한 분이 필요한 곳
export function HourMinuteInput({ value, onChange, className = "" }) {
  return <HourMinuteSelect value={value || ""} onChange={onChange} className={cx(inputCls, className)} />;
}
export { MonthPicker };

export function Textarea(p) { return <textarea rows={6} {...p} className={cx(inputCls, "h-auto py-2.5 leading-relaxed", p.className)} />; }

export function Modal({ open, title, onClose, children, footer, wide }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[#262119]/45 p-0 md:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={cx("bg-white w-full rounded-t-[22px] md:rounded-[22px] shadow-2xl flex flex-col max-h-[92vh]", wide ? "md:max-w-[860px]" : "md:max-w-[560px]")}>
        <div className="flex items-center px-5 py-4 border-b border-[#F4F2F0]">
          <h3 className="flex-1 text-[16px] font-black text-navy-950 truncate">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#98928B] hover:bg-navy-50" aria-label="닫기"><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[#F4F2F0] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Empty({ icon = "inbox", children }) {
  return (
    <div className="py-10 flex flex-col items-center text-center text-[#98928B]">
      <div className="w-12 h-12 rounded-2xl bg-navy-50 flex items-center justify-center mb-2"><Icon name={icon} size={22} /></div>
      <div className="text-[13.5px] font-semibold">{children}</div>
    </div>
  );
}
export function Loading() { return <div className="py-10 text-center text-[13px] font-semibold text-[#98928B]">불러오는 중…</div>; }

export function Chip({ children, tone = "navy", className = "" }) {
  const t = { gold: "bg-[#F3EADB] text-[#7A6446]", navy: "bg-navy-100 text-navy", dark: "bg-navy text-white", gray: "bg-[#F4F3F2] text-[#77716A]", red: "bg-rose-50 text-rose-600", green: "bg-emerald-50 text-emerald-700" }[tone];
  return <span className={cx("inline-flex items-center h-6 px-2 rounded-lg text-[11.5px] font-black whitespace-nowrap", t, className)}>{children}</span>;
}

// 위쪽 탭(화면 안 작은 메뉴)
export function Tabs({ items, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-white border border-line rounded-xl overflow-x-auto no-scrollbar mb-4 w-fit max-w-full">
      {items.map((it) => (
        <button key={it.key} type="button" onClick={() => onChange(it.key)}
          className={cx("h-9 px-4 rounded-lg text-[13px] font-bold whitespace-nowrap transition", value === it.key ? "bg-navy text-white" : "text-[#77716A] hover:bg-navy-50")}>
          {it.label}{it.badge > 0 && <span className="ml-1.5 text-[11px] opacity-80">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export const errMsg = (e) => (e?.code === "permission-denied" ? "권한이 없습니다. 관리자에게 문의해 주세요." : e?.message || String(e));
export const fail = (e) => window.alert(errMsg(e));
