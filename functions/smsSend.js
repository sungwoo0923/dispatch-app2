// ======================= functions/smsSend.js =======================
// 💬 2026-11-10 문자 보내기(팝빌) — "휴대폰과 연결"이 없는 PC에서도 회사 번호로 문자를 보낸다
//  · smsSend(callable)   { to: [{ phone, name }], content, subject? } → { status, sent, failed, items }
//      90바이트 이하 = 단문(SMS), 넘으면 장문(LMS · 2,000바이트) · 한 번에 최대 100명
//  · smsInfo(callable)   { month? } → { connected, mode, sender, usage{ sms, lms, alimtalk }, price{ sms, lms, alimtalk } }
//  · 요금: 팝빌은 로지스웹이 한꺼번에 내고(파트너 과금), 운송사별 사용량(messageUsage/{회사}__{YYYY-MM})을 세어 월말에 로지스웹이 청구한다
//      단가는 관리센터 › 청구 › 문자·알림톡 사용량에서 정한다(platformConfig/messagePricing — 최고관리자만)
//  · 설정: popbillSettings/{회사}.sms { mode: "phone" | "popbill" | "auto", senderNumber } (비우면 알림톡 발신번호)
//  · 기록: smsLogs/{자동} — 받는 번호는 가운데를 가리고, 내용은 앞 40자만
const err = (code, msg) => Object.assign(new Error(msg), { code });
const onlyDigits = (v) => String(v ?? "").replace(/[^\d]/g, "");
const mask = (p) => { const d = onlyDigits(p); return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : "***"; };
// EUC-KR 기준 바이트(한글 2 · 그 밖 1) — 팝빌 단문 90바이트 기준
const bytesOf = (s) => [...String(s || "")].reduce((a, ch) => a + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
const SMS_MAX = 90;
const ymOf = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 7);
const DEFAULT_PRICE = { sms: 20, lms: 50, alimtalk: 15 }; // 단가를 아직 안 정했을 때 보여줄 값(원 · 부가세 별도)
// 운송사별 월 사용량 — 서버만 쓴다(성공한 건만 센다)
async function addUsage(db, FieldValue, co, at, add) {
  const month = ymOf(at);
  const inc = {}; Object.entries(add).forEach(([k, v]) => { if (v) inc[k] = FieldValue.increment(v); });
  if (!Object.keys(inc).length) return;
  await db.collection("messageUsage").doc(`${co}__${month}`).set({ company: co, month, ...inc, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
}
const MAX_TO = 100;

function smsSettingsOf(doc) {
  const d = doc || {};
  const s = d.sms || {};
  const mode = ["phone", "popbill", "auto"].includes(s.mode) ? s.mode : "phone";
  return { mode, senderNumber: onlyDigits(s.senderNumber || d.alimtalk?.senderNumber || "") };
}

function makeSmsSend({ db, FieldValue, getPopbill, callerOf, now = () => Date.now() }) {
  async function ctx(auth, { send = false } = {}) {
    const who = await callerOf(db, auth);
    if (who.tier !== "staff") throw err("permission-denied", "운송사 직원만 쓸 수 있어요");
    if (send) {
      const u = await db.collection("users").doc(auth.uid).get().catch(() => null);
      if (u?.data()?.role === "viewer") throw err("permission-denied", "조회전용 권한으로는 보낼 수 없어요");
    }
    const co = who.co;
    const [setDoc, corpDoc] = await Promise.all([
      db.collection("popbillSettings").doc(co).get().catch(() => null),
      db.collection("companyPopbill").doc(co).get().catch(() => null),
    ]);
    const settings = smsSettingsOf(setDoc?.exists ? setDoc.data() : {});
    const member = corpDoc?.exists ? corpDoc.data() || {} : {};
    const pb = await getPopbill();
    const connected = !!pb?.enabled && onlyDigits(member.corpNum).length === 10;
    return { who, co, settings, member, pb, connected };
  }

  async function info(data, auth) {
    const c = await ctx(auth);
    const month = /^\d{4}-\d{2}$/.test(String(data?.month || "")) ? data.month : ymOf(now());
    const [u, pr] = await Promise.all([
      db.collection("messageUsage").doc(`${c.co}__${month}`).get().catch(() => null),
      db.collection("platformConfig").doc("messagePricing").get().catch(() => null),
    ]);
    const ud = u?.exists ? u.data() || {} : {};
    const pd = pr?.exists ? pr.data() || {} : {};
    return {
      connected: c.connected, mode: c.settings.mode, sender: c.settings.senderNumber, month,
      reason: c.connected ? "" : (!c.pb?.enabled ? "팝빌 연결 전이에요" : "팝빌 연동회원 등록 전이에요"),
      usage: { sms: Number(ud.sms) || 0, lms: Number(ud.lms) || 0, alimtalk: Number(ud.alimtalk) || 0 },
      price: { sms: Number(pd.sms ?? DEFAULT_PRICE.sms), lms: Number(pd.lms ?? DEFAULT_PRICE.lms), alimtalk: Number(pd.alimtalk ?? DEFAULT_PRICE.alimtalk) },
    };
  }

  async function send(data, auth) {
    const c = await ctx(auth, { send: true });
    const content = String(data?.content || "").trim();
    if (!content) throw err("invalid-argument", "보낼 내용을 입력해 주세요");
    const list = (Array.isArray(data?.to) ? data.to : []).map((r) => ({ phone: onlyDigits(r?.phone), name: String(r?.name || "").slice(0, 30) }))
      .filter((r) => /^01\d{8,9}$/.test(r.phone));
    const seen = new Set();
    const to = list.filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true)));
    if (!to.length) throw err("invalid-argument", "받는 휴대폰 번호가 없어요");
    if (to.length > MAX_TO) throw err("invalid-argument", `한 번에 ${MAX_TO}명까지 보낼 수 있어요`);
    const at = now();
    const kind = bytesOf(content) > SMS_MAX ? "LMS" : "SMS";
    const logBase = { companyName: c.co, by: auth.uid, kind, count: to.length, preview: content.slice(0, 40), to: to.map((r) => mask(r.phone)), at, createdAt: FieldValue.serverTimestamp() };
    if (!c.connected) {
      await db.collection("smsLogs").add({ ...logBase, status: "off", error: !c.pb?.enabled ? "팝빌 연결 전" : "연동회원 등록 전" }).catch(() => {});
      return { status: "off", sent: 0, failed: to.length, reason: !c.pb?.enabled ? "팝빌 연결 전이에요" : "팝빌 연동회원 등록 전이에요" };
    }
    const sender = c.settings.senderNumber;
    if (!sender) throw err("failed-precondition", "발신번호가 없어요 · 회사정보 › 문자 보내기에서 팝빌에 등록한 회사 번호를 넣어 주세요");
    const items = [];
    for (const r of to) {
      const m = { sender, receiver: r.phone, receiverName: r.name, content, subject: String(data?.subject || "").slice(0, 40) || "안내", userId: c.member.userId || null };
      const res = kind === "LMS" ? await c.pb.sendLms(c.member.corpNum, m) : await c.pb.sendSms(c.member.corpNum, m);
      items.push({ to: mask(r.phone), ok: !!res.ok, receiptNum: res.receiptNum || "", error: res.ok ? "" : (res.error || "실패") });
    }
    const sent = items.filter((x) => x.ok).length;
    await addUsage(db, FieldValue, c.co, at, { [kind === "LMS" ? "lms" : "sms"]: sent });
    const status = sent === to.length ? "sent" : sent ? "partial" : "failed";
    await db.collection("smsLogs").add({ ...logBase, status, sent, failed: to.length - sent, items }).catch(() => {});
    return { status, sent, failed: to.length - sent, kind, items };
  }

  return { send, info };
}

module.exports = { makeSmsSend, smsSettingsOf, bytesOf, addUsage, DEFAULT_PRICE };
