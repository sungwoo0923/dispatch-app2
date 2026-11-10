// ======================= functions/pnkMfa.js =======================
// 🏢 2026-11-10 PnK PROJECT 인트라넷 — 최고관리자 · 부관리자 2차 인증(8자리 2차 비밀번호)
//  최고관리자(tjddnqkf@naver.com 또는 users.role "totalMaster") · 부관리자(totalMaster + subAdmin)는
//  로그인 비밀번호 다음에 8자리 2차 비밀번호를 넣어야 인트라넷 데이터가 열린다.
//  · 화면만 막는 게 아니라 규칙(firestore.rules pnkMfaOk)이 pnkMfaSessions/{uid} 를 보고 판단한다
//    → 이번 로그인(auth_time)에 대해 서버가 확인해 준 기록이 없으면 대표 계정이라도 인트라넷 문서를 못 읽는다
//  · 2차 비밀번호는 scrypt 해시로 pnkMfaSecrets/{uid} 에만(화면 · 규칙으로는 못 읽음)
//  · 5번 틀리면 10분 잠금. [자동 로그인]이면 30일, 아니면 12시간 동안 다시 묻지 않는다(다시 로그인하면 새로 묻는다)
//  호출형 pnkMfa { action: "status" | "setup" | "verify" | "change" | "reset", code, newCode, remember, uid }
//   · setup: 처음 한 번(아직 없을 때만) — 이후 바꾸려면 change(지금 2차 비밀번호 필요)
//   · reset: 최고관리자 본 계정이 부관리자의 2차 비밀번호를 지운다(부관리자는 다음 로그인 때 새로 정함)
// 📱 2026-11-10 처음 보는 기기만 3차 문자 인증 — 로지스웹 본체(app: "logis")와 인트라넷이 같은 2차 비밀번호 · 같은 기기 목록을 쓴다
//   · 화면이 기기마다 만든 임의 값(dev)을 같이 보낸다. 2차 비밀번호가 맞아도 pnkMfaSecrets/{uid}.devices 에 없는 기기면
//     { needSms: true, phone } 만 돌려주고 문을 열지 않는다 → 화면이 그 번호로 문자 인증(Firebase 전화 인증, 별도 연결)을 하고
//     받은 토큰(idToken)을 action "trust" 로 보낸다 → 서버가 토큰의 전화번호 = 등록 번호(users/{uid}.pcVerifyPhone)인지 확인하고 기기를 등록한다
//   · 등록된 번호가 아직 없으면 그때 인증한 번호를 등록한다(처음 한 번)
//   · app: "logis" 는 인트라넷 문(pnkMfaSessions)을 건드리지 않는다(로지스웹과 인트라넷은 로그인이 따로라 서로 밀어내면 안 된다)
const crypto = require("crypto");

const SUPER_EMAIL = "tjddnqkf@naver.com";
const CODE_RE = /^[A-Za-z0-9!@#$%^&*._-]{8,20}$/;
const MAX_FAIL = 5;
const LOCK_MS = 10 * 60 * 1000;
const PENDING_MS = 10 * 60 * 1000; // 2차 비밀번호 확인 뒤 문자 인증을 마칠 때까지
const MAX_DEVICES = 30;
const devKey = (dev) => { const d = String(dev || ""); return /^[A-Za-z0-9_-]{20,80}$/.test(d) ? crypto.createHash("sha256").update(d).digest("hex").slice(0, 32) : ""; };
const digits = (p) => String(p || "").replace(/\D/g, "").replace(/^82/, "0");

function hashCode(code, salt = crypto.randomBytes(16).toString("base64")) {
  const h = crypto.scryptSync(String(code), Buffer.from(salt, "base64"), 32, { N: 16384, r: 8, p: 1 }).toString("base64");
  return { salt, h };
}
function same(code, rec) {
  if (!rec?.salt || !rec?.h) return false;
  const a = Buffer.from(hashCode(code, rec.salt).h, "base64");
  const b = Buffer.from(rec.h, "base64");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function makePnkMfa({ db, HttpsError, Timestamp, now = () => Date.now(), verifyIdToken = null }) {
  async function whoIs(context) {
    const uid = context?.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다");
    const email = String(context.auth.token?.email || "").toLowerCase();
    const u = await db.doc(`users/${uid}`).get().catch(() => null);
    const d = u?.exists ? u.data() : {};
    const phone = String(d.pcVerifyPhone || "");
    if (email === SUPER_EMAIL) return { uid, required: true, superMain: true, phone };
    return { uid, required: d.role === "totalMaster", superMain: false, sub: d.subAdmin === true, phone };
  }
  const authTime = (context) => Number(context.auth.token?.auth_time || 0);
  async function openSession(uid, context, remember) {
    const ms = remember ? 30 * 86400e3 : 12 * 3600e3;
    await db.doc(`pnkMfaSessions/${uid}`).set({ authTime: authTime(context), until: Timestamp.fromMillis(now() + ms), at: Timestamp.fromMillis(now()), remember: !!remember });
  }

  return async function pnkMfa(data, context) {
    const me = await whoIs(context);
    const action = String(data.action || "status");
    const secRef = db.doc(`pnkMfaSecrets/${me.uid}`);
    if (action === "reset") {
      if (!me.superMain) throw new HttpsError("permission-denied", "최고관리자 본 계정만 초기화할 수 있습니다");
      const target = String(data.uid || "");
      if (!target || target === me.uid) throw new HttpsError("invalid-argument", "대상을 확인해 주세요");
      await Promise.all([db.doc(`pnkMfaSecrets/${target}`).delete(), db.doc(`pnkMfaSessions/${target}`).delete()]);
      return { ok: true };
    }
    if (!me.required) return { required: false, ok: true };
    const sec = (await secRef.get()).data() || null;
    const ses = (await db.doc(`pnkMfaSessions/${me.uid}`).get()).data() || null;
    const locked = sec?.lockUntil && sec.lockUntil > now() ? sec.lockUntil : 0;
    const logis = data.app === "logis";
    const dk = devKey(data.dev);
    const trusted = !!(dk && sec?.devices?.[dk]);
    // 2차 비밀번호가 맞은 뒤 — 아는 기기면 문을 열고, 처음 보는 기기면 문자 인증을 기다린다
    const afterCode = async () => {
      if (trusted) {
        await secRef.set({ devices: { [dk]: { ...sec.devices[dk], last: now() } }, pending: null }, { merge: true });
        if (!logis) await openSession(me.uid, context, data.remember);
        return { ok: true, v: 2 };
      }
      if (!dk) throw new HttpsError("invalid-argument", "화면을 새로고침한 뒤 다시 해 주세요");
      await secRef.set({ pending: { dev: dk, at: now(), authTime: authTime(context), remember: !!data.remember } }, { merge: true });
      return { ok: true, v: 2, needSms: true, phone: me.phone };
    };
    if (action === "status") {
      const valid = !!ses && ses.authTime === authTime(context) && ses.until?.toMillis?.() > now();
      return { required: true, hasCode: !!sec?.h, valid, locked, trusted, v: 2 };
    }
    // 3차 문자 인증 확인 → 이 기기를 등록하고 문을 연다
    if (action === "trust") {
      const pd = sec?.pending;
      if (!dk || !pd || pd.dev !== dk || pd.authTime !== authTime(context) || now() - pd.at > PENDING_MS) throw new HttpsError("failed-precondition", "시간이 지났습니다. 2차 비밀번호부터 다시 해 주세요");
      if (!verifyIdToken) throw new HttpsError("internal", "문자 인증을 확인할 수 없습니다");
      const tk = await verifyIdToken(String(data.idToken || "")).catch(() => null);
      const got = digits(tk?.phone_number);
      if (!tk || !got || now() - Number(tk.auth_time || 0) * 1000 > PENDING_MS) throw new HttpsError("permission-denied", "문자 인증을 확인하지 못했습니다. 다시 해 주세요");
      if (me.phone && digits(me.phone) !== got) throw new HttpsError("permission-denied", "등록된 휴대폰 번호와 다릅니다");
      if (!me.phone) await db.doc(`users/${me.uid}`).set({ pcVerifyPhone: String(tk.phone_number) }, { merge: true });
      const devices = { ...(sec.devices || {}) };
      devices[dk] = { at: now(), last: now(), ua: String(data.ua || "").slice(0, 160), app: logis ? "logis" : "pnk" };
      const keys = Object.keys(devices).sort((a, b) => (devices[b].last || 0) - (devices[a].last || 0));
      keys.slice(MAX_DEVICES).forEach((k) => { delete devices[k]; });
      const { pending: _drop, ...rest } = sec; // eslint-disable-line no-unused-vars
      await secRef.set({ ...rest, devices });
      if (!logis) await openSession(me.uid, context, pd.remember);
      return { ok: true, v: 2 };
    }
    if (action === "setup") {
      if (sec?.h) throw new HttpsError("already-exists", "이미 2차 비밀번호가 있습니다");
      const code = String(data.code || "");
      if (!CODE_RE.test(code)) throw new HttpsError("invalid-argument", "2차 비밀번호는 영문 · 숫자 8자 이상으로 정해 주세요");
      if (/^(\d)\1+$|^(01234567|12345678|23456789|87654321|abcdefgh|11111111|00000000|password)/i.test(code)) throw new HttpsError("invalid-argument", "너무 쉬운 2차 비밀번호입니다");
      await secRef.set({ ...hashCode(code), fails: 0, lockUntil: 0, setAt: now() });
      return afterCode();
    }
    if (action === "verify" || action === "change") {
      if (!sec?.h) throw new HttpsError("failed-precondition", "2차 비밀번호를 먼저 정해 주세요");
      if (locked) throw new HttpsError("resource-exhausted", `여러 번 틀려 잠겼습니다. ${Math.ceil((locked - now()) / 60000)}분 뒤 다시 해 주세요`);
      if (!same(String(data.code || ""), sec)) {
        const fails = (sec.fails || 0) + 1;
        await secRef.set({ fails: fails >= MAX_FAIL ? 0 : fails, lockUntil: fails >= MAX_FAIL ? now() + LOCK_MS : 0 }, { merge: true });
        throw new HttpsError("permission-denied", fails >= MAX_FAIL ? "5번 틀려 10분 동안 잠겼습니다" : `2차 비밀번호가 맞지 않습니다 (${fails}/${MAX_FAIL})`);
      }
      if (action === "change") {
        const nc = String(data.newCode || "");
        if (!CODE_RE.test(nc)) throw new HttpsError("invalid-argument", "새 2차 비밀번호는 영문 · 숫자 8자 이상");
        await secRef.set({ ...hashCode(nc), fails: 0, lockUntil: 0, setAt: now() }, { merge: true });
      } else {
        await secRef.set({ fails: 0, lockUntil: 0 }, { merge: true });
      }
      return afterCode();
    }
    throw new HttpsError("invalid-argument", "알 수 없는 요청");
  };
}

module.exports = { makePnkMfa, hashCode, same };
