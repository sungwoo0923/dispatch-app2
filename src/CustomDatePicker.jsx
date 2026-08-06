import React from "react";
import { createPortal } from "react-dom";

// 대한민국 법정공휴일 — 설날/추석/부처님오신날처럼 음력 기준이라 매년 날짜가
// 바뀌는 공휴일과 대체공휴일까지 포함해 연도별로 직접 채워둔다(자동 계산이 아니라
// 매년 정부 발표 기준으로 갱신 필요). 등록된 연도 밖의 날짜는 그냥 평일로 취급한다.
export const KOREAN_HOLIDAYS = {
  "2024-01-01": "신정",
  "2024-02-09": "설날연휴", "2024-02-10": "설날", "2024-02-11": "설날연휴", "2024-02-12": "대체공휴일",
  "2024-03-01": "삼일절",
  "2024-04-10": "국회의원선거일",
  "2024-05-05": "어린이날", "2024-05-06": "대체공휴일",
  "2024-05-15": "부처님오신날",
  "2024-06-06": "현충일",
  "2024-08-15": "광복절",
  "2024-09-16": "추석연휴", "2024-09-17": "추석", "2024-09-18": "추석연휴",
  "2024-10-03": "개천절",
  "2024-10-09": "한글날",
  "2024-12-25": "크리스마스",

  "2025-01-01": "신정",
  "2025-01-27": "임시공휴일",
  "2025-01-28": "설날연휴", "2025-01-29": "설날", "2025-01-30": "설날연휴",
  "2025-03-01": "삼일절", "2025-03-03": "대체공휴일",
  "2025-05-05": "어린이날·부처님오신날", "2025-05-06": "대체공휴일",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-05": "추석연휴", "2025-10-06": "추석", "2025-10-07": "추석연휴", "2025-10-08": "임시공휴일",
  "2025-10-09": "한글날",
  "2025-12-25": "크리스마스",

  "2026-01-01": "신정",
  "2026-02-16": "설날연휴", "2026-02-17": "설날", "2026-02-18": "설날연휴",
  "2026-03-01": "삼일절", "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절", "2026-08-17": "대체공휴일",
  "2026-09-24": "추석연휴", "2026-09-25": "추석", "2026-09-26": "추석연휴",
  "2026-10-03": "개천절", "2026-10-05": "대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "크리스마스",

  "2027-01-01": "신정",
  "2027-02-06": "설날연휴", "2027-02-07": "설날", "2027-02-08": "설날연휴", "2027-02-09": "대체공휴일",
  "2027-03-01": "삼일절",
  "2027-05-05": "어린이날",
  "2027-05-13": "부처님오신날",
  "2027-06-06": "현충일",
  "2027-08-15": "광복절", "2027-08-16": "대체공휴일",
  "2027-09-14": "추석연휴", "2027-09-15": "추석", "2027-09-16": "추석연휴",
  "2027-10-03": "개천절", "2027-10-04": "대체공휴일",
  "2027-10-09": "한글날", "2027-10-11": "대체공휴일",
  "2027-12-25": "크리스마스",
};

// 달력 셀에 표시할 짧은 이름 (좁은 칸에 들어가야 해서 접두어를 뗀 축약형)
export function shortHolidayLabel(name) {
  if (!name) return "";
  if (name.includes("어린이날") && name.includes("부처님")) return "어린이날";
  if (name === "설날연휴") return "설날";
  if (name === "추석연휴") return "추석";
  if (name === "대체공휴일") return "대체";
  if (name === "임시공휴일") return "임시";
  return name;
}

// 브라우저 기본 달력(type="date")을 대체하는 커스텀 날짜 선택기 — PC/모바일 공용.
// 트리거는 그대로 두고 달력 패널만 document.body에 fixed 포지션 portal로 띄운다.
const CustomDatePicker = React.forwardRef(function CustomDatePicker(
  { value, onChange, className = "", placeholder = "날짜 선택", disabled = false, showIcon = false },
  ref
) {
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(() => (value ? new Date(value).getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = React.useState(() => (value ? new Date(value).getMonth() : new Date().getMonth()));
  const [menuRect, setMenuRect] = React.useState(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  React.useImperativeHandle(ref, () => ({ focus: () => btnRef.current?.focus() }));

  const updateMenuRect = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 팝업 실제 폭(320px)이 뷰포트보다 넓으면(모바일 분할화면/좁은 창) 뷰포트에 맞춰 줄인다 —
    // 그렇지 않으면 아래 left 클램프의 상한(vw - popupWidth - 8)이 음수가 되어 팝업이
    // 화면 밖으로 밀려나거나 엉뚱한 위치에 뜬다. CSS의 max-w-[94vw]와 값을 맞춘다.
    const popupWidth = Math.min(320, window.innerWidth - 16);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 360 && r.top > spaceBelow;
    const left = Math.min(Math.max(r.left, 8), Math.max(8, window.innerWidth - popupWidth - 8));
    setMenuRect({
      left,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    if (value) {
      const d = new Date(value);
      if (!isNaN(d)) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
    updateMenuRect();
    const close = () => setOpen(false);
    const onDocDown = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, updateMenuRect, value]);

  const pad2 = (n) => String(n).padStart(2, "0");
  const fmt = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const now = new Date();
  const todayStr = fmt(now.getFullYear(), now.getMonth(), now.getDate());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const yearOptions = [];
  for (let y = now.getFullYear() - 6; y <= now.getFullYear() + 3; y++) yearOptions.push(y);

  const goMonth = (delta) => {
    setViewMonth((m) => {
      let nm = m + delta;
      let ny = viewYear;
      if (nm < 0) { nm = 11; ny -= 1; }
      else if (nm > 11) { nm = 0; ny += 1; }
      setViewYear(ny);
      return nm;
    });
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        onClick={() => { if (disabled) return; setOpen((v) => !v); }}
        className={`${className} text-left ${showIcon ? "flex items-center justify-between gap-1.5" : ""}`}
      >
        <span>{value || <span className="text-gray-400">{placeholder}</span>}</span>
        {showIcon && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 shrink-0">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        )}
      </button>
      {open && menuRect && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: menuRect.left, top: menuRect.top, bottom: menuRect.bottom }}
          className="z-[999999] bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-[320px] max-w-[94vw]"
        >
          <div className="flex items-center justify-between mb-2 gap-1">
            <button type="button" onClick={() => goMonth(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#1B2B4B] text-lg font-bold shrink-0">‹</button>
            <div className="flex items-center gap-1.5">
              <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}
                className="text-[14px] font-bold text-[#1B2B4B] border border-gray-200 rounded-md px-1.5 py-1 outline-none cursor-pointer">
                {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}
                className="text-[14px] font-bold text-[#1B2B4B] border border-gray-200 rounded-md px-1.5 py-1 outline-none cursor-pointer">
                {Array.from({ length: 12 }, (_, i) => i).map((m) => <option key={m} value={m}>{m + 1}월</option>)}
              </select>
            </div>
            <button type="button" onClick={() => goMonth(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#1B2B4B] text-lg font-bold shrink-0">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
              <div key={w} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} />;
              const dateStr = fmt(viewYear, viewMonth, d);
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;
              const dow = new Date(viewYear, viewMonth, d).getDay();
              const holidayName = KOREAN_HOLIDAYS[dateStr];
              const isSunday = dow === 0;
              const isSaturday = dow === 6;
              const numberCls = isSelected
                ? "text-white"
                : holidayName || isSunday ? "text-red-500"
                : isSaturday ? "text-blue-500"
                : "text-gray-700";
              return (
                <button key={i} type="button"
                  title={holidayName || undefined}
                  onClick={() => { onChange?.({ target: { value: dateStr } }); setOpen(false); }}
                  className={`h-11 rounded-lg text-[13px] font-semibold transition flex flex-col items-center justify-center leading-none gap-0.5 ${
                    isSelected ? "bg-[#1B2B4B]" :
                    isToday ? "border-2 border-[#1B2B4B]" :
                    "hover:bg-gray-100"
                  }`}
                >
                  <span className={numberCls}>{d}</span>
                  {holidayName && (
                    <span className={`text-[8px] leading-none font-bold truncate max-w-[36px] ${isSelected ? "text-white/80" : "text-red-400"}`}>
                      {shortHolidayLabel(holidayName)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
            <button type="button"
              onClick={() => { onChange?.({ target: { value: todayStr } }); setOpen(false); }}
              className="text-[12px] font-bold text-[#1B2B4B] hover:underline">오늘</button>
            <button type="button"
              onClick={() => { onChange?.({ target: { value: "" } }); setOpen(false); }}
              className="text-[12px] font-semibold text-gray-400 hover:underline">지우기</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

export default CustomDatePicker;
