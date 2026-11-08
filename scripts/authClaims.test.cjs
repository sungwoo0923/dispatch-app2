// 🎫 2026-11-08 로그인 토큰 권한(custom claims) 계산 단위 테스트 — 에뮬레이터 없이
//  실행: node scripts/authClaims.test.cjs
const assert = require("node:assert/strict");
const path = require("path");
const AC = require(path.resolve(__dirname, "../functions/authClaims.js"));

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass += 1; console.log(`  ✓ ${name}`); } catch (e) { fail += 1; console.log(`  ✗ ${name}\n     ${e?.message || e}`); }
}
const cu = (u, ctx) => AC.computeUserClaims(u, ctx);

(async () => {
  await t("일반 직원", () => {
    const { claims: c } = cu({ companyName: "에이", role: "user", approved: true, team: "배차팀" });
    assert.equal(c.v, 1); assert.equal(c.co, "에이"); assert.equal(c.r, "user");
    assert.equal(c.ap, true); assert.equal(c.st, true); assert.equal(c.ce, false); assert.equal(c.tm, false);
    assert.equal(c.fin, false); assert.equal(c.pay, false); assert.equal(c.hr, false); assert.equal(c.exec, false); assert.equal(c.fm, "hidden");
  });
  await t("승인값 없음 = 승인(예전 계정) · false = 미승인 · 퇴사", () => {
    assert.equal(cu({ companyName: "a", role: "user" }).claims.ap, true);
    assert.equal(cu({ companyName: "a", role: "user", approved: null }).claims.ap, true);
    assert.equal(cu({ companyName: "a", role: "user", approved: false }).claims.ap, false);
    assert.equal(cu({ companyName: "a", role: "user", employmentStatus: "퇴사" }).claims.st, false);
    assert.equal(cu({ companyName: "a", role: "user", employmentStatus: "재직" }).claims.st, true);
  });
  await t("부서 이름 조건(규칙과 같은 전체 일치)", () => {
    const f = (team) => cu({ companyName: "a", role: "user", team }).claims;
    assert.equal(f("경리팀").fin, true); assert.equal(f("재무회계부").fin, true); assert.equal(f("총무팀").fin, false);
    assert.equal(f("총무팀").pay, true); assert.equal(f("인사총무").hr, true); assert.equal(f("임원").tx, true); assert.equal(f("임원실").tx, false);
  });
  await t("직책 — 임원 · 대표", () => {
    const f = (position) => cu({ companyName: "a", role: "user", position }).claims;
    assert.equal(f("상무").xp, true); assert.equal(f("상무").ceo, false); assert.equal(f("대표이사").ceo, true); assert.equal(f("과장").xp, false);
    assert.equal(f(" 대표").ceo, false); // 규칙은 trim 하지 않는다
  });
  await t("마스터 · 부관리자 · 화주 마스터 · 연동 운송사", () => {
    const c = cu({ companyName: "s", role: "shipper", isMaster: true, permissions: { master: true }, linkedTransportCompany: { companyName: "에이" } }).claims;
    assert.equal(c.ms, true); assert.equal(c.pm, true); assert.equal(c.sh, "에이");
    const m = cu({ companyName: "a", role: "totalMaster", subAdmin: true }).claims;
    assert.equal(m.tm, true); assert.equal(m.sa, true);
    assert.equal(cu({ companyName: "a", role: "user", isMaster: "true" }).claims.ms, false); // == true 만
  });
  await t("계약종료 — 화주는 연동 운송사 기준", () => {
    assert.equal(cu({ companyName: "a", role: "user" }, { plan: { status: "ended" } }).claims.ce, true);
    assert.equal(cu({ companyName: "a", role: "user" }, { plan: { status: "active" } }).claims.ce, false);
    assert.equal(AC.contractCoOf({ role: "shipper", companyName: "s", linkedTransportCompany: { companyName: "에이" } }), "에이");
    assert.equal(AC.contractCoOf({ role: "shipper", companyName: "s" }), "");
    assert.equal(cu({ companyName: "s", role: "shipper" }, { plan: { status: "ended" } }).claims.ce, false); // 연동 없음 = 볼 회사 없음
  });
  await t("임원 역할 · 자금 메뉴 — 회사별 설정이 공통 역할을 덮는다", () => {
    assert.deepEqual(AC.roleInfo("custom1", { label: "임원 A" }, null), { exec: true, fm: "hidden" });
    assert.deepEqual(AC.roleInfo("custom1", { label: "임원", screen: "admin" }, null), { exec: false, fm: "hidden" });
    assert.deepEqual(AC.roleInfo("custom1", { screen: "admin" }, { roles: { custom1: { screen: "exec" } } }), { exec: true, fm: "hidden" });
    assert.deepEqual(AC.roleInfo("custom1", { menus: { 자금관리: "read" } }, { roles: { custom1: { menus: { 자금관리: "write" } } } }), { exec: false, fm: "write" });
    assert.deepEqual(AC.roleInfo("custom1", null, null), { exec: false, fm: "hidden" }); // 없는 역할
    assert.deepEqual(AC.roleInfo("admin", { label: "임원", menus: { 자금관리: "write" } }, null), { exec: false, fm: "hidden" }); // 기본 역할 제외
    assert.deepEqual(AC.roleInfo("임원역할", {}, null), { exec: true, fm: "hidden" }); // 이름이 없으면 역할 이름으로
    assert.deepEqual(AC.roleInfo("legalMgr", { menus: { 자금관리: "read" } }, null), { exec: false, fm: "read" }); // 법무는 자금 메뉴 설정을 따른다
  });
  await t("규칙과 똑같이 계산할 수 없는 문서 → 토큰 없음(규칙이 문서를 읽는다)", () => {
    assert.equal(cu({ role: "user" }).claims, null);                       // 회사명 없음('돌캐' 기본)
    assert.equal(cu({ companyName: 3, role: "user" }).claims, null);
    assert.equal(cu({ companyName: "a", role: 1 }).claims, null);
    assert.equal(cu({ companyName: "a", role: "user", team: ["x"] }).claims, null);
    assert.equal(cu({ companyName: "a", role: "user", team: "경리\n팀" }).claims, null);
    assert.equal(cu({ companyName: "a", role: "user", permissions: null }).claims, null);
    assert.equal(cu({ companyName: "a", role: "user", linkedTransportCompany: { companyName: 5 } }).claims, null);
    assert.equal(cu(null).claims, null);
  });
  await t("허브 회사 키 — functions/hubSync.js companyKeyOf와 같다", () => {
    const { companyKeyOf } = require(path.resolve(__dirname, "../functions/hubSync.js"));
    const cases = [
      { companyKey: "k1", source: "signup" }, { source: "logisweb-staff", companyName: "에이" }, { source: "signup", bizNo: "123-45-67890" },
      { source: "signup" }, { bizNo: "12" }, { companyKey: "", source: "logisweb-driver", companyName: "비" },
    ];
    for (const m of cases) assert.equal(AC.computeHubClaims(m, "u1").hk, companyKeyOf(m, "u1"), JSON.stringify(m));
    const h = AC.computeHubClaims({ status: "approved", source: "signup", role: "driver" }, "u1");
    assert.equal(h.hv, 1); assert.equal(h.hs, true); assert.equal(h.hsg, true); assert.equal(h.hro, "driver");
    assert.equal(AC.computeHubClaims({ status: "approved" }, "u1").hsg, false); // 규칙 hubActive: source 없음 ≠ signup
    assert.equal(AC.computeHubClaims({ source: null }, "u1"), null);
  });
  await t("합치기 — 다른 값은 그대로 · 크기 한도 · at 빼고 비교", () => {
    const u = cu({ companyName: "a", role: "user" }).claims;
    const m = AC.mergeClaims({ other: 1, v: 9, r: "old" }, u, null, 100);
    assert.equal(m.other, 1); assert.equal(m.v, 1); assert.equal(m.r, "user"); assert.equal(m.at, 100);
    assert.deepEqual(AC.mergeClaims({ other: 1, v: 1, r: "x" }, null, null, 5), { other: 1 }); // 문서가 지워지면 관리 값만 지운다
    const big = cu({ companyName: "가".repeat(400), role: "user" }).claims;
    assert.deepEqual(AC.mergeClaims({}, big, null, 1), {});
    assert.equal(AC.sameManaged({ ...m, at: 1 }, { ...m, at: 2 }), true);
    assert.equal(AC.sameManaged(m, { ...m, r: "admin" }), false);
  });
  await t("트리거 — 권한 칸이 안 바뀌면 건너뜀", () => {
    assert.equal(AC.changedFields({ role: "user", fcmToken: "a" }, { role: "user", fcmToken: "b", claimsAt: 1 }, AC.USER_FIELDS), false);
    assert.equal(AC.changedFields({ role: "user" }, { role: "admin" }, AC.USER_FIELDS), true);
    assert.equal(AC.changedFields({ team: "a" }, { team: "b" }, AC.USER_FIELDS), true);
  });

  // 서버 다시 계산 — 가짜 db · auth
  const mkFake = (docs, claims) => {
    const writes = [];
    const db = {
      collection: (c) => ({
        doc: (id) => ({
          get: async () => ({ exists: !!docs[`${c}/${id}`], data: () => docs[`${c}/${id}`] }),
          set: async (v) => { writes.push([`${c}/${id}`, v]); docs[`${c}/${id}`] = { ...(docs[`${c}/${id}`] || {}), ...v }; },
        }),
      }),
    };
    const sets = [];
    const getAuth = () => ({
      getUser: async (uid) => { if (!(uid in claims)) throw Object.assign(new Error("x"), { code: "auth/user-not-found" }); return { customClaims: claims[uid] }; },
      setCustomUserClaims: async (uid, c) => { sets.push([uid, c]); claims[uid] = c; },
    });
    return { svc: AC.makeClaimsService({ db, getAuth }), writes, sets, docs, claims };
  };
  await t("다시 계산 — 처음엔 토큰 저장 + claimsAt 기록, 같으면 아무것도 안 함", async () => {
    const f = mkFake({ "users/u1": { companyName: "에이", role: "user" }, "companyPlans/에이": { status: "active" } }, { u1: null });
    const r1 = await f.svc.recompute("u1");
    assert.equal(r1.changed, true); assert.equal(f.sets.length, 1); assert.equal(f.sets[0][1].co, "에이");
    assert.equal(f.writes[0][0], "users/u1"); assert.equal(f.writes[0][1].claimsV, 1); assert.equal(f.writes[0][1].claimsAt, f.sets[0][1].at);
    const r2 = await f.svc.recompute("u1");
    assert.equal(r2.changed, false); assert.equal(f.sets.length, 1); assert.equal(f.writes.length, 1);
  });
  await t("다시 계산 — 역할 변경 · 계약종료 · 문서 삭제", async () => {
    const f = mkFake({ "users/u1": { companyName: "에이", role: "user" } }, { u1: { keepMe: true } });
    await f.svc.recompute("u1");
    f.docs["users/u1"].role = "admin";
    assert.equal((await f.svc.recompute("u1")).changed, true); assert.equal(f.claims.u1.r, "admin"); assert.equal(f.claims.u1.keepMe, true);
    f.docs["companyPlans/에이"] = { status: "ended" };
    await f.svc.recompute("u1"); assert.equal(f.claims.u1.ce, true);
    delete f.docs["users/u1"];
    await f.svc.recompute("u1"); assert.deepEqual(f.claims.u1, { keepMe: true });
  });
  await t("다시 계산 — 허브 회원만(users 문서 없음) · 로그인 계정 없음", async () => {
    const f = mkFake({ "hubMembers/h1": { source: "signup", status: "approved", bizNo: "1-2" } }, { h1: {} });
    await f.svc.recompute("h1");
    assert.equal(f.claims.h1.v, undefined); assert.equal(f.claims.h1.hv, 1); assert.equal(f.claims.h1.hk, "biz:12");
    assert.equal(f.writes[0][0], "hubMembers/h1");
    const g = mkFake({ "users/x": { companyName: "a" } }, {});
    assert.equal((await g.svc.recompute("x")).skipped, "no-auth-user");
  });

  console.log(`\n토큰 권한 계산 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
