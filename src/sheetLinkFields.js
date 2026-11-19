// ======================= src/sheetLinkFields.js =======================
// ⭐ 2026-11-17 구글시트 줄 연결값 — 새로 만드는 오더(복사 등록 · 정기오더 · 되돌리기 등)에는 넘기지 않는다
//  원본 필드를 통째로 복사하면 복사본이 원본의 줄 주소(이전출처 "탭!줄")를 그대로 가져갔다
//  → 복사본을 고치면 시트의 원본 줄을 덮어쓰고, 복사본을 지우면 원본 줄이 시트에서 지워졌다(JY "시트에 적은 게 한두 개씩 사라짐")
//  담당노선구분(= 시트 탭)은 남긴다 → 새 오더는 같은 탭에 자기 줄로 들어간다(functions/sheetPushOrders.js)
//  서버도 같은 것을 막는다(줄 주소를 가진 채 새로 생긴 오더는 주소를 떼고 새 줄로) — 이건 처음부터 안 넘기는 쪽
export const SHEET_LINK_FIELDS = ["이전출처", "시트연동", "시트반영일시", "시트기록일시", "시트탭필요", "시트탭후보", "_sheetKeys", "_programKeys", "_sheetBase", "_sheetWayRaw", "이전줄수", "importBatchId"];

export function stripSheetLink(rec) {
  if (!rec || typeof rec !== "object") return rec;
  const out = { ...rec };
  SHEET_LINK_FIELDS.forEach((k) => { delete out[k]; });
  if (out.등록기기 === "구글시트 이전") delete out.등록기기; // 새 오더는 등록한 기기(PC · 모바일)로
  return out;
}
