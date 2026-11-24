// marketing/edu/build.mjs — 안전교육 영상 만들기 v2(2026-11-24 · 1080p)
//  node marketing/edu/gen-images.mjs                → 그림(images/*.jpg) 먼저
//  node marketing/edu/build.mjs drv_load            → public/edu/drv_load.mp4
//  node marketing/edu/build.mjs drv_load --sheet x  → 장면마다 한 장(.cache/drv_load-sNN.png)
//  나레이션: Gemini TTS(목소리 Kore, .cache 에 줄마다 저장) · 화면: 표지 · 장 표지 · 그림+요점 · 바른 예/잘못된 예 · 순서 · 법 · 체크리스트 · 마무리
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import url from "node:url"; import crypto from "node:crypto";
import { COURSES } from "./scripts.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.dirname(url.fileURLToPath(import.meta.url));
const CACHE = path.join(ROOT, ".cache"); fs.mkdirSync(CACHE, { recursive: true });
const id = process.argv[2]; const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const C = COURSES[id]; if (!C) { console.error("교육 id:", Object.keys(COURSES).join(", ")); process.exit(1); }
const RATE = 24000, VOICE = arg("voice", "Kore"), W = 1920, H = 1080;
const IMG = (n) => url.pathToFileURL(path.join(ROOT, "images", `${n}.jpg`)).href;

// ── 1. 나레이션
// 🔒 목소리가 일정한 두 모델만(3.1-flash · 2.5-flash 는 같은 Kore 로 불러도 남녀 · 음색이 바뀌고 삐 소리가 섞였다 — 2026-11-24 점검)
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-pro-preview-tts"];
async function tts(text) {
  const h = crypto.createHash("sha1").update(VOICE + "|" + text).digest("hex").slice(0, 16);
  const f = path.join(CACHE, `${h}.pcm`);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const body = JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } });
  for (const m of TTS_MODELS) { // 모델마다 하루 100번 한도 — 다 쓰면 다음 모델(목소리는 같은 Kore)
    for (let a = 0; a < 6; a++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (r.ok) {
        const d = (await r.json())?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
        if (!d) break;
        let pcm = Buffer.from(d, "base64"); if (pcm.subarray(0, 4).toString() === "RIFF") pcm = pcm.subarray(44);
        const n = pcm.length >> 1; let s = 0, e = n - 1;
        while (s < n && Math.abs(pcm.readInt16LE(s * 2)) < 600) s++; while (e > s && Math.abs(pcm.readInt16LE(e * 2)) < 600) e--;
        pcm = Buffer.from(pcm.subarray(Math.max(0, s - 1200) * 2, (Math.min(n - 1, e + 2400) + 1) * 2));
        fs.writeFileSync(f, pcm); fs.writeFileSync(f.replace(/\.pcm$/, ".model"), m); return pcm; // 어느 모델이 만들었는지 남긴다
      }
      const t = await r.text(); console.error(`\n${m} ${r.status} ${t.slice(0, 80)}`);
      if (r.status === 429 && /per day|PerDay/i.test(t)) { console.error(`(${m} 오늘 한도 끝 → 다음 모델)`); TTS_MODELS.splice(TTS_MODELS.indexOf(m), 1); if (!TTS_MODELS.length) { console.error("\n목소리가 일정한 음성 모델의 오늘 한도를 다 썼어요. 내일(미국 서부 자정 이후) 다시 실행하면 이어서 만들어요."); process.exit(3); } return tts(text); }
      if (r.status === 429 || r.status >= 500) await new Promise((z) => setTimeout(z, 20000 * (a + 1))); else break; // 분당 한도 — 천천히 다시
    }
  }
  if (arg("sheet") || arg("still") || arg("silent")) { MISSING++; return Buffer.alloc(Math.round(text.length * 0.17 * RATE) * 2); } // 미리보기는 길이만 어림(소리 없음)
  throw new Error("음성을 만들지 못했어요: " + text);
}
let MISSING = 0;
const lines = C.slides.flatMap((s, si) => s.lines.map((l, li) => ({ ...l, si, li })));
let k = 0;
await Promise.all([0].map(async (w) => { for (let i = w; i < lines.length; i += 1) { const l = lines[i]; l.pcm = await tts(l.say); l.dur = l.pcm.length / 2 / RATE; process.stdout.write(`\r나레이션 ${++k}/${lines.length}`); } }));
console.log(MISSING ? `(음성 없는 줄 ${MISSING}개 — 미리보기용 길이 어림)` : "");

// ── 2. 시간표(장면 시작 0.9초 뒤 첫 말 · 말 사이 0.55초 · 장면 끝 0.9초)
let t = 0; let ch = null;
const slides = C.slides.map((s, si) => {
  if (s.type === "chapter") ch = s;
  const t0 = t; let c = t0 + (s.type === "cover" ? 1.6 : 0.9);
  const ls = lines.filter((l) => l.si === si); ls.forEach((l) => { l.t0 = c; l.t1 = c + l.dur; c = l.t1 + 0.55; });
  t = c + (s.type === "chapter" ? 0.6 : 0.9); return { ...s, t0, t1: t, ls, ch: s.type === "cover" || s.type === "end" ? null : ch };
});
const DUR = t + 0.5;
const chapters = C.slides.filter((s) => s.type === "chapter");

// ── 3. 화면
const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const f2 = (x) => x.toFixed(2);
const ICON = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', close: '<path d="M18 6 6 18M6 6l12 12"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  strap: '<rect x="3" y="9" width="18" height="6" rx="1.5"/><path d="M8 9v6M12 9v6"/><rect x="14.5" y="7" width="5" height="10" rx="1.5"/>',
  chain: '<rect x="2.5" y="9" width="8" height="6" rx="3"/><rect x="13.5" y="9" width="8" height="6" rx="3"/><path d="M8 12h8"/>',
  net: '<path d="M4 4h16v16H4z"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  mat: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  corner: '<path d="M5 19V5h14"/><path d="M9 19V9h10"/>',
  walk: '<circle cx="12" cy="4.5" r="1.8"/><path d="m9 21 2-6-2-3 1-4 4 2 2 3"/><path d="m13 15 2 6"/>',
  rest: '<path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/>',
  road: '<path d="M8 3 4 21M16 3l4 18"/><path d="M12 5v2M12 11v2M12 17v2"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  truck: '<path d="M2.5 6h11v9h-11z"/><path d="M13.5 9H18l3.5 3.5V15h-8"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3 14.5a1.5 1.5 0 0 1 2.5-1.7L8 15"/>',
  fall: '<circle cx="14" cy="4.5" r="1.8"/><path d="m6 9 5-1 3 4-2 4"/><path d="m11 16-3 5M14 12l4 3"/><path d="M3 21h18"/>',
  slip: '<circle cx="9" cy="4.5" r="1.8"/><path d="m7 21 3-6-2-4 4-3 3 3"/><path d="M14 21c2-1 5-1 7 0"/>',
  engine: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5"/><path d="M8.5 9.5a5 5 0 1 0 7 0"/>',
  brake: '<circle cx="12" cy="12" r="8.5"/><text x="12" y="16" font-size="11" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none">P</text>',
  chock: '<path d="M3 19h18"/><path d="M5 19l7-9 7 9"/><circle cx="17" cy="9" r="3.5"/>',
  signal: '<path d="M12 21V11"/><path d="M8.5 7.5a5 5 0 0 1 7 0M5.5 4.5a9 9 0 0 1 13 0"/><circle cx="12" cy="11" r="1.5"/>',
  door: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M15 12h.01"/>',
  slow: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l-3 2"/>',
  talk: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  alert: '<path d="M12 3 2.5 20h19Z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  pledge: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
};
const ic = (n, s = 40, sw = 1.9) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON[n] || ICON.shield}</svg>`;
const kb = (s) => `data-kb="1,1.07" data-in="${f2(s.t0)}" data-out="${f2(s.t1)}" data-a="none"`;

function slideHtml(s, i) {
  const pts = s.ls.filter((l) => l.pt);
  if (s.type === "cover") return `
    <div class="bgimg" ${kb(s)}><img src="${IMG(s.img)}"></div><div class="shade"></div>
    <div class="cv">
      <div class="cvchip" data-in="${f2(s.t0 + 0.2)}" data-a="up" data-dist="20">${ic("shield", 26, 2.1)}<span>SAFETY TRAINING · ${esc(C.code)}</span></div>
      <div class="cvtitle" data-in="${f2(s.t0 + 0.35)}" data-a="up" data-dist="30">${esc(C.title)}</div>
      <div class="cvsub" data-in="${f2(s.t0 + 0.55)}" data-a="up" data-dist="20">${esc(s.sub)}</div>
      <div class="cvlist">${chapters.map((x) => x.title).map((c, j) => `<div class="cvli" data-in="${f2(s.t0 + 0.9 + j * 0.12)}" data-a="left" data-dist="14"><b>${String(j + 1).padStart(2, "0")}</b><span>${esc(c)}</span></div>`).join("")}</div>
      <div class="cvmeta" data-in="${f2(s.t0 + 1.2)}" data-a="fade">${Math.floor(DUR / 60)}분 ${Math.round(DUR % 60)}초 · ${chapters.length}개 장 · 시청 후 전자 서명</div>
    </div>`;
  if (s.type === "chapter") return `
    <div class="chl" data-in="${f2(s.t0)}" data-a="right" data-dist="40" data-d="0.5">
      <div class="chno">CHAPTER ${String(s.no).padStart(2, "0")}<span>/ ${String(chapters.length).padStart(2, "0")}</span></div>
      <div class="chbig">${String(s.no).padStart(2, "0")}</div>
      <div class="sweep" data-in="${f2(s.t0 + 0.35)}" data-out="${f2(s.t0 + 1.9)}" data-a="none" data-pan="-420,0,980,0" data-pt="1.4"></div>
      <div class="chtitle">${esc(s.title)}</div><div class="chsub">${esc(s.sub)}</div>
    </div>
    <div class="chr"><div class="fill" ${kb(s)} data-pan="0,0,-40,0"><img src="${IMG(s.img)}"></div></div>`;
  const nav = s.ch ? `<div class="cnav" data-in="${f2(s.t0 + 0.3)}" data-a="up" data-dist="14"><div class="h"><span>CHAPTER ${String(s.ch.no).padStart(2, "0")} / ${String(chapters.length).padStart(2, "0")}</span><b>${esc(s.ch.title)}</b></div><div class="dots">${chapters.map((c) => `<i class="${c.no === s.ch.no ? "on" : c.no < s.ch.no ? "done" : ""}"></i>`).join("")}</div></div>` : "";
  if (s.type === "points") return nav + `
    <div class="pimg" data-in="${f2(s.t0 + 0.05)}" data-a="up" data-dist="24"><div class="fill" ${kb(s)}><img src="${IMG(s.img)}"></div></div>
    <div class="phead" data-in="${f2(s.t0 + 0.1)}" data-a="up" data-dist="16">${esc(s.head)}</div>
    <div class="plist">${pts.map((l, j) => `<div class="pt" data-on="${f2(l.t0)},${f2(l.t1 + 0.45)}" data-in="${f2(l.t0)}" data-a="left" data-dist="18" data-d="0.45"><i>${String(j + 1).padStart(2, "0")}</i><span>${esc(l.pt)}</span></div>`).join("")}</div>`;
  if (s.type === "dodont") return `
    <div class="dhead" data-in="${f2(s.t0 + 0.05)}" data-a="up" data-dist="16">${esc(s.head)}</div>
    ${[["good", s.good, s.t0 + 0.25], ["bad", s.bad, (s.ls[1]?.t0 ?? s.t0 + 1.2) - 0.2]].map(([k2, d, tin]) => `
      <div class="dcard ${k2}" data-in="${f2(tin)}" data-a="up" data-dist="30" data-d="0.5">
        <div class="dimg"><img src="${IMG(d.img)}"></div>
        <div class="dlab"><span class="dmark">${ic(k2 === "good" ? "check" : "close", 30, 3)}</span><b>${k2 === "good" ? "바른 예" : "잘못된 예"}</b><span>${esc(d.label)}</span></div>
      </div>`).join("")}`;
  if (s.type === "steps") return `
    <div class="dhead" data-in="${f2(s.t0 + 0.05)}" data-a="up" data-dist="16">${esc(s.head)}</div>
    <div class="steps n${s.steps.length}">${s.steps.map(([icn, lab, sub], j) => `
      <div class="st" data-on="${s.ls[j] ? `${f2(s.ls[j].t0)},${f2(s.ls[j].t1 + 0.45)}` : "0,0"}" data-in="${f2(s.ls[j]?.t0 ?? s.t0 + 0.5 + j * 0.3)}" data-a="up" data-dist="30" data-d="0.45">
        <div class="stno">${String(j + 1).padStart(2, "0")}</div><div class="stic">${ic(icn, 64, 1.7)}</div>
        <div class="stl">${esc(lab)}</div><div class="sts">${esc(sub)}</div>
      </div>`).join("")}</div>`;
  if (s.type === "law") return (s.ch ? nav : "") + `
    <div class="pimg" data-in="${f2(s.t0 + 0.05)}" data-a="up" data-dist="24"><div class="fill" ${kb(s)}><img src="${IMG(s.img)}"></div></div>
    <div class="phead" data-in="${f2(s.t0 + 0.1)}" data-a="up" data-dist="16">${esc(s.head)}</div>
    <div class="law" data-in="${f2(s.t0 + 0.5)}" data-a="up" data-dist="20"><div class="q">“</div><div class="lq">${esc(s.quote)}</div><div class="ls">${ic("shield", 24, 2)}${esc(s.src)}</div></div>`;
  if (s.type === "check") {
    const n = s.items.length, L = s.ls.length - 1; // 첫 말 다음부터 나눠서 체크
    return `
    <div class="ckimg"><div class="fill" ${kb(s)}><img src="${IMG(C.slides[0].img)}"></div></div>
    <div class="ckbox" data-in="${f2(s.t0 + 0.05)}" data-a="up" data-dist="24">
      <div class="ckh">${ic("check", 34, 2.6)}<span>${esc(s.head)}</span></div>
      ${s.items.map((it, j) => { const li = s.ls[1 + Math.min(L - 1, Math.floor((j * L) / n))] || s.ls[0]; return `<div class="ck" data-in="${f2(li.t0 + 0.15 * (j % 3))}" data-a="left" data-dist="16"><span class="cb" data-in="${f2(li.t0 + 0.15 * (j % 3) + 0.12)}" data-a="pop" data-d="0.35">${ic("check", 26, 3.2)}</span><span>${esc(it)}</span></div>`; }).join("")}
    </div>`;
  }
  if (s.type === "end") return `
    <div class="bgimg" ${kb(s)}><img src="${IMG(s.img)}"></div><div class="shade"></div>
    <div class="cv">
      <div class="cvchip" data-in="${f2(s.t0 + 0.2)}" data-a="up">${ic("shield", 26, 2.1)}<span>${esc(C.code)} · COMPLETE</span></div>
      <div class="cvtitle" data-in="${f2(s.t0 + 0.4)}" data-a="up" data-dist="30">수고하셨습니다</div>
      <div class="cvsub" data-in="${f2(s.t0 + 0.6)}" data-a="up">영상을 닫고 이수 서명을 하면 교육이 끝나요</div>
      <div class="cvnext" data-in="${f2(s.ls[1]?.t0 ?? s.t0 + 1)}" data-a="up"><span>NEXT</span>${ic("check", 26, 2.8)}<b>이수 서명</b></div>
    </div>`;
  return "";
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&family=JetBrains+Mono:wght@600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#F4F6FA;font-family:"Noto Sans KR",sans-serif;color:#0F1A30;letter-spacing:-0.02em;word-break:keep-all}
.mono{font-family:"JetBrains Mono",monospace;letter-spacing:.04em}
img{display:block;width:100%;height:100%;object-fit:cover}
.fill{position:absolute;inset:0}
.top{position:absolute;left:0;right:0;top:0;height:92px;display:flex;align-items:center;gap:20px;padding:0 64px;background:rgba(255,255,255,.96);border-bottom:1px solid #E3E8F0;z-index:5}
.chip{height:44px;padding:0 18px;border-radius:12px;background:linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%);color:#fff;font:800 17px "JetBrains Mono",monospace;letter-spacing:.12em;display:flex;align-items:center;gap:10px}
.ttl{font-weight:900;font-size:27px;white-space:nowrap}
.code{font:700 17px "JetBrains Mono",monospace;color:#4B6CB7;letter-spacing:.08em}
.chap{margin-left:auto;display:flex;align-items:center;gap:14px;white-space:nowrap}
.chap b{font:800 17px "JetBrains Mono",monospace;color:#4B6CB7;letter-spacing:.08em}
.chap span{font-weight:900;font-size:21px}
.pg{font:700 18px "JetBrains Mono",monospace;color:#8A97AD;margin-left:18px}
.bar{position:absolute;left:0;top:92px;height:5px;background:linear-gradient(90deg,#1B2B4B,#2D4C82);z-index:6}
.slide{position:absolute;left:0;right:0;top:92px;bottom:0;overflow:hidden}
.slide.full{top:0}
.bgimg{position:absolute;inset:0}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,20,40,.94) 0%,rgba(11,20,40,.82) 38%,rgba(11,20,40,.15) 75%,rgba(11,20,40,0) 100%)}
.cv{position:absolute;left:110px;top:150px;width:900px;color:#fff}
.cvchip{display:inline-flex;align-items:center;gap:12px;height:50px;padding:0 20px;border-radius:14px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);font:800 19px "JetBrains Mono",monospace;letter-spacing:.12em;color:#8FB0F0}
.cvtitle{font-size:92px;font-weight:900;line-height:1.12;margin-top:30px;white-space:nowrap}
.cvsub{font-size:34px;font-weight:700;color:rgba(255,255,255,.72);margin-top:16px;white-space:nowrap}
.cvlist{display:grid;grid-template-columns:1fr 1fr;gap:12px 34px;margin-top:46px;width:780px}
.cvli{display:flex;align-items:center;gap:16px;font-size:25px;font-weight:700;color:rgba(255,255,255,.88);white-space:nowrap}
.cvli b{font:800 20px "JetBrains Mono",monospace;color:#8FB0F0;width:34px}
.cvmeta{margin-top:40px;font:700 20px "JetBrains Mono",monospace;color:rgba(255,255,255,.55);letter-spacing:.04em}
.cvnext{display:inline-flex;align-items:center;gap:14px;margin-top:46px;height:76px;padding:0 30px;border-radius:20px;background:#fff;color:#0F1A30}
.cvnext span{font:800 18px "JetBrains Mono",monospace;color:#4B6CB7;letter-spacing:.12em}
.cvnext b{font-size:32px;font-weight:900}
.chl{position:absolute;left:0;top:0;bottom:0;width:760px;padding:110px 90px;color:#fff;background:linear-gradient(rgba(143,176,240,.07) 1px,transparent 1px) 0 0/34px 34px,linear-gradient(90deg,rgba(143,176,240,.07) 1px,transparent 1px) 0 0/34px 34px,linear-gradient(150deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)}
.chno{font:800 22px "JetBrains Mono",monospace;letter-spacing:.14em;color:#8FB0F0}
.chno span{color:rgba(255,255,255,.35);margin-left:10px}
.chbig{font:800 260px/1 "JetBrains Mono",monospace;margin-top:40px;color:#fff;letter-spacing:-.04em}
.chtitle{font-size:72px;font-weight:900;margin-top:40px;white-space:nowrap}
.chsub{font-size:32px;font-weight:700;color:rgba(255,255,255,.62);margin-top:14px;white-space:nowrap}
.chr{position:absolute;left:760px;right:0;top:0;bottom:0;overflow:hidden}
.pimg{position:absolute;left:64px;top:60px;width:1020px;height:770px;border-radius:32px;overflow:hidden;background:#fff;box-shadow:0 30px 60px -30px rgba(15,26,48,.35);border:1px solid #E3E8F0}
.phead{position:absolute;left:1140px;right:64px;top:84px;font-size:50px;font-weight:900;line-height:1.22}
.plist{position:absolute;left:1140px;right:64px;top:236px;display:flex;flex-direction:column;gap:22px}
.pt{display:flex;align-items:center;gap:22px;background:#fff;border:1px solid #E3E8F0;border-radius:24px;padding:28px 28px;box-shadow:0 10px 24px -16px rgba(15,26,48,.25)}
.pt i{flex:none;font:800 22px "JetBrains Mono",monospace;font-style:normal;color:#fff;background:linear-gradient(135deg,#0B1428,#2D4C82);width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center}
.pt span{font-size:33px;font-weight:800;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.law{position:absolute;left:1140px;right:64px;top:250px;background:#fff;border:1px solid #E3E8F0;border-radius:28px;padding:38px 40px 34px;box-shadow:0 20px 40px -24px rgba(15,26,48,.3)}
.law .q{font:900 120px/0.7 Georgia,serif;color:#C9D5E8;height:60px}
.lq{font-size:33px;font-weight:800;line-height:1.55}
.ls{display:inline-flex;align-items:center;gap:12px;margin-top:26px;height:52px;padding:0 20px;border-radius:14px;background:#0F1A30;color:#fff;font-size:23px;font-weight:800}
.dhead{position:absolute;left:64px;right:64px;top:56px;font-size:50px;font-weight:900;text-align:center;white-space:nowrap}
.dcard{position:absolute;top:160px;width:868px;height:700px;border-radius:32px;overflow:hidden;background:#fff;border:1px solid #E3E8F0;box-shadow:0 30px 60px -30px rgba(15,26,48,.35)}
.dcard.good{left:64px}.dcard.bad{right:64px}
.dimg{position:absolute;left:0;right:0;top:0;height:560px}
.dlab{position:absolute;left:0;right:0;bottom:0;height:140px;display:flex;align-items:center;gap:18px;padding:0 34px;white-space:nowrap}
.dlab b{font-size:34px;font-weight:900}
.dlab span:last-child{font-size:27px;font-weight:700;color:#5B6B85;overflow:hidden;text-overflow:ellipsis}
.dmark{flex:none;width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff}
.good .dmark{background:#1B2B4B}.bad .dmark{background:#A33A2E}
.good{border-top:8px solid #1B2B4B}.bad{border-top:8px solid #A33A2E}
.bad .dimg img{filter:saturate(.75)}
.steps{position:absolute;left:64px;right:64px;top:200px;display:grid;gap:26px}
.steps.n4{grid-template-columns:repeat(4,1fr)}.steps.n5{grid-template-columns:repeat(5,1fr)}.steps.n3{grid-template-columns:repeat(3,1fr)}
.st{position:relative;height:560px;background:#fff;border:1px solid #E3E8F0;border-radius:30px;padding:48px 30px;display:flex;flex-direction:column;align-items:center;text-align:center;box-shadow:0 20px 40px -26px rgba(15,26,48,.35)}
.stno{position:absolute;top:26px;left:30px;font:800 24px "JetBrains Mono",monospace;color:#4B6CB7}
.stic{margin-top:60px;width:150px;height:150px;border-radius:40px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%);box-shadow:0 18px 30px -16px rgba(11,20,40,.7)}
.stl{font-size:38px;font-weight:900;margin-top:52px;white-space:nowrap}
.sts{font-size:26px;font-weight:700;color:#5B6B85;margin-top:14px;white-space:nowrap}
.ckimg{position:absolute;right:0;top:0;bottom:0;width:860px;overflow:hidden}
.ckimg::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#F4F6FA 0%,rgba(244,246,250,0) 40%)}
.ckbox{position:absolute;left:64px;top:56px;width:1060px;bottom:150px;background:#fff;border:1px solid #E3E8F0;border-radius:32px;padding:40px 46px;box-shadow:0 30px 60px -30px rgba(15,26,48,.35)}
.ckh{display:flex;align-items:center;gap:16px;font-size:44px;font-weight:900;margin-bottom:26px;color:#0F1A30}
.ckh svg{color:#fff;background:#1B2B4B;border-radius:12px;padding:6px;width:52px;height:52px}
.ck{display:flex;align-items:center;gap:20px;font-size:31px;font-weight:800;padding:13px 0;border-bottom:1px solid #EEF1F6;white-space:nowrap}
.cb{flex:none;width:44px;height:44px;border-radius:12px;background:#1B2B4B;color:#fff;display:flex;align-items:center;justify-content:center}
.cnav{position:absolute;left:1140px;right:64px;top:690px;background:#fff;border:1px solid #E3E8F0;border-radius:22px;padding:22px 26px}
.cnav .h{display:flex;align-items:center;justify-content:space-between;font:800 16px "JetBrains Mono",monospace;letter-spacing:.1em;color:#4B6CB7}
.cnav .h b{font:900 22px "Noto Sans KR",sans-serif;letter-spacing:-.02em;color:#0F1A30}
.cnav .dots{display:flex;gap:8px;margin-top:16px}
.cnav .dots i{flex:1;height:10px;border-radius:6px;background:#E3E8F0}
.cnav .dots i.done{background:#8A97AD}.cnav .dots i.on{background:linear-gradient(90deg,#1B2B4B,#2D4C82)}
.chl{overflow:hidden}
.sweep{position:absolute;top:0;bottom:0;left:0;width:260px;background:linear-gradient(100deg,rgba(143,176,240,0) 0%,rgba(143,176,240,.28) 50%,rgba(143,176,240,0) 100%);transform:skewX(-14deg);pointer-events:none}
.pt,.st{transition:none;border-width:2px}
.pt.on{border-color:#1B2B4B;box-shadow:0 22px 44px -20px rgba(15,26,48,.55);background:linear-gradient(90deg,#F1F5FC,#fff 40%)}
.pt.on i{box-shadow:0 0 0 6px rgba(45,76,130,.18)}
.pt.on span{color:#0B1428}
.st.on{border-color:#1B2B4B;box-shadow:0 30px 60px -28px rgba(15,26,48,.6)}
.st.on .stic{box-shadow:0 0 0 10px rgba(45,76,130,.14),0 18px 30px -16px rgba(11,20,40,.7)}
#cap{position:absolute;left:0;right:0;margin:0 auto;width:fit-content;max-width:1760px;bottom:40px;padding:16px 36px;border-radius:18px;background:rgba(11,20,40,.9);color:#fff;font-size:38px;font-weight:700;line-height:1.4;text-align:center;z-index:9;box-shadow:0 16px 40px -16px rgba(0,0,0,.5)}
</style></head><body>
${slides.map((s, i) => `<section class="slide ${["cover", "end"].includes(s.type) ? "full" : ""}" data-in="${f2(s.t0)}" data-out="${f2(s.t1 - 0.02)}" data-a="fade" data-d="0.4">${slideHtml(s, i)}</section>`).join("\n")}
<div class="top" id="top"><span class="chip">${ic("shield", 22, 2.2)}SAFETY</span><span class="ttl">${esc(C.title)}</span><span class="code">${esc(C.code)}</span><span class="chap"><b id="chn"></b><span id="cht"></span></span><span class="pg" id="pg"></span></div>
<div class="bar" id="bar"></div>
<div id="cap"></div>
<script>
window.SCENE={duration:${DUR.toFixed(2)},slides:${JSON.stringify(slides.map((s) => [s.t0, s.t1, s.type, s.ch ? s.ch.no : 0, s.ch ? s.ch.title : ""]))},chN:${chapters.length}};
window.__CAPS=${JSON.stringify(lines.map((l) => ({ t0: l.t0, t1: l.t1, text: l.cap || l.say })))};
</script>
<script src="${url.pathToFileURL(path.join(ROOT, "../video/engine.js")).href}"></script>
<script>
const _seek=window.__seek;const ONS=()=>window.__ons||(window.__ons=[...document.querySelectorAll("[data-on]")].map(el=>{const[a,b]=el.dataset.on.split(",").map(Number);return{el,a,b};}));
window.__seek=async(t)=>{await _seek(t);ONS().forEach(({el,a,b})=>el.classList.toggle("on",t>=a&&t<b));const S=window.SCENE.slides;const i=Math.max(0,S.findIndex(([a,b])=>t>=a&&t<b));const s=S[i];
const full=s&&(s[2]==="cover"||s[2]==="end");document.getElementById("top").style.opacity=full?0:1;document.getElementById("bar").style.opacity=full?0:1;
document.getElementById("chn").textContent=s&&s[3]?"CH "+String(s[3]).padStart(2,"0")+" / "+String(window.SCENE.chN).padStart(2,"0"):"";document.getElementById("cht").textContent=s?s[4]:"";
document.getElementById("pg").textContent=String(i+1).padStart(2,"0")+" / "+String(S.length).padStart(2,"0");document.getElementById("bar").style.width=(Math.min(1,t/window.SCENE.duration)*100)+"%";};
</script></body></html>`;
const page0 = path.join(CACHE, `${id}.html`); fs.writeFileSync(page0, html);

// ── 4. 찍기
const browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(url.pathToFileURL(page0).href, { waitUntil: "networkidle" });
await page.evaluate(() => window.__ready());
if (arg("sheet")) {
  const files = [];
  for (const [i, s] of slides.entries()) { const at = s.t1 - 1.0; await page.evaluate((x) => window.__seek(x), at - 0.6); await page.evaluate((x) => window.__seek(x), at); const f = path.join(CACHE, `${id}-s${String(i + 1).padStart(2, "0")}.png`); await page.screenshot({ path: f }); files.push(f); }
  console.log(`장면 ${files.length}개 · 영상 길이 ${DUR.toFixed(1)}초`); await browser.close(); process.exit(0);
}
if (arg("still")) {
  const at = +arg("still"); await page.evaluate((x) => window.__seek(x), at - 0.6); await page.evaluate((x) => window.__seek(x), at);
  const f = path.join(CACHE, `${id}-at${at}.png`); await page.screenshot({ path: f }); console.log(f, `영상 길이 ${DUR.toFixed(1)}초`); await browser.close(); process.exit(0);
}
const total = Math.ceil(DUR * RATE); const audio = Buffer.alloc(total * 2);
for (const l of lines) l.pcm.copy(audio, Math.round(l.t0 * RATE) * 2, 0, Math.min(l.pcm.length, (total - Math.round(l.t0 * RATE)) * 2));
const wav = path.join(CACHE, `${id}.pcm`); fs.writeFileSync(wav, audio);
// 🎵 효과음 시각표 + 배경음악(sound.py) — 나레이션이 나올 때는 배경음악이 저절로 작아진다(사이드체인)
const events = [];
for (const s of slides) {
  if (s.type === "cover" || s.type === "end") events.push({ t: s.t0 + 0.15, k: "swell" });
  if (s.type === "chapter") events.push({ t: Math.max(0, s.t0 - 0.25), k: "whoosh" });
  if (s.type === "points") s.ls.filter((l) => l.pt).forEach((l) => events.push({ t: l.t0, k: "pop" }));
  if (s.type === "steps") s.steps.forEach((_, j) => events.push({ t: s.ls[j]?.t0 ?? s.t0 + 0.5 + j * 0.3, k: "pop" }));
  if (s.type === "dodont") { events.push({ t: s.t0 + 0.25, k: "pop" }); events.push({ t: (s.ls[1]?.t0 ?? s.t0 + 1.2) - 0.2, k: "pop" }); }
  if (s.type === "law") events.push({ t: s.t0 + 0.5, k: "pop" });
  if (s.type === "check") { const n = s.items.length, L = s.ls.length - 1; s.items.forEach((_, j) => { const li = s.ls[1 + Math.min(L - 1, Math.floor((j * L) / n))] || s.ls[0]; events.push({ t: li.t0 + 0.15 * (j % 3) + 0.12, k: "tick" }); }); }
}
const evf = path.join(CACHE, `${id}-events.json`); fs.writeFileSync(evf, JSON.stringify({ duration: DUR, events }));
const bedW = path.join(CACHE, `${id}-bed.wav`), sfxW = path.join(CACHE, `${id}-sfx.wav`);
execFileSync("python3", [path.join(ROOT, "sound.py"), evf, bedW, sfxW], { stdio: "inherit" });
const outDir = path.join(ROOT, "../../public/edu"); fs.mkdirSync(outDir, { recursive: true });
const out = arg("out") || path.join(outDir, `${id}.mp4`); // --out 로 시험본을 따로 // 아이폰 · 안드로이드 · PC 모두 재생되는 H.264 + AAC
const fps = +arg("fps", 24);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", wav, "-i", bedW, "-i", sfxW,
  "-filter_complex", "[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[v][sc];[2:a]volume=0.28[b];[b][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[bd];[3:a]volume=0.45[fx];[v][bd][fx]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.95[a]",
  "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "128k", "-shortest", out], { stdio: ["pipe", "inherit", "inherit"] });
const n = Math.round(Math.min(DUR, +arg("to", DUR)) * fps); const T = Date.now(); // --to 초: 앞부분만 시험 const T = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate((x) => window.__seek(x), i / fps);
  const buf = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % (fps * 10) === 0) process.stdout.write(`\r${id} ${(i / fps).toFixed(0)}s / ${DUR.toFixed(0)}s (${((Date.now() - T) / 1000).toFixed(0)}초)`);
}
ff.stdin.end(); await new Promise((r) => ff.on("close", r)); await browser.close();
console.log(`\n${out}  ${(fs.statSync(out).size / 1048576).toFixed(1)}MB · ${DUR.toFixed(1)}초`);
