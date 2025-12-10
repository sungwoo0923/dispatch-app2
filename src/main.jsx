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
// 서비스워커 등록 + 새버전 감지 + 강제 업데이트
// =====================================================

// ★ 클라이언트 버전 (배포할 때마다 이 숫자만 바꿔주면 됨)
const CLIENT_VERSION = "2025-02-10-01";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("SW Registered:", reg);

        // ================================
        // 주기적으로 새 버전 체크
        // ================================
        setInterval(() => {
          const msg = { type: "CHECK_VERSION", version: CLIENT_VERSION };
          reg.waiting?.postMessage(msg);
          reg.active?.postMessage(msg);
        }, 30000);

        // ================================
        // 서비스워커 → 메시지 받기
        // ================================
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NEW_VERSION") {
            console.log("🚨 새 버전 감지됨!");

            const ok = confirm("새로운 업데이트가 있습니다. 지금 적용할까요?");

            if (ok) {
              // waiting 상태의 SW가 있다면 즉시 활성화
              reg.waiting?.postMessage({ type: "SKIP_WAITING" });

              // 잠시 후 새 버전으로 새로고침
              setTimeout(() => {
                window.location.reload();
              }, 500);
            }
          }
        });
      })
      .catch((err) => console.warn("SW 등록 실패:", err));
  });
}
