// ======================= src/salesCore.js =======================
// 💼 2026-11-10 영업팀 — 계산만 하는 파일(화면·서버 없이 node 테스트에서도 읽을 수 있게 다른 파일을 가져오지 않는다)
//  · 거래처 담당(salesAccounts): 거래처 → 영업 담당자 · 수주일
//  · 인센티브 규정(salesPlans/{회사}.policy): 기준(매출이익/매출) · 구간 누진 요율 · 신규 거래처 가산 · 장기 거래처 조정 ·
//    최저 마진율(저가 수주 제외) · 수금 완료분만 확정 · 목표 초과 가속 · 월 상한
//  · 거래처 상태(신규·성장·급감·휴면·미수) · 영업 파이프라인 단계(확률 가중 예상 매출)

export const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
export const kstDay = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
export const ymOf = (off = 0, base = kstDay()) => { const d = new Date(`${String(base).slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7); };
export const dayGap = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
export const monthGap = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
export const cName = (v) => String(v || "").trim();
export const orderDate = (r) => String(r?.상차일 || r?.날짜 || "").slice(0, 10);

// ─── 인센티브 규정 기본값 ───
export const DEFAULT_POLICY = {
  base: "profit",          // "profit" 매출이익(청구운임 − 기사운임) | "revenue" 매출(청구운임)
  useTiers: true,          // 구간 누진(월 기준금액이 커질수록 높은 요율)
  rate: 10,                // 구간을 안 쓸 때 기본 요율(%)
  tiers: [{ from: 0, rate: 8 }, { from: 5000000, rate: 11 }, { from: 10000000, rate: 14 }],
  newMonths: 6, newBonus: 3,           // 신규 거래처: 수주 후 N개월 동안 +x%p
  matureMonths: 0, matureFactor: 100,  // 장기 거래처: 수주 N개월 뒤부터 요율의 x%(0이면 안 씀)
  minMargin: 3,            // 마진율이 이보다 낮은 오더는 인센티브에서 뺀다(%)
  collectOnly: true,       // 수금(정산완료)된 거래처분만 지급 확정, 나머지는 보류
  accelOn: true, accelOver: 100, accelFactor: 120, // 목표 달성률이 x% 이상이면 인센티브 × y%
  cap: 0,                  // 1인 월 상한(0 = 없음)
  payDay: 25,              // 지급일(다음 달)
  showRanking: true,       // 영업사원끼리 순위 공개
};
export function normPolicy(p) {
  const o = { ...DEFAULT_POLICY, ...(p || {}) };
  const tiers = (Array.isArray(o.tiers) ? o.tiers : []).map((t) => ({ from: Math.max(0, toInt(t.from)), rate: Number(t.rate) || 0 })).sort((a, b) => a.from - b.from);
  if (!tiers.length || tiers[0].from !== 0) tiers.unshift({ from: 0, rate: Number(o.rate) || 0 });
  ["rate", "newMonths", "newBonus", "matureMonths", "matureFactor", "minMargin", "accelOver", "accelFactor", "cap", "payDay"].forEach((k) => { o[k] = Number(o[k]) || 0; });
  return { ...o, tiers };
}
export const baseLabel = (p) => (p?.base === "revenue" ? "매출" : "매출이익");

// 구간 누진 — 기준금액 B에 대한 인센티브(각 구간에 걸친 금액 × 그 구간 요율)
export function tierAmount(policy, B) {
  if (B <= 0) return 0;
  if (!policy.useTiers) return (B * policy.rate) / 100;
  let sum = 0;
  policy.tiers.forEach((t, i) => {
    const end = policy.tiers[i + 1]?.from ?? Infinity;
    if (B > t.from) sum += ((Math.min(B, end) - t.from) * t.rate) / 100;
  });
  return sum;
}
// 다음 구간까지 남은 금액 — { need, rate } | null
export function nextTier(policy, B) {
  if (!policy.useTiers) return null;
  const t = policy.tiers.find((x) => x.from > B);
  return t ? { need: t.from - B, rate: t.rate, from: t.from } : null;
}
export function curTierRate(policy, B) {
  if (!policy.useTiers) return policy.rate;
  let r = policy.tiers[0]?.rate || 0;
  policy.tiers.forEach((t) => { if (B >= t.from) r = t.rate; });
  return r;
}

// 거래처 담당 표 — accounts: [{ client, uid, name, since }] → Map(거래처명 → 담당)
export function accountMap(accounts = []) {
  const m = new Map();
  (accounts || []).forEach((a) => { const k = cName(a.client); if (k && a.uid) m.set(k, a); });
  return m;
}
// 수금 여부 — 정산관리 › 거래처정산에서 그 달을 「정산완료」로 처리하면 오더마다 정산상태["YYYY-MM"]이 찍힌다.
//  한 거래처의 그 달 오더가 모두 정산완료면 수금된 것으로 본다(거래처정산 화면과 같은 기준)
export const orderSettled = (r) => { if (r?.수금 != null) return !!r.수금; const d = orderDate(r); return (r?.정산상태 && typeof r.정산상태 === "object" ? r.정산상태[d.slice(0, 7)] : "") === "정산완료"; };

// ─── 한 사람 · 한 달 인센티브 ───
//  orders: 배차완료 오더(청구운임·기사운임·거래처명·상차일·정산상태) / accounts: 거래처 담당 / target: 그 달 매출 목표
export function calcIncentive({ orders = [], accounts = [], policy: pIn, uid, ym, target = 0 }) {
  const policy = normPolicy(pIn);
  const acc = accountMap(accounts);
  const by = new Map();
  let exN = 0, exSale = 0;
  (orders || []).forEach((r) => {
    const d = orderDate(r);
    if (!d.startsWith(ym)) return;
    const c = cName(r.거래처명);
    const a = acc.get(c);
    if (!a || a.uid !== uid) return;
    if (a.since && d < a.since) return; // 수주일 전 오더는 내 실적이 아니다
    const sale = toInt(r.청구운임), buy = toInt(r.기사운임);
    const g = by.get(c) || { client: c, since: a.since || "", n: 0, sale: 0, buy: 0, base: 0, exN: 0, exSale: 0, open: 0 };
    g.n += 1; g.sale += sale; g.buy += buy;
    if (!orderSettled(r)) g.open += 1;
    const margin = sale > 0 ? ((sale - buy) / sale) * 100 : 0;
    if (policy.minMargin > 0 && sale > 0 && margin < policy.minMargin) { g.exN += 1; g.exSale += sale; exN += 1; exSale += sale; } // 저가 수주 제외
    else g.base += policy.base === "revenue" ? sale : Math.max(0, sale - buy);
    by.set(c, g);
  });
  const rows = [...by.values()];
  const sale = rows.reduce((s, x) => s + x.sale, 0);
  const buy = rows.reduce((s, x) => s + x.buy, 0);
  const base = rows.reduce((s, x) => s + x.base, 0);
  const tierSum = tierAmount(policy, base);
  const effRate = base > 0 ? (tierSum / base) * 100 : curTierRate(policy, 0);
  const achieve = target > 0 ? (sale / target) * 100 : 0;
  const accel = policy.accelOn && target > 0 && achieve >= policy.accelOver ? policy.accelFactor / 100 : 1;
  let gross = 0;
  rows.forEach((x) => {
    const age = x.since ? monthGap(x.since.slice(0, 7), ym) : 999;
    x.isNew = !!x.since && age >= 0 && age < policy.newMonths;
    x.isMature = policy.matureMonths > 0 && !!x.since && age >= policy.matureMonths;
    const factor = x.isMature ? policy.matureFactor / 100 : 1;
    x.rate = effRate * factor + (x.isNew ? policy.newBonus : 0);
    x.amount = Math.round(((x.base * x.rate) / 100) * accel);
    x.collected = x.n > 0 && x.open === 0;
    gross += x.amount;
  });
  const capped = policy.cap > 0 && gross > policy.cap;
  const ratio = capped ? policy.cap / gross : 1;
  if (capped) rows.forEach((x) => { x.amount = Math.round(x.amount * ratio); });
  const total = rows.reduce((s, x) => s + x.amount, 0);
  const confirmed = policy.collectOnly ? rows.filter((x) => x.collected).reduce((s, x) => s + x.amount, 0) : total;
  rows.sort((a, b) => b.amount - a.amount || b.sale - a.sale);
  return {
    uid, ym, rows, n: rows.reduce((s, x) => s + x.n, 0), sale, buy, profit: sale - buy, base, effRate, tierRate: curTierRate(policy, base),
    next: nextTier(policy, base), target, achieve, accel, capped, total, confirmed, held: total - confirmed,
    excluded: { n: exN, sale: exSale }, newClients: rows.filter((x) => x.isNew).length, policy,
  };
}

// ─── 거래처 상태 ─── 최근 30일 vs 그 전 30일 · 마지막 오더일 · 미수
export const HEALTH = {
  new: { label: "신규", tone: "hi" }, grow: { label: "성장", tone: "hi" }, steady: { label: "유지", tone: "" },
  drop: { label: "급감", tone: "warn" }, sleep: { label: "휴면", tone: "warn" }, none: { label: "실적 없음", tone: "dim" },
};
export function clientHealth({ orders = [], accounts = [], clients = [], today = kstDay(), ym = ymOf(0, kstDay()), policy: pIn }) {
  const policy = normPolicy(pIn);
  const acc = accountMap(accounts);
  const prevYm = ymOf(-1, `${ym}-01`);
  const d30 = kstDay(-30), d60 = kstDay(-60);
  const by = new Map();
  const touch = (c) => { let g = by.get(c); if (!g) { g = { client: c, last: "", first: "", cur: 0, prev: 0, prevOpen: 0, curProfit: 0, r30: 0, p30: 0, n: 0, total: 0 }; by.set(c, g); } return g; };
  (clients || []).forEach((c) => { const k = cName(c.거래처명 || c.업체명); if (k) touch(k); });
  acc.forEach((_, k) => touch(k));
  (orders || []).forEach((r) => {
    const c = cName(r.거래처명); const d = orderDate(r); if (!c || !d) return;
    const g = touch(c); const sale = toInt(r.청구운임);
    g.n += 1; g.total += sale;
    if (!g.last || d > g.last) g.last = d;
    if (!g.first || d < g.first) g.first = d;
    if (d.startsWith(ym)) { g.cur += sale; g.curProfit += sale - toInt(r.기사운임); }
    if (d.startsWith(prevYm)) { g.prev += sale; if (!orderSettled(r)) g.prevOpen += 1; }
    if (d > d30 && d <= today) g.r30 += sale; else if (d > d60 && d <= d30) g.p30 += sale;
  });
  return [...by.values()].map((g) => {
    const a = acc.get(g.client) || null;
    const idle = g.last ? dayGap(g.last, today) : null;
    const change = g.p30 > 0 ? ((g.r30 - g.p30) / g.p30) * 100 : (g.r30 > 0 ? 100 : 0);
    const isNew = !!a?.since && monthGap(a.since.slice(0, 7), ym) >= 0 && monthGap(a.since.slice(0, 7), ym) < policy.newMonths;
    let state = "steady";
    if (!g.last) state = "none";
    else if (idle > 30) state = "sleep";
    else if (isNew) state = "new";
    else if (g.p30 > 0 && change <= -30) state = "drop";
    else if (g.p30 > 0 && change >= 30) state = "grow";
    const unpaid = g.prev > 0 && g.prevOpen > 0;
    return { ...g, uid: a?.uid || "", rep: a?.name || "", since: a?.since || "", accountId: a?.id || "", idle, change, state, unpaid, isNew };
  });
}

// ─── 영업 파이프라인 ───
export const LEAD_STAGES = [
  { key: "lead", label: "발굴", prob: 10 }, { key: "contact", label: "접촉", prob: 25 }, { key: "quote", label: "견적", prob: 50 },
  { key: "nego", label: "협상", prob: 75 }, { key: "won", label: "수주", prob: 100 }, { key: "lost", label: "실패", prob: 0 },
];
export const stageOf = (k) => LEAD_STAGES.find((s) => s.key === k) || LEAD_STAGES[0];
export const OPEN_STAGES = ["lead", "contact", "quote", "nego"];
export const leadProb = (l) => (l?.prob != null && l.prob !== "" ? Number(l.prob) || 0 : stageOf(l?.stage).prob);
export const leadWeighted = (l) => Math.round((toInt(l?.monthlyRevenue) * leadProb(l)) / 100);
export function pipelineSummary(leads = [], today = kstDay()) {
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const ym = today.slice(0, 7);
  const won = leads.filter((l) => l.stage === "won"); const lost = leads.filter((l) => l.stage === "lost");
  return {
    open: open.length, amount: open.reduce((s, l) => s + toInt(l.monthlyRevenue), 0), weighted: open.reduce((s, l) => s + leadWeighted(l), 0),
    wonMonth: won.filter((l) => String(l.wonAt || "").startsWith(ym)).length,
    winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0,
    overdue: open.filter((l) => l.nextDate && l.nextDate < today).length,
    today: open.filter((l) => l.nextDate === today).length,
    stale: open.filter((l) => { const u = String(l.touchedAt || l.createdDay || ""); return u && dayGap(u, today) >= 14; }).length,
  };
}
// 새 화주를 수주하면 인센티브가 얼마나 늘어나는지(시뮬레이터) — 지금 실적 위에 월 매출·마진율을 얹어 다시 계산
export function simulateWin({ current, policy: pIn, monthlyRevenue = 0, marginRate = 10, isNew = true }) {
  const policy = normPolicy(pIn);
  const sale = Math.max(0, toInt(monthlyRevenue));
  const add = policy.base === "revenue" ? sale : Math.round((sale * (Number(marginRate) || 0)) / 100);
  if (policy.minMargin > 0 && (Number(marginRate) || 0) < policy.minMargin) return { add: 0, gain: 0, after: current?.total || 0, blocked: true, rate: 0 };
  const b0 = current?.base || 0; const b1 = b0 + add;
  const t0 = tierAmount(policy, b0), t1 = tierAmount(policy, b1);
  const target = current?.target || 0;
  const accel = (s) => (policy.accelOn && target > 0 && (s / target) * 100 >= policy.accelOver ? policy.accelFactor / 100 : 1);
  const bonus0 = (current?.rows || []).filter((x) => x.isNew).reduce((s, x) => s + (x.base * policy.newBonus) / 100, 0);
  const before = Math.round((t0 + bonus0) * accel(current?.sale || 0));
  let after = Math.round((t1 + bonus0 + (isNew ? (add * policy.newBonus) / 100 : 0)) * accel((current?.sale || 0) + sale));
  if (policy.cap > 0) after = Math.min(after, policy.cap);
  const gain = Math.max(0, after - Math.min(before, policy.cap > 0 ? policy.cap : before));
  return { add, gain, after, blocked: false, rate: add > 0 ? (gain / add) * 100 : 0, year: gain * 12 };
}

// 영업 담당자인지(부서 이름에 영업 · 영업 역할) / 영업 관리 권한(규정·목표·거래처 배정·인센티브 확정)
export const SALES_ROLES = ["salesMgr", "salesStaff"];
export const isSalesUser = (u) => !!u && (SALES_ROLES.includes(u.role) || /영업/.test(String(u.team || "")));
export const canManageSales = ({ role = "", isMaster = false, exec = false } = {}) => ["salesMgr", "admin", "allMgr", "totalMaster"].includes(role) || isMaster === true || exec === true;
