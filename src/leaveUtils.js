// 연차/월차 계산 유틸 — PC(DispatchApp) / 모바일(MobileApp) 공용
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
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr || startStr);
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) + 1);
}

// hireDate: "YYYY-MM-DD" 문자열, schedules: 본인 휴가/외근 일정 배열(승인여부 무관, 내부에서 필터링)
export function calcLeaveBalance(hireDate, schedules, uid) {
  if (!hireDate) return null;
  const hire = new Date(hireDate + "T00:00:00");
  const now = new Date();
  if (isNaN(hire.getTime())) return null;

  const monthsOfService = Math.max(0, (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth()) - (now.getDate() < hire.getDate() ? 1 : 0));
  const isAnnual = monthsOfService >= 12;

  // 연차: 1년 이상 근속 시 15일 발생. 월차: 1년 미만, 근속 개월수만큼 최대 11일 발생(매월 1일).
  const entitlement = isAnnual ? 15 : Math.min(11, monthsOfService);
  const leaveLabel = isAnnual ? "연차" : "월차";

  let used = 0;
  let sickDays = 0;
  let fieldDays = 0;
  (schedules || []).forEach(s => {
    if (s.authorUid !== uid) return;
    const approvers = s.approvers || [];
    const allApproved = approvers.length > 0 && approvers.every(a => a.status === "approved");
    const isApproved = s.approvalStatus === "approved" || allApproved || getOverallApprovalStatusSimple(s) === "approved";
    if (!isApproved) return;
    const start = new Date(s.start + "T00:00:00");
    if (start < COUNT_START) return; // 2025년 이전 사용분은 카운트 제외(2026년부터 카운트)
    if (s.type === "휴가") used += daysBetween(s.start, s.end);
    else if (s.type === "오전반차" || s.type === "오후반차") used += 0.5;
    else if (s.type === "병가") sickDays += daysBetween(s.start, s.end);
    else if (s.type === "외근") fieldDays += daysBetween(s.start, s.end);
  });

  const remaining = Math.max(0, entitlement - used);
  return { isAnnual, leaveLabel, entitlement, used, remaining, monthsOfService, sickDays, fieldDays };
}
