// marketing/edu/build.mjs — 안전교육 영상 만들기(2026-11-24)
//  node marketing/edu/build.mjs drv_load            → public/edu/drv_load.mp4
//  node marketing/edu/build.mjs drv_load --still 20 → marketing/edu/.cache/drv_load-at20.png(한 장 미리보기)
//  나레이션: Gemini TTS(목소리 Kore) — .cache/<교육>-<줄>.pcm 에 저장해 두고 다시 쓴다(대본을 고친 줄만 새로 만든다)
//  화면: 자막 = 읽는 말 그대로 · 오른쪽 요점은 그 말이 나올 때 하나씩 · 왼쪽 그림은 arts.mjs
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import url from "node:url"; import crypto from "node:crypto";
import { COURSES } from "./scripts.mjs";
import { ARTS } from "./arts.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const CACHE = path.join(ROOT, ".cache"); fs.mkdirSync(CACHE, { recursive: true });
const id = process.argv[2]; const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const C = COURSES[id]; if (!C) { console.error("교육 id:", Object.keys(COURSES).join(", ")); process.exit(1); }
const RATE = 24000, VOICE = arg("voice", "Kore");

// ── 1. 나레이션
async function tts(text) {
  const h = crypto.createHash("sha1").update(VOICE + "|" + text).digest("hex").slice(0, 16);
  const f = path.join(CACHE, `${h}.pcm`);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const body = JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } });
  for (const m of ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"]) {
    for (let a = 0; a < 4; a++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (r.ok) {
        const d = (await r.json())?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
        if (!d) break;
        let pcm = Buffer.from(d, "base64"); if (pcm.subarray(0, 4).toString() === "RIFF") pcm = pcm.subarray(44);
        const n = pcm.length >> 1; let s = 0, e = n - 1;
        while (s < n && Math.abs(pcm.readInt16LE(s * 2)) < 600) s++; while (e > s && Math.abs(pcm.readInt16LE(e * 2)) < 600) e--;
        pcm = Buffer.from(pcm.subarray(Math.max(0, s - 1200) * 2, (Math.min(n - 1, e + 2400) + 1) * 2));
        fs.writeFileSync(f, pcm); return pcm;
      }
      const t = await r.text(); console.error(`\n${m} ${r.status} ${t.slice(0, 160)}`);
      if (r.status === 429 || r.status >= 500) await new Promise((z) => setTimeout(z, 6000 * (a + 1))); else break;
    }
  }
  throw new Error("음성을 만들지 못했어요: " + text);
}
const lines = C.slides.flatMap((s, si) => s.lines.map((l, li) => ({ ...l, si, li })));
let k = 0;
for (const l of lines) { l.pcm = await tts(l.say); l.dur = l.pcm.length / 2 / RATE; process.stdout.write(`\r나레이션 ${++k}/${lines.length}`); }
console.log();

// ── 2. 시간표(장면 시작 0.7초 뒤 첫 말 · 말 사이 0.5초 · 장면 끝 1.1초)
let t = 0; const slides = C.slides.map((s, si) => {
  const t0 = t; let c = t0 + 0.8;
  const ls = lines.filter((l) => l.si === si); ls.forEach((l) => { l.t0 = c; l.t1 = c + l.dur; c = l.t1 + 0.5; });
  t = c + 0.7; return { ...s, t0, t1: t, ls };
});
const DUR = t + 0.6;

// ── 3. 화면(HTML)
const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1280px;height:720px;overflow:hidden;position:relative;background:#F6F8FB;font-family:"Noto Sans KR",sans-serif;color:#0B1428;letter-spacing:-0.02em;word-break:keep-all}
.top{position:absolute;left:0;right:0;top:0;height:64px;display:flex;align-items:center;gap:14px;padding:0 44px;background:#fff;border-bottom:1px solid #E3E8F0}
.chip{height:32px;padding:0 14px;border-radius:999px;background:#1B2B4B;color:#fff;font-weight:900;font-size:15px;display:flex;align-items:center;gap:6px}
.ttl{font-weight:900;font-size:19px}
.pg{margin-left:auto;font-weight:700;font-size:15px;color:#6B7A93}
.bar{position:absolute;left:0;top:64px;height:4px;background:#1B2B4B}
.slide{position:absolute;left:0;right:0;top:64px;bottom:0}
.art{position:absolute;left:44px;top:46px;width:600px;height:420px;border-radius:24px;background:#fff;border:1px solid #E3E8F0;display:flex;align-items:center;justify-content:center;padding:10px}
.head{position:absolute;left:690px;right:44px;top:52px;font-size:36px;font-weight:900;line-height:1.25}
.pts{position:absolute;left:690px;right:44px;top:150px;display:flex;flex-direction:column;gap:14px}
.pt{display:flex;gap:12px;align-items:flex-start;font-size:23px;font-weight:700;line-height:1.38;background:#fff;border:1px solid #E3E8F0;border-radius:16px;padding:14px 18px}
.pt i{flex:none;width:28px;height:28px;border-radius:50%;background:#1B2B4B;color:#fff;font-style:normal;font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:2px}
.cover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
#cap{position:absolute;left:0;right:0;margin:0 auto;width:fit-content;bottom:26px;max-width:1180px;padding:12px 28px;border-radius:14px;background:rgba(11,20,40,.88);color:#fff;font-size:31px;font-weight:700;line-height:1.4;text-align:center}
</style></head><body>
<div class="top"><span class="chip">🦺 안전교육</span><span class="ttl">${esc(C.title)}</span><span class="pg" id="pg"></span></div>
${slides.map((s, i) => `<section class="slide" data-in="${s.t0.toFixed(2)}" data-out="${(s.t1 - 0.05).toFixed(2)}" data-a="fade" data-d="0.35">
  ${i === 0 ? `<div class="art" style="left:390px;width:500px;height:350px;top:130px" data-in="${(s.t0 + 0.1).toFixed(2)}" data-a="up" data-dist="30">${ARTS[s.art]()}</div>
  <div style="position:absolute;left:0;right:0;top:38px;text-align:center;font-size:44px;font-weight:900" data-in="${s.t0.toFixed(2)}" data-a="up" data-dist="20">${esc(s.head)}</div>`
  : `<div class="art" data-in="${(s.t0 + 0.1).toFixed(2)}" data-a="up" data-dist="24">${ARTS[s.art]()}</div>
  <div class="head" data-in="${(s.t0 + 0.05).toFixed(2)}" data-a="up" data-dist="16">${esc(s.head)}</div>
  <div class="pts">${s.ls.filter((l) => l.pt).map((l, j) => `<div class="pt" data-in="${l.t0.toFixed(2)}" data-a="left" data-dist="16" data-d="0.4"><i>${j + 1}</i><span>${esc(l.pt)}</span></div>`).join("")}</div>`}
</section>`).join("\n")}
<div class="bar" id="bar"></div>
<div id="cap"></div>
<script>
window.SCENE={duration:${DUR.toFixed(2)},slides:${JSON.stringify(slides.map((s) => [s.t0, s.t1]))}};
window.__CAPS=${JSON.stringify(lines.map((l) => ({ t0: l.t0, t1: l.t1, text: l.say })))};
</script>
<script src="${url.pathToFileURL(path.join(ROOT, "../video/engine.js")).href}"></script>
<script>
const _seek=window.__seek;window.__seek=async(t)=>{await _seek(t);const S=window.SCENE.slides;const i=Math.max(0,S.findIndex(([a,b])=>t>=a&&t<b));document.getElementById("pg").textContent=(i+1)+" / "+S.length;document.getElementById("bar").style.width=(Math.min(1,t/window.SCENE.duration)*100)+"%";};
</script></body></html>`;
const page0 = path.join(CACHE, `${id}.html`); fs.writeFileSync(page0, html);

// ── 4. 찍기
const browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url.pathToFileURL(page0).href, { waitUntil: "networkidle" });
await page.evaluate(() => window.__ready());
if (arg("sheet")) { // 장면마다 한 장씩(끝나기 1초 전)
  const files = [];
  for (const [i, s] of slides.entries()) { const at = s.t1 - 1.2; await page.evaluate((x) => window.__seek(x), at - 0.6); await page.evaluate((x) => window.__seek(x), at); const f = path.join(CACHE, `${id}-s${String(i + 1).padStart(2, "0")}.png`); await page.screenshot({ path: f }); files.push(f); }
  console.log(files.join("\n"), `\n영상 길이 ${DUR.toFixed(1)}초`); await browser.close(); process.exit(0);
}
if (arg("still")) {
  const at = +arg("still"); await page.evaluate((x) => window.__seek(x), at - 0.6); await page.evaluate((x) => window.__seek(x), at);
  const f = path.join(CACHE, `${id}-at${at}.png`); await page.screenshot({ path: f }); console.log(f, `영상 길이 ${DUR.toFixed(1)}초`); await browser.close(); process.exit(0);
}
// 소리 한 줄로 이어 붙이기
const total = Math.ceil(DUR * RATE); const audio = Buffer.alloc(total * 2);
for (const l of lines) l.pcm.copy(audio, Math.round(l.t0 * RATE) * 2, 0, Math.min(l.pcm.length, (total - Math.round(l.t0 * RATE)) * 2));
const wav = path.join(CACHE, `${id}.pcm`); fs.writeFileSync(wav, audio);
const outDir = path.join(ROOT, "../../public/edu"); fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${id}.mp4`); // 아이폰 · 안드로이드 · PC 모두 재생되는 H.264 + AAC
const fps = +arg("fps", 20);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", wav,
  "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "64k", "-shortest", out], { stdio: ["pipe", "inherit", "inherit"] });
const n = Math.round(DUR * fps); const T = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate((x) => window.__seek(x), i / fps);
  const buf = await page.screenshot({ type: "jpeg", quality: 90 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % (fps * 5) === 0) process.stdout.write(`\r${id} ${(i / fps).toFixed(0)}s / ${DUR.toFixed(0)}s (${((Date.now() - T) / 1000).toFixed(0)}초)`);
}
ff.stdin.end(); await new Promise((r) => ff.on("close", r)); await browser.close();
console.log(`\n${out}  ${(fs.statSync(out).size / 1048576).toFixed(1)}MB · ${DUR.toFixed(1)}초`);
