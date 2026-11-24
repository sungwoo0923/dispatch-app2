// ======================= src/staffFilter.js =======================
// ⭐ 최고관리자는 실무자·출근 직원이 아니라 프로그램을 관리하는 계정이다(2026-10-27).
//    직원 목록·출근기록부·조직도·로그인관리처럼 "회사 인력"을 보여주는 곳에서는 빼고 보여준다.
export const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
export const isTMUser = (u) => !!u && (u.role === "totalMaster" || String(u.email || "").trim().toLowerCase() === TOTAL_MASTER_EMAIL);
// 🧑‍💻 2026-11-24 최고관리자는 어느 운송사에도 속하지 않는다(사용자 요청) — 운송사는 점검 · 개발하러 들어가 보는 것뿐.
//  소속이 보이는 곳은 이 글자로: "로지스웹 · 개발자"
export const TM_AFFIL = "로지스웹 · 개발자";
export const TM_ORG = "로지스웹";
export const affiliationOf = (u, company = "") => (isTMUser(u) ? TM_AFFIL : String(company || u?.companyName || "").trim());
