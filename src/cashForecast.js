// ======================= src/cashForecast.js =======================
// 📈 2026-11-08 자금 예측 · 운영 가능 개월수(상세) — 테스트운송사 시범 · 화면 없이 숫자만(단위 테스트 scripts/cashForecast.test.mjs)
//  예전 런웨이 = 보유 자금 ÷ 최근 3개월 평균 지출(들어올 돈·예정된 돈을 몰랐다)
//  이제 = 지금 잔고에서 매달 "들어올 돈 − 나갈 돈"을 12개월 굴려서, 잔고가 처음 0 밑으로 내려가는 달을 찾는다.
//   · 고정 지출: 고정비·정기 지출(acctRecurring 지출) + 직원 급여(최근 급여 지급액)
//   · 변동 지출: 최근 3개월 장부 지출 평균 − 고정비·급여 줄(기사운임 지급·카드·소모품 등 평소 흐름)
//   · 고정 수입: 정기 수입(acctRecurring 수입)
//   · 매출 회수: 최근 3개월 장부 수입 평균 − 정기 수입 줄(거래처 수금 등 평소 흐름)
//   · 이번 달 확정 지출: 최종 승인됐지만 아직 지급 안 한 지출결의(지급 대기)
//   · 예정 항목: 경리가 직접 넣는 일회성 입출금(차량 구입·대출 상환·부가세 납부·보험 갱신 등, acctPlanned)
//   · 미수금: 아직 못 받은 청구액 — "보수적" 시나리오에서는 매출이 끊겨도 이것만큼은 2개월에 나눠 회수된다고 본다
//  시나리오: 기본(지금 흐름 그대로) · 보수적(새 매출 없음 — 미수금만 회수, 기사운임 등 매출 연동 비용은 없어짐)
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const ym = (d) => String(d || "").slice(0, 7);
export function addMonths(ymStr, n) { const [y, m] = ymStr.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }

// 최근 완료된 3개월(이번 달 제외) 장부에서 평소 흐름
export function runRates(ledger = [], recurring = [], thisYm) {
  const months = [3, 2, 1].map((k) => addMonths(thisYm, -k));
  const recurIds = new Set((recurring || []).map((r) => r.id));
  const isFixed = (r) => (r.recurId && recurIds.has(r.recurId)) || r.auto === "payroll";
  const isDrv = (r) => r.auto === "drvpay";
  const acc = months.map((m) => {
    const rows = (ledger || []).filter((r) => ym(r.date) === m);
    const sum = (f) => rows.filter(f).reduce((s, r) => s + toInt(r.amount), 0);
    return {
      m,
      varOut: sum((r) => r.type !== "수입" && !isFixed(r)),
      drvOut: sum((r) => r.type !== "수입" && isDrv(r)),
      varIn: sum((r) => r.type === "수입" && !isFixed(r)),
      any: rows.length > 0,
    };
  });
  const used = acc.filter((x) => x.any);
  const avg = (k) => (used.length ? Math.round(used.reduce((s, x) => s + x[k], 0) / used.length) : 0);
  return { months: used.map((x) => x.m), varOut: avg("varOut"), drvOut: avg("drvOut"), varIn: avg("varIn") };
}

// 최근 급여 지급액(장부 auto: payroll 줄 중 가장 최근 달)
export function lastPayroll(ledger = []) {
  const p = (ledger || []).filter((r) => r.auto === "payroll" && toInt(r.amount) > 0).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return p.length ? toInt(p[0].amount) : 0;
}

// 예측 — 12개월(이번 달 포함)
export function cashForecast({ cash = 0, ledger = [], recurring = [], unpaidApprovals = [], planned = [], receivable = 0, today, months = 12 } = {}) {
  const thisYm = ym(today || new Date(Date.now() + 9 * 3600e3).toISOString());
  const act = (recurring || []).filter((r) => r.active !== false);
  const fixedOutRecur = act.filter((r) => (r.type || "지출") !== "수입").reduce((s, r) => s + toInt(r.amount), 0);
  const fixedIn = act.filter((r) => r.type === "수입").reduce((s, r) => s + toInt(r.amount), 0);
  const payroll = lastPayroll(ledger);
  const rr = runRates(ledger, act, thisYm);
  const pending = (unpaidApprovals || []).reduce((s, d) => s + toInt(d.amount), 0);
  const plannedBy = {};
  (planned || []).forEach((p) => { const k = ym(p.date); if (!k) return; const v = toInt(p.amount) * (p.type === "수입" ? 1 : -1); plannedBy[k] = (plannedBy[k] || 0) + v; });
  // 이번 달은 이미 장부에 들어간 고정비·급여를 빼고 남은 것만
  const thisRows = (ledger || []).filter((r) => ym(r.date) === thisYm);
  const doneRecur = new Set(thisRows.map((r) => r.recurId).filter(Boolean));
  const thisFixedLeft = act.filter((r) => (r.type || "지출") !== "수입" && !doneRecur.has(r.id)).reduce((s, r) => s + toInt(r.amount), 0)
    + (thisRows.some((r) => r.auto === "payroll") ? 0 : payroll);
  const thisFixedInLeft = act.filter((r) => r.type === "수입" && !doneRecur.has(r.id)).reduce((s, r) => s + toInt(r.amount), 0);

  const fixedOut = fixedOutRecur + payroll;
  const scen = (kind) => {
    let bal = toInt(cash); const rows = []; let runOut = null;
    for (let i = 0; i < months; i += 1) {
      const m = addMonths(thisYm, i);
      const first = i === 0;
      const base = kind === "base";
      // 이번 달: 아직 안 나간 고정비 + 지급 대기 결재 · 변동 흐름은 이미 장부에 일부 반영됐으므로 절반만
      const fOut = first ? thisFixedLeft : fixedOut;
      const fIn = first ? thisFixedInLeft : fixedIn;
      const vOut = base ? (first ? Math.round(rr.varOut / 2) : rr.varOut) : Math.max(0, rr.varOut - rr.drvOut) * (first ? 0.5 : 1);
      // 미수금은 다음 두 달에 나눠 회수 — 보수적 시나리오 · 장부 기록이 아직 없는 회사의 기본 시나리오(평소 수금 흐름을 모를 때)
      const arIn = i === 1 || i === 2 ? Math.round(toInt(receivable) / 2) : 0;
      const vIn = base ? (rr.months.length ? (first ? Math.round(rr.varIn / 2) : rr.varIn) : arIn) : arIn;
      const once = (plannedBy[m] || 0) - (first ? pending : 0);
      const inflow = fIn + vIn + Math.max(0, plannedBy[m] || 0);
      const outflow = fOut + Math.round(vOut) + Math.max(0, -(plannedBy[m] || 0)) + (first ? pending : 0);
      bal += fIn + vIn - fOut - Math.round(vOut) + once;
      rows.push({ m, inflow, outflow, net: inflow - outflow, balance: bal });
      if (runOut == null && bal < 0) runOut = i;
    }
    return { rows, runOutIndex: runOut, runOutMonth: runOut == null ? null : rows[runOut].m };
  };
  const base = scen("base");
  const cons = scen("conservative");
  // 버틸 수 있는 개월수(소수 한 자리) — 잔고가 바닥나는 달 안에서 비례로
  const monthsLeft = (s) => {
    if (s.runOutIndex == null) return null; // 12개월 안에 바닥나지 않음
    const i = s.runOutIndex; const before = i === 0 ? toInt(cash) : s.rows[i - 1].balance; const drop = before - s.rows[i].balance;
    return Math.max(0, Math.round((i + (drop > 0 ? before / drop : 0)) * 10) / 10);
  };
  const monthlyBurn = fixedOut + Math.max(0, rr.varOut - rr.drvOut); // 매출이 0일 때 매달 나가는 돈
  return {
    thisYm, cash: toInt(cash), fixedOut, fixedOutRecur, fixedIn, payroll, pending, receivable: toInt(receivable), runRate: rr,
    monthlyBurn, simpleRunway: monthlyBurn > 0 ? Math.round((toInt(cash) / monthlyBurn) * 10) / 10 : null,
    base: { ...base, monthsLeft: monthsLeft(base) }, conservative: { ...cons, monthsLeft: monthsLeft(cons) },
  };
}
