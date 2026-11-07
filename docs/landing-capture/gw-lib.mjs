// 사내메신저 · 출퇴근 · 사내메일 캡처용 공통 — 에뮬레이터 모드 프로그램(포트 GW_PORT, 기본 5214)에 로그인한 브라우저를 연다.
//  PC: 1440x860(2배) · 모바일: iPhone 13(390x844, 2배).
//  영상: startRec()로 화면 프레임(CDP screencast)을 모으고 stopRec()가 ffmpeg로 mp4 · webm · 포스터 jpg를 만든다.
//  시각: 한밤중에 찍으면 메시지 시각이 '오전 12:40'처럼 보이므로, 에뮬레이터·시드·캡처를 모두 faketime -f "+34h" 아래에서 돌리고
//        GW_CLOCK_NOW=1이면 브라우저 시계도 node의 (당겨진) 현재 시각으로 맞춘다.
//  크롬 경로가 playwright 버전과 다르면 GW_CHROME=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome 처럼 지정.
import { createRequire } from "node:module";
import { execSync, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
const { chromium, devices } = createRequire(new URL("../../package.json", import.meta.url))("playwright");
export const BASE = `http://127.0.0.1:${process.env.GW_PORT || 5214}`;
const here = new URL(".", import.meta.url).pathname;
export const OUT = process.env.GW_OUT || join(here, "out");

// 둘러보기 띠 · 알림 토스트 · 업데이트 안내처럼 홈페이지 캡처에 필요 없는 것은 숨긴다
export const HIDE_CSS = `
  [class*="z-[2147483000]"], #kp-update-banner, .kp-update-banner, [data-kp-toast], .Toastify, [class*="top-[72px]"][class*="z-[99999]"], [class*="bottom-5"][class*="right-5"][class*="z-[99999]"] { display: none !important; }
  * { caret-color: transparent; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  #kp-cap-cursor { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none; transform: translate(-3px,-2px); transition: transform .05s; }
  #kp-cap-cursor.down svg { transform: scale(.86); }
`;
// 영상에 보이는 마우스 화살표(헤드리스 화면에는 커서가 없다)
const CURSOR_JS = () => {
  const mk = () => {
    if (document.getElementById("kp-cap-cursor") || !document.body) return;
    const c = document.createElement("div"); c.id = "kp-cap-cursor"; c.style.display = "none";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.8L4 20z" fill="#0F1A30" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  };
  window.addEventListener("mousemove", (e) => { mk(); const c = document.getElementById("kp-cap-cursor"); if (!c || !window.__kpCapCursor) return; c.style.display = "block"; c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  window.addEventListener("mousedown", () => document.getElementById("kp-cap-cursor")?.classList.add("down"), true);
  window.addEventListener("mouseup", () => document.getElementById("kp-cap-cursor")?.classList.remove("down"), true);
};

export async function open({ email = "kim@hangyeol.demo", mobile = false, viewport = { width: 1440, height: 860 }, scale = 2, clock = null, geo = null } = {}) {
  try { execSync("node clear.mjs loginSessions", { cwd: here, stdio: "ignore" }); } catch { /* 무시 */ }
  const browser = await chromium.launch({ ...(process.env.GW_CHROME ? { executablePath: process.env.GW_CHROME } : {}), args: ["--ignore-certificate-errors"] });
  const base = mobile ? { ...devices["iPhone 13"], deviceScaleFactor: 2 } : { viewport, deviceScaleFactor: scale };
  const ctx = await browser.newContext({ ...base, locale: "ko-KR", timezoneId: "Asia/Seoul", ...(geo ? { permissions: ["geolocation"], geolocation: geo } : {}) });
  await ctx.addInitScript((css) => {
    const add = () => { if (document.getElementById("kp-cap-css")) return; const s = document.createElement("style"); s.id = "kp-cap-css"; s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
    try { sessionStorage.setItem("kpEntry", "app"); } catch { /* 무시 */ }
  }, HIDE_CSS);
  await ctx.addInitScript(CURSOR_JS);
  const pg = await ctx.newPage();
  if (!clock && process.env.GW_CLOCK_NOW === "1") clock = Date.now();
  if (clock) await pg.clock.install({ time: new Date(clock) }); // 근태 화면 — 브라우저 시계를 평일 아침으로
  pg.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 160)));
  await pg.goto(BASE + "/transport-login");
  await pg.waitForTimeout(2500);
  await pg.fill('input[placeholder="승인 후 발급된 코드"]', "HG2026");
  await pg.fill('input[placeholder="가입한 회사명"]', "한결로지스");
  await pg.fill('input[type="email"]', email);
  await pg.fill('input[type="password"]', "demo1234!");
  await pg.keyboard.press("Enter");
  await pg.waitForTimeout(4000);
  const kick = pg.getByText("기존 로그인 끊고 로그인"); if (await kick.count()) await kick.first().click();
  await pg.waitForTimeout(1500);
  const go = pg.getByText("바로 시작하기"); if (await go.count()) await go.first().click().catch(() => {});
  for (let i = 0; i < 40; i++) { if (!(await pg.getByText("SYNCING").count())) break; await pg.waitForTimeout(1500); }
  await pg.waitForTimeout(5000);
  return { browser, ctx, pg };
}

// 사람이 치는 것처럼 한 글자씩
export async function typeSlow(pg, text, delay = 70) { await pg.keyboard.type(text, { delay }); }
// 커서를 보이게 하고 부드럽게 옮겨 누르기
export async function showCursor(pg, x, y) { await pg.evaluate(() => { window.__kpCapCursor = true; }); await pg.mouse.move(x, y); }
export async function glide(pg, loc, { click = true, steps = 18, pause = 250 } = {}) {
  const b = await loc.boundingBox({ timeout: 4000 }).catch(() => null); if (!b) { console.log("  no box"); return; }
  await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  await pg.waitForTimeout(pause);
  if (click) { await pg.mouse.down(); await pg.waitForTimeout(90); await pg.mouse.up(); }
}

// ---------- 화면 녹화 ----------
export async function startRec(pg, { width = 1440, height = 860 } = {}) {
  const cdp = await pg.context().newCDPSession(pg);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: width * 2, maxHeight: height * 2, everyNthFrame: 1 });
  return { cdp, frames, width, height };
}
// name.mp4 · name.jpg(webm: true면 name.webm도)(포스터 = posterAt초 프레임)를 OUT에 만든다
export async function stopRec(rec, name, { posterAt = null, crf = 31, webm = false, webmCrf = 40 } = {}) {
  await rec.cdp.send("Page.stopScreencast").catch(() => {});
  const { frames, width, height } = rec;
  if (frames.length < 2) { console.log("no frames"); return; }
  const dir = join(OUT, `_frames_${name}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  let list = "";
  frames.forEach((f, i) => {
    const fn = `f${String(i).padStart(5, "0")}.jpg`; writeFileSync(join(dir, fn), Buffer.from(f.data, "base64"));
    const d = i < frames.length - 1 ? Math.max(0.01, frames[i + 1].t - f.t) : 0.6;
    list += `file '${fn}'\nduration ${d.toFixed(3)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
  writeFileSync(join(dir, "list.txt"), list);
  const vf = `scale=${width}:${height}:flags=lanczos,fps=25,format=yuv420p`;
  const total = frames[frames.length - 1].t - frames[0].t + 0.6;
  const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), ...args], { stdio: "inherit" });
  ff(["-vf", vf, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-movflags", "+faststart", join(OUT, `${name}.mp4`)]);
  if (webm) ff(["-vf", vf, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(webmCrf), "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", join(OUT, `${name}.webm`)]);
  const at = posterAt == null ? Math.max(0, total - 0.8) : posterAt;
  let pi = frames.findIndex((f) => f.t - frames[0].t >= at); if (pi < 0) pi = frames.length - 1;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, `f${String(pi).padStart(5, "0")}.jpg`), "-vf", `scale=${width}:${height}:flags=lanczos`, "-q:v", "3", join(OUT, `${name}.jpg`)], { stdio: "inherit" });
  rmSync(dir, { recursive: true, force: true });
  console.log("✓ video", name, total.toFixed(1) + "s", frames.length, "frames");
}
