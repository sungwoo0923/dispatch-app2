// ======================= cafe-site/src/hub/hubUi.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브 콜 — 화면 부품(로지스웹 디자인 언어: 네이비 #0B1428/#0F1A30/#1B2B4B/#2D4C82 + 포인트 #8FB0F0)
//  기본 산세리프 글꼴만(고정폭 글꼴 없음) · 휴대폰 글자 15px 이상 · 누르는 곳 48px 이상
import React, { useEffect, useState } from "react";
import { fileUrl } from "./hubApi";

const P = {
  truck: <><rect x="1" y="6" width="13" height="10" rx="1.5" /><path d="M14 9h4l3 3v4h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  building: <><path d="M4 21V5l8-2v18M12 7l8 2v12" /><path d="M8 9h.01M8 13h.01M8 17h.01M16 13h.01M16 17h.01" /></>,
  swap: <><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 14h8" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  bolt: <><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  back: <><path d="M19 12H5M11 18l-6-6 6-6" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  down: <><path d="m6 9 6 6 6-6" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  star: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></>,
  check: <><path d="m5 12 5 5 9-10" /></>,
  pin: <><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.4L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.6 4.4L21 15" /><path d="M21 20v-5h-5" /></>,
  gps: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>,
  heart: <><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" /></>,
  volume: <><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>,
  camera: <><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  upload: <><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  won: <><path d="m4 6 3 12 5-10 5 10 3-12" /><path d="M3 11h18" /></>,
  flag: <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
  live: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  memo: <><path d="M4 4h16v12l-4 4H4z" /><path d="M8 9h8M8 13h5" /></>,
  // ⭐ 2026-11-06 예치금 · 관제 · 스캔 · 설정 · 공지
  wallet: <><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" /><circle cx="16" cy="14.5" r="1.3" /></>,
  map: <><path d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7z" /><path d="M9 4v13M15 7v13" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M3 12h18" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M17 8a5 5 0 0 1 0 8" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
};
export function HI({ name, size = 18, className = "", stroke = 2, fill = "none" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name] || P.board}
    </svg>
  );
}

export const NAVY_BG = {
  background:
    "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/26px 26px, radial-gradient(120% 140% at 90% -20%, #2D4C82 0%, #1B2B4B 40%, #0F1A30 72%, #0B1428 100%)",
};
export const NUMS = { fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" };
export const GRAD = { background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 55%,#2D4C82 100%)" };

export function Btn({ kind = "primary", size = "lg", className = "", children, ...rest }) {
  const h = size === "xl" ? "h-14 text-[17px] px-6" : size === "lg" ? "h-12 text-[16px] px-5" : "h-10 text-[15px] px-4";
  const k = {
    primary: "text-white shadow-[0_12px_28px_rgba(11,20,40,.28)] hover:brightness-110",
    accent: "bg-[#8FB0F0] text-[#0B1428] hover:brightness-105 shadow-[0_10px_24px_rgba(143,176,240,.35)]",
    ghost: "bg-white text-[#1B2B4B] ring-1 ring-inset ring-[#D6DEEA] hover:bg-[#F5F8FD]",
    dark: "bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15",
    danger: "bg-white text-[#0F1A30] ring-2 ring-inset ring-[#0F1A30] hover:bg-[#0F1A30] hover:text-white",
    soft: "bg-[#EAF0FA] text-[#1B2B4B] hover:bg-[#DCE7FA]",
  }[kind];
  return (
    <button type="button" {...rest} style={kind === "primary" ? GRAD : undefined}
      className={`${h} rounded-2xl font-bold inline-flex items-center justify-center gap-2 transition active:scale-[.985] disabled:opacity-45 disabled:pointer-events-none select-none ${k} ${className}`}>
      {children}
    </button>
  );
}
export const inputCls = "w-full h-12 px-4 rounded-2xl border border-[#D6DEEA] bg-white text-[16px] font-medium text-[#0F1A30] outline-none transition focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 placeholder:text-[#66758E]";
export const selectCls = `${inputCls} hub-select appearance-none pr-10 bg-no-repeat bg-[right_14px_center] bg-[length:16px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2355657F%22 stroke-width=%222.4%22><path d=%22m6 9 6 6 6-6%22/></svg>')]`;

export function Field({ label, hint, required, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[15px] font-bold text-[#3A4A66]">{label}{required && <span className="text-[#2D4C82] ml-0.5">*</span>}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[14px] text-[#5F6E87] leading-snug">{hint}</div>}
    </label>
  );
}
export function Chip({ on, children, className = "", ...rest }) {
  return (
    <button type="button" aria-pressed={!!on} {...rest}
      className={`h-11 px-4 rounded-full text-[15px] font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition shrink-0 ${on ? "bg-[#0F1A30] text-white shadow-[0_6px_16px_rgba(11,20,40,.22)]" : "bg-white text-[#3A4A66] ring-1 ring-inset ring-[#D6DEEA] hover:ring-[#2D4C82]"} ${className}`}>
      {children}
    </button>
  );
}
export function Seg({ value, onChange, options, className = "" }) {
  return (
    <div className={`grid gap-1 p-1 rounded-2xl bg-[#EEF2F8] ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          className={`h-11 rounded-xl text-[15px] font-bold transition ${value === k ? "bg-white text-[#0F1A30] shadow-[0_2px_8px_rgba(15,26,48,.12)]" : "text-[#55657F]"}`}>{l}</button>
      ))}
    </div>
  );
}
export function Badge({ children, tone = "line", className = "" }) {
  const t = {
    line: "bg-[#F2F5FA] text-[#3A4A66]",
    navy: "bg-[#0F1A30] text-white",
    blue: "bg-[#2D4C82] text-white",
    accent: "bg-[#0F1A30] text-[#8FB0F0]",
    sky: "bg-[#EAF0FA] text-[#1B2B4B]",
    out: "bg-white text-[#1B2B4B] ring-1 ring-inset ring-[#C7D3E8]",
    glass: "bg-white/10 text-white ring-1 ring-inset ring-white/15",
  }[tone];
  return <span className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[13.5px] font-bold shrink-0 whitespace-nowrap ${t} ${className}`}>{children}</span>;
}
export function Card({ children, className = "", ...rest }) {
  return <div {...rest} className={`bg-white rounded-[22px] ring-1 ring-inset ring-[#E2E7EF] shadow-[0_1px_2px_rgba(15,26,48,.04),0_10px_30px_rgba(15,26,48,.05)] ${className}`}>{children}</div>;
}
export function Stars({ value = 0, onChange, size = 20 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value);
        const s = <HI name="star" size={size} fill={on ? "currentColor" : "none"} stroke={1.6} />;
        return onChange
          ? <button key={n} type="button" aria-label={`${n}점`} onClick={() => onChange(n)} className={`w-11 h-11 inline-flex items-center justify-center ${on ? "text-[#2D4C82]" : "text-[#C9D2E0]"}`}>{s}</button>
          : <span key={n} className={on ? "text-[#2D4C82]" : "text-[#D3DAE6]"}>{s}</span>;
      })}
    </span>
  );
}

// 상·하차 경로 — 점 두 개를 잇는 세로 선(카드·상세 공용)
export function RouteLine({ from, to, fromSub, toSub, km, dark = false, big = false }) {
  const t = dark ? "text-white" : "text-[#0F1A30]";
  const s = dark ? "text-white/55" : "text-[#5F6E87]";
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-[7px] shrink-0">
        <span className={`w-3 h-3 rounded-full ring-[3px] ${dark ? "bg-[#0B1428] ring-[#8FB0F0]" : "bg-white ring-[#2D4C82]"}`} />
        <span className={`w-[2px] flex-1 my-1 ${dark ? "bg-gradient-to-b from-[#8FB0F0] to-white/30" : "bg-gradient-to-b from-[#2D4C82] to-[#0F1A30]"} rounded`} style={{ minHeight: big ? 34 : 26 }} />
        <span className={`w-3 h-3 rounded-[4px] ${dark ? "bg-white" : "bg-[#0F1A30]"}`} />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
        <div className="min-w-0">
          <div className={`${big ? "text-[22px]" : "text-[18px]"} font-extrabold leading-tight truncate ${t}`}>{from}</div>
          {fromSub && <div className={`text-[14px] font-semibold mt-0.5 truncate ${s}`}>{fromSub}</div>}
        </div>
        {km ? <div className={`text-[13.5px] font-bold ${dark ? "text-[#8FB0F0]" : "text-[#2D4C82]"}`}>약 {km.toLocaleString()}km</div> : null}
        <div className="min-w-0">
          <div className={`${big ? "text-[22px]" : "text-[18px]"} font-extrabold leading-tight truncate ${t}`}>{to}</div>
          {toSub && <div className={`text-[14px] font-semibold mt-0.5 truncate ${s}`}>{toSub}</div>}
        </div>
      </div>
    </div>
  );
}

// 시트 — 휴대폰: 아래에서 올라오는 전체 화면 / PC: 오른쪽 서랍
export function Drawer({ onClose, children, width = 560, title, sub, closeOnBackdrop = true, testid }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape" && closeOnBackdrop) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose, closeOnBackdrop]);
  return (
    <div className="fixed inset-0 z-[900] flex justify-end bg-[#0B1428]/55 backdrop-blur-[2px] hub-fade" onClick={closeOnBackdrop ? onClose : undefined}>
      <div data-testid={testid} className="hub-drawer w-full h-full bg-[#EEF1F6] flex flex-col shadow-[-30px_0_80px_rgba(11,20,40,.35)]" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        {title !== undefined && (
          <div className="shrink-0 flex items-center gap-2 px-3 lg:px-5 h-16 bg-white border-b border-[#E2E7EF]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <button type="button" onClick={onClose} aria-label="닫기" className="w-12 h-12 -ml-1 rounded-2xl inline-flex items-center justify-center text-[#0F1A30] hover:bg-[#F2F5FA]"><HI name="back" size={22} /></button>
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-extrabold text-[#0F1A30] truncate">{title}</div>
              {sub && <div className="text-[13.5px] font-semibold text-[#5F6E87] truncate">{sub}</div>}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// 가운데 확인 창
export function Confirm({ title, body, okText = "확인", cancelText = "닫기", onOk, onCancel, children }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-[#0B1428]/60 hub-fade" onClick={onCancel}>
      <div className="w-full sm:max-w-[420px] bg-white rounded-t-[26px] sm:rounded-[26px] p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-[0_30px_80px_rgba(11,20,40,.45)]" onClick={(e) => e.stopPropagation()}>
        <div className="text-[19px] font-extrabold text-[#0F1A30]">{title}</div>
        {body && <div className="mt-2 text-[15.5px] text-[#55657F] leading-relaxed whitespace-pre-line">{body}</div>}
        {children}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Btn kind="ghost" onClick={onCancel}>{cancelText}</Btn>
          {onOk && <Btn onClick={onOk}>{okText}</Btn>}
        </div>
      </div>
    </div>
  );
}

// 토스트(짧은 안내)
export function useToast() {
  const [t, setT] = useState(null);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), t.ms || 2600); return () => clearTimeout(id); }, [t]);
  const show = (msg, ms) => setT({ msg, ms, k: Date.now() });
  const node = t ? (
    <div key={t.k} role="status" className="fixed left-1/2 -translate-x-1/2 top-[calc(72px+env(safe-area-inset-top))] lg:top-auto lg:bottom-8 z-[1100] max-w-[92vw] px-5 py-3.5 rounded-2xl bg-[#0B1428] text-white text-[15.5px] font-bold shadow-[0_18px_40px_rgba(11,20,40,.45)] hub-pop">
      {t.msg}
    </div>
  ) : null;
  return [node, show];
}

// 프로필 사진(Storage 경로) — 없으면 이니셜
export function Avatar({ path, name, size = 52, dark = false }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let on = true; if (path) fileUrl(path).then((u) => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [path]);
  return url
    ? <img src={url} alt="" className="rounded-2xl object-cover shrink-0" style={{ width: size, height: size }} />
    : <span className={`rounded-2xl shrink-0 inline-flex items-center justify-center font-extrabold ${dark ? "bg-white/10 text-white" : "bg-[#EAF0FA] text-[#1B2B4B]"}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>{String(name || "?").slice(0, 1)}</span>;
}

// 10초 원형 카운트다운
export function Ring({ ms, total = 10000, size = 76 }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, frac = Math.max(0, Math.min(1, ms / total));
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.15)" strokeWidth="6" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#8FB0F0" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset .2s linear" }} />
      </svg>
      <span className="absolute text-[26px] font-extrabold text-white" style={NUMS} data-testid="countdown">{Math.ceil(ms / 1000)}</span>
    </span>
  );
}

export function Empty({ icon = "inbox", title, desc, action }) {
  return (
    <div className="py-14 px-6 text-center bg-white rounded-[22px] ring-1 ring-inset ring-[#E2E7EF]">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-[#F2F5FA] flex items-center justify-center text-[#5F6E87]"><HI name={icon} size={26} /></div>
      <div className="mt-4 text-[17px] font-extrabold text-[#0F1A30]">{title}</div>
      {desc && <div className="mt-1.5 text-[15px] text-[#5F6E87] leading-relaxed">{desc}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// 허브 마크(로지스웹 마크 + HUB)
export function HubMark({ size = 36, dark = true, label = true }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <img src="/brand/logisweb-mark-square.svg" alt="" width={size} height={size} className="rounded-[10px] shrink-0" style={{ width: size, height: size }} />
      {label && (
        <span className="flex flex-col leading-none gap-1">
          <span className="flex items-center gap-1.5">
            <span aria-label="LogisWeb" role="img" className="block" style={{ height: Math.round(size * 0.36), width: Math.round(size * 0.36) * (8.0256 /* 🔷 2026-11-14 새 글자 로고 가로세로 비율 */), backgroundColor: dark ? "#fff" : "#0F1A30", WebkitMask: "url(/brand/logisweb-wordmark.svg) no-repeat center / contain", mask: "url(/brand/logisweb-wordmark.svg) no-repeat center / contain" }} />
            <span className="font-extrabold rounded-md px-1.5 h-[18px] text-[13px] inline-flex items-center" style={{ background: dark ? "#8FB0F0" : "#1B2B4B", color: dark ? "#0B1428" : "#fff", letterSpacing: "0.06em" }}>HUB</span>
          </span>
          <span className={`text-[13px] font-semibold ${dark ? "text-white/55" : "text-[#5F6E87]"}`}>로지스웹 허브, 화물 콜</span>
        </span>
      )}
    </span>
  );
}

// 파일 고르기(서류 · 사진) — 이미지면 미리보기
export function FilePick({ label, required, value, onPick, accept = "image/*,application/pdf", testid, busy }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (value?.file && value.file.type?.startsWith("image/")) { const u = URL.createObjectURL(value.file); setPreview(u); return () => URL.revokeObjectURL(u); }
    setPreview("");
  }, [value?.file]);
  const done = !!(value?.file || value?.path);
  return (
    <label className={`flex items-center gap-3 p-3 rounded-2xl ring-1 ring-inset cursor-pointer transition ${done ? "bg-[#F3F7FE] ring-[#B9CBEB]" : "bg-white ring-[#D6DEEA] hover:ring-[#2D4C82]"}`}>
      <span className={`w-12 h-12 rounded-xl overflow-hidden shrink-0 inline-flex items-center justify-center ${done ? "bg-[#2D4C82] text-white" : "bg-[#F2F5FA] text-[#5F6E87]"}`}>
        {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <HI name={done ? "check" : "upload"} size={20} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-bold text-[#0F1A30]">{label}{required && <span className="text-[#2D4C82] ml-0.5">*</span>}</span>
        <span className="block text-[13.5px] text-[#5F6E87] truncate">{busy ? "올리고 있어요" : value?.file?.name || value?.name || (required ? "사진 또는 PDF (10MB 이하)" : "선택, 사진 또는 PDF")}</span>
      </span>
      <span className="text-[14px] font-bold text-[#2D4C82] shrink-0">{done ? "바꾸기" : "올리기"}</span>
      <input type="file" accept={accept} className="sr-only" data-testid={testid} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }} />
    </label>
  );
}

export const HUB_CSS = `
@keyframes hubFade{from{opacity:0}to{opacity:1}}
@keyframes hubUp{from{transform:translateY(24px);opacity:.4}to{transform:none;opacity:1}}
@keyframes hubSide{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes hubPop{from{transform:translate(-50%,12px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes hubNew{0%{box-shadow:0 0 0 0 rgba(143,176,240,.9)}100%{box-shadow:0 0 0 14px rgba(143,176,240,0)}}
.hub-fade{animation:hubFade .18s ease-out}
.hub-pop{animation:hubPop .22s ease-out}
.hub-drawer{animation:hubUp .24s cubic-bezier(.2,.8,.2,1)}
@media (min-width:1024px){.hub-drawer{animation:hubSide .24s cubic-bezier(.2,.8,.2,1)}}
.hub-new{animation:hubNew 1.2s ease-out 2}
.hub-scroll::-webkit-scrollbar{display:none}.hub-scroll{scrollbar-width:none}
.hub-select{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2355657F' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 14px center;background-size:16px}
.hub-select:disabled{opacity:.55}
`;
