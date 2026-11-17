// 담당노선 주인(배차담당자 자동 지정) — node scripts/routeOwner.test.mjs
//  functions/routeOwnerCore.mjs: 바꿀 오더 고르기(최종마감 · 취소 · 고정노선 제외 · 이미 된 오더 건너뜀) · 노선 주인표 합치기 · 새 오더 자동 지정
import assert from "node:assert/strict";
import {
  routeGroupOf, selectOwnerTargets, mergeOwnerMap, ownerPatch, autoOwnerPatch, ownerEmpty, isOwnedBy, closeMapOf, isLockedOrder, ownableGroups, RG_NONE,
} from "../functions/routeOwnerCore.mjs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log("✓", name); };

const me = { uid: "u1", name: "김배차", email: "Kim@JY.com" };
const other = { uid: "u2", name: "이직원", email: "lee@jy.com" };
const o = (id, x) => ({ __col: "orders", _id: id, 거래처명: "녹수", 상차일: "2026-11-05", ...x });

t("노선 = 담당노선구분 · 없으면 이전출처 탭 이름", () => {
  assert.equal(routeGroupOf({ 담당노선구분: "녹수내수", 이전출처: "아산내수!3" }), "녹수내수");
  assert.equal(routeGroupOf({ 이전출처: "아산내수!12" }), "아산내수");
  assert.equal(routeGroupOf({}), "");
});

t("바꿀 오더 고르기 — 노선 안 · 취소 · 고정노선 · 최종마감 · 이미 된 오더", () => {
  const closes = [{ kind: "close", client: "녹수", yyyymm: "2026-10", status: "approved" }, { kind: "close", client: "녹수", yyyymm: "2026-11", status: "approved", unlocked: true }];
  const orders = [
    o("a", { 담당노선구분: "녹수내수", 등록자명: "이직원", createdByUid: "u2" }),
    o("b", { 이전출처: "아산내수!4", 작성자: "구글시트 실시간" }),
    o("c", { 담당노선구분: "보령KDF" }), // 다른 노선
    o("d", { 담당노선구분: "녹수내수", 상태: "취소" }),
    o("e", { 담당노선구분: "녹수내수", 배차표Id: "rb1" }), // 고정노선
    o("f", { 담당노선구분: "녹수내수", 상차일: "2026-10-30" }), // 10월 최종마감
    o("g", { 담당노선구분: "녹수내수", 마감월: "2026-10", 상차일: "2026-11-01" }), // 마감월 기준 10월 → 잠김
    o("h", { 담당노선구분: "녹수내수", 등록자명: "김배차", createdByName: "김배차", createdByUid: "u1", createdByEmail: "kim@jy.com" }), // 이미 나
    o("i", { 담당노선구분: "녹수내수", source: "transport_transmit" }),
    o("j", { 담당노선구분: "녹수내수", 배차상태: "배차취소" }),
    o("a", { 담당노선구분: "녹수내수", 등록자명: "이직원", createdByUid: "u2" }), // 같은 오더 두 번
    { __col: "dispatch", _id: "a", 담당노선구분: "녹수내수", 거래처명: "녹수", 상차일: "2026-11-02" }, // 다른 컬렉션의 같은 id 는 다른 오더
  ];
  const r = selectOwnerTargets(orders, ["녹수내수", "아산내수", RG_NONE], me, { closes });
  assert.deepEqual(r.change.map((x) => `${x.__col}/${x._id}`).sort(), ["dispatch/a", "orders/a", "orders/b"]);
  assert.deepEqual(r.locked.map((x) => x._id).sort(), ["f", "g"]);
  assert.deepEqual(r.skipped, { cancelled: 3, fixed: 1, already: 1 });
  assert.deepEqual(r.byGroup, { 녹수내수: 2, 아산내수: 1 });
});

t("일반오더(노선 없음)는 바꾸지 않는다", () => {
  assert.deepEqual(ownableGroups([RG_NONE, " 녹수내수 ", "녹수내수", ""]), ["녹수내수"]);
  const r = selectOwnerTargets([o("x", {})], [RG_NONE], me, {});
  assert.equal(r.change.length, 0);
});

t("두 번 저장해도 같다(바꾼 오더는 다음엔 건너뜀)", () => {
  const before = o("a", { 담당노선구분: "녹수내수", 등록자명: "이직원", createdBy: "u2", 등록자: "이직원", 등록자이메일: "lee@jy.com" });
  const after = { ...before, ...ownerPatch(before, me) };
  assert.equal(isOwnedBy(after, me), true);
  assert.equal(selectOwnerTargets([after], ["녹수내수"], me).change.length, 0);
  assert.equal(after.createdBy, null);
  assert.equal(after.등록자, "김배차");
  assert.equal(after.등록자이메일, "kim@jy.com");
  assert.equal(after.작성자, "kim@jy.com");
  assert.equal(after.createdByUid, "u1");
});

t("ownerPatch — 예전 칸이 없으면 만들지 않는다 · 이름 없으면 null", () => {
  const p = ownerPatch({}, me);
  assert.deepEqual(Object.keys(p).sort(), ["createdByEmail", "createdByName", "createdByUid", "등록자명", "작성자"].sort());
  assert.equal(ownerPatch({}, { uid: "u1", name: "" }), null);
});

t("노선 주인표 — 맡기 · 넘겨받기 · 뺀 노선은 내 것만 지움", () => {
  const prev = { 녹수내수: { uid: "u2", name: "이직원" }, 보령KDF: { uid: "u1", name: "김배차", email: "kim@jy.com" }, 서산: { uid: "u2", name: "이직원" } };
  const m = mergeOwnerMap(prev, me, ["녹수내수", "아산내수"], { now: 1 });
  assert.deepEqual(Object.keys(m.next).sort(), ["녹수내수", "서산", "아산내수"]);
  assert.equal(m.next.녹수내수.uid, "u1");
  assert.equal(m.next.아산내수.email, "kim@jy.com");
  assert.deepEqual(m.taken, [{ group: "녹수내수", from: { uid: "u2", name: "이직원" } }]);
  assert.deepEqual(m.released, ["보령KDF"]);
  assert.equal(m.next.서산.uid, "u2"); // 다른 직원 것은 그대로
  assert.equal(m.changed, true);
  // 같은 걸 다시 저장 — 바뀐 것 없음
  const again = mergeOwnerMap(m.next, me, ["녹수내수", "아산내수"], { now: 2 });
  assert.equal(again.changed, false);
  assert.equal(again.next.녹수내수.at, 1);
});

t("노선 주인표 — [담당만 저장](claim:false)은 새로 맡지 않고 뺀 노선만 지운다", () => {
  const prev = { 녹수내수: { uid: "u2", name: "이직원" }, 보령KDF: { uid: "u1", name: "김배차" } };
  const m = mergeOwnerMap(prev, me, ["녹수내수", "아산내수"], { claim: false });
  assert.deepEqual(Object.keys(m.next).sort(), ["녹수내수"]);
  assert.equal(m.next.녹수내수.uid, "u2");
  assert.deepEqual(m.released, ["보령KDF"]);
  // 모두 빼면 내 것만 지운다
  const all = mergeOwnerMap(prev, me, []);
  assert.deepEqual(Object.keys(all.next), ["녹수내수"]);
  // uid 없는 사람은 아무것도 안 바꾼다
  assert.equal(mergeOwnerMap(prev, { name: "x" }, ["아산내수"]).changed, false);
});

t("새 오더 자동 지정 — 비었을 때만 · 노선 주인이 있을 때만", () => {
  const map = { 녹수내수: { uid: "u1", name: "김배차", email: "kim@jy.com" } };
  const sheetRow = { 이전출처: "녹수내수!20", 담당노선구분: "녹수내수", 상차일: "2026-11-20" };
  assert.equal(ownerEmpty(sheetRow), true);
  assert.deepEqual(autoOwnerPatch(sheetRow, map), { 등록자명: "김배차", createdByName: "김배차", createdByUid: "u1", createdByEmail: "kim@jy.com", 작성자: "kim@jy.com" });
  assert.equal(autoOwnerPatch({ ...sheetRow, 작성자: "구글시트 실시간" }, map) !== null, true); // 작성자가 사람이 아니면 비었음
  assert.equal(autoOwnerPatch({ ...sheetRow, 작성자: "lee@jy.com" }, map), null); // 등록한 사람이 있으면 그대로
  assert.equal(autoOwnerPatch({ ...sheetRow, 등록자명: "이직원" }, map), null);
  assert.equal(autoOwnerPatch({ 담당노선구분: "아산내수" }, map), null); // 주인 없는 노선
  assert.equal(autoOwnerPatch({ 상차일: "2026-11-20" }, map), null); // 노선 없음(일반오더)
  assert.equal(autoOwnerPatch({ ...sheetRow, 상태: "취소" }, map), null);
  assert.equal(autoOwnerPatch(sheetRow, null), null);
});

t("최종마감 잠금 — 승인됐고 일시해제가 아니면 잠김", () => {
  const cm = closeMapOf([{ kind: "close", client: "녹수", yyyymm: "2026-10", status: "approved" }, { kind: "stmt", client: "녹수", yyyymm: "2026-11", status: "approved" }]);
  assert.equal(isLockedOrder({ 거래처명: "녹수", 상차일: "2026-10-03" }, cm), true);
  assert.equal(isLockedOrder({ 거래처명: "녹수", 상차일: "2026-11-03" }, cm), false);
  assert.equal(isLockedOrder({ 거래처명: "", 상차일: "2026-10-03" }, cm), false);
  assert.equal(isLockedOrder({ 거래처명: "녹수", 상차일: "2026-10-03" }, new Map([["녹수|2026-10", { status: "submitted" }]])), false);
});

console.log(`\n${n}개 통과`);
