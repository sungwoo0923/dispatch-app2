// node scripts/payCore.test.mjs — 지급한 금액 기록(src/payCore.js)
//  장부(acctLedger)를 메모리로 흉내 내서, 지급 → 운임 수정 → 지급 취소 등에서 장부가 0으로 돌아오는지 본다.
import assert from "node:assert/strict";
import {
  payLedgerPlan, settleGapPlan, payGapOf, paidTotalOf, basePaidOf, isPaidThenCanceled,
  paidEditGuard, paidDeleteWarn, statementPayPatch, statementUnpayPatch,
} from "../src/payCore.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓", name); };
const TODAY = "2026-11-25";

// 장부 흉내: 지급일별 합계(auto_drvpay, increment) + 오더별 조정 줄(auto_drvpayadj, 절대값)
function ledger() {
  const day = {}; const adj = {};
  return {
    day, adj,
    total: () => Object.values(day).reduce((a, v) => a + v, 0) + Object.values(adj).reduce((a, v) => a + v, 0),
    apply(row, plan) {
      plan.bumps.forEach((b) => { const fresh = !(b.date in day); if (fresh && b.amount < 0) return; day[b.date] = (day[b.date] || 0) + b.amount; });
      if (plan.adjAmount != null) { if (plan.adjAmount) adj[row._id] = plan.adjAmount; else delete adj[row._id]; }
    },
  };
}
// 화면 동작 흉내(용차지급관리 pay / patchDispatch 기사운임 수정)
const pay = (L, o, status, date) => { const plan = payLedgerPlan(o, { status, date }, TODAY); L.apply(o, plan); return { ...o, ...plan.patch }; };
const edit = (o, patch) => { const g = paidEditGuard(o, patch, TODAY); return { o: { ...o, ...patch, ...g.extra }, warn: g.warn }; };
const settle = (L, o) => { const p = settleGapPlan(o, TODAY); if (!p) return o; L.apply(o, { bumps: [], adjAmount: p.adjAmount }); return { ...o, ...p.patch }; };

t("지급 → 운임 수정 → 지급 취소: 장부 0(예전엔 −2만)", () => {
  const L = ledger();
  let o = { _id: "a", 기사운임: "100000", 지급상태: "지급중" };
  o = pay(L, o, "지급완료", "2026-11-20");
  assert.equal(o.지급액, 100000); assert.equal(o.지급액기록일, TODAY); assert.equal(L.total(), 100000);
  const e = edit(o, { 기사운임: "120000" }); o = e.o;
  assert.match(e.warn, /이미 지급한 오더예요/); assert.match(e.warn, /\+20,000원/);
  assert.equal(L.total(), 100000, "운임만 고치면 장부는 그대로");
  assert.equal(payGapOf(o), 20000);
  o = pay(L, o, "지급중", "");
  assert.equal(L.total(), 0, "지급 취소는 지급액(10만)만큼만 뺀다");
  assert.equal(o.지급액, null); assert.equal(payGapOf(o), 0);
});

t("지급 → 운임 수정 → [추가 지급] → 두 번 눌러도 한 번 → 지급 취소", () => {
  const L = ledger();
  let o = pay(L, { _id: "b", 기사운임: 100000 }, "지급완료", "2026-11-20");
  o = edit(o, { 기사운임: 120000 }).o;
  const before = o;
  o = settle(L, o);
  assert.equal(L.total(), 120000); assert.equal(o.지급조정액, 20000); assert.equal(payGapOf(o), 0); assert.equal(paidTotalOf(o), 120000);
  settle(L, before); // 화면이 아직 새 값을 못 받은 채 한 번 더 눌러도 같은 금액(누적값 덮어쓰기)
  assert.equal(L.total(), 120000);
  assert.equal(settle(L, o), o, "차액이 없으면 아무것도 안 한다");
  o = pay(L, o, "지급중", "");
  assert.equal(L.total(), 0, "지급 취소 → 지급일 줄 −10만 + 조정 줄 삭제");
});

t("지급 → 운임 내림 → [환수 처리]는 음수 조정", () => {
  const L = ledger();
  let o = pay(L, { _id: "c", 기사운임: 100000 }, "지급완료", "2026-11-20");
  o = edit(o, { 기사운임: 90000 }).o;
  assert.equal(payGapOf(o), -10000);
  o = settle(L, o);
  assert.equal(L.adj.c, -10000); assert.equal(L.total(), 90000);
});

t("지급 → 취소(차량 빼기): 장부 그대로 · 지급 후 취소 표시 → 지급 취소 시 지급액만큼", () => {
  const L = ledger();
  let o = pay(L, { _id: "d", 기사운임: 100000, 차량번호: "서울12가3456", 이름: "김기사", 배차상태: "배차완료" }, "지급완료", "2026-11-20");
  const e = edit(o, { 차량번호: "" }); o = e.o;
  assert.match(e.warn, /지급 후 취소/);
  assert.equal(isPaidThenCanceled(o), true); assert.equal(o.지급후취소.이름, "김기사"); assert.equal(o.지급후취소.지급액, 100000);
  assert.equal(L.total(), 100000);
  o = { ...o, 기사운임: 0 }; // 취소 뒤 운임을 지워도
  o = pay(L, o, "지급중", "");
  assert.equal(L.total(), 0); assert.equal(o.지급후취소, null);
});

t("화주 배차취소 승인 · 상태 취소도 같은 경고", () => {
  const o = { _id: "e", 기사운임: 50000, 지급상태: "지급완료", 지급액: 50000 };
  assert.match(paidEditGuard(o, { 상태: "취소", 배차상태: "배차취소" }, TODAY).warn, /지급 후 취소/);
  assert.equal(paidEditGuard({ ...o, 지급상태: "지급중" }, { 상태: "취소" }, TODAY).warn, "");
  assert.equal(paidEditGuard(o, { 메모: "x" }, TODAY).warn, "");
  assert.equal(paidEditGuard(o, { 기사운임: "50,000" }, TODAY).warn, "", "같은 금액이면 묻지 않는다");
});

t("예전 오더(지급액 없음): 기사운임 기준 · 수정 때 바꾸기 전 운임을 지급액으로 고정", () => {
  const L = ledger();
  L.day["2026-10-05"] = 80000; // 예전에 지급완료 처리된 줄
  let o = { _id: "f", 기사운임: 80000, 지급상태: "지급완료", 지급일: "2026-10-05" };
  assert.equal(basePaidOf(o), 80000); assert.equal(payGapOf(o), 0);
  const e = edit(o, { 기사운임: 95000 }); o = e.o;
  assert.equal(o.지급액, 80000, "바꾸기 전 기사운임으로 고정"); assert.equal(payGapOf(o), 15000);
  o = pay(L, o, "지급중", "");
  assert.equal(L.total(), 0);
  // 고정 없이(다른 경로) 지급 취소해도 예전처럼 지금 기사운임으로 뺀다
  const L2 = ledger(); L2.day["2026-10-05"] = 70000;
  pay(L2, { _id: "g", 기사운임: 70000, 지급상태: "지급완료", 지급일: "2026-10-05" }, "지급중", "");
  assert.equal(L2.total(), 0);
});

t("지급일만 옮기기: 금액 그대로 다른 날로 · 예전 오더는 지급액 고정", () => {
  const L = ledger();
  let o = pay(L, { _id: "h", 기사운임: 100000 }, "지급완료", "2026-11-20");
  o = edit(o, { 기사운임: 130000 }).o;
  const plan = payLedgerPlan(o, { status: "지급완료", date: "2026-11-22", keepAmount: true }, TODAY);
  L.apply(o, plan); o = { ...o, ...plan.patch };
  assert.equal(L.day["2026-11-20"], 0); assert.equal(L.day["2026-11-22"], 100000); assert.equal(o.지급액, 100000); assert.equal(payGapOf(o), 30000);
  const old = { _id: "i", 기사운임: 50000, 지급상태: "지급완료", 지급일: "2026-11-01" };
  assert.equal(payLedgerPlan(old, { status: "지급완료", date: "2026-11-02", keepAmount: true }, TODAY).patch.지급액, 50000);
});

t("다시 지급(엑셀 매칭으로 이미 지급완료 오더): 조정 줄 지우고 지금 운임으로", () => {
  const L = ledger();
  let o = pay(L, { _id: "j", 기사운임: 100000 }, "지급완료", "2026-11-20");
  o = edit(o, { 기사운임: 120000 }).o; o = settle(L, o);
  o = pay(L, o, "지급완료", "2026-11-21");
  assert.equal(L.total(), 120000); assert.equal(o.지급액, 120000); assert.equal(o.지급조정액, null); assert.equal(L.adj.j, undefined);
});

t("지입 지급명세서로 지급한 오더: 오더별 장부 줄 없음 · 그 명세서로만 되돌림", () => {
  const p = statementPayPatch({ 기사운임: "300,000" }, { stmtId: "drv1_2026-11", date: "2026-11-30", today: TODAY });
  assert.equal(p.지급상태, "지급완료"); assert.equal(p.지급액, 300000); assert.equal(p.지급명세서ID, "drv1_2026-11"); assert.equal(p.지급일, "2026-11-30");
  const o = { _id: "k", 기사운임: 300000, ...p };
  const plan = payLedgerPlan(o, { status: "지급중" }, TODAY);
  assert.deepEqual(plan.bumps, [], "명세서 한 줄이 장부에 있으니 오더별로 빼지 않는다");
  assert.equal(statementUnpayPatch(o, "drv1_2026-10"), null, "다른 명세서는 건드리지 않음");
  const u = statementUnpayPatch(o, "drv1_2026-11");
  assert.equal(u.지급상태, "지급중"); assert.equal(u.지급명세서ID, null); assert.equal(u.지급액, null);
});

t("삭제 경고", () => {
  assert.equal(paidDeleteWarn([{ 지급상태: "지급중" }, null]), "");
  const w = paidDeleteWarn([{ 지급상태: "지급완료", 기사운임: 10000, 지급액: 8000 }, { 지급상태: "지급완료", 기사운임: 5000 }]);
  assert.match(w, /2건\(13,000원\)/);
});

console.log(`payCore: ${n}개 통과`);
