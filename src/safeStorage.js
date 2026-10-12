// ⭐ localStorage가 꽉 차면(QuotaExceededError, 코드 22) setItem이 예외를 던져
// 로그인 같은 중요한 저장까지 실패했다. 꽉 찼을 때는 로그인 정보가 아닌 큰 캐시부터
// 지우고 다시 저장한다.
const KEEP = new Set([
  "transportLoginSaved", "driverLoginSaved", "loginCompany", "userCompany", "transportCode", "role",
]);
export const isQuota = (e) => e && (e.code === 22 || e.code === 1014 || e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");

// 큰 항목부터 지워 needBytes 이상 확보(또는 지울 게 없을 때까지)
export function freeLocalStorage(needBytes = 512 * 1024) {
  let freed = 0;
  try {
    const items = Object.keys(localStorage)
      .filter(k => !KEEP.has(k) && !k.startsWith("firebase"))
      .map(k => ({ k, size: (localStorage.getItem(k) || "").length * 2 }))
      .sort((a, b) => b.size - a.size);
    for (const { k, size } of items) {
      if (freed >= needBytes) break;
      try { localStorage.removeItem(k); freed += size; } catch { /* noop */ }
    }
  } catch { /* noop */ }
  return freed;
}

export function safeLocalSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) {
    if (!isQuota(e)) return false;
    freeLocalStorage(Math.max(512 * 1024, String(value).length * 4));
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
}

// 전체 사용량(바이트, UTF-16 기준 대략값)
export function localStorageBytes() {
  let n = 0;
  try { for (const k of Object.keys(localStorage)) n += (k.length + (localStorage.getItem(k) || "").length) * 2; } catch { /* noop */ }
  return n;
}
// 앱 시작/로그인 직전 — 4MB를 넘으면 큰 캐시부터 정리해 여유를 만든다(브라우저 한도 약 5MB)
export function trimLocalStorage(limit = 4 * 1024 * 1024) {
  const used = localStorageBytes();
  if (used > limit) freeLocalStorage(used - limit + 1024 * 1024);
}
