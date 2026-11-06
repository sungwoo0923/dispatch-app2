// ======================= src/kpTimePick.jsx =======================
// ⏱ 2026-11-04 시간 · 날짜+시간 고르기 — 브라우저 기본 <input type="time"/"datetime-local"> 대신
//    프로그램 공용 드롭다운(CustomSelect) · 달력(CustomDatePicker)을 쓴다.
//  · TimeSelect      : 값 "HH:mm"(10분 단위 — 배차 등록의 timeOptions와 같은 목록). 목록에 없는 기존 값도 그대로 보이고 유지된다.
//  · HourMinuteSelect: 값 "HH:mm"(시 · 분 두 칸, 1분 단위 — 출퇴근 기록처럼 정확한 분이 필요한 곳)
//  · DateTimeSelect  : 값 "YYYY-MM-DDTHH:mm"(datetime-local과 같은 형식 그대로 저장)
import React from "react";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";

export const TIME_OPTIONS_10 = Array.from({ length: 24 * 6 }, (_, i) => `${String(Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6) * 10).padStart(2, "0")}`);

export function TimeSelect({ value = "", onChange, className = "", placeholder = "시간 선택", disabled = false, allowEmpty = true }) {
  const v = String(value || "");
  const opts = v && !TIME_OPTIONS_10.includes(v) ? [v, ...TIME_OPTIONS_10] : TIME_OPTIONS_10;
  return (
    <CustomSelect value={v} onChange={(e) => onChange?.({ target: { value: e.target.value } })} className={className} disabled={disabled} placeholder={placeholder}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {opts.map((t) => <option key={t} value={t}>{t}</option>)}
    </CustomSelect>
  );
}

export function DateTimeSelect({ value = "", onChange, dateClassName = "", timeClassName = "", className = "", disabled = false }) {
  const s = String(value || "");
  const d = s.slice(0, 10);
  const t = s.length >= 16 ? s.slice(11, 16) : "";
  const emit = (nd, nt) => onChange?.({ target: { value: nd ? `${nd}T${nt || "09:00"}` : "" } });
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,120px)] gap-2 ${className}`}>
      <CustomDatePicker value={d} onChange={(e) => emit(e.target.value, t)} className={dateClassName} showIcon placeholder="날짜 선택" disabled={disabled} />
      <TimeSelect value={t} onChange={(e) => emit(d || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), e.target.value)} className={timeClassName} disabled={disabled} allowEmpty={false} />
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
export function HourMinuteSelect({ value = "", onChange, className = "", disabled = false, allowEmpty = true }) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  const h = m ? m[1].padStart(2, "0") : "", mi = m ? m[2] : "";
  const emit = (nh, nm) => onChange?.({ target: { value: nh === "" ? "" : `${nh}:${nm || "00"}` } });
  return (
    <div className="grid grid-cols-2 gap-1.5 min-w-0">
      <CustomSelect value={h} onChange={(e) => emit(e.target.value, mi)} className={className} disabled={disabled} placeholder="시">
        {allowEmpty && <option value="">— 시</option>}
        {HOURS.map((x) => <option key={x} value={x}>{x}시</option>)}
      </CustomSelect>
      <CustomSelect value={mi} onChange={(e) => emit(h || "09", e.target.value)} className={className} disabled={disabled} placeholder="분">
        {MINUTES.map((x) => <option key={x} value={x}>{x}분</option>)}
      </CustomSelect>
    </div>
  );
}
