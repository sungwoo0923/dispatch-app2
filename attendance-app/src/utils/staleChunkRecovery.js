// 배포 직후 예전 탭에 남아있던 서비스워커/캐시가 이미 삭제된 JS 청크를
// 참조하면서 나는 에러는 사용자 눈엔 그냥 "로딩 후 흰 화면"으로 보인다 —
// 새 코드를 받아오면 저절로 해결되므로, 이런 패턴을 감지하면
// 서비스워커/캐시를 정리하고 한 번만 자동으로 새로고침한다.
const RELOAD_GUARD_KEY = "kpwork_error_reload_guard";

const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk [\d]+ failed/i,
  /Unable to preload CSS/i,
  /Unexpected token '<'/i,
];

export function isStaleChunkError(error) {
  const msg = String(error?.message || error || "");
  return STALE_CHUNK_PATTERNS.some((re) => re.test(msg));
}

export async function clearStaleCachesAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best-effort cleanup */
  } finally {
    window.location.reload();
  }
}

// 아직 한 세션에서 자동복구를 시도하지 않았다면 true를 반환하고 가드를 세운다.
export function tryAutoRecoverOnce(error) {
  if (!isStaleChunkError(error)) return false;
  if (sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") return false;
  sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  clearStaleCachesAndReload();
  return true;
}

export function resetAutoRecoverGuard() {
  sessionStorage.removeItem(RELOAD_GUARD_KEY);
}
