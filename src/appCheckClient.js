// ======================= src/appCheckClient.js =======================
// 🛡 2026-11-08 Firebase App Check(웹) — 본체(src/firebase.js)와 허브(cafe-site/src/firebase.js)가 같이 쓴다.
//  · 사이트 키(VITE_APPCHECK_SITE_KEY)가 없으면 아무것도 하지 않는다 → 설정 전에는 지금과 똑같이 동작
//  · reCAPTCHA Enterprise 로 토큰을 받고 자동 갱신(isTokenAutoRefreshEnabled)
//  · 개발: VITE_APPCHECK_DEBUG=1 → 브라우저 콘솔에 "디버그 토큰"이 찍힌다 → Firebase 콘솔 App Check › 앱 › 디버그 토큰 관리에 등록
//  · 휴대폰 앱(Capacitor 기사앱)은 건너뛴다 — 후속 작업: Play Integrity(@capacitor-firebase/app-check). docs/appcheck-setup.md
//  · 서버 함수(FUNCTIONS_BASE 로 시작하는 주소)로 가는 fetch 에 X-Firebase-AppCheck 헤더를 자동으로 붙인다
//    (fetch 를 부르는 곳이 20곳이 넘어 한 군데서 붙인다 — 다른 주소로 가는 요청은 건드리지 않는다)
//  ⚠️ firebase SDK 는 각 앱이 자기 것을 넘긴다(sdk) — 허브는 자기 node_modules 의 firebase 를 써야 해서 여기서 import 하지 않는다.
export const APPCHECK_HEADER = "X-Firebase-AppCheck";

export function setupAppCheck({ app, sdk, siteKey, debug, functionsBase, disabled }) {
  if (!siteKey || disabled || typeof window === "undefined") return null;
  try { if (window.Capacitor?.isNativePlatform?.()) return null; } catch { /* 무시 */ }
  if (debug && debug !== "0") {
    // "1" 이면 SDK가 새 디버그 토큰을 만들어 콘솔에 찍는다. 등록해 둔 토큰 값을 직접 넣어도 된다.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debug === "1" || debug === "true" ? true : debug;
  }
  let appCheck;
  try {
    appCheck = sdk.initializeAppCheck(app, { provider: new sdk.ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
  } catch (e) {
    console.warn("[AppCheck] 초기화 실패 — App Check 없이 계속합니다:", e?.message || e);
    return null;
  }
  if (functionsBase) installFunctionsHeader(appCheck, sdk.getToken, functionsBase);
  return appCheck;
}

// 토큰 받기(최대 3초) — 실패하면 빈 값(요청은 그대로 보낸다: 서버 monitor 모드에서는 로그만, enforce 에서는 401)
export async function appCheckTokenOf(appCheck, getToken, ms = 3000) {
  if (!appCheck) return "";
  try {
    const r = await Promise.race([getToken(appCheck, false), new Promise((ok) => setTimeout(() => ok(null), ms))]);
    return r && !r.error && r.token ? r.token : "";
  } catch { return ""; }
}

function installFunctionsHeader(appCheck, getToken, base) {
  if (typeof window.fetch !== "function" || window.__kpAppCheckFetch) return;
  const orig = window.fetch.bind(window);
  window.__kpAppCheckFetch = true;
  window.fetch = async (input, init) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : "";
      if (url && url.startsWith(base) && init?.mode !== "no-cors") {
        const headers = new Headers(init?.headers || {});
        if (!headers.has(APPCHECK_HEADER)) {
          const token = await appCheckTokenOf(appCheck, getToken);
          if (token) { headers.set(APPCHECK_HEADER, token); init = { ...(init || {}), headers }; }
        }
      }
    } catch { /* 헤더를 못 붙여도 요청은 그대로 */ }
    return orig(input, init);
  };
}
