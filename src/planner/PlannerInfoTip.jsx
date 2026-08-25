// src/planner/PlannerInfoTip.jsx — 메뉴 상단에 길게 써 있던 설명 문단을 정리하는
// 용도. "?" 아이콘만 놔두고, 누르면 말풍선이 뜨고 다시 누르면(또는 바깥을
// 누르면) 닫힌다.
import React, { useEffect, useRef, useState } from "react";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerInfoTip({ text, align = "left" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 select-none"
        style={{ borderColor: ACCENT_BORDER, color: ACCENT }}
        aria-label="설명 보기"
      >
        ?
      </button>
      {open && (
        <div
          className={`absolute z-[10050] top-full mt-1.5 ${align === "left" ? "left-0" : "right-0"} w-[230px] bg-gray-800 text-white text-[11px] leading-relaxed rounded-xl px-3 py-2.5 shadow-xl`}
        >
          {text}
        </div>
      )}
    </span>
  );
}
