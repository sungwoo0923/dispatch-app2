// 배차표(고정노선현황) ↔ 구글시트 연동 가상 테스트 — 태진 "삼다수 배차표" 모양(날짜 탭 · 1센터/2센터 묶음 · 제목 위 날짜 2개 · 수량 칸)
// 실행: node scripts/routeBoardSync.test.cjs
const { syncBoard, tabDate } = require("../functions/routeBoardSync.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗", m); } };

// ── 가짜 Firestore ──
function fakeDb() {
  const cols = {};
  const colOf = (n) => (cols[n] = cols[n] || new Map());
  const setPath = (o, k, v) => { const ps = k.split("."); let t = o; ps.slice(0, -1).forEach((p) => { t[p] = t[p] && typeof t[p] === "object" ? { ...t[p] } : {}; t = t[p]; }); t[ps[ps.length - 1]] = v; };
  const ref = (n, id) => ({
    id, path: `${n}/${id}`,
    get: async () => ({ exists: colOf(n).has(id), id, data: () => colOf(n).get(id) }),
    set: async (d, o) => { colOf(n).set(id, o?.merge ? { ...(colOf(n).get(id) || {}), ...d } : { ...d }); },
    update: async (d) => { const cur = { ...(colOf(n).get(id) || {}) }; Object.entries(d).forEach(([k, v]) => setPath(cur, k, v)); colOf(n).set(id, cur); },
    delete: async () => { colOf(n).delete(id); },
  });
  const q = (n, conds) => ({
    where: (f, op, v) => q(n, [...conds, [f, v]]),
    limit: () => q(n, conds),
    get: async () => { const docs = [...colOf(n).entries()].filter(([, d]) => conds.every(([f, v]) => d[f] === v)).map(([id, d]) => ({ id, ref: ref(n, id), data: () => d })); return { docs, empty: !docs.length }; },
  });
  return {
    cols,
    collection: (n) => ({ ...q(n, []), doc: (id) => ref(n, id) }),
    batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, d) => ops.push(() => r.update(d)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const f of ops) await f(); } }; },
  };
}
const FieldValue = { serverTimestamp: () => "TS" };

// ── 태진 모양 시트 ──
const kst = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const kor = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };
const form0 = {
  id: "rb1", companyName: "태진", name: "삼다수 배차표", client: "(주)태진", dropOffset: 1, sheetUrl: "https://docs.google.com/spreadsheets/d/x/edit",
  groups: [{ name: "1센터", 상차지명: "1센터" }, { name: "2센터", 상차지명: "2센터" }],
  columns: [
    { id: "c0", label: "No", kind: "no" },
    { id: "c1", label: "도착지", kind: "field", field: "하차지명" }, { id: "c2", label: "시군구", kind: "field", field: "하차지주소" },
    { id: "c3", label: "0.5L", kind: "qty" }, { id: "c4", label: "2L", kind: "qty" }, { id: "c5", label: "총계", kind: "sum" },
    { id: "c6", label: "차량번호", kind: "field", field: "차량번호" }, { id: "c7", label: "운송업체", kind: "extra" },
  ],
};
const HEAD = ["No", "도착지", "시군구", "0.5L", "2L", "총계", "차량번호", "운송업체"];
function sheetRows(inDate, { dates = "two", rowsA, rowsB } = {}) {
  const out = (d) => { const pick = addD(d, -1); return dates === "two" ? [kor(pick), "", "", "", "", kor(d)] : [kor(d)]; };
  return [
    ["삼다수 배차 내역(1센터)"], out(inDate), HEAD, ...rowsA,
    ["합계", "", "", "", "", "", "", ""], [],
    ["삼다수 배차 내역(2센터)"], out(inDate), HEAD, ...rowsB,
  ];
}
const addD = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function run(db, form, tabsMap, extra = {}) {
  const writes = [];
  const r = await syncBoard({
    db, FieldValue, form,
    readTabs: async () => Object.keys(tabsMap),
    readTab: async (t) => tabsMap[t],
    writeCells: async (t, ups) => { writes.push(...ups.map((u) => ({ t, ...u }))); },
    insertRows: async () => {},
    ...extra,
  });
  return { r, writes };
}
const orders = (db) => [...(db.cols.orders || new Map()).values()];

(async () => {
  const inD = kst(1); const pick = kst(0);
  const tabName = inD.slice(2); // "26-11-10"
  const rowsA = [["1", "오산점", "경기 오산시", "6", "4", "10", "", "태진물류"], ["2", "평택점", "경기 평택시", "8", "", "8", "경기12가3456", "대성운수"]];
  const rowsB = [["1", "천안점", "충남 천안시", "", "5", "5", "", ""]];

  console.log("\n[1] 처음 맞춤 — 새 줄 → 오더");
  const db = fakeDb();
  db.cols.drivers = new Map([["d1", { companyName: "태진", 차량번호: "경기12가3456", 이름: "김철수", 전화번호: "010-1111-2222" }]]);
  const tabs = { [tabName]: sheetRows(inD, { rowsA, rowsB }) };
  let { r } = await run(db, form0, tabs);
  let os = orders(db);
  ok(r.created === 3, `오더 3건 생성 (지금 ${r.created})`);
  ok(os.every((o) => o.상차일 === pick && o.하차일 === inD), `상차일=${pick} · 하차일=${inD}`);
  const p = os.find((o) => o.하차지명 === "평택점");
  ok(p?.이름 === "김철수" && p?.배차상태 === "배차완료", "차량번호 있는 줄 → 기사 이름·배차완료");
  ok(!os.some((o) => o.하차지명 === "합계"), "합계 줄은 오더 아님");
  ok(os.find((o) => o.하차지명 === "오산점")?.화물수량 === "10", "수량 합계 10");

  console.log("[2] 두 번째 맞춤 — 그대로면 아무것도 안 바뀜");
  const form1 = { ...form0, ...(db.cols.routeBoards?.get("rb1") || {}) };
  let w; ({ r, writes: w } = await run(db, form1, tabs));
  ok(r.created === 0 && r.updated === 0 && !(r.deleted || r.gone), `변화 없음 (생성 ${r.created} · 수정 ${r.updated} · 삭제 ${r.deleted || 0})`);
  ok(w.length === 0, `시트에 쓰는 칸 없음 (지금 ${w.length}: ${JSON.stringify(w.slice(0, 3))})`);

  console.log("[3] 프로그램에서 차량번호 넣음 → 시트에 씀");
  const osan = [...db.cols.orders.entries()].find(([, o]) => o.하차지명 === "오산점");
  db.cols.orders.set(osan[0], { ...osan[1], 차량번호: "경기99바9999", 이름: "박기사", 배차상태: "배차완료" });
  ({ r, writes: w } = await run(db, form1, tabs));
  ok(w.some((x) => x.a1 === "G4" && x.value === "경기99바9999"), `G4(오산점 차량번호)에 씀 (${JSON.stringify(w)})`);
  ok(!w.some((x) => /^F/.test(x.a1)), "총계(수식) 칸은 안 씀");

  console.log("[4] 시트에서 수량 바뀜 → 프로그램에 반영");
  const tabs2 = { [tabName]: sheetRows(inD, { rowsA: [["1", "오산점", "경기 오산시", "7", "4", "11", "경기99바9999", "태진물류"], rowsA[1]], rowsB }) };
  ({ r } = await run(db, form1, tabs2));
  ok(db.cols.orders.get(osan[0]).품목수량["0.5L"] === 7, "0.5L 6 → 7");

  console.log("[5] 같은 도착지 2줄");
  const db2 = fakeDb();
  const dup = [["1", "오산점", "경기 오산시", "6", "", "6", "", ""], ["2", "오산점", "경기 오산시", "3", "", "3", "", ""]];
  await run(db2, form0, { [tabName]: sheetRows(inD, { rowsA: dup, rowsB: [] }) });
  ok(orders(db2).length === 2, `오더 2건 (지금 ${orders(db2).length})`);
  const f2 = { ...form0, ...(db2.cols.routeBoards.get("rb1")) };
  ({ r } = await run(db2, f2, { [tabName]: sheetRows(inD, { rowsA: dup, rowsB: [] }) }));
  ok(r.created === 0 && !(r.deleted || r.gone), "다시 맞춰도 그대로(중복·삭제 없음)");

  console.log("[6] 제목 위 날짜가 하나인 시트 — 예전 규칙(상차일 = 그 날짜) 유지");
  const db3 = fakeDb();
  await run(db3, form0, { [tabName]: sheetRows(inD, { dates: "one", rowsA, rowsB }) });
  const o3 = orders(db3);
  // ⚠ 2026-11-10 되돌림: 날짜 하나면 예전처럼 그 날짜 = 상차일(기존 오더를 상차일로 찾기 때문 — 바꾸면 전날 탭 오더를 잡는다)
  ok(o3.length === 3 && o3.every((o) => o.하차일 === inD && o.상차일 === inD), `날짜 하나 → 상차일·하차일 모두 ${inD}(예전 규칙 유지) — 지금 상차일 ${o3[0]?.상차일} · 하차일 ${o3[0]?.하차일}`);

  console.log("[7] 연말 — 12월 말에 1월 탭(\"01-03\" 모양)도 읽는지");
  ok(tabDate("01-03", 2026) === "2026-01-03", "tabDate 기본");
  const { nearTabDate } = require("../functions/routeBoardSync.js");
  ok(typeof nearTabDate === "function" && nearTabDate("01-03", "2026-12-28") === "2027-01-03", "12월 28일 기준 01-03 → 2027-01-03");
  ok(typeof nearTabDate === "function" && nearTabDate("12-30", "2027-01-02") === "2026-12-30", "1월 2일 기준 12-30 → 2026-12-30");
  ok(typeof nearTabDate === "function" && nearTabDate("26-11-10", "2027-01-02") === "2026-11-10", "연도가 적힌 탭은 그대로");

  console.log("[8] 프로그램에서 하차지명(도착지)을 고친 오더 — 다음 맞춤에서 지워지지 않는지");
  const db4 = fakeDb();
  await run(db4, form0, { [tabName]: sheetRows(inD, { rowsA, rowsB }) });
  const f4 = { ...form0, ...(db4.cols.routeBoards.get("rb1")) };
  const e4 = [...db4.cols.orders.entries()].find(([, o]) => o.하차지명 === "천안점");
  db4.cols.orders.set(e4[0], { ...e4[1], 하차지명: "천안점(본점)", 차량번호: "경기55바5555" });
  ({ r } = await run(db4, f4, { [tabName]: sheetRows(inD, { rowsA, rowsB }) }));
  ok(db4.cols.orders.has(e4[0]), "고친 오더가 남아 있음");
  ok(orders(db4).filter((o) => /천안점/.test(o.하차지명)).length === 1, `천안점 오더 1건(중복 생성 없음) — 지금 ${orders(db4).filter((o) => /천안점/.test(o.하차지명)).length}`);

  console.log("[9] 시트에서 도착지 글자만 고침(주소 같음) → 같은 오더 유지 · 이름 반영");
  const db5 = fakeDb();
  await run(db5, form0, { [tabName]: sheetRows(inD, { rowsA, rowsB }) });
  const f5 = { ...form0, ...(db5.cols.routeBoards.get("rb1")) };
  const e5 = [...db5.cols.orders.entries()].find(([, o]) => o.하차지명 === "천안점");
  const { 시트도착지: _x, ...legacy } = e5[1]; db5.cols.orders.set(e5[0], { ...legacy, 차량번호: "경기55바5555" }); // 예전 오더(시트도착지 없음)
  ({ r } = await run(db5, f5, { [tabName]: sheetRows(inD, { rowsA, rowsB: [["1", "천안 본점", "충남 천안시", "", "5", "5", "경기55바5555", ""]] }) }));
  ok(db5.cols.orders.has(e5[0]) && db5.cols.orders.get(e5[0]).하차지명 === "천안 본점", "같은 오더 · 하차지명 → 천안 본점");
  ok(orders(db5).length === 3, `오더 수 그대로 3 (지금 ${orders(db5).length})`);

  console.log("[10] 시트에서 다른 곳으로 바뀐 줄(주소 다름) → 예전 오더 삭제 · 새 오더");
  ({ r } = await run(db5, { ...form0, ...(db5.cols.routeBoards.get("rb1")) }, { [tabName]: sheetRows(inD, { rowsA, rowsB: [["1", "아산점", "충남 아산시", "", "5", "5", "", ""]] }) }));
  ok(!db5.cols.orders.has(e5[0]) && orders(db5).some((o) => o.하차지명 === "아산점"), "천안 본점 삭제 · 아산점 생성");

  console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
