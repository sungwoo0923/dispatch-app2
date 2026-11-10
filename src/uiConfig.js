// ======================= src/uiConfig.js =======================
// ⭐ 2026-11-07 화면 편집 모드 — 엔진(코드 배포 없이 최고관리자가 화면을 고친다)
//  문구 사전(textOverrides.js)은 그대로 두고, 그 위에 "화면 설정" 한 묶음을 더한다.
//
//  무엇을 고치나(모두 화이트리스트 값만 · CSS·HTML 직접 입력 없음)
//   els     요소 규칙 { id: { tg, sc, h, s, img, fit, at, by } }  숨기기 · 모양(배경·테두리·여백·너비·투명도·아이콘·정렬·글자) · 이미지 바꾸기
//   blocks  안내 상자 { id: { tg, pos, tx, tone, sc, at, by } }     선택한 요소 앞·뒤·안쪽에 붙는 짧은 안내(굵게·강조·링크만)
//   menus   메뉴 { "pc:배차관리": { l, h, o, ro } }                  이름 · 순서 · 숨기기(권한은 그대로 — 숨기기만 되고 열어주지는 못함)
//   opts    선택 목록 { 지급방식: { add, hide, ord, lb } }           기본 목록에 더하기·숨기기·순서 · 보이는 이름(lb)만 바꾸기(저장값은 그대로)
//   fields  입력칸 { "orderForm.label.메모": { l, ph, hp, df, h } }  이름 · 안내문구 · 도움말 · 기본값 · 숨기기(필수 칸은 못 숨김)
//   theme   테마 { pr, ac, ff, fz, rd, d }                           주색 · 강조색 · 글씨체 · 글자 크기 · 모서리
//
//  저장 위치(Firestore)
//   uiConfig/main          지금 화면 설정(누구나 읽기 — 로그인 전 화면 로고 등) · 쓰기 최고관리자만(firestore.rules에서 모양도 검사)
//   uiConfigHistory/{id}   저장할 때마다 사본(최근 20개) — 최고관리자만
//  적용
//   · 고칠 것이 하나도 없으면 아무것도 켜지 않는다(감시·스타일 없음)
//   · CSS로 되는 것(정확한 위치가 있는 숨기기·모양·테마)은 <style> 하나로 — React 화면을 건드리지 않는다
//   · 글자로 찾는 요소 · 이미지 · 안내 상자 · 입력칸이 있을 때만 MutationObserver를 켜고, 바뀐 뒤 한 프레임에 모아 처리
//   · localStorage에 마지막 값(버전 포함)을 넣어 다음 접속은 바로 적용 · 최고관리자는 실시간(onSnapshot), 나머지는 한 번만 받는다
//   · ?noui=1 이면 모두 끈다(uiBypass.js)
import React from "react";
import { db, auth } from "./firebase";
import { doc, getDoc, onSnapshot, setDoc, addDoc, collection, query, orderBy, limit, getDocs, deleteDoc, serverTimestamp } from "firebase/firestore";
import { isPreviewMode } from "./fsTenant";
import { FONTS, WEIGHTS, SIZE_MIN, SIZE_MAX, deviceKind, originalTextOf, originalAttrOf, isEligibleText } from "./textOverrides";
import { uiBypassed } from "./uiBypass";

export const CFG_VERSION = 1;
const CACHE_KEY = "kpUiConfig:v1";
const DEMO_KEY = "kpUiConfigDemo:v1";
const DEMO_HIST_KEY = "kpUiConfigDemoHist:v1";
export const HISTORY_KEEP = 20;
const STORAGE_BUCKET = "dispatch-app-9b92f.firebasestorage.app";

// ───────────────────────── 역할 · 기기 · 화면 ─────────────────────────
export const ROLE_GROUPS = [["admin", "관리자"], ["staff", "직원"], ["acct", "경리"], ["hr", "인사"], ["sales", "영업"], ["exec", "임원"], ["driver", "기사"], ["shipper", "화주"]];
const ROLE_KEYS = new Set(ROLE_GROUPS.map(([k]) => k));
const ctx = { role: null, email: "", dept: null, screen: "" };
let previewAs = null; // { role: "acct" | null, dev: "pc" | "m" | null } — 미리보기 모드(보이기 규칙만 그 사람처럼)

export function roleGroupsOf(role, dept) {
  const out = new Set();
  const r = String(role || "");
  if (r === "admin") out.add("admin");
  else if (r === "test" || r === "acctStaff") out.add("acct");
  else if (r === "hrManager" || r === "hrStaff") out.add("hr");
  else if (r === "hrAcct") { out.add("hr"); out.add("acct"); }
  else if (r === "salesMgr" || r === "salesStaff") out.add("sales"); // 💼 2026-11-10 영업팀
  else if (r === "exec") out.add("exec");
  else if (r === "driver") out.add("driver");
  else if (r === "shipper") out.add("shipper");
  else if (r && r !== "totalMaster") out.add("staff");
  if (dept === "acct") out.add("acct");
  if (dept === "hr") out.add("hr");
  if (dept === "sales") out.add("sales");
  if (dept === "exec") out.add("exec");
  return out;
}
const curGroups = () => (previewAs?.role ? new Set([previewAs.role]) : roleGroupsOf(ctx.role, ctx.dept));
const curDev = () => previewAs?.dev || deviceKind();
const normPath = (p) => (String(p || "/").replace(/\/+$/, "") || "/");
export const currentScreenKey = () => `${normPath(window.location.pathname)}${ctx.screen ? "#" + ctx.screen : ""}`.slice(0, 120);
export function screenLabel(k) { const [p, s] = String(k || "").split("#"); return s ? `${s} 화면` : `${p} 화면`; }

// App.jsx(TextOverrideLayer)에서 — 지금 보는 사람
export function setUiViewer({ role, email }) {
  const changed = ctx.role !== (role || null) || ctx.email !== (email || "");
  ctx.role = role || null; ctx.email = email || "";
  if (changed) { schedule(true); maybeLive(); }
}
// DispatchApp · MobileApp에서 — 지금 메뉴(화면)와 부서 모드. 화면이 바뀌면 "이 화면만" 규칙이 달라진다
export function useUiScreen(screen, dept) {
  useUiConfigVersion();
  React.useEffect(() => {
    const s = String(screen || "").slice(0, 60); const d = dept || null;
    if (ctx.screen === s && ctx.dept === d) return;
    ctx.screen = s; ctx.dept = d; schedule(true);
  }, [screen, dept]);
}
export function setPreviewAs(p) { previewAs = p && (p.role || p.dev) ? { role: ROLE_KEYS.has(p.role) ? p.role : null, dev: p.dev === "m" || p.dev === "pc" ? p.dev : null } : null; schedule(true); emit(); }
export const getPreviewAs = () => previewAs;

// ───────────────────────── 검사(화이트리스트) ─────────────────────────
const HEX = /^#[0-9A-Fa-f]{6}$/;
const hex = (v) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : undefined);
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max) : "");
const oneOf = (v, list) => (list.includes(v) ? v : undefined);
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const ID_RE = /^[a-z0-9]{4,20}$/;
const TAG_RE = /^[a-z][a-z0-9-]{0,15}$/;
const ATTR_RE = /^(id|data-[a-z][a-z0-9-]{0,30}|aria-label|title|name|role|type|placeholder|alt|href|for)$/;
const CLS_RE = /^kp-[A-Za-z0-9_-]{1,40}$/;
const BAD_ATTRS = new Set(["data-kp-u", "data-kp-tx-ui", "data-kp-txs", "data-kp-ublk", "data-ro-allow", "data-on", "data-value"]);

export function cleanTarget(t) {
  if (!t || typeof t !== "object" || !Array.isArray(t.p) || !t.p.length || t.p.length > 8) return null;
  const p = [];
  for (const s of t.p) {
    if (!s || typeof s !== "object" || !TAG_RE.test(s.g || "")) return null;
    const seg = { g: s.g };
    if (s.a && typeof s.a === "object") {
      const a = {};
      for (const [k, v] of Object.entries(s.a).slice(0, 3)) { if (ATTR_RE.test(k) && !BAD_ATTRS.has(k) && typeof v === "string" && v && v.length <= 120 && !/[\u0000-\u001F]/.test(v)) a[k] = v; }
      if (Object.keys(a).length) seg.a = a;
    }
    if (Array.isArray(s.c)) { const c = s.c.filter((x) => typeof x === "string" && CLS_RE.test(x)).slice(0, 3); if (c.length) seg.c = c; }
    const n = num(s.n); if (Number.isInteger(n) && n >= 1 && n <= 60) seg.n = n;
    if (s.k === true) seg.k = true;
    p.push(seg);
  }
  const out = { p };
  const tx = str(t.t, 80).replace(/\s+/g, " ").trim(); if (tx) out.t = tx;
  const up = num(t.up); if (Number.isInteger(up) && up >= 1 && up <= 6) out.up = up;
  const i = num(t.i); if (Number.isInteger(i) && i >= 0 && i <= 50) out.i = i;
  const fr = num(t.fr); if (fr === 1 || fr === 2) out.fr = fr;
  const lb = str(t.lb, 60).trim(); if (lb) out.lb = lb;
  return out;
}
export function cleanScope(sc) {
  const o = { d: "all" };
  if (!sc || typeof sc !== "object") return o;
  o.d = oneOf(sc.d, ["all", "pc", "m"]) || "all";
  const s = str(sc.s, 120); if (s && /^\/[^"\\<>]*$/.test(s)) o.s = s;
  if (Array.isArray(sc.ro)) { const ro = [...new Set(sc.ro.filter((r) => ROLE_KEYS.has(r)))]; if (ro.length) o.ro = ro; }
  return o;
}
// 요소 모양 — 미리 정한 값만
export const EL_PRESETS = {
  bw: [0, 1, 2, 3],
  br: [0, 4, 8, 12, 16, 24, 999],
  p: [0, 4, 8, 12, 16, 24, 32],
  m: [0, 4, 8, 12, 16, 24, 32],
  w: ["auto", "fit", "25%", "33%", "50%", "66%", "75%", "100%"],
  op: [0.2, 0.4, 0.6, 0.8, 1],
  is: [12, 14, 16, 18, 20, 24, 28, 32, 40, 48],
  ta: ["left", "center", "right"],
  sh: ["none", "sm", "md", "lg"],
};
export function cleanElStyle(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = {};
  for (const k of ["bg", "bc", "c"]) { const v = hex(x[k]); if (v) o[k] = v; }
  for (const k of ["bw", "br", "p", "m", "op", "is"]) { const v = num(x[k]); if (EL_PRESETS[k].includes(v)) o[k] = v; }
  for (const k of ["w", "ta", "sh"]) { if (EL_PRESETS[k].includes(x[k])) o[k] = x[k]; }
  if (typeof x.ff === "string" && Object.prototype.hasOwnProperty.call(FONTS, x.ff)) o.ff = x.ff;
  const fw = num(x.fw); if (WEIGHTS.includes(fw)) o.fw = fw;
  const fs = num(x.fs); if (Number.isInteger(fs) && fs >= SIZE_MIN && fs <= SIZE_MAX) o.fs = fs;
  if (x.i === true) o.i = true;
  return Object.keys(o).length ? o : null;
}
// 이미지 주소 — 우리 Storage(uiAssets/) · 앱 안의 파일(/로 시작) · (개발 둘러보기만) data:image
export function cleanImageUrl(u) {
  if (typeof u !== "string" || u.length > 600) return "";
  const fb = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/uiAssets%2F`;
  if (u.startsWith(fb) && /^[A-Za-z0-9%._\-~/?=&:]+$/.test(u)) return u;
  if (/^\/(?!\/)[A-Za-z0-9._\-/]{1,200}\.(png|jpe?g|webp|gif|svg)$/i.test(u)) return u;
  return "";
}
const cleanDemoImage = (u) => (isDemo() && typeof u === "string" && u.length < 600000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : "");
export function cleanLink(h) {
  const v = str(h, 300).trim();
  if (/^https:\/\/[^\s"'<>\\]+$/.test(v)) return v;
  if (/^\/(?!\/)[^\s"'<>\\]*$/.test(v)) return v;
  return "";
}
const stamp = (x) => { const o = {}; const at = num(x?.at); if (Number.isFinite(at) && at > 0) o.at = Math.round(at); const by = str(x?.by, 80); if (by) o.by = by; return o; };

function cleanEl(x) {
  const tg = cleanTarget(x?.tg); if (!tg) return null;
  const o = { tg, sc: cleanScope(x.sc), ...stamp(x) };
  if (x.h === true) o.h = true;
  const s = cleanElStyle(x.s); if (s) o.s = s;
  const img = cleanImageUrl(x.img) || cleanDemoImage(x.img); if (img) { o.img = img; o.fit = oneOf(x.fit, ["contain", "cover"]) || "contain"; }
  return o.h || o.s || o.img ? o : null;
}
export const TONES = { info: ["#EEF3FC", "#C9D5EA", "#1B2B4B", "#2D4C82"], warn: ["#FFF7E6", "#F5D08A", "#7A4A00", "#B54708"], ok: ["#ECFDF3", "#A6E9C4", "#05603A", "#067647"], plain: ["#FFFFFF", "#DCE3EE", "#0F1A30", "#2D4C82"] };
function cleanBlock(x) {
  const tg = cleanTarget(x?.tg); if (!tg) return null;
  const tx = str(x.tx, 800).trim(); if (!tx) return null;
  return { tg, tx, pos: oneOf(x.pos, ["before", "after", "start", "end"]) || "after", tone: oneOf(x.tone, Object.keys(TONES)) || "info", sc: cleanScope(x.sc), ...stamp(x) };
}
const MENU_KEY_RE = /^(pc|m):[^"\\<>\u0000-\u001F]{1,40}$/;
function cleanMenu(x) {
  if (!x || typeof x !== "object") return null;
  const o = { ...stamp(x) };
  const l = str(x.l, 30).trim(); if (l) o.l = l;
  if (x.h === true) o.h = true;
  const n = num(x.o); if (Number.isInteger(n) && n >= -999 && n <= 9999) o.o = n;
  if (Array.isArray(x.ro)) { const ro = [...new Set(x.ro.filter((r) => ROLE_KEYS.has(r)))]; if (ro.length) o.ro = ro; }
  return o.l || o.h || o.o !== undefined ? o : null;
}
export const OPTION_KEYS = ["상하차방법", "지급방식", "배차방식", "화물타입", "톤수타입", "차량종류", "은행"];
const optV = (v) => str(v, 30).replace(/\s+/g, " ").trim();
function cleanOpt(x) {
  if (!x || typeof x !== "object") return null;
  const list = (a) => (Array.isArray(a) ? [...new Set(a.map(optV).filter(Boolean))].slice(0, 100) : []);
  const o = { ...stamp(x) };
  const add = list(x.add); if (add.length) o.add = add;
  const hide = list(x.hide); if (hide.length) o.hide = hide;
  const ord = list(x.ord); if (ord.length) o.ord = ord;
  if (x.lb && typeof x.lb === "object") { const lb = {}; for (const [k, v] of Object.entries(x.lb).slice(0, 100)) { const kk = optV(k); const vv = optV(v); if (kk && vv && kk !== vv) lb[kk] = vv; } if (Object.keys(lb).length) o.lb = lb; }
  return o.add || o.hide || o.ord || o.lb ? o : null;
}
// 입력칸 — EditableText id(orderForm.label.상차방법 등)
const FIELD_ID_RE = /^[A-Za-z][A-Za-z0-9_.가-힣·:/ -]{1,80}$/;
// 배차등록 필수 칸(validateRequired) — 숨기면 저장이 막히므로 숨기기 금지
export const REQUIRED_FIELDS = new Set(["orderForm.label.거래처", "orderForm.label.상차지", "orderForm.label.하차지", "orderForm.label.화물내용", "orderForm.label.차량톤수", "orderForm.label.지급방식"]);
// 기본값을 정할 수 있는 칸(배차등록) — 화면 id → 저장 칸 이름
export const DEFAULTABLE = { "orderForm.label.상차방법": "상차방법", "orderForm.label.하차방법": "하차방법", "orderForm.label.지급방식": "지급방식", "orderForm.label.배차방식": "배차방식", "orderForm.label.차량종류": "차량종류", "orderForm.label.메모": "메모", "orderForm.label.전달사항": "전달사항" };
function cleanField(id, x) {
  if (!x || typeof x !== "object") return null;
  const o = { ...stamp(x) };
  const l = str(x.l, 40).trim(); if (l) o.l = l;
  const ph = str(x.ph, 80).trim(); if (ph) o.ph = ph;
  const hp = str(x.hp, 300).trim(); if (hp) o.hp = hp;
  const df = str(x.df, 60).trim(); if (df && DEFAULTABLE[id]) o.df = df;
  if (x.h === true && !REQUIRED_FIELDS.has(id)) o.h = true;
  return o.l || o.ph || o.hp || o.df || o.h ? o : null;
}
export const THEME_PRESETS = { fz: [0.9, 0.95, 1, 1.05, 1.1, 1.15], rd: ["sq", "df", "rd", "xl"] };
function cleanTheme(x) {
  if (!x || typeof x !== "object") return null;
  const o = { ...stamp(x) };
  const pr = hex(x.pr); if (pr) o.pr = pr;
  const ac = hex(x.ac); if (ac) o.ac = ac;
  if (typeof x.ff === "string" && Object.prototype.hasOwnProperty.call(FONTS, x.ff)) o.ff = x.ff;
  const fz = num(x.fz); if (THEME_PRESETS.fz.includes(fz) && fz !== 1) o.fz = fz;
  if (THEME_PRESETS.rd.includes(x.rd) && x.rd !== "df") o.rd = x.rd;
  o.d = oneOf(x.d, ["all", "pc", "m"]) || "all";
  return o.pr || o.ac || o.ff || o.fz || o.rd ? o : null;
}
const LIMITS = { els: 400, blocks: 100, menus: 300, fields: 300 };
export function cleanConfig(c) {
  const out = { v: CFG_VERSION, els: {}, blocks: {}, menus: {}, opts: {}, fields: {}, theme: null };
  if (!c || typeof c !== "object") return out;
  for (const [id, x] of Object.entries(c.els || {}).slice(0, LIMITS.els)) { if (ID_RE.test(id)) { const v = cleanEl(x); if (v) out.els[id] = v; } }
  for (const [id, x] of Object.entries(c.blocks || {}).slice(0, LIMITS.blocks)) { if (ID_RE.test(id)) { const v = cleanBlock(x); if (v) out.blocks[id] = v; } }
  for (const [k, x] of Object.entries(c.menus || {}).slice(0, LIMITS.menus)) { if (MENU_KEY_RE.test(k)) { const v = cleanMenu(x); if (v) out.menus[k] = v; } }
  for (const k of OPTION_KEYS) { const v = cleanOpt(c.opts?.[k]); if (v) out.opts[k] = v; }
  for (const [k, x] of Object.entries(c.fields || {}).slice(0, LIMITS.fields)) { if (FIELD_ID_RE.test(k)) { const v = cleanField(k, x); if (v) out.fields[k] = v; } }
  out.theme = cleanTheme(c.theme);
  const rev = num(c.rev); if (Number.isInteger(rev) && rev >= 0) out.rev = rev;
  return out;
}
export const emptyConfig = () => cleanConfig(null);
export function countConfig(c) {
  if (!c) return 0;
  return Object.keys(c.els || {}).length + Object.keys(c.blocks || {}).length + Object.keys(c.menus || {}).length + Object.keys(c.opts || {}).length + Object.keys(c.fields || {}).length + (c.theme ? 1 : 0);
}

// ───────────────────────── 상태 ─────────────────────────
let pub = emptyConfig(); // 저장된 값
let pubMeta = { rev: 0, by: "", at: 0 };
let draft = null; // 편집 중인 값(저장 전 · 화면에 바로 보임)
let draftBase = 0; // 편집을 시작할 때의 rev(다른 곳에서 저장했는지 확인)
let editing = false; // 편집 모드(숨긴 요소를 흐리게 보여줌)
let version = 0;
const listeners = new Set();
const emit = () => { version++; listeners.forEach((fn) => { try { fn(); } catch { /* 무시 */ } }); };
export function subscribeUi(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const getUiVersion = () => version;
export function useUiConfigVersion() { return React.useSyncExternalStore(subscribeUi, getUiVersion, getUiVersion); }
const eff = () => (uiBypassed() ? null : draft || pub);
export const getPublished = () => pub;
export const getPublishedMeta = () => pubMeta;
export const getDraft = () => draft;
export const getEffective = () => eff() || emptyConfig();
export const hasDraftChanges = () => !!draft && JSON.stringify(stripStamps(draft)) !== JSON.stringify(stripStamps(pub));
const stripStamps = (c) => JSON.parse(JSON.stringify({ ...c, rev: undefined }, (k, v) => (k === "at" || k === "by" ? undefined : v)));

// ── 편집(저장 전) · 되돌리기/다시 하기 ──
const undoStack = []; const redoStack = [];
export function beginDraft() { if (!draft) { draft = JSON.parse(JSON.stringify(pub)); draftBase = pubMeta.rev; undoStack.length = 0; redoStack.length = 0; } return draft; }
// fn(복사본) — 고친 복사본을 검사한 뒤 새 draft로
export function editDraft(fn) {
  const base = beginDraft();
  const next = JSON.parse(JSON.stringify(base));
  fn(next);
  const cleaned = cleanConfig(next);
  if (JSON.stringify(cleaned) === JSON.stringify(base)) return false;
  undoStack.push(base); if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  draft = cleaned; schedule(true); emit();
  return true;
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export function undo() { if (!undoStack.length) return; redoStack.push(draft); draft = undoStack.pop(); schedule(true); emit(); }
export function redo() { if (!redoStack.length) return; undoStack.push(draft); draft = redoStack.pop(); schedule(true); emit(); }
export function discardDraft() { draft = null; undoStack.length = 0; redoStack.length = 0; themePreview = null; schedule(true); emit(); }
export const draftConflict = () => !!draft && pubMeta.rev !== draftBase;
export function setEditing(on) { if (editing === !!on) return; editing = !!on; document.documentElement.classList.toggle("kp-ui-editing", editing); schedule(true); emit(); }
let themePreview = null; // 테마 탭에서 고르는 중(draft에 넣기 전)
export function setThemePreview(t) { themePreview = t ? cleanTheme(t) : null; schedule(true); }

export const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const viewerEmail = () => auth.currentUser?.email || ctx.email || (isDemo() ? "둘러보기" : "");

// ───────────────────────── 선택자(요소 위치) ─────────────────────────
const cssStr = (v) => '"' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
export function compileSelector(p) {
  let out = "";
  p.forEach((s, i) => {
    let one = s.g;
    for (const [k, v] of Object.entries(s.a || {})) one += `[${k}=${cssStr(v)}]`;
    for (const c of s.c || []) one += "." + c;
    if (s.n) one += `:nth-of-type(${s.n})`;
    out += (i === 0 ? "" : s.k ? " > " : " ") + one;
  });
  return out;
}
const selOk = new Map();
function validSelector(sel) {
  if (selOk.has(sel)) return selOk.get(sel);
  let ok = true;
  try { document.createDocumentFragment().querySelector(sel); } catch { ok = false; }
  selOk.set(sel, ok); return ok;
}
// CSS만으로 찾을 수 있는 위치인가(글자·위로 몇 칸·몇 번째 없이)
const pureCss = (tg) => !tg.t && !tg.up && tg.i === undefined;
const UI_SKIP = "[data-kp-tx-ui], [data-kp-ublk]";
// 요소의 원래 글자(문구 바꾸기 전) — 안내 상자·편집 화면은 뺀다
export function origTextOf(el, max = 200) {
  let s = "";
  const w = document.createTreeWalker(el, 1 | 4, { acceptNode: (n) => (n.nodeType === 1 ? (n.matches(UI_SKIP + ", script, style, svg") ? 2 : 3) : 1) });
  let n;
  while ((n = w.nextNode())) { s += originalTextOf(n); if (s.length > max * 2) break; }
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}
export function resolveTarget(tg, root = document) {
  const sel = compileSelector(tg.p);
  if (!validSelector(sel)) return [];
  let els;
  try { els = [...root.querySelectorAll(sel)]; } catch { return []; }
  els = els.filter((e) => !e.closest(UI_SKIP));
  if (tg.t) els = els.filter((e) => origTextOf(e, 100) === tg.t);
  if (tg.up) {
    const s = new Set();
    for (const e of els) { let a = e; for (let k = 0; k < tg.up && a; k++) a = a.parentElement; if (a && a !== document.body && a !== document.documentElement) s.add(a); }
    els = [...s];
  }
  if (tg.i !== undefined) els = els[tg.i] ? [els[tg.i]] : [];
  return els;
}

// 고른 요소 → 오래 가는 위치 설명 { tg, fragile(0 안정 · 1 보통 · 2 깨지기 쉬움), count, why }
const STABLE_DATA = ["data-kp", "data-testid", "data-tour", "data-et", "data-opt-picker", "data-vt-picker", "data-field", "data-driver-field", "data-kp-menu", "data-tab", "data-menu", "data-id", "data-key", "data-name", "data-section"];
const looksRandom = (v) => /\d{5,}|^[:]|[0-9a-f]{8,}|^r[0-9a-z]{1,3}$/i.test(v);
function ownAnchor(el) {
  const g = el.tagName.toLowerCase();
  if (!TAG_RE.test(g)) return null;
  if (el.id && /^[A-Za-z][\w-]{1,40}$/.test(el.id) && !looksRandom(el.id)) return { g, a: { id: el.id } };
  for (const k of STABLE_DATA) { const v = el.getAttribute(k); if (v && v.length <= 60 && !looksRandom(v)) return { g, a: { [k]: v } }; }
  for (const at of el.attributes) {
    if (!at.name.startsWith("data-") || BAD_ATTRS.has(at.name) || !ATTR_RE.test(at.name) || at.name.startsWith("data-kp-tx")) continue;
    const v = at.value; if (v && v.length <= 40 && !looksRandom(v) && !/^[01]$/.test(v)) return { g, a: { [at.name]: v } };
  }
  for (const k of ["aria-label", "name", "alt", "placeholder", "title"]) {
    const v = (k === "placeholder" || k === "title" ? originalAttrOf(el, k) : el.getAttribute(k)) || "";
    if (v && v.length <= 60 && !looksRandom(v)) return { g, a: { [k]: v } };
  }
  if (g === "a") { const h = el.getAttribute("href") || ""; if (/^\/[\w\-/]{1,60}$/.test(h)) return { g, a: { href: h } }; }
  return null;
}
const kpClasses = (el) => [...el.classList].filter((c) => CLS_RE.test(c) && !c.startsWith("kp-tx")).slice(0, 2);
function nearestAnchor(el, maxUp = 8) {
  let a = el.parentElement;
  for (let i = 0; a && i < maxUp && a !== document.body; i++, a = a.parentElement) { const s = ownAnchor(a); if (s) return { seg: s, el: a }; const c = kpClasses(a); if (c.length) return { seg: { g: a.tagName.toLowerCase(), c }, el: a }; }
  return null;
}
// 숫자가 많은 글자(건수·금액·날짜)는 데이터라 바뀌므로 위치 표시로 쓰지 않는다
const shortText = (el) => { const t = origTextOf(el, 100); return t && t.length <= 40 && isEligibleText(t) && !/\d.*\d/.test(t) ? t : ""; };
function finish(tg, el, fragile, why) {
  let found = resolveTarget(tg);
  if (!found.includes(el)) return null;
  if (found.length > 1) { const idx = found.indexOf(el); tg = { ...tg, i: idx }; fragile = Math.max(fragile, 1); why = `${why} · 같은 모양 ${found.length}곳 중 ${idx + 1}번째`; found = [el]; }
  return { tg: { ...tg, fr: fragile || undefined }, fragile, why };
}
export function describeElement(el) {
  if (!el || el.nodeType !== 1) return null;
  const g = el.tagName.toLowerCase();
  if (!TAG_RE.test(g)) return null;
  const anc = nearestAnchor(el);
  // ① 자기 이름표(data-* · aria-label · id 등)
  const own = ownAnchor(el);
  if (own) {
    const r = finish({ p: [own] }, el, 0, "고유 이름표로 찾아요") || (anc && finish({ p: [anc.seg, own] }, el, 0, "고유 이름표로 찾아요"));
    if (r) return r;
  }
  // ② 글자로(버튼·제목 등)
  const t = shortText(el);
  if (t) {
    const seg = { g, ...(kpClasses(el).length ? { c: kpClasses(el) } : {}) };
    const r = (anc && finish({ p: [anc.seg, seg], t }, el, 0, `"${t}" 글자로 찾아요`)) || finish({ p: [seg], t }, el, 0, `"${t}" 글자로 찾아요`);
    if (r) return r;
  }
  // ③ 안쪽의 이름표·제목 글자에서 위로 몇 칸(카드·칸 묶음)
  const q = [[el, 0]]; let seen = 0;
  while (q.length && seen < 80) {
    const [n, d] = q.shift(); seen++;
    if (d > 0) {
      const o = ownAnchor(n); const tt = !o && /^(h1|h2|h3|h4|h5|label|strong|b|span|div|p|button)$/.test(n.tagName.toLowerCase()) && n.children.length === 0 ? shortText(n) : "";
      if (o || tt) {
        const tg = o ? { p: [o], up: d } : { p: [{ g: n.tagName.toLowerCase() }], t: tt, up: d };
        const r = finish(tg, el, 1, `안쪽 ${o ? "이름표" : `"${tt}" 글자`}에서 ${d}칸 위`);
        if (r) return r;
      }
    }
    if (d < 4) for (const c of n.children) if (!c.matches(UI_SKIP)) q.push([c, d + 1]);
  }
  // ④ 순서로(코드가 바뀌면 깨질 수 있다)
  const path = []; let cur = el;
  while (cur && cur !== document.body && path.length < 7) {
    const tag = cur.tagName.toLowerCase();
    if (!TAG_RE.test(tag)) break;
    const a = ownAnchor(cur) || (kpClasses(cur).length ? { g: tag, c: kpClasses(cur) } : null);
    if (a && cur !== el) { path.unshift(a); break; }
    const sib = cur.parentElement ? [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName) : [];
    path.unshift({ g: tag, ...(sib.length > 1 ? { n: sib.indexOf(cur) + 1 } : {}), k: true });
    cur = cur.parentElement;
  }
  if (path[0]) delete path[0].k;
  return finish({ p: path }, el, 2, "화면 순서로 찾아요(코드가 바뀌면 깨질 수 있어요)") || null;
}
export function elementLabel(el) {
  if (!el || el.nodeType !== 1) return "";
  const tag = el.tagName.toLowerCase();
  const kind = { button: "버튼", a: "링크", img: "이미지", svg: "아이콘", input: "입력칸", textarea: "입력칸", select: "선택칸", label: "이름", h1: "제목", h2: "제목", h3: "제목", h4: "제목", table: "표", th: "표 머리", tr: "표 줄", nav: "메뉴", header: "머리", section: "구역", aside: "옆 메뉴", li: "목록 줄", ul: "목록", main: "본문" }[tag] || "상자";
  const t = origTextOf(el, 24);
  return t ? `${kind} · ${t.length > 16 ? t.slice(0, 16) + "…" : t}` : kind;
}

// ───────────────────────── 적용 ─────────────────────────
function scopeMatch(sc) {
  if (!sc) return true;
  const d = curDev();
  if (sc.d === "pc" && d !== "pc") return false;
  if (sc.d === "m" && d !== "m") return false;
  if (sc.s && sc.s !== currentScreenKey()) return false;
  if (sc.ro && sc.ro.length) { const g = curGroups(); if (!sc.ro.some((r) => g.has(r))) return false; }
  return true;
}
const SH = { none: "none", sm: "0 1px 3px rgba(15,26,48,0.12)", md: "0 6px 18px rgba(15,26,48,0.14)", lg: "0 16px 40px rgba(15,26,48,0.2)" };
function elDecls(s) {
  const d = [];
  const imp = (k, v) => d.push(`${k}:${v} !important`);
  if (s.bg) { imp("background-color", s.bg); imp("background-image", "none"); }
  if (s.bc) imp("border-color", s.bc);
  if (s.bw !== undefined) { imp("border-width", s.bw + "px"); imp("border-style", s.bw ? "solid" : "none"); }
  if (s.br !== undefined) imp("border-radius", s.br + "px");
  if (s.p !== undefined) imp("padding", s.p + "px");
  if (s.m !== undefined) imp("margin", s.m + "px");
  if (s.w) { if (s.w === "fit") imp("width", "fit-content"); else imp("width", s.w); if (s.w !== "auto") imp("max-width", "100%"); }
  if (s.op !== undefined) imp("opacity", String(s.op));
  if (s.ta) { imp("text-align", s.ta); imp("justify-content", { left: "flex-start", center: "center", right: "flex-end" }[s.ta]); }
  if (s.sh) imp("box-shadow", SH[s.sh]);
  if (s.c) imp("color", s.c);
  if (s.ff) imp("font-family", FONTS[s.ff].css);
  if (s.fw) imp("font-weight", String(s.fw));
  if (s.fs) imp("font-size", s.fs + "px");
  if (s.i) imp("font-style", "italic");
  return d.join(";");
}
const shade = (h, f) => { const n = parseInt(h.slice(1), 16); const ch = (x) => Math.max(0, Math.min(255, Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f))); return "#" + [n >> 16, (n >> 8) & 255, n & 255].map(ch).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase(); };
const esc = (c) => c.replace(/[[\]#/:.%]/g, "\\$&");
function themeCss(t) {
  if (!t) return "";
  const d = curDev();
  if (t.d === "pc" && d !== "pc") return "";
  if (t.d === "m" && d !== "m") return "";
  const out = [];
  if (t.pr) {
    const p = t.pr; const dk = shade(p, -0.25); const dk2 = shade(p, -0.45);
    out.push(`:root{--kp-ui-primary:${p}} .kp-pc{--kp-navy:${p};--kp-ink:${dk2};--kp-bar:linear-gradient(120deg,${dk2} 0%,${p} 50%,${shade(p, 0.2)} 100%)}`);
    for (const c of ["#1B2B4B", "#1b2b4b"]) out.push(`.${esc(`bg-[${c}]`)}{background-color:${p} !important} .${esc(`text-[${c}]`)}{color:${p} !important} .${esc(`border-[${c}]`)}{border-color:${p} !important}`);
    for (const c of ["#243a60", "#243A60", "#243d6a"]) out.push(`.${esc(`hover:bg-[${c}]`)}:hover{background-color:${dk} !important} .${esc(`bg-[${c}]`)}{background-color:${dk} !important}`);
    for (const c of ["#0F1A30", "#0B1428", "#14213D", "#16264A"]) out.push(`.${esc(`bg-[${c}]`)}{background-color:${dk2} !important} .${esc(`text-[${c}]`)}{color:${dk2} !important}`);
    out.push(`.kp-topnav{background:linear-gradient(120deg,${dk2},${p} 60%,${shade(p, 0.15)}) !important} .kp-side-aside{background:linear-gradient(180deg,${dk2} 0%,${p} 55%,${dk2} 100%) !important}`);
  }
  if (t.ac) {
    const a = t.ac;
    out.push(`:root{--kp-ui-accent:${a}} .kp-pc{--kp-accent:${a}}`);
    for (const c of ["#2D4C82", "#4B6CB7", "#2563EB"]) out.push(`.${esc(`bg-[${c}]`)}{background-color:${a} !important} .${esc(`text-[${c}]`)}{color:${a} !important} .${esc(`border-[${c}]`)}{border-color:${a} !important} .${esc(`focus:border-[${c}]`)}:focus{border-color:${a} !important}`);
  }
  if (t.ff) out.push(`html,body,button,input,select,textarea{font-family:${FONTS[t.ff].css} !important}`);
  if (t.fz) out.push(`html{font-size:${Math.round(16 * t.fz * 10) / 10}px}`);
  if (t.rd) {
    const R = { sq: [2, 3, 4, 6], rd: [10, 14, 18, 24], xl: [14, 18, 24, 32] }[t.rd];
    out.push(`.rounded{border-radius:${R[0]}px !important} .rounded-lg{border-radius:${R[1]}px !important} .rounded-xl{border-radius:${R[2]}px !important} .rounded-2xl{border-radius:${R[3]}px !important}`);
  }
  return out.join("\n");
}

let styleEl = null; let lastCss = "";
const jsRules = { els: [], blocks: [], fields: [] }; // 이번에 손으로 찾아 붙일 것
let observer = null; let rafId = 0; let pending = false; let lastRun = 0;
const marked = new Map(); // element → Set(rule id)
const placed = new Map(); // block id → [{ host, node }]
const fieldDone = new Map(); // input → 원래 placeholder
const imgDone = new Map(); // img → { src, srcset }
export const uiStats = { runs: 0, ms: 0 };

function setCss(css) {
  if (css === lastCss) return;
  lastCss = css;
  if (!css) { if (styleEl) styleEl.textContent = ""; return; }
  if (!styleEl) { styleEl = document.createElement("style"); styleEl.setAttribute("data-kp-ui-style", ""); document.head.appendChild(styleEl); }
  styleEl.textContent = css;
}
const hideDecl = () => (editing ? "opacity:.35 !important;outline:2px dashed #B42318 !important;outline-offset:2px" : "display:none !important");

// 설정 → <style> + 손으로 할 일 목록
function rebuild() {
  const c = eff();
  jsRules.els = []; jsRules.blocks = []; jsRules.fields = [];
  if (!c) { setCss(""); stopObserver(); cleanupJs(); return; }
  const css = [];
  for (const [id, r] of Object.entries(c.els)) {
    if (!scopeMatch(r.sc)) continue;
    const viaJs = !pureCss(r.tg) || !!r.img;
    const sel = viaJs ? `[data-kp-u~="${id}"]` : compileSelector(r.tg.p);
    if (!viaJs && !validSelector(sel)) continue;
    if (viaJs) jsRules.els.push([id, r]);
    if (r.h) css.push(`${sel}{${hideDecl()}}`);
    if (r.s) {
      const dd = elDecls(r.s); if (dd) css.push(`${sel}{${dd}}`);
      if (r.s.is) css.push(`${sel} svg{width:${r.s.is}px !important;height:${r.s.is}px !important}`);
    }
    if (r.img) css.push(`${sel}:not(img){background-image:url("${r.img}") !important;background-size:${r.fit} !important;background-repeat:no-repeat !important;background-position:center !important} ${sel}:not(img) > *{opacity:0 !important}`);
  }
  for (const [id, b] of Object.entries(c.blocks)) if (scopeMatch(b.sc)) jsRules.blocks.push([id, b]);
  for (const [id, f] of Object.entries(c.fields)) if (f.ph || f.hp || f.h) jsRules.fields.push([id, f]);
  for (const [id, f] of jsRules.fields) if (f.h) css.push(`[data-kp-u~="f-${cssSafeId(id)}"]{${hideDecl()}}`);
  css.push(themeCss(themePreview || c.theme));
  if (jsRules.els.length || jsRules.blocks.length || jsRules.fields.length) css.push(blockCss());
  setCss(css.filter(Boolean).join("\n"));
  if (jsRules.els.length || jsRules.blocks.length || jsRules.fields.length) { startObserver(); runJs(); } else { stopObserver(); cleanupJs(); }
}
const cssSafeId = (id) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function blockCss() {
  return `[data-kp-ublk]{display:block;box-sizing:border-box;margin:8px 0;padding:10px 12px;border-radius:12px;border:1px solid;font-size:13px;line-height:1.55;font-weight:600;white-space:normal;text-align:left}
[data-kp-ublk] a{text-decoration:underline;font-weight:800}
[data-kp-ublk] b{font-weight:900}
[data-kp-ufh]{display:block;margin-top:4px;font-size:11.5px;line-height:1.45;color:#5B6B86;font-weight:600}`;
}

function markEl(el, id, want) {
  let s = marked.get(el);
  if (!s) { s = new Set(); marked.set(el, s); }
  s.add(id); want.add(el);
}
function cleanupJs() {
  for (const [el] of marked) el.removeAttribute("data-kp-u");
  marked.clear();
  for (const [, list] of placed) for (const { node } of list) node.remove();
  placed.clear();
  for (const [inp, ph] of fieldDone) { if (inp.isConnected) { if (ph == null) inp.removeAttribute("placeholder"); else inp.setAttribute("placeholder", ph); } }
  fieldDone.clear();
  for (const [img, o] of imgDone) { if (img.isConnected) { img.setAttribute("src", o.src); if (o.srcset) img.setAttribute("srcset", o.srcset); } }
  imgDone.clear();
}

// 안내 상자 글 — **굵게** · ==강조== · [글자](https://… 또는 /경로) · 줄바꿈. 글자 노드로만 만든다(HTML 해석 없음)
export function renderLite(tx, accent, parent) {
  const lines = String(tx || "").split("\n");
  lines.forEach((line, li) => {
    if (li) parent.appendChild(document.createElement("br"));
    const re = /\*\*([^*]{1,200})\*\*|==([^=]{1,200})==|\[([^\]]{1,100})\]\(([^)\s]{1,300})\)/g;
    let last = 0; let m;
    while ((m = re.exec(line))) {
      if (m.index > last) parent.appendChild(document.createTextNode(line.slice(last, m.index)));
      if (m[1] !== undefined) { const b = document.createElement("b"); b.textContent = m[1]; parent.appendChild(b); }
      else if (m[2] !== undefined) { const sp = document.createElement("span"); sp.textContent = m[2]; sp.style.color = accent; sp.style.fontWeight = "800"; parent.appendChild(sp); }
      else {
        const href = cleanLink(m[4]);
        if (href) { const a = document.createElement("a"); a.textContent = m[3]; a.setAttribute("href", href); a.style.color = accent; if (href.startsWith("https://")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); } parent.appendChild(a); }
        else parent.appendChild(document.createTextNode(m[3]));
      }
      last = re.lastIndex;
    }
    if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
  });
}
function makeBlock(id, b) {
  const [bg, bd, fg, ac] = TONES[b.tone] || TONES.info;
  const n = document.createElement("div");
  n.setAttribute("data-kp-ublk", id);
  n.setAttribute("data-kp-no-text", "");
  n.style.background = bg; n.style.borderColor = bd; n.style.color = fg;
  renderLite(b.tx, ac, n);
  n.__kpSig = b.tx + "|" + b.tone + "|" + b.pos;
  return n;
}
// 안내 상자는 블록 자리에만 — 고른 요소가 글자 줄 안(inline)이거나 가로 줄(flex)·칸(grid) 안이면 그 줄 밖으로 올라간다
function blockHost(el, pos) {
  let h = el;
  for (let i = 0; i < 5 && h && h.parentElement && h.parentElement !== document.body; i++) {
    const cs = getComputedStyle(h);
    const inline = cs.display.startsWith("inline") || cs.display === "contents";
    if (pos === "start" || pos === "end") { if (!inline && !/^(BUTTON|A|LABEL|SPAN|IMG|INPUT|SVG)$/i.test(h.tagName)) break; h = h.parentElement; continue; }
    const pcs = getComputedStyle(h.parentElement);
    const rowFlex = pcs.display.includes("flex") && !pcs.flexDirection.startsWith("column");
    if (!inline && !rowFlex && !pcs.display.includes("grid")) break;
    h = h.parentElement;
  }
  return h;
}
function placeBlock(host, node, pos) {
  if (pos === "before") host.parentNode?.insertBefore(node, host);
  else if (pos === "after") host.parentNode?.insertBefore(node, host.nextSibling);
  else if (pos === "start") host.insertBefore(node, host.firstChild);
  else host.appendChild(node);
}
const inPlace = (host, node, pos) => (pos === "before" ? node.nextSibling === host : pos === "after" ? node.previousSibling === host : node.parentNode === host);
const fieldInput = (wrap) => wrap.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea");
// [data-et=id] 이름표에서 입력칸이 들어 있는 묶음까지 위로
function fieldWrap(etEl) {
  let a = etEl.parentElement;
  for (let i = 0; a && i < 5 && a !== document.body; i++, a = a.parentElement) {
    if (a.querySelector("input:not([type=hidden]), textarea, select, [data-opt-picker], [data-vt-picker]") && a.tagName !== "LABEL") return a;
  }
  return null;
}

function runJs() {
  const t0 = performance.now();
  uiStats.runs++;
  if (observer) observer.disconnect(); // 우리가 붙이는 것은 감시하지 않는다
  const want = new Set();
  const prevMarked = new Map([...marked].map(([e, s]) => [e, [...s].sort().join(" ")]));
  marked.clear();
  // 요소 규칙(글자·위로·순서·이미지)
  for (const [id, r] of jsRules.els) {
    for (const el of resolveTarget(r.tg)) {
      markEl(el, id, want);
      if (r.img && el.tagName === "IMG") {
        if (!imgDone.has(el)) imgDone.set(el, { src: el.getAttribute("src") || "", srcset: el.getAttribute("srcset") || "" });
        if (el.getAttribute("src") !== r.img) el.setAttribute("src", r.img);
        if (el.hasAttribute("srcset")) el.removeAttribute("srcset");
      }
    }
  }
  // 입력칸(이름표 id로)
  const fieldHosts = []; const wantInputs = new Set();
  for (const [id, f] of jsRules.fields) {
    let ets;
    try { ets = document.querySelectorAll(`[data-et=${cssStr(id)}]`); } catch { continue; }
    for (const et of ets) {
      const w = fieldWrap(et); if (!w) continue;
      if (f.h) markEl(w, "f-" + cssSafeId(id), want);
      if (f.ph) { const inp = fieldInput(w); if (inp) { wantInputs.add(inp); if (!fieldDone.has(inp)) fieldDone.set(inp, inp.getAttribute("placeholder")); if (inp.getAttribute("placeholder") !== f.ph) inp.setAttribute("placeholder", f.ph); } }
      if (f.hp) fieldHosts.push(["fh:" + id, w, f.hp]);
    }
  }
  for (const el of want) { const v = [...marked.get(el)].sort().join(" "); if (prevMarked.get(el) !== v) el.setAttribute("data-kp-u", v); }
  for (const [el] of prevMarked) if (!want.has(el)) el.removeAttribute("data-kp-u");
  // 원래대로 — 규칙에서 빠진 입력칸·이미지
  for (const [inp, ph] of fieldDone) { if (!inp.isConnected) fieldDone.delete(inp); else if (!wantInputs.has(inp)) { if (ph == null) inp.removeAttribute("placeholder"); else inp.setAttribute("placeholder", ph); fieldDone.delete(inp); } }
  for (const [img, o] of imgDone) { if (!img.isConnected) imgDone.delete(img); else if (!want.has(img)) { img.setAttribute("src", o.src); if (o.srcset) img.setAttribute("srcset", o.srcset); imgDone.delete(img); } }
  // 안내 상자
  const live = new Set();
  const doPlace = (key, hosts, mk, pos) => {
    live.add(key);
    const prev = placed.get(key) || [];
    const next = [];
    for (const host of hosts) {
      let ent = prev.find((p) => p.host === host);
      if (ent && ent.node.__kpSig !== mk.sig) { ent.node.remove(); ent = null; }
      const node = ent ? ent.node : mk.make();
      if (!inPlace(host, node, pos)) placeBlock(host, node, pos);
      next.push({ host, node });
    }
    for (const p of prev) if (!next.some((n) => n.node === p.node)) p.node.remove();
    placed.set(key, next);
  };
  for (const [id, b] of jsRules.blocks) {
    const hosts = [...new Set(resolveTarget(b.tg).slice(0, 5).map((e) => blockHost(e, b.pos)))];
    doPlace("b:" + id, hosts, { sig: b.tx + "|" + b.tone + "|" + b.pos, make: () => makeBlock(id, b) }, b.pos);
  }
  const byKey = new Map();
  for (const [k, w, hp] of fieldHosts) { if (!byKey.has(k)) byKey.set(k, { hosts: [], hp }); byKey.get(k).hosts.push(w); }
  for (const [k, { hosts, hp }] of byKey) {
    doPlace(k, hosts, { sig: hp + "||end", make: () => { const n = document.createElement("span"); n.setAttribute("data-kp-ublk", k); n.setAttribute("data-kp-ufh", ""); n.setAttribute("data-kp-no-text", ""); n.style.cssText = "border:0;padding:0;margin:4px 0 0;background:none"; renderLite(hp, "#2D4C82", n); n.__kpSig = hp + "||end"; return n; } }, "end");
  }
  for (const [k, list] of placed) if (!live.has(k)) { for (const { node } of list) node.remove(); placed.delete(k); }
  if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  lastRun = performance.now();
  uiStats.ms += lastRun - t0;
}

function ours(n) { return n.nodeType === 1 && (n.hasAttribute("data-kp-ublk") || n.hasAttribute("data-kp-tx-ui") || n.hasAttribute("data-kp-txs")); }
function onMut(records) {
  let relevant = false;
  for (const r of records) {
    if (r.type === "characterData") { if (!r.target.parentElement?.closest("[data-kp-ublk],[data-kp-tx-ui]")) { relevant = true; break; } continue; }
    if (r.target.nodeType === 1 && r.target.closest?.("[data-kp-tx-ui],[data-kp-ublk]")) continue;
    for (const n of r.addedNodes) if (!ours(n)) { relevant = true; break; }
    if (!relevant) for (const n of r.removedNodes) if (!ours(n) || n.hasAttribute?.("data-kp-ublk")) { relevant = true; break; }
    if (relevant) break;
  }
  if (relevant) scheduleJs();
}
function scheduleJs() {
  if (pending) return;
  pending = true;
  const wait = Math.max(0, 80 - (performance.now() - lastRun)); // 많아도 80ms에 한 번
  setTimeout(() => { rafId = requestAnimationFrame(() => { pending = false; runJs(); }); }, wait);
}
function startObserver() {
  if (!document.body) return;
  if (!observer) observer = new MutationObserver(onMut);
  observer.disconnect();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
function stopObserver() { if (observer) observer.disconnect(); if (rafId) cancelAnimationFrame(rafId); pending = false; }

let schedT = 0;
function schedule(now) {
  if (typeof document === "undefined") return;
  if (now) { clearTimeout(schedT); schedT = 0; if (document.body) rebuild(); return; }
  if (!schedT) schedT = setTimeout(() => { schedT = 0; rebuild(); }, 0);
}

// ───────────────────────── 메뉴 · 목록 · 입력칸 (코드에서 부르는 작은 함수) ─────────────────────────
const seenMenus = { pc: new Map(), m: new Map() }; // 편집 화면에 보여줄 메뉴(이 사람에게 보이는 것)
function menuEntry(surface, key) { const c = eff(); return c ? c.menus[`${surface}:${key}`] : undefined; }
function menuHidden(e) { if (!e?.h) return false; if (e.ro && e.ro.length) { const g = curGroups(); return e.ro.some((r) => g.has(r)); } return true; }
// 메뉴 목록 — 숨기기·순서만(권한으로 안 보이는 메뉴는 그대로 안 보인다 · 새 메뉴를 만들지 않는다)
export function uiMenuList(surface, list) {
  if (!Array.isArray(list)) return list;
  const seen = seenMenus[surface] || seenMenus.pc;
  list.forEach((k, i) => { if (!seen.has(k)) seen.set(k, i); });
  const c = eff();
  if (!c || !Object.keys(c.menus).length) return list;
  const rows = list.map((k, i) => ({ k, i, e: c.menus[`${surface}:${k}`] }));
  const vis = editing ? rows : rows.filter((r) => !menuHidden(r.e));
  return vis.sort((a, b) => ((a.e?.o ?? a.i * 10) - (b.e?.o ?? b.i * 10)) || a.i - b.i).map((r) => r.k);
}
export function uiMenuLabel(surface, key, fallback) { const e = menuEntry(surface, key); const l = e?.l || fallback; return editing && menuHidden(e) ? `${l} · 숨김` : l; }
// 모바일 메뉴 줄 하나 — { hidden, label, order }
export function uiMenuItem(surface, key, fallback) {
  const seen = seenMenus[surface];
  if (seen && !seen.has(key)) seen.set(key, seen.size);
  const e = menuEntry(surface, key);
  if (!e) return { hidden: false, label: fallback, order: undefined };
  const dim = editing && menuHidden(e);
  return { hidden: !editing && menuHidden(e), dim, label: dim ? `${e.l || fallback} · 숨김` : e.l || fallback, order: e.o };
}
export const seenMenuKeys = (surface) => [...(seenMenus[surface] || new Map()).entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);

const PROTECTED_OPTS = { 배차방식: ["로지스허브"] };
// 선택 목록 — 기본 목록에 더하기·숨기기·순서(회사가 직접 바꾼 목록은 그 회사 것이 우선)
export function uiOptionList(key, base) {
  const c = eff(); const o = c?.opts?.[key];
  if (!o) return base;
  const hide = new Set(o.hide || []);
  (PROTECTED_OPTS[key] || []).forEach((v) => hide.delete(v));
  let out = [];
  for (const v of [...(base || []), ...(o.add || [])]) if (!hide.has(v) && !out.includes(v)) out.push(v);
  if (o.ord?.length) { const pos = new Map(o.ord.map((v, i) => [v, i])); out = out.map((v, i) => [v, i]).sort((a, b) => ((pos.has(a[0]) ? pos.get(a[0]) : 1000 + a[1]) - (pos.has(b[0]) ? pos.get(b[0]) : 1000 + b[1]))).map(([v]) => v); }
  return out.length ? out : base;
}
// 보이는 이름만(저장되는 값은 그대로)
export function uiOptionLabel(key, v) { const c = eff(); return (c?.opts?.[key]?.lb?.[v]) || v; }
// EditableText 이름표
export function uiLabel(id, fallback) { const c = eff(); return c?.fields?.[id]?.l || fallback; }
// 배차등록 빈 양식에 기본값
export function uiFormDefaults(form, obj) {
  const c = eff();
  if (!c || form !== "dispatch") return obj;
  let out = obj;
  for (const [id, key] of Object.entries(DEFAULTABLE)) { const df = c.fields[id]?.df; if (df && key in obj) { if (out === obj) out = { ...obj }; out[key] = df; } }
  return out;
}

// ───────────────────────── 불러오기 · 저장 ─────────────────────────
export const isDemo = () => import.meta.env.DEV && (isPreviewMode() || window.location.pathname === "/preview");
const isMasterViewer = () => ctx.role === "totalMaster" || ctx.email === "tjddnqkf@naver.com" || (import.meta.env.DEV && window.location.pathname === "/preview" && new URLSearchParams(window.location.search).get("role") === "totalMaster");

function setPub(cfg, meta, { cache = true } = {}) {
  const wasClean = !!draft && !hasDraftChanges();
  pub = cleanConfig(cfg);
  pubMeta = { rev: pub.rev || 0, by: meta?.by || "", at: meta?.at || 0 };
  if (cache) { try { localStorage.setItem(isDemo() ? DEMO_KEY : CACHE_KEY, JSON.stringify({ v: CFG_VERSION, meta: pubMeta, cfg: pub })); } catch { /* 저장공간 부족 */ } }
  if (wasClean) { draft = JSON.parse(JSON.stringify(pub)); draftBase = pubMeta.rev; } // 편집 창을 열어만 둔 상태 — 새 값으로
  schedule(true); emit();
}
function readCache() {
  try {
    const j = JSON.parse(localStorage.getItem(isDemo() ? DEMO_KEY : CACHE_KEY) || "null");
    if (!j || j.v !== CFG_VERSION || !j.cfg) return null;
    return { cfg: cleanConfig(j.cfg), meta: j.meta || {} };
  } catch { return null; }
}
const ref = () => doc(db, "uiConfig", "main");
const toMs = (ts) => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : Number(ts) || 0);
let liveUnsub = null; let fetchedFor = null;
function maybeLive() {
  if (isDemo() || uiBypassed()) return;
  if (isMasterViewer() && auth.currentUser) {
    if (liveUnsub) return;
    try {
      liveUnsub = onSnapshot(ref(), (snap) => { const d = snap.exists() ? snap.data() : null; setPub(d, { by: d?.by || "", at: toMs(d?.updatedAt) }); }, (e) => console.warn("[화면 편집] 실시간 받기 실패", e?.message || e));
    } catch (e) { console.warn("[화면 편집]", e); }
    return;
  }
  if (liveUnsub) { try { liveUnsub(); } catch { /* 무시 */ } liveUnsub = null; }
  const key = auth.currentUser ? auth.currentUser.uid : "public";
  if (fetchedFor === key) return;
  fetchedFor = key;
  getDoc(ref()).then((snap) => { const d = snap.exists() ? snap.data() : null; setPub(d, { by: d?.by || "", at: toMs(d?.updatedAt) }); }).catch((e) => { fetchedFor = null; console.warn("[화면 편집] 불러오기 실패 — 저장해둔 값으로 보여줍니다", e?.message || e); });
}

// 저장(게시) — 검사한 값만 · 저장 전 값을 기록에 남긴다
export async function publishDraft(note = "") {
  if (!draft) return { n: 0 };
  const cfg = cleanConfig(draft);
  const by = viewerEmail();
  const rev = (pubMeta.rev || 0) + 1;
  const body = { ...cfg, rev };
  if (isDemo()) {
    setPub(body, { by, at: Date.now() });
    pushDemoHistory({ cfg: body, by, at: Date.now(), rev, note, n: countConfig(body) });
  } else {
    await setDoc(ref(), { ...stripNull(body), updatedAt: serverTimestamp(), by, byUid: auth.currentUser?.uid || "" });
    try {
      await addDoc(collection(db, "uiConfigHistory"), { cfg: stripNull(body), by, byUid: auth.currentUser?.uid || "", at: serverTimestamp(), atMs: Date.now(), rev, note: str(note, 100), n: countConfig(body) });
      pruneHistory().catch(() => {});
    } catch (e) { console.warn("[화면 편집] 기록 저장 실패", e?.message || e); }
    setPub(body, { by, at: Date.now() });
  }
  draft = null; undoStack.length = 0; redoStack.length = 0; themePreview = null;
  schedule(true); emit();
  return { n: countConfig(body) };
}
const stripNull = (c) => { const o = { ...c }; if (!o.theme) delete o.theme; return o; };
async function pruneHistory() {
  const snap = await getDocs(query(collection(db, "uiConfigHistory"), orderBy("atMs", "desc"), limit(60)));
  const old = snap.docs.slice(HISTORY_KEEP);
  for (const d of old) await deleteDoc(d.ref).catch(() => {});
}
function pushDemoHistory(h) {
  try { const list = JSON.parse(localStorage.getItem(DEMO_HIST_KEY) || "[]"); list.unshift({ id: newId(), ...h }); localStorage.setItem(DEMO_HIST_KEY, JSON.stringify(list.slice(0, HISTORY_KEEP))); } catch { /* 무시 */ }
}
export async function listHistory() {
  if (isDemo()) { try { return JSON.parse(localStorage.getItem(DEMO_HIST_KEY) || "[]"); } catch { return []; } }
  const snap = await getDocs(query(collection(db, "uiConfigHistory"), orderBy("atMs", "desc"), limit(HISTORY_KEEP)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().atMs || toMs(d.data().at) }));
}
// 기록 되살리기 — 편집 중인 값으로 불러온다(저장을 눌러야 모두에게 적용)
export function restoreToDraft(cfg) { editDraft((d) => { const c = cleanConfig(cfg); Object.assign(d, c, { rev: d.rev }); }); }
export function exportConfig() { return JSON.parse(JSON.stringify(draft || pub)); }
export function importToDraft(cfg) { restoreToDraft(cfg); }

// 이미지 올리기 — png·jpg·webp·gif, 3MB까지. 저장 위치 uiAssets/(storage.rules에서 최고관리자만)
export const IMG_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const IMG_MAX = 3 * 1024 * 1024;
export async function uploadImage(file) {
  if (!file) throw new Error("파일을 골라주세요");
  if (!IMG_TYPES.includes(file.type)) throw new Error("PNG · JPG · WEBP · GIF만 올릴 수 있어요");
  if (file.size > IMG_MAX) throw new Error("3MB 이하 이미지만 올릴 수 있어요");
  if (isDemo()) {
    if (file.size > 400 * 1024) throw new Error("둘러보기에서는 400KB 이하만 시험할 수 있어요");
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("읽지 못했어요")); r.readAsDataURL(file); });
  }
  const { storage } = await import("./firebase");
  const { ref: sref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[file.type];
  const r = sref(storage, `uiAssets/${Date.now()}_${newId()}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type, cacheControl: "public,max-age=31536000" });
  const url = await getDownloadURL(r);
  if (!cleanImageUrl(url)) throw new Error("올린 주소를 확인하지 못했어요");
  return url;
}

// ───────────────────────── 시작 ─────────────────────────
let started = false;
export function initUiConfig() {
  if (started || typeof window === "undefined") return;
  started = true;
  const c = readCache();
  if (c) { pub = c.cfg; pubMeta = { rev: c.cfg.rev || 0, ...c.meta }; }
  const go = () => rebuild();
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go, { once: true });
  const onRoute = () => schedule(false);
  for (const m of ["pushState", "replaceState"]) {
    const o = history[m];
    history[m] = function (...args) { const r = o.apply(this, args); try { onRoute(); } catch { /* 무시 */ } return r; };
  }
  window.addEventListener("popstate", onRoute);
  window.addEventListener("resize", () => { clearTimeout(initUiConfig._rz); initUiConfig._rz = setTimeout(onRoute, 300); });
  try { auth.onAuthStateChanged(() => maybeLive()); } catch { /* 무시 */ }
  if (import.meta.env.DEV) window.__kpUi = { get pub() { return pub; }, get draft() { return draft; }, uiStats, resolveTarget, describeElement, compileSelector, rebuild }; // 🧪 개발 점검용
}
initUiConfig();
