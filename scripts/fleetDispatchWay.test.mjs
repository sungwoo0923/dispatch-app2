// 🚛 2026-11-23 지입차 배차 시 배차방식 자동 — node scripts/fleetDispatchWay.test.mjs
import assert from "node:assert/strict";
import { autoWayFor, normalizeWayMap, fleetGradeOfPlate, hasAnyWay } from "../src/fleetDispatchWayCore.js";

const drivers = [
  { 차량번호: "경기12가3456", 등급: "지입" }, { 차량번호: "충남80아4135", 등급: "직영" },
  { 차량번호: "세종86바3203", 등급: "임대" }, { 차량번호: "서울11가1111", 등급: "일반" },
  { 차량번호: "경기 12가-3456", 등급: "" }, // 같은 차량 다른 문서(등급 없음) — 지입 문서가 있으니 지입
];
const JY = { 지입: "기사직통", 직영: "기사직통", 임대: "기사직통" };

assert.deepEqual(normalizeWayMap({ 지입: " 기사직통 ", 직영: "", 일반: "x" }), { 지입: "기사직통" }, "지입차 구분 · 이름 있는 것만");
assert.equal(hasAnyWay({}), false); assert.equal(hasAnyWay(JY), true);
assert.equal(fleetGradeOfPlate(drivers, "경기12가 3456"), "지입", "띄어쓰기 · 하이픈 무시");

// 표에서 차량번호만 넣음 → 자동
assert.equal(autoWayFor({ 차량번호: "경기12가3456", 이름: "김" }, null, drivers, JY), "기사직통");
assert.equal(autoWayFor({ 차량번호: "충남80아4135" }, { 차량번호: "" }, drivers, JY), "기사직통", "직영");
// 일반 기사 → 안 바꿈
assert.equal(autoWayFor({ 차량번호: "서울11가1111" }, null, drivers, JY), "");
// 설정 없는 운송사 → 아무것도 안 바뀜
assert.equal(autoWayFor({ 차량번호: "경기12가3456" }, null, drivers, {}), "");
// 다른 운송사는 다른 이름 · 일부 구분만
assert.equal(autoWayFor({ 차량번호: "경기12가3456" }, null, drivers, { 지입: "지입배차" }), "지입배차");
assert.equal(autoWayFor({ 차량번호: "세종86바3203" }, null, drivers, { 지입: "지입배차" }), "", "임대는 비워 둠 → 안 바꿈");
// 수정 창: 차량을 새로 바꾸면 예전 배차방식(24시)이 있어도 자동
assert.equal(autoWayFor({ 차량번호: "경기12가3456", 배차방식: "24시" }, { 차량번호: "서울11가1111", 배차방식: "24시" }, drivers, JY), "기사직통");
// 같은 차량 그대로 배차방식만 사람이 바꿈 → 사람 값 유지
assert.equal(autoWayFor({ 차량번호: "경기12가3456", 배차방식: "화물맨" }, { 차량번호: "경기12가3456", 배차방식: "기사직통" }, drivers, JY), "");
// 이미 같은 값 · 차량번호 안 고치는 저장 · 차량 지움 → 그대로
assert.equal(autoWayFor({ 차량번호: "경기12가3456", 배차방식: "기사직통" }, null, drivers, JY), "");
assert.equal(autoWayFor({ 메모: "x" }, null, drivers, JY), "");
assert.equal(autoWayFor({ 차량번호: "" }, null, drivers, JY), "");
console.log("fleetDispatchWay: 모두 통과");
