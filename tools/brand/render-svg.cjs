// ======================= tools/brand/render-svg.cjs =======================
// 🔷 SVG → PNG 그리기 도우미(make-logo-assets.py 가 부른다) — 컨테이너에 깔린 Chromium(Playwright)으로 그린다
//  사용: node tools/brand/render-svg.cjs jobs.json
//  jobs.json = [{ "svg": "<svg ...>", "out": "절대 경로.png", "w": 512, "h": 512 }]  · 바탕 없는 곳은 투명으로 남는다
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${j.svg}</body></html>`);
    fs.mkdirSync(path.dirname(j.out), { recursive: true });
    await page.screenshot({ path: j.out, omitBackground: true, clip: { x: 0, y: 0, width: j.w, height: j.h } });
  }
  await browser.close();
  console.log(`render-svg: ${jobs.length}장`);
})().catch((e) => { console.error(e); process.exit(1); });
