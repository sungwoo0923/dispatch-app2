// 📱 폴더블·분할화면 레이아웃 자동 점검 (개발 전용) — 2026-11-04
//  1) npx vite --port 5196   2) node scripts/fold-audit.cjs <tag> [384x700,344x860] [페이지명|home|dept|pc]
//  /preview?demo=1 (src/devDemoData.js 가짜 오더)로 모바일 메뉴 화면을 차례로 열어 스크린샷 + 문제 자동 감지
//  (가로 넘침·형제 요소 겹침·잘린 글자·한 글자씩 줄바꿈·고정 요소가 입력칸을 가림·눌린 입력칸).
//  환경변수: BASE(기본 http://localhost:5196) · OUT(저장 폴더) · FS(글자 크기 배율, 예 1.1) · UIS(화면 크기 배율)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:5196';
const TAG = process.argv[2] || 'before';
const VPF = process.argv[3] || '';
const PGF = process.argv[4] || '';
const FS = process.env.FS || '';
const UIS = process.env.UIS || '';
const OUT = `${process.env.OUT || require('os').tmpdir() + '/kp-fold-audit'}/${TAG}/`;
fs.mkdirSync(OUT, { recursive: true });
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const TAB_UA = 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const VPS = [[320, 640], [344, 860], [384, 700], [412, 690], [460, 720], [600, 800], [884, 460], [884, 1100], [390, 844]]
  .filter(([w, h]) => !VPF || VPF.split(',').includes(`${w}x${h}`));

// ---------- detection (runs in page) ----------
function detect() {
  const W = window.innerWidth, H = window.innerHeight;
  const out = [];
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null;
    return r;
  };
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    const t = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${s}"${t}"`;
  };
  const inPreviewBar = (el) => !!el.closest('[class*="z-[2147483000]"]');
  // clipped by an ancestor scroller / overflow hidden?
  const clippedAncestor = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return a;
    }
    return null;
  };
  const scrollerAncestor = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll)/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1) return a;
    }
    return null;
  };
  const onScreen = (r) => r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
  // 1. horizontal overflow
  const se = document.scrollingElement;
  if (se.scrollWidth > W + 1) {
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = vis(el); if (!r) continue;
      if (r.right > W + 1 && !clippedAncestor(el) && getComputedStyle(el).position !== 'fixed') offenders.push(desc(el) + `@${Math.round(r.right)}`);
      if (offenders.length > 4) break;
    }
    out.push({ k: 'hOverflow', d: `scrollWidth ${se.scrollWidth} > ${W}: ${offenders.join(', ')}` });
  }
  // also fixed / unclipped elements sticking out the right edge
  for (const el of document.querySelectorAll('button,input,select,textarea,a,[role=button]')) {
    const r = vis(el); if (!r || !onScreen(r) || inPreviewBar(el)) continue;
    if ((r.right > W + 2 || r.left < -2) && !scrollerAncestor(el) && !el.closest('[class*="translate-x-full"],[aria-hidden="true"]')) out.push({ k: 'offscreen', d: desc(el) + ` [${Math.round(r.left)},${Math.round(r.right)}]` });
  }
  // 1b. squeezed inputs (text inputs crushed to almost nothing in a flex row)
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=file]),select,textarea')) {
    const r = vis(el); if (!r || !onScreen(r) || inPreviewBar(el)) continue;
    if (r.width < 56 && !el.closest('[class*="sr-only"]')) out.push({ k: 'squeezed', d: desc(el) + ` w=${Math.round(r.width)}` });
  }
  // 1c. collapsed text (titles squeezed to ~0 by neighbours)
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || !onScreen({ ...r.toJSON(), right: r.right + 1, left: r.left })) continue;
    if (inPreviewBar(el) || el.closest('[aria-hidden="true"]')) continue;
    if (r.width < 16 && el.textContent.trim().length >= 2) out.push({ k: 'collapsed', d: desc(el) + ` w=${Math.round(r.width)}` });
  }
  // 2. sibling overlap in flex/grid containers
  const seen = new Set();
  for (const c of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(c);
    if (!/flex|grid/.test(cs.display)) continue;
    const cr = vis(c); if (!cr || !onScreen(cr)) continue;
    if (inPreviewBar(c)) continue;
    const kids = [...c.children].filter((k) => { const p = getComputedStyle(k).position; return p !== 'absolute' && p !== 'fixed' && p !== 'sticky'; })
      .map((k) => [k, vis(k)]).filter(([, r]) => r);
    if (kids.length < 2 || kids.length > 40) continue;
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const [a, ra] = kids[i], [b, rb] = kids[j];
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 3 && oy > 3) {
        // ignore negative-margin stacking (avatars) and intentional -space
        const ma = parseFloat(getComputedStyle(b).marginLeft) < 0 || parseFloat(getComputedStyle(b).marginTop) < 0 || parseFloat(getComputedStyle(a).marginRight) < 0 || parseFloat(getComputedStyle(a).marginBottom) < 0;
        if (ma) continue;
        const key = desc(a) + '|' + desc(b);
        if (seen.has(key)) continue; seen.add(key);
        out.push({ k: 'overlap', d: `${key} (${Math.round(ox)}x${Math.round(oy)})` });
      }
    }
  }
  // 2b. contents overflowing a flex child into its sibling (child overflow visible, scrollWidth > clientWidth)
  // 3. clipped / overflowing nowrap text
  for (const el of document.querySelectorAll('body *')) {
    const r = vis(el); if (!r || !onScreen(r) || inPreviewBar(el)) continue;
    const cs = getComputedStyle(el);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasText) continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      if (cs.textOverflow === 'ellipsis') continue; // intentional truncate
      if (/(auto|scroll)/.test(cs.overflowX)) continue;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') continue;
      out.push({ k: cs.overflowX === 'visible' ? 'textSpill' : 'textClip', d: desc(el) + ` ${el.scrollWidth}>${el.clientWidth}` });
    }
    // 4. per-character wrapping (Korean)
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (txt.length >= 2 && txt.length <= 30 && /[가-힣]/.test(txt)) {
      const fsz = parseFloat(cs.fontSize) || 14;
      let lh = parseFloat(cs.lineHeight); if (!lh) lh = fsz * 1.4;
      const lines = Math.round(r.height / lh);
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      const tops = new Set(rects.map((x) => Math.round(x.top)));
      const nLines = Math.max(tops.size, 1);
      if (nLines >= 2 && el.children.length === 0) {
        const charsPerLine = txt.replace(/\s/g, '').length / nLines;
        if (charsPerLine <= 2.5) out.push({ k: 'charWrap', d: desc(el) + ` ${nLines} lines w=${Math.round(r.width)}` });
        else if (txt.length <= 8 && !/\s/.test(txt) && cs.whiteSpace !== 'normal' ? false : (txt.length <= 6 && nLines >= 2 && (el.tagName === 'BUTTON' || el.closest('button')))) out.push({ k: 'labelWrap', d: desc(el) + ` ${nLines} lines w=${Math.round(r.width)}` });
      }
      void lines;
    }
  }
  // 5. fixed elements covering inputs
  const fixeds = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el); if (cs.position !== 'fixed') return false;
    const r = vis(el); if (!r) return false; if (inPreviewBar(el)) return false;
    if (r.width * r.height > W * H * 0.6) return false; // overlays/backdrops
    return true;
  });
  for (const f of fixeds) {
    const fr = f.getBoundingClientRect();
    for (const inp of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')) {
      if (f.contains(inp)) continue;
      const ir = vis(inp); if (!ir || !onScreen(ir)) continue;
      // sticky header covering content naturally when scrolled — only care if input is also sticky-free & at rest (scrollY 0)
      const ox = Math.min(fr.right, ir.right) - Math.max(fr.left, ir.left);
      const oy = Math.min(fr.bottom, ir.bottom) - Math.max(fr.top, ir.top);
      if (ox > 4 && oy > 4) {
        // is it actually on top?
        const cx = (Math.max(fr.left, ir.left) + Math.min(fr.right, ir.right)) / 2, cy = (Math.max(fr.top, ir.top) + Math.min(fr.bottom, ir.bottom)) / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top && (f.contains(top)) && !inp.contains(top)) out.push({ k: 'fixedCover', d: desc(f) + ' covers ' + desc(inp) });
      }
    }
  }
  // dedupe
  const u = new Map(); for (const o of out) u.set(o.k + o.d, o);
  return [...u.values()];
}

// ---------- navigation ----------
const URL = (extra = '') => `${BASE}/preview?co=${encodeURIComponent('테스트운송')}&plan=pro&demo=1${extra}`;
async function boot(p, extra) {
  await p.goto(URL(extra), { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[aria-label="메뉴"], [aria-label="뒤로"]', { timeout: 45000 });
  await p.waitForTimeout(1800);
  await closePopups(p);
}
async function closePopups(p) {
  for (let i = 0; i < 3; i++) {
    const btn = await p.$('text=닫고 다음');
    if (btn) { await btn.click().catch(() => {}); await p.waitForTimeout(300); } else break;
  }
}
async function openMenu(p) {
  await p.click('[aria-label="메뉴"]', { timeout: 5000 });
  await p.waitForTimeout(600);
}
async function clickDrawer(p, label) {
  const items = await p.$$('.kp-m-drawer-item');
  for (const it of items) {
    const t = (await it.innerText()).split('\n')[0].trim();
    if (t === label) { await it.scrollIntoViewIfNeeded(); await it.click(); await p.waitForTimeout(1500); await closePopups(p); return true; }
  }
  return false;
}

async function shoot(p, name, results, vp) {
  const issues = await p.evaluate(detect).catch((e) => [{ k: 'error', d: String(e).slice(0, 100) }]);
  const file = `${OUT}${vp}_${name.replace(/[^\w가-힣]+/g, '_')}.png`;
  await p.screenshot({ path: file }).catch(() => {});
  results.push({ vp, page: name, n: issues.length, issues, file });
  console.log(`[${vp}] ${name}: ${issues.length}`);
}

async function runVp([w, h]) {
  const vp = `${w}x${h}`;
  const results = [];
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, userAgent: PHONE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'ko-KR' });
  if (FS || UIS) await ctx.addInitScript(([v, u]) => { try { if (v) localStorage.setItem('fontScale', v); if (u) localStorage.setItem('uiScale_browser', u); } catch {} }, [FS, UIS]);
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  try {
    await boot(p);
    if (!PGF || PGF === 'home') {
      await shoot(p, 'home', results, vp);
      // 세부검색
      const ds = await p.$('button:has-text("세부검색")');
      if (ds) { await ds.click().catch(() => {}); await p.waitForTimeout(800); await shoot(p, 'home_detailFilter', results, vp); await p.keyboard.press('Escape'); await boot(p); }
      // scroll a bit and check card list + FAB
      await p.mouse.wheel(0, 600); await p.waitForTimeout(500); await shoot(p, 'home_scrolled', results, vp);
      // order detail
      await boot(p);
      const card = await p.$('.kp-m-card');
      if (card) { await card.click().catch(() => {}); await p.waitForTimeout(1200); await shoot(p, 'order_detail', results, vp); }
      // menu itself
      await boot(p); await openMenu(p); await shoot(p, 'menu', results, vp);
    }
    await boot(p); await openMenu(p);
    const labels = (await p.$$eval('.kp-m-drawer-item', (els) => els.map((e) => e.innerText.split('\n')[0].trim()))).filter(Boolean);
    for (const lb of labels) {
      if (PGF && PGF !== lb) continue;
      if (lb === '등록내역') continue;
      try {
        await boot(p); await openMenu(p);
        const ok = await clickDrawer(p, lb);
        if (!ok) { console.log('no item', lb); continue; }
        await shoot(p, lb, results, vp);
        if (lb === '화물등록') { await p.mouse.wheel(0, 900); await p.waitForTimeout(500); await shoot(p, lb + '_scrolled', results, vp); }
      } catch (e) { console.log('fail', vp, lb, String(e).slice(0, 120)); }
    }
    // dept pages
    if (!PGF || PGF === 'dept') {
      for (const r of ['test', 'hrManager']) {
        try { await boot(p, `&role=${r}`); await shoot(p, `dept_${r}`, results, vp); } catch (e) { console.log('dept fail', r); }
      }
    }
  } catch (e) { console.log('VP FAIL', vp, String(e).slice(0, 200)); }
  // PC / tablet app at unfolded sizes
  if ((!PGF || PGF === 'pc') && w >= 800) {
    const ctx2 = await b.newContext({ viewport: { width: w, height: h }, userAgent: TAB_UA, hasTouch: true, deviceScaleFactor: 1, locale: 'ko-KR' });
    const p2 = await ctx2.newPage();
    try {
      await p2.goto(URL(), { waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(12000);
      await shoot(p2, 'TabletUA', results, vp);
    } catch (e) { console.log('pc fail', String(e).slice(0, 100)); }
    // Chrome "desktop site" on Android (X11 Linux UA) -> DispatchApp (PC)
    const ctx3 = await b.newContext({ viewport: { width: w, height: h }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', hasTouch: true, deviceScaleFactor: 1, locale: 'ko-KR' });
    const p3 = await ctx3.newPage();
    try {
      await p3.goto(URL(), { waitUntil: 'domcontentloaded' }); await p3.waitForTimeout(15000);
      await shoot(p3, 'PC_desktopUA', results, vp);
    } catch (e) { console.log('pc3 fail', String(e).slice(0, 100)); }
  }
  await b.close();
  return results;
}

(async () => {
  const all = (await Promise.all(VPS.map(runVp))).flat();
  fs.writeFileSync(`${OUT}results.json`, JSON.stringify(all, null, 1));
  const byVp = {};
  for (const r of all) { byVp[r.vp] = byVp[r.vp] || { total: 0, kinds: {} }; byVp[r.vp].total += r.n; for (const i of r.issues) byVp[r.vp].kinds[i.k] = (byVp[r.vp].kinds[i.k] || 0) + 1; }
  console.log(JSON.stringify(byVp, null, 1));
})();
