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
// Service Worker 등록 (PWA 판정 안정화)
// --------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[APP] SW registered:", reg.scope);
      })
      .catch((err) => {
        console.error("[APP] SW registration failed", err);
      });
  });
}

// ===================== END =====================
