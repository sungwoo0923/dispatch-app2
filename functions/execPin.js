// ======================= functions/execPin.js =======================
// 🔐 2026-11-27 인사이트(모바일) · 지입차관리 "완전 삭제" PIN(사람별) — 호출형 함수 execPinStatus · execPinSet · execPinVerify · execPinReset
//  예전엔 휴대폰 · 브라우저 localStorage(exec_intel_pin_v1)에만 있고 화면에서 비교했다 → [재설정]으로 누구나 새로 정할 수 있었다(사장님 요청으로 서버 확인)
//  · 누가: 로그인 + 승인된 운송사 직원(지금 쓰는 회사 기준 effectiveUser · 퇴사 · 기사 · 화주 · 오더마켓 회원 제외)
//  · PIN: 숫자 4~8자리(화면은 6자리 숫자 패드) · 0000 · 1234 · 111111 같은 쉬운 번호는 거절
//  · 서버에만 execPins/{uid} = { uid, companyName, salt, hash(scrypt) } — 보안 규칙이 화면 읽기 · 쓰기를 모두 막는다
//  · 틀린 횟수: execPinAttempts/{uid} — 5번 틀리면 10분 잠금(또 틀리면 30분 · 60분) · 바꾸기의 "지금 PIN" 확인도 같은 횟수 · 잠금
//  · 처음(서버에 PIN 없음): 그 자리에서 새로 정한다(예전 기기 PIN 은 무시)
//  · 잊으면: 본인은 못 지운다 → 같은 회사 마스터 · 관리자(admin) · 최고관리자가 execPinReset 으로 지움 → 다음에 새로 정함
//  화면: src/execPinApi.js(공용 호출 · 상태) · src/mobile/MobileIntelView.jsx · src/FleetManagement.jsx · 초기화 버튼 src/AdminMenu.jsx(회원 관리 창)
//  테스트: node scripts/execPin.test.cjs
const crypto = require("crypto");
const { effectiveUser } = require("./multiCompany");

const SCRYPT = { N: 16384, r: 8, p: 1 };
const scryptAsync = (pw, salt) => new Promise((ok, no) => crypto.scrypt(String(pw ?? ""), salt, 32, SCRYPT, (e, k) => (e ? no(e) : ok(k))));
const SUPER_EMAIL = "tjddnqkf@naver.com";
const MAX_FAILS = 5;
const LOCK_STEPS_MIN = [10, 30, 60];
const PIN_MIN = 4;
const PIN_MAX = 8;
const NO_ROLES = ["driver", "shipper", "cafeUser"];

const s = (v) => (typeof v === "string" ? v.trim() : "");
// 휴대폰 키보드 — 앞뒤 공백 · 전각 숫자는 보통 숫자로
const normPin = (p) => String(p ?? "").trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
// 같은 숫자만(1111) · 한 칸씩 오르거나 내리는 번호(1234 · 987654)
function isEasyPin(p) {
  if (/^(\d)\1+$/.test(p)) return true;
  const d = p.split("").map(Number);
  const step = d[1] - d[0];
  if (step !== 1 && step !== -1) return false;
  return d.every((x, i) => i === 0 || x - d[i - 1] === step);
}
function pinProblem(pin) {
  const p = normPin(pin);
  if (!/^\d+$/.test(p)) return "PIN 은 숫자만 쓸 수 있어요";
  if (p.length < PIN_MIN) return `PIN 은 ${PIN_MIN}자리 이상으로 정해 주세요`;
  if (p.length > PIN_MAX) return `PIN 은 ${PIN_MAX}자리까지 돼요`;
  if (isEasyPin(p)) return "너무 쉬운 번호예요. 다른 번호로 정해 주세요";
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

const isSuperOf = (u, email) => s(email).toLowerCase() === SUPER_EMAIL || s(u?.role) === "totalMaster";
// 승인된 운송사 직원인지(u 는 effectiveUser 를 거친 값) — 예전 계정(approved 없음)은 승인으로 본다(관리자 메뉴와 같은 기준)
function isExecPinStaff(u, email = "") {
  if (!u) return false;
  if (isSuperOf(u, email)) return true;
  if (NO_ROLES.includes(s(u.role))) return false;
  if (u.approved === false || s(u.employmentStatus) === "퇴사") return false;
  return s(u.companyName) !== "";
}
// 다른 사람 PIN 을 지울 수 있는지 — 최고관리자는 어디나 · 같은 회사 마스터 · 관리자(admin)는 자기 회사 직원만 · 본인은 안 됨
function canResetExecPin(actor, actorEmail, actorUid, target, targetUid) {
  if (!actorUid || !targetUid || actorUid === targetUid) return false;
  if (!isExecPinStaff(actor, actorEmail)) return false;
  if (isSuperOf(actor, actorEmail)) return true;
  if (!(actor.isMaster === true || s(actor.role) === "admin")) return false;
  if (!target || isSuperOf(target, target.email)) return false; // 최고관리자 PIN 은 최고관리자만
  return s(target.companyName) !== "" && s(target.companyName) === s(actor.companyName);
}

function makeExecPin({ db, FieldValue, HttpsError }) {
  const err = (code, msg) => new HttpsError(code, msg);
  const pinRef = (uid) => db.collection("execPins").doc(uid);
  const attemptRef = (uid) => db.collection("execPinAttempts").doc(uid);
  const WARM = { ok: false, warm: true };

  async function who(context) {
    const uid = context?.auth?.uid;
    if (!uid) throw err("unauthenticated", "로그인이 필요해요");
    const email = s(context?.auth?.token?.email);
    const [uSnap, pSnap, aSnap] = await Promise.all([db.collection("users").doc(uid).get(), pinRef(uid).get(), attemptRef(uid).get()]);
    const u = uSnap.exists ? effectiveUser(uSnap.data() || {}) : null;
    const staff = !!u && isExecPinStaff(u, email);
    return { uid, email, u: u || {}, staff, company: s(u?.companyName), pin: pSnap.exists ? pSnap.data() : null, attempt: aSnap.exists ? aSnap.data() || {} : {} };
  }
  const needStaff = (w) => { if (!w.staff) throw err("permission-denied", "승인된 직원 계정만 쓸 수 있어요"); };

  // 틀렸을 때 횟수 올리기 — 5번째면 잠근다. 돌려주는 값: { lockUntil, left, minutes }
  async function countFail(w, now) {
    const a = w.attempt;
    const fails = (Number(a.fails) || 0) + 1;
    if (fails >= MAX_FAILS) {
      const locks = Number(a.locks) || 0;
      const lockUntil = now + lockMinutesFor(locks) * 60000;
      await attemptRef(w.uid).set({ uid: w.uid, fails: 0, locks: locks + 1, lockUntil, lastFailAt: now });
      return { lockUntil, left: 0, minutes: lockMinutesFor(locks) };
    }
    await attemptRef(w.uid).set({ uid: w.uid, fails, locks: Number(a.locks) || 0, lockUntil: 0, lastFailAt: now }, { merge: true });
    return { lockUntil: 0, left: MAX_FAILS - fails };
  }

  async function status(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context);
    if (!w.staff) return { staff: false };
    const lockUntil = Number(w.attempt.lockUntil) || 0;
    return { staff: true, hasPin: !!w.pin?.hash, lockUntil: lockUntil > Date.now() ? lockUntil : 0 };
  }

  // 처음 정하기(서버에 PIN 없음) · 바꾸기(지금 PIN 확인 — verify 와 같은 틀린 횟수 · 잠금)
  async function setPin(data, context) {
    if (data?.warm === true) return WARM;
    const p = pinProblem(data?.newPin);
    if (p) throw err("invalid-argument", p);
    const w = await who(context);
    needStaff(w);
    if (w.pin?.hash) {
      const now = Date.now();
      const lockedUntil = Number(w.attempt.lockUntil) || 0;
      if (lockedUntil > now) throw err("resource-exhausted", `여러 번 틀려 잠겼어요. ${Math.ceil((lockedUntil - now) / 60000)}분 뒤 다시 해 주세요`);
      if (!(await checkPin(data?.currentPin, w.pin))) {
        const r = await countFail(w, now);
        if (r.lockUntil) throw err("resource-exhausted", `지금 PIN 이 맞지 않아요. 여러 번 틀려 ${r.minutes}분 동안 잠겼어요`);
        throw err("permission-denied", `지금 PIN 이 맞지 않아요 (${r.left}번 남았어요)`);
      }
    }
    const h = await hashPin(data.newPin);
    await Promise.all([
      pinRef(w.uid).set({ uid: w.uid, companyName: w.company, ...h, updatedAt: FieldValue.serverTimestamp(), updatedAtMs: Date.now() }),
      attemptRef(w.uid).delete().catch(() => {}),
    ]);
    return { ok: true, changed: !!w.pin?.hash };
  }

  async function verify(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context);
    needStaff(w);
    if (!w.pin?.hash) return { ok: false, needSet: true };
    const now = Date.now();
    if ((Number(w.attempt.lockUntil) || 0) > now) return { ok: false, lockUntil: Number(w.attempt.lockUntil), left: 0 };
    if (!(await checkPin(data?.pin, w.pin))) {
      const r = await countFail(w, now);
      return r.lockUntil ? { ok: false, lockUntil: r.lockUntil, left: 0 } : { ok: false, left: r.left };
    }
    await attemptRef(w.uid).delete().catch(() => {});
    return { ok: true };
  }

  // 관리자가 다른 사람 PIN 지우기 — 지우면 그 사람은 다음에 들어갈 때 새로 정한다(잠금도 같이 풀림)
  async function reset(data, context) {
    if (data?.warm === true) return WARM;
    const w = await who(context);
    const target = s(data?.uid);
    if (!target || target.length > 128 || target.includes("/")) throw err("invalid-argument", "누구의 PIN 인지 알려 주세요");
    if (target === w.uid) throw err("permission-denied", "본인 PIN 은 직접 지울 수 없어요. 관리자에게 초기화를 요청하세요");
    const tSnap = await db.collection("users").doc(target).get();
    const t = tSnap.exists ? tSnap.data() || {} : null;
    if (!canResetExecPin(w.u, w.email, w.uid, t, target)) throw err("permission-denied", "같은 회사 마스터 · 관리자 · 최고관리자만 초기화할 수 있어요");
    const had = (await pinRef(target).get()).exists;
    await Promise.all([pinRef(target).delete(), attemptRef(target).delete().catch(() => {})]);
    console.log("[인사이트 PIN] 초기화", { by: w.uid, target, company: s(t?.companyName), had });
    return { ok: true, had };
  }

  return { status, setPin, verify, reset };
}

module.exports = { makeExecPin, pinProblem, normPin, isEasyPin, hashPin, checkPin, lockMinutesFor, isExecPinStaff, canResetExecPin, PIN_MIN, PIN_MAX, MAX_FAILS, SUPER_EMAIL };
