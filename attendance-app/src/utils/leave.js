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

// Standard Korean labor-law style annual leave: 15 days after 1yr tenure,
// prorated ~1 day/month (up to 11) before 1yr. Cycle resets from Jan 1 of
// the current year for simplicity.
export function calcLeaveBalance({ hireDate, leaves = [], today = toDateKey() }) {
  const monthsOfService = Math.max(0, monthsBetween(hireDate, today));
  const isAnnual = monthsOfService >= 12;
  const entitlement = isAnnual ? 15 : Math.min(11, monthsOfService);
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
