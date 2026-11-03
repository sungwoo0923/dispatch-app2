// 한 번 로그인해서 메뉴를 차례로 눌러 캡처 — node session.mjs steps.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(new URL("../../package.json", import.meta.url))("playwright");
const stepsFile = process.argv[2];
import { execSync } from "node:child_process";
execSync("node clear.mjs loginSessions", { cwd: new URL(".", import.meta.url).pathname, stdio: "ignore" });
const { default: cfg } = await import(new URL(stepsFile, import.meta.url));
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined, args: ["--ignore-certificate-errors"] });
const ctx = await browser.newContext(cfg.mobile
  ? { ...devices["iPhone 13"], deviceScaleFactor: 3, locale: "ko-KR", timezoneId: "Asia/Seoul", ...(cfg.geo ? { permissions: ["geolocation"], geolocation: cfg.geo } : {}) }
  : { viewport: cfg.viewport || { width: 1600, height: 960 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" });
const { installTiles } = await import("./tiles.mjs");
await installTiles(ctx);
const pg = await ctx.newPage();
pg.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 160)));
if (cfg.login !== false) {
  await pg.goto("http://127.0.0.1:5173" + (cfg.loginPath || "/transport-login"));
  await pg.waitForTimeout(2500);
  if (cfg.loginFn) await cfg.loginFn(pg);
  else {
    await pg.fill('input[placeholder="승인 후 발급된 코드"]', "HG2026");
    await pg.fill('input[placeholder="가입한 회사명"]', "한결로지스");
    await pg.fill('input[type="email"]', cfg.email || "kim@hangyeol.demo");
    await pg.fill('input[type="password"]', "demo1234!");
    await pg.keyboard.press("Enter");
  }
  await pg.waitForTimeout(4000);
  const kick = pg.getByText("기존 로그인 끊고 로그인"); if (await kick.count()) await kick.first().click();
  for (let i = 0; i < 40; i++) { const boot = await pg.getByText("SYNCING").count(); if (!boot) break; await pg.waitForTimeout(1500); }
  await pg.waitForTimeout(cfg.bootWait || 6000);
}
for (const st of cfg.steps) {
  try {
    if (st.goto) { await pg.goto("http://127.0.0.1:5173" + st.goto); await pg.waitForTimeout(st.wait ?? 5000); }
    if (st.run) await st.run(pg);
    await pg.waitForTimeout(st.after ?? 2500);
    if (st.shot) { await pg.screenshot({ path: st.shot, clip: st.clip }); console.log("✓", st.shot); }
  } catch (e) { console.log("✗", st.shot, String(e).slice(0, 200)); }
}
await browser.close();
