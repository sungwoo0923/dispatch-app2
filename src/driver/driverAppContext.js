// src/driver/driverAppContext.js
// ⭐ 2026-11-08 사장님 요청 — 기사앱은 기사 계정만 쓴다(직원·관리자·화주·임원 계정은 기사앱 안에서 로그인·사용 불가).
//  "기사앱 안"이란
//   1) 안드로이드 기사 APK(Capacitor) — window.Capacitor.isNativePlatform() === true
//   2) 기사 화면(/driver-*)에서 "홈 화면에 추가"한 기사앱(PWA, manifest-driver.json · display standalone)
//      - 시작 주소가 /driver-login?src=driverapp 이고(예전 설치본은 /driver-login), 아이폰은 그때 보던 /driver-* 주소로 열린다
//      - 한 번 기사앱으로 열리면 localStorage에 kpDriverApp=1 을 남긴다(아이폰 홈 화면 앱은 사파리와 저장소가 따로라 그 앱 안에서만 남는다)
//      - 이 표시는 "홈 화면 앱으로 실행 중(standalone)"일 때만 본다 → 일반 브라우저 탭은 잠기지 않는다
//  로지스웹 본 앱(PWA, manifest.json 시작 /app)은 /app 으로 열리므로 기사앱으로 보지 않는다(같은 폰 안드로이드에 둘 다 깔려도 각자 판단).
//  판단 결과는 그 창(탭) 동안 sessionStorage에 고정 — 앱 안에서 화면을 옮겨 다녀도 바뀌지 않는다.

export const DRIVER_APP_FLAG = "kpDriverApp";
const SESSION_KEY = "kpDriverAppCtx";

export function isNativeApk() {
  try { return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.(); } catch { return false; }
}

export function isStandaloneDisplay() {
  try {
    if (typeof window === "undefined") return false;
    if (window.navigator?.standalone === true) return true; // 아이폰 홈 화면 앱
    const mm = window.matchMedia;
    if (typeof mm !== "function") return false;
    return ["standalone", "fullscreen", "minimal-ui"].some((m) => mm(`(display-mode: ${m})`).matches);
  } catch { return false; }
}

let cached = null;

// 앱이 처음 열릴 때 한 번 판단한다(App.jsx가 모듈을 불러올 때 호출)
export function initDriverAppContext() {
  if (cached !== null) return cached;
  if (isNativeApk()) { cached = true; return cached; }
  if (!isStandaloneDisplay()) { cached = false; return cached; }
  try {
    const fixed = sessionStorage.getItem(SESSION_KEY);
    if (fixed === "1" || fixed === "0") { cached = fixed === "1"; return cached; }
  } catch { /* 무시 */ }
  let path = "/";
  let src = "";
  try { path = window.location.pathname || "/"; src = new URLSearchParams(window.location.search).get("src") || ""; } catch { /* 무시 */ }
  let on;
  if (src === "driverapp" || path.startsWith("/driver")) {
    on = true;
    try { localStorage.setItem(DRIVER_APP_FLAG, "1"); } catch { /* 무시 */ }
  } else if (path === "/app" || path.startsWith("/app/")) {
    // 로지스웹 본 앱(시작 /app)으로 열렸다 — 안드로이드는 두 앱이 저장소를 같이 쓰므로 기사앱 표시를 지운다
    on = false;
    try { localStorage.removeItem(DRIVER_APP_FLAG); } catch { /* 무시 */ }
  } else {
    try { on = localStorage.getItem(DRIVER_APP_FLAG) === "1"; } catch { on = false; }
  }
  try { sessionStorage.setItem(SESSION_KEY, on ? "1" : "0"); } catch { /* 무시 */ }
  cached = on;
  return cached;
}

export function isDriverAppContext() {
  return cached !== null ? cached : initDriverAppContext();
}

// 기사앱 안에서 기사 아닌 계정이 들어왔을 때 안내
export const DRIVER_APP_ONLY_ERROR = {
  code: "driver/app-only",
  tone: "stop",
  title: "기사 전용 앱이에요",
  message: "사무실 계정은 로지스웹 앱이나 PC에서 로그인해 주세요.",
  hint: "",
};

// 로그아웃 뒤 화면이 새로 고쳐져도(로그아웃 때 기기 저장본 정리 → 새로고침) 안내가 남도록 sessionStorage에 2분 동안 둔다
const KICK_KEY = "kpDriverAppOnlyAt";
export function markDriverAppOnlyKick() {
  try { sessionStorage.setItem(KICK_KEY, String(Date.now())); } catch { /* 무시 */ }
}
export function peekDriverAppOnlyKick() {
  try {
    const at = Number(sessionStorage.getItem(KICK_KEY) || 0);
    if (at && Date.now() - at < 120000) return { ...DRIVER_APP_ONLY_ERROR };
    if (at) sessionStorage.removeItem(KICK_KEY);
  } catch { /* 무시 */ }
  return null;
}
export function clearDriverAppOnlyKick() {
  try { sessionStorage.removeItem(KICK_KEY); } catch { /* 무시 */ }
}

// 시험용 — 판단을 다시 하게 한다
export function _resetDriverAppContextForTest() { cached = null; }
