// ======================= functions/boardHeaderMatch.mjs =======================
// 🔗 2026-11-08 배차표(고정노선) ↔ 구글시트 — 머리줄 자동 대조(화면 src/routeBoardSheet.js · src/RouteBoard.jsx · src/FixedRouteStatus.jsx
//    · 서버 functions/routeBoardSync.js · functions/routeBoardMonth.mjs가 같이 쓴다)
//  운송사마다 시트 머리줄 이름이 달라서(업체명/거래처/화주 · 기사님요금/기사운임 · 청구금액/청구운임 …)
//  양식 칸 이름과 글자가 똑같지 않아도 "같은 프로그램 칸"이면 같은 열로 본다(동의어 사전 = sheetProfileCore SYNONYMS).
//   · headerField(h): 머리줄 글자 → 프로그램 칸(거래처명 · 기사운임 …) | ""
//   · headerIs(c, h): 양식 칸 c가 시트 머리글 h와 같은 열인가(글자가 같거나, 둘 다 같은 프로그램 칸)
//   · colIndexes(c, headerRow): 그 칸의 시트 열 위치 후보(글자가 같은 열 우선, 없으면 동의어 열)
//   · normalizeBoardForm(form): 예전에 "참고(보관)"로 저장된 칸 중 프로그램 칸으로 알아볼 수 있는 것(업체명 → 거래처명,
//       기사님요금 → 기사운임, 배차상태 · 선/착불 · 프로그램 …)을 프로그램 칸으로, 수수료 · 매익율은 "자동 계산" 칸(calc)으로
import { headerCandidates, mapEnum } from "./sheetProfileCore.mjs";

const nm = (s) => String(s || "").toLowerCase().replace(/[\s()（）[\]]/g, "");
const cache = new Map();
// 머리줄 글자 → 프로그램 칸(점수 0.6 이상 1등) — 숫자만·긴 글은 머리글이 아님
export function headerField(h) {
  const s = String(h ?? "").replace(/\u00a0/g, " ").trim();
  if (!s || s.length > 24 || /^[\d,.\-\s:/%₩]+$/.test(s)) return "";
  if (cache.has(s)) return cache.get(s);
  const top = headerCandidates(s)[0];
  const f = top && top.score >= 0.6 ? top.field : "";
  if (cache.size > 20000) cache.clear();
  cache.set(s, f);
  return f;
}
// 양식 칸이 가리키는 프로그램 칸
export const colFieldOf = (c) => {
  if (!c) return "";
  if (c.kind === "field" || c.kind === "calc") return c.field || "";
  if (c.kind === "date") return c.role || "상차일";
  if (c.kind === "no") return "순번";
  if (c.kind === "extra") return headerField(c.label);
  return "";
};
export function headerIs(c, h) {
  if (!h) return false;
  if (nm(h) === nm(c.label)) return true;
  const f = colFieldOf(c);
  return !!f && headerField(h) === f;
}
// 칸의 시트 열 후보 — 글자가 같은 열이 있으면 그것만, 없으면 같은 프로그램 칸인 열
export function colIndexes(c, headerRow = []) {
  const exact = headerRow.map((h, i) => (h && nm(h) === nm(c.label) ? i : -1)).filter((i) => i >= 0);
  if (exact.length) return exact;
  const f = colFieldOf(c);
  if (!f) return [];
  return headerRow.map((h, i) => (h && headerField(h) === f ? i : -1)).filter((i) => i >= 0);
}
// 머리줄 찾기 — 글자가 같은 칸이 need개 이상이거나, 동의어까지 쳐서 넉넉히(데이터 줄이 머리줄로 잡히지 않게) 맞으면
export function headerRowsOf(rows, cols) {
  const set = new Set(cols.map((c) => nm(c.label)));
  const need = Math.max(2, Math.min(3, Math.ceil(set.size / 2)));
  const loose = Math.max(need, Math.min(5, Math.ceil(cols.length / 3)));
  const out = [];
  (rows || []).forEach((r0, i) => {
    const r = r0 || [];
    const exact = new Set(r.map(nm).filter((x) => set.has(x))).size;
    if (exact >= need) { out.push(i); return; }
    if (r.filter(Boolean).length < loose) return;
    let n = 0;
    for (const c of cols) if (r.some((h) => headerIs(c, h))) n += 1;
    if (n >= loose) out.push(i);
  });
  return out;
}

// ── 양식 칸 정리(자동 대조) ──
export const BOARD_FIELDS = new Set(["하차지명", "하차지주소", "차량번호", "이름", "전화번호", "상차시간", "하차시간", "메모", "거래처명", "청구운임", "기사운임", "화물내용", "차량톤수", "차량종류", "상차지명", "상차지주소", "배차상태", "지급방식", "배차방식"]);
export const CALC_FIELDS = new Set(["수수료", "매익율"]); // 프로그램이 계산(시트 값은 읽지도 쓰지도 않음 — 시트 수식 보호)
export const ENUM_FIELDS = new Set(["배차상태", "지급방식", "배차방식"]);
export const PULL_ONLY = new Set(["배차상태"]); // 시트 배차상태는 수식인 경우가 많아 시트로 되돌려 쓰지 않는다
export function normalizeBoardForm(form) {
  if (!form || !Array.isArray(form.columns)) return form;
  const used = new Set(form.columns.filter((c) => c.kind === "field" || c.kind === "calc").map((c) => c.field));
  let changed = false;
  const columns = form.columns.map((c) => {
    if (c.kind !== "extra" || c.keepExtra) return c;
    if (/운송업체|운송사/.test(String(c.label || ""))) return c; // 운송업체 칸은 참고 칸 그대로(운송업체 설정)
    const f = headerField(c.label);
    if (!f || used.has(f)) return c;
    if (CALC_FIELDS.has(f)) { used.add(f); changed = true; return { ...c, kind: "calc", field: f, autoFrom: "extra" }; }
    if (!BOARD_FIELDS.has(f)) return c;
    used.add(f); changed = true;
    return { ...c, kind: "field", field: f, autoFrom: "extra" };
  });
  return changed ? { ...form, columns } : form;
}

// ── 값 정리 ──
const cell = (v) => String(v ?? "").replace(/\u00a0/g, " ").trim();
export function normStatus(v) {
  const s = cell(v).replace(/\s+/g, "");
  if (!s) return "";
  if (/취소/.test(s)) return "배차취소";
  if (/완료/.test(s)) return "배차완료";
  if (/배차중|대기|미배차|진행|접수/.test(s)) return "배차중";
  return "";
}
// 시트 값 → 프로그램 값(배차상태 · 지급방식 · 배차방식)
export function enumValue(field, v) {
  const s = cell(v);
  if (!s) return "";
  if (field === "배차상태") return normStatus(s) || s;
  const r = mapEnum(field, s, {});
  return r?.value || s;
}
// 매익율(%) — 청구운임이 없으면 빈칸(#DIV/0! 대신)
export function marginRate(sale, driver) {
  const a = Number(String(sale ?? "").replace(/[^\d.-]/g, "")) || 0;
  const b = Number(String(driver ?? "").replace(/[^\d.-]/g, "")) || 0;
  if (!a) return "";
  return `${Math.round(((a - b) / a) * 100)}%`;
}
