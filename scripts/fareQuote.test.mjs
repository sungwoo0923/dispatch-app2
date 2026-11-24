// 운임조회 › 운임 산출 테스트 — node scripts/fareQuote.test.mjs
import assert from "node:assert/strict";
import { findRate, rateTons, historyStats, quoteFare, arrivalDates, quoteText } from "../src/fareQuoteCore.js";
import { parsePresetDoc, presetDocData } from "../functions/routePresetCore.mjs";

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (c, m) => { assert.ok(c, m); n += 1; };

const sheets = [
  { baseName: "에이제이", columns: [{ id: "c5", label: "5톤" }, { id: "c11", label: "11톤" }], rows: [
    { name: "에브리데이 시화", prices: { c5: "150,000", c11: "191,000" }, buyPrices: { c11: "180,000" } },
    { name: "트레이더스 칠곡", prices: { c11: "330,000" } },
  ] },
  { baseName: "다른거래처", columns: [{ id: "x", label: "11톤" }], rows: [{ name: "에브리데이 시화", prices: { x: "999,000" } }] },
];
const P = (d) => parsePresetDoc(presetDocData(d), "p");
const presets = [
  P({ 거래처명: "에이제이", 하차지명: "에브리데이 시화", items: [{ 종류: "지게차", 금액: 50000, 부담: "청구" }] }),
  P({ 거래처명: "에이제이", 상차지명: "에이제이", items: [
    { 종류: "할증", 이름: "야상", 금액: 20000, 받는사람: "없음", 부담: "청구", 조건: "야간" },
    { 종류: "경유", 금액: 30000, 단위: "개소", 받는사람: "기사", 부담: "청구" },
  ] }),
];

// 단가표
eq(findRate(sheets, { 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "에브리데이시화", 톤수: "11톤" })?.sale, 191000, "기준지가 맞는 단가표 먼저");
ok(findRate(sheets, { 거래처명: "모름", 하차지명: "에브리데이 시화", 톤수: "11톤" })?.ambiguous, "기준지가 안 맞고 금액이 다르면 직접 확인");
eq(findRate(sheets, { 거래처명: "에이제이", 하차지명: "에브리데이 시화", 톤수: "11" })?.buy, 180000, "톤 글자 없어도");
eq(rateTons(sheets), ["5톤", "11톤"], "톤급 목록");

// 날짜
eq(arrivalDates("월착", "2026-11-24"), { 상차일: "2026-11-27", 하차일: "2026-11-30", 상차시간: "" }, "월착 = 금 → 월");
eq(arrivalDates("야상", "2026-11-24").상차시간, "20:00", "야상 = 저녁 상차");

// 산출: 야상 + 대행료(지게차 청구)
const q = { 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "에브리데이 시화", 톤수: "11톤", 도착: "야상", 경유: 0 };
const r = quoteFare({ q, sheets, presets, today: "2026-11-24" });
eq([r.total.sale, r.total.driver, r.total.external, r.total.profit], [261000, 180000, 50000, 31000], "261,000 / 180,000 / 대행료 50,000 / 이익 31,000");
eq(r.lines.map((l) => [l.name, l.sale, l.pay]), [["기본 운임", 191000, 180000], ["지게차 대행료", 50000, 50000], ["야상", 20000, 0]], "산출 내역");
ok(quoteText(q, r).includes("청구운임 합계 261,000원"), "견적서 문구");

// 당착 + 경유 2곳
const r2 = quoteFare({ q: { ...q, 도착: "당착", 경유: 2 }, sheets, presets, today: "2026-11-24" });
eq([r2.total.sale, r2.total.driver], [191000 + 50000 + 60000, 180000 + 60000], "경유 2곳 × 30,000 (청구 · 기사 동일)");

// 실거래(단가표 없을 때 최빈값)
const orders = [
  ...[175000, 180000, 180000, 185000].map((b, i) => ({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "네이코", 차량톤수: "11톤", 상차일: `2026-11-1${i}`, 청구운임: "255000", 기사운임: String(b) })),
  { 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "네이코", 차량톤수: "11톤", 상차일: "2026-11-15", 청구운임: "275000", 기사운임: "250000", 특수청구추가: 20000, 배차상태: "취소" },
];
const h = historyStats(orders, { 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "네이코", 톤수: "11톤" });
eq([h.count, h.sale.mode, h.buy.mode, h.buy.avg, h.recent[0].date], [4, 255000, 180000, 180000, "11/13"], "취소 제외 · 최빈값 · 최근 순");
const r3 = quoteFare({ q: { ...q, 하차지명: "네이코", 도착: "당착" }, sheets, presets, hist: h, today: "2026-11-24" });
eq([r3.base.src, r3.total.sale, r3.total.driver], ["history", 255000, 180000], "단가표 없으면 실거래 최빈값");

console.log(`fareQuote OK (${n})`);
