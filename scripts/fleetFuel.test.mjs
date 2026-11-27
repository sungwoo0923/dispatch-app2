// ⛽ 2026-11-27 지입정산 주유비 — node scripts/fleetFuel.test.mjs
import assert from "node:assert/strict";
import * as F from "../src/fleetFuel.js";
let pass = 0; const ok = (n, f) => { f(); pass += 1; console.log(`✓ ${n}`); };
const drivers = [{ id: "a", 이름: "이준희", 차량번호: "충북84아1177", 유류카드: ["1234"] }, { id: "b", 이름: "신종원", 차량번호: "부산96아2026" }];
ok("은행 거래내역(출금액 · 적요)", () => {
  const aoa = [["○○은행 거래내역"], [], ["거래일시", "적요", "기재내용", "출금액", "입금액", "잔액"], ["2026.11.03 10:21", "카드", "GS칼텍스 1234", "120,000", "", "5,000,000"], ["2026.11.04", "카드", "SK 부산96아2026", "80000", "", ""], ["2026.11.05", "입금", "", "", "300000", ""]];
  const p = F.parseFuelSheet(aoa);
  assert.equal(p.rows.length, 2); assert.equal(p.cols.amount, "출금액");
  assert.deepEqual(p.rows.map((r) => [r.date, r.amount]), [["2026-11-03", 120000], ["2026-11-04", 80000]]);
  assert.equal(F.matchFuelRow(p.rows[0], drivers).id, "a", "내용 속 카드 끝 4자리");
  assert.equal(F.matchFuelRow(p.rows[1], drivers).id, "b", "내용 속 차량번호");
});
ok("카드 사용내역(이용일자 · 이용카드 · 이용금액) · 취소 · 엑셀 날짜 숫자", () => {
  const aoa = [["이용일자", "이용카드", "가맹점명", "이용금액", "결제원금"], [46329, "9410-****-****-1234", "현대오일뱅크", 100000, 100000], ["2026-11-10", "9410-****-****-1234", "현대오일뱅크 취소", 30000, 0], ["2026-11-11", "9410-****-****-9999", "S-OIL", 50000, 50000]];
  const p = F.parseFuelSheet(aoa);
  assert.equal(p.cols.amount, "이용금액"); assert.equal(p.cols.card, "이용카드");
  assert.equal(p.rows[0].date, "2026-11-03"); assert.equal(p.rows[1].amount, -30000);
  const as = {}; p.rows.forEach((r) => { as[r.i] = F.matchFuelRow(r, drivers).id; });
  assert.equal(as[2], "", "모르는 카드는 확인 필요");
  assert.deepEqual(F.sumByDriver(p.rows, as), { a: { amount: 70000, count: 2 } });
});
ok("헤더를 못 찾으면 알려 준다", () => { assert.ok(F.parseFuelSheet([["a", "b"], [1, 2]]).error); });
ok("할부금 — 시작 ~ 종료월만 · 회차", () => {
  const d = { 할부금: { amount: 500000, start: "2026-06", end: "2027-05" } };
  assert.equal(F.installmentOf(d, "2026-05"), null); assert.equal(F.installmentOf(d, "2027-06"), null);
  assert.deepEqual(F.installmentOf(d, "2026-11"), { amount: 500000, nth: 6, total: 12 });
  assert.equal(F.installmentOf({}, "2026-11"), null);
});
ok("그 달 주유비", () => { assert.deepEqual(F.fuelOf({ 주유비: { "2026-11": { amount: 70000, count: 2 } } }, "2026-11"), { amount: 70000, count: 2 }); assert.equal(F.fuelOf({}, "2026-11"), null); });
console.log(`\nfleetFuel: ${pass}개 통과`);
