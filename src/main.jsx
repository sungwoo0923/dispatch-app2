// ===================== src/main.jsx (ULTRA STABLE VERSION) =====================

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ★ SW + CLIENT 버전
const CLIENT_VERSION = "2025-02-10-04";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("SW Registered:", reg);

      // -----------------------------
      // 1) 서비스워커가 활성화될 때까지 기다린 후 버전 체크
      // -----------------------------
      function checkNow() {
        if (reg.active) {
          reg.active.postMessage({
            type: "CHECK_VERSION",
            version: CLIENT_VERSION,
          });
        }
      }

      // activate 이벤트 발생 시 체크
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("SW controller changed → now active");
        checkNow();
      });

      // 페이지 로드 직후에도 체크 시도(여기서는 reg.active가 null일 수 있음)
      setTimeout(checkNow, 500);

      // -----------------------------
      // 2) 주기적으로 버전 체크 (30초)
      // -----------------------------
      setInterval(() => {
        if (reg.active) {
          reg.active.postMessage({
            type: "CHECK_VERSION",
            version: CLIENT_VERSION,
          });
        }
      }, 30000);

      // -----------------------------
      // 3) SW → NEW_VERSION 메시지 수신
      // -----------------------------
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "NEW_VERSION") {
          console.log("🚨 NEW VERSION DETECTED → Trigger UI Toast");
          window.dispatchEvent(new Event("app-update-ready"));
        }
      });

    } catch (err) {
      console.warn("SW Registration Failed:", err);
    }
  });
}
