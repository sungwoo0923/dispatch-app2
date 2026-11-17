import React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
// 인사관리부 / 회원관리 공용 상수 — 직책, 팀 구분
// ⭐ 2026-10-31 임원 부서 — 부서를 "임원"으로 고르면 직책은 대표·전무·이사만. 임원은 로그인하면 임원 화면(경영 브리핑)으로.
import { EXEC_TEAM, MGMT_TEAM, LOGI_TEAM, LEGACY_TEAMS, normalizeTeam, isExecTeam, teamMigrationPatch } from "./teamNames"; // ⭐ 2026-11-17 부서 이름 정리
export { EXEC_TEAM };
export const EXEC_POSITION_OPTIONS = ["대표", "전무", "이사", "실장"]; // ⭐ 2026-11-05 실장 추가
// 일반 부서 직책(직급 낮은 순)
export const POSITION_OPTIONS = [
  "인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "파트장", "실장", "전무", // ⭐ 2026-11-05 실장·전무 추가(일반 부서에서도 고르기)
];
export const ALL_POSITION_OPTIONS = [...new Set([...EXEC_POSITION_OPTIONS, ...POSITION_OPTIONS])];
// 부서에 맞는 직책 드롭다운 — 임원이면 대표·전무·이사만, 미배정이면 전체
export const positionsForTeam = (team) => (isExecTeam(team) ? EXEC_POSITION_OPTIONS : team ? POSITION_OPTIONS : ALL_POSITION_OPTIONS);

// ⭐ 2026-11-17 부서 정리(사용자 요청) — 운영팀 → 경영지원팀(경리 · 인사를 같이), 운송팀 → 물류운송팀, 인사팀 · 경리/회계팀은 경영지원팀으로 합쳤다
//  영업팀 · 개발팀 · 법무팀은 그대로. 예전 부서 이름이 저장된 직원은 데이터를 바꾸지 않고 화면 · 권한 추천에서 새 이름으로 읽는다(normalizeTeam)
//  이름 바꾸기 표 · normalizeTeam 은 src/teamNames.js(customRoles.js 도 같이 쓴다)
export const TEAM_OPTIONS = [
  EXEC_TEAM, MGMT_TEAM, LOGI_TEAM, "영업팀", "개발팀", "법무팀", // 💼 2026-11-10 영업팀 추가
];
export { MGMT_TEAM, LOGI_TEAM, LEGACY_TEAMS, normalizeTeam, isExecTeam, teamMigrationPatch };

// 임원으로 보는 직책(예전에 쓰던 대표이사·사장·상무 등도 포함)
export const EXEC_POSITIONS = ["대표", "대표이사", "사장", "부사장", "전무", "상무", "이사"];
export const isExecPosition = (p) => EXEC_POSITIONS.includes(String(p || "").trim());
export const isExecProfile = (u) => !!u && (isExecTeam(u.team) || isExecPosition(u.position));

// 🔐 직책·부서로 추천하는 권한 — 권한은 "할 수 있는 업무 범위", 직책은 "조직 내 지위"라서 따로 두되
//  처음 정할 때는 아래 기준으로 자동 추천한다(관리자가 바꿀 수 있음).
//   임원(대표·전무·이사) → 관리자 / 경영지원팀(예전 경리·회계팀 · 운영팀) → 경리 / 예전 인사팀 → 인사관리자
//   물류운송팀 과장 이상(과장·차장·부장·팀장·파트장) → 운송관리자 / 그 외 → 운송사무원
//  ※ 관리자는 매출·정산·직원 권한까지 열리므로 대리 이하는 실무자로 시작한다.
//  ⭐ 2026-11-04 부서 낱말 기준(customRoles.js DEPT_ROLE_RULES와 같은 낱말) — 경리·인사는 대리 이하면 사무원, 법무·개발팀 역할 추가
const MANAGER_RANKS = ["과장", "차장", "부장", "팀장", "파트장", "실장"];
const STAFF_RANKS = ["인턴", "사원", "주임", "대리"];
//  ⭐ 2026-11-17 경영지원팀(경리 · 인사) → 경리 쪽으로 추천(대리 이하 경리사무원 / 과장 이상 경리관리자) — 인사 업무면 관리자가 인사 역할로 바꾼다
//   물류운송팀(예전 운송팀 · 운영팀 아님) → 운송 역할(과장 이상 운송관리자 / 그 외 운송사무원)
export function suggestRole({ team = "", position = "" } = {}) {
  const p = String(position || "").trim();
  const raw = String(team || "").trim();
  const t = /인사|경리|회계|재무/.test(raw) ? raw : normalizeTeam(raw); // 예전 인사팀 · 경리팀은 그 낱말대로(인사 → 인사 역할)
  const junior = STAFF_RANKS.includes(p);
  if (t === EXEC_TEAM || isExecPosition(p)) return "admin";
  if (/경리|회계|재무|경영지원/.test(t)) return junior ? "acctStaff" : "test";
  if (/인사/.test(t)) return junior ? "hrStaff" : "hrManager";
  if (/법무/.test(t)) return MANAGER_RANKS.includes(p) ? "legalMgr" : "legalStaff";
  if (/개발/.test(t)) return MANAGER_RANKS.includes(p) ? "devMgr" : "devStaff";
  if (/영업/.test(t)) return MANAGER_RANKS.includes(p) ? "salesMgr" : "salesStaff"; // 💼 2026-11-10 영업팀 — 과장 이상 영업관리자 / 그 외 영업사무원
  if (MANAGER_RANKS.includes(p)) return "admin";
  return "user";
}
export { ROLE_LABELS as ROLE_NAME } from "./customRoles";

// 팀 배지는 알록달록한 색 대신 프로그램 톤(네이비/그레이)에 맞춘 단일 톤으로 통일
export const TEAM_BADGE_CLASS = "bg-[#1B2B4B]/5 text-[#1B2B4B] border-[#1B2B4B]/15";
export const TEAM_BADGE_CLASS_UNASSIGNED = "bg-gray-100 text-gray-400 border-gray-200";

export const EMPLOYMENT_STATUS_OPTIONS = ["재직", "휴직", "육아휴직", "출산휴가", "퇴사"];

// ⚙ 회사별 직책·부서(2026-10-31) — 인사관리부 › 직책·부서 설정에서 추가·숨김. hrSettings/{회사} { teams, positions, execPositions, hiddenTeams, hiddenPositions }
export function useHrOptions(company) {
  const [cfg, setCfg] = React.useState({});
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "hrSettings", company), (d) => setCfg(d.exists() ? d.data() : {}), () => setCfg({}));
  }, [company]);
  return React.useMemo(() => {
    const hideT = new Set(cfg.hiddenTeams || []); const hideP = new Set(cfg.hiddenPositions || []);
    // ⭐ 2026-11-01 기본 부서·직책은 항상 보인다(숨김 불가) — 회사가 추가한 것만 숨김·삭제 대상
    // ⭐ 2026-11-17 회사가 예전 부서 이름(운영팀 · 인사팀 등)을 직접 추가해 뒀어도 새 부서와 겹치지 않게 뺀다
    const teams = [...TEAM_OPTIONS, ...(cfg.teams || [])].filter((t, i, a) => a.indexOf(t) === i && !LEGACY_TEAMS[t] && (TEAM_OPTIONS.includes(t) || !hideT.has(t)));
    const exec = [...EXEC_POSITION_OPTIONS, ...(cfg.execPositions || [])].filter((t, i, a) => a.indexOf(t) === i && (EXEC_POSITION_OPTIONS.includes(t) || !hideP.has(t)));
    const normal = [...POSITION_OPTIONS, ...(cfg.positions || [])].filter((t, i, a) => a.indexOf(t) === i && (POSITION_OPTIONS.includes(t) || !hideP.has(t)));
    const positionsFor = (team) => (isExecTeam(team) ? exec : team ? normal : [...new Set([...exec, ...normal])]);
    return { teams, exec, normal, positionsFor, cfg };
  }, [cfg]);
}
