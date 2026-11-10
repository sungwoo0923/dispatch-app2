// 💬 2026-11-10 문자 보내기(팝빌) 서버 테스트 — 가짜 Firestore · 가짜 팝빌 · node scripts/smsSend.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { makeSmsSend, bytesOf, smsSettingsOf } = require("../functions/smsSend.js");
let n = 0; const ok = (t) => { n++; console.log("  ✓", t); };

// 가짜 Firestore(필요한 것만)
function fakeDb(init = {}) {
  const store = new Map(Object.entries(init));
  const inc = (v) => ({ __inc: v });
  const apply = (cur, val) => { const o = { ...(cur || {}) }; for (const [k, v] of Object.entries(val)) o[k] = v && v.__inc ? (Number(o[k]) || 0) + v.__inc : v; return o; };
  let auto = 0;
  const ref = (path) => ({
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (val, opt) => { store.set(path, opt?.merge ? apply(store.get(path), val) : apply({}, val)); },
  });
  return {
    store, FieldValue: { increment: inc, serverTimestamp: () => "ts" },
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`), add: async (v) => { store.set(`${c}/a${++auto}`, v); } }),
  };
}
const callerOf = async (db, auth) => ({ uid: auth.uid, tier: auth.uid === "drv" ? "hub" : "staff", co: "A", isTM: false });
const sentLog = [];
const fakePb = (enabled = true) => ({
  enabled,
  sendSms: async (corp, m) => (m.receiver.endsWith("0000") ? { ok: false, error: "수신거부" } : (sentLog.push(["SMS", m.receiver]), { ok: true, receiptNum: "R1" })),
  sendLms: async (corp, m) => (sentLog.push(["LMS", m.receiver]), { ok: true, receiptNum: "R2" }),
});
const AT = Date.parse("2026-11-10T03:00:00Z");

assert.equal(bytesOf("가나다abc"), 9);
assert.equal(smsSettingsOf({ alimtalk: { senderNumber: "031-683-0000" } }).senderNumber, "0316830000");
assert.equal(smsSettingsOf({ sms: { mode: "x" } }).mode, "phone");
ok("바이트 계산 · 발신번호는 알림톡 번호를 이어받음 · 모르는 방식은 휴대폰과 연결");

{
  const db = fakeDb({ "users/u1": { role: "user" }, "companyPopbill/A": { corpNum: "1258134507" }, "popbillSettings/A": { sms: { mode: "popbill", senderNumber: "0316830000" } } });
  const S = makeSmsSend({ db, FieldValue: db.FieldValue, getPopbill: async () => fakePb(), callerOf, now: () => AT });
  const r = await S.send({ to: [{ phone: "010-1111-2222", name: "김" }, { phone: "01011112222" }, { phone: "010-3333-0000" }, { phone: "02-123-4567" }], content: "내일 08:00 상차입니다" }, { uid: "u1" });
  assert.equal(r.status, "partial"); assert.equal(r.sent, 1); assert.equal(r.failed, 1); assert.equal(r.kind, "SMS");
  assert.deepEqual(db.store.get("messageUsage/A__2026-11"), { company: "A", month: "2026-11", sms: 1, updatedAt: "ts" });
  ok("단문 — 중복 번호 · 일반 전화 빼고 보냄 · 성공한 건만 이번 달 사용량에(1건)");
  const long = "가".repeat(46);
  const r2 = await S.send({ to: [{ phone: "01055556666" }], content: long }, { uid: "u1" });
  assert.equal(r2.kind, "LMS"); assert.equal(db.store.get("messageUsage/A__2026-11").lms, 1);
  ok("90바이트 넘으면 장문(LMS)");
  const info = await S.info({}, { uid: "u1" });
  assert.equal(info.connected, true); assert.deepEqual(info.usage, { sms: 1, lms: 1, alimtalk: 0 }); assert.equal(info.price.sms, 20);
  ok("사용량 · 단가(기본값) 조회");
  db.store.set("platformConfig/messagePricing", { sms: 13, lms: 40, alimtalk: 9 });
  assert.equal((await S.info({}, { uid: "u1" })).price.lms, 40);
  ok("관리센터에서 정한 단가");
  await assert.rejects(S.send({ to: [{ phone: "01011112222" }], content: "x" }, { uid: "drv" }), /운송사 직원만/);
  db.store.set("users/v", { role: "viewer" });
  await assert.rejects(S.send({ to: [{ phone: "01011112222" }], content: "x" }, { uid: "v" }), /조회전용/);
  await assert.rejects(S.send({ to: [], content: "x" }, { uid: "u1" }), /받는 휴대폰 번호/);
  await assert.rejects(S.send({ to: Array.from({ length: 101 }, (_, i) => ({ phone: `0101234${String(i).padStart(4, "0")}` })), content: "x" }, { uid: "u1" }), /100명/);
  ok("기사 · 조회전용 · 번호 없음 · 100명 넘음 막힘");
}
{
  const db = fakeDb({ "companyPopbill/A": { corpNum: "" }, "popbillSettings/A": { sms: { mode: "popbill", senderNumber: "0316830000" } } });
  const S = makeSmsSend({ db, FieldValue: db.FieldValue, getPopbill: async () => fakePb(false), callerOf, now: () => AT });
  const r = await S.send({ to: [{ phone: "01011112222" }], content: "x" }, { uid: "u1" });
  assert.equal(r.status, "off"); assert.equal(db.store.has("messageUsage/A__2026-11"), false);
  ok("팝빌 연결 전 — 보내지 않고 off · 사용량 안 늘어남");
}
{
  const db = fakeDb({ "companyPopbill/A": { corpNum: "1258134507" }, "popbillSettings/A": { sms: { mode: "popbill" } } });
  const S = makeSmsSend({ db, FieldValue: db.FieldValue, getPopbill: async () => fakePb(), callerOf, now: () => AT });
  await assert.rejects(S.send({ to: [{ phone: "01011112222" }], content: "x" }, { uid: "u1" }), /발신번호/);
  ok("발신번호 없으면 막힘");
}
console.log(`\n${n}개 통과`);
