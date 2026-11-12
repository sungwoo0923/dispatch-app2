// 🚢 2026-11-12 컨테이너 · 해상 · 항공 계산 규칙 점검 — node scripts/freightCore.test.mjs
import assert from "node:assert/strict";
import * as c from "../src/freight/freightCore.js";

// ISO 6346 검사 숫자(알려진 번호)
assert.equal(c.cntrCheckDigit("CSQU305438"), 3);
assert.equal(c.checkCntrNo("CSQU3054383").ok, true);
assert.equal(c.checkCntrNo("csqu 305438 3").ok, true);
assert.equal(c.checkCntrNo("CSQU3054384").ok, false);
assert.equal(c.checkCntrNo("MSKU7480121").ok, c.cntrCheckDigit("MSKU748012") === 1);
assert.equal(c.checkCntrNo("").ok, true);
assert.equal(c.fmtCntrNo("hmmu1234567"), "HMMU 123456 7");
// AWB 검사 숫자(일련번호 7자리 % 7)
assert.equal(c.checkAwb("180-1234 5675").ok, true);
assert.equal(c.checkAwb("18012345676").ok, false);
assert.equal(c.fmtAwb("18012345675"), "180-1234 5675");
// 부피중량 · 운임중량
assert.equal(c.volumeWeight(60, 50, 45, 24), 540);
assert.equal(c.chargeableWeight(410, 540), 540);
assert.equal(c.chargeableWeight(10.2, 3), 10.5);
assert.equal(c.cbmOf(100, 100, 100, 2), 2);
assert.equal(c.revenueTon(11.4, 3200), 11.4);
assert.equal(c.revenueTon(2, 3200), 3.2);
// 손익(외화 환산)
const leg = { sales: [{ item: "O/F", cur: "USD", amount: "1000", rate: "1400" }, { item: "THC", cur: "KRW", amount: "200000" }], costs: [{ item: "O/F", cur: "USD", amount: "800", rate: "1400" }] };
assert.deepEqual(c.legPnl(leg), { sale: 1600000, cost: 1120000, profit: 480000, margin: 30 });
// 마감
const now = Date.UTC(2026, 10, 12, 3, 0); // 한국 2026-11-12 12:00
assert.equal(c.toMs("2026-11-12T12:00"), now);
assert.equal(c.dueInfo(c.toMs("2026-11-12T15:00"), now).level, "urgent");
assert.equal(c.dueInfo(c.toMs("2026-11-14T12:00"), now).text, "D-2");
assert.equal(c.dueInfo(c.toMs("2026-11-10T12:00"), now).level, "over");
const imp = { mode: "container", trip: "수입", status: "픽업완료", freeTimeEnd: "2026-11-10", overRate: "40000", doorDate: "2026-11-11" };
assert.equal(c.topDeadline(imp, now).key, "return");
assert.deepEqual(c.overCost(imp, now), { days: 2, cost: 80000 });
assert.equal(c.deadlinesOf({ ...imp, status: "반입·반납완료" }).length, 0);
assert.equal(c.deadlinesOf({ mode: "sea", direction: "수출", status: "통관", docClosing: "2026-11-13T10:00", cargoClosing: "2026-11-14T10:00", etd: "2026-11-16" }).map((d) => d.key).join(), "cargo,etd");
// 상태
assert.equal(c.nextStatus({ mode: "air", status: "부킹" }), "화물반입");
assert.equal(c.nextStatus({ mode: "inland", status: c.HANDOFF_STATUS }), "접수");
assert.equal(c.isDone({ mode: "sea", status: "인도완료" }), true);
assert.equal(c.isDone({ mode: "sea", status: c.HANDOFF_STATUS }), false);
// 번호
assert.equal(c.nextNo("JB", ["JB-2611-0007", "JB-2610-0099"], now), "JB-2611-0008");
assert.equal(c.nextRefNo("container", [], now), "CT-2611-0001");
// 인계
assert.deepEqual(c.handoffTargets({ mode: "sea" }, ["inland", "container", "sea"]), ["container", "inland"]);
assert.deepEqual(c.handoffTargets({ mode: "air" }, ["air"]), []);
const h = c.buildHandoff({ id: "a", mode: "sea", jobNo: "JB-1", refNo: "SE-1", direction: "수입", client: "A", mblNo: "M1", line: "HMM", freeTimeEnd: "2026-11-20", cntrs: [{ size: "20GP", qty: "2" }] }, "container");
assert.equal(h.status, c.HANDOFF_STATUS); assert.equal(h.size, "20GP"); assert.equal(h.blNo, "M1"); assert.equal(h.freeTimeEnd, "2026-11-20"); assert.equal(h.jobNo, "JB-1");
// Job 묶기 · 거래처 360
const g = c.groupByJob([{ id: "2", jobNo: "J1", mode: "inland", refNo: "IN-1" }, { id: "1", jobNo: "J1", mode: "sea", refNo: "SE-1", client: "A" }, { id: "3", jobNo: "J2", mode: "air", refNo: "AR-1" }]);
assert.equal(g.length, 2); assert.equal(g.find((x) => x.jobNo === "J1").legs[0].mode, "sea");
const m = c.clientMatrix([{ client: "A", mode: "sea", sales: [{ cur: "KRW", amount: "100" }] }], [{ 거래처명: "A", 청구운임: 50, 기사운임: 30 }, { 거래처명: "B", 청구운임: 10, 기사운임: 5 }], ["inland", "sea", "air"]);
assert.equal(m[0].client, "A"); assert.equal(m[0].sale, 150); assert.deepEqual(m[0].missing, ["air"]); assert.deepEqual(m[1].missing, ["sea", "air"]);
console.log("freightCore OK");
// 내륙 오더 연결
{
  const leg = { id: "L", mode: "inland", jobNo: "JB-1", refNo: "IN-1", client: "A", pickupPlace: "P", dropPlace: "D", pickupDate: "2026-11-13", fromMode: "container", fromRef: "CT-1", sales: [{ cur: "KRW", amount: "300000" }], costs: [] };
  const rec = c.inlandOrderRecord(leg, "2026-11-12");
  assert.equal(rec.거래처명, "A"); assert.equal(rec.청구운임, 300000); assert.equal(rec.배차상태, "배차중"); assert.equal(rec.freightLegId, "L"); assert.match(rec.메모, /JB-1/);
  const linked = { ...leg, dispatchId: "o1", status: "접수" };
  const e = c.enrichInland(linked, { _id: "o1", 상차일: "2026-11-13", 차량번호: "12가3456", 이름: "김", 청구운임: 350000, 기사운임: 280000, 배차상태: "배차완료" }, "2026-11-12");
  assert.equal(e.status, "배차완료"); assert.equal(e.driver, "김"); assert.deepEqual(c.legPnl(e), { sale: 350000, cost: 280000, profit: 70000, margin: 20 });
  assert.equal(c.enrichInland(linked, { 상차일: "2026-11-10", 차량번호: "1" }, "2026-11-12").status, "운송완료");
  assert.equal(c.enrichInland(linked, { 상차일: "2026-11-13", 차량번호: "" }, "2026-11-12").status, "접수");
  assert.equal(c.enrichInland(linked, null)._orderMissing, true);
  assert.equal(c.enrichInland(leg, {}), leg);
}
// 정산
{
  const js = [
    { client: "A", sales: [{ cur: "KRW", amount: "100" }], costs: [{ cur: "KRW", amount: "60", vendor: "V1", paidAt: 1 }, { cur: "KRW", amount: "10", vendor: "V2" }] },
    { client: "A", sales: [{ cur: "KRW", amount: "50" }], billedAt: 1, costs: [] },
    { client: "B", sales: [{ cur: "KRW", amount: "30" }], billedAt: 1, collectedAt: 2, costs: [{ cur: "KRW", amount: "5" }] },
  ];
  assert.deepEqual(c.settleSummary(js), { sale: 180, unbilled: 100, receivable: 50, collected: 30, cost: 75, unpaid: 15, paid: 60 });
  assert.equal(c.receivables(js)[0].client, "A"); assert.equal(c.receivables(js)[0].unbilled, 100);
  assert.equal(c.payables(js).find((x) => x.vendor === "V1").unpaid, 0); assert.equal(c.payables(js)[0].unpaid, 10);
}
assert.deepEqual(c.allowedModules(["inland", "sea"], ["sea", "air"]), ["sea"]);
assert.deepEqual(c.allowedModules(["inland", "sea"], ["air"]), ["inland", "sea"]);
assert.deepEqual(c.allowedModules(["inland", "sea"], ["sea"], true), ["inland", "sea"]);
console.log("freightCore 2 OK");
