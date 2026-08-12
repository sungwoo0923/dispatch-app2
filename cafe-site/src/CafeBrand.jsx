// ======================= cafe-site/src/CafeBrand.jsx =======================
// 상단 좌측 로고/워드마크 — "KP-FLOW" 브랜드 + "배차마당" 서비스명. 참고 화면처럼
// 로고와 글자를 이전보다 크고 뚜렷하게 키워 좌상단에 배치한다.
import React from "react";

const SIZES = {
  sm: { icon: "w-9 h-9 rounded-lg text-[15px]", word: "text-[20px]", sub: "text-[9px]", gap: "gap-2.5" },
  lg: { icon: "w-12 h-12 rounded-xl text-[20px]", word: "text-[28px]", sub: "text-[11px]", gap: "gap-3" },
};

export default function CafeBrand({ size = "sm", center = false, dark = false }) {
  const s = SIZES[size] || SIZES.sm;
  return (
    <div className={`inline-flex items-center ${s.gap} ${center ? "justify-center" : ""}`}>
      <div className={`${s.icon} shrink-0 bg-gradient-to-br from-[#2a4680] to-[#1B2B4B] flex items-center justify-center text-white font-black shadow-sm`}>
        KP
      </div>
      <div className="leading-tight text-left">
        <div className={`${s.word} font-black tracking-tight ${dark ? "text-white" : "text-[#1B2B4B]"}`}>KP-FLOW</div>
        <div className={`${s.sub} font-bold tracking-wide ${dark ? "text-white/60" : "text-gray-400"}`}>배차마당 · 화물 배차 정보 공유</div>
      </div>
    </div>
  );
}
