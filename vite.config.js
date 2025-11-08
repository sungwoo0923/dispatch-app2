import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "icons/icon-192x192.png",
        "icons/icon-512x512.png",
        "icons/icon-512x512-maskable.png"
      ],
      manifest: {
        name: "RUN25(S.W) 배차시스템",
        short_name: "RUN25",
        description: "RUN25 물류 배차/정산/운송 관리 시스템",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/icon-512x512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable any"
          }
        ]
      },
      devOptions: {
        enabled: true
      },
      workbox: {
        navigateFallback: "/index.html"
      },
      injectRegister: "auto" // ✅ 서비스워커 자동 등록
    })
  ],
  build: {
    outDir: "dist"
  }
});
