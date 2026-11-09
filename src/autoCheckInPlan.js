// ======================= src/autoCheckInPlan.js =======================
// ⏰ 2026-11-09 PC 자동 출근 — "언제 다시 시도할지"만 정하는 순수 함수(파이어베이스 없음 · node 테스트: scripts/autoCheckIn.test.mjs)
//  예전 문제: 화면이 처음 그려질 때 딱 한 번만 시도했다.
//   · 브라우저를 켜 둔 채(탭이 열린 채) 다음날 그 탭으로 들어오면 다시 시도하지 않음 → 브라우저를 껐다 켜야(탭이 새로 열려야) 출근
//   · 로그인 직후 서버 저장이 한 번 실패하면(권한 토큰이 아직 안 받아짐 · 네트워크) 다시 시도하지 않음
//  이제: 처음 열 때 + 탭이 다시 보일 때(visibilitychange) + 창에 다시 들어올 때(focus) + 인터넷이 다시 연결될 때 + 5분마다,
//  "오늘 처리 끝"(출근함 · 이미 기록 있음 · 휴가 · 퇴근시간 지남 · 주말 팝업 띄움)이 아니면 다시 시도한다.
//  날짜가 바뀌면(자정 넘김) 새날로 보고 다시 시도한다. 실제 중복 방지는 서버 문서(attendance/{날짜}_{uid}) 확인(tryAutoCheckIn)이 한다.

export const RETRY_ERROR_MS = 60 * 1000;      // 저장 실패 · 알 수 없는 결과 → 1분 뒤
export const RETRY_EARLY_MS = 5 * 60 * 1000;  // 출근 가능 시간 전 → 5분마다
export const TICK_MS = 5 * 60 * 1000;         // 켜 둔 화면의 주기 확인(자정 넘김 대비)

// tryAutoCheckIn 결과 → { done: 오늘은 더 안 함, retryMs?, weekendPopup? }
export function planAfterResult(r) {
  if (!r) return { done: false, retryMs: RETRY_ERROR_MS };
  if (r.ok) return { done: true };
  switch (r.reason) {
    case "exists": case "leave": case "late": case "no-user": return { done: true };
    case "weekend": return { done: true, weekendPopup: true };
    case "early": return { done: false, retryMs: RETRY_EARLY_MS };
    default: return { done: false, retryMs: RETRY_ERROR_MS }; // 오류(권한 토큰 준비 전 · 네트워크) → 다시
  }
}

// 지금 시도해도 되는지 — state = { doneDay, busy, nextAt }
//  · force(탭이 다시 보임 · 창 포커스 · 온라인)면 재시도 대기 시간(nextAt)을 무시하고 바로
export function shouldAttempt(state, today, nowMs, force = false) {
  if (!state || state.busy) return false;
  if (state.doneDay === today) return false;
  if (!force && state.nextAt && nowMs < state.nextAt) return false;
  return true;
}

// 결과를 반영한 새 state
export function applyResult(state, today, r, nowMs) {
  const p = planAfterResult(r);
  return { ...state, busy: false, doneDay: p.done ? today : state.doneDay, nextAt: p.done ? 0 : nowMs + (p.retryMs || RETRY_ERROR_MS), weekendPopup: !!p.weekendPopup };
}
