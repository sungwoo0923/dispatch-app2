// 🎫 2026-11-08 로그인 토큰 권한(custom claims) 보안 규칙 테스트 — Firestore · Storage 에뮬레이터
//  실행: firebase emulators:exec --only firestore,storage --project demo-kpflow "node scripts/claimsRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 필요 — NODE_PATH로 넘겨도 된다. 포트 EMU_FS_PORT(기본 8080) · EMU_ST_PORT(기본 9199))
//  확인하는 것
//   ① 토큰 값이 있으면 users 문서 없이도(= 규칙이 문서를 읽지 않고) 판단한다 — 회사 분리·역할·부서·임원 역할·자금 메뉴·화주 연동·허브 회사 키
//   ② 토큰이 없거나 버전이 다르면 예전처럼 문서로 판단한다(배포 순서와 상관없이 아무도 잠기지 않음)
//   ③ 꾸민 토큰(최고관리자 tm · 부관리자 sa)은 문서로 한 번 더 확인해 막힌다 · 토큰 값은 서버만 넣을 수 있다(서버 계산 = functions/authClaims.js)
//   ④ 역할 변경 · 승인 · 계약종료 흐름
//   ⑤ 규칙 계산량 — 같은 요청 묶음에서 문서 읽기(get · exists) 평가 횟수(에뮬레이터 coverage 보고서)
const fs = require("fs");
const path = require("path");
const http = require("http");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, Timestamp } = require("firebase/firestore");
const { ref, uploadBytes } = require("firebase/storage");

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const AC = require(path.join(ROOT, "functions/authClaims.js"));
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080), ST_PORT = Number(process.env.EMU_ST_PORT || 9199);
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}
const A = "에이운송", B = "비운송", C = "씨운송";

const USERS = {
  adminA: { companyName: A, approved: true, role: "admin" },
  userA: { companyName: A, approved: true, role: "user", team: "배차팀" },
  userA2: { companyName: A, approved: true, role: "user" },
  finA: { companyName: A, approved: true, role: "user", team: "경리팀" },
  execA: { companyName: A, approved: true, role: "execRole" },
  clerkA: { companyName: A, approved: true, role: "clerk" },
  pendA: { companyName: A, approved: false, role: "user" },
  userB: { companyName: B, approved: true, role: "user" },
  userC: { companyName: C, approved: true, role: "user" },
  shipS: { companyName: "에스상사", approved: true, role: "shipper", linkedTransportCompany: { companyName: A } },
  master: { companyName: A, approved: true, role: "totalMaster" },
  sub: { companyName: A, approved: true, role: "totalMaster", subAdmin: true },
};
const HUBS = {
  hubX: { uid: "hubX", source: "signup", status: "approved", role: "shipper", bizNo: "123-45-67890", name: "허브화주" },
};
const PLANS = { [A]: { planId: "pro" }, [C]: { planId: "pro", status: "ended" } };
const ROLES = { execRole: { label: "임원", screen: "exec" }, clerk: { label: "사무원2", menus: { 자금관리: "write" } } };

// 서버(functions/authClaims.js)와 같은 계산으로 토큰 값을 만든다
function claimsOf(uid, over = {}) {
  const u = { ...USERS[uid], ...over };
  const cco = AC.contractCoOf(u);
  const { claims } = AC.computeUserClaims(u, { plan: PLANS[cco] || null, customRole: ROLES[u.role] || null, roleOverride: null });
  const hc = HUBS[uid] ? AC.computeHubClaims(HUBS[uid], uid) : null;
  return AC.mergeClaims({}, claims, hc, 1);
}

// 에뮬레이터 coverage 보고서(JSON) — 식마다 평가 횟수
function getJson(port, p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port, path: p }, (r) => { let b = ""; r.on("data", (c) => { b += c; }); r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on("error", rej);
  });
}
// 보고서에서 users/hubMembers 문서 읽기(get · exists) 식의 평가 횟수 합
function docReadEvals(report, rulesText, byLine, tot = { all: 0 }) {
  const lines = rulesText.split("\n");
  let n = 0;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.sourcePosition && Array.isArray(node.values)) {
      tot.all += node.values.reduce((s, v) => s + (v.value && Object.keys(v.value).length ? (Number(v.count) || 0) : 0), 0);
      const ln = lines[(node.sourcePosition.line || 1) - 1] || "";
      const col = (node.sourcePosition.column || 1) - 1;
      const frag = ln.slice(col, col + 12);
      if (/^(get|exists)\(/.test(frag) && /documents\/(users|hubMembers)\/|hubPath\(/.test(ln.slice(col))) {
        // value가 빈 칸({})인 항목 = 그 식을 건너뜀(짧은 계산으로 평가 안 함) — 실제로 평가한 횟수만 센다
        const k = node.values.reduce((s, v) => s + (v.value && Object.keys(v.value).length ? (Number(v.count) || 0) : 0), 0);
        n += k;
        if (byLine) byLine[node.sourcePosition.line] = (byLine[node.sourcePosition.line] || 0) + k;
      }
    }
    Object.values(node).forEach(walk);
  };
  walk(report);
  return n;
}

(async () => {
  const rulesText = fs.readFileSync(`${ROOT}/firestore.rules`, "utf8");
  const mk = (projectId) => initializeTestEnvironment({
    projectId,
    firestore: { rules: rulesText, host: "127.0.0.1", port: FS_PORT },
    storage: { rules: fs.readFileSync(`${ROOT}/storage.rules`, "utf8"), host: "127.0.0.1", port: ST_PORT },
  });
  const env = await mk("demo-kpflow");
  await env.clearFirestore();
  const seed = () => env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: true });
    for (const [id, u] of Object.entries(USERS)) await setDoc(doc(db, `users/${id}`), u);
    for (const [id, m] of Object.entries(HUBS)) await setDoc(doc(db, `hubMembers/${id}`), m);
    for (const [id, p] of Object.entries(PLANS)) await setDoc(doc(db, `companyPlans/${id}`), p);
    for (const [id, r] of Object.entries(ROLES)) await setDoc(doc(db, `customRoles/${id}`), r);
    await setDoc(doc(db, "orders/oA"), { companyName: A, 상차일: "2026-11-08" });
    await setDoc(doc(db, "orders/oB"), { companyName: B, 상차일: "2026-11-08" });
    await setDoc(doc(db, "orders/oC"), { companyName: C, 상차일: "2026-11-08" });
    await setDoc(doc(db, "clients/cA"), { companyName: A, name: "거래처" });
    await setDoc(doc(db, "acctFunds/fA"), { companyName: A, balance: 100 });
    await setDoc(doc(db, "platformInvoices/iA"), { company: A, amount: 1 });
    await setDoc(doc(db, "landingInquiries/q1"), { name: "방문자" });
    await setDoc(doc(db, "hubPlaces/pX"), { companyKey: "biz:1234567890", uid: "hubX", name: "창고" });
    await setDoc(doc(db, "hubPlaces/pY"), { companyKey: "biz:999", uid: "other", name: "남의 창고" });
    await setDoc(doc(db, "approvals/ap1"), { company: A, companyName: A, status: "approved", cat: "expense", drafterUid: "userA", participants: ["userA"], line: [{ uid: "adminA" }] });
    await setDoc(doc(db, "payrollUnlocks/finA"), { companyName: A, expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60000) });
  });
  await seed();
  const as = (uid, tok) => env.authenticatedContext(uid, tok).firestore();
  const withClaims = (uid, over, extra = {}) => as(uid, { ...claimsOf(uid, over), ...extra });
  const setUser = (uid, data) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `users/${uid}`), data));
  const delUser = (uid) => env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), `users/${uid}`)));
  const ordersOf = (db, co) => getDocs(query(collection(db, "orders"), where("companyName", "==", co)));

  // ── 0. 서버 계산 확인 ──
  await t("계산: 일반 직원 토큰", async () => {
    const c = claimsOf("userA");
    if (c.v !== 1 || c.co !== A || c.r !== "user" || !c.ap || !c.st || c.ce || c.tm || c.fin) throw new Error(JSON.stringify(c));
  });
  await t("계산: 경리팀 · 임원 역할 · 자금 메뉴 · 계약종료 · 화주 연동", async () => {
    if (!claimsOf("finA").fin || !claimsOf("finA").pay) throw new Error("fin");
    if (!claimsOf("execA").exec) throw new Error("exec");
    if (claimsOf("clerkA").fm !== "write") throw new Error("fm");
    if (!claimsOf("userC").ce) throw new Error("ce");
    if (claimsOf("shipS").sh !== A) throw new Error("sh");
    if (Buffer.byteLength(JSON.stringify(claimsOf("shipS"))) > 900) throw new Error("size");
  });

  // ── ① 토큰 값으로 판단(users 문서를 지워도 된다 = 규칙이 문서를 읽지 않음) ──
  await t("토큰: 우리 회사 오더 목록", () => assertSucceeds(ordersOf(withClaims("userA"), A)));
  await t("토큰: 다른 회사 오더 목록 거절", () => assertFails(ordersOf(withClaims("userA"), B)));
  await delUser("userA");
  await t("토큰: users 문서가 없어도 오더 목록(문서를 안 읽음)", () => assertSucceeds(ordersOf(withClaims("userA"), A)));
  await t("토큰: users 문서 없이 거래처 한 건", () => assertSucceeds(getDoc(doc(withClaims("userA"), "clients/cA"))));
  await t("토큰 없음 + 문서 없음 → 거절(예전 규칙)", () => assertFails(ordersOf(as("userA"), A)));
  await t("다른 버전 토큰(v:2) + 문서 없음 → 문서로 판단해 거절", () => assertFails(ordersOf(as("userA", { ...claimsOf("userA"), v: 2 }), A)));
  await setUser("userA", USERS.userA);
  await t("토큰 없음 + 문서 → 예전처럼 허용", () => assertSucceeds(ordersOf(as("userA"), A)));
  await t("다른 버전 토큰(v:2) + 문서 → 문서로 허용", () => assertSucceeds(ordersOf(as("userA", { ...claimsOf("userA"), v: 2 }), A)));

  // 부서 · 임원 역할 · 자금 메뉴 — 문서 없이 토큰으로
  await t("토큰: 경리팀 → 플랫폼 청구서 읽기", () => assertSucceeds(getDoc(doc(withClaims("finA"), "platformInvoices/iA"))));
  await t("토큰: 배차팀 → 플랫폼 청구서 거절", () => assertFails(getDoc(doc(withClaims("userA"), "platformInvoices/iA"))));
  await t("토큰: 임원 역할 → 자금 읽기", () => assertSucceeds(getDoc(doc(withClaims("execA"), "acctFunds/fA"))));
  await t("토큰: 자금관리 쓰기 메뉴 역할 → 자금 등록", () => assertSucceeds(setDoc(doc(withClaims("clerkA"), "acctFunds/fA2"), { companyName: A, balance: 1 })));
  await t("토큰: 일반 직원 → 자금 읽기 거절", () => assertFails(getDoc(doc(withClaims("userA"), "acctFunds/fA"))));
  await t("토큰: 경리팀 → 지출결의 지급완료 표시", () => assertSucceeds(updateDoc(doc(withClaims("finA"), "approvals/ap1"), { paid: { at: 1, by: "finA" } })));
  await t("토큰: 배차팀 → 지급완료 거절", () => assertFails(updateDoc(doc(withClaims("userA"), "approvals/ap1"), { paid: { at: 2 } })));
  await t("토큰: 화주 → 연동 운송사 직원 문서 읽기", () => assertSucceeds(getDoc(doc(withClaims("shipS"), "users/adminA"))));
  await t("토큰: 화주 → 다른 운송사 직원 문서 거절", () => assertFails(getDoc(doc(withClaims("shipS"), "users/userB"))));
  await t("토큰: 관리자 → 같은 회사 직원 역할 변경", () => assertSucceeds(updateDoc(doc(withClaims("adminA"), "users/userA2"), { role: "test" })));
  await t("토큰: 일반 직원 → 다른 직원 역할 변경 거절", () => assertFails(updateDoc(doc(withClaims("userA"), "users/userA2"), { role: "admin" })));
  await setUser("userA2", USERS.userA2);

  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `payrollSettings/${A}`), { companyName: A, rate: 1 }));
  await delUser("finA");
  await t("토큰: 경리팀 → 급여 설정 읽기(users 문서 없이)", () => assertSucceeds(getDoc(doc(withClaims("finA"), `payrollSettings/${A}`))));
  await setUser("finA", USERS.finA);
  await t("토큰: 배차팀 → 급여 설정 거절", () => assertFails(getDoc(doc(withClaims("userA"), `payrollSettings/${A}`))));
  await t("토큰: 다른 회사 경리팀 토큰 → 우리 회사 급여 설정 거절", () => assertFails(getDoc(doc(withClaims("userB", { team: "경리팀" }), `payrollSettings/${A}`))));

  // ── ③ 꾸민 토큰 ──
  await t("꾸민 토큰 tm:true(문서는 일반 직원) → 최고관리자 전용 거절", () => assertFails(getDoc(doc(withClaims("userA", {}, { tm: true, r: "totalMaster" }), "landingInquiries/q1"))));
  await t("꾸민 토큰 tm + sa → 부관리자 기능 거절", () => assertFails(getDocs(collection(withClaims("userA", {}, { tm: true, sa: true, r: "totalMaster" }), "landingInquiries"))));
  await t("진짜 최고관리자 토큰 + 문서 → 허용", () => assertSucceeds(getDoc(doc(withClaims("master"), "landingInquiries/q1"))));
  await t("부관리자 토큰 + 문서 → 허용", () => assertSucceeds(getDoc(doc(withClaims("sub"), "landingInquiries/q1"))));
  await setUser("master", { ...USERS.master, role: "user" });
  await t("최고관리자 권한을 뺀 뒤 예전 토큰(tm) → 문서 확인으로 바로 거절", () => assertFails(getDoc(doc(withClaims("master", { role: "totalMaster" }), "landingInquiries/q1"))));
  await setUser("master", USERS.master);
  await t("꾸민 토큰 tm(storage) → 화면 이미지 올리기 거절", () => assertFails(uploadBytes(ref(env.authenticatedContext("userA", { ...claimsOf("userA"), tm: true }).storage(), "uiAssets/x.png"), Buffer.from([1, 2]), { contentType: "image/png" })));

  // ── ④ 승인 · 역할 변경 · 계약종료 흐름 ──
  await t("승인 대기 토큰(ap:false) · 문서 승인 대기 → 거절", () => assertFails(ordersOf(withClaims("pendA"), A)));
  const pendOld = claimsOf("pendA");
  await setUser("pendA", { ...USERS.pendA, approved: true });
  await t("관리자가 승인 → 토큰을 새로 받기 전에도 바로 허용(미승인 토큰은 문서를 다시 본다)", () => assertSucceeds(ordersOf(as("pendA", pendOld), A)));
  await t("승인 뒤 새 토큰 → 허용", () => assertSucceeds(ordersOf(withClaims("pendA", { approved: true }), A)));
  await setUser("pendA", USERS.pendA);

  await t("역할 user → companySettings 사업자 목록 거절", () => assertFails(setDoc(doc(withClaims("userA"), `companySettings/${A}`), { companyName: A, bizList: [] })));
  await setUser("userA", { ...USERS.userA, role: "admin" });
  await t("역할 → admin 변경 + 새 토큰 → 허용(다시 로그인 필요 없음)", () => assertSucceeds(setDoc(doc(withClaims("userA", { role: "admin" }), `companySettings/${A}`), { companyName: A, bizList: [] })));
  await setUser("userA", USERS.userA);
  await t("역할 admin → user 변경 + 새 토큰 → 거절", () => assertFails(updateDoc(doc(withClaims("userA"), `companySettings/${A}`), { bizList: [1] })));

  await t("계약종료 회사(ce) 토큰 → 오더 목록 거절", () => assertFails(ordersOf(withClaims("userC"), C)));
  await t("계약종료 회사 · 토큰 없음 → 문서로도 거절", () => assertFails(ordersOf(as("userC"), C)));
  await t("최고관리자 → 계약종료 회사 오더 목록 허용", () => assertSucceeds(ordersOf(withClaims("master"), C)));

  await setUser("userB", { ...USERS.userB, employmentStatus: "퇴사" });
  await t("퇴사 처리 + 새 토큰(st:false) → 거절", () => assertFails(ordersOf(withClaims("userB", { employmentStatus: "퇴사" }), B)));
  await t("(알려진 동작) 퇴사 처리 직후 예전 토큰 → 토큰이 바뀔 때까지(화면은 바로 새로 받음 · 최대 1시간) 허용", () => assertSucceeds(ordersOf(withClaims("userB"), B)));
  await setUser("userB", USERS.userB);

  // ── 허브 ──
  const hubTok = claimsOf("hubX");
  await t("허브: 토큰(hv) — 우리 회사 키 장소 읽기", () => assertSucceeds(getDoc(doc(as("hubX", hubTok), "hubPlaces/pX"))));
  await t("허브: 다른 회사 키 장소 거절", () => assertFails(getDoc(doc(as("hubX", hubTok), "hubPlaces/pY"))));
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "hubMembers/hubX"), { ...HUBS.hubX, status: "pending" }));
  await t("허브: 승인 대기로 바꾼 뒤 새 토큰 → 거절", () => assertFails(getDoc(doc(as("hubX", AC.mergeClaims({}, null, AC.computeHubClaims({ ...HUBS.hubX, status: "pending" }, "hubX"), 1)), "hubPlaces/pX"))));
  await t("허브: 토큰 없음 · 문서 승인 대기 → 거절", () => assertFails(getDoc(doc(as("hubX"), "hubPlaces/pX"))));
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "hubMembers/hubX"), HUBS.hubX));
  await t("허브: 토큰 없음 · 문서 승인 → 예전처럼 허용", () => assertSucceeds(getDoc(doc(as("hubX"), "hubPlaces/pX"))));

  // ── Storage 급여 서류(토큰 + 잠금 해제) ──
  await t("storage: 경리팀 토큰 + 잠금 해제 → 근로계약서 올리기", () => assertSucceeds(uploadBytes(ref(env.authenticatedContext("finA", claimsOf("finA")).storage(), `payrollDocs/${A}/userA/c.pdf`), Buffer.from("%PDF"), { contentType: "application/pdf" })));
  await t("storage: 배차팀 토큰 → 거절", () => assertFails(uploadBytes(ref(env.authenticatedContext("userA", claimsOf("userA")).storage(), `payrollDocs/${A}/userA/d.pdf`), Buffer.from("%PDF"), { contentType: "application/pdf" })));

  // ── ⑤ 규칙 계산량 — 같은 요청 묶음을 토큰 없이 / 토큰으로 보내고 users·hubMembers 문서 읽기 평가 횟수를 비교 ──
  const runBatch = async (projectId, useClaims) => {
    const e2 = await mk(projectId);
    await e2.clearFirestore();
    await e2.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: true });
      for (const [id, u] of Object.entries(USERS)) await setDoc(doc(db, `users/${id}`), u);
      for (const [id, p] of Object.entries(PLANS)) await setDoc(doc(db, `companyPlans/${id}`), p);
      for (const [id, r] of Object.entries(ROLES)) await setDoc(doc(db, `customRoles/${id}`), r);
      await setDoc(doc(db, "orders/oA"), { companyName: A });
      await setDoc(doc(db, "clients/cA"), { companyName: A });
      await setDoc(doc(db, "acctFunds/fA"), { companyName: A });
      await setDoc(doc(db, "platformInvoices/iA"), { company: A });
      await setDoc(doc(db, "fooUnknown/x"), { companyName: A });
    });
    const ctxOf = (uid) => e2.authenticatedContext(uid, useClaims ? claimsOf(uid) : {}).firestore();
    const ops = [
      () => ordersOf(ctxOf("userA"), A), () => getDoc(doc(ctxOf("userA"), "clients/cA")), () => getDoc(doc(ctxOf("userA"), "fooUnknown/x")),
      () => getDoc(doc(ctxOf("execA"), "acctFunds/fA")), () => getDoc(doc(ctxOf("finA"), "platformInvoices/iA")),
      () => getDocs(query(collection(ctxOf("adminA"), "users"), where("companyName", "==", A))),
      () => setDoc(doc(ctxOf("userA"), "clients/cA2"), { companyName: A, name: "새 거래처" }),
    ];
    for (const op of ops) await op().catch(() => {});
    const rep = await getJson(FS_PORT, `/emulator/v1/projects/${projectId}:ruleCoverage`).catch(() => null);
    await e2.cleanup();
    const byLine = {};
    const tot = { all: 0 };
    const evals = rep ? docReadEvals(rep, rulesText, byLine, tot) : -1;
    if (process.env.CLAIMS_DEBUG) {
      console.log(projectId, JSON.stringify(byLine));
    }
    return { evals, all: tot.all, ops: ops.length };
  };
  const noC = await runBatch("demo-claims-off", false);
  const withC = await runBatch("demo-claims-on", true);
  out.push(`INFO 규칙 계산량(요청 ${noC.ops}개): users·hubMembers 문서 읽기 식 평가 — 토큰 없음 ${noC.evals}회 → 토큰 ${withC.evals}회 · 전체 식 평가 ${noC.all}회 → ${withC.all}회`);
  await t("계산량: 토큰이 있으면 users 문서 읽기 식이 줄어든다", async () => {
    if (noC.evals < 0 || withC.evals < 0) throw new Error("coverage 보고서를 읽지 못함");
    if (!(withC.evals < noC.evals)) throw new Error(`${withC.evals} >= ${noC.evals}`);
  });

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n토큰 권한 규칙 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
