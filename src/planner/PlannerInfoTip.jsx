// src/planner/PlannerInfoTip.jsx — 메뉴 상단에 길게 써 있던 설명 문단을 정리하는
// 용도. "?" 아이콘만 놔두고, 누르고 있는 동안(마우스/터치 공용 — pointerdown에
// 뜨고 pointerup/손을 떼거나 벗어나면 사라짐)만 말풍선으로 설명을 보여준다.
import React, { useState } from "react";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerInfoTip({ text, align = "left" }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onPointerDown={() => setOpen(true)}
        onPointerUp={() => setOpen(false)}
        onPointerLeave={() => setOpen(false)}
        onContextMenu={(e) => e.preventDefault()}
        className="w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 select-none"
        style={{ borderColor: ACCENT_BORDER, color: ACCENT }}
        aria-label="설명 보기"
      >
        ?
      </button>
      {open && (
        <div
          className={`absolute z-[10050] top-full mt-1.5 ${align === "left" ? "left-0" : "right-0"} w-[230px] bg-gray-800 text-white text-[11px] leading-relaxed rounded-xl px-3 py-2.5 shadow-xl pointer-events-none`}
        >
          {text}
        </div>
      )}
    </span>
  );
}
