// ======================= src/ViewSwitcher.jsx =======================
// 🔀 2026-11-10 화면 전환 — 통합관리자(운송·영업·경리·인사)·통합인사관리자(경리·인사)
//  예전엔 팀마다 버튼이 따로 있었다 → [화면 전환] 버튼 하나를 누르면 어느 팀 화면으로 볼지 고르는 창이 뜬다(PC·모바일 공용).
//  views: [[화면 키, 화면 역할, 이름], …] (customRoles.js SWITCH_ROLES) · current: 지금 화면 키 · onPick(키)
import React from "react";
import { createPortal } from "react-dom";
import { ShellIcon } from "./AdminShell";
import { VIEW_INFO } from "./customRoles";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";

export function ViewPickerDialog({ views = [], current = "", roleLabel = "", onPick, onClose }) {
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[2147482500] bg-[#0B1428]/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-full sm:max-w-[560px] rounded-t-[26px] sm:rounded-[24px] overflow-hidden shadow-[0_30px_80px_rgba(5,10,25,0.55)] ring-1 ring-white/10" style={{ background: "linear-gradient(160deg,#0F1A30 0%,#152340 60%,#1B2B4B 100%)" }} data-testid="view-picker">
        <div className="px-5 sm:px-6 pt-5 pb-4 flex items-start gap-3 border-b border-white/10">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SWITCH VIEW</div>
            <div className="text-[20px] font-black text-white mt-0.5">어느 팀 화면으로 볼까요?</div>
            <div className="text-[13px] font-semibold text-white/55 mt-0.5">{roleLabel ? `${roleLabel} · ` : ""}고른 화면은 이 기기에 기억됩니다</div>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 text-white shrink-0" aria-label="닫기">✕</button>
        </div>
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto" style={{ maxHeight: "min(70vh, 560px)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}>
          {views.map(([k, , label]) => {
            const [en, desc, icon] = VIEW_INFO[k] || [String(k).toUpperCase(), "", "dashboard"];
            const on = k === current;
            return (
              <button key={k} type="button" onClick={() => onPick?.(k)} data-testid={`view-pick-${k}`}
                className={`text-left rounded-2xl px-4 py-3.5 border transition flex items-center gap-3 ${on ? "bg-white border-white text-[#0F1A30] shadow-[0_10px_26px_rgba(0,0,0,0.3)]" : "bg-white/[0.06] border-white/12 text-white hover:bg-white/[0.12] hover:border-[#8FB0F0]/60"}`}>
                <span className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${on ? "bg-[#EEF3FB]" : "bg-white/[0.08]"}`}><ShellIcon name={icon} size={20} className={on ? "text-[#1B2B4B]" : "text-[#8FB0F0]"} /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[9.5px] font-extrabold tracking-[0.22em] ${on ? "text-[#4B6CB7]" : "text-[#8FB0F0]"}`} style={{ fontFamily: MONO }}>{en}</span>
                  <span className="block text-[16px] font-black leading-tight">{label} 화면</span>
                  <span className={`block text-[12px] font-semibold truncate mt-0.5 ${on ? "text-[#5B6B85]" : "text-white/55"}`}>{desc}</span>
                </span>
                {on && <span className="shrink-0 px-2 py-1 rounded-lg bg-[#0F1A30] text-white text-[11px] font-black">보는 중</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 상단 버튼(PC) — "화면 전환 · 영업"
export default function ViewSwitcher({ views, current, roleLabel = "", onPick, className = "kp-chip-btn text-[12px] transition" }) {
  const [open, setOpen] = React.useState(false);
  if (!views || views.length < 2) return null;
  const cur = (views.find(([k]) => k === current) || views[0])[2];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${className} inline-flex items-center gap-1.5`} title={`${roleLabel ? `${roleLabel} — ` : ""}어느 팀 화면으로 볼지 고릅니다`} data-testid="view-switch">
        <ShellIcon name="refresh" size={13} />화면 전환<span className="px-1.5 rounded bg-white text-[#0F1A30] font-black">{cur}</span>
      </button>
      {open && <ViewPickerDialog views={views} current={current} roleLabel={roleLabel} onClose={() => setOpen(false)} onPick={(k) => { setOpen(false); if (k !== current) onPick?.(k); }} />}
    </>
  );
}
