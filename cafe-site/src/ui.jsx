// ======================= cafe-site/src/ui.jsx =======================
// ⭐ 2026-11-06 로지스웹 허브 공용 디자인 부품 — 로지스웹(LogisWeb) 운송 프로그램과 같은 네이비 디자인 언어.
//  네이비(#0B1428/#0F1A30/#1B2B4B/#2D4C82) + 포인트 하늘색(#8FB0F0), 기본 산세리프 글꼴(고정폭 글꼴 없음), 글자 14px 이상.
import React, { useEffect } from "react";
import { MARKET_NAME, MARKET_NAME_EN, STATUS_META } from "./cafeConstants";

export const C = {
  ink: "#0B1428", navy: "#0F1A30", navy2: "#1B2B4B", blue: "#2D4C82", accent: "#8FB0F0",
  bg: "#F2F4F8", line: "#E2E7EF", text: "#0F1A30", sub: "#55657F", muted: "#8592A8",
};
// 어두운 네이비 + 은은한 격자(관제 화면 느낌)
export const GRID_BG = {
  background:
    "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/28px 28px, radial-gradient(120% 140% at 85% -10%, #2D4C82 0%, #1B2B4B 38%, #0F1A30 70%, #0B1428 100%)",
};
export const NUM = { fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" };

const PATHS = {
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  market: <><path d="M3 9h18l-1.5-5h-15z" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></>,
  live: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  truck: <><rect x="1" y="6" width="13" height="10" rx="1.5" /><path d="M14 9h4l3 3v4h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
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
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  star: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></>,
  check: <><path d="m5 12 5 5 9-10" /></>,
  pin: <><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  eyeoff: <><path d="M3 3l18 18" /><path d="M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.2 3.8M6.2 7.7C4.2 9.2 3 12 3 12s4 6 9 6c1.4 0 2.6-.4 3.7-1" /></>,
  swap: <><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
};
export function Icon({ name, size = 18, className = "", strokeWidth = 2, fill = "none" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name] || PATHS.grid}
    </svg>
  );
}

// 로지스웹 워드마크(흰 글자 SVG)를 마스크로 써서 어떤 바탕색에도 같은 모양으로 그린다
function Wordmark({ height = 16, color = "#fff" }) {
  return (
    <span aria-label="LogisWeb" role="img" className="block shrink-0"
      style={{ height, width: height * (8.0256 /* 🔷 2026-11-14 새 글자 로고 가로세로 비율 */), backgroundColor: color, WebkitMask: "url(/brand/logisweb-wordmark.svg) no-repeat center / contain", mask: "url(/brand/logisweb-wordmark.svg) no-repeat center / contain" }} />
  );
}
// 로고 — 로지스웹 마크 + 워드마크 + HUB
export function Logo({ dark = false, size = 36, sub = true }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <img src="/brand/logisweb-mark-square.svg" alt="" width={size} height={size} className="shrink-0 rounded-[10px]" style={{ width: size, height: size }} />
      <span className="flex flex-col justify-center gap-[5px]">
        <span className="flex items-center gap-2">
          <Wordmark height={Math.round(size * 0.36)} color={dark ? "#fff" : C.navy} />
          <span className="font-extrabold rounded-[6px] px-1.5 leading-none flex items-center" style={{ fontSize: Math.max(12, size * 0.33), height: Math.round(size * 0.46), color: dark ? C.navy : "#fff", background: dark ? C.accent : C.navy2, letterSpacing: "0.04em" }}>HUB</span>
        </span>
        {sub && <span className="font-semibold leading-none" style={{ fontSize: Math.max(12, size * 0.3), color: dark ? "rgba(255,255,255,.62)" : C.sub }}>{MARKET_NAME} · 운송사 오더 거래소</span>}
      </span>
    </div>
  );
}
export const BRAND_LINE = `${MARKET_NAME} · ${MARKET_NAME_EN}`;

// 상태 배지 — 단계가 올라갈수록 진한 네이비(색을 늘리지 않고 채움으로 구분)
const STATUS_CLS = {
  open: "bg-white text-[#1B2B4B] ring-1 ring-inset ring-[#C7D3E8]",
  applying: "bg-[#EEF3FB] text-[#1B2B4B] ring-1 ring-inset ring-[#C7D3E8]",
  matched: "bg-[#DCE7FA] text-[#1B2B4B] ring-1 ring-inset ring-[#B9CBEB]",
  dispatched: "bg-[#2D4C82] text-white",
  confirmed: "bg-[#2D4C82] text-white",
  delivered: "bg-[#0F1A30] text-white",
  cancelled: "bg-[#F1F3F7] text-[#9AA5B8] line-through",
};
export function StatusBadge({ status, className = "" }) {
  const label = STATUS_META[status]?.label || "모집중";
  return (
    <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[13px] font-bold shrink-0 ${STATUS_CLS[status] || STATUS_CLS.open} ${className}`}>
      {status === "open" && <span className="w-1.5 h-1.5 rounded-full bg-[#2D4C82] animate-pulse" />}
      {label}
    </span>
  );
}
export function Tag({ children, strong = false, className = "" }) {
  return <span className={`inline-flex items-center h-7 px-2 rounded-lg text-[13px] font-bold shrink-0 ${strong ? "bg-[#0F1A30] text-white" : "bg-[#F2F5FA] text-[#3A4A66]"} ${className}`}>{children}</span>;
}
export function UrgentTag() {
  return <span className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[13px] font-extrabold shrink-0 bg-[#0F1A30] text-[#8FB0F0]"><Icon name="bolt" size={13} strokeWidth={2.4} />긴급</span>;
}

// 숫자 타일(어두운 배경용)
export function DarkStat({ label, value, unit, hint }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10 px-3 sm:px-4 py-2.5 sm:py-3.5 backdrop-blur-sm min-w-0">
      <div className="text-[13px] font-semibold text-white/60 truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[22px] sm:text-[28px] font-extrabold leading-none text-white" style={NUM}>{value}</span>
        {unit && <span className="hidden sm:inline text-[14px] font-semibold text-white/50">{unit}</span>}
      </div>
      {hint && <div className="hidden sm:block mt-1.5 text-[13px] text-[#8FB0F0] truncate">{hint}</div>}
    </div>
  );
}
// 숫자 타일(밝은 배경용)
export function Stat({ label, value, active, onClick, unit }) {
  const Cmp = onClick ? "button" : "div";
  return (
    <Cmp type={onClick ? "button" : undefined} onClick={onClick}
      className={`text-left rounded-2xl px-4 py-3.5 transition ${active ? "bg-[#0F1A30] text-white shadow-[0_12px_28px_rgba(11,20,40,.28)]" : "bg-white ring-1 ring-inset ring-[#E2E7EF] hover:ring-[#C7D3E8]"}`}>
      <div className={`text-[13.5px] font-semibold ${active ? "text-white/65" : "text-[#55657F]"}`}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-[26px] font-extrabold leading-none ${active ? "text-white" : "text-[#0F1A30]"}`} style={NUM}>{value}</span>
        {unit && <span className={`text-[14px] font-semibold ${active ? "text-white/50" : "text-[#8592A8]"}`}>{unit}</span>}
      </div>
    </Cmp>
  );
}

export function Panel({ title, sub, right, children, className = "", bodyClass = "" }) {
  return (
    <section className={`bg-white rounded-[20px] ring-1 ring-inset ring-[#E2E7EF] shadow-[0_1px_2px_rgba(15,26,48,.04),0_8px_24px_rgba(15,26,48,.04)] overflow-hidden ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#EEF1F6]">
          <div className="min-w-0">
            <h3 className="text-[16px] font-extrabold text-[#0F1A30] truncate">{title}</h3>
            {sub && <div className="text-[13.5px] text-[#8592A8] mt-0.5 truncate">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Empty({ icon = "inbox", title, desc, action }) {
  return (
    <div className="py-16 px-6 text-center bg-white rounded-[20px] ring-1 ring-inset ring-[#E2E7EF]">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F2F5FA] flex items-center justify-center text-[#8592A8]"><Icon name={icon} size={24} /></div>
      <div className="mt-4 text-[16px] font-bold text-[#0F1A30]">{title}</div>
      {desc && <div className="mt-1.5 text-[14px] text-[#8592A8] leading-relaxed">{desc}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// 거래 진행 단계 — 모집 → 매칭 → 배차 → 운송완료
export function Stepper({ status, dark = false }) {
  const steps = ["모집중", "매칭완료", "배차완료", "운송완료"];
  const cur = STATUS_META[status]?.step ?? 0;
  return (
    <ol className="grid grid-cols-4 gap-1.5">
      {steps.map((s, i) => {
        const done = cur >= i && cur >= 0;
        return (
          <li key={s} className="min-w-0">
            <div className={`h-1.5 rounded-full ${done ? (dark ? "bg-[#8FB0F0]" : "bg-[#2D4C82]") : (dark ? "bg-white/15" : "bg-[#E2E7EF]")}`} />
            <div className={`mt-1.5 text-[13px] font-bold truncate ${done ? (dark ? "text-white" : "text-[#0F1A30]") : (dark ? "text-white/40" : "text-[#A3AEC0]")}`}>{s}</div>
          </li>
        );
      })}
    </ol>
  );
}

// 별점(보기/고르기)
export function Stars({ value = 0, onChange, size = 18 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const cls = n <= Math.round(value) ? "text-[#2D4C82]" : "text-[#D3DAE6]";
        const star = <Icon name="star" size={size} fill="currentColor" strokeWidth={1.2} />;
        // 보기 전용이면 버튼이 아닌 글자로(카드 버튼 안에 버튼이 들어가지 않게)
        return onChange
          ? <button key={n} type="button" aria-label={`${n}점`} onClick={() => onChange(n)} className={`cursor-pointer ${cls}`}>{star}</button>
          : <span key={n} className={cls}>{star}</span>;
      })}
    </span>
  );
}

// 모달 — PC는 가운데, 휴대폰은 아래에서 올라오는 시트
export function Sheet({ onClose, children, width = 640, closeOnBackdrop = true }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 입력 화면(closeOnBackdrop=false)은 Esc로도 닫지 않는다 — 입력 중 실수로 내용이 날아가지 않게
    const onKey = (e) => { if (e.key === "Escape" && closeOnBackdrop) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose, closeOnBackdrop]);
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-5 bg-[#0B1428]/60 backdrop-blur-[3px]" onClick={closeOnBackdrop ? onClose : undefined}>
      <div className="w-full bg-[#F2F4F8] sm:rounded-[24px] rounded-t-[24px] shadow-[0_30px_80px_rgba(11,20,40,.45)] max-h-[94vh] flex flex-col overflow-hidden" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export const inputCls = "w-full h-12 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[15px] font-medium text-[#0F1A30] outline-none transition focus:border-[#2D4C82] focus:ring-4 focus:ring-[#2D4C82]/10 placeholder:text-[#A3AEC0]";
export const selectCls = "h-11 pl-3 pr-8 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] appearance-none bg-no-repeat bg-[right_10px_center] bg-[length:14px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2355657F%22 stroke-width=%222.4%22><path d=%22m6 9 6 6 6-6%22/></svg>')]";
export const btnPrimary = "h-12 px-5 rounded-xl text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-[0_10px_24px_rgba(11,20,40,.25)] hover:brightness-110 active:translate-y-px";
export const btnPrimaryStyle = { background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 55%,#2D4C82 100%)" };
export const btnGhost = "h-12 px-4 rounded-xl bg-white ring-1 ring-inset ring-[#DCE3EE] text-[#3A4A66] text-[15px] font-bold inline-flex items-center justify-center gap-2 hover:bg-[#F5F8FD] transition disabled:opacity-50";

export function timeAgo(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : (typeof ts === "number" ? ts : 0);
  if (!ms) return "";
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}
// "2026-11-07" → "11.07 (토)"
export function shortDate(ymd) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d)) return ymd;
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} (${"일월화수목금토"[d.getDay()]})`;
}
export function dayBadge(ymd) {
  if (!ymd) return "";
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(`${ymd}T00:00:00`);
  const diff = Math.round((d - t) / 86400000);
  return diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === 2 ? "모레" : diff < 0 ? "지난 날짜" : "";
}
