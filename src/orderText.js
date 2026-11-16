// ======================= src/orderText.js =======================
// 🛠 2026-11-16 오더 글자 칸 맞추기 — 구글시트 · 엑셀에서 온 값이 숫자(예: 차량번호 1234, 전화번호 1012345678)로 저장되면
//  화면 곳곳의 (r.차량번호 || "").trim() 같은 코드가 "trim is not a function"으로 화면 전체를 멈췄다.
//  오더를 불러올 때(PC 실시간 · 예전 오더 · 모바일) 글자 칸이 숫자이면 글자로 바꿔 둔다. 바꿀 게 없으면 원래 객체 그대로(복사 안 함).
export const ORDER_TEXT_KEYS = [
  "차량번호", "이름", "기사명", "전화번호", "거래처명", "상차지명", "하차지명", "상차지주소", "하차지주소", "화물내용",
  "차량톤수", "차량종류", "지급방식", "배차방식", "메모", "상차일", "하차일", "상차시간", "하차시간", "배차상태", "담당노선구분",
  "상차지담당자", "상차지담당자번호", "하차지담당자", "하차지담당자번호", "등록자명", "작성자", "상태",
];
export function textifyOrder(data) {
  if (!data || typeof data !== "object") return data;
  let out = null;
  for (const k of ORDER_TEXT_KEYS) {
    const v = data[k];
    if (v == null || typeof v === "string") continue;
    if (typeof v === "number" || typeof v === "boolean") { if (!out) out = { ...data }; out[k] = String(v); }
  }
  return out || data;
}
