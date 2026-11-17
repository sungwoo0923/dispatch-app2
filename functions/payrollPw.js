// ======================= functions/payrollPw.js =======================
// ⭐ 2026-11-07 급여관리 비밀번호(한 번 더 확인) — 호출형 함수 payrollPwStatus · payrollPwSet · payrollPwVerify · payrollLock
//  · 비밀번호는 서버에만: payrollSecrets/{회사 키} = { salt, hash(scrypt), algo, updatedAt, updatedBy } (보안 규칙: 아무도 못 읽음)
//  · 맞으면 payrollUnlocks/{uid} = { uid, companyName, expiresAt(30분) } — 보안 규칙이 급여 문서를 읽고 쓸 때 이 문서를 확인한다
//  · 틀린 횟수: payrollPwAttempts/{회사 키}__{uid} — 5번 틀리면 10분 잠금(또 틀리면 30분 · 60분)
//  · 누가: 급여 담당(경리관리자 test · 경리사무원 acctStaff · 통합인사관리자 hrAcct · 통합관리자 allMgr · 재무·경리·회계·총무 부서 · 최고관리자)
//    비밀번호를 처음 정하거나 바꾸는 사람: 경리 관리자급(test · hrAcct · allMgr · 최고관리자, 또는 경리·회계 부서의 관리자·회사 마스터)
//  화면 기준: src/payrollAccess.js(같은 판단) · 규칙: firestore.rules payrollStaff()/payUnlocked()
const crypto = require("crypto");
// ⭐ 2026-11-17 속도 — scryptSync(동기)는 그동안 함수 전체를 멈춰 세웠다. 같은 값(N=16384 · r=8 · p=1)을 비동기로(스레드 풀에서) 계산한다.
//  해시 세기는 그대로(약하게 하지 않음) — 바꾸는 건 "기다리는 방식"과 "순서"뿐
const SCRYPT = { N: 16384, r: 8, p: 1 };
const scryptAsync = (pw, salt) => new Promise((ok, no) => crypto.scrypt(String(pw ?? ""), salt, 32, SCRYPT, (e, k) => (e ? no(e) : ok(k))));

const SUPER_EMAIL = "tjddnqkf@naver.com";
const FIN_TEAM = /재무|경리|회계|총무/;
const NON_STAFF = ["driver", "shipper", "cafeUser"];
const UNLOCK_MS = 30 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_STEPS_MIN = [10, 30, 60];
const PW_MIN = 6;
const PW_MAX = 32;
const RESET_REAUTH_SEC = 5 * 60; // 재설정 전 로그인 비밀번호 다시 확인 — 5분 안

const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
function isPayrollStaff(u = {}, email = "") {
  const role = String(u.role || "");
  if (email === SUPER_EMAIL || role === "totalMaster") return true;
  if (u.approved === false || NON_STAFF.includes(role) || u.employmentStatus === "퇴사") return false;
  return ["test", "acctStaff", "hrAcct", "allMgr"].includes(role) || FIN_TEAM.test(String(u.team || ""));
}
function isPayrollAdmin(u = {}, email = "") {
  const role = String(u.role || "");
  if (email === SUPER_EMAIL || role === "totalMaster") return true;
  if (!isPayrollStaff(u, email)) return false;
  return ["test", "hrAcct", "allMgr"].includes(role) || (FIN_TEAM.test(String(u.team || "")) && (role === "admin" || u.isMaster === true));
}
const DEFAULT_PW = "000000"; // ⭐ 2026-11-08 처음 비밀번호(정한 비밀번호가 없을 때만 통함)
function pwProblem(pw) {
  const s = String(pw ?? "");
  if (s.length < PW_MIN) return `비밀번호는 ${PW_MIN}자 이상으로 정해 주세요`;
  if (s.length > PW_MAX) return `비밀번호는 ${PW_MAX}자까지 됩니다`;
  if (/^(\d)\1+$/.test(s) || ["123456", "1234567", "12345678", "654321", "000000", "111111", "password", "qwerty"].includes(s.toLowerCase())) return "너무 쉬운 비밀번호예요. 다른 걸로 정해 주세요";
  return "";
}
function hashPw(pw, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(pw), salt, 32, SCRYPT).toString("hex");
  return { salt, hash, algo: "scrypt-16384-8-1" };
}
function checkPw(pw, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = crypto.scryptSync(String(pw ?? ""), rec.salt, 32, SCRYPT);
  const want = Buffer.from(rec.hash, "hex");
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
// ⭐ 2026-11-17 비동기판(서버 함수는 이것을 쓴다) — 결과는 hashPw · checkPw와 똑같다
async function hashPwAsync(pw, salt = crypto.randomBytes(16).toString("hex")) {
  const k = await scryptAsync(String(pw), salt);
  return { salt, hash: k.toString("hex"), algo: "scrypt-16384-8-1" };
}
async function checkPwAsync(pw, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = await scryptAsync(pw, rec.salt);
  const want = Buffer.from(rec.hash, "hex");
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
// 틀린 뒤 다음 잠금 시간(분) — 5번째 틀릴 때마다 10 → 30 → 60분
function lockMinutesFor(lockCount) { return LOCK_STEPS_MIN[Math.min(LOCK_STEPS_MIN.length - 1, Math.max(0, lockCount))]; }

function makePayrollPw({ db, FieldValue, Timestamp, HttpsError }) {
  const err = (code, msg) => new HttpsError(code, msg);
  async function who(context, data = {}) {
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요합니다");
    const email = String(context.auth.token?.email || "");
    const snap = await db.collection("users").doc(uid).get();
    const u = snap.exists ? snap.data() || {} : {};
    const tm = email === SUPER_EMAIL || u.role === "totalMaster";
    const company = String((tm ? data.company || u.companyName : u.companyName) || "").trim();
    if (!company) throw err("failed-precondition", "회사 정보가 없습니다");
    return { uid, email, u, company, key: safeId(company), staff: isPayrollStaff(u, email), admin: isPayrollAdmin(u, email) };
  }
  // ⭐ 2026-11-17 속도 — 예전엔 ① users 문서를 읽고 ② 그다음에 비밀번호 · 틀린 횟수 문서를 읽었다(왕복 2번).
  //  화면이 보낸 회사 이름으로 ②를 ①과 동시에 미리 읽어 두고, ①로 확인한 진짜 회사 키와 같을 때만 쓴다(다르면 다시 읽는다 — 결과는 예전과 같음)
  async function whoWith(context, data, refsOf) {
    const uid = context?.auth?.uid;
    const guess = uid && data?.company ? safeId(String(data.company).trim()) : "";
    const pre = guess ? Promise.all(refsOf(guess, uid).map((r) => r.get())).catch(() => null) : Promise.resolve(null);
    const w = await who(context, data);
    const got = w.key === guess ? await pre : null;
    return [w, got || await Promise.all(refsOf(w.key, w.uid).map((r) => r.get()))];
  }
  // ⭐ 2026-11-17 미리 깨우기 — 화면이 비밀번호 칸을 띄우면 그 서버 함수를 먼저 한 번 부른다(처음 켜지는 시간 · 콜드 스타트를 입력하는 동안 끝낸다)
  const WARM = { ok: false, warm: true };
  const secretRef = (key) => db.collection("payrollSecrets").doc(key);
  const unlockRef = (uid) => db.collection("payrollUnlocks").doc(uid);
  const attemptRef = (key, uid) => db.collection("payrollPwAttempts").doc(`${key}__${uid}`);
  async function issueUnlock(w) {
    const expiresAt = Timestamp.fromMillis(Date.now() + UNLOCK_MS);
    await unlockRef(w.uid).set({ uid: w.uid, companyName: w.company, expiresAt, at: FieldValue.serverTimestamp() });
    return expiresAt.toMillis();
  }
  async function revokeCompany(company, exceptUid) {
    const s = await db.collection("payrollUnlocks").where("companyName", "==", company).get();
    await Promise.all(s.docs.filter((d) => d.id !== exceptUid).map((d) => d.ref.delete()));
  }

  async function status(data, context) {
    if (data?.warm === true) return WARM;
    const [w, [sec, un, at]] = await whoWith(context, data, (key, uid) => [secretRef(key), unlockRef(uid), attemptRef(key, uid)]);
    if (!w.staff) return { staff: false, admin: false, hasPassword: false };
    const ex = un.exists ? un.data().expiresAt?.toMillis?.() || 0 : 0;
    const unlockedUntil = un.exists && un.data().companyName === w.company && ex > Date.now() ? ex : 0;
    const lockUntil = at.exists ? Number(at.data().lockUntil) || 0 : 0;
    return { staff: true, admin: w.admin, company: w.company, hasPassword: true, usingDefault: !(sec.exists && !!sec.data().hash), updatedAt: sec.exists ? sec.data().updatedAtMs || 0 : 0, updatedByName: sec.exists ? sec.data().updatedByName || "" : "", unlockedUntil, lockUntil: lockUntil > Date.now() ? lockUntil : 0 };
  }

  async function setPw(data, context) {
    if (data?.warm === true) return WARM;
    const p0 = pwProblem(data?.newPassword); // 서버까지 안 가도 되는 검사는 먼저
    if (p0 && context?.auth?.uid) throw err("invalid-argument", p0);
    const [w, [sec]] = await whoWith(context, data, (key) => [secretRef(key)]);
    if (!w.admin) throw err("permission-denied", "급여 비밀번호는 경리 관리자만 정하거나 바꿀 수 있어요");
    const has = sec.exists && !!sec.data().hash;
    const tm = w.email === SUPER_EMAIL || w.u.role === "totalMaster";
    // ⭐ 2026-11-17 속도 — 지금 비밀번호 확인 · 새 비밀번호 해시를 동시에 계산(확인이 틀리면 새 해시는 버린다)
    const [curOk, h] = await Promise.all([has && !tm ? checkPwAsync(data?.currentPassword, sec.data()) : true, hashPwAsync(data.newPassword)]);
    // 바꿀 때는 지금 비밀번호 확인(최고관리자는 잊어버린 회사를 위해 바로 다시 정할 수 있다)
    if (!curOk) throw err("permission-denied", "지금 비밀번호가 맞지 않아요");
    return { ok: true, expiresAt: await commitNewPw(w, h, has ? "change" : "set"), changed: has };
  }
  // ⭐ 2026-11-17 새 비밀번호 저장 · 다른 사람 잠금 해제 풀기 · 틀린 횟수 지우기 · 내 잠금 해제 — 예전엔 하나씩 차례로(왕복 4~5번), 이제 한 번에
  async function commitNewPw(w, h, action) {
    const [, , , expiresAt] = await Promise.all([
      secretRef(w.key).set({ companyName: w.company, ...h, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now(), updatedBy: w.uid, updatedByName: w.u.name || w.email || "", history: FieldValue.arrayUnion({ at: Date.now(), by: w.uid, byName: w.u.name || w.email || "", action }) }, { merge: true }),
      revokeCompany(w.company, w.uid), // 바꾸면 다른 사람의 잠금 해제는 모두 풀린다
      attemptRef(w.key, w.uid).delete().catch(() => {}),
      issueUnlock(w),
    ]);
    return expiresAt;
  }

  async function verify(data, context) {
    // ⭐ 2026-11-10 미리 깨우기 — 잠금 화면이 뜨면 화면이 먼저 한 번 부른다(비밀번호를 치는 동안 서버가 켜져 있게). 아무것도 읽거나 쓰지 않는다
    if (data?.warm === true) return { ok: false, warm: true };
    // ⭐ 2026-11-10 속도 — 비밀번호 문서·틀린 횟수 문서를 한 번에 읽는다 · ⭐ 2026-11-17 users 문서와도 동시에
    const [w, [sec, aSnap]] = await whoWith(context, data, (key, uid) => [secretRef(key), attemptRef(key, uid)]);
    if (!w.staff) throw err("permission-denied", "급여관리는 경리 담당자만 열 수 있어요");
    const aRef = attemptRef(w.key, w.uid);
    // ⭐ 2026-11-08 처음 비밀번호(DEFAULT_PW) — 아직 정한 비밀번호가 없으면 000000으로 열고, 경리 관리자는 바로 바꾸게 한다
    const noPw = !sec.exists || !sec.data().hash;
    const a = aSnap.data() || {};
    const now = Date.now();
    if ((Number(a.lockUntil) || 0) > now) return { ok: false, lockUntil: Number(a.lockUntil), left: 0 };
    if (noPw ? String(data?.password ?? "") !== DEFAULT_PW : !(await checkPwAsync(data?.password, sec.data()))) {
      const fails = (Number(a.fails) || 0) + 1;
      if (fails >= MAX_FAILS) {
        const locks = Number(a.locks) || 0;
        const lockUntil = now + lockMinutesFor(locks) * 60000;
        await aRef.set({ fails: 0, locks: locks + 1, lockUntil, lastFailAt: now, uid: w.uid, companyName: w.company });
        return { ok: false, lockUntil, left: 0 };
      }
      await aRef.set({ fails, locks: Number(a.locks) || 0, lockUntil: 0, lastFailAt: now, uid: w.uid, companyName: w.company }, { merge: true });
      return { ok: false, left: MAX_FAILS - fails };
    }
    const [, expiresAt] = await Promise.all([aSnap.exists ? aRef.delete().catch(() => {}) : null, issueUnlock(w)]);
    return { ok: true, expiresAt, mustChange: noPw };
  }

  // ⭐ 2026-11-10 급여 비밀번호를 잊었을 때 — 경리 관리자급이 "로그인 비밀번호로 방금 다시 로그인"했으면 지금 비밀번호 없이 새로 정한다
  //  · 화면이 reauthenticate 후 새 토큰을 받아 부른다 → 토큰의 auth_time(마지막 로그인 확인 시각)이 5분 안이어야 한다
  //  · 바꾸면 다른 사람의 잠금 해제는 모두 풀리고, 틀린 횟수도 지운다 · 기록(history)에 "reset"으로 남긴다
  async function resetPw(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context, data);
    if (!w.admin) throw err("permission-denied", "급여 비밀번호 재설정은 경리 관리자(경리관리자·통합인사관리자·통합관리자·회사 마스터)만 할 수 있어요");
    const authTime = Number(context.auth.token?.auth_time) || 0; // 초
    if (!authTime || Date.now() / 1000 - authTime > RESET_REAUTH_SEC) throw err("unauthenticated", "본인 확인 시간이 지났어요. 로그인 비밀번호를 다시 넣어 주세요");
    const p = pwProblem(data?.newPassword);
    if (p) throw err("invalid-argument", p);
    const h = await hashPwAsync(data.newPassword);
    return { ok: true, expiresAt: await commitNewPw(w, h, "reset") };
  }

  async function lock(data, context) {
    if (data?.warm === true) return WARM;
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요합니다");
    await unlockRef(uid).delete().catch(() => {});
    return { ok: true };
  }
  return { status, setPw, verify, lock, resetPw };
}

module.exports = { DEFAULT_PW, makePayrollPw, isPayrollStaff, isPayrollAdmin, pwProblem, hashPw, checkPw, hashPwAsync, checkPwAsync, lockMinutesFor, UNLOCK_MS, MAX_FAILS };
