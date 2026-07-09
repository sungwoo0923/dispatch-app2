// 사직서 결재라인 상태를 담당/대표 각각의 개별 결정(managerResult/ceoResult)으로부터
// 파생시킨다. 예전에는 결재자가 반려를 누르면 그 즉시 전체 상태가 확정되어
// 버렸는데, 실제로는 담당이 반려해도 대표가 아직 결정하지 않았다면 최종
// 확정이 아니다. 세 가지 조합 규칙:
//  - 신청인/담당 승인, 대표 반려 → 반려 (최종, 대표 거부권)
//  - 신청인 승인, 담당 반려, 대표 승인 → 보류
//  - 담당 반려, 대표 미결정 → 결재 진행중(ceo_pending), 아직 확정 아님
export function getManagerResult(req) {
  return req?.managerResult || (req?.managerSignatureDataUrl ? "approved" : null);
}

export function getCeoResult(req) {
  return req?.ceoResult || (req?.ceoSignatureDataUrl ? "approved" : null);
}

export function computeResignationStatus(req) {
  if (!req?.employeeSignatureDataUrl) return "employee_pending";
  const managerResult = getManagerResult(req);
  if (!managerResult) {
    if (req.status === "rejected" || req.status === "on_hold" || req.status === "completed") return req.status;
    return "submitted";
  }
  const ceoResult = getCeoResult(req);
  if (!ceoResult) {
    if (req.status === "rejected" || req.status === "on_hold" || req.status === "completed") return req.status;
    return "ceo_pending";
  }
  if (ceoResult === "rejected") return "rejected";
  if (managerResult === "rejected" && ceoResult === "approved") return "on_hold";
  return "completed";
}

// 담당/대표는 최초 결정 + 딱 한 번의 수정만 허용한다(결정 횟수 2회 제한).
export function canManagerActOnResignation(req) {
  if (!req?.employeeSignatureDataUrl) return false;
  return (req.managerDecisionCount || 0) < 2;
}

export function canCeoActOnResignation(req, isCeo) {
  if (!isCeo || !req?.employeeSignatureDataUrl) return false;
  if (!getManagerResult(req)) return false;
  return (req.ceoDecisionCount || 0) < 2;
}

// 지금 이 관리자가 결재 버튼을 눌렀을 때 진입해야 할 단계를 정한다.
// 담당이 아직 결정 전이면 누구든 담당으로 결정할 수 있고(기존 동작 유지),
// 담당이 이미 결정했다면 대표 권한을 가진 관리자는 대표 결정(최초 또는
// 1회 수정)을 우선 진행하며, 그 외에는 담당의 남은 1회 수정 기회를 보여준다.
export function resignationActionStage(req, isCeo) {
  if (!req) return null;
  if (canManagerActOnResignation(req) && !getManagerResult(req)) return "manager";
  if (isCeo && canCeoActOnResignation(req, isCeo)) return "ceo";
  if (canManagerActOnResignation(req)) return "manager";
  return null;
}
