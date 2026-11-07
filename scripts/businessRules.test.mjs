// ⭐ 2026-11-07 업무 규칙 점검 테스트(화면 없이 숫자만) — 실행: node scripts/businessRules.test.mjs
//  · 미수금 연령(arAging.agingOf) — 회계관리 · 일일 경영 보고 · 경영 분석 공용(오래된 청구부터 수금된 것으로 봄)
//  · 내정보 연차(leaveUtils.calcLeaveBalance) — 전자결재 연차 현황(approvalForms.leaveEntitlement)과 같은 발생일수 · 회기
//  · 미배차 판정(unassignedRule) — PC · 모바일 공용
import assert from "node:assert/strict";
import { register } from "node:module";
register("./extResolve.mjs", import.meta.url); // src는 확장자 없이 가져오므로 .js를 붙여 찾게
const { agingOf } = await import("../src/arAging.js");
const { calcLeaveBalance } = await import("../src/leaveUtils.js");
const { leaveEntitlement } = await import("../src/approvalForms.js");
const { isUnassignedOrder, pickUnassignedOrders } = await import("../src/unassignedRule.js");

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

t("미수 연령 — 1월분을 다 받은 거래처의 이번 달 미수는 '90일 초과'가 아니다", () => {
  const inv = [{ d: "2026-01-10", amt: 1000000 }, { d: "2026-11-01", amt: 500000 }];
  const a = agingOf(inv, 1000000, "2026-11-07");
  assert.deepEqual(a, { b30: 500000, b60: 0, b90: 0, over: 0, oldest: 6 });
});
t("미수 연령 — 일부 수금은 오래된 청구부터 · 구간 나눔 · 날짜 순서와 상관없음", () => {
  const inv = [{ d: "2026-10-20", amt: 300 }, { d: "2026-08-01", amt: 200 }, { d: "2026-09-20", amt: 100 }];
  const a = agingOf(inv, 250, "2026-11-07");
  // 8/1(98일) 200 다 받음 + 9/20(48일) 50 받음 → 남은 9/20 50(31~60일) · 10/20 300(30일 이내 · 18일)
  assert.deepEqual(a, { b30: 300, b60: 50, b90: 0, over: 0, oldest: 48 });
  assert.deepEqual(agingOf([], 0, "2026-11-07"), { b30: 0, b60: 0, b90: 0, over: 0, oldest: 0 });
  assert.deepEqual(agingOf(inv, 9999, "2026-11-07").oldest, 0); // 다 받음
});

const now = new Date("2026-11-07T12:00:00+09:00");
t("내정보 연차 — 근속 3년 이상은 가산연차(15 + 2년마다 1일) · 전자결재와 같은 일수", () => {
  const b = calcLeaveBalance("2021-03-15", [], "u1", "홍길동", [], now); // 5년차 → 15 + floor(4/2) = 17
  assert.equal(b.entitlement, 17);
  assert.equal(b.entitlement, leaveEntitlement("2021-03-15", now).total);
  assert.equal(b.leaveLabel, "연차");
  assert.deepEqual([b.from, b.to], ["2026-03-15", "2027-03-14"]);
});
t("내정보 연차 — 사용일수는 이번 회기(입사 기념일~) 안의 것만", () => {
  const sch = [
    { authorUid: "u1", type: "휴가", start: "2026-02-02", end: "2026-02-03" }, // 지난 회기(2025-03-15~2026-03-14)
    { authorUid: "u1", type: "휴가", start: "2026-04-01", end: "2026-04-02" }, // 이번 회기 2일
    { authorUid: "u1", type: "오전반차", start: "2026-05-04" },
    { authorUid: "u1", type: "휴가", start: "2026-06-01", approvers: [{ status: "rejected" }] }, // 반려
    { authorUid: "u1", type: "병가", start: "2026-02-10", end: "2026-02-10" }, // 병가는 회기와 상관없이 그대로 센다
  ];
  const b = calcLeaveBalance("2021-03-15", sch, "u1", "홍길동", [], now);
  assert.equal(b.used, 2.5);
  assert.equal(b.remaining, 14.5);
  assert.equal(b.sickDays, 1);
});
t("내정보 연차 — 1년 미만은 월차(개월 수, 최대 11)", () => {
  const b = calcLeaveBalance("2026-05-20", [], "u1", "", [], now);
  assert.equal(b.leaveLabel, "월차");
  assert.equal(b.entitlement, 5);
  assert.equal(calcLeaveBalance("", [], "u1", "", [], now), null);
});

t("미배차 — 배차중 · 차량 없음 · 날짜/장소 있는 오더만", () => {
  const base = { 배차상태: "배차중", 상차일: "2026-11-07", 상차지명: "A", 하차지명: "B" };
  assert.equal(isUnassignedOrder(base), true);
  assert.equal(isUnassignedOrder({ ...base, 차량번호: "12가3456" }), false);
  assert.equal(isUnassignedOrder({ ...base, 배차상태: "승인대기" }), false);
  assert.equal(isUnassignedOrder({ ...base, 지급방식: "취소" }), false);
  assert.equal(isUnassignedOrder({ ...base, 상차일: "" }), false);
  assert.equal(pickUnassignedOrders([{ ...base, _id: "x", __col: "orders" }, { ...base, _id: "x", __col: "orders" }]).length, 1);
});

console.log(`\n업무 규칙 테스트 ${n}개 통과`);
