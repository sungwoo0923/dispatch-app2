// ======================= functions/logisPasskey.js =======================
// 👆 2026-11-14 얼굴 인증(Face ID) · 지문으로 로그인 — 웹 표준(WebAuthn · 패스키). 아이폰 · 안드로이드 · PC(윈도우 헬로 · 터치 ID) 공통
//  · 얼굴 · 지문 정보는 휴대폰 밖으로 나가지 않는다. 휴대폰이 "본인이 맞다"고 서명한 값만 서버가 확인한다(공개키만 저장)
//  · 등록: 로그인한 상태에서 [보안 설정 › 얼굴 · 지문 로그인] — 2차 비밀번호가 있는 계정은 등록할 때 2차 비밀번호를 한 번 확인
//         최고관리자 · 부관리자는 문자 인증을 마친 기기(pnkMfaSecrets.devices)에서만 등록할 수 있다
//  · 로그인: 로그인 화면 [얼굴 · 지문으로 로그인] → 서버가 확인하면 로그인 토큰(createCustomToken)을 준다
//         2차 비밀번호를 묻지 않는다(휴대폰 + 본인 얼굴 · 지문 = 2단계). 최고관리자 · 부관리자도 아는 기기면 바로 열린다
//         처음 보는 기기(문자 인증을 안 한 기기)에서는 얼굴 로그인을 받지 않는다 → 비밀번호 → 2차 비밀번호 → 문자 인증
//  · 2단계 대신: 비밀번호로 로그인한 뒤 2차 비밀번호 대신 얼굴 · 지문으로 확인(action "authOptions" · "authVerify")
//  저장: logisPasskeys/{credentialId} { uid, pub, counter, rpID, dev, ua, at, last } · logisPasskeyChal/{id} 한 번 쓰는 확인값(5분)
//   둘 다 서버만 읽고 쓴다(firestore.rules catchAllExcluded)
//  ⚠ 로그인 토큰을 만들려면 서버 계정에 "서비스 계정 토큰 생성자" 권한이 있어야 한다(없으면 얼굴 로그인만 안내 문구로 막히고 2단계 대신 쓰기는 된다)
const crypto = require("crypto");
const { devKey } = require("./pnkMfa");

const SUPER_EMAIL = "tjddnqkf@naver.com";
const CHAL_MS = 5 * 60 * 1000;
const MAX_KEYS = 10;
// 얼굴 · 지문은 주소(도메인)마다 따로 등록된다 — 서비스 주소만 받는다
const ORIGINS = ["https://dispatch-app2.vercel.app", "https://app.logisweb.co.kr", "https://www.logisweb.co.kr", "https://logisweb.co.kr", "http://localhost:5173", "http://localhost:4173"];
const b64u = {
  enc: (buf) => Buffer.from(buf).toString("base64url"),
  dec: (s) => new Uint8Array(Buffer.from(String(s || ""), "base64url")),
};
const PENDING_MS = 10 * 60 * 1000;

function makeLogisPasskey({ db, HttpsError, now = () => Date.now(), createCustomToken = null, webauthn = null, same = null }) {
  const lib = async () => webauthn || (await import("@simplewebauthn/server"));
  const originOf = (data) => {
    const o = String(data.origin || "");
    if (!ORIGINS.includes(o)) throw new HttpsError("invalid-argument", "이 주소에서는 얼굴 · 지문 로그인을 쓸 수 없습니다");
    return { origin: o, rpID: new URL(o).hostname };
  };
  async function userInfo(uid, email = "") {
    const u = await db.doc(`users/${uid}`).get().catch(() => null);
    const d = u?.exists ? u.data() : {};
    const em = String(email || d.email || "").toLowerCase();
    const admin = em === SUPER_EMAIL || d.role === "totalMaster";
    return { d, admin, superMain: em === SUPER_EMAIL, email: em };
  }
  async function saveChal(kind, uid, challenge, rpID) {
    const id = crypto.randomBytes(16).toString("hex");
    await db.doc(`logisPasskeyChal/${id}`).set({ kind, uid: uid || null, challenge, rpID, at: now() });
    return id;
  }
  async function takeChal(id, kind, uid) {
    if (!/^[a-f0-9]{32}$/.test(String(id || ""))) throw new HttpsError("invalid-argument", "다시 시도해 주세요");
    const ref = db.doc(`logisPasskeyChal/${id}`);
    const c = (await ref.get()).data();
    await ref.delete().catch(() => {});
    if (!c || c.kind !== kind || now() - c.at > CHAL_MS || (uid !== undefined && c.uid !== uid)) throw new HttpsError("failed-precondition", "시간이 지났습니다. 다시 시도해 주세요");
    return c;
  }
  const keysOf = async (uid) => (await db.collection("logisPasskeys").where("uid", "==", uid).get()).docs.map((x) => ({ id: x.id, ...x.data() }));
  // 휴대폰이 보낸 서명 확인 — 맞으면 그 열쇠 문서
  async function checkAssertion(data, chal, origin, uid) {
    const resp = data.response || {};
    const id = String(resp.id || "");
    if (!/^[A-Za-z0-9_-]{16,512}$/.test(id)) throw new HttpsError("invalid-argument", "다시 시도해 주세요");
    const ref = db.doc(`logisPasskeys/${id}`);
    const key = (await ref.get()).data();
    if (!key || (uid && key.uid !== uid)) throw new HttpsError("permission-denied", "등록되지 않은 얼굴 · 지문입니다. 비밀번호로 로그인해 주세요");
    const { verifyAuthenticationResponse } = await lib();
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: resp, expectedChallenge: chal.challenge, expectedOrigin: origin, expectedRPID: chal.rpID, requireUserVerification: true,
        credential: { id, publicKey: b64u.dec(key.pub), counter: key.counter || 0, transports: key.transports || [] },
      });
    } catch (e) { v = null; }
    if (!v?.verified) throw new HttpsError("permission-denied", "얼굴 · 지문을 확인하지 못했습니다");
    await ref.set({ counter: v.authenticationInfo?.newCounter ?? key.counter ?? 0, last: now() }, { merge: true });
    return { ...key, id };
  }
  // 최고관리자 · 부관리자: 문자 인증을 마친 기기인지
  async function deviceTrusted(uid, dev) {
    const dk = devKey(dev);
    if (!dk) return { dk: "", trusted: false, sec: null };
    const sec = (await db.doc(`pnkMfaSecrets/${uid}`).get()).data() || null;
    return { dk, trusted: !!sec?.devices?.[dk], sec };
  }

  return async function logisPasskey(data, context) {
    const action = String(data.action || "");
    const uid = context?.auth?.uid || "";
    const { origin, rpID } = originOf(data);
    const W = await lib();

    // ── 로그인 화면(로그인 전) ──
    if (action === "loginOptions") {
      const opts = await W.generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: [], timeout: 60000 });
      return { options: opts, chal: await saveChal("login", null, opts.challenge, rpID) };
    }
    if (action === "login") {
      const chal = await takeChal(data.chal, "login");
      if (chal.rpID !== rpID) throw new HttpsError("permission-denied", "다시 시도해 주세요");
      const key = await checkAssertion(data, chal, origin, "");
      const me = await userInfo(key.uid);
      const d = me.d;
      if (["driver", "shipper", "cafeUser"].includes(d.role) && data.app !== "any") throw new HttpsError("permission-denied", "운송사 계정이 아닙니다");
      if (d.userStatus === "banned" || d.userStatus === "suspended") throw new HttpsError("permission-denied", "사용할 수 없는 계정입니다. 관리자에게 문의하세요");
      if (d.employmentStatus === "퇴사" && !me.superMain) throw new HttpsError("permission-denied", "퇴사 처리된 계정입니다");
      if (!me.superMain && d.approved === false) throw new HttpsError("permission-denied", "관리자 승인 대기 중입니다");
      if (me.admin) {
        const t = await deviceTrusted(key.uid, data.dev);
        if (!t.trusted) throw new HttpsError("failed-precondition", "처음 로그인하는 기기입니다. 비밀번호로 로그인한 뒤 문자 인증을 해 주세요");
      }
      if (!me.admin && d.companyName) {
        const plan = await db.doc(`companyPlans/${String(d.companyName).trim()}`).get().catch(() => null);
        if (plan?.exists && plan.data()?.status === "ended") throw new HttpsError("permission-denied", "계약이 종료되었습니다. 관리자에게 문의해 주세요");
      }
      if (!createCustomToken) throw new HttpsError("unavailable", "얼굴 · 지문 로그인을 준비하지 못했습니다");
      let token;
      try { token = await createCustomToken(key.uid); } catch (e) {
        console.error("[얼굴 로그인] 로그인 토큰을 만들지 못함(서버 계정 권한 확인):", e?.message || e);
        throw new HttpsError("unavailable", "얼굴 · 지문 로그인 준비 중입니다. 지금은 비밀번호로 로그인해 주세요");
      }
      return { token, uid: key.uid, admin: me.admin, sub: me.admin && !me.superMain, email: me.email, companyName: String(d.companyName || ""), companyCode: String(d.companyCode || "") };
    }

    // ── 로그인한 뒤 ──
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다");
    const me = await userInfo(uid, context.auth.token?.email);
    if (action === "list") {
      const list = (await keysOf(uid)).map((k) => ({ id: k.id, rpID: k.rpID, ua: k.ua || "", at: k.at || 0, last: k.last || 0, here: k.dev && k.dev === devKey(data.dev) }));
      return { list: list.sort((a, b) => b.at - a.at) };
    }
    if (action === "remove") {
      const id = String(data.id || "");
      const ref = db.doc(`logisPasskeys/${id}`);
      const k = (await ref.get()).data();
      if (!k || k.uid !== uid) throw new HttpsError("not-found", "이미 지웠습니다");
      await ref.delete();
      const left = (await keysOf(uid)).length;
      await db.doc(`users/${uid}`).set({ bioKeys: left }, { merge: true }).catch(() => {});
      return { ok: true, left };
    }
    if (action === "regOptions") {
      const sref = db.doc(`pnkMfaSecrets/${uid}`);
      const t = await deviceTrusted(uid, data.dev);
      if (me.admin && !t.trusted) throw new HttpsError("failed-precondition", "문자 인증을 마친 기기에서만 등록할 수 있습니다. 로그아웃 후 다시 로그인해 주세요");
      const sec = t.sec || (await sref.get()).data() || null;
      if (sec?.h && (me.admin || sec.opt)) {
        if (!same || !same(String(data.code || ""), sec)) throw new HttpsError("permission-denied", "2차 비밀번호가 맞지 않습니다");
      }
      const keys = await keysOf(uid);
      if (keys.length >= MAX_KEYS) throw new HttpsError("resource-exhausted", `얼굴 · 지문은 ${MAX_KEYS}개까지 등록됩니다. 쓰지 않는 기기를 지워 주세요`);
      const opts = await W.generateRegistrationOptions({
        rpName: "LogisWeb", rpID, userID: new TextEncoder().encode(uid), userName: me.email || uid, userDisplayName: String(me.d.name || me.email || "LogisWeb"),
        attestationType: "none", timeout: 60000,
        authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" },
        excludeCredentials: keys.filter((k) => k.rpID === rpID).map((k) => ({ id: k.id, transports: k.transports || [] })),
      });
      return { options: opts, chal: await saveChal("reg", uid, opts.challenge, rpID) };
    }
    if (action === "regVerify") {
      const chal = await takeChal(data.chal, "reg", uid);
      let v;
      try { v = await W.verifyRegistrationResponse({ response: data.response || {}, expectedChallenge: chal.challenge, expectedOrigin: origin, expectedRPID: chal.rpID, requireUserVerification: true }); } catch (e) { v = null; }
      if (!v?.verified || !v.registrationInfo?.credential) throw new HttpsError("permission-denied", "등록하지 못했습니다. 다시 시도해 주세요");
      const c = v.registrationInfo.credential;
      await db.doc(`logisPasskeys/${c.id}`).set({ uid, pub: b64u.enc(c.publicKey), counter: c.counter || 0, transports: c.transports || data.response?.response?.transports || [], rpID: chal.rpID, dev: devKey(data.dev) || "", ua: String(data.ua || "").slice(0, 160), at: now(), last: now() });
      const left = (await keysOf(uid)).length;
      await db.doc(`users/${uid}`).set({ bioKeys: left }, { merge: true }).catch(() => {});
      return { ok: true, id: c.id, count: left };
    }
    // 2단계(2차 비밀번호) 대신 얼굴 · 지문
    if (action === "authOptions") {
      const keys = (await keysOf(uid)).filter((k) => k.rpID === rpID);
      if (!keys.length) throw new HttpsError("not-found", "이 기기에 등록된 얼굴 · 지문이 없습니다");
      const opts = await W.generateAuthenticationOptions({ rpID, userVerification: "required", timeout: 60000, allowCredentials: keys.map((k) => ({ id: k.id, transports: k.transports || [] })) });
      return { options: opts, chal: await saveChal("auth", uid, opts.challenge, rpID) };
    }
    if (action === "authVerify") {
      const chal = await takeChal(data.chal, "auth", uid);
      await checkAssertion(data, chal, origin, uid);
      if (me.admin) {
        const t = await deviceTrusted(uid, data.dev);
        if (!t.trusted) {
          // 처음 보는 기기 — 2차 비밀번호를 통과한 것과 같게 두고 문자 인증을 기다린다(functions/pnkMfa.js "trust")
          if (!t.dk) throw new HttpsError("invalid-argument", "화면을 새로고침한 뒤 다시 해 주세요");
          await db.doc(`pnkMfaSecrets/${uid}`).set({ pending: { dev: t.dk, at: now(), authTime: Number(context.auth.token?.auth_time || 0), remember: false } }, { merge: true });
          return { ok: true, needSms: true, phone: String(me.d.pcVerifyPhone || "") };
        }
      }
      return { ok: true };
    }
    throw new HttpsError("invalid-argument", "알 수 없는 요청");
  };
}

module.exports = { makeLogisPasskey, ORIGINS, PENDING_MS };
