// 💰 2026-11-26 요금 손해 검사 — node scripts/pricing.test.mjs
//  · 팝빌 사용료 판매 단가가 원가(추정) 대비 30% 이상 남는지
//  · 서버 기본 단가(functions/smsSend.js DEFAULT_PRICE)가 pricingCore 와 같은지
//  · 요금제(planCore PLAN_DEFAULTS)가 지원 · 서버 원가를 빼고 30% 이상 남는지
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { USAGE_PRICE, POPBILL_COST, MIN_MARGIN, priceCheck, expectedCost, safePrice, usageBill, planCostOf } from "../functions/pricingCore.mjs";
import { PLAN_DEFAULTS } from "../src/planCore.js";

const require = createRequire(import.meta.url);
let fail = 0;
const t = (name, fn) => { try { fn(); console.log("✓", name); } catch (e) { fail++; console.error("✗", name, "\n ", e.message); } };

t("사용료 단가가 모두 원가 대비 30% 이상", () => {
  for (const c of priceCheck(USAGE_PRICE)) assert.ok(c.ok, `${c.label} ${c.price}원 · 원가 ${c.cost}원 · 남는 돈 ${Math.round(c.margin * 100)}% (최소 ${c.min}원)`);
});
t("알림톡 원가에 대체 문자 발송이 섞인다", () => {
  const e = expectedCost("alimtalk");
  assert.ok(e > POPBILL_COST.alimtalk && e < POPBILL_COST.lms);
  assert.equal(Math.round(expectedCost("alimtalk", { alimtalkFallbackRate: 1 })), POPBILL_COST.lms);
});
t("손해 검사가 싼 단가를 잡아낸다", () => {
  const c = priceCheck({ alimtalk: 15, sms: 18 });
  assert.equal(c.find((x) => x.key === "alimtalk").ok, false); // 예전 단가 15원은 기준 미달
  assert.equal(c.find((x) => x.key === "sms").loss, true);    // 원가 20원보다 싸면 팔수록 손해
  assert.ok(safePrice("sms") >= 30 - 1e-9);
});
t("서버 기본 단가 = pricingCore", () => {
  const { DEFAULT_PRICE } = require("../functions/smsSend.js");
  for (const k of ["sms", "lms", "alimtalk"]) assert.equal(DEFAULT_PRICE[k], USAGE_PRICE[k], k);
});
t("월 사용료 계산(계좌조회 포함)", () => {
  const b = usageBill({ sms: 100, lms: 10, alimtalk: 200, bankAccount: 2 });
  assert.equal(b.amount, 100 * USAGE_PRICE.sms + 10 * USAGE_PRICE.lms + 200 * USAGE_PRICE.alimtalk + 2 * USAGE_PRICE.bankAccount);
  assert.ok(b.profit > 0);
});
t("요금제가 모두 원가 대비 30% 이상 남는다", () => {
  for (const p of PLAN_DEFAULTS) {
    const c = planCostOf(p.id, p.price);
    assert.ok(c.margin >= MIN_MARGIN, `${p.name} ${p.price}원 · 원가 ${c.total}원 · 남는 돈 ${Math.round(c.margin * 100)}%`);
  }
});
t("요금제 가격이 위로 갈수록 오른다", () => {
  for (let i = 1; i < PLAN_DEFAULTS.length; i++) assert.ok(PLAN_DEFAULTS[i].price > PLAN_DEFAULTS[i - 1].price);
});

if (fail) { console.error(`pricing: ${fail}개 실패`); process.exit(1); }
console.log("pricing: 모두 통과");
