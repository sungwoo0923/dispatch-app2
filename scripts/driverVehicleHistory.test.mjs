// ⭐ 2026-11-11 차량이력으로 "이 운행은 어느 기사 건인지" 판단 · 휴대폰번호 로그인 입력 판별 — 단위 테스트
//  실행: node scripts/driverVehicleHistory.test.mjs
import assert from "assert";
import { platePeriods, periodFor, makeTripOwner } from "../src/driverVehicleHistory.js";
import { describeDriverLoginError } from "../src/driver/driverLoginErrors.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`PASS ${name}`); } catch (e) { fail += 1; console.log(`FAIL ${name} :: ${e?.message || e}`); }
}
// 이태훈: 3333을 11/8까지 → 11/9부터 3434
const A = { id: "A", 이름: "이태훈", 차량번호: "34바3434", 차량이력: [{ 차량번호: "34바3333", 시작: "", 종료: "2026-11-08" }, { 차량번호: "34바3434", 시작: "2026-11-09", 종료: "" }] };
// 3333을 이어받아 새로 가입한 기사(이력 없음)
const B = { id: "B", 이름: "박새로", 차량번호: "34바3333" };
// 3434를 전에 타다 미배정이 된 기사
const C = { id: "C", 이름: "김철수", 차량번호: "", 차량이력: [{ 차량번호: "34바3434", 시작: "", 종료: "2026-11-08" }] };
const D = { id: "D", 이름: "이력없음", 차량번호: "99자 9999" };

t("구간: 이력 없으면 지금 차량 하나(띄어쓰기 무시)", () => {
  assert.deepStrictEqual(platePeriods(D), [{ plate: "99자9999", from: "", to: "" }]);
  assert.deepStrictEqual(platePeriods({ 차량번호: "-" }), []);
  assert.strictEqual(platePeriods(A).length, 2);
});
t("구간: 날짜로 내 차량이었는지", () => {
  assert.ok(periodFor(A, "34바3333", "2026-11-05")); assert.ok(!periodFor(A, "34바3333", "2026-11-09"));
  assert.ok(periodFor(A, "34바3434", "2026-11-09")); assert.ok(!periodFor(A, "34바3434", "2026-11-08"));
  assert.ok(periodFor(A, "34바3434", "")); assert.ok(!periodFor(A, "34바3333", ""));
});
t("정산: 달 중간에 차량을 바꾼 기사는 두 차량 운행분이 모두 자기 것", () => {
  const own = makeTripOwner([A, B, C, D]);
  assert.ok(own("A", "34바3333", "2026-11-03")); assert.ok(own("A", "34바3434", "2026-11-12"));
});
t("정산: 차량을 이어받은 기사에게 예전 기사 운행분이 섞이지 않는다", () => {
  const own = makeTripOwner([A, B, C, D]);
  assert.ok(!own("B", "34바3333", "2026-11-03"), "11/3 3333은 이태훈 건");
  assert.ok(own("B", "34바3333", "2026-11-10"), "11/10 3333은 박새로 건");
  assert.ok(!own("A", "34바3333", "2026-11-10"));
  assert.ok(own("C", "34바3434", "2026-11-05")); assert.ok(!own("C", "34바3434", "2026-11-10")); assert.ok(!own("A", "34바3434", "2026-11-05"));
});
t("정산: 이력 없는 기사는 예전과 같다 · 같은 차량에 이력 없는 기사 둘이면 둘 다(기존 동작)", () => {
  const own = makeTripOwner([D, { id: "E", 차량번호: "99자9999" }]);
  assert.ok(own("D", "99자 9999", "2026-01-01")); assert.ok(own("E", "99자9999", "2026-01-01")); assert.ok(!own("D", "11가1111", "2026-01-01"));
});
t("정산: 이력 없는 기존 기사가 타던 차량으로 옮겨 오면 적용일부터만 새 기사 건", () => {
  const own = makeTripOwner([A, { id: "F", 차량번호: "34바3434" }]);
  assert.ok(own("F", "34바3434", "2026-11-05")); assert.ok(!own("F", "34바3434", "2026-11-10")); assert.ok(own("A", "34바3434", "2026-11-10"));
});
t("로그인 안내: 휴대폰번호로 찾았으면 휴대폰번호로 안내", () => {
  const e = describeDriverLoginError({ code: "driver/name-mismatch" }, { phone: "01011112222", name: "홍길동" });
  assert.ok(e.message.includes("휴대폰번호 010-1111-2222로 등록된"), e.message);
  const p = describeDriverLoginError({ code: "driver/name-mismatch" }, { carNo: "34바3333", name: "홍길동" });
  assert.ok(p.message.includes("차량번호 34바3333로 등록된"), p.message);
  assert.strictEqual(describeDriverLoginError({ code: "driver/phone-not-registered" }, { phone: "01011112222" }).title, "등록된 휴대폰번호가 없습니다");
  assert.strictEqual(describeDriverLoginError({ code: "driver/phone-incomplete" }, {}).title, "휴대폰번호를 끝까지 입력해 주세요");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
