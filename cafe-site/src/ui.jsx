// ======================= cafe-site/src/ui.jsx =======================
// 배차마당 공용 디자인 부품(2026-10-28 리디자인) — 배차 프로그램(KP-Flow)과 같은 네이비 톤.
//  색은 네이비 한 가지 계열만 쓴다(상태도 색 대신 채움/테두리로 구분).
import React from "react";

export const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
export const NAVY = "#1B2B4B";
// 어두운 네이비 + 은은한 격자(관제 화면 느낌)
export const GRID_BG = {
  background:
    "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)",
};

const PATHS = {
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  live: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  truck: <><rect x="1" y="6" width="13" height="10" rx="1.5" /><path d="M14 9h4l3 3v4h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  route: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8 6h6a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h6" /></>,
  bolt: <><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  building: <><path d="M4 21V5l8-2v18M12 7l8 2v12" /><path d="M8 9h.01M8 13h.01M8 17h.01M16 13h.01M16 17h.01" /></>,
};
export function Icon({ name, size = 18, className = "", strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name] || PATHS.grid}
    </svg>
  );
}

// 로고 — 경로(상차 → 하차)를 형상화한 마크 + 워드마크
export function Logo({ dark = false, size = 36, sub = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="rounded-[11px] flex items-center justify-center shrink-0 shadow-[0_6px_16px_rgba(15,26,48,0.28)]"
        style={{ width: size, height: size, background: dark ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#0F1A30,#2D4C82)", boxShadow: dark ? "inset 0 0 0 1px rgba(255,255,255,0.18)" : undefined }}>
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5.5" cy="6" r="2.4" fill="#fff" />
          <path d="M8 6h6.5a3.5 3.5 0 0 1 0 7h-5a3.5 3.5 0 0 0 0 7H16" />
          <path d="m15 17 3 3-3 3" transform="translate(0 -3)" />
        </svg>
      </span>
      <span className="leading-none">
        <span className={`block font-black tracking-tight ${dark ? "text-white" : "text-[#0F1A30]"}`} style={{ fontSize: size * 0.48 }}>배차마당</span>
        {sub && <span className="block mt-1 font-extrabold" style={{ fontFamily: MONO, fontSize: Math.max(8.5, size * 0.24), letterSpacing: "0.26em", color: dark ? "#8FB0F0" : "#4B6CB7" }}>BAECHA MADANG</span>}
      </span>
    </div>
  );
}

// 상태 배지 — 대기(테두리) · 신청중(옅은 채움) · 배차완료(네이비 채움) · 취소(흐림)
export const STATUS = {
  open: { label: "대기중", cls: "border border-[#C9D2E0] text-[#3A4A66] bg-white" },
  applying: { label: "신청중", cls: "border border-[#1B2B4B]/40 text-[#1B2B4B] bg-[#EEF3FB]" },
  confirmed: { label: "배차완료", cls: "border border-[#0F1A30] text-white bg-[#0F1A30]" },
  cancelled: { label: "취소됨", cls: "border border-[#E3E8F0] text-[#B4BFD0] bg-white line-through" },
};
export function StatusBadge({ status, className = "" }) {
  const m = STATUS[status] || STATUS.open;
  return <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-[11px] font-black shrink-0 ${m.cls} ${className}`}>{m.label}</span>;
}
export function Tag({ children, strong = false }) {
  return <span className={`inline-flex items-center h-[22px] px-1.5 rounded-md text-[11px] font-black shrink-0 ${strong ? "bg-[#1B2B4B] text-white" : "border border-[#DCE3EE] text-[#5B6B85] bg-white"}`}>{children}</span>;
}

// 숫자 타일(어두운 배경용)
export function DarkStat({ label, value, unit }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] ring-1 ring-white/10 px-4 py-3">
      <div className="text-[11.5px] font-bold text-white/55">{label}</div>
      <div className="text-[26px] font-black leading-tight tabular-nums" style={{ fontFamily: MONO }}>{value}<span className="text-[12px] font-bold text-white/50 ml-1" style={{ fontFamily: "inherit" }}>{unit}</span></div>
    </div>
  );
}
// 숫자 타일(밝은 배경용)
export function Stat({ label, value, active, onClick, en }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick}
      className={`text-left rounded-2xl px-4 py-3.5 border transition ${active ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_10px_24px_rgba(15,26,48,0.25)]" : "bg-white border-[#E3E8F0] hover:border-[#C9D2E0]"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[12px] font-bold ${active ? "text-white/60" : "text-[#7A879C]"}`}>{label}</span>
        {en && <span className={`text-[9.5px] font-extrabold tracking-[0.2em] ${active ? "text-[#8FB0F0]" : "text-[#B4BFD0]"}`} style={{ fontFamily: MONO }}>{en}</span>}
      </div>
      <div className={`text-[26px] font-black leading-tight tabular-nums mt-0.5 ${active ? "text-white" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{value}</div>
    </C>
  );
}

export function Panel({ title, en, right, children, className = "", bodyClass = "" }) {
  return (
    <div className={`bg-white border border-[#E3E8F0] rounded-[20px] overflow-hidden shadow-[0_6px_20px_rgba(15,26,48,0.04)] ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#EEF1F6]">
          <div className="min-w-0">
            {en && <div className="text-[10px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{en}</div>}
            <div className="text-[15px] font-black text-[#0F1A30] truncate">{title}</div>
          </div>
          {right}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

export const inputCls = "w-full h-12 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold text-[#0F1A30] outline-none transition focus:border-[#4B6CB7] focus:ring-4 focus:ring-[#4B6CB7]/10 placeholder:text-[#9AA9C3] placeholder:font-medium";
export const btnPrimary = "h-12 rounded-xl text-white text-[14.5px] font-black transition disabled:opacity-50 shadow-[0_10px_24px_rgba(15,26,48,0.25)] hover:brightness-110";
export const btnPrimaryStyle = { background: "linear-gradient(120deg,#0F1A30,#2D4C82)" };

export function timeAgo(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return "";
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}
// "인천 서구 북항로 28-29" → "인천 서구"
export const region = (addr) => (addr || "").trim().split(/\s+/).slice(0, 2).join(" ");
