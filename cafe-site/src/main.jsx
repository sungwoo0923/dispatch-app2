// ===================== cafe-site/src/main.jsx =====================
// 배차마당 — 운송 프로그램(dispatch-app2) 본체와 완전히 분리된 독립 사이트의
// 진입점. Firebase 프로젝트(Auth + cafeOrders 컬렉션)만 공유한다.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
