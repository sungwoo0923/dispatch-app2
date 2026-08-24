import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import fs from "fs";

const getAppVersion = () => {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
    return pkg.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
};

// 개발 서버(vite dev)에서 /api/fuel을 처리하는 미들웨어.
// 기존에는 server.proxy로 opinet.co.kr에 그대로 경로만 바꿔 넘겼는데, 그 방식은
// out=json / code(발급키) 쿼리파라미터가 빠진 채 요청이 나가 opinet이 JSON이 아닌
// 응답(또는 에러)을 돌려주고, 프런트의 res.json() 파싱이 실패해 항상 "유가 정보
// 없음"으로 표시되는 원인이었다. api/fuel.js(Vercel) · functions/index.js(Firebase)
// 와 동일한 로직(여러 endpoint 순차 시도 + 최종 하드코딩 폴백)을 그대로 재현해
// 배포 환경과 로컬 개발 환경의 동작을 일치시킨다.
function fuelApiDevMiddleware() {
  return {
    name: "fuel-api-dev-middleware",
    configureServer(server) {
      server.middlewares.use("/api/fuel", async (req, res) => {
        const area = new URL(req.url, "http://localhost").searchParams.get("area") || "01";
        const key = "F251130200";
        const endpoints = [
          `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}&area=${area}`,
          `https://www.opinet.co.kr/api/avgSidoPrice.do?out=json&code=${key}`,
          `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${key}`,
        ];
        for (const url of endpoints) {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 2500);
            const response = await fetch(url, { signal: ctrl.signal });
            clearTimeout(tid);
            if (!response.ok) continue;
            const text = await response.text();
            let data;
            try { data = JSON.parse(text); } catch { continue; }
            const oil = data?.RESULT?.OIL;
            if (Array.isArray(oil) && oil.length > 0) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return;
            }
          } catch { /* try next endpoint */ }
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          RESULT: {
            OIL: [
              { PRODNM: "고급휘발유", PRICE: 2020, DIFF: 0 },
              { PRODNM: "휘발유", PRICE: 1748, DIFF: 0 },
              { PRODNM: "경유", PRICE: 1623, DIFF: 0 },
              { PRODNM: "LPG(부탄)", PRICE: 986, DIFF: 0 },
            ],
          },
          _fallback: true,
        }));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react({ jsxRuntime: "automatic" }),
    fuelApiDevMiddleware(),
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
    // ⭐ KP-Planner를 별도 Vercel 프로젝트(VITE_PLANNER_SITE=1 환경변수)로 배포할
    // 때, 그 프로젝트의 빌드 결과물만 manifest.json/파비콘/설치 아이콘/링크
    // 미리보기(OG) 태그를 KP-Planner용으로 바꿔치기한다. 배차프로그램 프로젝트는
    // 이 환경변수가 없으니 dist 결과물이 지금처럼 그대로 나간다.
    {
      name: "planner-site-branding",
      closeBundle() {
        if (process.env.VITE_PLANNER_SITE !== "1") return;
        const manifestSrc = "./public/manifest-planner.json";
        const manifestDst = "./dist/manifest.json";
        if (fs.existsSync(manifestSrc)) {
          fs.copyFileSync(manifestSrc, manifestDst);
        }
        const htmlPath = "./dist/index.html";
        if (fs.existsSync(htmlPath)) {
          let html = fs.readFileSync(htmlPath, "utf-8");
          html = html
            .replace(/<title>KP-Flow Logistics<\/title>/, "<title>KP-Planner</title>")
            .replace(/content="KP-Flow Logistics"/g, 'content="KP-Planner"')
            .replace(/content="\/icons\/sflow-icon\.png"/, 'content="/icons/kp-planner-icon-512.png"')
            .replace(/content="KP-Flow"/, 'content="KP-Planner"')
            .replace(/href="\/icons\/sflow-icon\.png"/g, 'href="/icons/kp-planner-icon-192.png"');
          fs.writeFileSync(htmlPath, html);
          console.log("✅ KP-Planner 브랜딩(title/manifest/아이콘/OG) 적용됨");
        }
      },
    },
  ],

  server: {
    host: true,
  },

  build: { outDir: "dist" },

  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
