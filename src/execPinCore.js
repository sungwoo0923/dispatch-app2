// ======================= src/execPinCore.js =======================
// 🔐 2026-11-27 인사이트 · 지입차관리 PIN — 화면 쪽 계산(서버 functions/execPin.js 의 pinProblem 과 같은 답)
//  ⚠ 진짜 확인은 서버가 한다. 여기서는 서버에 보내기 전에 미리 알려 주는 용도 · scripts/execPin.test.cjs 가 둘을 같이 검사한다
export const EXEC_PIN_LEN = 6; // 화면 숫자 패드는 6자리(서버는 4~8자리 숫자를 받는다)
export const LEGACY_PIN_KEYS = ["exec_intel_pin_v1", "exec_intel_biometric_v1", "exec_intel_biometric_auto_v1"]; // 예전 기기 저장 PIN — 더는 안 쓴다

export const normPin = (p) => String(p ?? "").trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
export function isEasyPin(p) {
  if (/^(\d)\1+$/.test(p)) return true;
  const d = p.split("").map(Number);
  const step = d[1] - d[0];
  if (step !== 1 && step !== -1) return false;
  return d.every((x, i) => i === 0 || x - d[i - 1] === step);
}
export function pinProblem(pin) {
  const p = normPin(pin);
  if (!/^\d+$/.test(p)) return "PIN 은 숫자만 쓸 수 있어요";
  if (p.length < 4) return "PIN 은 4자리 이상으로 정해 주세요";
  if (p.length > 8) return "PIN 은 8자리까지 돼요";
  if (isEasyPin(p)) return "너무 쉬운 번호예요. 다른 번호로 정해 주세요";
  return "";
}
// 남은 잠금 시간(분, 올림)
export const lockMinutesLeft = (lockUntil, now = Date.now()) => (lockUntil > now ? Math.max(1, Math.ceil((lockUntil - now) / 60000)) : 0);
// 서버에 닿지 못한 오류(아이폰 사파리 "Load failed" · 크롬 "Failed to fetch" · 서버 함수가 아직 없을 때 404 · 5xx)
export const isNetErr = (e) => /load failed|failed to fetch|networkerror|network request failed|요청 실패\((0|404|5\d\d)\)/i.test(String(e?.message || e));
// 서버 verify 결과를 안내 글로
export function verifyMessage(r, now = Date.now()) {
  if (r?.ok) return "";
  if (r?.lockUntil) return `여러 번 틀려 잠겼어요. ${lockMinutesLeft(r.lockUntil, now)}분 뒤 다시 해 주세요`;
  if (typeof r?.left === "number") return `PIN 이 맞지 않아요 (${r.left}번 남았어요)`;
  return "PIN 이 맞지 않아요";
}
