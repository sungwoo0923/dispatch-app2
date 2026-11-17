// ======================= src/execBriefingCore.js =======================
// 👑 2026-11-17 경영 브리핑(임원 홈 · ExecSuite ExecDashboard) — 화면 없이 숫자만 계산하는 순수 함수
//  · 매출 · 이익 기준은 다른 임원 화면과 같다: 청구운임 = 매출, orderProfit(src/forkliftCore.js) = 매출총이익, 상차일 기준
//  · 사업 흐름: 이번 달 1일 ~ 오늘 오더(취소 · 운송사 전송 제외 — 화면이 liveRows 로 걸러서 넘긴다)
//      접수 → 배차완료 → 청구(배차완료 오더 청구운임) → 입금 확인(정산관리 [입금완료]) → 기사 지급(기사운임 + 회사가 따로 지급) → 매출총이익
//      입금 · 지급 단계는 회사가 정산관리에서 [입금완료] · [지급완료]를 실제로 쓰고 있을 때만 보여 준다(쓰지 않으면 0이 "미입금"처럼 보이므로)
//  · 인건비: 회계 장부(acctLedger) 지출 중 급여 · 상여 · 퇴직급여 · 4대보험 계정 합(급여 계산 상세는 임원이 읽지 않는다)
//  · 팀별 기여: 담당자별 매출(dailyReportCore staffRanking)을 직원 소속 팀(users.team)으로 묶는다
import { dateOf, toWon, isDone, rangeDays } from "./dailyReportCore";
import { orderProfit, paidOut } from "./forkliftCore";

// ── 인건비 계정 ──
export const LABOR_ACCOUNT_RE = /급여|상여|퇴직|잡급|인건비|4대\s*보험|국민연금|건강보험|고용보험|산재보험/;
export const isLaborAccount = (acc) => LABOR_ACCOUNT_RE.test(String(acc || ""));
// months: ["2026-06", ...] → [{ m, total, byAcc: { 급여·상여: n } }]
export function laborByMonth(ledger, months) {
  const set = new Set(months);
  const out = Object.fromEntries(months.map((m) => [m, { m, total: 0, byAcc: {} }]));
  (ledger || []).forEach((x) => {
    const m = String(x?.date || "").slice(0, 7);
    if (!set.has(m) || (x.type || "지출") !== "지출") return;
    const acc = String(x.account || "").trim();
    if (!isLaborAccount(acc)) return;
    const v = toWon(x.amount); if (!v) return;
    out[m].total += v; out[m].byAcc[acc] = (out[m].byAcc[acc] || 0) + v;
  });
  return months.map((m) => out[m]);
}

// ── 이번 달 사업 흐름 ──
//  rows: 취소 · 운송사 전송을 뺀 오더 · ym: "2026-11" · today: "2026-11-18"
//  yearRows(선택): 입금 · 지급 상태를 이 회사가 쓰는지 볼 범위(없으면 rows)
export function monthPipeline(rows, ym, today, yearRows) {
  const from = `${ym}-01`;
  const o = { orders: 0, done: 0, open: 0, sale: 0, cost: 0, driverPay: 0, profit: 0, deposited: 0, depositedCnt: 0, paid: 0, paidCnt: 0, days: rangeDays(from, today).length, useDeposit: false, usePay: false };
  for (const r of rows || []) {
    const d = dateOf(r); if (d < from || d > today) continue;
    o.orders += 1;
    if (!isDone(r)) { o.open += 1; continue; }
    o.done += 1;
    const s = toWon(r.청구운임); const drv = toWon(r.기사운임);
    o.sale += s; o.driverPay += drv; o.cost += drv + paidOut(r); o.profit += orderProfit(r);
    if (r.입금상태 === "입금완료") { o.deposited += s; o.depositedCnt += 1; }
    if (r.지급상태 === "지급완료") { o.paid += drv; o.paidCnt += 1; }
  }
  const scope = yearRows || rows || [];
  o.useDeposit = scope.some((r) => r?.입금상태 === "입금완료");
  o.usePay = scope.some((r) => r?.지급상태 === "지급완료");
  o.doneRate = o.orders ? (o.done / o.orders) * 100 : null;
  o.margin = o.sale ? (o.profit / o.sale) * 100 : null;
  o.costRate = o.sale ? (o.cost / o.sale) * 100 : null;
  o.depositRate = o.sale ? (o.deposited / o.sale) * 100 : null;
  o.payRate = o.driverPay ? (o.paid / o.driverPay) * 100 : null;
  o.perOrder = o.done ? o.sale / o.done : 0;
  o.perDay = o.days ? o.orders / o.days : 0;
  return o;
}

// ── 팀 구성(재직 직원) ── staff: users → [{ team, n, names }]
export const TEAM_NONE = "미배정";
export function teamComposition(staff) {
  const m = {};
  (staff || []).forEach((u) => { const t = String(u?.team || "").trim() || TEAM_NONE; const e = m[t] || (m[t] = { team: t, n: 0, names: [] }); e.n += 1; e.names.push(String(u.name || "").trim()); });
  return Object.values(m).sort((a, b) => (a.team === TEAM_NONE) - (b.team === TEAM_NONE) || b.n - a.n || a.team.localeCompare(b.team));
}

// ── 팀별 기여 ── list: staffRanking(...).list · teamOf(name) → 팀 이름(모르면 "")
export const TEAM_OTHER = "기타 · 팀 미확인";
export function teamContribution(list, teamOf) {
  const m = {};
  (list || []).forEach((x) => {
    const t = String(teamOf(x.n) || "").trim() || TEAM_OTHER;
    const e = m[t] || (m[t] = { team: t, sale: 0, profit: 0, cnt: 0, prev: 0, people: 0 });
    e.sale += x.sale; e.profit += x.profit; e.cnt += x.cnt; e.prev += x.prev || 0; e.people += 1;
  });
  const total = Object.values(m).reduce((s, e) => s + e.sale, 0);
  return Object.values(m).map((e) => ({ ...e, margin: e.sale ? (e.profit / e.sale) * 100 : null, share: total ? (e.sale / total) * 100 : 0, d: e.prev ? ((e.sale - e.prev) / Math.abs(e.prev)) * 100 : null }))
    .sort((a, b) => (a.team === TEAM_OTHER) - (b.team === TEAM_OTHER) || b.sale - a.sale);
}

// ── 오늘 근태 ── staff · attendance(오늘 문서) · awayUids(결재된 휴가 · 외근)
export function attendanceToday(staff, attendance, awayUids) {
  const att = Object.fromEntries((attendance || []).map((a) => [a.uid, a]));
  const away = new Set(awayUids || []);
  let inn = 0; let off = 0; let none = 0;
  (staff || []).forEach((u) => {
    const a = att[u.id || u.uid];
    if (a && (a.status === "출근" || a.checkInTime) && !/연차|휴가|외근|출장/.test(String(a.status || ""))) inn += 1;
    else if (away.has(u.id || u.uid) || (a && /연차|휴가|외근|출장|병가|반차/.test(String(a.status || "")))) off += 1;
    else none += 1;
  });
  const total = (staff || []).length;
  return { total, in: inn, away: off, none, rate: total ? (inn / Math.max(1, total - off)) * 100 : null };
}

// ── 한 줄 요약(보고서체) ── 숫자 표기 함수는 화면이 넘긴다(execUi fmtEokMan)
export function briefSentences({ mSale, md, prevAvail, mMargin, forecast, pFullSale, mineCount, title, awayCount, fmt }) {
  const s = [];
  if (!mSale) s.push("이번 달 집계된 매출은 아직 없습니다.");
  else {
    const cmp = prevAvail && md != null && Number.isFinite(md) ? (Math.abs(md) < 0.05 ? "으로 전월 같은 기간과 비슷합니다" : `으로 전월 같은 기간보다 ${Math.abs(md).toFixed(1)}% ${md > 0 ? "늘었습니다" : "줄었습니다"}`) : "입니다";
    s.push(`이번 달 매출은 ${fmt(mSale)}${cmp}${mMargin != null ? ` · 매출총이익률 ${mMargin.toFixed(1)}%` : ""}.`);
  }
  if (forecast > 0) s.push(`지금 속도라면 월말 ${fmt(forecast)}이 예상됩니다.`);
  s.push(mineCount ? `결재 ${mineCount}건이 ${title} 결재를 기다리고 있습니다.` : "기다리는 결재는 없습니다.");
  if (awayCount) s.push(`오늘 ${awayCount}명이 휴가 · 외근 중입니다.`);
  return s;
}
