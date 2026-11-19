// 💳 2026-11-19 부분 지급 · 계좌 자리수 테스트 — node scripts/approvalPartial.test.mjs
import assert from "node:assert/strict";
import { formatAccount, accountMaxLen, accountPattern, validateAccount } from "../src/bankUtil.js";

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };

// approvalPay 는 firebase 를 불러오므로 같은 규칙을 그대로 옮겨 검사(식이 바뀌면 여기도 같이)
const isPayDoc = (d) => d?.cat === "expense" && d?.form !== "card" && Number(d?.amount) > 0;
const payState = (d) => (!isPayDoc(d) || d.status !== "approved" ? null : d.paid?.at ? "paid" : "wait");
function payLinesInfo(d) {
  const n = Array.isArray(d?.data?.lines) ? d.data.lines.length : 0;
  const pl = d?.paidLines && typeof d.paidLines === "object" ? d.paidLines : {};
  const done = d?.paid?.at ? n : Object.keys(pl).filter((k) => pl[k] && Number(k) < n).length;
  return { n, done };
}
const payPhase = (d) => { const st = payState(d); if (st !== "wait") return st; const p = payLinesInfo(d); return p.n >= 2 && p.done > 0 ? "partial" : "wait"; };

await t("소스의 식과 테스트 식이 같은지", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/approvalPay.js", import.meta.url), "utf8");
  assert.ok(src.includes('return p.n >= 2 && p.done > 0 ? "partial" : "wait";'));
  assert.ok(src.includes("const done = d?.paid?.at ? n : Object.keys(pl).filter((k) => pl[k] && Number(k) < n).length;"));
});

const base = { cat: "expense", form: "spend", status: "approved", amount: 726000, data: { lines: [{ total: 550000 }, { total: 66000 }, { total: 110000 }] } };
await t("3줄 중 1줄 지급 → 부분 지급", async () => {
  assert.equal(payPhase(base), "wait");
  assert.equal(payPhase({ ...base, paidLines: { 1: { at: 1 } } }), "partial");
  assert.deepEqual(payLinesInfo({ ...base, paidLines: { 1: { at: 1 } } }), { n: 3, done: 1 });
});
await t("나머지까지 지급(paid) → 지급완료", async () => {
  assert.equal(payPhase({ ...base, paidLines: { 0: { at: 1 }, 1: { at: 1 }, 2: { at: 1 } }, paid: { at: 2 } }), "paid");
  assert.equal(payLinesInfo({ ...base, paid: { at: 2 } }).done, 3);
});
await t("지운 줄(null)은 지급으로 안 셈 · 한 줄 문서는 부분 지급 없음", async () => {
  assert.equal(payPhase({ ...base, paidLines: { 1: null } }), "wait");
  assert.equal(payPhase({ ...base, data: { lines: [{ total: 1 }] }, paidLines: { 0: { at: 1 } } }), "wait");
});

await t("계좌 자리수 — 신한 12자리에서 더 안 들어감", async () => {
  assert.equal(accountMaxLen("신한"), 12);
  assert.equal(formatAccount("신한", "1103354841519999"), "110-335-484151");
  assert.equal(accountPattern("신한"), "000-000-000000");
  assert.equal(formatAccount("카카오뱅크", "33330123456789"), "3333-01-2345678");
  assert.equal(accountMaxLen("기타"), 16);
  assert.equal(validateAccount("신한", "110335484151", "홍길동").level, "ok");
});

console.log(`\n부분 지급 · 계좌 테스트 ${n}개 통과`);
