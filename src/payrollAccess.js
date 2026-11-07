// ======================= src/payrollAccess.js =======================
// ⭐ 2026-11-06 직원 급여·연차 촉진 권한(화면용) — firestore.rules의 payrollStaff()/leaveManager()와 같은 기준.
//  메뉴를 그릴지 정하는 용도라 가볍게(무거운 급여 화면 묶음은 따로 불러온다). 실제 데이터 보호는 보안 규칙 + 급여 비밀번호(서버)가 한다.
// ⭐ 2026-11-07 급여는 경리 업무 — 돈을 내보내는 경리만 본다
//  · 급여 담당(보기·수정 같음): 경리관리자(test) · 경리사무원(acctStaff) · 재무·경리·회계·총무 부서 · 최고관리자
//      + 통합인사관리자(hrAcct)·통합관리자(allMgr)는 "경리 화면"으로 전환했을 때만(전자결재 지급 처리와 같은 기준 — Approval.jsx isFinUser)
//  · 비밀번호를 처음 정하고 바꾸는 사람(canAdmin): 경리관리자 · 통합인사관리자 · 통합관리자 · 최고관리자 · 경리·회계 부서의 관리자/회사 마스터
//  · 인사관리자·대표·임원·회사 마스터는 경리가 아니면 급여를 못 본다(예전 "급여 대장(조회)" 없앰 — 인사는 연차·근태만)
//  · 그 밖의 직원: 본인 명세서(발행된 것)만 — 내정보 › 급여명세서
import React from "react";
import { useMyProfile } from "./userNames";

const SUPER_EMAIL = "tjddnqkf@naver.com";
export const PAYROLL_MENU = "급여관리";
export const PAYROLL_EDIT_ROLES = ["test", "acctStaff", "hrAcct", "allMgr"];
export const FIN_TEAM = /재무|경리|회계|총무/;
const NON_STAFF = ["driver", "shipper", "cafeUser"];
export const CEO_POSITIONS = ["대표", "대표이사"];
// 통합 역할의 화면 전환(localStorage) — Approval.jsx와 같은 키
const MULTI_VIEW = { allMgr: "kpAllMgrView", hrAcct: "kpHrAcctView" };
export function acctViewOn(role) {
  const key = MULTI_VIEW[role];
  if (!key) return false;
  try { const v = localStorage.getItem(key); return role === "hrAcct" ? v !== "hr" : v === "acct"; } catch { return false; }
}
// 보안 규칙 payrollStaff()와 같은 판단(화면 전환은 서버가 모르므로 hrAcct·allMgr는 규칙에서는 늘 허용)
export function isPayrollStaff(me = {}, email = "", { ignoreView = false } = {}) {
  const role = String(me?.role || "");
  if (email === SUPER_EMAIL || role === "totalMaster") return true;
  if (NON_STAFF.includes(role) || me?.approved === false) return false;
  if (["test", "acctStaff"].includes(role)) return true;
  if (["hrAcct", "allMgr"].includes(role)) return ignoreView || acctViewOn(role);
  return FIN_TEAM.test(String(me?.team || ""));
}
export function isPayrollAdmin(me = {}, email = "") {
  const role = String(me?.role || "");
  if (email === SUPER_EMAIL || role === "totalMaster") return true;
  if (!isPayrollStaff(me, email, { ignoreView: true })) return false;
  return ["test", "hrAcct", "allMgr"].includes(role) || (FIN_TEAM.test(String(me?.team || "")) && (role === "admin" || me?.isMaster === true));
}
export function payrollLevelOf(me = {}, email = "") {
  return isPayrollStaff(me, email) ? "write" : "hidden";
}
// 연차 촉진 관리(발송·날짜 지정) — 인사팀(보안 규칙 isHrStaff와 같음) + 회사 마스터. 경리관리자는 현황 조회만
export function leaveManagerOf(me = {}, email = "") {
  const role = String(me?.role || "");
  return email === SUPER_EMAIL || ["hrManager", "hrAcct", "allMgr", "hrStaff", "totalMaster"].includes(role) || /인사/.test(String(me?.team || "")) || me?.isMaster === true;
}
export function leaveViewerOf(me = {}, email = "") {
  return leaveManagerOf(me, email) || ["test", "acctStaff"].includes(String(me?.role || ""));
}

// roleHint: 둘러보기(/preview)처럼 users 문서가 없을 때 쓰는 역할
export function usePayrollAccess(company, uid, roleHint = "", email = "") {
  const prof = useMyProfile(uid);
  // 화면 전환(경리 ↔ 인사)을 바꾸면 다시 판단
  const [, bump] = React.useState(0);
  React.useEffect(() => { const h = () => bump((n) => n + 1); window.addEventListener("storage", h); window.addEventListener("kp-role-view", h); return () => { window.removeEventListener("storage", h); window.removeEventListener("kp-role-view", h); }; }, []);
  const me = { ...(prof || {}), role: prof?.role || roleHint || "" };
  const level = payrollLevelOf(me, email);
  return { me, level, canView: level !== "hidden", canEdit: level === "write", canAdmin: isPayrollAdmin(me, email), leaveManager: leaveManagerOf(me, email), leaveViewer: leaveViewerOf(me, email), loading: prof === null };
}
