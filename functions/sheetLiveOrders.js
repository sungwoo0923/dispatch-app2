// ======================= functions/sheetLiveOrders.js =======================
// 🔁 2026-11-13 구글시트 실시간 반영 — 시트에서만 입력 · 수정하는 운송사(지금은 JY로지스틱스)
//  · 설정: sheetLive/{회사} = { companyName, url, tabs[], enabled, days, removeMissing, lastMt, lastHash, lastRunAt, lastResult, lastError }
//    (관리센터 › 배차일지 가져오기 › [실시간 반영]에서 켠다 — 서버만 읽고 쓴다)
//  · 1분마다(syncSheetOrders): 시트가 바뀌었을 때만(Drive 수정 시각) 읽어서 → carrierMigrateCore.buildMigration → reconcileOrders
//    → orders 에 새 줄은 만들고, 바뀐 줄은 바뀐 칸만 고치고, 시트에서 지운 줄은 지운다(removeMissing)
//  · orders 문서가 바뀌므로 배차현황 · 실시간 · 정산 등 오더를 보는 모든 화면에 바로 반영된다(화면은 onSnapshot)
//  · 반영 범위: 상차일이 오늘 − days 이후인 줄(지난 달 정산 끝난 오더는 건드리지 않는다)
const crypto = require("crypto");

const kstYmd = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const FULL_EVERY_MS = 30 * 60 * 1000; // 시트 수정 시각이 같아도 30분에 한 번은 전체 비교
const NO_META_EVERY_MS = 5 * 60 * 1000; // 수정 시각을 못 읽으면 5분마다

function makeSheetLive({ db, FieldValue, sheetsApiFor, parseSpreadsheetId, quoteTab, sheetModifiedTime, bumpDataVersion }) {
  const ref = (co) => db.collection("sheetLive").doc(co);

  async function readTabs(id, wanted) {
    const meta = await sheetsApiFor(id, "GET", `?fields=${encodeURIComponent("properties.title,sheets(properties(title,index),merges)")}`);
    const all = (meta.sheets || []).sort((a, b) => a.properties.index - b.properties.index);
    const want = Array.isArray(wanted) && wanted.length ? new Set(wanted.map(String)) : null;
    const pick = all.filter((s) => !want || want.has(s.properties.title));
    const out = [];
    for (let i = 0; i < pick.length; i += 10) {
      const part = pick.slice(i, i + 10);
      const got = await sheetsApiFor(id, "GET", `/values:batchGet?${part.map((s) => `ranges=${encodeURIComponent(quoteTab(s.properties.title))}`).join("&")}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
      part.forEach((s, k) => out.push({ title: s.properties.title, rows: got.valueRanges?.[k]?.values || [], merges: s.merges || [] }));
    }
    return out;
  }

  // 화면(CarrierMigratePanel)과 같은 규칙으로 설정을 합친다 — 저장된 설정 + 회사별 시작 규칙(시작 규칙이 이김)
  async function presetFor(co, M) {
    const sug = M.presetSuggestionFor(co) || {};
    const saved = (await db.collection("companySettings").doc(co).get().catch(() => null))?.data()?.migrationPreset || null;
    const base = saved ? { ...saved, ...sug, extraNames: { ...(sug.extraNames || {}), ...(saved.extraNames || {}) }, placeOverrides: { ...(sug.placeOverrides || {}), ...(saved.placeOverrides || {}) }, tabClients: saved.tabClients || {}, skipTabs: saved.skipTabs || [],
      dispatchAliases: { ...(saved.dispatchAliases || {}), ...(sug.dispatchAliases || {}) }, vehicleGrades: { ...(saved.vehicleGrades || {}), ...(sug.vehicleGrades || {}) } } : sug;
    return { ...M.DEFAULT_PRESET, ...base, dispatchAliases: { ...M.DEFAULT_PRESET.dispatchAliases, ...(base.dispatchAliases || {}) }, vehicleGrades: { ...M.DEFAULT_PRESET.vehicleGrades, ...(base.vehicleGrades || {}) } };
  }

  async function existingOrders(co, from) {
    const base = db.collection("orders").where("companyName", "==", co).where("등록기기", "==", "구글시트 이전");
    let snap;
    try { snap = await base.where("상차일", ">=", from).get(); } // 색인(companyName · 등록기기 · 상차일)이 있으면 범위만 읽는다
    catch { snap = await base.get(); }
    return snap.docs.map((d) => ({ id: d.id, data: d.data() || {} })).filter((e) => String(e.data.상차일 || "") >= from);
  }

  // 한 회사 반영 — force: 수정 시각 · 내용이 같아도 비교한다
  async function runOne(co, cfg, { force = false, by = "구글시트 실시간" } = {}) {
    const id = parseSpreadsheetId(cfg.url);
    if (!id) throw new Error("구글시트 주소가 올바르지 않습니다.");
    const now = Date.now();
    const mt = await sheetModifiedTime(id);
    if (!force) {
      if (mt && mt === String(cfg.lastMt || "") && now - Number(cfg.lastFullAt || 0) < FULL_EVERY_MS) return { skipped: "unchanged" };
      if (!mt && now - Number(cfg.lastRunAt || 0) < NO_META_EVERY_MS) return { skipped: "wait" };
    }
    const M = await import("./carrierMigrateCore.mjs");
    const P = await import("./sheetProfileCore.mjs");
    const raw = await readTabs(id, cfg.tabs);
    if (!raw.length) throw new Error("읽을 탭이 없습니다.");
    const tabs = raw.map((t) => ({ title: t.title, rows: P.applyMerges(t.rows, t.merges) }));
    const preset = await presetFor(co, M);
    const places = (await db.collection("places").where("companyName", "==", co).get()).docs.map((d) => { const x = d.data() || {}; const c = (Array.isArray(x.contacts) && (x.contacts.find((k) => k.isPrimary) || x.contacts[0])) || {}; return { name: x.업체명 || "", address: x.주소 || "", phone: c.phone || x.담당자번호 || "", person: c.name || x.담당자 || "" }; }).filter((p) => p.name);
    const built = M.buildMigration(tabs, { ...preset, extraPlaces: places });
    const days = Math.max(1, Math.min(400, Number(cfg.days) || 14));
    const from = kstYmd(now - days * 86400000);
    const incoming = built.orders.filter((o) => String(o.상차일 || "") >= from);
    const hash = crypto.createHash("sha1").update(JSON.stringify(incoming)).digest("hex");
    const stamp = { lastMt: mt || "", lastRunAt: now, lastFullAt: now, lastError: "" };
    if (!force && hash === cfg.lastHash) { await ref(co).set({ ...stamp, lastCheckedAt: now }, { merge: true }); return { skipped: "same" }; }

    const tabSet = new Set(incoming.map((o) => String(o.이전출처 || "").split("!")[0]));
    const existing = (await existingOrders(co, from)).filter((e) => tabSet.has(String(e.data.이전출처 || "").split("!")[0]));
    const r = M.reconcileOrders(existing, incoming);
    const batchId = `live_${kstYmd(now).replace(/-/g, "")}`;
    const ops = [];
    r.update.forEach((u) => ops.push((b) => b.set(db.collection("orders").doc(u.id), { ...u.patch, _lastModified: now, 최종수정자: by, 시트반영일시: FieldValue.serverTimestamp() }, { merge: true })));
    r.create.forEach((o) => { const d = db.collection("orders").doc(); ops.push((b) => b.set(d, { ...M.forOrderDoc(o, { company: co, batchId, me: by }), _id: d.id, _lastModified: now, createdAt: FieldValue.serverTimestamp(), 시트반영일시: FieldValue.serverTimestamp() })); });
    // 시트에서 지운 줄 — 한 번에 너무 많이 없어지면(탭을 잘못 읽었을 수 있다) 지우지 않고 알려만 준다
    let removed = 0; let heldBack = 0;
    if (cfg.removeMissing !== false && r.missing.length) {
      const limit = Math.max(10, Math.ceil(existing.length * 0.2));
      if (r.missing.length <= limit) { r.missing.forEach((e) => ops.push((b) => b.delete(db.collection("orders").doc(e.id)))); removed = r.missing.length; } else heldBack = r.missing.length;
    }
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
    // 시트에서 온 새 차량종류(톤수 섞인 이름 제외)는 회사 차량종류 목록에
    const kinds = [...new Set(incoming.map((o) => String(o.차량종류 || "").trim()).filter((k) => k && !/\d+(\.\d+)?\s*(톤|t\b)/i.test(k)))];
    if (kinds.length && r.create.length) await db.collection("vehicleTypes").doc(co).set({ companyName: co, custom: FieldValue.arrayUnion(...kinds) }, { merge: true }).catch(() => {});
    const result = { created: r.create.length, updated: r.update.length, removed, heldBack, same: r.same, total: incoming.length, from };
    await ref(co).set({ ...stamp, lastHash: heldBack ? "" : hash, lastResult: result, ...(ops.length ? { lastChangeAt: now } : {}) }, { merge: true });
    if (ops.length && bumpDataVersion) await bumpDataVersion(co);
    return result;
  }

  // 1분마다 — 켜 둔 회사 전부
  async function runAll() {
    const snap = await db.collection("sheetLive").where("enabled", "==", true).get();
    for (const d of snap.docs) {
      const cfg = d.data() || {}; const co = cfg.companyName || d.id;
      try {
        const r = await runOne(co, cfg);
        if (!r.skipped && (r.created || r.updated || r.removed || r.heldBack)) console.log(`[시트 실시간] ${co}`, JSON.stringify(r));
      } catch (e) {
        console.error(`[시트 실시간 실패] ${co}:`, e?.message || e);
        await d.ref.set({ lastRunAt: Date.now(), lastError: String(e?.message || e).slice(0, 300) }, { merge: true }).catch(() => {});
      }
    }
  }

  // 관리센터 요청(최고관리자) — liveGet · liveSet · liveRun
  async function handle(action, body, me) {
    const co = String(body.company || "").trim();
    if (!co) throw Object.assign(new Error("운송사를 골라 주세요."), { status: 400 });
    const pub = (x) => (x ? { enabled: !!x.enabled, url: x.url || "", tabs: x.tabs || [], days: x.days || 14, removeMissing: x.removeMissing !== false, lastRunAt: x.lastRunAt || 0, lastChangeAt: x.lastChangeAt || 0, lastResult: x.lastResult || null, lastError: x.lastError || "" } : null);
    if (action === "liveGet") return { live: pub((await ref(co).get()).data()) };
    if (action === "liveSet") {
      const patch = { companyName: co, updatedAt: Date.now(), updatedBy: me?.email || "" };
      if (body.url != null) { if (!parseSpreadsheetId(body.url)) throw Object.assign(new Error("구글시트 주소가 올바르지 않습니다."), { status: 400 }); patch.url = String(body.url).trim(); patch.lastMt = ""; patch.lastHash = ""; }
      if (Array.isArray(body.tabs)) { patch.tabs = body.tabs.map(String).slice(0, 60); patch.lastHash = ""; }
      if (body.enabled != null) patch.enabled = !!body.enabled;
      if (body.days != null) { patch.days = Math.max(1, Math.min(400, Number(body.days) || 14)); patch.lastHash = ""; }
      if (body.removeMissing != null) patch.removeMissing = !!body.removeMissing;
      await ref(co).set(patch, { merge: true });
      return { live: pub((await ref(co).get()).data()) };
    }
    if (action === "liveRun") {
      const cfg = (await ref(co).get()).data();
      if (!cfg?.url) throw Object.assign(new Error("먼저 실시간 반영할 시트를 저장해 주세요."), { status: 400 });
      const result = await runOne(co, cfg, { force: true });
      return { result, live: pub((await ref(co).get()).data()) };
    }
    return null;
  }

  return { runOne, runAll, handle };
}

module.exports = { makeSheetLive };
