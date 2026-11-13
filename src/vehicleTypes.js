// ======================= src/vehicleTypes.js =======================
// 🚚 2026-11-02 회사 공용 차량종류 목록
//  저장: vehicleTypes/{회사} = { companyName, custom:[이름…], updatedAt, updatedBy }
//  · 화면마다 원래 있던 기본 목록(카고·윙바디·탑차…)은 그대로 두고, 회사가 [＋ 차량종류 추가]로 넣은 이름을 모든 화면 목록에 덧붙인다
//    (기사관리에서 "암롤"을 추가하면 → 배차관리 등록·복사수정패널·실시간·배차현황·모바일·고정노선 어디든 바로 보인다)
//  · 같은 회사 문서는 onSnapshot 하나만(여러 화면이 같이 씀)
//  · 목록에 없는 값(예전에 직접 적은 값)도 그대로 표시·저장된다
import React from "react";
import { createPortal } from "react-dom";
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { getTenant } from "./fsTenant";
import { uiOptionList, uiOptionLabel, useUiConfigVersion } from "./uiConfig"; // ⭐ 2026-11-07 화면 편집 — 차량종류 기본 목록 · 보이는 이름
import { kpConfirm } from "./kpDialog";
import { isJyCompany } from "./jyOnly"; // 🏷 JY로지스틱스 전용 — 차량종류 칸에서 먼저 [톤수 | 차량종류] 고르기

// 🏷 2026-11-12 JY로지스틱스는 차종을 톤수로 적는다 — 톤수 쪽을 고르면 1톤부터 25톤까지
export const JY_TON_LIST = ["1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "5톤장축", "5톤축", "8톤", "11톤", "11톤장축", "11톤축", "15톤", "18톤", "25톤"];
export const hasTon = (v) => /\d+(\.\d+)?\s*(톤|t\b)/i.test(String(v || ""));
export const looksTon = (v) => /^\d+(\.\d+)?\s*톤/.test(String(v || "").trim());

// 프로그램 공통 기본 목록(화면에서 base를 따로 안 주면 이걸 쓴다)
export const VT_DEFAULTS = ["라보/다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이"];

const resolveCompany = (company) => {
  const c = String(company || "").trim();
  if (c) return c;
  try { return String(getTenant() || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; }
};
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 30);

// ── 회사별 구독 공유 ──
const EMPTY = Object.freeze({ loaded: false, custom: Object.freeze([]), hidden: Object.freeze([]) }); // ⭐ 2026-11-06 hidden — 회사가 지운 기본 차량종류
const stores = new Map();
function getStore(co) {
  let s = stores.get(co);
  if (!s) { s = { state: EMPTY, listeners: new Set(), unsub: null, timer: null }; stores.set(co, s); }
  return s;
}
function startStore(co, s) {
  if (s.unsub || !co) return;
  try {
    s.unsub = onSnapshot(doc(db, "vehicleTypes", co), (snap) => {
      // 🛠 2026-11-13 차량종류에는 차량종류만 — 톤수가 섞인 이름("11톤" · "5톤장축")은 목록에서 뺀다
      const list = snap.exists() && Array.isArray(snap.data().custom) ? snap.data().custom.map(clean).filter((v) => v && !hasTon(v)) : [];
      const hid = snap.exists() && Array.isArray(snap.data().hidden) ? snap.data().hidden.map(clean).filter(Boolean) : [];
      s.state = { loaded: true, custom: [...new Set(list)], hidden: [...new Set(hid)] };
      s.listeners.forEach((fn) => fn());
    }, () => { s.state = { loaded: true, custom: [], hidden: [] }; s.listeners.forEach((fn) => fn()); });
  } catch { s.state = { loaded: true, custom: [], hidden: [] }; }
}
function subscribeCo(co, cb) {
  if (!co) return () => {};
  const s = getStore(co);
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  s.listeners.add(cb);
  startStore(co, s);
  return () => {
    s.listeners.delete(cb);
    if (s.listeners.size === 0 && s.unsub) s.timer = setTimeout(() => {
      s.timer = null;
      if (s.listeners.size === 0 && s.unsub) { try { s.unsub(); } catch { /* 무시 */ } s.unsub = null; s.state = EMPTY; }
    }, 5000);
  };
}

// 기본 목록 + 회사 추가 목록(중복 제거, 기본 순서 유지 → 추가한 것은 뒤에)
// ⭐ 2026-11-06 hidden: 회사가 🗑로 지운 기본 차량종류(목록에서만 빠짐 · 저장된 값은 그대로)
export function mergeVehicleTypes(base = VT_DEFAULTS, custom = [], hidden = []) {
  const out = []; const seen = new Set(); const hid = new Set((hidden || []).map(clean));
  for (const v of [...uiOptionList("차량종류", base || []), ...(custom || [])]) { const c = clean(v); if (c && !seen.has(c) && !hid.has(c)) { seen.add(c); out.push(c); } }
  return out;
}
export function currentHiddenVehicleTypes(company) {
  const co = resolveCompany(company);
  return co ? (getStore(co).state.hidden || []) : [];
}
// 지금 회사의 추가 목록(구독 중일 때만 값이 있다 — 렌더 중 바로 읽는 곳용)
export function currentCustomVehicleTypes(company) {
  const co = resolveCompany(company);
  return co ? getStore(co).state.custom : [];
}
// 화면에서 기본 목록과 합친 목록 — 렌더 중 바로 읽기(위쪽 어딘가에서 useVehicleTypes가 구독하고 있어야 최신)
export const withCustomVehicleTypes = (base = VT_DEFAULTS, company) => mergeVehicleTypes(base, currentCustomVehicleTypes(company), currentHiddenVehicleTypes(company));

// { loaded, custom, all, company }
export function useVehicleTypes(company, base = VT_DEFAULTS) {
  const co = resolveCompany(company);
  const subscribe = React.useCallback((cb) => subscribeCo(co, cb), [co]);
  const getSnap = React.useCallback(() => (co ? getStore(co).state : EMPTY), [co]);
  const st = React.useSyncExternalStore(subscribe, getSnap, getSnap);
  const baseKey = (base || []).join("|");
  const uv = useUiConfigVersion();
  return React.useMemo(() => ({ loaded: st.loaded, custom: st.custom, hidden: st.hidden || [], all: mergeVehicleTypes(base, st.custom, st.hidden), company: co }), [st, baseKey, co, uv]); // eslint-disable-line react-hooks/exhaustive-deps
}

export async function addVehicleType(company, name) {
  const co = resolveCompany(company); const v = clean(name);
  if (!co) throw new Error("회사 정보를 찾지 못했습니다");
  if (!v) throw new Error("차량종류 이름을 입력해 주세요");
  const by = auth.currentUser?.uid || "";
  const s0 = getStore(co);
  const wasHidden = (s0.state.hidden || []).includes(v);
  // ⭐ 2026-11-06 지운 기본 차량종류를 다시 추가하면 숨김만 푼다
  await setDoc(doc(db, "vehicleTypes", co), { companyName: co, ...(wasHidden ? { hidden: arrayRemove(v) } : { custom: arrayUnion(v) }), updatedAt: Date.now(), updatedBy: by }, { merge: true });
  // 화면이 바로 보이게(서버 응답 전에도)
  const s = getStore(co);
  if (wasHidden) { s.state = { ...s.state, loaded: true, hidden: (s.state.hidden || []).filter((x) => x !== v) }; s.listeners.forEach((fn) => fn()); }
  else if (!s.state.custom.includes(v)) { s.state = { ...s.state, loaded: true, custom: [...s.state.custom, v] }; s.listeners.forEach((fn) => fn()); }
  return v;
}
// ⭐ 2026-11-06 회사 추가 항목은 목록에서 빼고, 기본 항목(base·VT_DEFAULTS)은 숨김 목록(hidden)에 넣는다 — 회사 공용
export async function removeVehicleType(company, name, base = VT_DEFAULTS) {
  const co = resolveCompany(company); const v = clean(name);
  if (!co || !v) return;
  const s = getStore(co);
  const isCustom = (s.state.custom || []).includes(v);
  const isBase = (base || []).map(clean).includes(v) || VT_DEFAULTS.includes(v);
  const hide = isBase || !isCustom;
  await setDoc(doc(db, "vehicleTypes", co), { companyName: co, ...(isCustom ? { custom: arrayRemove(v) } : {}), ...(hide ? { hidden: arrayUnion(v) } : {}), updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || "" }, { merge: true });
  s.state = { ...s.state, loaded: true, custom: (s.state.custom || []).filter((x) => x !== v), hidden: hide ? [...new Set([...(s.state.hidden || []), v])] : (s.state.hidden || []) };
  s.listeners.forEach((fn) => fn());
}
// 지운 기본 차량종류 되살리기
export async function restoreVehicleType(company, name) {
  const co = resolveCompany(company); const v = clean(name);
  if (!co || !v) return;
  await setDoc(doc(db, "vehicleTypes", co), { companyName: co, hidden: arrayRemove(v), updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || "" }, { merge: true });
  const s = getStore(co);
  s.state = { ...s.state, hidden: (s.state.hidden || []).filter((x) => x !== v) };
  s.listeners.forEach((fn) => fn());
}
const trashSvg = () => React.createElement("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, React.createElement("path", { d: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" }));

// ───────────────────────── 화면 부품 ─────────────────────────
const h = React.createElement;
const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const chev = (open) => h("svg", { width: 10, height: 10, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", opacity: 0.8 }, "aria-hidden": true }, h("path", { d: "M6 9l6 6 6-6" }));

// 🚚 차량종류 선택 — 버튼(원래 칸 모양 그대로 className/style) + 떠 있는 목록(검색 · ↑↓ Enter · ＋ 차량종류 추가)
//  onChange(값) — 값은 글자. 빈 글자 = 선택 안 함
export function VehicleTypePicker({ value, onChange, base = VT_DEFAULTS, company, className = "", style, disabled = false, placeholder = "선택", noneLabel, allowAdd = true, id, align = "left", buttonProps = {}, onTon, ton = "" }) {
  // 🏷 onTon(톤수) · ton(지금 톤수): JY로지스틱스에서 [톤수] 쪽을 고르면 차량종류가 아니라 톤수 칸에 저장한다(이 둘을 넘긴 화면에서만 톤수 고르기가 보인다)
  const vt = useVehicleTypes(company, base);
  const cur = clean(value);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [act, setAct] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const btn = React.useRef(null);
  const menu = React.useRef(null);
  const searchRef = React.useRef(null);
  const addRef = React.useRef(null);

  const jy = false && typeof onTon === "function" && isJyCompany(company); // 🛠 2026-11-13 사용자 요청 — 차량종류 칸에는 차량종류만(톤수 고르기 뺌 · 톤수는 톤수 칸에서)
  const [mode, setMode] = React.useState("ton"); // JY만: "ton"(톤수) | "type"(차량종류)
  const list = jy && mode === "ton" ? JY_TON_LIST : vt.all;
  const canEdit = allowAdd && !(jy && mode === "ton"); // 톤수 목록은 고정(추가 · 삭제 없음)
  const nq = q.replace(/\s/g, "").toLowerCase();
  const filtered = nq ? list.filter((v) => v.replace(/\s/g, "").toLowerCase().includes(nq)) : list;
  const opts = [...(nq ? [] : [{ v: "", none: true }]), ...(cur && !list.includes(cur) && !nq ? [{ v: cur, legacy: true }] : []), ...filtered.map((v) => ({ v, custom: vt.custom.includes(v) && !(base || []).includes(v) }))];
  const exact = nq && list.some((v) => v.replace(/\s/g, "").toLowerCase() === nq);

  const place = React.useCallback(() => {
    const el = btn.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(r.width, 272);
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const up = below < 300 && above > below; // 아래 자리가 모자라면 위로 연다
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width: w, maxH: above } : { left, top: r.bottom + 6, width: w, maxH: below });
  }, [align]);
  const openIt = () => {
    if (disabled) return;
    place(); setQ(""); setAdding(false); setErr("");
    if (jy) setMode(!cur ? "ton" : "type"); // 차량종류가 비어 있으면 톤수 쪽부터
    const i = Math.max(0, [{ v: "" }, ...(cur && !list.includes(cur) ? [{ v: cur }] : []), ...list.map((v) => ({ v }))].findIndex((o) => o.v === cur));
    setAct(i); setOpen(true);
    // 휴대폰은 자판이 바로 올라오지 않게(찾기 칸을 누르면 그때)
    let touch = false; try { touch = window.matchMedia("(pointer: coarse)").matches; } catch { /* 무시 */ }
    setTimeout(() => (touch ? menu.current : searchRef.current)?.focus?.(), 20);
  };
  const close = (refocus = true) => { setOpen(false); setAdding(false); if (refocus) setTimeout(() => btn.current?.focus(), 0); };
  const pick = (v) => { close(); if (jy && mode === "ton") { if (v !== clean(ton)) onTon(v); return; } if (v !== cur) onChange?.(v); };
  const doAdd = async (name) => {
    const v = clean(name);
    if (!v) { setErr("이름을 입력해 주세요"); return; }
    if (hasTon(v)) { setErr("톤수는 톤수 칸에 적어 주세요(차량종류만)"); return; }
    if (list.includes(v)) { pick(v); return; }
    setBusy(true); setErr("");
    try { await addVehicleType(vt.company, v); pick(v); setNewName(""); } catch (e) { setErr(e?.message?.includes("permission") ? "추가 권한이 없습니다" : (e?.message || "추가하지 못했습니다")); } finally { setBusy(false); }
  };
  const doRemove = async (v) => {
    if (!(await kpConfirm(`'${v}' 차량종류를 회사 목록에서 삭제할까요?\n회사의 모든 화면(PC·모바일) 목록에서 빠집니다. 이미 저장된 오더·기사 정보는 그대로예요.`))) return;
    setBusy(true); setErr("");
    try { await removeVehicleType(vt.company, v, base); } catch (e) { setErr(e?.message?.includes("permission") ? "삭제 권한이 없습니다" : (e?.message || "삭제하지 못했습니다")); setAdding(true); } finally { setBusy(false); }
  };
  React.useEffect(() => { if (act >= opts.length) setAct(Math.max(0, opts.length - 1)); }, [opts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (btn.current?.contains(e.target) || menu.current?.contains(e.target)) return; close(false); };
    const re = (e) => { if (menu.current?.contains(e.target)) return; close(false); };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("touchstart", down, true);
    window.addEventListener("scroll", re, true);
    window.addEventListener("resize", re);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("touchstart", down, true); window.removeEventListener("scroll", re, true); window.removeEventListener("resize", re); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!open || !menu.current) return;
    const el = menu.current.querySelector(`[data-vt-idx="${act}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [act, open]);

  const onBtnKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); openIt(); }
  };
  const onSearchKey = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { close(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAct((i) => Math.min(opts.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setAct((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (opts[act]) pick(opts[act].v);
      else if (nq && allowAdd) doAdd(q);
    }
  };

  const label = cur ? uiOptionLabel("차량종류", cur) : (jy && clean(ton) ? clean(ton) : placeholder);
  const btnEl = h("button", {
    ...buttonProps,
    id, ref: btn, type: "button", disabled,
    "data-vt-picker": "1", "data-value": cur,
    "aria-haspopup": "listbox", "aria-expanded": open,
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); open ? close() : openIt(); },
    onKeyDown: onBtnKey,
    className: `${className} text-left disabled:cursor-not-allowed`,
    style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, ...(style || {}) },
    title: cur ? `차량종류: ${cur}` : "차량종류 선택",
  }, h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, opacity: cur || (jy && clean(ton)) ? 1 : 0.55 } }, label), chev(open));

  if (!open || !pos) return btnEl;
  const row = (o, i) => {
    const sel = jy && mode === "ton" ? o.v === clean(ton) : o.v === cur;
    return h("div", {
      key: `${o.v}_${i}`, role: "option", "aria-selected": sel, "data-vt-idx": i,
      onMouseEnter: () => setAct(i), onMouseDown: (e) => e.preventDefault(), onClick: () => pick(o.v),
      style: { display: "flex", alignItems: "center", gap: 10, height: 38, margin: "0 6px", padding: "0 10px", borderRadius: 10, cursor: "pointer", userSelect: "none", background: i === act ? "#EEF3FC" : "transparent" },
    },
    h("span", { style: { width: 15, height: 15, borderRadius: 999, flexShrink: 0, display: "grid", placeItems: "center", border: `2px solid ${sel ? "#1B2B4B" : "#C9D5EA"}`, background: sel ? "#1B2B4B" : "#fff" } }, sel ? h("span", { style: { width: 5, height: 5, borderRadius: 999, background: "#fff" } }) : null),
    h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14.5, fontWeight: o.none ? 700 : 800, color: o.none ? "#8E9BB2" : "#0F1A30" } }, o.none ? (noneLabel || "선택 안 함") : uiOptionLabel("차량종류", o.v)),
    // ⭐ 2026-11-02 "회사"만 작게 써 있어 안 보인다는 의견 — 일반 글꼴·큰 글씨로 "회사 추가"
    o.custom ? h("span", { title: "우리 회사에서 추가한 차량종류", style: { flexShrink: 0, fontSize: 12, fontWeight: 800, lineHeight: "20px", padding: "0 8px", borderRadius: 999, background: "#EEF3FC", border: "1px solid #C9D5EA", color: "#1B2B4B", whiteSpace: "nowrap" } }, "회사 추가") : null,
    o.legacy ? h("span", { style: { fontSize: 12, fontWeight: 800, color: "#B54708" } }, "직접 입력값") : null,
    // ⭐ 2026-11-06 🗑 항목 삭제(회사 공용 · 기본 항목도) — 확인 후
    canEdit && !o.none && !o.legacy ? h("button", {
      type: "button", title: `${o.v} 삭제`, "aria-label": `${o.v} 삭제`, "data-vt-del": "1", disabled: busy,
      onMouseDown: (e) => { e.preventDefault(); e.stopPropagation(); },
      onClick: (e) => { e.preventDefault(); e.stopPropagation(); doRemove(o.v); },
      onMouseEnter: (e) => { e.currentTarget.style.background = "#FFF1EE"; e.currentTarget.style.color = "#B42318"; },
      onMouseLeave: (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9AA9C3"; },
      style: { flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", color: "#9AA9C3", cursor: "pointer", display: "grid", placeItems: "center" },
    }, trashSvg()) : null);
  };
  const menuEl = h("div", {
    ref: menu, role: "listbox", "data-vt-menu": "1", tabIndex: -1, onKeyDownCapture: (e) => { if (e.target === menu.current) onSearchKey(e); },
    onMouseDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(), onKeyDown: (e) => e.stopPropagation(),
    style: { position: "fixed", outline: "none", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 2147483000, background: "#fff", border: "1px solid #E3E8F0", borderRadius: 16, boxShadow: "0 18px 44px rgba(15,26,48,0.22)", overflow: "hidden", fontFamily: "'Pretendard','Noto Sans KR',sans-serif", display: "flex", flexDirection: "column", maxHeight: Math.max(200, Math.min(400, pos.maxH || 400)) },
  },
  h("div", { style: { padding: "10px 12px 8px", background: "#F7F9FC", borderBottom: "1px solid #EEF2F7" } },
    // 🏷 JY로지스틱스만 — 먼저 [톤수 | 차량종류]를 고른다(배차방식의 IN/OUT처럼)
    jy ? h("div", { "data-vt-mode": mode, style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 3, marginBottom: 8, borderRadius: 11, background: "#fff", border: "1px solid #DCE3EE" } },
      [["ton", "톤수"], ["type", "차량종류"]].map(([k, l]) => h("button", {
        key: k, type: "button", onMouseDown: (e) => e.preventDefault(), onClick: (e) => { e.preventDefault(); e.stopPropagation(); setMode(k); setQ(""); setAct(0); setAdding(false); },
        style: { height: 32, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 900, background: mode === k ? "#0F1A30" : "transparent", color: mode === k ? "#fff" : "#3A4A66" },
      }, l))) : null,
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 } },
      // ⭐ 2026-11-02 글씨가 눌려 안 보인다는 의견 — 한글 제목은 일반 글꼴·큰 글씨, 영문 꼬리표만 작게
      h("span", { style: { display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" } },
        h("span", { style: { fontSize: 14, fontWeight: 900, color: "#0F1A30" } }, "차량종류"),
        h("span", { style: { fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", color: "#4B6CB7" } }, "VEHICLE TYPE")),
      h("span", { style: { fontSize: 12, fontWeight: 700, color: "#8E9BB2", whiteSpace: "nowrap" } }, "↑↓ · Enter")),
    h("input", {
      ref: searchRef, value: q, placeholder: "찾기 (예: 냉동)", autoComplete: "off",
      onChange: (e) => { setQ(e.target.value); setAct(0); }, onKeyDown: onSearchKey,
      style: { width: "100%", height: 34, borderRadius: 10, border: "1px solid #DCE3EE", padding: "0 10px", fontSize: 14.5, fontWeight: 700, color: "#0F1A30", outline: "none", background: "#fff", boxSizing: "border-box" },
    })),
  h("div", { style: { overflowY: "auto", padding: "4px 0", flex: 1, minHeight: 0 } },
    opts.length ? opts.map(row) : h("div", { style: { padding: "14px 16px", fontSize: 13.5, fontWeight: 700, color: "#9AA9C3" } }, "찾는 차량종류가 없습니다"),
    nq && !exact && canEdit ? h("div", {
      onMouseDown: (e) => e.preventDefault(), onClick: () => doAdd(q),
      style: { margin: "4px 6px 2px", padding: "0 10px", height: 38, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: "#FFF8E6", color: "#7A5300", fontSize: 14, fontWeight: 900 },
    }, "＋", h("span", null, `“${clean(q)}” 차량종류로 추가하고 선택`)) : null),
  canEdit ? h("div", { style: { borderTop: "1px solid #EEF2F7", padding: 8, background: "#FBFCFE" } },
    adding
      ? h("div", null,
        h("div", { style: { display: "flex", gap: 6 } },
          h("input", {
            ref: addRef, value: newName, autoFocus: true, placeholder: "새 차량종류 (예: 암롤)", maxLength: 30, autoComplete: "off",
            onChange: (e) => { setNewName(e.target.value); setErr(""); },
            onKeyDown: (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); doAdd(newName); } if (e.key === "Escape") { e.preventDefault(); setAdding(false); setTimeout(() => searchRef.current?.focus(), 0); } },
            style: { flex: 1, minWidth: 0, height: 36, borderRadius: 10, border: "1.5px solid #1B2B4B", padding: "0 10px", fontSize: 14.5, fontWeight: 800, color: "#0F1A30", outline: "none", boxSizing: "border-box" },
          }),
          h("button", { type: "button", disabled: busy, onClick: () => doAdd(newName), style: { height: 36, padding: "0 14px", borderRadius: 10, border: "none", background: "#1B2B4B", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", opacity: busy ? 0.6 : 1 } }, busy ? "추가 중" : "추가")),
        h("div", { style: { fontSize: 12, fontWeight: 700, color: err ? "#C0352B" : "#8E9BB2", marginTop: 5, paddingLeft: 2 } }, err || "추가하면 회사의 모든 화면(PC·모바일) 차량종류 목록에 나옵니다"))
      : h("button", {
        type: "button", "data-vt-add": "1",
        onClick: () => { setAdding(true); setNewName(clean(q)); setErr(""); },
        style: { width: "100%", height: 36, borderRadius: 10, border: "1.5px dashed #9FB2D3", background: "#fff", color: "#1B2B4B", fontSize: 14, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
      }, h("span", { style: { fontSize: 15, lineHeight: 1 } }, "＋"), "차량종류 추가")) : null);
  return h(React.Fragment, null, btnEl, createPortal(menuEl, document.body));
}

// ＋ 차량종류 추가·관리 창 — 버튼이 사라져도(자동완성 목록이 닫혀도) 창은 남도록 따로 띄운다
function VehicleTypeDialog({ company, initial = "", onAdded, onClose }) {
  const vt = useVehicleTypes(company);
  const [name, setName] = React.useState(clean(initial));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const submit = async () => {
    const v = clean(name);
    if (!v) { setErr("이름을 입력해 주세요"); return; }
    setBusy(true); setErr("");
    try { await addVehicleType(vt.company, v); setName(""); onAdded?.(v); onClose(); } catch (e) { setErr(e?.message?.includes("permission") ? "추가 권한이 없습니다" : (e?.message || "추가하지 못했습니다")); } finally { setBusy(false); }
  };
  const del = async (v) => {
    if (!(await kpConfirm(`"${v}" 차량종류를 회사 목록에서 뺄까요?\n(이미 저장된 오더·기사 정보는 그대로입니다)`))) return;
    try { await removeVehicleType(vt.company, v, VT_DEFAULTS); } catch (e) { setErr(e?.message || "삭제하지 못했습니다"); }
  };
  return h("div", {
    "data-kp-dialog": "1", "data-vt-dialog": "1",
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose(); },
    style: { position: "fixed", inset: 0, zIndex: 2147483200, background: "rgba(8,14,30,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Pretendard','Noto Sans KR',sans-serif" },
  },
  h("div", { role: "dialog", "aria-modal": "true", onMouseDown: (e) => e.stopPropagation(), style: { width: "min(420px,100%)", borderRadius: 20, background: "#fff", overflow: "hidden", boxShadow: "0 30px 80px rgba(8,14,30,.45)" } },
    h("div", { style: { padding: "18px 20px 16px", color: "#fff", background: "radial-gradient(120% 120% at 0% 0%,#2D4C82 0%,#1B2B4B 50%,#0B1428 100%)" } },
      h("div", { style: { fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 900, letterSpacing: "0.22em", color: "#8FB0F0" } }, "VEHICLE TYPE"),
      h("div", { style: { fontSize: 17, fontWeight: 900, marginTop: 3 } }, "차량종류 추가 · 관리"),
      h("div", { style: { fontSize: 13, fontWeight: 600, color: "#C9D6EE", marginTop: 3 } }, "추가하면 회사의 모든 화면(PC·모바일) 차량종류 목록에 나옵니다")),
    h("div", { style: { padding: "16px 20px 6px" } },
      h("div", { style: { display: "flex", gap: 8 } },
        h("input", {
          autoFocus: true, value: name, placeholder: "예: 암롤, 셀프로더", maxLength: 30, autoComplete: "off",
          onChange: (e) => { setName(e.target.value); setErr(""); },
          onKeyDown: (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") { e.preventDefault(); onClose(); } },
          style: { flex: 1, minWidth: 0, height: 44, borderRadius: 12, border: "1.5px solid #1B2B4B", padding: "0 12px", fontSize: 15, fontWeight: 800, color: "#0F1A30", outline: "none", boxSizing: "border-box" },
        }),
        h("button", { type: "button", disabled: busy, onClick: submit, style: { height: 44, padding: "0 18px", borderRadius: 12, border: "none", background: "#1B2B4B", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", opacity: busy ? 0.6 : 1 } }, busy ? "추가 중" : "추가")),
      err ? h("div", { style: { fontSize: 13, fontWeight: 800, color: "#C0352B", marginTop: 6 } }, err) : null,
      // ⭐ 2026-11-06 기본 항목까지 모두 🗑로 지울 수 있다(회사 공용) · 지운 기본 항목은 아래에서 되살리기
      h("div", { style: { marginTop: 14, fontSize: 12.5, fontWeight: 900, color: "#5B6B85", letterSpacing: "0.04em" } }, `회사 차량종류 목록 ${vt.all.length}개`),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, maxHeight: 170, overflowY: "auto" } },
        vt.all.length ? vt.all.map((v) => h("span", { key: v, style: { display: "inline-flex", alignItems: "center", gap: 2, height: 30, padding: "0 2px 0 10px", borderRadius: 8, border: "1px solid #C9D5EA", background: vt.custom.includes(v) ? "#EEF3FC" : "#F7F9FC", fontSize: 13.5, fontWeight: 800, color: "#0F1A30" } },
          v, h("button", { type: "button", onClick: () => del(v), title: "목록에서 삭제", "data-vt-del": "1", style: { width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", color: "#9AA9C3", cursor: "pointer", display: "grid", placeItems: "center" } }, trashSvg())))
          : h("span", { style: { fontSize: 13, fontWeight: 700, color: "#9AA9C3" } }, "아직 없습니다 — 위에서 추가해 보세요")),
      (vt.hidden || []).length ? h("div", { style: { marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#7A8AA6", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } },
        h("span", null, "지운 기본 항목:"),
        ...(vt.hidden || []).map((v) => h("button", { key: v, type: "button", onClick: () => restoreVehicleType(vt.company, v).catch(() => {}), title: "되살리기", style: { height: 26, padding: "0 8px", borderRadius: 7, border: "1px dashed #9FB2D3", background: "#fff", color: "#2D4C82", fontSize: 12.5, fontWeight: 800, cursor: "pointer" } }, `↺ ${v}`))) : null),
    h("div", { style: { padding: "14px 20px 18px", display: "flex", justifyContent: "flex-end" } },
      h("button", { type: "button", onClick: onClose, style: { height: 38, padding: "0 16px", borderRadius: 10, border: "1px solid #DCE3EE", background: "#fff", color: "#3A4A66", fontSize: 14, fontWeight: 900, cursor: "pointer" } }, "닫기"))));
}
let dialogRoot = null;
export function openVehicleTypeDialog({ company, initial = "", onAdded } = {}) {
  import("react-dom/client").then(({ createRoot }) => {
    let host = document.getElementById("kp-vt-dialog-host");
    if (!host) { host = document.createElement("div"); host.id = "kp-vt-dialog-host"; document.body.appendChild(host); }
    if (!dialogRoot) dialogRoot = createRoot(host);
    const close = () => dialogRoot.render(null);
    dialogRoot.render(h(VehicleTypeDialog, { key: Date.now(), company, initial, onAdded, onClose: close }));
  });
}

// ＋ 차량종류 추가 버튼(글자 입력형 칸 옆·목록 아래에 붙인다)
export function VehicleTypeAddButton({ company, onAdded, className = "", label = "＋ 추가", initial = "" }) {
  return h("button", {
    type: "button", tabIndex: -1, "data-vt-addbtn": "1",
    onMouseDown: (e) => e.preventDefault(),
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); openVehicleTypeDialog({ company, initial, onAdded }); },
    className: className || "text-[11px] font-bold px-1.5 py-0.5 rounded-lg bg-white border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white transition whitespace-nowrap shrink-0",
    title: "회사 공용 차량종류 추가 — 모든 화면 목록에 나옵니다",
  }, label);
}
