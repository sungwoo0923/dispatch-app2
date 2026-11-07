// ======================= functions/hubDriverAuth.js =======================
// ⭐ 2026-11-07 허브 차주 로그인 — 차량번호(아이디) + 휴대폰번호, 본인 휴대폰(등록 기기)에서만
//  · 계정: 차량번호@hubdriver.run25.kr / 비밀번호 = 휴대폰번호 숫자(로지스웹 기사 계정 @driver.run25.kr 과 겹치지 않음)
//  · 휴대폰 확인: 웹앱은 유심 번호를 읽을 수 없어서 문자 인증(Firebase 전화 인증)으로 그 번호를 가진 휴대폰인지 확인한다.
//    가입할 때 계정에 휴대폰번호를 연결(linkWithPhoneNumber)하고, 다른 휴대폰으로 옮길 때는 문자로 다시 로그인(signInWithPhoneNumber).
//  · 기기 등록: hubDevices/{uid} = { id(기기 번호), label, boundAt, lastAt } — 이 파일의 함수만 쓴다(규칙 write false).
//   hubBindDevice          — 로그인 · 앱 시작 때 이 기기가 등록 기기인지 확인 · 처음이면 등록 · 문자 인증 직후면 이 기기로 옮김(예전 기기 로그아웃)
//   hubAdminResetDevice    — 관리자: 휴대폰을 잃어버린 차주의 등록 기기 지우기(그 기기 로그아웃, 다음 로그인은 문자 인증 필요)
//   hubAdminSetDriverLogin — 관리자: 차주 차량번호 · 휴대폰번호를 바꾸면 로그인 정보(아이디 · 비밀번호 · 연결된 휴대폰)도 같이
const DOMAIN = "hubdriver.run25.kr";
const MASTER = "tjddnqkf@naver.com";
const FRESH_SEC = 10 * 60; // 문자 인증 뒤 10분 안에만 기기를 옮길 수 있다

const normPlate = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();
const plateValid = (v) => /^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/.test(normPlate(v));
const digits = (v) => String(v || "").replace(/\D/g, "");
const phoneValid = (v) => /^01[016789]\d{7,8}$/.test(digits(v));
const e164 = (v) => { const d = digits(v); return d ? `+82${d.replace(/^0/, "")}` : ""; };
const fmtPhone = (v) => { const d = digits(v).slice(0, 11); return d.length < 8 ? d : `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`; };
const isHubDriverEmail = (e) => /@hubdriver\.run25\.kr$/i.test(String(e || ""));

function register({ functions, db, FieldValue, getAuth }) {
  const out = {};
  const HttpsError = functions.https.HttpsError;
  const isAdmin = async (context) => {
    if (!context.auth) return false;
    if (context.auth.token?.email === MASTER) return true;
    const u = await db.collection("users").doc(context.auth.uid).get();
    return u.exists && u.data().role === "totalMaster";
  };

  out.hubBindDevice = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "로그인해 주세요");
    const uid = context.auth.uid;
    const token = context.auth.token || {};
    const deviceId = String(data?.deviceId || "");
    if (!/^[a-z0-9-]{16,80}$/i.test(deviceId)) throw new HttpsError("invalid-argument", "기기 번호가 올바르지 않아요");
    const label = String(data?.label || "").slice(0, 160);
    const ms = await db.collection("hubMembers").doc(uid).get();
    const m = ms.exists ? ms.data() : null;
    if (m && m.role !== "driver") return { ok: true, skip: "not-driver" };
    if (m && m.source && m.source !== "signup") return { ok: true, skip: "logisweb" };
    // 휴대폰번호가 계정에 연결(문자 인증)돼 있어야 한다 — 회원 정보의 번호와 같아야
    const tokPhone = String(token.phone_number || "");
    if (!tokPhone) return { ok: false, reason: "need-sms" };
    if (m && m.phone && e164(m.phone) !== tokPhone) return { ok: false, reason: "phone-mismatch" };
    const ref = db.collection("hubDevices").doc(uid);
    const dev = await ref.get();
    const d = dev.exists ? dev.data() : null;
    const now = Math.floor(Date.now() / 1000);
    const fresh = token.firebase?.sign_in_provider === "phone" && now - Number(token.auth_time || 0) < FRESH_SEC;
    const rec = { uid, id: deviceId, label, phone: tokPhone, lastAt: FieldValue.serverTimestamp() };
    if (d?.id === deviceId) { await ref.set({ label, lastAt: FieldValue.serverTimestamp() }, { merge: true }); return { ok: true, bound: "same" }; }
    if (!d) { await ref.set({ ...rec, boundAt: FieldValue.serverTimestamp() }); return { ok: true, bound: "new" }; }
    // 다른 기기(또는 관리자가 기기를 지운 뒤) — 방금 문자 인증으로 로그인했을 때만 이 기기로 옮긴다
    if (!fresh) return { ok: false, reason: d.id ? "other-device" : "reset" };
    await ref.set({ ...rec, boundAt: FieldValue.serverTimestamp(), prevId: d.id || null, prevLabel: d.label || "", movedAt: FieldValue.serverTimestamp() });
    if (d.id) await getAuth().revokeRefreshTokens(uid); // 예전 기기 로그아웃(이 기기는 화면이 곧바로 다시 로그인)
    return { ok: true, bound: "moved", revoked: !!d.id };
  });

  out.hubAdminResetDevice = functions.https.onCall(async (data, context) => {
    if (!(await isAdmin(context))) throw new HttpsError("permission-denied", "관리자만 할 수 있어요");
    const uid = String(data?.uid || "");
    if (!uid) throw new HttpsError("invalid-argument", "회원을 골라 주세요");
    await db.collection("hubDevices").doc(uid).set({ uid, id: null, label: "", resetAt: FieldValue.serverTimestamp(), resetBy: context.auth.token?.email || context.auth.uid });
    await getAuth().revokeRefreshTokens(uid).catch(() => {});
    return { ok: true };
  });

  out.hubAdminSetDriverLogin = functions.https.onCall(async (data, context) => {
    if (!(await isAdmin(context))) throw new HttpsError("permission-denied", "관리자만 할 수 있어요");
    const uid = String(data?.uid || "");
    const ms = await db.collection("hubMembers").doc(uid).get();
    if (!ms.exists || ms.data().role !== "driver") throw new HttpsError("not-found", "차주 회원이 아니에요");
    const auth = getAuth();
    const u = await auth.getUser(uid);
    if (!isHubDriverEmail(u.email)) throw new HttpsError("failed-precondition", "차량번호로 가입한 차주가 아니에요");
    const plate = normPlate(data?.plate);
    if (!plateValid(plate)) throw new HttpsError("invalid-argument", "차량번호를 전부 입력해 주세요");
    if (!phoneValid(data?.phone)) throw new HttpsError("invalid-argument", "휴대폰번호를 정확히 입력해 주세요");
    const email = `${plate}@${DOMAIN}`;
    if (email !== u.email) {
      const other = await auth.getUserByEmail(email).catch(() => null);
      if (other && other.uid !== uid) throw new HttpsError("already-exists", "이미 가입된 차량번호예요");
    }
    const phoneNumber = e164(data.phone);
    try {
      await auth.updateUser(uid, { email, password: digits(data.phone), phoneNumber });
    } catch (e) {
      if (String(e?.code || "").includes("phone-number-already-exists")) throw new HttpsError("already-exists", "다른 계정에 연결된 휴대폰번호예요");
      throw new HttpsError("internal", "로그인 정보를 바꾸지 못했어요");
    }
    const m = ms.data();
    await ms.ref.update({ email, login: "plate", phone: fmtPhone(data.phone), vehicle: { ...(m.vehicle || {}), plate }, updatedAt: FieldValue.serverTimestamp() });
    // 번호가 바뀌면 등록 기기의 문자 인증 번호도 맞춰 둔다(기기는 그대로)
    const dref = db.collection("hubDevices").doc(uid);
    if ((await dref.get()).exists) await dref.update({ phone: phoneNumber });
    return { ok: true, email };
  });
  return out;
}

module.exports = { register, _t: { normPlate, plateValid, e164, phoneValid } };
