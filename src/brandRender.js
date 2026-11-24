// ======================= src/brandRender.js =======================
// 🎨 2026-11-15 브랜드 디자인(관리자센터 › 운영 › 브랜드 디자인) — 로고 그리기 엔진(React 없음 · 순수 함수)
//  로고 = "그림 한 장(asset)" 두 개: 마크(LW) · 글자(LOGISWEB). 그림은 "부분(part)" 여러 개로 나뉜다.
//    part.type  art   : 완성된 벡터 그림(색 고정)     — 기본 마크(2026-11-24 새 LW 로고 · src/brandMarkArt.js) · style.pal = light(원본 색) | dark(밝게)
//               path  : 벡터 도형(d)                 — 예전 기본 마크의 L · W
//               line  : 선(points)                   — 기본 마크의 금색 노선
//               dot   : 점(cx, cy, r)                — 노선 끝 점
//               svg   : 올린 SVG 의 도형 묶음(items)  — 같은 색끼리 한 부분
//               mask  : 그림 모양(투명 PNG)을 색으로 칠함 — 기본 글자 로고 · 올린 PNG(색깔별로 나눔)
//  바탕마다 색 한 벌(tone): dark(어두운 바탕) · light(밝은 바탕) · icon(앱 아이콘 타일 위)
//  부분 꾸미기(style): c1 · c2(그러데이션) · ang(방향) · st/sw(테두리 색/두께) · grow(굵기 ±) · op(투명도) · hide · glow · fade
//  ⚠️ 저장된 설정은 모두가 보는 화면에 그대로 그려지므로 sanitizeConfig 로 숫자 · 색 · 경로 글자만 남긴다(HTML/스크립트 차단)

import { MARK_ART, MARK_VB } from "./brandMarkArt";

export const TONES = [["dark", "어두운 바탕"], ["light", "밝은 바탕"], ["icon", "앱 아이콘"]];
export const CONFIG_VERSION = 1;

// ── 기본 로고 ──
//  🔷 2026-11-24 새 LW 로고(사용자 디자인) — 완성된 벡터 그림 한 장(art). 밝은 바탕 = 원본 색 · 어두운 바탕 · 앱 아이콘 = 같은 모양 · 명암을 밝게
//    그림은 tools/brand/make-logo-assets.py 가 src/brandMarkArt.js 로 만든다. 가로로 긴 그림(약 2.13 : 1)
export const DEFAULT_MARK = {
  x: MARK_VB[0], y: MARK_VB[1], w: MARK_VB[2], h: MARK_VB[3],
  parts: [{ id: "lw", name: "LW 로고", type: "art" }],
};
export const WORD_IMG = "/brand/logisweb-wordmark.png"; // 1544×174 · LOGIS | WEB 경계 896
export const DEFAULT_WORD = {
  w: 1544, h: 174,
  parts: [
    { id: "logis", name: "LOGIS", type: "mask", src: WORD_IMG, clip: [0, 0, 896, 174] },
    { id: "web", name: "WEB", type: "mask", src: WORD_IMG, clip: [896, 0, 648, 174] },
  ],
};
// sw · grow 단위 = 그림 짧은 변의 1/1000 (마크 1440 → 1 = 1.44칸)
export const DEFAULT_STYLES = {
  mark: {
    dark: { lw: { pal: "dark" } },
    light: { lw: { pal: "light" } },
    icon: { lw: { pal: "dark" } },
  },
  word: {
    dark: { logis: { c1: "#FFFFFF" }, web: { c1: "#7A93C4" } },
    light: { logis: { c1: "#14213D" }, web: { c1: "#3A5590" } },
    icon: { logis: { c1: "#FFFFFF" }, web: { c1: "#A3B6DC" } },
  },
};
export const DEFAULT_TILE = { c1: "#2B4880", c2: "#16264A", ang: 60, glow: "#8FB0F0", gop: 0.22, scale: 1 };

// ── 로고가 들어가는 자리(바탕 기본값은 코드에 있는 그대로) ──
export const SPOTS = [
  { id: "splash", name: "첫 화면(로딩)", where: "앱을 켤 때 · 새로고침할 때", sel: '[data-kp-spot="splash"]', css: "radial-gradient(90% 60% at 50% 0%, #22396A 0%, #0F1A30 55%, #060D1C 100%)", lum: 0.06 },
  { id: "topnav", name: "PC 상단바", where: "배차 화면 맨 위", sel: ".kp-topnav", css: "linear-gradient(120deg,#0F1A30 0%,#16243F 45%,#1F3560 100%)", lum: 0.08 },
  { id: "sidemenu", name: "전체 메뉴(PC)", where: "왼쪽에서 열리는 메뉴", sel: ".kp-side-aside", css: "linear-gradient(180deg,#16264A 0%,#1B2B4B 55%,#14213D 100%)", lum: 0.1 },
  { id: "admin", name: "관리자센터 상단", where: "이 화면 맨 위", sel: '.kp-pcenter .kp-pc-head,[data-kp-spot="admin"]', css: "linear-gradient(90deg,#0B1428 0%,#0F1A30 45%,#1B2B4B 100%)", lum: 0.07 },
  { id: "loginPanel", name: "로그인 왼쪽 면", where: "운송사 · 화주 · 기사 로그인(PC)", sel: '[data-kp-spot="loginPanel"]', css: "linear-gradient(150deg,#060E1F 0%,#0F1A30 45%,#1B2B4B 100%)", lum: 0.06 },
  { id: "loginForm", name: "로그인 입력 칸 쪽", where: "로그인 화면 밝은 면 · 휴대폰 로그인", sel: '[data-kp-spot="loginForm"]', css: "#F2F4F8", lum: 0.95 },
  { id: "mobileMenu", name: "모바일 메뉴(밝은 모드)", where: "휴대폰 왼쪽 메뉴", sel: '[data-kp-spot="mobileMenu"]', css: "#FFFFFF", lum: 1 },
  { id: "mobileMenuDark", name: "모바일 메뉴(어두운 모드)", where: "휴대폰 왼쪽 메뉴", sel: '[data-kp-spot="mobileMenuDark"]', css: "linear-gradient(170deg,#060E1F 0%,#0F1A30 45%,#1B2B4B 100%)", lum: 0.06 },
];
export const SPOT_IDS = SPOTS.map((s) => s.id);

// ── 색 · 숫자 도우미 ──
const HEX = /^#[0-9A-Fa-f]{6}$/;
export const isHex = (v) => typeof v === "string" && HEX.test(v);
const hx = (v, d) => (isHex(v) ? v.toUpperCase() : d);
const clampN = (v, lo, hi, d) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export const rgbToHex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("").toUpperCase();
export function lum(h) { // 상대 밝기 0(검정) ~ 1(흰색)
  const c = hexToRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hslToHex([h, s, l]) {
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (!s) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgbToHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
}
// 바탕에 비해 너무 비슷한 색이면 밝기를 뒤집어(색감은 그대로) 잘 보이게
export function fitColor(c, bg, min = 2.4) {
  if (!isHex(c) || contrast(c, bg) >= min) return c;
  const [h, s, l] = rgbToHsl(hexToRgb(c));
  const dark = lum(bg) > 0.4;
  for (let i = 0; i <= 20; i++) {
    const nl = dark ? Math.max(0.1, (1 - l) * 0.55 - i * 0.02) : Math.min(0.97, 1 - l * 0.5 + i * 0.02);
    const out = hslToHex([h, Math.min(1, s * (dark ? 1.05 : 0.8)), nl]);
    if (contrast(out, bg) >= min) return out;
  }
  return dark ? "#14213D" : "#FFFFFF";
}
// 한 벌(tone)의 색을 다른 바탕에 맞춰 자동으로
export function autoFitStyles(styles, bg) {
  const out = {};
  for (const [id, s] of Object.entries(styles || {})) {
    const n = { ...s };
    for (const k of ["c1", "c2"]) if (n[k]) n[k] = fitColor(n[k], bg, 2.2);
    if (n.st) n.st = fitColor(n.st, bg, 1.6);
    out[id] = n;
  }
  return out;
}

// ── 설정 정리(저장 전 · 읽은 뒤 둘 다) ──
const PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+eE-]{1,60000}$/;
const NUMS_RE = /^[0-9.,\s+eE-]{1,20000}$/;
const TF_RE = /^[a-zA-Z0-9(),.\s+eE-]{0,400}$/;
const SRC_RE = /^(\/brand\/[a-z0-9-]+\.png|data:image\/png;base64,[A-Za-z0-9+/=]+)$/;
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const SVG_TAGS = { path: ["d"], polygon: ["points"], polyline: ["points"], rect: ["x", "y", "width", "height", "rx", "ry"], circle: ["cx", "cy", "r"], ellipse: ["cx", "cy", "rx", "ry"], line: ["x1", "y1", "x2", "y2"] };
const nameOf = (v, d) => (typeof v === "string" ? v.replace(/[<>&"'`]/g, "").slice(0, 30) : d) || d;
function cleanPart(p) {
  if (!p || !ID_RE.test(p.id || "")) return null;
  const base = { id: p.id, name: nameOf(p.name, p.id) };
  if (p.type === "path" && PATH_RE.test(p.d || "")) return { ...base, type: "path", d: p.d };
  if (p.type === "line" && NUMS_RE.test(p.points || "")) return { ...base, type: "line", points: p.points };
  if (p.type === "dot") return { ...base, type: "dot", cx: clampN(p.cx, -1e5, 1e5, 0), cy: clampN(p.cy, -1e5, 1e5, 0), r: clampN(p.r, 0, 1e4, 10) };
  if (p.type === "mask" && SRC_RE.test(p.src || "")) {
    const c = Array.isArray(p.clip) && p.clip.length === 4 ? p.clip.map((v) => clampN(v, -1e5, 1e5, 0)) : null;
    return { ...base, type: "mask", src: p.src, ...(c ? { clip: c } : {}) };
  }
  if (p.type === "svg" && Array.isArray(p.items)) {
    const items = [];
    for (const it of p.items.slice(0, 400)) {
      const keys = SVG_TAGS[it?.tag]; if (!keys) continue;
      const a = {};
      for (const k of keys) {
        const v = it.a?.[k]; if (v === undefined || v === null || v === "") continue;
        if (k === "d") { if (PATH_RE.test(String(v))) a.d = String(v); }
        else if (k === "points") { if (NUMS_RE.test(String(v))) a.points = String(v); }
        else { const n = Number(v); if (Number.isFinite(n)) a[k] = n; }
      }
      if (!Object.keys(a).length) continue;
      const tf = typeof it.tf === "string" && TF_RE.test(it.tf) ? it.tf : "";
      items.push({ tag: it.tag, a, ...(tf ? { tf } : {}), ...(it.ln ? { ln: true } : {}) });
    }
    return items.length ? { ...base, type: "svg", items } : null;
  }
  return null;
}
function cleanAsset(a) {
  if (!a || !Array.isArray(a.parts)) return null;
  const parts = a.parts.slice(0, 24).map(cleanPart).filter(Boolean);
  if (!parts.length) return null;
  return { w: clampN(a.w, 1, 1e5, 100), h: clampN(a.h, 1, 1e5, 100), x: clampN(a.x, -1e5, 1e5, 0), y: clampN(a.y, -1e5, 1e5, 0), parts };
}
function cleanStyle(s) {
  if (!s || typeof s !== "object") return {};
  const o = {};
  if (isHex(s.c1)) o.c1 = s.c1.toUpperCase();
  for (const k of ["c2", "st"]) { if (isHex(s[k])) o[k] = s[k].toUpperCase(); else if (s[k] === "none") o[k] = "none"; } // "none" = 기본값이 있어도 빼기
  if (s.ang !== undefined) o.ang = clampN(s.ang, 0, 360, 0);
  if (s.sw !== undefined) o.sw = clampN(s.sw, 0, 60, 0);
  if (s.grow !== undefined) o.grow = clampN(s.grow, -40, 40, 0);
  if (s.op !== undefined) o.op = clampN(s.op, 0, 1, 1);
  if (s.size !== undefined) o.size = clampN(s.size, 0.2, 4, 1);
  for (const k of ["hide", "glow", "fade"]) if (s[k] === true || s[k] === false) o[k] = s[k]; // false = 기본값이 켜져 있어도 끄기
  return o;
}
function cleanToneStyles(t) {
  const o = {};
  for (const tone of ["dark", "light", "icon"]) {
    o[tone] = {};
    for (const [id, s] of Object.entries(t?.[tone] || {})) if (ID_RE.test(id)) o[tone][id] = cleanStyle(s);
  }
  return o;
}
function cleanBg(b) {
  if (!b || !isHex(b.c1)) return null;
  return { c1: b.c1.toUpperCase(), ...(isHex(b.c2) ? { c2: b.c2.toUpperCase() } : {}), ang: clampN(b.ang, 0, 360, 135) };
}
export function sanitizeConfig(c) {
  if (!c || typeof c !== "object") return null;
  const out = { v: CONFIG_VERSION };
  const mark = cleanAsset(c.mark); if (mark) out.mark = mark;
  const word = cleanAsset(c.word); if (word) out.word = word;
  out.st = { mark: cleanToneStyles(c.st?.mark), word: cleanToneStyles(c.st?.word) };
  const t = c.tile || {};
  out.tile = { c1: hx(t.c1, DEFAULT_TILE.c1), c2: hx(t.c2, DEFAULT_TILE.c2), ang: clampN(t.ang, 0, 360, DEFAULT_TILE.ang), glow: hx(t.glow, DEFAULT_TILE.glow), gop: clampN(t.gop, 0, 1, DEFAULT_TILE.gop), scale: clampN(t.scale, 0.4, 1.3, 1) };
  out.spots = {};
  for (const id of SPOT_IDS) {
    const s = c.spots?.[id]; if (!s) continue;
    const bg = cleanBg(s.bg); const tone = ["dark", "light"].includes(s.tone) ? s.tone : null;
    if (bg || tone) out.spots[id] = { ...(bg ? { bg } : {}), ...(tone ? { tone } : {}) };
  }
  if (typeof c.at === "number") out.at = c.at;
  if (typeof c.by === "string") out.by = c.by.slice(0, 80);
  return out;
}
// 설정 + 기본값 → 실제로 쓸 값
export function resolve(cfg) {
  const c = cfg || {};
  const mark = c.mark || DEFAULT_MARK, word = c.word || DEFAULT_WORD;
  const pick = (asset, def, st) => {
    const o = {};
    for (const tone of ["dark", "light", "icon"]) {
      o[tone] = {};
      for (const p of asset.parts) o[tone][p.id] = { ...(def?.[tone]?.[p.id] || {}), ...(st?.[tone]?.[p.id] || {}) };
    }
    return o;
  };
  return {
    mark, word,
    st: { mark: pick(mark, DEFAULT_STYLES.mark, c.st?.mark), word: pick(word, DEFAULT_STYLES.word, c.st?.word) }, // 기본 부분 이름(L · W · logis …)은 기본 색부터
    tile: { ...DEFAULT_TILE, ...(c.tile || {}) },
    spots: c.spots || {},
  };
}

// ── 바탕 ──
export const bgCss = (b) => (!b ? "" : b.c2 ? `linear-gradient(${b.ang ?? 135}deg, ${b.c1} 0%, ${b.c2} 100%)` : b.c1);
export const bgLum = (b) => (!b ? 0.5 : b.c2 ? (lum(b.c1) + lum(b.c2)) / 2 : lum(b.c1));
export function spotBg(r, id) { const s = SPOTS.find((x) => x.id === id); const o = r.spots?.[id]?.bg; return { css: o ? bgCss(o) : s?.css || "", lum: o ? bgLum(o) : s?.lum ?? 0.1, bg: o || null }; }
export function spotTone(r, id) { const t = r.spots?.[id]?.tone; if (t === "dark" || t === "light") return t; return spotBg(r, id).lum > 0.4 ? "light" : "dark"; }
// 바탕 대표 색(자동 맞추기 기준)
export const toneBg = (tone) => (tone === "light" ? "#F2F4F8" : "#0F1A30");

// ── SVG 만들기 ──
let seq = 0;
const angXY = (deg) => { const r = (deg * Math.PI) / 180; const c = Math.cos(r) / 2, s = Math.sin(r) / 2; return `x1="${(0.5 - c).toFixed(3)}" y1="${(0.5 - s).toFixed(3)}" x2="${(0.5 + c).toFixed(3)}" y2="${(0.5 + s).toFixed(3)}"`; };
const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(" ");
function partSvg(asset, p, s, idp, defs) {
  if (!s || s.hide) return "";
  if (p.type === "art") { // 완성된 그림 — 색은 그림 그대로(pal 로 원본 · 밝게만 고른다)
    const id = `${idp}${p.id}_`;
    const g = (MARK_ART[s.pal] || MARK_ART.light).split('id="__').join(`id="${id}`).split("url(#__").join(`url(#${id}`);
    const op = s.op ?? 1;
    return op < 1 ? `<g opacity="${op}">${g}</g>` : g;
  }
  s = { ...s, c2: isHex(s.c2) ? s.c2 : undefined, st: isHex(s.st) ? s.st : undefined };
  const u = Math.min(asset.w, asset.h) / 1000;
  const id = `${idp}${p.id}`;
  const c1 = s.c1 || "#888888";
  let paint = c1;
  if (s.c2 && s.c2 !== c1 && p.type !== "line") { defs.push(`<linearGradient id="${id}g" ${angXY(s.ang ?? 45)}><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${s.c2}"/></linearGradient>`); paint = `url(#${id}g)`; }
  const sw = (s.sw || 0) * u;
  const grow = (s.grow || 0) * u;
  const vecGrow = grow >= 0.2 && (p.type === "path" || p.type === "svg" || p.type === "dot"); // 벡터는 같은 색 선을 둘러 굵게
  const stroke = s.st && sw > 0 ? ` stroke="${s.st}" stroke-width="${sw.toFixed(2)}" stroke-linejoin="miter"` : "";
  // 벡터 도형 한 겹 그리기: 굵게면 (테두리색 넓은 선) → (칠 + 같은 칠 선) 순서
  const vec = (shape) => {
    if (!vecGrow) return `${shape(`fill="${paint}"${stroke}`)}`;
    const under = s.st && sw > 0 ? shape(`fill="${s.st}" stroke="${s.st}" stroke-width="${(2 * grow + sw).toFixed(2)}" stroke-linejoin="miter"`) : "";
    return under + shape(`fill="${paint}" stroke="${paint}" stroke-width="${(2 * grow).toFixed(2)}" stroke-linejoin="miter"`);
  };
  let g = "";
  if (p.type === "path") g = vec((at) => `<path d="${p.d}" ${at}/>`);
  else if (p.type === "line") {
    let lp = c1;
    if (s.fade) { defs.push(`<linearGradient id="${id}f"><stop offset="0" stop-color="${c1}" stop-opacity="0"/><stop offset=".45" stop-color="${c1}"/><stop offset="1" stop-color="${c1}"/></linearGradient>`); lp = `url(#${id}f)`; }
    g = `<polyline points="${p.points}" fill="none" stroke="${lp}" stroke-width="${Math.max(0.5, (s.sw ?? 6) * u + 2 * Math.max(0, grow)).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (p.type === "dot") {
    const r = p.r * (s.size || 1);
    if (s.glow) { defs.push(`<radialGradient id="${id}r"><stop offset="0" stop-color="${c1}" stop-opacity=".7"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>`); g += `<circle cx="${p.cx}" cy="${p.cy}" r="${(r * 3.5).toFixed(1)}" fill="url(#${id}r)"/>`; }
    g += vec((at) => `<circle cx="${p.cx}" cy="${p.cy}" r="${r.toFixed(1)}" ${at}/>`);
  } else if (p.type === "svg") {
    g = p.items.map((it) => {
      const el = it.ln
        ? `<${it.tag} ${attrs(it.a)} fill="none" stroke="${paint}" stroke-width="${Math.max(1, (sw || 2 * u) + 2 * Math.max(0, grow)).toFixed(2)}" stroke-linecap="round"/>`
        : vec((at) => `<${it.tag} ${attrs(it.a)} ${at}/>`);
      return it.tf ? `<g transform="${it.tf}">${el}</g>` : el;
    }).join("");
  } else if (p.type === "mask") {
    defs.push(`<mask id="${id}m" mask-type="alpha" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="${asset.x || 0}" y="${asset.y || 0}" width="${asset.w}" height="${asset.h}"><image href="${p.src}" x="0" y="0" width="${asset.w}" height="${asset.h}" preserveAspectRatio="none"/></mask>`);
    const [cx, cy, cw, ch] = p.clip || [0, 0, asset.w, asset.h];
    defs.push(`<clipPath id="${id}c"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/></clipPath>`);
    const rect = (f) => `<rect x="0" y="0" width="${asset.w}" height="${asset.h}" fill="${f}" mask="url(#${id}m)"/>`;
    if (s.st && sw > 0) { defs.push(`<filter id="${id}o" x="-20%" y="-20%" width="140%" height="140%"><feMorphology operator="dilate" radius="${sw.toFixed(2)}"/></filter>`); g += `<g filter="url(#${id}o)">${rect(s.st)}</g>`; }
    g += rect(paint);
    g = `<g clip-path="url(#${id}c)">${g}</g>`;
  }
  if (!vecGrow && p.type !== "line" && Math.abs(grow) >= 0.2 && !(p.type === "svg" && grow > 0)) { defs.push(`<filter id="${id}k" x="-20%" y="-20%" width="140%" height="140%"><feMorphology operator="${grow > 0 ? "dilate" : "erode"}" radius="${Math.abs(grow).toFixed(2)}"/></filter>`); g = `<g filter="url(#${id}k)">${g}</g>`; }
  const op = s.op ?? 1;
  return op < 1 ? `<g opacity="${op}">${g}</g>` : g;
}
// 그림 한 장(마크 · 글자)의 안쪽(<defs> + 도형)
export function assetInner(asset, toneStyles, idp) {
  const defs = [];
  const body = asset.parts.map((p) => partSvg(asset, p, toneStyles?.[p.id], idp, defs)).join("");
  return `<defs>${defs.join("")}</defs>${body}`;
}
const vbOf = (a) => `${a.x || 0} ${a.y || 0} ${a.w} ${a.h}`;
// 마크 칸 크기 — size = 예전 네모 마크 한 변. 가로로 긴 그림(새 LW 로고)은 높이 0.64배 · 가로는 그림 비율대로
export const WIDE_H = 0.64;
export function markBox(a, size) {
  const ratio = a.w / a.h;
  if (ratio < 1.4) return { w: size, h: size };
  const h = Math.round(size * WIDE_H * 10) / 10;
  return { w: Math.round(h * ratio * 10) / 10, h };
}
// 투명 바탕 마크 · 글자
export function markSvg(r, tone, px) {
  const idp = `b${++seq}`;
  const b = markBox(r.mark, px);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbOf(r.mark)}" width="${b.w}" height="${b.h}" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">${assetInner(r.mark, r.st.mark[tone], idp)}</svg>`;
}
export const wordRatio = (r) => r.word.w / r.word.h;
export function wordSvg(r, tone, h) {
  const idp = `b${++seq}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbOf(r.word)}" width="${(h * wordRatio(r)).toFixed(1)}" height="${h}" preserveAspectRatio="none" style="display:block;overflow:visible">${assetInner(r.word, r.st.word[tone], idp)}</svg>`;
}
// 앱 아이콘(타일 + 마크) — round: 둥근 모서리 비율(0~0.5) · scale: 안쪽 크기(maskable 은 작게)
export function iconSvg(r, px, { round = 0, scale = 1, word = false } = {}) {
  const idp = `b${++seq}`;
  const t = r.tile; const S = 1000; const rx = round * S;
  const m = r.mark; const wide = m.w / m.h >= 1.4; // 새 LW 로고는 가로로 길어 타일 가로의 76% 로
  const k = (S * (wide ? 0.76 : 0.92) * (t.scale || 1) * scale) / Math.max(m.w, m.h) * (word ? (wide ? 0.92 : 0.78) : 1);
  const mw = m.w * k, mh = m.h * k;
  const mx = (S - mw) / 2, my = word ? (wide ? S * 0.26 : S * 0.07) : (S - mh) / 2;
  let wordPart = "";
  if (word) {
    const ww = S * 0.66 * scale, wh = ww / wordRatio(r);
    wordPart = `<svg x="${(S - ww) / 2}" y="${my + mh + S * 0.02}" width="${ww}" height="${wh}" viewBox="${vbOf(r.word)}" preserveAspectRatio="none">${assetInner(r.word, r.st.word.icon, idp + "w")}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${px}" height="${px}" style="display:block">
<defs><linearGradient id="${idp}t" ${angXY(t.ang ?? 60)}><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient>
<radialGradient id="${idp}h" cx=".3" cy=".1" r=".8"><stop offset="0" stop-color="${t.glow}" stop-opacity="${t.gop}"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient></defs>
<rect width="${S}" height="${S}" rx="${rx}" fill="url(#${idp}t)"/><rect width="${S}" height="${S}" rx="${rx}" fill="url(#${idp}h)"/>
<svg x="${mx}" y="${my}" width="${mw}" height="${mh}" viewBox="${vbOf(m)}">${assetInner(m, r.st.mark.icon, idp + "m")}</svg>${wordPart}</svg>`;
}

// ── 그림 파일로(브라우저 전용) ──
async function inlineImages(svg) { // <image href="/brand/..."> 를 data: 로(그림 파일로 바꿀 때 바깥 주소는 안 그려진다)
  const urls = [...new Set([...svg.matchAll(/href="(\/brand\/[a-z0-9-]+\.png)"/g)].map((m) => m[1]))];
  for (const u of urls) {
    const b = await (await fetch(u)).blob();
    const d = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
    svg = svg.split(`href="${u}"`).join(`href="${d}"`);
  }
  return svg;
}
export async function svgToPng(svg, w, h = w) {
  const s = await inlineImages(svg.replace(/width="[^"]*" height="[^"]*"/, `width="${w}" height="${h}"`));
  const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(img, 0, 0, w, h);
    return cv.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

// ── 올린 그림 → 그림 한 장(asset) ──
//  SVG: 도형을 같은 색끼리 묶어 부분으로 · PNG/JPG: 바탕을 지우고 비슷한 색끼리 나눠 부분으로(부분마다 모양 그림 1장)
export async function importFile(file, { parts = 4 } = {}) {
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (isSvg) return importSvg(await file.text());
  return importRaster(file, parts);
}
function parseColor(v) {
  if (!v) return null; v = String(v).trim().toLowerCase();
  if (v === "none" || v === "transparent") return "none";
  let m = v.match(/^#([0-9a-f]{6})$/); if (m) return "#" + m[1].toUpperCase();
  m = v.match(/^#([0-9a-f]{3})$/); if (m) return "#" + m[1].split("").map((x) => x + x).join("").toUpperCase();
  m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/); if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  const named = { black: "#000000", white: "#FFFFFF", red: "#FF0000", blue: "#0000FF", green: "#008000", gray: "#808080", grey: "#808080", navy: "#000080", orange: "#FFA500", gold: "#FFD700" };
  return named[v] || null;
}
export function importSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.querySelector("svg");
  if (!root) throw new Error("SVG 그림을 읽지 못했어요.");
  let [x, y, w, h] = (root.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) { x = 0; y = 0; w = parseFloat(root.getAttribute("width")) || 100; h = parseFloat(root.getAttribute("height")) || 100; }
  // <style> 안의 .class{fill:..} 도 조금 읽는다
  const cls = {};
  for (const st of doc.querySelectorAll("style")) for (const m of st.textContent.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) cls[m[1]] = m[2];
  const prop = (el, k) => {
    for (let e = el; e && e !== doc; e = e.parentNode) {
      if (!e.getAttribute) continue;
      const sm = (e.getAttribute("style") || "").match(new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([^;]+)`)); if (sm) return sm[1];
      if (e.getAttribute(k)) return e.getAttribute(k);
      for (const c of (e.getAttribute("class") || "").split(/\s+/)) { const cm = (cls[c] || "").match(new RegExp(`${k}\\s*:\\s*([^;]+)`)); if (cm) return cm[1]; }
    }
    return null;
  };
  const tfOf = (el) => { const t = []; for (let e = el; e && e !== root; e = e.parentNode) if (e.getAttribute?.("transform")) t.unshift(e.getAttribute("transform")); return t.join(" "); };
  const groups = new Map();
  for (const el of root.querySelectorAll(Object.keys(SVG_TAGS).join(","))) {
    if (el.closest("defs,clipPath,mask,pattern,symbol")) continue;
    const tag = el.tagName.toLowerCase(); const a = {};
    for (const k of SVG_TAGS[tag]) { const v = el.getAttribute(k); if (v != null) a[k] = k === "d" || k === "points" ? v.replace(/\s+/g, " ").trim() : v; }
    let fill = parseColor(prop(el, "fill")); const stroke = parseColor(prop(el, "stroke"));
    if (fill === null && !["line", "polyline"].includes(tag)) fill = "#000000";
    const ln = (!fill || fill === "none") && stroke && stroke !== "none";
    const col = ln ? stroke : fill; if (!col || col === "none") continue;
    const key = (ln ? "L" : "F") + col;
    if (!groups.has(key)) groups.set(key, { col, ln, items: [] });
    const tf = tfOf(el);
    groups.get(key).items.push({ tag, a, ...(tf ? { tf } : {}), ...(ln ? { ln: true } : {}) });
  }
  const list = [...groups.values()].sort((p, q) => q.items.length - p.items.length).slice(0, 12);
  if (!list.length) throw new Error("SVG 안에 색이 있는 도형이 없어요.");
  const parts = list.map((g, i) => ({ id: `p${i + 1}`, name: `부분 ${i + 1}${g.ln ? " (선)" : ""}`, type: "svg", items: g.items }));
  const asset = cleanAsset({ w, h, x, y, parts });
  if (!asset) throw new Error("SVG 도형을 읽지 못했어요(지원: path · polygon · rect · circle · ellipse · line).");
  const styles = {};
  list.forEach((g, i) => { styles[`p${i + 1}`] = g.ln ? { c1: g.col, sw: 4 } : { c1: g.col }; });
  return { asset, styles };
}
async function loadImg(file) {
  const url = URL.createObjectURL(file);
  try { const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("그림을 열지 못했어요.")); img.src = url; }); return img; }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
export async function importRaster(file, k = 4) {
  const img = await loadImg(file);
  const MAX = 640; const sc = Math.min(1, MAX / Math.max(img.width, img.height));
  const W = Math.max(1, Math.round(img.width * sc)), H = Math.max(1, Math.round(img.height * sc));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, H);
  const id = cx.getImageData(0, 0, W, H); const d = id.data;
  // 1) 바탕 지우기 — 네 모서리 색을 바탕으로 본다(이미 투명이면 그대로)
  const corner = []; const S = Math.max(2, Math.round(Math.min(W, H) * 0.02));
  for (const [ox, oy] of [[0, 0], [W - S, 0], [0, H - S], [W - S, H - S]]) for (let yy = oy; yy < oy + S; yy++) for (let xx = ox; xx < ox + S; xx++) { const i = (yy * W + xx) * 4; corner.push([d[i], d[i + 1], d[i + 2], d[i + 3]]); }
  const transBg = corner.filter((c) => c[3] < 30).length > corner.length * 0.6;
  if (!transBg) {
    const bg = [0, 1, 2].map((j) => corner.reduce((s, c) => s + c[j], 0) / corner.length);
    const T0 = 34, T1 = 70;
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
      const a = dist <= T0 ? 0 : dist >= T1 ? 1 : (dist - T0) / (T1 - T0);
      d[i + 3] = Math.round(d[i + 3] * a);
    }
  }
  // 2) 남은 그림 둘레로 자르기
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (d[(yy * W + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (yy < y0) y0 = yy; if (xx > x1) x1 = xx; if (yy > y1) y1 = yy; }
  if (x1 < 0) throw new Error("바탕과 구분되는 그림이 없어요. 바탕이 단색인 그림이나 투명 PNG 를 올려 주세요.");
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // 3) 색 나누기(k-평균) — 불투명한 칸만
  const px = [];
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const i = (yy * W + xx) * 4; if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]); }
  const kk = Math.max(1, Math.min(8, k));
  const step = Math.max(1, Math.floor(px.length / 4000)); const sample = px.filter((_, i) => i % step === 0);
  let cent = [sample[0]];
  while (cent.length < kk) { // 가장 먼 색부터 씨앗으로
    let best = null, bd = -1;
    for (const p of sample) { const dd = Math.min(...cent.map((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)); if (dd > bd) { bd = dd; best = p; } }
    if (bd < 900) break; cent.push(best);
  }
  for (let it = 0; it < 12; it++) {
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (const p of sample) { let bi = 0, bd = Infinity; cent.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } }); const a = acc[bi]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; }
    cent = acc.filter((a) => a[3]).map((a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
  }
  const near = (r, g, b) => { let bi = 0, bd = Infinity; cent.forEach((c, j) => { const dd = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } }); return bi; };
  // 4) 부분마다 모양 그림(흰색 + 투명도)
  const masks = cent.map(() => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); return { c, x, im: x.createImageData(w, h), n: 0 }; });
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = ((yy + y0) * W + xx + x0) * 4; const a = d[i + 3]; if (a < 8) continue;
    const m = masks[near(d[i], d[i + 1], d[i + 2])]; const o = (yy * w + xx) * 4;
    m.im.data[o] = m.im.data[o + 1] = m.im.data[o + 2] = 255; m.im.data[o + 3] = a; m.n++;
  }
  const order = masks.map((m, i) => i).filter((i) => masks[i].n > w * h * 0.002).sort((p, q) => masks[q].n - masks[p].n);
  const parts = [], styles = {};
  order.forEach((i, n) => {
    const m = masks[i]; m.x.putImageData(m.im, 0, 0);
    const pid = `p${n + 1}`;
    parts.push({ id: pid, name: `부분 ${n + 1}`, type: "mask", src: m.c.toDataURL("image/png") });
    styles[pid] = { c1: rgbToHex(...cent[i]) };
  });
  const asset = cleanAsset({ w, h, parts });
  if (!asset) throw new Error("그림을 부분으로 나누지 못했어요.");
  return { asset, styles };
}
export const assetBytes = (a) => JSON.stringify(a || {}).length;
