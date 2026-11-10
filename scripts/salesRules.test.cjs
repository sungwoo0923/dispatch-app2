// 💼 2026-11-10 영업팀 보안 규칙 테스트 — Firestore 에뮬레이터
//  실행: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/salesRules.test.cjs"
//  ① 영업 기회·활동 — 같은 회사 직원만 · 조회전용 아닌 회사 데이터 공용 규칙
//  ② 거래처 담당 — 영업 관리 권한만 바꾸고, 영업사무원은 본인 거래처만 새로 등록
//  ③ 인센티브 규정·목표 — 영업 관리 권한만 저장
//  ④ 인센티브 확정 기록 — 영업 관리 권한만 쓰고, 본인 것·경리만 읽는다
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, getDocs, query, where } = require("firebase/firestore");

const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
const A = "에이운송", B = "비운송";
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name} :: ${String(e?.message || e).slice(0, 180)}`); } }
const USERS = {
  mgr: { companyName: A, approved: true, role: "salesMgr" }, rep: { companyName: A, approved: true, role: "salesStaff" }, rep2: { companyName: A, approved: true, role: "salesStaff" },
  admin: { companyName: A, approved: true, role: "admin" }, acct: { companyName: A, approved: true, role: "test" }, user: { companyName: A, approved: true, role: "user" },
  master: { companyName: A, approved: true, role: "user", isMaster: true }, view: { companyName: A, approved: true, role: "viewer" },
  exec: { companyName: A, approved: true, role: "role_exec1" },
  ship: { companyName: A, approved: true, role: "shipper" }, other: { companyName: B, approved: true, role: "salesMgr" }, wait: { companyName: A, approved: false, role: "salesMgr" },
};

(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-sales-rules", firestore: { rules: fs.readFileSync(path.join(process.env.REPO || path.resolve(__dirname, ".."), "firestore.rules"), "utf8"), host: "127.0.0.1", port: FS_PORT } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [uid, u] of Object.entries(USERS)) await setDoc(doc(db, "users", uid), u);
    await setDoc(doc(db, "systemConfig", "tenancy"), { serverFilter: true });
    await setDoc(doc(db, "customRoles", "role_exec1"), { label: "임원관리자", screen: "exec", menus: {} });
    await setDoc(doc(db, "salesLeads", "l1"), { companyName: A, name: "새한식품", ownerUid: "rep", stage: "lead" });
    await setDoc(doc(db, "salesAccounts", "a1"), { companyName: A, client: "한빛물류", uid: "rep", since: "2026-01-01" });
    await setDoc(doc(db, "salesPlans", A), { companyName: A, policy: { base: "profit" }, targets: {} });
    await setDoc(doc(db, "salesIncentives", `${A}_2026-11_rep`), { companyName: A, ym: "2026-11", uid: "rep", amount: 100000, status: "확정" });
    await setDoc(doc(db, "salesIncentives", `${A}_2026-11_rep2`), { companyName: A, ym: "2026-11", uid: "rep2", amount: 200000, status: "확정" });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const anon = () => env.unauthenticatedContext().firestore();

  // ① 영업 기회 · 활동
  await t("영업 기회 — 영업사무원 등록", () => assertSucceeds(addDoc(collection(as("rep"), "salesLeads"), { companyName: A, name: "동원로지스", ownerUid: "rep", stage: "lead" })));
  await t("영업 기회 — 같은 회사 목록 읽기", () => assertSucceeds(getDocs(query(collection(as("rep"), "salesLeads"), where("companyName", "==", A)))));
  await t("영업 기회 — 단계 옮기기", () => assertSucceeds(updateDoc(doc(as("rep"), "salesLeads", "l1"), { stage: "contact" })));
  await t("영업 기회 — 다른 회사 읽기 막힘", () => assertFails(getDoc(doc(as("other"), "salesLeads", "l1"))));
  await t("영업 기회 — 다른 회사 이름으로 등록 막힘", () => assertFails(addDoc(collection(as("rep"), "salesLeads"), { companyName: B, name: "x" })));
  await t("영업 기회 — 회사 바꿔치기 막힘", () => assertFails(updateDoc(doc(as("rep"), "salesLeads", "l1"), { companyName: B })));
  await t("영업 기회 — 화주 읽기 막힘", () => assertFails(getDoc(doc(as("ship"), "salesLeads", "l1"))));
  await t("영업 기회 — 승인 전 계정 막힘", () => assertFails(getDoc(doc(as("wait"), "salesLeads", "l1"))));
  await t("영업 기회 — 로그인 안 하면 막힘", () => assertFails(getDoc(doc(anon(), "salesLeads", "l1"))));
  await t("영업 활동 — 등록", () => assertSucceeds(addDoc(collection(as("rep"), "salesActivities"), { companyName: A, date: "2026-11-10", type: "방문", target: "새한식품", ownerUid: "rep" })));

  // ② 거래처 담당
  await t("거래처 담당 — 같은 회사 읽기", () => assertSucceeds(getDocs(query(collection(as("user"), "salesAccounts"), where("companyName", "==", A)))));
  await t("거래처 담당 — 영업관리자 지정", () => assertSucceeds(addDoc(collection(as("mgr"), "salesAccounts"), { companyName: A, client: "쿠팡", uid: "rep2", since: "2026-11-01" })));
  await t("거래처 담당 — 운송관리자 지정", () => assertSucceeds(addDoc(collection(as("admin"), "salesAccounts"), { companyName: A, client: "CJ", uid: "rep", since: "2026-11-01" })));
  await t("거래처 담당 — 회사 마스터 지정", () => assertSucceeds(addDoc(collection(as("master"), "salesAccounts"), { companyName: A, client: "롯데", uid: "rep", since: "2026-11-01" })));
  await t("거래처 담당 — 영업사무원 본인 거래처 등록(수주 처리)", () => assertSucceeds(addDoc(collection(as("rep"), "salesAccounts"), { companyName: A, client: "새한식품", uid: "rep", since: "2026-11-10" })));
  await t("거래처 담당 — 영업사무원이 남의 이름으로 등록 막힘", () => assertFails(addDoc(collection(as("rep"), "salesAccounts"), { companyName: A, client: "LG", uid: "rep2", since: "2026-11-10" })));
  await t("거래처 담당 — 영업사무원이 담당 바꾸기 막힘", () => assertFails(updateDoc(doc(as("rep2"), "salesAccounts", "a1"), { uid: "rep2" })));
  await t("거래처 담당 — 영업사무원이 수주일 앞당기기 막힘", () => assertFails(updateDoc(doc(as("rep"), "salesAccounts", "a1"), { since: "2020-01-01" })));
  await t("거래처 담당 — 영업사무원 해제 막힘", () => assertFails(deleteDoc(doc(as("rep"), "salesAccounts", "a1"))));
  await t("거래처 담당 — 조회전용 등록 막힘", () => assertFails(addDoc(collection(as("view"), "salesAccounts"), { companyName: A, client: "x", uid: "view" })));
  await t("거래처 담당 — 영업관리자 바꾸기", () => assertSucceeds(updateDoc(doc(as("mgr"), "salesAccounts", "a1"), { uid: "rep2" })));
  await t("거래처 담당 — 다른 회사 관리자 막힘", () => assertFails(updateDoc(doc(as("other"), "salesAccounts", "a1"), { uid: "other" })));

  // ③ 인센티브 규정 · 목표
  await t("규정 — 같은 회사 읽기", () => assertSucceeds(getDoc(doc(as("rep"), "salesPlans", A))));
  await t("규정 — 영업관리자 저장", () => assertSucceeds(setDoc(doc(as("mgr"), "salesPlans", A), { companyName: A, policy: { base: "revenue" } }, { merge: true })));
  await t("규정 — 임원 화면 역할 저장", () => assertSucceeds(setDoc(doc(as("exec"), "salesPlans", A), { companyName: A, policy: { base: "profit" } }, { merge: true })));
  await t("확정 — 임원 화면 역할 회사 전체 목록", () => assertSucceeds(getDocs(query(collection(as("exec"), "salesIncentives"), where("companyName", "==", A)))));
  await t("규정 — 영업사무원 저장 막힘(요율 셀프 인상)", () => assertFails(setDoc(doc(as("rep"), "salesPlans", A), { companyName: A, policy: { rate: 99 } }, { merge: true })));
  await t("규정 — 일반 직원 저장 막힘", () => assertFails(setDoc(doc(as("user"), "salesPlans", A), { companyName: A, targets: {} }, { merge: true })));
  await t("규정 — 다른 회사 읽기 막힘", () => assertFails(getDoc(doc(as("other"), "salesPlans", A))));
  await t("규정 — 다른 회사 문서 만들기 막힘", () => assertFails(setDoc(doc(as("mgr"), "salesPlans", "씨운송"), { companyName: A, policy: {} })));

  // ④ 인센티브 확정 기록
  await t("확정 — 영업관리자 저장", () => assertSucceeds(setDoc(doc(as("mgr"), "salesIncentives", `${A}_2026-10_rep`), { companyName: A, ym: "2026-10", uid: "rep", amount: 1, status: "확정" }, { merge: true })));
  await t("확정 — 영업관리자 지급 완료", () => assertSucceeds(updateDoc(doc(as("mgr"), "salesIncentives", `${A}_2026-11_rep`), { status: "지급완료" })));
  await t("확정 — 영업사무원 저장 막힘", () => assertFails(setDoc(doc(as("rep"), "salesIncentives", `${A}_2026-09_rep`), { companyName: A, ym: "2026-09", uid: "rep", amount: 9999999, status: "확정" })));
  await t("확정 — 영업사무원 금액 고치기 막힘", () => assertFails(updateDoc(doc(as("rep"), "salesIncentives", `${A}_2026-11_rep`), { amount: 9999999 })));
  await t("확정 — 본인 것 읽기", () => assertSucceeds(getDocs(query(collection(as("rep"), "salesIncentives"), where("companyName", "==", A), where("uid", "==", "rep")))));
  await t("확정 — 남의 것 읽기 막힘", () => assertFails(getDoc(doc(as("rep"), "salesIncentives", `${A}_2026-11_rep2`))));
  await t("확정 — 영업사무원 회사 전체 목록 막힘", () => assertFails(getDocs(query(collection(as("rep"), "salesIncentives"), where("companyName", "==", A)))));
  await t("확정 — 영업관리자 회사 전체 목록", () => assertSucceeds(getDocs(query(collection(as("mgr"), "salesIncentives"), where("companyName", "==", A)))));
  await t("확정 — 경리 읽기(지급 확인)", () => assertSucceeds(getDoc(doc(as("acct"), "salesIncentives", `${A}_2026-11_rep2`))));
  await t("확정 — 일반 직원 읽기 막힘", () => assertFails(getDoc(doc(as("user"), "salesIncentives", `${A}_2026-11_rep2`))));
  await t("확정 — 다른 회사 읽기 막힘", () => assertFails(getDoc(doc(as("other"), "salesIncentives", `${A}_2026-11_rep`))));

  await env.cleanup();
  console.log(`\n영업팀 보안 규칙 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
