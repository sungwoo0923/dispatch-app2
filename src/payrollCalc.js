// ======================= src/payrollCalc.js =======================
// ⭐ 2026-11-06 직원 급여 계산 엔진(사무직 직원 — 기사 운임 집계와 별개). 화면 없이 숫자만 계산 → 단위 테스트 가능(scripts/payrollCalc.test.mjs)
//  · 요율은 전부 설정값(payrollSettings/{회사}.years[연도])이고, 아래 PAYROLL_PRESETS는 "처음 값"일 뿐이다 — 경리가 요율 설정 화면에서 바꾼다.
//  · 4대보험 근로자 부담: 국민연금(기준소득월액 상·하한) · 건강보험 · 장기요양(건강보험료 × 비율) · 고용보험
//  · 소득세: 국세청 간이세액표 "작성 원리"를 따라 연 환산 → 근로소득공제 → 인적·연금·특별소득공제(간이세액표 추정식) → 기본세율 →
//    근로소득세액공제(한도) → 12로 나눔 → 자녀세액공제(월) 를 뺀 근사치. ※ 실제 간이세액표 금액과 다를 수 있다
//    (화면에 "간이세액 근사치 — 확정은 세무사/간이세액표 확인" 표시, 직원별 고정 세액·명세서별 직접 입력으로 덮어쓸 수 있음)
//  · 지방소득세 = 소득세 × 10%(10원 미만 절사)
//  · 연장·야간·휴일근로: 통상시급 × 가산율(연장 1.5 · 야간 가산 0.5 · 휴일 8시간 이내 1.5 · 8시간 초과 2.0) — 5인 미만 사업장은 가산 없음(1.0)

// 연도별 처음 값(법정 요율). 2026: 국민연금 9.5%(연금개혁 — 2026년부터 매년 0.5%p 인상, 근로자 4.75%) ·
//  건강보험 7.19%(근로자 3.595%) · 장기요양 소득 대비 0.9448%(= 건강보험료 × 13.14%) · 고용보험 근로자 0.9% · 최저시급 10,320원
//  2025: 국민연금 9%(4.5%) · 건강보험 7.09%(3.545%) · 장기요양 = 건강보험료 × 12.95% · 최저시급 10,030원
//  국민연금 기준소득월액 상·하한 637만원/40만원(2025.7~2026.6 적용분) — 매년 7월 바뀌므로 설정에서 고친다
export const PAYROLL_PRESETS = {
  2025: {
    year: 2025, npEmp: 4.5, npEr: 4.5, npMin: 400000, npMax: 6370000,
    hiEmp: 3.545, hiEr: 3.545, ltcRatio: 12.95, eiEmp: 0.9, eiEr: 0.9, eiErExtra: 0.25, iaEr: 1.0,
    mealExempt: 200000, carExempt: 200000, minWage: 10030, monthlyHours: 209,
    otRate: 1.5, nightRate: 0.5, holRate: 1.5, holOverRate: 2.0, localTaxPct: 10, roundUnit: 10, small: false,
  },
  2026: {
    year: 2026, npEmp: 4.75, npEr: 4.75, npMin: 400000, npMax: 6370000,
    hiEmp: 3.595, hiEr: 3.595, ltcRatio: 13.14, eiEmp: 0.9, eiEr: 0.9, eiErExtra: 0.25, iaEr: 1.0,
    mealExempt: 200000, carExempt: 200000, minWage: 10320, monthlyHours: 209,
    otRate: 1.5, nightRate: 0.5, holRate: 1.5, holOverRate: 2.0, localTaxPct: 10, roundUnit: 10, small: false,
  },
};
export const RATE_FIELDS = [
  // [키, 이름, 단위, 설명]
  ["npEmp", "국민연금 근로자", "%", "기준소득월액 × 요율"], ["npEr", "국민연금 회사", "%", ""],
  ["npMin", "국민연금 기준소득월액 하한", "원", "매년 7월 변경"], ["npMax", "국민연금 기준소득월액 상한", "원", "매년 7월 변경"],
  ["hiEmp", "건강보험 근로자", "%", "보수월액 × 요율"], ["hiEr", "건강보험 회사", "%", ""],
  ["ltcRatio", "장기요양 (건강보험료 대비)", "%", "건강보험료 × 비율"],
  ["eiEmp", "고용보험 근로자(실업급여)", "%", ""], ["eiEr", "고용보험 회사(실업급여)", "%", ""], ["eiErExtra", "고용안정·직업능력개발(회사)", "%", "150인 미만 0.25%"],
  ["iaEr", "산재보험(회사)", "%", "업종별 요율 확인"],
  ["mealExempt", "식대 비과세 한도", "원", "월 20만원"], ["carExempt", "자가운전보조금 비과세 한도", "원", "월 20만원"],
  ["minWage", "최저시급", "원", "통상시급 점검용"], ["monthlyHours", "월 소정근로시간(주휴 포함)", "시간", "주 40시간 = 209"],
  ["otRate", "연장근로 배율", "배", "1.5"], ["nightRate", "야간근로 가산", "배", "22~06시 0.5 가산"],
  ["holRate", "휴일근로 배율(8h 이내)", "배", "1.5"], ["holOverRate", "휴일근로 배율(8h 초과)", "배", "2.0"],
  ["localTaxPct", "지방소득세(소득세 대비)", "%", "10%"], ["roundUnit", "보험료·세금 절사 단위", "원", "10원 미만 절사"],
];
export const presetFor = (year) => ({ ...(PAYROLL_PRESETS[year] || PAYROLL_PRESETS[2026]), year: Number(year) || 2026 });
// 설정 문서에서 그 해 요율(없으면 처음 값) — 저장된 칸만 덮어쓴다
export function ratesFor(settings, year) {
  const y = Number(year) || 2026;
  const saved = settings?.years?.[y] || settings?.years?.[String(y)] || null;
  const base = presetFor(PAYROLL_PRESETS[y] ? y : Math.min(Math.max(y, 2025), 2026));
  const r = { ...base, ...(saved || {}), year: y };
  if (settings?.small !== undefined && saved?.small === undefined) r.small = !!settings.small;
  return r;
}

const num = (v) => { const n = Number(String(v ?? "").toString().replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
// 소수 오차(예: 1.15% 계산의 34,499.9999) 때문에 한 단위 덜 나오지 않게 아주 작은 값을 더해 절사
const floorTo = (v, unit = 10) => (unit > 1 ? Math.floor(Math.max(0, v) / unit + 1e-9) * unit : Math.floor(Math.max(0, v) + 1e-9));
export const wonFmt = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");

// ── 소득세(간이세액 근사치) ──
// 근로소득공제(연)
export function earnedIncomeDeduction(G) {
  let d;
  if (G <= 5e6) d = G * 0.7;
  else if (G <= 15e6) d = 3.5e6 + (G - 5e6) * 0.4;
  else if (G <= 45e6) d = 7.5e6 + (G - 15e6) * 0.15;
  else if (G <= 1e8) d = 12e6 + (G - 45e6) * 0.05;
  else d = 14.75e6 + (G - 1e8) * 0.02;
  return Math.min(d, 20e6);
}
// 간이세액표 특별소득공제 등 추정식(공제대상가족 1명 / 2명 / 3명 이상)
export function specialDeductionEstimate(G, fam) {
  if (G > 1.2e8 && fam < 3) return 0;
  if (fam <= 1) {
    if (G <= 3e7) return 3.1e6 + G * 0.04;
    if (G <= 4.5e7) return 3.1e6 + G * 0.04 - (G - 3e7) * 0.05;
    if (G <= 7e7) return 3.1e6 + G * 0.015;
    return 3.1e6 + G * 0.005;
  }
  if (fam === 2) {
    if (G <= 3e7) return 3.6e6 + G * 0.04;
    if (G <= 4.5e7) return 3.6e6 + G * 0.04 - (G - 3e7) * 0.05;
    if (G <= 7e7) return 3.6e6 + G * 0.02;
    return 3.6e6 + G * 0.01;
  }
  const over4 = Math.max(0, G - 4e7) * 0.04;
  if (G <= 3e7) return 5e6 + G * 0.07;
  if (G <= 4.5e7) return Math.max(0, 5e6 + G * 0.07 - (G - 3e7) * 0.05 + over4);
  if (G <= 7e7) return 5e6 + G * 0.05 + over4;
  return 5e6 + G * 0.03 + over4;
}
// 종합소득 기본세율(2023 귀속~)
export function basicTax(base) {
  const B = [[14e6, 0.06], [50e6, 0.15], [88e6, 0.24], [150e6, 0.35], [300e6, 0.38], [500e6, 0.40], [1e9, 0.42], [Infinity, 0.45]];
  let tax = 0; let prev = 0;
  for (const [cap, rate] of B) { if (base <= prev) break; tax += (Math.min(base, cap) - prev) * rate; prev = cap; }
  return tax;
}
// 근로소득세액공제(한도 포함)
export function earnedTaxCredit(calc, G) {
  const c = calc <= 1.3e6 ? calc * 0.55 : 715000 + (calc - 1.3e6) * 0.3;
  let lim;
  if (G <= 3.3e7) lim = 740000;
  else if (G <= 7e7) lim = Math.max(740000 - (G - 3.3e7) * 0.008, 660000);
  else if (G <= 1.2e8) lim = Math.max(660000 - (G - 7e7) * 0.5, 500000);
  else lim = Math.max(500000 - (G - 1.2e8) * 0.5, 200000);
  return Math.min(c, lim);
}
// 8~20세 자녀 세액공제(월) — 2024.3 개정 간이세액표: 1명 12,500 · 2명 29,160 · 3명 이상 29,160 + 2명 초과 1명당 25,000
export function childCreditMonthly(n) {
  const k = Math.max(0, Math.floor(num(n)));
  if (!k) return 0;
  if (k === 1) return 12500;
  return 29160 + (k - 2) * 25000;
}
// 월 과세급여 → 월 소득세(간이세액 근사치). npMonthly: 국민연금 근로자 부담(연금보험료공제)
export function simplifiedIncomeTax(monthlyTaxable, { dependents = 1, children = 0, npMonthly = 0, ratePct = 100 } = {}) {
  const M = Math.max(0, num(monthlyTaxable));
  if (M < 1060000) return 0; // 간이세액표 시작 구간 미만
  const G = M * 12;
  const fam = Math.max(1, Math.floor(num(dependents) || 1));
  const income = G - earnedIncomeDeduction(G);
  const base = Math.max(0, income - 1.5e6 * fam - num(npMonthly) * 12 - specialDeductionEstimate(G, fam));
  const calc = basicTax(base);
  const annual = Math.max(0, calc - earnedTaxCredit(calc, G));
  const monthly = Math.floor(annual / 12 / 10) * 10;
  const afterChild = Math.max(0, monthly - childCreditMonthly(children));
  return floorTo(afterChild * (num(ratePct) || 100) / 100, 10);
}

// ── 근무시간(출근기록부) → 정상·연장·야간·휴일 시간 ──
//  records: [{ date, status, checkInTime, checkOutTime }] · isOffDay(date): 주말·공휴일 여부
//  하루 실근로 = 퇴근 − 출근 − 휴게(4시간 이상 30분, 8시간 이상 60분) · 평일 8시간 초과분 = 연장 · 22~06시 = 야간 · 휴일 출근 = 휴일(8h 초과분 따로)
const WORK_ST = new Set(["출근", "외근", "조퇴"]);
const minutesBetween = (a, b) => Math.max(0, Math.round((b - a) / 60000));
function nightMinutes(a, b) {
  // a,b: Date — 22:00~06:00(그 Date의 현지 시각 기준) 겹치는 분
  let n = 0;
  const step = 15 * 60000;
  for (let t = a.getTime(); t < b.getTime(); t += step) {
    const h = new Date(t).getHours();
    if (h >= 22 || h < 6) n += Math.min(step, b.getTime() - t) / 60000;
  }
  return Math.round(n);
}
export function hoursFromAttendance(records = [], isOffDay = () => false, { dailyStd = 8 } = {}) {
  let days = 0; let reg = 0; let ot = 0; let night = 0; let hol = 0; let holOver = 0; let missing = 0;
  (records || []).forEach((r) => {
    if (!r || !WORK_ST.has(r.status || (r.checkInTime ? "출근" : ""))) return;
    days += 1;
    if (!r.checkInTime || !r.checkOutTime) { missing += 1; if (!isOffDay(r.date)) reg += dailyStd * 60; return; }
    const a = new Date(r.checkInTime); const b = new Date(r.checkOutTime);
    if (isNaN(a) || isNaN(b) || b <= a) { missing += 1; if (!isOffDay(r.date)) reg += dailyStd * 60; return; }
    const gross = minutesBetween(a, b);
    const brk = gross >= 8 * 60 ? 60 : gross >= 4 * 60 ? 30 : 0;
    const work = Math.max(0, gross - brk);
    const nm = Math.max(0, Math.min(work, nightMinutes(a, b)));
    night += nm;
    if (isOffDay(r.date)) { hol += Math.min(work, dailyStd * 60); holOver += Math.max(0, work - dailyStd * 60); return; }
    reg += Math.min(work, dailyStd * 60);
    ot += Math.max(0, work - dailyStd * 60);
  });
  const h = (m) => Math.round((m / 60) * 10) / 10; // 0.1시간 단위
  return { workDays: days, regularHours: h(reg), otHours: h(ot), nightHours: h(night), holHours: h(hol), holOverHours: h(holOver), missing };
}

// ── 한 사람 한 달 급여 ──
//  emp(직원 급여 설정): { payType:"monthly"|"hourly", baseMonthly, hourlyWage, meal, car, positionAllow,
//    allowances:[{label, amount, taxable(기본 true), ordinary(통상임금 포함, 기본 true)}], dependents(본인 포함), children(8~20세),
//    npBase?(신고 기준소득월액), hiBase?(보수월액), npExempt, hiExempt, eiExempt, taxRatePct(80|100|120), taxFixed?(간이세액표 금액 직접) }
//  month(그 달 입력): { workDays, regularHours, otHours, nightHours, holHours, holOverHours, weeklyHolidayHours, bonus,
//    extraPays:[{label, amount, taxable}], extraDeducts:[{label, amount}], taxOverride?, localTaxOverride? }
export function calcPayslip(emp = {}, month = {}, rates = presetFor(2026)) {
  const R = { ...presetFor(rates?.year || 2026), ...(rates || {}) };
  const unit = num(R.roundUnit) || 10;
  const small = !!R.small;
  const hourly = emp.payType === "hourly";
  const allowances = (emp.allowances || []).filter((a) => a && num(a.amount));
  const earnings = [];
  const push = (key, label, amount, { taxable = true, calc = "" } = {}) => { const a = Math.round(num(amount)); if (a) earnings.push({ key, label, amount: a, taxable, calc }); };

  const regH = num(month.regularHours);
  const hw = num(emp.hourlyWage);
  const basePay = hourly ? Math.round(hw * regH) : num(emp.baseMonthly);
  push("base", hourly ? "기본급(시급제)" : "기본급", basePay, { calc: hourly ? `시급 ${wonFmt(hw)}원 × ${regH}시간` : "월 기본급" });
  if (hourly && num(month.weeklyHolidayHours)) push("weekly", "주휴수당", hw * num(month.weeklyHolidayHours), { calc: `시급 ${wonFmt(hw)}원 × ${num(month.weeklyHolidayHours)}시간` });
  push("position", "직책수당", emp.positionAllow, { calc: "고정" });
  allowances.forEach((a, i) => push(`allow${i}`, a.label || `기타수당${i + 1}`, a.amount, { taxable: a.taxable !== false, calc: a.taxable === false ? "고정 · 비과세" : "고정" }));

  // 통상임금 → 통상시급
  const ordinaryMonthly = hourly ? 0 : num(emp.baseMonthly) + num(emp.positionAllow)
    + allowances.filter((a) => a.ordinary !== false).reduce((s, a) => s + num(a.amount), 0)
    + (emp.mealOrdinary ? num(emp.meal) : 0);
  const hoursStd = num(R.monthlyHours) || 209;
  const ordinaryHourly = hourly ? hw : Math.round(ordinaryMonthly / hoursStd);
  const otR = small ? 1 : num(R.otRate) || 1.5;
  const nightR = small ? 0 : num(R.nightRate);
  const holR = small ? 1 : num(R.holRate) || 1.5;
  const holOR = small ? 1 : num(R.holOverRate) || 2;
  const oh = num(month.otHours); const nh = num(month.nightHours); const hh = num(month.holHours); const ho = num(month.holOverHours);
  push("ot", "연장근로수당", ordinaryHourly * otR * oh, { calc: `통상시급 ${wonFmt(ordinaryHourly)}원 × ${otR} × ${oh}시간` });
  push("night", "야간근로수당", ordinaryHourly * nightR * nh, { calc: `통상시급 ${wonFmt(ordinaryHourly)}원 × ${nightR} × ${nh}시간` });
  push("holiday", "휴일근로수당", ordinaryHourly * (holR * hh + holOR * ho), { calc: `통상시급 ${wonFmt(ordinaryHourly)}원 × (${holR} × ${hh}시간${ho ? ` + ${holOR} × ${ho}시간` : ""})` });
  push("bonus", "상여금", month.bonus, { calc: "이번 달" });
  (month.extraPays || []).forEach((p, i) => push(`extra${i}`, p.label || `기타지급${i + 1}`, p.amount, { taxable: p.taxable !== false, calc: p.taxable === false ? "이번 달 · 비과세" : "이번 달" }));

  // 비과세(식대·자가운전보조금 한도 초과분은 과세)
  const meal = num(emp.meal); const car = num(emp.car);
  const mealEx = Math.min(meal, num(R.mealExempt)); const carEx = Math.min(car, num(R.carExempt));
  if (mealEx) earnings.push({ key: "meal", label: "식대", amount: Math.round(mealEx), taxable: false, calc: `비과세(월 ${wonFmt(R.mealExempt)}원 한도)` });
  if (meal - mealEx > 0) earnings.push({ key: "mealX", label: "식대(한도 초과)", amount: Math.round(meal - mealEx), taxable: true, calc: "비과세 한도 초과분 과세" });
  if (carEx) earnings.push({ key: "car", label: "자가운전보조금", amount: Math.round(carEx), taxable: false, calc: `비과세(월 ${wonFmt(R.carExempt)}원 한도)` });
  if (car - carEx > 0) earnings.push({ key: "carX", label: "자가운전보조금(한도 초과)", amount: Math.round(car - carEx), taxable: true, calc: "비과세 한도 초과분 과세" });

  const gross = earnings.reduce((s, e) => s + e.amount, 0);
  const nonTaxable = earnings.filter((e) => !e.taxable).reduce((s, e) => s + e.amount, 0);
  const taxable = gross - nonTaxable;

  // 4대보험(근로자)
  const npBase0 = num(emp.npBase) || taxable;
  const npBase = Math.min(Math.max(Math.floor(npBase0 / 1000) * 1000, num(R.npMin)), num(R.npMax) || Infinity);
  const hiBase = num(emp.hiBase) || taxable;
  const np = emp.npExempt ? 0 : floorTo(npBase * num(R.npEmp) / 100, unit);
  const hi = emp.hiExempt ? 0 : floorTo(hiBase * num(R.hiEmp) / 100, unit);
  const ltc = emp.hiExempt ? 0 : floorTo(hi * num(R.ltcRatio) / 100, unit);
  const ei = emp.eiExempt ? 0 : floorTo(taxable * num(R.eiEmp) / 100, unit);
  // 소득세
  const autoTax = simplifiedIncomeTax(taxable, { dependents: emp.dependents, children: emp.children, npMonthly: np, ratePct: emp.taxRatePct || 100 });
  const hasOv = month.taxOverride !== undefined && month.taxOverride !== null && month.taxOverride !== "";
  const hasFixed = emp.taxFixed !== undefined && emp.taxFixed !== null && emp.taxFixed !== "";
  const incomeTax = hasOv ? floorTo(num(month.taxOverride), 10) : hasFixed ? floorTo(num(emp.taxFixed), 10) : autoTax;
  const hasLocalOv = month.localTaxOverride !== undefined && month.localTaxOverride !== null && month.localTaxOverride !== "";
  const localTax = hasLocalOv ? floorTo(num(month.localTaxOverride), 10) : floorTo(incomeTax * num(R.localTaxPct) / 100, 10);
  const taxMode = hasOv ? "manual" : hasFixed ? "fixed" : "auto";
  const deductions = [
    { key: "np", label: "국민연금", amount: np, calc: emp.npExempt ? "적용 제외" : `기준소득월액 ${wonFmt(npBase)}원 × ${R.npEmp}%` },
    { key: "hi", label: "건강보험", amount: hi, calc: emp.hiExempt ? "적용 제외" : `보수월액 ${wonFmt(hiBase)}원 × ${R.hiEmp}%` },
    { key: "ltc", label: "장기요양보험", amount: ltc, calc: emp.hiExempt ? "적용 제외" : `건강보험료 × ${R.ltcRatio}%` },
    { key: "ei", label: "고용보험", amount: ei, calc: emp.eiExempt ? "적용 제외" : `과세급여 ${wonFmt(taxable)}원 × ${R.eiEmp}%` },
    { key: "tax", label: "소득세", amount: incomeTax, calc: taxMode === "manual" ? "직접 입력(이번 달)" : taxMode === "fixed" ? "직원별 고정 세액(간이세액표)" : `간이세액 근사치 · 공제대상가족 ${Math.max(1, num(emp.dependents) || 1)}명${num(emp.children) ? ` · 자녀 ${num(emp.children)}명` : ""}${(emp.taxRatePct || 100) !== 100 ? ` · ${emp.taxRatePct}%` : ""}` },
    { key: "local", label: "지방소득세", amount: localTax, calc: hasLocalOv ? "직접 입력" : `소득세 × ${R.localTaxPct}%` },
  ];
  (month.extraDeducts || []).forEach((d, i) => { const a = Math.round(num(d.amount)); if (a) deductions.push({ key: `xd${i}`, label: d.label || `기타공제${i + 1}`, amount: a, calc: "이번 달" }); });
  const totalDeduct = deductions.reduce((s, d) => s + d.amount, 0);
  const net = gross - totalDeduct;

  // 회사 부담(인건비 참고)
  const erNp = emp.npExempt ? 0 : floorTo(npBase * num(R.npEr) / 100, unit);
  const erHi = emp.hiExempt ? 0 : floorTo(hiBase * num(R.hiEr) / 100, unit);
  const erLtc = emp.hiExempt ? 0 : floorTo(erHi * num(R.ltcRatio) / 100, unit);
  const erEi = emp.eiExempt ? 0 : floorTo(taxable * (num(R.eiEr) + num(R.eiErExtra)) / 100, unit);
  const erIa = floorTo(taxable * num(R.iaEr) / 100, unit);
  const employer = { np: erNp, hi: erHi, ltc: erLtc, ei: erEi, ia: erIa, total: erNp + erHi + erLtc + erEi + erIa };

  const warnings = [];
  if (ordinaryHourly && ordinaryHourly < num(R.minWage)) warnings.push(`통상시급 ${wonFmt(ordinaryHourly)}원이 최저시급 ${wonFmt(R.minWage)}원보다 낮습니다`);
  if (taxMode === "auto" && taxable >= 1060000) warnings.push("소득세는 간이세액 근사치입니다 — 확정은 세무사/간이세액표 확인");
  return {
    earnings, deductions, gross, nonTaxable, taxable, totalDeduct, net, employer, costTotal: gross + employer.total,
    ordinaryHourly, ordinaryMonthly, npBase, hiBase, taxMode, autoTax, small, warnings,
    work: { workDays: num(month.workDays), regularHours: regH, otHours: oh, nightHours: nh, holHours: hh, holOverHours: ho, weeklyHolidayHours: num(month.weeklyHolidayHours) },
  };
}

// ⭐ 2026-11-06 급여형태·고용형태 확장(화면용) — 계산 엔진(calcPayslip)은 그대로 두고 그 위에서 입력만 바꿔 넣는다
//  · 일급제(payType "daily"): 일급 ÷ 8 = 시급, 정상 근로시간 = 근로일수 × 8시간(연장·야간·휴일 가산은 시급제와 같음)
//  · 일용직(일급제): 소득세 = (일급 − 15만원) × 6% × (1 − 55%) = 2.7% × 근로일수, 하루 세액 1,000원 미만은 면제(소액부징수)
//  · 프리랜서(3.3%): 4대보험 제외 · 사업소득세 = 지급액 × 3% · 지방소득세 = 소득세 × 10%(= 0.3%)
//  · 이번 달 소득세를 직접 입력하면 그 값이 우선
export const FREELANCE = "프리랜서(3.3%)";
export function dailyWorkerTax(dailyWage, days) {
  const per = Math.floor(Math.max(0, num(dailyWage) - 150000) * 0.027);
  if (per < 1000) return 0;
  return floorTo(per * Math.max(0, Math.floor(num(days))), 10);
}
// ⭐ 2026-11-07 연봉제(payType "annual") — 월 급여 = 연봉 ÷ 12(퇴직금 포함 연봉이면 ÷ 13, 13분의 1은 퇴직금 몫으로 따로 둔다)
//  · annualMealIncluded: 연봉에 식대·자가운전보조금이 들어 있으면 월 기본급 = 월 급여 − 식대 − 자가운전보조금(월 받는 돈 합계는 연봉 ÷ 12 그대로)
//  · 월 기본급은 원 단위 반올림 · 통상임금·연장근로 계산은 월급제와 같다
export function annualBreakdown(emp = {}) {
  const annual = Math.max(0, num(emp.annualSalary));
  const sev = !!emp.annualSeverance;
  const divisor = sev ? 13 : 12;
  const monthlyTotal = Math.round(annual / divisor);
  const fixedIn = emp.annualMealIncluded ? num(emp.meal) + num(emp.car) : 0;
  const base = Math.max(0, monthlyTotal - fixedIn);
  return { annual, divisor, severance: sev, monthlyTotal, fixedIn, base, severanceYear: sev ? annual - monthlyTotal * 12 : 0 };
}
export function calcPayslipFull(emp = {}, month = {}, rates = presetFor(2026)) {
  if (emp.payType === "annual") {
    const a = annualBreakdown(emp);
    const r0 = calcPayslipFull({ ...emp, payType: "monthly", baseMonthly: a.base }, month, rates);
    const calc = `연봉 ${wonFmt(a.annual)}원 ÷ ${a.divisor}${a.fixedIn ? ` − 식대 등 ${wonFmt(a.fixedIn)}원` : ""}`;
    r0.earnings = r0.earnings.map((x) => (x.key === "base" ? { ...x, label: "기본급(연봉제)", calc } : x));
    r0.payType = "annual";
    r0.annual = a;
    return r0;
  }
  const daily = emp.payType === "daily";
  const free = emp.employmentType === FREELANCE;
  const dayWorker = emp.employmentType === "일용직" && daily;
  const blank = (v) => v === undefined || v === null || v === "";
  const e = { ...emp }; const m = { ...month };
  const days = num(month.workDays);
  if (daily) { e.payType = "hourly"; e.hourlyWage = num(emp.dailyWage) / 8; m.regularHours = days * 8; }
  if (free) { e.npExempt = true; e.hiExempt = true; e.eiExempt = true; }
  let r = calcPayslip(e, m, rates);
  let basis = "";
  if (free && blank(month.taxOverride)) { basis = "freelance"; r = calcPayslip(e, { ...m, taxOverride: floorTo(r.gross * 0.03, 10) }, rates); }
  else if (dayWorker && blank(month.taxOverride)) { basis = "daily"; r = calcPayslip(e, { ...m, taxOverride: dailyWorkerTax(emp.dailyWage, days) }, rates); }
  if (daily) r.earnings = r.earnings.map((x) => (x.key === "base" ? { ...x, label: "기본급(일급제)", calc: `일급 ${wonFmt(emp.dailyWage)}원 × ${days}일` } : x));
  if (basis) {
    r.deductions = r.deductions.map((d) => {
      if (d.key === "tax") return { ...d, label: basis === "freelance" ? "사업소득세" : "소득세(일용근로)", calc: basis === "freelance" ? `지급액 ${wonFmt(r.gross)}원 × 3%` : `(일급 − 15만원) × 2.7% × ${days}일 · 하루 1,000원 미만 면제` };
      if (d.key === "local" && blank(month.localTaxOverride)) return { ...d, calc: basis === "freelance" ? "사업소득세 × 10% (지급액의 0.3%)" : "소득세 × 10%" };
      return d;
    });
  }
  r.taxBasis = basis || r.taxMode;
  r.payType = emp.payType || "monthly";
  r.employmentType = emp.employmentType || "";
  return r;
}

// ── 연차 사용 촉진(근로기준법 61조) 일정 ──
//  basis: "hire"(입사일 기준) | "fiscal"(회계연도 기준, fiscalStart "MM-DD")
//  1년 이상(연차): 1차 = 회기 종료 6개월 전 · 2차 = 2개월 전 / 1년 미만(월차): 1차 = 3개월 전 · 2차 = 1개월 전
//  계획 제출 기한 = 1차 통보일 + 10일
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const D = (s) => new Date(`${s}T00:00:00Z`);
export const addDaysStr = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
export const addMonthsStr = (s, n) => { const d = D(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return ymd(d); };
export const dayDiffStr = (a, b) => Math.round((D(b) - D(a)) / 864e5);
export function leavePeriodOf(hireDate, today, { basis = "hire", fiscalStart = "01-01" } = {}) {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return null;
  const t = today;
  const firstYearEnd = addDaysStr(addMonthsStr(hireDate, 12), -1);
  if (t <= firstYearEnd) {
    const months = Math.max(0, Math.floor(dayDiffStr(hireDate, t) / 30.44));
    return { label: "월차", from: hireDate, to: firstYearEnd, total: Math.min(11, months), firstYear: true };
  }
  if (basis === "fiscal") {
    const fs = /^\d{2}-\d{2}$/.test(fiscalStart) ? fiscalStart : "01-01";
    let from = `${t.slice(0, 4)}-${fs}`;
    if (from > t) from = `${Number(t.slice(0, 4)) - 1}-${fs}`;
    const to = addDaysStr(addMonthsStr(from, 12), -1);
    // 회계연도 기준: 이 회기 시작일 기준 근속연수 → 15 + 2년마다 1(최대 25). 입사 다음 회기는 전 회기 근무일 비례(15 × 일수/365, 0.5 단위 올림)
    const yrs = Math.floor(dayDiffStr(hireDate, from) / 365.25);
    let total;
    if (yrs < 1) { const prevFrom = addMonthsStr(from, -12); const worked = Math.max(0, dayDiffStr(hireDate > prevFrom ? hireDate : prevFrom, from)); total = Math.ceil((15 * worked / 365) * 2) / 2; }
    else total = Math.min(25, 15 + Math.floor((yrs - 1) / 2));
    return { label: "연차", from, to, total, firstYear: false };
  }
  let years = 1;
  while (addMonthsStr(hireDate, 12 * (years + 1)) <= t) years += 1;
  const from = addMonthsStr(hireDate, 12 * years);
  const to = addDaysStr(addMonthsStr(hireDate, 12 * (years + 1)), -1);
  return { label: "연차", from, to, total: Math.min(25, 15 + Math.floor((years - 1) / 2)), firstYear: false };
}
export function promoteSchedule(period) {
  if (!period) return null;
  const [m1, m2] = period.firstYear ? [3, 1] : [6, 2];
  const end = addDaysStr(period.to, 1);
  return { first: addMonthsStr(end, -m1), second: addMonthsStr(end, -m2), m1, m2 };
}
// 오늘 해야 할 단계: "first" | "second" | null
export function promoteStageDue(period, today, rec = {}, remain = 0) {
  const s = promoteSchedule(period);
  if (!s || remain <= 0 || today > period.to) return null;
  if (!rec?.n1?.sentAt && today >= s.first && today < s.second) return "first";
  if (!rec?.n2?.sentAt && today >= s.second && !(rec?.plan?.submittedAt && (rec.plan.dates || []).length)) return "second";
  if (!rec?.n1?.sentAt && today >= s.second) return "second"; // 1차를 놓친 경우(기능 도입 전 등) — 2차부터(1차 누락은 HR 화면에 경고)
  return null;
}

// ═════════ ⭐ 2026-11-07 경리 도구(신고·이체 탭) — 명세서 목록만으로 계산(화면 없이 테스트) ═════════
const dAmt = (r, keys) => (r?.deductions || []).filter((d) => keys.includes(d.key)).reduce((s, d) => s + (Number(d.amount) || 0), 0);
// 원천세 신고 요약(원천징수이행상황신고서 코드 기준) — 근로(간이세액 A01) · 일용근로(A03) · 사업소득(A25)
export function withholdingSummary(slips = []) {
  const kinds = { A01: { code: "A01", label: "근로소득 간이세액", n: 0, pay: 0, tax: 0, local: 0 }, A03: { code: "A03", label: "일용근로소득", n: 0, pay: 0, tax: 0, local: 0 }, A25: { code: "A25", label: "사업소득(3.3%)", n: 0, pay: 0, tax: 0, local: 0 } };
  (slips || []).forEach((s) => {
    const r = s?.result; if (!r) return;
    const k = r.taxBasis === "freelance" || s.employmentType === FREELANCE ? "A25" : r.taxBasis === "daily" ? "A03" : "A01";
    const x = kinds[k];
    x.n += 1; x.pay += k === "A01" ? Number(r.taxable) || 0 : Number(r.gross) || 0; x.tax += dAmt(r, ["tax"]); x.local += dAmt(r, ["local"]);
  });
  const rows = Object.values(kinds).filter((x) => x.n);
  return { rows, tax: rows.reduce((s, x) => s + x.tax, 0), local: rows.reduce((s, x) => s + x.local, 0), nonTaxable: (slips || []).reduce((s, x) => s + (Number(x?.result?.nonTaxable) || 0), 0) };
}
// 4대보험 합계(근로자 + 회사) — 공단 고지액과 비교용
export function insuranceSummary(slips = []) {
  const keys = [["np", "국민연금"], ["hi", "건강보험"], ["ltc", "장기요양"], ["ei", "고용보험"], ["ia", "산재보험"]];
  return keys.map(([k, label]) => {
    const emp = (slips || []).reduce((s, x) => s + (k === "ia" ? 0 : dAmt(x?.result, [k])), 0);
    const er = (slips || []).reduce((s, x) => s + (Number(x?.result?.employer?.[k]) || 0), 0);
    return { key: k, label, emp, er, total: emp + er };
  });
}
// 전월 대비 — 실지급이 rate(기본 10%) 넘게 바뀐 사람 · 새로 생긴/빠진 사람
export function compareMonths(cur = [], prev = [], rate = 0.1) {
  const pm = new Map((prev || []).map((s) => [s.uid, s]));
  const cm = new Map((cur || []).map((s) => [s.uid, s]));
  const out = [];
  (cur || []).forEach((s) => {
    const p = pm.get(s.uid);
    const net = Number(s?.result?.net) || 0; const gross = Number(s?.result?.gross) || 0;
    if (!p) { out.push({ uid: s.uid, name: s.name, kind: "new", net, prevNet: 0, diff: net, pct: null, gross, prevGross: 0 }); return; }
    const pn = Number(p?.result?.net) || 0; const pg = Number(p?.result?.gross) || 0;
    const diff = net - pn; const pct = pn ? diff / pn : null;
    out.push({ uid: s.uid, name: s.name, kind: pct !== null && Math.abs(pct) >= rate ? (diff > 0 ? "up" : "down") : "same", net, prevNet: pn, diff, pct, gross, prevGross: pg });
  });
  (prev || []).forEach((p) => { if (!cm.has(p.uid)) out.push({ uid: p.uid, name: p.name, kind: "gone", net: 0, prevNet: Number(p?.result?.net) || 0, diff: -(Number(p?.result?.net) || 0), pct: null, gross: 0, prevGross: Number(p?.result?.gross) || 0 }); });
  return out;
}
// 은행 대량이체 줄 — 계좌 없는 사람은 missing으로
export function transferRows(slips = []) {
  const ok = []; const missing = [];
  (slips || []).forEach((s) => {
    const a = s?.payAccount; const amt = Math.round(Number(s?.result?.net) || 0);
    if (!amt) return;
    if (a && a.bank && a.acct) ok.push({ uid: s.uid, name: s.name, bank: a.bank, acct: String(a.acct).replace(/\D/g, ""), holder: a.holder || s.name || "", amount: amt });
    else missing.push({ uid: s.uid, name: s.name, amount: amt });
  });
  return { ok, missing, total: ok.reduce((x, r) => x + r.amount, 0) };
}
// 올해 누계(연말정산 대비) — 사람별 과세·비과세·소득세·지방세·4대보험
export function yearToDate(slips = [], year) {
  const y = String(year);
  const m = new Map();
  (slips || []).filter((s) => String(s?.ym || "").startsWith(y) && s?.result).forEach((s) => {
    const r = s.result; const x = m.get(s.uid) || { uid: s.uid, name: s.name, months: 0, gross: 0, taxable: 0, nonTaxable: 0, tax: 0, local: 0, ins: 0, net: 0 };
    x.months += 1; x.gross += Number(r.gross) || 0; x.taxable += Number(r.taxable) || 0; x.nonTaxable += Number(r.nonTaxable) || 0;
    x.tax += dAmt(r, ["tax"]); x.local += dAmt(r, ["local"]); x.ins += dAmt(r, ["np", "hi", "ltc", "ei"]); x.net += Number(r.net) || 0;
    if (s.name) x.name = s.name;
    m.set(s.uid, x);
  });
  return [...m.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ko"));
}
