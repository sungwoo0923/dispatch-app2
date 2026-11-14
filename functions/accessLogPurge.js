// ======================= functions/accessLogPurge.js =======================
// 🧹 2026-11-14 접속 이력 7일 보관 — 일주일이 지난 접속 기록은 매일 새벽 자동으로 지운다(PC · 모바일 · 관리센터 모두 같은 기록)
//  · sessionLogs     로그인 · 로그아웃 기록(관리자메뉴 › 접속이력, 관리센터 › 접속 이력)
//  · loginSessions   끝난 로그인(active:false)만 — 끝난 지 7일 지난 것. 지금 로그인 중인 기기는 건드리지 않는다
//                    (문서를 지우면 그 기기가 로그아웃되므로)
//  · securityEvents  새 기기 · 해외 IP · 새벽 접속 같은 보안 알림(관리센터 › 보안 알림)
//  화면 규칙(7일)은 src/accessLogRetention.js 와 같다.
const RETENTION_DAYS = 7;
const DAY = 864e5;

// 한 번에 400개씩 지운다. deadline()이 true가 되면 멈추고 남은 건 다음 날 이어서.
async function deleteQuery(db, makeQuery, deadline) {
  let n = 0;
  for (;;) {
    if (deadline()) return { n, more: true };
    const snap = await makeQuery().limit(400).get();
    if (snap.empty) return { n, more: false };
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += snap.size;
    if (snap.size < 400) return { n, more: false };
  }
}

async function purgeAccessLogs({ db, Timestamp, now = Date.now(), deadline = () => false, days = RETENTION_DAYS }) {
  const cutMs = now - days * DAY;
  const cut = Timestamp.fromMillis(cutMs);
  const out = {};
  out.sessionLogs = await deleteQuery(db, () => db.collection("sessionLogs").where("at", "<", cut), deadline);
  out.loginSessions = await deleteQuery(db, () => db.collection("loginSessions").where("endedAt", "<", cut), deadline);
  out.securityEvents = await deleteQuery(db, () => db.collection("securityEvents").where("atMs", "<", cutMs), deadline);
  return out;
}

module.exports = { purgeAccessLogs, RETENTION_DAYS };
