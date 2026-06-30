// 출근기록부 공용 유틸
export const LEAVE_TYPE_LABEL = {
  "휴가": "연차", "오전반차": "오전반차", "오후반차": "오후반차",
  "외근": "외근", "병가": "병가", "경조사": "경조사", "조퇴": "조퇴",
};

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isWeekend(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

// 해당 날짜에 등록된 휴가/외근 일정(반려 제외)이 있으면 그 유형 라벨을 반환
export function findApprovedLeaveForDate(schedules, uid, dateStr) {
  const hit = (schedules || []).find(s => {
    if (s.authorUid !== uid) return false;
    const approvers = s.approvers || [];
    const anyRejected = approvers.some(a => a.status === "rejected");
    if (anyRejected) return false;
    const start = s.start, end = s.end || s.start;
    return dateStr >= start && dateStr <= end;
  });
  return hit ? (LEAVE_TYPE_LABEL[hit.type] || hit.type) : null;
}

export const ATTENDANCE_STATUS_COLOR = {
  "출근": "bg-[#1B2B4B] text-white",
  "휴무": "bg-gray-100 text-gray-400",
  "공휴일": "bg-gray-200 text-gray-500",
  "연차": "bg-violet-700 text-white",
  "오전반차": "bg-amber-600 text-white",
  "오후반차": "bg-amber-700 text-white",
  "외근": "bg-blue-700 text-white",
  "병가": "bg-red-700 text-white",
  "경조사": "bg-emerald-700 text-white",
  "조퇴": "bg-orange-700 text-white",
};

// 공휴일 여부 — holidays: [{date:"YYYY-MM-DD", label}]
export function isHoliday(dateStr, holidays) {
  return (holidays || []).some(h => h.date === dateStr);
}
