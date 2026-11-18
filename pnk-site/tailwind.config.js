/** @type {import('tailwindcss').Config} */
// 🎨 2026-11-18 공식 홈페이지(public/pk/home.css)와 같은 톤 — 차콜 · 스톤 · 토프(이름은 예전대로 navy 를 쓴다, 화면 코드를 덜 바꾸려고) — ⭐ 알록달록 금지
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}", "../src/CustomDatePicker.jsx", "../src/CustomSelect.jsx", "../src/kpTimePick.jsx", "../src/kpInputs.jsx"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#2A2723", 950: "#1F1D1A", 900: "#1C1A17", 800: "#2A2723", 700: "#3A3631", 600: "#6B655C", 500: "#8B7A64", 100: "#F1EDE6", 50: "#F7F5F1" },
        gold: { DEFAULT: "#B59B74", hi: "#D8C3A0", deep: "#8B7A64" },
        line: "#E6E1D9",
      },
      fontFamily: { serif: ["Cormorant Garamond", "Times New Roman", "serif"], sans: ["Pretendard Variable", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
