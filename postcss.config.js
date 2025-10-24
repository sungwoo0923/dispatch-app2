<<<<<<< HEAD
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
=======
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

export default {
  plugins: [tailwindcss(), autoprefixer()],
>>>>>>> 1a3d6a049e30818b63a792ab3cb2d5f27ed480d1
};
