/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 흰색 + 아이보리/베이지 톤 하나로만 구성 (알록달록한 원색 사용 금지)
        primary: "#8A6F52", // 강조 텍스트·버튼(딥 베이지)
        secondary: "#FAF6EF", // 페이지 배경(아이보리)
        cream: "#F3ECDF", // 공지 배너 등 옅은 배경
        line: "#E7DCC9", // 카드/입력창 테두리
      },
      fontFamily: {
        sans: ["Pretendard", "Noto Sans KR", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
