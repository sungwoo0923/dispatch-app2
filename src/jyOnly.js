// ======================= src/jyOnly.js =======================
// 🏷 2026-11-12 JY로지스틱스 전용 기능 스위치 — 사용자 요청: "지금 하는 것들은 전부 JY로지스틱스에만 반영"
//  · 단가표 자동 입력(오더등록 청구운임 · 기사운임) · 단가표 엑셀 여러 장 한 번에 등록 · 회사 단가표 엑셀 그대로 읽기
//  · 특수운임 "지급 없음(청구만)" 선택 · 구글시트 이전 규칙(만세보령 등 — functions/carrierMigrateCore.mjs PRESET_SUGGESTIONS)
//  다른 운송사에도 열려면 ONLY_COMPANIES에 회사 이름을 추가한다.
import { getTenant } from "./fsTenant";
export const ONLY_COMPANIES = ["JY로지스틱스"];
const ls = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
// 지금 보고 있는 회사가 전용 대상인지 — 넘겨준 회사 이름 → 지금 회사(최고관리자는 들어가 있는 회사) → 로그인 회사
export function isJyCompany(...names) {
  const cands = [...names, getTenant?.(), ls("loginCompany"), ls("userCompany")].map((x) => String(x || "").trim()).filter(Boolean);
  // 띄어쓰기 · (주) · 한글 표기("제이와이로지스틱스")가 달라도 같은 회사로 본다
  const key = (v) => String(v || "").toLowerCase().replace(/\(주\)|㈜|주식회사/g, "").replace(/[^0-9a-z가-힣]/g, "").replace(/제이와이/g, "jy");
  return cands.length > 0 && ONLY_COMPANIES.some((n) => key(n) === key(cands[0]));
}
