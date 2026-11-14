// ======================= src/accessLogRetention.js =======================
// 🧹 2026-11-14 접속 이력 7일 보관 — 서버(functions/accessLogPurge.js)가 매일 새벽 지우고,
//  화면(관리자메뉴 › 접속이력 · 관리센터 › 접속 이력 · 보안 알림 · 로그인 관리 › 최근 로그인 기록)도
//  지우기 전이라도 7일 안의 기록만 보여준다. PC · 모바일 같은 화면을 쓰므로 모두 같다.
export const ACCESS_LOG_DAYS = 7;
export const accessLogCutoffMs = (now = Date.now()) => now - ACCESS_LOG_DAYS * 864e5;
const toMs = (v) => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : v.seconds ? v.seconds * 1000 : v instanceof Date ? v.getTime() : 0);
// 시각이 아직 없는 기록(서버 시각을 기다리는 중)은 방금 남긴 것으로 본다
export const withinAccessLogWindow = (v, now = Date.now()) => { const ms = toMs(v); return !ms || ms >= accessLogCutoffMs(now); };
