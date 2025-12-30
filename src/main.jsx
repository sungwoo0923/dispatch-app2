// ===================== src/main.jsx (FINAL - TEST SERVER OK) =====================
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
// ✅ localhost만 개발 환경으로 취급
// ======================================================
const isLocalhost =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

if ("serviceWorker" in navigator && !isLocalhost) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] SW registered");

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

      // 🔄 업데이트 적용 (배너 버튼에서 호출)
      window.applyAppUpdate = () => {
        if (reg.waiting) {
          console.log("[APP] Applying update");
          reg.waiting.postMessage({ type: "APPLY_UPDATE" });
        }
      };

      // ✅ 업데이트 적용 완료 시 1회 새로고침
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("[APP] Controller changed → reload");
        window.location.reload();
      });
    } catch (err) {
      console.warn("[APP] SW registration failed", err);
    }
  });
} else {
  console.log("[APP] Localhost → SW update logic disabled");
}
// ===================== END =====================
