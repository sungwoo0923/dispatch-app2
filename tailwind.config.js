<<<<<<< HEAD
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
=======
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
>>>>>>> 1a3d6a049e30818b63a792ab3cb2d5f27ed480d1
}
