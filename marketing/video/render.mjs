// 사용: node render.mjs shorts-1 [--fps 30] [--from 0 --to 5 (일부만 미리)] [--still 12 (한 장만 png)]
// scenes/<이름>.html 을 한 프레임씩 찍어 out/<이름>.mp4 로 만들고 나레이션 + 배경음악을 섞어요.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // 전역 설치된 playwright도 찾도록
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import url from "node:url";
const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const name = process.argv[2]; const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const narr = JSON.parse(fs.readFileSync(path.join(ROOT, "narration.json"), "utf8"))[name];
const durs = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/durations.json"), "utf8"));
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto(url.pathToFileURL(path.join(ROOT, "scenes", name + ".html")).href);
const S = await page.evaluate(() => window.SCENE);
await page.setViewportSize({ width: S.w, height: S.h });
const caps = (S.voice || []).map((t0, i) => {
  const id = `${name}-${String(i + 1).padStart(2, "0")}`;
  return { t0, t1: t0 + (durs[id] || 2), text: (S.caps && S.caps[i]) || narr.lines[i], wav: path.join(ROOT, "audio", id + ".flac") };
});
await page.evaluate((c) => { window.__CAPS = c; }, caps.map(({ t0, t1, text }) => ({ t0, t1, text })));
await page.evaluate(() => window.__ready());
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
if (arg("still")) {
  for (const dt of [0.5, 0.2, 0]) { await page.evaluate((t) => window.__seek(t), +arg("still") - dt); await page.waitForTimeout(150); }
  const f = path.join(ROOT, "out", `${name}-at${arg("still")}.png`); await page.screenshot({ path: f }); console.log(f); await browser.close(); process.exit(0);
}
const fps = +arg("fps", S.fps || 30), from = +arg("from", 0), to = +arg("to", S.duration);
const silent = path.join(ROOT, "out", `.${name}-video.mp4`);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), silent], { stdio: ["pipe", "inherit", "inherit"] });
const n = Math.round((to - from) * fps); const T = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.__seek(t), from + i / fps);
  const buf = await page.screenshot({ type: "jpeg", quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % fps === 0) process.stdout.write(`\r${name} ${(i / fps).toFixed(0)}s / ${(n / fps).toFixed(0)}s  (${((Date.now() - T) / 1000).toFixed(0)}초 경과)`);
}
ff.stdin.end(); await new Promise((r) => ff.on("close", r)); await browser.close();
// 소리 섞기: 나레이션(제자리에) + 배경음악(말할 때 자동으로 작아짐)
const inputs = ["-i", silent]; const parts = []; let k = 1;
const vs = caps.filter((c) => c.t0 >= from && c.t0 < to && fs.existsSync(c.wav));
for (const c of vs) { inputs.push("-i", c.wav); const ms = Math.round((c.t0 - from) * 1000); parts.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${S.voiceVol || 1.6}[v${k}]`); k++; }
const music = S.music && path.join(ROOT, "audio", S.music);
// 배경음악 파일은 저장소에 안 올려요(용량). 없으면 똑같이 다시 합성해요.
const GEN = { "music-upbeat.wav": [["upbeat", "66", "112", "upbeat"], {}], "music-trailer.wav": [["trailer", "70", "92", "cinematic"], { DROP: "32.4", HITS: "8.5,19.6" }] };
if (music && !fs.existsSync(music) && GEN[S.music]) execFileSync("python3", [path.join(ROOT, "tools/music.py"), ...GEN[S.music][0]], { stdio: "inherit", env: { ...process.env, ...GEN[S.music][1] } });
let filter, map;
const vmix = vs.length ? `${vs.map((_, i) => `[v${i + 1}]`).join("")}amix=inputs=${vs.length}:normalize=0:duration=longest,apad[vo]` : "anullsrc=r=48000:cl=stereo[vo]";
if (music && fs.existsSync(music)) {
  inputs.push("-ss", String(from), "-i", music);
  filter = [...parts, vmix, `[vo]asplit=2[vo1][vo2]`, `[${k}:a]volume=${S.musicVol || 0.5}[m]`, `[m][vo1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[md]`, `[md][vo2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`].join(";");
} else filter = [...parts, vmix, `[vo]alimiter=limit=0.95[a]`].join(";");
const outF = path.join(ROOT, "out", from === 0 && to === S.duration ? `${name}.mp4` : `${name}-part.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(to - from), "-movflags", "+faststart", outF], { stdio: "inherit" });
fs.unlinkSync(silent);
console.log(`\n완료 → ${outF}`);
