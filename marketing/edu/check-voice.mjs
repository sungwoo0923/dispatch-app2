// marketing/edu/check-voice.mjs — 나레이션 점검: 줄마다 길이 · 말 빠르기(글자/초)를 보고 이상한 줄을 찾는다
//  node marketing/edu/check-voice.mjs [교육id]   (만들어 둔 .cache 음성만 본다 — 새로 만들지 않는다)
import fs from "node:fs"; import path from "node:path"; import url from "node:url"; import crypto from "node:crypto";
import { COURSES } from "./scripts.mjs";
const ROOT = path.dirname(url.fileURLToPath(import.meta.url)); const CACHE = path.join(ROOT, ".cache");
const ids = process.argv[2] ? [process.argv[2]] : Object.keys(COURSES);
for (const id of ids) {
  const ls = COURSES[id].slides.flatMap((s) => s.lines);
  let have = 0, bad = [];
  for (const l of ls) {
    const f = path.join(CACHE, crypto.createHash("sha1").update("Kore|" + l.say).digest("hex").slice(0, 16) + ".pcm");
    if (!fs.existsSync(f)) continue; have++;
    const pcm = fs.readFileSync(f); const dur = pcm.length / 2 / 24000;
    const chars = l.say.replace(/[\s,.]/g, "").length; const cps = chars / dur;
    // 소리 크기(조용한 줄 · 끊긴 줄 찾기)
    let peak = 0; for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    if (cps < 3.2 || cps > 8.5 || peak < 3000 || dur < 0.8) bad.push(`${dur.toFixed(1)}초 ${cps.toFixed(1)}자/초 peak ${peak} · ${l.say}`);
  }
  console.log(`${id}: 음성 ${have}/${ls.length}줄 · 이상 ${bad.length}줄`); bad.forEach((b) => console.log("  ⚠ " + b));
}
