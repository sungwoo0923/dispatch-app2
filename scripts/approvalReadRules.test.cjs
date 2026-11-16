// 🧪 2026-11-16 결재 문서 열람 범위 — 작성자 · 결재선 · 참조 / 팀 관리자는 같은 부서 / 대표 · 임원 · 통합관리자 · 최고관리자는 전체
//  실행: firebase emulators:exec --only firestore --project demo-kpap "node scripts/approvalReadRules.test.cjs"  (RULES=다른 규칙 파일)
const fs = require("fs");
const path = require("path");
// 실제 로그인처럼 권한 토큰(functions/authClaims.js — 서버가 넣는 값)을 붙인다. 토큰이 없으면 규칙이 문서를 여러 번 읽어 한도에 걸린다
const AC = require(path.resolve(__dirname, "..", "functions", "authClaims.js"));
const claimsOf = (u) => AC.mergeClaims({}, AC.computeUserClaims(u, { plan: null, customRole: null, roleOverride: null }).claims, null, 1);
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, collection, query, where } = require("firebase/firestore");
const RULES = process.env.RULES || path.resolve(__dirname, "..", "firestore.rules");
const CO = "큐런", OT = "다른운송";
const U = {
  tAdmin: { companyName: CO, approved: true, role: "admin", team: "운송팀", position: "과장" },     // 운송관리자
  tUser: { companyName: CO, approved: true, role: "user", team: "운송팀", position: "사원" },       // 운송사무원(결재선 아님)
  tWriter: { companyName: CO, approved: true, role: "user", team: "운송팀", position: "대리" },     // 일일업무일지 작성자
  sUser: { companyName: CO, approved: true, role: "user", team: "영업팀", position: "사원" },
  sLead: { companyName: CO, approved: true, role: "user", team: "영업팀", position: "팀장" },       // 직책 팀장(역할은 실무자)
  acct: { companyName: CO, approved: true, role: "test", team: "경리팀" },
  hr: { companyName: CO, approved: true, role: "hrManager", team: "인사팀" },
  ceo: { companyName: CO, approved: true, role: "user", team: "임원", position: "대표" },
  master: { companyName: CO, approved: true, role: "admin", isMaster: true, team: "운송팀" },     // 회사 마스터 → 통합관리자
  oAdmin: { companyName: OT, approved: true, role: "admin", team: "운송팀" },
  tm: { companyName: CO, approved: true, role: "totalMaster" },
};
const D = {
  daily: { form: "daily", cat: "report", drafterUid: "tWriter", drafter: { team: "운송팀" }, participants: ["tWriter", "ceo"] },
  expS: { form: "expense", cat: "expense", drafterUid: "sUser", drafter: { team: "영업팀" }, participants: ["sUser", "ceo"] },
  leave: { form: "leave", cat: "leave", drafterUid: "tWriter", drafter: { team: "운송팀" }, participants: ["tWriter", "tAdmin"] },
  resign: { form: "resign", cat: "report", drafterUid: "sUser", drafter: { team: "영업팀" }, participants: ["sUser", "ceo"] },
  ccDoc: { form: "workreport", cat: "report", drafterUid: "sUser", drafter: { team: "영업팀" }, participants: ["sUser", "ceo", "tUser"], ccUids: ["tUser"] },
};
let pass = 0, fail = 0; const out = [];
async function t(name, fn) { try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).replace(/\s+/g, ' ').slice(0, 300)}`); } }
(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-kpap", firestore: { rules: fs.readFileSync(RULES, "utf8"), host: "127.0.0.1", port: Number(process.env.EMU_FS_PORT || 8080) } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [k, u] of Object.entries(U)) await setDoc(doc(db, "users", k), u);
    await setDoc(doc(db, "systemConfig", "tenancy"), { serverFilter: process.env.LOCK === "1" }); // 서버 분리 잠금(LOCK=1)
    for (const [k, d] of Object.entries(D)) await setDoc(doc(db, "approvals", k), { ...d, company: CO, companyName: CO, status: "pending" });
  });
  const USERS_REF = typeof U !== "undefined" ? U : USERS;
  const as = (k) => env.authenticatedContext(k, { email: `${k}@x.kr`, ...claimsOf(USERS_REF[k] || {}) }).firestore();
  const ok = (k, id) => t(`${k} → ${id} 읽기 됨`, () => assertSucceeds(getDoc(doc(as(k), "approvals", id))));
  const no = (k, id) => t(`${k} → ${id} 읽기 막힘`, () => assertFails(getDoc(doc(as(k), "approvals", id))));
  const coQ = (db) => query(collection(db, "approvals"), where("company", "==", CO));
  const teamQ = (db, team) => query(collection(db, "approvals"), where("company", "==", CO), where("drafter.team", "==", team));
  // 운송사무원 — 본인 · 결재선 · 참조만
  await no("tUser", "daily"); await no("tUser", "expS"); await ok("tUser", "ccDoc");
  await t("tUser · 회사 전체 조회 막힘", () => assertFails(getDocs(coQ(as("tUser")))));
  await t("tUser · 근태 조회(직원 일정)", () => assertSucceeds(getDocs(query(collection(as("tUser"), "approvals"), where("company", "==", CO), where("cat", "==", "leave")))));
  await t("tUser · 내 문서 조회", () => assertSucceeds(getDocs(query(collection(as("tUser"), "approvals"), where("participants", "array-contains", "tUser")))));
  await ok("tWriter", "daily");
  // 운송관리자 — 운송팀 문서 전부, 다른 팀은 막힘
  await ok("tAdmin", "daily"); await ok("tAdmin", "leave"); await no("tAdmin", "expS"); await ok("tAdmin", "resign");
  await t("tAdmin · 운송팀 문서 조회", () => assertSucceeds(getDocs(teamQ(as("tAdmin"), "운송팀"))));
  await t("tAdmin · 다른 팀 조건 조회 막힘", () => assertFails(getDocs(teamQ(as("tAdmin"), "영업팀"))));
  await t("tAdmin · 회사 전체 조회 막힘", () => assertFails(getDocs(coQ(as("tAdmin")))));
  // 직책 팀장(영업팀)
  await ok("sLead", "expS"); await no("sLead", "daily");
  await t("sLead · 영업팀 문서 조회", () => assertSucceeds(getDocs(teamQ(as("sLead"), "영업팀"))));
  // 경리 — 지출결의 · 근태 · 사직서만
  await ok("acct", "expS"); await ok("acct", "leave"); await ok("acct", "resign"); await no("acct", "daily");
  await t("acct · 지출결의 조회", () => assertSucceeds(getDocs(query(collection(as("acct"), "approvals"), where("company", "==", CO), where("cat", "==", "expense")))));
  await t("acct · 사직서 조회(퇴직 정산)", () => assertSucceeds(getDocs(query(collection(as("acct"), "approvals"), where("company", "==", CO), where("form", "==", "resign")))));
  // 인사 — 사직서 · 근태, 다른 팀 업무일지는 막힘
  await ok("hr", "resign"); await ok("hr", "leave"); await no("hr", "daily"); await no("hr", "expS");
  // 대표 · 회사 마스터 · 최고관리자 — 전부
  for (const k of ["ceo", "master", "tm"]) { await ok(k, "daily"); await ok(k, "expS"); await t(`${k} · 회사 전체 조회`, () => assertSucceeds(getDocs(coQ(as(k))))); }
  // 다른 회사
  await no("oAdmin", "daily"); await no("oAdmin", "leave");
  await env.cleanup();
  console.log(out.join("\n")); console.log(`\n${pass} passed, ${fail} failed  (rules: ${path.basename(RULES)})`);
  process.exit(fail ? 1 : 0);
})();
