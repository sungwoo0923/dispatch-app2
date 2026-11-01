// ⭐ 2026-11-01 출근기록부 권한·결재 공용 로직 (PC 출근기록부 · 모바일 출근기록부 · 임원 결재함 공용)
//  · 출·퇴근 기록 "직접 수정"은 인사팀(인사관리자·통합인사·인사 부서)만 — 최고관리자(플랫폼)는 예외로 허용
//    단, 인사팀도 "본인 기록"은 직접 고치지 못하고 수정 요청을 올린다(셀프 승인 금지)
//  · 일반 직원의 수정·출근 요청 → 인사팀이 승인
//  · 인사팀 본인의 요청 → 회사 임원(부서 "임원" 또는 임원 화면 역할) 전원에게 알림, 임원 1명이 승인하면 반영·종결
//  · 요청 문서에 approverGroup("hr" | "exec" | "admin")과 approverUids를 저장해 누가 승인할 수 있는지 고정한다
import { addDoc, arrayUnion, collection, doc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { isExecProfile } from "./hrConstants";
import { findCustomRole, roleScreen } from "./customRoles";

export const HR_ROLES = ["hrManager", "hrAcct"];

// 인사 담당자 — 인사관리자·통합인사관리자 권한 또는 부서명에 "인사"
export function isHrStaffUser(u, roleOverride) {
  const r = roleOverride ?? u?.role;
  return HR_ROLES.includes(r) || /인사/.test(String(u?.team || ""));
}
// 임원 — 부서 "임원"(또는 임원 직책) 또는 권한 관리에서 "임원 화면"으로 정한 역할
export function isExecUser(u, customRoles) {
  if (!u) return false;
  if (isExecProfile(u)) return true;
  return roleScreen(findCustomRole(customRoles, u.role)) === "exec";
}

export const APPROVER_GROUP_LABEL = { hr: "인사팀", exec: "임원", admin: "관리자" };

// ⭐ 2026-11-02 점검 — 계정 없이 등록된 직원(noAccount)은 로그인할 수 없으므로 승인자 후보에서 제외(영원히 대기하는 요청 방지)
const activeStaff = (list) => (list || []).filter((e) => e && e.uid && !e.noAccount && e.approved !== false && e.employmentStatus !== "퇴사" && !["driver", "shipper", "cafeUser"].includes(e.role));

// 요청자에 맞는 승인자 — 인사팀 본인 요청은 임원에게, 그 밖의 직원은 인사팀에게
export function resolveApprovers(requester, employees, customRoles) {
  const others = activeStaff(employees).filter((e) => e.uid !== requester?.uid);
  const admins = others.filter((e) => e.role === "admin");
  if (requester && isHrStaffUser(requester)) {
    const execs = others.filter((e) => isExecUser(e, customRoles));
    if (execs.length) return { group: "exec", uids: execs.map((e) => e.uid) };
    // 임원이 한 명도 없는 회사 — 관리자에게(인사팀끼리 승인하지 않게)
    return { group: "admin", uids: admins.map((e) => e.uid) };
  }
  const hr = others.filter((e) => isHrStaffUser(e));
  if (hr.length) return { group: "hr", uids: hr.map((e) => e.uid) };
  return { group: "admin", uids: admins.map((e) => e.uid) };
}

// 이 요청을 내가 승인할 수 있는가(본인 요청은 절대 불가)
export function canApproveAttendanceReq(req, me, role, customRoles, employees) {
  if (!req || !me?.uid || req.uid === me.uid) return false;
  if (role === "totalMaster") return true;
  if (Array.isArray(req.approverUids) && req.approverUids.length) return req.approverUids.includes(me.uid);
  // 예전 요청(승인자 지정 전) — 요청자가 인사팀이면 임원, 아니면 인사팀
  const requester = (employees || []).find((e) => e.uid === req.uid);
  const meWithRole = { ...me, role: role || me.role };
  return requester && isHrStaffUser(requester) ? isExecUser(meWithRole, customRoles) : isHrStaffUser(meWithRole);
}

// 출·퇴근 기록 직접 수정 — 인사팀(본인 기록 제외) · 최고관리자
export function canEditAttendanceOf(targetUid, me, role) {
  if (role === "totalMaster") return true;
  if (!me?.uid || targetUid === me.uid) return false;
  return isHrStaffUser({ ...me, role: role || me.role });
}

// 승인자들에게 알림
export async function notifyApprovers(uids, payload) {
  for (const toUid of uids || []) {
    try { await addDoc(collection(db, "notifications"), { ...payload, toUid, read: false, createdAt: serverTimestamp() }); } catch { /* 알림 실패는 무시 */ }
  }
}

// 요청이 처리되면 다른 승인자들에게 간 알림도 닫는다(먼저 승인한 1명으로 종결)
export async function closeRequestNotifs(field, reqId, company) {
  if (!reqId) return;
  try {
    const snap = await getDocs(query(collection(db, "notifications"), where("companyName", "==", company), where(field, "==", reqId)));
    await Promise.all(snap.docs.filter((d) => d.data().read !== true).map((d) => updateDoc(d.ref, { read: true, readAt: serverTimestamp() }).catch(() => {})));
  } catch { /* 권한·색인 문제는 무시 — 요청 상태로도 걸러진다 */ }
}

// 알림을 "봤음"으로 남긴다 — 탭을 옮겼다 와도 다시 뜨지 않게(컴포넌트 상태가 아니라 알림 문서에 저장)
export function markNotifSeen(id) {
  if (!id) return;
  updateDoc(doc(db, "notifications", id), { read: true, readAt: serverTimestamp() }).catch(() => {});
}

const resultNotif = (req, company, status, text, extra = {}) => addDoc(collection(db, "notifications"), {
  toUid: req.uid, type: "attendance_result", status, msg: text, read: false, createdAt: serverTimestamp(), companyName: company, ...extra,
}).catch(() => {});

// 수정 요청 승인 — 트랜잭션으로 "아직 대기 중"일 때만 반영(임원 여러 명이 동시에 눌러도 1번만)
export async function approveChangeReq(req, approver, company) {
  const ref = doc(db, "attendanceChangeRequests", req.id);
  const ok = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists() || s.data().status !== "pending") return false;
    const d = s.data();
    tx.update(ref, { status: "approved", approvedBy: approver.uid || "", approvedByName: approver.name || "", decidedAt: serverTimestamp() });
    tx.set(doc(db, "attendance", `${d.date}_${d.uid}`), {
      uid: d.uid, name: d.name, date: d.date, month: d.date.slice(0, 7), companyName: company,
      status: d.requestedStatus, checkInTime: d.requestedCheckIn || null, checkOutTime: d.requestedCheckOut || null,
      source: "change_request_approved", editedBy: approver.uid || "", editedByName: approver.name || "", editedAt: new Date().toISOString(),
      history: arrayUnion({ status: d.requestedStatus, checkInTime: d.requestedCheckIn || null, checkOutTime: d.requestedCheckOut || null, editedByName: `${approver.name || "승인자"}(요청 승인)`, editedAt: new Date().toISOString() }),
    }, { merge: true });
    return true;
  });
  await closeRequestNotifs("changeReqId", req.id, company);
  if (!ok) return false;
  await resultNotif(req, company, "approved", `[출근수정] ${req.date} 수정 요청이 승인되었습니다.${approver.name ? ` (승인: ${approver.name})` : ""}`, { changeReqId: req.id });
  return true;
}

export async function rejectChangeReq(req, approver, company, reason) {
  const ref = doc(db, "attendanceChangeRequests", req.id);
  const ok = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists() || s.data().status !== "pending") return false;
    tx.update(ref, { status: "rejected", rejectionReason: reason || "", rejectedBy: approver.uid || "", rejectedByName: approver.name || "", decidedAt: serverTimestamp() });
    return true;
  });
  await closeRequestNotifs("changeReqId", req.id, company);
  if (!ok) return false;
  await resultNotif(req, company, "rejected", `[출근수정] ${req.date} 수정 요청이 거절되었습니다.`, { rejectionReason: reason || "", changeReqId: req.id });
  return true;
}

// 출근 요청(당일 출근 누락) 승인·거절
export async function approveCheckInReq(req, approver, company) {
  const ref = doc(db, "attendanceRequests", req.id);
  const ok = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists() || (s.data().status || "pending") !== "pending") return false;
    const d = s.data();
    tx.delete(ref);
    tx.set(doc(db, "attendance", `${d.date}_${d.uid}`), {
      uid: d.uid, name: d.name, date: d.date, month: d.date.slice(0, 7), companyName: company,
      status: "출근", checkInTime: d.requestedAt, source: "request_approved",
      editedBy: approver.uid || "", editedByName: approver.name || "", editedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  });
  await closeRequestNotifs("checkInReqId", req.id, company);
  if (!ok) return false;
  await resultNotif(req, company, "approved", `[출근요청] ${req.date} 출근 요청이 승인되었습니다.${approver.name ? ` (승인: ${approver.name})` : ""}`);
  return true;
}

export async function rejectCheckInReq(req, approver, company, reason) {
  const ref = doc(db, "attendanceRequests", req.id);
  const ok = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists() || (s.data().status || "pending") !== "pending") return false;
    tx.delete(ref);
    return true;
  });
  await closeRequestNotifs("checkInReqId", req.id, company);
  if (!ok) return false;
  await resultNotif(req, company, "rejected", `[출근요청] ${req.date} 출근 요청이 거절되었습니다.`, { rejectionReason: reason || "" });
  return true;
}

// 수정 요청 올리기 — 승인자 지정 + 알림
export async function submitChangeReq({ requester, date, status, checkIn, checkOut, reason, company, employees, customRoles }) {
  const { group, uids } = resolveApprovers(requester, employees, customRoles);
  const name = requester.name || requester.email || "";
  const ref = await addDoc(collection(db, "attendanceChangeRequests"), {
    uid: requester.uid, name, date,
    requestedStatus: status, requestedCheckIn: checkIn || null, requestedCheckOut: checkOut || null,
    reason: reason || "", companyName: company, status: "pending",
    approverGroup: group, approverUids: uids,
    createdAt: serverTimestamp(),
  });
  await notifyApprovers(uids, {
    type: "attendance_change_request", fromName: name, fromUid: requester.uid, date,
    requestedStatus: status, requestedCheckIn: checkIn || null, requestedCheckOut: checkOut || null,
    changeReqId: ref.id, approverGroup: group, companyName: company,
    msg: `[출근수정요청] ${name}님이 ${date} 수정 요청을 했습니다.${group === "exec" ? " (인사팀 본인 요청 · 임원 승인)" : ""}`,
  });
  return { id: ref.id, group, count: uids.length };
}

export async function submitCheckInReq({ requester, date, requestedAt, company, employees, customRoles }) {
  const { group, uids } = resolveApprovers(requester, employees, customRoles);
  const name = requester.name || requester.email || "";
  const ref = await addDoc(collection(db, "attendanceRequests"), {
    uid: requester.uid, name, date, requestedAt, companyName: company, status: "pending",
    approverGroup: group, approverUids: uids, createdAt: serverTimestamp(),
  });
  await notifyApprovers(uids, {
    type: "attendance_check_in_request", fromName: name, fromUid: requester.uid, date,
    checkInReqId: ref.id, approverGroup: group, companyName: company,
    msg: `[출근요청] ${name}님이 ${date} 출근 요청을 했습니다.${group === "exec" ? " (인사팀 본인 요청 · 임원 승인)" : ""}`,
  });
  return { id: ref.id, group, count: uids.length };
}
