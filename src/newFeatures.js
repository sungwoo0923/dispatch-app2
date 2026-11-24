// ======================= src/newFeatures.js =======================
// ✨ 2026-11-24 새 메뉴 · 새 기능 표시(NEW) — 사용자 요청: "새로 생긴 메뉴나 기능은 새로운 표시, 들어가서 확인하면 없어지게"
//  · 메뉴 항목에 newKey 를 붙이면(KpSubNav · 모바일 메뉴) 아직 안 열어 본 사람에게 NEW 표시가 붙는다
//  · 한 번 열면 계정 설정(prefs.newSeen)에 기록 → 다른 PC · 휴대폰에서도 사라진다
//  · 기한(until)이 지나면 열지 않아도 저절로 사라진다(오래된 표시가 계속 남지 않게)
//  새 기능을 넣으면 아래 목록에 한 줄 추가하고, 메뉴 항목에 newKey 를 붙이면 된다.
import { usePref, setPref, getPref } from "./ColumnLayout";

export const NEW_FEATURES = {
  "home:edu": { label: "규정 · 교육 › 안전교육", until: "2026-12-31" },
  "hr:edu": { label: "인사관리부 › 안전교육 현황", until: "2026-12-31" },
};

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const isLiveNew = (key) => !!(key && NEW_FEATURES[key] && today() <= NEW_FEATURES[key].until);

// 지금 이 사람에게 NEW 를 보여 줄지
export function useNewSeen() {
  const seen = usePref("newSeen") || {};
  return { isNew: (key) => isLiveNew(key) && !seen[key], seen };
}
export function markNewSeen(key) {
  if (!isLiveNew(key)) return;
  const cur = getPref("newSeen") || {};
  if (cur[key]) return;
  setPref("newSeen", { ...cur, [key]: Date.now() });
}
