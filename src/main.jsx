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

// ★ 클라이언트 버전 (sw.js 와 반드시 맞출 것)
const CLIENT_VERSION = "2025-02-10-06";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("[APP] SW registered", reg);

      let updateNotified = false;

      // 🔎 버전 체크 함수
      const checkVersion = () => {
        if (reg.active) {
          reg.active.postMessage({
            type: "CHECK_VERSION",
            version: CLIENT_VERSION,
          });
        }
      };

      // 최초 로드 후 체크
      setTimeout(checkVersion, 500);

      // SW → APP 메시지 수신
      navigator.serviceWorker.addEventListener("message", (event) => {
        const type = event.data?.type;

        // ✅ 업데이트 가능 알림
        if (type === "UPDATE_AVAILABLE" && !updateNotified) {
          updateNotified = true;

          console.log("[APP] Update available");

          // 👉 여기서 UI 알림 띄우면 됨
          // 예: 토스트 / 모달
          window.dispatchEvent(new Event("app-update-ready"));
        }

        // ✅ 업데이트 적용 완료 → 새로고침
        if (type === "UPDATE_APPLIED") {
          console.log("[APP] Update applied → reload");
          window.location.reload();
        }
      });

      // 🔄 사용자가 "업데이트" 버튼 눌렀을 때 호출할 함수
      window.applyAppUpdate = async () => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "APPLY_UPDATE" });
        } else if (reg.active) {
          reg.active.postMessage({ type: "APPLY_UPDATE" });
        }
      };
    } catch (err) {
      console.warn("[APP] SW registration failed", err);
    }
  });
}
