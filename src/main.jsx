// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // App.jsx 불러오기
import "./index.css"; // TailwindCSS 스타일 적용

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
