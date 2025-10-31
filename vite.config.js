import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    base: '/betterlogistics-dispatch/',  // 👈 이 줄 추가 (저장소 이름과 동일해야 함)
    postcss: "./postcss.config.js", // ✅ 이 설정이 핵심
  },
});
