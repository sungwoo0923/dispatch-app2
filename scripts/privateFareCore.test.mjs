// 🔐 비공개 운임 계산 검사 — node scripts/privateFareCore.test.mjs
import assert from "node:assert/strict";
import { privateOf, privateRows, summarize, monthly, routeSuggestions, ruleAmount, groupBy } from "../src/privateFareCore.js";

let ok = 0;
const t = (name, fn) => { fn(); ok += 1; console.log("✓", name); };
const o = (x) => ({ _id: x.id || Math.random().toString(36).slice(2), 거래처명: "무지개운송", 상차지명: "서울", 하차지명: "부산", 청구운임: "100,000", 상차일: "2026-11-10", 배차상태: "배차완료", ...x });
const rules = [
  { client: "무지개 운송", mode: "add", value: 20000 },
  { client: "무지개운송", from: "서울", to: "부산", mode: "fix", value: 150000 },
  { client: "하늘물류", mode: "rate", value: 125 },
];

t("규칙 계산", () => {
  assert.equal(ruleAmount({ mode: "fix", value: 150000 }, 100000), 150000);
  assert.equal(ruleAmount({ mode: "add", value: 20000 }, 100000), 120000);
  assert.equal(ruleAmount({ mode: "rate", value: 125 }, 400000), 500000);
  assert.equal(ruleAmount({ mode: "add", value: 20000 }, 0), 0);
});
t("노선 규칙이 거래처 규칙보다 먼저(띄어쓰기 무시)", () => {
  const p = privateOf(o({}), rules);
  assert.equal(p.on, true); assert.equal(p.amount, 150000); assert.equal(p.diff, 50000); assert.equal(p.source, "route");
});
t("다른 노선은 거래처 규칙", () => {
  const p = privateOf(o({ 하차지명: "대구" }), rules);
  assert.equal(p.amount, 120000); assert.equal(p.source, "client");
});
t("오더별 직접 입력이 제일 먼저", () => {
  const p = privateOf(o({}), rules, { amount: 170000 });
  assert.equal(p.amount, 170000); assert.equal(p.diff, 70000); assert.equal(p.source, "manual");
});
t("규칙 없는 거래처는 대상 아님", () => {
  assert.equal(privateOf(o({ 거래처명: "다른곳" }), rules).on, false);
});
t("꺼 둔 규칙은 쓰지 않음", () => {
  assert.equal(privateOf(o({}), [{ client: "무지개운송", mode: "fix", value: 1, on: false }]).on, false);
});
t("목록 · 합계 · 취소 제외", () => {
  const list = [o({ id: "a" }), o({ id: "b", 하차지명: "대구" }), o({ id: "c", 배차상태: "배차취소" }), o({ id: "d", 거래처명: "하늘물류", 청구운임: 400000 }), o({ id: "e", 거래처명: "없음" })];
  const rows = privateRows(list, rules, { b: { amount: 130000 } });
  assert.deepEqual(rows.map((r) => r.id).sort(), ["a", "b", "d"]);
  const s = summarize(rows);
  assert.equal(s.base, 600000); assert.equal(s.amount, 780000); assert.equal(s.diff, 180000); assert.equal(s.n, 3);
  const g = groupBy(rows, (r) => r.client);
  assert.equal(g[0].key, "하늘물류"); assert.equal(g[0].diff, 100000);
});
t("월별(최근 n개월)", () => {
  const rows = privateRows([o({ id: "a", 상차일: "2026-10-03" }), o({ id: "b", 상차일: "2026-11-01" }), o({ id: "c", 상차일: "2026-05-01" })], rules);
  const m = monthly(rows, "2026-11", 3);
  assert.deepEqual(m.map((x) => x.ym), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(m[1].diff, 50000); assert.equal(m[2].amount, 150000); assert.equal(m[0].n, 0);
});
t("노선 규칙 제안 — 이미 노선 규칙이 있는 노선은 빼고, 많이 다닌 순", () => {
  const list = [o({}), o({ 하차지명: "대구" }), o({ 하차지명: "대구" }), o({ 하차지명: "광주" })];
  const s = routeSuggestions(list, rules);
  assert.deepEqual(s.map((x) => x.to), ["대구", "광주"]);
  assert.equal(s[0].n, 2); assert.equal(s[0].avg, 100000);
});
console.log(`\nprivateFareCore: ${ok}개 모두 통과`);
