// ======================= src/securityWatch.js =======================
// 🛡 2026-11-09 이상 접속 알림 — 화면 쪽은 "알려 주기"만 한다(판정·기록·최고관리자 알림은 서버 securityPing)
//  · 로그인할 때 1번: 이 기기 고유 번호(이 브라우저에만 저장)와 함께 → 새 기기·해외 IP·새벽 접속 판정
//  · 파일을 내려받을 때마다(엑셀·ZIP·첨부 저장 등 <a download> 클릭) → 짧은 시간 대량 다운로드 판정
//  · 실패해도 화면 동작에는 영향 없음(조용히 넘어감) · 둘러보기·개발 서버 에뮬레이터에서는 보내지 않음
import { auth, FUNCTIONS_BASE } from "./firebase";
import { isPreviewMode } from "./fsTenant";

const DEV_KEY = "kpDeviceId";
function deviceId() {
  try {
    let v = localStorage.getItem(DEV_KEY);
    if (!v) { v = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem(DEV_KEY, v); }
    return v;
  } catch { return ""; }
}
async function ping(data) {
  try {
    if (isPreviewMode()) return;
    const u = auth.currentUser;
    if (!u) return;
    const token = await u.getIdToken().catch(() => "");
    if (!token) return;
    await fetch(`${FUNCTIONS_BASE}/securityPing`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }), keepalive: true,
    }).catch(() => {});
  } catch { /* 무시 */ }
}

const sentFor = new Set();
// 로그인(이 탭에서 이 계정은 1번만)
export function securityLoginPing(uid, company = "") {
  if (!uid || sentFor.has(uid)) return;
  sentFor.add(uid);
  let key = "";
  try { key = `kpSecPing:${uid}`; if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* 무시 */ }
  ping({ kind: "login", deviceId: deviceId(), company, ua: navigator.userAgent || "" });
}

// 파일 내려받기 감지 — 프로그램의 내려받기는 모두 <a download>.click()(엑셀·ZIP·첨부 저장)을 쓴다
let installed = false;
let lastAt = 0;
export function installDownloadWatch() {
  if (installed || typeof window === "undefined" || !window.HTMLAnchorElement) return;
  installed = true;
  const report = (a) => {
    try {
      const name = a.getAttribute && a.getAttribute("download");
      if (name === null || name === undefined) return;
      const now = Date.now();
      if (now - lastAt < 1500) return; // 한 번 누름에 여러 파일(ZIP 등)이 연달아 나가도 1번으로
      lastAt = now;
      ping({ kind: "download", name: String(name || a.href || "").slice(0, 120) });
    } catch { /* 무시 */ }
  };
  const orig = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function patchedClick(...args) { report(this); return orig.apply(this, args); };
  // 사람이 직접 누르는 다운로드 링크
  document.addEventListener("click", (e) => { const a = e.target?.closest?.("a[download]"); if (a) report(a); }, true);
}
