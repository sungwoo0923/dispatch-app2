// 실제 결제 내역(운영 비용) 계산 확인 — node scripts/costLedger.test.mjs
//  src/costModel.js 의 ledgerMonth · applyLedger · paymentMonthKrw · cleanPayment
import { mergeCost, fixedCosts, variableCosts, ledgerMonth, applyLedger, paymentMonthKrw, paymentTarget, cleanPayment, PAY_PRESETS } from "../src/costModel.js";

let fails = 0;
const ok = (c, n) => { if (c) console.log("✓", n); else { fails++; console.error("✗", n); } };
const near = (a, b) => Math.abs(a - b) < 0.01;

const m = mergeCost({
  fx: 1400, usdTaxPct: 10, claude: "pro",
  payments: [
    { id: "a", date: "2026-11-18", vendor: "Google AI Studio", item: "Gemini API 충전", amount: 8000, currency: "KRW", kind: "prepaid", group: "AI (Gemini API)", replaces: "" },
    { id: "b", date: "2026-11-05", vendor: "Anthropic", item: "Claude Max 업그레이드", amount: 100, currency: "USD", kind: "monthly", group: "개발 도구", replaces: "claude" },
    { id: "c", date: "2026-03-10", vendor: "가비아", item: "도메인", amount: 24000, currency: "KRW", kind: "yearly", group: "호스팅" }, // replaces 없음 → 이름으로 짐작
    { id: "d", date: "2026-10-20", endDate: "2026-11-30", vendor: "Canva", item: "Canva Pro", amount: 14000, currency: "KRW", kind: "monthly", group: "디자인 도구", replaces: "" },
    { id: "e", date: "2026-12-02", vendor: "Google Cloud", item: "11월 청구", amount: 52000, currency: "KRW", kind: "once", group: "Google Cloud", replaces: "server" },
  ],
});
const usd = (x) => x * 1400 * 1.1;

// 달별 금액
ok(paymentMonthKrw(m, m.payments[0], "2026-11") === 8000, "충전(prepaid)은 결제한 달에 전액");
ok(paymentMonthKrw(m, m.payments[0], "2026-12") === 0, "충전은 다음 달에는 0");
ok(near(paymentMonthKrw(m, m.payments[1], "2026-11"), usd(100)), "USD 는 환율 × (1+가산%)로 환산");
ok(near(paymentMonthKrw(m, m.payments[1], "2027-02"), usd(100)), "매달은 다음 달에도 계속");
ok(paymentMonthKrw(m, m.payments[1], "2026-10") === 0, "매달은 시작 전 달에는 0");
ok(paymentMonthKrw(m, m.payments[2], "2026-11") === 2000, "매년은 12로 나눠 매달");
ok(paymentMonthKrw(m, m.payments[3], "2026-12") === 0, "끝나는 날(endDate) 다음 달은 0");
ok(paymentMonthKrw(m, m.payments[3], "2026-11") === 14000, "끝나는 달까지는 포함");

// 짐작
ok(paymentTarget({ vendor: "가비아", item: "도메인" }) === "domain", "이름으로 도메인 짐작");
ok(paymentTarget({ vendor: "Anthropic", item: "API 크레딧", kind: "prepaid" }) === "aiApi", "Claude API 충전은 API 사용량 대신");
ok(paymentTarget({ vendor: "Anthropic", item: "Claude Max", kind: "monthly" }) === "claude", "Claude 구독은 요금제 대신");
ok(paymentTarget({ vendor: "Google AI Studio", item: "Gemini", replaces: "" }) === "", "Gemini 는 따로 더하기");

// 11월 — Claude 줄 대체 · 도메인 줄 대체 · Gemini · Canva 추가
const L = ledgerMonth(m, "2026-11", { day: 18 });
const expect = 8000 + usd(100) + 2000 + 14000;
ok(near(L.total, expect), `11월 실제 결제 합계 ${Math.round(L.total)} = ${Math.round(expect)}`);
ok(near(L.mtd, expect - 14000), "18일 기준 지금까지 — 18일 충전 포함 · 20일 결제(Canva)는 아직");
ok(near(ledgerMonth(m, "2026-11", { day: 17 }).mtd, expect - 14000 - 8000), "17일 기준이면 18일 충전도 아직 빠짐");
ok(L.replaced.has("claude") && L.replaced.has("domain") && !L.replaced.has("vercel"), "Claude · 도메인 예상만 대체");
const F0 = fixedCosts(m), F = applyLedger(F0, L);
const claudeRow = F.rows.find((r) => r.key === "claude");
ok(claudeRow.krw === 0 && claudeRow.replaced && near(claudeRow.modelKrw, usd(20)), "Claude 예상 줄은 0원 · 원래 예상은 modelKrw");
ok(near(F0.total - F.total, usd(20) + 25000 / 12), "고정비에서 대체된 만큼만 빠짐(이중 계산 없음)");
ok(near(L.recurringFixed, usd(100) + 2000 + 14000), "손익분기용 매달 반복 몫(충전 제외)");

// 12월 — 구글 클라우드 청구가 서버 예상 대신
const L12 = ledgerMonth(m, "2026-12");
const V = variableCosts(m, [{ reads: 900000, writes: 90000, deletes: 0 }], { billDays: 1 });
const V12 = applyLedger(V, L12);
ok(V.total > 0 && V12.total === 0, "서버 예상 줄이 구글 클라우드 청구로 대체");
ok(near(L12.total, usd(100) + 2000 + 52000), "12월 합계(Claude 매달 + 도메인 ÷12 + 구글 청구, Canva 끝남)");

// Google Play — 1회 등록비는 결제를 적은 달부터 나눠 반영 안 함
const mp = mergeCost({ payments: [{ id: "p", date: "2026-01-04", vendor: "Google Play", item: "개발자 등록", amount: 25, currency: "USD", kind: "once", replaces: "play" }] });
ok(ledgerMonth(mp, "2026-05").replaced.has("play") && ledgerMonth(mp, "2026-05").total === 0, "Play 등록비는 낸 뒤로 예상 줄 0 · 금액은 낸 달에만");
ok(!ledgerMonth(mp, "2025-12").replaced.has("play"), "낸 달 전에는 그대로 예상");

// 정리 · 기본값
const c = cleanPayment({ date: "2026-11-18", vendor: " Anthropic ", item: "API 충전", amount: "50", currency: "USD", kind: "prepaid" });
ok(c.id && c.vendor === "Anthropic" && c.amount === 50 && c.replaces === "aiApi", "cleanPayment 가 숫자 · 공백 · 대체 대상을 정리");
ok(Array.isArray(mergeCost(null).payments) && mergeCost(null).payments.length === 0, "저장값이 없으면 결제 내역은 빈 배열");
ok(PAY_PRESETS.length >= 10 && PAY_PRESETS.every((p) => !("amount" in p)), "빠른 추가는 금액을 비워 둠");

if (fails) { console.error(`\n${fails}개 실패`); process.exit(1); }
console.log("\n모두 통과");
