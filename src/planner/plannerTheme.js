// src/planner/plannerTheme.js — KP-Planner 색상 팔레트.
// 기본(여자 계정/로그인 전)은 화이트 + 분홍 벚꽃 톤, 남자 계정으로 로그인하면
// 전체 디자인이 네이비 + 화이트 톤으로 바뀐다.
export const PINK = "#EC6FA0";
export const PINK_DARK = "#D8578E";
export const PINK_SOFT = "#FDEEF5";
export const PINK_BORDER = "#F7D3E3";
export const INK = "#4A2E3D"; // 네이비를 대신하는 진한 로즈 차콜(본문/헤더 텍스트, 여자 테마용)

export const NAVY = "#1B2B4B";
export const NAVY_DARK = "#14203A";
export const NAVY_SOFT = "#EEF1F6";
export const NAVY_BORDER = "#D7DEE9";

// ⭐ AdminPlanner.jsx/AdminPlannerMobile.jsx는 화면 곳곳(탭/버튼/헤더/달력 등)에서
// 이 ACCENT 계열 값을 모듈 상수처럼 직접 참조한다. 컴포넌트마다 accent를 prop으로
// 일일이 내려주는 대신, 로그인한 계정의 성별에 맞는 팔레트를 앱 진입 시 한 번
// 여기에 반영해두는 방식을 쓴다 — PlannerRoot가 계정 정보를 확인하자마자, 화면을
// 그리기 전에 applyGenderTheme()을 호출한다. let 바인딩이라 이 모듈을 import하는
// 모든 파일이 재할당된 최신 값을 그대로 읽는다(ES 모듈의 live binding 특성).
export let ACCENT = PINK;
export let ACCENT_DARK = PINK_DARK;
export let ACCENT_SOFT = PINK_SOFT;
export let ACCENT_BORDER = PINK_BORDER;
// ⭐ 화면 전체 배경 — 여자 테마는 은은한 분홍기가 도는 화이트, 남자 테마는 순수
// 화이트("배경이 분홍색느낌인데 화이트색감으로 바꿔줘" 요청 반영).
export let BG = "#fffafc";

export function applyGenderTheme(gender) {
  if (gender === "male") {
    ACCENT = NAVY; ACCENT_DARK = NAVY_DARK; ACCENT_SOFT = NAVY_SOFT; ACCENT_BORDER = NAVY_BORDER; BG = "#ffffff";
  } else {
    ACCENT = PINK; ACCENT_DARK = PINK_DARK; ACCENT_SOFT = PINK_SOFT; ACCENT_BORDER = PINK_BORDER; BG = "#fffafc";
  }
}
