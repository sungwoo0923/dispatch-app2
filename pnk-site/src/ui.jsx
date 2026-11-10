// ======================= pnk-site/src/ui.jsx =======================
// 공용 화면 조각 — 로지스웹 관리 화면(AdminShell · PlatformCenter)과 같은 모양: 흰 카드 · 둥근 모서리 · 네이비 버튼
/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { createPortal } from "react-dom";
import Icon from "./icons";
// 로지스웹 프로그램의 달력 · 시간 · 월 고르기를 그대로 쓴다(Firebase를 쓰지 않는 순수 화면 조각 — 허브도 같은 방식)
import CustomDatePicker from "../../src/CustomDatePicker.jsx";
import { HourMinuteSelect, TimeSelect } from "../../src/kpTimePick.jsx";
import { MonthPicker } from "../../src/kpInputs.jsx";

export const cx = (...a) => a.filter(Boolean).join(" ");

export function Card({ title, en, right, children, className = "", pad = true }) {
  return (
    <section className={cx("bg-white rounded-[20px] border border-line shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]", className)}>
      {(title || right) && (
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-[#EEF1F6]">
          <div className="min-w-0 flex-1">
            {en && <div className="text-[10.5px] font-extrabold tracking-[0.16em] text-[#7A8AA8]">{en}</div>}
            {title && <h2 className="text-[16px] font-black text-navy-950 truncate">{title}</h2>}
          </div>
          {right}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

// 상단 인사 카드(로지스웹 AdminShell 히어로와 같은 그라데이션)
export function Hero({ en, title, desc, children }) {
  return (
    <section className="relative overflow-hidden rounded-[26px] px-6 md:px-8 py-6 md:py-7 text-white mb-5 shadow-[0_14px_34px_rgba(27,43,75,0.25)]"
      style={{ background: "linear-gradient(120deg, #1B2B4B 0%, #233B66 55%, #2D4C82 100%)" }}>
      <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.06]" />
      <div className="absolute right-40 -bottom-24 w-56 h-56 rounded-full bg-white/[0.05]" />
      <div className="relative">
        {en && <div className="text-[11px] font-extrabold tracking-[0.18em] text-blue-200/80">{en}</div>}
        <h1 className="mt-1 text-[22px] md:text-[26px] font-black tracking-tight">{title}</h1>
        {desc && <p className="mt-1.5 text-[14px] font-medium text-blue-50/90">{desc}</p>}
        {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  );
}
export function HeroBtn({ icon, children, onClick, active }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold ring-1 transition",
      active ? "bg-white text-navy ring-white" : "bg-white/10 ring-white/20 hover:bg-white/20")}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

export function Stat({ icon, label, value, sub, onClick }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick} className={cx("text-left bg-white rounded-[20px] border border-line shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] px-5 py-4 flex items-center gap-4 min-w-0", onClick && "hover:border-navy-500 transition")}>
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-navy-100 text-navy"><Icon name={icon} size={21} /></div>
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-gray-600 truncate">{label}</div>
        <div className="text-[24px] font-black text-navy-950 tnum leading-tight truncate">{value}</div>
        {sub && <div className="text-[12px] font-semibold text-[#7A8AA8] truncate">{sub}</div>}
      </div>
    </C>
  );
}

export function Btn({ kind = "primary", icon, children, className = "", ...p }) {
  const k = {
    primary: "bg-navy text-white hover:bg-navy-700",
    ghost: "bg-white text-navy border border-[#DCE3EE] hover:border-navy-500",
    soft: "bg-navy-100 text-navy hover:bg-[#E2EAF7]",
    danger: "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50",
  }[kind];
  return (
    <button type="button" {...p} className={cx("inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-[13px] font-black transition disabled:opacity-50 whitespace-nowrap", k, className)}>
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

export const inputCls = "w-full h-10 px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100";
export function Field({ label, children, hint, className = "" }) {
  return (
    <label className={cx("block", className)}>
      <span className="block mb-1 text-[12.5px] font-bold text-[#3A4A66]">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11.5px] text-[#7A8AA8]">{hint}</span>}
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
        className={cx(inputCls, "flex items-center gap-2 text-left disabled:bg-[#F4F6FA] disabled:text-[#7A8AA8]", open && "border-navy-500 ring-2 ring-navy-100", className)}>
        <span className={cx("flex-1 truncate", !cur && !value && "text-[#A0ABBE]")}>{cur ? cur.label : value || placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={cx("shrink-0 text-[#7A8AA8] transition", open && "rotate-180")}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && rect && createPortal(
        <div ref={menu} onKeyDown={key} style={{ position: "fixed", left: rect.left, width: Math.max(rect.width, 200), ...(rect.up ? { bottom: rect.bottom } : { top: rect.top }), zIndex: 9999 }}
          className="bg-white rounded-xl border border-line shadow-[0_16px_40px_rgba(15,26,48,0.18)] overflow-hidden">
          {showSearch && (
            <div className="p-2 border-b border-[#EEF1F6]">
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
            {rows.length === 0 && <li className="px-3 py-3 text-[13px] text-[#7A8AA8]">검색 결과가 없습니다.</li>}
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[#0F1A30]/45 p-0 md:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={cx("bg-white w-full rounded-t-[22px] md:rounded-[22px] shadow-2xl flex flex-col max-h-[92vh]", wide ? "md:max-w-[860px]" : "md:max-w-[560px]")}>
        <div className="flex items-center px-5 py-4 border-b border-[#EEF1F6]">
          <h3 className="flex-1 text-[16px] font-black text-navy-950 truncate">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7A8AA8] hover:bg-navy-50" aria-label="닫기"><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-[#EEF1F6] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Empty({ icon = "inbox", children }) {
  return (
    <div className="py-10 flex flex-col items-center text-center text-[#7A8AA8]">
      <div className="w-12 h-12 rounded-2xl bg-navy-50 flex items-center justify-center mb-2"><Icon name={icon} size={22} /></div>
      <div className="text-[13.5px] font-semibold">{children}</div>
    </div>
  );
}
export function Loading() { return <div className="py-10 text-center text-[13px] font-semibold text-[#7A8AA8]">불러오는 중…</div>; }

export function Chip({ children, tone = "navy", className = "" }) {
  const t = { navy: "bg-navy-100 text-navy", dark: "bg-navy text-white", gray: "bg-[#F0F2F6] text-[#5A6A86]", red: "bg-rose-50 text-rose-600", green: "bg-emerald-50 text-emerald-700" }[tone];
  return <span className={cx("inline-flex items-center h-6 px-2 rounded-lg text-[11.5px] font-black whitespace-nowrap", t, className)}>{children}</span>;
}

// 위쪽 탭(화면 안 작은 메뉴)
export function Tabs({ items, value, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-white border border-line rounded-2xl overflow-x-auto no-scrollbar mb-4 w-fit max-w-full">
      {items.map((it) => (
        <button key={it.key} type="button" onClick={() => onChange(it.key)}
          className={cx("h-9 px-4 rounded-xl text-[13px] font-black whitespace-nowrap transition", value === it.key ? "bg-navy text-white" : "text-[#5A6A86] hover:bg-navy-50")}>
          {it.label}{it.badge > 0 && <span className="ml-1.5 text-[11px] opacity-80">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export const errMsg = (e) => (e?.code === "permission-denied" ? "권한이 없습니다. 관리자에게 문의해 주세요." : e?.message || String(e));
export const fail = (e) => window.alert(errMsg(e));
