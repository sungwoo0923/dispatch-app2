// 알림 받는 사람(역할 · 부서 · 지금 화면) 테스트 — node scripts/notifyAudience.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { audienceOf, audienceAllows, notifyAreaOf, NOTIFY_AUDIENCE, SWITCH_VIEWS, activeViewOf, DISPATCH_TOAST_TYPES, setDispatchAlertsOn, dispatchAlertsOn } from "../src/notifyAudience.js";
import { normalizeTeam, LEGACY_TEAMS } from "../src/teamNames.js";

const require = createRequire(import.meta.url);
const srv = require("../functions/notifyAudience.js");

// ── 종류 → 받는 쪽 ──
assert.equal(audienceOf("미배차"), "dispatch");
assert.equal(audienceOf("기사거절"), "dispatch");
assert.equal(audienceOf("배차마감도착"), "acct");
assert.equal(audienceOf("근태승인"), "hr");
assert.equal(audienceOf("결재요청"), "personal");
assert.equal(audienceOf("공지사항"), "all");
assert.equal(audienceOf("dispatch"), "dispatch", "받는 쪽 이름을 그대로 넘겨도 된다");
assert.equal(audienceOf("처음보는종류"), "all", "모르는 종류는 예전처럼 모두에게");

const D = "dispatch";
// ── 물류운송팀(운송관리자 · 운송사무원) — 배차 알림 받음 ──
assert.ok(audienceAllows(D, { realRole: "admin", role: "admin" }));
assert.ok(audienceAllows(D, { realRole: "user", role: "user" }));
assert.ok(!audienceAllows("배차마감도착", { realRole: "admin", role: "admin" }), "운송 역할에 정산 알림은 안 감");
// ── 경영지원팀(경리 · 인사) — 배차 알림 없음 ──
for (const r of ["test", "acctStaff", "hrManager", "hrStaff", "salesMgr", "salesStaff", "legalMgr", "devMgr"]) {
  assert.ok(!audienceAllows(D, { realRole: r, role: r }), `${r}는 배차 알림 없음`);
}
assert.ok(audienceAllows("지급대기", { realRole: "test", role: "test" }));
assert.ok(audienceAllows("배차마감도착", { realRole: "acctStaff", role: "test" }), "경리사무원(경리 화면 역할)");
assert.ok(audienceAllows("근태승인", { realRole: "hrStaff", role: "hrManager" }));
assert.ok(!audienceAllows("근태승인", { realRole: "test", role: "test" }));
// ── 업무 범위 ──
assert.ok(!audienceAllows(D, { realRole: "test", role: "test", workScope: "acct" }));
assert.ok(audienceAllows("정산", { realRole: "test", role: "test", workScope: "officeAcct" }), "사내업무 + 경리는 경리 알림 받음");
assert.equal(notifyAreaOf({ realRole: "test", workScope: "officeAcct" }), "office");
// ── 화면 전환 역할 — 지금 화면일 때만 ──
for (const r of ["allMgr", "totalMaster"]) {
  assert.ok(audienceAllows(D, { realRole: r, view: "dispatch" }), `${r} 운송 화면 → 배차 알림`);
  assert.ok(audienceAllows(D, { realRole: r, view: "" }), `${r} 화면 기록 없음 → 첫 화면(운송) — 예전과 같다`);
  for (const v of ["acct", "hr", "sales", "exec"]) assert.ok(!audienceAllows(D, { realRole: r, view: v }), `${r} ${v} 화면 → 배차 알림 없음`);
  assert.ok(audienceAllows("배차마감도착", { realRole: r, view: "acct" }));
  assert.ok(!audienceAllows("배차마감도착", { realRole: r, view: "dispatch" }));
  assert.ok(audienceAllows("근태승인", { realRole: r, view: "hr" }));
}
assert.ok(!audienceAllows(D, { realRole: "hrAcct", view: "" }), "통합인사관리자는 운송 화면이 없다");
assert.ok(audienceAllows("지급대기", { realRole: "hrAcct", view: "" }), "통합인사관리자 첫 화면 = 경리");
// 경영 브리핑(임원 통합관리자 · 임원 화면 역할)
assert.ok(!audienceAllows(D, { realRole: "allMgr", view: "dispatch", execHome: true }));
assert.ok(audienceAllows("경영보고", { realRole: "allMgr", execHome: true }));
// 직접 만든 역할 — 화면을 모르면 예전처럼 운송, 부서 화면 · 저장된 화면이 있으면 그것
assert.ok(audienceAllows(D, { realRole: "customA", role: "customA" }));
assert.ok(!audienceAllows(D, { realRole: "customA", role: "customA", view: "exec" }));
assert.ok(!audienceAllows(D, { realRole: "customA", role: "customA", deptMode: "acct" }));
// ── 개인 · 전체 알림은 누구에게나 ──
for (const ctx of [{ realRole: "test" }, { realRole: "hrStaff" }, { realRole: "allMgr", view: "acct" }, { realRole: "admin" }]) {
  for (const c of ["결재요청", "결재결과", "인수인계", "메신저", "공지사항", "생일"]) assert.ok(audienceAllows(c, ctx), `${c} · ${ctx.realRole}`);
}
assert.equal(activeViewOf({ realRole: "allMgr", view: "acct" }), "acct");
assert.equal(activeViewOf({ realRole: "admin" }), "dispatch");

// ── 배차 토스트 스위치 ──
assert.ok(DISPATCH_TOAST_TYPES.includes("orderRegistered") && DISPATCH_TOAST_TYPES.includes("editRequest"));
setDispatchAlertsOn(false); assert.equal(dispatchAlertsOn(), false);
setDispatchAlertsOn(true); assert.equal(dispatchAlertsOn(), true);

// ── 화면 전환 목록이 src/customRoles.js SWITCH_ROLES 와 같은지 ──
const cr = readFileSync(new URL("../src/customRoles.js", import.meta.url), "utf8");
const block = cr.slice(cr.indexOf("export const SWITCH_ROLES"), cr.indexOf("};", cr.indexOf("export const SWITCH_ROLES")));
for (const [role, views] of Object.entries(SWITCH_VIEWS)) {
  const line = block.split("\n").find((l) => new RegExp(`^\\s*${role}:`).test(l));
  assert.ok(line, `SWITCH_ROLES.${role} 있음`);
  const keys = [...line.matchAll(/\["(\w+)", "\w+", "[^"]+"\]/g)].map((m) => m[1]);
  assert.deepEqual(keys, views, `${role} 화면 목록이 customRoles.js와 같다`);
}
assert.equal((block.match(/^\s*\w+: \{ storage/gm) || []).length, Object.keys(SWITCH_VIEWS).length, "화면 전환 역할 수가 같다");

// ── 서버 사본(functions/notifyAudience.js)이 같은 표 · 같은 결과 ──
assert.deepEqual(srv.NOTIFY_AUDIENCE, NOTIFY_AUDIENCE);
assert.deepEqual(srv.SWITCH_VIEWS, SWITCH_VIEWS);
assert.deepEqual(srv.LEGACY_TEAMS, LEGACY_TEAMS);
const roles = ["admin", "user", "viewer", "test", "acctStaff", "hrManager", "hrStaff", "hrAcct", "allMgr", "totalMaster", "salesMgr", "legalMgr", "devStaff", "customA"];
const views = ["", "dispatch", "acct", "hr", "sales", "exec", "office"];
const scopes = ["", "acct", "officeAcct", "office"];
for (const realRole of roles) for (const view of views) for (const workScope of scopes) for (const cat of [...Object.keys(NOTIFY_AUDIENCE), "모름"]) {
  const ctx = { realRole, role: realRole, view, workScope };
  assert.equal(srv.audienceAllows(cat, ctx), audienceAllows(cat, ctx), `${cat} ${realRole}/${view}/${workScope}`);
}
for (const t of ["운영팀", "인사팀", "운송팀", "임원", "", "경영지원팀"]) assert.equal(srv.normalizeTeam(t), normalizeTeam(t));

// ── 서버: users 문서 기준 ──
const u = (p) => ({ role: "admin", ...p });
assert.ok(srv.userAllows(u({}), "배차등록"));
assert.ok(!srv.userAllows(u({ role: "acctStaff" }), "배차등록"));
assert.ok(!srv.userAllows(u({ role: "test", workScope: "acct" }), "미배차"));
assert.ok(srv.userAllows(u({ role: "allMgr" }), "미배차"), "통합관리자 — 화면 기록 없음(예전 계정)은 예전처럼 받음");
assert.ok(srv.userAllows(u({ role: "allMgr", activeView: "dispatch" }), "미배차"));
assert.ok(!srv.userAllows(u({ role: "allMgr", activeView: "acct" }), "미배차"));
assert.ok(!srv.userAllows(u({ role: "totalMaster", activeView: "hr" }), "배차완료"));
assert.ok(!srv.userAllows(u({ role: "hrAcct" }), "재배차"));
assert.ok(srv.userAllows(u({ role: "admin", workScope: "acct" }), "배차등록"), "운송관리자는 업무 범위를 고를 수 없다(저장값 무시)");
assert.ok(srv.userAllows(u({ role: "allMgr", isMaster: true, workScope: "acct", activeView: "dispatch" }), "배차등록"), "회사 마스터는 전체 업무 고정");
assert.ok(!srv.userAllows(null, "공지사항"));
assert.ok(srv.userAllows(u({ role: "test" }), "공지사항"));

console.log("✓ notifyAudience 테스트 통과");
