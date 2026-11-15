// ======================= functions/sheetLiveOrders.js =======================
// 🔁 2026-11-13 구글시트 실시간 반영 — 시트에서만 입력 · 수정하는 운송사(지금은 JY로지스틱스)
//  · 설정: sheetLive/{회사} = { companyName, url, tabs[], enabled, days, removeMissing, lastMt, lastHash, lastRunAt, lastResult, lastError }
//    (관리센터 › 배차일지 가져오기 › [실시간 반영]에서 켠다 — 서버만 읽고 쓴다)
//  · 바뀌었을 때만(아래 "이벤트 방식" — 시트 알림 · 프로그램 변경) + 1분마다 안전장치(syncSheetOrders): → carrierMigrateCore.buildMigration → reconcileOrders
//    → orders 에 새 줄은 만들고, 바뀐 줄은 바뀐 칸만 고치고, 시트에서 지운 줄은 지운다(removeMissing)
//  · orders 문서가 바뀌므로 배차현황 · 실시간 · 정산 등 오더를 보는 모든 화면에 바로 반영된다(화면은 onSnapshot)
//  · 반영 범위: 상차일이 오늘 − days 이후인 줄(지난 달 정산 끝난 오더는 건드리지 않는다)
const crypto = require("crypto");

const kstYmd = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
// ⚡ 2026-11-14 바뀔 때만 바로 반영(이벤트 방식) — 계속 들여다보지 않는다
//  · 프로그램에서 오더가 바뀌면: orders 트리거 → sheetPushQueue 에 적힘 → 그 대기열 트리거가 바로 kick(회사) → 시트에 쓴다
//  · 시트에서 사람이 고치면: 시트에 붙인 Apps Script(onChange)가 sheetLivePing 을 부른다 → 바로 kick(회사) → 시트를 읽어 맞춘다
//    (스크립트는 관리센터 › 배차일지 가져오기 › 실시간 반영 › [시트 알림 설치]에서 복사 — pingScript)
//  · 한 회사에 한 번에 하나만 돈다(sheetLiveLock) — 도는 중에 또 바뀌면 "다시" 표시만 남기고, 하던 쪽이 끝나자마자 한 번 더 돈다
//  · 1분마다 도는 스케줄은 안전장치 — 시트 알림이 설치된 회사는 Drive 수정 시각만 보고(시트 읽기 한도를 안 쓴다) 15분에 한 번 전체 비교,
//    설치 전 회사는 최근 줄을 1분마다 직접 읽어 비교(PEEK) · 2분에 한 번 전체 비교
const FULL_EVERY_MS = 2 * 60 * 1000; // 시트 알림 설치 전: 바뀐 표시가 없어도 2분에 한 번은 전체 비교
const SAFETY_FULL_MS = 15 * 60 * 1000; // 시트 알림 설치 후: 15분에 한 번 전체 비교(놓친 알림 대비)
const PING_FRESH_MS = 3 * 86400000; // 최근 3일 안에 시트 알림이 온 적 있으면 "설치됨"으로 본다
const PEEK_DAYS = 3; // 직접 읽어 보는 범위: 상차일이 오늘 − 3일 이후인 줄부터 맨 아래까지
const LOCK_MS = 4 * 60 * 1000; // 하던 쪽이 죽어도 4분 뒤엔 다른 쪽이 이어받는다
const RAW_CACHE_MS = 10 * 60 * 1000; // 탭만 다시 읽을 때 나머지 탭은 기억해 둔 값을 쓴다(10분 지나면 전체를 다시 읽는다)
const MAX_ROUNDS = 8; // 한 번 잡았을 때 "다시"를 이어 도는 최대 횟수(넘으면 다음 알림 · 스케줄이 이어 간다)

const RECENT_EDIT_MS = 10 * 1000; // 방금 프로그램에서 고친 오더는 잠깐 건너뛴다(그 변경이 시트로 먼저 간다 — functions/sheetPushOrders.js)
//  시트로 가길 기다리는 오더(sheetPushQueue 대기)도 건너뛴다 — 예전엔 30초를 통째로 기다려서 시트에서 바로 고쳐도 늦게 들어왔다

function makeSheetLive({ db, FieldValue, sheetsApiFor, parseSpreadsheetId, quoteTab, sheetModifiedTime, bumpDataVersion, push = null }) {
  const ref = (co) => db.collection("sheetLive").doc(co);
  // 📡 2026-11-13 직원 화면(배차현황 · 모바일)에 "구글시트 실시간 · n분 전 반영"을 보여 주기 위한 상태 — companySettings/{회사}.sheetLiveStatus
  //  (sheetLive 설정 문서는 서버만 읽는다) 바뀐 것이 있을 때와 10분마다 한 번만 적는다(매분 적으면 모든 화면이 매분 다시 읽는다)
  const statusAt = new Map();
  const pushModeOf = new Map(); // 🛠 2026-11-14 화면에 "프로그램 → 시트 쓰기" 상태(off · dry · on)도 보여 준다 — 꺼져 있어 시트에 안 써지는데 알 수 없었다
  async function writeStatus(co, patch, { force = false } = {}) {
    const now = Date.now();
    if (pushModeOf.has(co)) patch = { pushMode: pushModeOf.get(co), ...patch };
    if (!force && now - (statusAt.get(co) || 0) < 60 * 1000) return; // 🛠 2026-11-14 10분 → 1분(화면의 "마지막 확인"이 실제와 맞게)
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

  // 👀 최근 줄만 빨리 읽어 지문(해시)을 만든다 — ranges: [{ tab, row }] → 그 탭의 row 줄부터 맨 아래까지
  const peekOf = new Map(); // 회사 → { url, ranges, fp }
  const rawOf = new Map(); // 회사 → { url, at, tabs } 마지막으로 읽은 시트(탭만 다시 읽을 때 나머지 탭)
  async function peek(id, ranges) {
    if (!ranges.length) return "";
    const got = await sheetsApiFor(id, "GET", `/values:batchGet?${ranges.map((r) => `ranges=${encodeURIComponent(`${quoteTab(r.tab)}!A${r.row}:ZZ`)}`).join("&")}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
    return crypto.createHash("sha1").update(JSON.stringify((got.valueRanges || []).map((v) => v.values || []))).digest("hex");
  }
  // 전체를 읽은 뒤 — 탭마다 "최근 줄 첫 줄"(없으면 마지막 오더 줄)을 정해 둔다(그 아래로 새 줄이 붙는다)
  function peekRanges(orders, wantTabs, now) {
    const cut = kstYmd(now - PEEK_DAYS * 86400000);
    const by = new Map();
    orders.forEach((o) => {
      const tab = String(o.__tab || String(o.이전출처 || "").split("!")[0]); const row = Number(o.__row || String(o.이전출처 || "").split("!")[1]) || 0;
      if (!tab || !row || (wantTabs && !wantTabs.has(tab))) return;
      const x = by.get(tab) || { recent: 0, last: 0 };
      if (String(o.상차일 || "") >= cut && (!x.recent || row < x.recent)) x.recent = row;
      if (row > x.last) x.last = row;
      by.set(tab, x);
    });
    return [...by.entries()].map(([tab, x]) => ({ tab, row: x.recent || x.last })).sort((a, b) => (a.tab < b.tab ? -1 : a.tab > b.tab ? 1 : 0));
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
  //  fullEvery: 이 시간이 지나면 바뀐 표시가 없어도 전체 비교 · usePeek: 최근 줄을 직접 읽어 비교할지(시트 알림 설치 전)
  //  onlyTabs: 시트 알림이 알려 준 "고친 탭" — 그 탭만 새로 읽고(나머지 탭은 기억해 둔 값) 그 탭의 오더만 맞춘다(읽기 한도를 가장 덜 쓴다)
  async function runOne(co, cfg, { force = false, by = "구글시트 실시간", sheetWritten = false, fullEvery = FULL_EVERY_MS, usePeek = true, onlyTabs = null } = {}) {
    const id = parseSpreadsheetId(cfg.url);
    if (!id) throw new Error("구글시트 주소가 올바르지 않습니다.");
    const now = Date.now();
    const mt = await sheetModifiedTime(id);
    const pk = peekOf.get(co); const pkOk = !!pk && pk.url === cfg.url;
    let fp; // 이번에 읽은 최근 줄 지문(전체를 읽기 "전에" 잡는다 — 읽는 사이 고친 것은 다음 확인 때 다시 걸린다)
    if (!force && !sheetWritten && now - Number(cfg.lastFullAt || 0) < fullEvery) {
      let changed = !!mt && mt !== String(cfg.lastMt || "");
      if (!changed && usePeek) {
        if (!pkOk) changed = true; // 서버가 막 켜져 기준이 없다 → 한 번 전체를 읽는다
        else {
          fp = await peek(id, pk.ranges).catch((e) => { console.warn(`[시트 실시간] ${co} 빠른 확인 실패:`, e?.message || e); return undefined; });
          changed = fp !== undefined && fp !== pk.fp;
        }
      }
      if (!changed) return { skipped: "unchanged" };
    } else if (pkOk && !force && usePeek) fp = await peek(id, pk.ranges).catch(() => undefined);
    const M = await import("./carrierMigrateCore.mjs");
    const P = await import("./sheetProfileCore.mjs");
    // 주소 찾기에 상하차지 · 기사 탭도 필요해서 전부 쓴다 — 고친 탭만 알면 그 탭만 새로 읽고 나머지는 기억해 둔 값(10분 안)
    const cache = rawOf.get(co);
    const only = !force && Array.isArray(onlyTabs) && onlyTabs.length && cache && cache.url === cfg.url && now - cache.at < RAW_CACHE_MS && onlyTabs.every((t) => cache.tabs.some((x) => x.title === t)) ? onlyTabs : null;
    let raw;
    if (only) { const fresh = await readTabs(id, only); raw = cache.tabs.map((t) => fresh.find((f) => f.title === t.title) || t); }
    else raw = await readTabs(id, null);
    rawOf.set(co, { url: cfg.url, at: only ? cache.at : now, tabs: raw });
    if (!raw.length) throw new Error("읽을 탭이 없습니다.");
    const tabs = raw.map((t) => ({ title: t.title, rows: P.applyMerges(t.rows, t.merges) }));
    const preset = await presetFor(co, M);
    const places = await placesFor(co);
    const built = M.buildMigration(tabs, { ...preset, extraPlaces: places });
    const days = Math.max(1, Math.min(400, Number(cfg.days) || 14));
    // 🛠 2026-11-14 비교 범위 — 예전엔 "최근 n일(기본 14일)"만 봐서, 그보다 앞선 줄(예: JY 10월분)의 금액 · 기사를 시트에서 고쳐도 프로그램에 안 들어왔다.
    //  가져오기 시작일(preset.fromDate · JY 2026-10-01)이 있으면 그날부터 전부 비교한다(관리센터에서 고른 범위가 더 길면 그쪽)
    const daysFrom = kstYmd(now - days * 86400000);
    const from = preset.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(preset.fromDate) && preset.fromDate < daysFrom ? preset.fromDate : daysFrom;
    const wantTabs = Array.isArray(cfg.tabs) && cfg.tabs.length ? new Set(cfg.tabs.map(String)) : null;
    // 고친 탭이 오더 탭이면 그 탭만 맞춘다. 상하차지 · 기사 같은 참고 탭이면 모든 오더에 영향 → 전부 맞춘다(읽기는 그 탭만)
    const orderTabs = new Set(built.orders.map((o) => String(o.이전출처 || "").split("!")[0]));
    const scope = only && only.every((t) => orderTabs.has(t) && (!wantTabs || wantTabs.has(t))) ? new Set(only) : null;
    const incoming = built.orders.filter((o) => String(o.상차일 || "") >= from && (!wantTabs || wantTabs.has(String(o.이전출처 || "").split("!")[0])) && (!scope || scope.has(String(o.이전출처 || "").split("!")[0])));
    // 다음 빠른 확인의 기준 — 범위가 그대로면 위에서 잡은 지문을, 바뀌었으면(날이 바뀜 · 줄이 늘어남) 새 범위로 한 번 읽어 둔다
    const ranges = peekRanges(built.orders, wantTabs, now);
    const sameRanges = pkOk && JSON.stringify(pk.ranges) === JSON.stringify(ranges);
    const baseFp = !usePeek ? undefined : sameRanges && fp !== undefined ? fp : await peek(id, ranges).catch(() => undefined);
    if (baseFp === undefined) peekOf.delete(co); else peekOf.set(co, { url: cfg.url, ranges, fp: baseFp });
    const hash = crypto.createHash("sha1").update(JSON.stringify(incoming)).digest("hex");
    const stamp = { lastMt: mt || "", lastRunAt: now, ...(only ? {} : { lastFullAt: now }), lastError: "" };
    if (!force && !scope && hash === cfg.lastHash) { await ref(co).set({ ...stamp, lastCheckedAt: now }, { merge: true }); await writeStatus(co, { enabled: true, error: "" }); return { skipped: "same" }; }

    const tabSet = scope || new Set(incoming.map((o) => String(o.이전출처 || "").split("!")[0])); // 탭만 맞출 때는 그 탭(줄을 다 지워도 지운 오더를 찾는다)
    const existing = (await existingOrders(co, from)).filter((e) => tabSet.has(String(e.data.이전출처 || "").split("!")[0]));
    const r = M.reconcileOrders(existing, incoming);
    let again = false; // 이번에 미룬 것이 있으면 다음 차례에 다시 비교한다(내용이 같아도)
    if (pushOn(cfg)) {
      // 프로그램에서 지웠는데 시트 줄이 아직 남은 오더(대기 · 보류 · 실패)는 다시 만들지 않는다
      const gone = await push.pendingDeletes(co).catch(() => []);
      if (gone.length) { const C = await import("./sheetPushCore.mjs"); const n0 = r.create.length; r.create = r.create.filter((o) => !gone.some((b) => C.matchesDeleted(b, o))); if (r.create.length !== n0) again = true; }
      // 방금 프로그램에서 고친 오더는 이번엔 건드리지 않는다(그 변경이 아직 시트로 가는 중일 수 있다)
      const n1 = r.update.length; const byId = new Map(existing.map((e) => [e.id, e.data]));
      const waiting = push.pendingIds ? await push.pendingIds(co).catch(() => new Set()) : new Set();
      r.update = r.update.filter((u) => { const d = byId.get(u.id) || {}; return !waiting.has(u.id) && !(now - Number(d._lastModified || 0) < RECENT_EDIT_MS && d.최종수정자 !== by); });
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
    const result = { created: r.create.length, updated: r.update.length, removed, heldBack, same: r.same, total: incoming.length, from, at: now };
    if (again) peekOf.delete(co); // 미룬 것이 있으면 다음 확인 때 바로 다시 전체를 읽는다
    await ref(co).set({ ...stamp, ...(again ? { lastMt: "" } : {}), lastHash: heldBack || again || scope ? "" : hash, lastResult: result, ...(ops.length ? { lastChangeAt: now } : {}) }, { merge: true });
    await writeStatus(co, { enabled: true, error: "", ...(ops.length ? { changedAt: now, created: result.created, updated: result.updated, removed: result.removed } : {}), heldBack }, { force: ops.length > 0 || force });
    // ⚠ 2026-11-13 여기서 dataVersion 을 올리지 않는다 — 올리면 열려 있는 모든 PC가 13개월 오더 전체를 다시 받는다(1분마다 반복될 수 있었다)
    //   바뀐 오더는 _lastModified · createdAt, 지운 오더는 deletedOrders 기록으로 화면에 반영된다
    return result;
  }

  // ── 한 회사 처리(잠금 안에서) — 프로그램 변경을 시트에 먼저 쓰고 → 필요하면 시트를 읽어 맞춘다 ─────────────
  //  reason: "sheet"(시트 알림 — 바로 읽는다) · "program"(프로그램 변경 — 시트에 쓰기만) · "safety"(스케줄 안전장치)
  async function work(co, cfg, reason, scope = {}) {
    pushModeOf.set(co, ["dry", "on"].includes(cfg.pushMode) ? cfg.pushMode : "off");
    const pr = push && cfg.pushMode && cfg.pushMode !== "off" ? await push.process(co, cfg, { presetFor, placesFor }).catch((e) => { console.error(`[시트 쓰기 실패] ${co}:`, e?.message || e); return {}; }) : {};
    // 줄을 끼우거나 지웠으면(아래 줄 번호가 밀림) 바로 시트 전체를 다시 읽어 오더의 줄 위치를 맞춘다
    if (reason === "program" && !pr.structural) { await writeStatus(co, { enabled: true, error: "" }); return { pushed: !!pr.wrote, more: !!pr.more }; }
    if (pr.structural) { const r0 = await runOne(co, cfg, { sheetWritten: true, usePeek: false }); return { ...r0, more: !!pr.more }; }
    const pinged = now0() - Number(cfg.pingAt || 0) < PING_FRESH_MS;
    const r = await runOne(co, cfg, reason === "sheet" ? { sheetWritten: true, usePeek: !pinged, onlyTabs: scope.full || !scope.tabs?.length ? null : scope.tabs } : pinged ? { fullEvery: SAFETY_FULL_MS, usePeek: false, sheetWritten: !!pr.wrote } : { sheetWritten: !!pr.wrote });
    if (r.skipped) await writeStatus(co, { enabled: true, error: "" });
    if (!r.skipped && (r.created || r.updated || r.removed || r.heldBack)) console.log(`[시트 실시간] ${co} (${reason})`, JSON.stringify(r));
    return { ...r, more: !!pr.more };
  }
  const now0 = () => Date.now();
  const lockRef = (co) => db.collection("sheetLiveLock").doc(co);

  // 🔔 바뀐 게 있을 때 부른다 — 아무도 안 돌고 있으면 잡아서 바로 돌고, 누가 돌고 있으면 "다시" 표시만(하던 쪽이 끝나고 한 번 더 돈다)
  //  → "ran" · "queued"(다른 쪽이 이어서 함) · "off"(실시간 반영 꺼짐)
  //  scope: 시트 알림이 알려 준 범위 { tabs: [고친 탭], full: 줄 추가 · 삭제 · 정렬 등(전체를 읽는다) } — 없으면 전체
  const NEED = { safety: 0, program: 1, sheet: 2 };
  const LEVEL = ["safety", "program", "sheet"];
  // 기다리는 일 합치기 — 시트 범위는 탭을 모으고, 하나라도 전체면 전체
  const mergeScope = (x, reason, scope) => {
    const need = Math.max(Number(x.need || 0), NEED[reason] ?? 0);
    const full = !!x.full || (reason === "sheet" && (!!scope?.full || !scope?.tabs?.length));
    const tabs = full ? [] : [...new Set([...(Array.isArray(x.tabs) ? x.tabs : []), ...(reason === "sheet" ? scope?.tabs || [] : [])])].slice(0, 30);
    return { need, full, tabs };
  };
  async function kick(co, reason = "sheet", scope = null) {
    const me = `${reason}_${Math.random().toString(36).slice(2, 10)}`;
    const got = await db.runTransaction(async (tx) => {
      const x = (await tx.get(lockRef(co))).data() || {};
      const m = mergeScope(x, reason, scope);
      if (Number(x.until || 0) > Date.now()) { tx.set(lockRef(co), { dirtyAt: Date.now(), ...m }, { merge: true }); return null; }
      tx.set(lockRef(co), { until: Date.now() + LOCK_MS, by: me, dirtyAt: 0, need: 0, full: false, tabs: [] }, { merge: true });
      return Number(x.dirtyAt || 0) > 0 ? m : { need: NEED[reason] ?? 0, full: m.full, tabs: reason === "sheet" ? scope?.tabs || [] : [] }; // 지난번에 못 끝낸 일이 남아 있으면 같이 한다
    });
    if (!got) return "queued";
    let job = got; let held = true;
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const startedAt = Date.now();
        const cfg = (await ref(co).get()).data() || {};
        if (cfg.enabled !== true) return "off";
        let res = null;
        try { res = await work(co, cfg, LEVEL[job.need] || "safety", { tabs: job.tabs, full: job.full }); }
        catch (e) {
          console.error(`[시트 실시간 실패] ${co}:`, e?.message || e);
          await ref(co).set({ lastRunAt: Date.now(), lastError: String(e?.message || e).slice(0, 300) }, { merge: true }).catch(() => {});
          await writeStatus(co, { enabled: true, error: "시트를 읽지 못했습니다" }, { force: true });
        }
        if (res?.more && round + 1 < MAX_ROUNDS) { job = { need: 1, full: false, tabs: [] }; await lockRef(co).set({ until: Date.now() + LOCK_MS }, { merge: true }); continue; } // 시트에 쓸 대기 건이 더 남았다
        // 도는 사이 또 바뀌었나? — 바뀌었으면 잠금을 쥔 채 한 번 더, 아니면 놓는다(확인과 놓기를 한 번에 해서 그 틈에 온 알림을 놓치지 않는다)
        //  횟수를 다 썼으면 기다리는 일은 남겨 둔 채 놓는다 → 다음 알림 · 스케줄(1분)이 이어서 한다
        const again = await db.runTransaction(async (tx) => {
          const x = (await tx.get(lockRef(co))).data() || {};
          if (x.by !== me) return null; // 너무 오래 걸려 다른 쪽이 이어받았다
          const dirty = Number(x.dirtyAt || 0) >= startedAt - 2000;
          if (dirty && round + 1 < MAX_ROUNDS) { tx.set(lockRef(co), { until: Date.now() + LOCK_MS, dirtyAt: 0, need: 0, full: false, tabs: [] }, { merge: true }); return { need: Number(x.need || 0), full: !!x.full, tabs: Array.isArray(x.tabs) ? x.tabs : [] }; }
          tx.set(lockRef(co), { until: 0, by: "" }, { merge: true });
          return null;
        });
        if (!again) { held = false; break; }
        job = again;
      }
    } finally {
      if (held) await lockRef(co).set({ until: 0, by: "" }, { merge: true }).catch(() => {});
    }
    return "ran";
  }

  // ⏱ 1분마다 — 안전장치(놓친 알림 · 알림 설치 전 회사) + 대기열 정리
  async function runScheduled() {
    const snap = await db.collection("sheetLive").where("enabled", "==", true).get();
    if (push) { await push.purgeInactive(new Set(snap.docs.filter((d) => ["dry", "on"].includes((d.data() || {}).pushMode)).map((d) => (d.data() || {}).companyName || d.id))).catch(() => {}); await push.sweep().catch(() => {}); }
    for (const d of snap.docs) {
      const co = (d.data() || {}).companyName || d.id;
      await kick(co, "safety").catch((e) => console.error(`[시트 실시간 실패] ${co}:`, e?.message || e));
    }
  }

  // 📨 시트 알림(Apps Script) — 열쇠로 회사를 찾아 바로 맞춘다
  async function onPing(key, body = {}) {
    const k = String(key || "").trim();
    if (!/^[0-9a-f]{32}$/.test(k)) return { status: 400, body: { error: "bad key" } };
    const snap = await db.collection("sheetLive").where("pingKey", "==", k).limit(1).get();
    if (snap.empty) return { status: 404, body: { error: "unknown key" } };
    const d = snap.docs[0]; const cfg = d.data() || {}; const co = cfg.companyName || d.id;
    await d.ref.set({ pingAt: Date.now() }, { merge: true });
    if (cfg.enabled !== true) return { status: 200, body: { ok: true, off: true } };
    const tab = String(body?.tab || "").trim().slice(0, 100);
    return { status: 200, body: { ok: true, result: await kick(co, "sheet", { tabs: tab && !body?.full ? [tab] : [], full: !!body?.full || !tab }) } };
  }

  // 시트에 붙일 Apps Script — 시트가 바뀌면(값 입력 · 줄 추가 · 줄 삭제 · 붙여넣기) 서버에 "바뀜"만 알린다(내용은 안 보낸다)
  const pingUrl = () => `https://us-central1-${process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "dispatch-app-9b92f"}.cloudfunctions.net/sheetLivePing`;
  //  값 입력 · 붙여넣기 · 지우기(onEdit) → 고친 탭 이름만 보낸다(서버는 그 탭만 읽는다)
  //  줄 추가 · 줄 삭제 · 정렬 · 탭 추가 등(onChange) → "전체"(줄 번호가 밀리니 전부 읽어 맞춘다)
  //  🛠 2026-11-15 시트에 붙은 스크립트가 아니어도(따로 만든 프로젝트 · 다른 코드가 이미 있는 프로젝트) 되게 — 시트 ID로 트리거를 건다
  const scriptFor = (key, sheetId = "") => [
    "// LogisWeb 실시간 연동 — 이 시트가 바뀌면 LogisWeb 에 바로 알립니다(시트 내용은 보내지 않고, 고친 탭 이름만 보냅니다)",
    "// 처음 한 번: 위에서 'logiswebInstall' 함수를 고르고 [실행] → 권한 허용(PC에서 하면 권한 창이 잘 열립니다)",
    "// 이미 다른 코드가 있으면 지우지 말고, 왼쪽 [파일 +] › 스크립트로 새 파일(LogisWeb)을 만들어 거기에 붙여 넣으세요",
    `var LOGISWEB_URL = '${pingUrl()}?k=${key}';`,
    `var LOGISWEB_SHEET_ID = '${sheetId}';`,
    "function logiswebSend(p) {",
    "  try { UrlFetchApp.fetch(LOGISWEB_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(p), muteHttpExceptions: true }); } catch (err) {}",
    "}",
    "function logiswebEdit(e) {",
    "  var tab = '';",
    "  try { tab = e.range.getSheet().getName(); } catch (err) {}",
    "  logiswebSend(tab ? { tab: tab } : { full: true });",
    "}",
    "function logiswebChange(e) {",
    "  var t = (e && e.changeType) || '';",
    "  if (t === 'EDIT' || t === 'FORMAT') return; // 값 고침은 logiswebEdit 가 보낸다 · 서식만 바뀐 건 무시",
    "  logiswebSend({ full: true, type: t });",
    "}",
    "function logiswebInstall() {",
    "  var ss = LOGISWEB_SHEET_ID || SpreadsheetApp.getActive();",
    "  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^logisweb/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });",
    "  ScriptApp.newTrigger('logiswebEdit').forSpreadsheet(ss).onEdit().create();",
    "  ScriptApp.newTrigger('logiswebChange').forSpreadsheet(ss).onChange().create();",
    "  logiswebSend({ full: true, type: 'INSTALL' });",
    "}",
    "",
  ].join("\n");

  // 관리센터 요청(최고관리자) — liveGet · liveSet · liveRun
  async function handle(action, body, me) {
    const co = String(body.company || "").trim();
    if (!co) throw Object.assign(new Error("운송사를 골라 주세요."), { status: 400 });
    const pub = (x) => (x ? { enabled: !!x.enabled, url: x.url || "", tabs: x.tabs || [], days: x.days || 14, removeMissing: x.removeMissing !== false, lastRunAt: x.lastRunAt || 0, lastChangeAt: x.lastChangeAt || 0, lastResult: x.lastResult || null, lastError: x.lastError || "", pingAt: x.pingAt || 0, pingReady: !!x.pingKey } : null);
    if (action === "liveGet") return { live: pub((await ref(co).get()).data()) };
    if (action === "pingScript") { // 시트 알림 스크립트 — 열쇠가 없으면 만든다(renew: 새 열쇠 — 예전 스크립트는 더 이상 안 통한다)
      const x = (await ref(co).get()).data() || {};
      let key = x.pingKey;
      if (!key || body.renew) { key = crypto.randomBytes(16).toString("hex"); await ref(co).set({ companyName: co, pingKey: key, ...(body.renew ? { pingAt: 0 } : {}) }, { merge: true }); }
      return { script: scriptFor(key, parseSpreadsheetId(x.url || "") || ""), live: pub((await ref(co).get()).data()) };
    }
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
      const result = await runOne(co, cfg, { force: true }); // [지금 반영] — 잠금 없이 바로(관리자가 직접 누름)
      return { result, live: pub((await ref(co).get()).data()) };
    }
    return null;
  }

  return { runOne, kick, runScheduled, onPing, handle, scriptFor };
}

module.exports = { makeSheetLive };
