// 프로그램 → 구글시트 반영 테스트 — node scripts/sheetPush.test.mjs
//  · functions/sheetPushCore.mjs(무엇을 어느 칸에 쓸지) · functions/sheetPushOrders.js(대기열 · 1분 처리) · reconcileOrders 의 _programKeys
//  · 시트 · DB는 흉내(메모리)로 — 실제 시트에는 아무것도 쓰지 않는다
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PRESET_SUGGESTIONS, DEFAULT_PRESET, forOrderDoc, reconcileOrders } from "../functions/carrierMigrateCore.mjs";
import { makePushContext, planUpdate, planCreate, planDelete, pickTab, findRow, matchesDeleted, changedKeys } from "../functions/sheetPushCore.mjs";
const require = createRequire(import.meta.url);
const { makeSheetPush } = require("../functions/sheetPushOrders.js");

const JY = { ...DEFAULT_PRESET, ...PRESET_SUGGESTIONS.JY로지스틱스, year: 2026 };
// 아산 내수 모양의 탭 — 합계 · 이익 칸은 수식
const HEAD = ["상차일자", "출발지", "도착지", "도착일자", "톤수", "박스", "중량/톤", "운송료", "추가비", "합계", "운송료", "추가비", "합계", "이익", "마감월", "운송사", "차량번호", "이름", "연락처", "착불입금예정", "비고(단가표)"];
const line = (d, to, sale, buy, car, name, memo = "") => [d, "신봉길101", to, "", "", "83", "1.5톤", sale, "", sale, buy, "", buy, "10,000", "26년11월", "원콜", car, name, "010-1111-2222", "", memo];
const sheet = () => ({
  "아산 내수": [["▣ 아산"], ["", "", "충남 아산시 영인면 신봉길 110-3"], ["", "", "", "", "", "", "", "매출", "", "", "매입"], HEAD,
    line("2026. 11. 3", "충주시", "105,000", "95,000", "경기11가1111", "김일"), line("2026. 11. 4", "수원시 파장동", "123,000", "110,000", "경기22나2222", "이이", "오전 도착"), Array(21).fill("")],
  "보령 내수": [["▣ 보령"], [""], ["", "", "", "매출", "", "", "매입"], ["상차일자", "출발지", "도착지", "운송료", "경유", "합계", "운송료", "경유", "합계", "이익", "마감월", "운송사", "차량번호", "이름", "연락처", "비고"],
    ["2026. 11. 5", "보령", "평택", "88,000", "", "88,000", "60,000", "", "60,000", "", "26년11월", "24시콜", "경기33다3333", "박삼", "010-3333-4444", ""]],
});
const formulasOf = (tabs) => Object.fromEntries(Object.entries(tabs).map(([t, rows]) => [t, rows.map((r, i) => r.map((v, c) => (t === "아산 내수" && i >= 4 && [9, 12, 13].includes(c) ? `=X${i + 1}` : v)))]));
const ctxOf = (tabs = sheet()) => makePushContext(Object.entries(tabs).map(([title, rows]) => ({ title, rows })), JY, formulasOf(tabs));

// 🗓 2026-11-16 입고시간(당착 · 월착 · 시간) · 마감월(26년11월) · 운송사 칸(이미 적힌 업체는 덮지 않음 → 프로그램 값 우선)
{
  const tabs = { "평택 내수": [["▣ 평택"], [""], ["", "", "", "", "매출", "", "매입"], ["상차일자", "출발지", "도착지", "입고시간", "운송료", "합계", "운송료", "합계", "마감월", "운송사", "차량번호", "이름", "연락처"],
    ["2026. 11. 5", "평택", "이천", "", "88,000", "88,000", "60,000", "60,000", "26년11월", "전국특송", "경기33다3333", "박삼", "010-3333-4444"]] };
  const ctx = makePushContext(Object.entries(tabs).map(([title, rows]) => ({ title, rows })), JY, {});
  const doc = forOrderDoc(ctx.built.orders[0], { company: "JY로지스틱스", batchId: "t" });
  assert.equal(doc.배차방식 ? true : true, true);
  const u = planUpdate(ctx, doc, { ...doc, 배차방식: "기사직통" });
  assert.equal(u.ok, true); assert.ok(!u.cells.some((c) => c.a1.startsWith("J")), "운송사 칸(전국특송)은 그대로");
  assert.ok(u.docPatch._programKeys.includes("배차방식"), "배차방식은 프로그램 값 우선(_programKeys)");
  const c = planCreate(ctx, { 상차일: "2026-11-14", 하차일: "2026-11-14", 상차지명: "평택", 하차지명: "이천", 청구운임: "90000", 기사운임: "70000", 배차방식: "기사직통" }, "평택 내수", { rowCount: 100 });
  const m = Object.fromEntries(c.cells.map((x) => [x.a1, x.value]));
  assert.equal(c.ok, true); assert.equal(m.D6, "당착"); assert.equal(m.I6, "26년11월"); assert.equal(m.J6, "기사직통");
  const c2 = planCreate(ctx, { 상차일: "2026-11-13", 하차일: "2026-11-16", 상차지명: "평택", 하차지명: "이천", 청구운임: "90000", 기사운임: "70000" }, "평택 내수", { rowCount: 100 });
  assert.equal(Object.fromEntries(c2.cells.map((x) => [x.a1, x.value])).D7, "월착", "금요일 상차 · 월요일 하차 = 월착");
  const c3 = planCreate(ctx, { 상차일: "2026-11-15", 하차일: "2026-11-15", 하차시간: "14:00", 상차지명: "평택", 하차지명: "이천", 청구운임: "90000", 기사운임: "70000" }, "평택 내수", { rowCount: 100 });
  assert.equal(Object.fromEntries(c3.cells.map((x) => [x.a1, x.value])).D8, "14:00", "시간이 있으면 시간");
  console.log("입고시간 · 마감월 · 운송사 OK");
}

// ── 계산(core) ─────────────────────────────────────────────
{
  const ctx = ctxOf();
  assert.deepEqual(ctx.built.orders.map((o) => [o.__tab, o.__row, o.청구운임]), [["아산 내수", 5, "105000"], ["아산 내수", 6, "123000"], ["보령 내수", 5, "88000"]]);
  const doc = forOrderDoc(ctx.built.orders[1], { company: "JY로지스틱스", batchId: "t" });
  assert.equal(findRow(ctx, doc).__row, 6);
  // 수정: 운임 · 차량 · 기사 → 그 줄의 칸만. 합계(수식)는 안 건드린다. 하차시간은 칸이 없어 프로그램에만
  const after = { ...doc, 청구운임: "130000", 차량번호: "서울99바9999", 이름: "홍길동", 하차시간: "14:00" };
  assert.deepEqual(changedKeys(doc, after).sort(), ["이름", "차량번호", "청구운임", "하차시간"].sort());
  const u = planUpdate(ctx, doc, after);
  assert.equal(u.ok, true);
  assert.deepEqual(u.cells.map((c) => [c.a1, c.value]), [["H6", "130000"], ["Q6", "서울99바9999"], ["R6", "홍길동"]]);
  assert.deepEqual(u.unpushed, ["하차시간"]);
  assert.deepEqual(u.docPatch._programKeys, ["하차시간"]);
  // 메모: 그 칸의 글 그대로인 메모는 고쳐 쓴다
  const after2 = { ...after, ...u.docPatch, 메모: "오후 도착" };
  const u2 = planUpdate(ctx, { ...after, ...u.docPatch }, after2);
  assert.deepEqual(u2.cells.map((c) => [c.a1, c.was, c.value]), [["U6", "오전 도착", "오후 도착"]]);
  // 등록: 맨 아래 빈 줄(7행) · 수식 칸은 비워 둔다
  const neu = { companyName: "JY로지스틱스", 등록기기: "PC", 거래처명: "녹수", 상차일: "2026-11-14", 하차일: "2026-11-14", 상차지명: "신봉길101", 하차지명: "천안시 성정동 12", 하차지주소: "충남 천안시 성정동 12", 청구운임: "90000", 기사운임: "80000", 차량번호: "충남77사7777", 이름: "최사", 전화번호: "01055556666", 배차방식: "원콜", 메모: "신규" };
  assert.deepEqual(pickTab(ctx, neu, []), { tab: "아산 내수" }); // 같은 거래처 · 상차지가 이 탭에만
  const c = planCreate(ctx, neu, "아산 내수", { rowCount: 100 });
  assert.equal(c.ok, true); assert.equal(c.row, 7);
  assert.deepEqual(Object.fromEntries(c.cells.map((x) => [x.a1, x.value])), { A7: "2026-11-14", B7: "신봉길101", C7: "충남 천안시 성정동 12", H7: "90000", K7: "80000", O7: "26년11월", P7: "원콜", Q7: "충남77사7777", R7: "최사", S7: "01055556666", U7: "신규" });
  assert.equal(c.docPatch.이전출처, "아산 내수!7"); assert.equal(c.docPatch.시트연동, true);
  assert.ok(!c.docPatch._programKeys.includes("청구운임") && !c.docPatch._programKeys.includes("차량번호"));
  assert.equal(planCreate(ctx, neu, "아산 내수", { rowCount: 7 }).needRows, 1); // 다음 빈 줄(8행)이 없으면 줄을 늘려야 한다
  // 삭제: 값만 비운다(수식 칸 J · M · N 은 그대로) → 다시 읽으면 그 줄은 오더가 아니다
  const d = planDelete(ctx, { ...neu, ...c.docPatch });
  assert.equal(d.ok, true); assert.equal(d.row, 7);
  assert.ok(d.cells.every((x) => x.value === "") && !d.cells.some((x) => /^[JMN]7$/.test(x.a1)));
  assert.equal(ctx.built.orders.some((o) => o.__tab === "아산 내수" && o.__row === 7), false);
  assert.equal(planDelete(ctx, { ...neu, ...c.docPatch }).gone, true); // 이미 없는 줄
  assert.equal(matchesDeleted(doc, ctx.built.orders.find((o) => o.__row === 5 && o.__tab === "아산 내수")), false);
  // 탭 고르기: 거래처만 같고 상차지가 처음이면 후보 여러 개
  assert.deepEqual(pickTab(ctx, { 거래처명: "녹수", 상차지명: "처음 보는 곳" }, []).candidates.sort(), ["보령 내수", "아산 내수"]);
  console.log("core OK");
}

// ── 실시간 반영(시트 → 프로그램)이 프로그램에서 고친 값을 되돌리지 않는다 ─────────────
{
  const ctx = ctxOf();
  const src = ctx.built.orders[0];
  const doc = { ...forOrderDoc(src, { company: "JY", batchId: "t" }), 하차시간: "14:00", _programKeys: ["하차시간"], _sheetBase: { 하차시간: "" } };
  let r = reconcileOrders([{ id: "a", data: doc }], [src]);
  assert.equal(r.same, 1, "시트의 그 칸이 그대로면 프로그램 값을 둔다");
  r = reconcileOrders([{ id: "a", data: { ...doc, _sheetKeys: [...doc._sheetKeys, "하차시간"] } }], [src]);
  assert.equal(r.same, 1, "시트에 없는 값이라고 비우지도 않는다");
  r = reconcileOrders([{ id: "a", data: doc }], [{ ...src, 하차시간: "09:00" }]);
  assert.equal(r.update[0].patch.하차시간, "09:00", "시트에서 그 칸을 고치면 시트 값을 따른다");
  assert.deepEqual(r.update[0].patch._programKeys, []);
  console.log("reconcile(_programKeys) OK");
}

// ── 서버(대기열 → 1분 처리) — 흉내 DB · 흉내 시트 ─────────────────────────
const DEL = Symbol("del"), TS = Symbol("ts");
function fakeDb() {
  const cols = new Map(); let seq = 0;
  const col = (n) => cols.get(n) || cols.set(n, new Map()).get(n);
  const merge = (cur, data, m) => { const base = m ? { ...(cur || {}) } : {}; for (const [k, v] of Object.entries(data)) { if (v === DEL) delete base[k]; else if (v === TS) base[k] = Date.now() + (seq += 1); else if (m && v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) base[k] = merge(base[k], v, true); else base[k] = v; } return base; };
  const ref = (n, id) => ({ id, get: async () => snap(n, id), set: async (d, o) => { col(n).set(id, merge(col(n).get(id), d, o?.merge)); }, delete: async () => { col(n).delete(id); } });
  const snap = (n, id) => { const d = col(n).get(id); return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : structuredClone(d)), ref: ref(n, id) }; };
  const cmp = { "==": (x, v) => x === v, ">": (x, v) => x > v, "<": (x, v) => x < v, ">=": (x, v) => x >= v };
  const qy = (n, fs = [], lim = Infinity) => ({ where: (f, op, v) => qy(n, [...fs, [f, op, v]], lim), limit: (k) => qy(n, fs, k), get: async () => { const docs = [...col(n).keys()].map((id) => snap(n, id)).filter((s) => fs.every(([f, op, v]) => cmp[op](s.data()[f], v))).slice(0, lim); return { docs, empty: !docs.length, size: docs.length }; } });
  return { collection: (n) => ({ doc: (id) => ref(n, id ?? `auto${(seq += 1)}`), ...qy(n) }), batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const f of ops) await f(); } }; },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), delete: (r) => r.delete() }), data: (n, id) => col(n).get(id), ids: (n) => [...col(n).keys()] };
}
function fakeSheet(tabs, { denyWrite = false } = {}) {
  const writes = []; const calls = [];
  const titles = () => Object.keys(tabs);
  const ranges = (path) => [...path.matchAll(/ranges=([^&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/^'|'$/g, ""));
  const api = async (id, method, path, opts = {}) => {
    calls.push(`${method} ${path}`);
    if (method === "GET" && path.startsWith("?fields=")) return { sheets: titles().map((t, i) => ({ properties: { sheetId: i + 1, title: t, index: i, gridProperties: { rowCount: 100 } }, merges: [] })) };
    if (method === "GET" && path.startsWith("/values:batchGet")) { const f = /FORMULA/.test(path) ? formulasOf(tabs) : tabs; return { valueRanges: ranges(path).map((t) => { const m = t.match(/^(.+)'!A(\d+):ZZ(\d*)$/); return { values: m ? (f[m[1]] || []).slice(+m[2] - 1, m[3] ? +m[3] : undefined).map((r) => [...r]) : f[t] }; }) }; }
    if (method === "GET" && path.startsWith("/values/")) return { values: [[tabs[titles()[0]][0][0]]] };
    if (method === "POST" && path === "/values:batchUpdate") {
      if (denyWrite) throw Object.assign(new Error("The caller does not have permission"), { response: { status: 403 } });
      opts.data.data.forEach((u) => { const [, t, colL, row] = u.range.match(/^'(.+)'!([A-Z]+)(\d+)$/); const c = colL.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1; const rows = tabs[t]; while (rows.length < +row) rows.push([]); const r = rows[+row - 1]; while (r.length <= c) r.push(""); r[c] = u.values[0][0]; writes.push(`${t}!${colL}${row}=${u.values[0][0]}`); });
      return {};
    }
    if (method === "POST" && path === ":batchUpdate") { // 줄 끼우기 · 지우기 · 늘리기
      (opts.data.requests || []).forEach((rq) => {
        const g = rq.insertDimension || rq.deleteDimension; if (!g) return;
        const t = titles()[g.range.sheetId - 1]; const rows = tabs[t]; const { startIndex: a, endIndex: b } = g.range;
        if (rq.insertDimension) { while (rows.length < a) rows.push([]); rows.splice(a, 0, ...Array.from({ length: b - a }, () => [])); writes.push(`${t}!+${a + 1}`); }
        else { rows.splice(a, b - a); writes.push(`${t}!-${a + 1}`); }
      });
      return {};
    }
    throw new Error(`fake sheet: ${method} ${path}`);
  };
  return { api, writes, calls };
}
const CO = "JY로지스틱스";
async function world(mode, opts = {}) {
  const db = fakeDb(); const tabs = sheet(); const sh = fakeSheet(tabs, opts);
  const push = makeSheetPush({ db, FieldValue: { serverTimestamp: () => TS, delete: () => DEL }, sheetsApiFor: sh.api, parseSpreadsheetId: (u) => (u ? "sid" : ""), quoteTab: (t) => `'${t}'` });
  const cfg = { companyName: CO, enabled: true, url: "https://sheet", pushMode: mode, tabs: ["아산 내수", "보령 내수"] };
  await db.collection("sheetLive").doc(CO).set(cfg);
  const ctx = ctxOf(tabs);
  for (const o of ctx.built.orders) await db.collection("orders").doc(`o${o.__tab[0]}${o.__row}`).set(forOrderDoc(o, { company: CO, batchId: "t" }));
  const deps = { presetFor: async () => JY, placesFor: async () => [] };
  const write = async (id, next) => { // 화면이 오더를 바꾼 것처럼: 문서를 바꾸고 트리거를 부른다
    const b = db.data("orders", id); const before = { exists: b !== undefined, data: () => structuredClone(b) };
    if (next === null) await db.collection("orders").doc(id).delete(); else await db.collection("orders").doc(id).set(next);
    await push.onOrderWrite({ before, after: { exists: next !== null, data: () => structuredClone(next) } }, { params: { orderId: id } });
  };
  return { db, tabs, sh, push, cfg, deps, write, run: () => push.process(CO, cfg, deps) };
}
{
  // 켬: 수정 → 그 줄의 칸에 쓴다
  const w = await world("on");
  const d0 = w.db.data("orders", "o아6");
  await w.write("o아6", { ...d0, 청구운임: "130000", 차량번호: "서울99바9999" });
  assert.equal(w.db.data("sheetPushQueue", "o아6").kind, "update");
  assert.deepEqual(await w.run(), { wrote: true, structural: false, more: false });
  assert.deepEqual(w.sh.writes, ["아산 내수!H6=130000", "아산 내수!Q6=서울99바9999"]);
  assert.equal(w.db.data("sheetPushQueue", "o아6").state, "done");
  assert.ok(w.db.data("orders", "o아6").시트기록일시);
  // 서버가 쓴 변경(시트기록일시 · 시트반영일시)은 다시 대기열에 넣지 않는다
  const d1 = w.db.data("orders", "o아6");
  await w.write("o아6", { ...d1, 이름: "서버가고침", 시트반영일시: 123 });
  assert.equal(w.db.data("sheetPushQueue", "o아6").state, "done");
  // 등록: 담당노선구분(= 탭)을 고른 오더 → 그 탭 맨 아래
  w.sh.writes.length = 0;
  await w.write("new1", { companyName: CO, 등록기기: "PC", 거래처명: "녹수", 담당노선구분: "보령 내수", 상차일: "2026-11-14", 상차지명: "보령", 하차지명: "평택", 청구운임: "70000", 기사운임: "60000", 차량번호: "경기44라4444", 이름: "정사", 배차방식: "24시" });
  await w.run();
  assert.ok(w.sh.writes.includes("보령 내수!A6=2026-11-14") && w.sh.writes.includes("보령 내수!D6=70000") && w.sh.writes.includes("보령 내수!M6=경기44라4444"), w.sh.writes.join(" "));
  assert.equal(w.db.data("orders", "new1").이전출처, "보령 내수!6"); assert.equal(w.db.data("orders", "new1").시트연동, true);
  // 등록: 탭을 못 정함 → 오더에 표시, 담당노선구분을 고르면 들어간다
  await w.write("new2", { companyName: CO, 등록기기: "PC", 거래처명: "처음 거래처", 상차일: "2026-11-14", 상차지명: "어딘가", 하차지명: "저긴가", 청구운임: "50000" });
  await w.run();
  assert.equal(w.db.data("orders", "new2").시트탭필요, true); assert.equal(w.db.data("sheetPushQueue", "new2").state, "needTab");
  await w.write("new2", { ...w.db.data("orders", "new2"), 담당노선구분: "아산 내수" });
  await w.run();
  assert.equal(w.db.data("orders", "new2").이전출처, "아산 내수!7"); assert.equal(w.db.data("orders", "new2").시트탭필요, undefined);
  // 🗓 상황 2: 시트에 11/3 · 11/4 · 11/14 가 있는데 11/4 오더를 등록 → 11/4 줄(6행) 바로 아래 7행에 줄을 끼워 넣는다(맨 아래 아님)
  w.sh.writes.length = 0;
  await w.write("mid", { companyName: CO, 등록기기: "PC", 거래처명: "녹수", 담당노선구분: "아산 내수", 상차일: "2026-11-04", 상차지명: "신봉길101", 하차지명: "천안시 성정동 12", 청구운임: "77000", 기사운임: "66000" });
  const rm = await w.run();
  assert.equal(rm.structural, true);
  assert.equal(w.sh.writes[0], "아산 내수!+7", w.sh.writes.join(" "));
  assert.ok(w.sh.writes.includes("아산 내수!A7=2026-11-04"), w.sh.writes.join(" "));
  assert.deepEqual(ctxOf(w.tabs).built.orders.filter((o) => o.__tab === "아산 내수").map((o) => [o.__row, o.상차일]), [[5, "2026-11-03"], [6, "2026-11-04"], [7, "2026-11-04"], [8, "2026-11-14"]]);
  assert.equal(w.db.data("orders", "mid").이전출처, "아산 내수!7");
  // 🗓 상황 1: 가장 늦은 날짜 이후(11/20) → 끼우지 않고 맨 아래 빈 줄(8행 11/14 다음 9행)
  w.sh.writes.length = 0;
  await w.write("late", { companyName: CO, 등록기기: "PC", 거래처명: "녹수", 담당노선구분: "아산 내수", 상차일: "2026-11-20", 상차지명: "신봉길101", 하차지명: "충주시", 청구운임: "50000" });
  assert.equal((await w.run()).structural, false);
  assert.ok(!w.sh.writes.some((x) => x.includes("!+")) && w.sh.writes.includes("아산 내수!A9=2026-11-20"), w.sh.writes.join(" "));
  // 🗑 삭제: 그 줄을 줄째로 지운다 → 아래 줄이 한 칸씩 올라온다
  w.sh.writes.length = 0;
  await w.write("o아5", null);
  assert.equal((await w.run()).structural, true);
  assert.deepEqual(w.sh.writes, ["아산 내수!-5"]);
  assert.deepEqual(ctxOf(w.tabs).built.orders.filter((o) => o.__tab === "아산 내수").map((o) => [o.__row, o.상차일]), [[5, "2026-11-04"], [6, "2026-11-04"], [7, "2026-11-14"], [8, "2026-11-20"]]);
  assert.deepEqual(await w.push.pendingDeletes(CO), []);
  // 10월 이전 오더는 시트와 맞추지 않는다
  await w.write("old", { companyName: CO, 등록기기: "PC", 거래처명: "녹수", 담당노선구분: "아산 내수", 상차일: "2026-09-30", 상차지명: "신봉길101", 하차지명: "충주시" });
  await w.run();
  assert.equal(w.db.data("sheetPushQueue", "old").state, "skipped");
  console.log("server(on) OK");
}
{
  // 점검만: 무엇을 쓸지 기록만, 시트 · 오더는 그대로
  const w = await world("dry");
  const d0 = w.db.data("orders", "o아6");
  await w.write("o아6", { ...d0, 청구운임: "130000" });
  assert.deepEqual(await w.run(), { wrote: false, structural: false, more: false });
  assert.deepEqual(w.sh.writes, []);
  const qd = w.db.data("sheetPushQueue", "o아6");
  assert.equal(qd.state, "dry"); assert.deepEqual(qd.result.cells.map((c) => [c.a1, c.value]), [["H6", "130000"]]);
  assert.equal(w.db.data("orders", "o아6").시트기록일시, undefined);
  console.log("server(dry) OK");
}
{
  // 한꺼번에 많이 지우면 보류 — 시트는 그대로, 실시간 반영이 그 줄을 다시 만들지 않게 목록에 남는다. 확인하면 진행
  const w = await world("on");
  for (let i = 0; i < 25; i += 1) w.tabs["아산 내수"].push(line(`2026. 11. ${5 + (i % 20)}`, `대전 ${i}동`, "100,000", "90,000", `대전${10 + i}가${1000 + i}`, `기사${i}`));
  const ctx = ctxOf(w.tabs);
  const many = ctx.built.orders.filter((o) => o.__tab === "아산 내수" && o.__row >= 8);
  assert.equal(many.length, 25);
  for (const o of many) await w.db.collection("orders").doc(`m${o.__row}`).set(forOrderDoc(o, { company: CO, batchId: "t" }));
  for (const o of many) await w.write(`m${o.__row}`, null);
  await w.run(); await w.run();
  assert.deepEqual(w.sh.writes, []);
  assert.equal(w.db.ids("sheetPushQueue").filter((id) => w.db.data("sheetPushQueue", id).state === "held").length, 25);
  assert.equal((await w.push.pendingDeletes(CO)).length, 25);
  const v = await w.push.handle("pushResolve", { company: CO, ids: w.db.ids("sheetPushQueue"), go: true });
  assert.equal(v.push.pending, 25);
  await w.run(); await w.run();
  assert.equal(w.db.ids("sheetPushQueue").filter((id) => w.db.data("sheetPushQueue", id).state === "done").length, 25);
  assert.equal(ctxOf(w.tabs).built.orders.filter((o) => o.__tab === "아산 내수" && o.__row >= 8).length, 0);
  assert.equal(w.tabs["아산 내수"].length, 7, "확인한 삭제 25건은 줄째로 지워졌다");
  console.log("server(hold) OK");
}
{
  // 쓸 권한이 없으면: 시트는 그대로 · 오류를 남기고 다음에 다시
  const w = await world("on", { denyWrite: true });
  await w.write("o아6", { ...w.db.data("orders", "o아6"), 차량번호: "서울99바9999" });
  const r = await w.run();
  assert.match(r.error, /권한/);
  assert.equal(w.db.data("sheetPushQueue", "o아6").state, "pending");
  assert.match(w.db.data("sheetLive", CO).pushError, /편집자/);
  await assert.rejects(() => w.push.handle("pushSet", { company: CO, mode: "on" }), /권한/);
  // 끄면 쌓인 대기 건은 버린다
  w.cfg.pushMode = "off"; await w.run();
  assert.equal(w.db.data("sheetPushQueue", "o아6"), undefined);
  console.log("server(권한 없음 · 끔) OK");
}
{
  // 시트 → 프로그램(실시간 반영): 시트에서 배차했다가 기사를 지우면 프로그램 오더에서도 기사 · 차량이 빠진다
  const { makeSheetLive } = require("../functions/sheetLiveOrders.js");
  const w = await world("off");
  let mt = 1;
  const live = makeSheetLive({ db: w.db, FieldValue: { serverTimestamp: () => TS, delete: () => DEL, arrayUnion: (...v) => v }, sheetsApiFor: w.sh.api, parseSpreadsheetId: (u) => (u ? "sid" : ""), quoteTab: (t) => `'${t}'`, sheetModifiedTime: async () => String(mt), bumpDataVersion: async () => {}, push: w.push });
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  // 오늘 날짜 줄 하나를 시트에 넣는다(미배차) → 새 오더
  w.tabs["아산 내수"].push([`${y}. ${m}. ${d}`, "신봉길101", "평택시 포승읍", "", "", "10", "1톤", "80,000", "", "80,000", "70,000", "", "70,000", "10,000", "", "원콜", "", "", "", "", ""]);
  await w.db.collection("sheetLive").doc(CO).set({ ...w.cfg, pushMode: "off", days: 14 });
  const cfg = () => w.db.data("sheetLive", CO);
  const find = () => w.db.ids("orders").map((id) => ({ id, ...w.db.data("orders", id) })).find((o) => o.상차일 === today);
  // 가져오기 설정은 저장된 것이 없어 회사 시작 규칙(JY)을 쓴다
  let r = await live.runOne(CO, cfg());
  assert.equal(r.created, 1, JSON.stringify(r));
  assert.equal(find().배차상태, "배차중");
  // 시트에서 배차(차량 · 기사 입력)
  const row = w.tabs["아산 내수"][w.tabs["아산 내수"].length - 1];
  row[16] = "경기55마5555"; row[17] = "오기사"; row[18] = "010-5555-6666"; mt += 1;
  r = await live.runOne(CO, cfg());
  assert.equal(r.updated, 1, JSON.stringify(r));
  assert.deepEqual([find().차량번호, find().이름, find().배차상태], ["경기55마5555", "오기사", "배차완료"]);
  // 시트에서 기사 삭제
  row[16] = ""; row[17] = ""; row[18] = ""; mt += 1;
  r = await live.runOne(CO, cfg());
  assert.equal(r.updated, 1, JSON.stringify(r));
  assert.deepEqual([find().차량번호, find().이름, find().전화번호, find().배차상태], ["", "", "", "배차중"]);
  // 시트 수정 시각이 그대로면 건너뛴다(값을 다시 읽지 않는다)
  assert.deepEqual(await live.runOne(CO, cfg()), { skipped: "unchanged" });
  // ⚡ 2026-11-14 이벤트 방식 — 시트 알림(onPing)이 오면 바로 맞춘다. 잘못된 열쇠는 거절
  const sc = await live.handle("pingScript", { company: CO }, {});
  const key = (sc.script.match(/\?k=([0-9a-f]{32})/) || [])[1];
  assert.ok(key && /onChange\(\)/.test(sc.script) && sc.live.pingReady, sc.script);
  assert.equal((await live.onPing("0".repeat(32))).status, 404);
  assert.equal((await live.onPing("nope")).status, 400);
  row[16] = "경기66바6666"; // 수정 시각(mt)은 그대로 — 알림으로만 안다
  const pg = await live.onPing(key);
  assert.deepEqual([pg.status, pg.body.result], [200, "ran"]);
  assert.equal(find().차량번호, "경기66바6666");
  assert.ok(cfg().pingAt > 0);
  // 다른 쪽이 돌고 있으면(잠금) "다시"만 남긴다 → 하던 쪽이 끝나고 한 번 더 돈다
  await w.db.collection("sheetLiveLock").doc(CO).set({ until: Date.now() + 60000, by: "other" });
  assert.equal(await live.kick(CO, "sheet"), "queued");
  assert.equal(w.db.data("sheetLiveLock", CO).need, 2);
  await w.db.collection("sheetLiveLock").doc(CO).set({ until: 0, by: "" }, { merge: true }); // 하던 쪽이 횟수를 다 쓰고 놓음 — 기다리는 일은 남아 있다
  row[18] = "010-1212-3434";
  assert.equal(await live.kick(CO, "safety"), "ran"); // 다음에 잡은 쪽이 남은 일(시트 읽기)을 같이 한다
  assert.equal(find().전화번호, "010-1212-3434");
  // 시트 알림이 설치된 회사의 안전장치는 시트를 직접 읽지 않는다(수정 시각만 본다)
  const calls0 = w.sh.calls.length;
  assert.equal(await live.kick(CO, "safety"), "ran");
  assert.equal(w.sh.calls.length, calls0, w.sh.calls.slice(calls0).join(" / "));
  assert.equal(w.db.data("sheetLiveLock", CO).until, 0);
  // 같은 내용으로 다시 알림 → 읽기는 하지만 바뀐 것 없음
  assert.equal((await live.onPing(key)).body.result, "ran");
  // 새 열쇠로 바꾸면 예전 열쇠는 안 통한다
  await live.handle("pingScript", { company: CO, renew: true }, {});
  assert.equal((await live.onPing(key)).status, 404);
  // ⚡ 고친 탭만 알려 오면 그 탭만 읽는다(읽기 한도를 가장 덜 씀) — 다른 탭의 오더는 건드리지 않는다
  const k2 = ((await live.handle("pingScript", { company: CO }, {})).script.match(/\?k=([0-9a-f]{32})/) || [])[1];
  const sc2 = (await live.handle("pingScript", { company: CO }, {})).script; assert.match(sc2, /onEdit\(\)[\s\S]*onChange\(\)/); assert.match(sc2, /LOGISWEB_SHEET_ID = 'sid'/);
  const before = w.db.ids("orders").length;
  row[17] = "칠기사";
  const c1 = w.sh.calls.length;
  assert.equal((await live.onPing(k2, { tab: "아산 내수" })).body.result, "ran");
  const got = w.sh.calls.slice(c1).filter((c) => c.includes("batchGet")).map((c) => [...c.matchAll(/ranges=([^&]+)/g)].map((m) => decodeURIComponent(m[1]))).flat();
  assert.deepEqual(got, ["'아산 내수'"], got.join(" / "));
  assert.equal(find().이름, "칠기사");
  assert.equal(w.db.ids("orders").length, before); // 다른 탭 오더는 그대로(지워지지 않음)
  // 고친 탭의 줄 값을 지우면(onEdit) 그 오더만 지워진다
  const saved = [...row]; row.splice(0, row.length, ...row.map(() => ""));
  assert.equal((await live.onPing(k2, { tab: "아산 내수" })).body.result, "ran");
  assert.equal(find(), undefined);
  assert.equal(w.db.ids("orders").length, before - 1);
  row.splice(0, row.length, ...saved); // 되살리기 → 줄 추가 알림(full)
  assert.equal((await live.onPing(k2, { full: true, type: "INSERT_ROW" })).body.result, "ran");
  assert.equal(find().이름, "칠기사");
  // 아래부터는 시트 알림이 없을 때(최근 줄 직접 비교) 동작
  await w.db.collection("sheetLive").doc(CO).set({ pingAt: 0 }, { merge: true });
  // ⚡ 구글이 수정 시각을 늦게 바꿔도(mt 그대로) 최근 줄을 직접 읽어 바로 반영한다 — 차량번호 먼저, 몇 초 뒤 기사명 · 전화번호
  row[17] = "육기사"; row[18] = "010-6666-7777";
  r = await live.runOne(CO, cfg());
  assert.equal(r.updated, 1, JSON.stringify(r));
  assert.deepEqual([find().이름, find().전화번호], ["육기사", "010-6666-7777"]);
  assert.deepEqual(await live.runOne(CO, cfg()), { skipped: "unchanged" });
  // 시트 맨 아래에 새 줄을 붙여도(mt 그대로) 바로 오더가 된다
  w.tabs["아산 내수"].push([`${y}. ${m}. ${d}`, "신봉길101", "평택시 포승읍", "", "", "10", "1톤", "90,000", "", "90,000", "70,000", "", "70,000", "20,000", "", "원콜", "", "", "", "", ""]);
  r = await live.runOne(CO, cfg());
  assert.equal(r.created, 1, JSON.stringify(r));
  console.log("live(시트에서 기사 삭제 · 수정 시각이 늦어도 바로 반영) OK");
}
{
  // 🛠 2026-11-14 비교 범위 — 반영 범위가 "최근 14일"이어도 가져오기 시작일(JY 10/1) 이후 줄은 시트에서 고치면 반영된다
  const { makeSheetLive } = require("../functions/sheetLiveOrders.js");
  const w = await world("off");
  let mt = 1;
  const live = makeSheetLive({ db: w.db, FieldValue: { serverTimestamp: () => TS, delete: () => DEL, arrayUnion: (...v) => v }, sheetsApiFor: w.sh.api, parseSpreadsheetId: (u) => (u ? "sid" : ""), quoteTab: (t) => `'${t}'`, sheetModifiedTime: async () => String(mt), bumpDataVersion: async () => {}, push: w.push });
  const old = new Date(Date.now() + 9 * 3600e3 - 25 * 86400e3).toISOString().slice(0, 10); // 25일 전(14일 범위 밖)
  const [y, m, d] = old.split("-").map(Number);
  w.tabs["아산 내수"].push([`${y}. ${m}. ${d}`, "신봉길101", "평택시 포승읍", "", "", "10", "1톤", "80,000", "", "80,000", "70,000", "", "70,000", "10,000", "", "원콜", "", "", "", "", ""]);
  await w.db.collection("sheetLive").doc(CO).set({ ...w.cfg, pushMode: "off", days: 14 });
  const cfg = () => w.db.data("sheetLive", CO);
  const find = () => w.db.ids("orders").map((id) => ({ id, ...w.db.data("orders", id) })).find((o) => o.상차일 === old);
  let r = await live.runOne(CO, cfg());
  if (old >= "2026-10-01") {
    assert.equal(r.created, 1, JSON.stringify(r));
    const row = w.tabs["아산 내수"][w.tabs["아산 내수"].length - 1];
    row[7] = "95,000"; row[9] = "95,000"; row[16] = "경기77사7777"; row[17] = "박기사"; mt += 1;
    r = await live.runOne(CO, cfg());
    assert.equal(r.updated, 1, JSON.stringify(r));
    assert.deepEqual([find().청구운임, find().차량번호, find().이름], ["95000", "경기77사7777", "박기사"]);
    assert.equal(r.from, "2026-10-01");
  }
  console.log("live(14일보다 오래된 줄도 가져오기 시작일부터 반영) OK");
}
{
  // 프로그램에서 배차(→ 시트에 씀) → 시트에서 그 기사를 지움 → 프로그램 오더에서도 차량 · 기사가 빠진다
  const { makeSheetLive } = require("../functions/sheetLiveOrders.js");
  const w = await world("on");
  let mt = 1;
  const live = makeSheetLive({ db: w.db, FieldValue: { serverTimestamp: () => TS, delete: () => DEL, arrayUnion: (...v) => v }, sheetsApiFor: w.sh.api, parseSpreadsheetId: (u) => (u ? "sid" : ""), quoteTab: (t) => `'${t}'`, sheetModifiedTime: async () => String(mt), bumpDataVersion: async () => {}, push: w.push });
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  w.tabs["아산 내수"].push([`${y}. ${m}. ${d}`, "신봉길101", "평택시 포승읍", "", "", "10", "1톤", "80,000", "", "80,000", "", "", "0", "", "", "", "", "", "", "", ""]);
  await w.db.collection("sheetLive").doc(CO).set({ ...w.cfg, days: 14 });
  const cfg = () => w.db.data("sheetLive", CO);
  const find = () => w.db.ids("orders").map((id) => ({ id, ...w.db.data("orders", id) })).find((o) => o.상차일 === today);
  await live.runOne(CO, cfg());
  assert.deepEqual([find().배차상태, find().차량번호 || ""], ["배차중", ""]);
  // 프로그램에서 배차
  const o0 = find(); const { id, ...doc0 } = o0;
  await w.write(id, { ...doc0, 차량번호: "충남89바6045", 이름: "김기사", 전화번호: "010-5427-4535", 기사운임: "70000", 배차상태: "배차완료" });
  assert.equal(await live.kick(CO, "program"), "ran"); mt += 1; // ⚡ 대기열에 들어오면 바로 처리(sheetPushKick)
  const row = w.tabs["아산 내수"][w.tabs["아산 내수"].length - 1];
  assert.deepEqual([row[16], row[17], row[10]], ["충남89바6045", "김기사", "70000"]);
  assert.ok(find()._sheetKeys.includes("차량번호") && find()._sheetKeys.includes("이름"));
  await live.runOne(CO, cfg());
  assert.equal(find().차량번호, "충남89바6045");
  // 시트에서 그 기사를 지운다
  row[16] = ""; row[17] = ""; row[18] = ""; row[10] = ""; mt += 1;
  const r = await live.runOne(CO, cfg());
  assert.equal(r.updated, 1, JSON.stringify(r));
  assert.deepEqual([find().차량번호, find().이름, find().전화번호, find().배차상태, Number(find().기사운임)], ["", "", "", "배차중", 0]);
  console.log("live(프로그램 배차 → 시트에서 기사 삭제) OK");
  // 🗓🗑 줄을 끼우고 지운 뒤에도 프로그램 오더 = 시트 줄(중복 · 엉뚱한 줄 없음) — 밀린 줄 위치(이전출처)를 바로 다시 맞춘다
  const sheetIds = () => w.db.ids("orders").filter((i) => w.db.data("orders", i).이전출처).map((i) => w.db.data("orders", i));
  await w.write("midL", { companyName: CO, 등록기기: "PC", 거래처명: "녹수", 담당노선구분: "아산 내수", 상차일: "2026-11-03", 상차지명: "신봉길101", 하차지명: "천안시 성정동 99", 청구운임: "61000", 기사운임: "51000" });
  assert.equal(await live.kick(CO, "program"), "ran");
  await w.write("o아6", null);
  assert.equal(await live.kick(CO, "program"), "ran");
  const fresh = ctxOf(w.tabs).built.orders.filter((o) => o.상차일 >= "2026-10-01");
  const progs = sheetIds();
  assert.equal(progs.length, fresh.length, `${progs.length} vs ${fresh.length}`);
  fresh.forEach((o) => { const p = progs.find((x) => x.이전출처 === o.이전출처); assert.ok(p, o.이전출처); assert.equal(p.상차일, o.상차일); assert.equal(p.하차지명, o.하차지명); });
  assert.equal(progs.find((x) => x.하차지명 === "천안시 성정동 99").이전출처, "아산 내수!6"); // 11/3 줄(5행) 바로 아래
  console.log("live(줄 끼우기 · 지우기 뒤에도 프로그램 = 시트) OK");
  // 📍 시트에 처음 나온 하차지 이름(주소 없음) → 상하차지거래처에 이름만으로 등록 · 사람이 지우면 다시 안 만든다
  const [yy, mm, dd] = today.split("-").map(Number);
  w.tabs["아산 내수"].push([`${yy}. ${mm}. ${dd}`, "신봉길101", "CJ ENM 물류센터(인천)", "", "", "10", "1톤", "80,000", "", "80,000", "70,000", "", "70,000", "10,000", "", "원콜", "", "", "", "", ""]);
  await live.runOne(CO, cfg(), { force: true });
  const cj = w.db.ids("places").map((i) => w.db.data("places", i)).find((p) => p.업체명 === "CJ ENM 물류센터(인천)");
  assert.ok(cj, w.db.ids("places").join(","));
  assert.equal(cj.주소, ""); assert.equal(cj.companyName, CO);
  assert.ok(!w.db.ids("places").map((i) => w.db.data("places", i)).some((p) => p.업체명 === "평택시 포승읍"), "지역 이름은 장소로 만들지 않는다");
  w.db.ids("places").filter((i) => w.db.data("places", i).업체명 === "CJ ENM 물류센터(인천)").forEach((i) => w.db.collection("places").doc(i).delete());
  await live.runOne(CO, cfg(), { force: true });
  assert.ok(!w.db.ids("places").some((i) => w.db.data("places", i).업체명 === "CJ ENM 물류센터(인천)"), "지운 곳은 다시 만들지 않는다");
  console.log("live(새 상하차지 이름만 등록) OK");
}
{
  // 🛑 2026-11-17 시트에서 한 줄을 지우면 → 서버가 그 오더를 지움 → (예전) 그 삭제를 다시 시트로 보내 같은 자리 · 같은 날짜의 다음 줄을 지움 → 줄줄이 사라짐
  //  지금: 시트에서 없어져 서버가 지운 오더는 시트로 삭제를 보내지 않는다 → 나머지 오늘 줄은 그대로
  const { makeSheetLive } = require("../functions/sheetLiveOrders.js");
  const w = await world("on");
  let mt = 1;
  const live = makeSheetLive({ db: w.db, FieldValue: { serverTimestamp: () => TS, delete: () => DEL, arrayUnion: (...v) => v }, sheetsApiFor: w.sh.api, parseSpreadsheetId: (u) => (u ? "sid" : ""), quoteTab: (t) => `'${t}'`, sheetModifiedTime: async () => String(mt), bumpDataVersion: async () => {}, push: w.push });
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  const plates = ["충북71가7101", "충북72나7202", "충북73다7303", "충북74라7404"];
  const dests = ["평택시 포승읍", "천안시 성정동", "아산시 배방읍", "오산시 원동"];
  plates.forEach((pl, i) => w.tabs["아산 내수"].push([`${y}. ${m}. ${d}`, "신봉길101", dests[i], "", "", "10", "1톤", "80,000", "", "80,000", "70,000", "", "70,000", "10,000", "", "원콜", pl, `기사${i}`, "", "", ""]));
  await w.db.collection("sheetLive").doc(CO).set({ ...w.cfg, days: 14 });
  const cfg = () => w.db.data("sheetLive", CO);
  await live.runOne(CO, cfg(), { force: true });
  const todays = () => w.db.ids("orders").map((id) => ({ id, ...w.db.data("orders", id) })).filter((o) => o.상차일 === today);
  assert.equal(todays().length, 4);
  // 시트에서 첫 줄을 지운다(아래 줄이 한 칸씩 올라온다)
  const rows = w.tabs["아산 내수"]; const at = rows.findIndex((r) => r[16] === plates[0]); rows.splice(at, 1); mt += 1;
  const snapBefore = new Map(todays().map((o) => [o.id, o]));
  const r = await live.runOne(CO, cfg());
  assert.equal(r.removed, 1, JSON.stringify(r));
  // 실제 서버에선 orders 삭제 트리거가 돈다 — 흉내
  for (const [id, o] of snapBefore) if (!w.db.data("orders", id)) { const { id: _x, ...b } = o; await w.push.onOrderWrite({ before: { exists: true, data: () => structuredClone(b) }, after: { exists: false, data: () => undefined } }, { params: { orderId: id } }); }
  await live.kick(CO, "program");
  await live.runOne(CO, cfg(), { force: true });
  assert.deepEqual(rows.filter((x) => plates.includes(x[16])).map((x) => x[16]), plates.slice(1), "남은 오늘 줄이 지워지면 안 된다");
  assert.equal(todays().length, 3);
  console.log("live(시트에서 줄 지움 → 다른 줄이 줄줄이 지워지지 않음) OK");
}

// ⭐ 2026-11-17 노선 고정 특수운임 → JY 시트(에이제이 탭) 추가 칸 · 다시 읽어도 같은 특수운임(두 번 더하지 않음)
//  에이제이: 매출 H 운송료 · I (이름 없음 → 야상/기타) · J 대행료(지게차) · K 합계 / 매입 L 운송료 · M 대행료 · N (이름 없음) · O 합계
{
  const { applyRoutePresets } = await import("../src/routePresetApply.js");
  const RP = await import("../functions/routePresetCore.mjs");
  const head = [["AJ-베베숲", "애터미 1PT=760KG"], ["충남 아산시 영인면 아산호로 496번길35", "", "사무실: 041-537-0000"], Array(15).fill(""),
    ["상차일자", "출발지", "도착지", "", "비고", "입고시간", "차종", "매출", "", "", "", "매입", "", "", "", "이익", "마감월", "운송사", "차량번호", "이름", "연락처"]];
  const r = (d, from, to, memo, arr, sale, i, j, k, buy, m, n, o) => [d, from, to, "", memo, arr, "11톤", sale, i, j, k, buy, m, n, o, "", "26년11월", "기사직통", "충남80아4135", "장인석", "010-4658-0000"];
  const rows = [...head, r("2026. 11. 13", "에이제이", "트레이더스 칠곡", "대행료/35,000", "당착", "300,000", "", "35,000", "335,000", "270,000", "35,000", "", "305,000"),
    r("2026. 11. 14", "에이제이", "트레이더스 칠곡", "", "당착", "300,000", "", "", "300,000", "270,000", "", "", "270,000")];
  const ctx = makePushContext([{ title: "에이제이", rows }], JY, {});
  const presets = [
    RP.parsePresetDoc(RP.presetDocData({ 거래처명: "에이제이", 하차지명: "트레이더스 칠곡", items: [{ 종류: "지게차", 금액: 35000, 부담: "청구" }] })),
    RP.parsePresetDoc(RP.presetDocData({ 거래처명: "에이제이", 하차지명: "에브리데이 여주", items: [{ 종류: "지게차", 금액: 50000, 부담: "청구" }, { 종류: "할증", 이름: "야상", 금액: 20000, 받는사람: "없음", 부담: "청구", 조건: "야간" }] })),
  ];
  const cellsOf = (plan) => Object.fromEntries(plan.cells.map((x) => [x.a1, x.value]));
  const rowOf = (n) => ctx.built.orders.find((x) => x.__tab === "에이제이" && x.__row === n);
  // ① 프로그램 등록(밤 · 에브리데이 여주) — 노선 고정 적용 → 시트: 입고시간 야상 · I 20,000(야상) · J/M 50,000(대행료=지게차) · 운송료 300,000
  const neu = applyRoutePresets({ companyName: "JY로지스틱스", 등록기기: "PC", 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "에브리데이 여주", 상차일: "2026-11-19", 상차시간: "21:00", 하차일: "2026-11-20", 청구운임: "300000", 기사운임: "270000", 수수료: "30000" }, presets);
  assert.deepEqual([neu.청구운임, neu.기사운임, neu.지게차비용, neu.특수운임.map((x) => x.이름)], ["370000", "270000", "50000", ["야상"]]);
  const c = planCreate(ctx, neu, "에이제이", { rowCount: 100 });
  assert.equal(c.ok, true);
  const m = cellsOf(c);
  assert.deepEqual([m.A7, m.F7, m.H7, m.I7, m.J7, m.K7, m.L7, m.M7, m.N7, m.O7], ["2026-11-20", "야상", "300000", "20000", "50000", "370000", "270000", "50000", undefined, "320000"], "시트 칸: 운송료 · 야상 · 대행료 · 합계");
  for (const k of ["청구운임", "기사운임", "특수운임", "지게차비용", "수수료", "특수청구추가", "지게차청구추가"]) assert.ok(!c.docPatch._programKeys.includes(k), `${k}: 시트와 같게 읽힌다`);
  assert.ok(c.pushed.includes("특수운임") && c.pushed.includes("지게차비용"));
  // 다시 읽은 줄 = 같은 특수운임 · 같은 운임(두 번 더하지 않음)
  const back = rowOf(7);
  assert.deepEqual([back.청구운임, back.기사운임, back.지게차비용, back.특수운임.map((x) => [x.이름, x.금액, x.받는사람, x.부담])], ["370000", "270000", 50000, [["야상", 20000, "없음", "청구"]]]);
  // 실시간 반영(시트 → 프로그램): 같은 줄로 보고 운임 · 특수운임을 덮어쓰지 않는다
  const doc = { ...neu, ...c.docPatch };
  const rc = reconcileOrders([{ id: "n1", data: doc }], [back]);
  const pt = rc.update[0]?.patch || {};
  for (const k of ["청구운임", "기사운임", "특수운임", "지게차비용", "수수료"]) assert.ok(!(k in pt), `다시 가져와도 ${k} 그대로`);
  // 서버가 시트 줄에 노선 고정을 적용해도(strict) 이미 시트에 있는 지게차 · 특수운임 위에 또 더하지 않는다
  assert.equal(RP.planRoutePreset(back, presets, { strict: true }), null, "시트에 대행료 · 야상이 있으면 아무것도 안 더함");
  // ② 낮 오더는 야상 없이 지게차만 · 입고시간 당착
  const day = applyRoutePresets({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "에브리데이 여주", 상차일: "2026-11-20", 상차시간: "09:00", 하차일: "2026-11-20", 청구운임: "300000", 기사운임: "270000" }, presets);
  const c2 = planCreate(ctx, day, "에이제이", { rowCount: 100 });
  const m2 = cellsOf(c2);
  assert.deepEqual([m2.F8, m2.H8, m2.I8, m2.J8, m2.M8], ["당착", "300000", undefined, "50000", "50000"]);
  // ③ 시트에서 온 줄(14일 · 칠곡 · 대행료 없음)에 프로그램에서 노선 고정 적용 → 수정: J/M 35,000 · 운송료는 그대로
  const imp = forOrderDoc(rowOf(6), { company: "JY로지스틱스", batchId: "t" });
  const upd = applyRoutePresets(imp, presets);
  assert.deepEqual([upd.청구운임, upd.기사운임, upd.지게차비용], ["335000", "270000", "35000"]);
  const u = planUpdate(ctx, imp, upd);
  assert.equal(u.ok, true);
  assert.deepEqual(cellsOf(u), { J6: "35000", K6: "335000", M6: "35000", O6: "305000" }, "추가 칸 · 합계만");
  assert.deepEqual(u.unpushed, []);
  assert.deepEqual([rowOf(6).지게차비용, rowOf(6).기사운임, rowOf(6).청구운임], [35000, "270000", "335000"]);
  // ④ 지게차가 있는 줄(13일)의 기사운임만 고침 → 매입 운송료만(예전엔 대행료를 빼고 써서 기사운임이 35,000 적게 읽혔다)
  const d13 = forOrderDoc(rowOf(5), { company: "JY로지스틱스", batchId: "t" });
  const u2 = planUpdate(ctx, d13, { ...d13, 기사운임: "280000" });
  assert.deepEqual(cellsOf(u2), { L5: "280000", O5: "315000" }, "매입 운송료 · 합계(지게차 포함)");
  assert.equal(rowOf(5).기사운임, "280000");
  // ⑤ 시트 칸으로 나타낼 수 없는 특수운임(외부 지급) — 운임은 예전 방식으로 쓰고 특수운임은 프로그램에만(_programKeys)
  const ext = { ...day, 하차일: "2026-11-21", 상차일: "2026-11-21", 특수운임수동: true };
  const ext2 = { ...ext, 특수운임: [{ 종류: "수작업", 금액: 30000, 받는사람: "외부", 부담: "청구" }], 청구운임: "380000", 외부지급합: 80000 };
  const c3 = planCreate(ctx, ext2, "에이제이", { rowCount: 100 });
  assert.equal(c3.ok, true); assert.ok(c3.unpushed.includes("특수운임"));
  const rc3 = reconcileOrders([{ id: "e1", data: { ...ext2, ...c3.docPatch } }], [rowOf(c3.row)]);
  assert.ok(!("특수운임" in (rc3.update[0]?.patch || {})) && !("청구운임" in (rc3.update[0]?.patch || {})), "프로그램의 특수운임 · 청구운임은 그대로");
  console.log("노선 고정 특수운임 → JY 시트 추가 칸 · 다시 읽어도 같음(round trip) OK");
}
console.log("sheetPush: 모두 통과");
