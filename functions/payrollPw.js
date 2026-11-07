// ======================= functions/payrollPw.js =======================
// ⭐ 2026-11-07 급여관리 비밀번호(한 번 더 확인) — 호출형 함수 payrollPwStatus · payrollPwSet · payrollPwVerify · payrollLock
//  · 비밀번호는 서버에만: payrollSecrets/{회사 키} = { salt, hash(scrypt), algo, updatedAt, updatedBy } (보안 규칙: 아무도 못 읽음)
//  · 맞으면 payrollUnlocks/{uid} = { uid, companyName, expiresAt(30분) } — 보안 규칙이 급여 문서를 읽고 쓸 때 이 문서를 확인한다
//  · 틀린 횟수: payrollPwAttempts/{회사 키}__{uid} — 5번 틀리면 10분 잠금(또 틀리면 30분 · 60분)
//  · 누가: 급여 담당(경리관리자 test · 경리사무원 acctStaff · 통합인사관리자 hrAcct · 통합관리자 allMgr · 재무·경리·회계·총무 부서 · 최고관리자)
//    비밀번호를 처음 정하거나 바꾸는 사람: 경리 관리자급(test · hrAcct · allMgr · 최고관리자, 또는 경리·회계 부서의 관리자·회사 마스터)
//  화면 기준: src/payrollAccess.js(같은 판단) · 규칙: firestore.rules payrollStaff()/payUnlocked()
const crypto = require("crypto");

const SUPER_EMAIL = "tjddnqkf@naver.com";
const FIN_TEAM = /재무|경리|회계|총무/;
const NON_STAFF = ["driver", "shipper", "cafeUser"];
const UNLOCK_MS = 30 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_STEPS_MIN = [10, 30, 60];
const PW_MIN = 6;
const PW_MAX = 32;

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
  const hash = crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, hash, algo: "scrypt-16384-8-1" };
}
function checkPw(pw, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = crypto.scryptSync(String(pw ?? ""), rec.salt, 32, { N: 16384, r: 8, p: 1 });
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
    const w = await who(context, data);
    if (!w.staff) return { staff: false, admin: false, hasPassword: false };
    const [sec, un, at] = await Promise.all([secretRef(w.key).get(), unlockRef(w.uid).get(), attemptRef(w.key, w.uid).get()]);
    const ex = un.exists ? un.data().expiresAt?.toMillis?.() || 0 : 0;
    const unlockedUntil = un.exists && un.data().companyName === w.company && ex > Date.now() ? ex : 0;
    const lockUntil = at.exists ? Number(at.data().lockUntil) || 0 : 0;
    return { staff: true, admin: w.admin, company: w.company, hasPassword: true, usingDefault: !(sec.exists && !!sec.data().hash), updatedAt: sec.exists ? sec.data().updatedAtMs || 0 : 0, updatedByName: sec.exists ? sec.data().updatedByName || "" : "", unlockedUntil, lockUntil: lockUntil > Date.now() ? lockUntil : 0 };
  }

  async function setPw(data, context) {
    const w = await who(context, data);
    if (!w.admin) throw err("permission-denied", "급여 비밀번호는 경리 관리자만 정하거나 바꿀 수 있어요");
    const p = pwProblem(data?.newPassword);
    if (p) throw err("invalid-argument", p);
    const sec = await secretRef(w.key).get();
    const has = sec.exists && !!sec.data().hash;
    const tm = w.email === SUPER_EMAIL || w.u.role === "totalMaster";
    // 바꿀 때는 지금 비밀번호 확인(최고관리자는 잊어버린 회사를 위해 바로 다시 정할 수 있다)
    if (has && !tm && !checkPw(data?.currentPassword, sec.data())) throw err("permission-denied", "지금 비밀번호가 맞지 않아요");
    const h = hashPw(data.newPassword);
    await secretRef(w.key).set({ companyName: w.company, ...h, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now(), updatedBy: w.uid, updatedByName: w.u.name || w.email || "", history: FieldValue.arrayUnion({ at: Date.now(), by: w.uid, byName: w.u.name || w.email || "", action: has ? "change" : "set" }) }, { merge: true });
    // 바꾸면 다른 사람의 잠금 해제는 모두 풀린다
    await revokeCompany(w.company, w.uid);
    await attemptRef(w.key, w.uid).delete().catch(() => {});
    const expiresAt = await issueUnlock(w);
    return { ok: true, expiresAt, changed: has };
  }

  async function verify(data, context) {
    const w = await who(context, data);
    if (!w.staff) throw err("permission-denied", "급여관리는 경리 담당자만 열 수 있어요");
    const sec = await secretRef(w.key).get();
    // ⭐ 2026-11-08 처음 비밀번호(DEFAULT_PW) — 아직 정한 비밀번호가 없으면 000000으로 열고, 경리 관리자는 바로 바꾸게 한다
    const noPw = !sec.exists || !sec.data().hash;
    const aRef = attemptRef(w.key, w.uid);
    const a = (await aRef.get()).data() || {};
    const now = Date.now();
    if ((Number(a.lockUntil) || 0) > now) return { ok: false, lockUntil: Number(a.lockUntil), left: 0 };
    if (noPw ? String(data?.password ?? "") !== DEFAULT_PW : !checkPw(data?.password, sec.data())) {
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
    await aRef.delete().catch(() => {});
    const expiresAt = await issueUnlock(w);
    return { ok: true, expiresAt, mustChange: noPw };
  }

  async function lock(data, context) {
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요합니다");
    await unlockRef(uid).delete().catch(() => {});
    return { ok: true };
  }
  return { status, setPw, verify, lock };
}

module.exports = { DEFAULT_PW, makePayrollPw, isPayrollStaff, isPayrollAdmin, pwProblem, hashPw, checkPw, lockMinutesFor, UNLOCK_MS, MAX_FAILS };
