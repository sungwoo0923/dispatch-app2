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
// PWA Service Worker – 자동 업데이트 (팝업 없음)
// UpdateBanner.jsx가 controllerchange를 감지해 배너 표시 후 자동 새로고침
// --------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] PWA SW registered");

      let hasReloaded = false;

      // 새 워커 설치 완료 시 → 즉시 활성화 요청 (팝업 없이 자동 적용)
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: "APPLY_UPDATE" });
          }
        });
      });

      // 기존 waiting 워커도 즉시 활성화
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "APPLY_UPDATE" });
      }

      // 컨트롤러 변경 = 새 SW 활성화 완료 → UpdateBanner가 이 이벤트를 감지해 배너+새로고침
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasReloaded) return;
        hasReloaded = true;
        // UpdateBanner가 banner를 표시하고 2.8초 후 reload() 호출하므로 여기서는 패스
        // (UpdateBanner 없는 환경 대비 fallback)
        setTimeout(() => { if (!hasReloaded) window.location.reload(); }, 4000);
      });

      // 5분마다 업데이트 체크
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);

      // 탭 포커스 시 업데이트 체크
      window.addEventListener("focus", () => reg.update().catch(() => {}));
    } catch (err) {
      console.error("[APP] SW registration failed", err);
    }
  });
}
