// 🎫 2026-11-08 보안 규칙 테스트를 "로그인 토큰 권한(custom claims)이 있는 상태"로 한 번 더 돌리는 장치
//  사용: node -r ./scripts/claimsMode.cjs scripts/tenantIsolationRules.test.cjs   (CLAIMS_MODE=0 이면 아무것도 안 함)
//  @firebase/rules-unit-testing 의 authenticatedContext(uid, 토큰)에 서버 계산(functions/authClaims.js)과 똑같은 토큰 값을 넣는다.
//  · 시험 데이터를 넣을 때(withSecurityRulesDisabled)마다 users · hubMembers · companyPlans · customRoles · companyRoleOverrides 를 다시 읽어
//    "트리거가 돌고 화면이 토큰을 새로 받은" 상태를 흉내 낸다(이미 만든 사용자 화면은 그때의 토큰을 그대로 쓴다 = 실제와 같음).
//  · 시험 파일이 토큰에 직접 v를 넣었으면(예: 낡은 토큰 시험) 그 값을 그대로 둔다.
if (process.env.CLAIMS_MODE !== "0") {
  const path = require("path");
  const rut = require("@firebase/rules-unit-testing");
  const { getDocs, collection } = require("firebase/firestore");
  const root = process.env.HUB_REPO || path.resolve(__dirname, "..");
  const AC = require(path.join(root, "functions/authClaims.js"));
  const orig = rut.initializeTestEnvironment;
  const stats = { withClaims: 0, without: 0 };
  rut.initializeTestEnvironment = async (cfg) => {
    const env = await orig(cfg);
    let cache = new Map();
    const refresh = async () => {
      if (!cfg.firestore) return;
      await envDisabled(async (ctx) => {
        const db = ctx.firestore();
        const all = async (c) => { const m = new Map(); (await getDocs(collection(db, c))).forEach((d) => m.set(d.id, d.data())); return m; };
        const [users, hubs, plans, roles, ovs] = await Promise.all(["users", "hubMembers", "companyPlans", "customRoles", "companyRoleOverrides"].map(all));
        const next = new Map();
        for (const uid of new Set([...users.keys(), ...hubs.keys()])) {
          const u = users.get(uid) || null;
          let uc = null;
          if (u) {
            const cco = AC.contractCoOf(u);
            uc = AC.computeUserClaims(u, {
              plan: typeof cco === "string" ? plans.get(cco) || null : null,
              customRole: typeof u.role === "string" ? roles.get(u.role) || null : null,
              roleOverride: typeof u.companyName === "string" ? ovs.get(u.companyName) || null : null,
            }).claims;
          }
          const hc = hubs.has(uid) ? AC.computeHubClaims(hubs.get(uid), uid) : null;
          next.set(uid, AC.mergeClaims({}, uc, hc, 1));
        }
        cache = next;
      });
    };
    const origDisabled = env.withSecurityRulesDisabled.bind(env);
    const envDisabled = (fn) => origDisabled(fn);
    env.withSecurityRulesDisabled = async (fn) => { const r = await origDisabled(fn); await refresh(); return r; };
    const origAuth = env.authenticatedContext.bind(env);
    env.authenticatedContext = (uid, tok = {}) => {
      const c = cache.get(uid) || {};
      if (c.v || c.hv) stats.withClaims += 1; else stats.without += 1;
      return origAuth(uid, { ...c, ...(tok || {}) });
    };
    env.__claimsFor = (uid) => cache.get(uid) || {};
    env.__claimsRefresh = refresh;
    await refresh().catch(() => {});
    return env;
  };
  process.on("exit", () => { console.log(`[claimsMode] 토큰 권한 있는 사용자 화면 ${stats.withClaims}개 · 없는 화면 ${stats.without}개`); });
}
