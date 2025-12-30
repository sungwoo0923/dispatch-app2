import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // Firebase FCM 서비스워커 포함
      srcDir: "public",
      filename: "firebase-messaging-sw.js",
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 🔥 10MB까지 허용
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

      // ⭐ 개발 시에도 PWA 활성화 (필수)
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],

  server: {
    host: true,
    historyApiFallback: true,

    // ⭐⭐ 오피넷 Proxy 설정 추가 ⭐⭐
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

  // ⭐️ 배포 버전 / 빌드 시간 자동 주입 ⭐️ (App.jsx에서 사용)
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || "local"
    ),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
