// ⭐ 2026-11-07 급여 비밀번호 서버 함수(functions/payrollPw.js) 단위 테스트 — 메모리 가짜 DB로
//  실행: node scripts/payrollPw.test.cjs
const assert = require("node:assert/strict");
const { makePayrollPw, isPayrollStaff, isPayrollAdmin, pwProblem, hashPw, checkPw } = require("../functions/payrollPw.js");

class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const store = new Map();
const docRef = (col, id) => ({
  id, path: `${col}/${id}`,
  async get() { const d = store.get(`${col}/${id}`); return { exists: !!d, id, data: () => d, ref: docRef(col, id) }; },
  async set(v, opt) { const prev = opt?.merge ? store.get(`${col}/${id}`) || {} : {}; const next = { ...prev }; Object.entries(v).forEach(([k, x]) => { next[k] = x && x.__union ? [...(prev[k] || []), ...x.__union] : x; }); store.set(`${col}/${id}`, next); },
  async delete() { store.delete(`${col}/${id}`); },
});
const db = {
  collection: (col) => ({
    doc: (id) => docRef(col, id),
    where: (f, _op, v) => ({ async get() { const docs = [...store.entries()].filter(([k, d]) => k.startsWith(`${col}/`) && d[f] === v).map(([k]) => { const id = k.slice(col.length + 1); return { id, ref: docRef(col, id) }; }); return { docs }; } }),
  }),
};
const FieldValue = { serverTimestamp: () => "ts", arrayUnion: (...a) => ({ __union: a }) };
const Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms }) };
const api = makePayrollPw({ db, FieldValue, Timestamp, HttpsError });
const ctx = (uid, email = `${uid}@t.kr`) => ({ auth: { uid, token: { email } } });
const CO = "테스트운송";
const user = (id, u) => store.set(`users/${id}`, { companyName: CO, approved: true, ...u });

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`  ✓ ${name}`); };
(async () => {
  user("boss", { role: "test", name: "경리팀장" });
  user("clerk", { role: "acctStaff", name: "경리사원" });
  user("fin", { role: "user", team: "총무팀" });
  user("finAdmin", { role: "admin", team: "회계팀" });
  user("hr", { role: "hrManager" });
  user("ceo", { role: "admin", position: "대표", isMaster: true });

  await t("권한 판단 — 경리·회계·총무만 · 비밀번호는 경리 관리자급", () => {
    assert.equal(isPayrollStaff({ role: "acctStaff" }), true);
    assert.equal(isPayrollStaff({ role: "user", team: "총무팀" }), true);
    assert.equal(isPayrollStaff({ role: "hrManager" }), false);
    assert.equal(isPayrollStaff({ role: "admin", isMaster: true, position: "대표" }), false);
    assert.equal(isPayrollStaff({ role: "driver", team: "경리" }), false);
    assert.equal(isPayrollAdmin({ role: "test" }), true);
    assert.equal(isPayrollAdmin({ role: "acctStaff" }), false);
    assert.equal(isPayrollAdmin({ role: "admin", team: "회계팀" }), true);
    assert.equal(isPayrollAdmin({ role: "user", team: "총무팀" }), false);
    assert.equal(isPayrollAdmin({ role: "totalMaster" }), true);
  });
  await t("해시 — scrypt · 소금마다 다르고 맞는 비밀번호만 통과", () => {
    const a = hashPw("pay2026!"); const b = hashPw("pay2026!");
    assert.notEqual(a.hash, b.hash); assert.equal(checkPw("pay2026!", a), true); assert.equal(checkPw("pay2026?", a), false);
    assert.ok(pwProblem("12345")); assert.ok(pwProblem("111111")); assert.equal(pwProblem("pay2026!"), "");
  });
  await t("처음: 비밀번호 없음 · 경리사원은 못 정함 · 인사는 담당 아님", async () => {
    const s = await api.status({}, ctx("clerk")); assert.equal(s.hasPassword, false); assert.equal(s.admin, false);
    await assert.rejects(api.setPw({ newPassword: "pay2026!" }, ctx("clerk")), /경리 관리자/);
    assert.equal((await api.status({}, ctx("hr"))).staff, false);
    await assert.rejects(api.verify({ password: "x" }, ctx("ceo")), /경리 담당자/);
  });
  await t("경리 관리자가 정하면 본인은 바로 잠금 해제(30분)", async () => {
    const r = await api.setPw({ newPassword: "pay2026!" }, ctx("boss"));
    assert.equal(r.ok, true); assert.ok(r.expiresAt > Date.now() + 29 * 60000);
    assert.equal(store.get("payrollUnlocks/boss").companyName, CO);
    assert.equal(store.get(`payrollSecrets/${CO}`).hash.length, 64);
    assert.equal(store.get(`payrollSecrets/${CO}`).newPassword, undefined);
  });
  await t("담당자 확인 — 맞으면 잠금 해제 · 틀리면 남은 횟수 · 5번 틀리면 잠김", async () => {
    assert.equal((await api.verify({ password: "pay2026!" }, ctx("clerk"))).ok, true);
    assert.ok(store.get("payrollUnlocks/clerk"));
    for (let i = 4; i >= 1; i--) assert.equal((await api.verify({ password: "nope" }, ctx("fin"))).left, i);
    const locked = await api.verify({ password: "nope" }, ctx("fin"));
    assert.equal(locked.ok, false); assert.ok(locked.lockUntil > Date.now());
    const still = await api.verify({ password: "pay2026!" }, ctx("fin"));
    assert.equal(still.ok, false); assert.ok(still.lockUntil, "잠긴 동안에는 맞는 비밀번호도 거절");
    assert.equal(store.get("payrollUnlocks/fin"), undefined);
  });
  await t("바꾸기 — 지금 비밀번호 필요 · 바꾸면 다른 담당자 잠금 해제는 풀림", async () => {
    await assert.rejects(api.setPw({ newPassword: "newpay77", currentPassword: "wrong" }, ctx("finAdmin")), /맞지 않/);
    const r = await api.setPw({ newPassword: "newpay77", currentPassword: "pay2026!" }, ctx("finAdmin"));
    assert.equal(r.changed, true);
    assert.equal(store.get("payrollUnlocks/clerk"), undefined); assert.equal(store.get("payrollUnlocks/boss"), undefined);
    assert.ok(store.get("payrollUnlocks/finAdmin"));
    assert.equal((await api.verify({ password: "pay2026!" }, ctx("clerk"))).ok, false);
    assert.equal((await api.verify({ password: "newpay77" }, ctx("clerk"))).ok, true);
  });
  await t("지금 잠그기 — 잠금 해제 문서 삭제", async () => {
    await api.lock({}, ctx("clerk")); assert.equal(store.get("payrollUnlocks/clerk"), undefined);
    assert.equal((await api.status({}, ctx("clerk"))).unlockedUntil, 0);
  });
  await t("다른 회사 이름을 보내도 내 회사 기준(최고관리자만 회사 지정)", async () => {
    user("other", { role: "test", companyName: "다른운송" });
    const s = await api.status({ company: CO }, ctx("other")); assert.equal(s.company, "다른운송"); assert.equal(s.hasPassword, false);
  });
  console.log(`\n급여 비밀번호 테스트 ${n}개 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
