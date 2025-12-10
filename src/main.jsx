// ===================== src/main.jsx (수정본) =====================
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
// 서비스워커 등록 + 새버전 감지 → App.jsx UI 토스트 호출
// =====================================================

// ★ 클라이언트 버전 (sw.js VERSION과 다르게 유지해야 업데이트 감지됨)
const CLIENT_VERSION = "2025-02-10-01";  // ← 여기 그대로 두면 됨

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("SW Registered:", reg);

        // 새 SW가 발견되면 버전 체크
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed") {
              reg.active?.postMessage({
                type: "CHECK_VERSION",
                version: CLIENT_VERSION,
              });
            }
          });
        });

        // 주기적 버전 체크
        setInterval(() => {
          const msg = { type: "CHECK_VERSION", version: CLIENT_VERSION };
          reg.active?.postMessage(msg);
          reg.waiting?.postMessage(msg);
        }, 30000);

        // 서비스워커 메시지 수신
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NEW_VERSION") {
            console.log("🚨 NEW VERSION DETECTED → Trigger UI");

            window.dispatchEvent(new Event("app-update-ready"));
          }
        });
      })
      .catch((err) => console.warn("SW 등록 실패:", err));
  });
}
