// ======================= functions/sheetPushOrders.js =======================
// 🔁 2026-11-14 프로그램 → 구글시트 반영(시트 실시간 반영의 반대 방향) — 지금은 JY로지스틱스
//  · 설정: sheetLive/{회사}.pushMode = "off"(기본) · "dry"(점검 — 무엇을 쓸지만 기록, 시트는 그대로) · "on"(시트에 쓴다)
//    실시간 반영(enabled)이 켜져 있을 때만 동작한다. 관리센터 › 배차일지 가져오기 › [프로그램 → 시트 반영]에서 바꾼다
//  · 오더가 바뀌면(queueOrderSheetPush — orders 문서 트리거) sheetPushQueue/{오더ID} 에 적어 두고,
//    1분마다 도는 실시간 반영(syncSheetOrders)이 시트를 읽기 전에 먼저 처리한다(같은 함수 안에서 차례로 → 서로 엇갈리지 않는다)
//  · 무엇을 어느 칸에 쓸지는 functions/sheetPushCore.mjs(쓰기 전에 가져오기 규칙으로 다시 읽어 확인 · 수식 칸은 안 건드림)
//  · 삭제 = 그 줄의 값만 비운다. 한꺼번에 20건 넘게 지워지면 시트는 건드리지 않고 보류(관리센터에서 확인 후 진행 · 버리기)
//  · 새 오더 = 그 오더의 담당노선구분(= 시트 탭 이름 · 오더 화면에서 고른다)이 있으면 그 탭, 없으면 같은 거래처 · 상차지 · 하차지가 이미 있는 탭 — 의 맨 아래 빈 줄
//    탭을 못 정하면 오더에 시트탭필요 · 시트탭후보 를 적어 두고, 오더에서 담당노선구분을 고르면 그 탭에 넣는다
const QUEUE = "sheetPushQueue";
const MAX_PER_RUN = 20; // 한 번(1분)에 처리할 오더 수 — 한 건마다 시트 전체를 가져오기 규칙으로 두 번쯤 다시 읽는다
const HOLD_DELETES = 20; // 지울 줄이 이보다 많으면 보류
const KEEP_DONE_MS = 3 * 86400000;
const SERVICE_ACCOUNT_HINT = "시트를 서버 계정(dispatch-app-9b92f@appspot.gserviceaccount.com)에 '편집자'로 공유해 주세요.";
const MODES = ["off", "dry", "on"];
const ts = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : Number(v) || 0);

function makeSheetPush({ db, FieldValue, sheetsApiFor, parseSpreadsheetId, quoteTab }) {
  const q = () => db.collection(QUEUE);
  let _core = null;
  const core = () => (_core || (_core = import("./sheetPushCore.mjs")));

  // 회사별 설정(20초 기억 — 오더가 바뀔 때마다 읽지 않게)
  const cfgCache = new Map();
  async function modeFor(co) {
    const hit = cfgCache.get(co);
    if (hit && Date.now() - hit.at < 20000) return hit.mode;
    const x = (await db.collection("sheetLive").doc(co).get().catch(() => null))?.data() || null;
    const mode = x && x.enabled === true && MODES.includes(x.pushMode) ? x.pushMode : "off";
    cfgCache.set(co, { at: Date.now(), mode });
    return mode;
  }

  // 대기열에 적어 둘 만큼만(견줄 칸 + 줄 찾기에 쓰는 칸)
  async function trim(data) {
    const C = await core();
    const keep = new Set([...C.watchedKeys(data), "이전출처", "_sheetKeys", "_programKeys", "_sheetBase", "companyName", "등록기기", "이전줄수", "경유상차목록"]);
    const out = {};
    Object.entries(data || {}).forEach(([k, v]) => { if (keep.has(k) && v !== undefined) out[k] = v; });
    return out;
  }

  // ── orders 문서가 바뀔 때 ─────────────────────────────────────────────
  async function onOrderWrite(change, context) {
    const b = change.before.exists ? change.before.data() : null;
    const a = change.after.exists ? change.after.data() : null;
    const co = String((a || b)?.companyName || "").trim();
    if (!co) return null;
    if ((await modeFor(co)) === "off") return null;
    // 서버가 쓴 것(시트 → 프로그램 반영 · 시트에 쓴 뒤 남기는 표시)은 다시 시트로 보내지 않는다
    if (a && b && (ts(a.시트반영일시) !== ts(b.시트반영일시) || ts(a.시트기록일시) !== ts(b.시트기록일시))) return null;
    const C = await core();
    const id = context.params.orderId;
    let kind = "";
    if (!b && a) { if (a.등록기기 === "구글시트 이전" || a.이전출처) return null; kind = "create"; }
    else if (b && !a) kind = b.이전출처 ? "delete" : "drop";
    else if (a.이전출처) { if (!C.changedKeys(b, a).length) return null; kind = "update"; }
    else { if (a.등록기기 === "구글시트 이전") return null; if (String(a.시트탭 || "") === String(b.시트탭 || "") && String(a.담당노선구분 || "") === String(b.담당노선구분 || "") && !C.changedKeys(b, a).length) return null; kind = "create"; }
    const before = b ? await trim(b) : null;
    await db.runTransaction(async (tx) => {
      const ref = q().doc(id); const cur = (await tx.get(ref)).data();
      const pend = cur && cur.state === "pending" ? cur : null;
      if (kind === "drop") { if (cur && cur.kind === "create") tx.delete(ref); return; } // 시트에 줄이 없는 오더를 지움 → 할 일 없음
      if (kind === "delete" && pend && pend.kind === "create") { tx.delete(ref); return; }
      const next = { companyName: co, orderId: id, state: "pending", at: Date.now(), tries: 0, kind: pend && pend.kind === "create" && kind === "update" ? "create" : kind,
        before: kind === "create" ? null : (pend && pend.before) || before, approved: false, result: null, doneAt: 0,
        label: [((a || b).상차일 || ""), ((a || b).거래처명 || ""), ((a || b).상차지명 || ""), "→", ((a || b).하차지명 || ""), ((a || b).차량번호 || "")].join(" ").replace(/\s+/g, " ").trim().slice(0, 120) };
      tx.set(ref, next);
    });
    return null;
  }

  // ── 시트 읽기 · 쓰기 ────────────────────────────────────────────────
  async function readAll(id, formulaTabs) {
    const meta = await sheetsApiFor(id, "GET", `?fields=${encodeURIComponent("sheets(properties(sheetId,title,index,gridProperties(rowCount)),merges)")}`);
    const all = (meta.sheets || []).sort((x, y) => x.properties.index - y.properties.index);
    const tabs = []; const formulas = {}; const grid = {};
    for (let i = 0; i < all.length; i += 10) {
      const part = all.slice(i, i + 10);
      const got = await sheetsApiFor(id, "GET", `/values:batchGet?${part.map((s) => `ranges=${encodeURIComponent(quoteTab(s.properties.title))}`).join("&")}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
      part.forEach((s, k) => { tabs.push({ title: s.properties.title, rows: got.valueRanges?.[k]?.values || [], merges: s.merges || [] }); grid[s.properties.title] = { sheetId: s.properties.sheetId, rowCount: s.properties.gridProperties?.rowCount || 0 }; });
    }
    const want = all.map((s) => s.properties.title).filter((t) => !formulaTabs || formulaTabs.has(t));
    for (let i = 0; i < want.length; i += 10) {
      const part = want.slice(i, i + 10);
      const got = await sheetsApiFor(id, "GET", `/values:batchGet?${part.map((t) => `ranges=${encodeURIComponent(quoteTab(t))}`).join("&")}&valueRenderOption=FORMULA`);
      part.forEach((t, k) => { formulas[t] = got.valueRanges?.[k]?.values || []; });
    }
    return { tabs, formulas, grid };
  }
  const writeCells = (id, tab, cells) => sheetsApiFor(id, "POST", "/values:batchUpdate", { data: { valueInputOption: "USER_ENTERED", data: cells.map((c) => ({ range: `${quoteTab(tab)}!${c.a1}`, values: [[String(c.value ?? "")]] })) } });
  const writeErr = (e) => { const st = e?.response?.status || e?.status; return st === 403 || st === 401 || /permission|PERMISSION_DENIED|caller does not have/i.test(String(e?.message || "")) ? `시트에 쓸 권한이 없습니다 — ${SERVICE_ACCOUNT_HINT}` : String(e?.message || e).slice(0, 200); };

  // ── 한 회사의 대기열 처리 — 실시간 반영(runAll)이 시트를 읽기 전에 부른다 → { wrote } ─────────────
  //  deps: { presetFor(co, M) → 가져오기 설정, placesFor(co) → 등록된 상하차지 }
  async function process(co, cfg, deps) {
    const mode = cfg.enabled === true && MODES.includes(cfg.pushMode) ? cfg.pushMode : "off";
    const snap = await q().where("companyName", "==", co).where("state", "==", "pending").limit(300).get();
    if (snap.empty) return { wrote: false };
    if (mode === "off") { const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit(); return { wrote: false }; } // 꺼 둔 동안 쌓인 것은 버린다
    const id = parseSpreadsheetId(cfg.url);
    if (!id) return { wrote: false };
    const all = snap.docs.map((d) => ({ ref: d.ref, ...d.data() })).sort((x, y) => (x.at || 0) - (y.at || 0));
    const C = await core(); const M = await import("./carrierMigrateCore.mjs"); const P = await import("./sheetProfileCore.mjs");
    const preset = { ...(await deps.presetFor(co, M)), extraPlaces: await deps.placesFor(co) };
    const pushTabs = Array.isArray(cfg.tabs) ? cfg.tabs.map(String) : [];
    const book = await readAll(id, null);
    const ctx = C.makePushContext(book.tabs.map((t) => ({ title: t.title, rows: P.applyMerges(t.rows, t.merges) })), preset, book.formulas);
    const done = (it, state, result, extra = {}) => it.ref.set({ state, doneAt: Date.now(), result: result || null, ...extra }, { merge: true });
    const summary = (p) => ({ tab: p.tab || "", row: p.row || 0, cells: (p.cells || []).slice(0, 40).map((c) => ({ a1: c.a1, was: String(c.was ?? "").slice(0, 80), value: String(c.value ?? "").slice(0, 80) })), pushed: p.pushed || [], unpushed: p.unpushed || [], reason: p.reason || "" });
    // 삭제가 한꺼번에 많으면(전체 지우기 · 회사 초기화 등) 시트는 건드리지 않고 보류 — 관리센터에서 확인한 것(approved)만 진행
    const dels = all.filter((x) => x.kind === "delete" && !x.approved);
    const hold = mode === "on" && dels.length > HOLD_DELETES;
    let wrote = false; let n = 0; const taken = new Set();
    for (const it of all) {
      if (n >= MAX_PER_RUN) break;
      try {
        const doc = it.kind === "delete" ? null : await db.collection("orders").doc(it.orderId).get();
        if (doc && !doc.exists) { await it.ref.delete(); continue; } // 그사이 지워짐 — 삭제 건이 따로 온다
        const after = doc ? doc.data() || {} : null;
        const day = String((after || it.before || {}).상차일 || "");
        if (preset.fromDate && day && day < preset.fromDate) { await done(it, "skipped", { reason: `${preset.fromDate} 이전 오더는 시트와 맞추지 않습니다` }); continue; }
        let plan;
        if (it.kind === "delete") {
          plan = C.planDelete(ctx, it.before || {}, { taken });
          if (plan.ok && plan.cells.length && hold) { await done(it, "held", { ...summary(plan), reason: `삭제 ${dels.length}건이 한꺼번에 들어와 보류했습니다` }); continue; }
        } else if (it.kind === "update") {
          plan = C.planUpdate(ctx, { ...(it.before || {}), 이전출처: (it.before || {}).이전출처 || after.이전출처 }, after, { taken });
        } else {
          // 탭: 오더에서 고른 담당노선구분(= 탭 이름)이 먼저, 없으면 같은 구간이 이미 있는 탭
          const okTab = (t) => !!t && ctx.tabs.some((x) => x.title === t) && (!pushTabs.length || pushTabs.includes(t));
          let tab = [after.시트탭, after.담당노선구분].map((v) => String(v || "").trim()).find(okTab) || "";
          if (!tab) { const pk = C.pickTab(ctx, after, pushTabs); tab = pk.tab || "";
            if (!tab) {
              if (mode === "on") await doc.ref.set({ 시트탭필요: true, 시트탭후보: (pk.candidates || []).slice(0, 30), 시트기록일시: FieldValue.serverTimestamp() }, { merge: true });
              await done(it, "needTab", { reason: "어느 탭에 넣을지 정하지 못했습니다(오더에서 탭을 골라 주세요)", candidates: (pk.candidates || []).slice(0, 30) }); continue;
            } }
          plan = C.planCreate(ctx, after, tab, { rowCount: book.grid[tab]?.rowCount || 0 });
          if (!plan.ok && plan.needRows && mode === "on") { // 탭에 빈 줄이 없으면 200줄 늘리고 다시
            await sheetsApiFor(id, "POST", ":batchUpdate", { data: { requests: [{ appendDimension: { sheetId: book.grid[tab].sheetId, dimension: "ROWS", length: 200 } }] } });
            book.grid[tab].rowCount += 200; wrote = true;
            plan = C.planCreate(ctx, after, tab, { rowCount: book.grid[tab].rowCount });
          }
        }
        n += 1;
        if (!plan.ok) { await done(it, "failed", summary(plan)); continue; }
        if (plan.tab && plan.row) taken.add(`${plan.tab}!${plan.row}`);
        if (mode === "dry") { await done(it, "dry", summary(plan)); continue; }
        if (plan.cells && plan.cells.length) {
          try { await writeCells(id, plan.tab, plan.cells); wrote = true; }
          catch (e) { // 못 썼다 — 이번 차례는 여기서 멈춘다(나머지는 다음에). 권한 문제면 화면에 그대로 알린다
            const msg = writeErr(e);
            await it.ref.set({ tries: (it.tries || 0) + 1, lastError: msg, ...(it.tries >= 4 ? { state: "failed", doneAt: Date.now(), result: { ...summary(plan), reason: msg } } : {}) }, { merge: true });
            await db.collection("sheetLive").doc(co).set({ pushError: msg, pushErrorAt: Date.now() }, { merge: true });
            return { wrote, error: msg };
          }
        }
        if (doc && plan.docPatch) await doc.ref.set({ ...plan.docPatch, 시트탭필요: FieldValue.delete(), 시트탭후보: FieldValue.delete(), 시트기록일시: FieldValue.serverTimestamp() }, { merge: true });
        await done(it, "done", summary(plan));
      } catch (e) {
        console.error(`[시트 쓰기 실패] ${co} ${it.orderId}:`, e?.message || e);
        await it.ref.set({ tries: (it.tries || 0) + 1, lastError: String(e?.message || e).slice(0, 200), ...(it.tries >= 4 ? { state: "failed", doneAt: Date.now(), result: { reason: String(e?.message || e).slice(0, 200) } } : {}) }, { merge: true }).catch(() => {});
      }
    }
    if (wrote) await db.collection("sheetLive").doc(co).set({ pushError: "", lastPushAt: Date.now() }, { merge: true });
    await writeIssueCount(co).catch(() => {});
    return { wrote };
  }

  // 직원 화면의 "구글시트" 표시(src/routeGroups.jsx SheetLiveChip)에 알릴 것 — 탭을 못 정한 오더 수 · 확인이 필요한 건수(보류 · 실패)
  async function writeIssueCount(co) {
    const snap = await q().where("companyName", "==", co).limit(400).get();
    const n = (st) => snap.docs.filter((d) => d.data().state === st).length;
    await db.collection("companySettings").doc(co).set({ sheetLiveStatus: { needTab: n("needTab"), pushIssue: n("held") + n("failed") } }, { merge: true });
  }

  // 지웠는데 시트 줄이 아직 남아 있는 오더(대기 · 보류 · 실패한 삭제) — 실시간 반영이 그 줄을 오더로 다시 만들지 않게
  async function pendingDeletes(co) {
    const snap = await q().where("companyName", "==", co).where("kind", "==", "delete").limit(500).get();
    return snap.docs.map((d) => d.data()).filter((x) => ["pending", "held", "failed"].includes(x.state) && x.before).map((x) => x.before);
  }

  // 실시간 반영을 끈 회사 · 시트 쓰기를 끈 회사의 대기 건은 버린다(나중에 다시 켰을 때 묵은 변경이 한꺼번에 시트로 가지 않게)
  async function purgeInactive(activeCompanies) {
    const snap = await q().where("state", "==", "pending").limit(300).get().catch(() => null);
    if (!snap || snap.empty) return;
    const dead = snap.docs.filter((d) => !activeCompanies.has(d.data().companyName));
    if (!dead.length) return;
    const b = db.batch(); dead.forEach((d) => b.delete(d.ref)); await b.commit();
  }

  // 끝난 기록은 3일 뒤 지운다(보류 · 실패는 사람이 볼 때까지 둔다)
  async function sweep() {
    const snap = await q().where("doneAt", ">", 0).where("doneAt", "<", Date.now() - KEEP_DONE_MS).limit(300).get().catch(() => null);
    if (!snap || snap.empty) return;
    const b = db.batch(); snap.docs.forEach((d) => { if (["done", "dry", "skipped"].includes(d.data().state)) b.delete(d.ref); }); await b.commit();
  }

  // ── 관리센터 요청(최고관리자) — pushGet · pushSet · pushResolve ─────────────────────
  async function handle(action, body) {
    const co = String(body.company || "").trim();
    if (!co) throw Object.assign(new Error("운송사를 골라 주세요."), { status: 400 });
    const ref = db.collection("sheetLive").doc(co);
    const view = async () => {
      const cfg = (await ref.get()).data() || {};
      const snap = await q().where("companyName", "==", co).limit(400).get();
      const items = snap.docs.map((d) => { const x = d.data(); return { id: d.id, kind: x.kind, state: x.state, at: x.at || 0, doneAt: x.doneAt || 0, label: x.label || "", result: x.result || null, lastError: x.lastError || "" }; }).sort((x, y) => (y.doneAt || y.at) - (x.doneAt || x.at));
      const count = (s) => items.filter((x) => x.state === s).length;
      return { push: { mode: MODES.includes(cfg.pushMode) ? cfg.pushMode : "off", liveOn: cfg.enabled === true, error: cfg.pushError || "", lastPushAt: cfg.lastPushAt || 0, pending: count("pending"), held: count("held"), failed: count("failed"), needTab: count("needTab"), items: items.slice(0, 80) } };
    };
    if (action === "pushGet") return view();
    if (action === "pushSet") {
      const mode = MODES.includes(body.mode) ? body.mode : "off";
      const cfg = (await ref.get()).data() || {};
      if (mode !== "off" && !parseSpreadsheetId(cfg.url)) throw Object.assign(new Error("먼저 실시간 반영할 시트를 저장해 주세요."), { status: 400 });
      if (mode === "on") { // 켜기 전에 정말 쓸 수 있는지 확인 — 첫 탭 A1 칸을 읽어서 같은 값으로 다시 쓴다(내용은 바뀌지 않는다)
        const id = parseSpreadsheetId(cfg.url);
        try {
          const meta = await sheetsApiFor(id, "GET", "?fields=sheets.properties(title,index)");
          const first = (meta.sheets || []).sort((x, y) => x.properties.index - y.properties.index)[0]?.properties?.title;
          const got = await sheetsApiFor(id, "GET", `/values/${encodeURIComponent(`${quoteTab(first)}!A1`)}?valueRenderOption=FORMULA`);
          await writeCells(id, first, [{ a1: "A1", value: got.values?.[0]?.[0] ?? "" }]);
        } catch (e) { throw Object.assign(new Error(writeErr(e)), { status: 400 }); }
      }
      await ref.set({ pushMode: mode, pushError: "", updatedAt: Date.now() }, { merge: true });
      cfgCache.delete(co);
      return view();
    }
    if (action === "pushResolve") { // 보류 · 실패 · 점검 기록: go = 다시 진행(보류한 삭제를 확인함) · 아니면 버린다
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 400);
      const b = db.batch();
      for (const id of ids) {
        const d = await q().doc(id).get(); if (!d.exists || d.data().companyName !== co) continue;
        if (body.go) b.set(d.ref, { state: "pending", approved: true, tries: 0, doneAt: 0, lastError: "" }, { merge: true }); else b.delete(d.ref);
      }
      await b.commit();
      await writeIssueCount(co).catch(() => {});
      return view();
    }
    return null;
  }

  return { onOrderWrite, process, pendingDeletes, purgeInactive, sweep, handle, modeFor };
}

module.exports = { makeSheetPush };
