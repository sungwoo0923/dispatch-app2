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
  // ⭐ 2026-11-17 경리업무만 — 배차와 상관없는 경리 직원(사용자 요청). 경리 화면 그대로(정산 · 매출 · 회계 · 자금 · 비품) + 배차 메뉴 · 배차 알림은 숨긴다
  ["acct", "경리업무만", "정산 · 매출 · 회계 · 자금 · 비품 (배차 메뉴 · 배차 알림 없음)"],
];
export const workScopeLabel = (s) => (WORK_SCOPES.find(([k]) => k === (s || "")) || WORK_SCOPES[0])[1];
export const normScope = (s) => (s === "office" || s === "officeAcct" || s === "acct" ? s : "");
// 사내업무 화면(배차 · 경리 화면 대신 사내업무 홈)을 쓰는 범위인지 — "acct"(경리업무만)는 경리 화면을 그대로 쓴다
export const isOfficeScope = (s) => s === "office" || s === "officeAcct";
// 배차 메뉴 — "경리업무만"이면 숨긴다(배차 등록 · 현황 · 운임 · 기사 · 거래처 · 지입차)
export const DISPATCH_MENUS = ["배차관리", "실시간배차현황", "배차현황", "단가표", "운임조회", "기사관리", "거래처관리", "지입차관리"];
const OFFICE_BASE = ["HOME", "전자결재", "회사관리"];
const OFFICE_ACCT = ["회계관리", "자금관리", "비품관리"];
export const isOfficeBaseMenu = (m) => OFFICE_BASE.includes(m);
// 이 업무 범위에서 볼 수 있는 메뉴인지(배차 포함이면 언제나 true)
export function scopeAllows(scope, menu) {
  const s = normScope(scope);
  if (!s) return true;
  if (s === "acct") return !DISPATCH_MENUS.includes(menu);
  return OFFICE_BASE.includes(menu) || (s === "officeAcct" && OFFICE_ACCT.includes(menu));
}

// 🗂 2026-11-15 권한마다 고를 수 있는 업무 범위 — 권한과 맥락이 맞게(사용자 요청)
//  · 통합관리자(회사 마스터 포함) = 전체 업무 고정(운송 · 영업 · 경리 · 인사 화면을 바꿔 가며 다 본다)
//  · 통합인사관리자 = 경리 + 인사 고정 · 운송관리자 · 운송사무원 = 배차 업무 고정
//  · 경리관리자 · 경리사무원만 고를 수 있다: 경리 + 배차 확인(기본 — 정산 · 배차현황 확인 포함) / 경리업무만(배차 메뉴 없음 · 2026-11-17) / 사내업무 + 경리(배차 · 정산 제외)
//  · 인사 · 영업 · 법무 · 개발 = 권한 관리에서 정한 메뉴 고정(배차 포함 / 사내업무만 같은 선택이 필요 없다)
//  예전에 맞지 않게 저장된 값(예: 통합관리자인데 사내업무만)은 무시하고 권한 기준으로 동작한다(effectiveScope)
const FIXED = {
  totalMaster: ["전체 업무 (최고관리자)", "모든 메뉴"],
  allMgr: ["전체 업무 (고정)", "운송 · 영업 · 경리 · 인사 화면을 바꿔 가며 모두 봐요"],
  hrAcct: ["경리 + 인사 (고정)", "경리 · 인사 화면을 바꿔 가며 봐요"],
  admin: ["배차 업무 (고정)", "배차 · 운임 · 기사 · 거래처 등 운송 메뉴"],
  user: ["배차 업무 (고정)", "배차 · 운임 · 기사 · 거래처 등 운송 메뉴"],
};
const ACCT_ROLES = ["test", "acctStaff"];
export function scopeOptionsFor(role, isMaster = false) {
  const r = isMaster && !["totalMaster", "driver", "shipper"].includes(role) ? "allMgr" : role;
  if (FIXED[r]) return [["", FIXED[r][0], FIXED[r][1]]];
  //  ⭐ 2026-11-17 경리업무만(배차 메뉴 · 배차 알림 없음) 추가 — 배차와 상관없는 경리 직원용
  if (ACCT_ROLES.includes(r)) return [["", "경리 + 배차 확인 (기본)", "정산 · 회계 · 자금 · 비품 + 배차현황 · 기사관리 확인"], ["acct", "경리업무만", "정산 · 매출 · 회계 · 자금 · 비품 (배차 메뉴 · 배차 알림 없음)"], ["officeAcct", "사내업무 + 경리", "회계 · 자금 · 비품 + 사내업무 (배차 · 정산 제외)"]];
  return [["", "권한에 정한 메뉴 (고정)", "권한 관리에서 이 권한에 켠 메뉴만 보여요"]];
}
// 실제로 적용할 업무 범위 — 그 권한에서 고를 수 없는 값이면 기본("")
export function effectiveScope(role, scope, isMaster = false) {
  const s = normScope(scope);
  return scopeOptionsFor(role, isMaster).some(([k]) => k === s) ? s : "";
}
