// ======================= src/payrollAccess.js =======================
// ⭐ 2026-11-06 직원 급여·연차 촉진 권한(화면용) — firestore.rules의 payrollEditor()/payrollViewer()/leaveManager()와 같은 기준.
//  메뉴를 그릴지 정하는 용도라 가볍게(무거운 급여 화면 묶음은 따로 불러온다). 실제 데이터 보호는 보안 규칙이 한다.
//  · 수정(write): 경리관리자(test) · 통합인사관리자(hrAcct) · 통합관리자(allMgr) · 회사 마스터(isMaster) · 최고관리자
//                 + 권한 관리에서 [급여관리]를 "수정"으로 켠 역할(인사관리자 포함)
//  · 조회(read): 인사관리자(기본 — 권한 관리에서 숨김/수정으로 바꿀 수 있음) · 대표(직책 대표·대표이사) · "임원 화면" 역할
//                 + 권한 관리에서 [급여관리]를 "조회"로 켠 역할(경리사무원·인사사무원·직접 만든 역할 등)
//  · 그 밖의 직원: 본인 명세서(발행된 것)만 — 회사관리 › 급여명세서
import React from "react";
import { useMyProfile } from "./userNames";
import { useCustomRoles, findCustomRole, builtinDefaultMenuAccess, roleScreen } from "./customRoles";

const SUPER_EMAIL = "tjddnqkf@naver.com";
export const PAYROLL_MENU = "급여관리";
export const PAYROLL_EDIT_ROLES = ["test", "hrAcct", "allMgr"];
// 보안 규칙에서 "메뉴 설정을 보지 않는" 내장 역할(고정 판단) — 이 밖의 역할은 [급여관리] 메뉴 설정을 따른다
const FIXED_ROLES = ["admin", "user", "viewer", "hrManager", "test", "hrAcct", "allMgr", "totalMaster", "driver", "shipper", "cafeUser"];
export const CEO_POSITIONS = ["대표", "대표이사"];

const menuLevel = (customRoles, role, fallback) => {
  const own = findCustomRole(customRoles, role);
  const v = own?.menus?.[PAYROLL_MENU];
  if (v) return v;
  return fallback;
};
// me: users 문서({ role, isMaster, position, team })
export function payrollLevelOf(me = {}, customRoles = [], email = "") {
  const role = String(me?.role || "");
  if (email === SUPER_EMAIL || role === "totalMaster") return "write";
  if (PAYROLL_EDIT_ROLES.includes(role) || me?.isMaster === true) return "write";
  if (role === "hrManager") return menuLevel(customRoles, role, builtinDefaultMenuAccess("hrManager")[PAYROLL_MENU] || "read");
  const custom = !FIXED_ROLES.includes(role) && role ? menuLevel(customRoles, role, "hidden") : "hidden";
  if (custom === "write") return "write";
  const own = findCustomRole(customRoles, role);
  if (CEO_POSITIONS.includes(String(me?.position || "")) || (own && roleScreen(own) === "exec")) return "read";
  return custom === "read" ? "read" : "hidden";
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
  const customRoles = useCustomRoles(company);
  return React.useMemo(() => {
    const me = { ...(prof || {}), role: prof?.role || roleHint || "" };
    const level = payrollLevelOf(me, customRoles, email);
    return { me, level, canView: level !== "hidden", canEdit: level === "write", leaveManager: leaveManagerOf(me, email), leaveViewer: leaveViewerOf(me, email), loading: prof === null };
  }, [prof, customRoles, roleHint, email]);
}
