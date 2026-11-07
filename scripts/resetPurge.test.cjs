// 2026-11-07 운송사 초기화 보관함 영구 삭제 · 이력 지우기 테스트(Firestore 에뮬레이터 + 가짜 Storage·Auth)
//  실행: java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8182 &
//        FIRESTORE_EMULATOR_HOST=127.0.0.1:8182 NODE_PATH=functions/node_modules node scripts/resetPurge.test.cjs
//  확인: 400개 넘는 보관함도 끊겼다 이어서 다 지움 · Storage 보관 파일 · 계정 삭제 · 이력(resetLogs·resetJobs·보관함 문서)
//        · 운영 데이터(orders, 다른 기능 resetLogs, 진행 중 작업)는 그대로 · 여러 번 불러도 같은 결과
const assert = require("node:assert/strict");
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("FIRESTORE_EMULATOR_HOST가 필요합니다"); process.exit(1); }
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { makeResetPurge } = require("../functions/resetPurge");

const PROJECT = "demo-reset-purge";
initializeApp({ projectId: PROJECT });
const db = getFirestore();

// 가짜 Storage
const files = new Set();
const bucket = {
  async getFiles({ prefix, maxResults }) {
    const list = [...files].filter((n) => n.startsWith(prefix)).slice(0, maxResults);
    return [list.map((name) => ({ name, delete: async () => { files.delete(name); } }))];
  },
};
// 가짜 Auth
const authUsers = new Set();
const auth = { async deleteUsers(uids) { let n = 0; uids.forEach((u) => { if (authUsers.delete(u)) n += 1; }); return { successCount: n, failureCount: uids.length - n }; } };

const P = makeResetPurge({ db, FieldValue, getBucket: () => bucket, getAuth: () => auth });

async function wipe() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  files.clear(); authUsers.clear();
}
async function count(col) { return (await db.collection(col).count().get()).data().count; }
async function seedBackup(id, { company, status = "kept", phase = "done", docs = 3, manifest = 1, nFiles = 2, accountUids = [] }) {
  const ref = db.collection("resetBackups").doc(id);
  await ref.set({ company, status, phase, at: Timestamp.now(), expiresAt: new Date(Date.now() + 7 * 86400000), accountUids, deleteAccounts: accountUids.length > 0, docCount: docs });
  for (let i = 0; i < docs; i += 400) {
    const b = db.batch();
    for (let k = i; k < Math.min(docs, i + 400); k++) b.set(ref.collection("docs").doc(String(k).padStart(6, "0")), { path: `orders/${company}_${k}`, data: { x: k } });
    await b.commit();
  }
  for (let i = 0; i < manifest; i++) await ref.collection("manifest").doc(String(i)).set({ paths: [] });
  for (let i = 0; i < nFiles; i++) files.add(`resetBackups/${id}/uploads/${company}/f${i}.jpg`);
  accountUids.forEach((u) => authUsers.add(u));
  await db.collection("resetJobs").doc(id).set({ action: "reset", company, status: "done", pct: 100 });
  await db.collection("resetLogs").add({ company, backupId: id, action: "reset", at: Timestamp.now() });
  return ref;
}

(async () => {
  await wipe();
  // 운영 데이터 · 다른 기능 기록(지우면 안 됨)
  await db.collection("orders").doc("live1").set({ companyName: "가나운송" });
  files.add("uploads/가나운송/live.jpg");
  await db.collection("resetLogs").doc("other").set({ kind: "purgeOrders", company: "가나운송", count: 3 });
  authUsers.add("liveUser");

  const big = await seedBackup("job_big", { company: "가나운송", docs: 950, manifest: 3, nFiles: 1200, accountUids: ["u1", "u2"] });
  await db.collection("resetJobs").doc("job_restore1").set({ action: "restore", backupId: "job_big", status: "done" });

  // 1) 지금 영구 삭제 — 매번 시간이 바로 끝나도(deadline) 묶음 하나씩은 하고 이어서 끝까지
  let calls = 0, sum = { docs: 0, files: 0, accounts: 0 };
  for (;;) {
    calls += 1;
    const r = await P.run({ mode: "purge", backupId: "job_big", by: "t@t", deadline: () => true });
    sum.docs += r.docs; sum.files += r.files; sum.accounts += r.accounts;
    if (r.done) break;
    assert.ok(calls < 50, "끝나지 않음");
    if (calls === 1) assert.equal((await big.get()).data().status, "purging", "도중에는 purging(복원 막힘)");
  }
  assert.ok(calls > 3, `여러 번에 나눠서 해야 함(${calls})`);
  assert.equal(sum.docs, 953); assert.equal(sum.files, 1200); assert.equal(sum.accounts, 2);
  const after = (await big.get()).data();
  assert.equal(after.status, "purged"); assert.equal(after.purgeManual, true); assert.equal(after.purgeFrom, "kept");
  assert.equal((await big.collection("docs").count().get()).data().count, 0);
  assert.equal([...files].filter((f) => f.startsWith("resetBackups/job_big/")).length, 0);
  assert.ok(!authUsers.has("u1") && authUsers.has("liveUser"));
  assert.equal(await count("resetLogs"), 2, "보관함 비우기는 이력을 남긴다");
  console.log(`  ✓ 큰 보관함 영구 삭제(${calls}번에 나눠서) 문서 ${sum.docs} · 파일 ${sum.files} · 계정 ${sum.accounts}`);

  // 2) 같은 요청 다시 → 0개, 그대로
  const again = await P.run({ mode: "purge", backupId: "job_big", by: "t@t" });
  assert.equal(again.done, true); assert.equal(again.docs + again.files + again.accounts, 0);
  console.log("  ✓ 다시 불러도 안전(0개)");

  // 3) 이력 지우기(하나) — 보관함 문서 · resetLogs(backupId) · resetJobs(초기화·복원)
  const h = await P.run({ mode: "history", backupId: "job_big", by: "t@t" });
  assert.equal(h.done, true); assert.equal(h.history, 1); assert.equal(h.logs, 1); assert.equal(h.jobs, 2);
  assert.equal((await big.get()).exists, false);
  assert.equal((await db.doc("resetLogs/other").get()).exists, true, "다른 기능 기록은 남김");
  const h2 = await P.run({ mode: "history", backupId: "job_big", by: "t@t" });
  assert.equal(h2.done, true); assert.equal(h2.history + h2.logs + h2.jobs, 0);
  console.log("  ✓ 이력 지우기(하나) + 다시 불러도 안전");

  // 4) 복원 중 · 진행 중 작업은 건너뜀, 나머지 모두 비우기 → 모두 이력 지우기
  await seedBackup("job_a", { company: "다라물류", docs: 5 });
  await seedBackup("job_b", { company: "마바운송", status: "restored", docs: 2, accountUids: ["u9"] });
  await seedBackup("job_busy", { company: "사아운송", status: "restoring", docs: 2 });
  await seedBackup("job_run", { company: "자차운송", status: "kept", phase: "delete", docs: 2 });
  await db.doc("resetJobs/job_run").set({ status: "running", heartbeatAt: Timestamp.now() }, { merge: true });
  await db.collection("resetLogs").add({ company: "옛날운송", at: Timestamp.now(), deletedDocs: 3 }); // 예전 형식(action 없음)
  await db.collection("resetJobs").doc("job_orphan").set({ action: "restore", status: "done" });
  const all = await P.run({ mode: "purge", all: true, by: "t@t" });
  assert.equal(all.done, true); assert.equal(all.backups, 2);
  assert.deepEqual(all.skipped.map((s) => s.id).sort(), ["job_busy", "job_run"]);
  assert.equal(authUsers.has("u9"), true, "복원된 초기화의 계정은 지우지 않음");
  assert.equal((await db.doc("resetBackups/job_busy").get()).data().status, "restoring");
  assert.equal((await db.collection("resetBackups/job_run/docs").count().get()).data().count, 2);
  console.log("  ✓ 보관함 모두 비우기(복원 중 · 진행 중 건너뜀)");

  const allH = await P.run({ mode: "history", all: true, by: "t@t" });
  assert.equal(allH.done, true);
  const left = (await db.collection("resetBackups").get()).docs.map((d) => d.id).sort();
  assert.deepEqual(left, ["job_busy", "job_run"]);
  const leftLogs = (await db.collection("resetLogs").get()).docs.map((d) => d.data());
  assert.deepEqual(leftLogs.map((x) => x.kind || x.backupId).sort(), ["job_busy", "job_run", "purgeOrders"]);
  const leftJobs = (await db.collection("resetJobs").get()).docs.map((d) => d.id).sort();
  assert.deepEqual(leftJobs, ["job_busy", "job_run"]);
  console.log("  ✓ 이력 모두 지우기(예전 기록 포함, 진행 중 · 다른 기능 기록은 남김)");

  // 5) 운영 데이터는 그대로
  assert.equal((await db.doc("orders/live1").get()).exists, true);
  assert.ok(files.has("uploads/가나운송/live.jpg"));
  console.log("  ✓ 운영 데이터(orders · 원본 첨부파일 · 계정) 그대로");

  // 6) 자동 비우기(만료)
  await wipe();
  const ex = await seedBackup("job_old", { company: "차카운송", docs: 410, nFiles: 3, accountUids: ["u5"] });
  await ex.set({ expiresAt: new Date(Date.now() - 1000) }, { merge: true });
  await seedBackup("job_new", { company: "타파운송", docs: 1 });
  const e1 = await P.purgeExpired();
  assert.equal(e1.purged, 1);
  assert.equal((await ex.get()).data().status, "purged");
  assert.equal((await ex.collection("docs").count().get()).data().count, 0);
  assert.equal(authUsers.has("u5"), false);
  assert.equal((await db.doc("resetBackups/job_new").get()).data().status, "kept");
  console.log("  ✓ 7일 지난 보관함 자동 비우기");
  console.log("모두 통과");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
