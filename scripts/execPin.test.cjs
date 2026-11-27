// 🔐 2026-11-27 인사이트 · 지입차관리 PIN 서버 함수(functions/execPin.js) 단위 테스트 — 메모리 가짜 DB로
//  실행: node scripts/execPin.test.cjs
//  화면 계산(src/execPinCore.js)이 서버와 같은 답을 내는지도 같이 본다
const assert = require("node:assert/strict");
const { makeExecPin, pinProblem, isExecPinStaff, canResetExecPin, hashPin, checkPin, lockMinutesFor } = require("../functions/execPin.js");

class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const store = new Map();
const docRef = (col, id) => ({
  id,
  async get() { const d = store.get(`${col}/${id}`); return { exists: !!d, id, data: () => d }; },
  async set(v, opt) { const prev = opt?.merge ? store.get(`${col}/${id}`) || {} : {}; store.set(`${col}/${id}`, { ...prev, ...v }); },
  async delete() { store.delete(`${col}/${id}`); },
});
const db = { collection: (col) => ({ doc: (id) => docRef(col, id) }) };
const FieldValue = { serverTimestamp: () => "ts" };
const api = makeExecPin({ db, FieldValue, HttpsError });
const ctx = (uid, email = `${uid}@t.kr`) => ({ auth: { uid, token: { email } } });
const CO = "테스트운송";
const user = (id, u) => store.set(`users/${id}`, { companyName: CO, approved: true, role: "user", email: `${id}@t.kr`, ...u });

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`  ✓ ${name}`); };
(async () => {
  const core = await import("../src/execPinCore.js");
  user("boss", { role: "admin", isMaster: true });
  user("adm", { role: "admin" });
  user("staff", { role: "user" });
  user("staff2", { role: "test" });
  user("drv", { role: "driver" });
  user("ship", { role: "shipper" });
  user("cafe", { role: "cafeUser" });
  user("gone", { employmentStatus: "퇴사" });
  user("wait", { approved: false });
  user("legacy", { approved: undefined });
  user("other", { companyName: "다른운송", role: "admin", isMaster: true });
  user("tm", { role: "totalMaster", companyName: "" });
  user("guest", { companyName: "다른운송", multiCompanies: [CO], activeCompany: CO, role: "admin", isMaster: true }); // 우리 회사에 손님으로

  await t("PIN 규칙 — 숫자 4~8자리 · 쉬운 번호 거절 · 화면과 같은 답", () => {
    const cases = ["0000", "1234", "1111", "123456", "654321", "111111", "12345678", "abc123", "12", "123456789", "135790", "482915", " 482915 ", "４８２９１５", "2468"];
    cases.forEach((c) => assert.equal(core.pinProblem(c), pinProblem(c), `화면 · 서버 다름: ${c}`));
    ["0000", "1234", "1111", "123456", "654321", "111111", "9876"].forEach((c) => assert.match(pinProblem(c), /쉬운/));
    assert.match(pinProblem("abc123"), /숫자/); assert.match(pinProblem("12"), /4자리/); assert.match(pinProblem("123456789"), /8자리/);
    ["482915", "135790", "2468", "４８２９１５"].forEach((c) => assert.equal(pinProblem(c), ""));
    assert.deepEqual([0, 1, 2, 9].map(lockMinutesFor), [10, 30, 60, 60]);
  });
  await t("해시 — scrypt · 소금마다 다르고 맞는 번호만 통과", async () => {
    const a = await hashPin("482915"); const b = await hashPin("482915");
    assert.notEqual(a.hash, b.hash); assert.equal(await checkPin("482915", a), true); assert.equal(await checkPin("482916", a), false); assert.equal(await checkPin("482915", null), false);
  });
  await t("누가 쓰나 — 승인된 직원만(기사 · 화주 · 오더마켓 · 퇴사 · 승인 대기 제외)", async () => {
    assert.equal((await api.status({}, ctx("staff"))).staff, true);
    assert.equal((await api.status({}, ctx("legacy"))).staff, true, "예전 계정(approved 없음)은 승인으로");
    assert.equal((await api.status({}, ctx("tm"))).staff, true, "최고관리자는 회사 없이도");
    for (const id of ["drv", "ship", "cafe", "gone", "wait", "nobody"]) assert.equal((await api.status({}, ctx(id))).staff, false, id);
    await assert.rejects(api.verify({ pin: "482915" }, ctx("drv")), /승인된 직원/);
    await assert.rejects(api.setPin({ newPin: "482915" }, ctx("gone")), /승인된 직원/);
    await assert.rejects(api.status({}, {}), /로그인/);
    assert.equal(isExecPinStaff({ role: "user", companyName: "" }), false);
  });
  await t("처음 — 서버에 PIN 없음 → verify 는 needSet · 정하면 hash 만 저장", async () => {
    assert.equal((await api.status({}, ctx("staff"))).hasPin, false);
    assert.equal((await api.verify({ pin: "482915" }, ctx("staff"))).needSet, true);
    await assert.rejects(api.setPin({ newPin: "123456" }, ctx("staff")), /쉬운/);
    const r = await api.setPin({ newPin: "482915" }, ctx("staff"));
    assert.equal(r.ok, true); assert.equal(r.changed, false);
    const rec = store.get("execPins/staff");
    assert.equal(rec.companyName, CO); assert.equal(rec.hash.length, 64); assert.equal(rec.newPin, undefined); assert.equal(JSON.stringify(rec).includes("482915"), false);
    assert.equal((await api.status({}, ctx("staff"))).hasPin, true);
  });
  await t("확인 — 맞으면 통과 · 틀리면 남은 횟수 · 5번 틀리면 10분 잠금(맞는 번호도 거절)", async () => {
    assert.equal((await api.verify({ pin: "482915" }, ctx("staff"))).ok, true);
    for (let i = 4; i >= 1; i--) assert.equal((await api.verify({ pin: "000001" }, ctx("staff"))).left, i);
    const locked = await api.verify({ pin: "000001" }, ctx("staff"));
    assert.equal(locked.ok, false); assert.ok(locked.lockUntil > Date.now() + 9 * 60000 && locked.lockUntil <= Date.now() + 10 * 60000);
    const still = await api.verify({ pin: "482915" }, ctx("staff"));
    assert.equal(still.ok, false); assert.ok(still.lockUntil);
    assert.ok((await api.status({}, ctx("staff"))).lockUntil > Date.now());
    assert.match(core.verifyMessage(still), /잠겼어요\. 10분 뒤/);
    assert.match(core.verifyMessage({ ok: false, left: 3 }), /3번 남았어요/);
  });
  await t("잠금이 풀린 뒤 또 5번 틀리면 30분", async () => {
    const a = store.get("execPinAttempts/staff"); store.set("execPinAttempts/staff", { ...a, lockUntil: Date.now() - 1 });
    for (let i = 0; i < 4; i++) await api.verify({ pin: "000001" }, ctx("staff"));
    const r = await api.verify({ pin: "000001" }, ctx("staff"));
    assert.ok(r.lockUntil > Date.now() + 29 * 60000);
    store.delete("execPinAttempts/staff");
  });
  await t("바꾸기 — 지금 PIN 이 필요하고, 틀리면 verify 와 같은 횟수 · 잠금", async () => {
    await assert.rejects(api.setPin({ newPin: "739104" }, ctx("staff")), /지금 PIN 이 맞지 않아요 \(4번 남았어요\)/);
    for (let i = 3; i >= 1; i--) await assert.rejects(api.setPin({ newPin: "739104", currentPin: "000001" }, ctx("staff")), new RegExp(`${i}번 남았어요`));
    await assert.rejects(api.setPin({ newPin: "739104", currentPin: "000001" }, ctx("staff")), (e) => e.code === "resource-exhausted" && /10분 동안 잠겼어요/.test(e.message));
    await assert.rejects(api.setPin({ newPin: "739104", currentPin: "482915" }, ctx("staff")), (e) => e.code === "resource-exhausted");
    store.delete("execPinAttempts/staff");
    const r = await api.setPin({ newPin: "739104", currentPin: "482915" }, ctx("staff"));
    assert.equal(r.changed, true);
    assert.equal((await api.verify({ pin: "482915" }, ctx("staff"))).ok, false);
    assert.equal((await api.verify({ pin: "739104" }, ctx("staff"))).ok, true);
  });
  await t("PIN 은 사람별 — 같은 회사 다른 직원 번호로는 안 열림", async () => {
    await api.setPin({ newPin: "582039" }, ctx("staff2"));
    assert.equal((await api.verify({ pin: "739104" }, ctx("staff2"))).ok, false);
    assert.equal((await api.verify({ pin: "582039" }, ctx("staff2"))).ok, true);
  });
  await t("초기화 — 본인 · 일반 직원 · 다른 회사 · 손님 회사 관리자는 못 함", async () => {
    await assert.rejects(api.reset({ uid: "staff" }, ctx("staff")), /본인 PIN/);
    await assert.rejects(api.reset({ uid: "boss" }, ctx("boss")), /본인 PIN/);
    await assert.rejects(api.reset({ uid: "staff" }, ctx("staff2")), /마스터/);
    await assert.rejects(api.reset({ uid: "staff" }, ctx("other")), /마스터/);
    await assert.rejects(api.reset({ uid: "staff" }, ctx("guest")), /마스터/, "다른 회사로 들어온 사람은 통합관리자라 초기화 못 함");
    await assert.rejects(api.reset({ uid: "staff" }, ctx("drv")), /마스터/);
    await assert.rejects(api.reset({ uid: "tm" }, ctx("boss")), /마스터/, "최고관리자 PIN 은 회사 마스터가 못 지움");
    await assert.rejects(api.reset({ uid: "a/b" }, ctx("boss")), /누구의/);
    assert.ok(store.get("execPins/staff"));
  });
  await t("초기화 — 같은 회사 마스터 · 관리자 · 최고관리자 → 지우면 다음에 새로 정함 · 잠금도 풀림", async () => {
    for (let i = 0; i < 5; i++) await api.verify({ pin: "000001" }, ctx("staff"));
    assert.ok(store.get("execPinAttempts/staff").lockUntil > Date.now());
    const r = await api.reset({ uid: "staff" }, ctx("boss"));
    assert.equal(r.ok, true); assert.equal(r.had, true);
    assert.equal(store.get("execPins/staff"), undefined); assert.equal(store.get("execPinAttempts/staff"), undefined);
    assert.equal((await api.verify({ pin: "739104" }, ctx("staff"))).needSet, true);
    await api.setPin({ newPin: "604918" }, ctx("staff"));
    assert.equal((await api.reset({ uid: "staff" }, ctx("adm"))).had, true, "같은 회사 관리자(admin)");
    assert.equal((await api.reset({ uid: "staff2" }, ctx("tm", "tjddnqkf@naver.com"))).had, true, "최고관리자");
    assert.equal((await api.reset({ uid: "staff2" }, ctx("tm"))).had, false, "없으면 had=false");
    assert.equal(canResetExecPin({ role: "user", companyName: "x" }, "tjddnqkf@naver.com", "a", { companyName: "y" }, "b"), true, "최고관리자 이메일");
  });
  await t("미리 깨우기(warm)는 아무것도 안 읽고 쓴다", async () => {
    for (const f of ["status", "setPin", "verify", "reset"]) assert.equal((await api[f]({ warm: true }, {})).warm, true);
  });
  await t("화면 — 예전 기기 PIN 키 · 서버 연결 오류 알아보기", () => {
    assert.ok(core.LEGACY_PIN_KEYS.includes("exec_intel_pin_v1"));
    assert.equal(core.isNetErr(new Error("Failed to fetch")), true);
    assert.equal(core.isNetErr(new Error("요청 실패(404)")), true);
    assert.equal(core.isNetErr(new Error("PIN 이 맞지 않아요")), false);
    assert.equal(core.lockMinutesLeft(Date.now() + 61000), 2); assert.equal(core.lockMinutesLeft(Date.now() - 1), 0);
  });
  console.log(`\n인사이트 PIN 테스트 ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
