// 일반 계정 2차 인증(선택) · 얼굴/지문 로그인 서버 점검 — node scripts/userMfa.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { makePnkMfa } = require("../functions/pnkMfa.js");

class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const Timestamp = { fromMillis: (ms) => ({ ms, toMillis: () => ms }) };
function fakeDb() {
  const m = new Map();
  const merge = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === "object" && !Array.isArray(v) && o[k] && typeof o[k] === "object" ? merge(o[k], v) : v; return o; };
  const doc = (p) => ({
    get: async () => ({ exists: m.has(p), data: () => (m.has(p) ? structuredClone(m.get(p)) : undefined) }),
    set: async (v, o) => { m.set(p, o?.merge ? merge(m.get(p), v) : structuredClone(v)); },
    delete: async () => { m.delete(p); },
  });
  const collection = (c) => ({ where: (f, _op, v) => ({ get: async () => ({ docs: [...m.entries()].filter(([k, d]) => k.startsWith(`${c}/`) && k.split("/").length === 2 && d[f] === v).map(([k, d]) => ({ id: k.split("/")[1], data: () => structuredClone(d) })) }) }) });
  return { doc, collection, m };
}
let fails = 0;
const eq = (a, b, name) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.error("✗", name, "\n  got ", JSON.stringify(a), "\n  want", JSON.stringify(b)); } else console.log("✓", name); };
const rejects = async (p, re, name) => { try { await p; fails++; console.error("✗", name, "(통과해 버림)"); } catch (e) { if (re.test(e.message)) console.log("✓", name); else { fails++; console.error("✗", name, e.message); } } };

const db = fakeDb();
let t = 1_700_000_000_000;
const mfa = makePnkMfa({ db, HttpsError, Timestamp, now: () => t });
const ctx = (uid, email = `${uid}@x.com`) => ({ auth: { uid, token: { email, auth_time: 111 } } });
await db.doc("users/u1").set({ role: "user", companyName: "JY" });

// ── 일반 계정: 처음엔 끄진 상태 ──
eq((await mfa({ action: "status", app: "logis" }, ctx("u1"))).required, false, "일반 계정은 기본으로 2차 인증 없음");
eq((await mfa({ action: "verify", code: "x" }, ctx("u1"))).required, false, "안 켠 계정은 verify 가 그냥 통과");
await rejects(mfa({ action: "setup", kind: "pin", code: "1234" }, ctx("u1")), /숫자 8자리/, "PIN은 숫자 8자리만");
await rejects(mfa({ action: "setup", kind: "pin", code: "12345678" }, ctx("u1")), /쉬운/, "너무 쉬운 PIN 거절");
eq((await mfa({ action: "setup", kind: "pin", code: "58203917" }, ctx("u1"))).opt, true, "PIN 8자리로 켜기");
eq(db.m.get("users/u1").mfaOpt, true, "users.mfaOpt = true 기록");
const st = await mfa({ action: "status" }, ctx("u1"));
eq([st.required, st.kind], [true, "pin"], "켠 뒤 status = 필요 · pin");
await rejects(mfa({ action: "verify", code: "11112222" }, ctx("u1")), /맞지 않습니다 \(1\/5\)/, "틀리면 1/5");
eq((await mfa({ action: "verify", code: "58203917" }, ctx("u1"))).ok, true, "맞으면 통과(문자 인증 없음)");
eq(db.m.get("pnkMfaSecrets/u1").fails, 0, "맞으면 틀린 횟수 초기화");
for (let i = 0; i < 4; i++) await mfa({ action: "verify", code: "00001111" }, ctx("u1")).catch(() => {});
await rejects(mfa({ action: "verify", code: "00001111" }, ctx("u1")), /잠겼습니다/, "5번 틀리면 잠금");
await rejects(mfa({ action: "verify", code: "58203917" }, ctx("u1")), /잠겼습니다/, "잠긴 동안은 맞아도 막힘");
t += 11 * 60 * 1000;
eq((await mfa({ action: "change", code: "58203917", kind: "keypad", newCode: "Abcd7890" }, ctx("u1"))).kind, "keypad", "키패드 방식으로 바꾸기");
eq((await mfa({ action: "verify", code: "Abcd7890" }, ctx("u1"))).ok, true, "새 2차 비밀번호로 통과");
await rejects(mfa({ action: "off", code: "nope1234" }, ctx("u1")), /맞지 않습니다/, "끄기는 2차 비밀번호가 맞아야");
eq((await mfa({ action: "off", code: "Abcd7890" }, ctx("u1"))).opt, false, "끄기");
eq([db.m.get("users/u1").mfaOpt, db.m.get("users/u1").mfaAsk.answer, db.m.has("pnkMfaSecrets/u1")], [false, "no", false], "끄면 비밀번호 삭제 + 한 달 뒤 다시 묻기 기록");

// ── 최고관리자 · 부관리자는 그대로(필수 · 처음 보는 기기는 문자) ──
await db.doc("users/a1").set({ role: "totalMaster", subAdmin: true, pcVerifyPhone: "+821012345678" });
const dev = "dev_abcdefghijklmnopqrstuvwxyz";
eq((await mfa({ action: "status", app: "logis", dev }, ctx("a1"))).required, true, "부관리자는 늘 필요");
eq((await mfa({ action: "setup", app: "logis", dev, code: "Zx9pQ7wa" }, ctx("a1"))).needSms, true, "부관리자 처음 기기 = 문자 인증");

// ── 회사 관리자의 2차 인증 초기화 ──
await db.doc("users/u2").set({ role: "user", companyName: "JY" });
await mfa({ action: "setup", kind: "pin", code: "58203917" }, ctx("u2"));
await db.doc("users/m1").set({ role: "admin", companyName: "JY" });
await db.doc("users/m2").set({ role: "admin", companyName: "다른회사" });
await db.doc("users/s1").set({ role: "user", companyName: "JY" });
await rejects(mfa({ action: "userReset", uid: "u2" }, ctx("s1")), /회사 관리자만/, "일반 직원은 초기화 불가");
await rejects(mfa({ action: "userReset", uid: "u2" }, ctx("m2")), /회사 관리자만/, "다른 회사 관리자는 초기화 불가");
await rejects(mfa({ action: "userReset", uid: "a1" }, ctx("m1")), /최고관리자 · 부관리자 계정은/, "부관리자 계정은 여기서 못 지움");
eq((await mfa({ action: "userReset", uid: "u2" }, ctx("m1"))).ok, true, "같은 회사 관리자는 초기화");
eq([db.m.has("pnkMfaSecrets/u2"), db.m.get("users/u2").mfaOpt], [false, false], "초기화하면 2차 인증 꺼짐");

if (fails) { console.error(`\n${fails}개 실패`); process.exit(1); }
console.log("\nuserMfa: 모두 통과");
