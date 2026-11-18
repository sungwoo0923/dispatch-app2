// marketing/shorts/stage.mjs — 유튜브 숏츠(1080×1920) 녹화 무대
// 실제 로지스웹 화면(개발 서버 /preview?demo=1 · 가짜 데이터)을 세로 화면 가운데에 띄우고
// 카메라 확대 · 커서 · 자막을 얹어서 프레임을 그대로 찍는다. 꾸민 그림이 아니라 실제 프로그램이 움직인다.
//
// 쓰는 법: npx vite --port 5173  →  node marketing/shorts/record.mjs 01
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const BASE = process.env.KP_BASE || "http://127.0.0.1:5173";
const W = 1080, H = 1920;
// 프로그램이 보이는 창(세로 화면 안) — 숏츠 아래쪽 25%는 제목 · 버튼에 가려지므로 위로 올려 둔다
const VIEW = { x: 40, y: 430, w: 1000, h: 960 };
const APP = { w: 1440, h: 900 };

const STAGE_HTML = (appUrl) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box} html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{background:radial-gradient(120% 70% at 50% 0%,#1E3563 0%,#0B1428 60%);font-family:'Noto Sans KR',sans-serif;color:#fff;letter-spacing:-.02em}
#top{position:absolute;left:60px;right:60px;top:110px;height:300px;display:flex;flex-direction:column;justify-content:flex-end}
#eyebrow{font-size:30px;font-weight:800;color:#7FB2FF;margin-bottom:14px;opacity:0;transform:translateY(10px);transition:all .4s}
#head{font-size:62px;font-weight:900;line-height:1.22;opacity:0;transform:translateY(16px);transition:all .45s}
#head b{color:#FFD24A;font-weight:900}
.show{opacity:1!important;transform:none!important}
#view{position:absolute;left:${VIEW.x}px;top:${VIEW.y}px;width:${VIEW.w}px;height:${VIEW.h}px;border-radius:34px;overflow:hidden;background:#EEF2F8;box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.08)}
#cam{position:absolute;left:0;top:0;width:${APP.w}px;height:${APP.h}px;transform-origin:0 0;transition:transform 1s cubic-bezier(.65,0,.35,1)}
#cam iframe{width:${APP.w}px;height:${APP.h}px;border:0;display:block;background:#fff}
#cursor{position:absolute;left:0;top:0;width:44px;height:44px;z-index:5;transition:transform .7s cubic-bezier(.65,0,.35,1);pointer-events:none;opacity:0}
#cursor svg{filter:drop-shadow(0 4px 8px rgba(0,0,0,.35))}
.ring{position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;border:5px solid #FFD24A;opacity:0}
.ring.go{animation:ring .55s ease-out}
@keyframes ring{0%{opacity:1;transform:scale(.3)}100%{opacity:0;transform:scale(1.6)}}
#hl{position:absolute;z-index:4;border:5px solid #FFD24A;border-radius:18px;box-shadow:0 0 0 2000px rgba(11,20,40,.35);opacity:0;transition:all .5s;pointer-events:none}
#sub{position:absolute;left:60px;right:60px;top:${VIEW.y + VIEW.h + 34}px;font-size:40px;font-weight:800;line-height:1.35;color:#DCE7FF;opacity:0;transform:translateY(10px);transition:all .4s}
#sub b{color:#fff}
#chat{position:absolute;left:90px;right:90px;top:640px;z-index:8;opacity:0;transform:translateY(30px) scale(.96);transition:all .5s}
.bub{background:#FEE500;color:#191919;border-radius:8px 30px 30px 30px;padding:30px 34px;font-size:40px;font-weight:700;line-height:1.45;box-shadow:0 20px 50px rgba(0,0,0,.45)}
.who{font-size:28px;font-weight:800;color:#CFE0FF;margin:0 0 12px 6px}
.when{font-size:24px;color:#9FB3D9;margin:10px 0 0 8px}
#dim{position:absolute;inset:0;background:rgba(11,20,40,.72);z-index:7;opacity:0;transition:opacity .5s}
#end{position:absolute;inset:0;z-index:20;background:radial-gradient(120% 70% at 50% 30%,#22407A 0%,#0B1428 65%);display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .6s}
#end img{width:620px;margin-bottom:56px}
#end .l1{font-size:56px;font-weight:900;text-align:center;line-height:1.3}
#end .l1 b{color:#FFD24A}
#end .l2{margin-top:34px;font-size:36px;font-weight:700;color:#B9CBEE;text-align:center;line-height:1.5}
#end .cta{margin-top:60px;padding:26px 54px;border-radius:999px;background:#FFD24A;color:#0B1428;font-size:40px;font-weight:900}
#brand{position:absolute;left:60px;top:48px;display:flex;align-items:center;gap:14px;font-size:30px;font-weight:900;letter-spacing:.12em;color:#fff;opacity:.9}
#brand img{height:44px}
</style></head><body>
<div id="brand"><img src="/brand/logisweb-mark.png" alt="">LOGISWEB</div>
<div id="top"><div id="eyebrow"></div><div id="head"></div></div>
<div id="view"><div id="cam"><iframe id="app" src="${appUrl}"></iframe></div><div id="hl"></div>
  <div id="cursor"><div class="ring"></div><svg width="44" height="44" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L16 20l-2.6 1.3-3.4-7.3L4 18z" fill="#fff" stroke="#0B1428" stroke-width="1.4" stroke-linejoin="round"/></svg></div>
</div>
<div id="sub"></div>
<div id="dim"></div>
<div id="chat"></div>
<div id="end"></div>
<script>
const VW=${VIEW.w},VH=${VIEW.h},AW=${APP.w},AH=${APP.h};
let cam={s:VW/AW,tx:0,ty:(VH-AH*VW/AW)/2};
function apply(){document.getElementById('cam').style.transform='translate('+cam.tx+'px,'+cam.ty+'px) scale('+cam.s+')'}
apply();
// rect = 프로그램 화면 좌표의 {x,y,w,h} — 그 부분이 창 가운데 꽉 차게 확대한다(pad = 여백 비율)
window.camTo=(r,pad=1.12)=>{
  if(!r){cam={s:VW/AW,tx:0,ty:(VH-AH*VW/AW)/2};apply();return cam}
  let s=Math.min(VW/(r.w*pad),VH/(r.h*pad),2.6); s=Math.max(s,VW/AW);
  let tx=VW/2-(r.x+r.w/2)*s, ty=VH/2-(r.y+r.h/2)*s;
  tx=Math.min(0,Math.max(VW-AW*s,tx));
  if(AH*s<VH) ty=(VH-AH*s)/2; else ty=Math.min(0,Math.max(VH-AH*s,ty));
  cam={s,tx,ty};apply();return cam};
window.toView=(x,y)=>({x:cam.tx+x*cam.s,y:cam.ty+y*cam.s});
window.cursorTo=(x,y)=>{const c=document.getElementById('cursor');c.style.opacity=1;const p=toView(x,y);c.style.transform='translate('+(p.x-8)+'px,'+(p.y-4)+'px)'};
window.cursorHide=()=>{document.getElementById('cursor').style.opacity=0};
window.clickFx=()=>{const r=document.querySelector('#cursor .ring');r.classList.remove('go');void r.offsetWidth;r.classList.add('go')};
window.hl=(r)=>{const e=document.getElementById('hl');if(!r){e.style.opacity=0;return}const a=toView(r.x,r.y);e.style.left=(a.x-10)+'px';e.style.top=(a.y-10)+'px';e.style.width=(r.w*cam.s+20)+'px';e.style.height=(r.h*cam.s+20)+'px';e.style.opacity=1};
function setText(id,html){const e=document.getElementById(id);e.classList.remove('show');setTimeout(()=>{e.innerHTML=html;if(html)e.classList.add('show')},html&&e.innerHTML?180:0)}
window.caption=(eyebrow,head)=>{setText('eyebrow',eyebrow||'');setText('head',head||'')};
window.sub=(t)=>setText('sub',t||'');
window.chat=(who,msg,when)=>{const c=document.getElementById('chat'),d=document.getElementById('dim');if(!msg){c.classList.remove('show');d.style.opacity=0;return}c.innerHTML='<div class="who">'+who+'</div><div class="bub">'+msg+'</div><div class="when">'+(when||'')+'</div>';d.style.opacity=1;requestAnimationFrame(()=>c.classList.add('show'))};
window.endCard=(l1,l2,cta)=>{const e=document.getElementById('end');e.innerHTML='<img src="/brand/logisweb-wordmark-light.png" alt=""><div class="l1">'+l1+'</div><div class="l2">'+l2+'</div>'+(cta?'<div class="cta">'+cta+'</div>':'');e.style.opacity=1};
</script></body></html>`;

// 둘러보기 표시 · 개발용 안내를 지우고 이름을 바꿔 "진짜 회사에서 쓰는 화면"처럼 보이게 한다(프로그램 코드는 안 바꿈)
const CLEAN_APP = `(() => {
  const css = document.createElement('style');
  css.textContent = '[data-kp-hide]{display:none!important}';
  document.head.appendChild(css);
  const swap = [["둘러보기님", "김과장님"], ["한빛로지스 둘러보기", "한빛로지스"]];
  const fix = () => {
    for (const el of document.querySelectorAll('div,span')) {
      if (el.dataset.kpHide !== undefined) continue;
      const t = el.textContent || '';
      if (el.children.length < 4 && (t.includes('승인 전이라 저장되지 않습니다') || t.includes('둘러보기에서는 저장되지'))) {
        let p = el; while (p && getComputedStyle(p).position !== 'fixed') p = p.parentElement;
        (p || el).setAttribute('data-kp-hide', '');
      }
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) {
      if (n.nodeValue === '둘러보기') n.nodeValue = '';
      for (const [a, b] of swap) if (n.nodeValue.includes(a)) n.nodeValue = n.nodeValue.replaceAll(a, b);
    }
  };
  fix(); new MutationObserver(fix).observe(document.body, { childList: true, subtree: true, characterData: true });
  // 오른쪽 기사 알림(수락 · 거절 · 긴급) — 몇 초 뒤 저절로 닫히므로 마우스를 올린 상태로 붙잡아 두고, 장면마다 보였다 숨겼다
  const stack = () => { const t = document.querySelector('[data-kp-toast]'); if (!t) return null; let p = t; while (p && getComputedStyle(p).position !== 'fixed') p = p.parentElement; return p; };
  const pin = () => document.querySelectorAll('[data-kp-toast]').forEach((t) => t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })));
  pin();
  window.__kpToasts = (on) => { pin(); const p = stack(); if (p) p.style.visibility = on ? 'visible' : 'hidden'; return !!p; };
})()`;

export async function openStage({ co = "한빛로지스", plan = "pro" } = {}) {
  // 프로젝트에 깔린 playwright 버전과 브라우저가 다르면 KP_CHROME 으로 경로를 준다
  const browser = await chromium.launch(process.env.KP_CHROME ? { executablePath: process.env.KP_CHROME } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const appUrl = `/preview?demo=1&co=${encodeURIComponent(co)}&plan=${plan}`;
  // 브라우저 배율 안내(화면 맞춤)는 녹화에 안 나오게
  await page.addInitScript(() => { try { sessionStorage.setItem("kpZoomNoticeOff", "1"); } catch { /* 무시 */ } });
  await page.route(`${BASE}/__stage`, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: STAGE_HTML(appUrl) }));
  await page.goto(`${BASE}/__stage`);
  const frame = await (await page.waitForSelector("#app")).contentFrame();
  await frame.waitForLoadState("domcontentloaded");
  await frame.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "오더등록"), null, { timeout: 120000 });
  await frame.evaluate(CLEAN_APP);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);

  const S = {
    page, frame, browser,
    wait: (ms) => page.waitForTimeout(ms),
    caption: (a, b) => page.evaluate(([a, b]) => window.caption(a, b), [a, b]),
    sub: (t) => page.evaluate((t) => window.sub(t), t),
    chat: (who, msg, when) => page.evaluate(([a, b, c]) => window.chat(a, b, c), [who, msg, when]),
    endCard: (a, b, c) => page.evaluate(([a, b, c]) => window.endCard(a, b, c), [a, b, c]),
    toasts: (on) => frame.evaluate((on) => window.__kpToasts?.(on), on),
    // 프로그램 화면(iframe) 안의 좌표 — 바깥 확대(transform)와 상관없이
    async rect(sel) {
      const loc = typeof sel === "string" ? frame.locator(sel).first() : sel;
      return loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    },
    async box(sel) { if (!sel) return null; if (sel.w) return sel; const r = await S.rect(sel); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
    async cam(sel, pad) {
      const r = await S.box(sel);
      await page.evaluate(([r, pad]) => window.camTo(r, pad), [r, pad]);
    },
    async hl(sel) {
      const r = await S.box(sel);
      await page.evaluate((r) => window.hl(r), r);
    },
    async point(sel) {
      const r = await S.rect(sel);
      await page.evaluate(([x, y]) => window.cursorTo(x, y), [r.x + r.width * 0.5, r.y + r.height * 0.6]);
      await page.waitForTimeout(750);
      return r;
    },
    async click(sel) {
      await S.point(sel);
      await page.evaluate(() => window.clickFx());
      const loc = typeof sel === "string" ? frame.locator(sel).first() : sel;
      await loc.click();
    },
    cursorHide: () => page.evaluate(() => window.cursorHide()),
    // 텍스트로 버튼 찾기
    btn: (text) => frame.locator("button,a").filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) }).first(),
  };
  return S;
}

// 화면 녹화(CDP screencast) — 바뀐 프레임만 받아서 시간 그대로 이어 붙인다
export async function record(S, outFile, run) {
  const tmp = fs.mkdtempSync(path.join(path.dirname(outFile), ".frames-"));
  const cdp = await S.page.context().newCDPSession(S.page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const f = path.join(tmp, `${String(frames.length).padStart(6, "0")}.jpg`);
    fs.writeFileSync(f, Buffer.from(data, "base64"));
    frames.push({ f, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  await run(S);
  const t1 = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  // concat 목록(각 프레임이 다음 프레임까지 머무는 시간)
  const lines = [];
  frames.forEach((fr, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : t1;
    lines.push(`file '${fr.f}'`, `duration ${Math.max(0.001, next - fr.t).toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1).f}'`);
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, lines.join("\n"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-movflags", "+faststart", outFile]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { seconds: +(t1 - t0).toFixed(1), frames: frames.length };
}
