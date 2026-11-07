// ⭐ 2026-11-07 업무 규칙 점검 테스트(화면 없이 숫자만) — 실행: node scripts/businessRules.test.mjs
//  · 미수금 연령(arAging.agingOf) — 회계관리 · 일일 경영 보고 · 경영 분석 공용(오래된 청구부터 수금된 것으로 봄)
//  · 내정보 연차(leaveUtils.calcLeaveBalance) — 전자결재 연차 현황(approvalForms.leaveEntitlement)과 같은 발생일수 · 회기
//  · 미배차 판정(unassignedRule) — PC · 모바일 공용
//  · 2026-11-07 결정 반영: 배차상태(dispatchStatus) · 미수금 부가세 포함 · 고정거래처 · 예상 부가세 · 거래명세서 선불·착불(functions/arCore.mjs)
//    · 연차 현황 한 가지 계산(leaveUtils.leaveStatusOf · 회계연도 기준) · 지각 기준 09:00(lateRule)
import assert from "node:assert/strict";
import { register } from "node:module";
register("./extResolve.mjs", import.meta.url); // src는 확장자 없이 가져오므로 .js를 붙여 찾게
const { agingOf } = await import("../src/arAging.js");
const { calcLeaveBalance } = await import("../src/leaveUtils.js");
const { leaveEntitlement } = await import("../src/approvalForms.js");
const { isUnassignedOrder, pickUnassignedOrders } = await import("../src/unassignedRule.js");
const { dispatchStatusOf, payTypeStatusPatch } = await import("../src/dispatchStatus.js");
const AR = await import("../functions/arCore.mjs");
const { leaveStatusOf } = await import("../src/leaveUtils.js");
const { isLateAt, workStartOf } = await import("../src/lateRule.js");

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

// ── 2026-11-07 결정 반영 ──
t("배차상태 — 차량번호만 있어도 배차완료(기사 이름·연락처 없어도) · 지급방식 취소 = 배차취소", () => {
  assert.equal(dispatchStatusOf({ 차량번호: "12가3456" }), "배차완료");
  assert.equal(dispatchStatusOf({ 차량번호: " " }), "배차중");
  assert.equal(dispatchStatusOf({ 차량번호: "12가3456", 지급방식: "취소" }), "배차취소");
  assert.equal(dispatchStatusOf({ 차량번호: "12가3456", 기사확인상태: "대기" }), "승인대기");
  assert.equal(isUnassignedOrder({ 배차상태: dispatchStatusOf({ 차량번호: "12가3456" }), 차량번호: "12가3456", 상차일: "2026-11-07", 상차지명: "A" }), false);
});
t("지급방식 변경 — 취소로 바꾸면 배차취소 · 취소를 풀면 차량번호 기준 · 화주사가 취소한 오더는 그대로 (PC · 모바일 공용)", () => {
  assert.deepEqual(payTypeStatusPatch({ 배차상태: "배차완료", 차량번호: "1" }, "취소"), { 배차상태: "배차취소" });
  assert.deepEqual(payTypeStatusPatch({ 배차상태: "배차취소", 지급방식: "취소" }, "취소"), {});
  assert.deepEqual(payTypeStatusPatch({ 배차상태: "배차취소", 지급방식: "취소", 차량번호: "1" }, "계산서"), { 배차상태: "배차완료" });
  assert.deepEqual(payTypeStatusPatch({ 배차상태: "배차취소", 지급방식: "취소" }, "계산서"), { 배차상태: "배차중" });
  assert.deepEqual(payTypeStatusPatch({ 배차상태: "배차취소", 상태: "취소", 지급방식: "계산서" }, "착불"), {});
  assert.deepEqual(payTypeStatusPatch({ 배차상태: "배차중" }, "계산서"), {});
});

const ord = (id, d, c, amt, extra = {}) => ({ _id: id, __col: "orders", 상차일: d, 거래처명: c, 청구운임: amt, 배차상태: "배차완료", ...extra });
t("미수금 — 청구액 부가세 포함(거래처·청구월마다 × 1.1) − 실제 입금 · 선불·착불도 넣음 · 배차완료만 · 고정거래처 포함", () => {
  const orders = [
    ord("a", "2026-10-02", "삼진", 100001), ord("b", "2026-10-20", "삼진", 100001, { 지급방식: "착불" }),
    ord("c", "2026-11-03", "삼진", 50000), ord("d", "2026-11-04", "삼진", 70000, { 배차상태: "승인대기" }),
    ord("e", "2026-11-04", "삼진", 70000, { 지급방식: "취소", 배차상태: "배차취소" }), ord("f", "2025-12-30", "삼진", 9e6),
    ord("a", "2026-10-02", "삼진", 100001), // 같은 문서가 두 번 들어와도 한 번
  ];
  const fixedRows = [{ id: "x", 날짜: "2026-11-01", 거래처명: "고정화주", 청구운임: 300000 }];
  const list = AR.receivablesOf({ orders, fixedRows, paid: { 삼진: 120000 }, today: "2026-11-07" });
  const by = Object.fromEntries(list.map((x) => [x.client, x]));
  assert.equal(by.삼진.supply, 250002);
  assert.equal(by.삼진.billed, Math.round(200002 * 1.1) + Math.round(50000 * 1.1)); // 220002 + 55000(거래처정산 미수금과 같은 식)
  assert.equal(by.삼진.outstanding, 275002 - 120000);
  assert.equal(by.고정화주.outstanding, 330000);
  assert.equal(list[0].client, "고정화주");
  // 나이: 10월분 220,002 중 120,000을 먼저 받음 → 10월 남은 100,002(36일) · 11월 55,000(4일)
  assert.deepEqual([by.삼진.aging.b30, by.삼진.aging.b60, by.삼진.oldest], [55000, 100002, 36]);
  assert.equal(AR.paidAmountOf({ amount: "1,000" }), 1000);
});
t("예상 부가세 — 계산서 매출 × 10% − 세금계산서 발행 기사 운임 × 10%", () => {
  const drivers = [{ 차량번호: "12가 3456", 세금계산서발행: true }, { 차량번호: "99나9999" }];
  const rows = [
    { 청구운임: 1000000, 기사운임: 800000, 지급방식: "계산서", 차량번호: "12가3456" },
    { 청구운임: 500000, 기사운임: 400000, 지급방식: "착불", 차량번호: "99나9999" },
    { 청구운임: 300000, 기사운임: 200000, 지급방식: "계산서", 차량번호: "99나9999" },
  ];
  const v = AR.vatEstimate(rows, drivers);
  assert.deepEqual([v.saleSupply, v.saleVat, v.saleCount, v.buySupply, v.buyVat, v.buyCount, v.vat], [1300000, 130000, 2, 800000, 80000, 1, 50000]);
  assert.equal(AR.vatEstimate(rows, []).buyVat, 0); // 기본은 아무도 계산서 발행 기사가 아님
});
t("거래명세서 — 선불·착불 기본 빼기 · 회사 기본 · 명세서마다 따로", () => {
  const rows = [{ 지급방식: "계산서" }, { 지급방식: "선불" }, { 지급방식: " 착불 " }, { 지급방식: "" }];
  const off = AR.statementRowsOf(rows, false);
  assert.deepEqual([off.rows.length, off.excluded.length], [2, 2]);
  assert.equal(AR.statementRowsOf(rows, true).rows.length, 4);
  assert.equal(AR.stmtIncludePrepaidOf(null), false);
  assert.equal(AR.stmtIncludePrepaidOf(null, true), true);
  assert.equal(AR.stmtIncludePrepaidOf({ includePrepaid: false }, true), false);
  assert.equal(AR.stmtIncludePrepaidOf({ includePrepaid: true }, false), true);
});

t("연차 현황 — 전자결재 승인분만 사용 · 진행 중은 대기 · 예전 게시판도 승인된 것만 · 조정 반영", () => {
  const ap = (id, status, start, end) => ({ id, drafterUid: "u1", cat: "leave", form: "annual", status, data: { kind: "연차", period: { start, end } } });
  const approvals = [ap("1", "approved", "2026-04-06", "2026-04-07"), ap("2", "pending", "2026-05-04", "2026-05-04"), ap("3", "rejected", "2026-05-11", "2026-05-11"),
    { id: "4", drafterUid: "u1", cat: "leave", form: "half", status: "approved", data: { date: "2026-06-01", ampm: "오후 반차" } }, { ...ap("5", "approved", "2026-04-08", "2026-04-08"), drafterUid: "u2" }];
  const schedules = [
    { authorUid: "u1", type: "휴가", start: "2026-07-01", end: "2026-07-01", approvers: [{ status: "approved" }] },
    { authorUid: "u1", type: "휴가", start: "2026-07-02", end: "2026-07-02", approvers: [{ status: "pending" }] },
    { authorUid: "u1", type: "휴가", start: "2026-07-03", end: "2026-07-03" }, // 결재선 없는 예전 글 = 그대로 사용
  ];
  const st = leaveStatusOf({ hireDate: "2021-03-15", uid: "u1", approvals, schedules, adjust: [{ period: "2026-03-15", days: 1 }, { period: "2025-03-15", days: 5 }], now });
  assert.deepEqual([st.base, st.ent.total, st.used, st.pending, st.remain], [17, 18, 4.5, 2, 13.5]);
  const b = calcLeaveBalance("2021-03-15", schedules, "u1", "", [], now, { approvals, adjust: [{ period: "2026-03-15", days: 1 }] });
  assert.deepEqual([b.entitlement, b.used, b.remaining, b.pending], [18, 4.5, 13.5, 2]);
});
t("연차 회기 — 회사가 회계연도 기준이면 회계연도 회기 · 입사일 기준이 기본", () => {
  const hire = leaveEntitlement("2021-03-15", now);
  const fis = leaveEntitlement("2021-03-15", now, { basis: "fiscal", fiscalStart: "01-01" });
  assert.deepEqual([hire.from, hire.to], ["2026-03-15", "2027-03-14"]);
  assert.deepEqual([fis.from, fis.to, fis.total], ["2026-01-01", "2026-12-31", 16]); // 회기 시작일(1/1) 기준 근속 4년 → 15 + 1
  const st = leaveStatusOf({ hireDate: "2021-03-15", uid: "u1", approvals: [{ drafterUid: "u1", cat: "leave", form: "annual", status: "approved", data: { period: { start: "2026-02-02", end: "2026-02-03" } } }], now, basis: { basis: "fiscal", fiscalStart: "01-01" } });
  assert.equal(st.used, 2); // 회계연도 회기(1월~)라 2월 사용분도 이번 회기
  assert.equal(leaveEntitlement("2026-05-20", now, { basis: "fiscal" }).label, "월차"); // 1년 미만은 그대로 월차
});
t("지각 — 출근시간을 정하지 않은 직원은 09:00 기준 · 오전반차는 +4시간", () => {
  assert.equal(workStartOf({}), "09:00");
  assert.equal(isLateAt("09:01", {}), true);
  assert.equal(isLateAt("09:00", {}), false);
  assert.equal(isLateAt("09:20", { workStartTime: "09:30" }), false);
  assert.equal(isLateAt("12:59", {}, "오전반차"), false);
  assert.equal(isLateAt("13:01", {}, "오전반차"), true);
  assert.equal(isLateAt("", {}), false);
});

console.log(`\n업무 규칙 테스트 ${n}개 통과`);
