// functions/uploadAccess.js
// ⭐ 2026-11-08 보안 점검 — 로그인 없이 쓰던 기능을 서버에서 확인하고 대신 처리한다.
//  ① uploadAccess   : 기사 업로드 링크(/upload) — 링크의 토큰을 서버가 확인한 뒤 오더 보기·사진 올리기/지우기·잠금·위치공유 표시를 대신 한다.
//                      (보안 규칙은 이제 로그인 없는 오더·첨부 직접 읽기/쓰기를 막는다)
//  ② driverSearch   : 기사 통합 업로드 검색(/driver-upload) — 회사(co) 필수·그 회사 오더만 · 업로드토큰 대신 6시간짜리 서명 허가증만
//  ③ driverLoginLink: 기사앱 로그인 때 PC 선등록 기사(drivers/{차량번호}) 확인·연결 — 예전엔 로그인한 누구나 drivers/{차량번호}를 읽을 수 있었다
//  ④ rateLimit      : 로그인 전 공개 함수(checkEmail · freeDeletedEmail 등) 요청 수 제한
"use strict";
const crypto = require("crypto");
const C = require("./uploadAccessCore");

module.exports = function makeUploadAccess({ functions, db, getAuth, FieldValue, Timestamp }) {
  const mem = C.createMemoryLimiter();
  const secret = () => process.env.UPLOAD_TOKEN_SECRET || "";
  const legacyUntil = () => C.legacyUntilMs(process.env.UPLOAD_LEGACY_UNTIL);

  // 클라이언트 IP — Google 앞단이 붙이는 마지막 값(앞쪽 값은 요청자가 꾸밀 수 있다)
  function clientIp(req) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return xff.length ? xff[xff.length - 1] : String(req.ip || req.socket?.remoteAddress || "?");
  }

  // 메모리(인스턴스) → Firestore(전체 공유) 순서로 센다. Firestore가 실패하면 메모리 결과만으로 판단(서비스는 계속)
  async function rateLimit(key, limit, windowMs) {
    const m = mem.hit(key, limit, windowMs);
    if (!m.allowed) return m;
    try {
      const ref = db.collection("apiRateLimits").doc(C.keyHash(key));
      return await db.runTransaction(async (t) => {
        const s = await t.get(ref);
        const now = Date.now();
        const r = C.rateStep(s.exists ? s.data() : null, now, limit, windowMs);
        if (r.allowed) t.set(ref, { n: r.entry.n, start: r.entry.start, expireAt: Timestamp.fromMillis(r.entry.start + windowMs) });
        return r;
      });
    } catch (e) {
      console.warn("rateLimit Firestore 실패(메모리 결과 사용):", e?.message || e);
      return m;
    }
  }
  // 여러 제한을 한 번에 — 하나라도 넘으면 429
  async function limited(res, specs) {
    for (const [key, limit, windowMs] of specs) {
      const r = await rateLimit(key, limit, windowMs);
      if (!r.allowed) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((r.retryAfterMs || 60000) / 1000))));
        res.status(429).json({ error: "RATE_LIMITED" });
        return true;
      }
    }
    return false;
  }

  function cors(req, res, methods = "POST, OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", methods);
    res.set("Access-Control-Allow-Headers", require("./appCheck").CORS_HEADERS); // 🛡 App Check 머리글도 허용(웹이 모든 함수 호출에 붙인다)
    if (req.method === "OPTIONS") { res.status(204).send(""); return true; }
    return false;
  }

  async function bearerUser(req) {
    const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    if (!m) return null;
    return getAuth().verifyIdToken(m[1]).catch(() => null);
  }

  // 운송사 직원(기사·화주 제외) 또는 최고관리자인지 — co 회사 기준
  async function isStaffOf(tok, co) {
    if (!tok) return false;
    if (tok.email === "tjddnqkf@naver.com") return true;
    const u = await db.collection("users").doc(tok.uid).get().catch(() => null);
    if (!u?.exists) return false;
    const x = u.data() || {};
    if (x.role === "totalMaster") return true;
    if (x.approved === false || x.employmentStatus === "퇴사") return false;
    if (["driver", "shipper", "cafeUser"].includes(x.role)) return false;
    return String(x.companyName || C.DEFAULT_CO).trim() === co;
  }

  const sessHash = (s) => (typeof s === "string" && s.length >= 16 && s.length <= 100 ? C.keyHash(`sess:${s}`) : "");

  // ── 업로드 대상 문서 찾기 + 접근 확인 ──
  async function resolveTarget(b, { ignoreLock = false } = {}) {
    const id = String(b.id || "").trim();
    if (!id || id.length > 200 || id.includes("/")) return { err: [400, "BAD_PARAMS"] };
    const col = String(b.col || "");
    // 수동 업로드(오더 없이) — 세션 키로만
    if (col === "driver_uploads") {
      const h = sessHash(b.session);
      const snap = await db.collection("driver_uploads").doc(id).get();
      if (!snap.exists || !h || !C.safeEqual(snap.data().uploadSession, h)) return { err: [403, "BAD_TOKEN"] };
      if (Date.now() - C.toMs(snap.data().createdAt) > C.DELETE_WINDOW_MS) return { err: [403, "EXPIRED"] };
      return { ref: snap.ref, col, data: snap.data(), manual: true };
    }
    let grant = null;
    if (b.g) {
      grant = C.verifyGrant(secret(), String(b.g));
      if (!grant || !(grant.a || []).includes("upload")) return { err: [403, "BAD_TOKEN"] };
    }
    const cols = grant ? [grant.c] : (C.UPLOAD_COLS.includes(col) ? [col] : C.UPLOAD_COLS);
    let snap = null;
    for (const c of cols) {
      if (!C.UPLOAD_COLS.includes(c)) break;
      const s = await db.collection(c).doc(id).get();
      if (s.exists) { snap = s; break; }
    }
    if (!snap) return { err: [404, "NOT_FOUND"] };
    const data = snap.data() || {};
    const r = C.evaluateAccess(data, { orderId: id, col: snap.ref.parent.id, t: String(b.t || ""), grant, legacyUntil: legacyUntil(), ignoreLock });
    if (!r.ok) return { err: [r.reason === "NOT_FOUND" ? 404 : 403, r.reason] };
    if (r.mode.startsWith("legacy")) console.log(`⌛ 예전 형식 업로드 링크 사용(${r.mode}): ${snap.ref.path}`);
    return { ref: snap.ref, col: snap.ref.parent.id, data, mode: r.mode, mirror: C.mirrorOf(data) };
  }

  async function mirrorRef(m) {
    if (!m) return null;
    const ref = db.collection(m.col).doc(m.id);
    const s = await ref.get().catch(() => null);
    return s?.exists ? ref : null;
  }

  const uploadAccess = functions.runWith({ secrets: ["UPLOAD_TOKEN_SECRET"], memory: "512MB", timeoutSeconds: 60 }).https.onRequest(async (req, res) => {
    if (cors(req, res, "GET, POST, OPTIONS")) return;
    if (req.method === "GET") { res.status(200).json({ ok: true }); return; } // 깨우기
    if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(b.action || "");
    const ip = clientIp(req);
    try {
      if (await limited(res, [[`ua:ip:${ip}`, 300, 10 * 60e3]])) return;

      if (action === "manualStart") {
        if (await limited(res, [[`ua:manual:${ip}`, 20, 3600e3]])) return;
        const h = sessHash(b.session);
        const date = String(b.date || "").trim();
        if (!h || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
        const co = String(b.co || "").trim().slice(0, 60);
        const ref = await db.collection("driver_uploads").add({
          상차일: date, 차량번호: String(b.car || "").trim().slice(0, 30), 이름: String(b.name || "").trim().slice(0, 40),
          ...(co ? { companyName: co } : {}),
          createdAt: FieldValue.serverTimestamp(), source: "manual_upload", uploadSession: h,
        });
        res.status(200).json({ ok: true, id: ref.id });
        return;
      }

      const tg = await resolveTarget(b, { ignoreLock: action === "deleteFile" || action === "loc" });
      if (tg.err) { res.status(tg.err[0]).json({ error: tg.err[1] }); return; }

      if (action === "view") {
        if (tg.manual) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
        const view = { ...C.pickView(tg.data), _mirrorLiveId: tg.mirror?.id || "" }; // 실시간 위치는 전송사본 id에도 같이 쓴다
        const co = String(tg.data.companyName || C.DEFAULT_CO).trim();
        const cs = await db.collection("companySettings").doc(co).get().catch(() => null);
        res.status(200).json({ ok: true, col: tg.col, order: view, payRule: cs?.exists ? (cs.data().결제일규칙 || null) : null, legacy: tg.mode.startsWith("legacy") });
        return;
      }

      if (action === "addFile") {
        if (await limited(res, [[`ua:file:${tg.ref.path}`, 60, 3600e3]])) return;
        const f = b.file || {};
        const bad = C.checkFile(f);
        if (bad) { res.status(400).json({ error: bad }); return; }
        const h = sessHash(b.session);
        if (!h) { res.status(400).json({ error: "NO_SESSION" }); return; }
        const isSig = f.source === "driver_signature";
        const type = String(f.base64).slice(5, String(f.base64).indexOf(";"));
        const payload = {
          base64: f.base64,
          name: String(f.name || (isSig ? "서명.png" : "사진.jpg")).slice(0, 120),
          type,
          sizeKB: Math.round(String(f.base64).length * 0.75 / 1024),
          uploadedAt: FieldValue.serverTimestamp(),
          source: isSig ? "driver_signature" : (tg.manual ? "manual_upload" : "driver_upload"),
          uploadSession: h,
        };
        const attRef = tg.ref.collection("attachments").doc();
        const batch = db.batch();
        batch.set(attRef, payload);
        if (!tg.manual && !isSig) batch.update(tg.ref, { attachCount: FieldValue.increment(1) });
        const mref = tg.manual ? null : await mirrorRef(tg.mirror);
        if (mref) {
          batch.set(mref.collection("attachments").doc(attRef.id), payload);
          if (!isSig) batch.update(mref, { attachCount: FieldValue.increment(1) });
        }
        await batch.commit();
        res.status(200).json({ ok: true, attId: attRef.id });
        return;
      }

      if (action === "deleteFile") {
        const attId = String(b.attId || "");
        const h = sessHash(b.session);
        if (!attId || attId.includes("/") || !h) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
        const attRef = tg.ref.collection("attachments").doc(attId);
        const a = await attRef.get();
        if (!a.exists) { res.status(404).json({ error: "NOT_FOUND" }); return; }
        const x = a.data() || {};
        if (!C.safeEqual(x.uploadSession, h)) { res.status(403).json({ error: "NOT_YOURS" }); return; }
        if (Date.now() - C.toMs(x.uploadedAt) > C.DELETE_WINDOW_MS) { res.status(403).json({ error: "EXPIRED" }); return; }
        const isSig = x.source === "driver_signature";
        const batch = db.batch();
        batch.delete(attRef);
        if (!tg.manual && !isSig) batch.update(tg.ref, { attachCount: FieldValue.increment(-1) });
        const mref = tg.manual ? null : await mirrorRef(tg.mirror);
        if (mref) {
          const ma = await mref.collection("attachments").doc(attId).get();
          if (ma.exists) { batch.delete(ma.ref); if (!isSig) batch.update(mref, { attachCount: FieldValue.increment(-1) }); }
        }
        await batch.commit();
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "finish") {
        if (tg.manual) { res.status(200).json({ ok: true }); return; }
        const patch = { 업로드잠금: true, 업로드잠금해제만료: null };
        if (tg.data.업로드잠금 === true) patch.재업로드완료알림 = true;
        await tg.ref.update(patch);
        const mref = await mirrorRef(tg.mirror);
        if (mref) await mref.update(patch).catch(() => {});
        res.status(200).json({ ok: true });
        return;
      }

      if (action === "loc") {
        if (tg.manual) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
        const on = b.on === true;
        await tg.ref.update({ 위치공유중: on });
        const mref = await mirrorRef(tg.mirror);
        if (mref) await mref.update({ 위치공유중: on }).catch(() => {});
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: "BAD_ACTION" });
    } catch (e) {
      console.error("uploadAccess 실패:", action, e);
      res.status(500).json({ error: "FAILED" });
    }
  });

  // 🔎 기사 통합 업로드 링크(/driver-upload) 검색
  //  · co(운송사) 필수 — 예전 링크(co 없음)는 기본 회사(돌캐) 링크로 본다. 그 회사 오더만 찾는다.
  //  · 날짜·차량번호·이름이 모두 맞는 오더만, 화면에 필요한 칸만. 오더의 업로드토큰은 절대 돌려주지 않는다.
  //    대신 그 오더 하나에만 쓰이는 6시간짜리 서명 허가증(grant)을 준다 — 잠긴(업로드 완료) 오더는 열지 못한다.
  //  · 로그인 안 한 요청은 IP당 10분 30회로 제한(그 회사 직원 로그인 토큰이 있으면 제한 없음)
  const driverSearch = functions.runWith({ secrets: ["UPLOAD_TOKEN_SECRET"] }).https.onRequest(async (req, res) => {
    if (cors(req, res, "GET, OPTIONS")) return;
    const date = String(req.query.date || "").trim();
    const vehicle = String(req.query.vehicle || "").replace(/\s/g, "");
    const name = String(req.query.name || "").trim();
    const co = String(req.query.co || "").trim() || C.DEFAULT_CO;
    const fixed = req.query.source === "fixed";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !vehicle || !name || vehicle.length > 30 || name.length > 40 || co.length > 60) {
      res.status(400).json({ error: "BAD_PARAMS" }); return;
    }
    try {
      const tok = await bearerUser(req);
      const staff = tok ? await isStaffOf(tok, co) : false;
      if (!staff && await limited(res, [[`ds:ip:${clientIp(req)}`, 30, 10 * 60e3]])) return;
      const sec = secret();
      const pick = (id, col, x) => ({
        _id: id, _col: col, 상차일: x.상차일 || x.날짜 || "", 차량번호: x.차량번호 || "", 이름: x.이름 || "", 거래처명: x.거래처명 || "",
        상차지명: x.상차지명 || "", 하차지명: x.하차지명 || "", 화물내용: x.화물내용 || "", 배차상태: x.배차상태 || "", attachCount: x.attachCount || 0,
        업로드잠금: x.업로드잠금 === true,
        grant: sec ? C.newGrant(sec, { orderId: id, col, co }) : "",
      });
      const same = (x) => String(x.차량번호 || "").replace(/\s/g, "") === vehicle && String(x.이름 || "").trim() === name
        && (String(x.companyName || x.company || "").trim() || C.DEFAULT_CO) === co;
      const out = [];
      if (fixed) {
        const s = await db.collection("fixedClients").where("날짜", "==", date).get();
        s.docs.forEach((d) => { const x = d.data() || {}; if (same(x)) out.push(pick(d.id, "fixedClients", x)); });
      } else {
        for (const col of ["orders", "dispatch"]) {
          const s = await db.collection(col).where("상차일", "==", date).get();
          s.docs.forEach((d) => { const x = d.data() || {}; if (x.source !== "transport_transmit" && same(x)) out.push(pick(d.id, col, x)); });
        }
      }
      res.status(200).json({ results: out.slice(0, 30) });
    } catch (e) {
      console.error("driverSearch 실패:", e);
      res.status(500).json({ error: "SEARCH_FAILED" });
    }
  });

  // 🚚 기사앱 로그인 — PC 기사관리에서 미리 등록한 기사(drivers/{회사__차량번호} 또는 drivers/{차량번호})를
  //  방금 만든 로그인 계정과 연결한다. 이름·회사가 맞을 때만, 서버가 users·drivers 문서를 쓰고 선등록 문서를 지운다.
  //  (예전엔 화면이 drivers/{차량번호}를 직접 읽었고, 그래서 규칙이 "로그인한 누구나 읽기"였다)
  //  응답: { linked:true, companyName } | { linked:false, code: NOT_FOUND | NAME_MISMATCH | COMPANY_MISMATCH | ALREADY }
  const driverLoginLink = functions.https.onRequest(async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== "POST") { res.status(405).json({ error: "POST_ONLY" }); return; }
    try {
      const tok = await bearerUser(req);
      if (!tok) { res.status(401).json({ error: "NO_TOKEN" }); return; }
      if (await limited(res, [[`dl:uid:${tok.uid}`, 10, 10 * 60e3], [`dl:ip:${clientIp(req)}`, 60, 10 * 60e3]])) return;
      const b = req.body && typeof req.body === "object" ? req.body : {};
      const co = String(b.companyName || "").trim().slice(0, 100);
      const carNo = String(b.carNo || "").trim().slice(0, 30);
      const name = String(b.name || "").trim().slice(0, 40);
      if (!co || !carNo || !name) { res.status(400).json({ error: "BAD_PARAMS" }); return; }
      const email = String(tok.email || "").toLowerCase();
      const local = carNo.replace(/ /g, "").toLowerCase();
      if (!email.endsWith("@driver.run25.kr") || !(email.startsWith(`${local}@`) || email.startsWith(`${local}.c`))) {
        res.status(403).json({ error: "NOT_DRIVER_ACCOUNT" }); return;
      }
      const uid = tok.uid;
      const userRef = db.collection("users").doc(uid);
      if ((await userRef.get()).exists) { res.status(200).json({ linked: false, code: "ALREADY" }); return; }
      const plate = C.plateOf(carNo);
      const preKey = C.coDocKey(co, plate);
      const [preSnap, legacySnap] = await Promise.all([
        db.collection("drivers").doc(preKey).get(),
        preKey !== plate ? db.collection("drivers").doc(plate).get() : Promise.resolve(null),
      ]);
      const j = C.judgePreRegistered({ pre: preSnap.exists ? preSnap.data() : null, legacy: legacySnap?.exists ? legacySnap.data() : null, name, companyName: co, uid });
      if (!j.ok) { res.status(200).json({ linked: false, code: j.code }); return; }
      const src = j.use === "pre" ? preSnap : legacySnap;
      const d = src.data() || {};
      const phone = d.전화번호 || d.phone || "";
      const common = {
        uid, name, carNo, phone,
        vehicleType: d.vehicleType || "", 차량종류: d.차량종류 || "", 차량톤수: d.차량톤수 || "",
        거주지: d.거주지 || "", 요청사항: d.요청사항 || "",
        companyName: String(d.companyName || co).trim(),
        approved: true,
      };
      const now = FieldValue.serverTimestamp();
      await db.runTransaction(async (t) => {
        const cur = await t.get(src.ref);
        if (!cur.exists) throw Object.assign(new Error("gone"), { code: "GONE" });
        if (cur.data().uid && cur.data().uid !== uid) throw Object.assign(new Error("taken"), { code: "GONE" });
        if ((await t.get(userRef)).exists) throw Object.assign(new Error("already"), { code: "ALREADY" });
        t.set(userRef, { ...common, email, role: "driver", termsAgreed: true, privacyAgreed: true, gpsAgreed: true, createdAt: now });
        t.set(db.collection("drivers").doc(uid), {
          ...common,
          이름: name, 차량번호: carNo, 전화번호: phone,
          mainStatus: "대기", subStatus: "대기", status: "대기", state: "대기", goStatus: "대기",
          active: false, totalDistance: 0,
          등급: d.등급 || "일반", 담당자: d.담당자 || null, 근무요일: d.근무요일 || [], 메모: d.메모 || "",
          등록자: d.등록자 || "",
          linkedFromDriverId: src.id,
          createdAt: d.createdAt || now,
          updatedAt: now,
        });
        if (src.id !== uid) t.delete(src.ref);
      });
      console.log(`🔗 기사 로그인 선등록 연결: ${co} ${plate} → drivers/${uid} (예전 ${src.id})`);
      res.status(200).json({ linked: true, companyName: common.companyName });
    } catch (e) {
      if (e?.code === "GONE") { res.status(200).json({ linked: false, code: "NOT_FOUND" }); return; }
      if (e?.code === "ALREADY") { res.status(200).json({ linked: false, code: "ALREADY" }); return; }
      console.error("driverLoginLink 실패:", e);
      res.status(500).json({ error: "LINK_FAILED" });
    }
  });

  return { uploadAccess, driverSearch, driverLoginLink, rateLimit, limited, clientIp, _crypto: crypto };
};
