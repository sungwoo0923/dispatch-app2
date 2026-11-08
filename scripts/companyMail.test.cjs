// ✉️ 2026-11-08 운송사별 발신 메일(functions/companyMail.js) 단위 테스트 — 메모리 가짜 DB · 가짜 nodemailer(실제 SMTP 안 씀)
//  실행: node scripts/companyMail.test.cjs
const assert = require("node:assert/strict");
const crypto = require("crypto");
const M = require("../functions/companyMail.js");

class HttpsError extends Error { constructor(code, msg, details) { super(msg); this.code = code; this.details = details; } }
const store = new Map();
const docRef = (col, id) => ({
  id, path: `${col}/${id}`,
  async get() { const d = store.get(`${col}/${id}`); return { exists: !!d, id, data: () => d }; },
  async set(v, opt) { const prev = opt?.merge ? store.get(`${col}/${id}`) || {} : {}; const next = { ...prev }; Object.entries(v).forEach(([k, x]) => { next[k] = x && x.__inc ? (prev[k] || 0) + x.__inc : x; }); store.set(`${col}/${id}`, next); },
  async delete() { store.delete(`${col}/${id}`); },
});
const db = { collection: (col) => ({ doc: (id) => docRef(col, id) }) };
const FieldValue = { increment: (n) => ({ __inc: n }) };
const sent = [];
let failNext = null;
const fakeNodemailer = { createTransport: (opts) => ({ async sendMail(m) { if (failNext) { const e = failNext; failNext = null; throw e; } sent.push({ opts, m }); return { messageId: `<id${sent.length}@x>`, accepted: [m.to], rejected: [] }; } }) };
const KEY = crypto.randomBytes(32).toString("base64");
let key = KEY;
const quiet = { log() {}, warn() {}, error() {} };
const api = M.makeCompanyMail({ db, FieldValue, HttpsError, getNodemailer: () => fakeNodemailer, getKey: () => key, log: quiet });
const ctx = (uid, email = `${uid}@corp.kr`) => ({ auth: { uid, token: { email } } });
const user = (id, u) => store.set(`users/${id}`, { approved: true, ...u });
const rejects = async (p, code, extra) => { try { await p; } catch (e) { assert.equal(e.code, code, `${e.code} ${e.message}`); if (extra) extra(e); return e; } throw new Error(`거절되어야 함(${code})`); };

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`  ✓ ${name}`); };
(async () => {
  user("adminA", { companyName: "에이운송", role: "admin", name: "관리자A" });
  user("acctA", { companyName: "에이운송", role: "test" });
  user("clerkA", { companyName: "에이운송", role: "acctStaff" });
  user("staffA", { companyName: "에이운송", role: "user" });
  user("viewerA", { companyName: "에이운송", role: "viewer" });
  user("driverA", { companyName: "에이운송", role: "driver" });
  user("shipA", { companyName: "화주사", role: "shipper", linkedTransportCompany: { companyName: "에이운송" } });
  user("pendA", { companyName: "에이운송", role: "user", approved: false });
  user("adminB", { companyName: "비운송", role: "admin" });
  user("staffB", { companyName: "비운송", role: "user" });

  await t("암호화 왕복 · 매번 다른 IV · 회사 키(AAD)가 다르면 못 푼다", () => {
    const a = M.encryptSecret("abcd efgh ijkl", KEY, "에이운송");
    const b = M.encryptSecret("abcd efgh ijkl", KEY, "에이운송");
    assert.notEqual(a.iv, b.iv); assert.notEqual(a.ct, b.ct);
    assert.equal(a.alg, "aes-256-gcm");
    assert.equal(M.decryptSecret(a, KEY, "에이운송"), "abcd efgh ijkl");
    assert.throws(() => M.decryptSecret(a, KEY, "비운송"));
    assert.throws(() => M.decryptSecret(a, crypto.randomBytes(32).toString("base64"), "에이운송"));
    assert.throws(() => M.decryptSecret({ ...a, ct: Buffer.from("x").toString("base64") }, KEY, "에이운송"));
    assert.ok(!JSON.stringify(a).includes("abcd"));
  });
  await t("암호 키 — 32바이트 미만 · 없음 · none은 쓰지 않는다, 더 길면 sha256으로 32바이트", () => {
    assert.equal(M.parseKey(""), null); assert.equal(M.parseKey("none"), null);
    assert.equal(M.parseKey(crypto.randomBytes(16).toString("base64")), null);
    assert.equal(M.parseKey(crypto.randomBytes(48).toString("base64")).length, 32);
    assert.throws(() => M.encryptSecret("x", "short"));
  });
  await t("메일 서비스 프리셋 → SMTP 설정", () => {
    assert.deepEqual(M.resolveSmtp({ preset: "daum" }), { host: "smtp.daum.net", port: 465, security: "ssl", secure: true, requireTLS: false });
    assert.equal(M.resolveSmtp({ preset: "naver" }).host, "smtp.naver.com");
    assert.equal(M.resolveSmtp({ preset: "gmail" }).port, 465);
    assert.deepEqual(M.resolveSmtp({ preset: "outlook" }), { host: "smtp.office365.com", port: 587, security: "starttls", secure: false, requireTLS: true });
    assert.equal(M.resolveSmtp({ preset: "nate" }).host, "smtp.mail.nate.com");
    // 프리셋이면 직접 입력 값은 무시
    assert.equal(M.resolveSmtp({ preset: "daum", host: "evil.example.com", port: 25 }).host, "smtp.daum.net");
    assert.deepEqual(M.resolveSmtp({ preset: "custom", host: "Mail.Corp.KR", port: "587", security: "starttls" }), { host: "mail.corp.kr", port: 587, security: "starttls", secure: false, requireTLS: true });
    assert.equal(M.resolveSmtp({ preset: "custom", host: "", port: 465 }), null);
    assert.equal(M.resolveSmtp({ preset: "custom", host: "mail.corp.kr", port: 70000 }), null);
    assert.equal(M.presetOfEmail("a@hanmail.net"), "daum");
    assert.equal(M.presetOfEmail("a@naver.com"), "naver");
    assert.equal(M.presetOfEmail("a@corp.kr"), "");
  });

  await t("설정 없음 → MAIL_NOT_CONFIGURED(안내 문구 그대로)", async () => {
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h" }, ctx("staffA")), "failed-precondition", (e) => {
      assert.equal(e.details.code, M.NOT_CONFIGURED);
      assert.equal(e.message, "회사정보 › 메일 설정에서 발신 메일을 먼저 등록해 주세요");
    });
    const st = await api.mailSettings({ action: "get" }, ctx("staffA"));
    assert.equal(st.configured, false); assert.equal(st.canEdit, false);
    assert.equal(sent.length, 0);
  });

  await t("저장 — 관리자 · 경리 관리자만, 일반 직원 · 경리사무원 · 기사 · 승인 전 거절", async () => {
    const body = { action: "save", fromEmail: "Sales@Daum.net", fromName: "에이운송 정산팀", preset: "daum", password: "app-pass-1234" };
    await rejects(api.mailSettings(body, ctx("staffA")), "permission-denied");
    await rejects(api.mailSettings(body, ctx("clerkA")), "permission-denied");
    await rejects(api.mailSettings(body, ctx("driverA")), "permission-denied");
    await rejects(api.mailSettings(body, ctx("pendA")), "permission-denied");
    await rejects(api.mailSettings(body, ctx("shipA")), "permission-denied");
    await rejects(api.mailSettings({ ...body, password: "" }, ctx("adminA")), "invalid-argument");
    await rejects(api.mailSettings({ ...body, fromEmail: "nope" }, ctx("adminA")), "invalid-argument");
    const r = await api.mailSettings(body, ctx("adminA"));
    assert.equal(r.ok, true); assert.equal(r.fromEmail, "sales@daum.net"); assert.equal(r.host, "smtp.daum.net"); assert.equal(r.hasPassword, true);
    assert.ok(!("password" in r));
    // 비밀번호는 암호문으로만 · 공개 설정에는 비밀번호 칸이 없다
    const sec = store.get("companyMailSecrets/에이운송");
    assert.ok(sec.ct && sec.iv && sec.tag); assert.ok(!JSON.stringify(sec).includes("app-pass-1234"));
    const pub = store.get("companyMailSettings/에이운송");
    assert.ok(!JSON.stringify(pub).includes("app-pass")); assert.equal(pub.companyName, "에이운송");
    // 경리 관리자(test)도 저장 가능 · 비밀번호 없이 이름만 바꾸면 그대로 유지
    const r2 = await api.mailSettings({ action: "save", fromEmail: "sales@daum.net", fromName: "에이 정산", preset: "daum" }, ctx("acctA"));
    assert.equal(r2.fromName, "에이 정산");
    assert.equal(M.decryptSecret(store.get("companyMailSecrets/에이운송"), KEY, "에이운송"), "app-pass-1234");
    // 주소를 바꾸면 비밀번호를 다시 넣어야
    await rejects(api.mailSettings({ action: "save", fromEmail: "other@daum.net", preset: "daum" }, ctx("adminA")), "invalid-argument");
  });

  await t("보내기 — 회사 계정으로 · 첨부 · 회신 · 참조 · 기록(비밀 없음)", async () => {
    const r = await api.sendCompanyMail({
      to: "Client <c@client.kr>, d@client.kr", cc: "e@client.kr", bcc: "f@client.kr", subject: "[거래명세서] 10월", html: "<p>본문</p>", replyTo: "me@corp.kr",
      attachments: [{ filename: "명세서.pdf", content: Buffer.from("%PDF-1.4").toString("base64"), contentType: "application/pdf" }],
      log: { type: "거래명세서", client: "한빛", body: "본문" },
    }, ctx("staffA"));
    assert.equal(r.ok, true); assert.equal(r.sentFrom, "sales@daum.net"); assert.equal(r.logged, true);
    const last = sent[sent.length - 1];
    assert.equal(last.opts.host, "smtp.daum.net"); assert.equal(last.opts.port, 465); assert.equal(last.opts.secure, true);
    assert.deepEqual(last.opts.auth, { user: "sales@daum.net", pass: "app-pass-1234" });
    assert.equal(last.m.from.address, "sales@daum.net"); assert.equal(last.m.from.name, "에이 정산");
    assert.equal(last.m.to, "c@client.kr, d@client.kr"); assert.equal(last.m.cc, "e@client.kr"); assert.equal(last.m.bcc, "f@client.kr");
    assert.equal(last.m.replyTo.address, "me@corp.kr");
    assert.equal(last.m.attachments[0].filename, "명세서.pdf"); assert.equal(last.m.attachments[0].encoding, "base64");
    const lg = store.get(`emailLogs/${r.logId}`);
    assert.equal(lg.companyName, "에이운송"); assert.equal(lg.status, "success"); assert.equal(lg.type, "거래명세서"); assert.equal(lg.sentFrom, "sales@daum.net");
    assert.deepEqual(lg.attachmentNames, ["명세서.pdf"]);
    assert.ok(!JSON.stringify(lg).includes("app-pass")); assert.ok(!("bcc" in lg));
  });

  await t("보내기 — 회사 범위: 다른 회사 직원은 자기 회사 설정만(없으면 등록 안내), totalMaster 아닌 사람의 company 값은 무시", async () => {
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h", company: "에이운송" }, ctx("staffB")), "failed-precondition", (e) => assert.equal(e.details.code, M.NOT_CONFIGURED));
    await rejects(api.mailSettings({ action: "save", company: "에이운송", fromEmail: "x@daum.net", preset: "daum", password: "p" }, ctx("staffB")), "permission-denied");
    const b = await api.mailSettings({ action: "save", company: "에이운송", fromEmail: "b@naver.com", preset: "naver", password: "bpass" }, ctx("adminB"));
    assert.equal(b.fromEmail, "b@naver.com");
    assert.equal(store.get("companyMailSettings/에이운송").fromEmail, "sales@daum.net"); // 에이운송 설정은 그대로
    assert.equal(store.get("companyMailSettings/비운송").host, "smtp.naver.com");
    // 비운송 암호문을 에이운송 문서로 옮겨도(AAD가 달라) 못 푼다
    const saved = store.get("companyMailSecrets/에이운송");
    store.set("companyMailSecrets/에이운송", { ...store.get("companyMailSecrets/비운송"), user: "sales@daum.net" });
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h" }, ctx("staffA")), "failed-precondition");
    store.set("companyMailSecrets/에이운송", saved);
  });

  await t("보내기 — 조회 전용 · 기사 거절, 화주는 연동 운송사 계정 + 답장은 화주 본인", async () => {
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h" }, ctx("viewerA")), "permission-denied");
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h" }, ctx("driverA")), "permission-denied");
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h" }, ctx("unknown")), "permission-denied");
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s" }, { auth: null }), "unauthenticated");
    const r = await api.sendCompanyMail({ to: "c@client.kr", subject: "정산내역서", html: "h", replyTo: "spoof@x.kr" }, ctx("shipA", "ship@hwaju.kr"));
    assert.equal(r.sentFrom, "sales@daum.net");
    assert.equal(sent[sent.length - 1].m.replyTo.address, "ship@hwaju.kr");
  });

  await t("보내기 — 입력 확인(받는 사람 · 형식 · 50명 · 첨부 크기)", async () => {
    await rejects(api.sendCompanyMail({ to: "", subject: "s" }, ctx("staffA")), "invalid-argument");
    await rejects(api.sendCompanyMail({ to: "bad", subject: "s" }, ctx("staffA")), "invalid-argument");
    await rejects(api.sendCompanyMail({ to: Array.from({ length: 51 }, (_, i) => `u${i}@x.kr`), subject: "s" }, ctx("staffA")), "invalid-argument");
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", attachments: [{ filename: "a", content: "A".repeat(M.MAX_ATTACH_B64 + 4) }] }, ctx("staffA")), "invalid-argument");
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", attachments: [{ filename: "a", content: "<<not base64>>" }] }, ctx("staffA")), "invalid-argument");
  });

  await t("보내기 실패 — 알아듣기 쉬운 오류 + 실패 기록", async () => {
    failNext = Object.assign(new Error("535 Authentication failed"), { code: "EAUTH" });
    const e = await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h", log: { type: "미수금" } }, ctx("staffA")), "unavailable");
    assert.match(e.message, /Daum 메일 환경설정/);
    assert.equal(e.details.logged, true);
    assert.equal(store.get(`emailLogs/${e.details.logId}`).status, "failed");
  });

  await t("테스트 메일 — 내 주소로 · 결과 기록 · 10분에 5번", async () => {
    await rejects(api.mailSettings({ action: "test" }, ctx("staffA")), "permission-denied");
    const r = await api.mailSettings({ action: "test" }, ctx("adminA", "boss@corp.kr"));
    assert.equal(r.ok, true); assert.equal(r.to, "boss@corp.kr");
    assert.equal(sent[sent.length - 1].m.to, "boss@corp.kr");
    assert.equal(store.get("companyMailSettings/에이운송").lastTestOk, true);
    failNext = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
    const f = await api.mailSettings({ action: "test" }, ctx("adminA"));
    assert.equal(f.ok, false); assert.match(f.error, /연결하지 못했어요/);
    assert.equal(store.get("companyMailSettings/에이운송").lastTestOk, false);
    for (let i = 0; i < 3; i += 1) await api.mailSettings({ action: "test" }, ctx("adminA"));
    await rejects(api.mailSettings({ action: "test" }, ctx("adminA")), "resource-exhausted");
  });

  await t("암호 키가 없으면 보내지 않는다(MAIL_KEY_MISSING)", async () => {
    key = "";
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h" }, ctx("staffA")), "failed-precondition", (e) => assert.equal(e.details.code, "MAIL_KEY_MISSING"));
    key = KEY;
  });

  await t("해제 — 관리자만, 해제 뒤엔 등록 안내", async () => {
    await rejects(api.mailSettings({ action: "remove" }, ctx("staffB")), "permission-denied");
    await api.mailSettings({ action: "remove" }, ctx("adminB"));
    assert.equal(store.has("companyMailSecrets/비운송"), false);
    await rejects(api.sendCompanyMail({ to: "c@client.kr", subject: "s", html: "h" }, ctx("staffB")), "failed-precondition", (e) => assert.equal(e.details.code, M.NOT_CONFIGURED));
  });

  await t("플랫폼 메일 — 비밀값 없으면 건너뜀, 있으면 숨은 참조로", async () => {
    const logs = [];
    const skip = M.makePlatformMailer({ getNodemailer: () => fakeNodemailer, env: {}, log: { log: (m) => logs.push(m), warn() {} } });
    const s = await skip(["a@x.kr"], "제목", "<p>h</p>");
    assert.equal(s.skipped, true); assert.ok(logs.length === 1);
    const none = M.makePlatformMailer({ getNodemailer: () => fakeNodemailer, env: { PLATFORM_SMTP_USER: "none", PLATFORM_SMTP_PASS: "none" }, log: quiet });
    assert.equal((await none(["a@x.kr"], "s", "h")).skipped, true);
    const go = M.makePlatformMailer({ getNodemailer: () => fakeNodemailer, env: { PLATFORM_SMTP_USER: "ops@naver.com", PLATFORM_SMTP_PASS: "pw" }, log: quiet });
    const before = sent.length;
    assert.equal((await go(["a@x.kr", "b@x.kr"], "[LogisWeb] 계약", "h")).ok, true);
    const m = sent[before];
    assert.equal(m.opts.host, "smtp.naver.com"); assert.equal(m.m.from.address, "ops@naver.com"); assert.equal(m.m.bcc, "a@x.kr, b@x.kr");
  });

  console.log(`\n✅ companyMail 단위 테스트 ${n}개 통과`);
})().catch((e) => { console.error("❌", e); process.exit(1); });
