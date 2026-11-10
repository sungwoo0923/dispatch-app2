import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

// PnK PROJECT 사내 인트라넷(pnk-site) — 로지스웹 운송 프로그램 · 로지스웹 허브와는 빌드/배포가 완전히 분리된 별도 Vite + React 앱.
//  같은 Firebase 프로젝트(로그인 계정 · Firestore · Storage)만 함께 쓴다. 상위 폴더에서는 ../src/appCheckClient.js 하나만 가져온다.
export default defineConfig({
  plugins: [react({ jsxRuntime: "automatic" })],
  server: { host: true, fs: { allow: [searchForWorkspaceRoot(process.cwd()), ".."] } },
  resolve: { dedupe: ["react", "react-dom"] },
  build: { outDir: "dist" },
});
