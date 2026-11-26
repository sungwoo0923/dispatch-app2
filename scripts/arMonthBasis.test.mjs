// 🗓🔗⚠ 2026-11-25 받을 돈 한 줄 기준 테스트 — node scripts/arMonthBasis.test.mjs
//  ① 청구월 = 마감월(없으면 상차일 달) — 정산 홈 · 청구 현황판 · 월 마감 · 미수금 · 은행 입금 매칭 · 회계 모두 같은 달
//  ② 입금 기록 한 곳(arPayments) — 회계 [입금 처리] · 미수금관리 · 은행 · 예전 회계 합계는 한 번만
//  ③ 입금 기록 → 자금관리 수입 장부 한 줄(입금 한 번 = 한 줄)
//  ④ 명세서 작성 뒤 금액이 바뀌면 알려 주기
import assert from "node:assert/strict";
import * as AR from "../functions/arCore.mjs";
import * as M from "../functions/arMatchCore.mjs";
import * as L from "../functions/arLedgerCore.mjs";
import * as S from "../src/settleCore.js";
import { closeBoard } from "../src/closeFlow.js";

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`✓ ${name}`); };
const O = (id, p) => ({ _id: id, __col: "orders", 거래처명: "가나상사", 상차일: "2026-11-05", 청구운임: "1000000", 배차상태: "배차완료", ...p });
// 이월 오더 — 상차 10/31 · 마감월 2026-11
const carry = O("c1", { 상차일: "2026-10-31", 마감월: "2026-11", 청구운임: "200000" });
const orders = [O("n1"), carry, O("o1", { 상차일: "2026-10-10", 청구운임: "500000" })];

// ── ① 청구월 ──
ok("monthOf 정의는 한 곳(settleCore = arCore)", () => {
  assert.equal(S.monthOf, AR.monthOf);
  assert.equal(AR.monthOf(carry), "2026-11");
  assert.equal(AR.monthOf({ 상차일: "2026-10-31" }), "2026-10");
  assert.equal(AR.monthOf({ 날짜: "2026-09-01" }), "2026-09", "고정거래처 줄(날짜)");
});
ok("정산 홈: 이월 오더는 11월", () => {
  const nov = S.summarizeSettle(orders, "2026-11", () => "미작성", "2026-11-25");
  const oct = S.summarizeSettle(orders, "2026-10", () => "미작성", "2026-11-25");
  assert.equal(nov.sale, 1200000); assert.equal(oct.sale, 500000);
});
ok("청구 현황판 · 월 마감: 이월 오더는 11월", () => {
  const B = S.billingBoard(orders, { from: "2026-11", to: "2026-11" });
  assert.deepEqual(B.items.map((x) => [x.ym, x.amount]), [["2026-11", 1200000]]);
  const cb = closeBoard(orders, "2026-11");
  assert.equal(cb.find((r) => r.client === "가나상사")?.sale ?? cb[0]?.sale, 1200000);
});
ok("미수금(arCore): 청구월 11월 묶음 · 나이는 11/1부터", () => {
  const inv = AR.arInvoicesByClient({ orders, year: "2026" })["가나상사"];
  assert.deepEqual(inv.list.map((x) => [x.d, x.amt]).sort(), [["2026-10-10", 550000], ["2026-11-01", 1320000]]);
  const r = AR.receivablesOf({ orders, paid: {}, today: "2026-11-25", year: "2026" })[0];
  assert.equal(r.billed, 1870000);
});
ok("은행 입금 매칭(arMatchCore — 화면 · 서버 bankSync 같은 식): 이월 오더는 11월 청구", () => {
  const months = M.buildArMonths({ orders });
  assert.deepEqual(months.get("가나상사").map((e) => [e.yyyymm, e.total, e.due]), [["2026-10", 500000, 550000], ["2026-11", 1200000, 1320000]]);
  const p = M.planForClient(months, "가나상사", 1320000);
  assert.deepEqual(p.alloc.map((a) => [a.yyyymm, a.amount, a.full]), [["2026-11", 1320000, true]], "11월분 딱 맞는 입금");
});
ok("예전 정산상태 키(상차월 2026-10)도 이월 오더 11월 정산완료로 본다 · 새 키가 있으면 새 키", () => {
  const old = { ...carry, 정산상태: { "2026-10": "정산완료" }, 정산일: { "2026-10": "2026-11-03" } };
  assert.equal(AR.isSettledIn(old, "2026-11"), true);
  assert.equal(AR.settledDateIn(old, "2026-11"), "2026-11-03");
  assert.equal(AR.isSettledIn({ ...old, 정산상태: { "2026-10": "정산완료", "2026-11": "미정산" } }, "2026-11"), false, "11월을 되돌리면 되돌린 값");
  assert.equal(AR.isSettledIn(O("x", { 정산상태: { "2026-10": "정산완료" } }), "2026-11"), false, "이월이 아닌 오더는 예전 키를 보지 않음");
  const months = M.buildArMonths({ orders: [O("n1", { 정산상태: { "2026-11": "정산완료" } }), old] });
  assert.equal(months.get("가나상사")?.length || 0, 0, "11월 오더 모두 정산완료 → 미정산 달 없음");
});
ok("settlePaidByClient: 청구월 11월로 받은 돈", () => {
  const p = AR.settlePaidByClient({ orders: [O("n1", { 입금상태: "입금완료", 입금일: "2026-11-20" }), carry], arPayments: [{ client: "가나상사", yyyymm: "2026-11", amount: 220000 }], year: "2026" });
  assert.deepEqual(p["가나상사"].lines.map((x) => [x.ym, x.amt]), [["2026-11", 1320000]]);
});

// ── ② 받은 돈 한 곳 ──
const yearOrders = [O("a1", { 상차일: "2026-09-10" }), O("a2", { 상차일: "2026-10-10" })]; // 청구 110만 + 110만
ok("예전 회계 합계만 있으면 그대로 한 번", () => {
  const p = AR.arPaidByClient({ orders: yearOrders, arPayments: [], acct: { ar: { 가나상사: 1100000 }, log: [] }, year: "2026" });
  assert.equal(p.가나상사, 1100000);
});
ok("예전 회계 합계와 기준일 전 미수금관리 기록이 같은 돈이면 한 번만(겹친 만큼 빼기)", () => {
  const pays = [{ client: "가나상사", yyyymm: "2026-09", amount: 1100000, depositDate: "2026-10-05" }];
  const p = AR.arPaidByClient({ orders: yearOrders, arPayments: pays, acct: { ar: { 가나상사: 1100000 } }, year: "2026" });
  assert.equal(p.가나상사, 1100000, "예전엔 큰 쪽 1,100,000 · 지금도 1,100,000(두 번 세지 않음)");
});
ok("새 회계 [입금 처리](arPayments source acct + log paymentIds)는 정본으로 한 번만 · 예전 합계에 묻히지 않음", () => {
  // 예전 회계 110만(이어지지 않음) + 새 회계 입금 110만(arPayments 와 이어짐 → acct.ar 220만)
  const pays = [{ id: "p1", client: "가나상사", yyyymm: "2026-10", amount: 1100000, depositDate: "2026-11-26", source: "acct" }];
  const acct = { ar: { 가나상사: 2200000 }, log: [{ type: "ar", name: "가나상사", amount: 1100000, at: 1 }, { type: "ar", name: "가나상사", amount: 1100000, at: 2, paymentIds: ["p1"] }] };
  assert.deepEqual(AR.legacyAcctArOf(acct), { 가나상사: 1100000 });
  const p = AR.arPaidByClient({ orders: yearOrders, arPayments: pays, acct, year: "2026" });
  assert.equal(p.가나상사, 2200000, "예전 '큰 쪽' 식이면 2,200,000 vs 1,100,000 → 맞았지만, 새 입금만 있을 때 아래처럼 묻혔다");
  // 예전 식 문제: 예전 회계 110만 + 기준일 뒤 미수금관리 110만 → 큰 쪽 110만(한 번 빠짐) · 지금 220만
  const p2 = AR.arPaidByClient({ orders: yearOrders, arPayments: [{ client: "가나상사", yyyymm: "2026-10", amount: 1100000, depositDate: "2026-11-27" }], acct: { ar: { 가나상사: 1100000 } }, year: "2026" });
  assert.equal(p2.가나상사, 2200000);
});
ok("초기화(reset) 뒤 log 는 다시 셈", () => {
  const acct = { ar: { 가나상사: 300000 }, log: [{ type: "ar", name: "가나상사", amount: 500000, at: 1, paymentIds: ["x"] }, { type: "ar", name: "가나상사", amount: 0, reset: true, at: 2 }, { type: "ar", name: "가나상사", amount: 300000, at: 3 }] };
  assert.deepEqual(AR.legacyAcctArOf(acct), { 가나상사: 300000 });
});

// ── ③ 자금관리 수입 장부 ──
ok("입금 한 번(여러 달) = 장부 한 줄 · id 고정", () => {
  const a = { company: "테스트운송", client: "가나상사", yyyymm: "2026-09", amount: 700000, depositDate: "2026-11-25", source: "bank", bankTxnId: "T1", depositKey: "bank_T1" };
  const b = { ...a, yyyymm: "2026-10", amount: 400000 };
  const k = L.arDepositKeyOf(a, "id1");
  assert.equal(k, L.arDepositKeyOf(b, "id2"));
  const e = L.arLedgerEntry([a, b], k);
  assert.deepEqual([e.type, e.amount, e.date, e.auto, e.item], ["수입", 1100000, "2026-11-25", "ar", "거래처 수금 · 가나상사 (9월·10월분)"]);
  assert.equal(L.arLedgerDocId("테스트운송", k), L.arLedgerDocId("테스트운송", k));
  assert.equal(L.arLedgerEntry([], k), null, "기록을 다 지우면 줄도 지움");
  assert.equal(L.arDepositKeyOf({ bankTxnId: "T9" }, "z"), "bank_T9", "예전 은행 기록(depositKey 없음)은 거래 id 로 묶음");
  assert.equal(L.arDepositKeyOf({}, "z"), "z");
  assert.ok(L.arLedgerDocId("테스트운송", `bank_${"테스트운송__acc1__".repeat(8)}A`) !== L.arLedgerDocId("테스트운송", `bank_${"테스트운송__acc1__".repeat(8)}B`), "긴 키도 겹치지 않음");
});

// ── ④ 명세서 작성 뒤 금액 변경 ──
ok("명세서 작성 1,200,000 → 지금 1,250,000 이면 알림", () => {
  const doc = { client: "가나상사", yyyymm: "2026-11", stage: "작성", supply: 1200000, count: 2 };
  const now = [O("n1"), O("c1", { 상차일: "2026-10-31", 마감월: "2026-11", 청구운임: "250000" })];
  const rows = S.stmtRowsNow(now, "가나상사", "2026-11", doc);
  const d = S.stmtDrift(doc, rows);
  assert.deepEqual([d.was, d.now, d.diff, d.issued], [1200000, 1250000, 50000, false]);
  assert.equal(S.stmtDriftText(d), "명세서 작성 뒤 금액이 바뀌었어요: 작성 1,200,000 → 지금 1,250,000");
  assert.equal(S.stmtDrift({ ...doc, supply: 1250000 }, rows), null, "같으면 없음");
  assert.equal(S.stmtDrift({ ...doc, stage: "미작성" }, rows), null, "작성 전이면 없음");
  assert.equal(S.stmtDrift({ ...doc, stage: "계산서발행" }, rows).issued, true);
  assert.equal(S.stmtDrift({ ...doc, supply: 1250000, excludedIds: ["c1"] }, S.stmtRowsNow(now, "가나상사", "2026-11", { ...doc, excludedIds: ["c1"] })).now, 1000000, "뺀 오더는 빼고 비교");
  const find = S.stmtDocFinder(new Map([["a", { ...doc, biz: "" }], ["b", { ...doc, stage: "계산서발행", biz: "B" }]]));
  assert.equal(find("가나상사", "2026-11").stage, "계산서발행");
});

// ── ⑤ 회계 [입금 처리]로 다 받은 청구월 → 정산완료(fullyPaidMonths) · [초기화] 되돌리기(autoSettleRevertsOf) ──
const pay = (yyyymm, amount, p) => ({ client: "가나상사", yyyymm, amount, ...p });
ok("다 받은 달만 정산완료 대상 · 일부입금은 아님", () => {
  const f = AR.fullyPaidMonths({ orders, payments: [pay("2026-10", 550000)], client: "가나상사" });
  assert.deepEqual(f.map((x) => [x.ym, x.due, x.rows.map((r) => r._id)]), [["2026-10", 550000, ["o1"]]]);
  assert.deepEqual(AR.fullyPaidMonths({ orders, payments: [pay("2026-10", 300000)], client: "가나상사" }), [], "일부입금");
  assert.equal(AR.fullyPaidMonths({ orders, payments: [pay("2026-10", 549995)], client: "가나상사" }).length, 1, "10원 이하 차이는 다 받은 것");
  assert.deepEqual(AR.fullyPaidMonths({ orders, payments: [pay("2026-10", 550000), pay("2026-11", 1320000)], client: "가나상사", only: ["2026-11"] }).map((x) => x.ym), ["2026-11"], "이번 입금이 들어간 달만");
  assert.deepEqual(AR.fullyPaidMonths({ orders, payments: [pay("2026-10", 550000, { client: "다른상사" })], client: "가나상사" }), [], "다른 거래처 입금은 안 셈");
});
ok("이월 오더(상차 10/31 · 마감월 11월)는 11월분으로 정산완료", () => {
  const f = AR.fullyPaidMonths({ orders, payments: [pay("2026-11", 1320000)], client: "가나상사" });
  assert.deepEqual(f.map((x) => [x.ym, x.rows.map((r) => r._id).sort()]), [["2026-11", ["c1", "n1"]]]);
  assert.deepEqual(AR.fullyPaidMonths({ orders, payments: [pay("2026-10", 1320000)], client: "가나상사" }).map((x) => [x.ym, x.rows.map((r) => r._id)]), [["2026-10", ["o1"]]], "10월 기록으로는 10월(상차 10/10)만 — 이월 오더 c1은 10월에 안 들어감");
});
ok("취소 · 화주사 사본 · 이미 정산완료 오더는 빼고 센다(두 번 눌러도 다시 안 씀)", () => {
  const list = [O("n1"), O("x1", { 상태: "취소", 청구운임: "900000" }), O("x2", { source: "transport_transmit", 청구운임: "900000" }), O("x3", { 지급방식: "취소", 청구운임: "900000" }), O("s1", { 정산상태: { "2026-11": "정산완료" }, 청구운임: "300000" })];
  const f = AR.fullyPaidMonths({ orders: list, payments: [pay("2026-11", 1100000)], client: "가나상사" });
  assert.deepEqual(f.map((x) => [x.ym, x.due, x.rows.map((r) => r._id)]), [["2026-11", 1100000, ["n1"]]]);
  const marked = list.map((r) => (r._id === "n1" ? { ...r, 정산상태: { "2026-11": "정산완료" } } : r));
  assert.deepEqual(AR.fullyPaidMonths({ orders: marked, payments: [pay("2026-11", 1100000)], client: "가나상사" }), [], "다 정산완료 → 다시 쓸 것 없음");
});
ok("[초기화] 되돌리기: 이 길로 바꾼 정산완료만 · 다른 입금으로 여전히 다 받았으면 그대로", () => {
  const tag = AR.autoSettleTag("acct_k1");
  assert.equal(tag, "acct:acct_k1");
  const auto = (id, p) => O(id, { 정산상태: { "2026-11": "정산완료" }, 정산일: { "2026-11": "2026-11-25" }, 정산자동: { "2026-11": tag }, ...p });
  const now = [auto("n1"), O("m1", { 정산상태: { "2026-11": "정산완료" }, 청구운임: "500000" }), auto("c1", { 상차일: "2026-10-31", 마감월: "2026-11", 청구운임: "200000" })];
  const marks = [{ col: "orders", id: "n1", ym: "2026-11", tag, prev: { status: null, date: null } }, { col: "orders", id: "c1", ym: "2026-11", tag, prev: { status: "미정산", date: "" } }, { col: "orders", id: "m1", ym: "2026-11", tag, prev: { status: null, date: null } }];
  const back = AR.autoSettleRevertsOf({ orders: now, payments: [], client: "가나상사", marks });
  assert.deepEqual(back.map((m) => m.id).sort(), ["c1", "n1"], "직접 누른 정산완료(m1 — 정산자동 표시 없음)는 그대로");
  assert.deepEqual(AR.autoSettleRevertsOf({ orders: now, payments: [pay("2026-11", 1320000, { source: "bank" })], client: "가나상사", marks }), [], "은행 입금이 따로 다 채우면 그대로");
  assert.equal(AR.autoSettleRevertsOf({ orders: now, payments: [pay("2026-11", 500000)], client: "가나상사", marks }).length, 2, "남은 입금이 일부면 되돌림");
  const other = now.map((r) => (r._id === "n1" ? { ...r, 정산자동: { "2026-11": "acct:다른입금" } } : r));
  assert.deepEqual(AR.autoSettleRevertsOf({ orders: other, payments: [], client: "가나상사", marks }).map((m) => m.id), ["c1"], "다른 입금 표시로 바뀐 오더는 안 건드림");
  const manualAfter = now.map((r) => (r._id === "n1" ? { ...r, 정산상태: { "2026-11": "미정산" } } : r));
  assert.deepEqual(AR.autoSettleRevertsOf({ orders: manualAfter, payments: [], client: "가나상사", marks }).map((m) => m.id), ["c1"], "이미 사람이 되돌린 오더는 안 건드림(두 번 초기화해도 같음)");
});

// ── ⑥ 🛠 2026-11-27 정산완료한 달에 오더가 더 붙어도 예전 입금이 새 오더를 덮지 않게 · 입금완료(잡은 콜) 오더는 받은 것 ──
ok("정산완료 뒤 같은 달에 추가한 오더는 미수로 남는다(매칭 · 회계 · 정산완료 대상 모두)", () => {
  const S11 = { "2026-11": "정산완료" }; const D11 = { "2026-11": "2026-11-20" };
  const list = [O("a", { 청구운임: "500000", 정산상태: S11, 정산일: D11 }), O("b", { 청구운임: "500000", 정산상태: S11, 정산일: D11 }), O("c", { 상차일: "2026-11-28", 청구운임: "300000" })];
  const pays = [pay("2026-11", 1100000, { depositDate: "2026-11-20", source: "bank" })];
  const e = M.buildArMonths({ orders: list, paidMap: M.arPaidMapOf(pays) }).get("가나상사")[0];
  assert.deepEqual([e.due, e.remain], [330000, 330000]);
  const paid = AR.arPaidByClient({ orders: list, arPayments: pays, year: "2026" });
  assert.equal(AR.receivablesOf({ orders: list, paid, today: "2026-11-30", year: "2026" })[0].outstanding, 330000);
  assert.deepEqual(AR.fullyPaidMonths({ orders: list, payments: pays, client: "가나상사" }), [], "c 는 아직 안 받음");
  assert.equal(AR.fullyPaidMonths({ orders: list, payments: [...pays, pay("2026-11", 330000, { depositDate: "2026-11-29" })], client: "가나상사" }).length, 1, "c 몫이 들어오면 다 받음");
  // 날짜를 모르면 예전처럼(입금 전부를 남은 오더에)
  assert.equal(M.buildArMonths({ orders: list, paidMap: new Map([["가나상사|2026-11", 1100000]]) }).get("가나상사")[0].remain, 0);
});
ok("입금완료(잡은 콜) 오더는 받은 돈 — 매칭 남은 금액에서 빼고, 다 채우면 같이 정산완료", () => {
  const list = [O("a", { 청구운임: "1000000", 콜구분: "OUT", 입금상태: "입금완료", 입금일: "2026-11-10" }), O("b", { 청구운임: "1000000" })];
  const months = M.buildArMonths({ orders: list });
  assert.deepEqual(months.get("가나상사").map((x) => [x.total, x.due, x.remain, x.rows.length]), [[1000000, 1100000, 1100000, 2]]);
  const m = M.matchDeposits({ deposits: [{ amount: 1100000, name: "가나상사" }], months });
  assert.equal(M.isConfidentMatch(m.matches[0]), true);
  assert.deepEqual(AR.fullyPaidMonths({ orders: list, payments: [pay("2026-11", 1100000)], client: "가나상사" }).map((x) => x.rows.map((r) => r._id).sort()), [["a", "b"]]);
});

console.log(`\narMonthBasis: ${pass}개 통과`);
