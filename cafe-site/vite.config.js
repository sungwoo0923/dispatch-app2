import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { MARKET_NAME, MARKET_NAME_EN } from "./src/cafeConstants.js";

// ⭐ 2026-11-06 index.html의 %MARKET_NAME% / %MARKET_NAME_EN% 를 서비스 이름 상수(src/cafeConstants.js)로 채운다
//  — 이름은 그 파일 한 곳에서만 바꾸면 된다.
const marketNameHtml = () => ({
  name: "market-name-html",
  transformIndexHtml: (html) => html.replaceAll("%MARKET_NAME_EN%", MARKET_NAME_EN).replaceAll("%MARKET_NAME%", MARKET_NAME),
});

// 로지스웹 허브(예전 배차마당, cafe-site) — 운송 프로그램(dispatch-app2) 본체와는 완전히 분리된
// 별도의 Vite + React 프로젝트다. 빌드/배포 파이프라인을 공유하지 않는다.
export default defineConfig({
  plugins: [react({ jsxRuntime: "automatic" }), marketNameHtml()],
  server: {
    host: true,
  },
  build: {
    outDir: "dist",
  },
});
