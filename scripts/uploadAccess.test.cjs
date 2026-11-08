// ⭐ 2026-11-08 업로드 링크 토큰·허가증 서명/확인 · 요청 수 제한 · 기사 선등록 판정 — 단위 테스트(에뮬레이터 필요 없음)
//  실행: node scripts/uploadAccess.test.cjs
const assert = require("assert");
const path = require("path");
const C = require(path.resolve(__dirname, "../functions/uploadAccessCore.js"));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`PASS ${name}`); } catch (e) { fail += 1; console.log(`FAIL ${name} :: ${e?.message || e}`); }
}
const SECRET = "test-secret-0123456789abcdef";
const NOW = Date.parse("2026-11-08T03:00:00Z");

// ── 서명 허가증 ──
t("grant: 서명 → 확인 통과", () => {
  const g = C.newGrant(SECRET, { orderId: "o1", col: "orders", co: "에이", now: NOW });
  const p = C.verifyGrant(SECRET, g, NOW + 1000);
  assert.strictEqual(p.o, "o1"); assert.strictEqual(p.c, "orders"); assert.strictEqual(p.co, "에이");
  assert.ok(p.a.includes("upload"));
});
t("grant: 만료 후 거절", () => {
  const g = C.newGrant(SECRET, { orderId: "o1", col: "orders", co: "에이", now: NOW });
  assert.strictEqual(C.verifyGrant(SECRET, g, NOW + C.GRANT_TTL_MS + 1), null);
});
t("grant: 다른 비밀값이면 거절", () => {
  const g = C.newGrant(SECRET, { orderId: "o1", col: "orders", now: NOW });
  assert.strictEqual(C.verifyGrant("other-secret-0123456789", g, NOW), null);
});
t("grant: 내용 바꾸면 거절(오더 id 변조)", () => {
  const g = C.newGrant(SECRET, { orderId: "o1", col: "orders", now: NOW });
  const [v, body, sig] = g.split(".");
  const p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  p.o = "o2";
  const body2 = C.b64u(JSON.stringify(p));
  assert.strictEqual(C.verifyGrant(SECRET, `${v}.${body2}.${sig}`, NOW), null);
});
t("grant: 형식 아닌 값 거절", () => {
  for (const x of ["", "abc", "g1.x", "g2.a.b", null, 123, "g1." + "a".repeat(3000) + ".b"]) assert.strictEqual(C.verifyGrant(SECRET, x, NOW), null);
});
t("grant: 비밀값 없거나 짧으면 발급 거부", () => {
  assert.throws(() => C.signGrant("", { o: 1 }));
  assert.throws(() => C.signGrant("short", { o: 1 }));
  assert.strictEqual(C.verifyGrant("", "g1.a.b", NOW), null);
});

// ── 오더 업로드토큰 판정 ──
const LEG = C.legacyUntilMs("2027-01-31");
const ctx = (o) => ({ orderId: "o1", col: "orders", now: NOW, legacyUntil: LEG, ...o });
t("token: 맞는 토큰 + 발급 시각 → 통과", () => {
  const r = C.evaluateAccess({ 업로드토큰: "tok-1", 업로드토큰발급: NOW - 3600e3 }, ctx({ t: "tok-1" }));
  assert.ok(r.ok); assert.strictEqual(r.mode, "token");
});
t("token: 다른 토큰 → BAD_TOKEN", () => {
  assert.strictEqual(C.evaluateAccess({ 업로드토큰: "tok-1", 업로드토큰발급: NOW }, ctx({ t: "tok-2" })).reason, "BAD_TOKEN");
  assert.strictEqual(C.evaluateAccess({ 업로드토큰: "tok-1", 업로드토큰발급: NOW }, ctx({ t: "" })).reason, "BAD_TOKEN");
});
t("token: 30일 지나면 EXPIRED", () => {
  const r = C.evaluateAccess({ 업로드토큰: "tok-1", 업로드토큰발급: NOW - C.UPLOAD_TOKEN_TTL_MS - 1 }, ctx({ t: "tok-1" }));
  assert.strictEqual(r.reason, "EXPIRED");
});
t("token: 발급 시각 없는 예전 토큰 — 전환 기간 안 통과 / 지나면 EXPIRED", () => {
  assert.strictEqual(C.evaluateAccess({ 업로드토큰: "tok-1" }, ctx({ t: "tok-1" })).mode, "legacy-token");
  assert.strictEqual(C.evaluateAccess({ 업로드토큰: "tok-1" }, ctx({ t: "tok-1", now: LEG + 1 })).reason, "EXPIRED");
});
t("token: 토큰 없는 오더(오더 id만 링크) — 전환 기간 안 통과 / 지나면 EXPIRED", () => {
  assert.strictEqual(C.evaluateAccess({}, ctx({})).mode, "legacy-id");
  assert.strictEqual(C.evaluateAccess({}, ctx({ now: LEG + 1 })).reason, "EXPIRED");
});
t("token: 잠긴 오더 → LOCKED, 재업로드 허용(만료 전) → 통과, 지우기(ignoreLock) → 통과", () => {
  const o = { 업로드토큰: "tok-1", 업로드토큰발급: NOW, 업로드잠금: true };
  assert.strictEqual(C.evaluateAccess(o, ctx({ t: "tok-1" })).reason, "LOCKED");
  assert.ok(C.evaluateAccess({ ...o, 업로드잠금해제만료: new Date(NOW + 60e3).toISOString() }, ctx({ t: "tok-1" })).ok);
  assert.strictEqual(C.evaluateAccess({ ...o, 업로드잠금해제만료: new Date(NOW - 60e3).toISOString() }, ctx({ t: "tok-1" })).reason, "LOCKED");
  assert.ok(C.evaluateAccess(o, ctx({ t: "tok-1", ignoreLock: true })).ok);
});
t("token: 허가증은 같은 오더·컬렉션만, 잠금은 못 연다", () => {
  const grant = { o: "o1", c: "orders", a: ["view", "upload"] };
  assert.ok(C.evaluateAccess({ 업로드토큰: "secret" }, ctx({ grant })).ok);
  assert.strictEqual(C.evaluateAccess({}, ctx({ grant: { ...grant, o: "o2" } })).reason, "BAD_TOKEN");
  assert.strictEqual(C.evaluateAccess({}, ctx({ grant: { ...grant, c: "dispatch" } })).reason, "BAD_TOKEN");
  assert.strictEqual(C.evaluateAccess({ 업로드잠금: true }, ctx({ grant })).reason, "LOCKED");
  // 전환 기간이 끝나도 서버가 만든 허가증은 쓸 수 있다
  assert.ok(C.evaluateAccess({}, ctx({ grant, now: LEG + 1 })).ok);
});
t("token: 문서 없음 → NOT_FOUND", () => assert.strictEqual(C.evaluateAccess(null, ctx({})).reason, "NOT_FOUND"));
t("legacyUntilMs: 기본값/환경값/잘못된 값", () => {
  assert.strictEqual(C.legacyUntilMs(), Date.parse("2027-01-31T23:59:59+09:00"));
  assert.strictEqual(C.legacyUntilMs("2026-12-01"), Date.parse("2026-12-01T23:59:59+09:00"));
  assert.strictEqual(C.legacyUntilMs("bad"), Date.parse("2027-01-31T23:59:59+09:00"));
});
t("pickView: 업로드토큰·운임·전송사본 정보는 내려주지 않는다", () => {
  const v = C.pickView({ 상차일: "2026-11-08", 업로드토큰: "x", 운임: 100000, 기사운임: 1, _transmittedOrderId: "s1", 메모: "m", 이름: "홍길동" });
  assert.deepStrictEqual(Object.keys(v).sort(), ["상차일", "업로드잠금", "이름"].sort());
});
t("checkFile: 이미지/PDF data URL만, 크기 제한", () => {
  assert.strictEqual(C.checkFile({ base64: "data:image/jpeg;base64,AAAA" }), "");
  assert.strictEqual(C.checkFile({ base64: "data:application/pdf;base64,AAAA" }), "");
  assert.strictEqual(C.checkFile({ base64: "data:text/html;base64,AAAA" }), "BAD_FILE");
  assert.strictEqual(C.checkFile({ base64: "https://evil" }), "BAD_FILE");
  assert.strictEqual(C.checkFile({ base64: "data:image/png;base64," + "A".repeat(C.MAX_B64) }), "TOO_LARGE");
});
t("mirrorOf: 전송사본/원본만, 이상한 컬렉션은 무시", () => {
  assert.deepStrictEqual(C.mirrorOf({ _transmittedOrderId: "s1" }), { col: "orders", id: "s1" });
  assert.deepStrictEqual(C.mirrorOf({ originCol: "dispatch", originId: "d1" }), { col: "dispatch", id: "d1" });
  assert.strictEqual(C.mirrorOf({ originCol: "users", originId: "u1" }), null);
});

// ── 요청 수 제한 ──
t("rateStep: 창 안에서 limit까지 허용 후 거절, 창이 지나면 다시 허용", () => {
  let e = null;
  for (let i = 0; i < 3; i++) { const r = C.rateStep(e, NOW + i, 3, 60e3); assert.ok(r.allowed); e = r.entry; }
  const r4 = C.rateStep(e, NOW + 10, 3, 60e3);
  assert.ok(!r4.allowed); assert.ok(r4.retryAfterMs > 0 && r4.retryAfterMs <= 60e3);
  const r5 = C.rateStep(r4.entry, NOW + 60e3 + 1, 3, 60e3);
  assert.ok(r5.allowed); assert.strictEqual(r5.entry.n, 1);
});
t("memoryLimiter: 키별로 따로 센다 · 크기 상한", () => {
  const m = C.createMemoryLimiter({ max: 3 });
  assert.ok(m.hit("a", 1, 1000, NOW).allowed);
  assert.ok(!m.hit("a", 1, 1000, NOW + 1).allowed);
  assert.ok(m.hit("b", 1, 1000, NOW + 2).allowed);
  m.hit("c", 1, 1000, NOW); m.hit("d", 1, 1000, NOW);
  assert.ok(m.size() <= 3);
});

// ── 기사 로그인 선등록 판정 ──
t("judgePreRegistered: 회사별 문서 이름·회사 맞으면 통과", () => {
  assert.deepStrictEqual(C.judgePreRegistered({ pre: { 이름: "홍 길동", companyName: "에이" }, legacy: null, name: "홍길동", companyName: "에이", uid: "u1" }), { ok: true, use: "pre" });
});
t("judgePreRegistered: 예전 문서(차량번호)는 같은 회사일 때만", () => {
  assert.strictEqual(C.judgePreRegistered({ pre: null, legacy: { name: "홍길동", companyName: "에이" }, name: "홍길동", companyName: "에이" }).use, "legacy");
  assert.strictEqual(C.judgePreRegistered({ pre: null, legacy: { name: "홍길동", companyName: "비" }, name: "홍길동", companyName: "에이" }).code, "COMPANY_MISMATCH");
  assert.strictEqual(C.judgePreRegistered({ pre: null, legacy: null, name: "홍길동", companyName: "에이" }).code, "NOT_FOUND");
});
t("judgePreRegistered: 이름 다름 / 이미 다른 계정과 연결", () => {
  assert.strictEqual(C.judgePreRegistered({ pre: { 이름: "김철수", companyName: "에이" }, name: "홍길동", companyName: "에이" }).code, "NAME_MISMATCH");
  assert.strictEqual(C.judgePreRegistered({ pre: { 이름: "홍길동", companyName: "에이", uid: "other" }, name: "홍길동", companyName: "에이", uid: "u1" }).code, "NOT_FOUND");
});
t("coDocKey: 기본 회사는 차량번호 그대로", () => {
  assert.strictEqual(C.coDocKey("돌캐", "12가3456"), "12가3456");
  assert.strictEqual(C.coDocKey("에이", "12가3456"), "에이__12가3456");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
