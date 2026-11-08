// 📗 2026-11-07 엑셀(xlsx) 파일 시트 단위 테스트 — Drive API · Sheets API는 가짜(인터넷 필요 없음)
//  실행: node scripts/officeSheet.test.mjs
//  · SheetJS로 엑셀 파일을 만들어(제목 줄 병합 · 세로 병합 날짜 · 수식 · 월별 탭 25년1월/25년2월) Sheets API 흉내로 읽고
//    구글시트 연동과 같은 머리줄 찾기 · 칸 맞추기, 배차표 월별 탭(그날 줄만) 규칙을 그대로 통과하는지 본다
//  · mimeType 확인 · 같은 modifiedTime이면 다시 안 받기 · 쓰기 거절(code office-file) · 구글 시트로 변환(files.copy) · 권한 없음
import { createRequire } from "module";
import * as C from "../functions/sheetProfileCore.mjs";
import * as M from "../functions/routeBoardMonth.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const O = require("../functions/officeSheet.js");
const { makeSheetConnect } = require("../functions/sheetConnect.js");
const RB = require("../functions/routeBoardSync.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const has = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : extra}`); };
const rejects = async (name, fn, check) => { try { await fn(); fail++; console.log(`FAIL ${name} :: 오류가 안 났음`); } catch (e) { const ok = check(e); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` :: ${e.code} ${e.message}`}`); } };

// ── 엑셀 파일 만들기 ──
const HEADER = ["순번", "날짜", "거래처명", "상차지", "하차지", "하차지주소", "차량번호", "기사명", "청구운임", "기사님요금", "수수료"];
const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
function monthSheet(y, m) {
  const aoa = [[`${y}년 ${m}월 배차현황`], [], HEADER];
  const days = [3, 3, 4, 5, 5, 5];
  days.forEach((d, i) => aoa.push([i + 1, null, ["한빛유통", "대성물산"][i % 2], "평택1센터", ["부산신항", "대구유통단지", "광주하남"][i % 3], ["부산 강서구", "대구 북구", "광주 광산구"][i % 3], `경기12가${3450 + i}`, ["김철수", "이영호"][i % 2], 300000 + i * 10000, 250000 + i * 10000, null]));
  aoa.push([]);
  aoa.push(["", "", "합계"]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 날짜(엑셀 날짜 숫자 · 형식) — 같은 날은 세로로 병합(왼쪽 위 칸에만 값)
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
  let prev = null; let start = 3;
  days.forEach((d, i) => {
    const r = 3 + i;
    if (d !== prev) { ws[XLSX.utils.encode_cell({ r, c: 1 })] = { t: "n", v: serial(y, m, d), z: "m/d/yy" }; if (prev != null && r - 1 > start) merges.push({ s: { r: start, c: 1 }, e: { r: r - 1, c: 1 } }); start = r; prev = d; }
    // 수수료 = 청구운임 - 기사님요금(수식 · 저장된 값 포함)
    ws[XLSX.utils.encode_cell({ r, c: 10 })] = { t: "n", v: 50000, f: `I${r + 1}-J${r + 1}` };
    ws[XLSX.utils.encode_cell({ r, c: 8 })].z = "#,##0";
  });
  if (3 + days.length - 1 > start) merges.push({ s: { r: start, c: 1 }, e: { r: 3 + days.length - 1, c: 1 } });
  ws["!merges"] = merges;
  return ws;
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, monthSheet(2025, 1), "25년1월");
XLSX.utils.book_append_sheet(wb, monthSheet(2025, 2), "25년2월");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["월", "건수"], ["1월", 6]]), "요약");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
has("엑셀 파일 만들기", buf.length > 1000);

// ── 가짜 Drive · Sheets API ──
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const drive = { mt: "2026-11-07T01:00:00.000Z", downloads: 0, copies: [], perms: [], denyCopy: false, mime: XLSX_MIME };
const driveRequest = async ({ url, method, data }) => {
  const u = new URL(url);
  if (method === "GET" && u.searchParams.get("alt") === "media") { drive.downloads += 1; return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) }; }
  if (method === "GET") return { data: { id: "XFILE", name: "배차현황_2025.xlsx", mimeType: drive.mime, modifiedTime: drive.mt, parents: ["FOLDER1"], size: String(buf.length) } };
  if (method === "POST" && u.pathname.endsWith("/copy")) {
    if (drive.denyCopy) throw Object.assign(new Error("Insufficient permissions"), { response: { status: 403, data: { error: { message: "The user does not have sufficient permissions for this file." } } } });
    drive.copies.push(data); return { data: { id: "NEWSHEET", name: data.name } };
  }
  if (method === "POST" && u.pathname.endsWith("/permissions")) { drive.perms.push(data); return { data: { id: "p1" } }; }
  throw new Error(`알 수 없는 Drive 호출 ${method} ${url}`);
};
let sheetsCalls = 0;
const sheetsApiFor = async () => { sheetsCalls += 1; throw Object.assign(new Error("This operation is not supported for this document. The document must not be an Office file."), { response: { status: 400, data: { error: { code: 400, message: "This operation is not supported for this document. The document must not be an Office file.", status: "FAILED_PRECONDITION" } } } }); };
const office = O.makeOfficeSheets({ sheetsApiFor, driveRequest });
const q = (t) => `'${t.replace(/'/g, "''")}'`;

// ── 1) 탭 목록 · 병합 칸(시트 정보) ──
const meta = await office.sheetsApi("XFILE", "GET", "?fields=properties.title,sheets.properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount))");
eq("Office 오류를 받으면 엑셀로 읽기", office.isOffice("XFILE"), true);
eq("파일 이름(확장자 뺌)", meta.properties.title, "배차현황_2025");
eq("탭 목록", meta.sheets.map((s) => s.properties.title), ["25년1월", "25년2월", "요약"]);
eq("탭 줄 수(그리드)", meta.sheets[0].properties.gridProperties.rowCount, 11);
eq("엑셀 정보(officeInfo)", office.officeInfo("XFILE"), { office: true, fileName: "배차현황_2025.xlsx", mimeType: XLSX_MIME });
const mg = await office.sheetsApi("XFILE", "GET", `?ranges=${encodeURIComponent(q("25년1월"))}&fields=sheets(properties(title,sheetId,gridProperties),merges)`);
eq("ranges= 로 고른 탭만", mg.sheets.map((s) => s.properties.title), ["25년1월"]);
const merges = mg.sheets[0].merges;
eq("병합 칸 → Sheets API 모양(제목 줄)", merges[0], { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 });
eq("세로 병합 날짜 칸", merges.slice(1).map((m) => [m.startRowIndex, m.endRowIndex, m.startColumnIndex]), [[3, 5, 1], [6, 9, 1]]);
eq("한 번만 받음(Sheets API는 처음 한 번만 시도)", [drive.downloads, sheetsCalls], [1, 1]);

// ── 2) 값 · 수식 → 구글시트 연동과 같은 머리줄 찾기 · 칸 맞추기 ──
const vals = await office.sheetsApi("XFILE", "GET", `/values/${encodeURIComponent(`${q("25년1월")}!A1:BZ60`)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
const forms = await office.sheetsApi("XFILE", "GET", `/values/${encodeURIComponent(`${q("25년1월")}!A1:BZ60`)}?valueRenderOption=FORMULA`);
eq("날짜 칸 → YYYY-MM-DD", vals.values[3][1], "2025-01-03");
eq("금액 형식 그대로(#,##0)", vals.values[3][8], "300,000");
eq("수식 칸(FORMULA) → =I4-J4", forms.values[3][10], "=I4-J4");
eq("수식 칸(값) → 저장된 결과", vals.values[3][10], "50000");
eq("뒤쪽 빈 줄 잘라 냄(합계 줄까지)", vals.values.length, 11);
eq("범위 표기", vals.range, `${q("25년1월")}!A1:K11`);
const rows = C.applyMerges(vals.values, merges);
eq("병합 펼침: 같은 날 아랫줄도 날짜", [rows[4][1], rows[7][1], rows[8][1]], ["2025-01-03", "2025-01-05", "2025-01-05"]);
const h = C.detectHeader(rows);
eq("제목 줄(병합) · 빈 줄 건너뛰고 3번째 줄이 머리줄", [h.headerRow, h.depth, h.dataStart], [2, 1, 3]);
const cols = C.autoMapColumns(h.headers, rows.slice(h.dataStart, h.dataStart + 20), forms.values.slice(h.dataStart, h.dataStart + 20));
const by = Object.fromEntries(cols.map((c) => [c.header, [c.field, c.mode]]));
eq("날짜 → 상차일", by["날짜"], ["상차일", "data"]);
eq("하차지 → 하차지명", by["하차지"], ["하차지명", "data"]);
eq("기사명 → 이름", by["기사명"], ["이름", "data"]);
eq("기사님요금 → 기사운임", by["기사님요금"], ["기사운임", "data"]);
eq("수수료(수식) → 계산열", by["수수료"][1], "calc");
eq("필수 칸 다 있음", C.missingRequired(cols), []);
const mon = C.detectMonthlyTabs(meta.sheets.map((s) => s.properties.title));
eq("월별 탭 25년1월 · 25년2월", [mon.kind, mon.tabs.map((t) => t.title)], ["yy년m월", ["25년1월", "25년2월"]]);
const bg = await office.sheetsApi("XFILE", "GET", `/values:batchGet?ranges=${encodeURIComponent(`${q("25년1월")}!A1:BZ`)}&ranges=${encodeURIComponent(`${q("요약")}!A1:BZ`)}&fields=valueRanges(range)`);
eq("batchGet 범위(탭 줄 수 · 칸 수)", bg.valueRanges.map((v) => v.range), [`${q("25년1월")}!A1:K11`, `${q("요약")}!A1:B2`]);

// ── 3) 캐시: modifiedTime이 같으면 다시 안 받음 · 바뀌면 다시 받음 ──
await office.sheetsApi("XFILE", "GET", `/values/${encodeURIComponent(`${q("25년2월")}!A1:AZ3000`)}?valueRenderOption=FORMATTED_VALUE`);
eq("같은 modifiedTime → 다시 안 받음", drive.downloads, 1);
drive.mt = "2026-11-07T02:00:00.000Z";
await office.sheetsApi("XFILE", "GET", "?fields=sheets.properties(sheetId,title,index)");
eq("modifiedTime 바뀜 → 다시 받음", drive.downloads, 2);

// ── 4) 쓰기는 거절(code office-file) ──
await rejects("값 쓰기 → office-file", () => office.sheetsApi("XFILE", "POST", "/values:batchUpdate", { data: {} }), (e) => e.code === "office-file" && e.status === 409);
await rejects("줄 끼우기 → office-file", () => office.sheetsApi("XFILE", "POST", ":batchUpdate", { data: {} }), (e) => e.code === "office-file");
has("오류 문구 한국어", /엑셀\(xlsx\)/.test(O.OFFICE_WRITE_MSG));
has("isOfficeError: 영어 문구", O.isOfficeError(new Error("This operation is not supported for this document. The document must not be an Office file.")));
has("isOfficeError: 다른 오류는 아님", !O.isOfficeError(new Error("The caller does not have permission")));
eq("mimeType 판별", [O.isOfficeMime(XLSX_MIME), O.isOfficeMime("application/vnd.ms-excel"), O.isOfficeMime(O.GSHEET_MIME)], [true, true, false]);

// ── 5) 구글 시트로 변환(files.copy) ──
const cv = await office.convert("XFILE", { shareWith: "staff@example.com" });
eq("변환 요청: 같은 폴더 · 구글 시트 · 이름", drive.copies[0], { name: "배차현황_2025 (LogisWeb)", mimeType: O.GSHEET_MIME, parents: ["FOLDER1"] });
eq("변환 결과 주소", [cv.spreadsheetId, cv.url], ["NEWSHEET", "https://docs.google.com/spreadsheets/d/NEWSHEET/edit"]);
eq("요청한 직원에게 편집자 공유", drive.perms[0], { role: "writer", type: "user", emailAddress: "staff@example.com" });
drive.denyCopy = true;
await rejects("권한 없으면 convert-denied + 방법 안내", () => office.convert("XFILE"), (e) => e.code === "convert-denied" && /Google Sheets로 저장/.test(e.message) && /dispatch-app-9b92f@appspot\.gserviceaccount\.com/.test(e.help));
drive.denyCopy = false;
drive.mime = O.GSHEET_MIME;
eq("이미 구글 시트면 그대로", (await office.convert("XFILE")).already, true);
drive.mime = XLSX_MIME;

// ── 6) mimeType으로 먼저 알아낸 파일(fileMeta) → Sheets API 안 부름 ──
const office2 = O.makeOfficeSheets({ sheetsApiFor: async () => { throw new Error("부르면 안 됨"); }, driveRequest });
await office2.fileMeta("XFILE");
const t2 = await office2.sheetsApi("XFILE", "GET", "?fields=sheets.properties(title,index)");
eq("mimeType 확인 뒤 바로 엑셀로", t2.sheets.length, 3);
// 구글 시트는 그대로 Sheets API
const office3 = O.makeOfficeSheets({ sheetsApiFor: async () => ({ native: true }), driveRequest });
eq("구글 시트는 Sheets API 그대로", await office3.sheetsApi("GSHEET", "GET", ""), { native: true });

// ── 7) 구글시트 연동 서버(sheetConnect) tabs · sample · export 를 엑셀 파일로 ──
const officeS = O.makeOfficeSheets({ sheetsApiFor, driveRequest });
const handler = makeSheetConnect({
  db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, id: "P1", data: () => ({ companyName: "테스트운송", sheetUrl: "https://docs.google.com/spreadsheets/d/XFILE/edit", spreadsheetId: "XFILE", tabMode: "monthly", tabPattern: { kind: "yy년m월" }, columns: cols, dataStart: 3, headerRow: 2 }) }), set: async () => {} }), where: () => ({ where: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }) }) }) },
  FieldValue: { serverTimestamp: () => 0 }, sheetsApiFor: officeS.sheetsApi, officeSheets: officeS,
  parseSpreadsheetId: (u) => (String(u).match(/\/d\/([^/]+)/) || [])[1] || "", quoteTab: q,
  requireStaff: async () => ({ company: "테스트운송", email: "staff@example.com", isTM: false }), requireAdminRole: async () => ({ company: "테스트운송", email: "admin@example.com", isTM: false }),
  sheetModifiedTime: async () => drive.mt, makeAnthropic: () => null, setBulkMode: async () => {}, bumpDataVersion: async () => {},
});
const call = (body) => new Promise((resolve) => { const res = { code: 200, set() {}, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); }, send() { resolve({ code: this.code }); } }; handler({ method: "POST", body }, res); });
const url = "https://docs.google.com/spreadsheets/d/XFILE/edit";
const tabs = await call({ action: "tabs", url });
eq("sheetConnect tabs: 엑셀 표시 · 탭 · 실제 줄 수", [tabs.code, tabs.data.office, tabs.data.tabs.map((t) => [t.title, t.rows, t.cols])], [200, true, [["25년1월", 11, 11], ["25년2월", 11, 11], ["요약", 2, 2]]]);
const sample = await call({ action: "sample", url, tab: "25년1월" });
eq("sheetConnect sample: 값 · 수식 · 병합", [sample.data.rows[2][0], sample.data.formulas[3][10], sample.data.merges.length], ["순번", "=I4-J4", 3]);
const ex = await call({ action: "export", profileId: "P1", from: "2025-01-01", to: "2025-01-31" });
eq("sheetConnect export(쓰기): 409 office-file", [ex.code, ex.data.code], [409, "office-file"]);
const cvt = await call({ action: "convert", url, profileId: "P1" });
eq("sheetConnect convert: 새 시트 주소 · 연결도 바꿈", [cvt.data.url, cvt.data.profileUpdated], ["https://docs.google.com/spreadsheets/d/NEWSHEET/edit", true]);

// ── 8) 배차표: 시트 프로필 → 양식(날짜 칸 · 월별 탭) → 그날 줄만 ──
const profile = C.buildProfile({ companyName: "테스트운송", name: "배차현황_2025", sheetUrl: url, spreadsheetId: "XFILE", tabMode: "monthly", tabs: [], tabPattern: { kind: mon.kind, sample: mon.sample }, header: h, columns: cols, valueMaps: {}, dedupe: null });
const ids = (() => { let i = 0; return () => `c${i++}`; })();
const bf = M.profileToBoardForm(profile, C.profileToBoardColumns(profile, ids));
eq("양식 탭 구조: 월별 탭", [bf.tabMode, bf.tabPattern?.kind], ["monthly", "yy년m월"]);
eq("날짜 칸 → kind date(상차일)", bf.columns.filter((c) => c.kind === "date").map((c) => [c.label, c.role]), [["날짜", "상차일"]]);
has("하차지명 칸 있음", bf.columns.some((c) => c.kind === "field" && c.field === "하차지명"));
const form = { id: "RB1", name: "배차현황", companyName: "테스트운송", sheetUrl: url, dropOffset: 0, groups: [{ name: "기본" }], ...bf };
const tabTitles = meta.sheets.map((s) => s.properties.title);
eq("그날 탭: 2025-01-05 → 25년1월", M.boardTabFor(form, tabTitles, "2025-01-05"), "25년1월");
eq("그날 탭: 2025-02-03 → 25년2월", M.boardTabFor(form, tabTitles, "2025-02-03"), "25년2월");
eq("그날 탭: 없는 달 → 빈 값", M.boardTabFor(form, tabTitles, "2025-03-03"), "");
eq("날짜 탭 양식은 예전 규칙(null)", M.boardTabFor({ ...form, tabMode: "" }, tabTitles, "2025-01-05"), null);
const raw = (await office.sheetsApi("XFILE", "GET", `/values/${encodeURIComponent(`${q("25년1월")}!A1:AZ3000`)}?valueRenderOption=FORMATTED_VALUE`)).values;
eq("탭에 있는 상차일(병합 날짜 이어서)", M.boardDatesIn(form, raw, "25년1월"), ["2025-01-03", "2025-01-04", "2025-01-05"]);
const day5 = M.boardRowsFor(form, raw, "2025-01-05", "25년1월");
eq("그날 줄만 남기고 줄 번호 그대로", [day5.length, day5[3].length, day5[6][4], day5[7][1]], [raw.length, 0, "부산신항", "2025-01-05"]);
const p5 = RB.parseBoardTab(form, day5);
const nameId = form.columns.find((c) => c.field === "하차지명").id;
eq("배차표 읽기(1/5): 3대 · 시트 줄 위치", [p5.headers, p5.groups.기본.map((v) => v[nameId]), p5.groups.기본.map((v) => v.__pos.ri)], [1, ["부산신항", "대구유통단지", "광주하남"], [6, 7, 8]]);
const p3 = RB.parseBoardTab(form, M.boardRowsFor(form, raw, "2025-01-03", "25년1월"));
eq("배차표 읽기(1/3): 2대", p3.groups.기본.length, 2);
// 날짜 칸이 하차일이면 상차일 = 하차일 - dropOffset
const formDrop = { ...form, dropOffset: 1, columns: form.columns.map((c) => (c.kind === "date" ? { ...c, role: "하차일" } : c)) };
eq("하차일 날짜 칸: 상차 1/4 → 시트 1/5 줄", RB.parseBoardTab(formDrop, M.boardRowsFor(formDrop, raw, "2025-01-04", "25년1월")).groups.기본.length, 3);
eq("하차일 날짜 칸: 탭 날짜 → 상차일", M.boardDatesIn(formDrop, raw, "25년1월"), ["2025-01-02", "2025-01-03", "2025-01-04"]);
// 날짜 칸 값 읽기
eq("날짜 값 모양", ["5", "5일", "1/5", "1월 5일", "2025. 1. 5", "25-01-05", "45662", "2025-01-05(일)"].map((v) => M.cellYmd(v, { y: 2025, m: 1 })), Array(8).fill("2025-01-05"));
eq("12월 탭에서 1/2 → 다음 해", M.cellYmd("1/2", { y: 2025, m: 12 }), "2026-01-02");
eq("한 탭 양식", M.boardTabFor({ ...form, tabMode: "single", sheetTab: "25년2월" }, tabTitles, "2025-01-05"), "25년2월");
eq("기간 탭(자동 연동)", M.boardTabsInRange(form, tabTitles, "2025-01-30", "2025-02-02"), ["25년1월", "25년2월"]);

// ── 9) 배차표 자동 연동(syncBoard) — 월별 탭 엑셀 파일에서 날짜마다 오더 만들기 · 쓰기는 안 함 ──
{
  const made = []; const writes = [];
  const q0 = { where: () => q0, get: async () => ({ docs: [] }) };
  const fdb = {
    collection: (name) => ({ ...q0, doc: (id) => ({ id, path: `${name}/${id}`, set: async () => {}, update: async () => {} }) }),
    // 🔗 2026-11-08 기본거래처 자동 등록(clients)은 빼고 오더만
    batch: () => ({ set: (ref, data) => { if (String(ref.path).startsWith("orders/")) made.push({ ref, data }); }, update: () => {}, delete: () => {}, commit: async () => {} }),
  };
  const sum = await RB.syncBoard({
    db: fdb, FieldValue: { serverTimestamp: () => 0 }, form, range: { from: "2025-01-01", to: "2025-01-31" },
    readTabs: async () => (await office.sheetsApi("XFILE", "GET", "?fields=sheets.properties(sheetId,title,index)")).sheets.map((x) => x.properties.title),
    readTab: async (tab) => (await office.sheetsApi("XFILE", "GET", `/values/${encodeURIComponent(`${q(tab)}!A1:AZ3000`)}?valueRenderOption=FORMATTED_VALUE`)).values || [],
    writeCells: async (tab, ups) => { writes.push(ups); },
    insertRows: async () => { throw new Error("엑셀 파일"); },
  });
  eq("자동 연동: 1월 탭 · 3날짜 · 오더 6건", [sum.tabs, sum.dates, sum.created], [3, ["2025-01-03", "2025-01-04", "2025-01-05"], 6]);
  eq("만든 오더 상차일 · 하차지명 · 시트 줄", made.map((m) => [m.data.상차일, m.data.하차지명, m.data.시트줄]), [["2025-01-03", "부산신항", 3], ["2025-01-03", "대구유통단지", 4], ["2025-01-04", "광주하남", 5], ["2025-01-05", "부산신항", 6], ["2025-01-05", "대구유통단지", 7], ["2025-01-05", "광주하남", 8]]);
  has("날짜 칸은 시트기준값에 안 넣음", made.every((m) => !Object.keys(m.data.시트기준값).includes(form.columns.find((c) => c.kind === "date").id)));
  eq("시트에 쓴 칸 없음", writes.length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
