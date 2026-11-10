// ======================= src/ColumnLayout.jsx =======================
// 🧩 2026-11-10 컬럼 수정 — 표 머리글(컬럼명) 오른쪽 클릭 → "컬럼 수정"
//  · 칸 순서 옮기기 · 숨기기(데이터는 그대로, 화면에서만 안 보임) · 기본값으로
//  · 계정마다 따로(colLayouts/{uid}) — 홍길동이 옮겨도 박태준 화면은 그대로
//  · [회사 전체 적용] 누르면 그 배치가 회사 모든 계정에 한 번에 적용(colLayoutsCompany/{회사})
//    → 그 뒤 각자 다시 바꾸면 그 계정만 그대로 유지 · 다시 [회사 전체 적용]을 누르면 모두 다시 그 배치로
//  · 모든 표에서 동작(머리글 이름으로 표를 알아본다) — React가 그린 칸을 지우지 않고 자리만 옮긴다
import React from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot, setDoc, updateDoc, deleteField, FieldPath, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import { thText, headRow, origHeadCells, tableKey, colIds } from "./colTableKey";
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const NUM = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

// ── 저장소 ──
let UID = ""; let CO = "";
let MINE = {};   // { [표]: { order:[칸], hidden:[칸], base:회사적용번호, reset? } }
let COMP = {};   // { [표]: { order, hidden, v, by, byName, at } }
let DRAFT = null; // 수정 창이 열려 있는 동안 미리보기 { tkey, order, hidden }
let PREFS = {};   // 🖥 2026-11-10 계정별 화면 설정(화면 맞춤 등) — 내 배치 문서에 같이 저장
const prefSubs = new Set();
const subs = new Set();
const notify = () => subs.forEach((f) => f());
const lsKey = () => `kpColLayout:v1:${UID}`;
const cacheMine = () => { try { localStorage.setItem(lsKey(), JSON.stringify(MINE)); } catch { /* 무시 */ } };
const lsCoKey = () => `kpColLayoutCo:v1:${CO}`;
const cacheComp = () => { try { localStorage.setItem(lsCoKey(), JSON.stringify(COMP)); } catch { /* 무시 */ } };

// 지금 이 표에 쓸 배치 — 회사 적용이 더 새로우면 회사 것, 아니면 내 것, 둘 다 없으면 기본
export function layoutOf(tkey) {
  if (DRAFT && DRAFT.tkey === tkey) return { ...DRAFT, src: "draft" };
  const m = MINE[tkey]; const c = COMP[tkey];
  if (c && (!m || (Number(m.base) || 0) < (Number(c.v) || 0))) return { order: c.order || [], hidden: c.hidden || [], src: "company", by: c.byName || "", at: c.at || 0 };
  if (m && ((m.order || []).length || (m.hidden || []).length)) return { order: m.order || [], hidden: m.hidden || [], src: "mine" };
  return null;
}
export const companyLayoutOf = (tkey) => COMP[tkey] || null;
const anyLayout = () => !!DRAFT || Object.keys(MINE).length > 0 || Object.keys(COMP).length > 0;

const myName = () => { try { return localStorage.getItem("userName") || auth?.currentUser?.displayName || auth?.currentUser?.email || ""; } catch { return ""; } };
const err = (e) => { console.warn("[colLayouts] 저장 실패", e?.code || e); try { window.dispatchEvent(new CustomEvent("kp-collayout-error")); } catch { /* 무시 */ } };
const saveMine = () => {
  cacheMine(); notify();
  if (!UID) return Promise.resolve();
  return setDoc(doc(db, "colLayouts", UID), { uid: UID, companyName: CO, layouts: MINE, prefs: PREFS, updatedAt: serverTimestamp() }).catch(err);
};
// 계정별 화면 설정 — 어느 PC에서 로그인해도 같은 설정
const lsPrefKey = () => `kpUiPrefs:v1:${UID}`;
export const getPref = (k) => PREFS[k];
export function setPref(k, v) {
  PREFS = { ...PREFS, [k]: v };
  try { localStorage.setItem(lsPrefKey(), JSON.stringify(PREFS)); } catch { /* 무시 */ }
  prefSubs.forEach((f) => f());
  if (UID) setDoc(doc(db, "colLayouts", UID), { uid: UID, companyName: CO, layouts: MINE, prefs: PREFS, updatedAt: serverTimestamp() }).catch(err);
}
export function usePref(k) {
  const [, f] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { prefSubs.add(f); return () => prefSubs.delete(f); }, []);
  return PREFS[k];
}
// 내 화면에만 저장
export function saveMyLayout(tkey, order, hidden) {
  const c = COMP[tkey];
  MINE = { ...MINE, [tkey]: { order: [...order], hidden: [...hidden], base: Number(c?.v) || 0, at: Date.now() } };
  return saveMine();
}
// 내 화면 기본값으로(회사 적용이 있어도 기본 배치로)
export function resetMyLayout(tkey) {
  const c = COMP[tkey];
  const next = { ...MINE };
  if (c) next[tkey] = { order: [], hidden: [], base: Number(c.v) || 0, reset: true, at: Date.now() }; else delete next[tkey];
  MINE = next;
  return saveMine();
}
// 회사 전체 적용 — 모든 계정이 이 배치로(각자 다시 바꿀 수 있다)
export async function applyCompanyLayout(tkey, order, hidden) {
  if (!CO) throw new Error("회사 정보가 없어요");
  const v = Date.now();
  const entry = { order: [...order], hidden: [...hidden], v, by: UID, byName: myName(), at: v };
  COMP = { ...COMP, [tkey]: entry }; cacheComp();
  MINE = { ...MINE, [tkey]: { order: [...order], hidden: [...hidden], base: v, at: v } }; cacheMine(); notify();
  await setDoc(doc(db, "colLayoutsCompany", CO), { companyName: CO, layouts: { [tkey]: entry }, updatedAt: serverTimestamp(), updatedBy: auth?.currentUser?.email || "" }, { merge: true });
  if (UID) await setDoc(doc(db, "colLayouts", UID), { uid: UID, companyName: CO, layouts: MINE, prefs: PREFS, updatedAt: serverTimestamp() }).catch(err);
}
// 회사 공통 배치 해제 — 각자 저장한 배치는 그대로, 따로 저장 안 한 사람은 기본으로
export async function clearCompanyLayout(tkey) {
  if (!CO || !COMP[tkey]) return;
  const next = { ...COMP }; delete next[tkey]; COMP = next; cacheComp(); notify();
  await updateDoc(doc(db, "colLayoutsCompany", CO), new FieldPath("layouts", tkey), deleteField(), "updatedAt", serverTimestamp());
}
export function setDraft(d) { DRAFT = d; notify(); }

// ── 표에 입히기 ──
let lidSeq = 0;
const tagCells = (cells) => {
  let have = 0; for (const c of cells) if (c.dataset.kpci != null) have++;
  if (have === cells.length) return;
  if (!have) { cells.forEach((c, i) => { c.dataset.kpci = String(i); }); return; }
  const used = new Set(); cells.forEach((c) => { if (c.dataset.kpci != null) used.add(Number(c.dataset.kpci)); });
  const free = []; for (let i = 0; i < cells.length; i++) if (!used.has(i)) free.push(i);
  let j = 0; cells.forEach((c) => { if (c.dataset.kpci == null) c.dataset.kpci = String(free[j++] ?? cells.length + j); });
};
// 표 이름은 머리글 글자가 바뀔 때만 다시 계산(innerText는 느리다)
const keyOf = (t) => { const hr = headRow(t); if (!hr) return ""; let sig = ""; for (const c of hr.cells) sig += `${c.textContent}\u0001`; if (t._kpSig !== sig || !t._kpKey) { t._kpSig = sig; t._kpKey = tableKey(t); } return t._kpKey; };
// 이 표에서 컬럼 수정을 쓸 수 있나(머리글 줄이 1줄 · 합친 칸 없음)
export const canLayout = (t) => { const h = t?.tHead; if (!h || h.rows.length !== 1) return false; const cells = [...h.rows[0].cells]; return cells.length > 1 && cells.every((c) => c.colSpan === 1); };
// 원래 순서 칸 이름 → 지금 보여줄 순서(원래 번호 배열)
export function permOf(ids, order) {
  const at = new Map(ids.map((id, i) => [id, i]));
  const perm = []; const used = new Set();
  (order || []).forEach((id) => { const i = at.get(id); if (i != null && !used.has(i)) { perm.push(i); used.add(i); } });
  for (let i = 0; i < ids.length; i++) {
    if (used.has(i)) continue;
    // 새로 생긴 칸은 원래 앞 칸 바로 뒤에
    let pos = 0; for (let k = i - 1; k >= 0; k--) { const p = perm.indexOf(k); if (p >= 0) { pos = p + 1; break; } }
    perm.splice(pos, 0, i); used.add(i);
  }
  return perm;
}
const isIdentity = (perm) => perm.every((v, i) => v === i);

function processTable(t, rows) {
  if (!t || !t.isConnected) return false;
  const touched = t.dataset.kplid != null;
  if (!touched && !anyLayout()) return false;
  if (!canLayout(t)) return false;
  const hr = headRow(t);
  const key = keyOf(t);
  const lay = layoutOf(key);
  if (!lay && !touched) return false;
  const N = hr.cells.length;
  tagCells([...hr.cells]);
  const ids = colIds(origHeadCells(t));
  const perm = lay ? permOf(ids, lay.order) : ids.map((_, i) => i);
  const hidden = new Set(); if (lay) (lay.hidden || []).forEach((id) => { const i = ids.indexOf(id); if (i >= 0) hidden.add(i); });
  if (hidden.size >= N) hidden.clear(); // 전부 숨기면 표가 사라진다 — 안전하게 모두 보이기
  let styleChanged = false;
  if (!touched) { t.dataset.kplid = `L${++lidSeq}`; styleChanged = true; }
  const hk = [...hidden].sort((a, b) => a - b).join(",");
  if ((t._kpHid || "") !== hk) { t._kpHid = hk; styleChanged = true; }
  const same = isIdentity(perm);
  if (same && !t._kpMoved && !styleChanged && !rows) return false;
  const list = rows || [...t.rows];
  for (const r of list) {
    if (!r.isConnected) continue;
    const sec = r.parentElement; if (!sec || sec.parentElement !== t) continue;
    if (sec.tagName === "THEAD" && r !== hr) continue;
    const cs = r.cells; if (cs.length !== N) continue;
    let bad = false; for (const c of cs) if (c.colSpan !== 1) { bad = true; break; }
    if (bad) continue;
    const arr = [...cs]; tagCells(arr);
    let ok = true; for (let k = 0; k < N; k++) if (Number(arr[k].dataset.kpci) !== perm[k]) { ok = false; break; }
    if (ok) continue;
    const byI = []; arr.forEach((c) => { byI[Number(c.dataset.kpci)] = c; });
    if (perm.some((i) => !byI[i])) continue;
    perm.forEach((i) => r.appendChild(byI[i]));
  }
  t._kpMoved = !same;
  return styleChanged;
}

let styleEl = null;
function rebuildHideCss() {
  if (!styleEl) return;
  const out = [];
  document.querySelectorAll("table[data-kplid]").forEach((t) => {
    const hk = t._kpHid || ""; if (!hk) return;
    const sel = hk.split(",").map((i) => `table[data-kplid="${t.dataset.kplid}"]>*>tr>[data-kpci="${i}"]`).join(",");
    out.push(`${sel}{display:none!important}`);
  });
  const txt = out.join("\n");
  if (styleEl.textContent !== txt) styleEl.textContent = txt;
}
let mo = null;
export function processAll() {
  let css = false;
  document.querySelectorAll("table").forEach((t) => { if (processTable(t)) css = true; });
  rebuildHideCss();
  try { mo?.takeRecords(); } catch { /* 무시 */ }
  try { window.dispatchEvent(new Event("kp-collayout-applied")); } catch { /* 무시 */ }
  return css;
}

// 앱에 한 번만 붙인다
export function useColumnLayoutHost(company) {
  const co = String(company || "").trim();
  useHeaderDrag();
  const [uid, setUid] = React.useState(() => auth?.currentUser?.uid || "");
  React.useEffect(() => { try { return auth.onAuthStateChanged((u) => setUid(u?.uid || "")); } catch { return undefined; } }, []);
  // 내 배치
  React.useEffect(() => {
    UID = uid;
    try { MINE = uid ? JSON.parse(localStorage.getItem(lsKey()) || "{}") || {} : {}; } catch { MINE = {}; }
    try { PREFS = uid ? JSON.parse(localStorage.getItem(lsPrefKey()) || "{}") || {} : {}; } catch { PREFS = {}; }
    notify(); prefSubs.forEach((f) => f());
    if (!uid) return undefined;
    let un = null;
    try {
      un = onSnapshot(doc(db, "colLayouts", uid), (s) => {
        const d = s.exists() ? s.data() || {} : {};
        MINE = d.layouts && typeof d.layouts === "object" ? d.layouts : {}; cacheMine(); notify();
        if (s.exists() && d.prefs && typeof d.prefs === "object") { PREFS = d.prefs; try { localStorage.setItem(lsPrefKey(), JSON.stringify(PREFS)); } catch { /* 무시 */ } prefSubs.forEach((f) => f()); }
      }, (e) => console.warn("[colLayouts] 읽기 실패", e?.code || e));
    } catch { /* 무시 */ }
    return () => { try { un?.(); } catch { /* 무시 */ } };
  }, [uid]);
  // 회사 공통 배치
  React.useEffect(() => {
    CO = co;
    try { COMP = co ? JSON.parse(localStorage.getItem(lsCoKey()) || "{}") || {} : {}; } catch { COMP = {}; }
    notify();
    if (!co || !uid) return undefined;
    let un = null;
    try {
      un = onSnapshot(doc(db, "colLayoutsCompany", co), (s) => {
        const d = s.exists() ? s.data() || {} : {};
        COMP = d.layouts && typeof d.layouts === "object" ? d.layouts : {}; cacheComp(); notify();
      }, (e) => console.warn("[colLayoutsCompany] 읽기 실패", e?.code || e));
    } catch { /* 무시 */ }
    return () => { try { un?.(); } catch { /* 무시 */ } };
  }, [co, uid]);
  // 표를 지켜보다가 새 줄 · 새 표가 생기면 바로(그리기 전에) 자리를 맞춘다
  React.useEffect(() => {
    styleEl = document.createElement("style"); styleEl.id = "kp-col-layout"; document.head.appendChild(styleEl);
    const SEC = /^(TBODY|THEAD|TFOOT)$/;
    mo = new MutationObserver((recs) => {
      if (!anyLayout() && !document.querySelector("table[data-kplid]")) return;
      const work = new Map(); // table → Set(rows) | null(전체)
      const all = (t) => { if (t) work.set(t, null); };
      const one = (t, r) => { if (!t || work.get(t) === null) return; const s = work.get(t) || new Set(); s.add(r); work.set(t, s); };
      for (const m of recs) {
        const tg = m.target; if (!tg || tg.nodeType !== 1) continue;
        const tag = tg.tagName;
        if (tag === "TR") { const sec = tg.parentElement; const t = sec?.parentElement; if (t?.tagName === "TABLE") { if (sec.tagName === "THEAD") all(t); else one(t, tg); } }
        else if (SEC.test(tag)) { const t = tg.parentElement; if (t?.tagName !== "TABLE") continue; if (tag === "THEAD") { all(t); continue; } m.addedNodes.forEach((n) => { if (n.tagName === "TR") one(t, n); }); }
        else if (tag === "TABLE") { m.addedNodes.forEach((n) => { if (n.nodeType === 1 && SEC.test(n.tagName)) all(tg); }); }
        else if (tg.closest?.("thead")) { all(tg.closest("table")); continue; }
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.tagName === "TABLE") all(n);
          else if (n.tagName !== "TR" && n.tagName !== "TD" && n.tagName !== "TH" && n.firstElementChild) n.querySelectorAll?.("table").forEach(all);
        });
      }
      if (!work.size) return;
      let css = false;
      work.forEach((rows, t) => { if (processTable(t, rows ? [...rows] : null)) css = true; });
      if (css || [...work.keys()].some((t) => t.dataset.kplid)) rebuildHideCss();
      mo.takeRecords();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const sub = () => processAll(); subs.add(sub);
    processAll();
    return () => { mo.disconnect(); mo = null; subs.delete(sub); styleEl.remove(); styleEl = null; };
  }, []);
}

// ── 머리글을 직접 잡고 끌어서 옮기기 ──
//  · 컬럼명을 누른 채 옆으로 10px 넘게 끌면 옮기기 시작(그냥 누르면 지금처럼 정렬)
//  · 놓은 자리로 옮기고 내 배치로 저장 · 표 끝에 가면 옆으로 스크롤
function useHeaderDrag() {
  React.useEffect(() => {
    let st = null;
    const scrollParent = (el) => { for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if ((o === "auto" || o === "scroll") && n.scrollWidth > n.clientWidth) return n; } return null; };
    const clean = () => { if (!st) return; st.ghost?.remove(); st.bar?.remove(); document.documentElement.style.userSelect = ""; document.documentElement.style.cursor = ""; window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("keydown", esc, true); clearInterval(st.auto); st = null; };
    const targetOf = (x, y) => {
      const el = document.elementFromPoint(x, y); const th = el?.closest?.("thead th");
      if (!th || th.closest("table") !== st.table) return null;
      const r = th.getBoundingClientRect(); return { th, after: x > r.left + r.width / 2, r };
    };
    const move = (e) => {
      if (!st) return;
      st.x = e.clientX; st.y = e.clientY;
      if (!st.on) {
        if (Math.abs(e.clientX - st.x0) < 10 || Math.abs(e.clientX - st.x0) < Math.abs(e.clientY - st.y0)) return;
        st.on = true;
        const g = document.createElement("div"); g.dataset.kp = "col-drag-ghost";
        g.style.cssText = "position:fixed;z-index:2147483300;pointer-events:none;padding:8px 14px;border-radius:12px;background:linear-gradient(120deg,#0F1A30,#2D4C82);color:#fff;font:900 13px 'Noto Sans KR',sans-serif;box-shadow:0 14px 32px rgba(6,12,26,.45);border:1px solid rgba(207,224,255,.35);white-space:nowrap;transform:translate(-50%,-130%)";
        g.textContent = `↔ ${thText(st.th) || "칸"}`;
        const b = document.createElement("div"); b.dataset.kp = "col-drag-bar";
        b.style.cssText = "position:fixed;z-index:2147483299;pointer-events:none;width:3px;border-radius:3px;background:#4B6CB7;box-shadow:0 0 0 3px rgba(75,108,183,.25);display:none";
        document.body.append(g, b); st.ghost = g; st.bar = b;
        st.th.style.opacity = "0.45";
        document.documentElement.style.userSelect = "none"; document.documentElement.style.cursor = "grabbing";
        // 표 끝에서 옆으로 스크롤
        st.sp = scrollParent(st.table);
        st.auto = setInterval(() => { if (!st?.sp) return; const r = st.sp.getBoundingClientRect(); if (st.x < r.left + 50) st.sp.scrollLeft -= 24; else if (st.x > r.right - 50) st.sp.scrollLeft += 24; }, 30);
      }
      e.preventDefault();
      st.ghost.style.left = `${e.clientX}px`; st.ghost.style.top = `${e.clientY}px`;
      const t = targetOf(e.clientX, e.clientY);
      if (t && t.th !== st.th) { const tr = st.table.tHead.getBoundingClientRect(); st.bar.style.display = "block"; st.bar.style.left = `${(t.after ? t.r.right : t.r.left) - 1.5}px`; st.bar.style.top = `${tr.top}px`; st.bar.style.height = `${Math.min(window.innerHeight - tr.top, st.table.getBoundingClientRect().bottom - tr.top)}px`; st.target = t; }
      else { st.bar.style.display = "none"; st.target = null; }
    };
    const up = (e) => {
      if (!st) return;
      const { on, target, table, th } = st; th.style.opacity = "";
      clean();
      if (!on) return;
      // 끌기 뒤 따라오는 클릭(정렬)은 막는다
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener("click", stop, true); };
      window.addEventListener("click", stop, true); setTimeout(() => window.removeEventListener("click", stop, true), 400);
      e.preventDefault();
      if (!target) return;
      const hr = headRow(table); const ids = colIds(origHeadCells(table));
      const idOf = (c) => ids[c.dataset.kpci != null ? Number(c.dataset.kpci) : [...hr.cells].indexOf(c)];
      const cur = [...hr.cells].map(idOf); const from = idOf(th); const to = idOf(target.th);
      const n = cur.filter((x) => x !== from); let at = n.indexOf(to); if (target.after) at += 1; n.splice(at, 0, from);
      if (n.join("\u0001") === cur.join("\u0001")) return;
      const tkey = tableKey(table); const l = layoutOf(tkey);
      saveMyLayout(tkey, n, (l?.hidden || []).filter((h) => ids.includes(h)));
      try { window.dispatchEvent(new CustomEvent("kp-col-toast", { detail: `“${from}” 칸을 옮겼어요 · 오른쪽 클릭 › 기본 배치로 되돌릴 수 있어요` })); } catch { /* 무시 */ }
    };
    const esc = (e) => { if (e.key === "Escape" && st) { st.th.style.opacity = ""; clean(); } };
    const down = (e) => {
      if (e.button !== 0 || st) return;
      const th = e.target?.closest?.("thead th"); if (!th) return;
      if (e.target.closest("input,button,select,textarea,a,label,[contenteditable=true],[data-no-coldrag]")) return;
      const table = th.closest("table"); if (!canLayout(table)) return;
      // 칸 너비 조절 손잡이(오른쪽 끝 6px)는 건드리지 않는다
      const r = th.getBoundingClientRect(); if (e.clientX > r.right - 6) return;
      st = { th, table, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false };
      window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true); window.addEventListener("keydown", esc, true);
    };
    document.addEventListener("pointerdown", down, true);
    return () => { document.removeEventListener("pointerdown", down, true); clean(); };
  }, []);
}

// ── 컬럼 수정 창 ──
const fmtAt = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export function ColumnLayoutModal({ table, onClose }) {
  const tkey = React.useMemo(() => tableKey(table), [table]);
  const ids = React.useMemo(() => colIds(origHeadCells(table)), [table]);
  const start = React.useMemo(() => { const l = layoutOf(tkey); return { perm: permOf(ids, l?.order), hidden: new Set((l?.hidden || []).filter((h) => ids.includes(h))), src: l?.src || "default" }; }, [tkey, ids]);
  const [order, setOrder] = React.useState(() => start.perm.map((i) => ids[i]));
  const [hidden, setHidden] = React.useState(() => start.hidden);
  const [drag, setDrag] = React.useState(null); const [over, setOver] = React.useState(null);
  const [busy, setBusy] = React.useState(""); const [msg, setMsg] = React.useState("");
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
  // 미리보기 — 고치는 동안 실제 표가 바로 바뀐다
  React.useEffect(() => { setDraft({ tkey, order, hidden: [...hidden] }); }, [tkey, order, hidden]);
  React.useEffect(() => () => setDraft(null), []);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const comp = companyLayoutOf(tkey);
  const cur = (() => { const save = DRAFT; DRAFT = null; const l = layoutOf(tkey); DRAFT = save; return l; })();
  const visibleN = order.length - hidden.size;
  const move = (from, to) => { if (to < 0 || to >= order.length || from === to) return; const n = [...order]; const [x] = n.splice(from, 1); n.splice(to, 0, x); setOrder(n); };
  const toggle = (id) => { const n = new Set(hidden); if (n.has(id)) n.delete(id); else { if (order.length - n.size <= 1) { setMsg("최소 1칸은 보여야 해요"); return; } n.add(id); } setHidden(n); setMsg(""); };
  // 손잡이를 잡고 끌기(마우스 · 터치 모두) — 놓은 자리로 옮긴다
  const startDrag = (e, k) => {
    e.preventDefault(); setDrag(k); setOver(k);
    const at = (ev) => { const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-kp=col-item]"); return el ? Number(el.dataset.idx) : null; };
    const mv = (ev) => { const i = at(ev); if (i != null) setOver(i); };
    const up = (ev) => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); const i = at(ev); setDrag(null); setOver(null); if (i != null) move(k, i); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const isDefault = isIdentity(order.map((id) => ids.indexOf(id))) && hidden.size === 0;
  const done = async (fn, okMsg) => { setBusy(okMsg); try { await fn(); onClose(); } catch (e) { setMsg(e?.code === "permission-denied" ? "권한이 없어 저장하지 못했어요" : `저장하지 못했어요 · ${e?.message || e}`); } finally { setBusy(""); } };
  const saveMine = () => done(() => (isDefault ? resetMyLayout(tkey) : saveMyLayout(tkey, order, [...hidden])), "save");
  const toDefault = () => { setOrder(ids); setHidden(new Set()); setMsg("기본 배치로 바꿨어요 · [내 화면에 저장]을 눌러야 저장돼요"); };
  const applyAll = async () => {
    const ok = await kpConfirm(`지금 배치를 회사 모든 계정에 적용할까요?\n\n· 보이는 칸 ${visibleN}개 · 숨긴 칸 ${hidden.size}개\n· 각자 바꿔 둔 배치도 이 배치로 바뀝니다\n· 적용 뒤에도 각자 다시 바꿀 수 있어요`, { title: "회사 전체 적용", okText: "전체 적용" });
    if (!ok) return;
    done(() => applyCompanyLayout(tkey, order, [...hidden]), "all");
  };
  const clearAll = async () => {
    const ok = await kpConfirm("회사 공통 배치를 해제할까요?\n따로 저장하지 않은 계정은 기본 배치로 돌아갑니다.", { title: "공통 배치 해제", okText: "해제" });
    if (!ok) return;
    setBusy("clear"); try { await clearCompanyLayout(tkey); setMsg("회사 공통 배치를 해제했어요"); } catch (e) { setMsg(e?.code === "permission-denied" ? "권한이 없어 해제하지 못했어요" : "해제하지 못했어요"); } finally { setBusy(""); }
  };
  const label = ids.filter((x) => x !== "(선택 칸)").slice(0, 3).join(" · ");
  const srcChip = cur?.src === "company" ? `회사 공통 배치 · ${cur.by || "관리자"} ${fmtAt(cur.at)}` : cur?.src === "mine" ? "내가 바꾼 배치" : "기본 배치";

  return createPortal(
    <div className="fixed inset-0 z-[2147483100] flex items-center justify-end bg-[#060C1A]/30 p-3" data-kp="col-layout" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[min(440px,96vw)] h-[min(94vh,860px)] flex flex-col rounded-[22px] bg-[#F4F6FA] shadow-[0_30px_80px_rgba(6,12,26,0.55)] overflow-hidden ring-1 ring-white/10">
        <div className="relative overflow-hidden px-5 pt-4 pb-4 text-white shrink-0" style={{ background: "radial-gradient(600px 220px at 85% -30%, rgba(110,149,232,.32), transparent 60%), linear-gradient(120deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px" }} />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#2D4C82,#0B1428)", border: "1px solid rgba(207,224,255,.3)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="5" height="16" rx="1.2" /><rect x="10" y="4" width="5" height="16" rx="1.2" /><path d="M19 8l2 2-2 2M21 10h-4" /></svg>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={NUM}>COLUMN LAYOUT</div>
              <div className="text-[18px] font-black tracking-tight">컬럼 수정</div>
              <div className="text-[11.5px] font-semibold text-white/55 truncate">{label}</div>
            </div>
            <button onClick={onClose} className="ml-auto h-8 px-3 rounded-xl bg-white/[0.08] border border-white/15 hover:bg-white/[0.16] text-[12px] font-black shrink-0">닫기</button>
          </div>
          <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
            <span className="h-6 px-2 inline-flex items-center rounded-md bg-white/[0.1] border border-white/15 text-[11.5px] font-black" data-kp="col-src">지금: {srcChip}</span>
            <span className="h-6 px-2 inline-flex items-center rounded-md bg-white text-[#0F1A30] text-[11.5px] font-black" style={NUM}>보임 {visibleN} · 숨김 {hidden.size}</span>
          </div>
        </div>

        <div className="px-4 pt-3 pb-1 text-[11.5px] font-semibold text-[#7A8AA6] shrink-0">끌어서 옮기거나 ▲▼ · 눈 모양을 누르면 숨김 · <b className="text-[#1B2B4B]">표에 바로 미리 보여요</b></div>
        <div className="flex-1 overflow-y-auto px-3 pb-3" data-kp="col-list">
          {order.map((id, k) => {
            const hid = hidden.has(id);
            return (
              <div key={id} data-idx={k}
                data-kp="col-item" data-col={id}
                className={`group mt-1.5 flex items-center gap-2 h-11 pl-2 pr-1.5 rounded-xl border bg-white transition select-none ${drag === k ? "opacity-40" : ""} ${over === k && drag != null && drag !== k ? "border-[#1B2B4B] shadow-[0_0_0_2px_rgba(27,43,75,.15)]" : "border-[#E3E8F0]"} ${hid ? "bg-[#F7F9FC]" : ""}`}>
                <span className="cursor-grab active:cursor-grabbing text-[#B4BFD0] group-hover:text-[#5B6B85] touch-none p-1 -m-1" title="끌어서 옮기기" data-kp="col-grip" onPointerDown={(e) => startDrag(e, k)}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg></span>
                <span className="w-6 text-[11px] font-black text-[#9AA9C3] text-right" style={NUM}>{String(k + 1).padStart(2, "0")}</span>
                <span className={`flex-1 min-w-0 truncate text-[13.5px] font-black ${hid ? "text-[#B4BFD0] line-through decoration-[#C9D2E0]" : "text-[#0F1A30]"}`}>{id}</span>
                <button type="button" onClick={() => move(k, k - 1)} disabled={k === 0} className="w-7 h-7 rounded-lg text-[11px] text-[#5B6B85] hover:bg-[#EEF2F8] disabled:opacity-25" title="앞으로" data-kp="col-up">▲</button>
                <button type="button" onClick={() => move(k, k + 1)} disabled={k === order.length - 1} className="w-7 h-7 rounded-lg text-[11px] text-[#5B6B85] hover:bg-[#EEF2F8] disabled:opacity-25" title="뒤로" data-kp="col-down">▼</button>
                <button type="button" onClick={() => toggle(id)} data-kp="col-eye"
                  className={`h-7 px-2 rounded-lg inline-flex items-center gap-1 text-[11.5px] font-black transition ${hid ? "bg-[#F1F4F9] text-[#7A879C]" : "bg-[#0F1A30] text-white"}`} title={hid ? "보이기" : "숨기기"}>
                  {hid
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4-.9" /></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.6" /></svg>}
                  {hid ? "숨김" : "보임"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mx-3 mb-3 rounded-2xl bg-white border border-[#E3E8F0] p-3 shrink-0" data-kp="col-company">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={NUM}>COMPANY</div>
              <div className="text-[13px] font-black text-[#0F1A30]">회사 전체 적용</div>
              <div className="text-[11.5px] text-[#7A8AA6] leading-snug">{comp ? `지금 공통: ${comp.byName || "관리자"} · ${fmtAt(comp.at)} 적용` : "누르면 이 배치가 회사 모든 계정에 한 번에 적용돼요"}</div>
            </div>
            <button type="button" onClick={applyAll} disabled={!!busy} data-kp="col-apply-all"
              className="shrink-0 h-9 px-3.5 rounded-xl bg-[#2D4C82] hover:bg-[#1B2B4B] text-white text-[12.5px] font-black disabled:opacity-40 shadow-[0_6px_14px_rgba(45,76,130,.28)]">{busy === "all" ? "적용 중…" : "전체 적용"}</button>
          </div>
          {comp && <button type="button" onClick={clearAll} disabled={!!busy} data-kp="col-clear-all" className="mt-2 text-[11.5px] font-black text-[#7A879C] hover:text-[#B42318] underline underline-offset-2">공통 배치 해제</button>}
          <div className="mt-1.5 text-[11px] text-[#9AA9C3] leading-snug">적용 뒤에도 각자 다시 바꿀 수 있고, 다시 [전체 적용]을 누르면 모두 이 배치로 돌아가요.</div>
        </div>

        {msg && <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-[#0F1A30] text-white text-[12px] font-bold shrink-0" data-kp="col-msg">{msg}</div>}
        <div className="px-4 py-3 border-t border-[#E3E8F0] bg-white flex items-center gap-2 shrink-0">
          <button type="button" onClick={toDefault} data-kp="col-default" className="h-10 px-3.5 rounded-xl border border-[#D5DDEA] text-[12.5px] font-black text-[#5B6B85] hover:text-[#0F1A30] hover:border-[#1B2B4B]">기본값으로</button>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="h-10 px-3.5 rounded-xl border border-[#D5DDEA] text-[12.5px] font-black text-[#5B6B85] hover:text-[#0F1A30]">취소</button>
            <button type="button" onClick={saveMine} disabled={!!busy} data-kp="col-save" className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black shadow-[0_6px_16px_rgba(15,26,48,.28)] hover:bg-[#1B2B4B] disabled:opacity-40">{busy === "save" ? "저장 중…" : "내 화면에 저장"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 오른쪽 클릭 메뉴에서 바로 — 이 칸 숨기기
export function hideOne(table, th) {
  const tkey = tableKey(table); const ids = colIds(origHeadCells(table));
  const i = Number(th.dataset.kpci ?? [...th.parentElement.cells].indexOf(th));
  const id = ids[i]; if (!id) return null;
  const l = layoutOf(tkey);
  const order = permOf(ids, l?.order).map((x) => ids[x]);
  const hidden = new Set(l?.hidden || []); hidden.add(id);
  if (hidden.size >= ids.length) return null;
  saveMyLayout(tkey, order, [...hidden]);
  return id;
}
export const hiddenCount = (table) => { const l = layoutOf(tableKey(table)); const ids = colIds(origHeadCells(table)); return (l?.hidden || []).filter((h) => ids.includes(h)).length; };
export const thColId = (table, th) => { const ids = colIds(origHeadCells(table)); const i = Number(th.dataset.kpci ?? [...th.parentElement.cells].indexOf(th)); return ids[i] || thText(th); };
