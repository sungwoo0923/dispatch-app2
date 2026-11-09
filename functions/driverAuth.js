// ======================= functions/driverAuth.js =======================
// 🔐 2026-11-08 기사앱 로그인 — 차량번호(아이디) + 휴대폰번호(비밀번호), 본인 휴대폰(등록 기기)에서만
//  driverSignIn      — 로그인 전(토큰 없음). 차량번호·휴대폰번호·기기 번호를 확인하고, 통과하면
//                      그 기사 계정의 로그인 비밀번호를 새 임의 값으로 바꿔 한 번만 돌려준다(화면이 곧바로 그 값으로 로그인).
//                      → 비밀번호를 바꾸면 다른 기기에 남아 있던 로그인은 끊긴다(한 대만).
//                      PC 기사관리에서 먼저 등록된 기사(계정 없음)는 휴대폰번호가 맞으면 계정을 만들고 연결한다.
//                      mode:"owner" — 가입 화면: 이 차량번호 기본 계정이 이미 있는지 · 같은 회사인지만 알려준다.
//  driverResetDevice — 운송사 직원: 휴대폰을 바꾼 기사의 등록 기기를 지운다(그 기기 로그아웃 · 다음 로그인 기기가 새로 등록)
//  등록 기기: driverDevices/{uid} = { uid, companyName, id(기기 번호 해시), label, boundAt, lastAt } — 이 파일만 쓴다(규칙 write false)
"use strict";
const C = require("./driverAuthCore");
const U = require("./uploadAccessCore");

module.exports = function makeDriverAuth({ functions, db, getAuth, FieldValue, ua, appCheckGate }) {
  const ok = (res, body) => res.status(200).json(body);
  const fail = (res, code) => res.status(200).json({ ok: false, code });

  async function userByEmail(email) {
    try { return await getAuth().getUserByEmail(email); } catch (e) { if (e?.code === "auth/user-not-found") return null; throw e; }
  }

  const driverSignIn = functions.https.onRequest(async (req, res) => {
    if (ua.cors(req, res)) return;
    if (!(await appCheckGate(req, res, "driverSignIn"))) return;
    if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
    try {
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const co = String(b.companyName || "").trim().slice(0, 100);
      const carNo = String(b.carNo || "").trim().slice(0, 30);
      const plate = U.plateOf(carNo);
      if (!co || !plate) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
      const ip = ua.clientIp(req);
      if (await ua.limited(res, [[`ds:ip:${ip}`, 40, 10 * 60e3], [`ds:plate:${plate}`, 12, 10 * 60e3]])) return;

      const legacyEmail = C.legacyDriverEmail(carNo);
      const scopedEmail = C.scopedDriverEmail(co, carNo);

      // 가입 화면 — 기본 계정(차량번호@)이 이미 있으면 같은 회사인지(같으면 진짜 중복, 다르면 회사별 계정으로 가입)
      if (b.mode === "owner") {
        const rec = await userByEmail(legacyEmail);
        if (!rec) return ok(res, { ok: true, exists: false });
        const us = await db.collection("users").doc(rec.uid).get();
        const owner = us.exists ? String(us.data().companyName || "") : "";
        return ok(res, { ok: true, exists: true, sameCompany: !!owner && C.normText(owner) === C.normText(co) });
      }

      const phone = String(b.phone || "");
      const deviceId = b.deviceId;
      if (!C.phoneInputOk(phone)) return fail(res, "BAD_PHONE");
      if (!C.deviceIdOk(deviceId)) { res.status(400).json({ error: "BAD_DEVICE" }); return; }
      const label = String(b.label || "").slice(0, 160);

      // ① 기사 계정 찾기 — 기본 계정 → 회사별 계정
      let found = null; let otherCo = false; const half = {};
      for (const email of [legacyEmail, scopedEmail]) {
        const rec = await userByEmail(email);
        if (!rec) continue;
        const us = await db.collection("users").doc(rec.uid).get();
        if (!us.exists) { half[email] = rec; continue; } // 가입하다 만 계정
        const u = us.data() || {};
        if (u.role !== "driver") continue;
        if (C.normText(u.companyName) !== C.normText(co)) { otherCo = true; continue; }
        found = { uid: rec.uid, email, disabled: !!rec.disabled, u };
        break;
      }

      if (found) {
        if (found.disabled) return fail(res, "DISABLED");
        const ds = await db.collection("drivers").doc(found.uid).get();
        const d = ds.exists ? ds.data() || {} : {};
        const pc = C.phoneCheck(phone, found.u.phone, d.전화번호, d.phone);
        if (pc === "none") return fail(res, "NO_PHONE");
        if (pc === "mismatch") return fail(res, "PHONE_MISMATCH");
      } else {
        // ② PC 기사관리 선등록(계정 없음) — 휴대폰번호가 맞으면 계정을 만들어 연결
        const preKey = U.coDocKey(co, plate);
        const [preSnap, legacySnap] = await Promise.all([
          db.collection("drivers").doc(preKey).get(),
          preKey !== plate ? db.collection("drivers").doc(plate).get() : Promise.resolve(null),
        ]);
        const pre = preSnap.exists ? preSnap.data() : null;
        const legacy = legacySnap?.exists ? legacySnap.data() : null;
        const cand = pre || (legacy && C.normText(legacy.companyName) === C.normText(co) ? legacy : null);
        if (!cand || (cand.uid && String(cand.uid).length > 0)) return fail(res, otherCo ? "OTHER_COMPANY" : "NOT_FOUND");
        const pc = C.phoneCheck(phone, cand.전화번호, cand.phone);
        if (pc === "none") return fail(res, "NO_PHONE");
        if (pc === "mismatch") return fail(res, "PHONE_MISMATCH");
        const name = String(cand.이름 || cand.name || "").trim();
        // 기본 계정 이름이 비어 있으면 그것, 다른 회사가 쓰고 있으면 회사별 계정
        const legacyRec = await userByEmail(legacyEmail);
        const email = !legacyRec || half[legacyEmail] ? legacyEmail : scopedEmail;
        let uid = half[email]?.uid || null;
        let created = false;
        if (!uid) {
          const rec = await userByEmail(email);
          if (rec) return fail(res, "NOT_FOUND");
          uid = (await getAuth().createUser({ email, password: C.randomPassword() })).uid;
          created = true;
        }
        const r = await ua.linkPre({ uid, email, co, carNo, name });
        if (!r.linked) {
          if (created) await getAuth().deleteUser(uid).catch(() => {});
          return fail(res, r.code === "COMPANY_MISMATCH" ? "OTHER_COMPANY" : "NOT_FOUND");
        }
        found = { uid, email, u: { companyName: r.companyName } };
      }

      // ③ 등록 기기 — 처음(또는 회사가 초기화)이면 이 기기로 등록, 다른 기기면 거절
      const hash = C.deviceHash(deviceId);
      const devRef = db.collection("driverDevices").doc(found.uid);
      const verdict = await db.runTransaction(async (t) => {
        const cur = await t.get(devRef);
        const v = C.deviceCheck(cur.exists ? cur.data() : null, hash);
        if (v === "other") return v;
        const now = FieldValue.serverTimestamp();
        t.set(devRef, {
          uid: found.uid, companyName: String(found.u.companyName || co).trim(), id: hash, label, lastAt: now,
          ...(v === "new" ? { boundAt: now } : {}),
        }, { merge: true });
        return v;
      });
      if (verdict === "other") return fail(res, "DEVICE_MISMATCH");

      // ④ 로그인 비밀번호를 새 임의 값으로 — 화면이 바로 이 값으로 로그인(다른 기기의 예전 로그인은 끊긴다)
      const password = C.randomPassword();
      await getAuth().updateUser(found.uid, { password });
      console.log(`🔐 기사 로그인: ${co} ${plate} (${verdict === "new" ? "기기 등록" : "등록 기기"})`);
      return ok(res, { ok: true, email: found.email, password, device: verdict });
    } catch (e) {
      console.error("driverSignIn 실패:", e);
      res.status(500).json({ error: "SIGNIN_FAILED" });
    }
  });

  const driverResetDevice = functions.https.onRequest(async (req, res) => {
    if (ua.cors(req, res)) return;
    if (!(await appCheckGate(req, res, "driverResetDevice"))) return;
    if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
    try {
      const tok = await ua.bearerUser(req);
      if (!tok) { res.status(401).json({ error: "NO_TOKEN" }); return; }
      const uid = String(req.body?.uid || "").trim();
      if (!uid || uid.includes("/") || uid.length > 128) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
      const us = await db.collection("users").doc(uid).get();
      if (!us.exists || us.data().role !== "driver") { res.status(404).json({ error: "NOT_DRIVER" }); return; }
      const co = String(us.data().companyName || U.DEFAULT_CO).trim();
      if (!(await ua.isStaffOf(tok, co))) { res.status(403).json({ error: "FORBIDDEN" }); return; }
      await db.collection("driverDevices").doc(uid).set({
        uid, companyName: co, id: null, label: "", resetAt: FieldValue.serverTimestamp(), resetBy: tok.email || tok.uid,
      }, { merge: true });
      await getAuth().revokeRefreshTokens(uid).catch(() => {});
      console.log(`🔐 기사 기기 초기화: ${co} ${uid} by ${tok.email || tok.uid}`);
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error("driverResetDevice 실패:", e);
      res.status(500).json({ error: "RESET_FAILED" });
    }
  });

  // 최고관리자 전용 · 한 번 — 예전 기사 계정(비밀번호 = 차량번호)을 모두 임의 비밀번호로 바꿔 차량번호만으로는 로그인할 수 없게 한다.
  //  바꾸고 나면 기사님들은 한 번 로그아웃되고, 다음 로그인부터 차량번호 + 휴대폰번호(본인 휴대폰)로 들어온다.
  //  body: { dryRun?: true, after?: uid } — 한 번에 400명씩, 남으면 next를 돌려준다
  const driverAuthMigrate = functions.runWith({ timeoutSeconds: 540 }).https.onRequest(async (req, res) => {
    if (ua.cors(req, res)) return;
    if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
    try {
      const tok = await ua.bearerUser(req);
      if (!tok) { res.status(401).json({ error: "NO_TOKEN" }); return; }
      const me = await db.collection("users").doc(tok.uid).get();
      if (tok.email !== "tjddnqkf@naver.com" && !(me.exists && me.data().role === "totalMaster")) { res.status(403).json({ error: "FORBIDDEN" }); return; }
      const dryRun = req.body?.dryRun === true;
      let q = db.collection("users").where("role", "==", "driver").orderBy("__name__").limit(400);
      if (req.body?.after) q = q.startAfter(String(req.body.after));
      const snap = await q.get();
      let changed = 0; let skipped = 0;
      for (const d of snap.docs) {
        const email = String(d.data().email || "");
        if (!email.toLowerCase().endsWith(`@${C.DOMAIN}`)) { skipped += 1; continue; }
        if (!dryRun) {
          try { await getAuth().updateUser(d.id, { password: C.randomPassword() }); changed += 1; } catch (e) { skipped += 1; }
        } else changed += 1;
      }
      const next = snap.size === 400 ? snap.docs[snap.size - 1].id : null;
      console.log(`🔐 기사 비밀번호 일괄 변경${dryRun ? "(미리보기)" : ""}: ${changed}명 · 건너뜀 ${skipped}`);
      res.status(200).json({ ok: true, dryRun, changed, skipped, next });
    } catch (e) {
      console.error("driverAuthMigrate 실패:", e);
      res.status(500).json({ error: "MIGRATE_FAILED" });
    }
  });

  return { driverSignIn, driverResetDevice, driverAuthMigrate };
};
