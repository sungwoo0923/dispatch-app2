/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        secondary: "#f9fafb",
        accent: "#111827",
      },
      fontFamily: {
        sans: ["Inter", "Pretendard", "sans-serif"],
      },
    },
  },
  plugins: [],
};
