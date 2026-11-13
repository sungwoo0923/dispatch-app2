// 정산 홈 계산 테스트 — node scripts/settleHome.test.mjs
import assert from "node:assert/strict";
import { summarizeSettle, clientLedger, stageFinder } from "../src/settleCore.js";
const o = (p) => ({ 상차일: "2026-11-05", 거래처명: "가나상사", 청구운임: "100000", 기사운임: "80000", 배차상태: "배차완료", ...p });
const orders = [o({ _id: "1" }), o({ _id: "2", 지급상태: "지급완료" }), o({ _id: "3", 거래처명: "다라물산", 청구운임: "200000", 기사운임: "150000", 입금상태: "입금완료" }),
  o({ _id: "4", 거래처명: "다라물산", 청구운임: "0", 기사운임: "0", 배차상태: "배차중" }), o({ _id: "5", 상차일: "2026-07-01", 거래처명: "가나상사", 청구운임: "300000" }),
  o({ _id: "6", 배차상태: "배차취소", 청구운임: "999999" }), o({ _id: "7", 상차일: "2026-10-31", 마감월: "2026-11", 거래처명: "마바", 청구운임: "50000", 기사운임: "40000" })];
const stmts = new Map([["|가나상사|202611", { client: "가나상사", yyyymm: "202611", stage: "발송" }], ["|마바|202611", { client: "마바", yyyymm: "202611", stage: "마감" }]]);
const S = summarizeSettle(orders, "2026-11", stageFinder(stmts), "2026-11-14");
const step = (k) => S.steps.find((s) => s.key === k);
assert.equal(S.sale, 450000, "취소 제외 · 마감월 이월 포함"); assert.equal(S.buy, 350000);
assert.deepEqual([step("orders").left, step("send").left, step("tax").left, step("close").left], [1, 1, 2, 2], "발송한 곳은 발송 단계 완료 · 마감한 곳은 모두 완료");
assert.deepEqual([step("deposit").left, step("deposit").amount], [1, 200000], "입금완료 · 마감한 거래처는 미수에서 뺀다");
assert.deepEqual([step("payout").left, step("payout").amount], [3, 270000]);
const ag = Object.fromEntries(S.aging.map((a) => [a.client, a]));
assert.equal(ag.가나상사.over, 300000); assert.equal(ag.가나상사.d30, 200000); assert.ok(!ag.마바 && !ag.다라물산);
const L = clientLedger(orders, "가나상사", stageFinder(stmts));
assert.deepEqual(L.map((x) => [x.ym, x.sale, x.balance]), [["2026-07", 300000, 300000], ["2026-11", 200000, 500000]]);
console.log("settleHome OK");
