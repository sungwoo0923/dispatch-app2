// ===================== src/main.jsx =====================
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
// 🔥 서비스워커 등록
// =====================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("SW Registered:", reg);

        // 30초마다 새버전 체크
        setInterval(() => {
          reg.waiting?.postMessage("CHECK_VERSION");
          reg.active?.postMessage("CHECK_VERSION");
        }, 30000);

        // 메시지 수신
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NEW_VERSION") {
            console.log("🚨 새 버전 감지!");
            window.dispatchEvent(new Event("app-update-ready"));
          }
        });
      })
      .catch((err) => console.warn("SW 등록 실패:", err));
  });
}
