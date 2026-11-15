// 팀 실적 보고서 계산 테스트 — node scripts/teamReport.test.mjs (src/teamReportCore.js)
import assert from "node:assert/strict";
import { periodOf, buildTeamReport, teamMembers, teamKind, reportText } from "../src/teamReportCore.js";

{ const p = periodOf("thisMonth", "2026-11-15"); assert.deepEqual([p.from, p.to, p.prevFrom, p.prevTo, p.label, p.prevLabel], ["2026-11-01", "2026-11-15", "2026-10-01", "2026-10-15", "2026년 11월", "2026년 10월 1~15일"]); }
{ const p = periodOf("thisMonth", "2026-03-31"); assert.deepEqual([p.prevTo, p.prevLabel], ["2026-02-28", "2026년 2월"]); }
{ const p = periodOf("lastMonth", "2026-01-10"); assert.deepEqual([p.from, p.to, p.prevFrom, p.prevTo], ["2025-12-01", "2025-12-31", "2025-11-01", "2025-11-30"]); }
{ const p = periodOf("thisQuarter", "2026-11-15"); assert.deepEqual([p.from, p.to, p.prevFrom, p.prevTo, p.label], ["2026-10-01", "2026-11-15", "2026-07-01", "2026-08-15", "2026년 4분기"]); }
{ const p = periodOf("lastQuarter", "2026-02-15"); assert.deepEqual([p.from, p.to, p.label], ["2025-10-01", "2025-12-31", "2025년 4분기"]); }
{ const p = periodOf("custom", "2026-11-15", { from: "2026-11-10", to: "2026-11-14" }); assert.deepEqual([p.prevFrom, p.prevTo], ["2026-11-05", "2026-11-09"]); }
assert.equal(teamKind("운송팀"), "sales"); assert.equal(teamKind("경리/회계팀"), "soon");
const people = [{ uid: "a", name: "김일", team: "운송팀", role: "user" }, { uid: "b", name: "이이", team: "운송팀", role: "admin", position: "팀장" }, { uid: "c", name: "박삼", team: "영업팀", role: "salesStaff" }, { uid: "d", name: "퇴사", team: "운송팀", employmentStatus: "퇴사" }];
const members = teamMembers(people, "운송팀");
assert.deepEqual(members.map((m) => m.name), ["김일", "이이"]);
const o = (id, d, who, sale, cost, extra = {}) => ({ _id: id, 상차일: d, who, 청구운임: String(sale), 기사운임: String(cost), 거래처명: extra.c || "녹수", 배차상태: extra.st || "배차완료", ...extra });
const rows = [
  o(1, "2026-11-03", "김일", 100000, 90000), o(2, "2026-11-04", "이이", 200000, 150000, { c: "대원" }), o(3, "2026-11-05", "김일", 50000, 60000, { c: "대원" }),
  o(4, "2026-10-10", "김일", 80000, 70000), o(5, "2026-11-06", "박삼", 999999, 0), o(6, "2026-11-07", "김일", 70000, 0, { 배차상태: "배차취소" }),
  o(1, "2026-11-03", "김일", 100000, 90000), // 같은 오더 두 번 → 한 번만
  o(7, "2026-11-08", "이이", 100000, 97000, { st: "배차중" }),
];
const rep = buildTeamReport({ rows, members, period: periodOf("thisMonth", "2026-11-15"), staffOf: (r) => r.who });
assert.deepEqual([rep.cur.sale, rep.cur.profit, rep.cur.cnt], [450000, 53000, 4]);
assert.deepEqual([rep.prev.sale, rep.prev.cnt], [80000, 1]);
assert.equal(rep.members[0].name, "이이"); assert.equal(rep.members[0].sale, 300000);
assert.equal(rep.members.find((m) => m.name === "김일").prevSale, 80000);
assert.equal(rep.risks.lossCount, 1); assert.equal(rep.risks.lowCount, 1); assert.equal(rep.risks.unassigned, 1);
assert.equal(rep.clients.top[0].n, "대원"); assert.deepEqual(rep.clients.newClients, ["대원"]);
assert.equal(Math.round(rep.companyShare), Math.round((450000 / 1449999) * 100));
assert.equal(rep.daily.length, 15);
assert.match(reportText(rep, "운송팀"), /운송팀 · 2026년 11월 실적/);
console.log("teamReport: 모두 통과");
