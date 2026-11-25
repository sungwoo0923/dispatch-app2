// 외부 지급(특수운임 받는사람 "외부") 단위 테스트 — node scripts/extPay.test.mjs
//  정산관리 › 지게차 · 외부 지급 › 외부 지급 탭(src/forklift.jsx ExtPayoutsTab)의 계산 · 저장 규칙(src/forkliftCore.js)
import fs from "fs";
import { extItems, extPayoutRows, extPayoutGroups, extPayPlan, extSettleGapPlan, extLedgerDocId, extAdjLedgerDocId, extLedgerKey, EXT_PAY_FIELDS, forkliftPayoutGroups, specialApplyAll, isCanceledOrder, paidOut } from "../src/forkliftCore.js";
let pass = 0, fail = 0;
const eq = (a, b, n) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) pass++; else { fail++; console.error("✗", n, "\n  got ", JSON.stringify(a), "\n  want", JSON.stringify(b)); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const items = [
  { 종류: "수작업", 이름: "", 금액: 120000, 부담: "청구", 받는사람: "외부", 메모: "한빛 인력" },
  { 종류: "통행료", 이름: "주차비", 금액: 15000, 부담: "회사", 받는사람: "외부", 메모: "" },
  { 종류: "대기료", 이름: "", 금액: 30000, 부담: "청구", 받는사람: "기사", 메모: "" }, // 기사에게 주는 돈 — 빠짐
  { 종류: "수작업", 이름: "", 금액: 80000, 부담: "청구", 받는사람: "외부", 메모: " 한빛인력 " }, // 같은 받는 곳(띄어쓰기만 다름) · 같은 종류-이름 두 번째
];
const o1 = { _id: "A1", 상차일: "2026-11-03", 거래처명: "경동", 청구운임: 600000, 기사운임: 400000, 특수운임: items };
// 1) 항목 · 키
const xs = extItems(o1);
eq(xs.map((x) => [x.key, x.to, x.amount]), [["수작업-수작업·인력상하차비", "한빛 인력", 120000], ["통행료-주차비", "주차비", 15000], ["수작업-수작업·인력상하차비~2", "한빛인력", 80000]], "외부 항목만 · 같은 이름은 ~2 · 받는 곳 = 메모, 없으면 이름");
eq(paidOut(o1), 215000, "수익에서 빠지는 외부 지급 합(paidOut)과 같은 항목");
// 2) 묶음
const o2 = { _id: "B2", 상차일: "2026-11-05", 특수운임: [{ 종류: "통행료", 이름: "주차비", 금액: 10000, 받는사람: "외부" }] };
const cancels = [
  { _id: "C1", 배차상태: "배차취소", 특수운임: [items[0]] },
  { _id: "C2", 상태: "취소", 특수운임: [items[0]] },
  { _id: "C3", 상태: "오더취소", 특수운임: [items[0]] },
  { _id: "C4", 상태: "취소됨", 특수운임: [items[0]] },
  { _id: "T1", source: "transport_transmit", 특수운임: [items[0]] },
];
let gs = extPayoutGroups([o1, o2, ...cancels]);
eq(gs.map((g) => [g.name, g.count, g.unpaid, g.paid]), [["한빛 인력", 2, 200000, 0], ["주차비", 2, 25000, 0]], "받는 곳별 묶음(띄어쓰기 무시) · 취소 4종 · 화주사 사본 제외");
eq(cancels.slice(0, 4).every(isCanceledOrder), true, "취소 판정: 배차취소 · 취소 · 오더취소 · 취소됨");
// 3) 지급완료 → 장부 키 · 금액
const p1 = extPayPlan(o1, ["수작업-수작업·인력상하차비", "통행료-주차비"], { paid: true, date: "2026-11-25", today: "2026-11-25" });
eq(Object.keys(p1.patch.외부지급), ["수작업-수작업·인력상하차비", "통행료-주차비"], "지급완료 → 외부지급 칸에 항목키로");
eq(p1.patch.외부지급["통행료-주차비"].지급액, 15000, "지급액 = 그때 금액");
eq(p1.ledger.map((l) => [l.itemKey, l.amount, l.date]), [["수작업-수작업·인력상하차비", 120000, "2026-11-25"], ["통행료-주차비", 15000, "2026-11-25"]], "장부 줄 = 항목별 지급액");
const paid1 = { ...o1, ...p1.patch };
eq(extPayPlan(paid1, ["통행료-주차비"], { paid: true, date: "2026-11-26" }), null, "이미 지급한 항목을 또 눌러도 바뀌는 것 없음(장부 그대로)");
eq(extLedgerDocId("큐런", "A1", "통행료-주차비"), extLedgerDocId("큐런", "A1", "통행료-주차비"), "장부 문서 ID 고정");
eq(extLedgerDocId("큐런 네트웍스", "A1", "통행료-주차비"), "auto_extpay_큐런_네트웍스_A1_통행료-주차비", "장부 문서 ID 모양(auto_extpay_회사_오더_항목키)");
eq(extLedgerKey("A1", "k"), "A1_k", "upsertAutoEntry 키");
eq(read("src/ledgerAuto.js").includes('upsertAutoEntry(db, `${orderId}_${itemKey}`') && read("src/ledgerAuto.js").includes('auto: "extpay"'), true, "ledgerAuto.setExtPayout 이 같은 키 · auto extpay 를 쓴다");
// 4) 지급 후 금액 변경 배지 — 팝업 [적용](specialApplyAll)으로 금액을 고쳐도 외부지급 칸은 남는다
const edited = specialApplyAll(paid1, { items: paid1.특수운임.map((x, i) => (i === 1 ? { ...x, 금액: 20000 } : x)) });
eq(!!edited.외부지급, true, "특수운임 다시 적용해도 외부지급 칸 유지");
let rows = extPayoutRows(edited);
const park = rows.find((r) => r.key === "통행료-주차비");
eq([park.paid, park.paidAmt, park.amount, park.changed], [true, 15000, 20000, true], "지급 후 금액 변경 → changed(장부는 지급액 15,000)");
eq(rows.find((r) => r.key === "수작업-수작업·인력상하차비").changed, false, "안 바뀐 항목은 배지 없음");
gs = extPayoutGroups([edited]);
eq(gs.find((g) => g.name === "주차비").paid, 15000, "지급완료 합계는 지급액 기준");
// 5) 지급 취소 → 장부 0(지움)
const un = extPayPlan(edited, ["통행료-주차비"], { paid: false });
eq([un.ledger[0].amount, Object.keys(un.patch.외부지급)], [0, ["수작업-수작업·인력상하차비"]], "지급 취소 → 장부 줄 지움 · 칸에서 빠짐");
const un2 = extPayPlan({ ...edited, ...un.patch }, ["수작업-수작업·인력상하차비"], { paid: false });
eq(un2.patch.외부지급, null, "다 취소하면 외부지급 = null");
// 6) 지급한 항목을 지움 → '항목이 바뀌었어요' 줄로 남아 지급 취소 가능
const removed = specialApplyAll(paid1, { items: paid1.특수운임.filter((_, i) => i !== 1) });
rows = extPayoutRows(removed);
const orphan = rows.find((r) => r.orphan);
eq([orphan?.key, orphan?.paidAmt, orphan?.to], ["통행료-주차비", 15000, "주차비"], "지운 항목은 orphan 줄(지급액 그대로)");
eq(extPayPlan(removed, [orphan.key], { paid: false }).ledger[0].amount, 0, "orphan 도 지급 취소 가능");
// 7) 지급한 뒤 취소된 오더 — 지급한 줄만 남는다(미지급 줄은 빠짐)
gs = extPayoutGroups([{ ...paid1, 상태: "취소" }]);
eq(gs.flatMap((g) => g.rows).map((r) => [r.key, r.canceled]), [["수작업-수작업·인력상하차비", true], ["통행료-주차비", true]], "지급 후 취소 → 지급한 줄만 · canceled 표시");
// 8) 지게차 탭도 같은 제외 규칙
const fk = (x) => ({ 지게차비용: 50000, 지게차기사ID: "a", 지게차기사명: "김지게", ...x });
eq(forkliftPayoutGroups([fk({}), fk({ 상태: "취소" }), fk({ 상태: "오더취소" }), fk({ source: "transport_transmit" }), fk({ 상태: "취소됨", 지게차지급완료: true })]).map((g) => [g.count, g.unpaid, g.paid]), [[2, 50000, 50000]], "지게차: 취소 · 사본 제외, 지급 후 취소는 남김");
// 9) 오더 복사 때 외부지급을 복사하지 않는다
const app = read("src/DispatchApp.jsx");
const copyLine = app.split("\n").find((l) => l.includes('"지급명세서ID"') && l.includes("delete payload[k]"));
eq(!!copyLine && copyLine.includes('"외부지급"'), true, "PC 복사: 외부지급 지움");
const mob = read("src/mobile/MobileApp.jsx");
const mKeys = (mob.match(/const M_SPECIAL_KEYS = \[([^\]]*)\]/) || [])[1] || "";
eq(mKeys.length > 0 && !mKeys.includes('"외부지급"'), true, "모바일 복사(specialFieldsOf): 외부지급 없음");

// 10) 💸 지급 후 금액 변경 → [추가 지급]/[환수 처리] (용차지급관리 settleGapPlan 과 같은 방식)
//  가짜 장부: 문서 ID → 금액(0이면 지움) — ledgerAuto.setExtPayout / setExtPayAdjust 와 같은 규칙
const book = new Map(); const CO = "큐런";
const put = (id, amt) => (amt ? book.set(id, amt) : book.delete(id));
const applyPay = (o, plan) => { for (const l of plan.ledger) { put(extLedgerDocId(CO, o._id, l.itemKey), l.amount); if (l.adjAmount != null) put(extAdjLedgerDocId(CO, o._id, l.itemKey), l.adjAmount); } return { ...o, ...plan.patch }; };
const applyGap = (o, plan) => { put(extAdjLedgerDocId(CO, o._id, plan.ledger.itemKey), plan.adjAmount); return { ...o, ...plan.patch }; };
const bookSum = (o, k) => (book.get(extLedgerDocId(CO, o._id, k)) || 0) + (book.get(extAdjLedgerDocId(CO, o._id, k)) || 0);
const K = "통행료-주차비";
const setAmt = (o, v) => specialApplyAll(o, { items: o.특수운임.map((x, i) => (i === 1 ? { ...x, 금액: v } : x)) });
let cur = applyPay(o1, extPayPlan(o1, [K], { paid: true, date: "2026-11-20", today: "2026-11-20" }));
eq(bookSum(cur, K), 15000, "지급완료 → 장부 15,000");
eq(extSettleGapPlan(cur, K, "2026-11-25"), null, "금액이 그대로면 추가 지급 · 환수 없음");
cur = setAmt(cur, 20000);
const g1 = extSettleGapPlan(cur, K, "2026-11-25");
eq([g1.gap, g1.adjAmount, g1.ledger.date], [5000, 5000, "2026-11-25"], "금액 +5,000 → 추가 지급 5,000");
cur = applyGap(cur, g1);
eq([cur.외부지급[K].지급액, cur.외부지급[K].조정액, cur.외부지급[K].조정일], [15000, 5000, "2026-11-25"], "조정액은 항목 기록에 누적(지급액은 그대로)");
eq(bookSum(cur, K), 20000, "장부 지급 줄 + 조정 줄 = 새 금액");
eq(extAdjLedgerDocId("큐런 네트웍스", "A1", K), "auto_extpayadj_큐런_네트웍스_A1_통행료-주차비", "조정 줄 ID 모양(auto_extpayadj_회사_오더_항목키)");
let r10 = extPayoutRows(cur).find((r) => r.key === K);
eq([r10.paidAmt, r10.basePaid, r10.adjAmt, r10.changed], [20000, 15000, 5000, false], "추가 지급 뒤 배지 사라짐(준 돈 = 지급액 + 조정액)");
eq(extSettleGapPlan(cur, K, "2026-11-26"), null, "두 번 눌러도 바뀌는 것 없음");
if (g1) applyGap(cur, g1); // 같은 계획을 또 써도(누적 금액 덮어쓰기) 장부는 그대로
eq(bookSum(cur, K), 20000, "같은 조정을 두 번 써도 두 배가 되지 않음");
eq(extPayoutGroups([cur]).find((g) => g.name === "주차비").paid, 20000, "받는 곳 지급완료 합계 = 준 돈(조정 포함)");
// 더 올림 → 누적
cur = applyGap(setAmt(cur, 23000), extSettleGapPlan(setAmt(cur, 23000), K, "2026-11-27"));
eq([cur.외부지급[K].조정액, bookSum(cur, K)], [8000, 23000], "또 올리면 조정액 누적 8,000(조정 줄 한 줄)");
// 내림 → 환수(음수)
cur = setAmt(cur, 12000);
const g2 = extSettleGapPlan(cur, K, "2026-11-28");
eq([g2.gap, g2.adjAmount], [-11000, -3000], "금액 12,000으로 내림 → 환수 11,000 · 누적 조정 −3,000");
cur = applyGap(cur, g2);
eq([book.get(extAdjLedgerDocId(CO, cur._id, K)), bookSum(cur, K)], [-3000, 12000], "환수 = 음수 조정 줄 · 합계 = 새 금액");
// 조정이 0으로 돌아오면 조정 줄 지움
cur = setAmt(cur, 15000);
cur = applyGap(cur, extSettleGapPlan(cur, K, "2026-11-29"));
eq([book.has(extAdjLedgerDocId(CO, cur._id, K)), "조정액" in cur.외부지급[K], bookSum(cur, K)], [false, false, 15000], "조정 누적 0 → 조정 줄 지움 · 조정액 비움");
// 다시 추가 지급 뒤 지급 취소 → 두 줄 다 없어짐
cur = setAmt(cur, 18000); cur = applyGap(cur, extSettleGapPlan(cur, K, "2026-11-29"));
eq(book.has(extAdjLedgerDocId(CO, cur._id, K)), true, "조정 줄 있음");
const unp = extPayPlan(cur, [K], { paid: false });
eq(unp.ledger[0].adjAmount, 0, "지급 취소 → 조정 줄도 지우는 계획");
cur = applyPay(cur, unp);
eq([book.has(extLedgerDocId(CO, cur._id, K)), book.has(extAdjLedgerDocId(CO, cur._id, K)), !!cur.외부지급?.[K]], [false, false, false], "지급 취소 → 지급 · 조정 줄 둘 다 없음 · 조정액도 사라짐");
r10 = extPayoutRows(cur).find((r) => r.key === K);
eq([r10.paid, r10.paidAmt, r10.adjAmt], [false, 0, 0], "취소 뒤 미지급 · 준 돈 0");
// 다시 지급하면 지금 금액으로 새로(예전 조정액 없음)
cur = applyPay(cur, extPayPlan(cur, [K], { paid: true, date: "2026-11-30", today: "2026-11-30" }));
eq([cur.외부지급[K].지급액, cur.외부지급[K].조정액, bookSum(cur, K)], [18000, undefined, 18000], "다시 지급완료 → 조정액 없이 지금 금액");
// 지운 항목(orphan)은 추가 지급 · 환수 대상이 아님([지급 취소]로)
const gone = specialApplyAll(cur, { items: cur.특수운임.filter((_, i) => i !== 1) });
eq(extSettleGapPlan(gone, K, "2026-11-30"), null, "항목이 사라진 줄은 추가 지급 · 환수 없음");
// orphan 의 준 돈도 조정 포함
const orphAdj = { _id: "Z", 외부지급: { [K]: { 상태: "지급완료", 지급액: 10000, 조정액: 2000, 이름: "주차비" } } };
eq(extPayoutRows(orphAdj)[0].paidAmt, 12000, "orphan 줄도 준 돈 = 지급액 + 조정액");
// 오더 복사 — 조정액은 외부지급 안에 있어 같이 빠진다(9번: 외부지급 지움)
{ const adjOrder = applyGap(setAmt(cur, 25000), extSettleGapPlan(setAmt(cur, 25000), K, "2026-11-30")); const copy = { ...adjOrder }; EXT_PAY_FIELDS.forEach((k) => delete copy[k]);
  eq([adjOrder.외부지급[K].조정액, JSON.stringify(copy).includes("조정액"), extPayoutRows(copy).find((r) => r.key === K).paid], [7000, false, false], "오더 복사: 외부지급(조정액 포함) 안 옮김 → 새 오더는 미지급"); }
// UI · 장부 연결
const fkj = read("src/forklift.jsx"); const la = read("src/ledgerAuto.js");
eq(fkj.includes("extSettleGapPlan(") && fkj.includes("setExtPayAdjust(") && fkj.includes('"추가 지급" : "환수 처리"'), true, "외부 지급 탭: [추가 지급]/[환수 처리] 버튼 · 조정 줄 저장");
eq(la.includes('auto: "extpayadj"') && /export async function setExtPayAdjust/.test(la), true, "ledgerAuto.setExtPayAdjust(auto extpayadj)");

console.log(`외부 지급 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
