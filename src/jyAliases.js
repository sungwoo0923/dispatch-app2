// ======================= src/jyAliases.js =======================
// 🏷 2026-11-24 JY로지스틱스 — 같은 곳의 다른 이름(오더 하차지명 ↔ 단가표 이름)
//  오더(구글시트에서 가져온 이름 · functions/carrierMigrateCore.mjs PRESET_SUGGESTIONS.JY로지스틱스 placeAliases · lookupAliases)와
//  에이제이 단가표 엑셀의 이름이 달라 단가표 자동 입력이 안 되던 곳을 묶는다. 이름을 고치면 위 파일과 같이 맞춘다.
//  ⚠ 다른 파일을 가져오지 않는다(node 테스트에서 그대로 읽음)
const GROUPS = [
  ["평택초저온", "베베숲 평택", "베베숲 평택(초저온)", "평택 초저온"],
  ["에브리데이 여주", "트레이더스 여주"],
  ["에브리데이 시화", "트레이더스 시화"],
  ["에브리데이 평택", "에브리데이평택", "트레이더스 평택", "이마트 평택"],
  ["유심물류", "유심물류(전원물류)"],
  ["구성리창고", "구성리 창고", "구성리", "구성창고"],
  ["그린피앤티", "그린피엔티"],
  ["마켓컬리 창원", "마켓컬리 창원/8층"],
  ["쿠팡 안성5센터", "쿠팡밀크런-안성5센터"],
  // 기준지(거래처 · 상차지) — 에이제이 단가표 엑셀 머리줄은 "제이글로벌"
  ["에이제이", "제이글로벌", "에이제이 후문", "에이제이 정문"],
];
const key = (v) => String(v || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const MAP = new Map();
GROUPS.forEach((g) => { const ks = [...new Set(g.map(key))]; ks.forEach((k) => MAP.set(k, ks)); });
// 이 이름과 같은 곳의 이름들(글자만 남긴 모양 · 자기 자신 포함)
// 🛠 2026-11-26 사용자 확인 — 트레이더스 ○○ = 에브리데이 ○○(같은 곳). 지역이 무엇이든 서로 같은 이름으로 본다(칠곡 · 비산 · 대구 · 경산 · 장성 …)
const BRAND_SWAP = [["트레이더스", "에브리데이"]];
export function aliasKeys(name) {
  const k = key(name);
  if (!k) return [];
  const out = new Set(MAP.get(k) || [k]);
  [...out].forEach((x) => BRAND_SWAP.forEach(([a, b]) => {
    if (x.startsWith(a) && x.length > a.length) out.add(b + x.slice(a.length));
    if (x.startsWith(b) && x.length > b.length) out.add(a + x.slice(b.length));
  }));
  return [...out];
}
export const aliasKey = key;
