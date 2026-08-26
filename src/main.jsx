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
// ⭐ 2026-08-26 사용자 명시적 요청(KP-Flow 배차프로그램): 새 버전을 화면이 열려
// 있는 동안 백그라운드에서 조용히 자동 적용하지 말고, 사용자가 새로고침하거나
// 앱을 완전히 껐다가 다시 켜야만 새 버전이 반영되게 해달라고 함. 그래서
// 배차프로그램에서는 새 서비스워커가 설치돼도 APPLY_UPDATE(skipWaiting)를
// 보내지 않고 "대기" 상태로 그냥 둔다 — 표준 서비스워커 동작대로, 이 화면을 쓰는
// 탭이 모두 사라지는 순간(=새로고침/재실행)에야 새 워커가 자연스럽게
// 활성화된다. (참고: sw.js가 HTML은 항상 네트워크로만 받아오도록 되어 있어서,
// 새로고침하면 skipWaiting 여부와 무관하게 최신 코드를 정상적으로 받아온다.)
//
// KP-Planner(VITE_PLANNER_SITE=1)는 이 요청과 무관한 별개 제품이라 원래
// 동작(설치되는 즉시 조용히 자동 적용)을 그대로 유지한다 — 여기 손대지 말 것.
const isPlannerSite = import.meta.env.VITE_PLANNER_SITE === "1";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] PWA SW registered");

      if (isPlannerSite) {
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "APPLY_UPDATE" });
            }
          });
        });

        if (reg.waiting) {
          reg.waiting.postMessage({ type: "APPLY_UPDATE" });
        }
      }

      // 5분마다 업데이트 체크 — 새 버전이 있으면 미리 내려받아 "대기" 상태로만
      // 준비해둔다(배차프로그램 기준. Planner는 위에서 즉시 적용됨).
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);

      // 탭 포커스 시 업데이트 체크
      window.addEventListener("focus", () => reg.update().catch(() => {}));
    } catch (err) {
      console.error("[APP] SW registration failed", err);
    }
  });
}
