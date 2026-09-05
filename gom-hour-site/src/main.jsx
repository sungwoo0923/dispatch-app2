// ===================== gom-hour-site/src/main.jsx =====================
// GOM_Hour 주문페이지 — 배차관리 프로그램(dispatch-app2) 본체와 완전히
// 분리된 독립 사이트의 진입점. Firebase 프로젝트만 공유한다.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
