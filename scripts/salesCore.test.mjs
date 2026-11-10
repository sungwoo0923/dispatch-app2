// 💼 2026-11-10 영업팀 인센티브 계산 단위 테스트 — node scripts/salesCore.test.mjs
import * as S from "../src/salesCore.js";
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass += 1; console.log(`  ✓ ${name}`); } catch (e) { fail += 1; console.log(`  ✗ ${name}\n    ${e.message}`); } };
const eq = (a, b, m = "") => { if (a !== b) throw new Error(`${m} 기대 ${b} / 실제 ${a}`); };
const ym = "2026-11";
const paid = { 정산상태: { [ym]: "정산완료" } };
const orders = [
  { 거래처명: "A", 상차일: `${ym}-03`, 청구운임: "4,000,000", 기사운임: "3,000,000" },
  { 거래처명: "A", 상차일: `${ym}-04`, 청구운임: 1000000, 기사운임: 990000 },              // 마진 1% — 제외
  { 거래처명: "B", 상차일: `${ym}-05`, 청구운임: 30000000, 기사운임: 24000000, ...paid },
  { 거래처명: "C", 상차일: `${ym}-05`, 청구운임: 5000000, 기사운임: 1000000 },               // 다른 담당
  { 거래처명: "B", 상차일: "2023-12-30", 청구운임: 9000000, 기사운임: 1000000 },             // 다른 달
];
const accounts = [{ client: "A", uid: "u1", name: "김", since: `${ym}-01` }, { client: "B", uid: "u1", name: "김", since: "2024-01-01" }, { client: "C", uid: "u2", name: "박", since: "2024-01-01" }];
const P = S.DEFAULT_POLICY;

t("구간 누진 — 걸친 금액만 그 구간 요율", () => { eq(S.tierAmount(S.normPolicy(P), 7000000), 5000000 * 0.08 + 2000000 * 0.11); eq(S.tierAmount(S.normPolicy(P), 0), 0); });
t("다음 구간까지 남은 금액", () => { const n = S.nextTier(S.normPolicy(P), 7000000); eq(n.need, 3000000); eq(n.rate, 14); eq(S.nextTier(S.normPolicy(P), 99000000), null); });
t("내 거래처 · 그 달 오더만 · 저마진 제외", () => { const r = S.calcIncentive({ orders, accounts, uid: "u1", ym }); eq(r.sale, 35000000); eq(r.base, 7000000); eq(r.excluded.n, 1); eq(r.n, 3); });
t("신규 가산(+3%p) · 수금 완료분만 확정", () => {
  const r = S.calcIncentive({ orders, accounts, uid: "u1", ym });
  const a = r.rows.find((x) => x.client === "A"), b = r.rows.find((x) => x.client === "B");
  eq(a.isNew, true); eq(b.isNew, false); eq(b.collected, true); eq(a.collected, false);
  eq(b.amount, Math.round(6000000 * (620000 / 7000000))); eq(a.amount, Math.round(1000000 * (620000 / 7000000 + 0.03)));
  eq(r.confirmed, b.amount); eq(r.held, a.amount); eq(r.total, a.amount + b.amount);
});
t("목표 초과 가속 ×1.2", () => { const base = S.calcIncentive({ orders, accounts, uid: "u1", ym }); const r = S.calcIncentive({ orders, accounts, uid: "u1", ym, target: 30000000 }); eq(r.accel, 1.2); eq(r.total, base.rows.reduce((s, x) => s + Math.round(((x.base * x.rate) / 100) * 1.2), 0)); eq(S.calcIncentive({ orders, accounts, uid: "u1", ym, target: 90000000 }).accel, 1); });
t("수주일 전 오더는 실적 아님", () => { const r = S.calcIncentive({ orders, accounts: [{ client: "B", uid: "u1", since: `${ym}-10` }], uid: "u1", ym }); eq(r.sale, 0); eq(r.total, 0); });
t("매출 기준 · 단일 요율 · 월 상한 · 전액 확정", () => { const r = S.calcIncentive({ orders, accounts, uid: "u1", ym, policy: { base: "revenue", useTiers: false, rate: 1, newBonus: 0, minMargin: 0, collectOnly: false, cap: 200000 } }); eq(r.base, 35000000); eq(r.capped, true); eq(r.confirmed, r.total); if (Math.abs(r.total - 200000) > 2) throw new Error(`상한 ${r.total}`); });
t("거래처 상태 — 담당·미수", () => { const h = S.clientHealth({ orders, accounts, clients: [{ 거래처명: "D" }], ym, today: `${ym}-10` }); eq(h.find((x) => x.client === "C").rep, "박"); eq(h.find((x) => x.client === "D").state, "none"); eq(h.find((x) => x.client === "A").uid, "u1"); });
t("파이프라인 — 확률 가중 · 지난 일정", () => { const p = S.pipelineSummary([{ stage: "quote", monthlyRevenue: 10000000, nextDate: "2026-11-01" }, { stage: "nego", monthlyRevenue: 4000000, prob: 50 }, { stage: "won", wonAt: "2026-11-02" }, { stage: "lost" }], "2026-11-10"); eq(p.open, 2); eq(p.weighted, 7000000); eq(p.overdue, 1); eq(p.winRate, 50); eq(p.wonMonth, 1); });
// 시뮬레이터 증가분 = 구간 95만 + 기존 신규 가산 3만 + 새 거래처 가산 9만 − 지금 65만
t("수주 시뮬레이터 — 저마진은 대상 아님", () => { const cur = S.calcIncentive({ orders, accounts, uid: "u1", ym }); eq(S.simulateWin({ current: cur, monthlyRevenue: 10000000, marginRate: 1 }).blocked, true); const g = S.simulateWin({ current: cur, monthlyRevenue: 20000000, marginRate: 15 }); eq(g.add, 3000000); eq(g.gain, (950000 + 30000 + 90000) - (620000 + 30000)); });
t("영업 관리 권한", () => { eq(S.canManageSales({ role: "salesMgr" }), true); eq(S.canManageSales({ role: "salesStaff" }), false); eq(S.canManageSales({ role: "user", isMaster: true }), true); eq(S.isSalesUser({ team: "영업팀", role: "user" }), true); });
console.log(`\n영업 인센티브 계산 테스트 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
