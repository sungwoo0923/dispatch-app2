// marketing/edu/check-audio.mjs — 완성 영상 소리를 AI 가 듣고 대본과 비교(빠진 말 · 틀린 발음 · 이상한 소리 · 목소리 바뀜)
//  node marketing/edu/check-audio.mjs drv_load   (public/edu/<id>.mp4 필요)
import fs from "node:fs"; import path from "node:path"; import url from "node:url"; import { execFileSync } from "node:child_process";
import { COURSES } from "./scripts.mjs";
const ROOT = path.dirname(url.fileURLToPath(import.meta.url)); const id = process.argv[2];
const mp4 = path.join(ROOT, "../../public/edu", `${id}.mp4`); const mp3 = path.join(ROOT, ".cache", `${id}-check.mp3`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", mp3]);
const script = COURSES[id].slides.flatMap((s) => s.lines.map((l) => l.say));
const prompt = `다음은 한국어 안전교육 영상의 나레이션 소리야. 아래 [대본]과 비교해서 JSON 으로만 답해.
{"transcript":"들린 그대로 전체 받아쓰기","missing":["대본에 있는데 안 들린 문장"],"mismatch":[{"script":"대본 문장","heard":"실제로 들린 말"}],"issues":["발음이 뭉개짐 · 잡음 · 끊김 · 말 속도가 갑자기 바뀜 · 목소리(성별 · 음색)가 중간에 바뀜 · 다른 언어 등 들은 문제를 시각(분:초)과 함께"],"voiceConsistent":true/false,"overall":"한 줄 평가"}
[대본]
${script.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
const body = JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "audio/mp3", data: fs.readFileSync(mp3).toString("base64") } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json" } });
let out = null;
for (const m of ["gemini-3.1-pro-preview", "gemini-3.8-flash", "gemini-2.5-pro"]) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!r.ok) { console.error(m, r.status, (await r.text()).slice(0, 150)); continue; }
  const j = await r.json(); out = j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join(""); console.error("model", m); break;
}
const res = JSON.parse(out);
fs.writeFileSync(path.join(ROOT, ".cache", `${id}-check.json`), JSON.stringify(res, null, 2));
console.log(`${id} · 목소리 일정: ${res.voiceConsistent} · ${res.overall}`);
console.log(`빠진 문장 ${res.missing?.length || 0}`); (res.missing || []).forEach((x) => console.log("  - " + x));
console.log(`다르게 들린 곳 ${res.mismatch?.length || 0}`); (res.mismatch || []).forEach((x) => console.log(`  - 대본: ${x.script}\n    들림: ${x.heard}`));
console.log(`문제 ${res.issues?.length || 0}`); (res.issues || []).forEach((x) => console.log("  - " + x));
