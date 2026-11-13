// ======================= src/workScope.js =======================
// 🗂 2026-11-13 업무 범위 — 계정마다 "배차를 쓰는지"를 권한과 따로 정한다(users/{uid}.workScope)
//  · ""(기본)   = 배차 포함 — 지금까지와 같다(예전 계정은 전부 이것)
//  · "office"    = 사내업무만 — 홈 · 전자결재 · 회사관리(게시판 · 메일 · 메신저 · 일정 · 근태는 홈/회사관리 안에 있다)
//  · "officeAcct"= 사내업무 + 경리 — 위에 더해 회계관리 · 자금관리 · 비품관리(배차현황 · 정산 · 매출 · 기사관리는 뺀다)
//  요금은 같은 직원 계정 1명으로 센다(사용자 결정). 직원 수정 화면(관리자메뉴)에서 마스터 · 관리자 · 인사가 바꾼다.
export const WORK_SCOPES = [
  ["", "배차 포함 (기본)", "배차 · 정산 등 권한에 맞는 모든 메뉴"],
  ["office", "사내업무만", "홈 · 전자결재 · 게시판 · 메일 · 메신저 · 회사관리"],
  ["officeAcct", "사내업무 + 경리", "사내업무 + 회계 · 자금 · 비품 (배차 · 정산 제외)"],
];
export const workScopeLabel = (s) => (WORK_SCOPES.find(([k]) => k === (s || "")) || WORK_SCOPES[0])[1];
export const normScope = (s) => (s === "office" || s === "officeAcct" ? s : "");
const OFFICE_BASE = ["HOME", "전자결재", "회사관리"];
const OFFICE_ACCT = ["회계관리", "자금관리", "비품관리"];
export const isOfficeBaseMenu = (m) => OFFICE_BASE.includes(m);
// 이 업무 범위에서 볼 수 있는 메뉴인지(배차 포함이면 언제나 true)
export function scopeAllows(scope, menu) {
  const s = normScope(scope);
  if (!s) return true;
  return OFFICE_BASE.includes(menu) || (s === "officeAcct" && OFFICE_ACCT.includes(menu));
}
