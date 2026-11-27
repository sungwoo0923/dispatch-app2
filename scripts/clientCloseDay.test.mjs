// 🗓 2026-11-27 거래처별 마감일 테스트 — node scripts/clientCloseDay.test.mjs
//  25일 마감: 11월분 = 10/26 ~ 11/25 · 시작월 전은 상차일 달 그대로 · 회사마다 따로 · 마감월(이월)이 먼저
import assert from "node:assert/strict";
import * as AR from "../functions/arCore.mjs";
import * as S from "../src/settleCore.js";

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`✓ ${name}`); };
const R = AR.normCloseRule(25, "2026-10");

ok("규칙 읽기 — 1 ~ 28일만 · 비우면 말일(규칙 없음)", () => {
  assert.deepEqual(AR.normCloseRule("25일", "2026-10"), { day: 25, from: "2026-10" });
  assert.equal(AR.normCloseRule("", ""), null);
  assert.equal(AR.normCloseRule(31, ""), null);
  assert.deepEqual(AR.normCloseRule(20, "x"), { day: 20, from: "" });
});
ok("25일 마감 — 26일부터 다음 달", () => {
  assert.equal(AR.closeYmOf("2026-10-25", R), "2026-10");
  assert.equal(AR.closeYmOf("2026-10-26", R), "2026-11");
  assert.equal(AR.closeYmOf("2026-11-25", R), "2026-11");
  assert.equal(AR.closeYmOf("2026-11-26", R), "2026-12");
  assert.equal(AR.closeYmOf("2026-12-28", R), "2027-01", "해 넘김");
});
ok("시작월 전은 상차일 달 그대로(이미 정산한 달 안 흔들기)", () => {
  assert.equal(AR.closeYmOf("2026-09-28", R), "2026-09");
  assert.deepEqual(AR.closePeriodOf("2026-09", R), { from: "2026-09-01", to: "2026-09-30", day: 0 });
  assert.deepEqual(AR.closePeriodOf("2026-10", R), { from: "2026-10-01", to: "2026-10-25", day: 25, first: true });
  assert.deepEqual(AR.closePeriodOf("2026-11", R), { from: "2026-10-26", to: "2026-11-25", day: 25 });
});
ok("기간이 빈틈 · 겹침 없이 이어진다", () => {
  const r = AR.normCloseRule(28, "");
  assert.deepEqual(AR.closePeriodOf("2027-03", r), { from: "2027-03-01", to: "2027-03-28", day: 28 }, "2월은 28일까지라 3월분은 3/1부터");
  assert.equal(AR.closeYmOf("2027-02-28", r), "2027-02");
  assert.deepEqual(AR.closePeriodOf("2026-11", null), { from: "2026-11-01", to: "2026-11-30", day: 0 });
  for (const ym of ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]) {
    const p = AR.closePeriodOf(ym, R);
    for (const d of [p.from, p.to]) assert.equal(AR.closeYmOf(d, R), ym, `${ym} ${d}`);
  }
});
ok("monthOf — 거래처 이름으로 규칙을 찾는다 · 회사마다 따로 · 마감월이 먼저", () => {
  AR.setClientCloseDays("가회사", [{ 거래처명: "범진", 마감일: "25", 마감시작월: "2026-10" }, { 거래처명: "말일상사" }]);
  AR.setClientCloseDays("나회사", [{ 거래처명: "범진", 마감일: "20", 마감시작월: "" }]);
  assert.equal(S.monthOf, AR.monthOf);
  assert.equal(AR.monthOf({ companyName: "가회사", 거래처명: "범진", 상차일: "2026-10-28" }), "2026-11");
  assert.equal(AR.monthOf({ companyName: "나회사", 거래처명: "범진", 상차일: "2026-10-22" }), "2026-11");
  assert.equal(AR.monthOf({ companyName: "가회사", 거래처명: "말일상사", 상차일: "2026-10-28" }), "2026-10");
  assert.equal(AR.monthOf({ companyName: "가회사", 거래처명: "범진", 상차일: "2026-10-28", 마감월: "2026-10" }), "2026-10", "이월 · 직접 정한 마감월");
  // 회사 이름이 없는 오더 → 마지막으로 넣은 회사(화면은 지금 회사 하나)
  assert.equal(AR.monthOf({ 거래처명: "범진", 상차일: "2026-10-22" }), "2026-11");
  assert.deepEqual(AR.clientPeriodOf("범진", "2026-11", "가회사"), { from: "2026-10-26", to: "2026-11-25", day: 25 });
});
ok("정산 홈 · 미수금 계산도 같은 달로 묶인다", () => {
  AR.setClientCloseDays("가회사", [{ 거래처명: "범진", 마감일: 25, 마감시작월: "2026-10" }]);
  const O = (d, w) => ({ _id: d, companyName: "가회사", 거래처명: "범진", 상차일: d, 청구운임: String(w), 배차상태: "배차완료" });
  const orders = [O("2026-10-24", 100000), O("2026-10-27", 200000), O("2026-11-25", 300000), O("2026-11-26", 400000)];
  assert.equal(S.summarizeSettle(orders, "2026-11", () => "미작성", "2026-11-27").sale, 500000);
  assert.equal(S.summarizeSettle(orders, "2026-10", () => "미작성", "2026-11-27").sale, 100000);
  assert.equal(S.summarizeSettle(orders, "2026-12", () => "미작성", "2026-12-27").sale, 400000);
});
console.log(`\nclientCloseDay: ${pass}개 통과`);
