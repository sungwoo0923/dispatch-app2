// 인사관리부 / 회원관리 공용 상수 — 직책, 팀 구분
// ⭐ 2026-10-31 임원 부서 — 부서를 "임원"으로 고르면 직책은 대표·전무·이사만. 임원은 로그인하면 임원 화면(경영 브리핑)으로.
export const EXEC_TEAM = "임원";
export const EXEC_POSITION_OPTIONS = ["대표", "전무", "이사"];
// 일반 부서 직책(직급 낮은 순)
export const POSITION_OPTIONS = [
  "인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "파트장",
];
export const ALL_POSITION_OPTIONS = [...EXEC_POSITION_OPTIONS, ...POSITION_OPTIONS];
// 부서에 맞는 직책 드롭다운 — 임원이면 대표·전무·이사만, 미배정이면 전체
export const positionsForTeam = (team) => (team === EXEC_TEAM ? EXEC_POSITION_OPTIONS : team ? POSITION_OPTIONS : ALL_POSITION_OPTIONS);

export const TEAM_OPTIONS = [
  EXEC_TEAM, "운영팀", "운송팀", "경리/회계팀", "개발팀", "법무팀", "인사팀",
];

// 임원으로 보는 직책(예전에 쓰던 대표이사·사장·상무 등도 포함)
export const EXEC_POSITIONS = ["대표", "대표이사", "사장", "부사장", "전무", "상무", "이사"];
export const isExecPosition = (p) => EXEC_POSITIONS.includes(String(p || "").trim());
export const isExecProfile = (u) => !!u && (u.team === EXEC_TEAM || isExecPosition(u.position));

// 🔐 직책·부서로 추천하는 권한 — 권한은 "할 수 있는 업무 범위", 직책은 "조직 내 지위"라서 따로 두되
//  처음 정할 때는 아래 기준으로 자동 추천한다(관리자가 바꿀 수 있음).
//   임원(대표·전무·이사) → 관리자(임원 화면) / 경리·회계팀 → 경리 / 인사팀 → 인사관리자
//   운영·운송팀 과장 이상(과장·차장·부장·팀장·파트장) → 관리자 / 그 외 → 실무자
//  ※ 관리자는 매출·정산·직원 권한까지 열리므로 대리 이하는 실무자로 시작한다.
const MANAGER_RANKS = ["과장", "차장", "부장", "팀장", "파트장"];
export function suggestRole({ team = "", position = "" } = {}) {
  const p = String(position || "").trim();
  if (team === EXEC_TEAM || isExecPosition(p)) return "admin";
  if (team === "경리/회계팀") return "test";
  if (team === "인사팀") return "hrManager";
  if (MANAGER_RANKS.includes(p)) return "admin";
  return "user";
}
export const ROLE_NAME = { admin: "관리자", user: "실무자", test: "경리/회계", hrManager: "인사관리자", viewer: "조회전용", totalMaster: "최고관리자" };

// 팀 배지는 알록달록한 색 대신 프로그램 톤(네이비/그레이)에 맞춘 단일 톤으로 통일
export const TEAM_BADGE_CLASS = "bg-[#1B2B4B]/5 text-[#1B2B4B] border-[#1B2B4B]/15";
export const TEAM_BADGE_CLASS_UNASSIGNED = "bg-gray-100 text-gray-400 border-gray-200";

export const EMPLOYMENT_STATUS_OPTIONS = ["재직", "휴직", "퇴사"];
