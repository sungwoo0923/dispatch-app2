// ======================= functions/revenuePw.js =======================
// 🔐 2026-11-27 매출관리 비밀번호(회사 하나에 비밀번호 하나) — 호출형 함수 revenuePwStatus · revenuePwSet · revenuePwVerify
//  예전엔 회사 문서(companySettings/{회사}.revenuePassword)에 글자 그대로 있었고 화면이 비교했다 → 같은 회사 직원이면 누구나 읽을 수 있었다(사장님 요청으로 서버 확인)
//  · 누가 확인: 로그인 + 승인된 운송사 직원(지금 쓰는 회사 기준 effectiveUser · 퇴사 · 기사 · 화주 · 오더마켓 회원 제외 — execPin 과 같은 기준)
//  · 누가 정하기 · 바꾸기: 회사 마스터(isMaster · 다른 회사 손님은 아님) · 최고관리자 — 예전 화면(canSetRevenuePw)과 같은 기준
//     바꾸기는 지금 비밀번호 확인(틀린 횟수 · 잠금 같이) · 잊었으면 "새로 정하기"(forgot: true)로 지금 비밀번호 없이
//  · 서버에만 revenuePws/{회사 키} = { companyName, salt, hash(scrypt), updatedAt, updatedBy } — 보안 규칙이 화면 읽기 · 쓰기를 모두 막는다
//  · 틀린 횟수: revenuePwAttempts/{uid}(사람별) — 5번 틀리면 10분 잠금(또 틀리면 30분 · 60분)
//  · 옮기기: 회사 문서에 예전 글자 비밀번호(revenuePassword)가 남아 있으면 처음 status · verify 때 그 값으로 해시를 만들고 그 칸을 지운다
//     → 쓰던 비밀번호 그대로 계속 쓴다. 둘 다 없으면 "아직 없음"(예전처럼 마스터는 그 자리에서 정하고, 다른 사람은 못 연다)
//  화면: src/revenuePwApi.js(공용 호출) · src/DispatchApp.jsx(PC 매출관리 잠금) · src/mobile/MobileApp.jsx(SalesPinGate)
//  테스트: node scripts/revenuePw.test.cjs
const crypto = require("crypto");
const { effectiveUser } = require("./multiCompany");
const { isExecPinStaff, lockMinutesFor, MAX_FAILS, SUPER_EMAIL } = require("./execPin");

const SCRYPT = { N: 16384, r: 8, p: 1 };
const scryptAsync = (pw, salt) => new Promise((ok, no) => crypto.scrypt(String(pw ?? ""), salt, 32, SCRYPT, (e, k) => (e ? no(e) : ok(k))));
const PW_MIN = 4;
const PW_MAX = 64;

const s = (v) => (typeof v === "string" ? v.trim() : "");
// 회사 키 — 문서 이름에 "/" 를 못 쓰니 "_" 로(다른 회사별 문서와 같은 방식)
const coKey = (co) => s(co).replace(/\//g, "_").slice(0, 300);
// 비밀번호는 글자 그대로 비교한다(예전 화면 === 비교와 같게 — 앞뒤 공백도 그대로)
const pwStr = (p) => (typeof p === "string" ? p : typeof p === "number" ? String(p) : "");
function pwProblem(pw) {
  const p = pwStr(pw);
  if (!p.trim()) return "새 비밀번호를 넣어 주세요";
  if (p.length < PW_MIN) return `비밀번호는 ${PW_MIN}자리 이상으로 정해 주세요`;
  if (p.length > PW_MAX) return `비밀번호는 ${PW_MAX}자까지 돼요`;
  return "";
}
async function hashPw(pw, salt = crypto.randomBytes(16).toString("hex")) {
  const k = await scryptAsync(pwStr(pw), salt);
  return { salt, hash: k.toString("hex"), algo: "scrypt-16384-8-1" };
}
async function checkPw(pw, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = await scryptAsync(pwStr(pw), rec.salt);
  const want = Buffer.from(rec.hash, "hex");
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
const isSuperOf = (u, email) => s(email).toLowerCase() === SUPER_EMAIL || s(u?.role) === "totalMaster";
// 정하기 · 바꾸기 — 최고관리자 · 그 회사 마스터(u 는 effectiveUser 를 거친 값이라 손님 회사에선 isMaster=false)
function canSetRevenuePw(u, email = "") {
  if (!u || !isExecPinStaff(u, email)) return false;
  return isSuperOf(u, email) || u.isMaster === true;
}

function makeRevenuePw({ db, FieldValue, HttpsError }) {
  const err = (code, msg) => new HttpsError(code, msg);
  const pwRef = (key) => db.collection("revenuePws").doc(key);
  const attemptRef = (uid) => db.collection("revenuePwAttempts").doc(uid);
  const WARM = { ok: false, warm: true };

  async function who(context, data = {}) {
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요해요");
    const email = s(context?.auth?.token?.email);
    const [uSnap, aSnap] = await Promise.all([db.collection("users").doc(uid).get(), attemptRef(uid).get()]);
    const u = uSnap.exists ? effectiveUser(uSnap.data() || {}) : null;
    const staff = !!u && isExecPinStaff(u, email);
    const sup = !!u && isSuperOf(u, email);
    // 최고관리자는 화면에서 고른 회사(관리자센터에서 들어간 회사), 나머지는 지금 쓰는 회사만
    const company = s(sup ? s(data?.company) || u?.companyName : u?.companyName);
    return { uid, email, u: u || {}, staff, sup, canSet: !!u && canSetRevenuePw(u, email), company, key: coKey(company), attempt: aSnap.exists ? aSnap.data() || {} : {} };
  }
  const needStaff = (w) => {
    if (!w.staff) throw err("permission-denied", "승인된 직원 계정만 쓸 수 있어요");
    if (!w.key) throw err("failed-precondition", "회사 정보가 없어요. 다시 로그인해 주세요");
  };

  // 지금 비밀번호 기록 — 없고 회사 문서에 예전 글자 비밀번호가 있으면 여기서 해시로 옮기고 그 칸을 지운다
  async function loadPw(w) {
    const snap = await pwRef(w.key).get();
    if (snap.exists && snap.data()?.hash) return snap.data();
    if (w.company.includes("/")) return null; // 회사 문서 이름이 될 수 없는 이름 — 예전 칸도 없다
    const coRef = db.collection("companySettings").doc(w.company);
    const co = await coRef.get();
    const d = co.exists ? co.data() || {} : {};
    if (!Object.prototype.hasOwnProperty.call(d, "revenuePassword")) return null;
    const legacy = pwStr(d.revenuePassword);
    let rec = null;
    if (legacy) {
      const h = await hashPw(legacy);
      rec = { companyName: w.company, ...h, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now(), updatedBy: "migrate", migratedFrom: "companySettings.revenuePassword" };
      try { await pwRef(w.key).create(rec); } catch {
        // 그 사이 다른 사람이 먼저 옮겼거나 새로 정했다 → 그 값을 쓴다
        const again = await pwRef(w.key).get();
        rec = again.exists ? again.data() : rec;
      }
      console.log("[매출 비밀번호] 예전 칸을 해시로 옮김", { company: w.company, by: w.uid });
    }
    await coRef.update({ revenuePassword: FieldValue.delete() }).catch((e) => console.warn("[매출 비밀번호] 예전 칸 지우기 실패", w.company, e?.message));
    return rec;
  }

  // 틀렸을 때 횟수 올리기 — 5번째면 잠근다. 돌려주는 값: { lockUntil, left, minutes }
  async function countFail(w, now) {
    const a = w.attempt;
    const fails = (Number(a.fails) || 0) + 1;
    if (fails >= MAX_FAILS) {
      const locks = Number(a.locks) || 0;
      const lockUntil = now + lockMinutesFor(locks) * 60000;
      await attemptRef(w.uid).set({ uid: w.uid, companyName: w.company, fails: 0, locks: locks + 1, lockUntil, lastFailAt: now });
      return { lockUntil, left: 0, minutes: lockMinutesFor(locks) };
    }
    await attemptRef(w.uid).set({ uid: w.uid, companyName: w.company, fails, locks: Number(a.locks) || 0, lockUntil: 0, lastFailAt: now }, { merge: true });
    return { lockUntil: 0, left: MAX_FAILS - fails };
  }

  async function status(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context, data);
    if (!w.staff) return { staff: false };
    if (!w.key) return { staff: true, noCompany: true };
    const rec = await loadPw(w);
    const lockUntil = Number(w.attempt.lockUntil) || 0;
    return { staff: true, canSet: w.canSet, hasPw: !!rec?.hash, lockUntil: lockUntil > Date.now() ? lockUntil : 0 };
  }

  async function verify(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context, data);
    needStaff(w);
    const rec = await loadPw(w);
    if (!rec?.hash) return { ok: false, needSet: true, canSet: w.canSet };
    const now = Date.now();
    if ((Number(w.attempt.lockUntil) || 0) > now) return { ok: false, lockUntil: Number(w.attempt.lockUntil), left: 0 };
    if (!(await checkPw(data?.pw, rec))) {
      const r = await countFail(w, now);
      return r.lockUntil ? { ok: false, lockUntil: r.lockUntil, left: 0 } : { ok: false, left: r.left };
    }
    await attemptRef(w.uid).delete().catch(() => {});
    return { ok: true };
  }

  // 처음 정하기(없음) · 바꾸기(지금 비밀번호 확인 — verify 와 같은 횟수 · 잠금) · 잊었을 때 새로 정하기(forgot: true — 마스터 · 최고관리자라 확인 없이)
  async function setPw(data, context) {
    if (data?.warm === true) return WARM;
    const p = pwProblem(data?.newPw);
    if (p) throw err("invalid-argument", p);
    const w = await who(context, data);
    needStaff(w);
    if (!w.canSet) throw err("permission-denied", "매출 비밀번호는 회사 마스터 · 최고관리자만 정할 수 있어요");
    const rec = await loadPw(w);
    const forgot = data?.forgot === true;
    if (rec?.hash && !forgot) {
      const now = Date.now();
      const lockedUntil = Number(w.attempt.lockUntil) || 0;
      if (lockedUntil > now) throw err("resource-exhausted", `여러 번 틀려 잠겼어요. ${Math.ceil((lockedUntil - now) / 60000)}분 뒤 다시 해 주세요`);
      if (!(await checkPw(data?.currentPw, rec))) {
        const r = await countFail(w, now);
        if (r.lockUntil) throw err("resource-exhausted", `지금 비밀번호가 맞지 않아요. 여러 번 틀려 ${r.minutes}분 동안 잠겼어요`);
        throw err("permission-denied", `지금 비밀번호가 맞지 않아요 (${r.left}번 남았어요)`);
      }
    }
    const h = await hashPw(data.newPw);
    await Promise.all([
      pwRef(w.key).set({ companyName: w.company, ...h, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now(), updatedBy: w.uid, updatedByName: s(w.u.name) || w.email || "" }),
      attemptRef(w.uid).delete().catch(() => {}),
    ]);
    // 예전 칸이 남아 있으면(해시가 먼저 있던 회사) 같이 지운다 — 없으면 아무 일 없음
    if (!w.company.includes("/")) await db.collection("companySettings").doc(w.company).update({ revenuePassword: FieldValue.delete() }).catch(() => {});
    if (forgot && rec?.hash) console.log("[매출 비밀번호] 잊어서 새로 정함", { company: w.company, by: w.uid });
    return { ok: true, changed: !!rec?.hash };
  }

  return { status, setPw, verify };
}

module.exports = { makeRevenuePw, pwProblem, hashPw, checkPw, canSetRevenuePw, coKey, PW_MIN, PW_MAX };
