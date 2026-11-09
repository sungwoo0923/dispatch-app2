// 🔐 2026-11-08 기사 로그인(차량번호 + 휴대폰번호 · 본인 휴대폰에서만) — 서버 함수 driverSignIn · driverResetDevice 를
//  가짜 Firestore · 가짜 Auth로 돌려 본다(인터넷 · 에뮬레이터 없음).  node scripts/driverAuth.test.cjs
const path = require("path");
const C = require(path.join(__dirname, "../functions/driverAuthCore.js"));
const makeDriverAuth = require(path.join(__dirname, "../functions/driverAuth.js"));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass += 1; console.log(`PASS ${name}`); } catch (e) { fail += 1; console.log(`FAIL ${name} :: ${e.message}`); } };
const eq = (a, b, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

// ── 가짜 Firestore ──
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (p) => ({
    id: p.split("/").pop(), path: p,
    get: async () => snap(p),
    set: async (v, o) => { store.set(p, o?.merge ? { ...(store.get(p) || {}), ...v } : { ...v }); },
    delete: async () => { store.delete(p); },
  });
  const snap = (p) => ({ id: p.split("/").pop(), ref: ref(p), exists: store.has(p), data: () => (store.has(p) ? { ...store.get(p) } : undefined) });
  return {
    store,
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    runTransaction: async (fn) => fn({ get: async (r) => snap(r.path), set: (r, v, o) => { store.set(r.path, o?.merge ? { ...(store.get(r.path) || {}), ...v } : { ...v }); }, delete: (r) => store.delete(r.path) }),
  };
}
function fakeAuth(users = []) {
  const byUid = new Map(users.map((u) => [u.uid, { ...u }]));
  let n = 0;
  return {
    byUid, revoked: [],
    getUserByEmail: async (e) => { const u = [...byUid.values()].find((x) => x.email === e.toLowerCase()); if (!u) throw Object.assign(new Error("nf"), { code: "auth/user-not-found" }); return u; },
    createUser: async ({ email, password }) => { const uid = `new${++n}`; byUid.set(uid, { uid, email, password }); return { uid }; },
    updateUser: async (uid, { password }) => { byUid.get(uid).password = password; },
    deleteUser: async (uid) => { byUid.delete(uid); },
    revokeRefreshTokens: async (uid) => { authRef.revoked.push(uid); },
  };
}
let authRef;
const FieldValue = { serverTimestamp: () => "TS" };
const functions = { https: { onRequest: (h) => h }, runWith: () => functions };
function harness(seedDb, authUsers, staff = {}) {
  const db = fakeDb(seedDb);
  const a = fakeAuth(authUsers); authRef = a;
  const linkCalls = [];
  const ua = {
    cors: () => false, clientIp: () => "1.1.1.1", limited: async () => false,
    bearerUser: async (req) => staff[req.headers.authorization] || null,
    isStaffOf: async (tok, co) => tok.co === co,
    linkPre: async ({ uid, email, co, carNo, name }) => { linkCalls.push({ uid, email, co, carNo, name }); db.store.set(`users/${uid}`, { role: "driver", companyName: co, name, approved: true }); return { linked: true, companyName: co }; },
  };
  const fns = makeDriverAuth({ functions, db, getAuth: () => a, FieldValue, ua, appCheckGate: async () => true });
  const call = async (fn, body, headers = {}) => {
    let status = 0, json = null;
    const res = { status: (s) => { status = s; return res; }, json: (j) => { json = j; return res; }, set: () => res, send: () => res };
    await fns[fn]({ method: "POST", body, headers }, res);
    return { status, ...json };
  };
  return { db, a, call, linkCalls };
}
const CO = "테스트운송사";
const DEV1 = "11111111-2222-3333-4444-555555555555";
const DEV2 = "99999999-8888-7777-6666-555555555555";
const base = () => harness({
  "users/d1": { role: "driver", companyName: CO, name: "김기사", phone: "010-1234-5678", approved: true },
  "drivers/d1": { 전화번호: "010-1234-5678" },
  "users/d9": { role: "driver", companyName: "다른운송", name: "남", phone: "010-9999-0000" },
  "drivers/테스트운송사__경기12가3456": { companyName: CO, 이름: "선등록", 전화번호: "010-5555-6666" },
}, [
  { uid: "d1", email: C.legacyDriverEmail("경기97가1234") },
  { uid: "d9", email: C.legacyDriverEmail("서울11가1111") },
]);

(async () => {
  await t("코어: 이메일은 화면과 같다", async () => {
    const S = await import(path.join(__dirname, "../src/driver/driverEmail.js")).catch(() => null);
    if (!S) return; // 브라우저 전용 import가 있으면 건너뜀
    eq(C.legacyDriverEmail("경기 97가1234"), S.legacyDriverEmail("경기 97가1234").toLowerCase());
    eq(C.scopedDriverEmail(CO, "경기97가1234"), S.scopedDriverEmail(CO, "경기97가1234").toLowerCase());
  });
  await t("코어: 휴대폰 비교 · 기기 판정", async () => {
    eq(C.phoneCheck("01012345678", "010-1234-5678"), "match");
    eq(C.phoneCheck("01012345670", "010-1234-5678"), "mismatch");
    eq(C.phoneCheck("01012345678", "", null), "none");
    eq(C.deviceCheck(null, "a"), "new"); eq(C.deviceCheck({ id: null }, "a"), "new");
    eq(C.deviceCheck({ id: "a" }, "a"), "same"); eq(C.deviceCheck({ id: "b" }, "a"), "other");
  });

  await t("차량번호 + 맞는 휴대폰 → 로그인, 기기 등록, 비밀번호 새로", async () => {
    const h = base();
    const r = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "01012345678", deviceId: DEV1 });
    eq([r.ok, r.device, r.email], [true, "new", C.legacyDriverEmail("경기97가1234")]);
    eq(h.a.byUid.get("d1").password, r.password);
    if (!r.password || r.password.length < 20) throw new Error("약한 비밀번호");
    eq(h.db.store.get("driverDevices/d1").id, C.deviceHash(DEV1));
  });
  await t("같은 휴대폰 다시 로그인 OK · 매번 비밀번호가 바뀐다", async () => {
    const h = base();
    const r1 = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "010-1234-5678", deviceId: DEV1 });
    const r2 = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "010-1234-5678", deviceId: DEV1 });
    eq([r2.ok, r2.device], [true, "same"]);
    if (r1.password === r2.password) throw new Error("비밀번호가 그대로");
  });
  await t("다른 휴대폰 → 거절(DEVICE_MISMATCH), 비밀번호 안 바뀜", async () => {
    const h = base();
    const r1 = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "01012345678", deviceId: DEV1 });
    const r2 = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "01012345678", deviceId: DEV2 });
    eq([r2.ok, r2.code, r2.password], [false, "DEVICE_MISMATCH", undefined]);
    eq(h.a.byUid.get("d1").password, r1.password);
  });
  await t("휴대폰번호 틀림 → PHONE_MISMATCH(기기 등록 안 함)", async () => {
    const h = base();
    const r = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "01000000000", deviceId: DEV1 });
    eq([r.ok, r.code], [false, "PHONE_MISMATCH"]);
    eq(h.db.store.has("driverDevices/d1"), false);
  });
  await t("차량번호만(예전 방식 비밀번호)으로는 안 됨 → BAD_PHONE", async () => {
    const r = await base().call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "경기97가1234", deviceId: DEV1 });
    eq([r.ok, r.code], [false, "BAD_PHONE"]);
  });
  await t("다른 회사 차량번호 → OTHER_COMPANY", async () => {
    const r = await base().call("driverSignIn", { companyName: CO, carNo: "서울11가1111", phone: "01099990000", deviceId: DEV1 });
    eq([r.ok, r.code], [false, "OTHER_COMPANY"]);
  });
  await t("없는 차량번호 → NOT_FOUND", async () => {
    const r = await base().call("driverSignIn", { companyName: CO, carNo: "부산00가0000", phone: "01012345678", deviceId: DEV1 });
    eq([r.ok, r.code], [false, "NOT_FOUND"]);
  });
  await t("PC 선등록 기사: 휴대폰 맞으면 계정 만들고 연결", async () => {
    const h = base();
    const r = await h.call("driverSignIn", { companyName: CO, carNo: "경기12가3456", phone: "010-5555-6666", deviceId: DEV1 });
    eq([r.ok, r.device], [true, "new"]);
    eq(h.linkCalls[0].name, "선등록");
    eq(h.linkCalls[0].email, C.legacyDriverEmail("경기12가3456"));
  });
  await t("PC 선등록 기사: 휴대폰 틀리면 계정 안 만듦", async () => {
    const h = base();
    const r = await h.call("driverSignIn", { companyName: CO, carNo: "경기12가3456", phone: "010-5555-0000", deviceId: DEV1 });
    eq([r.ok, r.code, h.a.byUid.size, h.linkCalls.length], [false, "PHONE_MISMATCH", 2, 0]);
  });
  await t("휴대폰 번호가 등록 안 된 기사 → NO_PHONE", async () => {
    const h = base();
    h.db.store.set("users/d1", { role: "driver", companyName: CO, name: "김기사" }); h.db.store.set("drivers/d1", {});
    const r = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "01012345678", deviceId: DEV1 });
    eq([r.ok, r.code], [false, "NO_PHONE"]);
  });
  await t("가입 화면 중복 확인(owner)", async () => {
    const h = base();
    eq((await h.call("driverSignIn", { mode: "owner", companyName: CO, carNo: "경기97가1234" })).sameCompany, true);
    eq((await h.call("driverSignIn", { mode: "owner", companyName: CO, carNo: "서울11가1111" })).sameCompany, false);
    eq((await h.call("driverSignIn", { mode: "owner", companyName: CO, carNo: "부산00가0000" })).exists, false);
  });
  await t("기기 초기화: 같은 회사 직원 OK → 새 휴대폰 로그인 OK, 예전 로그인 끊김", async () => {
    const h = harness({ "users/d1": { role: "driver", companyName: CO, phone: "010-1234-5678" }, "drivers/d1": {} },
      [{ uid: "d1", email: C.legacyDriverEmail("경기97가1234") }], { "Bearer staff": { uid: "s", co: CO }, "Bearer other": { uid: "o", co: "다른운송" } });
    await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "01012345678", deviceId: DEV1 });
    eq((await h.call("driverResetDevice", { uid: "d1" }, { authorization: "Bearer other" })).status, 403);
    eq((await h.call("driverResetDevice", { uid: "d1" }, {})).status, 401);
    eq((await h.call("driverResetDevice", { uid: "d1" }, { authorization: "Bearer staff" })).ok, true);
    eq(h.a.revoked, ["d1"]);
    const r = await h.call("driverSignIn", { companyName: CO, carNo: "경기97가1234", phone: "01012345678", deviceId: DEV2 });
    eq([r.ok, r.device], [true, "new"]);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
