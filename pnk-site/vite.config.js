import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// PnK PROJECT — 두 페이지를 함께 빌드한다(로지스웹 · 허브와는 빌드/배포가 완전히 분리된 별도 Vite 앱)
//  · index.html    공식 홈페이지(정적 HTML + public/pk/pk-site.js 편집 엔진) — 주소 /
//  · intranet.html 사내 인트라넷(React) — 주소 /login · /intranet/…  (배포: vercel.json rewrites)
//  같은 Firebase 프로젝트(로그인 계정 · Firestore · Storage)만 함께 쓴다.
const intranetRoutes = () => ({
  name: "pnk-intranet-routes",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/(login|intranet)(\/|\?|$)/.test(req.url || "")) req.url = "/intranet.html";
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/(login|intranet)(\/|\?|$)/.test(req.url || "")) req.url = "/intranet.html";
      next();
    });
  },
});

export default defineConfig({
  plugins: [react({ jsxRuntime: "automatic" }), intranetRoutes()],
  server: { host: true, fs: { allow: [searchForWorkspaceRoot(process.cwd()), ".."] } },
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    outDir: "dist",
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), intranet: resolve(__dirname, "intranet.html") } },
  },
});
