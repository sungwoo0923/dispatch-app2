// ======================= src/accessLogRetention.js =======================
// 🧹 2026-11-14 접속 이력 7일 보관 — 서버(functions/accessLogPurge.js)가 매일 새벽 지우고,
//  화면(관리자메뉴 › 접속이력 · 관리센터 › 접속 이력 · 보안 알림 · 로그인 관리 › 최근 로그인 기록)도
//  지우기 전이라도 7일 안의 기록만 보여준다. PC · 모바일 같은 화면을 쓰므로 모두 같다.
export const ACCESS_LOG_DAYS = 7;
export const accessLogCutoffMs = (now = Date.now()) => now - ACCESS_LOG_DAYS * 864e5;
const toMs = (v) => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : v.seconds ? v.seconds * 1000 : v instanceof Date ? v.getTime() : 0);
// 시각이 아직 없는 기록(서버 시각을 기다리는 중)은 방금 남긴 것으로 본다
export const withinAccessLogWindow = (v, now = Date.now()) => { const ms = toMs(v); return !ms || ms >= accessLogCutoffMs(now); };

// 🧹 2026-11-15 [전체 삭제] — 관리자센터 · 관리자메뉴의 접속 이력 / 로그인 관리 / 보안 알림을 한 번에 비운다(최고관리자만 · 서버 규칙도 같음)
//  keep(문서) 가 true 인 것은 남긴다(예: 지금 이 기기 로그인)
export async function deleteAllDocs(collName, keep = () => false) {
  const { collection, getDocs, query, limit, writeBatch, startAfter, orderBy, documentId } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  let n = 0, last = null;
  for (;;) {
    const q = last ? query(collection(db, collName), orderBy(documentId()), startAfter(last), limit(400)) : query(collection(db, collName), orderBy(documentId()), limit(400));
    const snap = await getDocs(q);
    if (snap.empty) break;
    const b = writeBatch(db);
    let k = 0;
    snap.docs.forEach((d) => { if (!keep({ id: d.id, ...d.data() })) { b.delete(d.ref); k++; } });
    if (k) await b.commit();
    n += k;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  return n;
}
