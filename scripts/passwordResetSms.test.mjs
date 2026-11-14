// 비밀번호 찾기(문자 인증) 서버 점검 — node scripts/passwordResetSms.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { makePasswordResetSms } = require("../functions/passwordResetSms.js");
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const m = new Map();
const db = { doc: (p) => ({ get: async () => ({ exists: m.has(p), data: () => m.get(p) }), set: async (v, o) => { m.set(p, o?.merge ? { ...(m.get(p) || {}), ...v } : v); }, delete: async () => { m.delete(p); } }) };
let t = 1_800_000_000_000; const pw = {}; const revoked = []; const deleted = [];
const tokens = { good: { uid: "ph1", phone_number: "+821012345678", auth_time: t / 1000 }, other: { uid: "ph2", phone_number: "+821099998888", auth_time: t / 1000 } };
const f = makePasswordResetSms({ db, HttpsError, now: () => t,
  getUserByEmail: async (e) => (e === "kim@jy.co.kr" ? { uid: "u1" } : Promise.reject(new Error("no"))),
  verifyIdToken: async (k) => tokens[k] || Promise.reject(new Error("bad")),
  updatePassword: async (uid, p) => { pw[uid] = p; }, revoke: async (uid) => revoked.push(uid), deleteUser: async (uid) => deleted.push(uid) });
m.set("users/u1", { phone: "010-1234-5678" });
let fails = 0;
const ok = (c, n) => { if (c) console.log("✓", n); else { fails++; console.error("✗", n); } };
const rej = async (p, re, n) => { try { await p; ok(false, n); } catch (e) { ok(re.test(e.message), `${n} (${e.message})`); } };
await rej(f({ email: "kim@jy.co.kr", idToken: "good", newPassword: "123" }), /6자 이상/, "짧은 비밀번호 거절");
await rej(f({ email: "kim@jy.co.kr", idToken: "other", newPassword: "newpass1" }), /맞지 않습니다/, "다른 번호 거절");
ok(!pw.u1 && deleted.includes("ph2"), "거절돼도 비밀번호 그대로 · 임시 전화 계정 정리");
await rej(f({ email: "nobody@x.co.kr", idToken: "good", newPassword: "newpass1" }), /맞지 않습니다/, "없는 계정도 같은 문구");
await rej(f({ email: "kim@jy.co.kr", idToken: "bad", newPassword: "newpass1" }), /문자 인증을 확인하지/, "가짜 토큰 거절");
ok((await f({ email: "kim@jy.co.kr", idToken: "good", newPassword: "newpass1" })).ok && pw.u1 === "newpass1" && revoked.includes("u1"), "맞으면 비밀번호 교체 + 다른 기기 로그아웃");
for (let i = 0; i < 5; i++) await f({ email: "x@y.co.kr", idToken: "good", newPassword: "newpass1" }).catch(() => {});
await rej(f({ email: "x@y.co.kr", idToken: "good", newPassword: "newpass1" }), /너무 많습니다/, "1시간 5번 제한");
t += 11 * 60 * 1000;
await rej(f({ email: "kim@jy.co.kr", idToken: "good", newPassword: "newpass2" }), /문자 인증을 확인하지/, "10분 지난 문자 인증 거절");
if (fails) process.exit(1); console.log("\npasswordResetSms: 모두 통과");
