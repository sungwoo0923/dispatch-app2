// ======================= functions/sheetPushOrders.js =======================
// 🔁 2026-11-14 프로그램 → 구글시트 반영(시트 실시간 반영의 반대 방향) — 지금은 JY로지스틱스
//  · 설정: sheetLive/{회사}.pushMode = "off"(기본) · "dry"(점검 — 무엇을 쓸지만 기록, 시트는 그대로) · "on"(시트에 쓴다)
//    실시간 반영(enabled)이 켜져 있을 때만 동작한다. 관리센터 › 배차일지 가져오기 › [프로그램 → 시트 반영]에서 바꾼다
//  · 오더가 바뀌면(queueOrderSheetPush — orders 문서 트리거) sheetPushQueue/{오더ID} 에 적어 두고,
//    약 4초마다 확인하는 실시간 반영(syncSheetOrders)이 시트를 읽기 전에 먼저 처리한다(같은 함수 안에서 차례로 → 서로 엇갈리지 않는다)
//  · 무엇을 어느 칸에 쓸지는 functions/sheetPushCore.mjs(쓰기 전에 가져오기 규칙으로 다시 읽어 확인 · 수식 칸은 안 건드림)
//  · 삭제 = 그 줄을 지운다(2026-11-14 — 병합된 줄 · 줄 지우기 실패 때는 값만 비운다). 한꺼번에 20건 넘게 지워지면 시트는 건드리지 않고 보류(관리센터에서 확인 후 진행 · 버리기)
//  · 새 오더 = 날짜 순서 자리(더 늦은 날짜 줄이 있으면 그 날짜 마지막 줄 아래에 줄을 끼움 · 아니면 맨 아래 빈 줄) · 탭은 그 오더의 담당노선구분(= 시트 탭 이름 · 오더 화면에서 고른다)이 있으면 그 탭, 없으면 같은 거래처 · 상차지 · 하차지가 이미 있는 탭 — 의 맨 아래 빈 줄
//    탭을 못 정하면 오더에 시트탭필요 · 시트탭후보 를 적어 두고, 오더에서 담당노선구분을 고르면 그 탭에 넣는다
const QUEUE = "sheetPushQueue";
const MAX_PER_RUN = 20; // 한 번(1분)에 처리할 오더 수 — 한 건마다 시트 전체를 가져오기 규칙으로 두 번쯤 다시 읽는다
const HOLD_DELETES = 20; // 지울 줄이 이보다 많으면 보류
const KEEP_DONE_MS = 3 * 86400000;
const SERVICE_ACCOUNT_HINT = "시트를 서버 계정(dispatch-app-9b92f@appspot.gserviceaccount.com)에 '편집자'로 공유해 주세요.";
const MODES = ["off", "dry", "on"];
const ts = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : Number(v) || 0);
// ⭐ 2026-11-17 시트 줄 연결값 — 복사한 오더에 딸려 가면 원본 줄을 가리킨다(복사본을 고치면 원본 줄을 덮어쓰고, 지우면 원본 줄을 지웠다)
const LINK_FIELDS = ["이전출처", "시트연동", "_sheetKeys", "_programKeys", "_sheetBase", "이전줄수", "시트탭필요", "시트탭후보"];
// 남의 줄 주소를 가진 오더 — 시트에서 온 오더(등록기기 "구글시트 이전")도, 프로그램에서 만들어 시트에 줄을 만든 오더(시트연동)도 아닌데 이전출처가 있다 = 복사본
const borrowedLink = (x) => !!x?.이전출처 && x.등록기기 !== "구글시트 이전" && x.시트연동 !== true;
const CONFLICTS = "sheetPushConflicts"; // 쓰기 직전에 다시 읽은 줄이 처음 읽은 줄과 달라 쓰지 않은 기록(원인 확인용)
const MAX_CONFLICTS = 5; // 이만큼 계속 엇갈리면 "실패"로 두고 사람이 본다

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
    let unlink = false; // 복사본이 가져온 원본 줄 주소를 떼고 → 자기 줄을 새로 만든다
    if (!b && a) {
      if (a.등록기기 === "구글시트 이전" || /^구글시트/.test(String(a.최종수정자 || ""))) return null; // 시트에서 온 오더(서버 · 가져오기)
      if (a.이전출처) {
        // ⭐ 2026-11-17 줄 주소를 가진 채 새로 생긴 오더 = 복사 등록(원본 필드를 그대로 가져옴) 또는 지운 오더 되살리기
        //  예전엔 그냥 넘겼다 → 복사본이 원본 줄 주소를 그대로 가졌고, 나중에 복사본을 고치면 원본 줄에 덮어쓰고 · 지우면 원본 줄을 지웠다
        //  되살리기(아직 시트에서 안 지운 삭제가 남아 있음)면 그 삭제만 취소한다. 아니면 주소를 떼고 새 줄로 넣는다
        const q0 = (await q().doc(id).get().catch(() => null))?.data() || null;
        if (q0 && q0.kind === "delete" && ["pending", "held", "failed"].includes(q0.state)) { await q().doc(id).delete().catch(() => {}); return null; }
        unlink = true;
      }
      kind = "create";
    }
    else if (b && !a) {
      kind = b.이전출처 ? "delete" : "drop";
      // ⭐ 2026-11-17 복사본(남의 줄 주소를 가진 오더)을 지워도 시트 줄은 지우지 않는다 — 그 줄은 원본 오더의 줄이다
      if (kind === "delete" && borrowedLink(b)) kind = "drop";
      // 🛑 2026-11-17 시트에서 줄이 없어져 서버(실시간 반영)가 지운 오더는 시트로 "삭제"를 보내지 않는다
      //  예전엔 이것도 시트 줄 삭제로 보냈다 → 그 자리(같은 줄 번호 · 같은 날짜)로 올라온 다음 줄을 지움 → 그 줄의 오더가 또 지워짐 → 또 다음 줄…
      //  (시트에서 한 줄을 지우거나 옮기면 같은 날짜 줄들이 줄줄이 사라졌다)
      if (kind === "delete") {
        const log = (await db.collection("deletedOrders").doc(`orders_${context.params.orderId}`).get().catch(() => null))?.data() || null;
        if (log && /^구글시트/.test(String(log.by || ""))) kind = "drop";
      }
    }
    else if (a.이전출처 && borrowedLink(a)) { kind = "create"; unlink = true; } // ⭐ 2026-11-17 예전에 만든 복사본 — 원본 줄을 고치지 않고 주소를 떼어 자기 줄을 만든다
    else if (a.이전출처) { if (!C.changedKeys(b, a).length) return null; kind = "update"; }
    else { if (a.등록기기 === "구글시트 이전") return null; if (String(a.시트탭 || "") === String(b.시트탭 || "") && String(a.담당노선구분 || "") === String(b.담당노선구분 || "") && !C.changedKeys(b, a).length) return null; kind = "create"; }
    if (unlink && (await modeFor(co)) === "on") { // 점검(dry)일 때는 오더를 건드리지 않는다
      const strip = Object.fromEntries(LINK_FIELDS.map((k) => [k, FieldValue.delete()]));
      await db.collection("orders").doc(id).set({ ...strip, 시트기록일시: FieldValue.serverTimestamp() }, { merge: true }); // 시트기록일시 = 서버가 쓴 표시(이 변경은 다시 대기열에 넣지 않는다)
      console.log(`[시트 쓰기] ${co} ${id} 복사본의 원본 줄 주소(${a.이전출처})를 떼고 새 줄로 넣습니다`);
    }
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
    let book = await readAll(id, null);
    const ctxOf = (bk) => C.makePushContext(bk.tabs.map((t) => ({ title: t.title, rows: P.applyMerges(t.rows, t.merges) })), preset, bk.formulas);
    let ctx = ctxOf(book);
    // 🗑 2026-11-14 지운 오더의 줄은 줄째로 지운다 — 줄 번호가 밀리지 않게 이번 차례 맨 끝에 아래 줄부터 한 번에(dropRows)
    //  날짜 칸 등이 여러 줄에 걸쳐 병합된 줄은 줄을 지우면 병합 값이 사라질 수 있어 예전처럼 값만 비운다
    const merged = (tab, row) => ((book.tabs.find((t) => t.title === tab) || {}).merges || []).some((m) => m.endRowIndex - m.startRowIndex > 1 && m.startRowIndex <= row - 1 && row - 1 < m.endRowIndex);
    const dropRows = []; let structural = false;
    // ⭐ 2026-11-18 끝 표시 — 처리하는 사이(시트를 읽고 쓰는 몇 초~수십 초) 사람이 그 오더를 또 고쳤으면(대기열 at이 바뀜) "끝"으로 덮지 않는다
    //  예전엔 기사를 빼고(1차) 곧바로 다른 기사를 넣으면(2차) 2차 변경이 같은 대기 건에 합쳐진 뒤 1차 처리의 "끝" 표시에 덮여 시트에 안 갔다(사용자 신고)
    //  written: 방금 시트에 쓴 오더 값 — 다음 차례의 비교 기준(before)으로 삼는다(시트 줄이 이미 이 값이다 · 새로 만든 줄이면 이제 "수정")
    const done = (it, state, result, extra = {}, written = null) => db.runTransaction(async (tx) => {
      const cur = (await tx.get(it.ref)).data();
      if (!cur) return;
      if (cur.state === "pending" && Number(cur.at || 0) !== Number(it.at || 0)) {
        if (written) tx.set(it.ref, { before: written, kind: cur.kind === "delete" ? "delete" : "update", tries: 0, conflicts: 0 }, { merge: true });
        console.log(`[시트 쓰기] ${co} ${it.orderId} 처리하는 사이 또 고쳐져 다음 차례에 이어서 반영합니다`);
        return;
      }
      tx.set(it.ref, { state, doneAt: Date.now(), result: result || null, ...extra }, { merge: true });
    });
    const summary = (p) => ({ tab: p.tab || "", row: p.row || 0, cells: (p.cells || []).slice(0, 40).map((c) => ({ a1: c.a1, was: String(c.was ?? "").slice(0, 80), value: String(c.value ?? "").slice(0, 80) })), pushed: p.pushed || [], unpushed: p.unpushed || [], reason: p.reason || "" });
    // ⭐ 2026-11-17 쓰기(지우기) 직전 확인 — 시트를 읽은 뒤 실제로 쓰기까지 몇 초~수십 초 걸린다(한 건마다 가져오기 규칙으로 다시 읽어 본다)
    //  그사이 사람이 줄을 끼우거나 · 지우거나 · 정렬하면 줄 번호가 밀려, 예전엔 엉뚱한 줄(방금 친 줄)에 덮어쓰거나 그 줄을 통째로 지웠다
    //  → 쓰기 직전에 그 줄만 다시 읽어 처음 읽은 줄과 같을 때만 쓴다(수식 칸은 다른 줄에 따라 바뀔 수 있어 견주지 않는다)
    //    다르면 쓰지 않고 대기로 남긴다 → 다음 차례(사람이 고친 알림 · 1분 안전장치)에 시트를 새로 읽어 제자리를 다시 찾는다
    const snapRow = (tab, row) => ({ tab, row,
      cells: [...((((book.tabs.find((t) => t.title === tab) || {}).rows) || [])[row - 1] || [])].map((v) => String(v ?? "").trim()),
      formula: ((((book.formulas || {})[tab]) || [])[row - 1] || []).map((v) => String(v ?? "").startsWith("=")) });
    const sameRow = (sn, now) => { const n = Math.max(sn.cells.length, now.length); for (let c = 0; c < n; c += 1) { if (sn.formula[c]) continue; if ((sn.cells[c] || "") !== String(now[c] ?? "").trim()) return false; } return true; };
    const readRows = async (list) => {
      const got = await sheetsApiFor(id, "GET", `/values:batchGet?${list.map((x) => `ranges=${encodeURIComponent(`${quoteTab(x.tab)}!A${x.row}:ZZ${x.row}`)}`).join("&")}&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
      return list.map((_, k) => (got.valueRanges?.[k]?.values || [])[0] || []);
    };
    const conflict = async (it, plan, sn, now) => {
      const n = (Number(it.conflicts) || 0) + 1;
      const reason = "시트를 읽은 뒤 그 줄이 바뀌어(줄 추가 · 삭제 · 정렬 · 입력) 쓰지 않았습니다 — 다음 차례에 시트를 다시 읽어 맞춥니다";
      await db.collection(CONFLICTS).doc().set({ companyName: co, orderId: it.orderId, kind: it.kind, label: it.label || "", tab: sn.tab, row: sn.row, at: Date.now(),
        expect: sn.cells.slice(0, 40).map((v) => v.slice(0, 80)), got: now.slice(0, 40).map((v) => String(v ?? "").slice(0, 80)), cells: summary(plan).cells }).catch(() => {});
      await it.ref.set({ conflicts: n, lastError: reason, ...(n >= MAX_CONFLICTS ? { state: "failed", doneAt: Date.now(), result: { ...summary(plan), reason: `${reason} (${n}번 계속 엇갈려 멈춤 — 확인해 주세요)` } } : {}) }, { merge: true });
      console.warn(`[시트 쓰기] ${co} ${it.orderId} ${sn.tab}!${sn.row} 읽은 뒤 줄이 바뀌어 쓰지 않음(${n}번째)`);
    };
    // ⭐ 2026-11-17 같은 시트 줄을 가리키는 다른 오더(복사본 · 중복) — 그 줄의 날짜 · 구간 · 차량까지 같은 오더만
    //  하나를 지웠다고 줄을 지우면 남은 오더의 줄(사람이 시트에 적은 줄)이 사라졌다 · 복사본을 고치면 원본 줄을 덮어썼다
    const othersOn = async (rec, selfId) => {
      const sn = await db.collection("orders").where("companyName", "==", co).where("이전출처", "==", rec.이전출처).get().catch(() => null);
      return (sn?.docs || []).filter((d) => d.id !== selfId).map((d) => ({ id: d.id, ...(d.data() || {}) })).filter((x) => C.rowMatches(x, rec, { strict: true }));
    };
    // 그 줄의 주인: 시트에서 온 오더 → 프로그램에서 만들어 시트에 줄을 만든 오더 → 먼저 만든 오더
    const rank = (x) => [x?.등록기기 === "구글시트 이전" ? 0 : x?.시트연동 === true ? 1 : 2, ts(x?.createdAt) || Number.MAX_SAFE_INTEGER];
    const ahead = (x, y) => { const a = rank(x), b = rank(y); return a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]; };
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
          const cur = C.findRow(ctx, it.before || {}, { taken, strict: true });
          if (cur && (await othersOn(cur, it.orderId)).length) { await done(it, "skipped", { tab: cur.__tab, row: cur.__row, reason: "같은 시트 줄을 쓰는 다른 오더가 있어 줄을 지우지 않았습니다(복사본 · 중복 오더)" }); continue; }
          plan = C.planDelete(ctx, it.before || {}, { taken });
          if (plan.ok && plan.cells.length && hold) { await done(it, "held", { ...summary(plan), reason: `삭제 ${dels.length}건이 한꺼번에 들어와 보류했습니다` }); continue; }
        } else if (it.kind === "update") {
          const bf = { ...(it.before || {}), 이전출처: (it.before || {}).이전출처 || after.이전출처 };
          const cur = C.findRow(ctx, bf, { taken });
          const others = cur ? await othersOn(cur, it.orderId) : [];
          if (others.length && (!C.rowMatches(bf, cur, { strict: true }) || others.some((o) => ahead(o, after)))) { await done(it, "skipped", { tab: cur.__tab, row: cur.__row, reason: "같은 시트 줄을 쓰는 다른(먼저 있던) 오더가 있어 시트에 쓰지 않았습니다(복사본 · 중복 오더)" }); continue; }
          plan = C.planUpdate(ctx, bf, after, { taken });
        } else {
          // 탭: 오더에서 고른 담당노선구분(= 탭 이름)이 먼저, 없으면 같은 구간이 이미 있는 탭
          const okTab = (t) => !!t && ctx.tabs.some((x) => x.title === t) && (!pushTabs.length || pushTabs.includes(t));
          let tab = [after.시트탭, after.담당노선구분].map((v) => String(v || "").trim()).find(okTab) || "";
          if (!tab) { const pk = C.pickTab(ctx, after, pushTabs); tab = pk.tab || "";
            if (!tab) {
              if (mode === "on") await doc.ref.set({ 시트탭필요: true, 시트탭후보: (pk.candidates || []).slice(0, 30), 시트기록일시: FieldValue.serverTimestamp() }, { merge: true });
              await done(it, "needTab", { reason: "어느 탭에 넣을지 정하지 못했습니다(오더에서 탭을 골라 주세요)", candidates: (pk.candidates || []).slice(0, 30) }); continue;
            } }
          // 🗓 그 날짜보다 늦은 줄이 이미 있으면(12일까지 있는데 11일 오더) 11일 마지막 줄 바로 아래에 줄을 끼워 넣는다
          const at = mode === "on" ? C.insertRowFor(ctx, after, tab) : 0;
          if (at) {
            await sheetsApiFor(id, "POST", ":batchUpdate", { data: { requests: [{ insertDimension: { range: { sheetId: book.grid[tab].sheetId, dimension: "ROWS", startIndex: at - 1, endIndex: at }, inheritFromBefore: true } }] } });
            wrote = true; structural = true;
            dropRows.forEach((d) => { if (d.tab === tab && d.row >= at) d.row += 1; }); // 이번 차례에 지울 줄이 아래에 있으면 한 줄 밀린다
            book = await readAll(id, null); ctx = ctxOf(book); taken.clear(); // 줄 번호가 바뀌었으니 다시 읽는다
            dropRows.forEach((d) => taken.add(`${d.tab}!${d.row}`)); // ⭐ 2026-11-17 곧 지울 줄은 계속 잡아 둔다(새 오더를 그 줄에 쓰지 않게)
            plan = C.planCreate(ctx, after, tab, { rowCount: book.grid[tab]?.rowCount || 0, atRow: at, taken });
          } else plan = C.planCreate(ctx, after, tab, { rowCount: book.grid[tab]?.rowCount || 0, taken });
          if (!plan.ok && plan.needRows && mode === "on") { // 탭에 빈 줄이 없으면 200줄 늘리고 다시
            await sheetsApiFor(id, "POST", ":batchUpdate", { data: { requests: [{ appendDimension: { sheetId: book.grid[tab].sheetId, dimension: "ROWS", length: 200 } }] } });
            book.grid[tab].rowCount += 200; wrote = true;
            plan = C.planCreate(ctx, after, tab, { rowCount: book.grid[tab].rowCount, taken });
          }
        }
        n += 1;
        if (!plan.ok) { await done(it, "failed", summary(plan)); continue; }
        if (plan.tab && plan.row) taken.add(`${plan.tab}!${plan.row}`);
        if (mode === "dry") { await done(it, "dry", summary(plan)); continue; }
        if (it.kind === "delete" && plan.tab && plan.row && plan.cells?.length && book.grid[plan.tab] && !merged(plan.tab, plan.row)) { dropRows.push({ it, plan, tab: plan.tab, row: plan.row, snap: snapRow(plan.tab, plan.row) }); continue; }
        if (plan.cells && plan.cells.length) {
          if (plan.tab && plan.row) { const sn = snapRow(plan.tab, plan.row); const [now] = await readRows([sn]); if (!sameRow(sn, now)) { await conflict(it, plan, sn, now); continue; } }
          try { await writeCells(id, plan.tab, plan.cells); wrote = true; }
          catch (e) { // 못 썼다 — 이번 차례는 여기서 멈춘다(나머지는 다음에). 권한 문제면 화면에 그대로 알린다
            const msg = writeErr(e);
            await it.ref.set({ tries: (it.tries || 0) + 1, lastError: msg, ...(it.tries >= 4 ? { state: "failed", doneAt: Date.now(), result: { ...summary(plan), reason: msg } } : {}) }, { merge: true });
            await db.collection("sheetLive").doc(co).set({ pushError: msg, pushErrorAt: Date.now() }, { merge: true });
            return { wrote, error: msg };
          }
        }
        if (doc && plan.docPatch) await doc.ref.set({ ...plan.docPatch, 시트탭필요: FieldValue.delete(), 시트탭후보: FieldValue.delete(), 시트기록일시: FieldValue.serverTimestamp() }, { merge: true });
        await done(it, "done", summary(plan), {}, after ? await trim({ ...after, ...(plan.docPatch || {}) }) : null);
      } catch (e) {
        console.error(`[시트 쓰기 실패] ${co} ${it.orderId}:`, e?.message || e);
        await it.ref.set({ tries: (it.tries || 0) + 1, lastError: String(e?.message || e).slice(0, 200), ...(it.tries >= 4 ? { state: "failed", doneAt: Date.now(), result: { reason: String(e?.message || e).slice(0, 200) } } : {}) }, { merge: true }).catch(() => {});
      }
    }
    // 🗑 지울 줄 — 아래 줄부터 한 번에 지운다(위에서부터 지우면 아래 줄 번호가 밀린다). 못 지우면 예전처럼 값만 비운다
    if (dropRows.length) { // ⭐ 2026-11-17 지우기 직전에 그 줄들을 다시 읽어, 처음 읽은 줄 그대로인 것만 지운다
      const now = await readRows(dropRows.map((d) => ({ tab: d.tab, row: d.row }))).catch((e) => { console.warn(`[시트 쓰기] ${co} 지울 줄 확인 실패 — 다음 차례에:`, e?.message || e); return null; });
      const keep = [];
      for (let k = 0; k < dropRows.length; k += 1) { const d = dropRows[k]; if (now && sameRow(d.snap, now[k])) keep.push(d); else if (now) await conflict(d.it, d.plan, d.snap, now[k]); }
      dropRows.length = 0; dropRows.push(...keep);
    }
    if (dropRows.length) {
      const reqs = [...dropRows].sort((x, y) => y.row - x.row).map((d) => ({ deleteDimension: { range: { sheetId: book.grid[d.tab].sheetId, dimension: "ROWS", startIndex: d.row - 1, endIndex: d.row } } }));
      try {
        await sheetsApiFor(id, "POST", ":batchUpdate", { data: { requests: reqs } });
        wrote = true; structural = true;
        for (const d of dropRows) await done(d.it, "done", { ...summary(d.plan), reason: "줄 삭제" });
      } catch (e) {
        console.warn(`[시트 쓰기] ${co} 줄 삭제 실패 — 값만 비움:`, e?.message || e);
        for (const d of dropRows) {
          // ⭐ 2026-11-17 줄 번호는 지금 위치(d.row)로 — 같은 차례에 위에 줄을 끼웠으면 계획 때 번호(plan.cells)는 한 줄 위(새 오더 줄)를 가리킨다
          const cells = d.plan.cells.map((c) => ({ ...c, a1: String(c.a1).replace(/\d+$/, String(d.row)) }));
          try { await writeCells(id, d.plan.tab, cells); wrote = true; await done(d.it, "done", summary(d.plan)); }
          catch (e2) { await d.it.ref.set({ tries: (d.it.tries || 0) + 1, lastError: writeErr(e2) }, { merge: true }).catch(() => {}); }
        }
      }
    }
    if (wrote) await db.collection("sheetLive").doc(co).set({ pushError: "", lastPushAt: Date.now() }, { merge: true });
    await writeIssueCount(co).catch(() => {});
    // structural: 줄을 끼우거나 지웠다 → 아래 줄 번호가 밀렸으니 부른 쪽이 시트를 다시 읽어 오더의 줄 위치를 맞춘다 · more: 남은 대기 건이 있다
    return { wrote, structural, more: n >= MAX_PER_RUN };
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

  // 시트로 아직 못 간 프로그램 변경(대기 중)이 있는 오더 — 실시간 반영이 그 오더를 옛 시트 값으로 되돌리지 않게
  async function pendingIds(co) {
    const snap = await q().where("companyName", "==", co).where("state", "==", "pending").limit(300).get();
    return new Set(snap.docs.map((d) => d.id));
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

  return { onOrderWrite, process, pendingDeletes, pendingIds, purgeInactive, sweep, handle, modeFor };
}

module.exports = { makeSheetPush };
