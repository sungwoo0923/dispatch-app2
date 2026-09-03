// ===================== src/main.jsx =====================
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./index.css";

// --------------------------------------------------
// ⭐ Firestore 로컬 저장공간(localStorage) 한도 초과 시 자동 복구
// --------------------------------------------------
// firebase.js는 이제 원래대로 persistentSingleTabManager를 쓰지만, 혹시라도
// 다른 이유(브라우저 저장공간이 다른 사이트/오래된 캐시로 이미 꽉 찬 경우 등)로
// 이 오류가 다시 나면 ErrorBoundary가 잡는 "렌더링 중 오류"가 아니라 처리 안 된
// Promise 거부(unhandledrejection)라 화면이 그냥 먹통이 되고 사용자는 원인도 모른
// 채 "캐시 초기화" 메뉴를 직접 찾아 눌러야 했다. 이 특정 오류 신호(localStorage
// 용량 초과 → Firestore 내부 상태 깨짐)를 감지하면, 안내 없이 로컬 저장공간을
// 자동으로 비우고 딱 한 번만 새로고침한다(sessionStorage 플래그로 무한 새로고침
// 방지 — 그래도 안 되면 사용자가 알아차릴 수 있게 반복하지 않고 그대로 둠).
(function setupFirestoreQuotaRecovery() {
  const RELOAD_GUARD_KEY = "__firestoreQuotaRecoveryReloaded";
  const isQuotaOrFirestoreCorruption = (msg) =>
    /QuotaExceededError/i.test(msg) || (/FIRESTORE/.test(msg) && /INTERNAL ASSERTION FAILED/i.test(msg));

  async function recoverAndReload() {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return; // 이미 한 번 시도했으면 반복 안 함
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    console.warn("[APP] Firestore 로컬 저장공간 문제 감지 — 캐시 정리 후 새로고침합니다.");
    try { localStorage.clear(); } catch {}
    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all(
          (dbs || [])
            .filter((d) => d?.name?.includes("firestore"))
            .map((d) => new Promise((resolve) => {
              const req = indexedDB.deleteDatabase(d.name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }))
        );
      }
    } catch {}
    window.location.reload();
  }

  window.addEventListener("unhandledrejection", (event) => {
    const msg = String(event?.reason?.message || event?.reason || "");
    if (isQuotaOrFirestoreCorruption(msg)) recoverAndReload();
  });
})();

// --------------------------------------------------
// React Render
// --------------------------------------------------
// ⭐ ErrorBoundary로 전체를 감싼다 — 화면 어딘가에서 예상 못한 JS 오류가 나도
// 백지 화면 대신 "새로고침" 안내가 뜨게 하기 위함(특히 모바일에서 발생 시
// 사용자가 복구할 방법이 전혀 없었음).
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// --------------------------------------------------
// PWA Service Worker
// --------------------------------------------------
// ⭐ 2026-08-26 사용자 명시적 요청: 새 버전을 화면이 열려 있는 동안 백그라운드에서
// 조용히 자동 적용하지 말고, 사용자가 새로고침하거나 앱을 완전히 껐다가 다시
// 켜야만 새 버전이 반영되게 해달라고 함. 그래서 새 서비스워커가 설치돼도
// APPLY_UPDATE(skipWaiting)를 보내지 않고 "대기" 상태로 그냥 둔다 — 표준
// 서비스워커 동작대로, 이 화면을 쓰는 탭이 모두 사라지는 순간(=새로고침/재실행)에야
// 새 워커가 자연스럽게 활성화된다. (참고: sw.js가 HTML은 항상 네트워크로만 받아
// 오도록 되어 있어서, 새로고침하면 skipWaiting 여부와 무관하게 최신 코드를 정상적
// 으로 받아온다.)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      // ⭐ 예전엔 FCM 백그라운드 처리를 별도 서비스워커(firebase-messaging-sw.js)에
      // 두고 있었는데, 지금은 그 로직을 /sw.js 하나로 합쳤고 그 예전 파일 자체도
      // 서버에서 지웠다(더 이상 어디서도 등록하지 않음). 하지만 이미 그 예전 워커를
      // 등록해둔 기기는 소스 파일을 지웠다고 자동으로 해지되지 않는다 — 서비스워커는
      // "스코프"가 아니라 "스크립트 URL" 단위로 각각 별도 등록되고, 푸시 이벤트는
      // 등록된 워커 전부에 동시에 전달되므로, 이런 기기에서는 예전 워커와 지금 워커가
      // 각자 같은 푸시 메시지에 반응해 알림을 중복으로(2번·4번 등) 띄우고 있었다.
      // 여기서 그 예전 워커를 능동적으로 찾아 해지한다.
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs
            .filter((r) => (r.active || r.waiting || r.installing)?.scriptURL?.includes("firebase-messaging-sw.js"))
            .map((r) => r.unregister().catch(() => {}))
        );
      } catch {}

      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] PWA SW registered");

      // 5분마다 업데이트 체크 — 새 버전이 있으면 미리 내려받아 "대기" 상태로만 준비해둔다.
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);

      // 탭 포커스 시 업데이트 체크
      window.addEventListener("focus", () => reg.update().catch(() => {}));
    } catch (err) {
      console.error("[APP] SW registration failed", err);
    }
  });
}
