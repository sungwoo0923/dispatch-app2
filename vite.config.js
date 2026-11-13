import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import fs from "fs";
import { fileURLToPath } from "url";

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

const BUILD_TIME = new Date().toISOString(); // 화면 버전 확인(VersionCheck)용 — 번들과 version.json이 같은 값을 쓴다

export default defineConfig({
  // 🏢 운송사별 데이터 분리 — 앱 전체의 firebase/firestore를 src/fsTenant.js로 바꿔 끼운다
  resolve: { alias: [
    { find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL("./src/fsTenant.js", import.meta.url)) },
    { find: /^kp-firestore-base$/, replacement: "@firebase/firestore" },
  ] },
  plugins: [
    react({ jsxRuntime: "automatic" }),
    fuelApiDevMiddleware(),
    // ⚡ 2026-11-03 첫 접속 빠르게 — (1) 빌드 번호를 index.html에 심어 "새 버전 받는 중" 안내를 띄우고
    //  (2) 로그인해 둔 기기는 배차 프로그램(PC)·모바일 화면 파일을 처음부터 같이 받기 시작한다(줄줄이 기다리지 않게)
    {
      name: "kp-boot-preload",
      transformIndexHtml: {
        order: "post",
        handler(html, ctx) {
          const files = (re) => {
            const b = ctx.bundle; if (!b) return [];
            const start = Object.values(b).find((c) => c.type === "chunk" && re.test(String(c.facadeModuleId || "").replace(/\\/g, "/")));
            if (!start) return [];
            const out = new Set(); const walk = (c) => { if (!c || out.has(c.fileName)) return; out.add(c.fileName); (c.imports || []).forEach((f) => walk(b[f])); };
            walk(start);
            return [...out];
          };
          const D = files(/\/src\/DispatchApp\.jsx$/), M = files(/\/src\/mobile\/MobileApp\.jsx$/);
          const js = `window.__KP_BUILD__=${JSON.stringify(BUILD_TIME)};(function(){try{var p=location.pathname;if(!(p==="/"||p.indexOf("/app")===0||p.indexOf("/login")===0))return;if(!localStorage.getItem("userCompany"))return;var ua=navigator.userAgent.toLowerCase();var pad=(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)||ua.indexOf("ipad")>=0||ua.indexOf("tablet")>=0;var phone=!pad&&(/iphone|ipod|android(?!.*tablet)/.test(ua)||innerWidth<768);var L=phone?${JSON.stringify(M)}:${JSON.stringify(D)};L.forEach(function(f){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href="/"+f;document.head.appendChild(l);});}catch(e){}})();`;
          return [{ tag: "script", children: js, injectTo: "head-prepend" }];
        },
      },
    },
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
        // 🚦 2026-11-13 업데이트 배포 잠금 — 첫 화면(index.html)은 다시 정적 파일로 바로 준다(서버 함수를 거치지 않아 빠르다)
        //  화면이 쓸 묶음(시작 스크립트 · 스타일) 두 줄을 HTML에 직접 두지 않고, 아래 작은 스크립트가 써 넣는다:
        //   · 최고관리자 · 부관리자(쿠키 kp_ch=latest) 또는 잠금 없음 → 이 빌드의 묶음(예전과 같은 속도)
        //   · 그 밖: 이 PC에 기억된 "배포한 버전"(localStorage kpPin — src/releaseGate.js 가 적어 둔다)이 이 빌드보다 예전이면
        //     /api/shell 에서 그 버전의 첫 화면을 받아 그 버전의 묶음 두 줄을 대신 써 넣는다(그 버전 파일은 /assets 없는 파일 대리로 받는다)
        //   · 어떤 경우든 실패하면 이 빌드의 묶음으로(화면은 반드시 뜬다)
        if (fs.existsSync("./dist/index.html")) {
          let html = fs.readFileSync("./dist/index.html", "utf-8");
          const css = html.match(/[ \t]*<link rel="stylesheet"[^>]*href="\/assets\/[^"]+"[^>]*>\n?/g) || [];
          const js = html.match(/[ \t]*<script type="module"[^>]*src="\/assets\/[^"]+"[^>]*><\/script>\n?/g) || [];
          if (js.length === 1 && !html.includes('id="kp-entry"')) {
            const tags = [...css, ...js].map((t) => t.trim()).join("");
            const safe = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
            const boot = `<script id="kp-entry" type="application/json">${safe({ build: BUILD_TIME, tags })}</script>`
              + `<script>(function(){var B=${JSON.stringify(BUILD_TIME)},T=${safe(tags)};try{if(!/(?:^|;\\s*)kp_ch=latest(?:;|$)/.test(document.cookie)){var p=JSON.parse(localStorage.getItem("kpPin")||"null");if(p&&p.build&&p.build<B){var x=new XMLHttpRequest();x.open("GET","/api/shell?f=index&b="+encodeURIComponent(p.build),false);x.send();if(x.status===200&&x.getResponseHeader("X-Kp-Release")==="pinned"){var h=x.responseText,m=h.match(/<script id="kp-entry" type="application\\/json">([\\s\\S]*?)<\\/script>/),t="";if(m){t=JSON.parse(m[1]).tags}else{var a=h.match(/<link rel="stylesheet"[^>]*href="\\/assets\\/[^"]+"[^>]*>/g)||[],s=h.match(/<script type="module"[^>]*src="\\/assets\\/[^"]+"[^>]*><\\/script>/g)||[];if(s.length===1)t=a.join("")+s.join("")}if(t){T=t;window.__kpPinned=p.build}}}}}catch(e){}document.write(T)})();</script>`;
            css.forEach((t) => { html = html.replace(t, ""); });
            html = html.replace(js[0], `    ${boot}\n`);
            fs.writeFileSync("./dist/index.html", html);
            console.log("✅ index.html 시작 스크립트(배포 잠금) 적용");
          } else console.warn("⚠ index.html 시작 묶음을 찾지 못해 배포 잠금 스크립트를 넣지 않았습니다");
        }
        // ⭐ 2026-11-08 기사앱 홈 화면 추가(아이폰) — 사파리는 처음 받은 HTML의 manifest·제목을 쓰므로
        //  /driver-* 주소에는 처음부터 기사용 manifest가 박힌 driver.html을 준다(vercel.json routes)
        if (fs.existsSync("./dist/index.html")) {
          let html = fs.readFileSync("./dist/index.html", "utf-8");
          html = html.replace('href="/manifest.json"', 'href="/manifest-driver.json"')
            .replace('<meta name="apple-mobile-web-app-title" content="LogisWeb" />', '<meta name="apple-mobile-web-app-title" content="LogisWeb 기사" />');
          fs.writeFileSync("./dist/driver.html", html);
        }
        // ⭐ 접속 버전 확인용 — 화면(VersionCheck)이 이 파일과 자기 빌드 시각을 비교한다
        if (fs.existsSync("./dist")) {
          fs.writeFileSync("./dist/version.json", JSON.stringify({ version: getAppVersion(), build: BUILD_TIME, url: process.env.VERCEL_URL || "" }));
        }
      },
    },
  ],

  server: {
    host: true,
  },

  // sourcemap: true — 배포 후에도 DevTools에서 실제 파일명/변수명으로 오류를 볼 수
  // 있게 한다(지금까지는 꺼져 있어서 오류가 나도 index-xxxx.js:41:12345 같은 압축된
  // 위치만 보였다). 사용자는 다운로드하지 않는 파일이라 로딩 속도에는 영향 없음.
  build: { outDir: "dist", sourcemap: true },

  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __DEPLOY_URL__: JSON.stringify(process.env.VERCEL_URL || ""), // 🚦 이 빌드의 Vercel 배포 주소(업데이트 배포 잠금 — api/shell.js)
  },
});
