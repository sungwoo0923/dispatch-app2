// ======================= src/NewMark.jsx =======================
// ✨ 2026-11-24 새 메뉴 표시 — 숫자 배지(빨강)와 헷갈리지 않게 하늘빛 그라데이션 + 깜빡이는 점 "NEW"
//  · on: 선택된(흰 바탕) 메뉴 안에서는 옅은 색 · dot: 접힌 메뉴 아이콘 위 작은 점
import React from "react";

const KEYFRAMES = "@keyframes kpNewPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.65)}}";

export default function NewMark({ on = false, dot = false, light = false, xs = false }) {
  if (dot) return <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full" style={{ background: "#5AA2FF", boxShadow: "0 0 0 2px #1B2B4B, 0 0 8px rgba(90,162,255,.9)" }} />;
  const soft = on || light;
  return (
    <span title="새로 생긴 메뉴예요. 열어 보면 표시가 사라져요" className={`shrink-0 rounded-full inline-flex items-center font-black leading-none ${xs ? "h-[15px] pl-1 pr-1.5 gap-[3px] text-[8.5px] tracking-[0.1em]" : "h-[18px] pl-1.5 pr-[7px] gap-1 text-[9.5px] tracking-[0.12em]"}`}
      style={soft ? { background: "#EAF2FF", color: "#2D4C82", boxShadow: "inset 0 0 0 1px #C9DBFA" } : { background: "linear-gradient(135deg,#3D7BFF,#5AA2FF)", color: "#fff", boxShadow: "0 0 0 1px rgba(255,255,255,.18), 0 4px 10px rgba(61,123,255,.45)" }}>
      <style>{KEYFRAMES}</style>
      <span className={`${xs ? "w-[5px] h-[5px]" : "w-1.5 h-1.5"} rounded-full`} style={{ background: soft ? "#3D7BFF" : "#fff", animation: "kpNewPulse 1.6s ease-in-out infinite" }} />NEW
    </span>
  );
}
