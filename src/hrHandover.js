// src/hrHandover.js
// ⭐ 2026-11-01 마스터 인사권 자동 인계 —
//  회사 첫 가입자(마스터)는 인사 담당자가 없을 때만 임시로 인사 업무(인사관리부·인사발령·부서/직책·퇴사)를 한다.
//  인사관리자(hrManager)·경리+인사(hrAcct)·인사 부서 직원이 한 명이라도 생기면 인사권은 자동으로 그쪽으로 넘어가고,
//  그 사람이 모두 퇴사하면 다시 마스터에게 돌아온다. 마스터의 승인·권한 지정은 그대로 유지(인사관리자를 지정해야 하므로).
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";

// ⭐ 2026-11-02 점검 — 계정 없는 직원(noAccount: 인사 기록용으로만 등록)은 로그인할 수 없으므로 인사 담당자로 보지 않는다
//  (이 사람만 인사팀에 있으면 마스터의 인사권이 사라져 아무도 인사 업무를 못 하던 문제)
// ⭐ 2026-11-09 인사 담당 판정은 "부서 이름"이 아니라 실제 권한 기준 — 인사팀에 있어도 권한을 운송·경리 등으로 바꾸면 인사 담당이 아니다
//  (예전엔 부서가 인사팀이면 권한을 바꿔도 "인사 담당자가 있어 부서·직책·퇴사는 인사팀에서" 안내로 마스터가 잠겼다)
//  인사 권한 = 인사관리자 · 인사사무원 · 통합인사관리자 · 통합관리자 + 회사가 만든 역할 중 이름에 "인사"가 들어간 역할(customRoles가 알려 줌)
const HR_ROLES = ["hrManager", "hrAcct", "allMgr", "hrStaff"];
let hrCustomKeys = new Set();
export const setHrCustomRoleKeys = (keys) => { hrCustomKeys = new Set(keys || []); };
export const isHrRoleKey = (role) => HR_ROLES.includes(role) || hrCustomKeys.has(role);
export const isHrStaffUser = (u) =>
  !!u && !u.noAccount && u.approved !== false && u.employmentStatus !== "퇴사" &&
  !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && isHrRoleKey(u.role);

// 나(exceptUid)를 뺀 인사 담당자가 있는지
export const companyHasHrStaff = (users, exceptUid) =>
  (users || []).some((u) => (u.id || u.uid) !== exceptUid && isHrStaffUser(u));

// 마스터가 지금 인사권을 갖는지 — 마스터가 아니면 false, 본인이 인사 담당이면 true, 아니면 다른 인사 담당자가 없을 때만
export const masterHasHr = (me, users, myUid) =>
  me?.isMaster === true && (isHrStaffUser(me) || !companyHasHrStaff(users, myUid));

// 회사 직원 목록 구독(인사 담당자 여부 판단용). null = 아직 불러오는 중
export function useCompanyStaff(company) {
  const [users, setUsers] = React.useState(null);
  React.useEffect(() => {
    if (!company) { setUsers([]); return undefined; }
    return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)),
      (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => (u.companyName || DEFAULT_COMPANY) === company)),
      () => setUsers([]));
  }, [company]);
  return users;
}
