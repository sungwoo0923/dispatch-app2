// ======================= functions/resetJob.js =======================
// ⭐ 2026-11-07 운송사 초기화 엔진 — "돌캐 초기화가 보관함 복사 57%(31,831 / 37,248)에서 멈춤" 다시 고침
//  index.js의 companyResetHandler가 이 모듈을 db·Storage·Auth를 넣어 만든다(테스트는 에뮬레이터 + 가짜 Storage).
//
//  멈춤 원인(운영 서버는 e217be45 이전 코드가 돌고 있었다 — "보관함에 복사 중 31,831 / 37,248"은 그 코드의 문구):
//   ① 회사당 작업 하나 보장이 없었다. [초기화]를 누를 때마다 새 작업ID → 새 보관함 → 같은 회사 3만 건을 여러 작업이 동시에 복사.
//      "작업 중" 표시는 작업ID 하나에만 걸려 있어 서로를 막지 못했다(보관함 4개 "처리 중").
//   ② 하트비트가 setInterval이라 일이 멈춰도(await가 끝나지 않아도) 계속 "살아 있음"을 남겼다 → 화면은 다시 부르지 못하고,
//      다시 불러도 서버가 busy로 돌려보냈다. 반대로 함수가 죽으면(시간·메모리 초과) 다시 불릴 때 보관함을 비우고 처음부터.
//   ③ 2세대 함수의 기본 동시 처리(인스턴스 하나에 요청 80개)라 여러 작업이 4GiB 한 인스턴스를 나눠 쓰다 메모리 초과로 같이 죽었다.
//   ④ 복사를 BulkWriter 한 번에(문서 수만 건을 메모리에 들고) — 큰 문서 20개가 한 묶음에 들어가면 10MiB 요청 한도 초과,
//      1MiB 가까운 문서는 {path,data}로 감싸는 순간 크기 초과 → 같은 자리에서 영원히 실패(독 문서).
//  새 방식:
//   - 회사 잠금(resetLocks/{회사}) — 임대(leaseUntil) + 실행ID(runId, 펜싱). 일이 실제로 진행될 때만 임대를 연장한다
//     (진행이 stuckMs 넘게 없으면 연장을 멈춤 → 임대가 끝나면 다음 호출이 이어받음). 늦게 깨어난 옛 실행은 커서를 못 쓴다.
//   - 같은 회사의 끝나지 않은 작업이 있으면 새 보관함을 만들지 않고 그 작업으로 돌려보낸다({redirect}).
//   - 복사는 묶음(400건) 안에서도 50건씩 읽고, 4MB·200건 단위로 나눠 쓴다. 큰 문서·깊은 문서는 Storage JSON.
//   - 실패한 문서·파일은 그 묶음을 3번까지 다시 해 보고, 그래도 안 되면 skipped에 적고 건너뛴다.
//     건너뛴 문서·파일은 보관본이 없으므로 삭제 단계에서도 지우지 않는다(운영 데이터를 보관 없이 지우는 일은 없다).
//   - 삭제 단계는 보관 확인(보관함 문서 수 ≥ 복사한 수)이 끝난 뒤에만 시작한다.
//   - [취소하고 정리]: 삭제가 시작되기 전 작업만 — 보관함 복사본·Storage 보관 파일만 지우고 잠금을 푼다.

const RESET_COMPANY_FIELDS = ["companyName", "company", "회사명", "운송사명", "transportCompany", "companyKey"];
const RESET_UID_FIELDS = ["uid", "userId", "ownerUid", "createdByUid", "writerUid", "authorUid", "driverUid"];
const RESET_SKIP_COLLECTIONS = new Set(["adminSecrets", "resetLogs", "resetBackups", "resetJobs", "resetLocks"]);
const RESET_ORDER_COLLECTIONS = new Set(["orders", "dispatch"]);
const RESET_KEEP_DAYS = 7;
// 회사명이 비어 있는 예전 데이터는 프로그램이 "돌캐" 것으로 본다(화면의 companyName || "돌캐" 규칙)
const RESET_LEGACY_COMPANY = "돌캐";
const RESET_LEGACY_COLLECTIONS = [
  "dispatch", "orders", "fixedClients", "clients", "places", "drivers", "schedules", "notices", "handovers",
  "multiRateSheets", "deletedOrders", "scheduledEmails", "emailLogs", "acctPayments", "attendance",
  "attendanceRequests", "attendanceChangeRequests", "driver_logs", "driver_notifications", "driver_documents",
  "driver_completed_archive", "driver_photo_logs", "gps_tracks",
];
const RESET_CHUNK = 400;            // manifest 묶음 하나에 담는 문서 경로 수
const RESET_READ_GROUP = 50;        // 복사할 때 한 번에 읽는 문서 수(메모리)
const RESET_BIG_DOC_BYTES = 700000; // 이보다 큰 문서는 Storage JSON
const RESET_BATCH_BYTES = 4 * 1024 * 1024; // 쓰기 한 묶음 크기(요청 한도 10MiB의 절반 아래)
const RESET_BATCH_OPS = 200;
const RESET_MAX_DEPTH = 18;         // 이보다 깊은 문서는 {path,data}로 감싸면 20단계 한도를 넘을 수 있어 Storage JSON
const RESET_POISON_ATTEMPTS = 3;    // 같은 묶음을 이만큼 해 봐도 실패하는 문서·파일은 건너뛴다(삭제도 안 함)
const UNFINISHED_PHASES = new Set(["wipe", "collect", "copy", "delete", "legacyDelete", "backup"]);

const padN = (n, w = 6) => String(n).padStart(w, "0");
const chunkArr = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === "number" ? v : 0);

// 문서 안의 Firebase Storage 파일 경로 찾기(다운로드 URL·gs:// 주소)
function collectStoragePaths(value, out) {
  if (!value) return;
  if (typeof value === "string") {
    const m = value.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/);
    if (m) { try { out.add(decodeURIComponent(m[1])); } catch { /* 무시 */ } return; }
    const g = value.match(/^gs:\/\/[^/]+\/(.+)$/);
    if (g) out.add(g[1]);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectStoragePaths(v, out)); return; }
  if (typeof value === "object" && !(value instanceof Date) && !value.toMillis) {
    Object.values(value).forEach((v) => collectStoragePaths(v, out));
  }
}

function depthOf(v, d = 0) {
  if (d > 40) return d;
  if (Array.isArray(v)) return v.reduce((m, x) => Math.max(m, depthOf(x, d + 1)), d + 1);
  if (v && typeof v === "object" && v.constructor === Object) return Object.values(v).reduce((m, x) => Math.max(m, depthOf(x, d + 1)), d + 1);
  return d;
}

class LostLease extends Error { constructor() { super("다른 실행이 이 작업을 이어받았습니다."); this.lostLease = true; } }
class Cancelled extends Error { constructor() { super("취소된 작업입니다."); this.cancelled = true; } }
const httpErr = (msg, status) => Object.assign(new Error(msg), { status });

function makeResetJob({
  db, FieldValue, Timestamp, GeoPoint, getBucket, getAuth = null,
  setBulkMode = async () => {}, bumpDataVersion = async () => {}, markContractEnded = async () => {},
  now = () => Date.now(), env = process.env, hooks = {}, log = console,
}) {
  const cfg = {
    leaseMs: Number(env.KP_RESET_LEASE_MS) || 3 * 60000,   // 잠금 임대 — 연장이 끊기면 이 시간 뒤 다른 호출이 이어받음
    stuckMs: Number(env.KP_RESET_STUCK_MS) || 10 * 60000,  // 이만큼 진행이 없으면 "멈춤"으로 보고 임대 연장을 멈춤
    hbMs: Number(env.KP_RESET_HB_MS) || 20000,             // 하트비트 간격
    opTimeoutMs: Number(env.KP_RESET_OP_TIMEOUT_MS) || 120000, // 읽기·Storage 작업 하나의 최대 시간
    progressMs: 2000,
  };
  const backups = () => db.collection("resetBackups");
  const jobs = () => db.collection("resetJobs");
  const locks = () => db.collection("resetLocks");
  const lockKey = (company) => String(company || "").replace(/\//g, "∕").slice(0, 300) || "_";

  // ── Firestore 값 ↔ JSON(Storage 보관용) ──
  function encodeFsValue(v) {
    if (v === null || v === undefined) return v;
    if (v instanceof Timestamp) return { __kpT: "ts", s: v.seconds, n: v.nanoseconds };
    if (v instanceof Date) return { __kpT: "ts", s: Math.floor(v.getTime() / 1000), n: (v.getTime() % 1000) * 1e6 };
    if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __kpT: "bytes", b: Buffer.from(v).toString("base64") };
    if (v && typeof v === "object" && typeof v.latitude === "number" && typeof v.longitude === "number" && v.constructor?.name === "GeoPoint") return { __kpT: "geo", la: v.latitude, lo: v.longitude };
    if (v && typeof v === "object" && typeof v.path === "string" && v.firestore && typeof v.collection === "function") return { __kpT: "ref", p: v.path };
    if (Array.isArray(v)) return v.map(encodeFsValue);
    if (typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = encodeFsValue(v[k]); }); return o; }
    return v;
  }
  function decodeFsValue(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(decodeFsValue);
    if (typeof v === "object") {
      if (v.__kpT === "ts") return new Timestamp(v.s, v.n || 0);
      if (v.__kpT === "bytes") return Buffer.from(v.b, "base64");
      if (v.__kpT === "geo") return new GeoPoint(v.la, v.lo);
      if (v.__kpT === "ref") return db.doc(v.p);
      const o = {}; Object.keys(v).forEach((k) => { o[k] = decodeFsValue(v[k]); }); return o;
    }
    return v;
  }
  const approxDocBytes = (data) => { try { return Buffer.byteLength(JSON.stringify(encodeFsValue(data))); } catch { return Infinity; } };

  // ── 작업 하나가 영원히 기다리지 않게 ──
  function withTimeout(p, label, ms = cfg.opTimeoutMs) {
    let t;
    return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error(`시간 초과(${Math.round(ms / 1000)}초): ${label}`), { timeout: true })), ms); })])
      .finally(() => clearTimeout(t));
  }
  const permanent = (e) => e?.code === 3 || e?.code === 404 || e?.code === "INVALID_ARGUMENT" || e?.permanent;
  async function retry(fn, label, tries = 3) {
    let last;
    for (let a = 0; a < tries; a++) {
      try { return await withTimeout(Promise.resolve().then(fn), label); } catch (e) {
        last = e;
        if (permanent(e)) throw e;
        if (a < tries - 1) await sleep(300 * 2 ** a);
      }
    }
    throw last;
  }

  // ── 진행률(resetJobs/{작업ID}) — 화면이 실시간으로 본다. 2초에 한 번만 쓴다 ──
  function makeProgress(jobId, base) {
    const ref = jobs().doc(jobId);
    let last = 0;
    return {
      ref,
      async set(pct, step, force = false) {
        const t = now();
        if (!force && t - last < cfg.progressMs) return;
        last = t;
        await ref.set({ ...base, pct: Math.max(0, Math.min(99, Math.round(pct))), step, status: "running", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
      },
      async ok() { await ref.set({ errorCount: 0 }, { merge: true }).catch(() => {}); },
      async done(result) { await ref.set({ ...base, pct: 100, step: "완료", status: "done", result, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {}); },
      async fail(error, fatal, failedStep) { await ref.set({ ...base, status: "error", error, fatal: !!fatal, failedStep: failedStep || "", errorCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {}); },
      async pause(step) { await ref.set({ ...base, status: "paused", step, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {}); },
      async mark(patch) { await ref.set({ ...base, ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {}); },
    };
  }

  // ── 회사 잠금(임대 + 펜싱) ──
  //  acquire → { ok:true, lease } | { busy:true, holder, kind }
  async function acquire({ company, jobId, kind, by = "", base = {} }) {
    const lockRef = locks().doc(lockKey(company));
    const jobRef = jobs().doc(jobId);
    const runId = `${now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const got = await db.runTransaction(async (tx) => {
      const l = (await tx.get(lockRef)).data();
      if (l && l.runId && (l.leaseUntil || 0) > now()) return { busy: true, holder: l.jobId, kind: l.kind || "" };
      tx.set(lockRef, { company, jobId, kind, runId, by, leaseUntil: now() + cfg.leaseMs, progressAt: now(), at: FieldValue.serverTimestamp() });
      tx.set(jobRef, { ...base, status: "running", runId, heartbeatAt: FieldValue.serverTimestamp(), attempts: FieldValue.increment(1), error: FieldValue.delete(), fatal: FieldValue.delete() }, { merge: true });
      return { ok: true, prev: l || null };
    });
    if (!got.ok) return got;
    const lease = {
      runId, lockRef, jobRef, lost: false, stuck: false, lastTouch: now(), prev: got.prev,
      touch() { lease.lastTouch = now(); lease.stuck = false; },
      assert() { if (lease.lost) throw new LostLease(); },
      // 펜싱된 저장 — 잠금이 아직 내 것일 때만 쓴다(늦게 깨어난 옛 실행이 커서를 되돌리지 못하게)
      async commit(fn, backupRef = null) {
        lease.assert();
        const r = await db.runTransaction(async (tx) => {
          const l = (await tx.get(lockRef)).data();
          const bd = backupRef ? (await tx.get(backupRef)).data() : null;
          if (!l || l.runId !== runId) return "lost";
          if (bd && kind === "reset" && ((bd.cancelRequested && !bd.deleteStarted) || ["cancelling", "cancelled", "purging", "purged"].includes(bd.status))) return "cancelled";
          await fn(tx, bd);
          tx.update(lockRef, { leaseUntil: now() + cfg.leaseMs, progressAt: now() });
          return "ok";
        });
        if (r === "lost") { lease.lost = true; throw new LostLease(); }
        if (r === "cancelled") throw new Cancelled();
        lease.touch();
      },
      async beat() {
        if (lease.lost) return;
        if (now() - lease.lastTouch > cfg.stuckMs) { lease.stuck = true; return; } // 진행이 없으면 연장하지 않는다
        const r = await db.runTransaction(async (tx) => {
          const l = (await tx.get(lockRef)).data();
          if (!l || l.runId !== runId) return "lost";
          tx.update(lockRef, { leaseUntil: now() + cfg.leaseMs });
          tx.set(jobRef, { heartbeatAt: FieldValue.serverTimestamp() }, { merge: true });
          return "ok";
        }).catch(() => "err");
        if (r === "lost") lease.lost = true;
      },
      timer: null,
      start() { lease.timer = setInterval(() => { lease.beat(); }, cfg.hbMs); if (lease.timer.unref) lease.timer.unref(); },
      stop() { if (lease.timer) clearInterval(lease.timer); lease.timer = null; },
      async release() {
        lease.stop();
        await db.runTransaction(async (tx) => {
          const l = (await tx.get(lockRef)).data();
          if (l && l.runId === runId) tx.delete(lockRef);
        }).catch(() => {});
      },
    };
    lease.start();
    return { ok: true, lease };
  }

  // ── 찾기 ──
  async function getCompanyMembers(company) {
    const users = await db.collection("users").where("companyName", "==", company).get();
    const userDocs = [...users.docs];
    if (company === RESET_LEGACY_COMPANY) {
      const all = await db.collection("users").get();
      all.docs.forEach((d) => {
        const u = d.data();
        if (!String(u.companyName || "").trim() && !["shipper", "cafeUser"].includes(u.role)) userDocs.push(d);
      });
    }
    const members = userDocs
      .filter((d) => d.data().role !== "totalMaster" && d.data().email !== "tjddnqkf@naver.com")
      .map((d) => ({ uid: d.id, email: d.data().email || "", role: d.data().role || "" }));
    const codes = new Set();
    userDocs.forEach((d) => { if (d.data().companyCode) codes.add(String(d.data().companyCode)); });
    const apps = await db.collection("transportApplications").where("companyName", "==", company).get();
    apps.docs.forEach((d) => { if (d.data().companyCode) codes.add(String(d.data().companyCode)); });
    return { members, codes: [...codes].filter(Boolean) };
  }

  // 한 컬렉션에서 이 운송사 문서 찾기 → [{ref, data()}] (내용은 복사 단계에서 읽으므로 여기서는 가볍게 — role·email만)
  async function collectInCollection(colRef, ctx, onPage = () => {}) {
    const { company, codes, uids } = ctx;
    const col = colRef.id;
    const found = new Map();
    const add = (docs) => docs.forEach((d) => { if (d.exists && !found.has(d.ref.path)) found.set(d.ref.path, d); });
    const tasks = [];
    const light = (q) => q.select("role", "email");
    RESET_COMPANY_FIELDS.forEach((f) => tasks.push(() => light(colRef.where(f, "==", company)).get()));
    codes.forEach((code) => tasks.push(() => light(colRef.where("companyCode", "==", code)).get()));
    chunkArr(uids, 30).forEach((ch) => RESET_UID_FIELDS.forEach((f) => tasks.push(() => light(colRef.where(f, "in", ch)).get())));
    for (const part of chunkArr(tasks, 20)) {
      const results = await Promise.all(part.map((t) => t().catch(() => null)));
      results.forEach((r) => r && add(r.docs));
      onPage();
    }
    const idRefs = [...(company.includes("/") ? [] : [colRef.doc(company)]), ...uids.map((u) => colRef.doc(u))];
    for (const ch of chunkArr(idRefs, 100)) {
      const snaps = await db.getAll(...ch, { fieldMask: ["role", "email"] }).catch(() => []);
      add(snaps.filter((s) => s.exists));
    }
    if (company === RESET_LEGACY_COMPANY && RESET_LEGACY_COLLECTIONS.includes(col)) {
      const uidSet = new Set(uids);
      let last = null;
      for (;;) {
        let q = colRef.select(...RESET_COMPANY_FIELDS, "companyCode", ...RESET_UID_FIELDS).orderBy("__name__").limit(10000);
        if (last) q = q.startAfter(last);
        const page = await q.get();
        onPage();
        if (page.empty) break;
        last = page.docs[page.docs.length - 1];
        page.docs.forEach((d) => {
          if (found.has(d.ref.path)) return;
          const x = d.data() || {};
          let hit;
          if (RESET_ORDER_COLLECTIONS.has(col)) hit = !String(x.companyName ?? "").trim();
          else if (![...RESET_COMPANY_FIELDS, "companyCode"].every((f) => !String(x[f] ?? "").trim())) hit = false;
          else {
            const owners = RESET_UID_FIELDS.map((f) => String(x[f] ?? "").trim()).filter(Boolean);
            hit = owners.length === 0 || owners.some((o) => uidSet.has(o));
          }
          if (hit) found.set(d.ref.path, { ref: d.ref, exists: true, data: () => ({}) });
        });
        if (page.size < 10000) break;
      }
    }
    // 최고관리자 계정 문서는 절대 지우지 않는다(안전장치)
    if (col === "users") {
      for (const [path, d] of found) {
        const data = d.data() || {};
        if (data.role === "totalMaster" || data.email === "tjddnqkf@naver.com") found.delete(path);
      }
    }
    return [...found.values()];
  }

  // 찾은 문서 아래의 하위 컬렉션 문서 경로
  async function collectSubtreePaths(tops, cgCache) {
    if (!tops.length) return [];
    const foundPaths = new Set(tops.map((d) => d.ref.path));
    const names = new Set(["attachments", "events", "logs"]);
    const sample = tops.slice(0, 25).map((d) => d.ref);
    const lists = await Promise.all(sample.map((r) => r.listCollections().catch(() => [])));
    lists.flat().forEach((c) => names.add(c.id));
    const underFound = (ref) => { for (let p = ref.parent.parent; p; p = p.parent.parent) { if (foundPaths.has(p.path)) return true; } return false; };
    const out = [];
    for (const name of names) {
      if (!cgCache.has(name)) {
        const lightSnap = await db.collectionGroup(name).select().get().catch(() => null);
        cgCache.set(name, (lightSnap?.docs || []).map((d) => d.ref));
      }
      cgCache.get(name).forEach((r) => { if (underFound(r)) out.push(r.path); });
    }
    return out;
  }

  async function resetPlanFor(company, { deleteAccounts, endContract }) {
    const { members, codes } = await getCompanyMembers(company);
    const skip = new Set([...RESET_SKIP_COLLECTIONS, ...(deleteAccounts ? [] : ["users", "transportApplications"]), ...(endContract ? ["companyPlans"] : [])]);
    const cols = (await db.listCollections()).map((c) => c.id).filter((id) => !skip.has(id));
    return { members, codes, uids: members.map((m) => m.uid), cols };
  }

  async function previewCompanyReset(company, { deleteAccounts, endContract }) {
    const plan = await resetPlanFor(company, { deleteAccounts, endContract });
    const perCollection = {};
    let total = 0, subDocs = 0;
    const cgCache = new Map();
    for (const col of plan.cols) {
      const tops = await collectInCollection(db.collection(col), { company, ...plan });
      if (!tops.length) continue;
      perCollection[col] = tops.length; total += tops.length;
      subDocs += (await collectSubtreePaths(tops, cgCache)).length;
    }
    return { total, subDocs, perCollection, accounts: plan.members.length, deleteAccounts, files: null };
  }

  // ── 상태 판단 ──
  const isUnfinished = (b) => !!b && (!b.cancelRequested || deleteStarted(b)) && (
    b.status === "saving" || (b.status === "kept" && (b.phase ? UNFINISHED_PHASES.has(b.phase) : false)));
  const deleteStarted = (b) => !!b && (b.deleteStarted || (b.deleteIdx || 0) > 0 || b.phase === "legacyDelete"
    || (b.status === "kept" && b.phase === "delete" && !b.manifestChunks) || b.phase === "done");

  async function findUnfinished(company, exceptId = "") {
    const snap = await backups().where("company", "==", company).get();
    const list = snap.docs.filter((d) => d.id !== exceptId && isUnfinished(d.data()));
    // 삭제가 시작된 작업(꼭 끝내야 함) → 가장 최근 작업 순
    list.sort((a, b) => (deleteStarted(b.data()) - deleteStarted(a.data())) || (tsMs(b.data().at) - tsMs(a.data().at)));
    return list[0] ? { id: list[0].id, ...list[0].data() } : null;
  }

  // 페이지로 나눠 하위 컬렉션 지우기 → done 여부
  async function wipeCollection(colRef, timeUp, lease, count = { n: 0 }) {
    for (;;) {
      if (timeUp()) return false;
      const snap = await colRef.orderBy("__name__").select().limit(400).get();
      if (snap.empty) return true;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      count.n += snap.size;
      lease?.touch();
    }
  }
  async function wipePrefix(prefix, timeUp, lease, count = { n: 0 }) {
    const bucket = getBucket();
    for (;;) {
      if (timeUp()) return false;
      const [files] = await withTimeout(bucket.getFiles({ prefix, maxResults: 500, autoPaginate: false }), "보관 파일 목록");
      if (!files.length) return true;
      for (const part of chunkArr(files, 20)) {
        await Promise.all(part.map((f) => f.delete({ ignoreNotFound: true }).then(() => { count.n += 1; }).catch((e) => { if (e?.code !== 404) throw e; })));
      }
      lease?.touch();
    }
  }

  const resultOf = (b, jobId) => ({
    ok: true, backupId: jobId, expiresAt: tsMs(b.expiresAt) || null, deletedDocs: b.topCount || 0, savedDocs: b.docCount || 0,
    deletedFiles: b.deletedFiles || b.fileCount || 0, deletedAccounts: b.disabledAccounts || 0, endContract: !!b.endContract,
    skippedDocs: b.skippedDocs || 0, skippedFiles: b.skippedFiles || 0,
  });

  // ══════════ 초기화 실행(이어하기) ══════════
  //  반환: { done, result } | { partial } | { redirect } | { busy } | { lost } | { cancelled }
  async function execute({ jobId, company, deleteAccounts = false, endContract = false, by = "", budgetMs = 45 * 60000 }) {
    const t0 = now();
    const timeUp = () => now() - t0 > budgetMs;
    const backupRef = backups().doc(jobId);
    let b = (await backupRef.get()).data() || null;
    if (b && b.company && b.company !== company) throw httpErr("작업ID와 운송사가 맞지 않습니다.", 400);
    if (b && ["purging", "purged"].includes(b.status)) throw httpErr("보관함을 영구 삭제한 작업이라 이어서 할 수 없습니다. 새로 초기화해 주세요.", 409);
    if (b && ((b.cancelRequested && !deleteStarted(b)) || ["cancelling", "cancelled"].includes(b.status))) return { cancelled: true };
    if (b && b.phase === "done") return { done: true, result: resultOf(b, jobId), perCollection: b.perCollection || {} };
    if (!b) {
      // 같은 회사의 끝나지 않은 작업이 있으면 새 보관함을 만들지 않고 그쪽을 이어서 한다
      const other = await findUnfinished(company, jobId);
      if (other) return { redirect: other.id, company, deleteAccounts: !!other.deleteAccounts, endContract: !!other.endContract };
    }
    const base = { action: "reset", company, by, endContract: !!(b ? b.endContract : endContract), backupId: jobId };
    const prog = makeProgress(jobId, base);
    const got = await acquire({ company, jobId, kind: "reset", by, base });
    if (!got.ok) {
      if (got.holder && got.holder !== jobId && got.kind === "reset") return { redirect: got.holder, company };
      return { busy: true, holder: got.holder, kind: got.kind };
    }
    const lease = got.lease;
    let step = "시작";
    let bulkOn = false;
    let worked = false;
    const saveB = async (patch) => { await lease.commit((tx) => { tx.set(backupRef, patch, { merge: true }); }, backupRef); b = { ...b, ...patch }; };
    const pauseNow = async (label) => {
      if (!worked || !timeUp()) return false;
      if (bulkOn) { await setBulkMode(company, false); bulkOn = false; }
      await prog.pause(`${label} — 이어서 진행`);
      return true;
    };
    try {
      await prog.set(1, got.prev ? "멈춘 작업을 이어받는 중" : "시작하는 중", true);
      b = (await backupRef.get()).data() || null; // 잠금을 잡은 뒤 다시 읽는다
      if (b && b.phase === "done") { const result = resultOf(b, jobId); await prog.done(result); return { done: true, result, perCollection: b.perCollection || {} }; }

      // ── 0단계: 계획 ──
      if (!b) {
        step = "준비";
        if (endContract) await markContractEnded(company, by, "계약종료 + 초기화");
        const plan = await resetPlanFor(company, { deleteAccounts, endContract });
        b = {
          company, by, at: FieldValue.serverTimestamp(), status: "saving", phase: "collect", engine: 2,
          deleteAccounts, endContract, cols: plan.cols, codes: plan.codes, uids: plan.uids,
          accountUids: deleteAccounts ? plan.uids : [], collectIdx: 0, manifestChunks: 0, copyIdx: 0, deleteIdx: 0,
          perCollection: {}, topCount: 0, totalPaths: 0, docCount: 0, fileCount: 0, bigDocs: 0, skippedDocs: 0, skippedFiles: 0,
        };
        await lease.commit((tx) => { tx.set(backupRef, b); });
        lease.touch();
      } else if (b.status === "saving" && (!b.phase || b.phase === "backup")) {
        // 예전 코드(e217be45 이전)가 남긴 끊긴 보관 — 아직 아무것도 지우지 않았다 → 부분 복사본을 지우고 새 방식으로 처음부터
        await saveB({ phase: "wipe", engine: 2 });
      } else if (b.status === "kept" && b.phase === "delete" && !b.manifestChunks) {
        // 예전 코드가 보관을 끝내고 삭제하다 끊긴 기록 — 보관본(docs/{번호}.path) 목록대로 이어서 지운다
        await saveB({ phase: "legacyDelete" });
      }
      if (b.endContract && b.phase !== "done") await markContractEnded(company, by, "계약종료 + 초기화").catch(() => {});

      if (b.phase === "wipe") {
        step = "예전 보관 정리";
        await prog.set(2, "끊긴 예전 보관 작업 정리 중", true);
        for (const sub of ["docs", "manifest", "skipped"]) {
          if (!(await wipeCollection(backupRef.collection(sub), () => worked && timeUp(), lease))) { await prog.pause("끊긴 예전 보관 작업 정리 중 — 이어서 진행"); return { partial: true }; }
          worked = true;
        }
        if (!(await wipePrefix(`resetBackups/${jobId}/`, () => worked && timeUp(), lease))) { await prog.pause("끊긴 예전 보관 파일 정리 중 — 이어서 진행"); return { partial: true }; }
        const plan = await resetPlanFor(company, { deleteAccounts: !!b.deleteAccounts, endContract: !!b.endContract });
        await saveB({ phase: "collect", cols: plan.cols, codes: plan.codes, uids: plan.uids, accountUids: b.deleteAccounts ? plan.uids : [],
          collectIdx: 0, manifestChunks: 0, copyIdx: 0, deleteIdx: 0, perCollection: {}, topCount: 0, totalPaths: 0, docCount: 0, fileCount: 0, bigDocs: 0, skippedDocs: 0, skippedFiles: 0 });
        worked = true;
      }

      // ── 1단계: 찾기 3~30% ──
      if (b.phase === "collect") {
        const cgCache = new Map();
        const ctx = { company, codes: b.codes || [], uids: b.uids || [] };
        for (let ci = b.collectIdx || 0; ci < b.cols.length; ci++) {
          if (await pauseNow(`데이터 찾는 중 ${ci}/${b.cols.length}`)) return { partial: true };
          lease.assert();
          const col = b.cols[ci];
          step = `데이터 찾기 · ${col}`;
          await prog.set(3 + (ci / b.cols.length) * 27, `데이터 찾는 중 · ${col} (${ci + 1}/${b.cols.length})`);
          const tops = await collectInCollection(db.collection(col), ctx, () => lease.touch());
          lease.touch();
          let chunkNo = b.manifestChunks || 0;
          const perCollection = { ...(b.perCollection || {}) };
          let added = 0;
          if (tops.length) {
            const sub = await collectSubtreePaths(tops, cgCache);
            const paths = [...tops.map((d) => d.ref.path), ...sub];
            added = paths.length;
            // manifest는 20개(8천 경로)씩 나눠 쓴다 — 한 번에 쓰면 500건·10MiB 한도를 넘을 수 있다
            for (const group of chunkArr(chunkArr(paths, RESET_CHUNK), 20)) {
              const batch = db.batch();
              group.forEach((ch) => { batch.set(backupRef.collection("manifest").doc(padN(chunkNo)), { col, paths: ch }); chunkNo += 1; });
              await batch.commit();
              lease.touch();
            }
            perCollection[col] = tops.length;
          }
          await saveB({ collectIdx: ci + 1, manifestChunks: chunkNo, perCollection, topCount: (b.topCount || 0) + tops.length, totalPaths: (b.totalPaths || 0) + added });
          worked = true;
        }
        await saveB({ phase: "copy" });
      }

      // ── 2단계: 보관 30~70% ──
      if (b.phase === "copy") {
        const bucket = getBucket();
        const total = b.totalPaths || b.manifestChunks * RESET_CHUNK;
        for (let i = b.copyIdx || 0; i < b.manifestChunks; i++) {
          if (await pauseNow(`보관함에 복사 중 ${(b.docCount || 0).toLocaleString()} / ${total.toLocaleString()}`)) return { partial: true };
          lease.assert();
          step = `보관 · 묶음 ${i + 1}/${b.manifestChunks}`;
          const r = await copyChunk({ i, b, backupRef, jobId, bucket, lease, prog, total });
          await saveB({
            copyIdx: i + 1, docCount: (b.docCount || 0) + r.copied, fileCount: (b.fileCount || 0) + r.files, bigDocs: (b.bigDocs || 0) + r.big,
            skippedDocs: (b.skippedDocs || 0) + r.skippedDocs, skippedFiles: (b.skippedFiles || 0) + r.skippedFiles,
          });
          await prog.ok();
          worked = true;
        }
        // 보관 확인 — 보관함 문서 수가 복사한 수보다 적으면 삭제로 넘어가지 않는다
        step = "보관 확인";
        await prog.set(70, "보관 확인 중", true);
        const saved = (await backupRef.collection("docs").count().get()).data().count;
        if (saved < (b.docCount || 0)) {
          const n = (b.verifyFails || 0) + 1;
          if (n >= 2) throw httpErr(`보관 확인 실패 — 보관함 ${saved}건 < 복사 ${b.docCount}건. 아무것도 지우지 않았습니다. [취소하고 정리] 후 다시 시작해 주세요.`, 409);
          await saveB({ verifyFails: n, copyIdx: 0, docCount: 0, fileCount: 0, bigDocs: 0, skippedDocs: 0, skippedFiles: 0 });
          throw new Error(`보관 확인 실패(${saved} < ${b.docCount}) — 보관을 처음부터 다시 합니다(아무것도 지우지 않았습니다).`);
        }
        await saveB({ status: "kept", phase: "delete", verifiedAt: FieldValue.serverTimestamp(), verifiedDocs: saved, expiresAt: new Date(now() + RESET_KEEP_DAYS * 86400000) });
        worked = true;
      }

      // ── 3단계: 삭제 70~96% (보관 확인이 끝난 목록만, 보관 못 한 문서·파일은 남김) ──
      if (b.phase === "delete" || b.phase === "legacyDelete") {
        if (b.phase === "delete" && !b.verifiedAt && b.engine === 2) throw httpErr("보관 확인이 끝나지 않아 삭제하지 않습니다.", 409);
        bulkOn = true;
        await setBulkMode(company, true);
        if (!b.deleteStarted) await saveB({ deleteStarted: true });
        const bucket = getBucket();
        if (b.phase === "delete") {
          for (let i = b.deleteIdx || 0; i < b.manifestChunks; i++) {
            if (await pauseNow(`데이터 삭제 중 ${i}/${b.manifestChunks}`)) return { partial: true };
            lease.assert();
            step = `삭제 · 묶음 ${i + 1}/${b.manifestChunks}`;
            await prog.set(70 + (i / Math.max(1, b.manifestChunks)) * 26, `데이터 삭제 중 · 묶음 ${i + 1} / ${b.manifestChunks}`);
            const m = (await backupRef.collection("manifest").doc(padN(i)).get()).data() || {};
            const skip = new Set(m.skipPaths || []);
            const targets = (m.paths || []).filter((p) => !skip.has(p));
            for (const part of chunkArr(targets, 400)) {
              await retry(() => { const batch = db.batch(); part.forEach((p) => batch.delete(db.doc(p))); return batch.commit(); }, "문서 삭제");
              lease.touch();
            }
            const fl = m.files || [];
            for (const part of chunkArr(fl, 20)) { await Promise.all(part.map((p) => withTimeout(bucket.file(p).delete({ ignoreNotFound: true }), "파일 삭제").catch(() => {}))); lease.touch(); }
            await saveB({ deleteIdx: i + 1 });
            worked = true;
            if (i % 10 === 9) await setBulkMode(company, true, { wait: false });
          }
        } else {
          // 예전 형식: 보관본 docs/{번호}.path 를 커서로 읽으며 지우고, 보관 파일 이름대로 원본 파일을 지운다
          let cursor = b.legacyDelCursor ? backupRef.collection("docs").doc(b.legacyDelCursor) : null;
          for (;;) {
            if (await pauseNow("데이터 삭제 중(예전 형식)")) return { partial: true };
            lease.assert();
            step = "삭제(예전 형식)";
            let q = backupRef.collection("docs").orderBy("__name__").select("path").limit(400);
            if (cursor) q = q.startAfter(cursor);
            const page = await q.get();
            if (page.empty) break;
            const targets = page.docs.map((d) => d.get("path")).filter(Boolean);
            await retry(() => { const batch = db.batch(); targets.forEach((p) => batch.delete(db.doc(p))); return batch.commit(); }, "문서 삭제");
            cursor = page.docs[page.docs.length - 1];
            await saveB({ legacyDelCursor: cursor.id, deleteIdx: (b.deleteIdx || 0) + 1 });
            await prog.set(70 + Math.min(1, ((b.deleteIdx || 0) * 400) / Math.max(1, b.docCount || 1)) * 20, `데이터 삭제 중 ${((b.deleteIdx || 0) * 400).toLocaleString()} / ${(b.docCount || 0).toLocaleString()}`);
            worked = true;
          }
          const prefix = `resetBackups/${jobId}/`;
          let pageToken;
          do {
            const [files, next] = await withTimeout(bucket.getFiles({ prefix, maxResults: 500, autoPaginate: false, pageToken }), "보관 파일 목록");
            for (const part of chunkArr(files.filter((f) => !f.name.startsWith(`${prefix}__docs/`)), 20)) {
              await Promise.all(part.map((f) => withTimeout(bucket.file(f.name.slice(prefix.length)).delete({ ignoreNotFound: true }), "파일 삭제").catch(() => {})));
            }
            lease.touch();
            pageToken = next?.pageToken;
          } while (pageToken);
        }
        let disabledAccounts = 0;
        if (b.deleteAccounts && getAuth) {
          step = "계정 사용 중지";
          await prog.set(96, "로그인 계정 사용 중지 중", true);
          for (const uid of b.accountUids || []) {
            await getAuth().updateUser(uid, { disabled: true }).then(() => { disabledAccounts += 1; }).catch(() => {});
            lease.touch();
          }
        }
        await setBulkMode(company, false); bulkOn = false;
        await bumpDataVersion(company);
        if (b.endContract) await markContractEnded(company, by, "계약종료 + 초기화");
        await saveB({ phase: "done", deletedFiles: b.fileCount || 0, disabledAccounts, finishedAt: FieldValue.serverTimestamp() });
        await db.collection("resetLogs").add({
          company, by, at: FieldValue.serverTimestamp(), deleteAccounts: !!b.deleteAccounts, endContract: !!b.endContract, backupId: jobId,
          deletedDocs: b.topCount || 0, savedDocs: b.docCount || 0, deletedFiles: b.fileCount || 0, disabledAccounts, perCollection: b.perCollection || {},
          skippedDocs: b.skippedDocs || 0, skippedFiles: b.skippedFiles || 0, action: b.endContract ? "endReset" : "reset",
        });
        log.log?.(`◇ 운송사 초기화${b.endContract ? "(계약종료)" : ""}: ${company} — 문서 ${b.topCount}(보관 ${b.docCount}, 건너뜀 ${b.skippedDocs || 0}), 파일 ${b.fileCount} (by ${by})`);
      }
      if (b.phase !== "done") throw new Error(`알 수 없는 단계(${b.phase}) — 아무것도 지우지 않았습니다.`);
      const result = resultOf(b, jobId);
      await prog.done(result);
      return { done: true, result, perCollection: b.perCollection || {} };
    } catch (e) {
      if (bulkOn) await setBulkMode(company, false).catch(() => {});
      if (e?.lostLease) return { lost: true };
      if (e?.cancelled) { await prog.mark({ status: "cancelled", step: "취소됨" }); return { cancelled: true }; }
      const fatal = !!(e.status && e.status >= 400 && e.status < 500);
      await prog.fail(e?.message || String(e), fatal, step);
      await backupRef.update({ lastError: e?.message || String(e), lastStep: step, lastErrorAt: FieldValue.serverTimestamp() }).catch(() => {});
      throw Object.assign(e, { step });
    } finally {
      await lease.release();
    }
  }

  // 묶음 하나 보관 — 반환 { copied, big, files, skippedDocs, skippedFiles }
  async function copyChunk({ i, b, backupRef, jobId, bucket, lease, prog, total }) {
    const mref = backupRef.collection("manifest").doc(padN(i));
    const m = (await retry(() => mref.get(), "목록 읽기")).data() || { paths: [] };
    const attempt = (m.copyAttempts || 0) + 1;
    await mref.set({ copyAttempts: attempt }, { merge: true });
    const giveUp = attempt >= RESET_POISON_ATTEMPTS; // 마지막 시도: 실패하는 것만 건너뛰고 나머지는 끝낸다
    const docsCol = backupRef.collection("docs");
    const paths = m.paths || [];
    const errors = [];   // { path, id, reason, file? }
    const okFiles = [];
    let copied = 0, big = 0, missing = 0;
    const fail = (x) => errors.push(x);
    const files = new Set();
    let pending = [], pendingBytes = 0;
    const bigList = [];

    const writeOne = async (x) => {
      try { await retry(() => docsCol.doc(x.id).set({ path: x.path, data: x.data }), `보관 ${x.path}`); copied += 1; } catch (e) {
        if (e?.code === 3 || e?.code === "INVALID_ARGUMENT") bigList.push(x); else fail({ id: x.id, path: x.path, reason: e?.message || String(e) });
      }
    };
    const flush = async () => {
      if (!pending.length) return;
      const list = pending; pending = []; pendingBytes = 0;
      try {
        await retry(() => { const wb = db.batch(); list.forEach((x) => wb.set(docsCol.doc(x.id), { path: x.path, data: x.data })); return wb.commit(); }, "보관 묶음");
        copied += list.length;
      } catch {
        for (const x of list) await writeOne(x); // 묶음이 안 되면 하나씩(크기 초과 문서는 Storage로)
      }
      lease.touch();
    };

    for (let g = 0; g < paths.length; g += RESET_READ_GROUP) {
      lease.assert();
      const group = paths.slice(g, g + RESET_READ_GROUP);
      let snaps;
      try { snaps = await retry(() => db.getAll(...group.map((p) => db.doc(p))), "문서 읽기"); } catch (e) {
        // 묶음 읽기가 안 되면 하나씩 읽어 문제 문서만 골라낸다
        snaps = [];
        for (const p of group) {
          try { snaps.push((await retry(() => db.doc(p).get(), `읽기 ${p}`))); } catch (e2) { snaps.push({ readError: e2, ref: { path: p } }); }
        }
      }
      for (let k = 0; k < snaps.length; k++) {
        const s = snaps[k];
        const path = group[k];
        const id = `${padN(i)}_${padN(g + k, 4)}`;
        if (s.readError) { fail({ id, path, reason: s.readError?.message || String(s.readError) }); continue; }
        if (!s.exists) { missing += 1; continue; }
        try {
          if (hooks.beforeCopyDoc) await hooks.beforeCopyDoc(path, { attempt });
          const data = s.data();
          collectStoragePaths(data, files);
          const bytes = approxDocBytes(data);
          const x = { id, path, data, bytes };
          if (bytes > RESET_BIG_DOC_BYTES || depthOf(data) > RESET_MAX_DEPTH) { bigList.push(x); continue; }
          if (pendingBytes + bytes > RESET_BATCH_BYTES || pending.length >= RESET_BATCH_OPS) await flush();
          pending.push(x); pendingBytes += bytes;
        } catch (e) { fail({ id, path, reason: e?.message || String(e) }); }
      }
      await flush();
      // 큰 문서는 그때그때 Storage로(메모리에 오래 들고 있지 않게)
      while (bigList.length) {
        const x = bigList.shift();
        try {
          const file = `resetBackups/${jobId}/__docs/${x.id}.json`;
          await retry(() => bucket.file(file).save(JSON.stringify(encodeFsValue(x.data)), { contentType: "application/json", resumable: false }), `큰 문서 ${x.path}`);
          await retry(() => docsCol.doc(x.id).set({ path: x.path, file, bytes: x.bytes }), `큰 문서 표시 ${x.path}`);
          copied += 1; big += 1;
        } catch (e) { fail({ id: x.id, path: x.path, reason: e?.message || String(e) }); }
        lease.touch();
      }
      await prog.set(30 + (((b.docCount || 0) + copied) / Math.max(1, total)) * 40,
        `보관함에 복사 중 ${((b.docCount || 0) + copied).toLocaleString()} / ${total.toLocaleString()} · 묶음 ${i + 1}/${b.manifestChunks}`);
    }

    // 첨부파일 보관(없는 파일 404는 건너뜀)
    const fileErrors = [];
    for (const part of chunkArr([...files], 20)) {
      lease.assert();
      await Promise.all(part.map(async (p) => {
        try { await retry(() => bucket.file(p).copy(bucket.file(`resetBackups/${jobId}/${p}`)), `파일 ${p}`); okFiles.push(p); } catch (e) {
          if (e?.code === 404) return;
          fileErrors.push({ file: p, reason: e?.message || String(e) });
        }
      }));
      lease.touch();
    }

    if ((errors.length || fileErrors.length) && !giveUp) {
      const ex = errors[0] ? `${errors[0].path}: ${errors[0].reason}` : `${fileErrors[0].file}: ${fileErrors[0].reason}`;
      await mref.set({ lastError: ex }, { merge: true }).catch(() => {});
      throw new Error(`보관 실패(문서 ${errors.length}건, 파일 ${fileErrors.length}개, ${attempt}/${RESET_POISON_ATTEMPTS}번째) — 예: ${ex}. 아무것도 지우지 않았습니다.`);
    }
    // 마지막 시도에도 안 되는 문서·파일: 기록하고 건너뜀(삭제도 안 함)
    if (errors.length) {
      for (const part of chunkArr(errors, 200)) {
        const wb = db.batch();
        part.forEach((x) => wb.set(backupRef.collection("skipped").doc(x.id), { path: x.path, reason: String(x.reason).slice(0, 1500), chunk: i, at: FieldValue.serverTimestamp() }));
        await wb.commit();
      }
    }
    if (fileErrors.length) {
      const wb = db.batch();
      fileErrors.slice(0, 400).forEach((x, n) => wb.set(backupRef.collection("skipped").doc(`${padN(i)}_f${padN(n, 4)}`), { file: x.file, reason: String(x.reason).slice(0, 1500), chunk: i, at: FieldValue.serverTimestamp() }));
      await wb.commit();
    }
    await mref.set({ files: okFiles, skipPaths: errors.map((x) => x.path), skipFiles: fileErrors.map((x) => x.file), copied, missing, lastError: FieldValue.delete() }, { merge: true });
    return { copied, big, files: okFiles.length, skippedDocs: errors.length, skippedFiles: fileErrors.length };
  }

  // ══════════ [취소하고 정리] — 삭제가 시작되기 전 작업만 ══════════
  //  보관함 복사본(docs·manifest·skipped)과 Storage resetBackups/{id}/ 만 지운다. 운영 데이터는 건드리지 않는다.
  //  반환: { done, docs, files } | { partial } | { busy }
  async function cancel({ backupId, by = "", budgetMs = 8 * 60000 }) {
    const t0 = now();
    const timeUp = () => now() - t0 > budgetMs;
    const ref = backups().doc(backupId);
    const b = (await ref.get()).data();
    if (!b) return { done: true, missing: true, docs: 0, files: 0 };
    if (b.status === "cancelled") return { done: true, docs: 0, files: 0 };
    if (b.status === "restoring" || b.status === "restored") throw httpErr("복원 중이거나 복원한 기록은 취소할 수 없어요.", 409);
    if (b.status === "purging" || b.status === "purged") throw httpErr("영구 삭제한 기록이에요. [이력 지우기]를 써 주세요.", 409);
    if (deleteStarted(b)) throw httpErr("이미 데이터 삭제가 시작된 작업이라 취소할 수 없어요. [이어서 진행]으로 끝내 주세요.", 409);
    // 돌고 있는 실행에 멈춤 요청 → 다음 저장 때 스스로 멈춘다(삭제가 그 사이 시작됐으면 요청하지 않는다)
    const asked = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() || {};
      if (deleteStarted(cur)) return false;
      tx.set(ref, { cancelRequested: true, cancelBy: by, cancelAskedAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    if (!asked) throw httpErr("이미 데이터 삭제가 시작된 작업이라 취소할 수 없어요. [이어서 진행]으로 끝내 주세요.", 409);
    const got = await acquire({ company: b.company, jobId: backupId, kind: "cancel", by, base: { action: "reset", company: b.company, backupId } });
    if (!got.ok) {
      if (got.holder === backupId) return { busy: true, holder: got.holder }; // 그 실행이 멈추면(최대 몇 초~임대 시간) 다시
      // 다른 작업이 회사 잠금을 갖고 있어도 이 보관함만 지우는 것은 충돌하지 않는다 — 잠금 없이 진행
    }
    const lease = got.ok ? got.lease : null;
    try {
      const fresh = (await ref.get()).data();
      if (deleteStarted(fresh)) throw httpErr("이미 데이터 삭제가 시작된 작업이라 취소할 수 없어요.", 409);
      if (fresh.status !== "cancelling") await ref.set({ status: "cancelling", cancelFrom: fresh.status || "", phaseBeforeCancel: fresh.phase || "" }, { merge: true });
      const count = { n: 0 }, fcount = { n: 0 };
      let worked = false;
      const tu = () => worked && timeUp();
      for (const sub of ["docs", "manifest", "skipped"]) {
        if (!(await wipeCollection(ref.collection(sub), tu, lease, count))) return { partial: true, docs: count.n, files: 0 };
        worked = true;
      }
      if (!(await wipePrefix(`resetBackups/${backupId}/`, tu, lease, fcount))) return { partial: true, docs: count.n, files: fcount.n };
      await ref.set({ status: "cancelled", phase: "cancelled", cancelledAt: FieldValue.serverTimestamp(), cancelledBy: by, expiresAt: FieldValue.delete() }, { merge: true });
      await jobs().doc(backupId).set({ status: "cancelled", step: "취소하고 정리함", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await db.collection("resetLogs").add({ company: b.company, by, at: FieldValue.serverTimestamp(), backupId, action: "cancel", removedDocs: count.n, removedFiles: fcount.n });
      return { done: true, docs: count.n, files: fcount.n };
    } finally {
      if (lease) await lease.release();
    }
  }

  // ── 보관함 목록에 "지금 돌고 있는지 / 멈췄는지" 붙이기 ──
  async function describe(list) {
    const lockSnap = await locks().get();
    const live = new Map();
    lockSnap.docs.forEach((d) => { const l = d.data(); if ((l.leaseUntil || 0) > now()) live.set(l.jobId, l); });
    const pendingOf = (x) => isUnfinished(x) || x.status === "cancelling" || (x.cancelRequested && x.status !== "cancelled");
    const pendingIds = list.filter(pendingOf).map((x) => x.id);
    const jobSnaps = pendingIds.length ? await db.getAll(...pendingIds.map((id) => jobs().doc(id))) : [];
    const jobMap = new Map(jobSnaps.map((s) => [s.id, s.data() || {}]));
    return list.map((x) => {
      if (!pendingOf(x)) return { ...x, unfinished: false };
      const j = jobMap.get(x.id) || {};
      const lastBeat = Math.max(tsMs(j.heartbeatAt), tsMs(j.updatedAt));
      const alive = live.has(x.id);
      const started = deleteStarted(x);
      return {
        ...x, unfinished: true, alive, lastBeat: lastBeat || null, jobStep: j.step || "", jobPct: j.pct || 0, jobStatus: j.status || "",
        cancelling: x.status === "cancelling" || (!!x.cancelRequested && !started),
        canResume: !alive && x.status !== "cancelling" && !(x.cancelRequested && !started), canCancel: !started, deleteStarted: started,
      };
    });
  }

  return {
    cfg, execute, cancel, describe, acquire, findUnfinished, isUnfinished, deleteStarted, makeProgress,
    getCompanyMembers, collectInCollection, collectSubtreePaths, resetPlanFor, previewCompanyReset,
    encodeFsValue, decodeFsValue, approxDocBytes, withTimeout, lockKey,
  };
}

module.exports = {
  makeResetJob, collectStoragePaths, depthOf, chunkArr, padN,
  RESET_KEEP_DAYS, RESET_LEGACY_COMPANY, RESET_SKIP_COLLECTIONS, RESET_COMPANY_FIELDS, RESET_UID_FIELDS, RESET_CHUNK, RESET_BIG_DOC_BYTES,
};
