import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(), // ✅ PWA 플러그인 제거
  ],

  server: {
    host: true,
    historyApiFallback: true,

    // ⭐ 오피넷 Proxy 유지
    proxy: {
      "/api/fuel": {
        target: "https://www.opinet.co.kr",
        changeOrigin: true,
        secure: false,
        rewrite: (path) =>
          path.replace(/^\/api\/fuel/, "/api/avgAllPrice.do"),
      },
    },
  },

  build: {
    outDir: "dist",
  },

  // ⭐️ 배포 버전 / 빌드 시간 자동 주입 (유지)
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || "local"
    ),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
