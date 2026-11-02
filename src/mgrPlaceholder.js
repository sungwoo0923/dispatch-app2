// ⭐ 2026-11-02 "담당 담당자" 표시 정리 — 고정노선으로 만든 오더는 상·하차지/경유지 담당자를 몰라도
// 자리 채움 글자 "담당자"를 넣어 두었다. 화면·기사 전달 문구에 "담당 담당자", "담당자 : 담당자"처럼
// 의미 없는 글자가 보이던 원인. 화면에 쓰는 오더 목록을 받을 때 이 자리 채움 값을 빈 값으로 본다.
// (저장된 문서는 그대로 — 사람이 그 오더를 고쳐 저장하면 그때 빈 값으로 정리된다)
export const isMgrPlaceholder = (v) => String(v ?? "").trim() === "담당자";
// 화면에 보일 담당자 이름(자리 채움이면 빈 값)
export const mgrName = (v) => (isMgrPlaceholder(v) ? "" : (v ?? ""));

const STOP_KEYS = ["경유지_상차", "경유지_하차", "경유상차목록", "경유하차목록"];
const MAIN_KEYS = ["상차지담당자", "하차지담당자"];

const cleanStops = (arr) => {
  if (!Array.isArray(arr) || !arr.some((s) => s && isMgrPlaceholder(s.담당자))) return arr;
  return arr.map((s) => (s && isMgrPlaceholder(s.담당자) ? { ...s, 담당자: "" } : s));
};

// 바뀐 게 없으면 같은 객체를 그대로 돌려준다(화면 다시 그리기 최소화)
export function cleanMgrRow(r) {
  if (!r || typeof r !== "object") return r;
  let out = r;
  const put = (k, v) => { if (out === r) out = { ...r }; out[k] = v; };
  MAIN_KEYS.forEach((k) => { if (isMgrPlaceholder(r[k])) put(k, ""); });
  STOP_KEYS.forEach((k) => { const c = cleanStops(r[k]); if (c !== r[k]) put(k, c); });
  return out;
}

export function cleanMgrRows(list) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const out = list.map((r) => { const c = cleanMgrRow(r); if (c !== r) changed = true; return c; });
  return changed ? out : list;
}
