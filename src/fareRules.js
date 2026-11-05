// ======================= src/fareRules.js =======================
// ⭐ 2026-11-02 운임규칙 — 회사별 "운임 규칙"(일대·월대 등 운임구분별 수수료 계산)
//
//  저장: fareRules/{회사} = { companyName, enabled, rules:[{ id, name, type:"percent"|"fixed", value, active, memo }],
//         history:[{ at, by, change }], updatedAt, updatedBy }
//  · 회사가 "운임 규칙 사용"(enabled)을 켠 경우에만 오더 입력/수정 화면에 "운임구분" 칸이 나타난다.
//    (끈 회사는 화면이 예전과 완전히 같다)
//  · 계산: 수수료 = 퍼센트 ? 청구×값/100(원 단위 반올림) : 값 · 기사운임 = 청구 − 수수료
//  · 오더 필드: 운임구분(규칙 이름) · 운임수동(true면 기사운임을 사람이 직접 고친 것 → 자동 계산하지 않음)
//  · 규칙을 바꿔도 이미 저장된 오더는 다시 계산하지 않는다(새로 수정하거나 [↺ 규칙대로]를 누를 때만)
import React from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot, setDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getTenant } from "./fsTenant";
import { useCompanyFeatures } from "./companyFeatures";

const resolveCompany = (company) => {
  const c = String(company || "").trim();
  if (c) return c;
  try { return String(getTenant() || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim(); } catch { return ""; }
};

// ── 회사별 구독 공유(같은 회사를 여러 화면이 보면 onSnapshot 하나만) ──
//  ⭐ 최고관리자가 관리자센터에서 회사별로 켜 주는 맞춤 기능(companyFeatures/{회사}.fareRules — src/companyFeatures.js)이
//   true인 회사만 운임 규칙 메뉴·운임구분 칸이 보인다. 회사 쪽 "운임 규칙 사용" 스위치는 그 안에서만 의미가 있다.
const EMPTY_RULES = Object.freeze({ loaded: false, data: null });
const stores = new Map(); // company -> { state, listeners:Set, unsub }
function getStore(co) {
  let s = stores.get(co);
  if (!s) { s = { state: EMPTY_RULES, listeners: new Set(), unsub: null }; stores.set(co, s); }
  return s;
}
function startStore(co, s) {
  if (s.unsub || !co) return;
  try {
    s.unsub = onSnapshot(doc(db, "fareRules", co), (snap) => {
      s.state = { loaded: true, data: snap.exists() ? snap.data() : null };
      s.listeners.forEach((fn) => fn());
    }, () => { s.state = { loaded: true, data: null }; s.listeners.forEach((fn) => fn()); });
  } catch { s.state = { loaded: true, data: null }; }
}
// 기능이 켜진 회사만 fareRules 문서를 구독(꺼진 회사는 읽지 않음)
function useRulesDoc(co) {
  const subscribe = React.useCallback((cb) => {
    if (!co) return () => {};
    const s = getStore(co);
    s.listeners.add(cb);
    startStore(co, s);
    return () => {
      s.listeners.delete(cb);
      if (s.listeners.size === 0 && s.unsub) setTimeout(() => {
        if (s.listeners.size === 0 && s.unsub) { try { s.unsub(); } catch { /* 무시 */ } s.unsub = null; s.state = EMPTY_RULES; }
      }, 3000);
    };
  }, [co]);
  const getSnap = React.useCallback(() => (co ? getStore(co).state : EMPTY_RULES), [co]);
  return React.useSyncExternalStore(subscribe, getSnap, getSnap);
}

// 운임 규칙 구독 — { loaded, feature, enabled, on, rules, activeRules, history, data, company }
//  feature: 최고관리자가 이 회사에 기능을 켜 줌(회사관리 › 운임 규칙 메뉴 표시)
//  on: feature && 회사가 "운임 규칙 사용"을 켬(오더 화면에 운임구분 표시)
export function useFareRules(company) {
  const co = resolveCompany(company);
  const feats = useCompanyFeatures(co);
  const feature = feats.fareRules === true;
  const rd = useRulesDoc(feature ? co : "");
  return React.useMemo(() => {
    const d = feature ? rd.data : null;
    const rules = Array.isArray(d?.rules) ? d.rules : [];
    const enabled = feature && !!d?.enabled;
    return {
      loaded: feats.loaded && (!feature || rd.loaded),
      feature, enabled, on: enabled, company: co, data: d, rules,
      history: Array.isArray(d?.history) ? d.history : [],
      activeRules: enabled ? rules.filter((r) => r && r.active !== false && String(r.name || "").trim()) : [],
    };
  }, [feats, feature, rd, co]);
}

const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// 규칙 한 개 적용 — 청구운임 → { 기사운임, 수수료 } (원 단위 정수)
export function applyFareRule(rule, 청구운임) {
  const sale = Math.round(toNum(청구운임));
  if (!rule) return { 기사운임: sale, 수수료: 0 };
  const v = toNum(rule.value);
  const fee = rule.type === "fixed" ? Math.round(v) : Math.round((sale * v) / 100);
  return { 기사운임: sale - fee, 수수료: fee };
}

export const findFareRule = (rules, name) => {
  const n = String(name || "").trim();
  if (!n) return null;
  return (rules || []).find((r) => String(r?.name || "").trim() === n) || null;
};

// "퍼센트 7%" / "정액 30,000원"
export const fareRuleCalcLabel = (rule) => {
  if (!rule) return "";
  const v = toNum(rule.value);
  return rule.type === "fixed" ? `정액 ${Math.round(v).toLocaleString()}원` : `퍼센트 ${v}%`;
};
// "일대 7% 적용" / "월대 30,000원 적용"
export const fareRuleHint = (rule) => {
  if (!rule) return "";
  const v = toNum(rule.value);
  return `${rule.name} ${rule.type === "fixed" ? `${Math.round(v).toLocaleString()}원` : `${v}%`} 적용`;
};

// ── 입력 폼 공용 처리 ──
//  form: 오더(또는 입력 중인 폼) · key: 바뀐 칸("운임구분"|"청구운임"|"기사운임"|"__reapply")
//  반환: 새 객체(수수료가 있는 폼이면 수수료도 맞춤). asString=true면 금액을 문자열로 넣는다(입력 폼 대부분이 문자열).
export function fareFormChange(form, key, value, rules, { asString = true, withFee = true, emptyDriver } = {}) {
  const next = { ...form };
  if (key !== "__reapply") next[key] = value;
  const out = (n) => (asString ? String(n) : n);
  const rule = findFareRule(rules, next.운임구분);
  // ⭐ 2026-11-04 운임구분 해제 리셋 — 규칙이 있던 오더에서 운임구분을 "선택 안 함"으로 바꾸면
  //  예전엔 운임수동만 끄고 규칙이 계산해 둔 기사운임을 그대로 남겨서 수수료도 옛 계산값으로 남았다.
  //  → 기사운임을 비우고 운임수동도 끈다(수수료는 아래 공통 계산: 청구운임 − 0 = 청구운임).
  if (key === "운임구분" && !rule && String(form?.운임구분 || "").trim() !== "") {
    next.운임수동 = false;
    next.기사운임 = emptyDriver !== undefined ? emptyDriver : (asString ? "" : 0);
  } else if (key === "기사운임") {
    // 사람이 기사운임을 고침 → 규칙 계산값과 다르면 수동으로 표시
    if (rule && String(next.청구운임 ?? "") !== "") {
      const calc = applyFareRule(rule, next.청구운임);
      next.운임수동 = toNum(value) !== calc.기사운임;
    }
  } else if (key === "__reapply" || ((key === "운임구분" || key === "청구운임") && !next.운임수동)) {
    if (key === "__reapply") next.운임수동 = false;
    if (key === "운임구분" && !rule) next.운임수동 = false;
    if (rule && String(next.청구운임 ?? "").replace(/[^\d-]/g, "") !== "") {
      const r = applyFareRule(rule, next.청구운임);
      next.기사운임 = out(r.기사운임);
    }
  }
  if (withFee && (key === "청구운임" || key === "기사운임" || key === "운임구분" || key === "__reapply")) {
    const sale = toNum(next.청구운임);
    const drv = toNum(next.기사운임);
    next.수수료 = out(sale - drv);
  }
  return next;
}

// 저장용 — 운임구분이 있으면 그 값 그대로, 없으면 필드를 만들지 않는다(다른 회사 오더 모양 그대로)
export const farePatchOf = (form) => {
  const n = String(form?.운임구분 || "").trim();
  if (!n) return {};
  return { 운임구분: n, 운임수동: !!form.운임수동 };
};

// 규칙대로 계산된 상태인지(힌트·↺ 버튼 표시용)
export const fareIsManual = (form, rules) => {
  const rule = findFareRule(rules, form?.운임구분);
  if (!rule || String(form?.청구운임 ?? "") === "") return false;
  if (form?.운임수동) return true;
  return toNum(form?.기사운임) !== applyFareRule(rule, form.청구운임).기사운임;
};

// ⭐ 2026-11-04 운임구분 바로 추가 — 드롭다운에서 새 구분명 + %를 넣으면 회사 운임 규칙(fareRules/{회사}.rules)에 바로 추가
//  · 회사관리 › 운임 규칙(FareRulesSettings.jsx)의 저장과 같은 모양: rules 항목 { id, name, type:"percent", value, active:true, memo:"" }
//    + history 한 줄({ at, by, change: "규칙 추가 이름(퍼센트 n%)" }) · updatedAt/updatedBy
//  · rules는 arrayUnion으로 덧붙여, 다른 사람이 동시에 고친 규칙을 덮어쓰지 않는다
//  · firestore.rules: match /fareRules/{co} update = fareRulesStaff(co) && role != viewer && 기능 켜짐 → 규칙 변경 필요 없음
export const canQuickAddFareRule = () => {
  try { const r = String(localStorage.getItem("role") || ""); return !!r && !["viewer", "driver", "shipper"].includes(r); } catch { return false; }
};
export async function addFareRuleQuick(company, { name, value }) {
  const co = resolveCompany(company);
  const nm = String(name || "").trim();
  const v = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  if (!co) throw new Error("회사 정보를 찾지 못했습니다");
  if (!nm) throw new Error("구분명을 입력하세요");
  if (!(v >= 0) || String(value ?? "").trim() === "") throw new Error("%를 입력하세요");
  if (v > 100) throw new Error("100% 이하로 입력하세요");
  const cur = getStore(co).state?.data?.rules;
  if ((Array.isArray(cur) ? cur : []).some((r) => String(r?.name || "").trim() === nm)) throw new Error("같은 이름이 이미 있습니다");
  const u = auth?.currentUser;
  const by = u?.displayName || (u?.email || "").split("@")[0] || "";
  const rule = { id: `fr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: nm, type: "percent", value: v, active: true, memo: "" };
  await setDoc(doc(db, "fareRules", co), {
    companyName: co,
    rules: arrayUnion(rule),
    history: arrayUnion({ at: Date.now(), by, change: `규칙 추가 ${nm}(퍼센트 ${v}%) · 운임구분에서 바로 추가` }),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  }, { merge: true });
  return rule;
}

// ── 작은 UI 조각 ──
const h = React.createElement;

// 운임구분 선택 — rules: 회사 규칙 전체(비활성 규칙은 현재 값일 때만 보여 준다)
// ⭐ 2026-11-02 운임구분 선택 — 프로그램 스타일 드롭다운(버튼 + 떠 있는 목록). 옛 <select> 대신
//  compact: 작은 알약 버튼(라벨 줄·표 칸) / 기본: 입력칸 높이(40px)
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const fmtRuleVal = (r) => (r.type === "fixed" ? `${Math.round(toNum(r.value)).toLocaleString()}원` : `${toNum(r.value)}%`);
export function FareTypeSelect({ value, onChange, rules = [], className = "", disabled = false, compact = false, placeholder = "운임구분", id, align = "left", noneLabel = "선택 안 함 · 직접 계산", extraOpts = [], allowAdd = true, company }) {
  const list = (rules || []).filter((r) => r && String(r.name || "").trim() && (r.active !== false || String(r.name) === String(value || "")));
  const cur = list.find((r) => String(r.name) === String(value || "")) || null;
  const curExtra = extraOpts.find((o) => String(o.name) === String(value || "")) || null;
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const [act, setAct] = React.useState(0);
  const btn = React.useRef(null);
  const menu = React.useRef(null);
  const opts = [{ name: "", none: true }, ...list, ...extraOpts.map((o) => ({ ...o, extra: true }))];
  // ⭐ 2026-11-04 운임구분 바로 추가 — 목록 맨 아래 "+ 새 운임구분" 줄(조회전용 제외)
  const canAdd = allowAdd && !disabled && canQuickAddFareRule();
  const [adding, setAdding] = React.useState(false);
  const [nf, setNf] = React.useState({ name: "", value: "" });
  const [addErr, setAddErr] = React.useState("");
  const [addBusy, setAddBusy] = React.useState(false);
  const pendingRef = React.useRef(""); // 추가한 이름 — 규칙 목록(rules)에 들어온 뒤 고른다(그 전에 고르면 계산이 안 됨)
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  React.useEffect(() => {
    const nm = pendingRef.current;
    if (!nm) return;
    if ((rules || []).some((r) => String(r?.name || "").trim() === nm)) {
      pendingRef.current = "";
      onChangeRef.current?.(nm);
    }
  }, [rules]);
  const submitAdd = async () => {
    if (addBusy) return;
    setAddErr("");
    const nm = String(nf.name || "").trim();
    if (!nm) { setAddErr("구분명을 입력하세요"); return; }
    if ((rules || []).some((r) => String(r?.name || "").trim() === nm)) { setAddErr("같은 이름이 이미 있습니다"); return; }
    setAddBusy(true);
    try {
      pendingRef.current = nm;
      await addFareRuleQuick(company, nf);
      setAdding(false); setNf({ name: "", value: "" }); setOpen(false);
      setTimeout(() => btn.current?.focus(), 0);
    } catch (e) {
      pendingRef.current = "";
      setAddErr(e?.code === "permission-denied" ? "추가 권한이 없습니다" : (e?.message || "추가하지 못했습니다"));
    } finally { setAddBusy(false); }
  };
  const place = React.useCallback(() => {
    const el = btn.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(r.width, 260);
    const mh = Math.min(320, opts.length * 44 + 46) + (canAdd ? (adding ? 96 : 46) : 0);
    const up = r.bottom + mh + 8 > window.innerHeight && r.top > mh + 8;
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ left, top: up ? r.top - mh - 6 : r.bottom + 6, width: w, up });
  }, [opts.length, align, canAdd, adding]);
  const openIt = () => {
    if (disabled) return;
    place();
    setAct(Math.max(0, opts.findIndex((o) => String(o.name) === String(value || ""))));
    setAdding(false); setAddErr("");
    setOpen(true);
  };
  const pick = (o) => { setOpen(false); onChange?.(o.none ? "" : o.name); setTimeout(() => btn.current?.focus(), 0); };
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (btn.current?.contains(e.target) || menu.current?.contains(e.target)) return; setOpen(false); };
    // 새 운임구분 입력 중(모바일 키보드가 올라오며 화면이 줄거나 스크롤됨)엔 닫지 않고 자리만 다시 잡는다
    const re = (e) => { if (menu.current?.contains(e.target)) return; if (menu.current?.contains(document.activeElement)) { place(); return; } setOpen(false); };
    document.addEventListener("mousedown", down, true);
    window.addEventListener("scroll", re, true);
    window.addEventListener("resize", re);
    return () => { document.removeEventListener("mousedown", down, true); window.removeEventListener("scroll", re, true); window.removeEventListener("resize", re); };
  }, [open, place]);
  const onKey = (e) => {
    if (!open) { if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openIt(); } return; }
    if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); } setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setAct((i) => Math.min(opts.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setAct((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); pick(opts[act]); }
  };
  const chev = h("svg", { width: 10, height: 10, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round", className: `shrink-0 transition-transform ${open ? "rotate-180" : ""}`, "aria-hidden": true }, h("path", { d: "M6 9l6 6 6-6" }));
  const on = !!cur || !!curExtra;
  const base = compact
    ? `inline-flex items-center gap-1.5 h-[26px] pl-2 pr-1.5 rounded-full border text-[12px] font-extrabold whitespace-nowrap transition ${on
      ? "bg-[#1B2B4B] border-[#1B2B4B] text-white hover:bg-[#2D4C82]"
      : "bg-white border-[#C9D5EA] text-[#5B6B85] hover:border-[#4B6CB7] hover:text-[#1B2B4B]"}`
    : `flex items-center justify-between gap-2 w-full h-[40px] px-3 rounded-[11px] border text-[13.5px] font-bold transition ${on
      ? "bg-white border-[#4B6CB7] text-[#0F1A30]"
      : "bg-white border-[#C9D5EA] text-[#5B6B85] hover:border-[#4B6CB7] hover:text-[#1B2B4B]"}`; // ⭐ 2026-11-05 회색이라 꺼진 칸처럼 보이던 것 → 흰 바탕
  const label = cur
    ? h("span", { className: "inline-flex items-center gap-1.5 min-w-0" },
      h("span", { className: "truncate" }, cur.name),
      // 작은 알약(라벨 줄·표 칸)은 자리가 좁아 이름만 — 계산 값은 목록·마우스 올림 설명에서
      compact ? null : h("span", { className: "tabular-nums px-1.5 rounded-full text-[11px] font-black bg-[#EAF0FB] text-[#2D4C82]" }, fmtRuleVal(cur)))
    : h("span", { className: "truncate" }, curExtra ? curExtra.label : placeholder);
  return h(React.Fragment, null,
    h("button", {
      id, ref: btn, type: "button", disabled,
      "data-fare-type": "1", "data-value": value || "",
      "aria-haspopup": "listbox", "aria-expanded": open,
      onClick: (e) => { e.preventDefault(); e.stopPropagation(); open ? setOpen(false) : openIt(); },
      onMouseDown: (e) => e.stopPropagation(),
      onKeyDown: onKey,
      className: `${base} focus:outline-none focus:ring-4 focus:ring-[#4B6CB7]/15 disabled:opacity-50 disabled:cursor-not-allowed ${className}`,
      title: cur ? `운임구분: ${cur.name} (${cur.type === "fixed" ? `수수료 고정 ${fmtRuleVal(cur)}` : `수수료 ${fmtRuleVal(cur)}`}) — 눌러서 바꾸기` : "운임구분 — 회사관리 › 운임 규칙에서 정한 계산으로 기사운임·수수료를 자동으로 채웁니다",
    }, label, chev),
    open && pos ? createPortal(h("div", {
      ref: menu, role: "listbox", "data-fare-menu": "1",
      onMouseDown: (e) => e.stopPropagation(), onClick: (e) => e.stopPropagation(),
      style: { position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 2147483000 },
      className: "rounded-2xl bg-white border border-[#E3E8F0] shadow-[0_18px_44px_rgba(15,26,48,0.22)] overflow-hidden",
    },
    h("div", { className: "px-3.5 pt-2.5 pb-2 flex items-center justify-between border-b border-[#EEF2F7] bg-[#F7F9FC]" },
      h("span", { className: "inline-flex items-baseline gap-1.5 whitespace-nowrap" },
        h("span", { className: "text-[14px] font-black text-[#0F1A30]" }, "운임구분"),
        h("span", { className: "text-[10.5px] font-extrabold tracking-[0.12em] text-[#4B6CB7]" }, "FARE TYPE")),
      h("span", { className: "text-[12px] font-bold text-[#8E9BB2]" }, "↑↓ · Enter")),
    h("div", { className: "max-h-[272px] overflow-y-auto py-1" },
      ...opts.map((o, i) => {
        const sel = String(o.name) === String(value || "");
        return h("div", {
          key: o.id || o.name || "__none", role: "option", "aria-selected": sel,
          onMouseEnter: () => setAct(i),
          onClick: () => pick(o),
          className: `mx-1 px-2.5 h-[40px] rounded-xl flex items-center gap-2.5 cursor-pointer select-none ${i === act ? "bg-[#EEF3FC]" : ""}`,
        },
        h("span", { className: `w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${sel ? "border-[#1B2B4B] bg-[#1B2B4B]" : "border-[#C9D5EA]"}` },
          sel ? h("span", { className: "w-1.5 h-1.5 rounded-full bg-white" }) : null),
        o.none
          ? h("span", { className: "flex-1 text-[14px] font-bold text-[#8E9BB2]" }, noneLabel)
          : o.extra ? h("span", { className: "flex-1 text-[13px] font-extrabold text-[#5B6B85]" }, o.label)
          : h(React.Fragment, null,
            h("span", { className: "flex-1 min-w-0 truncate text-[14.5px] font-extrabold text-[#0F1A30]" }, o.name, o.active === false ? h("span", { className: "ml-1 text-[11px] font-bold text-[#B54708]" }, "(사용 안 함)") : null),
            h("span", { className: "shrink-0 tabular-nums px-2 h-[22px] inline-flex items-center rounded-full bg-[#1B2B4B] text-[#E9C46A] text-[12.5px] font-black" }, o.type === "fixed" ? `고정 ${fmtRuleVal(o)}` : `수수료 ${fmtRuleVal(o)}`)));
      })),
    list.length === 0 && !canAdd ? h("div", { className: "px-4 py-3 text-[13px] font-bold text-[#8E9BB2] border-t border-[#EEF2F7]" }, "회사관리 › 운임 규칙에서 규칙을 먼저 만들어 주세요") : null,
    canAdd ? h("div", { className: "border-t border-[#EEF2F7] bg-[#F7F9FC] px-2 py-2", "data-fare-add": "1" },
      !adding
        ? h("button", {
          type: "button", "data-fare-add-open": "1",
          onClick: () => { setAdding(true); setAddErr(""); },
          className: "w-full h-[36px] px-2.5 rounded-xl flex items-center gap-2 text-left text-[13.5px] font-extrabold text-[#2D4C82] hover:bg-[#EEF3FC] transition",
        },
        h("span", { className: "w-4 h-4 rounded-full bg-[#1B2B4B] text-white grid place-items-center text-[12px] leading-none shrink-0" }, "+"),
        h("span", { className: "flex-1" }, "새 운임구분 바로 추가"),
        h("span", { className: "text-[10px] font-extrabold tracking-[0.14em] text-[#8E9BB2]", style: { fontFamily: MONO } }, "NEW"))
        : h("div", { className: "flex flex-col gap-1.5" },
          h("div", { className: "flex items-center justify-between px-1" },
            h("span", { className: "text-[10px] font-extrabold tracking-[0.14em] text-[#4B6CB7]", style: { fontFamily: MONO } }, "NEW FARE TYPE · %"),
            h("button", { type: "button", onClick: () => { setAdding(false); setAddErr(""); }, className: "text-[11.5px] font-bold text-[#8E9BB2] hover:text-[#1B2B4B]" }, "취소")),
          h("div", { className: "flex items-center gap-1.5" },
            h("input", {
              autoFocus: true, autoComplete: "off", maxLength: 20, placeholder: "구분명 (예: 일대)", "data-fare-add-name": "1",
              value: nf.name, onChange: (e) => setNf((p) => ({ ...p, name: e.target.value })),
              onKeyDown: (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); submitAdd(); } if (e.key === "Escape") { e.preventDefault(); setAdding(false); } },
              className: "flex-1 min-w-0 h-[34px] px-2.5 rounded-xl border border-[#C9D5EA] bg-white text-[13.5px] font-bold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-2 focus:ring-[#4B6CB7]/15",
            }),
            h("span", { className: "relative shrink-0" },
              h("input", {
                autoComplete: "off", inputMode: "decimal", placeholder: "7", "data-fare-add-value": "1",
                value: nf.value, onChange: (e) => setNf((p) => ({ ...p, value: e.target.value.replace(/[^\d.]/g, "") })),
                onKeyDown: (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); submitAdd(); } if (e.key === "Escape") { e.preventDefault(); setAdding(false); } },
                className: "w-[62px] h-[34px] pl-2 pr-6 rounded-xl border border-[#C9D5EA] bg-white text-[13.5px] font-bold text-right tabular-nums text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-2 focus:ring-[#4B6CB7]/15",
                style: { fontFamily: MONO },
              }),
              h("span", { className: "absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-[#6B7A99] pointer-events-none" }, "%")),
            h("button", {
              type: "button", disabled: addBusy, onClick: submitAdd, "data-fare-add-save": "1",
              className: "shrink-0 h-[34px] px-3 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-extrabold hover:bg-[#0F1A30] disabled:opacity-50 transition",
            }, addBusy ? "추가 중" : "추가")),
          addErr ? h("div", { className: "px-1 text-[12px] font-bold text-red-600" }, addErr) : null)) : null),
    document.body) : null);
}

// 규칙대로 계산 중이면 아무것도 안 보인다(칸이 운임구분을 이미 보여 줌).
// 기사운임을 사람이 직접 고쳤을 때만 [↺ 규칙대로] 버튼 하나
export function FareRuleHint({ form, rules, onReapply, className = "", dark = false }) {
  const rule = findFareRule(rules, form?.운임구분);
  if (!rule || !fareIsManual(form, rules) || !onReapply) return null;
  return h("button", {
    type: "button", "data-fare-hint": "1",
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); onReapply(); },
    className: `${className} inline-flex items-center gap-1 whitespace-nowrap h-[24px] px-2 rounded-full text-[11.5px] font-extrabold transition ${dark ? "bg-amber-400/20 text-amber-200 hover:bg-amber-400/30" : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"}`,
    title: `기사운임을 직접 고쳐서 ${rule.name} 규칙(${fareRuleHint(rule)})과 다릅니다. 누르면 규칙대로 다시 계산합니다`,
  }, "↺ 규칙대로");
}

// 배열 → 운임구분별 합계 [{ name, count, sale, driver, fee }]
export function sumByFareType(rows = []) {
  const m = new Map();
  for (const r of rows || []) {
    const k = String(r?.운임구분 || "").trim() || "(미지정)";
    const cur = m.get(k) || { name: k, count: 0, sale: 0, driver: 0, fee: 0 };
    const s = toNum(r?.청구운임), d = toNum(r?.기사운임);
    cur.count += 1; cur.sale += s; cur.driver += d; cur.fee += s - d;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => (a.name === "(미지정)") - (b.name === "(미지정)") || b.sale - a.sale);
}

// 운임구분별 합계 카드(정산·매출 화면용) — 규칙을 켠 회사만
export function FareTypeBreakdown({ rows = [], title = "운임구분별 합계", className = "" }) {
  const list = sumByFareType(rows);
  if (!list.length) return null;
  const won = (n) => `${Math.round(n).toLocaleString()}`;
  return h("div", { className: `rounded-2xl border border-[#E3E8F0] bg-white p-4 ${className}`, "data-fare-breakdown": "1" },
    h("div", { className: "flex items-center justify-between mb-2" },
      h("div", { className: "text-[15px] font-extrabold text-[#1B2B4B]" }, title),
      h("div", { className: "text-[12.5px] font-semibold text-[#6B7A99]" }, "회사관리 › 운임 규칙 기준")),
    h("div", { className: "overflow-x-auto" },
      h("table", { className: "w-full text-[14px]" },
        h("thead", null, h("tr", { className: "text-[#6B7A99] text-[13px]" },
          ...["운임구분", "건수", "청구운임", "기사운임", "수수료"].map((t, i) => h("th", { key: t, className: `py-1.5 px-2 font-bold ${i ? "text-right" : "text-left"}` }, t)))),
        h("tbody", null, ...list.map((x) => h("tr", { key: x.name, className: "border-t border-[#EEF2F8]" },
          h("td", { className: "py-1.5 px-2 font-bold text-[#1B2B4B]" }, x.name),
          h("td", { className: "py-1.5 px-2 text-right" }, `${x.count.toLocaleString()}건`),
          h("td", { className: "py-1.5 px-2 text-right font-semibold" }, won(x.sale)),
          h("td", { className: "py-1.5 px-2 text-right" }, won(x.driver)),
          h("td", { className: "py-1.5 px-2 text-right font-bold text-[#2D4C82]" }, won(x.fee))))))));
}
