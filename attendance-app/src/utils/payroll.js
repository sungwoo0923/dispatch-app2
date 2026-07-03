import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// Simple, company-configurable payroll calculator.
// Rates are placeholders — companies should tune them under Admin > 정산 설정
// (a follow-up screen) rather than relying on exact government tables.
export const DEFAULT_PAYROLL_RATES = {
  overtimeMultiplier: 1.5,
  weeklyAllowanceEnabled: true,
  nationalPension: 0.045, // 국민연금
  healthInsurance: 0.0709 / 2, // 건강보험 (근로자 부담분)
  longTermCare: 0.1281, // 장기요양 (건강보험료의 %)
  employmentInsurance: 0.009, // 고용보험
  lateDeductionPerMinute: 0, // optional per-minute deduction, 0 = off
};

export function calcMonthlyPayroll({
  baseWage, // hourly or fixed monthly base, depending on wageType
  wageType = "hourly", // 'hourly' | 'monthly'
  hoursWorked = 0,
  overtimeHours = 0,
  weeklyEligibleWeeks = 0, // number of weeks that met 주휴수당 조건 (15h+ worked)
  weeklyHoursPerWeek = 40,
  allowances = 0, // 식대 등 기타수당 합계
  lateMinutes = 0,
  rates = DEFAULT_PAYROLL_RATES,
}) {
  const base = wageType === "monthly" ? baseWage : baseWage * hoursWorked;
  const overtimePay = wageType === "hourly" ? baseWage * overtimeHours * rates.overtimeMultiplier : 0;
  const weeklyAllowance = rates.weeklyAllowanceEnabled
    ? (wageType === "hourly" ? baseWage * 8 : 0) * weeklyEligibleWeeks
    : 0;
  const lateDeduction = lateMinutes * rates.lateDeductionPerMinute;

  const grossPay = base + overtimePay + weeklyAllowance + allowances - lateDeduction;

  const pension = Math.round(grossPay * rates.nationalPension);
  const health = Math.round(grossPay * rates.healthInsurance);
  const longTermCare = Math.round(health * rates.longTermCare);
  const employment = Math.round(grossPay * rates.employmentInsurance);
  const totalDeductions = pension + health + longTermCare + employment;

  const netPay = Math.round(grossPay - totalDeductions);

  return {
    base: Math.round(base),
    overtimePay: Math.round(overtimePay),
    weeklyAllowance: Math.round(weeklyAllowance),
    allowances: Math.round(allowances),
    lateDeduction: Math.round(lateDeduction),
    grossPay: Math.round(grossPay),
    deductions: { pension, health, longTermCare, employment, total: totalDeductions },
    netPay,
  };
}

// Picks the insurance rate assignment in effect for a site as of a given
// date (the most recent entry whose effectiveDate has already passed),
// falling back to the company-wide placeholder rates when the site has no
// assignment yet.
export async function getSiteInsuranceRates(companyId, siteId, asOfDate) {
  if (!companyId || !siteId) return DEFAULT_PAYROLL_RATES;
  const snap = await getDocs(
    query(collection(db, "siteInsuranceRates"), where("companyId", "==", companyId), where("siteId", "==", siteId))
  );
  const candidates = snap.docs
    .map((d) => d.data())
    .filter((a) => !asOfDate || a.effectiveDate <= asOfDate)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  if (candidates.length === 0) return DEFAULT_PAYROLL_RATES;
  return {
    ...DEFAULT_PAYROLL_RATES,
    nationalPension: candidates[0].rates.pension,
    healthInsurance: candidates[0].rates.health,
    longTermCare: candidates[0].rates.longTermCare,
    employmentInsurance: candidates[0].rates.employment,
  };
}
