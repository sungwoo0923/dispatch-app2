// ======================= functions/sheetConnect.js =======================
// 🔗 2026-11-07 구글시트 연동(시트 프로필) 서버 — 화면: src/SheetConnectHub.jsx · src/SheetConnectWizard.jsx
//  규칙(칸 맞추기 · 값 바꾸기 · 보호 칸 · 표 끝 찾기 · 마지막 수정 우선)은 전부 functions/sheetProfileCore.mjs(화면과 같은 파일)
//  시트 접근은 기존 서비스 계정(dispatch-app-9b92f@appspot.gserviceaccount.com)을 그대로 쓴다 — 새 비밀값 없음.
//  POST { action, ... }  (Authorization: Bearer <ID 토큰>)
//   tabs    { url }                → 탭 목록 + 실제 줄 수
//   sample  { url, tab }           → 앞 60줄 값 · 수식 · 병합 칸(머리줄 찾기 · 칸 맞추기용)
//   read    { url, tabs[] }        → 고른 탭 전체 값 · 병합 칸 · 시트 마지막 수정 시각(가져오기 미리보기는 화면에서)
//   aiMap   { columns[] }          → 헷갈리는 칸만 Claude에게(ANTHROPIC_API_KEY · 키 없으면 빈 답)
//   export  { profileId, from, to, dryRun } → 프로그램 오더를 시트로(가져오기·보내기 칸만 · 수식 칸 절대 안 씀)
//   cancelImport { batchId }       → 이 회사가 가져온 묶음 되돌리기
//   convert { url, profileId? }    → 📗 엑셀(xlsx) 파일을 구글 시트로 복사 변환(원본 그대로) · profileId면 그 연결 주소도 새 시트로
//  📗 엑셀 파일(드라이브에 올린 .xlsx)은 functions/officeSheet.js가 읽기를 흉내 낸다(tabs · sample · read 그대로) · 보내기(쓰기)는 code "office-file"
//  ⚠️ 서버는 시트 프로필의 칸 설정을 믿지 않고, 쓰기 직전에 그 칸의 지금 수식을 다시 읽어 수식이 든 칸은 건너뛴다.

const { isProfileOwnOrder } = require("./gsheetLegacy");

let _core = null;
const core = async () => _core || (_core = await import("./sheetProfileCore.mjs"));

const CANCELED = ["취소", "배차취소", "오더취소", "취소됨"];
const isCanceled = (d) => d?.배차상태 === "배차취소" || CANCELED.includes(d?.상태);
const RANGE_COLS = "A1:BZ";
const MAX_ROWS = 6000;
const colIdx = (l) => { let n = 0; for (const ch of String(l)) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const AI_MODEL = "claude-haiku-5-5"; // functions/orderScan.js와 같은 모델

function makeSheetConnect(deps) {
  const { db, FieldValue, sheetsApiFor, officeSheets = null, parseSpreadsheetId, quoteTab, requireStaff, requireAdminRole, sheetModifiedTime, makeAnthropic, setBulkMode, bumpDataVersion } = deps;

  async function tabsAction(sid) {
    const meta = await sheetsApiFor(sid, "GET", "?fields=properties.title,sheets.properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount))");
    const tabs = (meta.sheets || []).map((s) => s.properties).sort((a, b) => a.index - b.index).slice(0, 80);
    // 실제 값이 든 범위만 받는다(값은 안 받음) → 실제 줄 수
    let ranges = [];
    if (tabs.length) {
      const q = tabs.map((t) => `ranges=${encodeURIComponent(`${quoteTab(t.title)}!${RANGE_COLS}`)}`).join("&");
      // 값은 받지 않고 범위만(응답 범위는 실제 값이 든 곳까지로 줄어든다)
      try { ranges = (await sheetsApiFor(sid, "GET", `/values:batchGet?${q}&fields=valueRanges(range)`)).valueRanges || []; } catch (e) { ranges = []; }
    }
    const out = tabs.map((t, i) => {
      const m = String(ranges[i]?.range || "").match(/!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      const rows = m ? +(m[4] || m[2]) : 0;
      const cols = m ? colIdx(m[3] || m[1]) + 1 : 0;
      return { title: t.title, index: t.index, hidden: !!t.hidden, rows: Math.min(rows, t.gridProperties?.rowCount || rows), cols, gridRows: t.gridProperties?.rowCount || 0 };
    });
    return { title: meta.properties?.title || "", spreadsheetId: sid, tabs: out, modifiedTime: await sheetModifiedTime(sid), ...(officeSheets?.officeInfo(sid) || {}) };
  }

  async function mergesOf(sid, tabs) {
    const q = tabs.map((t) => `ranges=${encodeURIComponent(quoteTab(t))}`).join("&");
    const m = await sheetsApiFor(sid, "GET", `?${q}&fields=${encodeURIComponent("sheets(properties(title,sheetId,gridProperties),merges)")}`);
    const out = {};
    (m.sheets || []).forEach((s) => { out[s.properties.title] = { merges: s.merges || [], sheetId: s.properties.sheetId, grid: s.properties.gridProperties || {} }; });
    return out;
  }

  async function readTab(sid, tab, render = "FORMATTED_VALUE", rows = MAX_ROWS) {
    const r = await sheetsApiFor(sid, "GET", `/values/${encodeURIComponent(`${quoteTab(tab)}!A1:BZ${rows}`)}?valueRenderOption=${render}&dateTimeRenderOption=FORMATTED_STRING`);
    return r.values || [];
  }

  async function aiMapAction(columns) {
    const client = makeAnthropic();
    if (!client) return { suggestions: [], engine: "none" };
    const C = await core();
    const fields = C.PROGRAM_FIELDS.map((f) => `${f.key}(${f.label}${f.calc ? ", 계산값" : ""})`).join(", ");
    const cols = (columns || []).slice(0, 40).map((c) => ({ idx: +c.idx, header: String(c.header || "").slice(0, 40), samples: (c.samples || []).slice(0, 6).map((s) => String(s).slice(0, 60)) }));
    if (!cols.length) return { suggestions: [], engine: "none" };
    const schema = {
      type: "object",
      properties: { items: { type: "array", items: { type: "object", properties: { idx: { type: "integer" }, field: { type: "string" }, confidence: { type: "number" }, why: { type: "string" } }, required: ["idx", "field", "confidence", "why"], additionalProperties: false } } },
      required: ["items"], additionalProperties: false,
    };
    const res = await client.messages.create({
      model: AI_MODEL, max_tokens: 2000,
      system: [{ type: "text", text: [
        "너는 한국 화물 운송사 배차일지(구글시트) 칸을 배차 프로그램 칸에 짝지어 주는 담당이다.",
        `프로그램 칸: ${fields}`,
        "칸마다 머리줄 글자와 예시 값을 보고 가장 맞는 프로그램 칸 key를 field에 쓴다. 맞는 칸이 없거나 참고용이면 field를 빈 문자열로.",
        "수식 결과·조회 실패(정보 없음)·#REF! 같은 칸은 빈 문자열. confidence는 0~1, why는 20자 이내 한국어.",
      ].join("\n"), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(cols) }],
      output_config: { effort: "low", format: { type: "json_schema", schema } },
    });
    const raw = (res?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    let items = [];
    try { items = JSON.parse(raw).items || []; } catch { items = []; }
    const ok = new Set(C.PROGRAM_FIELDS.map((f) => f.key));
    return { engine: "claude", suggestions: items.filter((x) => !x.field || ok.has(x.field)).map((x) => ({ idx: +x.idx, field: x.field || "", confidence: Math.max(0, Math.min(1, +x.confidence || 0)), why: String(x.why || "").slice(0, 40) })) };
  }

  // 병합 칸 안쪽(왼쪽 위 칸이 아닌 칸)인가
  const mergedFn = (merges, row) => (col) => (merges || []).some((m) => row >= (m.startRowIndex || 0) && row < (m.endRowIndex || 0) && col >= (m.startColumnIndex || 0) && col < (m.endColumnIndex || 0) && !(row === (m.startRowIndex || 0) && col === (m.startColumnIndex || 0)));

  // 새 달 탭 만들기 — 같은 모양의 가장 최근 달 탭을 복제하고 데이터 줄을 비운다(머리줄 · 수식 · 서식은 남김)
  async function createMonthTab(sid, profile, tab, sheets) {
    const C = await core();
    const kind = profile.tabPattern?.kind;
    const src = sheets.map((s) => ({ s, x: C.tabMonth(s.title) })).filter((o) => o.x && (!kind || o.x.kind === kind)).sort((a, b) => (b.x.y * 12 + b.x.m) - (a.x.y * 12 + a.x.m))[0]?.s;
    if (!src) throw Object.assign(new Error(`복제할 월별 탭이 없어요. 시트에 '${tab}' 탭을 먼저 만들어 주세요.`), { status: 400 });
    const dup = await sheetsApiFor(sid, "POST", ":batchUpdate", { data: { requests: [{ duplicateSheet: { sourceSheetId: src.sheetId, insertSheetIndex: src.index + 1, newSheetName: tab } }] } });
    const props = dup.replies[0].duplicateSheet.properties;
    const keep = (profile.dataStart ?? 1) + 1; // 머리줄 + 데이터 첫 줄 1개(수식 이어 쓰기용)
    const total = props.gridProperties?.rowCount || keep;
    if (total > keep) await sheetsApiFor(sid, "POST", ":batchUpdate", { data: { requests: [{ deleteDimension: { range: { sheetId: props.sheetId, dimension: "ROWS", startIndex: keep, endIndex: total } } }] } });
    // 남긴 첫 데이터 줄의 값 칸만 비운다(수식 칸은 그대로)
    const r = keep; // 1부터
    const formulas = (await readTab(sid, tab, "FORMULA", r))[r - 1] || [];
    const clear = profile.columns.filter((c) => (c.mode === "data" || c.mode === "id" || c.mode === "readonly") && !String(formulas[c.idx] || "").startsWith("="))
      .map((c) => ({ range: `${quoteTab(tab)}!${C.colLetter(c.idx)}${r}`, values: [[""]] }));
    if (clear.length) await sheetsApiFor(sid, "POST", "/values:batchUpdate", { data: { valueInputOption: "RAW", data: clear } });
    sheets.push({ ...props });
    return props;
  }

  async function exportAction(me, body) {
    const C = await core();
    const ps = await db.collection("sheetProfiles").doc(String(body.profileId || "x")).get();
    if (!ps.exists) throw Object.assign(new Error("시트 연결을 찾을 수 없어요."), { status: 404 });
    const profile = { id: ps.id, ...ps.data() };
    if (!me.isTM && profile.companyName !== me.company) throw Object.assign(new Error("다른 회사 시트예요."), { status: 403 });
    if (profile.engine === "legacy-dolcae") throw Object.assign(new Error("기존 연동 시트는 [구글시트 전송] 화면에서 보내 주세요."), { status: 400 });
    const sid = profile.spreadsheetId || parseSpreadsheetId(profile.sheetUrl);
    const okD = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ""));
    if (!okD(body.from) || !okD(body.to) || body.to < body.from) throw Object.assign(new Error("기간을 확인해 주세요."), { status: 400 });
    if ((Date.parse(body.to) - Date.parse(body.from)) / 864e5 > 92) throw Object.assign(new Error("한 번에 3달까지 보낼 수 있어요."), { status: 400 });
    const dryRun = body.dryRun === true;
    const scope = { ...(profile.scope || {}), companyName: profile.companyName };
    const fields = C.importedFields(profile);

    // 1) 보낼 오더 — 이 회사가 만든 오더만(배차표 · 고정노선 오더 · 다른 시트에 연결된 오더 · 취소 제외)
    const orders = [];
    for (const col of ["orders", "dispatch"]) {
      const snap = await db.collection(col).where("companyName", "==", profile.companyName).where("상차일", ">=", body.from).where("상차일", "<=", body.to + "").get();
      snap.docs.forEach((d) => {
        const x = d.data();
        if (!isProfileOwnOrder(scope, x) || isCanceled(x) || x.블라인드 === true) return;
        if (x.시트프로필Id && x.시트프로필Id !== profile.id) return;
        orders.push({ ref: d.ref, path: `${col}/${d.id}`, data: x });
      });
    }
    orders.sort((a, b) => String(a.data.상차일).localeCompare(String(b.data.상차일)) || (+a.data.createdAt?.toMillis?.() || 0) - (+b.data.createdAt?.toMillis?.() || 0));
    const meta = await sheetsApiFor(sid, "GET", "?fields=sheets.properties(sheetId,title,index,gridProperties)");
    const sheets = (meta.sheets || []).map((s) => s.properties);
    if (!dryRun && officeSheets?.isOffice(sid)) throw Object.assign(new Error("엑셀(xlsx) 파일이라 시트에 쓸 수 없어요. [구글 시트로 변환]을 눌러 구글 시트로 바꿔 주세요."), { status: 409, code: "office-file" });
    const sheetMt = Date.parse(await sheetModifiedTime(sid)) || 0;
    const byTab = new Map();
    const missingTabs = new Set();
    orders.forEach((o) => {
      const t = C.tabForDate(profile, o.data.상차일, sheets.map((s) => s.title));
      if (!t.tab) return;
      if (!t.exists) missingTabs.add(t.tab);
      if (!byTab.has(t.tab)) byTab.set(t.tab, []);
      byTab.get(t.tab).push(o);
    });
    const res = { total: orders.length, written: 0, cells: 0, appended: 0, protectedSkipped: 0, sheetNewer: 0, tabs: [...byTab.keys()], newTabs: [...missingTabs], dryRun, notes: [] };
    if (dryRun) {
      // 미리보기: 기존 줄 · 새 줄 개수만 센다(시트는 안 바꿈)
      for (const [tab, list] of byTab) {
        if (missingTabs.has(tab)) { res.appended += list.length; continue; }
        const mg = (await mergesOf(sid, [tab]))[tab]?.merges || [];
        const rows = C.applyMerges(await readTab(sid, tab), mg);
        const P = C.relocateProfile(profile, C.headerCellsAt(rows, profile));
        const idx = indexRows(C, P, rows);
        list.forEach((o) => { if (findRow(idx, o, profile)) res.written += 1; else res.appended += 1; });
      }
      return res;
    }

    for (const [tab, list] of byTab) {
      if (missingTabs.has(tab)) await createMonthTab(sid, profile, tab, sheets);
      const info = (await mergesOf(sid, [tab]))[tab] || { merges: [], grid: {} };
      const rows = C.applyMerges(await readTab(sid, tab), info.merges); // 병합 칸(세로로 합친 날짜 등)은 값을 펼쳐서 읽는다 · 쓰기는 왼쪽 위 칸만
      const formulas = await readTab(sid, tab, "FORMULA");
      const headerCells = C.headerCellsAt(rows, profile);
      const P = C.relocateProfile(profile, headerCells);
      if (C.missingRequired(P.columns).length) { res.notes.push(`${tab}: 머리줄이 바뀌어 필수 칸(${C.missingRequired(P.columns).join(", ")})을 못 찾았어요`); continue; }
      const idx = indexRows(C, P, rows);
      const idCol = P.columns.find((c) => c.mode === "id");
      const ranges = []; const linkUps = []; const fresh = [];
      list.forEach((o) => {
        const row = findRow(idx, o, profile);
        if (row == null) { fresh.push(o); return; }
        const cur = rows[row] || [];
        const sheetRec = C.rowToOrder(P, cur).rec;
        const decision = o.data._sheetHash ? C.syncDecision({ sheetHash: C.fieldsHash(sheetRec, fields), link: { hash: o.data._sheetHash, at: o.data._sheetSyncAt }, programEditedAt: o.data._lastModified, sheetModifiedAt: sheetMt }) : "program";
        if (decision === "sheet" || decision === "conflict-sheet") { res.sheetNewer += 1; return; } // 시트가 더 나중 → 가져오기에서 반영
        const cells = C.orderToCells(P, o.data);
        const plan = C.planRowWrite(P, cells, { current: cur, formulas: formulas[row] || [], merged: mergedFn(info.merges, row) });
        res.protectedSkipped += plan.blocked.length;
        const after = [...cur];
        plan.writes.forEach((w) => { ranges.push({ range: `${quoteTab(tab)}!${C.colLetter(w.col)}${row + 1}`, values: [[w.value]] }); after[w.col] = w.value; });
        if (idCol && String(cur[idCol.idx] || "").trim() !== o.path && !String((formulas[row] || [])[idCol.idx] || "").startsWith("=")) { ranges.push({ range: `${quoteTab(tab)}!${C.colLetter(idCol.idx)}${row + 1}`, values: [[o.path]] }); after[idCol.idx] = o.path; }
        if (plan.writes.length) res.written += 1;
        res.cells += plan.writes.length;
        const r2 = C.rowToOrder(P, after);
        linkUps.push({ o, tab, row: row + 1, key: r2.key, hash: C.fieldsHash(r2.rec, fields) });
      });
      for (let i = 0; i < ranges.length; i += 500) await sheetsApiFor(sid, "POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: ranges.slice(i, i + 500) } });

      // 2) 새 줄 — 표 끝(합계 줄이 있으면 그 위)에 끼워 넣고, 수식 칸은 윗줄 수식을 이어 붙인다
      if (fresh.length) {
        const ap = C.findAppendRow(P, rows);
        const sheetId = info.sheetId ?? sheets.find((s) => s.title === tab)?.sheetId;
        const gridRows = info.grid?.rowCount || rows.length;
        const reqs = [];
        // 그 자리에 빈 줄(서식만 있는 줄)이 충분하면 그대로 쓰고, 아니면 줄을 끼워 넣는다
        let freeRows = 0;
        for (let r = ap.row; r < ap.row + fresh.length && r < gridRows; r++) { const cs = rows[r] || []; if (cs.some((c) => String(c || "").trim())) break; freeRows += 1; }
        if (ap.insert || freeRows < fresh.length) {
          const need = ap.insert ? fresh.length : fresh.length - freeRows;
          const at = ap.insert ? ap.row : ap.row + freeRows;
          if (at >= gridRows) reqs.push({ appendDimension: { sheetId, dimension: "ROWS", length: need + (at - gridRows) } });
          else reqs.push({ insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: at, endIndex: at + need }, inheritFromBefore: at > (P.dataStart || 1) } });
        }
        // 계산열 수식 이어 붙이기(윗 데이터 줄의 수식을 새 줄들에)
        if (ap.prevDataRow >= 0) {
          P.columns.filter((c) => c.mode === "calc" && String((formulas[ap.prevDataRow] || [])[c.idx] || "").startsWith("=")).forEach((c) => {
            reqs.push({ copyPaste: {
              source: { sheetId, startRowIndex: ap.prevDataRow, endRowIndex: ap.prevDataRow + 1, startColumnIndex: c.idx, endColumnIndex: c.idx + 1 },
              destination: { sheetId, startRowIndex: ap.row, endRowIndex: ap.row + fresh.length, startColumnIndex: c.idx, endColumnIndex: c.idx + 1 },
              pasteType: "PASTE_FORMULA",
            } });
          });
        }
        if (reqs.length) await sheetsApiFor(sid, "POST", ":batchUpdate", { data: { requests: reqs } });
        const adds = [];
        fresh.forEach((o, k) => {
          const row = ap.row + k;
          const cells = C.orderToCells(P, o.data);
          const plan = C.planRowWrite(P, cells, { current: [], formulas: [], onlyChanged: true });
          const after = [];
          plan.writes.forEach((w) => { adds.push({ range: `${quoteTab(tab)}!${C.colLetter(w.col)}${row + 1}`, values: [[w.value]] }); after[w.col] = w.value; });
          if (idCol) { adds.push({ range: `${quoteTab(tab)}!${C.colLetter(idCol.idx)}${row + 1}`, values: [[o.path]] }); after[idCol.idx] = o.path; }
          const r2 = C.rowToOrder(P, after);
          linkUps.push({ o, tab, row: row + 1, key: r2.key, hash: C.fieldsHash(r2.rec, fields) });
        });
        for (let i = 0; i < adds.length; i += 500) await sheetsApiFor(sid, "POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: adds.slice(i, i + 500) } });
        res.appended += fresh.length;
      }
      // 3) 오더에 연결 기록(다음번 "누가 마지막에 고쳤나" 비교용)
      const now = Date.now();
      for (let i = 0; i < linkUps.length; i += 400) {
        const wb = db.batch();
        linkUps.slice(i, i + 400).forEach((u) => wb.update(u.o.ref, { 시트프로필Id: profile.id, 시트키: u.key || u.o.data.시트키 || "", _sheetHash: u.hash, _sheetSyncAt: now, _sheetRow: { tab: u.tab, row: u.row } }));
        await wb.commit();
      }
    }
    await ps.ref.set({ lastExportAt: FieldValue.serverTimestamp(), lastExport: { ...res, by: me.email, from: body.from, to: body.to }, lastError: "" }, { merge: true });
    return res;
  }
  // 시트 줄 찾기 표 — 오더ID 칸 값 · 중복 확인 열쇠
  function indexRows(C, P, rows) {
    const byId = new Map(); const byKey = new Map();
    const idCol = P.columns.find((c) => c.mode === "id");
    const start = P.dataStart ?? 1;
    for (let i = start; i < rows.length; i++) {
      const cs = rows[i] || [];
      if (!cs.some((c) => String(c || "").trim())) continue;
      if (idCol && String(cs[idCol.idx] || "").trim()) byId.set(String(cs[idCol.idx]).trim(), i);
      const k = C.rowToOrder(P, cs).key;
      if (k && !byKey.has(k)) byKey.set(k, i);
    }
    return { byId, byKey };
  }
  const findRow = (idx, o, profile) => idx.byId.get(o.path) ?? idx.byId.get(o.path.split("/").pop()) ?? (o.data.시트프로필Id === profile.id && o.data.시트키 ? idx.byKey.get(o.data.시트키) : undefined);

  async function cancelImportAction(me, body) {
    const ref = db.collection("importBatches").doc(String(body.batchId || "x"));
    const bs = await ref.get();
    if (!bs.exists) throw Object.assign(new Error("가져오기 기록을 찾을 수 없어요."), { status: 404 });
    const b = bs.data();
    if (!me.isTM && b.companyName !== me.company) throw Object.assign(new Error("다른 회사 기록이에요."), { status: 403 });
    if (b.status === "canceled") throw Object.assign(new Error("이미 되돌렸어요."), { status: 400 });
    await setBulkMode(b.companyName, true);
    let removed = 0;
    try {
      const writer = db.bulkWriter();
      for (const col of ["orders", "clients", "places", "drivers"]) {
        const snap = await db.collection(col).where("importBatchId", "==", ref.id).get();
        snap.docs.forEach((d) => { if ((d.data().companyName || "") === b.companyName) { writer.delete(d.ref); removed += 1; } });
      }
      await writer.close();
    } finally { await setBulkMode(b.companyName, false); }
    await bumpDataVersion(b.companyName);
    await ref.set({ status: "canceled", canceledAt: FieldValue.serverTimestamp(), canceledBy: me.email || "", removed }, { merge: true });
    return { ok: true, removed };
  }

  return async function handler(req, res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "POST만 허용됩니다." }); return; }
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    try {
      const a = body.action;
      if (a === "export" || a === "cancelImport" || a === "aiMap") {
        const me = await requireAdminRole(req, body);
        if (a === "export") {
          try { res.json(await exportAction(me, body)); }
          catch (e) {
            if (body.profileId && e.status !== 403) await db.collection("sheetProfiles").doc(String(body.profileId)).set({ lastError: String(e?.message || e).slice(0, 300), lastErrorAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
            throw e;
          }
          return;
        }
        if (a === "cancelImport") { res.json(await cancelImportAction(me, body)); return; }
        try { res.json(await aiMapAction(body.columns)); } catch (e) { console.warn("[시트 연결] AI 칸 맞추기 실패:", e?.message || e); res.json({ suggestions: [], engine: "error" }); }
        return;
      }
      const me = await requireStaff(req, body);
      const sid = parseSpreadsheetId(body.url);
      if (!sid) { res.status(400).json({ error: "구글시트 주소가 올바르지 않아요." }); return; }
      if (a === "tabs") { res.json(await tabsAction(sid)); return; }
      if (a === "convert") {
        if (!officeSheets) { res.status(400).json({ error: "변환을 쓸 수 없어요." }); return; }
        const out = await officeSheets.convert(sid, { shareWith: me.email || "" });
        if (body.profileId && !out.already) {
          const ref = db.collection("sheetProfiles").doc(String(body.profileId));
          const ps = await ref.get();
          if (ps.exists && (me.isTM || ps.data().companyName === me.company) && (ps.data().spreadsheetId || parseSpreadsheetId(ps.data().sheetUrl)) === sid) {
            await ref.set({ sheetUrl: out.url, spreadsheetId: out.spreadsheetId, 원본엑셀Url: ps.data().sheetUrl || "", convertedAt: FieldValue.serverTimestamp(), lastError: "" }, { merge: true });
            out.profileUpdated = true;
          }
        }
        console.log(`[시트 연결 엑셀 변환] ${me.company} ${me.email} ${sid} → ${out.spreadsheetId}`);
        res.json(out);
        return;
      }
      if (a === "sample") {
        const tab = String(body.tab || "");
        const [rows, formulas, m] = await Promise.all([readTab(sid, tab, "FORMATTED_VALUE", 60), readTab(sid, tab, "FORMULA", 60), mergesOf(sid, [tab])]);
        res.json({ tab, rows, formulas, merges: (m[tab]?.merges || []).filter((x) => (x.startRowIndex || 0) < 60) });
        return;
      }
      if (a === "read") {
        const tabs = (Array.isArray(body.tabs) ? body.tabs : []).map(String).slice(0, 24);
        if (!tabs.length) { res.status(400).json({ error: "가져올 탭을 골라 주세요." }); return; }
        const m = await mergesOf(sid, tabs);
        const out = [];
        for (const t of tabs) out.push({ title: t, rows: await readTab(sid, t), merges: m[t]?.merges || [] });
        console.log(`[시트 연결 읽기] ${me.company} ${me.email} ${sid} ${tabs.join(",")}`);
        res.json({ tabs: out, modifiedTime: await sheetModifiedTime(sid) });
        return;
      }
      res.status(400).json({ error: "알 수 없는 요청이에요." });
    } catch (e) {
      console.error("[시트 연결] 오류:", e?.message || e);
      res.status(e.status || 500).json({ error: e?.message || String(e), ...(e.code === "office-file" || e.code === "convert-denied" ? { code: e.code, help: e.help || "" } : {}) });
    }
  };
}

module.exports = { makeSheetConnect };
