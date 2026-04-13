import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],

  server: {
    host: true,

    proxy: {
      "/api/fuel": {
        target: "https://www.opinet.co.kr",
        changeOrigin: true,
        secure: false,
        rewrite: (path) =>
          path.replace(
            /^\/api\/fuel/,
            "/api/avgAllPrice.do"
          ),
      },
    },
  },

  build: {
    outDir: "dist",
  },

  define: {
    // 🔥 핵심 (버전 자동)
    __APP_VERSION__: JSON.stringify(pkg.version),

    // 🔥 빌드 시간 (유지)
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});