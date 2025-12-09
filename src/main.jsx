// ===================== src/main.jsx (FINAL MASTER) =====================
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
// Service Worker 등록 + 새버전 감지 + UI 알림
// =====================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("SW Registered:", reg);

        // updatefound = 새버전 감지
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          newSW?.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              console.log("🚨 새 버전 설치됨!");
              showUpdateToast(reg);
            }
          });
        });

        // 백엔드에서 온 NEW_VERSION 메시지 감지
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NEW_VERSION") {
            console.log("🚨 메시지로 새 버전 감지!");
            showUpdateToast(reg);
          }
        });

        // 주기적 체크(30초)
        setInterval(() => {
          reg.waiting?.postMessage("CHECK_VERSION");
          reg.active?.postMessage("CHECK_VERSION");
        }, 30000);
      })
      .catch((err) => console.warn("SW 등록 실패:", err));
  });
}

// =====================================================
// 새 버전 UI (Run25 스타일 토스트+모달)
// =====================================================
function showUpdateToast(reg) {
  if (window.__update_shown) return;
  window.__update_shown = true;

  const toast = document.createElement("div");
  toast.innerHTML = `
    <div style="
      position:fixed;
      bottom:20px;
      left:50%;
      transform:translateX(-50%);
      background:#2563eb;
      color:white;
      padding:14px 20px;
      border-radius:12px;
      font-size:14px;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
      transition:all .3s;
      z-index:9999;
    ">
      새 버전이 있습니다. 눌러서 적용하기
    </div>
  `;
  document.body.appendChild(toast);

  toast.addEventListener("click", () => {
    toast.remove();
    showUpdateModal(reg);
  });
}

function showUpdateModal(reg) {
  const modal = document.createElement("div");
  modal.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.5);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:99999;
    ">
      <div style="
        background:white;
        padding:30px;
        width:260px;
        border-radius:16px;
        text-align:center;
        font-size:14px;
      ">
        <h2 style="font-size:16px;font-weight:700;margin-bottom:12px;">
          새 버전을 사용할 수 있습니다
        </h2>
        <p style="margin-bottom:20px;">새로고침하여 최신 기능을 적용하세요!</p>
        <button id="applyUpdate" style="
          background:#2563eb;
          color:white;
          width:100%;
          padding:10px 0;
          border-radius:10px;
          font-weight:700;
        ">업데이트 적용</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("applyUpdate").onclick = () => {
    modal.remove();
    reg.waiting?.postMessage({ type: "SKIP_WAITING" });
  };
}
