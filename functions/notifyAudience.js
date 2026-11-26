// ======================= functions/notifyAudience.js =======================
// ⭐ 2026-11-17 src/notifyAudience.js 의 서버(CommonJS) 사본 — 표 · 함수는 그대로 같게 둔다(scripts/notifyAudience.test.mjs가 둘을 비교)
// ⭐ 2026-11-17 알림 받는 사람 — 역할 · 부서 · 지금 보는 화면 기준(사용자 요청)
//  · 배차 알림(미배차 · 재촉 · 기사 수락/거절 · 오더 수정/취소 요청 · 배차 등록/완료/취소 …) → 물류운송팀(운송관리자 · 운송사무원)
//    + 화면 전환 역할(통합관리자 · 최고관리자)은 [운송] 화면을 보는 동안만. 경리 · 인사 · 영업 · 경영 화면이면 안 띄운다
//  · 정산 · 회계 알림(배차마감 도착 · 지급 대기 · 입금) → 경리 역할 + 화면 전환 역할은 [경리] 화면에서
//  · 인사 알림(근태 · 연차 승인 등) → 인사 역할 + [인사] 화면에서
//  · 전자결재 · 인수인계 · 메일 · 메신저 → 받는 사람 본인(부서와 상관없음) · 공지 · 생일 → 회사 전체(공지는 공지에 정한 팀 · 직원)
//  다른 파일을 가져오지 않는 작은 모듈 — PC(DispatchApp) · 모바일(MobileApp) · 테스트(scripts/notifyAudience.test.mjs)가 같이 쓴다.
//  서버(functions/notifyAudience.js)도 같은 표를 쓴다 — 표를 바꾸면 두 파일을 같이 고친다(테스트가 둘이 같은지 본다).

// 알림 종류 → 받는 쪽("dispatch" | "acct" | "hr" | "sales" | "exec" | "personal" | "all")
const NOTIFY_AUDIENCE = {
  // 🚚 배차(운송)
  배차등록: "dispatch", 긴급배차: "dispatch", 배차완료: "dispatch", 재배차: "dispatch", 미배차: "dispatch", 배차취소: "dispatch",
  기사수락: "dispatch", 기사거절: "dispatch", 기사출퇴근: "dispatch", 기사지연: "dispatch", 기사긴급: "dispatch", 기사완료: "dispatch",
  화주재촉: "dispatch", 화주오더: "dispatch", 오더수정요청: "dispatch", 오더취소요청: "dispatch",
  고정노선미배차: "dispatch", 실시간배차: "dispatch", 배차알림: "dispatch",
  // 🧾 정산 · 회계(경리)
  배차마감도착: "acct", 지급대기: "acct", 입금: "acct", 정산: "acct",
  // 🪪 인사
  근태승인: "hr", 연차승인: "hr", 인사업무: "hr",
  // 💼 영업 · 📈 경영
  영업: "sales", 경영보고: "exec",
  // 👤 받는 사람 본인(부서 무관)
  결재요청: "personal", 결재결과: "personal", 인수인계: "personal", 메신저: "personal", 사내메일: "personal",
  마감보고: "personal", 인사발령: "personal", 급여명세서: "personal", 가입신청: "personal", 기사서류: "personal",
  // 🏢 회사 전체
  공지사항: "all", 플랫폼공지: "all", 생일: "all", 업데이트: "all", 퇴근알림: "all", 개인일정: "all",
};
const AUDIENCES = ["dispatch", "acct", "hr", "sales", "exec", "personal", "all"];
// 종류 이름 대신 받는 쪽 이름("dispatch" 등)을 그대로 넘겨도 된다 · 모르는 종류는 예전처럼 모두에게("all")
const audienceOf = (cat) => (AUDIENCES.includes(cat) ? cat : NOTIFY_AUDIENCE[cat] || "all");

// 화면 전환 역할의 화면 목록 — src/customRoles.js SWITCH_ROLES 와 같은 순서(첫 칸 = 기본 화면). 테스트가 둘이 같은지 본다
const SWITCH_VIEWS = {
  hrAcct: ["acct", "hr"],
  allMgr: ["dispatch", "sales", "acct", "hr"],
  totalMaster: ["dispatch", "sales", "acct", "hr"],
};
// 내장 역할 → 일하는 쪽(화면 전환 역할 제외)
const ROLE_AREA = {
  admin: "dispatch", user: "dispatch", viewer: "dispatch", superadmin: "dispatch",
  test: "acct", acctStaff: "acct",
  hrManager: "hr", hrStaff: "hr",
  salesMgr: "sales", salesStaff: "sales",
  legalMgr: "legal", legalStaff: "legal",
  devMgr: "dev", devStaff: "dev",
  driver: "driver", shipper: "shipper", cafeUser: "shipper",
};
const AREAS = ["dispatch", "sales", "acct", "hr", "exec", "office", "legal", "dev"];

// 지금 일하는 쪽 — ctx: { realRole, role(화면 역할), view(화면 전환 역할의 지금 화면 · 서버는 users.activeView),
//   workScope(업무 범위 — 이미 effectiveScope로 고른 값), execHome(경영 브리핑을 보는 중), deptMode(PC · 모바일 부서 화면) }
function notifyAreaOf(ctx = {}) {
  const real = String(ctx.realRole || ctx.role || "");
  const ws = String(ctx.workScope || "");
  if (ws === "office" || ws === "officeAcct") return "office";
  if (ws === "acct") return "acct";
  if (ctx.execHome || ctx.deptMode === "exec") return "exec";
  const sw = SWITCH_VIEWS[real];
  if (sw) {
    const v = String(ctx.view || "");
    if (v === "exec") return "exec"; // 임원 부서 통합관리자의 [경영] 화면
    return sw.includes(v) ? v : sw[0];
  }
  if (ROLE_AREA[real]) return ROLE_AREA[real];
  // 권한 관리에서 만든 역할 — 화면(부서 화면 · 저장된 activeView)을 알면 그것, 모르면 예전처럼 운송
  if (AREAS.includes(ctx.deptMode)) return ctx.deptMode;
  if (ctx.role && ROLE_AREA[ctx.role]) return ROLE_AREA[ctx.role];
  if (AREAS.includes(ctx.view)) return ctx.view;
  return "dispatch";
}
// 이 알림을 지금 이 사람에게 띄워도 되는지(PC · 모바일 화면 안 알림 · 서버 푸시 공용)
function audienceAllows(cat, ctx = {}) {
  const aud = audienceOf(cat);
  if (aud === "all" || aud === "personal") return true;
  const area = notifyAreaOf(ctx);
  if (area === aud) return true;
  // 사내업무 + 경리(officeAcct)는 경리 알림도 받는다
  return aud === "acct" && String(ctx.workScope || "") === "officeAcct";
}
// 서버에 적어 둘 "지금 보는 화면"(users/{uid}.activeView) — 백그라운드 푸시를 서버가 고를 때 쓴다
const activeViewOf = (ctx = {}) => notifyAreaOf(ctx);

// ── 서버 전용 ──
// 업무 범위 — src/workScope.js effectiveScope 와 같은 기준(경리관리자 · 경리사무원만 고를 수 있다 · 회사 마스터는 전체 업무 고정)
const ACCT_SCOPE_ROLES = ["test", "acctStaff"];
function serverScopeOf(u = {}) {
  const s = u.workScope === "acct" || u.workScope === "officeAcct" ? u.workScope : "";
  return s && !u.isMaster && ACCT_SCOPE_ROLES.includes(u.role) ? s : "";
}
// users/{uid} 문서 → 이 알림을 푸시로 보내도 되는지(activeView = PC · 모바일이 마지막으로 연 화면)
function userAllows(u, cat) {
  if (!u) return false;
  return audienceAllows(cat, { realRole: u.role, role: u.role, view: u.activeView || "", workScope: serverScopeOf(u) });
}
// ⭐ 2026-11-17 부서 이름 정리(src/teamNames.js 와 같은 표) — 예전 이름(운영팀 · 인사팀 · 운송팀 등)을 새 이름으로 읽는다
const LEGACY_TEAMS = { 운영팀: "경영지원팀", 인사팀: "경영지원팀", "경리/회계팀": "경영지원팀", 경리팀: "경영지원팀", 회계팀: "경영지원팀", 운송팀: "물류운송팀" };
const normalizeTeam = (t) => { const s = String(t || "").trim(); return LEGACY_TEAMS[s] || s; };

module.exports = { NOTIFY_AUDIENCE, AUDIENCES, audienceOf, SWITCH_VIEWS, ROLE_AREA, notifyAreaOf, audienceAllows, activeViewOf, serverScopeOf, userAllows, normalizeTeam, LEGACY_TEAMS };
