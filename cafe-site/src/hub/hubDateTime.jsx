// ======================= cafe-site/src/hub/hubDateTime.jsx =======================
// ⭐ 2026-11-22 화물등록 상 · 하차 날짜 · 시간 — 로지스웹 배차 프로그램과 같은 방식
//  · 날짜: 달력 + [당일] [내일] [월상](다음 월요일), 고르면 "2026년 11월 13일 (금)"으로 보인다
//  · 시간: 오전/오후 · 1~12시 · 정각/30분을 눌러 고른다(30분 단위) + [즉시] [협의]. 저장 값은 예전 그대로 "HH:mm" · "즉시" · ""(협의)
import React, { useState } from "react";
import CustomDatePicker from "../CustomDatePicker";
import { HI, inputCls } from "./hubUi";
import { kstYmd } from "./hubConstants";

const W = "일월화수목금토";
export const ymdLabel = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
  if (!m) return String(v || "");
  const d = new Date(`${v}T00:00:00Z`);
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 (${W[d.getUTCDay()]})`;
};
export const nextMonday = () => { const t = kstYmd(); const d = new Date(`${t}T00:00:00Z`); const day = d.getUTCDay(); d.setUTCDate(d.getUTCDate() + (day === 0 ? 1 : 8 - day)); return d.toISOString().slice(0, 10); };
export const timeLabel = (v) => {
  if (!v) return "협의";
  if (v === "즉시") return "즉시";
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return v;
  const h = Number(m[1]), mi = Number(m[2]);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}시${mi ? ` ${mi}분` : ""}`;
};
const Box = ({ on, onClick, children, testid, wide }) => (
  <button type="button" onClick={onClick} aria-pressed={on} data-testid={testid}
    className={`h-11 ${wide ? "px-4" : "px-0"} rounded-xl text-[15px] font-bold inline-flex items-center justify-center gap-1.5 transition ${on ? "bg-[#0F1A30] text-white" : "bg-white text-[#3A4A66] ring-1 ring-inset ring-[#D6DEEA] hover:ring-[#2D4C82]"}`}>
    <span className={`w-4 h-4 rounded-[5px] shrink-0 inline-flex items-center justify-center ${on ? "bg-[#8FB0F0] text-[#0B1428]" : "ring-1 ring-inset ring-[#C7D3E8]"}`}>{on && <HI name="check" size={11} stroke={3} />}</span>{children}
  </button>
);

export function HubDatePick({ value, onChange, testid, bad, quick = true }) {
  const today = kstYmd(), tom = kstYmd(1), mon = nextMonday();
  return (
    <div className="space-y-2">
      <CustomDatePicker value={value} onChange={(e) => onChange(e.target.value)} showIcon display={ymdLabel} testid={testid}
        className={`${inputCls} font-bold ${bad ? "!border-[#E5484D] ring-4 ring-[#E5484D]/15" : ""}`} />
      {quick && (
        <div className="grid grid-cols-3 gap-1.5">
          {[["당일", today], ["내일", tom], ["월상", mon]].map(([l, d]) => (
            <button key={l} type="button" onClick={() => onChange(d)} data-testid={`${testid}-${l}`}
              className={`h-10 rounded-xl text-[14.5px] font-extrabold transition ${value === d ? "bg-[#0F1A30] text-white" : "bg-[#EAF0FA] text-[#1B2B4B] hover:bg-[#DCE7FA]"}`}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HubTimePick({ value, onChange, testid }) {
  const [open, setOpen] = useState(false);
  const m = /^(\d{1,2}):(\d{2})/.exec(value || "");
  const h24 = m ? Number(m[1]) : null, mi = m ? Number(m[2]) : 0;
  const [ap, setAp] = useState(h24 != null && h24 >= 12 ? "오후" : "오전");
  const curAp = h24 == null ? ap : h24 >= 12 ? "오후" : "오전";
  const h12 = h24 == null ? null : h24 % 12 === 0 ? 12 : h24 % 12;
  const emit = (a, h, min) => { const hh = (h % 12) + (a === "오후" ? 12 : 0); onChange(`${String(hh).padStart(2, "0")}:${min ? "30" : "00"}`); };
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} data-testid={testid} aria-expanded={open}
        className={`${inputCls} flex items-center gap-2 text-left font-bold ${open ? "border-[#2D4C82] ring-4 ring-[#2D4C82]/10" : ""}`}>
        <HI name="clock" size={17} className="text-[#5F6E87] shrink-0" />
        <span className={`flex-1 ${value ? "text-[#0F1A30]" : "text-[#66758E]"}`}>{timeLabel(value)}</span>
        <HI name="down" size={16} className={`text-[#55657F] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-[#F5F8FD] ring-1 ring-inset ring-[#DCE3EE] p-3 space-y-2.5 hub-fade" data-testid={`${testid}-panel`}>
          <div className="grid grid-cols-2 gap-1.5">
            <Box on={value === "즉시"} onClick={() => { onChange("즉시"); setOpen(false); }} testid={`${testid}-now`} wide>즉시</Box>
            <Box on={!value} onClick={() => { onChange(""); setOpen(false); }} testid={`${testid}-tbd`} wide>협의</Box>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {["오전", "오후"].map((a) => <Box key={a} on={curAp === a && !!m} onClick={() => { setAp(a); if (h12 != null) emit(a, h12, mi); }} testid={`${testid}-${a}`} wide>{a}</Box>)}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => <Box key={h} on={h12 === h} onClick={() => emit(m ? curAp : ap, h, mi)} testid={`${testid}-h${h}`}>{h}시</Box>)}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[[0, "정각"], [30, "30분"]].map(([v, l]) => <Box key={v} on={!!m && mi === v} onClick={() => emit(m ? curAp : ap, h12 ?? 9, v)} testid={`${testid}-m${v}`} wide>{l}</Box>)}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="w-full h-11 rounded-xl text-white text-[15px] font-extrabold" style={{ background: "linear-gradient(120deg,#0F1A30,#1B2B4B 55%,#2D4C82)" }} data-testid={`${testid}-done`}>{value ? `${timeLabel(value)} 로 정하기` : "닫기"}</button>
        </div>
      )}
    </div>
  );
}
