// ===================== src/main.jsx (FINAL STABLE VERSION) =====================

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// =====================================================
// 서비스워커 등록 + 새 버전 감지 → App.jsx UI 이벤트 호출
// =====================================================

// ★ CLIENT_VERSION 은 항상 sw.js VERSION 과 동일해야 함
const CLIENT_VERSION = "2025-02-10-04";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("SW Registered:", reg);

        // 새 SW가 발견될 때 버전 체크
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;

          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed") {
              console.log("SW installed → Checking version…");

              reg.active?.postMessage({
                type: "CHECK_VERSION",
                version: CLIENT_VERSION,
              });
            }
          });
        });

        // 주기적 버전 체크 (30초)
        setInterval(() => {
          const msg = { type: "CHECK_VERSION", version: CLIENT_VERSION };
          reg.active?.postMessage(msg);
          reg.waiting?.postMessage(msg);
        }, 30000);

        // 메시지 리스너
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NEW_VERSION") {
            console.log("🚨 NEW VERSION DETECTED → Trigger UI Toast");
            window.dispatchEvent(new Event("app-update-ready"));
          }
        });
      })
      .catch((err) =>
        console.warn("SW Registration Failed:", err)
      );
  });
}
