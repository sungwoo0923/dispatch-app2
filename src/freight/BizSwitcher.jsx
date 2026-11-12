// ======================= src/freight/BizSwitcher.jsx =======================
// 🧭 2026-11-12 업무 전환 — 상단 머리말 버튼 하나. 누르면 내륙 · 컨테이너 · 해상 · 항공 · 통합 현황 중에서 고른다
//  회사가 쓰는 업무 영역이 내륙 하나뿐이면 버튼 자체가 보이지 않는다(예전 운송사는 화면이 그대로)
import React from "react";
import { createPortal } from "react-dom";
import { BIZ, GROUP } from "../bizModules";
import { ModeIcon, MONO } from "./ui";

export default function BizSwitcher({ modules = [], current = "inland", canGroup = false, onPick, hideButton = false, open: openProp, onOpenChange }) {
  // 모바일 메뉴처럼 바깥에서 여닫는 경우(open · onOpenChange) — 버튼 없이 고르는 창만 쓴다
  const [openSelf, setOpenSelf] = React.useState(false);
  const open = openProp !== undefined ? openProp : openSelf;
  const setOpen = (v) => { if (onOpenChange) onOpenChange(v); else setOpenSelf(v); };
  React.useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  const items = [...modules.map((k) => BIZ[k]).filter(Boolean), ...(canGroup ? [GROUP] : [])];
  if (items.length < 2) return null;
  const cur = current === "group" ? GROUP : BIZ[current] || BIZ.inland;
  return (
    <>
      {!hideButton && <button type="button" onClick={() => setOpen(true)} data-testid="biz-switch" title="업무 전환"
        className="h-[34px] pl-2.5 pr-2 rounded-xl inline-flex items-center gap-1.5 bg-white text-[#0F1A30] text-[12.5px] font-black whitespace-nowrap shadow-[0_4px_12px_rgba(0,0,0,.25)] hover:bg-[#EEF3FB] transition">
        <ModeIcon mode={cur.key} size={14} />{cur.short}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>}
      {open && createPortal(
        <div className="kp-pc-pop fixed inset-0 z-[2147482500] bg-[#0B1428]/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full sm:max-w-[620px] rounded-t-[26px] sm:rounded-[24px] overflow-hidden shadow-[0_30px_80px_rgba(5,10,25,0.55)] ring-1 ring-white/10" style={{ background: "linear-gradient(160deg,#0F1A30 0%,#152340 60%,#1B2B4B 100%)" }}>
            <div className="px-5 sm:px-6 pt-5 pb-4 flex items-start gap-3 border-b border-white/10">
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SWITCH WORKSPACE</div>
                <div className="text-[20px] font-black text-white mt-0.5">어느 업무 화면으로 갈까요?</div>
                <div className="text-[13px] font-semibold text-white/55 mt-0.5">고른 업무는 이 계정에 기억됩니다</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 text-white shrink-0" aria-label="닫기">✕</button>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto" style={{ maxHeight: "min(70vh, 560px)" }}>
              {items.map((it) => { const on = it.key === current; return (
                <button key={it.key} type="button" data-testid={`biz-pick-${it.key}`} onClick={() => { setOpen(false); onPick?.(it.key); }}
                  className={`text-left rounded-2xl px-4 py-3.5 border transition flex items-center gap-3 ${it.key === "group" ? "sm:col-span-2" : ""} ${on ? "bg-white border-white text-[#0F1A30] shadow-[0_10px_26px_rgba(0,0,0,0.3)]" : "bg-white/[0.06] border-white/10 text-white hover:bg-white/[0.12]"}`}>
                  <span className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${on ? "bg-[#EEF3FB] text-[#1B2B4B]" : "bg-white/[0.08] text-[#8FB0F0]"}`}><ModeIcon mode={it.key} size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[9.5px] font-extrabold tracking-[0.22em] ${on ? "text-[#4B6CB7]" : "text-[#8FB0F0]"}`} style={{ fontFamily: MONO }}>{it.en}</span>
                    <span className="block text-[16px] font-black leading-tight">{it.label}</span>
                    <span className={`block text-[12px] font-semibold truncate mt-0.5 ${on ? "text-[#5B6B85]" : "text-white/55"}`}>{it.desc}</span>
                  </span>
                  {on && <span className="text-[11px] font-black text-[#2D4C82]">지금</span>}
                </button>
              ); })}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
