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
const crypto = require("crypto");

const SUPER_EMAIL = "tjddnqkf@naver.com";
const CODE_RE = /^[A-Za-z0-9!@#$%^&*._-]{8,20}$/;
const MAX_FAIL = 5;
const LOCK_MS = 10 * 60 * 1000;

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

function makePnkMfa({ db, HttpsError, Timestamp, now = () => Date.now() }) {
  async function whoIs(context) {
    const uid = context?.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다");
    const email = String(context.auth.token?.email || "").toLowerCase();
    if (email === SUPER_EMAIL) return { uid, required: true, superMain: true };
    const u = await db.doc(`users/${uid}`).get().catch(() => null);
    const d = u?.exists ? u.data() : {};
    return { uid, required: d.role === "totalMaster", superMain: false, sub: d.subAdmin === true };
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
    if (action === "status") {
      const valid = !!ses && ses.authTime === authTime(context) && ses.until?.toMillis?.() > now();
      return { required: true, hasCode: !!sec?.h, valid, locked };
    }
    if (action === "setup") {
      if (sec?.h) throw new HttpsError("already-exists", "이미 2차 비밀번호가 있습니다");
      const code = String(data.code || "");
      if (!CODE_RE.test(code)) throw new HttpsError("invalid-argument", "2차 비밀번호는 영문 · 숫자 8자 이상으로 정해 주세요");
      if (/^(\d)\1+$|^(01234567|12345678|23456789|87654321|abcdefgh|11111111|00000000|password)/i.test(code)) throw new HttpsError("invalid-argument", "너무 쉬운 2차 비밀번호입니다");
      await secRef.set({ ...hashCode(code), fails: 0, lockUntil: 0, setAt: now() });
      await openSession(me.uid, context, data.remember);
      return { ok: true };
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
        await secRef.set({ ...hashCode(nc), fails: 0, lockUntil: 0, setAt: now() });
      } else {
        await secRef.set({ fails: 0, lockUntil: 0 }, { merge: true });
      }
      await openSession(me.uid, context, data.remember);
      return { ok: true };
    }
    throw new HttpsError("invalid-argument", "알 수 없는 요청");
  };
}

module.exports = { makePnkMfa, hashCode, same };
