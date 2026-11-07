// ======================= functions/hubTriggers.js =======================
// ⭐ 2026-11-06 로지스웹 허브 서버 트리거 모음 — index.js가 그대로 내보낸다(Object.assign(exports, ...)).
//  따로 떼어 둔 이유: 에뮬레이터 시험(scripts/hubTests/fn)이 허브 트리거만 불러 쓸 수 있게(프로그램 전체 함수 없이).
//   hubOrderOnWrite    — 평점 · 완료 집계 + 단계별 알림 · 예치금 보류/정산 · 로지스웹 배차 오더 연동(functions/hubCall.js)
//   hubChargeOnWrite   — 충전 요청 → 관리자 [입금 확인] → 예치금 + · 미정산 자동 상환(functions/hubWallet.js)
//   hubPayoutOnWrite   — 지급 대기열 [지급 요청](지급대행 어댑터 requestPayout) · [지급완료]
//   hubAdjustOnCreate  — 관리자 예치금 조정
//   hubNoticeOnCreate  — 허브 알림 → 받는 사람 기기 푸시(허브 앱 토큰 hubMembers.fcmTokens + 로지스웹 계정이면 users 토큰)
//   hubDriverLocMirror — 로지스웹 소속 기사앱(백그라운드 GPS)의 drivers/{uid} 위치 → 진행 중 허브 오더 관제(hubLive)
//   ⭐ 2026-11-07 (3차)
//   hubPostRequestOnCreate — 배차 프로그램 [저장 + 허브 등록] → 허브 오더를 만들고 원래 오더에 연결(functions/hubSync.js)
//   hubWithdrawOnWrite     — 출금 신청 → 잔액 묶기 · 지급 요청 자리 · [출금 완료] · 반려 시 돌려주기
//   hubPayoutDaily         — 매일 아침 지급예정일이 된 운송료를 지급 요청으로
//   hubVaDeposit           — 가상계좌 입금 알림(PG 웹훅 자리, 비밀값 HUB_VA_WEBHOOK_SECRET 이 있을 때만 받는다)
//  회원은 잔액(hubWallets) · 원장(hubLedger)을 쓸 수 없다(규칙 write false) — 이 트리거만 트랜잭션으로 쓴다.
const _hubCall = require("./hubCall");
const _hubWallet = require("./hubWallet");
const _hubSync = require("./hubSync");

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
  out.hubPostRequestOnCreate = functions.firestore.document("hubPostRequests/{id}").onCreate(async (snap, context) => {
    try { await _hubSync.handlePostRequest(db, FieldValue, context.params.id, snap.data()); }
    catch (e) { console.error("[허브 등록 요청] 실패:", e); await snap.ref.update({ status: "failed", reason: "잠시 뒤 다시 시도해 주세요" }).catch(() => {}); }
  });
  out.hubWithdrawOnWrite = functions.firestore.document("hubWithdrawals/{id}").onWrite(async (change, context) => {
    try { await _hubWallet.onWithdrawWrite(db, FieldValue, context.params.id, change.before.exists ? change.before.data() : null, change.after.exists ? change.after.data() : null); } catch (e) { console.error("[허브 출금] 처리 실패:", e); }
  });
  out.hubPayoutDaily = functions.pubsub.schedule("7 9 * * *").timeZone("Asia/Seoul").onRun(async () => {
    try { const n = await _hubWallet.runDuePayouts(db, FieldValue); console.log(`[허브 지급] 오늘 지급 요청 ${n}건`); } catch (e) { console.error("[허브 지급] 예정일 처리 실패:", e); }
  });
  out.hubVaDeposit = functions.https.onRequest(async (req, res) => {
    const secret = process.env.HUB_VA_WEBHOOK_SECRET || "";
    if (!secret) { res.status(503).json({ ok: false, reason: "not_configured" }); return; }
    if (req.method !== "POST" || String(req.get("x-hub-secret") || "") !== secret) { res.status(403).json({ ok: false }); return; }
    try {
      const b = req.body || {};
      const r = await _hubWallet.vaDeposit(db, FieldValue, { account: b.account, amount: b.amount, depositor: b.depositor, txId: b.txId });
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { console.error("[허브 가상계좌] 입금 반영 실패:", e); res.status(500).json({ ok: false }); }
  });
  return out;
}

module.exports = { register };
