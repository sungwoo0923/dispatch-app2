// 📑 이용 계약 조건 계산 점검 — node scripts/contractTerms.test.mjs
import assert from "node:assert/strict";
import * as c from "../src/contractTerms.js";
const base = { ...c.blankTerms("2026-12-01"), planId: "standard" };
let r = c.calcTerms(base);
assert.equal(r.monthly, 349000); assert.equal(r.setup, 0); assert.equal(r.end, "2027-11-30"); assert.equal(r.serviceEnd, "2027-11-30"); assert.equal(r.freeMonths, 0);
// 스탠다드(10명)인데 12명 → 2명 추가
r = c.calcTerms({ ...base, staff: 12 });
assert.equal(r.extraSeats, 2); assert.equal(r.seatFee, 40000); assert.equal(r.monthly, 389000);
// 연간 선결제 → 서비스 기간 2개월 자동 · 종료일 뒤로
r = c.calcTerms({ ...base, billing: "annual" });
assert.equal(r.freeMonths, 2); assert.equal(r.end, "2027-11-30"); assert.equal(r.serviceEnd, "2028-01-31"); assert.equal(r.prepay, 349000 * 12);
// 서비스 기간 직접 수정
r = c.calcTerms({ ...base, billing: "annual", freeTouched: true, freeMonths: 3 }); assert.equal(r.serviceEnd, "2028-02-29");
r = c.calcTerms({ ...base, billing: "annual", freeTouched: true, freeMonths: 0 }); assert.equal(r.serviceEnd, "2027-11-30");
// 6개월 약정 → 도입비 부과 · 6개월 선결제 5% 할인
r = c.calcTerms({ ...base, months: 6, billing: "semi" });
assert.equal(r.setupBase, 500000); assert.equal(r.end, "2027-05-31"); assert.equal(r.prepay, Math.round(349000 * 6 * 0.95));
// 업무 영역 · 지입차 · 기사앱
r = c.calcTerms({ ...base, modules: 4, fleet: 20, driverApp: "100" });
assert.equal(r.moduleFee, 240000); assert.equal(r.extraFleet, 5); assert.equal(r.fleetFee, 35000); assert.equal(r.setup, 200000); assert.equal(r.monthly, 349000 + 240000 + 35000);
// 직접 고친 금액
r = c.calcTerms({ ...base, staff: 12, monthlyOverride: "300000", setupOverride: "0" }); assert.equal(r.monthly, 300000); assert.equal(r.monthlyAuto, 389000);
// 양식 값 · 이용 계약 반영 값
const t = { ...base, staff: 12, billing: "annual" }; r = c.calcTerms(t);
const v = c.termsToVars(t, r); assert.equal(v.요금제, "스탠다드"); assert.equal(v.직원계정, "12"); assert.equal(v.월이용료, "389,000원"); assert.equal(v.종료일, "2028-01-31"); assert.match(v.추가옵션, /추가 직원 계정 2명/); assert.match(v.추가옵션, /서비스 기간 2개월/);
const p = c.termsToPlanPatch(t, r, { contractNo: "C-1" }); assert.equal(p.planId, "standard"); assert.equal(p.extraSeats, 2); assert.equal(p.contractEnd, "2028-01-31"); assert.equal(p.paidEnd, "2027-11-30"); assert.equal(p.freeMonths, 2);
// 무료 이용(체험)
assert.equal(c.trialStateOf({ trialEnd: "2026-12-31" }, "2026-12-01").key, "trial");
assert.equal(c.trialStateOf({ trialEnd: "2026-12-05" }, "2026-12-01").label, "무료 D-4");
assert.equal(c.trialStateOf({ trialEnd: "2026-11-20" }, "2026-12-01").key, "trialOver");
assert.equal(c.trialStateOf({ trialEnd: "2026-12-31", contractEnd: "2027-12-31" }, "2026-12-01"), null);
console.log("contractTerms OK");
