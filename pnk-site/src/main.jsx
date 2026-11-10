// ===================== pnk-site/src/main.jsx =====================
// PnK PROJECT 사내 인트라넷 진입점 — 로지스웹 · 허브와 Firebase 프로젝트만 함께 쓴다.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { startUi } from "./editor/uiStore";

startUi(); // 🎨 화면 편집(최고관리자가 바꾼 글자 · 모양 · 메뉴 · 테마)을 모든 화면에 적용

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
