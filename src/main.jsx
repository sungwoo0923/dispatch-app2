// ===================== src/main.jsx (FINAL - UPDATE SAFE UX FIXED) =====================
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
// Service Worker 등록 + 업데이트 처리
// --------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] SW registered");

      // --------------------------------------------------
      // 내부 상태 플래그
      // --------------------------------------------------
      let hasReloaded = false;      // reload 1회 제한
      let updateApplied = false;   // 업데이트로 인한 controllerchange만 reload

      // --------------------------------------------------
      // 새 Service Worker 감지 → 진짜 업데이트 + 1회 노출
      // --------------------------------------------------
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        console.log("[APP] New SW installing");

        newWorker.addEventListener("statechange", () => {
          console.log("[APP] SW state:", newWorker.state);

          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller &&
            reg.waiting
          ) {
            // 🔒 이번 세션에서 이미 배너를 봤으면 무시
            const alreadyShown =
              sessionStorage.getItem("sw-update-shown") === "true";

            if (alreadyShown) {
              console.log("[APP] Update already shown → skip");
              return;
            }

            console.log("[APP] 🔔 Real update available (first time)");
            sessionStorage.setItem("sw-update-shown", "true");
            window.dispatchEvent(new Event("app-update-ready"));
          }
        });
      });

      // --------------------------------------------------
      // App.jsx에서 호출할 업데이트 적용 함수
      // --------------------------------------------------
      window.applyAppUpdate = () => {
        if (!reg.waiting) {
          console.log("[APP] No waiting SW → ignore");
          return;
        }

        console.log("[APP] Applying update");
        updateApplied = true;                 // 🔥 업데이트로 인한 reload만 허용
        sessionStorage.removeItem("sw-update-shown"); // 다음 배포 대비
        reg.waiting.postMessage({ type: "APPLY_UPDATE" });
      };

      // --------------------------------------------------
      // controllerchange 처리
      // - 초기 SW 장착 시: reload ❌
      // - 업데이트 적용 시: reload ⭕ (1회)
      // --------------------------------------------------
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!updateApplied) {
          console.log("[APP] Controller changed (initial) → skip reload");
          return;
        }

        if (hasReloaded) return;
        hasReloaded = true;

        console.log("[APP] Controller changed (update) → reload once");
        window.location.reload();
      });
    } catch (err) {
      console.error("[APP] SW registration failed", err);
    }
  });
}
// ===================== END =====================
