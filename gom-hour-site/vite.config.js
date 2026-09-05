import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GOM_Hour 주문페이지 — 배차관리 프로그램(dispatch-app2) 본체 및 배차마당
// (cafe-site)과도 완전히 분리된 별도의 Vite + React 프로젝트다.
// 공유하는 건 Firebase 프로젝트(Firestore)뿐이다.
export default defineConfig({
  plugins: [react({ jsxRuntime: "automatic" })],
  server: {
    host: true,
  },
  build: {
    outDir: "dist",
  },
});
