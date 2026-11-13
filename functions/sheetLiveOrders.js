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
// ⚡ 2026-11-14 더 빨리 — 스케줄은 1분마다지만 그 1분 동안 약 8초마다 확인한다(runLoop). 시트가 바뀐 표시(수정 시각 · 버전)가 달라졌거나
//  프로그램에서 바뀐 오더가 대기 중이면 바로 처리한다. 표시가 늦게 바뀌는 경우에 대비해 2분에 한 번은 표시와 상관없이 직접 읽어 비교한다
const FULL_EVERY_MS = 2 * 60 * 1000; // 바뀐 표시가 없어도 2분에 한 번은 시트를 직접 읽어 비교
const NO_META_EVERY_MS = 60 * 1000; // 바뀐 표시를 못 읽으면 1분마다
const TICK_MS = 8000; // 확인 간격
const LOOP_MS = 50 * 1000; // 한 번 불렸을 때 확인을 이어 가는 시간(다음 스케줄 전에 끝낸다)

const RECENT_EDIT_MS = 30 * 1000; // 방금 프로그램에서 고친 오더는 한 차례 건너뛴다(그 변경이 시트로 먼저 간다 — functions/sheetPushOrders.js)

function makeSheetLive({ db, FieldValue, sheetsApiFor, parseSpreadsheetId, quoteTab, sheetModifiedTime, bumpDataVersion, push = null }) {
  const ref = (co) => db.collection("sheetLive").doc(co);
  // 📡 2026-11-13 직원 화면(배차현황 · 모바일)에 "구글시트 실시간 · n분 전 반영"을 보여 주기 위한 상태 — companySettings/{회사}.sheetLiveStatus
  //  (sheetLive 설정 문서는 서버만 읽는다) 바뀐 것이 있을 때와 10분마다 한 번만 적는다(매분 적으면 모든 화면이 매분 다시 읽는다)
  const statusAt = new Map();
  async function writeStatus(co, patch, { force = false } = {}) {
    const now = Date.now();
    if (!force && now - (statusAt.get(co) || 0) < 10 * 60 * 1000) return;
    statusAt.set(co, now);
    await db.collection("companySettings").doc(co).set({ sheetLiveStatus: { checkedAt: now, ...patch } }, { merge: true }).catch(() => {});
  }

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
    const base = saved ? { ...saved, ...sug, extraNames: { ...(sug.extraNames || {}), ...(saved.extraNames || {}) }, placeOverrides: { ...(sug.placeOverrides || {}), ...(saved.placeOverrides || {}) }, tabClients: saved.tabClients || {}, skipTabs: [...new Set([...(saved.skipTabs || []), ...(sug.skipTabs || [])])].filter((t) => !(sug.includeTabs || []).includes(t)),
      dispatchAliases: { ...(saved.dispatchAliases || {}), ...(sug.dispatchAliases || {}) }, vehicleGrades: { ...(saved.vehicleGrades || {}), ...(sug.vehicleGrades || {}) } } : sug;
    return { ...M.DEFAULT_PRESET, ...base, dispatchAliases: { ...M.DEFAULT_PRESET.dispatchAliases, ...(base.dispatchAliases || {}) }, vehicleGrades: { ...M.DEFAULT_PRESET.vehicleGrades, ...(base.vehicleGrades || {}) } };
  }

  async function existingOrders(co, from) {
    const base = db.collection("orders").where("companyName", "==", co).where("등록기기", "==", "구글시트 이전");
    let snap;
    try { snap = await base.where("상차일", ">=", from).get(); } // 색인(companyName · 등록기기 · 상차일)이 있으면 범위만 읽는다
    catch { snap = await base.get(); }
    const out = new Map(snap.docs.map((d) => [d.id, { id: d.id, data: d.data() || {} }]));
    // 🔁 2026-11-14 프로그램에서 등록해 시트에 줄을 만든 오더(시트연동)도 같은 줄로 맞춘다 — 빼면 그 줄이 새 오더로 한 번 더 만들어진다
    const linked = await db.collection("orders").where("companyName", "==", co).where("시트연동", "==", true).get().catch(() => null);
    (linked?.docs || []).forEach((d) => { if (!out.has(d.id)) out.set(d.id, { id: d.id, data: d.data() || {} }); });
    return [...out.values()].filter((e) => String(e.data.상차일 || "") >= from);
  }
  const placesFor = async (co) => (await db.collection("places").where("companyName", "==", co).get()).docs.map((d) => { const x = d.data() || {}; const c = (Array.isArray(x.contacts) && (x.contacts.find((k) => k.isPrimary) || x.contacts[0])) || {}; return { name: x.업체명 || "", address: x.주소 || "", phone: c.phone || x.담당자번호 || "", person: c.name || x.담당자 || "" }; }).filter((p) => p.name);
  const pushOn = (cfg) => !!push && cfg.enabled === true && cfg.pushMode === "on";

  // 한 회사 반영 — force: 수정 시각 · 내용이 같아도 비교한다
  //  sheetWritten: 방금 프로그램 변경을 시트에 썼다 → 시트 수정 시각이 같아 보여도 다시 읽는다
  async function runOne(co, cfg, { force = false, by = "구글시트 실시간", sheetWritten = false } = {}) {
    const id = parseSpreadsheetId(cfg.url);
    if (!id) throw new Error("구글시트 주소가 올바르지 않습니다.");
    const now = Date.now();
    const mt = await sheetModifiedTime(id);
    if (!force && !sheetWritten) {
      if (mt && mt === String(cfg.lastMt || "") && now - Number(cfg.lastFullAt || 0) < FULL_EVERY_MS) return { skipped: "unchanged" };
      if (!mt && now - Number(cfg.lastRunAt || 0) < NO_META_EVERY_MS) return { skipped: "wait" };
    }
    const M = await import("./carrierMigrateCore.mjs");
    const P = await import("./sheetProfileCore.mjs");
    const raw = await readTabs(id, null); // 주소 찾기에 상하차지 · 기사 탭도 필요해서 전부 읽고, 오더만 고른 탭으로 거른다
    if (!raw.length) throw new Error("읽을 탭이 없습니다.");
    const tabs = raw.map((t) => ({ title: t.title, rows: P.applyMerges(t.rows, t.merges) }));
    const preset = await presetFor(co, M);
    const places = await placesFor(co);
    const built = M.buildMigration(tabs, { ...preset, extraPlaces: places });
    const days = Math.max(1, Math.min(400, Number(cfg.days) || 14));
    const from = kstYmd(now - days * 86400000);
    const wantTabs = Array.isArray(cfg.tabs) && cfg.tabs.length ? new Set(cfg.tabs.map(String)) : null;
    const incoming = built.orders.filter((o) => String(o.상차일 || "") >= from && (!wantTabs || wantTabs.has(String(o.이전출처 || "").split("!")[0])));
    const hash = crypto.createHash("sha1").update(JSON.stringify(incoming)).digest("hex");
    const stamp = { lastMt: mt || "", lastRunAt: now, lastFullAt: now, lastError: "" };
    if (!force && hash === cfg.lastHash) { await ref(co).set({ ...stamp, lastCheckedAt: now }, { merge: true }); await writeStatus(co, { enabled: true, error: "" }); return { skipped: "same" }; }

    const tabSet = new Set(incoming.map((o) => String(o.이전출처 || "").split("!")[0]));
    const existing = (await existingOrders(co, from)).filter((e) => tabSet.has(String(e.data.이전출처 || "").split("!")[0]));
    const r = M.reconcileOrders(existing, incoming);
    let again = false; // 이번에 미룬 것이 있으면 다음 차례에 다시 비교한다(내용이 같아도)
    if (pushOn(cfg)) {
      // 프로그램에서 지웠는데 시트 줄이 아직 남은 오더(대기 · 보류 · 실패)는 다시 만들지 않는다
      const gone = await push.pendingDeletes(co).catch(() => []);
      if (gone.length) { const C = await import("./sheetPushCore.mjs"); const n0 = r.create.length; r.create = r.create.filter((o) => !gone.some((b) => C.matchesDeleted(b, o))); if (r.create.length !== n0) again = true; }
      // 방금 프로그램에서 고친 오더는 이번엔 건드리지 않는다(그 변경이 아직 시트로 가는 중일 수 있다)
      const n1 = r.update.length; const byId = new Map(existing.map((e) => [e.id, e.data]));
      r.update = r.update.filter((u) => { const d = byId.get(u.id) || {}; return !(now - Number(d._lastModified || 0) < RECENT_EDIT_MS && d.최종수정자 !== by); });
      if (r.update.length !== n1) again = true;
    }
    const batchId = `live_${kstYmd(now).replace(/-/g, "")}`;
    const ops = [];
    r.update.forEach((u) => ops.push((b) => b.set(db.collection("orders").doc(u.id), { ...u.patch, _lastModified: now, 최종수정자: by, 시트반영일시: FieldValue.serverTimestamp() }, { merge: true })));
    r.create.forEach((o) => { const d = db.collection("orders").doc(); ops.push((b) => b.set(d, { ...M.forOrderDoc(o, { company: co, batchId, me: by }), _id: d.id, _lastModified: now, 최종수정자: by, createdAt: FieldValue.serverTimestamp(), 시트반영일시: FieldValue.serverTimestamp() })); }); // 최종수정자 = 서버 — 방금 시트에서 만든 오더를 "프로그램에서 방금 고친 오더"로 잘못 보고 미루지 않게
    // 시트에서 지운 줄 — 한 번에 너무 많이 없어지면(탭을 잘못 읽었을 수 있다) 지우지 않고 알려만 준다
    let removed = 0; let heldBack = 0;
    if (cfg.removeMissing !== false && r.missing.length) {
      const limit = Math.max(10, Math.ceil(existing.length * 0.2));
      // 삭제 기록(deletedOrders)을 같이 남긴다 — 열려 있는 PC · 모바일 화면과 PC 보관본에서 그 오더가 바로 빠진다
      if (r.missing.length <= limit) { r.missing.forEach((e) => { ops.push((b) => b.delete(db.collection("orders").doc(e.id))); ops.push((b) => b.set(db.collection("deletedOrders").doc(`orders_${e.id}`), { col: "orders", id: e.id, at: FieldValue.serverTimestamp(), by: by, companyName: co })); }); removed = r.missing.length; } else heldBack = r.missing.length;
    }
    // ⏸ 쓰기 직전에 다시 확인 — 그사이 관리센터에서 껐으면(수동 가져오기 중) 아무것도 쓰지 않는다(같은 줄을 양쪽이 동시에 만들던 중복 방지)
    if (!force && ops.length) { const cur = (await ref(co).get()).data() || {}; if (cur.enabled !== true) return { skipped: "paused" }; }
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
    // 시트에서 온 새 차량종류(톤수 섞인 이름 제외)는 회사 차량종류 목록에
    const kinds = [...new Set(incoming.map((o) => String(o.차량종류 || "").trim()).filter((k) => k && !/\d+(\.\d+)?\s*(톤|t\b)/i.test(k)))];
    if (kinds.length && r.create.length) await db.collection("vehicleTypes").doc(co).set({ companyName: co, custom: FieldValue.arrayUnion(...kinds) }, { merge: true }).catch(() => {});
    const result = { created: r.create.length, updated: r.update.length, removed, heldBack, same: r.same, total: incoming.length, from };
    await ref(co).set({ ...stamp, ...(again ? { lastMt: "" } : {}), lastHash: heldBack || again ? "" : hash, lastResult: result, ...(ops.length ? { lastChangeAt: now } : {}) }, { merge: true });
    await writeStatus(co, { enabled: true, error: "", ...(ops.length ? { changedAt: now, created: result.created, updated: result.updated, removed: result.removed } : {}), heldBack }, { force: ops.length > 0 || force });
    // ⚠ 2026-11-13 여기서 dataVersion 을 올리지 않는다 — 올리면 열려 있는 모든 PC가 13개월 오더 전체를 다시 받는다(1분마다 반복될 수 있었다)
    //   바뀐 오더는 _lastModified · createdAt, 지운 오더는 deletedOrders 기록으로 화면에 반영된다
    return result;
  }

  // 1분마다 — 켜 둔 회사 전부
  async function runAll({ housekeeping = true } = {}) {
    const snap = await db.collection("sheetLive").where("enabled", "==", true).get();
    if (push && housekeeping) { await push.purgeInactive(new Set(snap.docs.filter((d) => ["dry", "on"].includes((d.data() || {}).pushMode)).map((d) => (d.data() || {}).companyName || d.id))).catch(() => {}); await push.sweep().catch(() => {}); }
    for (const d of snap.docs) {
      const cfg = d.data() || {}; const co = cfg.companyName || d.id;
      try {
        // 🔁 프로그램에서 바뀐 오더를 먼저 시트에 쓴다(켜 둔 회사만) → 그다음 시트를 읽어 맞춘다
        const pr = push && cfg.pushMode && cfg.pushMode !== "off" ? await push.process(co, cfg, { presetFor, placesFor }).catch((e) => { console.error(`[시트 쓰기 실패] ${co}:`, e?.message || e); return {}; }) : {};
        const r = await runOne(co, cfg, { sheetWritten: !!pr.wrote });
        if (r.skipped) await writeStatus(co, { enabled: true, error: "" });
        if (!r.skipped && (r.created || r.updated || r.removed || r.heldBack)) console.log(`[시트 실시간] ${co}`, JSON.stringify(r));
      } catch (e) {
        console.error(`[시트 실시간 실패] ${co}:`, e?.message || e);
        await d.ref.set({ lastRunAt: Date.now(), lastError: String(e?.message || e).slice(0, 300) }, { merge: true }).catch(() => {});
        await writeStatus(co, { enabled: true, error: "시트를 읽지 못했습니다" }, { force: true });
      }
    }
  }

  // ⚡ 스케줄(1분)마다 한 번 불려서, 그 1분 동안 TICK_MS 간격으로 확인을 되풀이한다 — 바뀐 것이 없으면 수정 표시만 보고 지나간다(가볍다)
  async function runLoop({ loopMs = LOOP_MS, tickMs = TICK_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    const t0 = Date.now(); let n = 0;
    for (;;) {
      const started = Date.now();
      await runAll({ housekeeping: n === 0 }).catch((e) => console.error("[시트 실시간 실패]", e?.message || e));
      n += 1;
      const wait = Math.max(0, tickMs - (Date.now() - started));
      if (Date.now() - t0 + wait >= loopMs) break;
      await sleep(wait);
    }
    return n;
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
      if (body.enabled != null) await writeStatus(co, { enabled: !!body.enabled, error: "" }, { force: true });
      return { live: pub((await ref(co).get()).data()) };
    }
    if (action === "liveRun") {
      const cfg = (await ref(co).get()).data();
      if (!cfg?.url) throw Object.assign(new Error("먼저 실시간 반영할 시트를 저장해 주세요."), { status: 400 });
      if (push && cfg.enabled === true && cfg.pushMode && cfg.pushMode !== "off") await push.process(co, cfg, { presetFor, placesFor }).catch(() => {});
      const result = await runOne(co, cfg, { force: true });
      return { result, live: pub((await ref(co).get()).data()) };
    }
    return null;
  }

  return { runOne, runAll, runLoop, handle };
}

module.exports = { makeSheetLive };
