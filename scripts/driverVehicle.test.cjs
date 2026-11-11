// ⭐ 2026-11-11 기사 차량 변경 · 휴대폰번호 로그인 계산 — 단위 테스트(에뮬레이터 필요 없음)
//  실행: node scripts/driverVehicle.test.cjs
const assert = require("assert");
const path = require("path");
const V = require(path.resolve(__dirname, "../functions/driverVehicleCore.js"));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`PASS ${name}`); } catch (e) { fail += 1; console.log(`FAIL ${name} :: ${e?.message || e}`); }
}

t("휴대폰번호: 전체 번호만 인정", () => {
  assert.ok(V.phoneValid("010-1234-5678")); assert.ok(V.phoneValid("01012345678")); assert.ok(V.phoneValid("0111234567"));
  assert.ok(!V.phoneValid("5678")); assert.ok(!V.phoneValid("0101234")); assert.ok(!V.phoneValid("02-123-4567"));
});
t("휴대폰번호: 저장 형식 두 가지(숫자만 · 줄표)", () => {
  assert.deepStrictEqual(V.phoneVariants("010 1234 5678"), ["01012345678", "010-1234-5678"]);
  assert.deepStrictEqual(V.phoneVariants("0111234567"), ["0111234567", "011-123-4567"]);
});
t("차량번호 형식", () => {
  assert.ok(V.plateValid("34바3333")); assert.ok(V.plateValid("경기97가1234")); assert.ok(V.plateValid("34 바 3333"));
  assert.ok(!V.plateValid("3333")); assert.ok(!V.plateValid("34바3333@x")); assert.ok(!V.plateValid(""));
});
t("로그인 메일: 화면(driverEmail.js)과 같은 계산", () => {
  assert.strictEqual(V.legacyEmail("34바 3333"), "34바3333@driver.run25.kr");
  // src/driver/driverEmail.js coHash("에이 운송") 과 같아야 한다
  let h = 5381; for (const ch of "에이운송") h = (Math.imul(h, 33) ^ ch.codePointAt(0)) >>> 0;
  assert.strictEqual(V.scopedEmail("에이 운송", "34바3333"), `34바3333.c${h.toString(36)}@driver.run25.kr`);
  assert.strictEqual(V.nocarEmail("AbC123"), "nocar.abc123@driver.run25.kr");
  assert.ok(V.isNocarEmail("nocar.abc123@driver.run25.kr")); assert.ok(!V.isNocarEmail("34바3333@driver.run25.kr"));
});
t("차량이력: 첫 변경 — 예전 차량은 전날까지, 새 차량은 적용일부터", () => {
  const h = V.applyHistory(undefined, { oldPlate: "34바3333", newPlate: "34바3434", date: "2026-11-09", by: "배차", at: 1 });
  assert.deepStrictEqual(h, [
    { 차량번호: "34바3333", 시작: "", 종료: "2026-11-08" },
    { 차량번호: "34바3434", 시작: "2026-11-09", 종료: "", by: "배차", at: 1 },
  ]);
});
t("차량이력: 다시 변경 — 열린 구간만 닫는다", () => {
  const h1 = V.applyHistory([], { oldPlate: "A123456", newPlate: "B123456", date: "2026-11-02", at: 1 });
  const h2 = V.applyHistory(h1, { oldPlate: "B123456", newPlate: "A123456", date: "2026-11-09", at: 2 });
  assert.deepStrictEqual(h2.map((e) => [e.차량번호, e.시작, e.종료]), [["A123456", "", "2026-11-01"], ["B123456", "2026-11-02", "2026-11-08"], ["A123456", "2026-11-09", ""]]);
});
t("차량이력: 같은 날 두 번 바꾸면 중간 구간은 남기지 않는다", () => {
  const h1 = V.applyHistory([], { oldPlate: "A123456", newPlate: "B123456", date: "2026-11-09", at: 1 });
  const h2 = V.applyHistory(h1, { oldPlate: "B123456", newPlate: "C123456", date: "2026-11-09", at: 2 });
  assert.deepStrictEqual(h2.map((e) => [e.차량번호, e.시작, e.종료]), [["A123456", "", "2026-11-08"], ["C123456", "2026-11-09", ""]]);
});
t("차량이력: 미배정(새 차량 없음)은 닫기만", () => {
  const h = V.applyHistory([], { oldPlate: "A123456", newPlate: "", date: "2026-11-09" });
  assert.deepStrictEqual(h, [{ 차량번호: "A123456", 시작: "", 종료: "2026-11-08" }]);
});
t("휴대폰 로그인 후보: 없음 / 회사 다름 / 이름 다름", () => {
  const c = [{ uid: "u1", companyName: "에이운송", name: "이태훈", carNo: "34바3333", approved: true }];
  assert.strictEqual(V.pickPhoneMatch([], { companyName: "에이운송", name: "이태훈" }).code, "NOT_FOUND");
  assert.strictEqual(V.pickPhoneMatch(c, { companyName: "비운송", name: "이태훈" }).code, "COMPANY_MISMATCH");
  assert.strictEqual(V.pickPhoneMatch(c, { companyName: "에이운송", name: "홍길동" }).code, "NAME_MISMATCH");
  assert.strictEqual(V.pickPhoneMatch(c, { companyName: "에이 운송", name: "이 태훈" }).pick.uid, "u1");
});
t("휴대폰 로그인 후보: 계정 있는 기사 > 선등록, 재직 > 퇴사, 최근 가입", () => {
  const c = [
    { pre: true, companyName: "에이운송", name: "이태훈", carNo: "11가1111", approved: true },
    { uid: "old", companyName: "에이운송", name: "이태훈", retired: true, approved: true, createdAt: 9 },
    { uid: "a", companyName: "에이운송", name: "이태훈", approved: true, createdAt: 1 },
    { uid: "b", companyName: "에이운송", name: "이태훈", approved: true, createdAt: 5 },
  ];
  assert.strictEqual(V.pickPhoneMatch(c, { companyName: "에이운송", name: "이태훈" }).pick.uid, "b");
  assert.strictEqual(V.pickPhoneMatch([c[0]], { companyName: "에이운송", name: "이태훈" }).pick.pre, true);
});
t("회사명 없으면 기본 회사로 본다", () => {
  assert.ok(V.sameCo("", "돌캐")); assert.ok(!V.sameCo("", "에이운송"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
