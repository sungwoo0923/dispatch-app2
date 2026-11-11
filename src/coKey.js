// ======================= src/coKey.js =======================
// 🏢 회사별 문서 이름(2026-11-01) — 거래처명·하차지명·차량번호를 문서 이름으로 쓰던 곳이
//  다른 운송사의 같은 이름 문서를 덮어쓰거나(규칙 잠금 전) 저장이 거부되던(잠금 후) 문제.
//  기본 회사(예전부터 쓰던 회사)는 기존 문서와 이어지도록 그대로, 다른 회사는 "회사__이름".
import { DEFAULT_COMPANY } from "./firebase";
export const coDocKey = (company, key) => {
  const co = String(company || "").trim();
  // ⭐ 2026-11-11 이름에 "/" 가 들어가면(예: "대한종합물류/결제 5.15.말/041-…") Firestore가 폴더 구분으로 읽어 저장이 실패했다 → 문서 이름에서만 "_" 로 바꾼다(화면에 보이는 이름은 그대로)
  const k = String(key ?? "").replace(/\//g, "_");
  return co && co !== DEFAULT_COMPANY ? `${co.replace(/\//g, "_")}__${k}` : k;
};
