// ======================= src/pendingOpen.js =======================
// 🛠 2026-11-17 알림 팝업 [전자결재에서 열기]를 누른 직후 화면이 새로고침되면(배포 버전 맞추기 등) 홈으로 돌아가던 문제
//  · 결재 화면으로 가는 신호(kp-open-approval)가 나올 때마다 그 요청을 이 탭(sessionStorage)에 잠깐(30초) 적어 둔다.
//  · 새로고침 뒤 처음 그려지는 홈(PC HomeDashboard) · 모바일 앱이 남은 요청을 이어서 연다.
//  · 결재 화면을 떠나면 지운다(다시 홈에 와도 결재함이 또 열리지 않게).
const KEY = "kpPendingApOpen";
const MAX_AGE = 30000;

export function readPendingApproval() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !v.at || Date.now() - v.at > MAX_AGE) { sessionStorage.removeItem(KEY); return null; }
    return v.p || null;
  } catch { return null; }
}
export function clearPendingApproval() { try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ } }

// 앱을 시작할 때 한 번 — 화면 쪽 받는 곳(HomeDashboard · MobileApp)보다 먼저 등록돼 값을 지우기 전에 적는다
export function installPendingApprovalWatch() {
  try {
    if (window.__kpPendingApWatch) return;
    window.__kpPendingApWatch = true;
    window.addEventListener("kp-open-approval", () => {
      const p = window.__kpOpenApproval;
      if (!p) return;
      try { sessionStorage.setItem(KEY, JSON.stringify({ p: { id: p.id || null, page: p.page || "inbox" }, at: Date.now() })); } catch { /* 무시 */ }
    });
  } catch { /* 무시 */ }
}
