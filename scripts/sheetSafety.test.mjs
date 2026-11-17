// ⭐ 2026-11-17 JY 시트 실시간 연동 — "시트에 적은 것이 한두 개씩 사라진다" 재현 · 방지 테스트 — node scripts/sheetSafety.test.mjs
//  ① 시트 줄에 연결된 오더를 복사하면 복사본이 원본의 줄 주소(이전출처)를 그대로 가져갔다
//     → 복사본을 고치면 원본 줄을 덮어쓰고, 복사본을 지우면 원본 줄이 시트에서 지워졌다(그 뒤 원본 오더도 사라짐)
//  ② 같은 차례에 "맨 아래 줄 오더 삭제" + "새 오더 등록"이 함께 오면 새 오더를 지울 줄에 써 놓고 그 줄을 지웠다
//  ③ 시트를 읽은 뒤 쓰기 전에 사람이 줄을 끼우면(줄 번호가 밀림) 엉뚱한 줄에 덮어썼다 → 쓰기 직전에 그 줄을 다시 읽어 확인
//  · 시트 · DB는 흉내(메모리) — 실제 시트에는 아무것도 쓰지 않는다
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PRESET_SUGGESTIONS, DEFAULT_PRESET, forOrderDoc } from "../functions/carrierMigrateCore.mjs";
import { makePushContext } from "../functions/sheetPushCore.mjs";
const require = createRequire(import.meta.url);
const { makeSheetPush } = require("../functions/sheetPushOrders.js");

const JY = { ...DEFAULT_PRESET, ...PRESET_SUGGESTIONS.JY로지스틱스, year: 2026 };
const HEAD = ["상차일자", "출발지", "도착지", "도착일자", "톤수", "박스", "중량/톤", "운송료", "추가비", "합계", "운송료", "추가비", "합계", "이익", "마감월", "운송사", "차량번호", "이름", "연락처", "착불입금예정", "비고(단가표)"];
const line = (d, to, sale, buy, car, name, memo = "") => [d, "신봉길101", to, "", "", "83", "1.5톤", sale, "", sale, buy, "", buy, "10,000", "26년11월", "원콜", car, name, "010-1111-2222", "", memo];
const sheet = () => ({
  "아산 내수": [["▣ 아산"], ["", "", "충남 아산시 영인면 신봉길 110-3"], ["", "", "", "", "", "", "", "매출", "", "", "매입"], HEAD,
    line("2026. 11. 3", "충주시", "105,000", "95,000", "경기11가1111", "김일"), line("2026. 11. 4", "수원시 파장동", "123,000", "110,000", "경기22나2222", "이이", "오전 도착"), Array(21).fill("")],
});
const formulasOf = (tabs) => Object.fromEntries(Object.entries(tabs).map(([t, rows]) => [t, rows.map((r, i) => r.map((v, c) => (i >= 4 && [9, 12, 13].includes(c) ? `=X${i + 1}` : v)))]));
const ctxOf = (tabs) => makePushContext(Object.entries(tabs).map(([title, rows]) => ({ title, rows })), JY, formulasOf(tabs));

const DEL = Symbol("del"), TS = Symbol("ts");
function fakeDb() {
  const cols = new Map(); let seq = 0;
  const col = (n) => cols.get(n) || cols.set(n, new Map()).get(n);
  const merge = (cur, data, m) => { const base = m ? { ...(cur || {}) } : {}; for (const [k, v] of Object.entries(data)) { if (v === DEL) delete base[k]; else if (v === TS) base[k] = Date.now() + (seq += 1); else base[k] = v; } return base; };
  const ref = (n, id) => ({ id, get: async () => snap(n, id), set: async (d, o) => { col(n).set(id, merge(col(n).get(id), d, o?.merge)); }, delete: async () => { col(n).delete(id); } });
  const snap = (n, id) => { const d = col(n).get(id); return { id, exists: d !== undefined, data: () => (d === undefined ? undefined : structuredClone(d)), ref: ref(n, id) }; };
  const cmp = { "==": (x, v) => x === v, ">": (x, v) => x > v, "<": (x, v) => x < v, ">=": (x, v) => x >= v };
  const qy = (n, fs = [], lim = Infinity) => ({ where: (f, op, v) => qy(n, [...fs, [f, op, v]], lim), limit: (k) => qy(n, fs, k), get: async () => { const docs = [...col(n).keys()].map((id) => snap(n, id)).filter((s) => fs.every(([f, op, v]) => cmp[op](s.data()[f], v))).slice(0, lim); return { docs, empty: !docs.length, size: docs.length }; } });
  return { collection: (n) => ({ doc: (id) => ref(n, id ?? `auto${(seq += 1)}`), ...qy(n) }), batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const f of ops) await f(); } }; },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), delete: (r) => r.delete() }), data: (n, id) => col(n).get(id), ids: (n) => [...col(n).keys()] };
}
// hooks.afterFullRead: 시트 전체를 읽은 직후 한 번 부른다(그 사이 사람이 시트를 고친 것처럼)
function fakeSheet(tabs, hooks = {}) {
  const writes = [];
  const titles = () => Object.keys(tabs);
  const ranges = (path) => [...path.matchAll(/ranges=([^&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/^'|'$/g, ""));
  const api = async (id, method, path, opts = {}) => {
    if (method === "GET" && path.startsWith("?fields=")) return { sheets: titles().map((t, i) => ({ properties: { sheetId: i + 1, title: t, index: i, gridProperties: { rowCount: 100 } }, merges: [] })) };
    if (method === "GET" && path.startsWith("/values:batchGet")) {
      const f = /FORMULA/.test(path) ? formulasOf(tabs) : tabs;
      const out = { valueRanges: ranges(path).map((t) => { const m = t.match(/^(.+)'!A(\d+):ZZ(\d*)$/); return { values: m ? (f[m[1]] || []).slice(+m[2] - 1, m[3] ? +m[3] : undefined).map((r) => [...r]) : (f[t] || []).map((r) => [...r]) }; }) };
      if (/FORMULA/.test(path) && hooks.afterFullRead) { const h = hooks.afterFullRead; hooks.afterFullRead = null; h(tabs); }
      return out;
    }
    if (method === "POST" && path === "/values:batchUpdate") {
      opts.data.data.forEach((u) => { const [, t, colL, row] = u.range.match(/^'(.+)'!([A-Z]+)(\d+)$/); const c = colL.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1; const rows = tabs[t]; while (rows.length < +row) rows.push([]); const r = rows[+row - 1]; while (r.length <= c) r.push(""); r[c] = u.values[0][0]; writes.push(`${t}!${colL}${row}=${u.values[0][0]}`); });
      return {};
    }
    if (method === "POST" && path === ":batchUpdate") {
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
  return { api, writes, hooks };
}
const CO = "JY로지스틱스";
async function world() {
  const db = fakeDb(); const tabs = sheet(); const sh = fakeSheet(tabs);
  const push = makeSheetPush({ db, FieldValue: { serverTimestamp: () => TS, delete: () => DEL }, sheetsApiFor: sh.api, parseSpreadsheetId: (u) => (u ? "sid" : ""), quoteTab: (t) => `'${t}'` });
  const cfg = { companyName: CO, enabled: true, url: "https://sheet", pushMode: "on", tabs: ["아산 내수"] };
  await db.collection("sheetLive").doc(CO).set(cfg);
  for (const o of ctxOf(tabs).built.orders) await db.collection("orders").doc(`o${o.__row}`).set({ ...forOrderDoc(o, { company: CO, batchId: "t" }), createdAt: 1000 + o.__row });
  const deps = { presetFor: async () => JY, placesFor: async () => [] };
  const write = async (id, next) => { // 화면이 오더를 바꾼 것처럼: 문서를 바꾸고 트리거를 부른다
    const b = db.data("orders", id); const before = { exists: b !== undefined, data: () => structuredClone(b) };
    if (next === null) await db.collection("orders").doc(id).delete(); else await db.collection("orders").doc(id).set(next);
    await push.onOrderWrite({ before, after: { exists: next !== null, data: () => structuredClone(next) } }, { params: { orderId: id } });
  };
  const { makeSheetLive } = require("../functions/sheetLiveOrders.js");
  const live = makeSheetLive({ db, FieldValue: { serverTimestamp: () => TS, delete: () => DEL, arrayUnion: (...v) => v }, sheetsApiFor: sh.api, parseSpreadsheetId: (u) => (u ? "sid" : ""), quoteTab: (t) => `'${t}'`, sheetModifiedTime: async () => "1", bumpDataVersion: async () => {}, push });
  const rowsOf = () => tabs["아산 내수"].slice(4).filter((r) => r.some((v) => String(v || "").trim()));
  return { db, tabs, sh, push, live, cfg, deps, write, rowsOf, run: () => push.process(CO, cfg, deps) };
}
const orig6 = ["11/4", "수원시 파장동", "경기22나2222", "이이"];
const keyOf = (r) => [String(r[0]).replace(/^2026[-.]\s*/, "").replace(/[-.]\s*0?/, "/").replace(/^0/, ""), r[2], r[16], r[17]]; // 날짜는 "2026. 11. 4" · "2026-11-04" 둘 다 11/4

// ① 복사본(원본 줄 주소를 그대로 가져온 오더)을 지우면 → 원본 줄이 시트에서 지워지면 안 된다
{
  const w = await world();
  const { _id, ...src } = { ...w.db.data("orders", "o6") }; void _id;
  // [복사 등록](submitCopyOrderPC)처럼: 원본 필드를 다 가져오고 등록기기만 PC
  await w.write("copy1", { ...src, 등록기기: "PC", createdAt: Date.now() });
  await w.run();
  // 복사본은 원본 줄 주소를 떼고 자기 줄(7행)을 새로 가진다
  assert.equal(w.db.data("orders", "copy1").이전출처, "아산 내수!7", JSON.stringify(w.db.data("orders", "copy1")));
  assert.equal(w.rowsOf().filter((r) => JSON.stringify(keyOf(r)) === JSON.stringify(orig6)).length, 2, `원본 줄 + 복사본 줄: ${w.sh.writes.join(" ")} ${JSON.stringify(w.rowsOf())}`);
  await w.write("copy1", null);
  await w.run();
  assert.ok(w.rowsOf().some((r) => JSON.stringify(keyOf(r)) === JSON.stringify(orig6)), `원본 줄(11/4 수원)이 남아 있어야 한다: ${w.sh.writes.join(" ")}`);
  assert.equal(w.rowsOf().length, 2, "복사본 줄만 지워진다");
  console.log("① 복사본 삭제 → 원본 줄은 그대로 OK");
}
// ①-2 예전에 만들어진 복사본(이미 DB에 있음 · 원본 줄 주소를 가짐)을 고치면 → 원본 줄을 덮어쓰면 안 된다 · 지워도 원본 줄은 그대로
{
  const w = await world();
  const { _id, ...src } = { ...w.db.data("orders", "o6") }; void _id;
  await w.db.collection("orders").doc("oldCopy").set({ ...src, 등록기기: "PC", createdAt: Date.now() }); // 트리거 없이(이미 있던 복사본)
  await w.write("oldCopy", { ...w.db.data("orders", "oldCopy"), 차량번호: "서울99바9999", 이름: "복사기사" });
  await w.run();
  assert.ok(w.rowsOf().some((r) => JSON.stringify(keyOf(r)) === JSON.stringify(orig6)), `원본 줄의 차량 · 기사가 덮이면 안 된다: ${w.sh.writes.join(" ")}`);
  await w.write("oldCopy", null);
  await w.run();
  assert.ok(w.rowsOf().some((r) => JSON.stringify(keyOf(r)) === JSON.stringify(orig6)), `원본 줄이 지워지면 안 된다: ${w.sh.writes.join(" ")}`);
  console.log("①-2 예전 복사본 수정 · 삭제 → 원본 줄 그대로 OK");
}
// ①-3 같은 줄을 가리키는 오더가 둘(중복)일 때 하나를 지우면 → 남은 오더의 줄은 지우지 않는다
{
  const w = await world();
  const { _id, ...src } = { ...w.db.data("orders", "o6") }; void _id;
  await w.db.collection("orders").doc("dup").set({ ...src, createdAt: Date.now() }); // 가져오기 중복(등록기기 구글시트 이전 그대로)
  await w.write("dup", null);
  await w.run();
  assert.ok(w.rowsOf().some((r) => JSON.stringify(keyOf(r)) === JSON.stringify(orig6)), `남은 오더(o6)의 줄이 지워지면 안 된다: ${w.sh.writes.join(" ")}`);
  console.log("①-3 중복 오더 하나 삭제 → 줄은 그대로 OK");
}
// ①-4 프로그램에서 만들어 시트에 줄을 만든 원본(시트연동)을 예전에 복사한 경우 — 복사본(나중에 만듦)을 고쳐도 원본 줄은 그대로
{
  const w = await world();
  await w.db.collection("orders").doc("o6").set({ ...w.db.data("orders", "o6"), 등록기기: "PC", 시트연동: true, createdAt: 1000 });
  const { _id, ...src } = { ...w.db.data("orders", "o6") }; void _id;
  await w.db.collection("orders").doc("oldCopy2").set({ ...src, createdAt: 5000 }); // 시트연동까지 딸려 온 복사본
  await w.write("oldCopy2", { ...w.db.data("orders", "oldCopy2"), 차량번호: "서울88사8888", 이름: "복사기사" });
  await w.run();
  assert.ok(w.rowsOf().some((r) => JSON.stringify(keyOf(r)) === JSON.stringify(orig6)), `원본 줄이 덮이면 안 된다: ${w.sh.writes.join(" ")}`);
  assert.equal(w.db.data("sheetPushQueue", "oldCopy2").state, "skipped");
  // 원본을 고치면 원래대로 원본 줄에 쓴다
  await w.write("o6", { ...w.db.data("orders", "o6"), 이름: "원본기사" });
  await w.run();
  assert.equal(w.tabs["아산 내수"][5][17], "원본기사", w.sh.writes.join(" "));
  console.log("①-4 시트연동 복사본 수정 → 원본 줄 그대로 · 원본 수정은 그대로 반영 OK");
}
// ①-5 지운 오더를 되살림(아직 시트 줄을 안 지운 삭제가 대기 중) → 삭제만 취소, 줄은 그대로 · 새 줄도 안 만든다
{
  const w = await world();
  await w.db.collection("orders").doc("o6").set({ ...w.db.data("orders", "o6"), 등록기기: "PC", 시트연동: true });
  const keep = w.db.data("orders", "o6");
  await w.write("o6", null);
  assert.equal(w.db.data("sheetPushQueue", "o6").kind, "delete");
  await w.write("o6", keep);
  assert.equal(w.db.data("sheetPushQueue", "o6"), undefined);
  await w.run();
  assert.equal(w.rowsOf().length, 2); assert.deepEqual(w.sh.writes, []);
  assert.equal(w.db.data("orders", "o6").이전출처, "아산 내수!6");
  console.log("①-5 되살리기 → 대기 중 삭제 취소 OK");
}
// ①-6 프로그램에서 차량번호를 바꿨는데 시트에 못 옮긴 오더(_programKeys · _sheetBase)를 지우면 → 시트 줄도 제대로 찾아 지운다
//  (예전엔 프로그램 값으로 찾아 "시트에 이미 없음"으로 끝냄 → 줄이 남아 실시간 반영이 오더를 다시 만들었다)
{
  const w = await world();
  await w.db.collection("orders").doc("o6").set({ ...w.db.data("orders", "o6"), 차량번호: "프로그램99가9999", _programKeys: ["차량번호"], _sheetBase: { 차량번호: "경기22나2222" } });
  await w.write("o6", null);
  await w.run();
  assert.ok(!w.rowsOf().some((r) => r[2] === "수원시 파장동"), w.sh.writes.join(" "));
  console.log("①-6 프로그램 값을 둔 오더 삭제 → 시트 줄 찾아 지움 OK");
}
// ② 같은 차례: 맨 아래 줄(6행) 오더 삭제 + 새 오더 등록 → 새 오더의 줄이 남아야 한다
{
  const w = await world();
  await w.write("o6", null);
  await w.write("neu", { companyName: CO, 등록기기: "PC", 거래처명: "녹수", 담당노선구분: "아산 내수", 상차일: "2026-11-14", 하차일: "2026-11-14", 상차지명: "신봉길101", 하차지명: "충주시", 청구운임: "50000", 기사운임: "40000", 차량번호: "충남12가3456", 이름: "새기사" });
  assert.equal(await w.live.kick(CO, "program"), "ran"); // 실제처럼: 시트에 쓰고(줄 지움 → 줄 번호 밀림) → 바로 시트를 다시 읽어 줄 주소를 맞춘다
  const rows = w.rowsOf();
  assert.ok(!rows.some((r) => r[2] === "수원시 파장동"), "지운 오더의 줄은 없어야 한다");
  assert.ok(rows.some((r) => r[16] === "충남12가3456"), `새 오더의 줄이 남아 있어야 한다: ${w.sh.writes.join(" ")} / ${JSON.stringify(rows.map((r) => r.slice(0, 3)))}`);
  const at = Number(String(w.db.data("orders", "neu").이전출처 || "").split("!")[1]);
  assert.equal(w.tabs["아산 내수"][at - 1]?.[16], "충남12가3456", "새 오더의 줄 주소(이전출처)가 실제 줄과 같아야 한다");
  console.log("② 삭제 + 등록 한 차례 → 새 오더 줄 보존 OK");
}
// ③ 시트를 읽은 뒤 · 쓰기 전에 사람이 위쪽에 줄을 끼움 → 밀려난 줄(엉뚱한 줄)에 덮어쓰지 않는다 → 다음 차례에 제자리에 쓴다
{
  const w = await world();
  await w.write("o6", { ...w.db.data("orders", "o6"), 차량번호: "서울99바9999", 이름: "홍길동" });
  const typed = ["2026. 11. 4", "신봉길101", "사람이 방금 친 줄", "", "", "", "", "70,000", "", "", "60,000", "", "", "", "", "", "경기00사0000", "사람", "", "", ""];
  w.sh.hooks.afterFullRead = (tabs) => { tabs["아산 내수"].splice(5, 0, [...typed]); }; // 6행에 새 줄 → 원래 6행은 7행으로
  const r1 = await w.run();
  assert.deepEqual(w.tabs["아산 내수"][5], typed, `사람이 친 줄(6행)이 덮이면 안 된다: ${w.sh.writes.join(" ")}`);
  assert.equal(w.db.data("sheetPushQueue", "o6").state, "pending", JSON.stringify(r1));
  assert.ok(w.db.ids("sheetPushConflicts").length >= 1, "엇갈린 기록을 남긴다(원인 확인용)");
  await w.run();
  assert.deepEqual(w.tabs["아산 내수"][5], typed);
  assert.deepEqual([w.tabs["아산 내수"][6][2], w.tabs["아산 내수"][6][16], w.tabs["아산 내수"][6][17]], ["수원시 파장동", "서울99바9999", "홍길동"], w.sh.writes.join(" "));
  assert.equal(w.db.data("sheetPushQueue", "o6").state, "done");
  console.log("③ 읽은 뒤 줄이 밀림 → 엉뚱한 줄에 안 씀 · 다음 차례에 제자리 OK");
}
// ③-2 같은 상황에서 삭제 — 밀려난 자리(사람이 방금 친 줄)를 지우면 안 된다
{
  const w = await world();
  await w.write("o6", null);
  const typed = ["2026. 11. 4", "신봉길101", "사람이 방금 친 줄", "", "", "", "", "70,000", "", "", "60,000", "", "", "", "", "", "경기00사0000", "사람", "", "", ""];
  w.sh.hooks.afterFullRead = (tabs) => { tabs["아산 내수"].splice(5, 0, [...typed]); };
  await w.run();
  assert.ok(w.rowsOf().some((r) => r[2] === "사람이 방금 친 줄"), `사람이 친 줄이 지워지면 안 된다: ${w.sh.writes.join(" ")}`);
  await w.run();
  assert.ok(w.rowsOf().some((r) => r[2] === "사람이 방금 친 줄"));
  assert.ok(!w.rowsOf().some((r) => r[2] === "수원시 파장동"), `다음 차례에 지운 오더의 줄만 지운다: ${w.sh.writes.join(" ")}`);
  console.log("③-2 읽은 뒤 줄이 밀림 → 엉뚱한 줄을 안 지움 OK");
}
// ④ 시트 → 프로그램: 탭을 읽었는데 오더 줄이 하나도 안 나오면(읽기가 비어 옴 등) 그 탭의 오더를 지우지 않는다
{
  const w = await world();
  await w.db.collection("sheetLive").doc(CO).set({ ...w.cfg, pushMode: "off", days: 14 });
  const cfg = () => w.db.data("sheetLive", CO);
  await w.live.runOne(CO, cfg(), { force: true });
  const n0 = w.db.ids("orders").length;
  const saved = w.tabs["아산 내수"].splice(4); // 머리줄만 남음(오더 줄이 하나도 없음)
  const r0 = await w.live.runOne(CO, cfg(), { force: true }); // 전체 읽기: 빈 탭은 비교에서 빠진다(원래도 안 지움)
  assert.equal(r0.removed, 0, JSON.stringify(r0));
  const r = await w.live.runOne(CO, cfg(), { onlyTabs: ["아산 내수"], sheetWritten: true, usePeek: false }); // 시트 알림이 "이 탭만" 알려 온 경우
  assert.ok(!r.removed, JSON.stringify(r));
  assert.equal(w.db.ids("orders").length, n0);
  w.tabs["아산 내수"].push(...saved);
  // 한 줄만 지우면(다른 줄은 남음) 그 오더는 지운다 · 삭제 기록에 줄 주소가 남는다
  w.tabs["아산 내수"].splice(4, 1);
  const r2 = await w.live.runOne(CO, cfg(), { force: true });
  assert.equal(r2.removed, 1, JSON.stringify(r2));
  assert.equal(w.db.data("deletedOrders", "orders_o5").이전출처, "아산 내수!5");
  console.log("④ 빈 탭 읽기 → 오더 안 지움 · 한 줄 삭제는 반영 OK");
}
console.log("sheetSafety: 모두 통과");
