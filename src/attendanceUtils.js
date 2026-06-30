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

// 이름 끝의 숫자(여분계정 구분용, 예: "박성우2")를 제거해 동일인 여부를 비교하기 위한 정규화
function normalizeName(name) {
  return (name || "").trim().replace(/\d+$/, "");
}

// 해당 날짜에 등록된 휴가/외근 일정(반려 제외)이 있으면 그 유형 라벨을 반환
// authorUid가 일치하지 않더라도(관리자가 대신 등록해 authorUid가 어긋난 과거 데이터 등) name이 동일인으로 판단되면 매칭
export function findApprovedLeaveForDate(schedules, uid, dateStr, employeeName) {
  const normEmpName = normalizeName(employeeName);
  const hit = (schedules || []).find(s => {
    const sameUid = s.authorUid === uid;
    const sameName = normEmpName && normalizeName(s.name) === normEmpName;
    if (!sameUid && !sameName) return false;
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

// 대한민국 법정공휴일(자동) — 회사가 별도로 지정하지 않아도 기본 반영됨.
// 고정일은 매년 자동 계산, 음력 기반 연휴(설날/추석/부처님오신날) 및 대체공휴일은 연도별로 등재.
// 회사별 추가 휴일(선거일 등)은 별도 Firestore "holidays" 컬렉션으로 보강.
export const KR_NATIONAL_HOLIDAYS = {
  2025: [
    ["2025-01-01", "신정"],
    ["2025-01-27", "임시공휴일"],
    ["2025-01-28", "설날연휴"],
    ["2025-01-29", "설날"],
    ["2025-01-30", "설날연휴"],
    ["2025-03-01", "삼일절"],
    ["2025-03-03", "대체공휴일(삼일절)"],
    ["2025-05-05", "어린이날·부처님오신날"],
    ["2025-05-06", "대체공휴일"],
    ["2025-06-06", "현충일"],
    ["2025-08-15", "광복절"],
    ["2025-10-03", "개천절"],
    ["2025-10-05", "추석연휴"],
    ["2025-10-06", "추석"],
    ["2025-10-07", "추석연휴"],
    ["2025-10-08", "대체공휴일(추석)"],
    ["2025-10-09", "한글날"],
    ["2025-12-25", "성탄절"],
  ],
  2026: [
    ["2026-01-01", "신정"],
    ["2026-02-16", "설날연휴"],
    ["2026-02-17", "설날"],
    ["2026-02-18", "설날연휴"],
    ["2026-03-01", "삼일절"],
    ["2026-03-02", "대체공휴일(삼일절)"],
    ["2026-05-05", "어린이날"],
    ["2026-05-24", "부처님오신날"],
    ["2026-05-25", "대체공휴일(부처님오신날)"],
    ["2026-06-03", "지방선거일"],
    ["2026-06-06", "현충일"],
    ["2026-08-15", "광복절"],
    ["2026-09-24", "추석연휴"],
    ["2026-09-25", "추석"],
    ["2026-09-26", "추석연휴"],
    ["2026-10-03", "개천절"],
    ["2026-10-09", "한글날"],
    ["2026-12-25", "성탄절"],
  ],
  2027: [
    ["2027-01-01", "신정"],
    ["2027-03-01", "삼일절"],
    ["2027-05-05", "어린이날"],
    ["2027-06-06", "현충일"],
    ["2027-08-15", "광복절"],
    ["2027-10-03", "개천절"],
    ["2027-10-09", "한글날"],
    ["2027-12-25", "성탄절"],
  ],
};

export function getNationalHolidayLabel(dateStr) {
  const year = Number((dateStr || "").slice(0, 4));
  const list = KR_NATIONAL_HOLIDAYS[year];
  if (!list) return null;
  const hit = list.find(([d]) => d === dateStr);
  return hit ? hit[1] : null;
}

// 공휴일 여부 — 대한민국 법정공휴일(자동) + 회사 지정 휴일(holidays: [{date:"YYYY-MM-DD", label}]) 모두 포함
export function isHoliday(dateStr, holidays) {
  if (getNationalHolidayLabel(dateStr)) return true;
  return (holidays || []).some(h => h.date === dateStr);
}

export function getHolidayLabel(dateStr, holidays) {
  const national = getNationalHolidayLabel(dateStr);
  if (national) return national;
  const custom = (holidays || []).find(h => h.date === dateStr);
  return custom ? custom.label : null;
}
