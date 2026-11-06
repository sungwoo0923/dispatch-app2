// ⭐ 2026-11-06 직원 급여 계산 단위 테스트 — 실행: TZ=Asia/Seoul node scripts/payrollCalc.test.mjs
//  기대값은 손으로 계산한 값(2026 기본 요율: 국민연금 4.75% · 건강 3.595% · 장기요양 13.14% · 고용 0.9%)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { calcPayslip, presetFor, simplifiedIncomeTax, hoursFromAttendance, leavePeriodOf, promoteSchedule, promoteStageDue, childCreditMonthly, ratesFor } from "../src/payrollCalc.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const R = presetFor(2026);
const amt = (list, key) => (list.find((x) => x.key === key) || {}).amount || 0;

t("월급 300만 + 식대 20만, 부양 1명 — 4대보험·소득세·실수령", () => {
  const r = calcPayslip({ payType: "monthly", baseMonthly: 3000000, meal: 200000, dependents: 1 }, {}, R);
  assert.equal(r.gross, 3200000);
  assert.equal(r.nonTaxable, 200000);
  assert.equal(r.taxable, 3000000);
  assert.equal(amt(r.deductions, "np"), 142500);
  assert.equal(amt(r.deductions, "hi"), 107850);
  assert.equal(amt(r.deductions, "ltc"), 14170); // 107,850 × 13.14% = 14,171 → 10원 미만 절사
  assert.equal(amt(r.deductions, "ei"), 27000);
  assert.equal(amt(r.deductions, "tax"), 59080); // 간이세액 근사식(연 70.9만 ÷ 12)
  assert.equal(amt(r.deductions, "local"), 5900);
  assert.equal(r.totalDeduct, 356500);
  assert.equal(r.net, 2843500);
  assert.equal(r.employer.ei, 34500); // 0.9% + 0.25%
  assert.equal(r.employer.total, 142500 + 107850 + 14170 + 34500 + 30000);
});

t("연장·야간·휴일 가산(통상시급 = (기본급+직책수당)/209)", () => {
  const emp = { baseMonthly: 2500000, positionAllow: 300000 };
  const m = { otHours: 10, nightHours: 2, holHours: 8, holOverHours: 2 };
  const r = calcPayslip(emp, m, R);
  assert.equal(r.ordinaryHourly, 13397);
  assert.equal(amt(r.earnings, "ot"), 200955);
  assert.equal(amt(r.earnings, "night"), 13397);
  assert.equal(amt(r.earnings, "holiday"), 214352);
  // 5인 미만 — 가산 없음(1.0배, 야간 가산 0)
  const s = calcPayslip(emp, m, { ...R, small: true });
  assert.equal(amt(s.earnings, "ot"), 133970);
  assert.equal(amt(s.earnings, "night"), 0);
  assert.equal(amt(s.earnings, "holiday"), 133970);
});

t("시급제 + 주휴, 국민연금 하한 · 106만원 미만 소득세 0", () => {
  const r = calcPayslip({ payType: "hourly", hourlyWage: 10320 }, { regularHours: 30 }, R);
  assert.equal(r.gross, 309600);
  assert.equal(r.npBase, 400000);
  assert.equal(amt(r.deductions, "np"), 19000);
  assert.equal(amt(r.deductions, "tax"), 0);
  const w = calcPayslip({ payType: "hourly", hourlyWage: 10320 }, { regularHours: 160, weeklyHolidayHours: 32 }, R);
  assert.equal(amt(w.earnings, "base"), 1651200);
  assert.equal(amt(w.earnings, "weekly"), 330240);
});

t("국민연금 상한 · 식대 한도 초과분 과세 · 세액 직접 입력", () => {
  const r = calcPayslip({ baseMonthly: 8000000, meal: 300000 }, { taxOverride: 712345 }, R);
  assert.equal(r.npBase, 6370000);
  assert.equal(amt(r.deductions, "np"), 302570);
  assert.equal(amt(r.earnings, "meal"), 200000);
  assert.equal(amt(r.earnings, "mealX"), 100000);
  assert.equal(r.taxable, 8100000);
  assert.equal(amt(r.deductions, "tax"), 712340);
  assert.equal(amt(r.deductions, "local"), 71230);
  assert.equal(r.taxMode, "manual");
});

t("부양가족·자녀 많을수록 소득세 감소, 자녀세액공제 표", () => {
  const a = simplifiedIncomeTax(4000000, { dependents: 1 });
  const b = simplifiedIncomeTax(4000000, { dependents: 3 });
  const c = simplifiedIncomeTax(4000000, { dependents: 3, children: 2 });
  assert.ok(a > b && b >= c, `${a} > ${b} >= ${c}`);
  assert.equal(childCreditMonthly(1), 12500);
  assert.equal(childCreditMonthly(2), 29160);
  assert.equal(childCreditMonthly(3), 54160);
  assert.equal(simplifiedIncomeTax(4000000, { dependents: 1, ratePct: 120 }), Math.floor((a * 1.2) / 10) * 10);
});

t("출근기록 → 정상·연장·야간·휴일 시간", () => {
  const recs = [
    { date: "2026-11-02", status: "출근", checkInTime: "2026-11-02T09:00:00", checkOutTime: "2026-11-02T18:00:00" }, // 9h − 1h 휴게 = 8h
    { date: "2026-11-03", status: "출근", checkInTime: "2026-11-03T09:00:00", checkOutTime: "2026-11-03T23:00:00" }, // 14h − 1h = 13h → 연장 5h, 야간 1h
    { date: "2026-11-07", status: "출근", checkInTime: "2026-11-07T09:00:00", checkOutTime: "2026-11-07T20:00:00" }, // 토요일 11h − 1h = 10h → 휴일 8 + 초과 2
    { date: "2026-11-04", status: "연차" },
    { date: "2026-11-05", status: "출근", checkInTime: "2026-11-05T09:00:00" }, // 퇴근 누락 → 정상 8h로 보고 누락 표시
  ];
  const off = (d) => d === "2026-11-07";
  const h = hoursFromAttendance(recs, off);
  assert.equal(h.workDays, 4);
  assert.equal(h.regularHours, 24);
  assert.equal(h.otHours, 5);
  assert.equal(h.nightHours, 1);
  assert.equal(h.holHours, 8);
  assert.equal(h.holOverHours, 2);
  assert.equal(h.missing, 1);
});

t("연차 회기(입사일 기준·회계연도 기준·1년 미만) + 촉진 일정", () => {
  const p = leavePeriodOf("2024-03-15", "2026-11-06");
  assert.deepEqual([p.label, p.from, p.to, p.total], ["연차", "2026-03-15", "2027-03-14", 15]);
  const s = promoteSchedule(p);
  assert.deepEqual([s.first, s.second], ["2026-09-15", "2027-01-15"]);
  assert.equal(promoteStageDue(p, "2026-11-06", {}, 10), "first");
  assert.equal(promoteStageDue(p, "2026-11-06", { n1: { sentAt: 1 } }, 10), null);
  assert.equal(promoteStageDue(p, "2027-01-15", { n1: { sentAt: 1 } }, 10), "second");
  assert.equal(promoteStageDue(p, "2027-01-15", { n1: { sentAt: 1 }, plan: { submittedAt: 1, dates: ["2027-02-01"] } }, 10), null);
  assert.equal(promoteStageDue(p, "2026-11-06", {}, 0), null); // 잔여 없음
  const f = leavePeriodOf("2024-03-15", "2026-11-06", { basis: "fiscal", fiscalStart: "01-01" });
  assert.deepEqual([f.from, f.to, f.total], ["2026-01-01", "2026-12-31", 15]);
  assert.deepEqual(Object.values(promoteSchedule(f)).slice(0, 2), ["2026-07-01", "2026-11-01"]);
  const y = leavePeriodOf("2026-05-01", "2026-11-06");
  assert.equal(y.label, "월차");
  assert.deepEqual(Object.values(promoteSchedule(y)).slice(0, 2), ["2027-02-01", "2027-04-01"]);
});

t("설정 요율이 처음 값을 덮어씀(연도별)", () => {
  const r = ratesFor({ years: { 2026: { npEmp: 4.5, hiEmp: 3.545 } } }, 2026);
  assert.equal(r.npEmp, 4.5);
  assert.equal(r.ltcRatio, 13.14);
  assert.equal(ratesFor({}, 2025).npEmp, 4.5);
});

t("서버(functions/leavePromote.js)와 화면 계산이 같은 결과", () => {
  const LP = createRequire(import.meta.url)("../functions/leavePromote.js");
  const hires = ["2019-01-31", "2023-02-28", "2024-03-15", "2025-06-30", "2025-12-01", "2026-05-01"];
  const days = ["2026-01-01", "2026-03-14", "2026-03-15", "2026-07-01", "2026-11-06", "2027-02-28"];
  let k = 0;
  for (const h of hires) for (const d of days) for (const o of [{ basis: "hire" }, { basis: "fiscal", fiscalStart: "01-01" }, { basis: "fiscal", fiscalStart: "03-01" }]) {
    if (d < h) continue;
    const a = leavePeriodOf(h, d, o); const b = LP.leavePeriodOf(h, d, o);
    assert.deepEqual(a, b, `${h} ${d} ${JSON.stringify(o)}`);
    assert.deepEqual(promoteSchedule(a), LP.promoteSchedule(b));
    for (const rec of [{}, { n1: { sentAt: 1 } }]) assert.equal(promoteStageDue(a, d, rec, 5), LP.promoteStageDue(b, d, rec, 5));
    k += 1;
  }
  assert.ok(k > 50);
});

console.log(`\n급여 계산 테스트 ${n}개 통과`);
