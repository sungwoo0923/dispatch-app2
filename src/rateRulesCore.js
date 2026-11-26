// ======================= src/rateRulesCore.js =======================
// 단가표 › 청구 규칙 [쉬운 규칙] — 계산만(화면 · firebase 없음 · scripts/rateRules.test.mjs 가 검사)
import { placeKey, levelOf } from "../functions/routePresetCore.mjs";

// ── 🧹 2026-11-26 쉬운 규칙(사용자 요청: "에이제이에서 에브리데이 · 트레이더스 시화는 야상이면 2만 원 추가, 상차비용 5만 원도 추가 청구 · 상차비용은 기사에게도 똑같이")
//  ① 야상 추가 청구 — 이 거래처 모든 노선(거래처 전체 규칙) · 할증 "야상" · 지급 없음 · 청구 · 야간 상차일 때만
//  ② 하차지별 상차비용(대행료) — 그 하차지(상차지 상관없음) · 기타 "대행료" · 기사에게 · 청구(청구 + · 기사운임 +)
//  저장하면 그 하차지에 겹쳐 있던 예전 규칙(지게차 · 야간할증 · 다른 대행료 · 같은 곳 다른 이름 트레이더스/에브리데이)을 지우고 한 개로 다시 쓴다
export const NIGHT_ITEM = (amt) => ({ 종류: "할증", 이름: "야상", 금액: amt, 받는사람: "없음", 부담: "청구", 조건: "야간" });
export const AGENCY_ITEM = (amt) => ({ 종류: "기타", 이름: "대행료", 금액: amt, 받는사람: "기사", 부담: "청구", 조건: "항상" });
export const isAgencyName = (v) => /대행|상차비/.test(String(v || ""));
export const isNightName = (v) => /야상|야간/.test(String(v || ""));
// 쉬운 규칙이 다루는 항목(정리할 때 지우는 것) — 지게차 · 할증 · 대행료/상차비용 · 야상
export const simpleOwned = (it) => it.종류 === "지게차" || it.종류 === "할증" || (it.종류 === "기타" && (isAgencyName(it.이름) || isNightName(it.이름)));
export const isCleanAgency = (it) => it.종류 === "기타" && isAgencyName(it.이름) && it.받는사람 === "기사" && it.부담 === "청구" && (it.조건 || "항상") === "항상";
export function simpleRulesOf(presets = [], client = "") {
  const ck = placeKey(client);
  const mine = (presets || []).filter((p) => p && !p.legacy && ck && placeKey(p.거래처명) === ck);
  const wide = mine.filter((p) => levelOf(p) >= 2); // 하차지가 없는 규칙(거래처 전체 · 거래처+상차지)
  const nightItems = wide.flatMap((p) => (p.items || []).filter((it) => it.종류 === "할증" || isNightName(it.이름)).map((it) => ({ ...it, p })));
  const night = nightItems.find((x) => levelOf(x.p) === 3 && x.조건 === "야간" && x.받는사람 === "없음" && x.부담 === "청구");
  const nightMessy = nightItems.length > (night ? 1 : 0);
  const groups = new Map();
  mine.filter((p) => levelOf(p) <= 1).forEach((p) => {
    const k = placeKey(p.하차지명);
    if (!groups.has(k)) groups.set(k, { key: k, name: p.하차지명, docs: [] });
    groups.get(k).docs.push(p);
  });
  const drops = [...groups.values()].map((g) => {
    const items = g.docs.flatMap((p) => (p.items || []).map((it) => ({ ...it, p })));
    const owned = items.filter(simpleOwned);
    const agency = owned.filter(isCleanAgency);
    const clean = g.docs.length === 1 && levelOf(g.docs[0]) === 1 && owned.length === agency.length && agency.length <= 1;
    return { ...g, items, owned, amount: clean && agency[0] ? agency[0].금액 : 0, clean, other: items.filter((it) => !simpleOwned(it)) };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
  return { night: night ? night.금액 : 0, nightMessy, nightItems, wide, drops };
}
