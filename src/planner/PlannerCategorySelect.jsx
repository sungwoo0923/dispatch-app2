// src/planner/PlannerCategorySelect.jsx — KP-Planner 전용 분류 선택 드롭다운.
// 브라우저 기본 <input list="..."> (datalist) 스타일이 이상하다는 피드백 때문에,
// 앱 디자인에 맞춘 직접 그리는 드롭다운으로 대체한다. 목록에 없는 값도 직접 입력 가능.
import React, { useEffect, useRef, useState } from "react";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerCategorySelect({ value, onChange, options, placeholder = "분류 선택/입력", className = "" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-stretch gap-0">
        <input
          className={className || "w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none"}
          style={{ borderColor: ACCENT_BORDER }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      </div>
      {open && options.length > 0 && (
        <div
          className="absolute z-[10000] mt-1 w-full bg-white rounded-lg shadow-2xl py-1 max-h-[220px] overflow-y-auto"
          style={{ border: `1px solid ${ACCENT_BORDER}` }}
        >
          {options.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[12.5px] font-semibold hover:opacity-80"
              style={value === c ? { background: ACCENT_SOFT, color: ACCENT } : { color: "#4b5563" }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
