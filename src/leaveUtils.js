// 연차/월차 계산 유틸 — PC(DispatchApp) / 모바일(MobileApp) 공용
import { isWeekend, isHoliday } from "./attendanceUtils";
import { leaveEntitlement } from "./approvalForms";

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
export function calcLeaveBalance(hireDate, schedules, uid, employeeName, holidays, now = new Date()) {
  if (!hireDate) return null;
  const hire = new Date(hireDate + "T00:00:00");
  if (isNaN(hire.getTime())) return null;

  // ⭐ 2026-11-07 규칙 점검 — 발생일수·회기는 전자결재 연차 현황(approvalForms.leaveEntitlement)과 같은 기준.
  //   예전엔 근속과 상관없이 15일 고정(3년차부터 2년마다 +1일 가산연차 누락)이고, 사용일수를 회기(입사 기념일 ~ 다음 기념일 전날)가 아니라
  //   2026년 1월 1일 이후 전부로 세어 내정보의 남은 연차가 전자결재 화면과 달랐다.
  const ent = leaveEntitlement(hireDate, now);
  if (!ent) return null;
  const monthsOfService = ent.months;
  const isAnnual = ent.label === "연차";
  // 연차: 1년 이상 15일 + 3년차부터 2년마다 1일(최대 25일). 월차: 1년 미만, 1개월 개근마다 1일(최대 11일).
  const entitlement = ent.total;
  const leaveLabel = ent.label;

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
    const inPeriod = s.start >= ent.from && s.start <= ent.to; // 연차 사용일수는 이번 회기(연차 사용 기간) 안의 것만
    if (s.type === "휴가") { if (inPeriod) used += businessDaysBetween(s.start, s.end, holidays); }
    else if (s.type === "오전반차" || s.type === "오후반차") { if (inPeriod) used += 0.5; }
    else if (s.type === "병가") sickDays += businessDaysBetween(s.start, s.end, holidays);
    else if (s.type === "외근") fieldDays += businessDaysBetween(s.start, s.end, holidays);
  });

  const remaining = Math.max(0, entitlement - used);
  return { isAnnual, leaveLabel, entitlement, used, remaining, monthsOfService, sickDays, fieldDays, from: ent.from, to: ent.to };
}
