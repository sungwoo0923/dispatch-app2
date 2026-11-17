// ======================= src/teamNames.js =======================
// ⭐ 2026-11-17 부서 이름 정리(사용자 요청) — 다른 파일을 가져오지 않는 작은 모듈(hrConstants · customRoles 양쪽에서 쓴다)
//  · 운영팀 → 경영지원팀(경리 · 인사를 같이 하는 부서) · 예전 인사팀 · 경리/회계팀도 경영지원팀으로 합친다
//  · 운송팀 → 물류운송팀
//  저장된 값은 바꾸지 않는다 — 화면에 보일 때 · 권한 목록을 고를 때만 새 이름으로 읽는다(데이터 이전 없이 예전 계정 그대로 동작)
export const EXEC_TEAM = "임원";
export const MGMT_TEAM = "경영지원팀";
export const LOGI_TEAM = "물류운송팀";
export const LEGACY_TEAMS = { 운영팀: MGMT_TEAM, 인사팀: MGMT_TEAM, "경리/회계팀": MGMT_TEAM, 경리팀: MGMT_TEAM, 회계팀: MGMT_TEAM, 운송팀: LOGI_TEAM };
export const normalizeTeam = (t) => { const s = String(t || "").trim(); return LEGACY_TEAMS[s] || s; };
export const isExecTeam = (t) => normalizeTeam(t) === EXEC_TEAM;
// (선택) 예전 부서 이름을 새 이름으로 바꿀 값 — 직원 문서 { team } → 바꿀 게 있으면 { team: 새 이름 }, 없으면 null
//  자동으로 돌리지는 않는다(원할 때만 쓰는 도우미). 직원 정보를 열어 저장하면 드롭다운이 새 이름으로 저장한다
export const teamMigrationPatch = (u) => { const t = String(u?.team || "").trim(); return LEGACY_TEAMS[t] ? { team: LEGACY_TEAMS[t] } : null; };
// ⭐ 2026-11-17 권한 검사용 부서 글자 — 지금 부서 + 예전 부서(legacyTeam: 서버가 이름을 바꿀 때 남김). 예전 부서 이름으로 받던 경리 · 인사 권한이 그대로 유지되게
export const teamText = (u) => [u?.team, u?.legacyTeam].filter((x) => typeof x === "string" && x).join(" ");
