// ======================= functions/hubTriggers.js =======================
// ⭐ 2026-11-06 로지스웹 허브 서버 트리거 모음 — index.js가 그대로 내보낸다(Object.assign(exports, ...)).
//  따로 떼어 둔 이유: 에뮬레이터 시험(scripts/hubTests/fn)이 허브 트리거만 불러 쓸 수 있게(프로그램 전체 함수 없이).
//   hubOrderOnWrite    — 평점 · 완료 집계 + 단계별 알림 · 예치금 보류/정산 · 로지스웹 배차 오더 연동(functions/hubCall.js)
//   hubChargeOnWrite   — 충전 요청 → 관리자 [입금 확인] → 예치금 + · 미정산 자동 상환(functions/hubWallet.js)
//   hubPayoutOnWrite   — 지급 대기열 [지급 요청](지급대행 어댑터 requestPayout) · [지급완료]
//   hubAdjustOnCreate  — 관리자 예치금 조정
//   hubNoticeOnCreate  — 허브 알림 → 받는 사람 기기 푸시(허브 앱 토큰 hubMembers.fcmTokens + 로지스웹 계정이면 users 토큰)
//   hubDriverLocMirror — 로지스웹 소속 기사앱(백그라운드 GPS)의 drivers/{uid} 위치 → 진행 중 허브 오더 관제(hubLive)
//  회원은 잔액(hubWallets) · 원장(hubLedger)을 쓸 수 없다(규칙 write false) — 이 트리거만 트랜잭션으로 쓴다.
const _hubCall = require("./hubCall");
const _hubWallet = require("./hubWallet");

function register({ functions, db, FieldValue, sendPushAndCleanup, userTokens, getStorage }) {
  const out = {};
  out.hubOrderOnWrite = functions.firestore
    .document("hubOrders/{id}")
    .onWrite(async (change, context) => {
      try {
        await _hubCall.onHubOrderWrite(db, FieldValue, context.params.id, change.before.exists ? change.before.data() : null, change.after.exists ? change.after.data() : null, { storage: getStorage() });
      } catch (e) { console.error("[허브 콜] 집계 실패:", e); }
    });
  out.hubChargeOnWrite = functions.firestore.document("hubCharges/{id}").onWrite(async (change, context) => {
    const a = change.after.exists ? change.after.data() : null;
    if (!a || a.status !== "confirmed" || a.creditedAt) return;
    try { await _hubWallet.creditCharge(db, FieldValue, context.params.id); } catch (e) { console.error("[허브 예치금] 충전 반영 실패:", e); }
  });
  out.hubPayoutOnWrite = functions.firestore.document("hubPayouts/{id}").onWrite(async (change, context) => {
    try { await _hubWallet.onPayoutWrite(db, FieldValue, context.params.id, change.before.exists ? change.before.data() : null, change.after.exists ? change.after.data() : null); } catch (e) { console.error("[허브 예치금] 지급 처리 실패:", e); }
  });
  out.hubAdjustOnCreate = functions.firestore.document("hubAdjustments/{id}").onCreate(async (snap, context) => {
    try { await _hubWallet.applyAdjustment(db, FieldValue, context.params.id); } catch (e) { console.error("[허브 예치금] 조정 실패:", e); }
  });
  out.hubNoticeOnCreate = functions.firestore.document("hubNotices/{id}").onCreate(async (snap) => {
    const n = snap.data() || {};
    if (!n.toUid) return;
    try {
      const [ms, us] = await Promise.all([db.collection("hubMembers").doc(n.toUid).get(), db.collection("users").doc(n.toUid).get()]);
      const m = ms.exists ? ms.data() : {};
      if (m.prefs?.push === false) { await snap.ref.update({ push: { count: 0, skipped: "off" } }); return; }
      const outT = new Set(Array.isArray(m.fcmTokensOut) ? m.fcmTokensOut : []);
      const tokens = [...new Set([...(Array.isArray(m.fcmTokens) ? m.fcmTokens : []), ...userTokens(us.exists ? us.data() : null)])].filter((t) => t && !outT.has(t));
      if (!tokens.length) { await snap.ref.update({ push: { count: 0 } }); return; }
      const res = await sendPushAndCleanup(tokens, {
        notification: { title: String(n.title || "로지스웹 허브"), body: String(n.body || "") },
        data: { type: `hub_${n.type || ""}`, url: n.orderId ? `/order/${n.orderId}` : "/", orderId: String(n.orderId || ""), tag: `hub-${snap.id}` },
      }, `허브 ${n.type || ""}`);
      await snap.ref.update({ push: { count: tokens.length, success: res?.successCount ?? 0, at: FieldValue.serverTimestamp() } });
    } catch (e) { console.error("[허브 푸시] 실패:", e); }
  });
  out.hubDriverLocMirror = functions.firestore.document("drivers/{uid}").onUpdate(async (change, context) => {
    const a = change.after.data();
    if (!a?.hubActiveOrderId) return;
    try { await _hubCall.mirrorDriverLocation(db, FieldValue, context.params.uid, change.before.data(), a); } catch (e) { console.error("[허브 관제] 기사앱 위치 넘기기 실패:", e); }
  });
  return out;
}

module.exports = { register };
