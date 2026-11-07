// 연차/월차 계산 유틸 — PC(DispatchApp) / 모바일(MobileApp) 공용
import { isWeekend, isHoliday } from "./attendanceUtils";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";

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

// ⭐ 2026-11-07 연차 현황 한 가지 계산 — 내정보(PC·모바일) · 전자결재 내 연차 현황 · 인사관리부 연차 관리가 같은 함수를 쓴다
//  · 발생: approvalForms.leaveEntitlement(입사일 기준 · 회사가 회계연도 기준이면 회계연도 회기 — opts.basis)
//  · 사용: 전자결재 연차·반차 중 "승인"된 것만(진행 중은 pending으로 따로) + 예전 휴가 게시판(schedules, 2026년부터)도 승인된 것만
//    (결재선이 없는 예전 글은 그대로 사용으로 본다) · 이번 회기 안의 것만
//  · 조정: 인사관리자 연차 조정(userProfiles.leaveAdjust 중 이번 회기 것) — 발생일수에 더한다
//  · 병가 · 외근 일수는 예전 게시판 기록(반려 제외)으로 따로 센다
export function leaveStatusOf({ hireDate, uid, name = "", approvals = [], schedules = [], adjust = [], holidays = [], now = new Date(), basis = null } = {}) {
  const ent0 = leaveEntitlement(hireDate || "", now, basis);
  if (!ent0) return null;
  const inPeriod = (dt) => !!dt && dt >= ent0.from && dt <= ent0.to;
  let used = 0; let pending = 0; let sickDays = 0; let fieldDays = 0;
  (approvals || []).filter((d) => d && d.drafterUid === uid).forEach((d) => {
    const u = leaveUseOf(d);
    if (!u || !inPeriod(u.date)) return;
    if (d.status === "approved") used += u.days;
    else if (d.status === "pending") pending += u.days;
  });
  const normEmpName = normalizeName(name);
  (schedules || []).forEach((x) => {
    const sameUid = !!uid && x.authorUid === uid;
    const sameName = normEmpName && normalizeName(x.name) === normEmpName;
    if (!sameUid && !sameName) return;
    if (!x.start || x.start < "2026-01-01") return; // 2025년 이전 사용분은 세지 않는다(2026년부터)
    const st = getOverallApprovalStatusSimple(x);
    if (st === "rejected") return;
    if (x.type === "병가") { sickDays += businessDaysBetween(x.start, x.end, holidays); return; }
    if (x.type === "외근") { fieldDays += businessDaysBetween(x.start, x.end, holidays); return; }
    const days = x.type === "휴가" ? businessDaysBetween(x.start, x.end, holidays) : (x.type === "오전반차" || x.type === "오후반차") ? 0.5 : 0;
    if (!days || !inPeriod(x.start)) return;
    if (st === "approved" || st === "none") used += days; // 승인된 것만(결재선 없는 예전 글은 그대로)
    else pending += days;
  });
  const adj = (adjust || []).filter((x) => x && x.period === ent0.from);
  const adjSum = adj.reduce((a, x) => a + (Number(x.days) || 0), 0);
  const total = ent0.total + adjSum;
  return { ent: { ...ent0, total }, base: ent0.total, used, pending, remain: total - used, adj, adjSum, sickDays, fieldDays };
}

// hireDate: "YYYY-MM-DD" 문자열, schedules: 본인 휴가/외근 일정 배열(승인여부 무관, 내부에서 필터링)
// employeeName: authorUid가 어긋난 과거 데이터(관리자 대리등록 등)도 동일인으로 매칭하기 위한 보조 키
// opts: { approvals(전자결재 연차·반차 문서), adjust(연차 조정), basis({ basis, fiscalStart }) } — leaveStatusOf와 같은 계산
export function calcLeaveBalance(hireDate, schedules, uid, employeeName, holidays, now = new Date(), opts = {}) {
  if (!hireDate) return null;
  const st = leaveStatusOf({ hireDate, uid, name: employeeName, approvals: opts.approvals || [], schedules, adjust: opts.adjust || [], holidays, now, basis: opts.basis || null });
  if (!st) return null;
  const { ent } = st;
  return {
    isAnnual: ent.label === "연차", leaveLabel: ent.label, entitlement: ent.total, used: st.used, pending: st.pending,
    remaining: Math.max(0, st.remain), monthsOfService: ent.months, sickDays: st.sickDays, fieldDays: st.fieldDays, from: ent.from, to: ent.to, adjSum: st.adjSum,
  };
}
