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
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
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
export function fareFormChange(form, key, value, rules, { asString = true, withFee = true } = {}) {
  const next = { ...form };
  if (key !== "__reapply") next[key] = value;
  const out = (n) => (asString ? String(n) : n);
  const rule = findFareRule(rules, next.운임구분);
  if (key === "기사운임") {
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

// ── 작은 UI 조각 ──
const h = React.createElement;

// 운임구분 선택 — rules: 회사 규칙 전체(비활성 규칙은 현재 값일 때만 보여 준다)
export function FareTypeSelect({ value, onChange, rules = [], className = "", disabled = false, compact = false, placeholder = "운임구분", id }) {
  const list = (rules || []).filter((r) => r && String(r.name || "").trim() && (r.active !== false || String(r.name) === String(value || "")));
  const base = compact
    ? "h-[28px] px-2 rounded-md border border-[#C9D5EA] bg-white text-[12.5px] font-bold text-[#1B2B4B] focus:outline-none focus:ring-2 focus:ring-[#8FB0F0]"
    : "w-full h-[40px] px-3 rounded-lg border border-[#C9D5EA] bg-white text-[14px] font-semibold text-[#1B2B4B] focus:outline-none focus:ring-2 focus:ring-[#8FB0F0]";
  return h("select", {
    id,
    "data-fare-type": "1",
    value: value || "",
    disabled,
    onChange: (e) => onChange?.(e.target.value),
    onClick: (e) => e.stopPropagation(),
    className: `${base} ${className}`,
    title: "운임구분 — 회사관리 › 운임 규칙에서 정한 계산으로 기사운임·수수료를 자동으로 채웁니다",
  },
  h("option", { value: "" }, compact ? `${placeholder} 없음` : `${placeholder} 선택 안 함`),
  ...list.map((r) => h("option", { key: r.id || r.name, value: r.name }, `${r.name} · ${r.type === "fixed" ? `${Math.round(toNum(r.value)).toLocaleString()}원` : `${toNum(r.value)}%`}`)));
}

// "일대 7% 적용" + (수동이면) [↺ 규칙대로]
export function FareRuleHint({ form, rules, onReapply, className = "", dark = false }) {
  const rule = findFareRule(rules, form?.운임구분);
  if (!rule) return null;
  const manual = fareIsManual(form, rules);
  return h("span", { className: `inline-flex items-center gap-1.5 flex-wrap ${className}`, "data-fare-hint": "1" },
    h("span", {
      className: `inline-flex items-center px-1.5 py-[1px] rounded text-[11.5px] font-extrabold ${manual
        ? (dark ? "bg-amber-400/20 text-amber-200" : "bg-amber-50 text-amber-700 border border-amber-200")
        : (dark ? "bg-[#2D4C82] text-[#DCE7FB]" : "bg-[#EAF0FB] text-[#2D4C82] border border-[#C9D5EA]")}`,
    }, manual ? `${rule.name} · 기사운임 직접 입력` : fareRuleHint(rule)),
    manual && onReapply ? h("button", {
      type: "button",
      onClick: (e) => { e.preventDefault(); e.stopPropagation(); onReapply(); },
      className: `px-1.5 py-[1px] rounded text-[11.5px] font-extrabold ${dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-[#1B2B4B] text-white hover:bg-[#2D4C82]"}`,
      title: "운임 규칙대로 기사운임·수수료를 다시 계산",
    }, "↺ 규칙대로") : null);
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
