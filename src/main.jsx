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
// PWA Service Worker (캐시 / 업데이트 전용)
// --------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] PWA SW registered");

      let hasReloaded = false;
      let updateApplied = false;

      // 새 SW 감지
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller &&
            reg.waiting
          ) {
            const alreadyShown =
              sessionStorage.getItem("sw-update-shown") === "true";
            if (alreadyShown) return;

            sessionStorage.setItem("sw-update-shown", "true");
            window.dispatchEvent(new Event("app-update-ready"));
          }
        });
      });

      // App.jsx → 업데이트 적용
      window.applyAppUpdate = () => {
        if (!reg.waiting) return;

        updateApplied = true;
        sessionStorage.removeItem("sw-update-shown");
        reg.waiting.postMessage({ type: "APPLY_UPDATE" });
      };

      // 업데이트 적용 후 1회 reload
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!updateApplied || hasReloaded) return;
        hasReloaded = true;
        window.location.reload();
      });
    } catch (err) {
      console.error("[APP] SW registration failed", err);
    }
  });
}
