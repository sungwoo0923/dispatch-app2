// 유튜브 썸네일(1280×720) 만들기: node tools/thumbs.mjs → out/thumb-*.jpg
import { createRequire } from "node:module"; import path from "node:path"; import url from "node:url";
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const T = {
  trailer: { k: "운송사 통합 TMS", t: '배차부터 정산까지<br><span class="hl">한 화면에서</span>', img: "real-board.jpg", lab: "LogisWeb · 실시간배차현황" },
  "shorts-1": { k: "배차 실무 꿀팁", t: '카톡 오더<br><span class="hl">붙여넣기 1번</span><br>등록 끝', img: "real-scan.jpg", lab: "LogisWeb · 오더 스캔" },
  "shorts-2": { k: "지입차 관제", t: '"기사님 어디세요?"<br><span class="hl">전화 그만</span>', img: "real-livemap.jpg", lab: "LogisWeb · 실시간 위치" },
  "shorts-3": { k: "월말 정산", t: '월말 엑셀 정산<br><span class="hl">이제 그만</span>', img: "real-settle.jpg", lab: "LogisWeb · 지입정산" },
};
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
for (const [k, v] of Object.entries(T)) {
  await p.goto("about:blank"); await p.goto(url.pathToFileURL(path.join(ROOT, "scenes/thumbs.html")).href + "#" + encodeURIComponent(JSON.stringify(v)));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(ROOT, "out", `thumb-${k}.jpg`), type: "jpeg", quality: 92 });
}
await b.close(); console.log("썸네일 완료");
