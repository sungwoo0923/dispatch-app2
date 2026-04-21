import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({
    jsxRuntime: "automatic",
  })],

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
    __APP_VERSION__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || "local"
    ),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});