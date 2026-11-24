// ======================= src/promo/promoRender.js =======================
// 🎬 2026-11-23 영상 편집실 — 장면 데이터(promoKit.js)를 캔버스에 그린다. 미리보기 · 영상 만들기가 같은 그림을 쓴다.
//  renderFrame(ctx, 프로젝트, 시간표, t초, 자료) — 자료: { imgs: Map(주소→img), vids: Map(장면id→video), logo: img }
import { LIBRARY, libUrl } from "./promoKit";

const FONT = 'Pretendard, "Pretendard Variable", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const easeIO = (x) => { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const ap = (lt, delay, dur = 0.5) => ease((lt - delay) / dur);
const font = (w, s) => `${w} ${Math.round(s)}px ${FONT}`;

export const THEME = {
  navy: { bg0: "#1B2B4B", bg1: "#0F1A30", bg2: "#08101F", ink: "#FFFFFF", sub: "#D3DFF5", chip: "#1E3159", chipLine: "rgba(143,176,240,.4)", grid: "rgba(143,176,240,.07)", card: "rgba(30,49,89,.92)", line: "rgba(143,176,240,.3)" },
  night: { bg0: "#0b1322", bg1: "#060b15", bg2: "#020409", ink: "#FFFFFF", sub: "#C9D5EC", chip: "#172440", chipLine: "rgba(143,176,240,.35)", grid: "rgba(143,176,240,.05)", card: "rgba(23,36,64,.92)", line: "rgba(143,176,240,.25)" },
  light: { bg0: "#FFFFFF", bg1: "#F1F5FC", bg2: "#DFE8F7", ink: "#0F1A30", sub: "#4A5B7E", chip: "#FFFFFF", chipLine: "rgba(45,91,216,.35)", grid: "rgba(15,26,48,.05)", card: "rgba(255,255,255,.95)", line: "rgba(45,91,216,.25)" },
};
const OK = "#2BD17E", RED = "#FF5A5F";

function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function shadow(ctx, blur, oy = 0, c = "rgba(0,0,0,.55)") { ctx.shadowColor = c; ctx.shadowBlur = blur; ctx.shadowOffsetY = oy; }
function noShadow(ctx) { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

// ── 강조(**글자**) 있는 여러 줄 글 ──
function parseHl(s) { const out = []; String(s).split(/(\*\*[^*]+\*\*)/).forEach((p) => { if (!p) return; const m = p.match(/^\*\*([^*]+)\*\*$/); out.push(m ? { t: m[1], hl: true } : { t: p, hl: false }); }); return out; }
function wrapRich(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    const words = []; parseHl(para).forEach((sg) => sg.t.split(/(\s+)/).forEach((w) => { if (w) words.push({ t: w, hl: sg.hl }); }));
    let line = [], w = 0;
    for (const wd of words) {
      const sp = /^\s+$/.test(wd.t); const ww = ctx.measureText(wd.t).width;
      if (sp) { if (line.length) { line.push({ ...wd, w: ww }); w += ww; } continue; }
      if (ww > maxW) { for (const ch of wd.t) { const cw = ctx.measureText(ch).width; if (w + cw > maxW && line.length) { lines.push(line); line = []; w = 0; } line.push({ t: ch, hl: wd.hl, w: cw }); w += cw; } continue; }
      if (line.length && w + ww > maxW) { while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop(); lines.push(line); line = []; w = 0; }
      line.push({ ...wd, w: ww }); w += ww;
    }
    while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
    lines.push(line);
  }
  return lines;
}
// 반환: 그린 높이
function rich(ctx, text, x, y, o) {
  const { size, weight = 800, maxW, align = "center", color, hl, lh = 1.22, alpha = 1, measureOnly = false, shadowBlur = 0 } = o;
  if (!text) return 0;
  ctx.font = font(weight, size);
  const lines = wrapRich(ctx, text, maxW);
  if (measureOnly) return lines.length * size * lh;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.textBaseline = "top";
  if (shadowBlur) shadow(ctx, shadowBlur, 6, "rgba(0,0,0,.6)");
  lines.forEach((ln, i) => {
    const lw = ln.reduce((a, s) => a + s.w, 0);
    let cx = align === "center" ? x - lw / 2 : align === "right" ? x - lw : x;
    const cy = y + i * size * lh + size * (lh - 1) / 2;
    for (const sg of ln) { ctx.fillStyle = sg.hl ? hl : color; ctx.fillText(sg.t, cx, cy); cx += sg.w; }
  });
  ctx.restore();
  return lines.length * size * lh;
}
function chip(ctx, text, x, y, size, th, align = "center", alpha = 1) {
  if (!text) return 0;
  ctx.font = font(700, size); const w = ctx.measureText(text).width + size * 1.6, h = size * 1.9;
  const x0 = align === "center" ? x - w / 2 : x;
  ctx.save(); ctx.globalAlpha *= alpha;
  rr(ctx, x0, y, w, h, h / 2); ctx.fillStyle = th.chip; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = th.chipLine; ctx.stroke();
  ctx.fillStyle = th.sub; ctx.textBaseline = "middle"; ctx.fillText(text, x0 + size * 0.8, y + h / 2 + 1);
  ctx.restore();
  return h;
}
function wordmark(ctx, cx, y, size, th, accent, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = font(900, size); ctx.textBaseline = "top";
  const a = ctx.measureText("Logis").width, b = ctx.measureText("Web").width; const x = cx - (a + b) / 2;
  ctx.fillStyle = th.ink; ctx.fillText("Logis", x, y); ctx.fillStyle = accent; ctx.fillText("Web", x + a, y);
  ctx.restore(); return size * 1.15;
}

// ── 배경(테마별로 한 번 그려 두고 재사용) ──
const bgCache = new Map();
function background(W, H, theme, accent) {
  const k = `${W}x${H}|${theme}|${accent}`; if (bgCache.has(k)) return bgCache.get(k);
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); const th = THEME[theme] || THEME.navy;
  const gr = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H) * 1.05);
  gr.addColorStop(0, th.bg0); gr.addColorStop(0.45, th.bg1); gr.addColorStop(1, th.bg2); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const u = Math.min(W, H) / 1080; const step = 60 * u; g.strokeStyle = th.grid; g.lineWidth = 1;
  const mg = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.6);
  for (let x = 0; x < W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  mg.addColorStop(0, "rgba(0,0,0,0)"); mg.addColorStop(1, theme === "light" ? "rgba(255,255,255,.6)" : "rgba(0,0,0,.45)"); g.fillStyle = mg; g.fillRect(0, 0, W, H);
  if (bgCache.size > 12) bgCache.clear(); bgCache.set(k, c); return c;
}
function glow(ctx, x, y, r, color, a = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function hexA(hex, a) { const h = String(hex || "#4F8BFF").replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// ── 실제 화면(사진 · 영상) ──
function mediaSize(el) { return el ? [el.videoWidth || el.naturalWidth || 0, el.videoHeight || el.naturalHeight || 0] : [0, 0]; }
function drawFit(ctx, el, x, y, w, h, m, k) {
  const [nw, nh] = mediaSize(el); if (!nw || !nh) { ctx.fillStyle = "#dfe6f2"; ctx.fillRect(x, y, w, h); return; }
  const z0 = Number(m.zoom) || 1, z1 = Number(m.zoomTo ?? z0) || z0; const z = z0 + (z1 - z0) * easeIO(k);
  const s = Math.max(w / nw, h / nh) * z; const dw = nw * s, dh = nh * s;
  let dx = x + w / 2 - (Number(m.fx ?? 0.5)) * dw, dy = y + h / 2 - (Number(m.fy ?? 0.3)) * dh;
  dx = Math.min(x, Math.max(x + w - dw, dx)); dy = Math.min(y, Math.max(y + h - dh, dy));
  ctx.drawImage(el, dx, dy, dw, dh);
}
function drawMediaBox(ctx, el, box, m, k, u, th, alpha) {
  const { x, y, w, h } = box; const fr = m.frame || "browser";
  ctx.save(); ctx.globalAlpha *= alpha;
  if (fr === "phone") {
    shadow(ctx, 80 * u, 30 * u); rr(ctx, x, y, w, h, 64 * u);
    const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, "#2a3a5c"); g.addColorStop(1, "#0b1324"); ctx.fillStyle = g; ctx.fill(); noShadow(ctx);
    ctx.lineWidth = 3 * u; ctx.strokeStyle = "rgba(143,176,240,.35)"; ctx.stroke();
    const p = 16 * u; rr(ctx, x + p, y + p, w - 2 * p, h - 2 * p, 48 * u); ctx.save(); ctx.clip(); ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h);
    drawFit(ctx, el, x + p, y + p, w - 2 * p, h - 2 * p, { ...m, fy: m.fy ?? 0 }, k); ctx.restore();
  } else if (fr === "browser") {
    shadow(ctx, 90 * u, 30 * u); rr(ctx, x, y, w, h, 24 * u); ctx.fillStyle = "#fff"; ctx.fill(); noShadow(ctx);
    ctx.save(); rr(ctx, x, y, w, h, 24 * u); ctx.clip();
    const bh = 44 * u; ctx.fillStyle = "#1B2B4B"; ctx.fillRect(x, y, w, bh);
    ["#FF5F57", "#FEBC2E", "#28C840"].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + 26 * u + i * 22 * u, y + bh / 2, 6.5 * u, 0, 7); ctx.fillStyle = c; ctx.fill(); });
    if (m.label) { ctx.font = font(600, 18 * u); ctx.fillStyle = "#A9C0EC"; ctx.textBaseline = "middle"; ctx.fillText(m.label, x + 104 * u, y + bh / 2 + 1); }
    drawFit(ctx, el, x, y + bh, w, h - bh, m, k); ctx.restore();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = "rgba(143,176,240,.35)"; rr(ctx, x, y, w, h, 24 * u); ctx.stroke();
  } else {
    shadow(ctx, fr === "full" ? 0 : 70 * u, 24 * u); rr(ctx, x, y, w, h, fr === "full" ? 0 : 28 * u); ctx.fillStyle = "#0F1A30"; ctx.fill(); noShadow(ctx);
    ctx.save(); rr(ctx, x, y, w, h, fr === "full" ? 0 : 28 * u); ctx.clip(); drawFit(ctx, el, x, y, w, h, m, k); ctx.restore();
  }
  ctx.restore();
}
function tick(ctx, text, x, y, size, u, alpha, align = "left") {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = font(800, size);
  const tw = ctx.measureText(text).width; const w = tw + size * 2.3, h = size * 1.75; const x0 = align === "center" ? x - w / 2 : x;
  rr(ctx, x0, y, w, h, 20 * u); ctx.fillStyle = "#0E2A22"; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = "rgba(43,209,126,.7)"; ctx.stroke();
  ctx.fillStyle = OK; ctx.textBaseline = "middle"; ctx.fillText("✓", x0 + size * 0.55, y + h / 2 + 1);
  ctx.fillStyle = "#fff"; ctx.fillText(text, x0 + size * 1.55, y + h / 2 + 1);
  ctx.restore(); return [w, h];
}
// 체크 표시 여러 개 — 줄을 넘으면 다음 줄
function tickRow(ctx, items, cx, y, maxW, size, u, lt, d0, align = "center") {
  ctx.font = font(800, size); const gap = 14 * u; const rows = [[]]; let rw = 0;
  items.forEach((t) => { const w = ctx.measureText(t).width + size * 2.3; if (rw + w > maxW && rows[rows.length - 1].length) { rows.push([]); rw = 0; } rows[rows.length - 1].push([t, w]); rw += w + gap; });
  let i = 0; let yy = y;
  for (const row of rows) {
    const tot = row.reduce((a, [, w]) => a + w, 0) + gap * (row.length - 1); let x = align === "center" ? cx - tot / 2 : cx;
    for (const [t, w] of row) { const p = ap(lt, d0 + i * 0.22, 0.4); tick(ctx, t, x, yy + (1 - p) * 30 * u, size, u, p); x += w + gap; i++; }
    yy += size * 1.75 + gap;
  }
  return yy - y;
}

// ── 장면 그리기 ──
function drawScene(ctx, P, s, lt, sd, A, W, H) {
  const wide = W > H; const u = Math.min(W, H) / 1080; const th = THEME[P.theme] || THEME.navy; const ac = P.accent || "#4F8BFF";
  const cx = W / 2; const L = s.layout;
  const media = s.media && (A.vids.get(s.id) || A.imgs.get(libUrl(s.media.src)));
  const titleSize = (wide ? 84 : 98) * u * (s.size || 1);
  if (L === "title") {
    const ks = 38 * u, sz = titleSize * 1.04, ss = 46 * u, maxW = wide ? W * 0.78 : W - 120 * u;
    const hk = s.kicker ? ks * 1.9 + 36 * u : 0, ht = rich(ctx, s.title, 0, 0, { size: sz, maxW, measureOnly: true }), hs = s.sub ? rich(ctx, s.sub, 0, 0, { size: ss, weight: 600, maxW, measureOnly: true }) + 36 * u : 0;
    let y = (wide ? H * 0.47 : H * 0.36) - (hk + ht + hs) / 2;
    glow(ctx, cx, y + (hk + ht) / 2, 520 * u, ac, 0.28);
    if (s.sub && !s.kicker) { const p = ap(lt, 0.05); rich(ctx, s.sub, cx, y + (1 - p) * 30 * u, { size: ss, weight: 600, maxW, color: th.sub, hl: ac, alpha: p }); y += hs; }
    if (s.kicker) { const p = ap(lt, 0.05); chip(ctx, s.kicker, cx, y - (1 - p) * 30 * u, ks, th, "center", p); y += hk; }
    const p = ap(lt, s.sub && !s.kicker ? 0.9 : 0.15, 0.6); rich(ctx, s.title, cx, y + (1 - p) * 60 * u, { size: sz, maxW, color: th.ink, hl: ac, alpha: p, weight: 900 }); y += ht + 36 * u;
    if (s.sub && s.kicker) { const q = ap(lt, 0.5); rich(ctx, s.sub, cx, y + (1 - q) * 30 * u, { size: ss, weight: 600, maxW, color: th.sub, hl: ac, alpha: q }); }
    return;
  }
  if (L === "count") {
    const maxW = wide ? W * 0.8 : W - 120 * u; const big = String(s.big || ""); const bs = (wide ? 220 : 250) * u;
    const hk = s.kicker ? 44 * u * 1.4 + 20 * u : 0, ht = s.title ? rich(ctx, s.title, 0, 0, { size: titleSize * 0.78, maxW, measureOnly: true }) + 40 * u : 0, hs = s.sub ? 70 * u : 0;
    let y = (wide ? H * 0.47 : H * 0.36) - (hk + bs + ht + hs) / 2;
    glow(ctx, cx, y + hk + bs / 2, 560 * u, ac, 0.3);
    if (s.kicker) { const p = ap(lt, 0.05); rich(ctx, s.kicker, cx, y + (1 - p) * 30 * u, { size: 44 * u, weight: 600, maxW, color: th.sub, hl: ac, alpha: p }); y += hk; }
    const p = ap(lt, 0.15, 0.6); const m = big.match(/^([0-9][0-9,]*)(.*)$/);
    let shown = big; if (m) { const n = Number(m[1].replace(/,/g, "")); const k = ease((lt - 0.15) / 1.2); shown = Math.round(n * k).toLocaleString("ko-KR") + m[2]; }
    ctx.save(); ctx.globalAlpha = p; ctx.translate(cx, y + bs / 2); const sc = 0.7 + 0.3 * p + Math.sin(p * Math.PI) * 0.08; ctx.scale(sc, sc);
    ctx.font = font(900, bs); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = th.ink; shadow(ctx, 40 * u, 0, hexA(ac, 0.6)); ctx.fillText(shown, 0, 0); ctx.restore();
    y += bs + 30 * u;
    if (s.title) { const q = ap(lt, 0.9, 0.6); rich(ctx, s.title, cx, y + (1 - q) * 40 * u, { size: titleSize * 0.78, maxW, color: th.ink, hl: s.hlRed === false ? ac : RED, alpha: q, weight: 900 }); y += ht; }
    if (s.sub) { const q = ap(lt, 1.3); rich(ctx, s.sub, cx, y + (1 - q) * 20 * u, { size: 46 * u, weight: 600, maxW, color: th.sub, hl: ac, alpha: q }); }
    return;
  }
  if (L === "logo") {
    glow(ctx, cx, H * 0.44, 700 * u, ac, 0.45);
    const p = ap(lt, 0.05, 0.7); const ls = 300 * u;
    if (A.logo) { ctx.save(); ctx.globalAlpha = p; ctx.translate(cx, H * 0.4); const sc = 1.25 - 0.25 * p + lt * 0.02; ctx.scale(sc, sc); drawLogo(ctx, A.logo, 0, 0, ls); ctx.restore(); }
    const q = ap(lt, 0.45, 0.6); wordmark(ctx, cx, H * 0.4 + ls * 0.55 + (1 - q) * 40 * u, 150 * u, th, ac, q);
    if (s.sub) { const r = ap(lt, 0.8); rich(ctx, s.sub, cx, H * 0.4 + ls * 0.55 + 190 * u, { size: 42 * u, weight: 600, maxW: W * 0.8, color: th.sub, hl: ac, alpha: r }); }
    return;
  }
  if (L === "cta") {
    const maxW = wide ? W * 0.8 : W - 120 * u;
    const ht = s.title ? rich(ctx, s.title, 0, 0, { size: titleSize * 0.74, maxW, measureOnly: true }) + 60 * u : 0; const ls = (wide ? 200 : 220) * u;
    const total = ht + ls + 150 * u + 70 * u + 150 * u + 70 * u; let y = (wide ? H * 0.5 : H * 0.37) - total / 2;
    glow(ctx, cx, y + ht + ls, 640 * u, ac, 0.4);
    if (s.title) { const p = ap(lt, 0.05); rich(ctx, s.title, cx, y + (1 - p) * 40 * u, { size: titleSize * 0.74, maxW, color: th.ink, hl: ac, alpha: p, weight: 900 }); y += ht; }
    const p1 = ap(lt, s.title ? 0.35 : 0.05, 0.5);
    if (A.logo) { ctx.save(); ctx.globalAlpha = p1; ctx.translate(cx, y + ls / 2); const sc = 0.6 + 0.4 * p1 + Math.sin(p1 * Math.PI) * 0.1; ctx.scale(sc, sc); drawLogo(ctx, A.logo, 0, 0, ls); ctx.restore(); }
    y += ls + 10 * u; const p2 = ap(lt, (s.title ? 0.35 : 0.05) + 0.2); y += wordmark(ctx, cx, y + (1 - p2) * 30 * u, (wide ? 120 : 125) * u, th, ac, p2);
    if (s.sub) { const p3 = ap(lt, 0.7); rich(ctx, s.sub, cx, y + 6 * u, { size: (wide ? 36 : 44) * u, weight: 600, maxW, color: th.sub, hl: ac, alpha: p3 }); }
    y += 80 * u;
    const btn = P.cta?.button || "무료 체험 신청하기"; const p4 = ap(lt, 1.0, 0.5);
    ctx.save(); ctx.globalAlpha = p4; ctx.font = font(900, 54 * u); const bw = ctx.measureText(btn).width + 140 * u, bh = 120 * u;
    ctx.translate(cx, y + bh / 2); const sc = 0.6 + 0.4 * p4 + Math.sin(p4 * Math.PI) * 0.12 + (lt > 2 ? Math.sin((lt - 2) * 4) * 0.015 : 0); ctx.scale(sc, sc);
    const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0); g.addColorStop(0, "#2D5BD8"); g.addColorStop(1, ac); shadow(ctx, 60 * u, 20 * u, hexA(ac, 0.6));
    rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fillStyle = g; ctx.fill(); noShadow(ctx); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(btn, 0, 2); ctx.restore();
    y += bh + 40 * u;
    if (P.cta?.url) { const p5 = ap(lt, 1.4); rich(ctx, P.cta.url, cx, y, { size: 40 * u, weight: 700, maxW, color: th.sub, hl: th.ink, alpha: p5 }); }
    return;
  }
  // 위쪽 머리글(꼬리표 + 제목) — media · points · bubbles 공통
  const head = (alignLeft) => {
    const maxW = alignLeft ? W * 0.3 : W - 120 * u; const x = alignLeft ? 120 * u : cx; const al = alignLeft ? "left" : "center";
    let y = alignLeft ? H * 0.2 : 180 * u;
    if (s.kicker) { const p = ap(lt, 0.05); if (alignLeft) { ctx.save(); ctx.globalAlpha = p; ctx.font = font(700, 28 * u); ctx.fillStyle = THEME.navy.chipLine === th.chipLine ? "#8FB0F0" : ac; ctx.textBaseline = "top"; ctx.fillText(s.kicker.split("").join(String.fromCharCode(8202)), x, y + (1 - p) * 20 * u); ctx.restore(); y += 52 * u; } else { y += chip(ctx, s.kicker, x, y - (1 - p) * 30 * u, 36 * u, th, al, p) + 26 * u; } }
    const sz = alignLeft ? 72 * u * (s.size || 1) : 70 * u * (s.size || 1); const p = ap(lt, 0.12);
    y += rich(ctx, s.title, x, y + (1 - p) * 40 * u, { size: sz, maxW, align: al, color: th.ink, hl: ac, alpha: p, weight: 900 });
    if (s.sub) { const q = ap(lt, 0.4); y += 14 * u + rich(ctx, s.sub, x, y + 14 * u, { size: 38 * u, weight: 600, maxW, align: al, color: th.sub, hl: ac, alpha: q }); }
    return y;
  };
  if (L === "media" && s.media) {
    const m = s.media; const k = sd > 0 ? lt / sd : 0; const fr = m.frame || "browser";
    if (fr === "full") {
      const p = ap(lt, 0, 0.4); drawMediaBox(ctx, media, { x: 0, y: 0, w: W, h: H }, m, k, u, th, p);
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.45); g.addColorStop(0, "rgba(4,8,15,.85)"); g.addColorStop(1, "rgba(4,8,15,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.45);
      const yb = head(false); if (s.items?.length) tickRow(ctx, s.items, cx, yb + 30 * u, W - 100 * u, 38 * u, u, lt, 0.9);
      return;
    }
    if (wide) {
      const yb = head(true);
      if (s.items?.length) s.items.forEach((t, i) => { const p = ap(lt, 0.9 + i * 0.22, 0.4); tick(ctx, t, 120 * u + (1 - p) * -30 * u, yb + 40 * u + i * 80 * u, 34 * u, u, p); });
      const box = fr === "phone" ? { w: 430 * u, h: 840 * u } : { w: 1060 * u, h: 740 * u }; box.x = fr === "phone" ? W * 0.68 - box.w / 2 : W - box.w - 80 * u; box.y = (H - box.h) / 2;
      const p = ap(lt, 0.08, 0.6); ctx.save(); ctx.translate((1 - p) * 120 * u, 0); drawMediaBox(ctx, media, box, m, k, u, th, p); ctx.restore();
      return;
    }
    const yb = head(false);
    const box = fr === "phone" ? { w: 480 * u, h: 870 * u } : { w: W - 100 * u, h: 790 * u };
    box.x = (W - box.w) / 2; box.y = Math.max(400 * u, yb + 40 * u);
    const maxH = 1400 * u - box.y - (s.items?.length ? 120 * u : 0); if (box.h > maxH) { const r = maxH / box.h; box.h = maxH; if (fr === "phone") { box.w *= r; box.x = (W - box.w) / 2; } }
    const p = ap(lt, 0.1, 0.6); ctx.save(); ctx.translate(0, (1 - p) * 80 * u); drawMediaBox(ctx, media, box, m, k, u, th, p); ctx.restore();
    if (s.items?.length) tickRow(ctx, s.items, cx, box.y + box.h + 34 * u, W - 100 * u, 38 * u, u, lt, 0.9);
    return;
  }
  if (L === "points") {
    const items = s.items || [];
    if (s.look === "chain") {
      const yb = s.title || s.kicker ? head(false) : 0; const sz = (wide ? 46 : 48) * u;
      if (wide) {
        ctx.font = font(800, sz); const ws = items.map((t) => ctx.measureText(t).width + 56 * u); const aw = 70 * u; const tot = ws.reduce((a, b) => a + b, 0) + aw * (items.length - 1);
        let x = cx - tot / 2; const y = Math.max(yb + 80 * u, H * 0.5);
        items.forEach((t, i) => { const p = ap(lt, 0.5 + i * 0.25, 0.4); ctx.save(); ctx.globalAlpha = p; rr(ctx, x, y + (1 - p) * 30 * u, ws[i], sz * 2, 18 * u); ctx.fillStyle = th.card; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = th.line; ctx.stroke(); ctx.fillStyle = th.ink; ctx.textBaseline = "middle"; ctx.fillText(t, x + 28 * u, y + sz + (1 - p) * 30 * u + 2); ctx.restore();
          x += ws[i]; if (i < items.length - 1) { ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = ac; ctx.font = font(900, sz); ctx.textBaseline = "middle"; ctx.fillText("→", x + aw / 2 - sz * 0.45, y + sz); ctx.restore(); x += aw; } });
      } else {
        let y = yb + 50 * u; const w = 680 * u;
        items.forEach((t, i) => { const p = ap(lt, 0.5 + i * 0.3, 0.45); ctx.save(); ctx.globalAlpha = p; const yy = y + (1 - p) * 40 * u; rr(ctx, cx - w / 2, yy, w, sz * 2.1, 26 * u); ctx.fillStyle = th.card; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = i === items.length - 1 ? OK : th.line; ctx.stroke();
          ctx.font = font(800, sz); ctx.fillStyle = th.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, cx, yy + sz * 1.05 + 2); ctx.restore();
          y += sz * 2.1; if (i < items.length - 1) { ctx.save(); ctx.globalAlpha = p; ctx.fillStyle = ac; ctx.font = font(900, sz); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("↓", cx, y + 4 * u); ctx.restore(); y += sz * 1.25; } });
      }
      return;
    }
    const yb = head(wide && false); const w = wide ? W * 0.62 : W - 140 * u; const x0 = cx - w / 2; let y = yb + 50 * u; const ts = (wide ? 40 : 42) * u;
    items.forEach((t, i) => {
      const [a, b] = String(t).split("|").map((x) => x.trim()); const p = ap(lt, 0.6 + i * 0.3, 0.45);
      const h = b ? ts * 2.9 : ts * 2.1; ctx.save(); ctx.globalAlpha = p; ctx.translate((1 - p) * 60 * u, 0);
      rr(ctx, x0, y, w, h, 26 * u); ctx.fillStyle = th.card; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = th.line; ctx.stroke();
      ctx.beginPath(); ctx.arc(x0 + 56 * u, y + h / 2, 30 * u, 0, 7); ctx.fillStyle = ac; ctx.fill();
      ctx.font = font(900, 32 * u); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), x0 + 56 * u, y + h / 2 + 1);
      ctx.textAlign = "left"; ctx.font = font(800, ts); ctx.fillStyle = th.ink; ctx.fillText(a, x0 + 110 * u, b ? y + h * 0.36 : y + h / 2 + 1);
      if (b) { ctx.font = font(500, ts * 0.72); ctx.fillStyle = th.sub; ctx.fillText(b, x0 + 110 * u, y + h * 0.7); }
      ctx.restore(); y += h + 18 * u;
    });
    return;
  }
  if (L === "bubbles") {
    const items = s.items || []; const look = s.look || "chat";
    if (wide) {
      const tsz = 92 * u;
      if (look === "chat") {
        const pos = [[180, 150], [1100, 220], [300, 700], [1150, 760], [120, 430], [1250, 610], [700, 120], [760, 820]];
        items.forEach((t, i) => { const [x, y] = pos[i % pos.length]; bubble(ctx, t, x * u, y * u, 30 * u, i % 2 ? "#fff" : "#FEE500", ap(lt, 0.05 + i * 0.2, 0.3), u, 640 * u); });
        const p = ap(lt, 0.1, 0.5); ctx.save(); ctx.translate(cx, H * 0.47); const sc = 1.25 - 0.25 * p; ctx.scale(sc, sc); rich(ctx, s.title, 0, -tsz * 0.6, { size: tsz, maxW: W * 0.7, color: th.ink, hl: "#F5A524", alpha: p, weight: 900, shadowBlur: 40 * u }); ctx.restore();
        return;
      }
      if (look === "call") {
        items.forEach((t, i) => callRow(ctx, t, 160 * u, 300 * u + i * 112 * u, 660 * u, 34 * u, u, ap(lt, 0.1 + i * 0.3, 0.4)));
        const p = ap(lt, 0.15); rich(ctx, s.title, 960 * u + (1 - p) * 60 * u, 330 * u, { size: tsz, maxW: 860 * u, align: "left", color: th.ink, hl: RED, alpha: p, weight: 900 });
        return;
      }
      items.forEach((t, i) => excelWin(ctx, t, (150 + i * 340) * u, (440 + (i % 2) * 110) * u, 560 * u, 330 * u, u, ap(lt, 0.1 + i * 0.3, 0.35), i % 3 === 0 ? -5 : i % 3 === 2 ? 4 : 0));
      const p = ap(lt, 0.9, 0.5); ctx.save(); ctx.translate(cx, 200 * u); const sc = 1.25 - 0.25 * p; ctx.scale(sc, sc); rich(ctx, s.title, 0, 0, { size: tsz, maxW: W * 0.8, color: th.ink, hl: "#F5A524", alpha: p, weight: 900 }); ctx.restore();
      return;
    }
    const yb = head(false); let y = yb + 70 * u;
    if (look === "chat") items.forEach((t, i) => { ctx.font = font(600, 34 * u); const lines = String(t).split("\n"); const bw = Math.min(680 * u, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56 * u); const x = i % 2 ? W - 70 * u - bw : 70 * u; const h = bubble(ctx, t, x, y, 34 * u, i % 2 ? "#fff" : "#FEE500", ap(lt, 0.5 + i * 0.4, 0.3), u, 680 * u); y += h + 26 * u; });
    else if (look === "call") items.forEach((t, i) => { callRow(ctx, t, 70 * u, y, W - 140 * u, 36 * u, u, ap(lt, 0.5 + i * 0.3, 0.4)); y += 110 * u; });
    else items.forEach((t, i) => excelWin(ctx, t, (i % 2 ? 400 : 70) * u, y + i * 100 * u, 620 * u, 340 * u, u, ap(lt, 0.5 + i * 0.3, 0.35), i === 0 ? -6 : 0));
    return;
  }
}
function bubble(ctx, text, x, y, size, bg, p, u, maxW) {
  ctx.save(); ctx.globalAlpha *= p; ctx.font = font(600, size);
  const lines = String(text).split("\n"); const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56 * u); const h = lines.length * size * 1.35 + 44 * u;
  ctx.translate(x + w / 2, y + h / 2); const sc = 0.6 + 0.4 * p + Math.sin(p * Math.PI) * 0.1; ctx.scale(sc, sc);
  shadow(ctx, 40 * u, 16 * u); rr(ctx, -w / 2, -h / 2, w, h, 26 * u); ctx.fillStyle = bg; ctx.fill(); noShadow(ctx);
  ctx.fillStyle = "#191919"; ctx.textBaseline = "top"; lines.forEach((l, i) => ctx.fillText(l, -w / 2 + 28 * u, -h / 2 + 22 * u + i * size * 1.35));
  ctx.restore(); return h;
}
function callRow(ctx, text, x, y, w, size, u, p) {
  const [a, b] = String(text).split("|").map((s) => s.trim()); const h = size * 2.4;
  ctx.save(); ctx.globalAlpha *= p; ctx.translate((1 - p) * -60 * u, 0);
  rr(ctx, x, y, w, h, 20 * u); ctx.fillStyle = "rgba(255,90,95,.12)"; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = "rgba(255,90,95,.45)"; ctx.stroke();
  ctx.font = font(700, size); ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(`📞 ${a || ""}`, x + 28 * u, y + h / 2 + 1);
  if (b) { ctx.fillStyle = RED; ctx.textAlign = "right"; ctx.fillText(b, x + w - 28 * u, y + h / 2 + 1); }
  ctx.restore();
}
function excelWin(ctx, name, x, y, w, h, u, p, rot = 0) {
  ctx.save(); ctx.globalAlpha *= p; ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot * Math.PI / 180); const sc = 0.6 + 0.4 * p + Math.sin(p * Math.PI) * 0.08; ctx.scale(sc, sc);
  shadow(ctx, 50 * u, 20 * u); rr(ctx, -w / 2, -h / 2, w, h, 16 * u); ctx.fillStyle = "#fff"; ctx.fill(); noShadow(ctx);
  ctx.save(); rr(ctx, -w / 2, -h / 2, w, h, 16 * u); ctx.clip(); ctx.fillStyle = "#1d6f42"; ctx.fillRect(-w / 2, -h / 2, w, 52 * u);
  ctx.strokeStyle = "#d9e3dc"; ctx.lineWidth = 2 * u; for (let gx = -w / 2; gx < w / 2; gx += 112 * u) { ctx.beginPath(); ctx.moveTo(gx, -h / 2 + 52 * u); ctx.lineTo(gx, h / 2); ctx.stroke(); }
  for (let gy = -h / 2 + 52 * u; gy < h / 2; gy += 42 * u) { ctx.beginPath(); ctx.moveTo(-w / 2, gy); ctx.lineTo(w / 2, gy); ctx.stroke(); }
  ctx.restore(); ctx.font = font(700, 26 * u); ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(name, -w / 2 + 20 * u, -h / 2 + 27 * u);
  ctx.restore();
}

// 자막 — 길면 문장 단위로 나눠 말하는 시간에 맞춰 넘긴다
function captionChunks(text) {
  const t = String(text || "").replace(/\*\*/g, "").trim(); if (!t) return [];
  const parts = t.split(/(?<=[.!?。…])\s+|(?<=,)\s+/).filter(Boolean); const out = []; let cur = "";
  for (const p of parts) { if ((cur + " " + p).trim().length > 26 && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + " " + p).trim(); }
  if (cur) out.push(cur); return out;
}
function drawCaption(ctx, P, s, sc, t, W, H) {
  const c = P.captions || {}; if (c.on === false) return;
  const text = (s.caption || s.narration || "").trim(); if (!text) return;
  const wide = W > H; const u = Math.min(W, H) / 1080;
  let t0, t1; if (sc.voiceDur) { t0 = sc.voiceAt; t1 = sc.voiceAt + sc.voiceDur + 0.15; } else { t0 = sc.start + 0.2; t1 = sc.start + sc.dur - 0.1; }
  if (t < t0 || t > t1) return;
  const ch = captionChunks(text); const tot = ch.reduce((a, x) => a + x.length, 0) || 1; let acc = 0, cur = ch[0];
  for (const x of ch) { if ((t - t0) / Math.max(0.1, t1 - t0) >= acc / tot) cur = x; acc += x.length; }
  const size = (wide ? 40 : 46) * u * (c.size || 1); const maxW = W * (wide ? 0.7 : 0.84);
  ctx.font = font(700, size); const lines = wrapRich(ctx, cur, maxW); const lh = size * 1.35; const h = lines.length * lh + size * 0.9;
  const w = Math.min(maxW, Math.max(...lines.map((l) => l.reduce((a, x) => a + x.w, 0)))) + size * 1.3;
  const y = wide ? H - 70 * u - h : H * 0.745;
  ctx.save();
  if (c.style !== "outline") { rr(ctx, W / 2 - w / 2, y, w, h, 18 * u); ctx.fillStyle = "rgba(8,16,31,.84)"; ctx.fill(); ctx.lineWidth = 1.5 * u; ctx.strokeStyle = "rgba(143,176,240,.25)"; ctx.stroke(); }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  lines.forEach((ln, i) => { const str = ln.map((x) => x.t).join(""); const yy = y + size * 0.45 + i * lh;
    if (c.style === "outline") { ctx.lineWidth = size * 0.18; ctx.strokeStyle = "#000"; ctx.lineJoin = "round"; ctx.strokeText(str, W / 2, yy); ctx.fillStyle = c.color || "#FFE45C"; } else ctx.fillStyle = "#fff";
    ctx.fillText(str, W / 2, yy); });
  ctx.restore();
}

// 🔷 2026-11-24 새 LW 로고는 가로로 긴 그림 — 네모 칸(ls)에 비율 그대로(가로 1.3배까지) 가운데 맞춰 그린다
function drawLogo(ctx, img, cx, cy, ls) {
  const r = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);
  const w = r >= 1 ? Math.min(ls * 1.3, ls * 0.64 * r) : ls * r, h = w / r;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}
export function renderFrame(ctx, P, tl, t, A) {
  const W = ctx.canvas.width, H = ctx.canvas.height; const u = Math.min(W, H) / 1080;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.textAlign = "left";
  ctx.drawImage(background(W, H, P.theme || "navy", P.accent || "#4F8BFF"), 0, 0);
  const i = tl.scenes.findIndex((x) => t < x.start + x.dur); const idx = i < 0 ? tl.scenes.length - 1 : i;
  const sc = tl.scenes[idx]; const s = P.scenes[idx];
  if (s && sc) {
    const lt = t - sc.start; const tr = s.transition || "fade"; const p = tr === "none" ? 1 : ease(lt / 0.35);
    ctx.save();
    if (tr !== "none" && tr !== "flash") ctx.globalAlpha = p;
    if (tr === "slide") ctx.translate((1 - p) * W * 0.12, 0);
    if (tr === "zoom") { const z = 1.08 - 0.08 * p; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2); }
    try { drawScene(ctx, P, s, lt, sc.dur, A, W, H); } catch (e) { console.warn("장면 그리기 오류", e); }
    ctx.restore();
    drawCaption(ctx, P, s, sc, t, W, H);
    if (tr === "flash" && lt < 0.4) { ctx.fillStyle = `rgba(255,255,255,${(1 - lt / 0.4) * 0.95})`; ctx.fillRect(0, 0, W, H); }
  }
  if (P.watermark && A.logo) { ctx.globalAlpha = 0.85; const s = 54 * u; drawLogo(ctx, A.logo, 40 * u + s / 2, 40 * u + s / 2, s); wordmark(ctx, 40 * u + s + 12 * u + 80 * u, 46 * u, 36 * u, THEME[P.theme] || THEME.navy, P.accent || "#4F8BFF", 0.85); ctx.globalAlpha = 1; }
  // 화면 위 · 아래 안전 영역 표시(편집할 때만)
  if (A.guides && W < H) { ctx.setLineDash([12, 10]); ctx.strokeStyle = "rgba(255,200,0,.5)"; ctx.lineWidth = 3; ctx.strokeRect(40 * u, 160 * u, W - 80 * u - 120 * u, H - 160 * u - 420 * u); ctx.setLineDash([]); }
  ctx.restore();
}
export const LIB_NAME = Object.fromEntries(LIBRARY);
