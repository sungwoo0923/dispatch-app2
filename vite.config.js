import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),

    // ✅ PWA는 유지하되, Service Worker는 직접 관리
    VitePWA({
      // ❌ 자동 등록 완전 차단
      registerType: "prompt",
      injectRegister: false,

      // ❌ Workbox가 SW 생성하지 않게
      strategies: "injectManifest",
      srcDir: "public",
      filename: "sw.js",

      // ❌ 개발 서버에서 PWA SW 생성 금지
      devOptions: {
        enabled: false,
      },

      includeAssets: [
        "favicon.ico",
        "icons/icon-192x192.png",
        "icons/icon-512x512.png",
        "icons/icon-512x512-maskable.png",
      ],

      manifest: {
        name: "RUN25(S.W) 배차시스템",
        short_name: "RUN25",
        description: "RUN25 물류 배차/정산/운송 관리 시스템",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],

  server: {
    host: true,
    historyApiFallback: true,

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

  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || "local"
    ),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
