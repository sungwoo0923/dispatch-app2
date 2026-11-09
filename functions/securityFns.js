// ======================= functions/securityFns.js =======================
// 🛡 2026-11-09 보안 — 이상 접속 알림 · 퇴사자 즉시 차단 (판정 규칙은 functions/securityCore.mjs)
//  · securityPing(호출형): 화면이 로그인할 때(kind:"login")·파일을 내려받을 때(kind:"download") 부른다.
//    서버가 IP·국가(Google 앞단 헤더)를 읽어 새 기기·해외 IP·새벽 접속·짧은 시간 대량 다운로드를 판정하고
//    securityEvents 에 기록 + 최고관리자에게 푸시(높음·보통만). 사람별 기준은 securityProfiles/{uid}
//  · onStaffEmploymentChange: users.employmentStatus 가 "퇴사"로 바뀌는 순간 로그인 계정 사용 중지 + 로그인 토큰 회수
//    + 로그인 세션 종료. 복직(퇴사 해제)하면 다시 사용 가능. 최고관리자·계정 없는 인사 기록은 제외.
const SEC_SUPER_EMAIL = "tjddnqkf@naver.com";

module.exports = function makeSecurityFns({ functions, db, getAuth, FieldValue, userTokens, sendPushAndCleanup, appCheckCallOpts }) {
  const core = () => import("./securityCore.mjs");

  async function notifySuper(ev) {
    try {
      const SC = await core();
      const tokens = [];
      const tm = await db.collection("users").where("role", "==", "totalMaster").get();
      tm.docs.forEach((d) => tokens.push(...userTokens(d.data())));
      const me = await db.collection("users").where("email", "==", SEC_SUPER_EMAIL).limit(1).get();
      me.docs.forEach((d) => tokens.push(...userTokens(d.data())));
      if (!tokens.length) return;
      await sendPushAndCleanup(tokens, {
        notification: {
          title: `🛡 보안 알림 · ${SC.EVENT_LABEL[ev.type] || ev.type}(${SC.LEVEL_LABEL[ev.level] || ev.level})`,
          body: `${ev.company || "-"} · ${ev.name || ev.email || ""} — ${ev.detail || ""}`,
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      }, "securityEvent");
    } catch (e) { console.warn("[보안] 최고관리자 알림 실패:", e?.message || e); }
  }

  async function record(base, events) {
    for (const e of events) {
      const d = { ...base, ...e, ack: false, at: FieldValue.serverTimestamp(), atMs: Date.now() };
      await db.collection("securityEvents").add(d).catch((er) => console.warn("[보안] 기록 실패:", er?.message || er));
      if (e.level === "high" || e.level === "medium") await notifySuper(d);
    }
  }

  const securityPing = functions.runWith({ timeoutSeconds: 30, memory: "256MB", ...appCheckCallOpts() }).https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "로그인이 필요해요");
    const kind = String(data?.kind || "");
    if (!["login", "download"].includes(kind)) throw new functions.https.HttpsError("invalid-argument", "알 수 없는 요청");
    const SC = await core();
    const email = String(context.auth.token?.email || "");
    const uSnap = await db.collection("users").doc(uid).get().catch(() => null);
    const u = uSnap?.exists ? uSnap.data() || {} : {};
    const role = email === SEC_SUPER_EMAIL ? "totalMaster" : String(u.role || "");
    const headers = context.rawRequest?.headers || {};
    const { ip, country } = SC.clientNet(headers);
    const ua = String(headers["user-agent"] || data?.ua || "").slice(0, 300);
    const now = Date.now();
    const ref = db.collection("securityProfiles").doc(uid);
    const prof = (await ref.get().catch(() => null))?.data() || {};
    const r = kind === "login"
      ? SC.evaluateLogin(prof, { deviceId: String(data?.deviceId || ""), ua, country, now, role })
      : SC.evaluateDownload(prof, { now, name: String(data?.name || "") });
    await ref.set({ ...r.profile, uid, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    if (r.events.length) {
      await record({
        uid, email, name: String(u.name || u.이름 || ""), role,
        company: role === "totalMaster" ? String(data?.company || "") : String(u.companyName || ""),
        ip, country, ua: SC.shortUa(ua), kind,
      }, r.events);
    }
    return { ok: true, flagged: r.events.map((e) => e.type) };
  });

  const onStaffEmploymentChange = functions.firestore.document("users/{uid}").onUpdate(async (chg, ctx) => {
    const b = chg.before.data() || {};
    const a = chg.after.data() || {};
    const was = b.employmentStatus === "퇴사";
    const now = a.employmentStatus === "퇴사";
    if (was === now) return null;
    const uid = ctx.params.uid;
    if (a.email === SEC_SUPER_EMAIL || a.role === "totalMaster" || a.noAccount) return null;
    const SC = await core();
    const auth = getAuth();
    try {
      if (now) {
        await auth.updateUser(uid, { disabled: true });
        await auth.revokeRefreshTokens(uid);
        const ss = await db.collection("loginSessions").where("uid", "==", uid).where("active", "==", true).get().catch(() => null);
        if (ss?.docs?.length) {
          const w = db.batch();
          ss.docs.forEach((d) => w.set(d.ref, { active: false, endedReason: "퇴사 처리", endedAt: FieldValue.serverTimestamp() }, { merge: true }));
          await w.commit();
        }
      } else {
        await auth.updateUser(uid, { disabled: false });
      }
    } catch (e) {
      if (e?.code !== "auth/user-not-found") console.warn("[보안] 퇴사자 계정 처리 실패:", uid, e?.message || e);
      return null;
    }
    const type = now ? "resign_block" : "rehire_unblock";
    await db.collection("securityEvents").add({
      uid, email: String(a.email || ""), name: String(a.name || a.이름 || ""), role: String(a.role || ""), company: String(a.companyName || ""),
      type, level: "low", detail: now ? "퇴사 처리 — 로그인 계정 사용 중지 · 로그인 토큰 회수 · 세션 종료" : "복직 — 로그인 계정 다시 사용 가능",
      ack: true, at: FieldValue.serverTimestamp(), atMs: Date.now(), label: SC.EVENT_LABEL[type],
    }).catch(() => {});
    return null;
  });

  return { securityPing, onStaffEmploymentChange };
};
