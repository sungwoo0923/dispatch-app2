// ======================= functions/companyMail.js =======================
// ✉️ 2026-11-08 운송사별 발신 메일 — 회사마다 "자기 메일 계정"으로 보낸다
//  예전: 모든 회사 메일(거래명세서 · 미수 독촉 · 일반 메일 · 연차 촉진 안내 · 예약 메일)이 Vercel /api/send-email 하나로,
//        한 운송사의 다음 메일 계정(코드에 비밀번호까지 적혀 있었다)으로 나갔다. → 이제 그 경로는 410(닫힘).
//  호출형 함수
//   · mailSettings     { action: "get" | "save" | "test" | "remove", ... } — 회사정보 › 메일 설정
//   · sendCompanyMail  { to, cc, bcc, subject, html, attachments, fromName, replyTo, log } — 회사 메일 보내기
//  저장
//   · companyMailSettings/{회사}  비밀이 아닌 값(발신 주소 · 이름 · 메일 서비스 · 서버 · 포트 · 마지막 테스트) — 같은 회사 직원이 읽음, 쓰기는 서버만
//   · companyMailSecrets/{회사 키} 앱 비밀번호(AES-256-GCM 암호문 · 회사 키를 AAD로 묶음) · 테스트 횟수 — 서버만
//   · companyMailUsage/{회사 키}__{uid}__{날짜} 하루 보낸 횟수 — 서버만
//  암호 키: Firebase 비밀값 MAIL_CRED_KEY(32바이트 이상 · base64). 키를 바꾸면 저장된 비밀번호를 못 풀어서 다시 입력해야 한다.
//  플랫폼 메일(LogisWeb → 운송사: 계약 만료 안내 · 일일 경영 보고)은 sendPlatformMail — 비밀값 PLATFORM_SMTP_USER · PLATFORM_SMTP_PASS
const crypto = require("crypto");

const SUPER_EMAIL = "tjddnqkf@naver.com";
const NOT_CONFIGURED = "MAIL_NOT_CONFIGURED";
const NOT_CONFIGURED_MSG = "회사정보 › 메일 설정에서 발신 메일을 먼저 등록해 주세요";
const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/;
const MAX_RCPT = 50;
const MAX_ATTACH = 20;
const MAX_ATTACH_B64 = 9 * 1024 * 1024;  // 첨부 합계(base64 글자 수) — 함수 요청 한도(10MB) 안
const MAX_HTML = 1024 * 1024;
const TEST_LIMIT = 5;                    // 테스트 메일: 회사마다 10분에 5번
const TEST_WINDOW_MS = 10 * 60 * 1000;
const DAILY_LIMIT = { staff: 500, shipper: 30 };

// 메일 서비스 — 보내는 서버(SMTP)
const PRESETS = {
  daum: { label: "Daum · Kakao 메일", host: "smtp.daum.net", port: 465, security: "ssl", domains: ["daum.net", "hanmail.net", "kakao.com"] },
  naver: { label: "네이버 메일", host: "smtp.naver.com", port: 465, security: "ssl", domains: ["naver.com"] },
  gmail: { label: "Gmail · Google Workspace", host: "smtp.gmail.com", port: 465, security: "ssl", domains: ["gmail.com", "googlemail.com"] },
  outlook: { label: "Outlook · Microsoft 365", host: "smtp.office365.com", port: 587, security: "starttls", domains: ["outlook.com", "hotmail.com", "live.com", "outlook.kr"] },
  nate: { label: "네이트 메일", host: "smtp.mail.nate.com", port: 465, security: "ssl", domains: ["nate.com"] },
  custom: { label: "직접 입력", host: "", port: 465, security: "ssl", domains: [] },
};
const SECURITIES = ["ssl", "starttls", "none"];

const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
const cleanName = (v, max = 60) => String(v || "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const cleanEmail = (v) => String(v || "").replace(/[\r\n\s<>"]/g, "").trim().toLowerCase();
const pickAddr = (v) => { const m = /<([^>]+)>/.exec(String(v || "")); return cleanEmail(m ? m[1] : v); };
const splitList = (v) => (Array.isArray(v) ? v : String(v || "").split(/[,;\n]/)).map(pickAddr).filter(Boolean);
const kstYmd = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

function presetOfEmail(email) {
  const dom = String(email || "").split("@")[1]?.toLowerCase() || "";
  return Object.keys(PRESETS).find((k) => PRESETS[k].domains.includes(dom)) || "";
}
// 메일 서비스 + (직접 입력 값) → nodemailer 연결 설정
function resolveSmtp({ preset = "", host = "", port = 0, security = "" } = {}) {
  const p = PRESETS[preset] && preset !== "custom" ? PRESETS[preset] : null;
  const h = p ? p.host : String(host || "").trim().toLowerCase();
  const prt = p ? p.port : Number(port) || 0;
  const sec = p ? p.security : SECURITIES.includes(security) ? security : "ssl";
  if (!h || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return null;
  if (!(prt > 0 && prt < 65536)) return null;
  return { host: h, port: prt, security: sec, secure: sec === "ssl", requireTLS: sec === "starttls" };
}

// ── 암호화(AES-256-GCM) ──
function parseKey(b64) {
  const raw = String(b64 || "").trim();
  if (!raw || raw === "none") return null;
  let buf;
  try { buf = Buffer.from(raw, "base64"); } catch { return null; }
  if (buf.length < 32) return null;
  return buf.length === 32 ? buf : crypto.createHash("sha256").update(buf).digest();
}
function encryptSecret(plain, keyB64, aad = "") {
  const key = parseKey(keyB64);
  if (!key) throw new Error("MAIL_CRED_KEY 없음");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad) c.setAAD(Buffer.from(String(aad), "utf8"));
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return { v: 1, alg: "aes-256-gcm", iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}
function decryptSecret(rec, keyB64, aad = "") {
  const key = parseKey(keyB64);
  if (!key || !rec?.iv || !rec?.tag || !rec?.ct) throw new Error("복호화 불가");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "base64"));
  if (aad) d.setAAD(Buffer.from(String(aad), "utf8"));
  d.setAuthTag(Buffer.from(rec.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(rec.ct, "base64")), d.final()]).toString("utf8");
}

// 자주 나는 SMTP 오류를 알아듣기 쉽게
function smtpErrorText(e, presetKey = "") {
  const raw = String(e?.message || e || "");
  const code = String(e?.code || e?.responseCode || "");
  if (code === "EAUTH" || /auth|535|534|Username and Password/i.test(raw)) {
    return presetKey === "gmail" ? "로그인에 실패했어요. Gmail은 2단계 인증을 켠 뒤 만든 앱 비밀번호 16자리를 넣어 주세요"
      : presetKey === "naver" ? "로그인에 실패했어요. 네이버 메일 환경설정에서 IMAP/SMTP 사용을 켜고, 2단계 인증을 쓰면 애플리케이션 비밀번호를 넣어 주세요"
        : presetKey === "daum" ? "로그인에 실패했어요. Daum 메일 환경설정에서 IMAP/SMTP 사용을 켜고, 2단계 인증을 쓰면 앱 비밀번호를 넣어 주세요"
          : "메일 계정 로그인에 실패했어요. 주소와 앱 비밀번호를 확인해 주세요";
  }
  if (["ETIMEDOUT", "ESOCKET", "ECONNECTION", "EDNS", "ECONNREFUSED"].includes(code)) return "메일 서버에 연결하지 못했어요. 서버 주소 · 포트 · 보안 방식을 확인해 주세요";
  if (/size|too large|552/i.test(raw)) return "첨부 파일이 너무 커요. 용량을 줄여 다시 보내 주세요";
  if (/recipient|550|553|554/i.test(raw)) return `받는 주소를 메일 서버가 거부했어요 (${raw.slice(0, 160)})`;
  return `메일을 보내지 못했어요 (${raw.slice(0, 160)})`;
}

function makeTransport(nodemailer, smtp, user, pass) {
  return nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure, requireTLS: smtp.requireTLS,
    auth: { user, pass },
    connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 20000,
  });
}

// 첨부 확인 — { filename, content(base64), contentType }
function cleanAttachments(list) {
  const arr = Array.isArray(list) ? list : [];
  if (arr.length > MAX_ATTACH) return { error: `첨부는 ${MAX_ATTACH}개까지 보낼 수 있어요` };
  let total = 0;
  const out = [];
  for (const a of arr) {
    if (!a || typeof a.content !== "string" || !a.content) continue;
    const content = a.content.includes(",") && /^data:/.test(a.content) ? a.content.split(",")[1] : a.content;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(content)) return { error: "첨부 파일 형식이 올바르지 않아요" };
    total += content.length;
    const filename = String(a.filename || "첨부파일").replace(/[\r\n\\/:*?"<>|]/g, "_").slice(0, 150) || "첨부파일";
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(String(a.contentType || "")) ? a.contentType : undefined;
    out.push({ filename, content, encoding: "base64", ...(contentType ? { contentType } : {}) });
  }
  if (total > MAX_ATTACH_B64) return { error: "첨부 파일이 너무 커요. 합쳐서 6MB 안으로 줄여 주세요" };
  return { list: out };
}

function makeCompanyMail({ db, FieldValue, HttpsError, getNodemailer, getKey = () => process.env.MAIL_CRED_KEY || "", now = () => Date.now(), log = console }) {
  const err = (code, msg, details) => new HttpsError(code, msg, details);
  const settingsRef = (co) => db.collection("companyMailSettings").doc(co);
  const secretRef = (key) => db.collection("companyMailSecrets").doc(key);

  // 누가 부르는가 — 회사 직원(기사 · 화주 · 배차마당 제외). 화주는 연동 운송사의 메일로만(보내기만)
  async function who(context, data = {}, { allowShipper = false } = {}) {
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요해요");
    const email = String(context.auth.token?.email || "").toLowerCase();
    const snap = await db.collection("users").doc(uid).get();
    const u = snap.exists ? snap.data() || {} : {};
    const role = String(u.role || "");
    const tm = email === SUPER_EMAIL || role === "totalMaster";
    if (!tm) {
      if (!snap.exists || u.approved === false || u.employmentStatus === "퇴사") throw err("permission-denied", "승인된 직원만 쓸 수 있어요");
      if (["driver", "cafeUser"].includes(role)) throw err("permission-denied", "직원 계정만 쓸 수 있어요");
      if (role === "shipper" && !allowShipper) throw err("permission-denied", "직원 계정만 쓸 수 있어요");
    }
    const shipper = role === "shipper";
    const company = String((tm ? data.company || u.companyName : shipper ? u.linkedTransportCompany?.companyName : u.companyName) || "").trim();
    if (!company) throw err("failed-precondition", "회사 정보가 없어요");
    if (!tm) {
      const plan = await db.collection("companyPlans").doc(company).get().catch(() => null);
      if (plan?.exists && plan.data()?.status === "ended") throw err("permission-denied", "이용 계약이 끝난 회사예요");
    }
    const finTeam = /경리|회계|재무/.test(String(u.team || ""));
    const admin = tm || ["admin", "test", "hrAcct", "allMgr"].includes(role) || u.isMaster === true || (finTeam && role === "admin");
    return { uid, email: email || String(u.email || "").toLowerCase(), u, role, tm, shipper, company, key: safeId(company), admin, viewer: role === "viewer", name: String(u.name || u.displayName || "") };
  }

  function publicOf(s = {}) {
    return {
      configured: !!(s.fromEmail && s.hasPassword),
      fromEmail: s.fromEmail || "", fromName: s.fromName || "", replyTo: s.replyTo || "",
      preset: s.preset || "", host: s.host || "", port: s.port || 0, security: s.security || "",
      hasPassword: !!s.hasPassword, passwordUpdatedAt: s.passwordUpdatedAt || 0,
      lastTestOk: s.lastTestOk ?? null, lastTestAt: s.lastTestAt || 0, lastTestError: s.lastTestError || "",
      updatedAt: s.updatedAt || 0, updatedByName: s.updatedByName || "",
    };
  }

  // 회사 설정 + 비밀번호 풀기 → 보낼 준비. 없으면 MAIL_NOT_CONFIGURED
  async function loadSender(company) {
    const key = safeId(company);
    const [s, sec] = await Promise.all([settingsRef(company).get(), secretRef(key).get()]);
    const st = s.exists ? s.data() || {} : {};
    const sc = sec.exists ? sec.data() || {} : {};
    if (!st.fromEmail || !sc.ct) throw err("failed-precondition", NOT_CONFIGURED_MSG, { code: NOT_CONFIGURED });
    const smtp = resolveSmtp(st);
    if (!smtp) throw err("failed-precondition", NOT_CONFIGURED_MSG, { code: NOT_CONFIGURED });
    if (!parseKey(getKey())) { log.error("[회사 메일] MAIL_CRED_KEY 비밀값이 없거나 짧아요"); throw err("failed-precondition", "메일 암호 키가 아직 설정되지 않았어요. 운영팀에 알려 주세요", { code: "MAIL_KEY_MISSING" }); }
    let pass;
    try { pass = decryptSecret(sc, getKey(), key); } catch {
      throw err("failed-precondition", "저장된 앱 비밀번호를 읽지 못했어요. 회사정보 › 메일 설정에서 다시 입력해 주세요", { code: NOT_CONFIGURED });
    }
    return { st, smtp, user: sc.user || st.fromEmail, pass, key };
  }

  // ── mailSettings ──
  async function getStatus(w) {
    const s = await settingsRef(w.company).get();
    return { company: w.company, canEdit: w.admin, myEmail: w.email, ...publicOf(s.exists ? s.data() : {}) };
  }

  async function save(w, data) {
    if (!w.admin) throw err("permission-denied", "메일 설정은 회사 관리자 · 경리 관리자만 바꿀 수 있어요");
    const fromEmail = cleanEmail(data.fromEmail);
    if (!EMAIL_RE.test(fromEmail)) throw err("invalid-argument", "발신 이메일 형식을 확인해 주세요");
    const preset = PRESETS[data.preset] ? data.preset : presetOfEmail(fromEmail) || "custom";
    const smtp = resolveSmtp({ preset, host: data.host, port: data.port, security: data.security });
    if (!smtp) throw err("invalid-argument", "보내는 서버 주소와 포트를 확인해 주세요");
    const replyTo = cleanEmail(data.replyTo);
    if (replyTo && !EMAIL_RE.test(replyTo)) throw err("invalid-argument", "회신 주소 형식을 확인해 주세요");
    const fromName = cleanName(data.fromName) || w.company;
    const password = typeof data.password === "string" ? data.password.replace(/\s+/g, preset === "gmail" ? "" : " ").trim() : "";
    if (password.length > 200) throw err("invalid-argument", "앱 비밀번호가 너무 길어요");

    const prevSnap = await settingsRef(w.company).get();
    const prev = prevSnap.exists ? prevSnap.data() || {} : {};
    const secSnap = await secretRef(w.key).get();
    const sec = secSnap.exists ? secSnap.data() || {} : {};
    const accountChanged = !!sec.user && sec.user !== fromEmail;
    if (!password && (!sec.ct || accountChanged)) throw err("invalid-argument", accountChanged ? "발신 이메일을 바꾸면 앱 비밀번호도 다시 넣어 주세요" : "앱 비밀번호를 넣어 주세요");

    const t = now();
    if (password) {
      if (!parseKey(getKey())) { log.error("[회사 메일] MAIL_CRED_KEY 비밀값이 없거나 짧아요"); throw err("failed-precondition", "메일 암호 키가 아직 설정되지 않았어요. 운영팀에 알려 주세요", { code: "MAIL_KEY_MISSING" }); }
      await secretRef(w.key).set({ companyName: w.company, user: fromEmail, ...encryptSecret(password, getKey(), w.key), updatedAt: t, updatedBy: w.uid }, { merge: true });
    }
    const connChanged = !!password || prev.fromEmail !== fromEmail || prev.host !== smtp.host || prev.port !== smtp.port || prev.security !== smtp.security;
    const next = {
      companyName: w.company, fromEmail, fromName, replyTo, preset, host: smtp.host, port: smtp.port, security: smtp.security,
      hasPassword: true, passwordUpdatedAt: password ? t : prev.passwordUpdatedAt || t,
      updatedAt: t, updatedBy: w.uid, updatedByName: w.name,
      ...(connChanged ? { lastTestOk: null, lastTestAt: 0, lastTestError: "" } : {}),
    };
    await settingsRef(w.company).set(next, { merge: true });
    return { ok: true, ...publicOf({ ...prev, ...next }) };
  }

  async function test(w) {
    if (!w.admin) throw err("permission-denied", "테스트 메일은 회사 관리자 · 경리 관리자만 보낼 수 있어요");
    const to = cleanEmail(w.email);
    if (!EMAIL_RE.test(to)) throw err("failed-precondition", "내 계정에 이메일 주소가 없어 테스트 메일을 보낼 곳이 없어요");
    const sender = await loadSender(w.company);
    const t = now();
    const times = (await secretRef(w.key).get()).data()?.testTimes;
    const recent = (Array.isArray(times) ? times : []).filter((x) => t - x < TEST_WINDOW_MS);
    if (recent.length >= TEST_LIMIT) throw err("resource-exhausted", "테스트 메일은 10분에 5번까지 보낼 수 있어요. 잠시 뒤 다시 해 주세요");
    await secretRef(w.key).set({ testTimes: [...recent, t].slice(-TEST_LIMIT) }, { merge: true });
    const nm = getNodemailer();
    try {
      const tr = makeTransport(nm, sender.smtp, sender.user, sender.pass);
      await tr.sendMail({
        from: { name: sender.st.fromName || w.company, address: sender.st.fromEmail }, to,
        ...(sender.st.replyTo ? { replyTo: sender.st.replyTo } : {}),
        subject: `[${w.company}] 메일 설정 테스트`,
        html: `<div style="font-family:'Malgun Gothic',sans-serif;font-size:15px;line-height:1.8;color:#1B2B4B">메일 설정이 잘 됐어요.<br>이제 거래명세서 · 미수금 안내 같은 메일이 <b>${sender.st.fromEmail}</b> 에서 나가요.</div>`,
      });
      await settingsRef(w.company).set({ lastTestOk: true, lastTestAt: t, lastTestError: "" }, { merge: true });
      return { ok: true, to };
    } catch (e) {
      const msg = smtpErrorText(e, sender.st.preset);
      await settingsRef(w.company).set({ lastTestOk: false, lastTestAt: t, lastTestError: msg }, { merge: true });
      return { ok: false, to, error: msg };
    }
  }

  async function remove(w) {
    if (!w.admin) throw err("permission-denied", "메일 설정은 회사 관리자 · 경리 관리자만 바꿀 수 있어요");
    await secretRef(w.key).delete();
    await settingsRef(w.company).delete();
    return { ok: true };
  }

  async function mailSettings(data = {}, context) {
    const w = await who(context, data);
    const action = String(data.action || "get");
    if (action === "get") return getStatus(w);
    if (action === "save") return save(w, data);
    if (action === "test") return test(w);
    if (action === "remove") return remove(w);
    throw err("invalid-argument", "모르는 요청이에요");
  }

  // ── sendCompanyMail ──
  async function countSend(w) {
    const ref = db.collection("companyMailUsage").doc(`${w.key}__${w.uid}__${kstYmd(now())}`);
    const cur = (await ref.get()).data()?.n || 0;
    const cap = w.shipper ? DAILY_LIMIT.shipper : DAILY_LIMIT.staff;
    if (!w.tm && cur >= cap) throw err("resource-exhausted", `오늘은 메일을 ${cap}통까지 보낼 수 있어요. 내일 다시 보내 주세요`);
    await ref.set({ companyName: w.company, uid: w.uid, n: (FieldValue?.increment ? FieldValue.increment(1) : cur + 1), at: now() }, { merge: true });
  }

  async function sendCompanyMail(data = {}, context) {
    const w = await who(context, data, { allowShipper: true });
    if (w.viewer) throw err("permission-denied", "조회 전용 계정은 메일을 보낼 수 없어요");
    const toList = splitList(data.to);
    const ccList = splitList(data.cc);
    const bccList = splitList(data.bcc);
    const subject = String(data.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
    if (!toList.length || !subject) throw err("invalid-argument", "받는 사람과 제목을 넣어 주세요", { code: "MISSING" });
    const bad = [...toList, ...ccList, ...bccList].filter((e) => !EMAIL_RE.test(e));
    if (bad.length) throw err("invalid-argument", `이메일 형식을 확인해 주세요: ${bad.slice(0, 5).join(", ")}`, { code: "BAD_TO" });
    if (toList.length + ccList.length + bccList.length > MAX_RCPT) throw err("invalid-argument", `한 번에 ${MAX_RCPT}명까지 보낼 수 있어요`, { code: "TOO_MANY" });
    const html = String(data.html || "");
    if (html.length > MAX_HTML) throw err("invalid-argument", "본문이 너무 길어요", { code: "TOO_LARGE" });
    const att = cleanAttachments(data.attachments);
    if (att.error) throw err("invalid-argument", att.error, { code: "BAD_ATTACH" });
    let replyTo = pickAddr(data.replyTo || data.fromEmail);
    if (replyTo && !EMAIL_RE.test(replyTo)) throw err("invalid-argument", `회신 주소 형식을 확인해 주세요: ${replyTo}`, { code: "BAD_FROM" });

    const sender = await loadSender(w.company);
    await countSend(w);
    // 화주(연동 운송사 메일로 보냄)는 답장이 화주 본인에게 가게
    if (w.shipper) replyTo = EMAIL_RE.test(w.email) ? w.email : "";
    if (!replyTo) replyTo = sender.st.replyTo || "";
    const name = cleanName(data.fromName) || sender.st.fromName || w.company;
    const mail = {
      from: { name, address: sender.st.fromEmail },
      to: toList.join(", "),
      ...(ccList.length ? { cc: ccList.join(", ") } : {}),
      ...(bccList.length ? { bcc: bccList.join(", ") } : {}),
      subject, html: html || subject,
      ...(replyTo && replyTo !== sender.st.fromEmail ? { replyTo: { name, address: replyTo } } : {}),
      ...(att.list.length ? { attachments: att.list } : {}),
    };
    const lg = data.log === false ? null : (data.log && typeof data.log === "object" ? data.log : {});
    const logId = lg ? crypto.randomUUID() : "";
    const writeLog = async (extra) => {
      if (!lg) return;
      await db.collection("emailLogs").doc(logId).set({
        id: logId, companyName: w.company, type: String(lg.type || "메일").slice(0, 40), client: String(lg.client || "-").slice(0, 120),
        to: toList.join(", "), ...(ccList.length ? { cc: ccList.join(", ") } : {}), ...(bccList.length ? { bccCount: bccList.length } : {}),
        subject, body: String(lg.body || "").slice(0, 8000), attachmentNames: att.list.map((a) => a.filename),
        fromName: name, ...(mail.replyTo ? { replyTo } : {}), sentFrom: sender.st.fromEmail,
        sentAt: now(), sentBy: w.email, sentByUid: w.uid, via: "sendCompanyMail", ...extra,
      }).catch((e) => log.error("[회사 메일] 기록 실패:", e?.message || e));
    };
    try {
      const info = await makeTransport(getNodemailer(), sender.smtp, sender.user, sender.pass).sendMail(mail);
      await writeLog({ status: "success", error: null });
      return { ok: true, messageId: info?.messageId || "", sentFrom: sender.st.fromEmail, fromName: name, replyTo: mail.replyTo ? replyTo : "", accepted: info?.accepted || [], rejected: info?.rejected || [], logId, logged: !!lg };
    } catch (e) {
      const msg = smtpErrorText(e, sender.st.preset);
      log.warn(`[회사 메일] ${w.company} 발송 실패: ${String(e?.code || "")} ${String(e?.message || e).slice(0, 200)}`);
      await writeLog({ status: "failed", error: msg });
      throw err("unavailable", msg, { code: String(e?.code || e?.responseCode || "SMTP"), logged: !!lg, logId });
    }
  }

  return { who, mailSettings, sendCompanyMail, loadSender, publicOf };
}

// ── 플랫폼 메일(LogisWeb → 운송사) — 비밀값 PLATFORM_SMTP_USER · PLATFORM_SMTP_PASS (없거나 "none"이면 건너뜀) ──
function makePlatformMailer({ getNodemailer, env = process.env, log = console }) {
  return async function sendPlatformMail(to, subject, html, { fromName = "LogisWeb 운영팀" } = {}) {
    const list = splitList(to).filter((e) => EMAIL_RE.test(e));
    if (!list.length) return { ok: true, skipped: true, reason: "받는 사람 없음" };
    const user = String(env.PLATFORM_SMTP_USER || "").trim();
    const pass = String(env.PLATFORM_SMTP_PASS || "").trim();
    if (!user || !pass || user === "none" || pass === "none") {
      log.log(`[플랫폼 메일] PLATFORM_SMTP_USER/PASS 비밀값이 없어 건너뜀: ${String(subject).slice(0, 80)}`);
      return { ok: true, skipped: true, reason: "플랫폼 메일 계정 없음" };
    }
    const preset = presetOfEmail(user) || "custom";
    const smtp = resolveSmtp({ preset, host: env.PLATFORM_SMTP_HOST, port: env.PLATFORM_SMTP_PORT || 465, security: env.PLATFORM_SMTP_SECURITY || "ssl" });
    if (!smtp) { log.warn("[플랫폼 메일] 보내는 서버를 알 수 없어 건너뜀(PLATFORM_SMTP_HOST)"); return { ok: true, skipped: true, reason: "서버 없음" }; }
    // 받는 사람끼리 주소가 보이지 않게 숨은 참조로
    const info = await makeTransport(getNodemailer(), smtp, user, pass).sendMail({
      from: { name: fromName, address: user }, to: list.length === 1 ? list[0] : { name: fromName, address: user },
      ...(list.length > 1 ? { bcc: list.join(", ") } : {}), subject: String(subject).replace(/[\r\n]+/g, " ").slice(0, 300), html,
    });
    return { ok: true, messageId: info?.messageId || "" };
  };
}

module.exports = {
  PRESETS, NOT_CONFIGURED, NOT_CONFIGURED_MSG, EMAIL_RE, MAX_ATTACH_B64,
  safeId, presetOfEmail, resolveSmtp, parseKey, encryptSecret, decryptSecret, smtpErrorText, cleanAttachments, splitList,
  makeCompanyMail, makePlatformMailer, makeTransport,
};
