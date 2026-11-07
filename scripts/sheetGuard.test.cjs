// 🔒 2026-11-07 구글시트 주인 회사 확인(functions/sheetGuard.js) — 단위 테스트(가짜 DB, 에뮬레이터 불필요)
//  실행: node scripts/sheetGuard.test.cjs
const assert = require("node:assert/strict");
const path = require("path");
const { makeSheetGuard } = require(path.resolve(__dirname, "../functions/sheetGuard.js"));

function fakeDb(seed) {
  const store = new Map(Object.entries(seed)); // "col/id" → data
  const col = (name) => ({
    select: () => col(name),
    get: async () => ({ docs: [...store.entries()].filter(([k]) => k.startsWith(`${name}/`)).map(([k, v]) => ({ id: k.split("/")[1], data: () => v })) }),
    doc: (id) => ({
      get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }),
      create: async (v) => { if (store.has(`${name}/${id}`)) throw new Error("ALREADY_EXISTS"); store.set(`${name}/${id}`, v); },
    }),
  });
  return { collection: col, _store: store };
}
const parse = (u) => { const m = String(u || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return m ? m[1] : String(u || ""); };
const url = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

(async () => {
  const db = fakeDb({
    "routeBoards/rA": { companyName: "에이운송", sheetUrl: url("SHEET_A") },
    "routeBoards/rB": { companyName: "비운송", sheetUrl: url("SHEET_SHARED") },
    "routeBoards/rA2": { companyName: "에이운송", sheetUrl: url("SHEET_SHARED") },
    "sheetProfiles/pB": { companyName: "비운송", spreadsheetId: "SHEET_B" },
    "sheetRegistry/SHEET_OK2": { companyName: "에이운송", companies: ["비운송"] },
  });
  const g = makeSheetGuard({ db, FieldValue: { serverTimestamp: () => 0 }, parseSpreadsheetId: parse, fixedOwners: { SHEET_LEGACY: "돌캐" } });
  const denied = async (p) => { await assert.rejects(p, (e) => e.status === 403); };
  let n = 0;
  const ok = (name) => { n += 1; console.log(`  ✓ ${name}`); };

  await g.assertSheetOwner("SHEET_A", "에이운송"); ok("우리 회사 양식의 시트 — 허용(주인 기록 생김)");
  assert.equal(db._store.get("sheetRegistry/SHEET_A").companyName, "에이운송"); ok("주인 기록 = 에이운송");
  await denied(g.assertSheetOwner("SHEET_A", "비운송")); ok("다른 회사가 같은 시트 — 거절");
  await denied(g.assertSheetOwner("SHEET_B", "에이운송")); ok("다른 회사 시트 연결(sheetProfiles)의 시트 — 거절");
  await g.assertSheetOwner("SHEET_NEW", "비운송"); ok("아무도 안 쓰는 새 시트 — 처음 쓴 회사가 주인");
  await denied(g.assertSheetOwner("SHEET_NEW", "에이운송")); ok("새 시트를 다른 회사가 — 거절");
  await denied(g.assertSheetOwner("SHEET_SHARED", "에이운송")); ok("두 회사 양식이 같은 시트(주인 기록 없음) — 둘 다 거절");
  await denied(g.assertSheetOwner("SHEET_SHARED", "비운송")); ok("  · 반대쪽도 거절");
  await g.assertSheetOwner("SHEET_OK2", "비운송"); ok("최고관리자가 함께 쓰기 허용(companies)한 회사 — 허용");
  await denied(g.assertSheetOwner("SHEET_LEGACY", "에이운송")); ok("돌캐 기존 배차현황 시트 — 다른 회사 거절");
  await g.assertSheetOwner("SHEET_LEGACY", "돌캐"); ok("돌캐 기존 시트 — 돌캐 허용");
  await g.assertSheetOwner("SHEET_B", "", { isTM: true }); ok("최고관리자 — 확인만 하고 통과");
  await denied(g.assertSheetOwner("SHEET_X", "")); ok("회사 없는 호출 — 거절");
  await g.assertSheetUrlOwner(url("SHEET_A"), "에이운송"); ok("시트 주소로 확인");
  console.log(`구글시트 주인 회사 테스트 ${n}개 통과`);
})().catch((e) => { console.error("실패:", e); process.exit(1); });
