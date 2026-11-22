// 사용: node marketing/blog/scripts/render-cards.mjs [글폴더 ...]  (없으면 이미지가 없는 글 전부)
// 각 글 폴더의 cards.json → card-1.jpg, card-2.jpg ... (1080×1080, 네이버 · 인스타 공용)
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import url from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const tpl = url.pathToFileURL(path.join(ROOT, "templates/card.html")).href;
let dirs = process.argv.slice(2).map((d) => path.resolve(d));
if (!dirs.length) dirs = fs.readdirSync(path.join(ROOT, "posts")).map((d) => path.join(ROOT, "posts", d)).filter((d) => fs.existsSync(path.join(d, "cards.json")) && !fs.existsSync(path.join(d, "card-1.jpg")));
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
for (const d of dirs) {
  const cards = JSON.parse(fs.readFileSync(path.join(d, "cards.json"), "utf8"));
  for (let i = 0; i < cards.length; i++) {
    await page.goto("about:blank");
    await page.goto(tpl + "#" + encodeURIComponent(JSON.stringify(cards[i])));
    await page.evaluate(() => window.__done);
    await page.screenshot({ path: path.join(d, `card-${i + 1}.jpg`), type: "jpeg", quality: 90 });
  }
  console.log("카드", cards.length, "장 →", path.relative(process.cwd(), d));
}
await browser.close();
