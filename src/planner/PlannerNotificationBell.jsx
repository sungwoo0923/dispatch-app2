// src/planner/PlannerNotificationBell.jsx — 헤더의 알림종 버튼. 누르면 다가오는
// 일정(생일/기념일의 매년 반복 포함) 목록만 뜬다.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePlannerEntries, todayStr, dDayLabel, nextOccurrence } from "../adminPlannerData";
import { ACCENT } from "./plannerTheme";

export default function PlannerNotificationBell({ groupId }) {
  const { entries } = usePlannerEntries(groupId);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const upcoming = useMemo(() => {
    const t = todayStr();
    return entries
      .filter((e) => e.type === "schedule")
      .map((s) => ({ ...s, effectiveDate: s.recurring ? nextOccurrence(s.date, t) : s.date }))
      .filter((s) => (s.effectiveDate || "") >= t)
      .sort((a, b) => (a.effectiveDate || "").localeCompare(b.effectiveDate || ""))
      .slice(0, 15);
  }, [entries]);

  const soonCount = upcoming.filter((s) => {
    const d = dDayLabel(s.effectiveDate);
    return d && (d === "D-DAY" || Number(d.slice(2)) <= 7);
  }).length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", position: "relative" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {soonCount > 0 && (
          <span style={{ position: "absolute", top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {soonCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute z-[10000] mt-2 bg-white rounded-xl shadow-2xl overflow-hidden"
          style={{ right: 0, width: 280, maxWidth: "90vw", border: "1px solid #eee" }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: "#f1f1f4" }}>
            <div className="text-[13px] font-bold text-gray-800">다가오는 일정</div>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {upcoming.length === 0 && (
              <div className="py-8 text-center text-[12.5px] text-gray-500">다가오는 일정이 없습니다</div>
            )}
            {upcoming.map((s) => {
              const dday = dDayLabel(s.effectiveDate);
              const soon = dday === "D-DAY" || dday === "D-1";
              return (
                <div key={s.id} className="px-4 py-2.5 border-b last:border-b-0 flex items-center justify-between gap-2" style={{ borderColor: "#f6f6f8" }}>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-gray-800 truncate">
                      {s.title}{s.recurring && <span className="text-[10px] text-gray-400 font-normal"> (매년)</span>}
                    </div>
                    <div className="text-[10.5px] text-gray-500">{s.effectiveDate}{s.time ? ` ${s.time}` : ""}</div>
                  </div>
                  {dday && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                      style={soon ? { background: ACCENT, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}
                    >
                      {dday}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
