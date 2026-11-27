// ======================= src/hireDate.js =======================
// 🗓 2026-11-27 입사일 읽기 — 화면마다 읽는 곳이 달랐다(인사 · 연차: userProfiles.hireDate 먼저 / 급여 · 직원관리 목록: users.hireDate 만)
//  → 예전에 userProfiles 에만 입사일이 들어간 직원은 급여명세서 입사일이 비고 직원관리 목록에 'NO DATE'로 보였다.
//  모든 화면이 같은 순서로 읽는다: 인사 프로필(userProfiles) → 사용자 문서(users)
import React from "react";
import { useUserProfiles } from "./userProfilesLive";

export function hireDateOf(user, profile) {
  return String(profile?.hireDate || user?.hireDate || "").trim();
}

// 직원 목록(users 문서 배열, id 필드) → hireDate 를 위 순서로 맞춘 목록(바뀐 사람만 새 객체). rows 가 null 이면 null 그대로
export function useStaffHireDates(rows) {
  const uids = React.useMemo(() => (rows || []).map((u) => u.id), [rows]);
  const pf = useUserProfiles(uids);
  return React.useMemo(() => (rows ? rows.map((u) => { const h = hireDateOf(u, pf[u.id]); return h === String(u.hireDate || "").trim() ? u : { ...u, hireDate: h }; }) : rows), [rows, pf]);
}
