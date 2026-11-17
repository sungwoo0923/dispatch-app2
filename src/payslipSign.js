// ======================= src/payslipSign.js =======================
// ⭐ 2026-11-17 급여명세서 수령 확인 서명 — 직원이 발행된 본인 명세서를 열어 [확인하고 서명하기] → 손글씨 서명(또는 "확인했어요" + 이름)
//  · 명세서 문서(payslips/{회사}_{YYYY-MM}_{uid})에 서명 칸 3개만 더한다: signedAt(서버 시각) · signName(이름) · signImg(작은 PNG dataURL, 없으면 "")
//  · firestore.rules 가 같은 칸 이름 · 크기 한도를 검사한다(SIGN_KEYS · SIGN_IMG_MAX 를 바꾸면 규칙도 같이)
//  · 경리 화면: 직원 목록 · 명세서 미리보기 · 인쇄에 빨간 동그라미 도장 "서명완료 11.17"
//  · 확정 해제하면 서명도 지운다(내용이 바뀔 수 있으므로 다시 발행 → 다시 서명)
//  순수 함수만(파이어베이스 없이) — node scripts/payslipSign.test.mjs
export const SIGN_KEYS = ["signedAt", "signName", "signImg"];
export const SIGN_IMG_MAX = 60000; // dataURL 글자 수 한도(규칙과 같음) — 360×120 흑백 서명은 보통 3~15천 자
export const SIGN_NAME_MAX = 30;
const PNG_HEAD = "data:image/png;base64,";

// Firestore Timestamp · 숫자 · {seconds} · Date → 밀리초(없으면 0)
export function toMs(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000 + Math.round((v.nanoseconds || 0) / 1e6);
  return 0;
}
// 서명했는가 — 서버 시각이 아직 안 돌아온 순간(signedAt null)도 이름이 있으면 서명한 것으로
export const isSigned = (slip) => !!slip && (toMs(slip.signedAt) > 0 || (!!slip.signName && slip.signedAt === null));
// 서명할 수 있는가(직원 본인 · 발행됨 · 확정 또는 지급 · 아직 서명 전)
export function canSign(slip, uid) {
  return !!slip && !!uid && slip.uid === uid && slip.published === true && ["confirmed", "paid"].includes(slip.status) && !isSigned(slip);
}
// 한국 시각 날짜 조각
function kst(ms) { const d = new Date(ms + 9 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }; }
const p2 = (n) => String(n).padStart(2, "0");
// 도장 안 날짜 "11.17"
export function stampDate(slip) { const ms = toMs(slip?.signedAt); if (!ms) return ""; const t = kst(ms); return `${p2(t.m)}.${p2(t.d)}`; }
// 긴 날짜 "2026.11.17 14:05"
export function signTimeText(slip) { const ms = toMs(slip?.signedAt); if (!ms) return ""; const t = kst(ms); return `${t.y}.${p2(t.m)}.${p2(t.d)} ${p2(t.hh)}:${p2(t.mm)}`; }

// 서명 입력 검사 — 오류 문구(없으면 "")
export function signError(name, img) {
  const n = String(name || "").trim();
  if (!n) return "이름을 적어 주세요";
  if (n.length > SIGN_NAME_MAX) return `이름은 ${SIGN_NAME_MAX}자까지 적을 수 있어요`;
  if (img) {
    if (typeof img !== "string" || !img.startsWith(PNG_HEAD)) return "서명 그림을 읽지 못했어요. 다시 써 주세요";
    if (img.length > SIGN_IMG_MAX) return "서명 그림이 너무 커요. [다시 쓰기] 후 조금 작게 써 주세요";
  }
  return "";
}
// 저장할 칸 — at 에는 serverTimestamp() 를 넣는다(규칙: signedAt == request.time)
export function signPatch(name, img, at) {
  return { signedAt: at, signName: String(name || "").trim().slice(0, SIGN_NAME_MAX), signImg: img && img.startsWith(PNG_HEAD) ? img : "" };
}
// 직원이 바꾸려는 칸이 서명 칸(+ 읽음)뿐인가 — 규칙과 같은 판단(화면에서 먼저 막기 · 테스트용)
export function employeePatchOk(before, patch) {
  const keys = Object.keys(patch || {});
  if (!keys.length) return false;
  if (keys.every((k) => k === "readAt")) return true;
  if (isSigned(before)) return false;
  if (!["confirmed", "paid"].includes(before?.status) || before?.published !== true) return false;
  if (!keys.every((k) => k === "readAt" || SIGN_KEYS.includes(k))) return false;
  if (!keys.includes("signedAt") || !keys.includes("signName")) return false;
  return !signError(patch.signName, patch.signImg);
}
// 확정 해제 때 지울 칸(deleteField 를 넣어 쓴다)
export const clearSignPatch = (del) => Object.fromEntries(SIGN_KEYS.map((k) => [k, del]));
