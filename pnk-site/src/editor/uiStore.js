// ======================= pnk-site/src/editor/uiStore.js =======================
// 🎨 인트라넷 화면 편집 — 저장소 · 적용 엔진(모든 사람 화면에 적용)
//  저장: pnkUi/live (누구나 읽기 — 로그인 화면 문구도 바꾸므로) · 쓰기는 최고관리자 · 부관리자(2차 인증 후, 규칙 pnkTM)
//        pnkUiHistory/{id} 저장할 때마다 한 벌(최근 20개 되살리기)
//  구조: { v:1,
//    etexts: { "/경로": { 선택자: { "글자 순번": { o: 원래글, t: 새글 } } } } — 고른 요소의 그 글자만(기본). 그 자리 글이 원래글과 다르면(다른 사람 이름 등) 안 바꾼다
//    texts:  { "*": { 원래글: 새글 }, "/경로": { … } }      — 같은 글자 모두 바꾸기(그 화면 / 모든 화면)
//    styles: { "/경로" | "*": { 선택자: { fs, fw, color, bg, pad, radius, tx, ty, w, h, hidden, align, ls } } }  — 모양 · 위치 · 크기 · 숨기기
//    menu:   { items: { "/to": { label, hidden, order } }, groups: { 원래이름: 새이름 } }
//    theme:  { primary, bg, font, scale, brandTitle, brandSub, css } }
//  선택자는 화면 틀 기준 경로(#root > … > div:nth-child(2)) — 목록 행(데이터)처럼 바뀌는 곳보다 화면 틀(제목 · 카드 · 버튼)에 맞다
import { doc, onSnapshot, setDoc, addDoc, collection, serverTimestamp, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

export const EMPTY = { v: 1, texts: {}, etexts: {}, styles: {}, menu: { items: {}, groups: {} }, theme: {} };
const clone = (o) => JSON.parse(JSON.stringify(o || EMPTY));
let published = clone(EMPTY);
let draft = null; // 편집 중(저장 전) — 이 사람 화면에만 보인다
let undoStack = [];
let redoStack = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const current = () => draft || published;
export const isEditing = () => !!draft;
export const touch = () => { applyAll(); emit(); };
export const dirty = () => !!draft && JSON.stringify(draft) !== JSON.stringify(published);
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

let started = false;
export function startUi() {
  if (started) return;
  started = true;
  try { const c = localStorage.getItem("pnkUiCache"); if (c) published = { ...clone(EMPTY), ...JSON.parse(c) }; } catch { /* 무시 */ }
  applyAll();
  onSnapshot(doc(db, "pnkUi", "live"), (s) => {
    published = s.exists() ? { ...clone(EMPTY), ...s.data() } : clone(EMPTY);
    try { localStorage.setItem("pnkUiCache", JSON.stringify(published)); } catch { /* 무시 */ }
    applyAll(); emit();
  }, () => {});
}

export function beginEdit() { if (!draft) { draft = clone(published); undoStack = []; redoStack = []; } applyAll(); emit(); }
export function endEdit() { draft = null; applyAll(); emit(); }
export function edit(fn) {
  if (!draft) beginEdit();
  undoStack.push(JSON.stringify(draft)); if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
  fn(draft);
  applyAll(); emit();
}
export function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(draft)); draft = JSON.parse(undoStack.pop()); applyAll(); emit(); }
export function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(draft)); draft = JSON.parse(redoStack.pop()); applyAll(); emit(); }
export function discard() { draft = clone(published); undoStack = []; redoStack = []; applyAll(); emit(); }
export async function publish(by) {
  const data = { ...clone(draft || published), updatedAt: serverTimestamp(), by: by || "" };
  await setDoc(doc(db, "pnkUi", "live"), data);
  await addDoc(collection(db, "pnkUiHistory"), { cfg: JSON.stringify(draft || published), at: serverTimestamp(), by: by || "" }).catch(() => {});
  published = clone(draft || published);
  emit();
}
export async function history() {
  const s = await getDocs(query(collection(db, "pnkUiHistory"), orderBy("at", "desc"), limit(20)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export function loadToDraft(cfgJson) { edit((d) => { const c = JSON.parse(cfgJson); Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, { ...clone(EMPTY), ...c }); }); }
export function resetAll() { edit((d) => { Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, clone(EMPTY)); }); }

// ───────────── 화면 경로 · 선택자 ─────────────
export const routeKey = () => document.documentElement.dataset.pnkRoute || location.pathname || "/";
export function selectorOf(el) {
  const root = document.getElementById("root");
  const parts = [];
  let e = el;
  while (e && e !== root && e.nodeType === 1 && parts.length < 40) {
    const p = e.parentElement;
    if (!p) break;
    const i = Array.prototype.indexOf.call(p.children, e) + 1;
    parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${i})`);
    e = p;
  }
  return e === root ? `#root > ${parts.join(" > ")}` : "";
}

// ───────────── 적용: 모양(CSS) ─────────────
const px = (v) => (v === "" || v == null ? null : `${Number(v)}px`);
function rulesFor(st) {
  const r = [];
  if (st.fs) r.push(`font-size:${px(st.fs)}!important`);
  if (st.fw) r.push(`font-weight:${st.fw}!important`);
  if (st.color) r.push(`color:${st.color}!important`);
  if (st.bg) r.push(`background:${st.bg}!important`);
  if (st.pad !== undefined && st.pad !== "") r.push(`padding:${px(st.pad)}!important`);
  if (st.radius !== undefined && st.radius !== "") r.push(`border-radius:${px(st.radius)}!important`);
  if (st.align) r.push(`text-align:${st.align}!important`);
  if (st.ls !== undefined && st.ls !== "") r.push(`letter-spacing:${px(st.ls)}!important`);
  if (st.w) r.push(`width:${px(st.w)}!important;max-width:none!important`);
  if (st.h) r.push(`height:${px(st.h)}!important;min-height:0!important`);
  if (st.tx || st.ty) r.push(`transform:translate(${Number(st.tx) || 0}px,${Number(st.ty) || 0}px)!important;position:relative;z-index:2`);
  if (st.hidden) r.push("display:none!important");
  return r.join(";");
}
function buildCss(cfg) {
  const out = [];
  Object.entries(cfg.styles || {}).forEach(([route, map]) => {
    Object.entries(map || {}).forEach(([sel, st]) => {
      const body = rulesFor(st || {});
      if (!body) return;
      const scope = route === "*" ? "" : `html[data-pnk-route="${route.replace(/"/g, "")}"] `;
      out.push(`${scope}${sel}{${body}}`);
    });
  });
  const t = cfg.theme || {};
  if (t.primary) out.push(`.bg-navy{background-color:${t.primary}!important}.text-navy{color:${t.primary}!important}.border-navy{border-color:${t.primary}!important}#pnk-side{background:${t.primary}!important}`);
  if (t.side) out.push(`#pnk-side{background:${t.side}!important}`);
  if (t.bg) out.push(`html,body{background:${t.bg}!important}`);
  if (t.font) out.push(`html,body,button,input,select,textarea{font-family:${t.font}!important}`);
  if (t.scale && Number(t.scale) !== 100) out.push(`#pnk-main{zoom:${Number(t.scale) / 100}}`);
  if (t.css) out.push(String(t.css));
  return out.join("\n");
}

// ───────────── 적용: 글자 바꾸기 ─────────────
const orig = new WeakMap(); // 글자 노드 → 원래 글
const set = new WeakMap(); // 글자 노드 → 우리가 넣은 글
function dict(cfg) {
  const r = routeKey();
  return { ...(cfg.texts?.["*"] || {}), ...(cfg.texts?.[r] || {}) };
}
const byDict = new WeakSet(); // 같은 글자 바꾸기(사전)로 바뀐 글자 노드 — 사전에서 빠지면 원래 글로 되돌린다
function fixNode(n, d) {
  if (n.parentElement?.closest("[data-pnk-edit-ui]")) return;
  const now = n.data;
  if (set.get(n) !== now) { orig.set(n, now); byDict.delete(n); } // React가 새 글로 바꿨으면 그게 새 원래 글
  const o = orig.get(n) ?? now;
  const key = o.trim();
  if (key && d[key] !== undefined) {
    const rep = o.replace(key, d[key]);
    byDict.add(n); set.set(n, rep);
    if (rep !== now) n.data = rep;
  } else if (byDict.has(n)) { // 사전에서 지워졌다 → 원래 글
    byDict.delete(n); set.set(n, o);
    if (now !== o) n.data = o;
  } else set.set(n, now); // 요소 글자(etexts)가 바꾼 글은 건드리지 않는다
}
function fixAttrs(el, d) {
  ["placeholder", "title"].forEach((a) => {
    if (!el.hasAttribute?.(a)) return;
    const ok = `data-pnk-o-${a}`;
    if (!el.hasAttribute(ok)) el.setAttribute(ok, el.getAttribute(a));
    const o = el.getAttribute(ok);
    const v = d[o.trim()] !== undefined ? d[o.trim()] : o;
    if (el.getAttribute(a) !== v) el.setAttribute(a, v);
  });
}
function walk(rootEl, d) {
  const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) fixNode(n, d);
  rootEl.querySelectorAll?.("[placeholder],[title]").forEach((el) => fixAttrs(el, d));
}
// 요소 글자 — 고른 요소 안 n번째 글자가 원래글과 같을 때만
export function textNodesOf(el) {
  const out = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) if ((orig.get(n) ?? n.data).trim()) out.push(n);
  return out;
}
const byEl = new Set(); // 요소 글자로 바뀐 노드(지워지면 되돌림)
function applyElementTexts(cfg) {
  const map = cfg.etexts?.[routeKey()] || {};
  const touched = new Set();
  Object.entries(map).forEach(([sel, items]) => {
    let el = null; try { el = document.querySelector(sel); } catch { return; }
    if (!el) return;
    const nodes = textNodesOf(el);
    Object.entries(items || {}).forEach(([i, it]) => {
      const n = nodes[Number(i)]; if (!n || !it) return;
      if (set.get(n) !== n.data) orig.set(n, n.data);
      const o = orig.get(n) ?? n.data; const key = o.trim();
      if (key !== it.o) return;
      const rep = o.replace(key, it.t);
      if (n.data !== rep) { n.data = rep; } set.set(n, rep);
      touched.add(n); byEl.add(n);
    });
  });
  byEl.forEach((n) => { if (touched.has(n)) return; byEl.delete(n); if (!n.isConnected) return; const o = orig.get(n); if (o != null && n.data !== o && set.get(n) === n.data) { set.set(n, o); n.data = o; } });
}
let styleEl = null;
let mo = null;
let busy = false;
export function applyAll() {
  const cfg = current();
  if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "pnk-ui-style"; document.head.appendChild(styleEl); }
  styleEl.textContent = buildCss(cfg);
  const d = dict(cfg);
  busy = true; walk(document.body, d); applyElementTexts(cfg); busy = false;
  if (!mo) {
    mo = new MutationObserver((list) => {
      if (busy) return;
      busy = true;
      const dd = dict(current());
      list.forEach((m) => {
        if (m.type === "characterData") fixNode(m.target, dd);
        else m.addedNodes.forEach((x) => { if (x.nodeType === 3) fixNode(x, dd); else if (x.nodeType === 1) walk(x, dd); });
      });
      applyElementTexts(current());
      busy = false;
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  }
}
// 화면 이동 때 다시 적용(경로별 글자)
export function setRoute(path) { document.documentElement.dataset.pnkRoute = path; applyAll(); }
export const originalText = (n) => orig.get(n) ?? n.data;

// 메뉴 · 브랜드 — App 이 읽는다
export function menuOf(cfg, MENU) {
  const items = cfg.menu?.items || {}; const groups = cfg.menu?.groups || {};
  return MENU.map((g) => ({
    ...g, label: g.label && groups[g.label] !== undefined ? groups[g.label] : g.label, origLabel: g.label,
    items: g.items.map((it, i) => ({ ...it, origLabel: it.label, label: items[it.to]?.label || it.label, hidden: !!items[it.to]?.hidden, order: items[it.to]?.order ?? i }))
      .sort((a, b) => a.order - b.order),
  }));
}
