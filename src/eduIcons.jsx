// ======================= src/eduIcons.jsx =======================
// 🦺 2026-11-24 안전교육 선 아이콘 — 프로그램 아이콘(AdminShell ShellIcon)과 같은 굵기 · 모양(이모지 대신)
import React from "react";

const P = {
  cargo: <><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /><path d="m7.5 5.5 9 5" /></>,
  dock: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8" /><path d="M7 16h10" /></>,
  pledge: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h3" /><path d="m15.5 16.5 3-3 1.5 1.5-3 3h-1.5Z" /></>,
  office: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" /><path d="M10 21v-3h4v3" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  cert: <><circle cx="12" cy="9" r="5.5" /><path d="m9.5 13.8-1.5 7.2 4-2 4 2-1.5-7.2" /><path d="m9.8 9 1.5 1.5 3-3" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  play: <path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />,
  replay: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  truck: <><path d="M2.5 6h11v9h-11z" /><path d="M13.5 9H18l3.5 3.5V15h-8" /><circle cx="6.5" cy="17" r="1.8" /><circle cx="17" cy="17" r="1.8" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
};

export function EduIcon({ name, size = 18, stroke = 1.9, className = "", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {P[name] || P.shield}
    </svg>
  );
}

// 교육 아이콘 타일(남색 바탕 + 흰 선) — 목록 · 시청 화면 · 현황판 공용
export function EduTile({ name, size = 44, done = false }) {
  return (
    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: size, height: size, borderRadius: size * 0.3, background: done ? "#EEF1F6" : "linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)", color: done ? "#1B2B4B" : "#fff", boxShadow: done ? "none" : "0 6px 14px -6px rgba(11,20,40,.55)" }}>
      <EduIcon name={name} size={Math.round(size * 0.48)} />
    </span>
  );
}
