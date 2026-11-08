// 📑 2026-11-08 사업계획서 결재선 검사 · 예산 집행 계산 · 첨부 파일 검사 단위 테스트
//  실행: node scripts/bizPlan.test.mjs
import assert from "node:assert/strict";
import { validateBizLine, suggestBizLine, planExecution, planStatus, budgetTotal, isFinPerson, isCeoPerson } from "../src/bizPlan.js";
import { checkApFile, apFilePath, apCoKey, fileKind, inDocDir, AP_FILE_MAX, AP_FILE_COUNT } from "../src/approvalFiles.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

const staff = [
  { uid: "me", name: "정사원", position: "사원", team: "배차팀", role: "user" },
  { uid: "tl", name: "김팀장", position: "팀장", team: "배차팀", role: "admin" },
  { uid: "fin", name: "이재무", position: "과장", team: "재무팀", role: "user" },
  { uid: "acct", name: "한경리", position: "대리", team: "", role: "test" },
  { uid: "ex", name: "박상무", position: "상무", team: "임원", role: "user" },
  { uid: "ceo", name: "최대표", position: "대표이사", team: "임원", role: "admin" },
];
const me = staff[0];
const L = (...xs) => xs.map(([uid, kind]) => ({ ...staff.find((u) => u.uid === uid), kind }));

t("경리 판정: 부서 재무·경리·회계·총무 또는 권한 경리(test)·경리사무원(acctStaff)", () => {
  assert.equal(isFinPerson({ team: "재무팀" }), true);
  assert.equal(isFinPerson({ team: "총무부" }), true);
  assert.equal(isFinPerson({ team: "배차팀", role: "acctStaff" }), true);
  assert.equal(isFinPerson({ team: "배차팀", role: "user" }), false);
  assert.equal(isCeoPerson({ position: "부사장" }), false);
  assert.equal(isCeoPerson({ position: "사장" }), true);
});
t("자동 추천: 팀장 → 경리(합의) → 임원 → 대표", () => {
  const s = suggestBizLine(staff, me);
  assert.deepEqual(s.map((x) => [x.uid, x.kind]), [["tl", "결재"], ["fin", "합의"], ["ex", "결재"], ["ceo", "결재"]]);
  assert.equal(validateBizLine(s, staff, me).ok, true);
  assert.equal(validateBizLine(s, staff, me).finIdx, 1);
});
t("경리가 없으면 막고, 회사에 있는 경리 이름을 알려 준다", () => {
  const v = validateBizLine(L(["tl", "결재"], ["ex", "결재"], ["ceo", "결재"]), staff, me);
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /경리·회계·재무/);
  assert.match(v.errors[0], /이재무/);
});
t("경리를 '결재'로 넣으면 '합의'로 바꾸라고 안내", () => {
  const v = validateBizLine(L(["fin", "결재"], ["ex", "결재"], ["ceo", "결재"]), staff, me);
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /합의/);
});
t("회사에 경리 담당이 아예 없으면 인사 정보 설정 방법을 안내", () => {
  const noFin = staff.filter((u) => !isFinPerson(u));
  const v = validateBizLine(L(["tl", "결재"], ["ex", "결재"], ["ceo", "결재"]), noFin, me);
  assert.match(v.errors[0], /인사 정보/);
});
t("대표가 맨 끝이 아니면 막는다 · 대표가 없으면 막는다", () => {
  assert.equal(validateBizLine(L(["fin", "합의"], ["ceo", "결재"], ["ex", "결재"]), staff, me).ok, false);
  const v = validateBizLine(L(["fin", "합의"], ["ex", "결재"]), staff, me);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /대표/.test(e)));
  const noCeo = staff.filter((u) => u.uid !== "ceo");
  assert.ok(validateBizLine(L(["fin", "합의"], ["ex", "결재"]), noCeo, me).errors.some((e) => /인사 정보/.test(e)));
});
t("임원이 있는데 빠지면 막고, 대표만 있는 회사는 통과(안내만)", () => {
  assert.equal(validateBizLine(L(["fin", "합의"], ["ceo", "결재"]), staff, me).ok, false);
  const small = staff.filter((u) => u.uid !== "ex");
  const v = validateBizLine(L(["fin", "합의"], ["ceo", "결재"]), small, me);
  assert.equal(v.ok, true);
  assert.equal(v.warnings.length, 1);
});
t("권한 경리(test) 직원도 합의 담당으로 인정", () => {
  assert.equal(validateBizLine(L(["acct", "합의"], ["ex", "결재"], ["ceo", "결재"]), staff, me).ok, true);
});
t("기안자가 대표면 대표 최종 결재 조건은 빠진다", () => {
  const v = validateBizLine(L(["fin", "합의"], ["ex", "결재"]), staff, staff[5]);
  assert.equal(v.ok, true);
});

t("예산 합계 · 집행액(승인만) · 집행률 · 초과", () => {
  const plan = { id: "p1", amount: 0, data: { budget: [{ label: "a", amount: "1000000" }, { label: "b", amount: 500000 }] } };
  assert.equal(budgetTotal(plan.data.budget), 1500000);
  const docs = [
    { id: "e1", planId: "p1", status: "approved", amount: 600000, paid: { at: 1 } },
    { id: "e2", data: { planId: "p1" }, status: "approved", amount: 400000 },
    { id: "e3", planId: "p1", status: "pending", amount: 300000 },
    { id: "e4", planId: "p1", status: "rejected", amount: 999999 },
    { id: "e5", planId: "p1", status: "cancelled", amount: 999999 },
    { id: "e6", planId: "p2", status: "approved", amount: 999999 },
  ];
  const ex = planExecution(plan, docs);
  assert.equal(ex.budget, 1500000);
  assert.equal(ex.spent, 1000000);
  assert.equal(ex.paid, 600000);
  assert.equal(ex.pendingAmt, 300000);
  assert.equal(ex.count, 2);
  assert.equal(Math.round(ex.rate * 10) / 10, 66.7);
  assert.equal(ex.over, false);
  const over = planExecution({ id: "p1", amount: 800000 }, docs);
  assert.equal(over.over, true);
  assert.equal(over.remain, -200000);
  assert.equal(planStatus({ data: {} }, "2026-11-08", over).key, "over");
  assert.equal(planExecution({ id: "p9", amount: 0 }, docs).rate, null);
});
t("상태: 시작 전 · 진행 중 · 종료", () => {
  const p = { data: { period: { start: "2026-11-10", end: "2026-12-31" } } };
  assert.equal(planStatus(p, "2026-11-08", {}).key, "ready");
  assert.equal(planStatus(p, "2026-11-20", {}).key, "run");
  assert.equal(planStatus(p, "2027-01-02", {}).key, "done");
});

t("첨부 검사: 종류 · 크기 · 개수", () => {
  assert.equal(checkApFile({ name: "발표.pptx", size: 1000 }).ok, true);
  assert.equal(checkApFile({ name: "발표.pptx", size: 1000 }).type, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(checkApFile({ name: "견적.HWP", size: 1000 }).type, "application/x-hwp");
  assert.equal(checkApFile({ name: "a.exe", size: 10 }).ok, false);
  assert.equal(checkApFile({ name: "a.svg", size: 10 }).ok, false);
  assert.equal(checkApFile({ name: "big.pdf", size: AP_FILE_MAX }).ok, false);
  assert.equal(checkApFile({ name: "ok.pdf", size: AP_FILE_MAX - 1 }).ok, true);
  assert.equal(checkApFile({ name: "ok.pdf", size: 10 }, AP_FILE_COUNT).ok, false);
  assert.equal(fileKind({ name: "x.xlsx" }), "xls");
  assert.equal(fileKind({ name: "x.jpg", type: "image/jpeg" }), "image");
});
t("저장 경로: 회사 키(공백 등 → _) · 문서 폴더", () => {
  assert.equal(apCoKey("한빛 물류#1"), "한빛_물류_1");
  const p = apFilePath("한빛 물류", "D1", "사업 계획.pdf", 123);
  assert.equal(p, "approvals/한빛_물류/D1/123_사업_계획.pdf");
  assert.equal(inDocDir({ path: p }, "한빛 물류", "D1"), true);
  assert.equal(inDocDir({ path: p }, "한빛 물류", "D2"), false);
});
console.log(`\n사업계획서 · 첨부 단위 테스트 ${n}개 통과`);
