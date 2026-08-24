// src/planner/PlannerDatePicker.jsx — KP-Planner 전용 커스텀 날짜 선택기.
// 브라우저 기본 <input type="date">(구식이라는 피드백) 대신, 앱 디자인(ACCENT 색상)에
// 맞춘 달력 팝업을 쓴다. 공휴일/연휴/대체공휴일/주말/토요일을 색과 라벨로 구분해서 보여준다.
import React, { useEffect, useRef, useState } from "react";
import { KOREAN_HOLIDAYS, shortHolidayLabel } from "../CustomDatePicker";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function fmt(y, m, d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function labelOf(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${dateStr} (${WEEKDAY_KO[d.getDay()]})`;
}

export default function PlannerDatePicker({ value, onChange, placeholder = "날짜 선택", className = "" }) {
  const [open, setOpen] = useState(false);
  const init = value ? new Date(value + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  useEffect(() => {
    if (open && value) {
      const d = new Date(value + "T00:00:00");
      if (!Number.isNaN(d.getTime())) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = new Date(viewYear, viewMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const now = new Date();
  const todayS = fmt(now.getFullYear(), now.getMonth(), now.getDate());

  const goMonth = (delta) => {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  const pick = (d) => {
    const s = fmt(viewYear, viewMonth, d);
    onChange(s);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={className || "w-full text-left border rounded-lg px-3 py-2 text-[13px]"}
        style={{ borderColor: ACCENT_BORDER }}
      >
        {value ? labelOf(value) : <span className="text-gray-400">{placeholder}</span>}
      </button>
      {open && (
        <div
          className="absolute z-[10000] mt-1.5 bg-white rounded-xl shadow-2xl p-3 w-[300px] max-w-[90vw]"
          style={{ border: `1px solid ${ACCENT_BORDER}` }}
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg font-bold" style={{ color: ACCENT }}>‹</button>
            <div className="text-[13px] font-bold" style={{ color: ACCENT }}>{viewYear}년 {viewMonth + 1}월</div>
            <button type="button" onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg font-bold" style={{ color: ACCENT }}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAY_KO.map((w, i) => (
              <div key={w} className={`text-center text-[10.5px] font-bold py-0.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-400"}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} />;
              const dateStr = fmt(viewYear, viewMonth, d);
              const dow = new Date(viewYear, viewMonth, d).getDay();
              const holidayName = KOREAN_HOLIDAYS[dateStr];
              const isToday = dateStr === todayS;
              const isSelected = dateStr === value;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  title={holidayName || undefined}
                  className="h-9 rounded-lg text-[11.5px] font-semibold flex flex-col items-center justify-center leading-tight"
                  style={
                    isSelected
                      ? { background: ACCENT, color: "#fff" }
                      : isToday
                      ? { border: `1.5px solid ${ACCENT}`, color: "#374151" }
                      : { color: holidayName || dow === 0 ? "#ef4444" : dow === 6 ? "#3b82f6" : "#374151" }
                  }
                >
                  <span>{d}</span>
                  {holidayName && (
                    <span className="text-[8px] font-bold" style={{ color: isSelected ? "#fff" : "#ef4444" }}>
                      {shortHolidayLabel(holidayName)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2.5 pt-2 border-t text-[10px] text-gray-400" style={{ borderColor: ACCENT_SOFT }}>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />공휴일/일요일</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />토요일</span>
            <button
              type="button"
              onClick={() => { onChange(todayS); setOpen(false); }}
              className="ml-auto font-bold"
              style={{ color: ACCENT }}
            >
              오늘
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
