<<<<<<< HEAD
// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App"; // App.jsx 불러오기
import "./index.css"; // TailwindCSS 스타일 적용
=======
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
>>>>>>> 1a3d6a049e30818b63a792ab3cb2d5f27ed480d1

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
