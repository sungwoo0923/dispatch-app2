// 2단계 마감 · 거래명세서 양식 테스트 — node scripts/closeFlow.test.mjs
import assert from "node:assert/strict";
import { closeBoard, closeChecks, canSubmit, canVerify, verifyPatch, canApprove, canReject, submitPatch, approvePatch, rejectPatch, unlockPatch, dayBoard, closeCounts, isMine, prevYmOf, nextYmOf, carryPatchOf, carryPlan } from "../src/closeFlow.js";
import { normalizeForm, pickForm, visibleCols, headerLabels, BASE_FORM, formDoc } from "../src/invoiceForm.js";

const me = { email: "Kim@Co.kr", uid: "u1", name: "김배차" };
const o = (p) => ({ 상차일: "2026-10-05", 거래처명: "가나상사", 상차지명: "인천", 하차지명: "평택", 차량번호: "88바1234", 청구운임: "100000", 기사운임: "80000", 배차상태: "배차완료", 작성자: "kim@co.kr", ...p });
const orders = [
  o({ _id: "1" }), o({ _id: "2", 상차일: "2026-10-06" }),
  o({ _id: "3", 거래처명: "다라물산", 청구운임: "0", 작성자: "lee@co.kr" }),
  o({ _id: "4", 거래처명: "다라물산", 상차일: "2026-10-07", 작성자: "lee@co.kr" }),
  o({ _id: "5", 거래처명: "다라물산", 상차일: "2026-10-07", 작성자: "lee@co.kr" }), // 4와 중복
  o({ _id: "6", 거래처명: "마바", 청구운임: "50000", 기사운임: "0", createdByUid: "u1", 작성자: "" }), // 기사운임 빈칸 · uid로 내 것
  o({ _id: "7", 거래처명: "마바", 배차상태: "배차중", 상차일: "2026-10-30", 작성자: "x@co.kr" }), // 지난 날 미배차
  o({ _id: "8", 거래처명: "가나상사", 상차일: "2026-09-10", 청구운임: "100000" }), // 지난달
  o({ _id: "9", 배차상태: "배차취소", 청구운임: "999999" }),
  o({ _id: "10", 거래처명: "다라물산", 청구운임: "0", 지급방식: "손실", 상차일: "2026-10-09", 차량번호: "", 작성자: "lee@co.kr" }), // 손실은 빈칸 아님
];
assert.equal(prevYmOf("2026-01"), "2025-12");
assert.ok(isMine(orders[0], me) && isMine(orders[5], me) && !isMine(orders[2], me), "이메일(대소문자 무시) · uid로 내 오더");
const today = "2026-11-16";
let B = closeBoard(orders, "2026-10", { me, today });
const row = (c) => B.find((r) => r.client === c);
assert.deepEqual(B.map((r) => r.client).sort(), ["가나상사", "다라물산", "마바"]);
assert.equal(row("가나상사").sale, 200000, "취소 · 다른 달 제외");
assert.equal(row("가나상사").prevSale, 100000); assert.equal(row("가나상사").bigDiff, true, "지난달보다 100% → 알림");
assert.deepEqual([row("다라물산").checks.blank.length, row("다라물산").checks.dup], [1, undefined], "손실은 빈칸에서 뺀다 · 같은 날 같은 구간은 검사하지 않는다(흔한 일)");
assert.deepEqual([row("마바").checks.noDriver.length, row("마바").checks.unassigned.length], [1, 1]);
assert.deepEqual([row("가나상사").block, row("다라물산").block, row("마바").block, row("마바").warn], [0, 1, 1, 1]);
assert.deepEqual(B.filter((r) => r.mine).map((r) => r.client).sort(), ["가나상사", "마바"], "내 거래처 = 내가 등록한 오더가 있는 곳");
// 흐름: 1차 마감 → 승인 / 반려 → 다시 마감
assert.ok(canVerify(row("가나상사")) && canVerify(row("다라물산")), "확인할 것이 있어도 검증할 수 있다(화면이 묻는다)");
assert.ok(!canSubmit(row("가나상사")), "검증 전에는 1차 마감 못 함");
const docs = new Map();
const closeOf = (c, m) => docs.get(`${c}|${m}`) || null;
const vp = verifyPatch(row("가나상사"), me, 500);
assert.deepEqual([vp.status, vp.snapshot.count, vp.log[0].act], ["verified", 2, "검증 완료"]);
docs.set("가나상사|2026-10", vp);
B = closeBoard(orders, "2026-10", { me, today, closeOf });
assert.ok(canSubmit(row("가나상사")) && !canVerify(row("가나상사")), "검증 완료 → 1차 마감 가능");
B = closeBoard([...orders, o({ _id: "v1", 상차일: "2026-10-21" })], "2026-10", { me, today, closeOf });
assert.ok(row("가나상사").changed && !canSubmit(row("가나상사")) && canVerify(row("가나상사")), "검증 뒤 오더가 바뀌면 다시 검증");
B = closeBoard(orders, "2026-10", { me, today, closeOf });
const sp = submitPatch(row("가나상사"), me, "", 1000);
assert.deepEqual([sp.status, sp.submittedBy, sp.snapshot.count, sp.snapshot.sale, sp.log[0].act, sp.log[1].act], ["submitted", "kim@co.kr", 2, 200000, "1차 마감", "검증 완료"]);
docs.set("가나상사|2026-10", sp);
B = closeBoard(orders, "2026-10", { me, today, closeOf });
assert.ok(canApprove(row("가나상사")) && canReject(row("가나상사")) && !canSubmit(row("가나상사")));
const rj = rejectPatch(row("가나상사"), { email: "acct@co.kr", name: "최경리" }, " 대기료 빠짐 ", 2000);
assert.deepEqual([rj.status, rj.reason, rj.log.length, rj.log[0].act], ["rejected", "대기료 빠짐", 3, "반려"], "기록: 검증 완료 → 1차 마감 → 반려");
docs.set("가나상사|2026-10", { ...sp, ...rj });
B = closeBoard(orders, "2026-10", { me, today, closeOf });
assert.ok(canVerify(row("가나상사")) && !canSubmit(row("가나상사")) && !canApprove(row("가나상사")), "반려되면 다시 검증부터");
assert.equal(verifyPatch(row("가나상사"), me).log[0].act, "고쳐서 다시 검증");
// 마감 뒤 금액이 바뀌면 승인 못 하고 다시 1차 마감
docs.set("가나상사|2026-10", { ...sp, status: "submitted" });
const more = [...orders, o({ _id: "11", 상차일: "2026-10-20" })];
B = closeBoard(more, "2026-10", { me, today, closeOf });
assert.ok(row("가나상사").changed && !canApprove(row("가나상사")) && canVerify(row("가나상사")), "금액 바뀜 → 다시 검증");
const ap = approvePatch(closeBoard(orders, "2026-10", { me, today, closeOf }).find((r) => r.client === "가나상사"), { name: "최경리" });
assert.equal(ap.status, "approved"); assert.equal(unlockPatch(row("가나상사"), me).status, "none");
assert.deepEqual(closeCounts(closeBoard(orders, "2026-10", { me, today, closeOf })), { none: 2, verified: 0, submitted: 1, rejected: 0, approved: 0 });
// ⚠ 2026-11-27 최종마감 뒤 — 오더 건수나 오더 금액이 바뀌면 '마감 후 변경'(명세서 화면 수정은 오더를 안 바꿔서 안 잡힘)
assert.deepEqual([ap.snapshot.count, ap.snapshot.sale], [2, 200000], "최종마감 때 건수 · 금액을 남긴다");
docs.set("가나상사|2026-10", { ...sp, ...ap });
B = closeBoard(orders, "2026-10", { me, today, closeOf });
assert.ok(!row("가나상사").changed, "최종마감 그대로");
B = closeBoard(orders.map((x) => (x._id === "1" ? { ...x, 청구운임: "130000" } : x)), "2026-10", { me, today, closeOf });
assert.ok(row("가나상사").changed, "잠금 중 오더 금액만 바뀜 → 마감 후 변경(운송팀 월 마감에서도 보이게 · 2026-11-27)");
B = closeBoard(orders.filter((x) => x._id !== "2"), "2026-10", { me, today, closeOf });
assert.ok(row("가나상사").changed && !canApprove(row("가나상사")) && !canVerify(row("가나상사")), "잠금 중 건수가 바뀜 → 마감 후 변경(배차 쪽 검증 버튼은 그대로 없음)");
docs.set("가나상사|2026-10", { ...sp, ...ap, unlocked: true });
B = closeBoard(orders.map((x) => (x._id === "1" ? { ...x, 청구운임: "130000" } : x)), "2026-10", { me, today, closeOf });
assert.ok(row("가나상사").changed, "일시해제 중엔 금액이 바뀌어도 알림");
docs.set("가나상사|2026-10", { ...sp, status: "submitted" });
// 🗓 2026-11-27 이월 오더 일괄 마감월 지정
assert.equal(nextYmOf("2026-12"), "2027-01");
assert.deepEqual(carryPatchOf({ 상차일: "2026-10-31" }, "next"), { 마감월: "2026-11" }, "익월 = 상차일 다음 달");
assert.equal(carryPatchOf({ 상차일: "2026-10-31", 마감월: "2026-11" }, "next"), null, "이미 그 달");
assert.deepEqual(carryPatchOf({ 상차일: "2026-10-31", 마감월: "2026-11" }, "clear"), { 마감월: "" });
assert.equal(carryPatchOf({ 상차일: "2026-10-31" }, "ym", "12월"), null, "잘못 적은 달은 안 바꿈");
const cp = carryPlan([{ _id: "a", 상차일: "2026-10-31" }, { _id: "b", 상차일: "2026-10-30", 마감월: "2026-11" }, { _id: "c", 상차일: "2026-10-29" }], "ym", "2026-11", (x) => x._id === "c");
assert.deepEqual([cp.todo.map((x) => x.o._id), cp.same, cp.locked], [["a"], 1, 1], "이미 그 달 · 최종마감은 빼고");
// 일 마감 — 그날 내 오더만
const D = dayBoard(orders, "2026-10-05", me, today);
assert.deepEqual([D.count, D.sale, D.block, D.warn], [2, 150000, 0, 1], "같은 날 같은 구간은 검사 안 함 · 기사운임 빈칸은 알림");
assert.equal(closeChecks([o({ 상차일: "2026-12-01", 배차상태: "배차중" })], today).unassigned.length, 0, "앞으로 올 날짜는 미배차 아님");

// 거래명세서 양식
const base = normalizeForm(null);
assert.deepEqual(headerLabels(base), ["No", "날짜", "상차지", "하차지", "경유지", "화물명", "기사명", "차량번호", "공급가액", "세액(10%)", "합계"], "기본형 = 예전 명세서 칸 그대로");
const f = normalizeForm({ order: ["톤수", "상차일", "없는칸"], on: ["상차일", "톤수", "화물명"], labels: { 화물명: " 품목 ", 이상한: "x" }, tax: false });
assert.deepEqual(f.order.slice(0, 2), ["톤수", "상차일"]); assert.equal(f.order.length, 9, "빠진 칸은 뒤에 붙이고 모르는 칸은 버린다");
assert.deepEqual(visibleCols(f).map((c) => c.label), ["톤수", "날짜", "품목"]);
assert.deepEqual(headerLabels(f), ["No", "톤수", "날짜", "품목", "금액"], "세액을 끄면 금액 한 칸");
const forms = new Map([["", { client: "", on: ["상차일", "하차지"] }], ["가나상사", formDoc("가나상사", f)]]);
assert.equal(pickForm(forms, "가나상사").source, "client");
assert.deepEqual([pickForm(forms, "다라물산").source, visibleCols(pickForm(forms, "다라물산")).length], ["company", 2], "전용 양식이 없으면 회사 기본");
assert.equal(pickForm(new Map(), "x").source, "base"); assert.deepEqual(normalizeForm({ on: [] }).on, BASE_FORM.on, "칸을 다 끄면 기본 칸");
console.log("closeFlow · invoiceForm OK");
