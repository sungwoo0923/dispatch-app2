import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 배차마당(cafe-site) — 운송 프로그램(dispatch-app2) 본체와는 완전히 분리된
// 별도의 Vite + React 프로젝트다. 빌드/배포 파이프라인을 공유하지 않는다.
export default defineConfig({
  plugins: [react({ jsxRuntime: "automatic" })],
  server: {
    host: true,
  },
  build: {
    outDir: "dist",
  },
});
