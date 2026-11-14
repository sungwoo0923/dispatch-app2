// ======================= functions/passwordResetSms.js =======================
// 🔑 2026-11-14 비밀번호 찾기 — 이메일 링크 대신 "가입할 때 넣은 휴대폰" 문자 인증 → 새 비밀번호
//  화면(src/PasswordResetSms.jsx): 이메일 + 휴대폰 번호 → Firebase 문자 인증(별도 로그인 칸 — 지금 로그인과 무관) → 인증번호 6자리
//   → 새 비밀번호 두 번 → 이 함수에 { email, idToken(문자 인증 토큰), newPassword }
//  서버: 토큰의 전화번호 = 그 이메일 계정의 users/{uid}.phone(또는 pcVerifyPhone)인지 확인 → 비밀번호 교체(예전 비밀번호는 더 이상 안 됨)
//   → 다른 기기 로그인도 끊는다(revokeRefreshTokens) → 문자 인증 때 생긴 전화번호 임시 계정은 지운다
//  · 계정이 있는지 없는지는 알려 주지 않는다(번호가 다르거나 계정이 없으면 같은 문구)
//  · 1시간에 5번까지(passwordResetSms/{이메일 해시})
const crypto = require("crypto");

const WINDOW_MS = 60 * 60 * 1000;
const MAX_TRY = 5;
const TOKEN_MS = 10 * 60 * 1000;
const digits = (p) => String(p || "").replace(/\D/g, "").replace(/^82/, "0");
const NOT_MATCH = "가입할 때 넣은 휴대폰 번호와 이메일이 맞지 않습니다";

function makePasswordResetSms({ db, HttpsError, now = () => Date.now(), getUserByEmail, verifyIdToken, updatePassword, revoke, deleteUser }) {
  return async function resetPasswordSms(data) {
    const email = String(data.email || "").trim().toLowerCase();
    const pw = String(data.newPassword || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "이메일을 확인해 주세요");
    if (pw.length < 6 || pw.length > 64) throw new HttpsError("invalid-argument", "새 비밀번호는 6자 이상으로 정해 주세요");
    // 횟수 제한
    const lref = db.doc(`passwordResetSms/${crypto.createHash("sha256").update(email).digest("hex").slice(0, 32)}`);
    const lim = (await lref.get()).data() || {};
    const tries = (lim.from && now() - lim.from < WINDOW_MS) ? (lim.n || 0) : 0;
    if (tries >= MAX_TRY) throw new HttpsError("resource-exhausted", "시도가 너무 많습니다. 1시간 뒤 다시 해 주세요");
    await lref.set({ from: tries ? lim.from : now(), n: tries + 1, at: now() });
    // 문자 인증 토큰
    const tk = await verifyIdToken(String(data.idToken || "")).catch(() => null);
    const got = digits(tk?.phone_number);
    if (!tk || !got || now() - Number(tk.auth_time || 0) * 1000 > TOKEN_MS) throw new HttpsError("permission-denied", "문자 인증을 확인하지 못했습니다. 인증번호를 다시 받아 주세요");
    const cleanup = async (keepUid) => { if (deleteUser && tk.uid && tk.uid !== keepUid && !tk.email) await deleteUser(tk.uid).catch(() => {}); };
    // 계정 · 등록 번호
    const user = await getUserByEmail(email).catch(() => null);
    if (!user) { await cleanup(""); throw new HttpsError("permission-denied", NOT_MATCH); }
    const snap = await db.doc(`users/${user.uid}`).get().catch(() => null);
    const d = snap?.exists ? snap.data() : {};
    const phones = [d.phone, d.pcVerifyPhone, d.전화번호, d.연락처].map(digits).filter((x) => x.length >= 10);
    if (!phones.includes(got)) { await cleanup(user.uid); throw new HttpsError("permission-denied", NOT_MATCH); }
    if (d.userStatus === "banned") { await cleanup(user.uid); throw new HttpsError("permission-denied", "사용할 수 없는 계정입니다. 관리자에게 문의하세요"); }
    await updatePassword(user.uid, pw);
    if (revoke) await revoke(user.uid).catch(() => {});
    await db.doc(`users/${user.uid}`).set({ pwResetAt: now(), pwResetBy: "sms" }, { merge: true }).catch(() => {});
    await lref.delete().catch(() => {});
    await cleanup(user.uid);
    return { ok: true };
  };
}

module.exports = { makePasswordResetSms, digits };
