// ======================= functions/privateFarePin.js =======================
const { effectiveUser } = require("./multiCompany"); // 🏢 2026-11-24 여러 회사 오가기 — 지금 쓰는 회사 기준
// 🔐 2026-11-18 비공개 운임 비밀번호(사람별) — 호출형 함수 pfPinStatus · pfPinSet · pfPinVerify · pfLock
//  · 누가: 최고관리자가 관리자센터에서 지정한 사람만(privateFareGrants/{uid}.on == true · 그 사람 회사와 같음)
//  · 비밀번호: 4~8자 숫자 · 영문(대소문자 구분 없음 — 대문자로 맞춰 저장) · 서버에만 privateFarePins/{uid} = { salt, hash(scrypt) }
//  · 맞으면 privateFareUnlocks/{uid} = { uid, companyName, expiresAt(30분) } — 보안 규칙이 금고 문서를 읽고 쓸 때 확인
//  · 틀린 횟수: privateFarePinAttempts/{uid} — 5번 틀리면 10분 잠금(또 틀리면 30분 · 60분)
//  · 처음 들어갈 때(비밀번호 없음) 그 자리에서 정한다 · 잊으면 최고관리자가 관리자센터에서 초기화(문서 삭제) → 다음에 새로 정함
//  화면: src/PrivateFareVault.jsx · 규칙: firestore.rules pfVaultOk()
const crypto = require("crypto");

const SCRYPT = { N: 16384, r: 8, p: 1 };
const scryptAsync = (pw, salt) => new Promise((ok, no) => crypto.scrypt(String(pw ?? ""), salt, 32, SCRYPT, (e, k) => (e ? no(e) : ok(k))));
const SUPER_EMAIL = "tjddnqkf@naver.com";
const UNLOCK_MS = 30 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_STEPS_MIN = [10, 30, 60];
const PIN_MIN = 4;
const PIN_MAX = 8;

// 비밀번호 모양 맞추기(대문자 · 앞뒤 공백 없음)
const normPin = (p) => String(p ?? "").trim().toUpperCase();
function pinProblem(pin) {
  const s = normPin(pin);
  if (!/^[0-9A-Z]+$/.test(s)) return "비밀번호는 숫자와 영문만 쓸 수 있어요";
  if (s.length < PIN_MIN) return `비밀번호는 ${PIN_MIN}자 이상으로 정해 주세요`;
  if (s.length > PIN_MAX) return `비밀번호는 ${PIN_MAX}자까지 돼요`;
  if (/^(.)\1+$/.test(s) || ["1234", "12345", "123456", "1234567", "12345678", "4321", "0000", "1111", "ABCD"].includes(s)) return "너무 쉬운 비밀번호예요. 다른 걸로 정해 주세요";
  return "";
}
async function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  const k = await scryptAsync(normPin(pin), salt);
  return { salt, hash: k.toString("hex"), algo: "scrypt-16384-8-1" };
}
async function checkPin(pin, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = await scryptAsync(normPin(pin), rec.salt);
  const want = Buffer.from(rec.hash, "hex");
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
const lockMinutesFor = (n) => LOCK_STEPS_MIN[Math.min(LOCK_STEPS_MIN.length - 1, Math.max(0, n))];

function makePrivateFarePin({ db, FieldValue, Timestamp, HttpsError }) {
  const err = (code, msg) => new HttpsError(code, msg);
  const grantRef = (uid) => db.collection("privateFareGrants").doc(uid);
  const pinRef = (uid) => db.collection("privateFarePins").doc(uid);
  const unlockRef = (uid) => db.collection("privateFareUnlocks").doc(uid);
  const attemptRef = (uid) => db.collection("privateFarePinAttempts").doc(uid);

  // 지정된 사람인지 — users · 지정 · 비밀번호 · 틀린 횟수를 한 번에 읽는다
  async function who(context) {
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요해요");
    const [uSnap, gSnap, pSnap, aSnap] = await Promise.all([db.collection("users").doc(uid).get(), grantRef(uid).get(), pinRef(uid).get(), attemptRef(uid).get()]);
    const u = uSnap.exists ? effectiveUser(uSnap.data() || {}) : {};
    const g = gSnap.exists ? gSnap.data() || {} : {};
    const company = String(u.companyName || "").trim();
    const granted = g.on === true && !!company && String(g.companyName || "").trim() === company && u.approved !== false && u.employmentStatus !== "퇴사";
    return { uid, u, g, company, granted, pin: pSnap.exists ? pSnap.data() : null, attempt: aSnap.exists ? aSnap.data() || {} : {} };
  }
  async function issueUnlock(w) {
    const expiresAt = Timestamp.fromMillis(Date.now() + UNLOCK_MS);
    await unlockRef(w.uid).set({ uid: w.uid, companyName: w.company, expiresAt, at: FieldValue.serverTimestamp() });
    await grantRef(w.uid).set({ lastOpenedAt: Date.now() }, { merge: true }).catch(() => {});
    return expiresAt.toMillis();
  }
  const WARM = { ok: false, warm: true };

  async function status(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context);
    if (!w.granted) return { granted: false };
    const un = await unlockRef(w.uid).get();
    const ex = un.exists ? un.data().expiresAt?.toMillis?.() || 0 : 0;
    let unlockedUntil = un.exists && un.data().companyName === w.company && ex > Date.now() ? ex : 0;
    if (data?.touch === true && unlockedUntil) unlockedUntil = await issueUnlock(w); // 쓰는 동안 늘리기
    const lockUntil = Number(w.attempt.lockUntil) || 0;
    return { granted: true, company: w.company, hasPin: !!w.pin?.hash, unlockedUntil, lockUntil: lockUntil > Date.now() ? lockUntil : 0 };
  }

  // 처음 정하기(비밀번호 없을 때) · 바꾸기(지금 비밀번호 확인)
  async function setPin(data, context) {
    if (data?.warm === true) return WARM;
    const p = pinProblem(data?.newPin);
    if (p) throw err("invalid-argument", p);
    const w = await who(context);
    if (!w.granted) throw err("permission-denied", "비공개 운임을 쓸 수 있게 지정된 계정이 아니에요");
    // 🔒 2026-11-26 보안 — 바꾸기의 "지금 비밀번호" 확인도 열기(verify)와 같은 틀린 횟수 · 잠금을 쓴다(예전엔 여기서 무한히 맞춰 볼 수 있었다)
    if (w.pin?.hash) {
      const now = Date.now();
      const a = w.attempt;
      const lockedUntil = Number(a.lockUntil) || 0;
      if (lockedUntil > now) throw err("resource-exhausted", `여러 번 틀려 잠겼어요. ${Math.ceil((lockedUntil - now) / 60000)}분 뒤 다시 해 주세요`);
      if (!(await checkPin(data?.currentPin, w.pin))) {
        const fails = (Number(a.fails) || 0) + 1;
        if (fails >= MAX_FAILS) {
          const locks = Number(a.locks) || 0;
          const lockUntil = now + lockMinutesFor(locks) * 60000;
          await attemptRef(w.uid).set({ uid: w.uid, fails: 0, locks: locks + 1, lockUntil, lastFailAt: now });
          throw err("resource-exhausted", `지금 비밀번호가 맞지 않아요. 여러 번 틀려 ${lockMinutesFor(locks)}분 동안 잠겼어요`);
        }
        await attemptRef(w.uid).set({ uid: w.uid, fails, locks: Number(a.locks) || 0, lockUntil: 0, lastFailAt: now }, { merge: true });
        throw err("permission-denied", `지금 비밀번호가 맞지 않아요 (${MAX_FAILS - fails}번 남았어요)`);
      }
    }
    const h = await hashPin(data.newPin);
    await Promise.all([
      pinRef(w.uid).set({ uid: w.uid, companyName: w.company, ...h, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now() }),
      attemptRef(w.uid).delete().catch(() => {}),
    ]);
    return { ok: true, expiresAt: await issueUnlock(w) };
  }

  async function verify(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context);
    if (!w.granted) throw err("permission-denied", "비공개 운임을 쓸 수 있게 지정된 계정이 아니에요");
    if (!w.pin?.hash) return { ok: false, needSet: true };
    const now = Date.now();
    const a = w.attempt;
    if ((Number(a.lockUntil) || 0) > now) return { ok: false, lockUntil: Number(a.lockUntil), left: 0 };
    if (!(await checkPin(data?.pin, w.pin))) {
      const fails = (Number(a.fails) || 0) + 1;
      if (fails >= MAX_FAILS) {
        const locks = Number(a.locks) || 0;
        const lockUntil = now + lockMinutesFor(locks) * 60000;
        await attemptRef(w.uid).set({ uid: w.uid, fails: 0, locks: locks + 1, lockUntil, lastFailAt: now });
        return { ok: false, lockUntil, left: 0 };
      }
      await attemptRef(w.uid).set({ uid: w.uid, fails, locks: Number(a.locks) || 0, lockUntil: 0, lastFailAt: now }, { merge: true });
      return { ok: false, left: MAX_FAILS - fails };
    }
    await attemptRef(w.uid).delete().catch(() => {});
    return { ok: true, expiresAt: await issueUnlock(w) };
  }

  async function lock(data, context) {
    if (data?.warm === true) return WARM;
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요해요");
    await unlockRef(uid).delete().catch(() => {});
    return { ok: true };
  }
  return { status, setPin, verify, lock };
}

module.exports = { makePrivateFarePin, pinProblem, normPin, hashPin, checkPin, lockMinutesFor, PIN_MIN, PIN_MAX, MAX_FAILS, UNLOCK_MS, SUPER_EMAIL };
