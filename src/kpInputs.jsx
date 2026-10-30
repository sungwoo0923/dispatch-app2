// ======================= src/kpInputs.jsx =======================
// 🧩 공용 입력칸 — 배차관리와 같은 모양
//  · TimeSelect: 오전/오후 · 시 · 분 드롭다운(비우면 "즉시" 또는 원하는 빈 값 문구) — 저장값 "HH:MM" 또는 ""
//  · MultiDateSelect: 프로그램 달력에서 날짜 여러 개 고르기(쉬는 날 등)
import React from "react";
import { CustomSelect } from "./CustomSelect";
import CustomDatePicker from "./CustomDatePicker";

const pad = (n) => String(n).padStart(2, "0");
export const korTimeLabel = (hm, empty = "즉시") => { if (!hm) return empty; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`; };

export function TimeSelect({ value = "", onChange, emptyLabel = "즉시", className = "", minuteStep = 10 }) {
  const [h, m] = value ? value.split(":").map(Number) : [null, null];
  const ap = h == null ? "" : h < 12 ? "오전" : "오후";
  const h12 = h == null ? "" : String(h % 12 || 12);
  const set = (nap, nh, nm) => {
    if (!nap) return onChange("");
    const hh = Number(nh || 9) % 12 + (nap === "오후" ? 12 : 0);
    onChange(`${pad(hh)}:${pad(Number(nm || 0))}`);
  };
  const box = `h-10 px-2.5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#0F1A30] ${className}`;
  const mins = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  return (
    <div className="flex items-center gap-1.5">
      <CustomSelect value={ap} onChange={(e) => set(e.target.value, h12 || "9", m ?? 0)} className={`${box} w-[92px]`}>
        <option value="">{emptyLabel}</option>
        <option value="오전">오전</option>
        <option value="오후">오후</option>
      </CustomSelect>
      {ap && <>
        <CustomSelect value={h12} onChange={(e) => set(ap, e.target.value, m ?? 0)} className={`${box} w-[76px]`}>
          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((x) => <option key={x} value={x}>{x}시</option>)}
        </CustomSelect>
        <CustomSelect value={String(m ?? 0)} onChange={(e) => set(ap, h12, e.target.value)} className={`${box} w-[76px]`}>
          {(mins.includes(m ?? 0) ? mins : [...mins, m].sort((a, b) => a - b)).map((x) => <option key={x} value={String(x)}>{pad(x)}분</option>)}
        </CustomSelect>
      </>}
    </div>
  );
}

export function MultiDateSelect({ value = [], onChange, className = "", placeholder = "날짜 고르기" }) {
  const [active, setActive] = React.useState(true);
  return (
    <CustomDatePicker value={value[value.length - 1] || ""} onChange={() => {}} className={className} placeholder={placeholder} showIcon
      multiSelect multiActive={active} onToggleMulti={() => setActive((v) => !v)} workDates={value}
      onToggleWorkDate={(d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
      onClearWorkDates={() => onChange([])}
      displayOverride={value.length ? `${value.length}일 선택` : placeholder} />
  );
}
