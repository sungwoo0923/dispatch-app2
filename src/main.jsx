// ===================== src/main.jsx (FINAL - DEV SAFE) =====================
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ======================================================
// 🚫 개발 환경에서는 Service Worker 업데이트 로직 차단
// ======================================================
const isDev =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

if ("serviceWorker" in navigator && !isDev) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] SW registered (prod)");

      // 🔎 새 Service Worker 감지
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            console.log("[APP] Update available");
            window.dispatchEvent(new Event("app-update-ready"));
          }
        });
      });

      // 🔄 업데이트 적용 (App.jsx에서 호출)
      window.applyAppUpdate = () => {
        if (reg.waiting) {
          console.log("[APP] Applying update");
          reg.waiting.postMessage({ type: "APPLY_UPDATE" });
        }
      };

      // ✅ 업데이트 적용 완료 시 단 1회 새로고침
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("[APP] Controller changed → reload");
        window.location.reload();
      });
    } catch (err) {
      console.warn("[APP] SW registration failed", err);
    }
  });
} else {
  console.log("[APP] Dev mode → Service Worker update logic disabled");
}
// ===================== END =====================
