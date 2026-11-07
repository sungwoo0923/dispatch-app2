// ======================= functions/officeSheet.js =======================
// 📗 2026-11-07 엑셀(xlsx) 파일 시트 — 구글 드라이브에 올린 엑셀 파일은 Sheets API가 거절한다
//  ("This operation is not supported for this document. The document must not be an Office file.")
//  · 읽기: Drive API로 파일을 받아(alt=media) SheetJS(xlsx)로 풀고, Sheets API와 같은 모양(값 · 수식 · 병합 칸 · 탭 목록)으로 돌려준다
//    → 배차표(routeBoardSheet · syncRouteBoards)와 구글시트 연동(sheetConnect)이 고치지 않고 그대로 쓴다
//    · 같은 파일은 Drive modifiedTime이 같으면 다시 받지 않는다(서버 메모리 캐시)
//  · 쓰기: 엑셀 파일에는 쓸 수 없다 → code "office-file" 오류 · [구글 시트로 변환](Drive files.copy, 원본 엑셀은 그대로)
//  서비스 계정(dispatch-app-9b92f@appspot.gserviceaccount.com) 그대로 · 새 비밀값 없음

const GSHEET_MIME = "application/vnd.google-apps.spreadsheet";
const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
]);
const OFFICE_ERR_RE = /must not be an Office file|not supported for this document/i;
const SERVICE_EMAIL = "dispatch-app-9b92f@appspot.gserviceaccount.com";
const OFFICE_WRITE_MSG = "엑셀(xlsx) 파일이라 프로그램에서 시트에 쓸 수 없어요. [구글 시트로 변환]을 눌러 구글 시트로 바꿔 주세요.";
const CONVERT_HELP = `구글 드라이브에서 파일을 열고 [파일 › Google Sheets로 저장]을 누른 뒤, 새 파일을 ${SERVICE_EMAIL}에 편집자로 공유하고 새 주소를 붙여넣어 주세요.`;
const MAX_BYTES = 40 * 1024 * 1024;

const isOfficeMime = (m) => OFFICE_MIMES.has(String(m || ""));
const isOfficeError = (e) => OFFICE_ERR_RE.test(String(e?.response?.data?.error?.message || "")) || OFFICE_ERR_RE.test(String(e?.message || ""));
const officeWriteError = () => Object.assign(new Error(OFFICE_WRITE_MSG), { status: 409, code: "office-file" });

const colLetter = (i) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const colIndex = (l) => { let n = 0; for (const ch of String(l).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const quoteTab = (t) => `'${String(t).replace(/'/g, "''")}'`;
const pad = (n) => String(n).padStart(2, "0");

// "'25년1월'!A1:BZ6000" · "Sheet1!A1:C" · "'탭'" → { tab, r0, c0, r1, c1 }(0부터 · 끝 포함, 없으면 Infinity)
function parseRange(a1) {
  const s = String(a1 || "");
  let tab = ""; let rest = "";
  if (s.startsWith("'")) {
    let i = 1;
    for (; i < s.length; i++) { if (s[i] === "'") { if (s[i + 1] === "'") { tab += "'"; i++; } else break; } else tab += s[i]; }
    rest = s.slice(i + 1).replace(/^!/, "");
  } else { const k = s.indexOf("!"); tab = k >= 0 ? s.slice(0, k) : s; rest = k >= 0 ? s.slice(k + 1) : ""; }
  const m = rest.match(/^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/i);
  const out = { tab, r0: 0, c0: 0, r1: Infinity, c1: Infinity };
  if (rest && m) {
    if (m[1]) out.c0 = colIndex(m[1]);
    if (m[2]) out.r0 = +m[2] - 1;
    if (m[3]) out.c1 = colIndex(m[3]); else if (m[3] === undefined && m[1]) out.c1 = out.c0;
    if (m[4]) out.r1 = +m[4] - 1; else if (m[3] === undefined && m[2]) out.r1 = out.r0;
  }
  return out;
}

// 엑셀 날짜 칸 → "2025-01-05" (시간이 있으면 " 09:30") · 시간만 → "9:30"
function excelDateText(XLSX, v, fmt) {
  const d = XLSX.SSF.parse_date_code(v);
  if (!d) return "";
  const hasTime = /h|s/i.test(String(fmt || "").replace(/\[[^\]]*\]|"[^"]*"/g, "")) && (d.H || d.M || d.S);
  if (v < 1) return `${d.H}:${pad(d.M)}`;
  const day = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  return hasTime ? `${day} ${pad(d.H)}:${pad(d.M)}` : day;
}

// 칸 하나 → Sheets API valueRenderOption 모양
function cellOut(XLSX, c, render) {
  if (!c) return "";
  if (render === "FORMULA") {
    if (c.f) return `=${String(c.f).replace(/^=/, "")}`;
    return c.v == null ? "" : c.v;
  }
  if (render === "UNFORMATTED_VALUE") return c.v == null ? "" : c.v;
  if (c.t === "e") return c.w || "#ERROR!";
  if (c.t === "n" && c.z && XLSX.SSF.is_date(c.z)) return excelDateText(XLSX, c.v, c.z);
  if (c.t === "d" && c.v instanceof Date) return c.v.toISOString().slice(0, 10);
  if (c.w != null) return String(c.w);
  if (c.t === "b") return c.v ? "TRUE" : "FALSE";
  return c.v == null ? "" : String(c.v);
}

// 엑셀 워크북 → 탭 정보(Sheets API properties 모양)
function sheetInfo(XLSX, wb) {
  return wb.SheetNames.map((title, index) => {
    const ws = wb.Sheets[title] || {};
    const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const hidden = !!(wb.Workbook?.Sheets?.[index]?.Hidden);
    return {
      properties: { sheetId: index, title, index, hidden, gridProperties: { rowCount: ref ? ref.e.r + 1 : 0, columnCount: ref ? ref.e.c + 1 : 0 } },
      merges: (ws["!merges"] || []).map((m) => ({ sheetId: index, startRowIndex: m.s.r, endRowIndex: m.e.r + 1, startColumnIndex: m.s.c, endColumnIndex: m.e.c + 1 })),
    };
  });
}

// 탭 범위 값(2차원 · 뒤쪽 빈 칸 · 빈 줄은 Sheets API처럼 잘라 냄)
function valuesOf(XLSX, wb, a1, render = "FORMATTED_VALUE") {
  const r = parseRange(a1);
  const ws = wb.Sheets[r.tab];
  if (!ws) throw Object.assign(new Error(`탭을 찾을 수 없어요: ${r.tab}`), { status: 400 });
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  if (!ref) return { range: `${quoteTab(r.tab)}!A1`, values: [] };
  const r1 = Math.min(r.r1, ref.e.r); const c1 = Math.min(r.c1, ref.e.c);
  const values = [];
  let lastRow = -1; let lastCol = -1;
  for (let R = r.r0; R <= r1; R++) {
    const row = [];
    let end = -1;
    for (let C = r.c0; C <= c1; C++) {
      const v = cellOut(XLSX, ws[XLSX.utils.encode_cell({ r: R, c: C })], render);
      row.push(v);
      if (v !== "" && v != null) end = C - r.c0;
    }
    row.length = end + 1;
    values.push(row);
    if (end >= 0) { lastRow = R; lastCol = Math.max(lastCol, r.c0 + end); }
  }
  values.length = lastRow >= r.r0 ? lastRow - r.r0 + 1 : 0;
  const range = lastRow >= r.r0 ? `${quoteTab(r.tab)}!${colLetter(r.c0)}${r.r0 + 1}:${colLetter(lastCol)}${lastRow + 1}` : `${quoteTab(r.tab)}!${colLetter(r.c0)}${r.r0 + 1}`;
  return { range, values };
}

function readWorkbook(XLSX, buf) {
  return XLSX.read(buf, { type: "buffer", cellFormula: true, cellNF: true, cellText: true, cellDates: false, cellStyles: false, sheetStubs: false });
}

// deps.driveRequest(opts) — google-auth-library client.request 모양({ url, method, data, responseType }) → { data }
function makeOfficeSheets({ sheetsApiFor, driveRequest, loadXlsx = () => require("xlsx"), cacheSize = 4 }) {
  const known = new Map(); // sid → { office, name, mimeType, at }
  const books = new Map(); // sid → { mt, wb, name }

  async function fileMeta(sid) {
    const r = await driveRequest({ url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sid)}?fields=id,name,mimeType,modifiedTime,parents,size&supportsAllDrives=true`, method: "GET" });
    const d = r?.data || {};
    known.set(sid, { office: isOfficeMime(d.mimeType), name: d.name || "", mimeType: d.mimeType || "", at: Date.now() });
    return d;
  }
  const officeInfo = (sid) => { const k = known.get(sid); return k?.office ? { office: true, fileName: k.name, mimeType: k.mimeType } : null; };

  async function workbook(sid) {
    const XLSX = loadXlsx();
    const meta = await fileMeta(sid);
    const hit = books.get(sid);
    if (hit && hit.mt && hit.mt === meta.modifiedTime) { books.delete(sid); books.set(sid, hit); return { XLSX, ...hit }; } // 바뀐 게 없으면 다시 받지 않는다
    if (+meta.size > MAX_BYTES) throw Object.assign(new Error("엑셀 파일이 너무 커요(40MB 넘음). 구글 시트로 변환해 주세요."), { status: 400, code: "office-file" });
    const r = await driveRequest({ url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sid)}?alt=media&supportsAllDrives=true`, method: "GET", responseType: "arraybuffer" });
    const wb = readWorkbook(XLSX, Buffer.from(r.data));
    const rec = { mt: meta.modifiedTime || "", wb, name: String(meta.name || "").replace(/\.(xlsx|xlsm|xlsb|xls)$/i, "") };
    books.set(sid, rec);
    while (books.size > cacheSize) books.delete(books.keys().next().value);
    return { XLSX, ...rec };
  }

  // Sheets API GET을 엑셀 파일로 흉내(쓰이는 모양만: 시트 정보 · values · values:batchGet)
  async function emulate(sid, method, path) {
    if (String(method).toUpperCase() !== "GET") throw officeWriteError();
    const { XLSX, wb, name } = await workbook(sid);
    const [p0, qs = ""] = String(path || "").split("?");
    const q = new URLSearchParams(qs);
    const render = q.get("valueRenderOption") || "FORMATTED_VALUE";
    if (!p0) {
      const want = q.getAll("ranges").map((x) => parseRange(x).tab);
      const sheets = sheetInfo(XLSX, wb).filter((s) => !want.length || want.includes(s.properties.title));
      return { spreadsheetId: sid, properties: { title: name }, sheets };
    }
    if (p0 === "/values:batchGet") return { spreadsheetId: sid, valueRanges: q.getAll("ranges").map((a1) => valuesOf(XLSX, wb, a1, render)) };
    if (p0.startsWith("/values/")) return valuesOf(XLSX, wb, decodeURIComponent(p0.slice(8)), render);
    throw officeWriteError();
  }

  // sheetsApiFor 대신 쓰는 것 — 엑셀 파일이면 흉내, 아니면 그대로
  async function sheetsApi(sid, method, path, opts = {}) {
    if (known.get(sid)?.office) return emulate(sid, method, path);
    try { return await sheetsApiFor(sid, method, path, opts); }
    catch (e) {
      if (!isOfficeError(e)) throw e;
      known.set(sid, { office: true, name: known.get(sid)?.name || "", mimeType: "", at: Date.now() });
      return emulate(sid, method, path);
    }
  }

  // 구글 시트로 변환 — Drive files.copy(같은 폴더 · "<이름> (LogisWeb)") · 원본 엑셀은 그대로
  async function convert(sid, { shareWith = "" } = {}) {
    let meta;
    try { meta = await fileMeta(sid); } catch (e) { throw Object.assign(new Error(`파일 정보를 읽지 못했어요. ${CONVERT_HELP}`), { status: 400, code: "convert-denied", help: CONVERT_HELP }); }
    if (!isOfficeMime(meta.mimeType)) {
      if (meta.mimeType === GSHEET_MIME) return { already: true, spreadsheetId: sid, url: `https://docs.google.com/spreadsheets/d/${sid}/edit`, name: meta.name || "" };
      throw Object.assign(new Error("엑셀 파일이 아니에요."), { status: 400 });
    }
    const base = String(meta.name || "배차표").replace(/\.(xlsx|xlsm|xlsb|xls)$/i, "");
    const body = { name: `${base} (LogisWeb)`, mimeType: GSHEET_MIME, ...(Array.isArray(meta.parents) && meta.parents.length ? { parents: meta.parents.slice(0, 1) } : {}) };
    let copy;
    try {
      copy = (await driveRequest({ url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sid)}/copy?supportsAllDrives=true&fields=id,name,webViewLink`, method: "POST", data: body })).data;
    } catch (e) {
      const st = e?.response?.status;
      const why = String(e?.response?.data?.error?.message || e?.message || "");
      console.warn(`[엑셀 변환] 실패(${st || "-"}) ${sid}:`, why);
      throw Object.assign(new Error(`변환 권한이 없어요. ${CONVERT_HELP}`), { status: 403, code: "convert-denied", help: CONVERT_HELP });
    }
    if (shareWith && /@/.test(shareWith)) {
      await driveRequest({ url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(copy.id)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, method: "POST", data: { role: "writer", type: "user", emailAddress: shareWith } })
        .catch((e) => console.warn("[엑셀 변환] 새 시트 공유 실패:", e?.response?.data?.error?.message || e?.message || e));
    }
    known.set(copy.id, { office: false, name: copy.name || body.name, mimeType: GSHEET_MIME, at: Date.now() });
    return { spreadsheetId: copy.id, url: `https://docs.google.com/spreadsheets/d/${copy.id}/edit`, name: copy.name || body.name, from: { spreadsheetId: sid, name: meta.name || "" } };
  }

  return { sheetsApi, emulate, convert, fileMeta, officeInfo, workbook, isOffice: (sid) => !!known.get(sid)?.office };
}

module.exports = { makeOfficeSheets, isOfficeMime, isOfficeError, officeWriteError, parseRange, valuesOf, sheetInfo, readWorkbook, OFFICE_WRITE_MSG, CONVERT_HELP, GSHEET_MIME };
