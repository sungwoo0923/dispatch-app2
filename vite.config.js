import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// import { VitePWA } from "vite-plugin-pwa"; // 🔥 일시 비활성화

export default defineConfig({
  plugins: [
    react(),
    // PWA는 잠시 비활성화
  ],

  server: {
    host: true,
    historyApiFallback: true,
  },

  build: {
    outDir: "dist",
  },
});
