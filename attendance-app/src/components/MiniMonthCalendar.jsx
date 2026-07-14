import { WEEKDAY_LABELS } from "../utils/statsShared";

// 근로자 1명의 한 달 상태를 요일정렬 7열 캘린더로 압축해 보여준다 — 모바일
// 폭에서 31일치 표를 가로로 훑어야 했던 기존 통계 표를, 세로 스크롤만으로
// "출석부처럼 한눈에" 볼 수 있게 바꾸기 위한 공용 컴포넌트.
export default function MiniMonthCalendar({ month, cells, onDayClick }) {
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const blanks = Array.from({ length: firstDow });

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className={`text-center text-[10px] font-medium ${w === "일" ? "text-danger" : w === "토" ? "text-primary" : "text-muted"}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {cells.map((c) => (
          <button
            key={c.day}
            type="button"
            onClick={() => onDayClick?.(c.day)}
            disabled={!onDayClick}
            className={`flex aspect-square items-center justify-center rounded-md text-[11px] font-semibold ${c.className}`}
          >
            {c.day}
          </button>
        ))}
      </div>
    </div>
  );
}
