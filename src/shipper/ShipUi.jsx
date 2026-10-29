// ======================= src/shipper/ShipUi.jsx =======================
// 화주사 화면 공통 부품(2026-10-29 리디자인) — 운송사 홈 관제 데크와 같은 네이비 디지털 톤.
//  DeckStrip : 페이지 상단 어두운 KPI 띠(HomeDeck Tile 재사용)
//  ShipCard  : 밝은 카드 + 모노 코드 머리줄
//  SegTabs   : 상태/기간 같은 짧은 선택 버튼 묶음
import React from "react";
import { HD_CSS, HD_MONO, Tile } from "../HomeDeck";

export const SHIP_MONO = HD_MONO;

export function DeckStrip({ items, cols }) {
  return (
    <section className="hd-deck" style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: 14 }}>
      <style>{HD_CSS}</style>
      <div className="hd-scan" />
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${cols || items.length}, minmax(0,1fr))`, gap: 12 }}>
        {items.map((t, i) => (
          <Tile key={t.code} primary={i === 0} code={t.code} label={t.label} value={t.value} unit={t.unit} foot={t.foot} spark={t.spark} sparkId={`ship${t.code}`} />
        ))}
      </div>
    </section>
  );
}

export function ShipCard({ code, title, right, children, className = "", bodyClass = "p-5" }) {
  return (
    <div className={`bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] overflow-hidden ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-5 h-[54px] border-b border-[#EEF1F6]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rotate-45 bg-[#2D4C82] shrink-0" />
            {code && <span className="text-[10px] font-extrabold tracking-[0.22em] text-[#9AA9C3]" style={{ fontFamily: HD_MONO }}>{code}</span>}
            <span className="text-[15.5px] font-black text-[#0F1A30] truncate">{title}</span>
          </div>
          {right}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

export function SegTabs({ value, onChange, items }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-[12px] bg-[#EEF2F8] border border-[#E3E8F0]">
      {items.map((it) => {
        const [k, l] = Array.isArray(it) ? it : [it, it];
        const on = value === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)}
            className={`h-8 px-3.5 rounded-[9px] text-[13px] font-extrabold transition ${on ? "text-white shadow-[0_4px_12px_rgba(27,43,75,0.28)]" : "text-[#3A4A66] hover:bg-white"}`}
            style={on ? { background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" } : undefined}>
            {l}
          </button>
        );
      })}
    </div>
  );
}
