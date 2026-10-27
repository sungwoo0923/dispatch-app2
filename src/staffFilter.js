// ======================= src/staffFilter.js =======================
// ⭐ 최고관리자는 실무자·출근 직원이 아니라 프로그램을 관리하는 계정이다(2026-10-27).
//    직원 목록·출근기록부·조직도·로그인관리처럼 "회사 인력"을 보여주는 곳에서는 빼고 보여준다.
export const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
export const isTMUser = (u) => !!u && (u.role === "totalMaster" || String(u.email || "").trim().toLowerCase() === TOTAL_MASTER_EMAIL);
