// 연차/월차 계산 유틸 — PC(DispatchApp) / 모바일(MobileApp) 공용
import { isWeekend, isHoliday } from "./attendanceUtils";

export function getOverallApprovalStatusSimple(s) {
  const approvers = s.approvers || (s.approverUid ? [{ uid: s.approverUid, name: s.approverName, status: s.approvalStatus || "pending" }] : []);
  if (approvers.length === 0) return "none";
  const statuses = approvers.map(a => a.status || "pending");
  if (statuses.every(st => st === "approved")) return "approved";
  if (statuses.some(st => st === "rejected")) return "rejected";
  if (statuses.every(st => st === "hold")) return "hold";
  if (statuses.some(st => st !== "pending")) return "in_progress";
  return "pending";
}

const COUNT_START = new Date("2026-01-01T00:00:00");

// 주말/공휴일을 제외한 실제 사용일수 계산 — 휴가/병가/외근은 평일에만 소진되는 것으로 간주
function businessDaysBetween(startStr, endStr, holidays) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date((endStr || startStr) + "T00:00:00");
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!isWeekend(ds) && !isHoliday(ds, holidays)) count++;
  }
  return Math.max(0, count);
}

function normalizeName(name) {
  return (name || "").trim().replace(/\d+$/, "");
}

// hireDate: "YYYY-MM-DD" 문자열, schedules: 본인 휴가/외근 일정 배열(승인여부 무관, 내부에서 필터링)
// employeeName: authorUid가 어긋난 과거 데이터(관리자 대리등록 등)도 동일인으로 매칭하기 위한 보조 키
export function calcLeaveBalance(hireDate, schedules, uid, employeeName, holidays) {
  if (!hireDate) return null;
  const hire = new Date(hireDate + "T00:00:00");
  const now = new Date();
  if (isNaN(hire.getTime())) return null;

  const monthsOfService = Math.max(0, (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth()) - (now.getDate() < hire.getDate() ? 1 : 0));
  const isAnnual = monthsOfService >= 12;

  // 연차: 1년 이상 근속 시 15일 발생. 월차: 1년 미만, 근속 개월수만큼 최대 11일 발생(매월 1일).
  const entitlement = isAnnual ? 15 : Math.min(11, monthsOfService);
  const leaveLabel = isAnnual ? "연차" : "월차";

  const normEmpName = normalizeName(employeeName);
  let used = 0;
  let sickDays = 0;
  let fieldDays = 0;
  (schedules || []).forEach(s => {
    const sameUid = s.authorUid === uid;
    const sameName = normEmpName && normalizeName(s.name) === normEmpName;
    if (!sameUid && !sameName) return;
    const approvers = s.approvers || [];
    const anyRejected = approvers.some(a => a.status === "rejected");
    if (anyRejected) return; // 반려 건만 제외, 나머지(승인/대기 포함)는 모두 사용일수로 집계
    const start = new Date(s.start + "T00:00:00");
    if (start < COUNT_START) return; // 2025년 이전 사용분은 카운트 제외(2026년부터 카운트)
    if (s.type === "휴가") used += businessDaysBetween(s.start, s.end, holidays);
    else if (s.type === "오전반차" || s.type === "오후반차") used += 0.5;
    else if (s.type === "병가") sickDays += businessDaysBetween(s.start, s.end, holidays);
    else if (s.type === "외근") fieldDays += businessDaysBetween(s.start, s.end, holidays);
  });

  const remaining = Math.max(0, entitlement - used);
  return { isAnnual, leaveLabel, entitlement, used, remaining, monthsOfService, sickDays, fieldDays };
}
