#!/usr/bin/env node
// LogisWeb 매일 점검 — 실행 중인 개발 서버들을 Playwright로 돌아다니며 오류를 찾는다.
//
//   node tools/healthcheck/run.cjs \
//     --app http://127.0.0.1:5236 --hub http://127.0.0.1:5237 --home http://127.0.0.1:5238 \
//     [--out healthcheck-results] [--roles admin,viewer] [--only app-pc,app-m,dialogs,hub,home]
//
// 결과: <out>/report.json · <out>/summary.md · <out>/shots/*.png(문제가 난 화면만)
// 종료코드: 문제(fail)가 하나라도 있으면 1.
"use strict";
const fs = require("fs");
const path = require("path");

// ── 인자 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : process.env["HC_" + k.toUpperCase()] || d; };
const APP = arg("app", "http://127.0.0.1:5236").replace(/\/$/, "");
const HUB = arg("hub", "").replace(/\/$/, "");
const HOME = arg("home", "").replace(/\/$/, "");
const OUT = path.resolve(arg("out", "healthcheck-results"));
const SHOTS = path.join(OUT, "shots");
const ALL_ROLES = ["admin", "exec", "test", "hrManager", "hrAcct", "allMgr", "acctStaff", "hrStaff", "legalMgr", "legalStaff", "devMgr", "devStaff", "user", "viewer"];
const ROLES = arg("roles", ALL_ROLES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const ONLY = new Set(arg("only", "app-pc,app-m,dialogs,hub,home").split(","));
const CONC = Math.max(1, +arg("concurrency", "3"));
const STUCK_MS = +arg("stuck-ms", "15000");
// 로컬에서 프로젝트의 playwright 버전과 설치된 브라우저가 다르면 HC_PLAYWRIGHT=/경로/playwright 로 바꿔 쓴다.
const { chromium, devices } = require(process.env.HC_PLAYWRIGHT || "playwright");

// 허용 목록(allowlist.json) — 실제 오류가 아닌 것(막힌 외부 주소 · 무해한 경고)만 넣는다.
//  offline 항목은 HC_OFFLINE=1(외부 인터넷이 막힌 샌드박스)에서만 더해진다.
const OFFLINE = process.env.HC_OFFLINE === "1";
const ALLOW = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, "allowlist.json"), "utf8"));
  const re = (k) => [...(j[k] || []), ...((OFFLINE && j.offline && j.offline[k]) || [])].map((x) => new RegExp(typeof x === "string" ? x : x.pattern));
  return { console: re("console"), pageerror: re("pageerror"), overflow: re("overflow"), loading: re("loading"), externalHosts: re("externalHosts") };
})();
const ORIGINS = [APP, HUB, HOME].filter(Boolean).map((u) => new URL(u).host);
const hostOf = (u) => { try { return new URL(u).host; } catch { return ""; } };
// 우리 서버가 아닌 곳이고 허용 목록에 있는 주소면 true
const okExternal = (u) => { const h = hostOf(u); return !!h && !ORIGINS.includes(h) && ALLOW.externalHosts.some((r) => r.test(h)); };
const allowed = (list, s) => list.some((r) => r.test(s));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s) => String(s).replace(/[^\w가-힣]+/g, "_").replace(/^_|_$/g, "").slice(0, 70);
fs.mkdirSync(SHOTS, { recursive: true });

const issues = []; // { level: fail|warn, suite, ctx, where, kind, msg, shot }
const visited = []; // { suite, ctx, where }
const stats = {};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);

const PC = { viewport: { width: 1440, height: 900 } };
const MOBILE = { ...devices["iPhone 13"] };
const CTX_BASE = { locale: "ko-KR", timezoneId: "Asia/Seoul", acceptDownloads: true };

// ── 공통: 페이지 감시 ───────────────────────────────────────────────────
// 페이지마다 현재 위치(where)를 들고 있다가 이벤트(오류)를 그 위치에 붙인다.
function watch(page, suite, ctx) {
  const st = { where: "boot", pending: [], suite, ctx };
  const add = (kind, msg) => st.pending.push({ kind, msg: String(msg).slice(0, 600), where: st.where });
  page.on("pageerror", (e) => {
    const m = `${e.message || e}`;
    if (allowed(ALLOW.pageerror, m)) return;
    add("pageerror", m + (e.stack ? " | " + String(e.stack).split("\n").slice(1, 3).map((x) => x.trim()).join(" | ") : ""));
  });
  page.on("console", (m) => {
    const t = m.text();
    const type = m.type();
    // 자원 불러오기 실패는 아래 requestfailed · response가 주소와 함께 판단한다
    if (/^Failed to load resource/.test(t)) return;
    const reactWarn = type === "warning" && /^Warning: |React (does not|has detected)|Each child in a list|unique "key"|Cannot update a component|Maximum update depth|act\(/.test(t);
    if (type !== "error" && !reactWarn) return;
    if (allowed(ALLOW.console, t)) return;
    add(reactWarn ? "react-warning" : /^Warning: |React/.test(t) ? "react-error" : "console-error", t);
  });
  page.on("requestfailed", (r) => {
    const err = (r.failure() || {}).errorText || "";
    if (/ERR_ABORTED/.test(err)) return; // 화면 이동·동영상 끊기 등 브라우저가 스스로 멈춘 요청
    if (okExternal(r.url())) return;
    add("request-failed", `${err} ${r.url().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() < 400 || okExternal(r.url())) return;
    add("http", `HTTP ${r.status()} ${r.url().slice(0, 200)}`);
  });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  return st;
}
// 쌓인 이벤트 오류를 꺼내서 문제로 등록. 새 문제가 있었으면 true.
async function flush(page, st, suite, ctx, extra = []) {
  const list = [...st.pending.map((p) => ({ ...p, level: "fail" })), ...extra];
  st.pending = [];
  if (!list.length) return false;
  let shot = null;
  if (list.some((x) => x.level === "fail")) {
    shot = `shots/${safe(`${suite}_${ctx}_${list[0].where}`)}_${issues.length}.png`;
    await page.screenshot({ path: path.join(OUT, shot) }).catch(() => { shot = null; });
  }
  for (const x of list) issues.push({ level: x.level, suite, ctx, where: x.where, kind: x.kind, msg: x.msg, shot });
  return true;
}

// ── 화면 상태 점검(가로 넘침 · 오류 화면 · 로딩 멈춤) ───────────────────
const PAGE_STATE = () => {
  const se = document.scrollingElement || document.documentElement;
  const over = se.scrollWidth - window.innerWidth;
  let wide = [];
  if (over > 2) {
    wide = [...document.querySelectorAll("body *")].filter((e) => { const b = e.getBoundingClientRect(); return b.right > window.innerWidth + 2 && b.width > 0 && getComputedStyle(e).position !== "fixed"; })
      .slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 60)} right=${Math.round(e.getBoundingClientRect().right)} "${(e.textContent || "").trim().slice(0, 24)}"`);
  }
  const loading = [...document.querySelectorAll("body *")].filter((e) => e.children.length === 0 && /불러오는 중|로딩 중/.test(e.textContent || "") && e.offsetParent).map((e) => e.textContent.trim().slice(0, 50)).slice(0, 3);
  const txt = document.body ? document.body.innerText : "";
  const m = txt.match(/.{0,40}(문제가 발생했|오류가 발생했습니다|Something went wrong|화면을 그리지 못).{0,80}/);
  return { over, wide, loading, boundary: m ? m[0] : null };
};
async function checkState(page, st, suite, ctx, { since = Date.now(), overflow = true } = {}) {
  let s = await page.evaluate(PAGE_STATE).catch((e) => ({ err: String(e.message || e).slice(0, 200) }));
  // "불러오는 중"이 보이면 화면을 연 때부터 STUCK_MS가 지날 때까지 기다려 본다
  while (s.loading && s.loading.length && !s.loading.every((l) => allowed(ALLOW.loading, l)) && Date.now() - since < STUCK_MS) {
    await sleep(1000);
    s = await page.evaluate(PAGE_STATE).catch(() => s);
  }
  const extra = [];
  const w = st.where;
  if (s.err) extra.push({ level: "warn", kind: "evaluate", msg: s.err, where: w });
  if (overflow && s.over > 2 && !allowed(ALLOW.overflow, `${suite}|${ctx}|${w}`)) extra.push({ level: "fail", kind: "overflow", msg: `가로 넘침 ${s.over}px — ${s.wide.join(" ; ")}`, where: w });
  const stuck = (s.loading || []).filter((l) => !allowed(ALLOW.loading, l));
  if (stuck.length) extra.push({ level: "fail", kind: "stuck-loading", msg: `${STUCK_MS / 1000}초 넘게 로딩: ${stuck.join(" / ")}`, where: w });
  if (s.boundary) extra.push({ level: "fail", kind: "error-screen", msg: s.boundary, where: w });
  visited.push({ suite, ctx, where: w });
  return flush(page, st, suite, ctx, extra);
}

// 자동으로 뜨는 팝업(출근 확인 · 공지 · 안내) 닫기
async function closePopups(page) {
  for (let i = 0; i < 5; i++) {
    const c = await page.evaluate(() => {
      const texts = ["아니오 (휴무)", "아니오", "닫기", "나중에", "오늘 하루 보지 않기", "확인했어요", "다음에"];
      const fixedAnc = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.position === "fixed" && +s.zIndex >= 50) return true; } return false; };
      for (const t of texts) {
        const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && x.textContent.trim() === t && fixedAnc(x));
        if (b) { b.click(); return t; }
      }
      return null;
    }).catch(() => null);
    if (!c) break;
    await sleep(500);
  }
}
async function closeModals(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => {}); await sleep(200); }
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].filter((x) => x.offsetParent && /^(닫기|취소|✕|×|X)$/.test(x.innerText.trim())).slice(0, 3).forEach((x) => x.click());
  }).catch(() => {});
  await sleep(300);
}

// 화면 안의 탭(role=tab)을 차례로 눌러 본다
async function crawlTabs(page, st, suite, ctx, base) {
  const tabs = await page.$$eval("[role=tab]", (els) => els.filter((e) => e.offsetParent && !e.closest("[role=dialog]")).map((e) => (e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).filter(Boolean)).catch(() => []);
  const uniq = [...new Set(tabs)].slice(0, 10);
  for (const t of uniq.slice(1)) { // 첫 탭은 이미 보고 있는 화면
    st.where = `${base} [탭 ${t}]`;
    const since = Date.now();
    const ok = await page.evaluate((t) => { const b = [...document.querySelectorAll("[role=tab]")].find((e) => e.offsetParent && (e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim() === t); if (!b) return false; b.click(); return true; }, t).catch(() => false);
    if (!ok) continue;
    await sleep(900);
    await checkState(page, st, suite, ctx, { since });
  }
}

const previewUrl = (role) => `${APP}/preview?co=${encodeURIComponent("테스트운송")}&plan=pro&demo=1${role === "admin" ? "" : `&role=${role}`}`;

async function boot(page, st, role, sel) {
  st.where = "boot";
  const since = Date.now();
  await page.goto(previewUrl(role), { waitUntil: "domcontentloaded", timeout: 180000 });
  let ok = await page.waitForSelector(sel, { timeout: 180000 }).then(() => true).catch(() => false);
  await sleep(2500);
  // vite 개발 서버가 같은 모듈을 처음 변환하는 중에 여러 창이 동시에 요청하면 드물게 동적 import가 실패한다
  //  (배포 빌드에는 없는 현상). 부팅 때 한 번만 다시 불러오고 '참고'로 남긴다. 두 번째도 나면 그대로 문제로 잡힌다.
  if (st.pending.some((p) => /Failed to fetch dynamically imported module|error loading dynamically imported module/.test(p.msg))) {
    issues.push({ level: "warn", suite: st.suite, ctx: st.ctx, where: "boot", kind: "dev-retry", msg: "개발 서버 모듈 변환 경합으로 동적 import 실패 — 한 번 다시 불러옴: " + st.pending[0].msg.slice(0, 160) });
    st.pending = [];
    await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
    ok = await page.waitForSelector(sel, { timeout: 180000 }).then(() => true).catch(() => false);
    await sleep(2500);
  }
  await closePopups(page); await sleep(400); await closePopups(page);
  return { ok, ms: Date.now() - since };
}

// ── 1) 본 프로그램 PC ───────────────────────────────────────────────────
async function appPc(browser, role) {
  const suite = "app-pc";
  const ctx = await browser.newContext({ ...PC, ...CTX_BASE });
  const page = await ctx.newPage();
  const st = watch(page, suite, role);
  let n = 0;
  try {
    const b = await boot(page, st, role, ".kp-nav-btn");
    if (!b.ok) { await flush(page, st, suite, role, [{ level: "fail", kind: "boot", msg: "메뉴(.kp-nav-btn)가 3분 안에 나타나지 않음", where: "boot" }]); return; }
    st.where = "HOME"; await checkState(page, st, suite, role); n++;
    const menus = await page.$$eval(".kp-nav-btn", (bs) => bs.filter((b) => !b.disabled && b.offsetParent).map((b) => b.textContent.trim()));
    for (let mi = 0; mi < menus.length; mi++) {
      const m = menus[mi];
      st.where = m;
      const since = Date.now();
      const ok = await page.evaluate((i) => { const b = [...document.querySelectorAll(".kp-nav-btn")].filter((x) => !x.disabled && x.offsetParent)[i]; if (!b) return false; b.click(); return true; }, mi).catch(() => false);
      if (!ok) { issues.push({ level: "warn", suite, ctx: role, where: m, kind: "nav", msg: "메뉴 버튼을 찾지 못함" }); continue; }
      await sleep(2200); await closePopups(page);
      await checkState(page, st, suite, role, { since }); n++;
      const subs = await page.$$eval(".kp-subnav-item", (bs) => bs.map((b) => b.textContent.replace(/\s+/g, " ").trim())).catch(() => []);
      if (!subs.length) await crawlTabs(page, st, suite, role, m);
      for (let i = 0; i < subs.length; i++) {
        const where = `${m} > ${subs[i]}`;
        st.where = where;
        const since2 = Date.now();
        const ok2 = await page.evaluate((i) => { const it = document.querySelectorAll(".kp-subnav-item")[i]; if (!it) return false; it.click(); return true; }, i).catch(() => false);
        if (!ok2) break;
        await sleep(1300); await closePopups(page);
        await checkState(page, st, suite, role, { since: since2 }); n++;
        await crawlTabs(page, st, suite, role, where);
      }
    }
  } catch (e) {
    await flush(page, st, suite, role, [{ level: "fail", kind: "crash", msg: String(e.message || e).slice(0, 400), where: st.where }]);
  } finally {
    await flush(page, st, suite, role);
    stats[`${suite}:${role}`] = n;
    await ctx.close();
  }
}

// ── 2) 본 프로그램 모바일(iPhone 13) ────────────────────────────────────
const MENU_BTN = "button[aria-label='메뉴']";
const SKIP_M = /로그아웃|화면으로 전환|전체 메뉴 보기|임원 화면으로|PC 화면|PC버전/;
async function appMobile(browser, role) {
  const suite = "app-m";
  const ctx = await browser.newContext({ ...MOBILE, ...CTX_BASE });
  const page = await ctx.newPage();
  const st = watch(page, suite, role);
  let n = 0;
  try {
    const b = await boot(page, st, role, MENU_BTN);
    if (!b.ok) { await flush(page, st, suite, role, [{ level: "fail", kind: "boot", msg: "메뉴 버튼이 3분 안에 나타나지 않음", where: "boot" }]); return; }
    st.where = "HOME"; await checkState(page, st, suite, role); n++;
    await page.click(MENU_BTN).catch(() => {}); await sleep(700);
    const items = await page.$$eval("[data-kp-menu]", (bs) => [...new Set(bs.map((b) => b.getAttribute("data-kp-menu")))]).catch(() => []);
    await page.keyboard.press("Escape").catch(() => {});
    for (const it of items) {
      if (SKIP_M.test(it)) continue;
      st.where = it;
      // 메뉴 버튼이 안 보이는 화면에서 끝났으면 처음부터 다시 연다
      if (!(await page.$(MENU_BTN).then((h) => h && h.isVisible()).catch(() => false))) {
        await boot(page, st, role, MENU_BTN); st.where = it;
      }
      await page.click(MENU_BTN, { timeout: 5000 }).catch(() => {});
      await sleep(600);
      const since = Date.now();
      const ok = await page.evaluate((k) => { const b = [...document.querySelectorAll("[data-kp-menu]")].find((x) => x.getAttribute("data-kp-menu") === k && x.offsetParent); if (!b) return false; b.click(); return true; }, it).catch(() => false);
      if (!ok) { issues.push({ level: "warn", suite, ctx: role, where: it, kind: "nav", msg: "메뉴 항목을 찾지 못함" }); continue; }
      await sleep(2200); await closePopups(page);
      await checkState(page, st, suite, role, { since }); n++;
      await crawlTabs(page, st, suite, role, it);
    }
  } catch (e) {
    await flush(page, st, suite, role, [{ level: "fail", kind: "crash", msg: String(e.message || e).slice(0, 400), where: st.where }]);
  } finally {
    await flush(page, st, suite, role);
    stats[`${suite}:${role}`] = n;
    await ctx.close();
  }
}

// ── 3) 주요 창(대화상자) — 관리자 PC ────────────────────────────────────
const DIALOGS = [
  ["배차관리", ["오더복사", "오더스캔", "정기오더", "담당자·차량 조회", "다중등록", "운임조회", "단가표", "세부검색", "기사복사", "업로드링크", "더보기"]],
  ["실시간배차현황", ["세부검색", "더보기", "엑셀다운", "선택삭제"]],
  ["배차현황", ["세부검색", "엑셀다운"]],
  ["기사관리", ["+ 기사 등록", "대용량 업로드", "기사정리", "앱 안내 보내기"]],
  ["거래처관리", ["+ 신규등록", "대용량 업로드", "거래처정리"]],
  ["단가표", ["직접 작성", "발행 이력", "단가표 생성"]],
  ["정산관리", ["세부검색", "예약메일", "직접 조회", "작성", "열기"]],
  ["지입차관리", ["실시간 위치 지도"]],
  ["매출관리", ["세부검색", "PNG", "목표 설정"]],
];
async function dialogs(browser) {
  const suite = "dialogs";
  const role = "admin";
  const ctx = await browser.newContext({ ...PC, ...CTX_BASE });
  const page = await ctx.newPage();
  const st = watch(page, suite, role);
  let n = 0;
  try {
    const b = await boot(page, st, role, ".kp-nav-btn");
    if (!b.ok) { await flush(page, st, suite, role, [{ level: "fail", kind: "boot", msg: "부팅 실패", where: "boot" }]); return; }
    for (const [m, btns] of DIALOGS) {
      st.where = m;
      const ok = await page.evaluate((m) => { const b = [...document.querySelectorAll(".kp-nav-btn")].find((x) => x.textContent.trim().startsWith(m)); if (!b) return false; b.click(); return true; }, m);
      if (!ok) { issues.push({ level: "warn", suite, ctx: role, where: m, kind: "nav", msg: "메뉴 없음" }); continue; }
      await sleep(2200); await closePopups(page);
      for (const l of btns) {
        st.where = `${m} > [${l}]`;
        const since = Date.now();
        const press = () => page.evaluate((l) => { const bs = [...document.querySelectorAll("button")].filter((x) => x.offsetParent && x.innerText.replace(/\s+/g, " ").trim() === l && !x.closest(".kp-side-aside")); if (!bs.length) return false; bs[0].click(); return true; }, l);
        let r = await press();
        if (!r) { // 앞 버튼이 다른 화면으로 옮겼거나 창이 남아 있으면 메뉴를 다시 연다
          await closeModals(page);
          await page.evaluate((m) => [...document.querySelectorAll(".kp-nav-btn")].find((x) => x.textContent.trim().startsWith(m))?.click(), m);
          await sleep(1800); await closePopups(page);
          r = await press();
        }
        if (!r) { issues.push({ level: "warn", suite, ctx: role, where: st.where, kind: "dialog-missing", msg: `"${l}" 버튼을 찾지 못함(이름이 바뀌었으면 run.cjs의 DIALOGS 목록 수정)` }); continue; }
        await sleep(1300);
        await checkState(page, st, suite, role, { since, overflow: true }); n++;
        await closeModals(page);
      }
      if (["실시간배차현황", "배차현황"].includes(m)) {
        st.where = `${m} > [행 더블클릭]`;
        const td = await page.$("table tbody tr td:nth-child(5)");
        if (td) { const since = Date.now(); await td.dblclick().catch(() => {}); await sleep(1300); await checkState(page, st, suite, role, { since }); n++; await closeModals(page); }
      }
    }
  } catch (e) {
    await flush(page, st, suite, role, [{ level: "fail", kind: "crash", msg: String(e.message || e).slice(0, 400), where: st.where }]);
  } finally {
    await flush(page, st, suite, role);
    stats[`${suite}:${role}`] = n;
    await ctx.close();
  }
}

// ── 4) 허브(cafe-site) 공개 화면 · 5) 홈페이지(landing-site) ────────────
async function simplePages(browser, suite, base, pages, { scroll = false } = {}) {
  for (const [vpName, vp] of [["1440", PC], ["390", MOBILE]]) {
    const ctx = await browser.newContext({ ...vp, ...CTX_BASE });
    const page = await ctx.newPage();
    const st = watch(page, suite, vpName);
    for (const u of pages) {
      st.where = u;
      const since = Date.now();
      await page.goto(base + u, { waitUntil: "load", timeout: 60000 }).catch((e) => { st.pending.push({ kind: "goto", msg: String(e.message).slice(0, 200), where: u }); return null; });
      await sleep(1500);
      if (scroll) {
        const h = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);
        for (let y = 0; y < h; y += 600) { await page.evaluate((yy) => window.scrollTo(0, yy), y).catch(() => {}); await sleep(100); }
        await sleep(600);
        const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && i.src.startsWith(location.origin)).map((i) => i.src.slice(location.origin.length))).catch(() => []);
        for (const b of broken) st.pending.push({ kind: "broken-image", msg: b, where: u });
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      }
      await checkState(page, st, suite, vpName, { since });
    }
    stats[`${suite}:${vpName}`] = pages.length;
    await ctx.close();
  }
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function pool(tasks, n) {
  const q = [...tasks];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await q.shift()(); }));
}

(async () => {
  // HC_CHROME — 미리 설치된 Chromium 경로(저장소 Playwright 버전과 브라우저가 다를 때)
  const browser = await chromium.launch(process.env.HC_CHROME ? { executablePath: process.env.HC_CHROME } : {});
  const tasks = [];
  if (ONLY.has("home") && HOME) tasks.push(async () => { log("홈페이지"); await simplePages(browser, "home", HOME, ["/", "/login.html"], { scroll: true }); });
  if (ONLY.has("hub") && HUB) tasks.push(async () => { log("허브 공개 화면"); await simplePages(browser, "hub", HUB, ["/", "/login", "/signup", "/login?role=driver&mode=hub", "/login?role=carrier&mode=logisweb", "/login?role=shipper&mode=hub", "/exchange"]); });
  if (ONLY.has("dialogs") && ROLES.includes("admin")) tasks.push(async () => { log("주요 창(관리자)"); await dialogs(browser); log("주요 창 끝"); });
  for (const r of ROLES) {
    if (ONLY.has("app-pc")) tasks.push(async () => { log("PC", r); await appPc(browser, r); log("PC", r, "끝", stats[`app-pc:${r}`], "화면"); });
    if (ONLY.has("app-m")) tasks.push(async () => { log("모바일", r); await appMobile(browser, r); log("모바일", r, "끝", stats[`app-m:${r}`], "화면"); });
  }
  // 워밍업 — vite가 src 모듈을 미리 변환해 두게(동시 부팅 때 시간 초과·변환 경합 방지)
  if (ONLY.has("app-pc") || ONLY.has("app-m") || ONLY.has("dialogs")) {
    log("워밍업", APP);
    const root = path.resolve(__dirname, "../..");
    const files = [];
    const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(jsx?|tsx?)$/.test(f.name)) files.push(path.relative(root, p).split(path.sep).join("/")); } };
    walk(path.join(root, "src"));
    await pool(files.map((f) => () => fetch(`${APP}/${f}`).then((r) => r.arrayBuffer()).catch(() => {})), 4);
    for (const [vp, sel] of [[PC, ".kp-nav-btn"], [MOBILE, MENU_BTN]]) {
      const c = await browser.newContext(vp); const p = await c.newPage();
      await p.goto(previewUrl("admin"), { timeout: 300000 }).catch(() => {});
      await p.waitForSelector(sel, { timeout: 300000 }).catch(() => {});
      await sleep(3000);
      await c.close();
    }
    log("워밍업 끝 —", files.length, "모듈");
  }
  await pool(tasks, CONC);
  await browser.close();

  const fails = issues.filter((i) => i.level === "fail");
  const warns = issues.filter((i) => i.level === "warn");
  const report = { startedAt: new Date(t0).toISOString(), durationSec: Math.round((Date.now() - t0) / 1000), app: APP, hub: HUB, home: HOME, roles: ROLES, screensVisited: visited.length, stats, failCount: fails.length, warnCount: warns.length, issues, visited };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const md = [
    `# LogisWeb 매일 점검 결과`,
    ``,
    `- 시각: ${report.startedAt} · 소요 ${report.durationSec}초`,
    `- 둘러본 화면: ${visited.length}개 (${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join(", ")})`,
    `- **문제 ${fails.length}건** · 참고 ${warns.length}건`,
    ``,
  ];
  const table = (rows, title) => {
    if (!rows.length) return;
    md.push(`## ${title}`, ``, `| 구역 | 대상 | 위치 | 종류 | 내용 | 화면 |`, `|---|---|---|---|---|---|`);
    for (const i of rows) md.push(`| ${i.suite} | ${i.ctx} | ${esc(i.where)} | ${i.kind} | ${esc(i.msg).slice(0, 300)} | ${i.shot ? `[보기](${i.shot})` : ""} |`);
    md.push("");
  };
  table(fails, "문제");
  table(warns, "참고(실패로 치지 않음)");
  if (!fails.length) md.push("모든 점검을 통과했습니다.");
  fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n") + "\n");
  log(`끝 — 화면 ${visited.length}개 · 문제 ${fails.length} · 참고 ${warns.length} → ${OUT}`);
  for (const f of fails.slice(0, 40)) console.log(`  ✗ [${f.suite}/${f.ctx}] ${f.where} · ${f.kind} · ${f.msg.slice(0, 200)}`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
