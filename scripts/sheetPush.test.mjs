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
  assert.deepEqual(Object.fromEntries(c.cells.map((x) => [x.a1, x.value])), { A7: "2026-11-14", B7: "신봉길101", C7: "충남 천안시 성정동 12", H7: "90000", K7: "80000", P7: "원콜", Q7: "충남77사7777", R7: "최사", S7: "01055556666", U7: "신규" });
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
  return { collection: (n) => ({ doc: (id) => ref(n, id), ...qy(n) }), batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const f of ops) await f(); } }; },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), delete: (r) => r.delete() }), data: (n, id) => col(n).get(id), ids: (n) => [...col(n).keys()] };
}
function fakeSheet(tabs, { denyWrite = false } = {}) {
  const writes = [];
  const titles = () => Object.keys(tabs);
  const ranges = (path) => [...path.matchAll(/ranges=([^&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/^'|'$/g, ""));
  const api = async (id, method, path, opts = {}) => {
    if (method === "GET" && path.startsWith("?fields=")) return { sheets: titles().map((t, i) => ({ properties: { sheetId: i + 1, title: t, index: i, gridProperties: { rowCount: 100 } }, merges: [] })) };
    if (method === "GET" && path.startsWith("/values:batchGet")) { const f = /FORMULA/.test(path) ? formulasOf(tabs) : tabs; return { valueRanges: ranges(path).map((t) => ({ values: f[t] })) }; }
    if (method === "GET" && path.startsWith("/values/")) return { values: [[tabs[titles()[0]][0][0]]] };
    if (method === "POST" && path === "/values:batchUpdate") {
      if (denyWrite) throw Object.assign(new Error("The caller does not have permission"), { response: { status: 403 } });
      opts.data.data.forEach((u) => { const [, t, colL, row] = u.range.match(/^'(.+)'!([A-Z]+)(\d+)$/); const c = colL.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1; const rows = tabs[t]; while (rows.length < +row) rows.push([]); const r = rows[+row - 1]; while (r.length <= c) r.push(""); r[c] = u.values[0][0]; writes.push(`${t}!${colL}${row}=${u.values[0][0]}`); });
      return {};
    }
    throw new Error(`fake sheet: ${method} ${path}`);
  };
  return { api, writes };
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
  assert.deepEqual(await w.run(), { wrote: true });
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
  // 삭제: 그 줄의 값만 비운다(수식 칸은 그대로)
  w.sh.writes.length = 0;
  await w.write("o아5", null);
  await w.run();
  assert.ok(w.sh.writes.includes("아산 내수!A5=") && !w.sh.writes.some((x) => /!J5=|!M5=|!N5=/.test(x)), w.sh.writes.join(" "));
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
  assert.deepEqual(await w.run(), { wrote: false });
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
  // 1분 동안 여러 번 확인(runLoop) — 그 사이 시트가 바뀌면 다음 확인 때 바로 반영된다
  let slept = 0;
  const n = await live.runLoop({ loopMs: 40, tickMs: 10, sleep: async (ms) => { slept += 1; if (slept === 2) { row[16] = "경기66바6666"; mt += 1; } await new Promise((r2) => setTimeout(r2, ms)); } });
  assert.ok(n >= 3, `확인 ${n}번`);
  assert.equal(find().차량번호, "경기66바6666");
  console.log("live(시트에서 기사 삭제) OK");
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
  await w.run(); mt += 1;
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
}
console.log("sheetPush: 모두 통과");
