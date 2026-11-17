// ======================= src/payrollCopy.js =======================
// ⭐ 2026-11-17 직원 급여 설정 — "다른 직원에게 똑같이 적용" · "기본 템플릿" 공용(순수 함수 · node scripts/payrollCopy.test.mjs)
//  · 고른 묶음(기본 급여 · 고정 수당 · 기타 수당 · 소득세 · 4대보험)만 복사한다
//  · 사람마다 다른 칸(생년월일 · 지급 계좌 · 메모 · 근로계약서 · 이름 · uid)은 절대 복사하지 않는다
//  · 저장 모양은 그대로(payrollEmployees 문서의 같은 칸 이름) — 저장은 Payroll.jsx cleanEmp 를 거친다
//  · 템플릿은 payrollSettings/{회사}.empTemplates = [{ name, data, at, by }] (최대 20개)
export const COPY_GROUPS = [
  ["pay", "기본 급여", "급여형태 · 고용형태 · 기본급(연봉 · 시급 · 일급)", ["payType", "employmentType", "baseMonthly", "annualSalary", "annualSeverance", "annualMealIncluded", "hourlyWage", "dailyWage"]],
  ["fixed", "직책수당 · 식대 · 자가운전보조금", "식대 통상임금 포함 여부까지", ["positionAllow", "meal", "car", "mealOrdinary"]],
  ["allow", "기타 고정 수당", "매월 주는 수당 줄 전체(덮어써요)", ["allowances"]],
  ["tax", "소득세", "부양가족 · 자녀 · 세액 비율 · 고정 세액", ["dependents", "children", "taxRatePct", "taxFixed"]],
  ["ins", "4대보험", "적용 · 제외와 기준 금액", ["npExempt", "hiExempt", "eiExempt", "npBase", "hiBase"]],
];
// 기본으로 켜 둘 묶음 — 소득세(부양가족)는 사람마다 달라서 꺼 둔다
export const COPY_DEFAULT = ["pay", "fixed", "allow", "ins"];
export const NEVER_COPY = ["birthDate", "payAccount", "memo", "contractFiles", "name", "uid", "companyName", "id", "updatedAt", "updatedBy"];
export const TEMPLATE_MAX = 20;

const FIELD_LABEL = {
  payType: "급여형태", employmentType: "고용형태", baseMonthly: "월 기본급", annualSalary: "연봉", annualSeverance: "퇴직금 포함", annualMealIncluded: "식대 연봉 포함", hourlyWage: "시급", dailyWage: "일급",
  positionAllow: "직책수당", meal: "식대", car: "자가운전보조금", mealOrdinary: "식대 통상임금",
  allowances: "기타 수당", dependents: "부양가족", children: "자녀", taxRatePct: "세액 비율", taxFixed: "고정 세액",
  npExempt: "국민연금", hiExempt: "건강보험", eiExempt: "고용보험", npBase: "국민연금 기준", hiBase: "건강보험 기준",
};
const PAY_TYPE_TEXT = { monthly: "월급제", annual: "연봉제", hourly: "시급제", daily: "일급제" };
const MONEY = new Set(["baseMonthly", "annualSalary", "hourlyWage", "dailyWage", "positionAllow", "meal", "car", "taxFixed", "npBase", "hiBase"]);
const EXEMPT = new Set(["npExempt", "hiExempt", "eiExempt"]);
const won = (v) => Math.round(Number(v) || 0).toLocaleString("ko-KR");

export const groupFields = (groups) => COPY_GROUPS.filter(([k]) => (groups || []).includes(k)).flatMap(([, , , f]) => f);

// 원본에서 고른 묶음의 칸만 떼어 낸다(수당 줄은 새 배열로 복사)
export function copyPatch(src, groups) {
  const out = {};
  if (!src) return out;
  for (const k of groupFields(groups)) {
    if (NEVER_COPY.includes(k)) continue;
    const v = src[k];
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? { ...x } : x)) : v;
  }
  return out;
}

// 칸 하나를 사람이 읽는 글로
export function fieldText(k, v) {
  if (k === "payType") return PAY_TYPE_TEXT[v || "monthly"] || String(v || "");
  if (EXEMPT.has(k)) return v ? "제외" : "적용";
  if (k === "annualSeverance" || k === "annualMealIncluded" || k === "mealOrdinary") return v ? "포함" : "제외";
  if (k === "allowances") { const l = (v || []).filter((x) => x && (x.label || Number(x.amount))); return l.length ? l.map((x) => `${x.label || "기타"} ${won(x.amount)}`).join(", ") : "없음"; }
  if (k === "dependents") return `${Math.max(0, (Number(v) || 1) - 1)}명`;
  if (k === "children") return `${Number(v) || 0}명`;
  if (k === "taxRatePct") return `${Number(v) || 100}%`;
  if (MONEY.has(k)) return v === "" || v === null || v === undefined ? (k === "taxFixed" || k === "npBase" || k === "hiBase" ? "자동" : "0") : won(v);
  return v === undefined || v === null || v === "" ? "-" : String(v);
}
// 같은 값인가(숫자 칸은 숫자로, 수당 줄은 내용으로)
function same(k, a, b) {
  if (k === "allowances") return JSON.stringify((a || []).map((x) => [x.label || "", Number(x.amount) || 0, x.taxable !== false, x.ordinary !== false])) === JSON.stringify((b || []).map((x) => [x.label || "", Number(x.amount) || 0, x.taxable !== false, x.ordinary !== false]));
  if (MONEY.has(k)) { const ea = a === "" || a === null || a === undefined; const eb = b === "" || b === null || b === undefined; if (ea || eb) return (ea && (eb || Number(b) === 0)) || (eb && Number(a) === 0); return Number(a) === Number(b); }
  if (EXEMPT.has(k) || k === "annualSeverance" || k === "annualMealIncluded" || k === "mealOrdinary") return !!a === !!b;
  if (k === "payType") return (a || "monthly") === (b || "monthly");
  if (k === "dependents") return (Number(a) || 1) === (Number(b) || 1);
  if (k === "taxRatePct") return (Number(a) || 100) === (Number(b) || 100);
  if (k === "children") return (Number(a) || 0) === (Number(b) || 0);
  return (a ?? "") === (b ?? "");
}
// 바뀌는 칸 목록 — [{ key, label, from, to }]
export function diffEmp(target, patch) {
  const t = target || {};
  return Object.keys(patch || {}).filter((k) => !same(k, t[k], patch[k])).map((k) => ({ key: k, label: FIELD_LABEL[k] || k, from: fieldText(k, t[k]), to: fieldText(k, patch[k]) }));
}
// 직원 고르기 — 검색어(이름 · 부서 · 직책) · 부서 · 직책
export function filterTargets(list, { q = "", team = "", position = "" } = {}, exceptId = "") {
  const s = String(q || "").trim();
  return (list || []).filter((u) => u && u.id !== exceptId)
    .filter((u) => !s || [u.displayName, u.name, u.team, u.position].some((v) => String(v || "").includes(s)))
    .filter((u) => !team || u.team === team)
    .filter((u) => !position || u.position === position);
}
// 템플릿 목록에 넣기(같은 이름은 바꿔 끼움 · 최근 것이 위 · 최대 20개)
export function upsertTemplate(list, name, data, meta = {}) {
  const n = String(name || "").trim().slice(0, 30);
  if (!n) return list || [];
  const rest = (list || []).filter((t) => t && t.name !== n);
  return [{ name: n, data: { ...data }, ...meta }, ...rest].slice(0, TEMPLATE_MAX);
}
export const removeTemplate = (list, name) => (list || []).filter((t) => t && t.name !== name);
