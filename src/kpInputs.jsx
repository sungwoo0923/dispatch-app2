// ======================= src/kpInputs.jsx =======================
// 🧩 공용 입력칸 — 배차관리와 같은 모양
//  · TimeSelect: 오전/오후 · 시 · 분 드롭다운(비우면 "즉시" 또는 원하는 빈 값 문구) — 저장값 "HH:MM" 또는 ""
//  · MultiDateSelect: 프로그램 달력에서 날짜 여러 개 고르기(쉬는 날 등)
import React from "react";
import { createPortal } from "react-dom";
import { CustomSelect } from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";

const pad = (n) => String(n).padStart(2, "0");
export const korTimeLabel = (hm, empty = "즉시") => { if (!hm) return empty; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`; };

export function TimeSelect({ value = "", onChange, emptyLabel = "즉시", className = "", minuteStep = 10 }) {
  const [h, m] = value ? value.split(":").map(Number) : [null, null];
  const ap = h == null ? "" : h < 12 ? "오전" : "오후";
  const h12 = h == null ? "" : String(h % 12 || 12);
  const set = (nap, nh, nm) => {
    if (!nap) return onChange("");
    const hh = Number(nh || 9) % 12 + (nap === "오후" ? 12 : 0);
    onChange(`${pad(hh)}:${pad(Number(nm || 0))}`);
  };
  const box = `h-10 px-2.5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#0F1A30] ${className}`;
  const mins = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  return (
    <div className="flex items-center gap-1.5">
      <CustomSelect value={ap} onChange={(e) => set(e.target.value, h12 || "9", m ?? 0)} className={`${box} w-[92px]`}>
        <option value="">{emptyLabel}</option>
        <option value="오전">오전</option>
        <option value="오후">오후</option>
      </CustomSelect>
      {ap && <>
        <CustomSelect value={h12} onChange={(e) => set(ap, e.target.value, m ?? 0)} className={`${box} w-[76px]`}>
          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((x) => <option key={x} value={x}>{x}시</option>)}
        </CustomSelect>
        <CustomSelect value={String(m ?? 0)} onChange={(e) => set(ap, h12, e.target.value)} className={`${box} w-[76px]`}>
          {(mins.includes(m ?? 0) ? mins : [...mins, m].sort((a, b) => a - b)).map((x) => <option key={x} value={String(x)}>{pad(x)}분</option>)}
        </CustomSelect>
      </>}
    </div>
  );
}

export function MultiDateSelect({ value = [], onChange, className = "", placeholder = "날짜 고르기" }) {
  const [active, setActive] = React.useState(true);
  return (
    <CustomDatePicker value={value[value.length - 1] || ""} onChange={() => {}} className={className} placeholder={placeholder} showIcon
      multiSelect multiActive={active} onToggleMulti={() => setActive((v) => !v)} workDates={value}
      onToggleWorkDate={(d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
      onClearWorkDates={() => onChange([])}
      displayOverride={value.length ? `${value.length}일 선택` : placeholder} />
  );
}

// 📅 월 선택 — 프로그램 달력 모양(연도 ‹ › + 12개월) · 옆에 [당월][전월] 바로가기
export const kstYm = (offset = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
export function MonthPicker({ value, onChange, dark = false, quick = true, className = "" }) {
  const [open, setOpen] = React.useState(false);
  const [year, setYear] = React.useState(Number(String(value || kstYm()).slice(0, 4)));
  const btnRef = React.useRef(null);
  const [rect, setRect] = React.useState(null);
  const toggle = () => { if (!open && btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setRect({ left: Math.min(r.left, window.innerWidth - 300), top: r.bottom + 6 }); setYear(Number(String(value || kstYm()).slice(0, 4))); } setOpen((v) => !v); };
  React.useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!e.target.closest?.("[data-kp-monthpop]") && !btnRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", close); window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  const [y, m] = String(value || "").split("-");
  const cur = kstYm(); const prev = kstYm(-1);
  const chip = (label, ym) => (
    <button type="button" onClick={() => onChange(ym)} className={`h-10 px-3.5 rounded-xl text-[13.5px] font-black whitespace-nowrap transition ${value === ym
      ? (dark ? "bg-white text-[#0F1A30]" : "bg-[#0F1A30] text-white")
      : (dark ? "bg-white/10 border border-white/20 text-white hover:bg-white/15" : "bg-white border border-[#DCE3EE] text-[#1B2B4B] hover:bg-[#F5F8FD]")}`}>{label}</button>
  );
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button ref={btnRef} type="button" onClick={toggle}
        className={`h-10 pl-3.5 pr-3 rounded-xl inline-flex items-center gap-2 text-[15px] font-black whitespace-nowrap ${dark ? "bg-white/10 border border-white/25 text-white" : "bg-white border border-[#DCE3EE] text-[#0F1A30]"}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        {y ? `${y}년 ${Number(m)}월` : "월 선택"}
        <span className="opacity-60 text-[11px]">▾</span>
      </button>
      {quick && chip("당월", cur)}
      {quick && chip("전월", prev)}
      {open && rect && createPortal(
        <div data-kp-monthpop="1" data-kp-popup="1" style={{ position: "fixed", left: rect.left, top: rect.top, zIndex: 2147483000 }}
          className="w-[290px] rounded-2xl bg-white border border-[#DCE3EE] shadow-[0_22px_50px_rgba(11,20,40,.25)] overflow-hidden">
          <div className="px-3 py-2.5 flex items-center justify-between text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
            <button type="button" onClick={() => setYear((v) => v - 1)} className="w-8 h-8 rounded-lg hover:bg-white/10 text-[16px] font-black">‹</button>
            <span className="text-[15px] font-black tabular-nums">{year}년</span>
            <button type="button" onClick={() => setYear((v) => v + 1)} className="w-8 h-8 rounded-lg hover:bg-white/10 text-[16px] font-black">›</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 p-3">
            {Array.from({ length: 12 }, (_, i) => {
              const ym = `${year}-${pad(i + 1)}`; const on = ym === value; const isCur = ym === cur;
              return <button key={ym} type="button" onClick={() => { onChange(ym); setOpen(false); }}
                className={`h-11 rounded-xl text-[14px] font-black transition ${on ? "bg-[#0F1A30] text-white" : isCur ? "border-2 border-[#2D4C82] text-[#0F1A30]" : "text-[#3A4A66] hover:bg-[#EEF3FC]"}`}>{i + 1}월</button>;
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
