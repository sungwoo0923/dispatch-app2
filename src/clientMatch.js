// ======================= src/clientMatch.js =======================
// 🔎 2026-11-03 거래처 검색 공용 규칙 — "하나"를 치면 하나상운·하나물류·나라하나가 섞여 나오던 문제
//  · 친 글자가 어떤 거래처 이름과 "정확히 같으면"(띄어쓰기·대소문자 무시) → 그 거래처만
//  · 정확히 같은 이름이 없으면 → 예전처럼 "포함"으로(일부만 쳐도 찾기)
export const normClient = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

// names: 비교할 거래처 이름들(보통 지금 목록의 거래처명들) → (name) => boolean
export function makeClientMatcher(q, names) {
  const nq = normClient(q);
  if (!nq) return () => true;
  let exact = false;
  for (const n of names || []) { if (normClient(n) === nq) { exact = true; break; } }
  return exact ? (name) => normClient(name) === nq : (name) => normClient(name).includes(nq);
}
