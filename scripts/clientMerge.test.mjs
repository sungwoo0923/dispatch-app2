// ⭐ 2026-11-17 거래처 합치기 테스트 — node scripts/clientMerge.test.mjs
import assert from "node:assert/strict";
import {
  normName, buildMergePatch, mergeContacts, mergeMemo, buildAliasMap, resolveClientAlias, resolveOrderClient,
  lockedSet, planOrders, planArDesk, renameRouteDoc, renamePrivateFareRules, chunks, plainValue,
} from "../src/clientMerge.js";
import { makeClientMatcher } from "../src/clientMatch.js";

const target = { id: "태진__큐런", 거래처명: "큐런", companyName: "태진", 사업자번호: "", 담당자: "김큐런", 연락처: "010-1111-2222", 메모: "월말 마감", aliases: ["큐런(구)"] };
const source = { id: "태진__큐런네트웍스", 거래처명: "큐런네트웍스 주식회사", companyName: "태진", 사업자번호: "123-45-67890", 대표자: "박대표", 담당자: "이담당", 연락처: "010-3333-4444",
  주소: "서울 강남구", 메모: "세금계산서 이메일 발행", 순수매출제외: false, createdAt: { toMillis: () => 1700000000000 } };

// ① 빈 칸 채우기 · 담당자 · 메모 · 다른 이름
{
  const { patch, filled } = buildMergePatch(target, [source], { mode: "fill", by: "a@b.c", at: 1 });
  assert.equal(patch.사업자번호, "123-45-67890", "빈 사업자번호는 채운다");
  assert.equal(patch.대표자, "박대표");
  assert.equal(patch.주소, "서울 강남구");
  assert.equal(patch.순수매출제외, false, "false 도 값이다(남길 쪽이 비었으면)");
  assert.equal(patch.담당자, undefined, "남길 거래처 담당자는 그대로");
  assert.equal(patch.거래처명, undefined, "이름은 바꾸지 않는다");
  assert.equal(patch.companyName, undefined);
  assert.equal(patch.createdAt, undefined);
  assert.deepEqual(patch.contacts.map((c) => c.name), ["김큐런", "이담당"], "담당자 목록 합침(대표는 남길 거래처)");
  assert.equal(patch.contacts[0].isPrimary, true);
  assert.equal(patch.메모, "월말 마감\n[큐런네트웍스 주식회사] 세금계산서 이메일 발행");
  assert.deepEqual(patch.aliases, ["큐런(구)", "큐런네트웍스 주식회사"]);
  assert.equal(patch.mergedFrom.length, 1);
  assert.equal(patch.mergedFrom[0].name, "큐런네트웍스 주식회사");
  assert.equal(patch.mergedFrom[0].data.createdAt, 1700000000000, "Timestamp 는 숫자로 남긴다");
  assert.ok(filled.includes("사업자번호") && filled.includes("메모") && filled.includes("담당자 목록"));
}
// ② 남길 거래처 정보 그대로(keep) — 다른 이름만
{
  const { patch, filled } = buildMergePatch(target, [source], { mode: "keep" });
  assert.deepEqual(Object.keys(patch).sort(), ["aliases", "mergedFrom"]);
  assert.deepEqual(filled, []);
}
// ③ 값이 있는 칸은 덮지 않는다 · 같은 이름(띄어쓰기만 다름)은 다른 이름으로 넣지 않는다
{
  const t = { 거래처명: "가나 상사", 사업자번호: "999", aliases: [] };
  const { patch } = buildMergePatch(t, [{ 거래처명: "가나상사", 사업자번호: "111" }, { 거래처명: "가나물류", 사업자번호: "222", aliases: ["가나 상사", "가나(주)"] }]);
  assert.equal(patch.사업자번호, undefined);
  assert.deepEqual(patch.aliases, ["가나물류", "가나(주)"]);
}
// ④ 담당자 · 메모 중복
assert.deepEqual(mergeContacts({ contacts: [{ name: "김", phone: "010-1", isPrimary: true }] }, [{ contacts: [{ name: "김", phone: "0101", isPrimary: true }, { name: "박", phone: "" }] }]).map((c) => c.name), ["김", "박"]);
assert.equal(mergeMemo({ 메모: "A" }, [{ 거래처명: "X", 메모: " a " }, { 거래처명: "Y", 메모: "B" }]), "A\n[Y] B");

// ⑤ 다른 이름 → 남길 이름
{
  const clients = [{ ...target, aliases: ["큐런네트웍스 주식회사", "큐런(구)"] }, { 거래처명: "큐런(구)" }];
  const m = buildAliasMap(clients);
  assert.equal(resolveClientAlias("큐런네트웍스주식회사", m), "큐런", "띄어쓰기 무시");
  assert.equal(resolveClientAlias(" 큐런네트웍스 주식회사 ", clients), "큐런");
  assert.equal(resolveClientAlias("큐런(구)", m), "큐런(구)", "같은 이름 거래처가 살아 있으면 그쪽");
  assert.equal(resolveClientAlias("모르는회사", m), "모르는회사");
  assert.equal(resolveClientAlias("", m), "");
  const o = { 거래처명: "큐런네트웍스 주식회사", 청구운임: 1 };
  assert.deepEqual(resolveOrderClient(o, m), { 거래처명: "큐런", 청구운임: 1 });
  const same = { 거래처명: "큐런" };
  assert.equal(resolveOrderClient(same, m), same, "바뀔 게 없으면 같은 객체");
  // 거래처 검색(clientMatch) 은 그대로
  assert.equal(makeClientMatcher("큐런", ["큐런", "큐런네트웍스 주식회사"])("큐런네트웍스 주식회사"), false);
}

// ⑥ 최종마감 달은 건너뛴다
const closes = [
  { kind: "close", client: "큐런네트웍스 주식회사", yyyymm: "2026-09", status: "approved" },
  { kind: "close", client: "큐런", yyyymm: "2026-08", status: "approved" },
  { kind: "close", client: "큐런네트웍스 주식회사", yyyymm: "2026-10", status: "approved", unlocked: true }, // 일시해제 → 잠금 아님
  { kind: "close", client: "큐런네트웍스 주식회사", yyyymm: "2026-11", status: "submitted" },
];
const locks = lockedSet(closes);
assert.deepEqual([...locks].sort(), ["큐런|2026-08", "큐런네트웍스 주식회사|2026-09"]);
const SRC = "큐런네트웍스 주식회사";
const orders = [
  { id: "1", 거래처명: SRC, 상차일: "2026-08-03" }, // 남길 거래처 8월 잠김
  { id: "2", 거래처명: SRC, 상차일: "2026-09-10" }, // 합칠 거래처 9월 잠김
  { id: "3", 거래처명: SRC, 상차일: "2026-10-01" }, // 일시해제
  { id: "4", 거래처명: SRC, 상차일: "2026-11-01" },
  { id: "5", 거래처명: SRC, 상차일: "2026-11-30", 마감월: "2026-09" }, // 마감월 기준 9월
  { id: "6", 거래처명: "다른회사", 상차일: "2026-11-01" },
];
{
  const p = planOrders(orders, { sources: [SRC], target: "큐런", locks });
  assert.deepEqual(p.update.map((o) => o.id), ["3", "4"]);
  assert.deepEqual(p.locked.map((o) => o.id), ["1", "2", "5"]);
  assert.deepEqual(p.bySource[SRC], { total: 5, update: 2, locked: 3, lockedYms: ["2026-08", "2026-09"] });
  const all = planOrders(orders, { sources: [SRC], target: "큐런", locks, includeLocked: true });
  assert.equal(all.update.length, 5);
  assert.equal(all.locked.length, 0);
}

// ⑦ 정산 기록 옮기기 — 겹치면 그대로, 잠긴 달은 그대로
{
  const docs = [
    { id: "a", kind: "stmt", client: SRC, biz: "", yyyymm: "2026-11", stage: "작성" },
    { id: "b", kind: "stmt", client: SRC, biz: "", yyyymm: "2026-10", stage: "작성" },
    { id: "c", kind: "stmt", client: "큐런", biz: "", yyyymm: "2026-10", stage: "계산서발행" }, // 겹침
    { id: "d", kind: "close", client: SRC, yyyymm: "2026-09", status: "approved" }, // 잠김
    { id: "e", kind: "client", client: SRC, biz: "" },
    { id: "f", kind: "form", client: SRC, cols: [] },
    { id: "g", kind: "dayclose", by: "x", date: "2026-11-01" }, // 거래처 기록 아님
    { id: "h", kind: "stmtSub", client: SRC, biz: "", yyyymm: "2026-11", sub: "냉동" },
  ];
  const idOf = (...p) => ["태진", ...p].join("__");
  const r = planArDesk(docs, { sources: [SRC], target: "큐런", locks, idOf });
  assert.deepEqual(r.move.map((m) => m.from.id), ["a", "e", "f", "h"]);
  assert.deepEqual(r.conflict.map((d) => d.id), ["b"]);
  assert.deepEqual(r.lockedSkip.map((d) => d.id), ["d"]);
  assert.equal(r.move[0].toId, "태진__stmt____큐런__2026-11");
  assert.equal(r.move[0].data.client, "큐런");
  assert.equal(r.move[0].data.mergedFromClient, SRC);
  assert.equal(r.move[0].data.id, undefined, "문서 이름은 data 에 넣지 않는다");
  assert.equal(r.move[2].toId, "태진__form__큐런");
  assert.equal(r.move[3].toId, "태진__stmtSub____큐런__2026-11__냉동");
  // 합칠 거래처가 둘이고 같은 달 기록이 둘 다 있으면 하나만 옮긴다
  const two = planArDesk([{ id: "x", kind: "close", client: "A", yyyymm: "2026-11" }, { id: "y", kind: "close", client: "B", yyyymm: "2026-11" }], { sources: ["A", "B"], target: "T", idOf });
  assert.deepEqual([two.move.length, two.conflict.length], [1, 1]);
}

// ⑧ 고정노선 · 비공개 운임
assert.deepEqual(renameRouteDoc({ client: SRC, stops: [{ name: "a" }, { name: "b", client: "큐런네트웍스주식회사" }] }, [SRC], "큐런"),
  { client: "큐런", stops: [{ name: "a" }, { name: "b", client: "큐런" }] });
assert.deepEqual(renameRouteDoc({ client: "다른", stops: [{ name: "b", client: SRC }] }, [SRC], "큐런"), { stops: [{ name: "b", client: "큐런" }] });
assert.equal(renameRouteDoc({ client: "다른", stops: [{ name: "a" }] }, [SRC], "큐런"), null);
assert.deepEqual(renamePrivateFareRules([{ name: SRC, mode: "pct", value: 5 }, { name: "Z" }], [SRC], "큐런"), [{ name: "큐런", mode: "pct", value: 5 }, { name: "Z" }]);
assert.deepEqual(renamePrivateFareRules([{ name: SRC }, { name: "큐런", mode: "manual" }], [SRC], "큐런"), [{ name: "큐런", mode: "manual" }], "남길 이름 규칙이 있으면 옛 것은 뺀다");
assert.equal(renamePrivateFareRules([{ name: "Z" }], [SRC], "큐런"), null);

// ⑨ 기타
assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.equal(normName(" 큐런 네트웍스 "), "큐런네트웍스");
assert.deepEqual(plainValue({ a: undefined, b: [1, { toMillis: () => 5 }], c: () => 1 }), { b: [1, 5] });

console.log("clientMerge.test.mjs OK");
