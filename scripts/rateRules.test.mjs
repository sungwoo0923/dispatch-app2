// 단가표 › 청구 규칙 [쉬운 규칙] — 겹친 규칙 찾기 · 정리한 뒤 계산(에이제이 에브리데이/트레이더스 시화)
import assert from "node:assert/strict";
import { simpleRulesOf, NIGHT_ITEM, AGENCY_ITEM } from "../src/rateRulesCore.js";
import { parsePresetDoc, presetDocData } from "../functions/routePresetCore.mjs";
import { applyRoutePresets } from "../src/routePresetApply.js";
const P = (p, id) => parsePresetDoc(presetDocData(p), id || `${p.상차지명 || "_"}|${p.하차지명 || "_"}|${p.거래처명}`);
const order = (drop, night) => ({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: drop, 상차일: "2026-11-26", 하차일: night ? "2026-11-27" : "2026-11-26", 상차시간: night ? "야상" : "09:00", 차량톤수: "5톤", 청구운임: "180000", 기사운임: "170000" });

// ① 사용자가 본 꼬인 상태: 트레이더스 시화(지게차 2만) · 에브리데이 시화(야간할증 5만 · 대행료 3만) · 제이글로벌 거래처 전체 야상 2만
const messy = [
  P({ 거래처명: "에이제이", 하차지명: "트레이더스 시화", items: [{ 종류: "지게차", 금액: 20000, 부담: "청구" }] }),
  P({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "에브리데이 시화", items: [{ 종류: "할증", 이름: "야간할증", 금액: 50000, 부담: "청구", 받는사람: "없음" }, { 종류: "기타", 이름: "대행료", 금액: 30000, 받는사람: "기사", 부담: "청구" }, { 종류: "대기료", 금액: 10000 }] }),
  P({ 거래처명: "제이글로벌", items: [NIGHT_ITEM(20000)] }),
];
const sr = simpleRulesOf(messy, "에이제이");
assert.equal(sr.night, 20000);
assert.equal(sr.nightMessy, false);
assert.equal(sr.drops.length, 1, "트레이더스 시화 = 에브리데이 시화 → 한 줄");
assert.equal(sr.drops[0].clean, false);
assert.deepEqual(sr.drops[0].owned.map((x) => x.금액).sort(), [20000, 30000, 50000]);
assert.deepEqual(sr.drops[0].other.map((x) => x.종류), ["대기료"], "쉬운 규칙이 아닌 것(대기료)은 그대로 둔다");

// ② 정리한 뒤(쉬운 규칙): 거래처 전체 야상 2만 + 시화 대행료 5만(기사에게도)
const clean = [P({ 거래처명: "에이제이", items: [NIGHT_ITEM(20000)] }), P({ 거래처명: "에이제이", 하차지명: "트레이더스 시화", items: [AGENCY_ITEM(50000)] })];
const s2 = simpleRulesOf(clean, "에이제이");
assert.deepEqual([s2.night, s2.drops[0].clean, s2.drops[0].amount], [20000, true, 50000]);
for (const drop of ["에브리데이 시화", "트레이더스 시화"]) {
  const n = applyRoutePresets(order(drop, true), clean);
  assert.deepEqual([n.청구운임, n.기사운임, n.수수료], ["250000", "220000", "30000"], `${drop} 야상: 청구 18만+2만+5만 · 기사 17만+5만 · 수수료 3만`);
  const d = applyRoutePresets(order(drop, false), clean);
  assert.deepEqual([d.청구운임, d.기사운임], ["230000", "220000"], `${drop} 낮: 대행료만`);
}
// 다른 하차지는 야상만
const o = applyRoutePresets(order("쿠팡 평택", true), clean);
assert.deepEqual([o.청구운임, o.기사운임], ["200000", "170000"]);
console.log("rateRules: 모두 통과");
