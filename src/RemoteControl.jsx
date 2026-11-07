// ======================= src/RemoteControl.jsx =======================
// ⭐ 2026-11-07 원격 지원 · 화면 제어(LogisWeb 탭 안에서만)
//  브라우저는 컴퓨터(OS) 전체를 조작할 수 없다. 대신 직원이 "이 탭"(LogisWeb)을 공유하면
//  관리자가 영상 위에서 누른 마우스·키보드를 작은 메시지로 보내고, 직원 브라우저가 이 페이지 안에서 그대로 실행한다.
//   · 통로: 화면 공유와 같은 WebRTC 연결의 RTCDataChannel "control"(빠름) → 안 되면 Firestore supportSessions/{id}/controlCmds(느림)
//   · 좌표: 관리자 영상의 실제 그림 영역(object-contain 여백 제외) 기준 0~1 비율 → 직원 창(뷰포트) 픽셀
//   · 실행: document.elementFromPoint → pointer/mouse 이벤트 순서 그대로 · 글자는 execCommand("insertText")(안 되면 값 설정 + input/change)
//   · 막는 것: 파일 선택 칸(input[type=file]) · 비밀번호 칸 입력 · 원격 지원 안내/배너([data-kp-rc-guard]) · 다른 프로그램(애초에 불가)
//  이 파일은 Firestore를 모른다 — 연결·권한(직원 허용 여부)은 RemoteSupport.jsx가 정한다.
import React from "react";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const clamp01 = (v) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : 0);
const r4 = (v) => Math.round(v * 10000) / 10000;

// ─────────────────────── 화면 공유(직원) ───────────────────────
//  이 탭 공유를 먼저 권한다(크롬·엣지: "이 탭을 공유할까요?" 한 번만 묻는다). 옵션을 모르는 브라우저는 기본 창으로.
let CAPTURE_HANDLE = "";
export function ensureCaptureHandle() {
  if (CAPTURE_HANDLE) return CAPTURE_HANDLE;
  CAPTURE_HANDLE = `kp-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  try { navigator.mediaDevices?.setCaptureHandleConfig?.({ handle: CAPTURE_HANDLE, exposeOrigin: true, permittedOrigins: ["*"] }); } catch { /* 지원 안 함 */ }
  return CAPTURE_HANDLE;
}
export async function getShareStream() {
  ensureCaptureHandle();
  const md = navigator.mediaDevices;
  try {
    return await md.getDisplayMedia({
      video: { displaySurface: "browser", frameRate: { ideal: 15, max: 24 } }, audio: false,
      preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude",
    });
  } catch (e) {
    if (e?.name === "TypeError" || e?.name === "OverconstrainedError") return md.getDisplayMedia({ video: { frameRate: { ideal: 12, max: 20 } }, audio: false });
    throw e;
  }
}
// 공유한 화면이 "지금 이 탭"인지 — true(이 탭) · false(다른 탭/창/전체 화면) · null(모름)
export function describeSurface(track) {
  const s = track?.getSettings?.() || {};
  const surface = s.displaySurface || "";
  let self = null;
  if (surface && surface !== "browser") self = false;
  else {
    try {
      const h = track?.getCaptureHandle?.();
      if (h && typeof h.handle === "string" && h.handle) self = h.handle === CAPTURE_HANDLE;
    } catch { /* 지원 안 함 */ }
    if (self === null && surface === "browser" && s.width && s.height && window.innerWidth && window.innerHeight) {
      const a = s.width / s.height; const b = window.innerWidth / window.innerHeight;
      self = Math.abs(a - b) / b < 0.03 ? true : null; // 비율이 거의 같으면 이 탭으로 본다(확실하지 않으면 null)
    }
  }
  return { surface, self };
}
export const viewportInfo = () => ({ w: window.innerWidth, h: window.innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100, sx: Math.round(window.scrollX), sy: Math.round(window.scrollY) });
export const surfaceControllable = (sess) => sess?.displaySurface === "browser" && sess?.surfaceSelf !== false;

// ─────────────────────── 좌표(관리자 영상 → 0~1) ───────────────────────
export function videoPoint(video, clientX, clientY, clampOutside = false) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const r = video.getBoundingClientRect();
  const scale = Math.min(r.width / video.videoWidth, r.height / video.videoHeight);
  const w = video.videoWidth * scale; const h = video.videoHeight * scale;
  const ox = r.left + (r.width - w) / 2; const oy = r.top + (r.height - h) / 2;
  let x = (clientX - ox) / w; let y = (clientY - oy) / h;
  if (x < 0 || x > 1 || y < 0 || y > 1) { if (!clampOutside) return null; x = clamp01(x); y = clamp01(y); }
  return { x: r4(x), y: r4(y) };
}

// ─────────────────────── 직원 쪽 실행기 ───────────────────────
//  메시지(작게): m 이동 · d 누름 · u 뗌 · dc 더블클릭 · cx 오른쪽 클릭 · w 휠 · k 특수키 · tx 글자 · sel 목록 고르기
//  직원 → 관리자: so 목록(select) 열림 · cp 복사한 글 · h 안내
const GUARD = "[data-kp-rc-guard]";
const TEXT_TYPES = ["", "text", "search", "email", "url", "tel", "number", "password"];
const isTextField = (el) => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && TEXT_TYPES.includes((el.getAttribute("type") || "").toLowerCase())));
const isPassword = (el) => el?.tagName === "INPUT" && (el.type || "").toLowerCase() === "password";
const isEditable = (el) => !!el && !el.disabled && !el.readOnly && (isTextField(el) || el.isContentEditable);
const FOCUSABLE = "input,textarea,select,button,a[href],summary,[tabindex],[contenteditable=''],[contenteditable='true']";
const KEYCODES = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, " ": 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
const keyCodeOf = (key) => KEYCODES[key] || (key && key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
const fileInputOf = (el) => {
  if (!el) return null;
  const inp = el.closest?.("input[type=file]"); if (inp) return inp;
  const lab = el.closest?.("label"); const c = lab?.control;
  return c && c.type === "file" ? c : null;
};

function visible(el) {
  if (!el || el.disabled) return false;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
}
function tabbables() {
  return [...document.querySelectorAll(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && !el.closest(GUARD) && visible(el) && !(el.tagName === "INPUT" && el.type === "hidden"));
}
function scrollFrom(start, dx, dy) {
  for (let n = start; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const oy = /(auto|scroll|overlay)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1;
    const ox = /(auto|scroll|overlay)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1;
    const canY = dy && oy && (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0);
    const canX = dx && ox && (dx > 0 ? n.scrollLeft + n.clientWidth < n.scrollWidth - 1 : n.scrollLeft > 0);
    if (canY || canX) { n.scrollBy({ left: canX ? dx : 0, top: canY ? dy : 0 }); return n; }
  }
  const se = document.scrollingElement || document.documentElement;
  se.scrollBy({ left: dx, top: dy });
  return se;
}
function setNativeValue(el, v) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (set) set.call(el, v); else el.value = v;
}
const sel = (el) => { try { const s = el.selectionStart; const e = el.selectionEnd; return s == null ? null : [s, e]; } catch { return null; } };

export function createExecutor({ onCursor, onHint, send } = {}) {
  let down = null; // { el, b }
  let hover = null;
  let lastClick = { at: 0, x: -99, y: -99, n: 0 };
  let lastSelect = null;
  const hint = (s) => { onHint?.(s); send?.({ t: "h", s }); };
  const xy = (m) => [clamp01(m.x) * window.innerWidth, clamp01(m.y) * window.innerHeight];
  const hit = (cx, cy) => {
    const el = document.elementFromPoint(cx, cy);
    if (!el) return null;
    if (el.closest(GUARD)) return "guard";
    return el;
  };
  const mods = (m) => { const b = m.m | 0; return { ctrlKey: !!(b & 1), shiftKey: !!(b & 2), altKey: !!(b & 4), metaKey: !!(b & 8) }; };
  const mouse = (type, el, cx, cy, b, buttons, extra = {}) => {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, screenX: cx + (window.screenX || 0), screenY: cy + (window.screenY || 0), button: b, buttons, ...extra };
    const ev = type.startsWith("pointer") ? new PointerEvent(type, { ...init, pointerId: 7, pointerType: "mouse", isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0 }) : new MouseEvent(type, init);
    return el.dispatchEvent(ev);
  };
  const setHover = (el, cx, cy) => {
    if (el === hover) return;
    const prev = hover; hover = el;
    if (prev && prev.isConnected) { mouse("pointerout", prev, cx, cy, 0, 0, { relatedTarget: el }); mouse("mouseout", prev, cx, cy, 0, 0, { relatedTarget: el }); }
    if (el) { mouse("pointerover", el, cx, cy, 0, 0, { relatedTarget: prev }); mouse("mouseover", el, cx, cy, 0, 0, { relatedTarget: prev }); }
  };
  const focusAt = (el) => {
    const f = el.closest?.(FOCUSABLE);
    if (f && !f.disabled) {
      if (document.activeElement !== f) {
        try { f.focus({ preventScroll: true }); } catch { /* 무시 */ }
        if (isTextField(f) && !isPassword(f)) { try { const n = f.value.length; f.setSelectionRange(n, n); } catch { /* number 등 */ } }
      }
    } else if (document.activeElement && document.activeElement !== document.body) {
      try { document.activeElement.blur(); } catch { /* 무시 */ }
    }
  };
  const commonAncestor = (a, b) => { for (let n = a; n; n = n.parentElement) if (n.contains(b)) return n; return null; };
  const doClick = (el, cx, cy, detail) => {
    const fi = fileInputOf(el);
    if (fi) { hint("파일 선택은 직원이 직접 눌러 주세요"); return; }
    const s = el.closest?.("select");
    if (s && !s.multiple) {
      lastSelect = s;
      try { s.focus({ preventScroll: true }); } catch { /* 무시 */ }
      send?.({ t: "so", i: s.selectedIndex, o: [...s.options].slice(0, 80).map((o) => (o.label || o.text || "").slice(0, 40)) });
    }
    mouse("click", el, cx, cy, 0, 0, { detail });
  };
  const moveCursor = (cx, cy, pressed) => onCursor?.(cx, cy, pressed);

  // ── 글자 넣기 ──
  const insertText = (s) => {
    const el = document.activeElement;
    if (!el || el === document.body || !isEditable(el)) return false;
    if (isPassword(el)) { hint("비밀번호 칸은 직원이 직접 입력해 주세요"); return true; }
    if (el.maxLength > 0 && isTextField(el)) { const room = el.maxLength - el.value.length + (sel(el) ? sel(el)[1] - sel(el)[0] : 0); if (room <= 0) return true; s = s.slice(0, room); }
    const before = isTextField(el) ? el.value : el.textContent;
    let done = false;
    try { done = document.execCommand("insertText", false, s); } catch { done = false; }
    const after = isTextField(el) ? el.value : el.textContent;
    if (done && after !== before) return true;
    if (!isTextField(el)) return true;
    const r = sel(el);
    const v = el.value;
    const nv = r ? v.slice(0, r[0]) + s + v.slice(r[1]) : v + s;
    setNativeValue(el, nv);
    if (r) { try { el.setSelectionRange(r[0] + s.length, r[0] + s.length); } catch { /* 무시 */ } }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: s }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const deleteText = (forward) => {
    const el = document.activeElement;
    if (!isEditable(el) || isPassword(el)) return;
    const before = isTextField(el) ? el.value : el.textContent;
    let done = false;
    try { done = document.execCommand(forward ? "forwardDelete" : "delete", false); } catch { done = false; }
    if (!isTextField(el) || (done && el.value !== before)) return;
    const v = el.value; const r = sel(el) || [v.length, v.length];
    let [a, b] = r;
    if (a === b) { if (forward) b = Math.min(v.length, b + 1); else a = Math.max(0, a - 1); }
    if (a === b) return;
    setNativeValue(el, v.slice(0, a) + v.slice(b));
    try { el.setSelectionRange(a, a); } catch { /* 무시 */ }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: forward ? "deleteContentForward" : "deleteContentBackward" }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const key = (type, el, k, md) => {
    const ev = new KeyboardEvent(type, { key: k, code: md.code || "", bubbles: true, cancelable: true, composed: true, view: window, ctrlKey: md.ctrlKey, shiftKey: md.shiftKey, altKey: md.altKey, metaKey: md.metaKey });
    const kc = type === "keypress" && k.length === 1 ? k.charCodeAt(0) : keyCodeOf(k);
    try { Object.defineProperty(ev, "keyCode", { get: () => kc }); Object.defineProperty(ev, "which", { get: () => kc }); } catch { /* 무시 */ }
    return el.dispatchEvent(ev);
  };
  const chooseOption = (s, i) => {
    if (!s || !s.isConnected || s.disabled || i < 0 || i >= s.options.length || s.options[i].disabled) return;
    if (s.selectedIndex === i) return;
    s.selectedIndex = i;
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const keyDefault = (k, md, el) => {
    const ctrl = md.ctrlKey || md.metaKey;
    const editable = isEditable(el);
    if (ctrl) {
      const c = k.toLowerCase();
      if (c === "a") { if (isTextField(el)) { try { el.select(); } catch { /* 무시 */ } } else document.execCommand("selectAll"); }
      else if (c === "c" || c === "x") {
        let s = "";
        if (isTextField(el) && !isPassword(el)) { const r = sel(el); s = r ? el.value.slice(r[0], r[1]) : ""; } else s = String(window.getSelection?.() || "");
        if (s) send?.({ t: "cp", s: s.slice(0, 5000) });
        if (c === "x" && s && editable && !isPassword(el)) deleteText(false);
      } else if (c === "z") document.execCommand(md.shiftKey ? "redo" : "undo");
      else if (c === "y") document.execCommand("redo");
      return;
    }
    switch (k) {
      case "Backspace": deleteText(false); break;
      case "Delete": deleteText(true); break;
      case "Enter": {
        if (!key("keypress", el, "Enter", md)) break;
        if (el.tagName === "TEXTAREA" || (el.isContentEditable && editable)) { if (md.shiftKey && el.isContentEditable) document.execCommand("insertLineBreak"); else insertText("\n"); }
        else if (el.tagName === "INPUT" && el.form && !["button", "checkbox", "radio", "file"].includes(el.type)) { try { el.form.requestSubmit(); } catch { /* 무시 */ } }
        else if (el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "SUMMARY" || el.getAttribute?.("role") === "button") el.click();
        break;
      }
      case " ":
        if (!editable && (el.tagName === "BUTTON" || (el.tagName === "INPUT" && ["checkbox", "radio", "button", "submit"].includes(el.type)) || el.getAttribute?.("role") === "button")) {
          if (fileInputOf(el)) hint("파일 선택은 직원이 직접 눌러 주세요"); else el.click();
        } else if (!editable) scrollFrom(hover || el, 0, window.innerHeight * 0.8);
        break;
      case "Tab": {
        const list = tabbables(); if (!list.length) break;
        const i = list.indexOf(el);
        const n = list[(i < 0 ? (md.shiftKey ? list.length : -1) : i) + (md.shiftKey ? -1 : 1)] || list[md.shiftKey ? list.length - 1 : 0];
        try { n.focus(); if (isTextField(n) && !isPassword(n)) n.select?.(); } catch { /* 무시 */ }
        break;
      }
      case "ArrowLeft": case "ArrowRight": case "ArrowUp": case "ArrowDown": case "Home": case "End": case "PageUp": case "PageDown": {
        if (el.tagName === "SELECT") {
          const d = k === "ArrowUp" || k === "ArrowLeft" ? -1 : k === "ArrowDown" || k === "ArrowRight" ? 1 : 0;
          if (d) chooseOption(el, el.selectedIndex + d); else chooseOption(el, k === "Home" || k === "PageUp" ? 0 : el.options.length - 1);
          break;
        }
        if (isTextField(el) && el.tagName === "INPUT") {
          const r = sel(el); if (!r) break;
          const len = el.value.length;
          let p = k === "ArrowLeft" ? (r[0] === r[1] ? r[0] - 1 : r[0]) : k === "ArrowRight" ? (r[0] === r[1] ? r[1] + 1 : r[1]) : k === "Home" || k === "ArrowUp" ? 0 : len;
          p = Math.max(0, Math.min(len, p));
          try { el.setSelectionRange(p, p); } catch { /* 무시 */ }
          break;
        }
        if (editable) break; // textarea · contenteditable: 줄 이동은 지원하지 않음(마우스로 위치를 고르세요)
        const H = window.innerHeight;
        const dy = { ArrowUp: -60, ArrowDown: 60, PageUp: -H * 0.85, PageDown: H * 0.85, Home: -1e7, End: 1e7 }[k] || 0;
        const dx = { ArrowLeft: -60, ArrowRight: 60 }[k] || 0;
        scrollFrom(hover || el, dx, dy);
        break;
      }
      default: break;
    }
  };

  function exec(m) {
    if (!m || typeof m !== "object" || typeof m.t !== "string") return;
    switch (m.t) {
      case "m": {
        const [cx, cy] = xy(m); moveCursor(cx, cy, !!down);
        const el = hit(cx, cy); if (!el || el === "guard") return;
        setHover(el, cx, cy);
        const buttons = down ? 1 : 0;
        mouse("pointermove", el, cx, cy, 0, buttons); mouse("mousemove", el, cx, cy, 0, buttons);
        return;
      }
      case "d": {
        const [cx, cy] = xy(m); moveCursor(cx, cy, true);
        const el = hit(cx, cy); if (!el || el === "guard") { down = null; return; }
        const b = m.b === 2 ? 2 : 0;
        setHover(el, cx, cy);
        down = { el, b };
        mouse("pointerdown", el, cx, cy, b, b === 2 ? 2 : 1);
        if (mouse("mousedown", el, cx, cy, b, b === 2 ? 2 : 1) && b === 0) focusAt(el);
        return;
      }
      case "u": {
        const [cx, cy] = xy(m); moveCursor(cx, cy, false);
        const d = down; down = null;
        const el = hit(cx, cy); if (!el || el === "guard") return;
        const b = m.b === 2 ? 2 : 0;
        mouse("pointerup", el, cx, cy, b, 0); mouse("mouseup", el, cx, cy, b, 0);
        if (!d || !d.el.isConnected || b !== 0) return;
        const target = commonAncestor(d.el, el); if (!target) return;
        const now = Date.now();
        const n = now - lastClick.at < 500 && Math.abs(cx - lastClick.x) < 6 && Math.abs(cy - lastClick.y) < 6 ? lastClick.n + 1 : 1;
        lastClick = { at: now, x: cx, y: cy, n };
        doClick(target, cx, cy, n);
        return;
      }
      case "dc": {
        const [cx, cy] = xy(m); const el = hit(cx, cy); if (!el || el === "guard") return;
        mouse("dblclick", el, cx, cy, 0, 0, { detail: 2 });
        return;
      }
      case "cx": {
        const [cx, cy] = xy(m); moveCursor(cx, cy, false); const el = hit(cx, cy); if (!el || el === "guard") return;
        mouse("pointerdown", el, cx, cy, 2, 2); mouse("mousedown", el, cx, cy, 2, 2);
        mouse("pointerup", el, cx, cy, 2, 0); mouse("mouseup", el, cx, cy, 2, 0);
        mouse("contextmenu", el, cx, cy, 2, 0);
        return;
      }
      case "w": {
        const [cx, cy] = xy(m); const el = hit(cx, cy); if (!el || el === "guard") return;
        const dx = Math.max(-5000, Math.min(5000, +m.dx || 0)); const dy = Math.max(-5000, Math.min(5000, +m.dy || 0));
        const ok = el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, deltaX: dx, deltaY: dy, deltaMode: 0 }));
        if (ok) scrollFrom(el, dx, dy);
        return;
      }
      case "k": {
        const k = String(m.k || "").slice(0, 20); if (!k) return;
        const md = { ...mods(m), code: String(m.c || "").slice(0, 20) };
        const el = document.activeElement && document.activeElement !== document.documentElement ? document.activeElement : document.body;
        if (el.closest?.(GUARD)) return;
        if (key("keydown", el, k, md)) keyDefault(k, md, el);
        key("keyup", el, k, md);
        return;
      }
      case "tx": {
        const s = String(m.s || "").slice(0, 2000); if (!s) return;
        const el = document.activeElement && document.activeElement !== document.documentElement ? document.activeElement : document.body;
        if (el.closest?.(GUARD)) return;
        if (s.length === 1) {
          const md = { ctrlKey: false, shiftKey: s !== s.toLowerCase(), altKey: false, metaKey: false, code: "" };
          if (!key("keydown", el, s, md)) { key("keyup", el, s, md); return; }
          if (key("keypress", el, s, md)) insertText(s);
          key("keyup", el, s, md);
        } else insertText(s);
        return;
      }
      case "sel": chooseOption(lastSelect, m.i | 0); return;
      default: return;
    }
  }
  return { exec, reset() { down = null; hover = null; lastSelect = null; } };
}

// ─────────────────────── 관리자 쪽 입력 잡기 ───────────────────────
//  layer: 영상 위 투명 막(마우스) · sink: 숨은 textarea(키보드 · 한글 입력 · 붙여넣기)
const SPECIAL = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
export function attachAdminCapture({ layer, video, sink, send, canMove = () => true, onCompose }) {
  if (!layer || !video || !sink) return () => {};
  let dragging = false; let lastMove = 0; let moveTimer = null; let pendingMove = null;
  let wheel = { dx: 0, dy: 0, x: 0, y: 0, t: null };
  const pt = (e, clamp) => videoPoint(video, e.clientX, e.clientY, clamp);
  const flushMove = () => { moveTimer = null; if (pendingMove) { send({ t: "m", ...pendingMove }); pendingMove = null; lastMove = Date.now(); } };
  const onMove = (e) => {
    const p = pt(e, dragging); if (!p) return;
    if (!dragging && !canMove()) return;
    pendingMove = p;
    const wait = 40 - (Date.now() - lastMove);
    if (wait <= 0) flushMove(); else if (!moveTimer) moveTimer = setTimeout(flushMove, wait);
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    const p = pt(e); if (!p) return;
    e.preventDefault();
    try { sink.focus({ preventScroll: true }); } catch { /* 무시 */ }
    if (moveTimer) { clearTimeout(moveTimer); flushMove(); }
    dragging = true;
    send({ t: "d", b: 0, ...p });
  };
  const onUp = (e) => {
    if (!dragging || e.button !== 0) return;
    dragging = false;
    if (moveTimer) { clearTimeout(moveTimer); flushMove(); }
    const p = pt(e, true); if (!p) return;
    send({ t: "u", b: 0, ...p });
  };
  const onDbl = (e) => { const p = pt(e); if (p) { e.preventDefault(); send({ t: "dc", ...p }); } };
  const onCtx = (e) => { e.preventDefault(); const p = pt(e); if (p) { try { sink.focus({ preventScroll: true }); } catch { /* 무시 */ } send({ t: "cx", ...p }); } };
  const onWheel = (e) => {
    const p = pt(e); if (!p) return;
    e.preventDefault();
    const mul = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    wheel.dx += e.deltaX * mul; wheel.dy += e.deltaY * mul; wheel.x = p.x; wheel.y = p.y;
    if (!wheel.t) wheel.t = setTimeout(() => { const w = wheel; wheel = { dx: 0, dy: 0, x: 0, y: 0, t: null }; if (Math.round(w.dx) || Math.round(w.dy)) send({ t: "w", x: w.x, y: w.y, dx: Math.round(w.dx), dy: Math.round(w.dy) }); }, 60);
  };
  const modBits = (e) => (e.ctrlKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
  const onKey = (e) => {
    if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중 — compositionend에서 보낸다
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "v") return; // 붙여넣기는 paste 이벤트로
    if (ctrl || e.altKey || SPECIAL.has(e.key) || /^F\d{1,2}$/.test(e.key)) {
      e.preventDefault();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      send({ t: "k", k: e.key, c: e.code, m: modBits(e) });
    }
    // 그 밖의 글자는 textarea에 들어가게 두고 input 이벤트에서 보낸다
  };
  const clear = () => { sink.value = ""; };
  const onInput = (e) => {
    if (e.isComposing) { onCompose?.(sink.value); return; }
    const t = e.inputType || "";
    if (t === "insertText" || t === "insertReplacementText") { const s = e.data ?? sink.value; if (s) send({ t: "tx", s }); }
    clear();
  };
  const onCompStart = () => onCompose?.("");
  const onCompUpdate = (e) => onCompose?.(e.data || "");
  const onCompEnd = (e) => { onCompose?.(""); const s = e.data || ""; if (s) send({ t: "tx", s }); setTimeout(clear, 0); };
  const onPaste = (e) => { e.preventDefault(); const s = (e.clipboardData?.getData("text") || "").slice(0, 2000); if (s) send({ t: "tx", s }); };
  layer.addEventListener("mousemove", onMove);
  layer.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  layer.addEventListener("dblclick", onDbl);
  layer.addEventListener("contextmenu", onCtx);
  layer.addEventListener("wheel", onWheel, { passive: false });
  sink.addEventListener("keydown", onKey);
  sink.addEventListener("input", onInput);
  sink.addEventListener("compositionstart", onCompStart);
  sink.addEventListener("compositionupdate", onCompUpdate);
  sink.addEventListener("compositionend", onCompEnd);
  sink.addEventListener("paste", onPaste);
  return () => {
    clearTimeout(moveTimer); clearTimeout(wheel.t);
    layer.removeEventListener("mousemove", onMove);
    layer.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    layer.removeEventListener("dblclick", onDbl);
    layer.removeEventListener("contextmenu", onCtx);
    layer.removeEventListener("wheel", onWheel);
    sink.removeEventListener("keydown", onKey);
    sink.removeEventListener("input", onInput);
    sink.removeEventListener("compositionstart", onCompStart);
    sink.removeEventListener("compositionupdate", onCompUpdate);
    sink.removeEventListener("compositionend", onCompEnd);
    sink.removeEventListener("paste", onPaste);
  };
}

// ─────────────────────── 직원 화면: 제어 중 배너 · 관리자 커서 · 안내 ───────────────────────
export function StaffControlOverlay({ cursorRef, hint, onStop }) {
  return (
    <>
      <div ref={cursorRef} className="fixed left-0 top-0 pointer-events-none z-[2147483001]" style={{ transform: "translate(-200px,-200px)", willChange: "transform" }} data-testid="rc-cursor">
        <svg width="26" height="26" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 2px 4px rgba(11,20,40,.45))" }}>
          <path d="M4 2.5l15 9.2-6.6 1.4 3.9 7.1-2.6 1.4-3.9-7.1L4.9 19z" fill="#1B2B4B" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <span className="absolute left-[20px] top-[20px] whitespace-nowrap px-2 py-0.5 rounded-full bg-[#2D4C82] text-white text-[11.5px] font-black shadow">관리자</span>
      </div>
      <div data-kp-rc-guard="" className="fixed top-2 left-1/2 -translate-x-1/2 z-[2147483002] w-[calc(100%-24px)] sm:w-auto" data-testid="rc-banner">
        <div className="flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full text-white shadow-[0_14px_36px_rgba(11,20,40,0.42)] ring-1 ring-white/15" style={{ background: "linear-gradient(90deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <span className="w-2.5 h-2.5 rounded-full bg-[#8FB0F0] kp-sup-wait shrink-0" />
          <span className="text-[14.5px] font-black whitespace-nowrap">관리자가 화면을 제어하고 있어요</span>
          <span className="hidden md:inline text-[12px] text-white/55 whitespace-nowrap">Esc 길게 눌러도 끝나요</span>
          <button type="button" onClick={onStop} data-testid="rc-stop" className="ml-auto shrink-0 h-9 px-4 rounded-full bg-white text-[#0F1A30] text-[14px] font-black">제어 끝내기</button>
        </div>
        {hint && <div className="mt-2 mx-auto w-fit px-3.5 py-2 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-bold shadow" data-testid="rc-hint">{hint}</div>}
      </div>
    </>
  );
}

// 직원이 Esc를 길게(0.7초) 누르면 끝낸다 — 진짜 키보드(isTrusted)만 센다(관리자가 보낸 Esc는 아님)
export function useEscHold(active, onStop) {
  React.useEffect(() => {
    if (!active) return undefined;
    let t = null;
    const down = (e) => { if (!e.isTrusted || e.key !== "Escape" || t) return; t = setTimeout(() => { t = null; onStop(); }, 700); };
    const up = (e) => { if (e.key === "Escape" && t) { clearTimeout(t); t = null; } };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true);
    return () => { clearTimeout(t); window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); };
  }, [active, onStop]);
}

// ─────────────────────── 관리자 화면: 목록(select) 고르기 ───────────────────────
export function RemoteSelectPicker({ data, onPick, onClose }) {
  if (!data) return null;
  return (
    <div className="absolute right-3 bottom-3 z-20 w-[260px] max-h-[60%] overflow-y-auto rounded-2xl bg-white shadow-[0_18px_44px_rgba(11,20,40,0.45)] ring-1 ring-[#DCE3EE]" data-testid="rc-select-picker">
      <div className="sticky top-0 flex items-center px-3 h-10 bg-[#F7F9FC] border-b border-[#E8EDF4] text-[13px] font-black text-[#0F1A30]">목록에서 고르기<button type="button" onClick={onClose} className="ml-auto w-7 h-7 rounded-lg text-[#5B6B85] hover:bg-white" aria-label="닫기">✕</button></div>
      {data.o.map((label, i) => (
        <button key={i} type="button" onClick={() => onPick(i)} className={`w-full text-left px-3 py-2 text-[14px] ${i === data.i ? "bg-[#EEF3FC] font-black text-[#1B2B4B]" : "text-[#0F1A30] hover:bg-[#F5F8FD]"}`}>{label || "(빈 항목)"}</button>
      ))}
    </div>
  );
}
export const RC_MONO = MONO;
