// ===================== pnk-site/src/main.jsx =====================
// PnK PROJECT — 주소에 따라 둘 중 하나를 불러온다(서로 따로 받아서 공식 홈페이지는 가볍게 뜬다)
//  · /login · /intranet/…  → 사내 인트라넷(App.jsx) — 로지스웹 · 허브와 Firebase 프로젝트만 함께 쓴다
//  · 그 밖의 주소(/ · /about · /business · /services · /contact) → 공식 홈페이지(site/Site.jsx) — 누구나 본다
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

export const isIntranetPath = (p = window.location.pathname) => p === "/login" || p === "/intranet" || p.startsWith("/intranet/");

const root = ReactDOM.createRoot(document.getElementById("root"));

if (isIntranetPath()) {
  // 직원 화면은 검색엔진에 안 뜨게
  const m = document.createElement("meta"); m.name = "robots"; m.content = "noindex, nofollow"; document.head.appendChild(m);
  document.title = "PnK PROJECT 인트라넷";
  Promise.all([import("./App.jsx"), import("./editor/uiStore")]).then(([{ default: App }, { startUi }]) => {
    startUi(); // 🎨 화면 편집(최고관리자가 바꾼 글자 · 모양 · 메뉴 · 테마)을 인트라넷 모든 화면에 적용
    root.render(<React.StrictMode><App /></React.StrictMode>);
  });
} else {
  document.documentElement.classList.add("pk-public"); // 아이보리 바탕(site.css)
  import("./site/Site.jsx").then(({ default: Site }) => {
    root.render(<React.StrictMode><Site /></React.StrictMode>);
  });
}
