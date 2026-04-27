import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import fs from "fs";

const getAppVersion = () => {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const count = parseInt(
      execSync("git rev-list --count HEAD").toString().trim(),
      10
    );
    if (count > 60) return "v3";
    if (count > 30) return "v2";
    return "v1";
  } catch {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA || "";
    return sha ? `v${sha.slice(0, 7)}` : "v1";
  }
};

export default defineConfig({
  plugins: [
    react({ jsxRuntime: "automatic" }),
    {
      name: "update-sw-version",
      closeBundle() {
        const swPath = "./dist/sw.js";
        if (fs.existsSync(swPath)) {
          let content = fs.readFileSync(swPath, "utf-8");
          const buildId = new Date().toISOString().replace(/[:.]/g, "-");
          content = content.replace(
            /const VERSION = "[^"]*"/,
            `const VERSION = "${buildId}"`
          );
          fs.writeFileSync(swPath, content);
          console.log("✅ sw.js VERSION updated:", buildId);
        }
      },
    },
  ],

  server: {
    host: true,
    proxy: {
      "/api/fuel": {
        target: "https://www.opinet.co.kr",
        changeOrigin: true,
        secure: false,
        rewrite: (path) =>
          path.replace(/^\/api\/fuel/, "/api/avgAllPrice.do"),
      },
    },
  },

  build: { outDir: "dist" },

  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
