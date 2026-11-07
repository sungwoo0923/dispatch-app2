/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    // ⭐ 2026-11-06 허브가 배차 프로그램의 오더 스캔 창(../src/OrderScanModal.jsx)을 그대로 쓴다 — 그 화면의 클래스도 만든다
    "../src/OrderScanModal.jsx",
    // 🏛 2026-11-07 국세청 사업자 상태 · 기상청 날씨 배지(배차 프로그램과 같은 화면 조각)
    "../src/BizStatusBadge.jsx",
    "../src/WeatherBadge.jsx",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1B2B4B",
        secondary: "#f4f6fa",
      },
      fontFamily: {
        sans: ["Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
