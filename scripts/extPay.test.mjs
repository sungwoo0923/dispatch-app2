// 외부 지급(특수운임 받는사람 "외부") 단위 테스트 — node scripts/extPay.test.mjs
//  정산관리 › 지게차 · 외부 지급 › 외부 지급 탭(src/forklift.jsx ExtPayoutsTab)의 계산 · 저장 규칙(src/forkliftCore.js)
import fs from "fs";
import { extItems, extPayoutRows, extPayoutGroups, extPayPlan, extLedgerDocId, extLedgerKey, forkliftPayoutGroups, specialApplyAll, isCanceledOrder, paidOut } from "../src/forkliftCore.js";
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

console.log(`외부 지급 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
