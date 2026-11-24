// marketing/edu/gen-images.mjs — 안전교육 영상 그림 만들기(Gemini 이미지 · 글자 없는 3D 그림)
//  node marketing/edu/gen-images.mjs            → 없는 그림만 만든다(images/<이름>.jpg)
//  node marketing/edu/gen-images.mjs l_cover    → 그 그림만 다시
import fs from "node:fs"; import path from "node:path"; import url from "node:url";
import { IMAGES, STYLE } from "./scripts.mjs";
const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const DIR = path.join(ROOT, "images"); fs.mkdirSync(DIR, { recursive: true });
const only = process.argv.slice(2);
const MODELS = ["gemini-3-pro-image", "gemini-3.1-flash-image"];
async function gen(name, prompt) {
  const body = JSON.stringify({ contents: [{ parts: [{ text: `${prompt} ${STYLE}` }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } } });
  for (const m of MODELS) for (let a = 0; a < 3; a++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (r.ok) {
      const p = (await r.json())?.candidates?.[0]?.content?.parts?.find((x) => x.inlineData);
      if (p) { fs.writeFileSync(path.join(DIR, `${name}.jpg`), Buffer.from(p.inlineData.data, "base64")); return m; }
    } else { const t = await r.text(); console.error(`\n${name} ${m} ${r.status} ${t.slice(0, 120)}`); if (r.status !== 429 && r.status < 500) break; }
    await new Promise((z) => setTimeout(z, 5000 * (a + 1)));
  }
  throw new Error("그림 실패: " + name);
}
const names = Object.keys(IMAGES).filter((n) => (only.length ? only.includes(n) : !fs.existsSync(path.join(DIR, `${n}.jpg`))));
let i = 0;
const work = async () => { while (names.length) { const n = names.shift(); try { const m = await gen(n, IMAGES[n]); console.log(`${++i} ${n} (${m})`); } catch (e) { console.log(`실패 ${n}: ${e.message}`); } } };
await Promise.all([work(), work(), work()]);
