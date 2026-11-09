// ======================= src/fareRulesCore.js =======================
// 운임 규칙 계산(순수 함수 — firebase·화면 없음). src/fareRules.js가 다시 내보내고 scripts/fareRules.test.mjs가 시험한다.
import { forkliftApply } from "./forkliftCore.js"; // 🏗 2026-11-09 지게차비용
export const toNum = (v) => {
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

// ⭐ 2026-11-09 오더별 수수료율 — 운임구분수수료율이 있으면 규칙 값 대신 그 값으로 계산한 규칙
export const farePctOf = (form) => {
  const raw = form?.운임구분수수료율;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
export function effectiveFareRule(form, rules) {
  const rule = findFareRule(rules, form?.운임구분);
  if (!rule) return null;
  const pct = farePctOf(form);
  return pct === null ? rule : { ...rule, value: pct };
}

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
  const baseRule = findFareRule(rules, next.운임구분);
  // ⭐ 2026-11-09 운임구분을 (다시) 고르면 그 규칙의 기본 수수료율을 오더에 채운다 — 이후 오더마다 고칠 수 있다
  if (key === "운임구분") next.운임구분수수료율 = baseRule ? (asString ? String(toNum(baseRule.value)) : toNum(baseRule.value)) : "";
  if (key === "운임구분수수료율") next.운임구분수수료율 = String(value ?? "").replace(/[^\d.]/g, "");
  const rule = effectiveFareRule(next, rules);
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
  } else if (key === "__reapply" || key === "운임구분수수료율" || ((key === "운임구분" || key === "청구운임") && !next.운임수동)) {
    // 수수료율을 직접 바꾸면 그 값으로 다시 계산(사람이 고친 기사운임도 새 %로)
    if (key === "__reapply" || key === "운임구분수수료율") next.운임수동 = false;
    if (key === "운임구분" && !rule) next.운임수동 = false;
    if (rule && String(next.청구운임 ?? "").replace(/[^\d-]/g, "") !== "") {
      const r = applyFareRule(rule, next.청구운임);
      next.기사운임 = out(r.기사운임);
    }
  }
  if (withFee && (key === "청구운임" || key === "기사운임" || key === "운임구분" || key === "운임구분수수료율" || key === "__reapply")) {
    const sale = toNum(next.청구운임);
    const drv = toNum(next.기사운임);
    next.수수료 = out(sale - drv);
  }
  // 🏗 2026-11-09 지게차비용이 있는 오더 — 운임구분 계산 뒤 지게차를 다시 적용(기사 부담이면 기사운임에서 빼고 수익 = 청구 − 기사 − 지게차)
  if (form && (toNum(form.지게차비용) > 0 || toNum(form.지게차기사차감) > 0 || toNum(form.지게차청구추가) > 0 || toNum(next.지게차비용) > 0)) return forkliftApply(form, next, key, { asString });
  return next;
}

// 저장용 — 운임구분이 있으면 그 값 그대로, 없으면 필드를 만들지 않는다(다른 회사 오더 모양 그대로)
export const farePatchOf = (form) => {
  const n = String(form?.운임구분 || "").trim();
  if (!n) return {};
  const pct = farePctOf(form);
  return { 운임구분: n, 운임수동: !!form.운임수동, ...(pct === null ? {} : { 운임구분수수료율: pct }) };
};

// 규칙대로 계산된 상태인지(힌트·↺ 버튼 표시용)
export const fareIsManual = (form, rules) => {
  const rule = effectiveFareRule(form, rules);
  if (!rule || String(form?.청구운임 ?? "") === "") return false;
  if (form?.운임수동) return true;
  return toNum(form?.기사운임) !== applyFareRule(rule, form.청구운임).기사운임;
};

