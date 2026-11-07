// ======================= src/textOverrides.js =======================
// ⭐ 2026-11-06 문구 바꾸기(전체 화면) — 엔진
//  최고관리자(totalMaster · 부관리자)가 프로그램 안에서 아무 글자나 바로 고칠 수 있게 하는 "글자 덮어쓰기" 층.
//  화면 코드를 하나하나 고치지 않고, 화면에 그려진 글자(텍스트 노드)와 입력칸 안내문구(placeholder)·
//  툴팁(title)을 "원래 문구 → 새 문구" 사전으로 바꿔 보여준다. 로직에서 쓰는 값은 그대로이고 보이는 글자만 바뀐다.
//
//  저장 위치(Firestore)
//   textOverrides/global            프로그램 전체 { t: {원래:새}, a: {"placeholder::원래":새, "title::원래":새}, s: {원래:{ff,fw,fs,c,bg,u,i,st}} }
//                                   s(2026-11-07) = 글자 모양(글씨체 키·두께·크기px·글자색·배경색·밑줄·기울임·취소선). 값은 저장·적용 때 모두 화이트리스트 검사
//   textOverrides/r~pc~~app 등      이 화면만(기기 + 주소별) — 같은 모양
//   textOverridesPublic/(같은 id)   로그인 전 화면(로그인·기사 로그인 등)용 사본 — 누구나 읽기
//  읽기: 로그인한 사용자 전체 · 쓰기: 최고관리자만(firestore.rules)
//  앱 시작 때 한 번 받아 localStorage에 넣어두고(다음 접속은 그 값으로 즉시 적용), 바뀐 화면 부분만 다시 본다.
//
//  성능
//   · 바꿀 문구가 하나도 없으면 감시(MutationObserver)를 아예 켜지 않는다.
//   · 감시는 "새로 붙은 노드 · 글자가 바뀐 노드"만 본다(전체 다시 훑기는 사전이 바뀔 때만).
//   · 표 본문(tbody)·입력칸·편집 가능한 칸·[data-kp-no-text]는 통째로 건너뛴다 — 오더·기사 같은 데이터는 안 바뀐다.
//   · 숫자가 많은 글자(금액·날짜·전화번호 등)는 아예 대상이 아니다.
import { db, auth } from "./firebase";
import { doc, setDoc, getDocs, collection, serverTimestamp, deleteField } from "firebase/firestore";
import { isPreviewMode } from "./fsTenant";
import { uiBypassed } from "./uiBypass"; // ⭐ 2026-11-07 ?noui=1 — 화면 편집 모두 끄기

export const ATTRS = ["placeholder", "title"];
const CACHE_KEY = "kpTextOverrides:v1";
const DEMO_KEY = "kpTextOverridesDemo:v1"; // 개발 서버 둘러보기 전용(서버 저장 안 함)
const MAX_LEN = 300;
const PUBLIC_PATHS = new Set(["/login", "/transport-login", "/shipper-login", "/driver-login", "/driver-register", "/signup", "/shipper-signup", "/shipper-pending", "/no-access", "/upload", "/driver-upload", "/standard-fare"]);

// ───────────────────────── 어디(범위) ─────────────────────────
export function deviceKind() {
  try {
    const ua = navigator.userAgent.toLowerCase();
    if ((navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || ua.includes("ipad") || ua.includes("tablet")) return "pc";
    return /iphone|ipod|android(?!.*tablet)/.test(ua) || window.innerWidth < 768 ? "m" : "pc";
  } catch { return "pc"; }
}
const normPath = (p) => (String(p || "/").replace(/\/+$/, "") || "/");
export function currentRouteKey() { return `${deviceKind()}:${normPath(window.location.pathname)}`; }
export const routeDocId = (routeKey) => "r~" + String(routeKey).replace(/\//g, "~");
export function routeLabel(docId) {
  if (docId === "global") return "프로그램 전체";
  const k = String(docId).replace(/^r~/, "").replace(/~/g, "/");
  const [dev, ...rest] = k.split(":");
  return `${dev === "m" ? "모바일" : "PC"} ${rest.join(":")}`;
}
const isPublicDoc = (docId) => docId === "global" || PUBLIC_PATHS.has(String(docId).replace(/^r~(m|pc):/, "").replace(/~/g, "/"));

// ───────────────────────── 대상 글자 판정 ─────────────────────────
// 숫자가 많은 글자(금액·날짜·차량번호·전화 등)는 데이터일 가능성이 높아 아예 대상에서 뺀다
export function isEligibleText(s) {
  const t = String(s || "").trim();
  if (!t || t.length > MAX_LEN) return false;
  if (/^__.*__$/.test(t)) return false; // Firestore 예약 이름
  const digits = (t.match(/\d/g) || []).length;
  if (digits === 0) return true;
  const letters = t.replace(/[\s\d.,:;\-/()~+%₩원]/g, "").length;
  return digits <= 2 && letters >= 2 && digits / t.replace(/\s/g, "").length < 0.3;
}

// ───────────────────────── 글자 모양(스타일) ─────────────────────────
// 글씨체는 키만 저장하고 CSS 글꼴 목록은 여기서만 만든다(CSS 주입 방지). 모두 기기 기본 글꼴로 대체되는 목록.
export const FONTS = {
  noto: { label: "Noto Sans KR", css: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" },
  nanum: { label: "나눔고딕", css: "'Nanum Gothic', NanumGothic, '나눔고딕', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" },
  gothica1: { label: "고딕 A1", css: "'Gothic A1', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" },
  malgun: { label: "맑은 고딕", css: "'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" },
  gulim: { label: "굴림", css: "Gulim, '굴림', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" },
  serif: { label: "바탕(명조)", css: "Batang, '바탕', AppleMyungjo, 'Noto Serif KR', serif" },
  mono: { label: "고정폭", css: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace" },
};
export const WEIGHTS = [400, 500, 700, 900];
export const SIZE_MIN = 8; export const SIZE_MAX = 48;
const HEX = /^#[0-9a-fA-F]{6}$/;
const STYLE_KEYS = ["ff", "fw", "fs", "c", "bg", "u", "i", "st"];

// 허용된 값만 남긴다(나머지는 버림) — 비면 null
export function cleanStyle(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = {};
  if (typeof x.ff === "string" && Object.prototype.hasOwnProperty.call(FONTS, x.ff)) o.ff = x.ff;
  const fw = Number(x.fw); if (WEIGHTS.includes(fw)) o.fw = fw;
  const fs = Number(x.fs); if (Number.isInteger(fs) && fs >= SIZE_MIN && fs <= SIZE_MAX) o.fs = fs;
  if (typeof x.c === "string" && HEX.test(x.c)) o.c = x.c.toUpperCase();
  if (typeof x.bg === "string" && HEX.test(x.bg)) o.bg = x.bg.toUpperCase();
  for (const k of ["u", "i", "st"]) if (x[k] === true) o[k] = true;
  return Object.keys(o).length ? o : null;
}
export const sameStyle = (a, b) => JSON.stringify(cleanStyle(a)) === JSON.stringify(cleanStyle(b));
// 검사한 값으로만 CSS 속성 목록을 만든다
export function cssFor(st0) {
  const st = cleanStyle(st0);
  if (!st) return null;
  const css = {};
  if (st.ff) css["font-family"] = FONTS[st.ff].css;
  if (st.fw) css["font-weight"] = String(st.fw);
  if (st.fs) css["font-size"] = st.fs + "px";
  if (st.c) css.color = st.c;
  if (st.bg) css["background-color"] = st.bg;
  if (st.i) css["font-style"] = "italic";
  if (st.u || st.st) css["text-decoration-line"] = [st.u && "underline", st.st && "line-through"].filter(Boolean).join(" ");
  return css;
}

// ───────────────────────── 사전 상태 ─────────────────────────
let docs = {}; // { docId: { t: {}, a: {} } }
let textMap = new Map(); // 지금 화면에 적용 중(전체 + 이 화면)
let attrMap = new Map(); // "placeholder::원래" → 새
let styleMap = new Map(); // 원래 → 글자 모양
const preview = { t: new Map(), s: new Map() }; // 편집 창에서 고르는 중인 값(저장 전 미리 보기)
let activeRoute = "";
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => { listeners.forEach((fn) => { try { fn(); } catch { /* 무시 */ } }); };
export const getDocsSnapshot = () => docs;

function cleanDoc(d) {
  const out = { t: {}, a: {}, s: {} };
  if (d && d.t && typeof d.t === "object") for (const [k, v] of Object.entries(d.t)) if (typeof v === "string" && v.trim() && k.trim()) out.t[k] = v;
  if (d && d.a && typeof d.a === "object") for (const [k, v] of Object.entries(d.a)) if (typeof v === "string" && k.includes("::")) out.a[k] = v;
  if (d && d.s && typeof d.s === "object") for (const [k, v] of Object.entries(d.s)) { const c = k.trim() ? cleanStyle(v) : null; if (c) out.s[k] = c; }
  return out;
}
const EMPTY = { t: {}, a: {}, s: {} };

function rebuildMaps(force = false) {
  const rk = currentRouteKey();
  if (!force && rk === activeRoute) return false;
  activeRoute = rk;
  const g = docs.global || EMPTY;
  const r = docs[routeDocId(rk)] || EMPTY;
  textMap = new Map([...Object.entries(g.t || {}), ...Object.entries(r.t || {})]);
  attrMap = new Map([...Object.entries(g.a || {}), ...Object.entries(r.a || {})]);
  styleMap = new Map([...Object.entries(g.s || {}), ...Object.entries(r.s || {})]);
  for (const [k, v] of preview.t) { if (v === null) textMap.delete(k); else textMap.set(k, v); }
  for (const [k, v] of preview.s) { if (v === null) styleMap.delete(k); else styleMap.set(k, v); }
  if (uiBypassed()) { textMap = new Map(); attrMap = new Map(); styleMap = new Map(); } // 모두 끄기 — 원래 글자로
  return true;
}

// 편집 창 미리 보기 — orig 글자에 고르는 중인 문구·모양을 바로 보여준다(저장 안 함). clearPreview로 끝낸다
export function setPreview(orig, { text, style } = {}) {
  const o = String(orig || "").trim();
  if (!o) return;
  if (text !== undefined) preview.t.set(o, text && text.trim() ? text : null);
  if (style !== undefined) preview.s.set(o, cleanStyle(style));
  rebuildMaps(true); reapplyAll();
}
export function clearPreview() {
  if (!preview.t.size && !preview.s.size) return;
  preview.t.clear(); preview.s.clear();
  rebuildMaps(true); reapplyAll();
}

// 이 글자에 바꿀 문구가 있으면 그 문구(없으면 그대로) — alert·confirm 같은 곳에서도 쓴다
export function translate(s) {
  if (typeof s !== "string" || !textMap.size) return s;
  const t = s.trim();
  const v = textMap.get(t);
  return v === undefined ? s : s.replace(t, v);
}

// ───────────────────────── DOM 적용 ─────────────────────────
const ORIG = "__kpTxOrig"; // 텍스트 노드의 원래 글자
const APPLIED = "__kpTxApplied"; // 우리가 넣은 글자(React가 다시 쓴 것과 구분)
const AORIG = "__kpTxAOrig"; // 요소: { placeholder: 원래, ... }
const tracked = new Set(); // 바꿔둔 노드(되돌리기용)
const SKIP_TAGS = new Set(["TBODY", "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE", "SVG", "CANVAS", "IFRAME", "OPTION"]);
export const SKIP_SELECTOR = "tbody, script, style, textarea, select, code, pre, [contenteditable=''], [contenteditable='true'], [data-kp-no-text], [data-kp-tx-ui], [role='row'], [role='gridcell']";
export const stats = { scans: 0, nodes: 0, ms: 0, replaced: 0 };

function isSkipElement(el) {
  const tag = el.tagName;
  if (tag === "INPUT") return false; // INPUT은 자식이 없고 placeholder·title만 본다
  if (SKIP_TAGS.has(tag) || tag === "svg") return true;
  if (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") return true;
  if (el.hasAttribute("data-kp-no-text") || el.hasAttribute("data-kp-tx-ui")) return true;
  const role = el.getAttribute("role");
  return role === "row" || role === "gridcell";
}

function applyText(node) {
  stats.nodes++;
  let base = node.nodeValue;
  if (node[APPLIED] !== undefined) {
    if (base === node[APPLIED]) base = node[ORIG]; // 우리가 바꿔둔 그대로 — 원래 글자 기준으로 다시 판단
    else { node[APPLIED] = undefined; node[ORIG] = undefined; tracked.delete(node); } // React가 새 글자로 바꿈
  }
  if (!base || base.length > MAX_LEN + 40) { if (node[SREC]) unstyle(node); return; }
  const t = base.trim();
  const v = t ? textMap.get(t) : undefined;
  if (v === undefined) {
    if (node[APPLIED] !== undefined) { node[APPLIED] = undefined; node.nodeValue = node[ORIG]; node[ORIG] = undefined; tracked.delete(node); }
  } else {
    const next = base.replace(t, v);
    node[ORIG] = base; node[APPLIED] = next; tracked.add(node);
    if (node.nodeValue !== next) { node.nodeValue = next; stats.replaced++; }
  }
  const st = t && styleMap.size ? styleMap.get(t) : undefined;
  if (st) styleNode(node, st); else if (node[SREC]) unstyle(node);
}

// ── 글자 모양 적용 ──
//  ① 글자의 부모 요소에 그 글자 하나만 있으면(공백 제외) 부모에 인라인 스타일(원래 값은 기억해 두었다가 되돌림)
//  ② 다른 글자·아이콘과 섞여 있으면 <span data-kp-txs>로 감싸 그 span에만 — React가 이 글자 노드를
//     지우거나 옮길 때 깨지지 않도록 removeChild·insertBefore·appendChild를 감싼 span 기준으로 바꿔준다(installDomGuard)
const SREC = "__kpTxStyle"; // 텍스트 노드: { mode, el, sig }
const SORIG = "__kpTxSOrig"; // 요소: { 속성: [원래 값, 원래 우선순위, 넣은 값] }
const styled = new Set(); // 모양을 넣어둔 텍스트 노드
const isWrap = (el) => !!el && el.nodeType === 1 && el.hasAttribute("data-kp-txs");

function soleText(p, node) {
  for (const c of p.childNodes) {
    if (c === node || c.nodeType === 8) continue; // 자신 · 주석
    if (c.nodeType === 3 && !c.nodeValue.trim()) continue;
    return false;
  }
  return true;
}
function setCss(el, css) {
  const o = el[SORIG] || (el[SORIG] = {});
  for (const [k, v] of Object.entries(css)) {
    if (!o[k]) o[k] = [el.style.getPropertyValue(k), el.style.getPropertyPriority(k), v];
    else o[k][2] = v;
    el.style.setProperty(k, v, "important");
  }
}
function unsetCss(el) {
  const o = el[SORIG];
  if (!o) return;
  el[SORIG] = undefined;
  for (const [k, [ov, op]] of Object.entries(o)) {
    if (el.style.getPropertyPriority(k) !== "important") continue; // React가 그새 새 값을 넣었으면 그 값을 둔다
    if (ov) el.style.setProperty(k, ov, op); else el.style.removeProperty(k);
  }
  if (el.getAttribute("style") === "") el.removeAttribute("style");
}
function styleNode(node, st) {
  const css = cssFor(st);
  if (!css) { if (node[SREC]) unstyle(node); return; }
  const sig = JSON.stringify(css);
  const rec = node[SREC];
  const p = node.parentNode;
  if (rec && rec.sig === sig && rec.el === p && (rec.mode === "wrap" || soleText(p, node))) return; // 그대로
  if (rec) unstyle(node);
  const p2 = node.parentNode;
  if (!p2 || p2.nodeType !== 1 || p2 === document.body || p2 === document.documentElement) return;
  if (soleText(p2, node)) {
    setCss(p2, css);
    node[SREC] = { mode: "parent", el: p2, sig };
  } else {
    installDomGuard();
    const w = document.createElement("span");
    w.setAttribute("data-kp-txs", "");
    p2.insertBefore(w, node);
    w.appendChild(node);
    setCss(w, css["background-color"] ? { ...css, "border-radius": "3px" } : css);
    node[SREC] = { mode: "wrap", el: w, sig };
  }
  styled.add(node);
}
function unstyle(node) {
  const rec = node[SREC];
  node[SREC] = undefined; styled.delete(node);
  if (!rec) return;
  if (rec.mode === "parent") { unsetCss(rec.el); return; }
  const w = rec.el;
  const p = w.parentNode;
  if (p && node.parentNode === w) p.insertBefore(node, w); // 원래 자리로
  if (p && !w.firstChild) p.removeChild(w);
}

// React는 글자 노드의 부모를 원래 요소로 기억한다 — 감싼 span 안에 있는 글자를 원래 부모 기준으로
//  지우거나(removeChild), 그 앞에 끼우거나(insertBefore), 옮길 때(appendChild) span 기준으로 바꿔 처리한다.
//  (구글 번역이 React 화면을 깨뜨리는 것과 같은 문제를 막는 흔한 방법) — 처음 감쌀 때 한 번만 설치
let guardOn = false;
function installDomGuard() {
  if (guardOn || typeof Node === "undefined") return;
  guardOn = true;
  const P = Node.prototype;
  const oRemove = P.removeChild; const oInsert = P.insertBefore; const oAppend = P.appendChild;
  const wrapOf = (n) => (n && n[SREC]?.mode === "wrap" && n.parentNode === n[SREC].el ? n[SREC].el : null);
  P.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      const w = child.parentNode;
      if (isWrap(w) && w.parentNode === this) {
        oRemove.call(this, w); oRemove.call(w, child);
        child[SREC] = undefined; styled.delete(child);
        return child;
      }
    }
    return oRemove.call(this, child);
  };
  P.insertBefore = function (newNode, ref) {
    let r = ref;
    if (r && r.parentNode !== this && isWrap(r.parentNode) && r.parentNode.parentNode === this) r = r.parentNode;
    const w = wrapOf(newNode);
    if (w && w !== r) { oInsert.call(this, w, r); return newNode; } // 감싼 글자를 옮기면 span째 옮긴다
    return oInsert.call(this, newNode, r);
  };
  P.appendChild = function (child) {
    const w = wrapOf(child);
    if (w) { oAppend.call(this, w); return child; }
    return oAppend.call(this, child);
  };
}

function applyAttrs(el) {
  for (const name of ATTRS) {
    if (!el.hasAttribute(name)) continue;
    const cur = el.getAttribute(name);
    const o = el[AORIG] || (el[AORIG] = {});
    let base = cur;
    if (o[name] && o[name].applied !== undefined) {
      if (cur === o[name].applied) base = o[name].orig;
      else delete o[name];
    }
    const t = (base || "").trim();
    const v = t ? attrMap.get(`${name}::${t}`) : undefined;
    if (v === undefined) {
      if (o[name]) { el.setAttribute(name, o[name].orig); delete o[name]; }
      continue;
    }
    o[name] = { orig: base, applied: v }; tracked.add(el);
    if (cur !== v) { el.setAttribute(name, v); stats.replaced++; }
  }
}

function scan(root) {
  if (!root) return;
  if (root.nodeType === 3) { applyText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  const wantText = textMap.size > 0 || styleMap.size > 0; const wantAttr = attrMap.size > 0;
  if (root.nodeType === 1) {
    if (isSkipElement(root)) { if (wantAttr && root.tagName === "TEXTAREA") applyAttrs(root); return; }
    if (wantAttr) applyAttrs(root);
  }
  const walker = document.createTreeWalker(root, 1 | 4, {
    acceptNode(n) {
      if (n.nodeType === 3) return wantText ? 1 : 3;
      if (isSkipElement(n)) {
        if (wantAttr && (n.tagName === "TEXTAREA")) applyAttrs(n);
        return 2; // 통째로 건너뜀(표 본문 등)
      }
      if (wantAttr && n.attributes.length) applyAttrs(n);
      return 3; // 요소 자체는 넘기고 자식만 본다
    },
  });
  let n;
  while ((n = walker.nextNode())) applyText(n);
}

// 이 노드가 건너뛸 구역(표 본문 등) 안에 있나 — 변경 1건당 한 번만 본다
//  forAttr: 입력칸 자신의 placeholder·title은 표 밖이면 바꾼다(textarea 포함)
function inSkipZone(node, forAttr = false) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el) return true;
  if (forAttr && el.tagName === "TEXTAREA") return !!el.parentElement?.closest(SKIP_SELECTOR);
  return !!el.closest(SKIP_SELECTOR + ", svg");
}

let observer = null;
function onMutations(records) {
  const t0 = performance.now();
  stats.scans++;
  for (const r of records) {
    if (r.type === "childList") {
      if (!r.addedNodes.length) continue;
      if (inSkipZone(r.target)) continue;
      for (const n of r.addedNodes) { if (isWrap(n)) continue; scan(n); } // 우리가 만든 span은 건너뜀
    } else if (r.type === "characterData") {
      const n = r.target;
      if (n[APPLIED] !== undefined && n.nodeValue === n[APPLIED]) continue; // 우리가 쓴 것
      if (!textMap.size && !styleMap.size && n[APPLIED] === undefined && !n[SREC]) continue;
      if (inSkipZone(n)) continue;
      applyText(n);
    } else if (r.type === "attributes") {
      const el = r.target;
      const o = el[AORIG]?.[r.attributeName];
      if (o && el.getAttribute(r.attributeName) === o.applied) continue;
      if (inSkipZone(el, true)) continue;
      applyAttrs(el);
    }
  }
  stats.ms += performance.now() - t0;
}

function restoreAll() {
  for (const n of tracked) {
    if (n.nodeType === 3) {
      if (n[APPLIED] !== undefined && n.nodeValue === n[APPLIED]) n.nodeValue = n[ORIG];
      n[APPLIED] = undefined; n[ORIG] = undefined;
    } else if (n[AORIG]) {
      for (const [name, o] of Object.entries(n[AORIG])) if (n.getAttribute(name) === o.applied) n.setAttribute(name, o.orig);
      n[AORIG] = undefined;
    }
  }
  tracked.clear();
  for (const n of [...styled]) unstyle(n);
  styled.clear();
}

// 사전이 바뀌었을 때 — 되돌린 뒤 화면 전체를 한 번 다시 본다(드문 일)
function reapplyAll() {
  if (typeof document === "undefined" || !document.body) return;
  observer?.takeRecords();
  restoreAll();
  const any = textMap.size > 0 || attrMap.size > 0 || styleMap.size > 0;
  if (any) {
    if (!observer) observer = new MutationObserver(onMutations);
    observer.disconnect();
    const t0 = performance.now();
    scan(document.body);
    stats.ms += performance.now() - t0;
    const opts = { childList: true, subtree: true, characterData: true };
    if (attrMap.size > 0) { opts.attributes = true; opts.attributeFilter = ATTRS; }
    observer.observe(document.body, opts);
  } else if (observer) observer.disconnect();
}

// 화면 이동(주소 바뀜) — "이 화면만" 문구가 달라질 수 있다
function onRouteMaybeChanged() { if (rebuildMaps()) { reapplyAll(); emit(); } }

// 바꾸기 전 원래 글자(편집 창에서 보여줌)
export function originalTextOf(node) { return node[APPLIED] !== undefined && node.nodeValue === node[APPLIED] ? node[ORIG] : node.nodeValue; }
export function originalAttrOf(el, name) { const o = el[AORIG]?.[name]; return o && el.getAttribute(name) === o.applied ? o.orig : el.getAttribute(name); }

// ───────────────────────── 불러오기 · 저장 ─────────────────────────
const isDemo = () => import.meta.env.DEV && (isPreviewMode() || window.location.pathname === "/preview");

function setDocs(next, { cache = true } = {}) {
  docs = next || {};
  if (cache) { try { localStorage.setItem(isDemo() ? DEMO_KEY : CACHE_KEY, JSON.stringify({ ts: Date.now(), docs })); } catch { /* 저장공간 부족 — 캐시만 못 함 */ } }
  rebuildMaps(true);
  reapplyAll();
  emit();
}

// 예전(모양 없는) 캐시도 그대로 읽고, 읽을 때 한 번 더 검사한다(손댄 localStorage로 CSS가 들어가지 않게)
function readCache(key) {
  try {
    const j = JSON.parse(localStorage.getItem(key) || "null");
    if (!j || !j.docs || typeof j.docs !== "object") return null;
    const out = {};
    for (const [id, d] of Object.entries(j.docs)) if (/^(global|r~[^/]+)$/.test(id)) out[id] = cleanDoc(d);
    return out;
  } catch { return null; }
}

let loadedFor = null;
// 서버에서 한 번 받아온다(로그인 상태가 바뀌면 다시 한 번)
export async function loadFromServer() {
  if (isDemo()) return;
  const signed = !!auth.currentUser;
  const key = signed ? `u:${auth.currentUser.uid}` : "public";
  if (loadedFor === key) return;
  loadedFor = key;
  try {
    const snap = await getDocs(collection(db, signed ? "textOverrides" : "textOverridesPublic"));
    const next = {};
    snap.forEach((d) => { next[d.id] = cleanDoc(d.data()); });
    setDocs(next);
  } catch (e) {
    loadedFor = null;
    console.warn("[문구] 불러오기 실패 — 저장해둔 값으로 보여줍니다", e?.message || e);
  }
}

// 하나 저장/지우기 — kind: "text" | "placeholder" | "title", value 비우면(null) 지움
export async function saveOverride({ docId, kind, orig, value }) {
  const o = String(orig || "").trim();
  if (!o || o.length > MAX_LEN) throw new Error("원래 문구가 비었거나 너무 깁니다");
  const field = kind === "text" ? "t" : "a";
  const key = kind === "text" ? o : `${kind}::${o}`;
  const v = value == null ? null : String(value);
  const next = { ...docs, [docId]: { t: { ...(docs[docId]?.t || {}) }, a: { ...(docs[docId]?.a || {}) }, s: { ...(docs[docId]?.s || {}) } } };
  if (v === null || v.trim() === "") delete next[docId][field][key]; else next[docId][field][key] = v;
  if (isDemo()) { setDocs(next); return; }
  const payload = { [field]: { [key]: v === null || v.trim() === "" ? deleteField() : v }, updatedAt: serverTimestamp(), by: auth.currentUser?.email || "" };
  await setDoc(doc(db, "textOverrides", docId), payload, { merge: true });
  if (isPublicDoc(docId)) await setDoc(doc(db, "textOverridesPublic", docId), payload, { merge: true }).catch((e) => console.warn("[문구] 로그인 전 화면용 사본 저장 실패", e));
  setDocs(next);
}

// 글자 모양 저장/지우기 — style이 비면(null·모두 기본값) 지움. 문서에는 검사한 값만 들어가고,
//  merge 저장이라 빠진 속성은 deleteField로 지워 "통째로 바꾸기"가 되게 한다
export async function saveStyle({ docId, orig, style }) {
  const o = String(orig || "").trim();
  if (!o || o.length > MAX_LEN || !isEligibleText(o)) throw new Error("이 글자에는 모양을 넣을 수 없어요");
  if (!/^(global|r~[^/]+)$/.test(docId)) throw new Error("범위가 잘못됐어요");
  const st = cleanStyle(style);
  const next = { ...docs, [docId]: { t: { ...(docs[docId]?.t || {}) }, a: { ...(docs[docId]?.a || {}) }, s: { ...(docs[docId]?.s || {}) } } };
  if (st) next[docId].s[o] = st; else delete next[docId].s[o];
  if (isDemo()) { setDocs(next); return; }
  let val;
  if (!st) val = deleteField();
  else { val = {}; for (const k of STYLE_KEYS) val[k] = st[k] !== undefined ? st[k] : deleteField(); }
  const payload = { s: { [o]: val }, updatedAt: serverTimestamp(), by: auth.currentUser?.email || "" };
  await setDoc(doc(db, "textOverrides", docId), payload, { merge: true });
  if (isPublicDoc(docId)) await setDoc(doc(db, "textOverridesPublic", docId), payload, { merge: true }).catch((e) => console.warn("[문구] 로그인 전 화면용 사본 저장 실패", e));
  setDocs(next);
}

// 여러 개 한 번에(가져오기) — { docId: { t, a } }
export async function importOverrides(data) {
  const next = { ...docs };
  const writes = [];
  for (const [docId, d0] of Object.entries(data || {})) {
    if (!/^(global|r~[^/]+)$/.test(docId)) continue;
    const d = cleanDoc(d0);
    next[docId] = { t: { ...(next[docId]?.t || {}), ...d.t }, a: { ...(next[docId]?.a || {}), ...d.a }, s: { ...(next[docId]?.s || {}), ...d.s } };
    if (Object.keys(d.t).length || Object.keys(d.a).length || Object.keys(d.s).length) writes.push([docId, d]);
  }
  if (!isDemo()) {
    for (const [docId, d] of writes) {
      const payload = { t: d.t, a: d.a, ...(Object.keys(d.s).length ? { s: d.s } : {}), updatedAt: serverTimestamp(), by: auth.currentUser?.email || "" };
      await setDoc(doc(db, "textOverrides", docId), payload, { merge: true });
      if (isPublicDoc(docId)) await setDoc(doc(db, "textOverridesPublic", docId), payload, { merge: true }).catch(() => {});
    }
  }
  setDocs(next);
  return writes.reduce((n, [, d]) => n + Object.keys(d.t).length + Object.keys(d.a).length + Object.keys(d.s).length, 0);
}

export function exportOverrides() { return JSON.parse(JSON.stringify(docs)); }

// ───────────────────────── 시작 ─────────────────────────
let started = false;
export function initTextOverrides() {
  if (started || typeof window === "undefined") return;
  started = true;
  docs = readCache(isDemo() ? DEMO_KEY : CACHE_KEY) || {};
  rebuildMaps(true);
  const go = () => reapplyAll();
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go, { once: true });
  // 주소 바뀜 감지(react-router는 pushState를 쓴다)
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m];
    history[m] = function (...args) { const r = orig.apply(this, args); try { onRouteMaybeChanged(); } catch { /* 무시 */ } return r; };
  }
  window.addEventListener("popstate", onRouteMaybeChanged);
  window.addEventListener("resize", () => { clearTimeout(initTextOverrides._rz); initTextOverrides._rz = setTimeout(onRouteMaybeChanged, 300); });
  // 알림창(alert/confirm/prompt)의 글자도 같은 사전으로
  for (const m of ["alert", "confirm", "prompt"]) {
    const orig = window[m];
    if (typeof orig !== "function") continue;
    window[m] = function (msg, ...rest) { return orig.call(this, typeof msg === "string" ? translate(msg) : msg, ...rest); };
  }
  // 바꿔둔 노드 중 화면에서 사라진 것 정리(메모리)
  setInterval(() => {
    if (tracked.size > 300) for (const n of tracked) if (!n.isConnected) tracked.delete(n);
    if (styled.size > 300) for (const n of styled) if (!n.isConnected) { n[SREC] = undefined; styled.delete(n); }
  }, 30000);
  // 로그인 상태가 정해지면 서버에서 한 번 받는다
  try { auth.onAuthStateChanged(() => { loadFromServer(); }); } catch { /* 무시 */ }
  if (import.meta.env.DEV) window.__kpTx = { stats, translate, get styled() { return styled.size; }, get docs() { return docs; }, reapplyAll, setDocs: (d) => setDocs(d, { cache: false }) }; // 🧪 개발 점검용
}
