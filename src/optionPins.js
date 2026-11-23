// ======================= src/optionPins.js =======================
// 📌 2026-11-23 사용자 요청 — 지급방식 · 배차방식 목록에서 자주 쓰는 방식을 맨 위에 고정(최대 5개)
//  · 계정마다 따로(나만) · 다른 PC · 휴대폰에서도 같게 — 저장: 이 브라우저(localStorage) + 내 users 문서 optionPins.{목록}
//    (한 페이지 개수 pageSizePref.jsx 와 같은 방식)
//  · 회사 목록 순서는 그대로 두고, 보여 줄 때만 고정한 것을 위로 올린다(편집모드 목록 관리에는 영향 없음)
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";

export const PIN_KEYS = ["지급방식", "배차방식"];
export const PIN_MAX = 5;
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
const lsKey = (uid) => `kpOptionPins:${uid || "me"}`;

let _uid = "";
let _pins = {};
let _unsub = null;
const _subs = new Set();
const emit = () => _subs.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });
const normalize = (raw) => {
  const out = {};
  if (raw && typeof raw === "object") for (const k of PIN_KEYS) if (Array.isArray(raw[k])) out[k] = [...new Set(raw[k].map(clean).filter(Boolean))].slice(0, PIN_MAX);
  return out;
};
function ensure() {
  const uid = auth.currentUser?.uid || "";
  if (uid === _uid && (_unsub || !uid)) return;
  if (_unsub) { try { _unsub(); } catch { /* 무시 */ } _unsub = null; }
  _uid = uid;
  try { _pins = normalize(JSON.parse(localStorage.getItem(lsKey(uid)) || "{}")); } catch { _pins = {}; }
  emit();
  if (!uid) return;
  _unsub = onSnapshot(doc(db, "users", uid), (d) => {
    const v = d.data()?.optionPins;
    if (!v) return;
    _pins = normalize(v);
    try { localStorage.setItem(lsKey(uid), JSON.stringify(_pins)); } catch { /* 무시 */ }
    emit();
  }, () => {});
}
const subscribe = (fn) => { _subs.add(fn); ensure(); return () => _subs.delete(fn); };
const snapshot = () => _pins;

export const getPins = (key) => { ensure(); return _pins[key] || []; };
export function usePins(key) {
  const all = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return all[key] || [];
}

// 고정한 것을 위로(고정한 순서대로) — 목록에 없는 고정값은 건너뛴다
export function applyPins(list, pins) {
  if (!Array.isArray(list) || !pins?.length) return list;
  const set = new Set(list);
  const top = pins.filter((p) => set.has(p));
  if (!top.length) return list;
  const topSet = new Set(top);
  return [...top, ...list.filter((v) => !topSet.has(v))];
}

// 고정 켜기/끄기 → { ok, reason }
export async function togglePin(key, value) {
  ensure();
  const v = clean(value);
  if (!PIN_KEYS.includes(key) || !v) return { ok: false, reason: "고정할 수 없는 항목이에요" };
  const cur = _pins[key] || [];
  let next;
  if (cur.includes(v)) next = cur.filter((x) => x !== v);
  else if (cur.length >= PIN_MAX) return { ok: false, reason: `최대 ${PIN_MAX}개까지 고정할 수 있어요. 하나를 풀고 다시 눌러 주세요.` };
  else next = [...cur, v];
  _pins = { ..._pins, [key]: next };
  try { localStorage.setItem(lsKey(_uid), JSON.stringify(_pins)); } catch { /* 무시 */ }
  emit();
  if (_uid) { try { await setDoc(doc(db, "users", _uid), { optionPins: { [key]: next } }, { merge: true }); } catch { /* 이 기기에는 남는다 */ } }
  return { ok: true };
}
