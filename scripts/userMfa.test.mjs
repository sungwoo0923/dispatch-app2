// 일반 계정 2차 인증(선택) · 얼굴/지문 로그인 서버 점검 — node scripts/userMfa.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { makePnkMfa } = require("../functions/pnkMfa.js");
const { makeLogisPasskey } = require("../functions/logisPasskey.js");

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

// ── 얼굴 · 지문 ──
const fakeW = {
  generateRegistrationOptions: async (o) => ({ challenge: "C-reg", rp: { id: o.rpID }, user: { name: o.userName }, excludeCredentials: o.excludeCredentials }),
  verifyRegistrationResponse: async (o) => ({ verified: o.response.ok === true && o.expectedChallenge === "C-reg", registrationInfo: { credential: { id: o.response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0 } } }),
  generateAuthenticationOptions: async (o) => ({ challenge: "C-auth", allowCredentials: o.allowCredentials }),
  verifyAuthenticationResponse: async (o) => ({ verified: o.response.ok === true && o.expectedChallenge === "C-auth", authenticationInfo: { newCounter: 1 } }),
};
const { same } = require("../functions/pnkMfa.js");
let tokens = 0;
const pk = makeLogisPasskey({ db, HttpsError, now: () => t, webauthn: fakeW, same, createCustomToken: async (uid) => { tokens++; return `tok-${uid}`; } });
const O = "https://dispatch-app2.vercel.app";
await rejects(pk({ action: "loginOptions", origin: "https://evil.example" }, {}), /쓸 수 없습니다/, "다른 주소는 거절");
// 일반 계정(2차 인증 없음) 등록
const r1 = await pk({ action: "regOptions", origin: O, dev }, ctx("u1"));
eq(r1.options.rp.id, "dispatch-app2.vercel.app", "등록 옵션 — 주소별 rpID");
eq((await pk({ action: "regVerify", origin: O, chal: r1.chal, dev, response: { id: "cred_u1_aaaaaaaaaaaa", ok: true } }, ctx("u1"))).count, 1, "등록 완료");
eq(db.m.get("users/u1").bioKeys, 1, "users.bioKeys 개수 기록");
await rejects(pk({ action: "regVerify", origin: O, chal: r1.chal, response: { id: "cred_u1_aaaaaaaaaaaa", ok: true } }, ctx("u1")), /시간이 지났/, "확인값은 한 번만");
// 로그인
const l1 = await pk({ action: "loginOptions", origin: O }, {});
const lr = await pk({ action: "login", origin: O, chal: l1.chal, dev, response: { id: "cred_u1_aaaaaaaaaaaa", ok: true } }, {});
eq([lr.token, lr.companyName, lr.admin], ["tok-u1", "JY", false], "얼굴 로그인 → 로그인 토큰");
const l2 = await pk({ action: "loginOptions", origin: O }, {});
await rejects(pk({ action: "login", origin: O, chal: l2.chal, response: { id: "cred_u1_aaaaaaaaaaaa", ok: false } }, {}), /확인하지 못했습니다/, "서명이 틀리면 거절");
const l3 = await pk({ action: "loginOptions", origin: O }, {});
await rejects(pk({ action: "login", origin: O, chal: l3.chal, response: { id: "cred_unknown_aaaaaaa", ok: true } }, {}), /등록되지 않은/, "모르는 열쇠 거절");
// 2단계 대신
const a1 = await pk({ action: "authOptions", origin: O }, ctx("u1"));
eq(a1.options.allowCredentials.length, 1, "2단계 대신 — 내 열쇠만");
eq((await pk({ action: "authVerify", origin: O, chal: a1.chal, response: { id: "cred_u1_aaaaaaaaaaaa", ok: true } }, ctx("u1"))).ok, true, "2단계 대신 통과");
// 부관리자: 문자 인증 안 한 기기는 등록 · 로그인 불가
await rejects(pk({ action: "regOptions", origin: O, dev, code: "Zx9pQ7wa" }, ctx("a1")), /문자 인증을 마친 기기/, "부관리자 — 처음 기기에선 등록 불가");
// 문자 인증을 마친 기기로 만든 뒤
const { devKey } = require("../functions/pnkMfa.js");
await db.doc("pnkMfaSecrets/a1").set({ devices: { [devKey(dev)]: { at: t } } }, { merge: true });
await rejects(pk({ action: "regOptions", origin: O, dev, code: "wrongpass1" }, ctx("a1")), /2차 비밀번호가 맞지/, "부관리자 등록은 2차 비밀번호 확인");
const r2 = await pk({ action: "regOptions", origin: O, dev, code: "Zx9pQ7wa" }, ctx("a1"));
await pk({ action: "regVerify", origin: O, chal: r2.chal, dev, response: { id: "cred_a1_bbbbbbbbbbbb", ok: true } }, ctx("a1"));
const l4 = await pk({ action: "loginOptions", origin: O }, {});
eq((await pk({ action: "login", origin: O, chal: l4.chal, dev, response: { id: "cred_a1_bbbbbbbbbbbb", ok: true } }, {})).sub, true, "부관리자 — 아는 기기면 얼굴로 바로");
const l5 = await pk({ action: "loginOptions", origin: O }, {});
await rejects(pk({ action: "login", origin: O, chal: l5.chal, dev: "dev_otherdeviceotherdevice00", response: { id: "cred_a1_bbbbbbbbbbbb", ok: true } }, {}), /처음 로그인하는 기기/, "부관리자 — 새 기기면 얼굴 로그인 거절(비밀번호 → 문자)");
const a2 = await pk({ action: "authOptions", origin: O }, ctx("a1"));
eq((await pk({ action: "authVerify", origin: O, chal: a2.chal, dev: "dev_otherdeviceotherdevice00", response: { id: "cred_a1_bbbbbbbbbbbb", ok: true } }, ctx("a1"))).needSms, true, "부관리자 — 새 기기에서 2단계 대신 쓰면 문자 인증으로");
// 지우기
eq((await pk({ action: "remove", origin: O, id: "cred_u1_aaaaaaaaaaaa" }, ctx("u1"))).left, 0, "등록 지우기");
await rejects(pk({ action: "remove", origin: O, id: "cred_a1_bbbbbbbbbbbb" }, ctx("u1")), /이미 지웠/, "남의 열쇠는 못 지움");
// 정지된 계정
await db.doc("users/u1").set({ userStatus: "suspended" }, { merge: true });
const r3 = await pk({ action: "regOptions", origin: O, dev }, ctx("u1"));
await pk({ action: "regVerify", origin: O, chal: r3.chal, response: { id: "cred_u1_cccccccccccc", ok: true } }, ctx("u1"));
const l6 = await pk({ action: "loginOptions", origin: O }, {});
await rejects(pk({ action: "login", origin: O, chal: l6.chal, response: { id: "cred_u1_cccccccccccc", ok: true } }, {}), /사용할 수 없는/, "정지된 계정은 얼굴 로그인 불가");

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
