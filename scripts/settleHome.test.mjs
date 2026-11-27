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
// 🔗 2026-11-25 기사 지급 = 용차지급관리와 같은 오더 — 지입차(기사관리 등급) · 배차완료 전 오더는 세지 않는다(매입 합계는 그대로)
{
  const { fleetPlateSet } = await import("../src/settleCore.js");
  const fp = fleetPlateSet([{ 등급: "지입", 차량번호: "12가 3456" }, { 등급: "일반", 차량번호: "99나9999" }], (g) => g === "지입");
  const more = [...orders, o({ _id: "8", 차량번호: "12가-3456", 기사운임: "500000" }), o({ _id: "9", 배차상태: "배차중", 청구운임: "0", 기사운임: "30000" })];
  const F = summarizeSettle(more, "2026-11", stageFinder(stmts), "2026-11-14", { fleetPlates: fp });
  const p = F.steps.find((s) => s.key === "payout");
  assert.deepEqual([p.total, p.left, p.amount], [4, 3, 270000], "지입차 · 배차중 오더는 기사 지급에서 빠진다");
  // 📏 2026-11-27 매입 · 매출은 매출 규칙(배차완료 + 고정거래처)만 — 배차중 오더 기사운임은 빠진다(운송 HOME · 매출관리와 같게)
  assert.equal(F.drv, 350000 + 500000, "매입(기사운임 합) = 배차완료 오더만");
  assert.equal(F.pendingSale, 0, "청구운임 0 인 배차중 오더는 진행 중 청구에도 없다");
  const G = summarizeSettle([...orders, o({ _id: "10", 배차상태: "배차중", 청구운임: "70000" })], "2026-11", stageFinder(stmts), "2026-11-14", { fixedRows: [{ 날짜: "2026-11-03", 거래처명: "고정", 청구운임: "100000", 기사운임: "60000" }, { 날짜: "2026-10-03", 거래처명: "고정", 청구운임: "5" }] });
  assert.deepEqual([G.sale, G.pendingSale, G.profit], [450000 + 100000, 70000, 100000 + 40000], "고정거래처는 매출에 · 배차중은 진행 중 청구로");
}
const ag = Object.fromEntries(S.aging.map((a) => [a.client, a]));
assert.equal(ag.가나상사.over, 300000); assert.equal(ag.가나상사.d30, 200000); assert.ok(!ag.마바 && !ag.다라물산);
const L = clientLedger(orders, "가나상사", stageFinder(stmts));
assert.deepEqual(L.map((x) => [x.ym, x.sale, x.balance]), [["2026-07", 300000, 300000], ["2026-11", 200000, 500000]]);
// 🛠 2026-11-27 정산완료(미수금관리 · 은행 자동 매칭)한 달은 명세서가 마감 전이어도 받은 것으로 본다
{
  const sx = [{ _id: "s1", 거래처명: "사아", 배차상태: "배차완료", 상차일: "2026-11-03", 청구운임: "1000000", 정산상태: { "2026-11": "정산완료" }, 정산일: { "2026-11": "2026-11-25" } }];
  const X = summarizeSettle(sx, "2026-11", () => "계산서발행", "2026-11-26");
  const d = X.steps.find((s) => s.key === "deposit");
  assert.deepEqual([d.left, d.amount, X.aging.length], [0, 0, 0], "정산완료한 달은 미입금 · 미수 경과에서 빠진다");
  assert.equal(clientLedger(sx, "사아", () => "계산서발행")[0].balance, 0);
}
console.log("settleHome OK");
