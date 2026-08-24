// src/planner/PlannerTimePicker.jsx — KP-Planner 전용 커스텀 시간 선택기.
// 자유 입력(분 단위) 대신 오전/오후 + 시(1~12) + 분(00/30)만 고를 수 있게 해서
// 실수로 이상한 시간이 입력되는 걸 막는다. value/onChange는 "HH:mm"(24시간) 문자열.
import React, { useEffect, useRef, useState } from "react";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function to24(ampm, hour12, minute) {
  let h = hour12 % 12;
  if (ampm === "오후") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function from24(value) {
  if (!value) return { ampm: "오전", hour12: 9, minute: 0 };
  const [hStr, mStr] = value.split(":");
  let h = Number(hStr) || 0;
  const minute = Number(mStr) >= 30 ? 30 : 0;
  const ampm = h >= 12 ? "오후" : "오전";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { ampm, hour12, minute };
}
function displayLabel(value) {
  if (!value) return "";
  const { ampm, hour12, minute } = from24(value);
  return `${ampm} ${hour12}시 ${String(minute).padStart(2, "0")}분`;
}

export default function PlannerTimePicker({ value, onChange, placeholder = "시간 선택", className = "" }) {
  const [open, setOpen] = useState(false);
  const parsed = from24(value);
  const [ampm, setAmpm] = useState(parsed.ampm);
  const [hour12, setHour12] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const p = from24(value);
    setAmpm(p.ampm); setHour12(p.hour12); setMinute(p.minute);
    const onDocDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open, value]);

  const apply = (nAmpm, nHour, nMinute) => onChange(to24(nAmpm, nHour, nMinute));

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={className || "w-full text-left border rounded-lg px-3 py-2 text-[13px]"}
        style={{ borderColor: ACCENT_BORDER }}
      >
        {value ? displayLabel(value) : <span className="text-gray-400">{placeholder}</span>}
      </button>
      {open && (
        <div
          className="absolute z-[10000] mt-1.5 bg-white rounded-xl shadow-2xl p-3 w-[260px] max-w-[90vw]"
          style={{ border: `1px solid ${ACCENT_BORDER}` }}
        >
          <div className="flex gap-1.5 mb-2.5">
            {["오전", "오후"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => { setAmpm(v); apply(v, hour12, minute); }}
                className="flex-1 py-1.5 rounded-lg text-[12.5px] font-bold border"
                style={ampm === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { color: "#6b7280", borderColor: ACCENT_BORDER }}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[10.5px] font-bold text-gray-400 mb-1 text-center">시</div>
              <div className="grid grid-cols-3 gap-1 max-h-[140px] overflow-y-auto">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => { setHour12(h); apply(ampm, h, minute); }}
                    className="py-1.5 rounded-lg text-[12px] font-semibold"
                    style={hour12 === h ? { background: ACCENT_SOFT, color: ACCENT, fontWeight: 800 } : { color: "#4b5563" }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-[76px]">
              <div className="text-[10.5px] font-bold text-gray-400 mb-1 text-center">분</div>
              <div className="flex flex-col gap-1">
                {[0, 30].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMinute(m); apply(ampm, hour12, m); }}
                    className="py-1.5 rounded-lg text-[12px] font-semibold"
                    style={minute === m ? { background: ACCENT_SOFT, color: ACCENT, fontWeight: 800 } : { color: "#4b5563" }}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full mt-2.5 pt-2 border-t text-[11.5px] font-bold"
            style={{ borderColor: ACCENT_SOFT, color: ACCENT }}
          >
            확인
          </button>
        </div>
      )}
    </div>
  );
}
