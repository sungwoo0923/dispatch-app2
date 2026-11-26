// ======================= functions/pricingCore.mjs =======================
// 💰 2026-11-26 로지스웹 요금 기준 한 곳 — 팝빌 원가(추정) · 판매 단가 · 손해 검사 · 요금제 원가 검산(순수 함수)
//  · 쓰는 곳: functions/smsSend.js(운송사 화면 예상 청구액) · src/PlatformCenter.jsx(관리센터 › 청구 › 문자 · 알림톡 사용량)
//    · src/SalesQuote.jsx(요금제 관리 · 견적서 · 요금 안내 SALES_DEFAULT) · src/planCore.js(요금표) · scripts/pricing.test.mjs
//  · 방식(추천안): 팝빌은 로지스웹이 한꺼번에 내고(파트너 과금) → 운송사별 사용량 × 판매 단가를 월말에 청구
//  · ⚠ POPBILL_COST 는 팝빌 상용 계약 전 "넉넉하게 잡은 추정 원가"(부가세 별도)다. 계약 단가를 받으면 이 값만 고치면
//    판매 단가가 손해 없는지 테스트(scripts/pricing.test.mjs)와 관리센터 경고가 새 원가로 다시 검사한다.

// 팝빌 원가(추정 · 부가세 별도 · 원) — 건당(usage) / 월 정액(monthly)
export const POPBILL_COST = {
  sms: 20,            // 단문 문자 1건
  lms: 50,            // 장문 문자 1건
  alimtalk: 13,       // 알림톡 1건(접수 성공)
  alimtalkFallbackRate: 0.05, // 알림톡을 못 받는 번호 → 팝빌이 같은 내용을 장문 문자로 대신 보냄(대체 발송 "C"). 사용량엔 알림톡 1건으로 세지만 원가는 장문
  taxInvoice: 200,    // 전자세금계산서 발행 1건
  accountCheck: 50,   // 예금주 조회 1건
  bankAccount: 10000, // 계좌조회(입금 자동 확인) 계좌 1개 · 월
  hometax: 10000,     // 홈택스 매입 · 매출 세금계산서 수집 사업자 1곳 · 월
};

// 판매 단가(원 · 부가세 별도) — 최소 마진 MIN_MARGIN 이상, 건당은 10원 · 월 정액은 1,000원 단위
export const MIN_MARGIN = 0.3; // 판매가의 30% 이상이 남아야 "손해 없음" — 미수 · 결제 수수료 · 대체 발송 늘어남을 버틸 여유
export const USAGE_PRICE = {
  sms: 30,            // 원가 20
  lms: 80,            // 원가 50
  alimtalk: 25,       // 예상 원가 ≈ 14.9(대체 발송 5% 포함) — 문자보다 싸게 보이도록 30 아래
  taxInvoice: 300,    // 원가 200
  accountCheck: 80,   // 원가 50
  bankAccount: 15000, // 원가 10,000/월
  hometax: 15000,     // 원가 10,000/월
};
export const USAGE_LABEL = {
  sms: ["문자(SMS)", "건"], lms: ["장문 문자(LMS)", "건"], alimtalk: ["카카오 알림톡", "건"], taxInvoice: ["전자세금계산서 발행", "건"],
  accountCheck: ["예금주 조회", "건"], bankAccount: ["입금 자동 확인(계좌조회)", "계좌·월"], hometax: ["홈택스 세금계산서 자동 수집", "사업자·월"],
};
export const USAGE_KEYS = Object.keys(USAGE_LABEL);

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// 실제로 나가는 1건(1개) 원가 — 알림톡은 대체 발송(장문) 비율을 섞는다
export function expectedCost(key, cost = POPBILL_COST) {
  const c = { ...POPBILL_COST, ...(cost || {}) };
  if (key === "alimtalk") { const r = Math.min(1, Math.max(0, n(c.alimtalkFallbackRate))); return n(c.alimtalk) * (1 - r) + n(c.lms) * r; }
  return n(c[key]);
}
// 마진율(판매가 대비) — 판매가 0이면 -1
export const marginOf = (price, cost) => (n(price) > 0 ? (n(price) - n(cost)) / n(price) : -1);
// 손해 없는 최저 판매가 — 마진 minMargin 이상이 되도록 올림(건당 10원 · 월 정액 1,000원 단위)
export function safePrice(key, cost = POPBILL_COST, minMargin = MIN_MARGIN) {
  const c = expectedCost(key, cost);
  const step = key === "bankAccount" || key === "hometax" ? 1000 : 10;
  return Math.ceil(c / (1 - minMargin) / step) * step;
}
// 단가 검사 — [{ key, label, unit, price, cost, margin, min, ok, loss }] · loss = 원가보다 싸서 팔수록 손해
export function priceCheck(prices = USAGE_PRICE, cost = POPBILL_COST, minMargin = MIN_MARGIN) {
  return USAGE_KEYS.filter((k) => prices?.[k] !== undefined).map((k) => {
    const price = n(prices[k]); const c = expectedCost(k, cost); const margin = marginOf(price, c);
    return { key: k, label: USAGE_LABEL[k][0], unit: USAGE_LABEL[k][1], price, cost: Math.round(c * 10) / 10, margin, min: safePrice(k, cost, minMargin), ok: margin >= minMargin - 1e-9, loss: price < c };
  });
}
// 운송사 한 곳 한 달 사용료 — counts { sms, lms, alimtalk, taxInvoice, accountCheck, bankAccount, hometax }
export function usageBill(counts = {}, prices = USAGE_PRICE, cost = POPBILL_COST) {
  const lines = USAGE_KEYS.map((k) => ({ key: k, qty: n(counts[k]), price: n(prices?.[k] ?? USAGE_PRICE[k]), cost: expectedCost(k, cost) }))
    .filter((l) => l.qty > 0).map((l) => ({ ...l, amount: l.qty * l.price, costAmount: Math.round(l.qty * l.cost) }));
  const amount = lines.reduce((a, l) => a + l.amount, 0); const costAmount = lines.reduce((a, l) => a + l.costAmount, 0);
  return { lines, amount, costAmount, profit: amount - costAmount };
}

// ─── 요금제 원가 검산 — 운송사 한 곳에 로지스웹이 매달 쓰는 돈(추정) ───
//  infra: 서버 · DB 읽기쓰기 · 사진 저장 · GPS 기록 · AI(오더 스캔 · AI 비서) · 지도 / supportHours: 상담 · 원격 지원 · 점검 시간
//  payFee: 카드 · 이체 수수료 등(요금의 3%) — 실제 사용량은 관리센터 › 플랫폼 사용량에서 보고 고친다
export const PLAN_COST = {
  lite: { infra: 15000, supportHours: 1 },
  basic: { infra: 30000, supportHours: 2 },
  standard: { infra: 60000, supportHours: 3 },   // 지입차 GPS(15대) 기록 · 사진 늘어남
  pro: { infra: 120000, supportHours: 6 },       // 지입차 40대 · 24시콜 전송 · 분기 점검 미팅
};
export const SUPPORT_HOUR_COST = 50000;
export const PAY_FEE_RATE = 0.03;
export function planCostOf(planId, price, cost = PLAN_COST) {
  const c = cost?.[planId] || { infra: 0, supportHours: 0 };
  const total = n(c.infra) + n(c.supportHours) * SUPPORT_HOUR_COST + Math.round(n(price) * PAY_FEE_RATE);
  return { infra: n(c.infra), support: n(c.supportHours) * SUPPORT_HOUR_COST, payFee: Math.round(n(price) * PAY_FEE_RATE), total, profit: n(price) - total, margin: marginOf(price, total) };
}
