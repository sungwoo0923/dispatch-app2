// ⭐ 2026-11-08 서버 함수(uploadAccess · driverSearch · driverLoginLink · 요청 수 제한) — 에뮬레이터 통합 테스트
//  Firestore + Auth 에뮬레이터 필요:
//   firebase emulators:exec --only firestore,auth --project demo-kpflow "node scripts/uploadAccessEmu.test.cjs"
//  (functions/node_modules 의 firebase-admin · firebase-functions 를 쓴다. HUB_REPO=저장소 폴더)
const path = require("path");
const assert = require("assert");
const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-kpflow";
process.env.UPLOAD_TOKEN_SECRET = "emu-test-secret-0123456789abcdef";
const req_ = require("module").createRequire(path.join(ROOT, "functions/index.js"));
const { initializeApp } = req_("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = req_("firebase-admin/firestore");
const { getAuth } = req_("firebase-admin/auth");
const functions = req_("firebase-functions/v1");
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();
const UA = require(path.join(ROOT, "functions/uploadAccess.js"))({ functions, db, getAuth, FieldValue, Timestamp });

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass += 1; console.log(`PASS ${name}`); } catch (e) { fail += 1; console.log(`FAIL ${name} :: ${e?.stack || e}`.slice(0, 400)); }
}
let ipSeq = 0;
function call(handler, { method = "POST", body = {}, query = {}, headers = {}, ip } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200, headers: {}, body: undefined,
      status(c) { this.statusCode = c; return this; },
      set(k, v) { this.headers[k] = v; return this; },
      json(b) { this.body = b; resolve(this); return this; },
      send(b) { this.body = b; resolve(this); return this; },
      end() { resolve(this); return this; },
    };
    const req = { method, body, query, headers: { "x-forwarded-for": ip || `10.0.0.${(ipSeq++ % 250) + 1}`, ...headers }, get(k) { return this.headers[String(k).toLowerCase()]; } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const IMG = "data:image/jpeg;base64," + Buffer.from("fakejpeg").toString("base64");
const NOW = Date.now();

(async () => {
  // 시드
  await db.doc("orders/oA").set({ companyName: "에이운송", 상차일: "2026-11-08", 차량번호: "12가3456", 이름: "홍길동", 상차지명: "서울", 업로드토큰: "tokA", 업로드토큰발급: NOW - 3600e3, attachCount: 0, 운임: 500000, _transmittedOrderId: "sA" });
  await db.doc("orders/sA").set({ companyName: "에이운송", source: "transport_transmit", shipperCompany: "에스상사", attachCount: 0 });
  await db.doc("orders/oOld").set({ companyName: "에이운송", 상차일: "2026-11-08", 업로드토큰: "tokOld", 업로드토큰발급: NOW - 31 * 864e5 });
  await db.doc("orders/oLegacy").set({ companyName: "에이운송", 상차일: "2026-11-08", 업로드토큰: "tokLeg" });
  await db.doc("dispatch/dNoTok").set({ companyName: "돌캐", 상차일: "2026-11-08", 차량번호: "99하9999", 이름: "김기사" });
  await db.doc("orders/oB").set({ companyName: "비운송", 상차일: "2026-11-08", 차량번호: "12가3456", 이름: "홍길동", 업로드토큰: "tokB", 업로드토큰발급: NOW });
  await db.doc("companySettings/에이운송").set({ 결제일규칙: { type: "monthEnd" } });

  const S1 = "session-aaaaaaaaaaaaaaaaaaaaaaaa";
  let attId = "";
  await t("view: 맞는 토큰 → 화면 칸만(업로드토큰·운임 없음) + 결제일 규칙", async () => {
    const r = await call(UA.uploadAccess, { body: { action: "view", id: "oA", t: "tokA" } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.order.이름, "홍길동");
    assert.strictEqual(r.body.order.업로드토큰, undefined);
    assert.strictEqual(r.body.order.운임, undefined);
    assert.strictEqual(r.body.order._mirrorLiveId, "sA");
    assert.deepStrictEqual(r.body.payRule, { type: "monthEnd" });
    assert.strictEqual(r.body.col, "orders");
  });
  await t("view: 틀린 토큰 → 403 BAD_TOKEN / 토큰 없음 → 403", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oA", t: "nope" } })).body.error, "BAD_TOKEN");
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oA" } })).statusCode, 403);
  });
  await t("view: 30일 지난 토큰 → EXPIRED", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oOld", t: "tokOld" } })).body.error, "EXPIRED");
  });
  await t("view: 예전 형식(발급 시각 없는 토큰 / 토큰 없는 오더) → 전환 기간 동안 통과, 기간 끝나면 EXPIRED", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oLegacy", t: "tokLeg" } })).body.legacy, true);
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "dNoTok" } })).body.col, "dispatch");
    process.env.UPLOAD_LEGACY_UNTIL = "2020-01-01";
    try {
      assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oLegacy", t: "tokLeg" } })).body.error, "EXPIRED");
      assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "dNoTok" } })).body.error, "EXPIRED");
    } finally { delete process.env.UPLOAD_LEGACY_UNTIL; }
  });
  await t("view: 없는 오더 → 404", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "nope", t: "x" } })).statusCode, 404);
  });
  await t("addFile: 토큰으로 사진 올리기 → 오더+전송사본 첨부·첨부 수", async () => {
    const r = await call(UA.uploadAccess, { body: { action: "addFile", id: "oA", t: "tokA", session: S1, file: { base64: IMG, name: "a.jpg", source: "driver_upload" } } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    attId = r.body.attId;
    const a = await db.doc(`orders/oA/attachments/${attId}`).get();
    assert.ok(a.exists); assert.strictEqual(a.data().type, "image/jpeg"); assert.ok(a.data().uploadSession && a.data().uploadSession !== S1);
    assert.ok((await db.doc(`orders/sA/attachments/${attId}`).get()).exists);
    assert.strictEqual((await db.doc("orders/oA").get()).data().attachCount, 1);
    assert.strictEqual((await db.doc("orders/sA").get()).data().attachCount, 1);
  });
  await t("addFile: 틀린 토큰·이미지 아닌 파일 거절", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "addFile", id: "oA", t: "bad", session: S1, file: { base64: IMG } } })).statusCode, 403);
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "addFile", id: "oA", t: "tokA", session: S1, file: { base64: "data:text/html;base64,PHNjcmlwdD4=" } } })).body.error, "BAD_FILE");
  });
  await t("finish: 잠금 → 같은 링크 다시 열면 LOCKED · 전송사본도 잠김", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "finish", id: "oA", t: "tokA", session: S1 } })).statusCode, 200);
    assert.strictEqual((await db.doc("orders/oA").get()).data().업로드잠금, true);
    assert.strictEqual((await db.doc("orders/sA").get()).data().업로드잠금, true);
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oA", t: "tokA" } })).body.error, "LOCKED");
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "addFile", id: "oA", t: "tokA", session: S1, file: { base64: IMG } } })).body.error, "LOCKED");
  });
  await t("deleteFile: 다른 세션 거절 · 같은 세션은 잠긴 뒤에도 방금 올린 사진 삭제", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "deleteFile", id: "oA", t: "tokA", session: "session-bbbbbbbbbbbbbbbbbbbbbb", attId } })).body.error, "NOT_YOURS");
    const r = await call(UA.uploadAccess, { body: { action: "deleteFile", id: "oA", t: "tokA", session: S1, attId } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.ok(!(await db.doc(`orders/oA/attachments/${attId}`).get()).exists);
    assert.ok(!(await db.doc(`orders/sA/attachments/${attId}`).get()).exists);
    assert.strictEqual((await db.doc("orders/oA").get()).data().attachCount, 0);
  });
  await t("재업로드 허용(업로드잠금해제만료) 동안 다시 열림 → finish 하면 재업로드완료알림", async () => {
    await db.doc("orders/oA").update({ 업로드잠금해제만료: new Date(Date.now() + 30 * 60e3).toISOString() });
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oA", t: "tokA" } })).statusCode, 200);
    await call(UA.uploadAccess, { body: { action: "finish", id: "oA", t: "tokA", session: S1 } });
    const d = (await db.doc("orders/oA").get()).data();
    assert.strictEqual(d.재업로드완료알림, true); assert.strictEqual(d.업로드잠금해제만료, null);
  });
  await t("loc: 위치공유중 표시(잠긴 뒤 끄기도 됨)", async () => {
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "loc", id: "oA", t: "tokA", on: false } })).statusCode, 200);
    assert.strictEqual((await db.doc("orders/oA").get()).data().위치공유중, false);
  });

  // ── driverSearch ──
  let grant = "";
  await t("driverSearch: 회사 범위 · 업로드토큰 없음 · 허가증 있음", async () => {
    const r = await call(UA.driverSearch, { method: "GET", query: { date: "2026-11-08", vehicle: "12가3456", name: "홍길동", co: "에이운송" } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.results.length, 1);
    const x = r.body.results[0];
    assert.strictEqual(x._id, "oA"); assert.strictEqual(x.업로드토큰, undefined); assert.ok(x.grant.startsWith("g1."));
    grant = x.grant;
  });
  await t("driverSearch: co 없으면 기본 회사(돌캐)로만 — 다른 회사 오더 안 나옴", async () => {
    const r = await call(UA.driverSearch, { method: "GET", query: { date: "2026-11-08", vehicle: "12가3456", name: "홍길동" } });
    assert.strictEqual(r.body.results.length, 0);
    const r2 = await call(UA.driverSearch, { method: "GET", query: { date: "2026-11-08", vehicle: "99하9999", name: "김기사" } });
    assert.strictEqual(r2.body.results.length, 1);
  });
  await t("driverSearch: 허가증으로 view(잠긴 오더는 LOCKED) · 다른 오더에는 못 씀", async () => {
    await db.doc("orders/oA").update({ 업로드잠금: false });
    const r = await call(UA.uploadAccess, { body: { action: "view", id: "oA", col: "orders", g: grant } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oB", col: "orders", g: grant } })).body.error, "BAD_TOKEN");
    await db.doc("orders/oA").update({ 업로드잠금: true });
    assert.strictEqual((await call(UA.uploadAccess, { body: { action: "view", id: "oA", col: "orders", g: grant } })).body.error, "LOCKED");
  });
  await t("driverSearch: IP당 10분 30회 넘으면 429", async () => {
    let last = null;
    for (let i = 0; i < 31; i++) last = await call(UA.driverSearch, { method: "GET", ip: "203.0.113.9", query: { date: "2026-11-08", vehicle: "x", name: "y", co: "에이운송" } });
    assert.strictEqual(last.statusCode, 429);
  });

  // ── 수동 업로드 ──
  await t("manualStart + addFile(세션 키) · 다른 세션은 거절", async () => {
    const S2 = "session-manual-cccccccccccccccccc";
    const r = await call(UA.uploadAccess, { body: { action: "manualStart", session: S2, date: "2026-11-08", car: "12가3456", name: "홍길동", co: "에이운송" } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    const id = r.body.id;
    const d = (await db.doc(`driver_uploads/${id}`).get()).data();
    assert.strictEqual(d.companyName, "에이운송");
    const ok = await call(UA.uploadAccess, { body: { action: "addFile", id, col: "driver_uploads", session: S2, file: { base64: IMG, name: "m.jpg" } } });
    assert.strictEqual(ok.statusCode, 200, JSON.stringify(ok.body));
    const bad = await call(UA.uploadAccess, { body: { action: "addFile", id, col: "driver_uploads", session: "session-other-ddddddddddddddd", file: { base64: IMG } } });
    assert.strictEqual(bad.statusCode, 403);
  });

  // ── 요청 수 제한(Firestore 공유) ──
  await t("rateLimit: 같은 키 limit 넘으면 거절(Firestore 문서 apiRateLimits)", async () => {
    const k = `test:${Date.now()}`;
    assert.ok((await UA.rateLimit(k, 2, 60e3)).allowed);
    assert.ok((await UA.rateLimit(k, 2, 60e3)).allowed);
    assert.ok(!(await UA.rateLimit(k, 2, 60e3)).allowed);
    const snap = await db.collection("apiRateLimits").get();
    assert.ok(snap.size >= 1);
  });

  // ── driverLoginLink (Auth 에뮬레이터) ──
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!authHost) { console.log("SKIP driverLoginLink — FIREBASE_AUTH_EMULATOR_HOST 없음"); }
  else {
    const signUp = async (email, password) => {
      const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const j = await r.json();
      if (!j.idToken) throw new Error(JSON.stringify(j));
      return j;
    };
    await db.doc("drivers/에이운송__77GA7777").set({ companyName: "에이운송", 이름: "박기사", 전화번호: "010-7777-7777", 등급: "우수", 차량번호: "77GA7777" });
    await t("driverLoginLink: 이름 다르면 NAME_MISMATCH(문서 내용은 안 줌) · 아무것도 안 씀", async () => {
      const u = await signUp("77ga7777.cx@driver.run25.kr", "77GA7777");
      const r = await call(UA.driverLoginLink, { headers: { authorization: `Bearer ${u.idToken}` }, body: { companyName: "에이운송", carNo: "77GA7777", name: "엉뚱이" } });
      assert.deepStrictEqual(r.body, { linked: false, code: "NAME_MISMATCH" });
      assert.ok(!(await db.doc(`users/${u.localId}`).get()).exists);
      await getAuth().deleteUser(u.localId);
    });
    await t("driverLoginLink: 다른 회사로 → NOT_FOUND / 토큰 없으면 401 / 다른 차량 계정 403", async () => {
      const u = await signUp("77ga7777@driver.run25.kr", "77GA7777");
      const r = await call(UA.driverLoginLink, { headers: { authorization: `Bearer ${u.idToken}` }, body: { companyName: "비운송", carNo: "77GA7777", name: "박기사" } });
      assert.strictEqual(r.body.code, "NOT_FOUND");
      assert.strictEqual((await call(UA.driverLoginLink, { body: { companyName: "에이운송", carNo: "77GA7777", name: "박기사" } })).statusCode, 401);
      assert.strictEqual((await call(UA.driverLoginLink, { headers: { authorization: `Bearer ${u.idToken}` }, body: { companyName: "에이운송", carNo: "88NA8888", name: "박기사" } })).statusCode, 403);
      await getAuth().deleteUser(u.localId);
    });
    await t("driverLoginLink: 맞으면 users·drivers/{uid} 만들고 선등록 문서 정리", async () => {
      const u = await signUp("77ga7777@driver.run25.kr", "77GA7777");
      const r = await call(UA.driverLoginLink, { headers: { authorization: `Bearer ${u.idToken}` }, body: { companyName: "에이운송", carNo: "77GA7777", name: "박기사" } });
      assert.deepStrictEqual(r.body, { linked: true, companyName: "에이운송" });
      const usr = (await db.doc(`users/${u.localId}`).get()).data();
      assert.strictEqual(usr.role, "driver"); assert.strictEqual(usr.approved, true); assert.strictEqual(usr.phone, "010-7777-7777");
      const drv = (await db.doc(`drivers/${u.localId}`).get()).data();
      assert.strictEqual(drv.등급, "우수"); assert.strictEqual(drv.uid, u.localId);
      assert.ok(!(await db.doc("drivers/에이운송__77GA7777").get()).exists);
      // 두 번째 호출은 ALREADY
      assert.strictEqual((await call(UA.driverLoginLink, { headers: { authorization: `Bearer ${u.idToken}` }, body: { companyName: "에이운송", carNo: "77GA7777", name: "박기사" } })).body.code, "ALREADY");
    });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
