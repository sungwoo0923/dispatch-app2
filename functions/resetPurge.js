// ======================= functions/resetPurge.js =======================
// 2026-11-07 운송사 초기화 보관함 · 이력 영구 삭제
//  - purgeBackup: 보관함 하나 비우기(resetBackups/{id}/docs, manifest 하위 문서 + Storage resetBackups/{id}/ 파일
//    + 계정까지 지운 초기화였고 복원 안 했으면 사용 중지해 둔 로그인 계정). 보관함 문서 자체는 status "purged"로 남는다(이력).
//  - clearHistory: 위 비우기 + 보관함 문서 + 그 초기화의 resetLogs(backupId 일치) + resetJobs(초기화·복원 진행 기록) 삭제
//  - 400개씩 묶어서 지우고, 시간(deadline)이 다 되면 { done:false }로 멈춘다 → 다시 부르면 남은 것부터 이어서(같은 요청을 여러 번 해도 안전)
//  - 운영 중인 회사 데이터(orders 등)는 건드리지 않는다. 보관함·이력 컬렉션만 지운다.
//  index.js가 db·FieldValue·Storage·Auth를 넣어 만든다(테스트는 에뮬레이터 + 가짜 Storage·Auth).

const BATCH = 400;
const JOB_ALIVE_MS = 90000; // resetJobs 신호(heartbeatAt)가 이 안에 있으면 "지금 돌고 있는 작업"
const RESET_LOG_ACTIONS = new Set(["reset", "endReset", "restore"]);

function makeResetPurge({ db, FieldValue, getBucket, getAuth, now = () => Date.now() }) {
  const backups = () => db.collection("resetBackups");
  const jobs = () => db.collection("resetJobs");
  const logs = () => db.collection("resetLogs");
  const tsMs = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : 0);
  const jobAlive = (j) => !!j && j.status === "running" && now() - tsMs(j.heartbeatAt) < JOB_ALIVE_MS;

  // 지울 수 없는 상태면 이유(한국어)를, 지워도 되면 ""를 돌려준다
  async function blockReason(id, b) {
    if (b.status === "restoring") return "복원하는 중이라 지금은 지울 수 없어요.";
    if (b.status === "kept" && b.phase && b.phase !== "done") return "초기화가 아직 끝나지 않아 지금은 지울 수 없어요.";
    const j = (await jobs().doc(id).get()).data();
    if (jobAlive(j)) return "작업이 진행 중이라 지금은 지울 수 없어요.";
    return "";
  }

  // 쿼리에 걸리는 문서를 400개씩 지운다 → { deleted, done }
  async function deleteQuery(query, deadline, filter = null) {
    let deleted = 0, worked = false, cursor = null;
    for (;;) {
      if (worked && deadline()) return { deleted, done: false };
      let q = query.orderBy("__name__").limit(BATCH);
      if (filter && cursor) q = q.startAfter(cursor); // 거르는 경우 남기는 문서를 다시 읽지 않게
      const snap = await q.get();
      if (snap.empty) return { deleted, done: true };
      const targets = filter ? snap.docs.filter(filter) : snap.docs;
      if (targets.length) {
        const batch = db.batch();
        targets.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += targets.length;
      }
      worked = true;
      if (filter) { cursor = snap.docs[snap.docs.length - 1]; if (snap.size < BATCH) return { deleted, done: true }; }
    }
  }

  // Storage 경로 아래 파일을 500개씩 지운다 → { deleted, done }
  async function deletePrefix(prefix, deadline) {
    const bucket = getBucket();
    let deleted = 0, worked = false;
    for (;;) {
      if (worked && deadline()) return { deleted, done: false };
      const [files] = await bucket.getFiles({ prefix, maxResults: 500, autoPaginate: false });
      if (!files.length) return { deleted, done: true };
      for (let i = 0; i < files.length; i += 20) {
        await Promise.all(files.slice(i, i + 20).map((f) => f.delete({ ignoreNotFound: true }).then(() => { deleted += 1; }).catch((e) => {
          if (e?.code === 404) return;
          throw e;
        })));
      }
      worked = true;
    }
  }

  // 보관함 하나 비우기. 반환: { done, skipped?, docs, files, accounts }
  async function purgeBackup(ref, { deadline = () => false, by = "", manual = false } = {}) {
    const out = { done: false, docs: 0, files: 0, accounts: 0 };
    const snap = await ref.get();
    if (!snap.exists) return { ...out, done: true, missing: true };
    let b = snap.data();
    if (b.status !== "purging" && b.status !== "purged") {
      const why = await blockReason(ref.id, b);
      if (why) return { ...out, done: true, skipped: why };
      await ref.set({
        status: "purging", purgeFrom: b.status || "", purgeStartedAt: FieldValue.serverTimestamp(),
        purgedBy: by || (manual ? "" : "자동(보관 기간 만료)"), purgeManual: !!manual,
      }, { merge: true });
      b = { ...b, status: "purging", purgeFrom: b.status || "" };
    }
    for (const sub of ["docs", "manifest"]) {
      const r = await deleteQuery(ref.collection(sub), deadline);
      out.docs += r.deleted;
      if (!r.done) return out;
    }
    const f = await deletePrefix(`resetBackups/${ref.id}/`, deadline);
    out.files += f.deleted;
    if (!f.done) return out;
    // 계정까지 지운 초기화(보관 중, 복원 안 함)였다면 사용 중지해 둔 로그인 계정도 지운다 — 기존 자동 비우기와 같은 규칙
    if (b.purgeFrom === "kept" && !b.accountsPurged && Array.isArray(b.accountUids) && b.accountUids.length) {
      for (let i = 0; i < b.accountUids.length; i += 1000) {
        const r = await getAuth().deleteUsers(b.accountUids.slice(i, i + 1000)).catch(() => null);
        if (r) out.accounts += r.successCount || 0;
      }
      await ref.set({ accountsPurged: true }, { merge: true });
    }
    if (b.status !== "purged") await ref.set({ status: "purged", purgedAt: FieldValue.serverTimestamp() }, { merge: true });
    out.done = true;
    return out;
  }

  // 초기화 하나의 이력까지 지우기(보관함 비우기 포함). 반환: { done, skipped?, docs, files, accounts, logs, jobs, history }
  async function clearOne(id, { deadline = () => false, by = "" } = {}) {
    const ref = backups().doc(id);
    const p = await purgeBackup(ref, { deadline, by, manual: true });
    const out = { ...p, logs: 0, jobs: 0, history: 0, done: false };
    if (p.skipped) return { ...out, done: true };
    if (!p.done) return out;
    const l = await deleteQuery(logs().where("backupId", "==", id), deadline);
    out.logs += l.deleted;
    if (!l.done) return out;
    const j = await deleteQuery(jobs().where("backupId", "==", id), deadline, (d) => !jobAlive(d.data()));
    out.jobs += j.deleted;
    if (!j.done) return out;
    const own = await jobs().doc(id).get();
    if (own.exists && !jobAlive(own.data())) { await own.ref.delete(); out.jobs += 1; }
    if (!p.missing) { await ref.delete(); out.history += 1; }
    out.done = true;
    return out;
  }

  const add = (t, r) => { ["docs", "files", "accounts", "logs", "jobs", "history"].forEach((k) => { t[k] = (t[k] || 0) + (r[k] || 0); }); };

  // 요청 처리 — mode: "purge"(보관함만 비우기) | "history"(이력까지) · backupId 하나 또는 all
  async function run({ mode, backupId, all, by, deadline = () => false }) {
    const total = { done: false, backups: 0, docs: 0, files: 0, accounts: 0, logs: 0, jobs: 0, history: 0, skipped: [] };
    const ids = [];
    if (all) {
      const snap = await backups().select("company", "status").get();
      snap.docs.forEach((d) => ids.push([d.id, d.data().company || "", d.data().status]));
    } else {
      ids.push([String(backupId), "", ""]);
    }
    for (const [id, company, status] of ids) {
      if (deadline() && (total.backups || total.docs || total.logs)) return total;
      if (mode === "purge") {
        if (all && status === "purged") continue;
        const r = await purgeBackup(backups().doc(id), { deadline, by, manual: true });
        add(total, r);
        if (r.skipped) { total.skipped.push({ id, company, reason: r.skipped }); continue; }
        if (!r.done) return total;
        if (!r.missing) total.backups += 1;
      } else {
        const r = await clearOne(id, { deadline, by });
        add(total, r);
        if (r.skipped) { total.skipped.push({ id, company, reason: r.skipped }); continue; }
        if (!r.done) return total;
        if (!r.missing) total.backups += 1;
      }
    }
    if (all && mode === "history") {
      // 보관함과 이어지지 않는 예전 초기화 기록도 지운다. kind가 있는 다른 기능 기록(오더 일괄삭제 purgeOrders 등)과
      // 아직 지우지 못한(진행 중) 초기화의 기록은 남긴다.
      const keep = new Set(total.skipped.map((s) => s.id));
      const l = await deleteQuery(logs(), deadline, (d) => {
        const x = d.data();
        if (x.kind) return false;
        if (x.backupId && keep.has(x.backupId)) return false;
        return !x.action || RESET_LOG_ACTIONS.has(x.action);
      });
      total.logs += l.deleted;
      if (!l.done) return total;
      const j = await deleteQuery(jobs(), deadline, (d) => !keep.has(d.id) && !keep.has(d.data().backupId) && !jobAlive(d.data()));
      total.jobs += j.deleted;
      if (!j.done) return total;
    }
    total.done = true;
    return total;
  }

  // 매일 자동 비우기 — 보관 기간이 지난 보관함
  async function purgeExpired({ deadline = () => false } = {}) {
    const snap = await backups().where("expiresAt", "<=", new Date(now())).get();
    let purged = 0, pending = 0;
    for (const d of snap.docs) {
      if (d.data().status === "purged") continue;
      if (deadline()) { pending += 1; continue; }
      const r = await purgeBackup(d.ref, { deadline }).catch((e) => { console.warn("보관함 비우기 실패", d.id, e?.message); return null; });
      if (r?.done && !r.skipped) purged += 1; else pending += 1;
    }
    return { checked: snap.size, purged, pending };
  }

  return { purgeBackup, clearOne, run, purgeExpired, blockReason };
}

module.exports = { makeResetPurge, RESET_PURGE_BATCH: BATCH };
