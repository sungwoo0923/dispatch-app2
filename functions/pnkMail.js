// ======================= functions/pnkMail.js =======================
// 🏢 2026-11-10 PnK PROJECT 인트라넷 사내메일 — 외부(@pnkproject.com ↔ 네이버 · 구글 등) 보내기 · 받기
//  구성원끼리 메일은 화면이 pnkMail 문서를 만들면 끝(서버 일 없음). 이 파일은 "밖으로/밖에서" 오가는 메일만 맡는다.
//
//  1) 보내기 — Firestore 트리거 pnkMailOnCreate
//     화면이 pnkMail 에 extTo(외부 주소) · extStatus "queued" 를 넣어 만들면, 이 함수가 회사 발송 서버(SMTP)로 보낸다.
//     · 보내는 주소는 화면 값이 아니라 보낸 사람 구성원 문서(pnkMembers.mailId)로 다시 만든다(남의 주소로 위장 방지)
//     · 결과: extStatus "sent"(messageId) | "failed"(extError) — 화면 보낸메일함에 표시
//     · 한 사람 하루 200통(pnkMailUsage/{uid}_{날짜}), 첨부 합계 15MB
//  2) 받기 — HTTPS pnkMailInbound?key=비밀토큰
//     도메인 MX 를 메일 수신 서비스(Cloudflare Email Routing · Mailgun · SendGrid 등)에 두고, 받은 메일을 이 주소로 넘기게 한다.
//     · 원문(message/rfc822) · multipart 폼(Mailgun/SendGrid) · JSON 모두 받는다
//     · 받는 주소의 아이디(@ 앞)로 구성원을 찾아 받은메일함에 넣는다. 없는 주소는 대표에게(catch-all)
//     · 첨부는 Storage pnk/mail/{메일 id}/ 에 저장
//  3) 설정 — 호출형 pnkMailAdmin { action: "get" | "save" | "test" | "token" | "off" } (대표 · 인트라넷 관리자만)
//     · 발송 서버 비밀번호는 MAIL_CRED_KEY 로 암호화해 pnkMailSecrets/smtp 에(화면 · 규칙으로는 못 읽음)
//     · 비밀이 아닌 값(서버 · 포트 · 계정 · 테스트 결과 · 외부 메일 켜짐)은 pnkCompany/info.mailServer · mailExternal
//     · 받기 토큰은 pnkMailSecrets/inbound.token — [token] 으로 새로 만들 수 있다(예전 주소는 바로 막힘)
const crypto = require("crypto");

const SUPER_EMAIL = "tjddnqkf@naver.com";
const DOMAIN = "pnkproject.com"; // PnK PROJECT 회사 도메인(가비아) — 화면 pnk-site/src/pnkApi.js MAIL_DOMAIN 과 같게
const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/;
const DAILY = 200;
const MAX_ATTACH = 15 * 1024 * 1024;
const MAX_IN_ATTACH = 20 * 1024 * 1024;
const AAD = "pnk-smtp";

const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cleanName = (v, max = 80) => String(v || "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const safeFile = (n) => String(n || "file").replace(/[/\\#?\r\n]/g, "_").slice(0, 120) || "file";
const stripHtml = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
// "홍길동 <a@b.com>, c@d.com" → [{ name, addr }]
function parseAddrs(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(parseAddrs);
  if (typeof v === "object") {
    if (Array.isArray(v.value)) return v.value.map((x) => ({ name: cleanName(x.name), addr: String(x.address || "").toLowerCase() })).filter((x) => EMAIL_RE.test(x.addr));
    if (v.address) return [{ name: cleanName(v.name), addr: String(v.address).toLowerCase() }];
  }
  return String(v).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => {
    const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    const addr = String(m ? m[2] : s).trim().toLowerCase();
    return { name: cleanName(m ? m[1] : ""), addr };
  }).filter((x) => EMAIL_RE.test(x.addr));
}

function makePnkMail({ db, FieldValue, HttpsError, getNodemailer, getBucket, lib, getMailParser, env = process.env, log = console }) {
  const keyOf = () => env.MAIL_CRED_KEY || "";

  async function isPnkAdmin(context) {
    const uid = context?.auth?.uid;
    if (!uid) return false;
    if (String(context.auth.token?.email || "").toLowerCase() === SUPER_EMAIL) return true;
    const [u, m] = await Promise.all([db.doc(`users/${uid}`).get().catch(() => null), db.doc(`pnkMembers/${uid}`).get().catch(() => null)]);
    if (u?.exists && u.data().role === "totalMaster") return true;
    const d = m?.exists ? m.data() : {};
    return d.status === "active" && ["owner", "admin"].includes(d.role);
  }
  async function loadSmtp() {
    const s = await db.doc("pnkMailSecrets/smtp").get();
    if (!s.exists) return null;
    const d = s.data();
    const smtp = lib.resolveSmtp({ preset: "custom", host: d.host, port: d.port, security: d.security });
    if (!smtp || !d.user || !d.pass) return null;
    return { smtp, user: d.user, pass: lib.decryptSecret(d.pass, keyOf(), AAD) };
  }
  const transport = (c) => getNodemailer().createTransport({
    host: c.smtp.host, port: c.smtp.port, secure: c.smtp.secure, requireTLS: c.smtp.requireTLS, auth: { user: c.user, pass: c.pass },
    connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 30000,
  });
  const publicServer = (d) => ({ host: d.host || "", port: Number(d.port) || 0, security: d.security || "", user: d.user || "", hasPassword: !!d.pass });
  const projectId = () => env.GCLOUD_PROJECT || env.GCP_PROJECT || "dispatch-app-9b92f";
  const inboundUrl = (token) => (token ? `https://us-central1-${projectId()}.cloudfunctions.net/pnkMailInbound?key=${token}` : "");

  // ───────────── 3) 설정(호출형) ─────────────
  async function admin(data, context) {
    if (!(await isPnkAdmin(context))) throw new HttpsError("permission-denied", "대표 · 인트라넷 관리자만 바꿀 수 있습니다");
    const action = String(data.action || "get");
    const secRef = db.doc("pnkMailSecrets/smtp");
    const inRef = db.doc("pnkMailSecrets/inbound");
    const infoRef = db.doc("pnkCompany/info");
    if (action === "get") {
      const [s, t, i] = await Promise.all([secRef.get(), inRef.get(), infoRef.get()]);
      const info = i.exists ? i.data() : {};
      return { server: s.exists ? publicServer(s.data()) : null, inboundUrl: inboundUrl(t.exists ? t.data().token : ""), external: info.mailExternal === true, lastTest: info.mailServer?.lastTest || null, domain: DOMAIN };
    }
    if (action === "save") {
      const smtp = lib.resolveSmtp({ preset: "custom", host: data.host, port: data.port, security: data.security });
      if (!smtp) throw new HttpsError("invalid-argument", "보내는 서버 주소 · 포트를 확인해 주세요");
      const user = String(data.user || "").trim();
      if (!user || user.length > 200) throw new HttpsError("invalid-argument", "로그인 아이디(계정)를 넣어 주세요");
      const prev = (await secRef.get()).data() || {};
      const pass = String(data.pass || "");
      if (!pass && !prev.pass) throw new HttpsError("invalid-argument", "비밀번호(API 키)를 넣어 주세요");
      if (!keyOf() || keyOf() === "none") throw new HttpsError("failed-precondition", "서버 암호 키(MAIL_CRED_KEY)가 없습니다");
      const rec = { host: smtp.host, port: smtp.port, security: smtp.security, user, pass: pass ? lib.encryptSecret(pass, keyOf(), AAD) : prev.pass, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.auth.uid };
      await secRef.set(rec);
      await infoRef.set({ mailServer: { ...publicServer(rec), lastTest: null }, mailExternal: false }, { merge: true });
      return { ok: true };
    }
    if (action === "test") {
      const to = String(data.to || "").trim().toLowerCase();
      if (!EMAIL_RE.test(to)) throw new HttpsError("invalid-argument", "테스트 메일을 받을 주소를 넣어 주세요");
      const me = (await db.doc(`pnkMembers/${context.auth.uid}`).get()).data() || {};
      if (!me.mailId) throw new HttpsError("failed-precondition", "내 사내메일 아이디가 없습니다(구성원 관리에서 정해 주세요)");
      const c = await loadSmtp().catch(() => null);
      if (!c) throw new HttpsError("failed-precondition", "보내는 서버를 먼저 저장해 주세요");
      let ok = true; let err = "";
      try {
        await transport(c).sendMail({ from: { name: cleanName(me.name) || "PnK PROJECT", address: `${me.mailId}@${DOMAIN}` }, to, subject: "[PnK PROJECT] 사내메일 외부 발송 테스트",
          text: `PnK PROJECT 인트라넷에서 보낸 테스트 메일입니다.\n보낸 주소: ${me.mailId}@${DOMAIN}` });
      } catch (e) { ok = false; err = lib.smtpErrorText(e, "custom"); log.warn("[PnK 메일] 테스트 실패:", e?.message); }
      await infoRef.set({ mailServer: { lastTest: { ok, err, at: Date.now(), to } }, ...(ok ? { mailExternal: true } : {}) }, { merge: true });
      return { ok, error: err };
    }
    if (action === "token") {
      const token = crypto.randomBytes(24).toString("base64url");
      await inRef.set({ token, at: FieldValue.serverTimestamp(), by: context.auth.uid });
      return { inboundUrl: inboundUrl(token) };
    }
    if (action === "off") { await infoRef.set({ mailExternal: false }, { merge: true }); return { ok: true }; }
    throw new HttpsError("invalid-argument", "알 수 없는 요청");
  }

  // ───────────── 1) 보내기(트리거) ─────────────
  async function onCreate(snap) {
    const d = snap.data() || {};
    const ext = [...(d.extTo || []), ...(d.extCc || [])].map((a) => String(a || "").toLowerCase()).filter((a) => EMAIL_RE.test(a) && !a.endsWith(`@${DOMAIN}`));
    if (!ext.length || d.extStatus !== "queued") return null;
    const fail = (msg) => snap.ref.update({ extStatus: "failed", extError: msg, extAt: Date.now() }).then(() => null);
    const info = (await db.doc("pnkCompany/info").get()).data() || {};
    if (info.mailExternal !== true) return fail("외부 메일이 아직 연결되지 않았습니다(회사 정보 › 메일 서버)");
    const me = (await db.doc(`pnkMembers/${d.fromUid}`).get()).data();
    if (!me || me.status !== "active" || !me.mailId) return fail("보낸 사람 메일 주소가 없습니다");
    if (ext.length > 30) return fail("외부 받는 사람은 한 번에 30명까지");
    // 하루 한도
    const uref = db.doc(`pnkMailUsage/${d.fromUid}_${kstDate()}`);
    const over = await db.runTransaction(async (tx) => {
      const u = await tx.get(uref);
      const n = (u.exists ? u.data().n : 0) + ext.length;
      if (n > DAILY) return true;
      tx.set(uref, { n, uid: d.fromUid, date: kstDate() }, { merge: true });
      return false;
    });
    if (over) return fail(`하루 외부 발송 한도(${DAILY}통)를 넘었습니다`);
    const c = await loadSmtp().catch((e) => { log.error("[PnK 메일] 서버 설정 읽기 실패", e?.message); return null; });
    if (!c) return fail("보내는 서버 설정을 읽지 못했습니다");
    // 첨부
    const attachments = [];
    let total = 0;
    for (const a of (d.attachments || []).slice(0, 20)) {
      if (!a?.path || !String(a.path).startsWith(`pnk/mail/${snap.id}/`)) continue;
      total += Number(a.size) || 0;
      if (total > MAX_ATTACH) return fail("외부 메일 첨부는 합계 15MB까지");
      const [buf] = await getBucket().file(a.path).download();
      attachments.push({ filename: safeFile(a.name), content: buf, contentType: a.type || undefined });
    }
    // 답장이면 원래 메일 Message-ID 로 묶는다
    let threading = {};
    if (d.replyTo) {
      const o = await db.doc(`pnkMail/${d.replyTo}`).get().catch(() => null);
      const mid = o?.exists ? o.data().messageId : "";
      if (mid) threading = { inReplyTo: mid, references: [o.data().references, mid].filter(Boolean).join(" ") };
    }
    const fromAddr = `${me.mailId}@${DOMAIN}`;
    const fmt = (l) => (l || []).map((x) => ({ name: cleanName(x.name), address: String(x.addr || "").toLowerCase() })).filter((x) => EMAIL_RE.test(x.address));
    try {
      const r = await transport(c).sendMail({
        from: { name: cleanName(me.name) || "PnK PROJECT", address: fromAddr }, replyTo: fromAddr,
        to: fmt(d.to), cc: fmt(d.cc), envelope: { from: fromAddr, to: ext },
        subject: String(d.subject || "(제목 없음)").replace(/[\r\n]+/g, " ").slice(0, 300),
        text: String(d.body || ""), html: `<div style="font-family:'Malgun Gothic',sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap">${esc(d.body)}</div>`,
        attachments, ...threading,
      });
      await snap.ref.update({ extStatus: "sent", extError: "", extAt: Date.now(), messageId: r?.messageId || "", fromAddr });
    } catch (e) {
      log.warn("[PnK 메일] 외부 발송 실패:", e?.message);
      await fail(lib.smtpErrorText(e, "custom"));
    }
    return null;
  }

  // ───────────── 2) 받기(HTTPS) ─────────────
  async function parseInbound(req) {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    const raw = req.rawBody || Buffer.from("");
    const fromMime = async (buf) => {
      const m = await getMailParser().simpleParser(buf);
      return {
        from: parseAddrs(m.from)[0], to: parseAddrs(m.to), cc: parseAddrs(m.cc), subject: m.subject || "", text: m.text || "", html: m.html || "",
        messageId: m.messageId || "", inReplyTo: m.inReplyTo || "", references: Array.isArray(m.references) ? m.references.join(" ") : m.references || "",
        files: (m.attachments || []).map((a) => ({ name: a.filename || "file", type: a.contentType || "", buf: a.content })),
      };
    };
    if (ct.startsWith("message/rfc822") || ct.startsWith("text/plain") || ct.startsWith("application/octet-stream")) {
      const out = await fromMime(raw);
      const hdrTo = parseAddrs(req.headers["x-original-to"] || req.headers["x-to"] || "");
      if (hdrTo.length) out.envelopeTo = hdrTo;
      return out;
    }
    if (ct.startsWith("multipart/form-data") || ct.startsWith("application/x-www-form-urlencoded")) {
      const fd = await new Response(raw, { headers: { "content-type": req.headers["content-type"] } }).formData();
      const g = (k) => (typeof fd.get(k) === "string" ? fd.get(k) : "");
      if (g("email")) return fromMime(Buffer.from(g("email"))); // SendGrid "원문 보내기"
      const files = [];
      for (const [, v] of fd.entries()) if (v && typeof v === "object" && typeof v.arrayBuffer === "function") files.push({ name: v.name || "file", type: v.type || "", buf: Buffer.from(await v.arrayBuffer()) });
      let headers = {};
      try { headers = Object.fromEntries((JSON.parse(g("message-headers") || "[]")).map(([k, v]) => [String(k).toLowerCase(), v])); } catch { /* 없음 */ }
      return {
        from: parseAddrs(g("from") || g("sender"))[0], to: parseAddrs(g("To") || g("to")), cc: parseAddrs(g("Cc") || g("cc")),
        envelopeTo: parseAddrs(g("recipient") || ""), subject: g("subject") || g("Subject"),
        text: g("body-plain") || g("text") || g("stripped-text"), html: g("body-html") || g("html"),
        messageId: g("Message-Id") || headers["message-id"] || "", inReplyTo: g("In-Reply-To") || headers["in-reply-to"] || "", references: headers.references || "", files,
      };
    }
    // JSON — { from, to, cc, subject, text, html, raw(base64 원문) }
    const j = req.body && typeof req.body === "object" ? req.body : JSON.parse(raw.toString("utf8") || "{}");
    if (j.raw) return fromMime(Buffer.from(String(j.raw), "base64"));
    return { from: parseAddrs(j.from)[0], to: parseAddrs(j.to), cc: parseAddrs(j.cc), subject: j.subject || "", text: j.text || "", html: j.html || "", messageId: j.messageId || "", files: [] };
  }

  async function inbound(req, res) {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).send("POST only");
    const t = (await db.doc("pnkMailSecrets/inbound").get()).data()?.token || "";
    const k = String(req.query.key || req.headers["x-pnk-key"] || "");
    if (!t || k.length !== t.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(t))) return res.status(401).send("bad key");
    let m;
    try { m = await parseInbound(req); } catch (e) { log.warn("[PnK 메일] 받은 메일 해석 실패", e?.message); return res.status(400).send("parse error"); }
    if (!m?.from) return res.status(400).send("no sender");
    // 받는 사람 — 봉투 주소(실제 배달 주소)를 먼저, 없으면 To · Cc 중 우리 도메인
    const ours = [...(m.envelopeTo || []), ...(m.to || []), ...(m.cc || [])].map((x) => x.addr).filter((a) => a.endsWith(`@${DOMAIN}`));
    const ids = [...new Set(ours.map((a) => a.split("@")[0]))].slice(0, 30);
    const found = [];
    for (const id of ids) {
      const s = await db.collection("pnkMembers").where("mailId", "==", id).limit(1).get();
      const mm = s.docs[0]?.data();
      if (mm && mm.status === "active") found.push({ uid: mm.uid || s.docs[0].id, name: mm.name || "", addr: `${id}@${DOMAIN}` });
    }
    if (!found.length) { // 없는 주소 → 대표에게
      const o = await db.collection("pnkMembers").where("role", "==", "owner").limit(3).get();
      o.docs.forEach((x) => { const mm = x.data(); if (mm.status === "active") found.push({ uid: x.id, name: mm.name || "대표", addr: ours[0] || `${mm.mailId || "info"}@${DOMAIN}` }); });
    }
    if (!found.length) return res.status(200).send("no recipient");
    const ref = db.collection("pnkMail").doc();
    // 첨부 저장
    const atts = [];
    let total = 0;
    for (const f of (m.files || []).slice(0, 20)) {
      total += f.buf?.length || 0;
      if (!f.buf || total > MAX_IN_ATTACH) break;
      const path = `pnk/mail/${ref.id}/${Date.now()}_${safeFile(f.name)}`;
      await getBucket().file(path).save(f.buf, { contentType: f.type || "application/octet-stream", resumable: false });
      atts.push({ name: safeFile(f.name), path, size: f.buf.length, type: f.type || "" });
    }
    const text = String(m.text || "").trim() || stripHtml(m.html);
    await ref.set({
      direction: "in", external: true, fromUid: "", fromName: m.from.name || m.from.addr, fromAddr: m.from.addr,
      to: (m.to || []).slice(0, 30), cc: (m.cc || []).slice(0, 30), toUids: [...new Set(found.map((x) => x.uid))], deliveredTo: found,
      subject: String(m.subject || "(제목 없음)").slice(0, 300), body: text.slice(0, 200000), html: String(m.html || "").slice(0, 500000),
      attachments: atts, messageId: m.messageId || "", inReplyTo: m.inReplyTo || "", references: String(m.references || "").slice(0, 2000),
      readBy: {}, trashBy: {}, starBy: {}, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ ok: true, id: ref.id, delivered: found.length });
  }

  return { admin, onCreate, inbound };
}

module.exports = { makePnkMail, parseAddrs, stripHtml, DOMAIN };
