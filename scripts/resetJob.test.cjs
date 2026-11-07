// 2026-11-07 운송사 초기화(보관 단계 멈춤) 테스트 — Firestore 에뮬레이터 + 폴더에 저장하는 가짜 Storage
//  실행: java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8183 &
//        FIRESTORE_EMULATOR_HOST=127.0.0.1:8183 KP_RESET_BUDGET_MS=4000 NODE_PATH=functions/node_modules node scripts/resetJob.test.cjs
//  확인: ① 4만 건 + 큰 문서(>700KB) + 깊은 문서 + 독 문서·독 파일 — 끊어서(4초씩) 이어가며 끝까지, 독 문서·파일은 건너뛰고 지우지 않음
//        ② 동시에 두 번 시작 → 보관함은 하나, 나중 것은 앞 작업으로 돌려보냄
//        ③ 실행 도중 프로세스를 강제로 죽임(SIGKILL) → 임대가 끝나면 다음 호출이 남은 묶음부터 이어서
//        ④ 일이 멈춘(await가 안 끝나는) 실행 → 임대 연장을 멈춰 다른 실행이 이어받고, 늦게 깨어난 옛 실행은 아무것도 못 씀(펜싱)
//        ⑤ 예전 코드가 남긴 "처리 중" 보관함 — [취소하고 정리]는 복사본만 지우고, 새로 시작하면 남은 작업을 이어서 함
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { fork } = require("node:child_process");
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("FIRESTORE_EMULATOR_HOST가 필요합니다"); process.exit(1); }
process.env.KP_RESET_LEASE_MS ||= "3000";
process.env.KP_RESET_STUCK_MS ||= "2500";
process.env.KP_RESET_HB_MS ||= "400";
const BUDGET = Number(process.env.KP_RESET_BUDGET_MS) || 4000;
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp, GeoPoint } = require("firebase-admin/firestore");
const { makeResetJob } = require("../functions/resetJob");

const PROJECT = "demo-reset-job";
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const STORE = process.env.KP_TEST_STORE || fs.mkdtempSync(path.join(os.tmpdir(), "kp-reset-store-"));

// 가짜 Storage(폴더) — 프로세스를 죽여도 남는다
const enc = (n) => path.join(STORE, encodeURIComponent(n));
const POISON_FILES = new Set(["uploads/가나운송/poison.jpg"]);
const mkFile = (name) => ({
  name,
  async copy(dest) {
    if (POISON_FILES.has(name)) throw Object.assign(new Error("가짜 Storage 500"), { code: 500 });
    if (!fs.existsSync(enc(name))) throw Object.assign(new Error("No such object"), { code: 404 });
    fs.copyFileSync(enc(name), enc(dest.name));
  },
  async save(data) { fs.writeFileSync(enc(name), data); },
  async download() { return [fs.readFileSync(enc(name))]; },
  async delete(opt = {}) {
    if (!fs.existsSync(enc(name))) { if (opt.ignoreNotFound) return; throw Object.assign(new Error("No such object"), { code: 404 }); }
    fs.unlinkSync(enc(name));
  },
});
const bucket = {
  file: mkFile,
  async getFiles({ prefix, maxResults = 1e9, pageToken }) {
    const all = fs.readdirSync(STORE).map((f) => decodeURIComponent(f)).filter((n) => n.startsWith(prefix)).sort();
    const start = pageToken ? Number(pageToken) : 0;
    const list = all.slice(start, start + maxResults);
    return [list.map(mkFile), start + maxResults < all.length ? { pageToken: String(start + maxResults) } : null];
  },
};
const hasFile = (n) => fs.existsSync(enc(n));
const makeEngine = (hooks = {}) => makeResetJob({ db, FieldValue, Timestamp, GeoPoint, getBucket: () => bucket, hooks, log: { log() {} } });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const count = async (q) => (await q.count().get()).data().count;

async function seed(col, company, n, extra = () => ({})) {
  for (let i = 0; i < n; i += 500) {
    const b = db.batch();
    for (let k = i; k < Math.min(n, i + 500); k++) b.set(db.collection(col).doc(`${company}_${k}`), { companyName: company, n: k, memo: "x".repeat(200), ...extra(k) });
    await b.commit();
  }
}

// 화면처럼 부르기 — partial이면 바로, busy면 잠깐 뒤, redirect면 그 작업으로, 오류면 다시(최대 N번)
async function drive(engine, args, { maxErrors = 12, onCall = () => {} } = {}) {
  let a = { ...args };
  const seen = { calls: 0, partial: 0, busy: 0, redirect: [], errors: [] };
  for (;;) {
    seen.calls += 1; onCall(seen);
    let r;
    try { r = await engine.execute({ ...a, budgetMs: BUDGET }); } catch (e) {
      seen.errors.push(e.message);
      if (e.status && e.status < 500) throw e;
      if (seen.errors.length > maxErrors) throw e;
      await sleep(200); continue;
    }
    if (r.done) return { ...seen, result: r.result, jobId: a.jobId };
    if (r.partial) { seen.partial += 1; continue; }
    if (r.redirect) { seen.redirect.push(r.redirect); a = { ...a, jobId: r.redirect }; continue; }
    if (r.cancelled) return { ...seen, cancelled: true, jobId: a.jobId };
    seen.busy += 1; await sleep(400);
  }
}

async function wipe() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  fs.readdirSync(STORE).forEach((f) => fs.unlinkSync(path.join(STORE, f)));
}

// ── 자식 프로세스(③): 그냥 실행하다가 부모가 죽인다 ──
if (process.argv[2] === "child") {
  (async () => {
    const e = makeEngine({ beforeCopyDoc: async () => { await sleep(1); } }); // 조금 느리게(죽일 틈)
    await e.execute({ jobId: process.argv[3], company: process.argv[4], by: "child", budgetMs: 10 * 60000 });
    process.exit(0);
  })().catch(() => process.exit(1));
  return;
}

(async () => {
  const T = Date.now();
  await wipe();

  // ═════ ①② 4만 건 + 큰 문서 + 깊은 문서 + 독 문서·파일, 동시에 두 번 시작 ═════
  const CO = "가나운송";
  const N = 40000;
  await seed("orders", CO, N, (k) => (k < 200 ? { photo: `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${encodeURIComponent(`uploads/${CO}/f${k}.jpg`)}?alt=media` } : {}));
  for (let k = 0; k < 200; k++) fs.writeFileSync(enc(`uploads/${CO}/f${k}.jpg`), `img${k}`);
  fs.writeFileSync(enc(`uploads/${CO}/poison.jpg`), "poison");
  const bigStr = "가".repeat(300000); // UTF-8 900KB — {path,data}로 감싸면 1MiB 한도에 걸릴 수 있는 크기
  await db.doc("orders/big").set({ companyName: CO, blob: bigStr, at: Timestamp.fromMillis(1700000000000), geo: new GeoPoint(37.5, 127) });
  let deep = { leaf: "끝" }; for (let d = 0; d < 18; d++) deep = { d: deep }; // 19단계 — 감싸면 20단계를 넘는다
  await db.doc("orders/deep").set({ companyName: CO, deep });
  await db.doc("orders/poison").set({ companyName: CO, bad: true });
  await db.doc("orders/withPoisonFile").set({ companyName: CO, photo: `gs://demo.appspot.com/uploads/${CO}/poison.jpg` });
  await db.doc("orders/sub_parent").set({ companyName: CO });
  await db.doc("orders/sub_parent/attachments/a1").set({ name: "첨부" });
  await seed("orders", "다른운송", 100);
  const TOTAL = N + 5 + 1; // + big, deep, poison, withPoisonFile, sub_parent + attachments/a1
  console.log(`  · 준비 ${TOTAL.toLocaleString()}건 (${((Date.now() - T) / 1000).toFixed(1)}초)`);

  let poisonTries = 0;
  const eng = makeEngine({ beforeCopyDoc: async (p) => { if (p === "orders/poison") { poisonTries += 1; throw new Error("가짜 독 문서 — 읽을 때마다 실패"); } } });
  const t1 = Date.now();
  // 동시에 두 번 시작(서로 다른 작업ID — 예전에는 보관함이 두 개 생겼다)
  let midStart = null;
  const [ra, rb] = await Promise.all([
    drive(eng, { jobId: "job_A", company: CO, by: "a@t" }, { onCall: (s) => { if (s.calls === 4 && !midStart) midStart = eng.execute({ jobId: "job_C", company: CO, by: "c@t", budgetMs: BUDGET }); } }),
    drive(eng, { jobId: "job_B", company: CO, by: "b@t" }),
  ]);
  const midR = await midStart;
  const sec = ((Date.now() - t1) / 1000).toFixed(1);
  assert.equal(ra.jobId, rb.jobId, "두 시작이 같은 작업으로 모여야 함");
  const JOB = ra.jobId;
  const allBk = (await db.collection("resetBackups").where("company", "==", CO).get()).docs.map((d) => d.id);
  assert.deepEqual(allBk, [JOB], "보관함은 하나만");
  assert.ok(midR.redirect === JOB || midR.busy, "도중에 새로 시작해도 같은 작업으로");
  console.log(`  ✓ 동시에 두 번 + 도중에 한 번 더 시작 → 보관함 1개(${JOB}), 나머지는 돌려보냄(redirect ${[...ra.redirect, ...rb.redirect, midR.redirect].filter(Boolean).length}회)`);
  const bk = (await db.doc(`resetBackups/${JOB}`).get()).data();
  assert.equal(bk.phase, "done");
  assert.equal(bk.status, "kept");
  assert.ok(bk.verifiedAt, "보관 확인 뒤에만 삭제");
  assert.equal(bk.totalPaths, TOTAL);
  assert.equal(bk.skippedDocs, 1);
  assert.equal(bk.skippedFiles, 1);
  assert.equal(bk.docCount, TOTAL - 1);
  assert.equal(await count(db.collection(`resetBackups/${JOB}/docs`)), TOTAL - 1);
  assert.ok(bk.bigDocs >= 2, `큰·깊은 문서 Storage 보관 (${bk.bigDocs})`);
  assert.ok(ra.partial + rb.partial >= 3, `시간 예산(${BUDGET}ms)마다 끊고 이어감 — partial ${ra.partial + rb.partial}회`);
  assert.equal(poisonTries, 3, "독 문서는 3번 해 보고 건너뜀");
  console.log(`  ✓ ${TOTAL.toLocaleString()}건 보관·삭제 완료 ${sec}초 · 호출 ${ra.calls + rb.calls}회(partial ${ra.partial + rb.partial}, 오류 후 재시도 ${ra.errors.length + rb.errors.length}) · 큰 문서 ${bk.bigDocs}`);
  // 운영 데이터: 이 회사 것은 독 문서만 남고, 다른 회사 것은 그대로
  const left = (await db.collection("orders").where("companyName", "==", CO).get()).docs.map((d) => d.id);
  assert.deepEqual(left, ["poison"], "보관 못 한 독 문서는 지우지 않는다");
  assert.equal(await count(db.collection("orders").where("companyName", "==", "다른운송")), 100);
  assert.equal((await db.doc("orders/sub_parent/attachments/a1").get()).exists, false, "하위 컬렉션도 삭제");
  const sk = (await db.collection(`resetBackups/${JOB}/skipped`).get()).docs.map((d) => d.data());
  assert.ok(sk.some((x) => x.path === "orders/poison") && sk.some((x) => x.file === `uploads/${CO}/poison.jpg`));
  assert.ok(hasFile(`uploads/${CO}/poison.jpg`), "보관 못 한 파일은 지우지 않는다");
  assert.ok(!hasFile(`uploads/${CO}/f5.jpg`) && hasFile(`resetBackups/${JOB}/uploads/${CO}/f5.jpg`), "첨부파일은 보관 후 삭제");
  console.log("  ✓ 독 문서·독 파일: 3번 시도 후 skipped에 기록, 원본은 남김 · 다른 회사 데이터 그대로");
  // 큰 문서 JSON → 원래 값으로
  const bigRow = (await db.collection(`resetBackups/${JOB}/docs`).where("path", "==", "orders/big").get()).docs[0].data();
  assert.ok(bigRow.file);
  const back = eng.decodeFsValue(JSON.parse(fs.readFileSync(enc(bigRow.file), "utf8")));
  assert.equal(back.blob.length, bigStr.length);
  assert.equal(back.at.toMillis(), 1700000000000);
  assert.equal(back.geo.latitude, 37.5);
  const deepRow = (await db.collection(`resetBackups/${JOB}/docs`).where("path", "==", "orders/deep").get()).docs[0].data();
  assert.ok(deepRow.file, "깊은 문서도 Storage JSON");
  assert.equal((await db.collection("resetLocks").get()).size, 0, "끝나면 잠금 해제");
  console.log("  ✓ 큰 문서(900KB)·깊은 문서는 Storage JSON — 날짜·위치 그대로 되살아남 · 잠금 해제");

  // ═════ ③ 실행 중 강제 종료(SIGKILL) → 이어서 ═════
  await wipe();
  const CO2 = "다라운송";
  await seed("orders", CO2, 6000);
  const child = fork(__filename, ["child", "job_K", CO2], { env: { ...process.env, KP_TEST_STORE: STORE }, stdio: "ignore" });
  for (let w = 0; ; w++) {
    await sleep(100);
    const d = (await db.doc("resetBackups/job_K").get()).data();
    if (d && d.phase === "copy" && (d.copyIdx || 0) >= 3) break;
    if (w > 600) throw new Error("자식 실행이 복사 단계에 가지 않음");
  }
  child.kill("SIGKILL");
  await new Promise((ok) => child.once("exit", ok));
  const atKill = (await db.doc("resetBackups/job_K").get()).data();
  const eng2 = makeEngine();
  const r0 = await eng2.execute({ jobId: "job_K", company: CO2, by: "t", budgetMs: BUDGET });
  assert.ok(r0.busy, "죽은 실행의 임대가 남아 있는 동안은 기다림");
  const rk = await drive(eng2, { jobId: "job_K", company: CO2, by: "t" });
  const bkK = (await db.doc("resetBackups/job_K").get()).data();
  assert.equal(bkK.phase, "done");
  assert.equal(bkK.docCount, 6000);
  assert.equal(await count(db.collection("resetBackups/job_K/docs")), 6000);
  assert.equal(await count(db.collection("orders").where("companyName", "==", CO2)), 0);
  assert.ok(rk.result.savedDocs === 6000);
  console.log(`  ✓ 복사 묶음 ${atKill.copyIdx}/${atKill.manifestChunks}에서 강제 종료 → 임대 끝난 뒤 이어서 끝까지(보관 6,000 = 원본 6,000, 호출 ${rk.calls}회)`);

  // ═════ ④ 멈춘 실행(await가 안 끝남) → 다른 실행이 이어받음 · 옛 실행은 펜싱 ═════
  await wipe();
  const CO3 = "마바운송";
  await seed("orders", CO3, 2000);
  let release; let hung = false;
  const hangGate = new Promise((ok) => { release = ok; });
  const engA = makeEngine({ beforeCopyDoc: async (p) => { if (p === `orders/${CO3}_900` && !hung) { hung = true; await hangGate; } } });
  const pA = engA.execute({ jobId: "job_H", company: CO3, by: "A", budgetMs: 10 * 60000 });
  while (!hung) await sleep(50);
  const tHang = Date.now();
  const engB = makeEngine();
  const rB = await drive(engB, { jobId: "job_H", company: CO3, by: "B" });
  const took = ((Date.now() - tHang) / 1000).toFixed(1);
  assert.ok(rB.busy >= 1, "멈춘 실행의 임대가 끝날 때까지 기다림");
  const beforeWake = (await db.doc("resetBackups/job_H").get()).data();
  release();
  const rA = await pA;
  assert.equal(rA.lost, true, "늦게 깨어난 옛 실행은 이어받긴 실행이 있으므로 멈춤");
  const afterWake = (await db.doc("resetBackups/job_H").get()).data();
  assert.equal(afterWake.phase, "done");
  assert.equal(afterWake.copyIdx, beforeWake.copyIdx);
  assert.equal(afterWake.docCount, 2000);
  assert.equal(await count(db.collection("orders").where("companyName", "==", CO3)), 0);
  console.log(`  ✓ 멈춘 실행 감지(진행 없음 ${process.env.KP_RESET_STUCK_MS}ms → 임대 ${process.env.KP_RESET_LEASE_MS}ms 만료) → ${took}초 만에 다른 실행이 이어받아 완료 · 옛 실행은 펜싱으로 아무것도 못 씀`);

  // ═════ ⑤ 예전 코드가 남긴 "처리 중" 보관함 4개(돌캐 상황) → 정리 · 이어하기 ═════
  await wipe();
  const CO4 = "사아운송";
  await seed("orders", CO4, 900);
  const mkOld = async (id, hoursAgo) => {
    const ref = db.doc(`resetBackups/${id}`);
    await ref.set({ company: CO4, by: "old", at: Timestamp.fromMillis(Date.now() - hoursAgo * 3600000), status: "saving", phase: "backup", topCount: 900, docCount: 900, perCollection: { orders: 900 } });
    const b = db.batch();
    for (let k = 0; k < 300; k++) b.set(ref.collection("docs").doc(String(k).padStart(7, "0")), { path: `orders/${CO4}_${k}`, data: { n: k } });
    await b.commit();
    fs.writeFileSync(enc(`resetBackups/${id}/uploads/x.jpg`), "x");
    await db.doc(`resetJobs/${id}`).set({ action: "reset", company: CO4, status: "running", pct: 57, step: "보관함에 복사 중 31,831 / 37,248", heartbeatAt: Timestamp.fromMillis(Date.now() - hoursAgo * 3600000) });
  };
  await mkOld("job_o1", 24); await mkOld("job_o2", 15); await mkOld("job_o3", 9); await mkOld("job_o4", 1);
  const eng4 = makeEngine();
  const desc = await eng4.describe((await db.collection("resetBackups").get()).docs.map((d) => ({ id: d.id, ...d.data() })));
  assert.ok(desc.every((x) => x.unfinished && !x.alive && x.canResume && x.canCancel), "멈춘 작업으로 보이고 [이어서]·[취소] 가능");
  for (const id of ["job_o1", "job_o2", "job_o3"]) {
    let r; do { r = await eng4.cancel({ backupId: id, by: "t", budgetMs: BUDGET }); } while (!r.done);
    const x = (await db.doc(`resetBackups/${id}`).get()).data();
    assert.equal(x.status, "cancelled");
    assert.equal(await count(db.collection(`resetBackups/${id}/docs`)), 0);
    assert.ok(!hasFile(`resetBackups/${id}/uploads/x.jpg`));
  }
  assert.equal(await count(db.collection("orders").where("companyName", "==", CO4)), 900, "취소하고 정리는 운영 데이터를 건드리지 않음");
  console.log("  ✓ [취소하고 정리] 3개 — 부분 복사본·보관 파일만 지움, 운영 데이터 900건 그대로");
  const r4 = await drive(eng4, { jobId: "job_new", company: CO4, by: "t" });
  assert.deepEqual(r4.redirect, ["job_o4"], "새로 시작하면 남은 예전 작업으로");
  const o4 = (await db.doc("resetBackups/job_o4").get()).data();
  assert.equal(o4.phase, "done");
  assert.equal(o4.engine, 2);
  assert.equal(await count(db.collection("resetBackups/job_o4/docs")), 900);
  assert.equal(await count(db.collection("orders").where("companyName", "==", CO4)), 0);
  assert.equal((await db.doc("resetBackups/job_new").get()).exists, false);
  await assert.rejects(eng4.cancel({ backupId: "job_o4", by: "t" }), (e) => e.status === 409, "삭제가 시작된 작업은 취소 불가");
  console.log("  ✓ 새로 시작 → 남은 예전 작업(job_o4)으로 돌려보냄 → 예전 부분 복사본을 지우고 새 방식으로 끝까지 · 끝난 작업은 취소 불가");

  // 예전 형식으로 보관이 끝나고 삭제하다 끊긴 기록(docs/{번호}.path) → 목록대로 이어서 삭제
  await wipe();
  await seed("orders", "자차운송", 500);
  const L = db.doc("resetBackups/job_L");
  await L.set({ company: "자차운송", at: Timestamp.now(), status: "kept", phase: "delete", docCount: 500, topCount: 500, expiresAt: new Date(Date.now() + 86400000) });
  for (let i = 0; i < 500; i += 250) { const b = db.batch(); for (let k = i; k < i + 250; k++) b.set(L.collection("docs").doc(String(k).padStart(7, "0")), { path: `orders/자차운송_${k}`, data: {} }); await b.commit(); }
  await drive(eng4, { jobId: "job_L", company: "자차운송", by: "t" });
  assert.equal(await count(db.collection("orders").where("companyName", "==", "자차운송")), 0);
  assert.equal((await L.get()).data().phase, "done");
  console.log("  ✓ 예전 형식 삭제 단계(목록 없음)도 보관본 목록대로 이어서 끝냄");

  console.log(`모두 통과 (${((Date.now() - T) / 1000).toFixed(1)}초)`);
  fs.rmSync(STORE, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
