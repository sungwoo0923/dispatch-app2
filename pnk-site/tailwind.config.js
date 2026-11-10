/** @type {import('tailwindcss').Config} */
// 색은 로지스웹 관리 화면(src/AdminShell.jsx · PlatformCenter.jsx)과 같은 네이비 — ⭐ 알록달록 금지
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}", "../src/CustomDatePicker.jsx", "../src/CustomSelect.jsx", "../src/kpTimePick.jsx", "../src/kpInputs.jsx"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#1B2B4B", 950: "#0F1A30", 900: "#14213D", 800: "#1B2B4B", 700: "#233B66", 600: "#2D4C82", 500: "#4B6CB7", 100: "#EEF3FB", 50: "#F4F6FA" },
        line: "#E3E8F0",
      },
      fontFamily: { sans: ["Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
