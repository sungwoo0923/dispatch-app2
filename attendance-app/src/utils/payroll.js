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
};

export function calcMonthlyPayroll({
  baseWage, // hourly or fixed monthly base, depending on wageType
  wageType = "hourly", // 'hourly' | 'monthly'
  hoursWorked = 0,
  overtimeHours = 0,
  weeklyEligibleWeeks = 0, // number of weeks that met 주휴수당 조건 (15h+ worked)
  weeklyHoursPerWeek = 40,
  allowances = 0, // 기타수당 합계
  mealAllowance = 0, // 식대
  lateDeduction = 0, // 지각공제 (직접 입력한 원 단위 공제액)
  earlyLeaveDeduction = 0, // 조퇴공제 (직접 입력한 원 단위 공제액)
  rates = DEFAULT_PAYROLL_RATES,
}) {
  const base = wageType === "monthly" ? baseWage : baseWage * hoursWorked;
  const overtimePay = wageType === "hourly" ? baseWage * overtimeHours * rates.overtimeMultiplier : 0;
  const weeklyAllowance = rates.weeklyAllowanceEnabled
    ? (wageType === "hourly" ? baseWage * 8 : 0) * weeklyEligibleWeeks
    : 0;

  const grossPay = base + overtimePay + weeklyAllowance + allowances + mealAllowance - lateDeduction - earlyLeaveDeduction;

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
    mealAllowance: Math.round(mealAllowance),
    lateDeduction: Math.round(lateDeduction),
    earlyLeaveDeduction: Math.round(earlyLeaveDeduction),
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

  // Rate assignments store a variable-length `rateItems` list (see 템플릿 >
  // 보험요율) rather than a fixed shape, so pull out the four rates this
  // calculator understands by Korean rate-type label; anything else (e.g.
  // 소득세) is ignored here. Percentages are stored as whole numbers (4.5 == 4.5%).
  const items = candidates[0].rateItems || [];
  const pct = (label) => {
    const item = items.find((i) => i.rateType === label);
    return item ? Number(item.ratePercent) / 100 : null;
  };

  return {
    ...DEFAULT_PAYROLL_RATES,
    nationalPension: pct("국민연금요율") ?? DEFAULT_PAYROLL_RATES.nationalPension,
    healthInsurance: pct("건강보험요율") ?? DEFAULT_PAYROLL_RATES.healthInsurance,
    longTermCare: pct("요양보험요율") ?? DEFAULT_PAYROLL_RATES.longTermCare,
    employmentInsurance: pct("고용보험요율") ?? DEFAULT_PAYROLL_RATES.employmentInsurance,
  };
}
