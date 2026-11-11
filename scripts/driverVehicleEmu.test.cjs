// ⭐ 2026-11-11 기사 차량 변경(driverChangeVehicle) · 휴대폰번호 로그인(driverPhoneLogin) — 에뮬레이터 통합 테스트
//  Firestore + Auth 에뮬레이터 필요:
//   firebase emulators:exec --only firestore,auth --project demo-kpflow "node scripts/driverVehicleEmu.test.cjs"
const path = require("path");
const assert = require("assert");
const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-kpflow";
const req_ = require("module").createRequire(path.join(ROOT, "functions/index.js"));
const { initializeApp } = req_("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = req_("firebase-admin/firestore");
const { getAuth } = req_("firebase-admin/auth");
const functions = req_("firebase-functions/v1");
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();
const UA = require(path.join(ROOT, "functions/uploadAccess.js"))({ functions, db, getAuth, FieldValue, Timestamp });
const DV = require(path.join(ROOT, "functions/driverVehicle.js"))({ functions, db, getAuth, FieldValue, helpers: UA });
const V = require(path.join(ROOT, "functions/driverVehicleCore.js"));

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass += 1; console.log(`PASS ${name}`); } catch (e) { fail += 1; console.log(`FAIL ${name} :: ${e?.stack || e}`.slice(0, 600)); }
}
let ipSeq = 0;
function call(handler, { method = "POST", body = {}, headers = {}, ip } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200, headers: {}, body: undefined,
      status(c) { this.statusCode = c; return this; },
      set(k, v) { this.headers[k] = v; return this; },
      json(b) { this.body = b; resolve(this); return this; },
      send(b) { this.body = b; resolve(this); return this; },
    };
    const req = { method, body, query: {}, headers: { "x-forwarded-for": ip || `10.1.0.${(ipSeq++ % 250) + 1}`, ...headers }, get(k) { return this.headers[String(k).toLowerCase()]; } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const idp = async (pathName, body) => {
  const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${pathName}?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, returnSecureToken: true }) });
  return r.json();
};
const signUp = async (email, password) => { const j = await idp("signUp", { email, password }); if (!j.idToken) throw new Error(JSON.stringify(j)); return j; };
const canSignIn = async (email, password) => !!(await idp("signInWithPassword", { email, password })).idToken;

// 기사앱에 가입한 기사 한 명 만들기(로그인 계정 + users + drivers/{uid})
async function makeDriver({ co, plate, name, phone, email, extra = {} }) {
  const u = await signUp(email || V.legacyEmail(plate), plate);
  await db.doc(`users/${u.localId}`).set({ uid: u.localId, email: u.email, role: "driver", name, carNo: plate, phone, companyName: co, approved: true, createdAt: Timestamp.now() });
  await db.doc(`drivers/${u.localId}`).set({ uid: u.localId, name, carNo: plate, phone, 이름: name, 차량번호: plate, 전화번호: phone, companyName: co, 등급: "지입", approved: true, ...extra });
  return u.localId;
}

(async () => {
  if (!authHost) { console.log("SKIP — FIREBASE_AUTH_EMULATOR_HOST 없음"); process.exit(1); }
  const CO = "에이운송";
  const staff = await signUp("staff@a.test", "pw-staff-1");
  await db.doc(`users/${staff.localId}`).set({ role: "user", companyName: CO, approved: true, name: "배차" });
  const other = await signUp("staff@b.test", "pw-staff-2");
  await db.doc(`users/${other.localId}`).set({ role: "user", companyName: "비운송", approved: true });
  const H = { authorization: `Bearer ${staff.idToken}` };
  const today = V.kstDay();
  const yest = V.addDays(today, -1);

  const A = await makeDriver({ co: CO, plate: "34바3333", name: "이태훈", phone: "010-1111-2222" });
  const B = await makeDriver({ co: CO, plate: "34바3434", name: "김철수", phone: "01033334444" });

  await t("차량 변경: 토큰 없으면 401 · 다른 회사 직원 403 · 기사 본인 403", async () => {
    assert.strictEqual((await call(DV.driverChangeVehicle, { body: { driverId: A, carNo: "55다5555" } })).statusCode, 401);
    assert.strictEqual((await call(DV.driverChangeVehicle, { headers: { authorization: `Bearer ${other.idToken}` }, body: { driverId: A, carNo: "55다5555" } })).statusCode, 403);
    const me = await idp("signInWithPassword", { email: V.legacyEmail("34바3333"), password: "34바3333" });
    assert.strictEqual((await call(DV.driverChangeVehicle, { headers: { authorization: `Bearer ${me.idToken}` }, body: { driverId: A, carNo: "55다5555" } })).statusCode, 403);
  });
  await t("차량 변경: 형식 틀린 차량번호 · 내일 날짜는 거절", async () => {
    assert.strictEqual((await call(DV.driverChangeVehicle, { headers: H, body: { driverId: A, carNo: "3333" } })).body.code, "BAD_PLATE");
    assert.strictEqual((await call(DV.driverChangeVehicle, { headers: H, body: { driverId: A, carNo: "55다5555", date: V.addDays(today, 1) } })).body.code, "BAD_DATE");
  });
  const phoneLogin = (phone, name, co = CO) => call(DV.driverPhoneLogin, { body: { companyName: co, phone, name } }).then((r) => r.body);
  const tokensValidAfter = async (uid) => (await getAuth().getUser(uid)).tokensValidAfterTime;

  await t("차량 변경: 빈 차량으로 — 문서·이력만 바뀌고, 로그인 계정은 그대로(기사 폰 로그아웃 안 됨)", async () => {
    const before = await tokensValidAfter(A);
    const r = await call(DV.driverChangeVehicle, { headers: H, body: { driverId: A, carNo: "55다 5555" } });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.ok, true); assert.strictEqual(r.body.carNo, "55다5555"); assert.strictEqual(r.body.account, true);
    const drv = (await db.doc(`drivers/${A}`).get()).data();
    assert.strictEqual(drv.차량번호, "55다5555"); assert.strictEqual(drv.carNo, "55다5555");
    assert.deepStrictEqual(drv.차량이력.map((e) => [e.차량번호, e.시작, e.종료]), [["34바3333", "", yest], ["55다5555", today, ""]]);
    const usr = (await db.doc(`users/${A}`).get()).data();
    assert.strictEqual(usr.carNo, "55다5555"); assert.strictEqual(usr.loginSync, true);
    assert.strictEqual((await getAuth().getUser(A)).email, "34바3333@driver.run25.kr", "로그인 계정은 아직 그대로");
    assert.strictEqual(await tokensValidAfter(A), before, "로그인 세션이 끊기지 않아야");
  });
  await t("휴대폰 로그인: 차량 변경 뒤 첫 로그인 때 계정이 새 차량번호로 맞춰진다", async () => {
    const p = await phoneLogin("01011112222", "이태훈");
    assert.deepStrictEqual(p, { ok: true, email: "55다5555@driver.run25.kr", carNo: "55다5555" });
    assert.ok(await canSignIn("55다5555@driver.run25.kr", "55다5555"), "새 차량번호 계정으로 로그인");
    assert.ok(!(await canSignIn("34바3333@driver.run25.kr", "34바3333")), "예전 차량번호 계정은 비어 있어야");
    const usr = (await db.doc(`users/${A}`).get()).data();
    assert.strictEqual(usr.loginSync, false); assert.strictEqual(usr.email, "55다5555@driver.run25.kr");
    // 두 번째 로그인은 그대로
    assert.deepStrictEqual(await phoneLogin("01011112222", "이태훈"), p);
  });
  await t("차량 변경: 비워진 차량번호(3333)는 다른 기사가 새로 가입할 수 있다", async () => {
    const C = await makeDriver({ co: CO, plate: "34바3333", name: "박새로", phone: "010-5555-6666" });
    assert.ok(await canSignIn("34바3333@driver.run25.kr", "34바3333"));
    await getAuth().deleteUser(C); await db.doc(`users/${C}`).delete(); await db.doc(`drivers/${C}`).delete();
  });
  await t("차량 변경: 다른 기사가 타는 차량이면 HOLDER(아무것도 안 바뀜)", async () => {
    const r = await call(DV.driverChangeVehicle, { headers: H, body: { driverId: A, carNo: "34바3434" } });
    assert.deepStrictEqual(r.body, { ok: false, code: "HOLDER", holder: { name: "김철수", carNo: "34바3434" }, canSwap: true });
    assert.strictEqual((await db.doc(`drivers/${A}`).get()).data().차량번호, "55다5555");
    assert.strictEqual((await db.doc(`drivers/${B}`).get()).data().차량번호, "34바3434");
  });
  await t("차량 변경: 맞교환 — 두 기사 차량이 서로 바뀌고, 둘 다 로그아웃되지 않는다", async () => {
    const [ta, tb] = [await tokensValidAfter(A), await tokensValidAfter(B)];
    const r = await call(DV.driverChangeVehicle, { headers: H, body: { driverId: A, carNo: "34바3434", holderAction: "swap" } });
    assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.holder, { name: "김철수", carNo: "55다5555" });
    assert.strictEqual((await db.doc(`drivers/${A}`).get()).data().차량번호, "34바3434");
    const b = (await db.doc(`drivers/${B}`).get()).data();
    assert.strictEqual(b.차량번호, "55다5555");
    assert.deepStrictEqual(b.차량이력.map((e) => [e.차량번호, e.시작, e.종료]), [["34바3434", "", yest], ["55다5555", today, ""]]);
    assert.strictEqual((await db.doc(`users/${B}`).get()).data().carNo, "55다5555");
    assert.strictEqual(await tokensValidAfter(A), ta); assert.strictEqual(await tokensValidAfter(B), tb);
  });
  await t("휴대폰 로그인: 맞교환 뒤 — 먼저 로그인한 기사는 전용 계정, 나중 기사는 새 차량번호 계정(서로 안 끊김)", async () => {
    // A가 먼저 로그인: 3434 메일은 아직 B(다시 로그인 전) 계정이 쓰는 중 → B를 건드리지 않고 A 전용 메일
    const tb = await tokensValidAfter(B);
    const pa = await phoneLogin("01011112222", "이태훈");
    assert.strictEqual(pa.email, V.uniqueEmail("34바3434", A)); assert.strictEqual(pa.carNo, "34바3434");
    assert.ok(await canSignIn(pa.email, "34바3434"));
    assert.strictEqual(await tokensValidAfter(B), tb, "B는 로그아웃되지 않아야");
    // B가 로그인: 55다5555 메일은 A가 비웠으므로 그대로 쓴다
    const pb = await phoneLogin("01033334444", "김철수");
    assert.deepStrictEqual(pb, { ok: true, email: "55다5555@driver.run25.kr", carNo: "55다5555" });
    assert.ok(await canSignIn("55다5555@driver.run25.kr", "55다5555"));
  });
  await t("차량 변경: 차량미배정 — 원래 타던 기사는 차량 없음(휴대폰번호로 로그인)", async () => {
    const r = await call(DV.driverChangeVehicle, { headers: H, body: { driverId: B, carNo: "34바3434", holderAction: "unassign" } });
    assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.holder, { name: "이태훈", carNo: "" });
    const a = (await db.doc(`drivers/${A}`).get()).data();
    assert.strictEqual(a.차량번호, ""); assert.strictEqual(a.carNo, "");
    assert.strictEqual(a.차량이력[a.차량이력.length - 1].종료, yest);
    const p = await phoneLogin("01011112222", "이태훈");
    assert.deepStrictEqual(p, { ok: true, email: V.nocarEmail(A), carNo: "" });
    assert.ok(await canSignIn(V.nocarEmail(A), V.nocarLocal(A)));
  });
  await t("차량 변경: 차량미배정 기사에게 다시 차량 배정 → 로그인하면 그 차량번호 계정", async () => {
    const r = await call(DV.driverChangeVehicle, { headers: H, body: { driverId: A, carNo: "34바3333" } });
    assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
    const a = (await db.doc(`drivers/${A}`).get()).data();
    assert.strictEqual(a.차량이력[a.차량이력.length - 1].차량번호, "34바3333");
    assert.deepStrictEqual(await phoneLogin("01011112222", "이태훈"), { ok: true, email: "34바3333@driver.run25.kr", carNo: "34바3333" });
    assert.ok(await canSignIn("34바3333@driver.run25.kr", "34바3333"));
  });
  await t("차량 변경: 다른 운송사에 같은 차량번호 기사가 있으면 회사별 계정으로(그 기사는 그대로)", async () => {
    const X = await makeDriver({ co: "비운송", plate: "77사7777", name: "남의기사", phone: "010-9999-0000" });
    const r = await call(DV.driverChangeVehicle, { headers: H, body: { driverId: A, carNo: "77사7777" } });
    assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
    assert.strictEqual((await phoneLogin("01011112222", "이태훈")).email, V.scopedEmail(CO, "77사7777"));
    assert.strictEqual((await getAuth().getUser(X)).email, "77사7777@driver.run25.kr");
    assert.ok(await canSignIn(V.scopedEmail(CO, "77사7777"), "77사7777"));
  });
  await t("차량 변경: 앱 미가입 기사는 문서만", async () => {
    await db.doc(`drivers/${CO}__88아8888`).set({ companyName: CO, 이름: "미가입", 전화번호: "01077778888", 차량번호: "88아8888", 등급: "지입" });
    const r = await call(DV.driverChangeVehicle, { headers: H, body: { driverId: `${CO}__88아8888`, carNo: "99자9999", date: yest } });
    assert.strictEqual(r.body.ok, true); assert.strictEqual(r.body.account, false);
    const d = (await db.doc(`drivers/${CO}__88아8888`).get()).data();
    assert.strictEqual(d.차량번호, "99자9999"); assert.strictEqual(d.carNo, "99자9999");
    assert.strictEqual(d.차량이력[1].시작, yest);
  });

  await t("휴대폰 로그인: 번호 형식이 달라도 찾는다 + 지금 계정을 돌려준다", async () => {
    const r1 = await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "010-1111-2222", name: "이태훈" } });
    assert.deepStrictEqual(r1.body, { ok: true, email: V.scopedEmail(CO, "77사7777"), carNo: "77사7777" });
    const r2 = await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "010-3333-4444", name: "김철수" } });
    assert.deepStrictEqual(r2.body, { ok: true, email: "34바3434@driver.run25.kr", carNo: "34바3434" });
  });
  await t("휴대폰 로그인: 없는 번호 · 회사 다름 · 이름 다름 · 일부만 입력", async () => {
    assert.strictEqual((await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "01000000000", name: "이태훈" } })).body.code, "NOT_FOUND");
    assert.strictEqual((await call(DV.driverPhoneLogin, { body: { companyName: "씨운송", phone: "01011112222", name: "이태훈" } })).body.code, "COMPANY_MISMATCH");
    assert.strictEqual((await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "01011112222", name: "엉뚱이" } })).body.code, "NAME_MISMATCH");
    assert.strictEqual((await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "2222", name: "이태훈" } })).statusCode, 400);
  });
  await t("휴대폰 로그인: 기사관리에만 등록된 기사는 차량번호만 알려준다", async () => {
    const r = await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "010-7777-8888", name: "미가입" } });
    assert.deepStrictEqual(r.body, { ok: true, pre: true, carNo: "99자9999" });
  });
  await t("휴대폰 로그인: 기사관리에서만 번호를 고친 기사(users.phone은 옛 번호)도 찾는다", async () => {
    await db.doc(`drivers/${B}`).update({ 전화번호: "01012120000" });
    const r = await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "01012120000", name: "김철수" } });
    assert.strictEqual(r.body.email, "34바3434@driver.run25.kr");
  });
  await t("휴대폰 로그인: 같은 번호로 계속 시도하면 429", async () => {
    let last = 200;
    for (let i = 0; i < 14; i++) last = (await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "01055550000", name: "x" } })).statusCode;
    assert.strictEqual(last, 429);
  });

  // ── 가입 중복 확인 · 기사 합치기 ──
  await t("가입 중복 확인: 같은 운송사에 같은 휴대폰번호 기사 계정이 있으면 taken", async () => {
    const n = await signUp("12가1212@driver.run25.kr", "12가1212");
    const HN = { authorization: `Bearer ${n.idToken}` };
    assert.deepStrictEqual((await call(DV.driverPhoneCheck, { headers: HN, body: { companyName: CO, phone: "010-1111-2222" } })).body, { taken: true });
    assert.deepStrictEqual((await call(DV.driverPhoneCheck, { headers: HN, body: { companyName: CO, phone: "01012120000" } })).body, { taken: true }, "기사관리에서만 고친 번호");
    assert.deepStrictEqual((await call(DV.driverPhoneCheck, { headers: HN, body: { companyName: CO, phone: "01088889999" } })).body, { taken: false });
    assert.deepStrictEqual((await call(DV.driverPhoneCheck, { headers: HN, body: { companyName: "씨운송", phone: "01011112222" } })).body, { taken: false }, "다른 운송사는 따로");
    assert.deepStrictEqual((await call(DV.driverPhoneCheck, { headers: HN, body: { companyName: CO, phone: "010-7777-8888" } })).body, { taken: false }, "기사관리에만 등록된(앱 미가입) 번호는 가입 가능");
    assert.strictEqual((await call(DV.driverPhoneCheck, { body: { companyName: CO, phone: "01011112222" } })).statusCode, 401);
    assert.strictEqual((await call(DV.driverPhoneCheck, { headers: H, body: { companyName: CO, phone: "01011112222" } })).statusCode, 403, "기사 계정 토큰만");
    await getAuth().deleteUser(n.localId);
  });
  // 김영욱: 예전에 1019로 쓰던 계정(K1) + 4931로 다시 가입한 계정(K2)
  const K1 = await makeDriver({ co: CO, plate: "전남89바1019", name: "김영욱", phone: "010-2020-3030", extra: { 정산계좌: { bank: "국민", acct: "123", holder: "김영욱" } } });
  const K2 = await makeDriver({ co: CO, plate: "전남80바4931", name: "김영욱", phone: "010-2020-3030" });
  await db.doc("orders/k1").set({ companyName: CO, 상차일: "2026-10-05", 차량번호: "전남89바1019", 이름: "김영욱", 기사운임: 100000 });
  await db.doc("driver_documents/kd1").set({ driverId: K1, companyName: CO, docType: "bizReg" });
  await db.doc(`driverStatements/${K1}_2026-10`).set({ companyName: CO, driverId: K1, driverKey: K1, period: "2026-10" });
  await db.doc("driver_logs/kl1").set({ uid: K1, status: "출근" });
  const master = await signUp("tm@a.test", "pw-master-1");
  await db.doc(`users/${master.localId}`).set({ role: "totalMaster", companyName: CO, approved: true });
  const HM = { authorization: `Bearer ${master.idToken}` };
  await t("기사 합치기: 최고관리자만(일반 직원 403 · 토큰 없음 401)", async () => {
    assert.strictEqual((await call(DV.driverMerge, { headers: H, body: { keepId: K2, oldId: K1, date: "2026-10-20" } })).statusCode, 403);
    assert.strictEqual((await call(DV.driverMerge, { body: { keepId: K2, oldId: K1, date: "2026-10-20" } })).statusCode, 401);
    assert.ok((await db.doc(`drivers/${K1}`).get()).exists);
  });
  await t("기사 합치기: 다른 운송사 기사 · 내일 날짜 · 같은 줄은 거절", async () => {
    const X = (await db.collection("drivers").where("companyName", "==", "비운송").limit(1).get()).docs[0].id;
    assert.strictEqual((await call(DV.driverMerge, { headers: HM, body: { keepId: K2, oldId: X, date: "2026-10-20" } })).body.code, "OTHER_COMPANY");
    assert.strictEqual((await call(DV.driverMerge, { headers: HM, body: { keepId: K2, oldId: K1, date: V.addDays(today, 1) } })).body.code, "BAD_DATE");
    assert.strictEqual((await call(DV.driverMerge, { headers: HM, body: { keepId: K2, oldId: K2, date: "2026-10-20" } })).statusCode, 400);
  });
  await t("기사 합치기: 차량이력이 붙고 · 기록이 옮겨지고 · 예전 줄과 계정이 지워진다(오더는 그대로)", async () => {
    const r = await call(DV.driverMerge, { headers: HM, body: { keepId: K2, oldId: K1, date: "2026-10-20" } });
    assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
    const k = (await db.doc(`drivers/${K2}`).get()).data();
    assert.deepStrictEqual(k.차량이력.map((e) => [e.차량번호, e.시작, e.종료]), [["전남89바1019", "", "2026-10-19"], ["전남80바4931", "2026-10-20", ""]]);
    assert.strictEqual(k.차량번호, "전남80바4931");
    assert.deepStrictEqual(k.정산계좌, { bank: "국민", acct: "123", holder: "김영욱" }, "비어 있던 정산계좌는 예전 줄에서 가져온다");
    assert.ok(!(await db.doc(`drivers/${K1}`).get()).exists); assert.ok(!(await db.doc(`users/${K1}`).get()).exists);
    assert.strictEqual(await getAuth().getUser(K1).catch(() => null), null, "예전 로그인 계정도 삭제");
    assert.strictEqual((await db.doc("orders/k1").get()).data().차량번호, "전남89바1019", "오더는 손대지 않는다");
    assert.strictEqual((await db.doc("driver_documents/kd1").get()).data().driverId, K2);
    const st = (await db.doc(`driverStatements/${K1}_2026-10`).get()).data();
    assert.strictEqual(st.driverId, K2); assert.strictEqual(st.driverKey, K2);
    assert.strictEqual((await db.doc("driver_logs/kl1").get()).data().uid, K2);
    assert.deepStrictEqual(r.body.moved, { driver_documents: 1, driverStatements: 2, driver_logs: 1 });
    const log = (await db.collection("driverMergeLog").get()).docs[0].data();
    assert.strictEqual(log.oldId, K1); assert.strictEqual(log.oldDriver.차량번호, "전남89바1019");
    // 합친 뒤 휴대폰번호 로그인은 남긴 계정 하나로
    assert.deepStrictEqual((await call(DV.driverPhoneLogin, { body: { companyName: CO, phone: "01020203030", name: "김영욱" } })).body, { ok: true, email: "전남80바4931@driver.run25.kr", carNo: "전남80바4931" });
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
