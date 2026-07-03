/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2563EB",
          dark: "#1D4ED8",
          light: "#DBEAFE",
        },
        surface: "#F8FAFC",
        // Kept as semantic names for readability at call sites, but mapped to
        // the blue/white/gray palette — only `danger` stays a true accent
        // color, reserved for destructive actions and critical alerts.
        success: "#1D4ED8",
        warning: "#475569",
        danger: "#DC2626",
        ink: "#1E293B",
        muted: "#64748B",
      },
      fontFamily: {
        sans: ["Pretendard", "Noto Sans KR", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
