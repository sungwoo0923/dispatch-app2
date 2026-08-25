// src/planner/PlannerYearPicker.jsx — 년도/월 텍스트를 누르면 뜨는 드롭다운 선택기.
// 예전엔 "‹ 2026년 ›" 처럼 화살표로 한 해/한 달씩만 넘길 수 있었는데, 년도가 적힌
// 곳은 어디든 눌러서 바로 원하는 년도(월)로 점프할 수 있어야 한다는 요청 반영.
import React, { useEffect, useRef, useState } from "react";
import { ACCENT } from "./plannerTheme";

function useCloseOnOutside(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

export function YearDropdownLabel({ year, onChange, className, style, align = "center" }) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside(open, setOpen);
  const nowY = new Date().getFullYear();
  const years = [];
  for (let y = nowY + 5; y >= nowY - 20; y--) years.push(y);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className={className} style={style}>
        {year}년
      </button>
      {open && (
        <div
          className={`absolute z-[10005] mt-1 ${align === "center" ? "left-1/2 -translate-x-1/2" : align === "right" ? "right-0" : "left-0"} bg-white rounded-xl shadow-2xl py-2 px-2 max-h-[240px] overflow-y-auto grid grid-cols-3 gap-1 w-[180px]`}
          style={{ border: "1px solid #eee" }}
        >
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { onChange(y); setOpen(false); }}
              className="py-1.5 rounded-lg text-[12px] font-semibold"
              style={y === year ? { background: ACCENT, color: "#fff", fontWeight: 800 } : { color: "#4b5563" }}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// month: 0~11(JS Date 규칙 그대로)
export function MonthDropdownLabel({ month, onChange, className, style, align = "center" }) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside(open, setOpen);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className={className} style={style}>
        {month + 1}월
      </button>
      {open && (
        <div
          className={`absolute z-[10005] mt-1 ${align === "center" ? "left-1/2 -translate-x-1/2" : align === "right" ? "right-0" : "left-0"} bg-white rounded-xl shadow-2xl py-2 px-2 grid grid-cols-4 gap-1 w-[192px]`}
          style={{ border: "1px solid #eee" }}
        >
          {Array.from({ length: 12 }, (_, i) => i).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onChange(m); setOpen(false); }}
              className="py-1.5 rounded-lg text-[12px] font-semibold"
              style={m === month ? { background: ACCENT, color: "#fff", fontWeight: 800 } : { color: "#4b5563" }}
            >
              {m + 1}월
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
