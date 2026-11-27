// 🔒 2026-11-27 기사 로그인 열쇠(비밀번호 = 기기에 저장한 무작위 값) 점검 — node scripts/driverLoginKey.test.mjs
//  ① 열쇠 만들기 · 저장 · 지우기  ② 가입 · 로그인 화면이 더는 "비밀번호 = 차량번호"로 계정을 만들지 않는지
//  ③ 서버: 열쇠 계정 판정(차량 변경 때 비밀번호를 차량번호로 되돌리지 않음) · 문자 인증 비밀번호 변경이 기사 계정 + 열쇠에도 되는지
import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { newDriverKey, isDriverKey, driverKeys, saveDriverKey, forgetDriverKey } from "../src/driver/driverLoginKey.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass += 1; console.log(`PASS ${name}`); } catch (e) { fail += 1; console.log(`FAIL ${name} :: ${e?.message || e}`); }
}
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

await t("열쇠: 형식 · 매번 다름 · 차량번호 · 휴대폰번호와 겹치지 않음", () => {
  const a = newDriverKey(); const b = newDriverKey();
  assert.ok(isDriverKey(a) && isDriverKey(b)); assert.notStrictEqual(a, b);
  assert.strictEqual(a.length, 35); assert.ok(a.length <= 64, "resetPasswordSms 길이 제한(64) 안");
  assert.ok(!isDriverKey("34바3333")); assert.ok(!isDriverKey("01012345678")); assert.ok(!isDriverKey(""));
});
await t("열쇠: 안전한 무작위가 없으면 만들지 않는다(차량번호로 돌아가지 않음)", () => {
  assert.throws(() => newDriverKey({}));
});
await t("열쇠 저장: 최근 것 맨 앞 · 중복 없음 · 4개까지 · 지우기", () => {
  const s = memStore();
  const ks = [1, 2, 3, 4, 5].map(() => newDriverKey());
  ks.forEach((k) => saveDriverKey(k, s));
  assert.deepStrictEqual(driverKeys(s), [ks[4], ks[3], ks[2], ks[1]]);
  saveDriverKey(ks[2], s);
  assert.deepStrictEqual(driverKeys(s), [ks[2], ks[4], ks[3], ks[1]]);
  forgetDriverKey(ks[4], s);
  assert.deepStrictEqual(driverKeys(s), [ks[2], ks[3], ks[1]]);
  assert.strictEqual(saveDriverKey("34바3333", s), false, "열쇠가 아닌 값은 저장하지 않음");
});
await t("열쇠 저장: 깨진 값 · 저장소 없음에도 오류 없이 빈 목록", () => {
  const s = memStore(); s.setItem("driverLoginKeys", "{깨짐");
  assert.deepStrictEqual(driverKeys(s), []);
  const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepStrictEqual(driverKeys(boom), []); assert.strictEqual(saveDriverKey(newDriverKey(), boom), false); forgetDriverKey("x", boom);
});

await t("가입 · 로그인 화면: 새 계정 비밀번호가 차량번호가 아니다", () => {
  const reg = read("src/driver/DriverRegister.jsx");
  const login = read("src/driver/DriverLogin.jsx");
  assert.ok(!/const password = plate\b/.test(reg), "DriverRegister: password = plate 가 남아 있음");
  assert.ok(!/const password = carNo\b/.test(login), "DriverLogin: password = carNo 가 남아 있음");
  assert.ok(/password = newDriverKey\(\)/.test(reg) && /password = newDriverKey\(\)/.test(login));
  assert.ok(/loginKey: true/.test(reg), "가입 users 문서에 열쇠 계정 표시");
  // 만드는 곳은 모두 열쇠로
  for (const src of [reg, login]) {
    for (const m of src.matchAll(/createUserWithEmailAndPassword\(auth, [^,]+, ([^)]+)\)/g)) assert.strictEqual(m[1].trim(), "password");
  }
});
await t("로그인 화면: 예전 기사(비밀번호 = 차량번호)도 계속 시도한다", () => {
  const em = read("src/driver/driverEmail.js");
  assert.ok(/\.\.\.keys, \.\.\.legacyPws/.test(em), "열쇠 → 차량번호 순서");
});

await t("저장소 정리(캐시 초기화 · 화면 복구 · 용량 정리)가 열쇠를 지우지 않는다", () => {
  for (const f of ["src/main.jsx", "src/safeStorage.js", "src/BlankScreenGuard.jsx"]) assert.ok(read(f).includes("driverLoginKeys"), f);
  assert.strictEqual((read("src/mobile/MobileApp.jsx").match(/"driverLoginSaved", "driverLoginKeys"/g) || []).length, 2, "MobileApp 정리 두 곳");
  assert.ok(!read("src/sessionPurge.js").includes("driverLoginKeys"), "계정 바뀜 정리에도 넣지 않음");
});

const V = require("../functions/driverVehicleCore.js");
await t("서버: 열쇠 계정 판정", () => {
  assert.ok(V.isKeyLogin({ loginKey: true })); assert.ok(V.isKeyLogin({ pwResetBy: "sms" }));
  assert.ok(!V.isKeyLogin({})); assert.ok(!V.isKeyLogin(null)); assert.ok(!V.isKeyLogin({ loginKey: "true" }));
});
await t("서버: 차량 변경 뒤 첫 로그인 — 열쇠 계정은 메일만 바꾼다", () => {
  const src = read("functions/driverVehicle.js");
  assert.ok(/updateUser\(uid, keyLogin \? \{ email \} : \{ email, password \}\)/.test(src));
  assert.ok(/keyLogin: V\.isKeyLogin\(u\)/.test(src) && /m\.pick\.keyLogin === true/.test(src));
});

const { makePasswordResetSms } = require("../functions/passwordResetSms.js");
await t("서버: 문자 인증으로 기사 계정 비밀번호를 새 열쇠로 바꾼다(가입 번호가 맞을 때만)", async () => {
  class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  const m = new Map([["users/d1", { role: "driver", phone: "010-1234-5678", companyName: "에이운송" }]]);
  const db = { doc: (p) => ({ get: async () => ({ exists: m.has(p), data: () => m.get(p) }), set: async (v, o) => { m.set(p, o?.merge ? { ...(m.get(p) || {}), ...v } : v); }, delete: async () => { m.delete(p); } }) };
  const now = 1_800_000_000_000; const pw = {};
  const tokens = { mine: { uid: "ph1", phone_number: "+821012345678", auth_time: now / 1000 }, other: { uid: "ph2", phone_number: "+821099998888", auth_time: now / 1000 } };
  const f = makePasswordResetSms({ db, HttpsError, now: () => now,
    getUserByEmail: async (e) => (e === "34바3333@driver.run25.kr" ? { uid: "d1" } : Promise.reject(new Error("no"))),
    verifyIdToken: async (k) => tokens[k] || Promise.reject(new Error("bad")),
    updatePassword: async (uid, p) => { pw[uid] = p; }, revoke: async () => {}, deleteUser: async () => {} });
  const key = newDriverKey();
  await assert.rejects(f({ email: "34바3333@driver.run25.kr", idToken: "other", newPassword: key }), /맞지 않습니다/);
  assert.strictEqual(pw.d1, undefined);
  assert.deepStrictEqual(await f({ email: "34바3333@driver.run25.kr", idToken: "mine", newPassword: key }), { ok: true });
  assert.strictEqual(pw.d1, key);
  assert.ok(V.isKeyLogin(m.get("users/d1")), "문자 인증 뒤 열쇠 계정으로 판정(pwResetBy:sms)");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
