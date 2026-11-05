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

// 프로그램 공통 기본 목록(화면에서 base를 따로 안 주면 이걸 쓴다)
export const VT_DEFAULTS = ["라보/다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이"];

const resolveCompany = (company) => {
  const c = String(company || "").trim();
  if (c) return c;
  try { return String(getTenant() || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; }
};
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 30);

// ── 회사별 구독 공유 ──
const EMPTY = Object.freeze({ loaded: false, custom: Object.freeze([]) });
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
      const list = snap.exists() && Array.isArray(snap.data().custom) ? snap.data().custom.map(clean).filter(Boolean) : [];
      s.state = { loaded: true, custom: [...new Set(list)] };
      s.listeners.forEach((fn) => fn());
    }, () => { s.state = { loaded: true, custom: [] }; s.listeners.forEach((fn) => fn()); });
  } catch { s.state = { loaded: true, custom: [] }; }
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
export function mergeVehicleTypes(base = VT_DEFAULTS, custom = []) {
  const out = []; const seen = new Set();
  for (const v of [...(base || []), ...(custom || [])]) { const c = clean(v); if (c && !seen.has(c)) { seen.add(c); out.push(c); } }
  return out;
}
// 지금 회사의 추가 목록(구독 중일 때만 값이 있다 — 렌더 중 바로 읽는 곳용)
export function currentCustomVehicleTypes(company) {
  const co = resolveCompany(company);
  return co ? getStore(co).state.custom : [];
}
// 화면에서 기본 목록과 합친 목록 — 렌더 중 바로 읽기(위쪽 어딘가에서 useVehicleTypes가 구독하고 있어야 최신)
export const withCustomVehicleTypes = (base = VT_DEFAULTS, company) => mergeVehicleTypes(base, currentCustomVehicleTypes(company));

// { loaded, custom, all, company }
export function useVehicleTypes(company, base = VT_DEFAULTS) {
  const co = resolveCompany(company);
  const subscribe = React.useCallback((cb) => subscribeCo(co, cb), [co]);
  const getSnap = React.useCallback(() => (co ? getStore(co).state : EMPTY), [co]);
  const st = React.useSyncExternalStore(subscribe, getSnap, getSnap);
  const baseKey = (base || []).join("|");
  return React.useMemo(() => ({ loaded: st.loaded, custom: st.custom, all: mergeVehicleTypes(base, st.custom), company: co }), [st, baseKey, co]); // eslint-disable-line react-hooks/exhaustive-deps
}

export async function addVehicleType(company, name) {
  const co = resolveCompany(company); const v = clean(name);
  if (!co) throw new Error("회사 정보를 찾지 못했습니다");
  if (!v) throw new Error("차량종류 이름을 입력해 주세요");
  const by = auth.currentUser?.uid || "";
  await setDoc(doc(db, "vehicleTypes", co), { companyName: co, custom: arrayUnion(v), updatedAt: Date.now(), updatedBy: by }, { merge: true });
  // 화면이 바로 보이게(서버 응답 전에도)
  const s = getStore(co);
  if (!s.state.custom.includes(v)) { s.state = { loaded: true, custom: [...s.state.custom, v] }; s.listeners.forEach((fn) => fn()); }
  return v;
}
export async function removeVehicleType(company, name) {
  const co = resolveCompany(company); const v = clean(name);
  if (!co || !v) return;
  await setDoc(doc(db, "vehicleTypes", co), { companyName: co, custom: arrayRemove(v), updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || "" }, { merge: true });
}

// ───────────────────────── 화면 부품 ─────────────────────────
const h = React.createElement;
const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const chev = (open) => h("svg", { width: 10, height: 10, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round", style: { flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", opacity: 0.8 }, "aria-hidden": true }, h("path", { d: "M6 9l6 6 6-6" }));

// 🚚 차량종류 선택 — 버튼(원래 칸 모양 그대로 className/style) + 떠 있는 목록(검색 · ↑↓ Enter · ＋ 차량종류 추가)
//  onChange(값) — 값은 글자. 빈 글자 = 선택 안 함
export function VehicleTypePicker({ value, onChange, base = VT_DEFAULTS, company, className = "", style, disabled = false, placeholder = "선택", noneLabel, allowAdd = true, id, align = "left", buttonProps = {} }) {
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

  const list = vt.all;
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
    const i = Math.max(0, [{ v: "" }, ...(cur && !list.includes(cur) ? [{ v: cur }] : []), ...list.map((v) => ({ v }))].findIndex((o) => o.v === cur));
    setAct(i); setOpen(true);
    // 휴대폰은 자판이 바로 올라오지 않게(찾기 칸을 누르면 그때)
    let touch = false; try { touch = window.matchMedia("(pointer: coarse)").matches; } catch { /* 무시 */ }
    setTimeout(() => (touch ? menu.current : searchRef.current)?.focus?.(), 20);
  };
  const close = (refocus = true) => { setOpen(false); setAdding(false); if (refocus) setTimeout(() => btn.current?.focus(), 0); };
  const pick = (v) => { close(); if (v !== cur) onChange?.(v); };
  const doAdd = async (name) => {
    const v = clean(name);
    if (!v) { setErr("이름을 입력해 주세요"); return; }
    if (list.includes(v)) { pick(v); return; }
    setBusy(true); setErr("");
    try { await addVehicleType(vt.company, v); pick(v); setNewName(""); } catch (e) { setErr(e?.message?.includes("permission") ? "추가 권한이 없습니다" : (e?.message || "추가하지 못했습니다")); } finally { setBusy(false); }
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

  const label = cur || placeholder;
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
  }, h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, opacity: cur ? 1 : 0.55 } }, label), chev(open));

  if (!open || !pos) return btnEl;
  const row = (o, i) => {
    const sel = o.v === cur;
    return h("div", {
      key: `${o.v}_${i}`, role: "option", "aria-selected": sel, "data-vt-idx": i,
      onMouseEnter: () => setAct(i), onMouseDown: (e) => e.preventDefault(), onClick: () => pick(o.v),
      style: { display: "flex", alignItems: "center", gap: 10, height: 38, margin: "0 6px", padding: "0 10px", borderRadius: 10, cursor: "pointer", userSelect: "none", background: i === act ? "#EEF3FC" : "transparent" },
    },
    h("span", { style: { width: 15, height: 15, borderRadius: 999, flexShrink: 0, display: "grid", placeItems: "center", border: `2px solid ${sel ? "#1B2B4B" : "#C9D5EA"}`, background: sel ? "#1B2B4B" : "#fff" } }, sel ? h("span", { style: { width: 5, height: 5, borderRadius: 999, background: "#fff" } }) : null),
    h("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14.5, fontWeight: o.none ? 700 : 800, color: o.none ? "#8E9BB2" : "#0F1A30" } }, o.none ? (noneLabel || "선택 안 함") : o.v),
    // ⭐ 2026-11-02 "회사"만 작게 써 있어 안 보인다는 의견 — 일반 글꼴·큰 글씨로 "회사 추가"
    o.custom ? h("span", { title: "우리 회사에서 추가한 차량종류", style: { flexShrink: 0, fontSize: 12, fontWeight: 800, lineHeight: "20px", padding: "0 8px", borderRadius: 999, background: "#EEF3FC", border: "1px solid #C9D5EA", color: "#1B2B4B", whiteSpace: "nowrap" } }, "회사 추가") : null,
    o.legacy ? h("span", { style: { fontSize: 12, fontWeight: 800, color: "#B54708" } }, "직접 입력값") : null);
  };
  const menuEl = h("div", {
    ref: menu, role: "listbox", "data-vt-menu": "1", tabIndex: -1, onKeyDownCapture: (e) => { if (e.target === menu.current) onSearchKey(e); },
    onMouseDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(), onKeyDown: (e) => e.stopPropagation(),
    style: { position: "fixed", outline: "none", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 2147483000, background: "#fff", border: "1px solid #E3E8F0", borderRadius: 16, boxShadow: "0 18px 44px rgba(15,26,48,0.22)", overflow: "hidden", fontFamily: "'Pretendard','Noto Sans KR',sans-serif", display: "flex", flexDirection: "column", maxHeight: Math.max(200, Math.min(400, pos.maxH || 400)) },
  },
  h("div", { style: { padding: "10px 12px 8px", background: "#F7F9FC", borderBottom: "1px solid #EEF2F7" } },
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
    nq && !exact && allowAdd ? h("div", {
      onMouseDown: (e) => e.preventDefault(), onClick: () => doAdd(q),
      style: { margin: "4px 6px 2px", padding: "0 10px", height: 38, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: "#FFF8E6", color: "#7A5300", fontSize: 14, fontWeight: 900 },
    }, "＋", h("span", null, `“${clean(q)}” 차량종류로 추가하고 선택`)) : null),
  allowAdd ? h("div", { style: { borderTop: "1px solid #EEF2F7", padding: 8, background: "#FBFCFE" } },
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
    if (!window.confirm(`"${v}" 차량종류를 회사 목록에서 뺄까요?\n(이미 저장된 오더·기사 정보는 그대로입니다)`)) return;
    try { await removeVehicleType(vt.company, v); } catch (e) { setErr(e?.message || "삭제하지 못했습니다"); }
  };
  return h("div", {
    "data-kp-dialog": "1", "data-vt-dialog": "1",
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose(); },
    style: { position: "fixed", inset: 0, zIndex: 2147483200, background: "rgba(8,14,30,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Pretendard','Noto Sans KR',sans-serif" },
  },
  h("div", { role: "dialog", "aria-modal": "true", onMouseDown: (e) => e.stopPropagation(), style: { width: "min(420px,100%)", borderRadius: 20, background: "#fff", overflow: "hidden", boxShadow: "0 30px 80px rgba(8,14,30,.45)" } },
    h("div", { style: { padding: "18px 20px 16px", color: "#fff", background: "radial-gradient(120% 120% at 0% 0%,#2D4C82 0%,#1B2B4B 50%,#0B1428 100%)" } },
      h("div", { style: { fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 900, letterSpacing: "0.22em", color: "#8FB0F0" } }, "VEHICLE TYPE"),
      h("div", { style: { fontSize: 17, fontWeight: 900, marginTop: 3 } }, "차량종류 추가"),
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
      h("div", { style: { marginTop: 14, fontSize: 12.5, fontWeight: 900, color: "#5B6B85", letterSpacing: "0.04em" } }, `회사에서 추가한 차량종류 ${vt.custom.length}개`),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, maxHeight: 150, overflowY: "auto" } },
        vt.custom.length ? vt.custom.map((v) => h("span", { key: v, style: { display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 4px 0 10px", borderRadius: 8, border: "1px solid #C9D5EA", background: "#F7F9FC", fontSize: 13.5, fontWeight: 800, color: "#0F1A30" } },
          v, h("button", { type: "button", onClick: () => del(v), title: "목록에서 빼기", style: { width: 20, height: 20, borderRadius: 6, border: "none", background: "transparent", color: "#9AA9C3", cursor: "pointer", fontSize: 12, fontWeight: 900 } }, "✕")))
          : h("span", { style: { fontSize: 13, fontWeight: 700, color: "#9AA9C3" } }, "아직 없습니다 — 위에서 추가해 보세요"))),
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
