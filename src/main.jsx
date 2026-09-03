// ===================== src/main.jsx =====================
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// --------------------------------------------------
// React Render
// --------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
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
