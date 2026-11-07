// ======================= functions/leavePromote.js =======================
// ⭐ 2026-11-06 연차 사용 촉진(근로기준법 61조) 일정 계산 — src/payrollCalc.js의 leavePeriodOf/promoteSchedule/promoteStageDue와 같은 규칙
//  (함수 배포 폴더에는 src가 없어 CommonJS로 옮겨 둔다 — 같은 결과인지 scripts/payrollCalc.test.mjs가 비교한다)
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const D = (s) => new Date(`${s}T00:00:00Z`);
const addDaysStr = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const addMonthsStr = (s, n) => { const d = D(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return ymd(d); };
const dayDiffStr = (a, b) => Math.round((D(b) - D(a)) / 864e5);

function leavePeriodOf(hireDate, today, { basis = "hire", fiscalStart = "01-01" } = {}) {
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
function promoteSchedule(period) {
  if (!period) return null;
  const [m1, m2] = period.firstYear ? [3, 1] : [6, 2];
  const end = addDaysStr(period.to, 1);
  return { first: addMonthsStr(end, -m1), second: addMonthsStr(end, -m2), m1, m2 };
}
function promoteStageDue(period, today, rec = {}, remain = 0) {
  const s = promoteSchedule(period);
  if (!s || remain <= 0 || today > period.to) return null;
  if (!rec?.n1?.sentAt && today >= s.first && today < s.second) return "first";
  if (!rec?.n2?.sentAt && today >= s.second && !(rec?.plan?.submittedAt && (rec.plan.dates || []).length)) return "second";
  if (!rec?.n1?.sentAt && today >= s.second) return "second";
  return null;
}
// 주말을 뺀 일수(전자결재 연차 기간) — 서버에는 공휴일 표가 없어 주말만 뺀다(화면은 공휴일까지 뺌 → 서버가 약간 적게 남은 것으로 볼 수 있음)
function weekdays(start, end) {
  if (!start) return 0;
  const a = D(start); const b = D(end || start);
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n += 1; }
  return n;
}
// src/approvalForms.js leaveUseOf와 같은 기준(연차·하계휴가 · 반차 0.5 · 반반차 0.25)
function leaveUseOf(d) {
  if (!d || d.cat !== "leave") return null;
  if (d.form === "annual" && ["연차", "하계휴가"].includes(d.data?.kind || "연차")) return { date: d.data?.period?.start || "", days: weekdays(d.data?.period?.start, d.data?.period?.end) };
  if (d.form === "half") return { date: d.data?.date || "", days: String(d.data?.ampm || "").includes("반반차") ? 0.25 : 0.5 };
  return null;
}
const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
const promoId = (co, uid, from) => `${safeId(co)}_${uid}_${from}`;

function promoteText(kind, { name, label = "연차", from, to, remain, due, company }) {
  if (kind === "n1") return {
    subject: `[연차 사용 촉진 1차] 미사용 ${label} ${remain}일 — ${due}까지 사용 계획을 알려 주세요`,
    body: `${name}님, ${label} 사용 기간(${from} ~ ${to}) 중 사용하지 않은 ${label}가 ${remain}일 남아 있습니다.\n\n근로기준법 제61조에 따라 이 통보를 받은 날부터 10일 이내(${due}까지) 남은 ${label}의 사용 시기를 정하여 회사에 알려 주시기 바랍니다.\n앱 알림의 [사용 계획 제출] 또는 회사관리 › 연차 사용 계획에서 날짜를 골라 제출할 수 있습니다.\n\n기한까지 사용 시기를 알리지 않으면 회사가 사용 시기를 정하여 서면으로 통보(2차)하며, 이 절차에 따라 사용하지 않은 ${label}에 대해서는 미사용 수당 지급 의무가 없을 수 있습니다.\n\n${company} 인사관리부`,
  };
  return {
    subject: `[연차 사용 촉진 2차] 미사용 ${label} ${remain}일 사용 시기 지정 예정 안내`,
    body: `${name}님, ${label} 사용 기간(${from} ~ ${to}) 종료가 다가오지만 사용하지 않은 ${label}가 ${remain}일 남아 있고 사용 계획이 제출되지 않았습니다.\n\n근로기준법 제61조에 따라 회사가 남은 ${label}의 사용 시기를 지정하여 곧 다시 통보합니다. 그 전에 원하는 날짜가 있으면 [사용 계획 제출]로 알려 주세요.\n\n${company} 인사관리부`,
  };
}

module.exports = { leavePeriodOf, promoteSchedule, promoteStageDue, leaveUseOf, weekdays, addDaysStr, addMonthsStr, promoId, promoteText };
