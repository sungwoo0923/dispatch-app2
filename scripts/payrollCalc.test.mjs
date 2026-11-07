// ⭐ 2026-11-06 직원 급여 계산 단위 테스트 — 실행: TZ=Asia/Seoul node scripts/payrollCalc.test.mjs
//  기대값은 손으로 계산한 값(2026 기본 요율: 국민연금 4.75% · 건강 3.595% · 장기요양 13.14% · 고용 0.9%)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { calcPayslip, calcPayslipFull, annualBreakdown, withholdingSummary, insuranceSummary, compareMonths, transferRows, yearToDate, dailyWorkerTax, FREELANCE, presetFor, simplifiedIncomeTax, hoursFromAttendance, leavePeriodOf, promoteSchedule, promoteStageDue, childCreditMonthly, ratesFor } from "../src/payrollCalc.js";

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
  // ⭐ 2026-11-07 — 1차 계획 제출 기한(10일)이 지나면 바로 2차 대상(종료 2개월 전 "까지" 지정해야 하므로 기한 당일까지 기다리지 않는다)
  const n1 = { sentAt: 1, due: "2026-09-25" };
  assert.equal(promoteStageDue(p, "2026-09-25", { n1 }, 10), null); // 기한 당일은 아직 직원 몫
  assert.equal(promoteStageDue(p, "2026-09-26", { n1 }, 10), "second");
  assert.equal(promoteStageDue(p, "2026-09-26", { n1, plan: { submittedAt: 1, dates: ["2026-12-01"] } }, 10), null);
  assert.equal(promoteStageDue(p, "2026-10-01", { n1, n2: { sentAt: 2 } }, 10), null); // 2차 보낸 뒤
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
    for (const rec of [{}, { n1: { sentAt: 1 } }, { n1: { sentAt: 1, due: "2026-07-05" } }]) assert.equal(promoteStageDue(a, d, rec, 5), LP.promoteStageDue(b, d, rec, 5));
    k += 1;
  }
  assert.ok(k > 50);
});

// ⭐ 2026-11-06 급여형태·고용형태 확장(calcPayslipFull)
t("일급제 — 일급 ÷ 8 = 시급, 근로일수 × 8시간 → 기본급 = 일급 × 일수", () => {
  const r = calcPayslipFull({ payType: "daily", dailyWage: 120000, dependents: 1 }, { workDays: 10 }, R);
  assert.equal(amt(r.earnings, "base"), 1200000);
  assert.equal(r.earnings.find((x) => x.key === "base").label, "기본급(일급제)");
  assert.equal(r.ordinaryHourly, 15000);
});
t("일용직 원천세 — (일급 − 15만) × 2.7% × 일수, 하루 1,000원 미만 면제", () => {
  assert.equal(dailyWorkerTax(200000, 10), 13500); // (5만 × 2.7% = 1,350) × 10일
  assert.equal(dailyWorkerTax(180000, 10), 0); // 하루 810원 → 면제
  const r = calcPayslipFull({ payType: "daily", dailyWage: 200000, employmentType: "일용직", npExempt: true, hiExempt: true }, { workDays: 10 }, R);
  assert.equal(amt(r.deductions, "tax"), 13500);
  assert.equal(amt(r.deductions, "local"), 1350);
  assert.equal(r.taxBasis, "daily");
});
t("프리랜서 3.3% — 4대보험 제외 · 지급액 × 3% + 지방 0.3%", () => {
  const r = calcPayslipFull({ payType: "monthly", baseMonthly: 2000000, meal: 0, employmentType: FREELANCE }, {}, R);
  assert.equal(amt(r.deductions, "np") + amt(r.deductions, "hi") + amt(r.deductions, "ei"), 0);
  assert.equal(amt(r.deductions, "tax"), 60000);
  assert.equal(amt(r.deductions, "local"), 6000);
  assert.equal(r.net, 1934000);
});
t("calcPayslipFull — 월급 정규직은 calcPayslip와 같은 결과", () => {
  const e = { payType: "monthly", baseMonthly: 3000000, meal: 200000, dependents: 1 };
  const a = calcPayslip(e, {}, R); const b = calcPayslipFull(e, {}, R);
  assert.equal(a.net, b.net); assert.equal(a.totalDeduct, b.totalDeduct);
});

// ⭐ 2026-11-07 연봉제
t("연봉제 — 연봉 3,600만 ÷ 12 = 월 300만(월급제 300만과 같은 결과)", () => {
  const a = annualBreakdown({ annualSalary: 36000000 });
  assert.equal(a.divisor, 12); assert.equal(a.monthlyTotal, 3000000); assert.equal(a.base, 3000000);
  const r = calcPayslipFull({ payType: "annual", annualSalary: 36000000, meal: 200000, dependents: 1 }, {}, R);
  const m = calcPayslipFull({ payType: "monthly", baseMonthly: 3000000, meal: 200000, dependents: 1 }, {}, R);
  assert.equal(amt(r.earnings, "base"), 3000000);
  assert.equal(r.earnings.find((x) => x.key === "base").label, "기본급(연봉제)");
  assert.match(r.earnings.find((x) => x.key === "base").calc, /÷ 12/);
  assert.equal(r.net, m.net); assert.equal(r.payType, "annual"); assert.equal(r.annual.annual, 36000000);
});
t("연봉제 — 퇴직금 포함 연봉 3,900만 ÷ 13 = 월 300만 · 퇴직금 몫 300만", () => {
  const a = annualBreakdown({ annualSalary: 39000000, annualSeverance: true });
  assert.equal(a.divisor, 13); assert.equal(a.monthlyTotal, 3000000); assert.equal(a.severanceYear, 3000000);
  const r = calcPayslipFull({ payType: "annual", annualSalary: 39000000, annualSeverance: true }, {}, R);
  assert.equal(amt(r.earnings, "base"), 3000000);
  assert.match(r.earnings.find((x) => x.key === "base").calc, /÷ 13/);
});
t("연봉제 — 식대 포함 연봉: 월 급여 합계는 연봉 ÷ 12, 기본급 = 월 급여 − 식대", () => {
  const r = calcPayslipFull({ payType: "annual", annualSalary: 36000000, meal: 200000, annualMealIncluded: true }, {}, R);
  assert.equal(amt(r.earnings, "base"), 2800000);
  assert.equal(r.gross, 3000000);
  assert.equal(r.nonTaxable, 200000);
});
t("연봉제 — 반올림 · 연장근로 통상시급(기본급 ÷ 209)", () => {
  const r = calcPayslipFull({ payType: "annual", annualSalary: 40000000 }, { otHours: 10 }, R);
  assert.equal(amt(r.earnings, "base"), 3333333);
  assert.equal(r.ordinaryHourly, 15949); // 3,333,333 ÷ 209 = 15,948.96
  assert.equal(amt(r.earnings, "ot"), 239235);
});

// ⭐ 2026-11-07 경리 도구
const mkSlip = (uid, name, emp, month = {}, extra = {}) => ({ uid, name, ym: "2026-10", result: calcPayslipFull(emp, month, R), employmentType: emp.employmentType || "", ...extra });
t("원천세 요약 — 근로(A01) · 일용(A03) · 사업소득(A25) 나눠 합계", () => {
  const s = [
    mkSlip("a", "가", { payType: "monthly", baseMonthly: 3000000, meal: 200000, dependents: 1 }),
    mkSlip("b", "나", { payType: "daily", dailyWage: 200000, employmentType: "일용직", npExempt: true, hiExempt: true }, { workDays: 10 }),
    mkSlip("c", "다", { payType: "monthly", baseMonthly: 2000000, employmentType: FREELANCE }),
  ];
  const w = withholdingSummary(s);
  assert.deepEqual(w.rows.map((x) => x.code), ["A01", "A03", "A25"]);
  assert.equal(w.rows[0].pay, 3000000); assert.equal(w.rows[0].tax, 59080);
  assert.equal(w.rows[1].tax, 13500); assert.equal(w.rows[2].tax, 60000); assert.equal(w.rows[2].pay, 2000000);
  assert.equal(w.tax, 59080 + 13500 + 60000); assert.equal(w.local, 5900 + 1350 + 6000);
});
t("4대보험 합계 — 근로자 + 회사", () => {
  const s = [mkSlip("a", "가", { payType: "monthly", baseMonthly: 3000000, meal: 200000 })];
  const ins = insuranceSummary(s);
  const np = ins.find((x) => x.key === "np");
  assert.equal(np.emp, 142500); assert.equal(np.er, 142500); assert.equal(np.total, 285000);
  assert.equal(ins.find((x) => x.key === "ia").emp, 0); assert.equal(ins.find((x) => x.key === "ia").er, 30000);
});
t("전월 대비 — 10% 넘게 바뀐 사람 · 신규 · 빠진 사람", () => {
  const prev = [{ uid: "a", name: "가", result: { net: 2000000 } }, { uid: "b", name: "나", result: { net: 2000000 } }, { uid: "z", name: "퇴", result: { net: 1000000 } }];
  const cur = [{ uid: "a", name: "가", result: { net: 2300000 } }, { uid: "b", name: "나", result: { net: 2050000 } }, { uid: "n", name: "신", result: { net: 1500000 } }];
  const c = Object.fromEntries(compareMonths(cur, prev).map((x) => [x.uid, x]));
  assert.equal(c.a.kind, "up"); assert.equal(c.a.diff, 300000);
  assert.equal(c.b.kind, "same"); assert.equal(c.n.kind, "new"); assert.equal(c.z.kind, "gone");
});
t("이체 줄 — 계좌 있는 사람만 · 없는 사람은 따로", () => {
  const t1 = transferRows([{ uid: "a", name: "가", payAccount: { bank: "신한", acct: "110-123-456", holder: "가" }, result: { net: 1000000 } }, { uid: "b", name: "나", result: { net: 500000 } }, { uid: "c", name: "다", result: { net: 0 } }]);
  assert.equal(t1.ok.length, 1); assert.equal(t1.ok[0].acct, "110123456"); assert.equal(t1.missing.length, 1); assert.equal(t1.total, 1000000);
});
t("올해 누계 — 사람별 합계, 다른 해는 빼고", () => {
  const s = [{ uid: "a", name: "가", ym: "2026-01", result: { gross: 100, taxable: 80, nonTaxable: 20, net: 90, deductions: [{ key: "tax", amount: 5 }, { key: "np", amount: 3 }] } },
    { uid: "a", name: "가", ym: "2026-02", result: { gross: 100, taxable: 80, nonTaxable: 20, net: 90, deductions: [{ key: "tax", amount: 5 }] } },
    { uid: "a", name: "가", ym: "2025-12", result: { gross: 999 } }];
  const y = yearToDate(s, 2026);
  assert.equal(y.length, 1); assert.equal(y[0].months, 2); assert.equal(y[0].gross, 200); assert.equal(y[0].tax, 10); assert.equal(y[0].ins, 3);
});

console.log(`\n급여 계산 테스트 ${n}개 통과`);
