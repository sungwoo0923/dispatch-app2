import { isWeekend, toDateKey, addDays } from "./dateUtils";
import { isKrHoliday } from "./holidaysKR";

export function businessDaysBetween(startKey, endKey) {
  let count = 0;
  let cursor = startKey;
  while (cursor <= endKey) {
    const d = new Date(`${cursor}T00:00:00`);
    if (!isWeekend(d) && !isKrHoliday(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function monthsBetween(hireDateKey, todayKey) {
  const hire = new Date(`${hireDateKey}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  return (
    (today.getFullYear() - hire.getFullYear()) * 12 +
    (today.getMonth() - hire.getMonth()) -
    (today.getDate() < hire.getDate() ? 1 : 0)
  );
}

// 근로기준법 제60조 기준: 계속근로 1년 미만은 매월 개근 시 1일(최대 11일),
// 1년 이상은 15일 + 3년차부터 매 2년마다 1일 가산(최대 25일). 별도
// 관리자 설정(휴가템플릿 등) 없이 입사일만으로 자동 계산한다 — 경력직으로
// 입사해 이 회사 근속연수와 별개로 인정해줄 연차가 있으면(근로자등록의
// "경력인정연수") monthsOfService에 그만큼 더해 반영한다.
function yearlyEntitlement(years) {
  return Math.min(15 + Math.floor(Math.max(0, years - 1) / 2), 25);
}

// Standard Korean labor-law style annual leave: 15 days after 1yr tenure
// (+가산휴가 for long service), prorated ~1 day/month (up to 11) before 1yr.
// Cycle resets from Jan 1 of the current year for simplicity.
export function calcLeaveBalance({ hireDate, leaves = [], today = toDateKey(), careerYears = 0 }) {
  const monthsOfService = Math.max(0, monthsBetween(hireDate, today)) + Math.round((careerYears || 0) * 12);
  const isAnnual = monthsOfService >= 12;
  const entitlement = isAnnual ? yearlyEntitlement(Math.floor(monthsOfService / 12)) : Math.min(11, monthsOfService);
  const leaveLabel = isAnnual ? "연차" : "월차";

  const yearStart = `${today.slice(0, 4)}-01-01`;

  let used = 0;
  let sickDays = 0;
  let fieldDays = 0;

  for (const lv of leaves) {
    if (lv.status === "rejected") continue;
    if (lv.startDate < yearStart) continue;
    // 조퇴는 반나절 이상 자리를 비우는 휴가와 달리 근무일 자체는 출근한 것으로
    // 처리되므로 연차/월차 잔여일수에서 차감하지 않는다.
    if (lv.type === "조퇴") continue;

    const days = businessDaysBetween(lv.startDate, lv.endDate);

    if (lv.type === "병가") {
      sickDays += days;
    } else if (lv.type === "외근") {
      fieldDays += days;
    } else if (lv.type === "오전반차" || lv.type === "오후반차") {
      used += 0.5;
    } else {
      used += days;
    }
  }

  return {
    isAnnual,
    leaveLabel,
    entitlement,
    used,
    remaining: Math.max(0, entitlement - used),
    monthsOfService,
    sickDays,
    fieldDays,
  };
}

export const LEAVE_TYPES = ["연차", "오전반차", "오후반차", "병가", "경조사", "외근"];
