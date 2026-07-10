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
      // "prompt" (not "autoUpdate") so a deployed update waits for the user
      // to click the UpdateBanner's "업데이트" button instead of silently
      // self-reloading in the background. We register the SW ourselves via
      // `virtual:pwa-register` (see src/hooks/useAppUpdate.js) so we can
      // drive that banner — the default auto-injected script has no hook
      // for it, so a deployed update was invisible until the user manually
      // closed and reopened the app.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: false, // manifest.json is hand-authored in public/
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        // 기본 2MiB 한도를 넘는 메인 번들도 오프라인 캐시에 포함시킨다 —
        // 기능이 늘면서 자연스럽게 커진 크기고, code-splitting은 별도 과제.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
