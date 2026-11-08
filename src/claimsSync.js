// ======================= src/claimsSync.js =======================
// 🎫 2026-11-08 로그인 토큰 권한(custom claims) — 화면 쪽(배차 프로그램 · 허브가 같이 쓴다)
//  서버(functions/authClaims.js)가 권한(회사 · 역할 · 승인 · 부서 …)을 로그인 토큰에 넣고 users/{uid}(허브는 hubMembers/{uid}).claimsAt 을 기록한다.
//  화면은 그 문서를 이미 구독하고 있으니, claimsAt 이 토큰의 at 보다 새로우면 토큰을 새로 받는다(getIdToken(true)) → 다시 로그인할 필요 없이 바로 적용.
//  토큰에 값이 아직 없고(배포 직후 · 채우기 전) 문서에도 claimsAt 이 없으면 refreshMyClaims 를 한 번 불러 서버가 계산하게 한다.
//  firebase를 직접 부르지 않는다(허브와 배차 프로그램은 firebase 묶음이 따로) — getUser · call 을 넘겨받는다.
export function createClaimsSync({ getUser, call }) {
  let asked = "";
  let busy = null;
  async function run(stampAt) {
    const u = getUser?.();
    if (!u || typeof u.getIdTokenResult !== "function") return "no-user";
    const c = (await u.getIdTokenResult()).claims || {};
    const docAt = Number(stampAt) || 0;
    if (docAt && docAt > (Number(c.at) || 0)) { await u.getIdToken(true); return "refreshed"; }
    if (!docAt && !c.v && !c.hv && call && asked !== u.uid) {
      asked = u.uid; // 세션마다 한 번만
      const r = await call("refreshMyClaims", {}).catch(() => null);
      if (r?.changed) await u.getIdToken(true);
      return "requested";
    }
    return "ok";
  }
  return {
    // 문서 구독에서 받은 claimsAt(숫자 ms)을 넘긴다 — 여러 번 불러도 한 번에 하나만 돈다
    check(stampAt) {
      if (busy) return busy.then(() => run(stampAt)).catch(() => "error");
      busy = run(stampAt).catch(() => "error").finally(() => { busy = null; });
      return busy;
    },
  };
}
// 호출형 함수(callable) 규약 그대로 — 배차 프로그램(FUNCTIONS_BASE)용
export function fetchCaller(base, getUser) {
  return async (name, data) => {
    const token = await getUser?.()?.getIdToken?.();
    const res = await fetch(`${base}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
    let j = {};
    try { j = await res.json(); } catch { /* 무시 */ }
    if (!res.ok || j.error) throw new Error(j.error?.message || `요청 실패(${res.status})`);
    return j.result;
  };
}
