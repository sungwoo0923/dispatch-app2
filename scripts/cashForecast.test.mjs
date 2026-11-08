// 📈 2026-11-08 자금 예측·운영 가능 개월수 단위 테스트
//  실행: node scripts/cashForecast.test.mjs
import assert from "node:assert/strict";
import { cashForecast, runRates, lastPayroll, addMonths } from "../src/cashForecast.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const TODAY = "2026-11-08";
const recurring = [{ id: "rent", type: "지출", amount: 1000000, active: true }, { id: "park", type: "수입", amount: 200000, active: true }, { id: "off", type: "지출", amount: 999999, active: false }];
// 8~10월: 매달 수금 10,000,000 · 기사운임 6,000,000 · 기타 1,000,000 · 임대료(고정) 1,000,000 · 급여 3,000,000
const ledger = ["2026-08", "2026-09", "2026-10"].flatMap((m) => [
  { date: `${m}-05`, type: "수입", auto: "collect", amount: 10000000 },
  { date: `${m}-10`, type: "지출", auto: "drvpay", amount: 6000000 },
  { date: `${m}-12`, type: "지출", account: "소모품비", amount: 1000000 },
  { date: `${m}-25`, type: "지출", account: "지급임차료", amount: 1000000, recurId: "rent" },
  { date: `${m}-25`, type: "수입", account: "기타수입", amount: 200000, recurId: "park" },
  { date: `${m}-28`, type: "지출", auto: "payroll", amount: 3000000 },
]);

t("addMonths — 연도 넘김", () => {
  assert.equal(addMonths("2026-11", 2), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

t("평소 흐름 — 고정비·급여 줄은 변동에서 빼고 3개월 평균", () => {
  const rr = runRates(ledger, recurring, "2026-11");
  assert.deepEqual(rr.months, ["2026-08", "2026-09", "2026-10"]);
  assert.equal(rr.varOut, 7000000); // 기사운임 6백만 + 소모품 1백만
  assert.equal(rr.drvOut, 6000000);
  assert.equal(rr.varIn, 10000000);
  assert.equal(lastPayroll(ledger), 3000000);
});

t("적자 흐름(월 −80만) — 잔고 5백만은 2027-03에 바닥, 약 4.4개월 · 보수적은 더 빨리", () => {
  const f = cashForecast({ cash: 5000000, ledger, recurring, today: TODAY, receivable: 4000000 });
  assert.equal(f.fixedOut, 4000000); // 임대료 1백만 + 급여 3백만(꺼진 고정비 제외)
  assert.equal(f.fixedIn, 200000);
  // 다음 달부터 매달 +10,000,000 +200,000 −4,000,000 −7,000,000 = −800,000
  assert.equal(f.base.rows[1].net, -800000);
  assert.deepEqual(f.base.rows.slice(0, 5).map((r) => r.balance), [2700000, 1900000, 1100000, 300000, -500000]);
  assert.equal(f.base.runOutMonth, "2027-03");
  assert.equal(f.base.monthsLeft, 4.4);
  // 보수적: 매출 없음 → 월 지출 = 고정 4,000,000 + 기사 외 변동 1,000,000
  assert.equal(f.monthlyBurn, 5000000);
  assert.equal(f.simpleRunway, 1);
  assert.ok(f.conservative.monthsLeft < f.base.monthsLeft);
});

t("흑자 흐름 — 12개월 안에 바닥나지 않으면 null", () => {
  const rich = ledger.map((r) => (r.auto === "collect" ? { ...r, amount: 12000000 } : r));
  const f = cashForecast({ cash: 5000000, ledger: rich, recurring, today: TODAY });
  assert.equal(f.base.rows[1].net, 1200000);
  assert.equal(f.base.runOutMonth, null);
  assert.equal(f.base.monthsLeft, null);
});

t("기본 시나리오 적자 흐름 — 잔고가 처음 음수가 되는 달과 개월수", () => {
  const f = cashForecast({ cash: 2000000, ledger, recurring, today: TODAY });
  // 이번 달(11월): 고정비 남은 것 1,000,000 + 급여 3,000,000 + 변동 절반 3,500,000 − (정기수입 200,000 + 수금 절반 5,000,000) = −2,300,000 → 바로 음수
  assert.equal(f.base.rows[0].balance, 2000000 - 2300000);
  assert.equal(f.base.runOutMonth, "2026-11");
  assert.ok(f.base.monthsLeft >= 0 && f.base.monthsLeft < 1);
});

t("이번 달 이미 장부에 들어간 고정비·급여는 다시 빼지 않음", () => {
  const withThis = [...ledger, { date: "2026-11-03", type: "지출", recurId: "rent", amount: 1000000 }, { date: "2026-11-05", type: "지출", auto: "payroll", amount: 3000000 }];
  const f = cashForecast({ cash: 10000000, ledger: withThis, recurring, today: TODAY });
  const g = cashForecast({ cash: 10000000, ledger, recurring, today: TODAY });
  assert.equal(f.base.rows[0].balance - g.base.rows[0].balance, 4000000);
});

t("지급 대기 결재는 이번 달, 예정 항목은 그 달에 반영", () => {
  const base = cashForecast({ cash: 100000000, ledger, recurring, today: TODAY });
  const f = cashForecast({ cash: 100000000, ledger, recurring, today: TODAY, unpaidApprovals: [{ amount: 500000 }, { amount: 300000 }], planned: [{ date: "2027-02-10", type: "지출", amount: 20000000 }, { date: "2026-12-01", type: "수입", amount: 1000000 }] });
  assert.equal(f.pending, 800000);
  assert.equal(base.base.rows[0].balance - f.base.rows[0].balance, 800000);
  assert.equal(f.base.rows[1].balance - base.base.rows[1].balance, -800000 + 1000000);
  const feb = f.base.rows.findIndex((r) => r.m === "2027-02");
  assert.equal(f.base.rows[feb].balance - base.base.rows[feb].balance, -800000 + 1000000 - 20000000);
});

t("장부가 비어 있으면 0으로 계산(오류 없음)", () => {
  const f = cashForecast({ cash: 1000000, today: TODAY });
  assert.equal(f.base.runOutMonth, null);
  assert.equal(f.simpleRunway, null);
  assert.equal(f.base.rows.length, 12);
});

t("장부 기록이 없으면 기본 시나리오도 미수금을 다음 두 달에 회수(보수적보다 잔고가 적게 나오지 않음)", () => {
  const f = cashForecast({ cash: 0, today: TODAY, receivable: 1000000 });
  assert.equal(f.base.rows[1].balance, 500000);
  assert.equal(f.base.rows[2].balance, 1000000);
  assert.ok(f.base.rows.every((r, i) => r.balance >= f.conservative.rows[i].balance));
});

console.log(`cashForecast: ${n}개 통과`);
