import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: false, // manifest.json is hand-authored in public/
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
      },
    }),
  ],
  server: {
    host: true,
    port: 5183,
  },
  optimizeDeps: {
    exclude: ["@capacitor-community/background-geolocation"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      // Native-only Capacitor plugin: only ever imported dynamically inside a
      // `Capacitor.isNativePlatform()` guard, so it must not be bundled into
      // the web/PWA build (it has no browser entry point).
      external: ["@capacitor-community/background-geolocation"],
    },
  },
});
