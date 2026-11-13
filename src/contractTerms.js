// ======================= src/contractTerms.js =======================
// 📑 2026-11-13 이용 계약 조건 계산(순수 JS — 계약서 작성 · 이용 계약·만료 · 테스트가 같이 쓴다)
//  입력(고르는 값) → 금액 · 기간을 자동으로 정한다. 저장: contracts/{id}.terms · companyPlans/{회사}(이용 계약·만료 화면이 읽는 곳)
//  · 직원 수가 요금제 포함 인원을 넘으면 넘는 만큼 추가 계정(1명당 월 단가)
//  · 업무 영역 2개째부터 추가 요금(planCore.moduleAddonFee)
//  · 지입차(GPS) 대수가 요금제 포함 대수를 넘으면 넘는 만큼 대당 요금
//  · 기사앱 사용자 수에 따라 기사앱 세팅비(1회 — 설치 안내 · 계정 일괄 등록 · 교육)
//  · 초기 도입비는 12개월 이상 약정이면 면제
//  · 결제 방식: 월 결제 / 6개월 선결제(할인) / 연간 선결제(서비스 기간 2개월)
//  · 서비스 기간(무상 연장) = 계약 종료 뒤에 붙는 개월 수. 연간 선결제는 자동 2개월, 언제든 직접 바꿀 수 있다
//  · 무료 이용(체험) = 계약 전에 먼저 써 보는 기간 — 시작일과 개월 수
import { PLAN_DEFAULTS, PLAN_RATES, moduleAddonFee } from "./planCore.js";

export const TERM_MONTHS = [6, 12, 24, 36];
export const BILLING = [["monthly", "월 결제(계좌이체)"], ["semi", "6개월 선결제"], ["annual", "연간 선결제"]];
export const billingLabel = (k) => (BILLING.find((b) => b[0] === k) || BILLING[0])[1];
export const PAY_DAYS = ["말일", "5일", "10일", "15일", "20일", "25일"];
export const FREE_MONTH_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
export const TRIAL_MONTH_OPTIONS = [1, 2, 3];
// 기사앱 사용자 수 구간 → 세팅비(1회)
export const DRIVER_APP_TIERS = [
  { key: "0", label: "사용 안 함", max: 0, fee: 0 },
  { key: "10", label: "10명 이하", max: 10, fee: 0 },
  { key: "30", label: "11 ~ 30명", max: 30, fee: 100000 },
  { key: "100", label: "31 ~ 100명", max: 100, fee: 200000 },
  { key: "300", label: "101명 이상", max: 9999, fee: 300000 },
];
export const driverTier = (key) => DRIVER_APP_TIERS.find((t) => t.key === String(key)) || DRIVER_APP_TIERS[1];
export const DEFAULT_CFG = { extraSeat: PLAN_RATES.extraSeat, fleetPerVehicle: PLAN_RATES.fleetPerVehicle, annualFreeMonths: 2, semiDiscountRate: 5, waiveSetupMonths: 12 };

const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const pad = (n) => String(n).padStart(2, "0");
const okYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
// 시작일부터 n개월(마지막 날 포함) — 2026-01-01 + 12개월 → 2026-12-31
export function addMonthsEnd(ymd, months) {
  if (!okYmd(ymd) || !num(months)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + num(months), d)); t.setUTCDate(t.getUTCDate() - 1);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const nextDay = (ymd) => { if (!okYmd(ymd)) return ""; const t = new Date(`${ymd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
// 결제 방식에 따른 서비스 기간 기본값(개월)
export const defaultFreeMonths = (billing, cfg = DEFAULT_CFG) => (billing === "annual" ? num(cfg.annualFreeMonths ?? 2) : 0);

export const blankTerms = (today = "") => ({ planId: "standard", modules: 1, staff: 0, fleet: 0, driverApp: "10", billing: "monthly", months: 12, start: today, freeMonths: 0, freeTouched: false, payDay: "말일", monthlyOverride: "", setupOverride: "" });

// terms(고른 값) → 계산 결과
export function calcTerms(t, { plans = PLAN_DEFAULTS, cfg = {} } = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  const plan = plans.find((p) => p.id === t.planId) || PLAN_DEFAULTS.find((p) => p.id === t.planId) || plans[0] || PLAN_DEFAULTS[2];
  const months = num(t.months) || 12;
  const staff = Math.max(0, Math.floor(num(t.staff)));
  const modules = Math.max(1, Math.min(4, Math.floor(num(t.modules)) || 1));
  const extraSeats = Math.max(0, staff - num(plan.seats));
  const extraFleet = num(plan.fleet) || num(t.fleet) ? Math.max(0, Math.floor(num(t.fleet)) - num(plan.fleet)) : 0;
  const seatFee = extraSeats * num(c.extraSeat);
  const moduleFee = moduleAddonFee(plan.id, modules, c.moduleAddon);
  const fleetFee = extraFleet * num(c.fleetPerVehicle);
  const monthlyAuto = num(plan.price) + seatFee + moduleFee + fleetFee;
  const monthly = String(t.monthlyOverride ?? "").trim() !== "" ? num(t.monthlyOverride) : monthlyAuto;
  const setupBase = months >= num(c.waiveSetupMonths) ? 0 : num(plan.setupFee);
  const driver = driverTier(t.driverApp);
  const setupAuto = setupBase + driver.fee;
  const setup = String(t.setupOverride ?? "").trim() !== "" ? num(t.setupOverride) : setupAuto;
  const freeMonths = t.freeTouched ? Math.max(0, Math.floor(num(t.freeMonths))) : defaultFreeMonths(t.billing, c);
  const end = addMonthsEnd(t.start, months);
  const serviceEnd = freeMonths && end ? addMonthsEnd(nextDay(end), freeMonths) : end;
  const semiRate = t.billing === "semi" ? num(c.semiDiscountRate) : 0;
  const prepay = t.billing === "annual" ? monthly * 12 : t.billing === "semi" ? Math.round(monthly * 6 * (1 - semiRate / 100)) : 0;
  const options = [
    modules > 1 ? `업무 영역 ${modules >= 4 ? "통합(4개)" : `${modules}개`} (+${moduleFee.toLocaleString()}원/월)` : "",
    extraSeats ? `추가 직원 계정 ${extraSeats}명 (+${seatFee.toLocaleString()}원/월)` : "",
    extraFleet ? `지입차 관리 추가 ${extraFleet}대 (+${fleetFee.toLocaleString()}원/월)` : "",
    driver.max > 0 ? `기사앱 ${driver.label}${driver.fee ? ` (세팅비 ${driver.fee.toLocaleString()}원 · 1회)` : ""}` : "",
    freeMonths ? `서비스 기간 ${freeMonths}개월 무상 제공${end ? ` (${nextDay(end)} ~ ${serviceEnd})` : ""}` : "",
    semiRate ? `6개월 선결제 ${semiRate}% 할인` : "",
  ].filter(Boolean);
  return { plan, months, staff, modules, extraSeats, extraFleet, seatFee, moduleFee, fleetFee, monthlyAuto, monthly, setupBase, driver, setupAuto, setup, freeMonths, end, serviceEnd, prepay, semiRate, options };
}
// 계약서 양식에 들어가는 글자 값({{요금제}} · {{월이용료}} …)
export function termsToVars(t, r) {
  const won = (n) => `${Math.round(num(n)).toLocaleString()}원`;
  return {
    요금제: r.plan.name, 직원계정: String(num(r.plan.seats) + r.extraSeats), 포함오더: num(r.plan.orders).toLocaleString(), 월이용료: won(r.monthly), 초기비용: won(r.setup),
    계약기간: String(r.months + (r.serviceEnd ? r.freeMonths : 0)), 시작일: t.start || "", 종료일: r.serviceEnd || r.end || "", 결제방식: billingLabel(t.billing) + (t.billing === "annual" && r.prepay ? ` (${won(r.prepay)})` : t.billing === "semi" && r.prepay ? ` (${won(r.prepay)})` : ""),
    결제일: t.payDay || "말일", 추가옵션: r.options.join(" / ") || "없음",
  };
}
// 이용 계약·만료(companyPlans/{회사})에 쓸 값 — 계약서 저장 때 함께 반영
export function termsToPlanPatch(t, r, { contractNo = "", contractId = "" } = {}) {
  return {
    planId: r.plan.id, contractStart: t.start || null, contractEnd: r.serviceEnd || r.end || null, contractTerm: r.months,
    paidEnd: r.end || null, freeMonths: r.freeMonths, billing: t.billing, payDay: t.payDay || "말일",
    extraSeats: r.extraSeats, moduleCount: r.modules, contractStaff: r.staff, contractFleet: Math.max(0, Math.floor(num(t.fleet))), driverAppTier: r.driver.key,
    monthlyFee: r.monthly, setupFee: r.setup, contractNo, contractId,
  };
}

// 무료 이용(체험) 상태 — { key: trial | trialSoon | trialOver, label, dLeft } (없으면 null)
export function trialStateOf(p, today) {
  const end = String(p?.trialEnd || "");
  if (!okYmd(end) || okYmd(String(p?.contractEnd || ""))) return null; // 계약 기간이 정해지면 계약 기준으로 본다
  const dLeft = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (dLeft < 0) return { key: "trialOver", label: `무료 기간 ${-dLeft}일 지남`, dLeft };
  if (dLeft <= 7) return { key: "trialSoon", label: dLeft === 0 ? "무료 오늘까지" : `무료 D-${dLeft}`, dLeft };
  return { key: "trial", label: `무료 이용 중 D-${dLeft}`, dLeft };
}
