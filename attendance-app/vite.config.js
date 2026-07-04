import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { major, minor } = JSON.parse(readFileSync(join(__dirname, "version.json"), "utf8"));

export default defineConfig({
  // Stamped into the bundle at build time so the running app can show which
  // build is live (Login footer, admin sidebar, employee 내정보) — the only
  // reliable way to tell "did my deploy actually go out" apart from guessing.
  // __APP_VERSION__ comes from version.json, bumped by the "prebuild" npm
  // hook (scripts/bump-version.cjs) on every `npm run build`.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __APP_VERSION__: JSON.stringify(`v${major}.${minor}`),
  },
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
