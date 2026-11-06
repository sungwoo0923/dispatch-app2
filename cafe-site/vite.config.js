import { defineConfig, searchForWorkspaceRoot } from "vite";
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
    // ⭐ 2026-11-06 허브가 배차 프로그램과 같은 화면 조각(../src/liveTrackView.jsx 실시간 관제 지도 · ../src/OrderScanModal.jsx 오더 스캔)을
    //  그대로 가져다 쓴다(둘 다 Firebase를 쓰지 않는 순수 화면 — 허브는 자기 Firebase 연결만 쓴다). 개발 서버가 상위 폴더 파일을 읽게 허용.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ".."] },
  },
  resolve: {
    // 상위 폴더(../src) 파일이 가져가는 react · leaflet도 허브와 같은 사본을 쓰게(React 두 벌 방지)
    dedupe: ["react", "react-dom", "leaflet", "react-leaflet", "tesseract.js"],
  },
  build: {
    outDir: "dist",
  },
});
