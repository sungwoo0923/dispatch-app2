// ======================= src/lazyRetry.js =======================
// 🛠 2026-11-18 "화면을 불러오는 중 오류가 발생했습니다 — undefined is not an object (evaluating 'L._result.default')"
//  (기사앱에서 로그아웃할 때 사장님이 보신 화면) — 원인: 앱을 켜 둔 사이 새 버전이 배포되면 예전 화면 조각 파일이 서버에서 사라진다.
//  그 뒤 처음 여는 화면(로그아웃 → 로그인 화면 등)이 그 파일을 못 받으면, 오류를 던지지 않게 막아 둔 vite:preloadError 때문에
//  화면이 "빈 값"으로 와서 React 가 위 오류를 냈다. 예전 자동 새로고침은 30초에 한 번만이라 그 안에 또 나면 오류 화면이 남았다.
//  이제 화면 조각을 못 받거나 빈 값이면 → 로딩 점을 보여 준 채 바로 새 버전으로 다시 연다(1분에 2번까지). 그래도 안 되면 오류 화면.
import React from "react";

const KEY = "kpLazyReload";
function reloadForStale() {
  try {
    const now = Date.now();
    const list = JSON.parse(sessionStorage.getItem(KEY) || "[]").filter((t) => now - t < 60000);
    if (list.length >= 2) return false;
    list.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* 저장 못 해도 한 번은 새로 연다 */ }
  try { window.location.reload(); return true; } catch { return false; }
}

export function lazyRetry(factory) {
  return React.lazy(() => factory().then((m) => {
    if (m && m.default) return m;
    throw new Error("화면 파일이 비어 있어요(새 버전 배포 직후)");
  }).catch((err) => {
    if (typeof window !== "undefined" && reloadForStale()) return new Promise(() => {}); // 새로 여는 동안 로딩 점 그대로
    throw err;
  }));
}
