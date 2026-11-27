// 🔐 2026-11-27 매출관리 비밀번호 서버 함수(functions/revenuePw.js) 단위 테스트 — 메모리 가짜 DB로
//  실행: node scripts/revenuePw.test.cjs
//  예전 글자 비밀번호(companySettings.revenuePassword) 옮기기 · 잠금 · 권한(확인 · 정하기) · 화면 코드에 예전 칸이 안 남았는지
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeRevenuePw, pwProblem, hashPw, checkPw, canSetRevenuePw, coKey } = require("../functions/revenuePw.js");

class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const DEL = Symbol("delete");
const store = new Map();
const docRef = (col, id) => ({
  id,
  async get() { const d = store.get(`${col}/${id}`); return { exists: !!d, id, data: () => d }; },
  async set(v, opt) { const prev = opt?.merge ? store.get(`${col}/${id}`) || {} : {}; store.set(`${col}/${id}`, { ...prev, ...v }); },
  async create(v) { if (store.has(`${col}/${id}`)) throw new Error("already exists"); store.set(`${col}/${id}`, { ...v }); },
  async update(v) {
    const prev = store.get(`${col}/${id}`);
    if (!prev) throw new Error("not found");
    const next = { ...prev };
    Object.entries(v).forEach(([k, x]) => { if (x === DEL) delete next[k]; else next[k] = x; });
    store.set(`${col}/${id}`, next);
  },
  async delete() { store.delete(`${col}/${id}`); },
});
const db = { collection: (col) => ({ doc: (id) => docRef(col, id) }) };
const FieldValue = { serverTimestamp: () => "ts", delete: () => DEL };
const api = makeRevenuePw({ db, FieldValue, HttpsError });
const ctx = (uid, email = `${uid}@t.kr`) => ({ auth: { uid, token: { email } } });
const CO = "테스트운송";
const CO2 = "옛날운송";
const user = (id, u) => store.set(`users/${id}`, { companyName: CO, approved: true, role: "user", email: `${id}@t.kr`, ...u });

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`  ✓ ${name}`); };
(async () => {
  const ui = await import("../src/execPinCore.js");
  user("boss", { role: "admin", isMaster: true });
  user("adm", { role: "admin" });
  user("staff", { role: "user" });
  user("staff2", { role: "test" });
  user("drv", { role: "driver" });
  user("ship", { role: "shipper" });
  user("cafe", { role: "cafeUser" });
  user("gone", { employmentStatus: "퇴사" });
  user("wait", { approved: false });
  user("tm", { role: "totalMaster", companyName: "" });
  user("guest", { companyName: "다른운송", multiCompanies: [CO], activeCompany: CO, role: "admin", isMaster: true }); // 우리 회사에 손님으로
  user("old1", { companyName: CO2, role: "admin" });
  user("old2", { companyName: CO2, role: "user" });
  user("oldBoss", { companyName: CO2, role: "admin", isMaster: true });
  store.set(`companySettings/${CO2}`, { companyName: CO2, revenuePassword: "1234", bizList: ["a"] });

  await t("비밀번호 규칙 — 4~64자 · 빈 칸 거절", () => {
    assert.match(pwProblem(""), /넣어/); assert.match(pwProblem("   "), /넣어/); assert.match(pwProblem("abc"), /4자리/);
    assert.match(pwProblem("x".repeat(65)), /64자/); assert.equal(pwProblem("abcd"), ""); assert.equal(pwProblem("매출비번1"), "");
    assert.equal(coKey("A/B운송"), "A_B운송");
  });
  await t("해시 — scrypt · 소금마다 다르고 글자 그대로 비교(앞뒤 공백도)", async () => {
    const a = await hashPw("abcd"); const b = await hashPw("abcd");
    assert.notEqual(a.hash, b.hash); assert.equal(await checkPw("abcd", a), true);
    assert.equal(await checkPw("abcd ", a), false); assert.equal(await checkPw("ABCD", a), false); assert.equal(await checkPw("abcd", null), false);
  });
  await t("누가 확인하나 — 승인된 직원만(기사 · 화주 · 오더마켓 · 퇴사 · 승인 대기 제외)", async () => {
    assert.equal((await api.status({}, ctx("staff"))).staff, true);
    assert.equal((await api.status({}, ctx("guest"))).staff, true, "손님 회사로 들어와도 확인은 된다");
    for (const id of ["drv", "ship", "cafe", "gone", "wait", "nobody"]) assert.equal((await api.status({}, ctx(id))).staff, false, id);
    await assert.rejects(api.verify({ pw: "abcd" }, ctx("drv")), /승인된 직원/);
    await assert.rejects(api.setPw({ newPw: "abcd" }, ctx("ship")), /승인된 직원/);
    await assert.rejects(api.status({}, {}), /로그인/);
  });
  await t("누가 정하나 — 회사 마스터 · 최고관리자만(관리자 · 직원 · 손님 마스터는 안 됨)", async () => {
    assert.equal((await api.status({}, ctx("boss"))).canSet, true);
    assert.equal((await api.status({ company: CO }, ctx("tm"))).canSet, true);
    for (const id of ["adm", "staff", "staff2", "guest"]) {
      assert.equal((await api.status({}, ctx(id))).canSet, false, id);
      await assert.rejects(api.setPw({ newPw: "abcd5678" }, ctx(id)), /마스터 · 최고관리자만/, id);
    }
    assert.equal(canSetRevenuePw({ role: "user", companyName: "x" }, "tjddnqkf@naver.com"), true, "최고관리자 이메일");
    assert.equal(store.get(`revenuePws/${CO}`), undefined);
  });
  await t("처음 — 비밀번호 없음 → verify 는 needSet(정할 수 없는 사람은 못 연다) · 마스터가 정하면 hash 만 저장", async () => {
    const st = await api.status({}, ctx("staff"));
    assert.equal(st.hasPw, false); assert.equal(st.canSet, false);
    const v = await api.verify({ pw: "abcd" }, ctx("staff"));
    assert.equal(v.ok, false); assert.equal(v.needSet, true); assert.equal(v.canSet, false);
    await assert.rejects(api.setPw({ newPw: "abc" }, ctx("boss")), /4자리/);
    const r = await api.setPw({ newPw: "회사비번77" }, ctx("boss"));
    assert.equal(r.ok, true); assert.equal(r.changed, false);
    const rec = store.get(`revenuePws/${CO}`);
    assert.equal(rec.companyName, CO); assert.equal(rec.hash.length, 64); assert.equal(rec.updatedBy, "boss");
    assert.equal(JSON.stringify(rec).includes("회사비번77"), false);
    assert.equal((await api.status({}, ctx("staff"))).hasPw, true);
  });
  await t("회사 하나에 하나 — 같은 회사 누구나 같은 비밀번호 · 다른 회사는 따로", async () => {
    for (const id of ["staff", "staff2", "adm", "guest"]) assert.equal((await api.verify({ pw: "회사비번77" }, ctx(id))).ok, true, id);
    await assert.rejects(api.verify({ pw: "회사비번77" }, ctx("tm")), /회사 정보가 없어요/, "최고관리자가 회사를 안 고르면(자기 회사 없음)");
    assert.equal((await api.verify({ pw: "회사비번77", company: CO }, ctx("tm"))).ok, true, "최고관리자는 고른 회사");
    assert.equal((await api.verify({ pw: "회사비번77", company: CO }, ctx("staff"))).ok, true, "직원은 company 를 보내도 자기 회사");
    assert.equal((await api.verify({ pw: "1234", company: CO2 }, ctx("adm"))).ok, false, "직원이 다른 회사 이름을 보내도 소용없다");
  });
  await t("확인 — 틀리면 남은 횟수 · 5번 틀리면 10분 잠금(맞는 비밀번호도 거절) · 사람별", async () => {
    for (let i = 4; i >= 1; i--) assert.equal((await api.verify({ pw: "nope" }, ctx("staff"))).left, i);
    const locked = await api.verify({ pw: "nope" }, ctx("staff"));
    assert.equal(locked.ok, false); assert.ok(locked.lockUntil > Date.now() + 9 * 60000 && locked.lockUntil <= Date.now() + 10 * 60000);
    const still = await api.verify({ pw: "회사비번77" }, ctx("staff"));
    assert.equal(still.ok, false); assert.ok(still.lockUntil);
    assert.ok((await api.status({}, ctx("staff"))).lockUntil > Date.now());
    assert.equal((await api.verify({ pw: "회사비번77" }, ctx("staff2"))).ok, true, "다른 직원은 안 잠김");
    assert.ok(ui.lockMinutesLeft(still.lockUntil) === 10);
  });
  await t("잠금이 풀린 뒤 또 5번 틀리면 30분 · 맞히면 횟수 지움", async () => {
    const a = store.get("revenuePwAttempts/staff"); store.set("revenuePwAttempts/staff", { ...a, lockUntil: Date.now() - 1 });
    for (let i = 0; i < 4; i++) await api.verify({ pw: "nope" }, ctx("staff"));
    const r = await api.verify({ pw: "nope" }, ctx("staff"));
    assert.ok(r.lockUntil > Date.now() + 29 * 60000);
    store.set("revenuePwAttempts/staff", { ...store.get("revenuePwAttempts/staff"), lockUntil: 0 });
    assert.equal((await api.verify({ pw: "회사비번77" }, ctx("staff"))).ok, true);
    assert.equal(store.get("revenuePwAttempts/staff"), undefined);
  });
  await t("바꾸기 — 지금 비밀번호가 필요하고, 틀리면 verify 와 같은 횟수 · 잠금", async () => {
    await assert.rejects(api.setPw({ newPw: "새비번2026" }, ctx("boss")), /지금 비밀번호가 맞지 않아요 \(4번 남았어요\)/);
    for (let i = 3; i >= 1; i--) await assert.rejects(api.setPw({ newPw: "새비번2026", currentPw: "x" }, ctx("boss")), new RegExp(`${i}번 남았어요`));
    await assert.rejects(api.setPw({ newPw: "새비번2026", currentPw: "x" }, ctx("boss")), (e) => e.code === "resource-exhausted" && /10분 동안 잠겼어요/.test(e.message));
    await assert.rejects(api.setPw({ newPw: "새비번2026", currentPw: "회사비번77" }, ctx("boss")), (e) => e.code === "resource-exhausted");
    store.delete("revenuePwAttempts/boss");
    const r = await api.setPw({ newPw: "새비번2026", currentPw: "회사비번77" }, ctx("boss"));
    assert.equal(r.changed, true);
    assert.equal((await api.verify({ pw: "회사비번77" }, ctx("staff2"))).ok, false);
    assert.equal((await api.verify({ pw: "새비번2026" }, ctx("staff2"))).ok, true);
  });
  await t("잊었을 때 새로 정하기(forgot) — 마스터 · 최고관리자는 지금 비밀번호 없이 · 다른 사람은 안 됨", async () => {
    await assert.rejects(api.setPw({ newPw: "잊음다시1", forgot: true }, ctx("adm")), /마스터 · 최고관리자만/);
    await assert.rejects(api.setPw({ newPw: "잊음다시1", forgot: true }, ctx("guest")), /마스터 · 최고관리자만/);
    assert.equal((await api.setPw({ newPw: "잊음다시1", forgot: true }, ctx("boss"))).changed, true);
    assert.equal((await api.verify({ pw: "잊음다시1" }, ctx("staff2"))).ok, true);
    assert.equal((await api.setPw({ newPw: "최고가정함", forgot: true, company: CO }, ctx("tm", "tjddnqkf@naver.com"))).changed, true);
    assert.equal((await api.verify({ pw: "최고가정함" }, ctx("staff2"))).ok, true);
  });
  await t("옮기기 — 예전 글자 비밀번호로 처음 확인하면 해시로 옮기고 회사 문서 칸을 지운다(다른 칸은 그대로)", async () => {
    const st = await api.status({}, ctx("old2"));
    assert.equal(st.hasPw, true, "예전 비밀번호가 있으면 있음으로");
    const rec = store.get(`revenuePws/${CO2}`);
    assert.ok(rec?.hash); assert.equal(rec.updatedBy, "migrate"); assert.equal(JSON.stringify(rec).includes("1234"), false);
    const cs = store.get(`companySettings/${CO2}`);
    assert.equal("revenuePassword" in cs, false); assert.deepEqual(cs.bizList, ["a"]); assert.equal(cs.companyName, CO2);
    assert.equal((await api.verify({ pw: "1234" }, ctx("old1"))).ok, true, "쓰던 비밀번호 그대로");
    assert.equal((await api.verify({ pw: "12345" }, ctx("old1"))).left, 4);
  });
  await t("옮기기 — status 없이 verify 가 처음이어도 · 빈 값(null)은 칸만 지우고 없음으로", async () => {
    store.set("companySettings/셋째운송", { revenuePassword: "옛비번99", workWeekdays: [1, 2] });
    store.set("companySettings/넷째운송", { revenuePassword: null, x: 1 });
    user("third", { companyName: "셋째운송" }); user("fourth", { companyName: "넷째운송" }); user("fourthBoss", { companyName: "넷째운송", isMaster: true, role: "admin" });
    assert.equal((await api.verify({ pw: "옛비번99" }, ctx("third"))).ok, true);
    assert.deepEqual(store.get("companySettings/셋째운송"), { workWeekdays: [1, 2] });
    assert.equal((await api.verify({ pw: "x" }, ctx("fourth"))).needSet, true);
    assert.deepEqual(store.get("companySettings/넷째운송"), { x: 1 });
    assert.equal(store.get("revenuePws/넷째운송"), undefined);
    assert.equal((await api.status({}, ctx("fourthBoss"))).canSet, true);
  });
  await t("옮기기 — 해시가 이미 있으면 남은 예전 칸은 쓰지 않는다(지우기만)", async () => {
    store.set(`companySettings/${CO}`, { revenuePassword: "옛날값" });
    assert.equal((await api.verify({ pw: "옛날값" }, ctx("staff2"))).ok, false);
    assert.equal((await api.verify({ pw: "최고가정함" }, ctx("staff2"))).ok, true);
    assert.equal(store.get(`companySettings/${CO}`).revenuePassword, "옛날값", "해시가 있으면 회사 문서는 안 읽는다(화면은 이 칸을 못 쓴다 — 규칙)");
    await api.setPw({ newPw: "최고가정함", forgot: true }, ctx("boss"));
    assert.equal("revenuePassword" in store.get(`companySettings/${CO}`), false, "새로 정할 때 남은 예전 칸도 지운다");
  });
  await t("미리 깨우기(warm)는 아무것도 안 읽고 쓴다", async () => {
    for (const f of ["status", "setPw", "verify"]) assert.equal((await api[f]({ warm: true }, {})).warm, true);
  });
  await t("화면 코드 — 회사 문서의 revenuePassword 를 읽거나 쓰는 코드가 없다 · 공용 호출 파일을 쓴다", () => {
    const root = path.join(__dirname, "..");
    // 🧩 2026-11-27 DispatchApp.jsx 를 화면별 파일(src/dispatch/**)로 나눴다 — 화면 코드 검사는 그 파일들까지 합쳐서 본다
    const pc = [path.join(root, "src/DispatchApp.jsx"), ...fs.readdirSync(path.join(root, "src/dispatch"), { recursive: true }).filter((f) => /\.jsx?$/.test(f)).sort().map((f) => path.join(root, "src/dispatch", f))].map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const mo = fs.readFileSync(path.join(root, "src/mobile/MobileApp.jsx"), "utf8");
    const apiSrc = fs.readFileSync(path.join(root, "src/revenuePwApi.js"), "utf8");
    for (const [name, src] of [["DispatchApp", pc], ["MobileApp", mo], ["revenuePwApi", apiSrc]]) {
      const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      assert.equal(/revenuePassword/.test(code), false, `${name} 에 revenuePassword 코드가 남았다`);
    }
    assert.match(pc, /from "\.\/revenuePwApi"/); assert.match(mo, /from "\.\.\/revenuePwApi"/);
    for (const fn of ["revenuePwStatus", "revenuePwVerify", "revenuePwSet"]) assert.match(apiSrc, new RegExp(`"${fn}"`));
    const idx = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
    for (const fn of ["revenuePwStatus", "revenuePwVerify", "revenuePwSet"]) assert.match(idx, new RegExp(`exports\\.${fn} = payCall`));
    const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
    assert.match(rules, /match \/revenuePws\/\{key\} \{\s*allow read, write: if false;/);
    assert.match(rules, /match \/revenuePwAttempts\/\{uid\} \{\s*allow read, write: if false;/);
    assert.match(rules, /'revenuePws', 'revenuePwAttempts',/);
    assert.match(rules, /affectedKeys\(\)\.hasAny\(\['revenuePassword'\]\)/);
  });
  console.log(`\n매출 비밀번호 테스트 ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
