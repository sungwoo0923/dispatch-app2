// 💬🏦 2026-11-08 팝빌 자동화 컬렉션 — 보안 규칙 테스트(Firestore 에뮬레이터 전용)
//  popbillSettings(회사 설정) · bankSyncState · bankAliases · bankTxns · alimtalkLogs(서버만 씀)
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/popbillAutoRules.test.cjs"
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } = require("firebase/firestore");

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.HUB_PROJECT || "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/adminA"), { companyName: "에이운송", approved: true, role: "admin" });
    await setDoc(doc(db, "users/masterA"), { companyName: "에이운송", approved: true, role: "user", isMaster: true });
    await setDoc(doc(db, "users/staffA"), { companyName: "에이운송", approved: true, role: "user" });
    await setDoc(doc(db, "users/driverA"), { companyName: "에이운송", approved: true, role: "driver" });
    await setDoc(doc(db, "users/shipperA"), { companyName: "에이운송", approved: true, role: "shipper" });
    await setDoc(doc(db, "users/pendingA"), { companyName: "에이운송", approved: false, role: "user" });
    await setDoc(doc(db, "users/adminB"), { companyName: "비운송", approved: true, role: "admin" });
    await setDoc(doc(db, "popbillSettings/에이운송"), { companyName: "에이운송", alimtalk: { enabled: true } });
    await setDoc(doc(db, "popbillSettings/비운송"), { companyName: "비운송", alimtalk: { enabled: false } });
    await setDoc(doc(db, "bankSyncState/에이운송"), { companyName: "에이운송", status: "off" });
    await setDoc(doc(db, "bankSyncState/비운송"), { companyName: "비운송", status: "off" });
    await setDoc(doc(db, "bankAliases/에이운송"), { companyName: "에이운송", map: { 김철수: "한빛" } });
    await setDoc(doc(db, "bankAliases/비운송"), { companyName: "비운송", map: {} });
    await setDoc(doc(db, "bankTxns/에이운송__acc1__T1"), { companyName: "에이운송", amount: 1000, status: "review" });
    await setDoc(doc(db, "bankTxns/비운송__acc1__T1"), { companyName: "비운송", amount: 2000, status: "review" });
    await setDoc(doc(db, "alimtalkLogs/orders_o1_A_client"), { companyName: "에이운송", status: "sent" });
    await setDoc(doc(db, "alimtalkLogs/orders_o2_B_client"), { companyName: "비운송", status: "sent" });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const AD = as("adminA"), MS = as("masterA"), ST = as("staffA"), DR = as("driverA"), SH = as("shipperA"), PE = as("pendingA"), BD = as("adminB");
  const anon = env.unauthenticatedContext().firestore();
  const settings = { companyName: "에이운송", alimtalk: { enabled: false, toClient: true, toDriver: true, templates: { client: "C1", driver: "D1" } }, bankAccounts: [{ id: "acc1", bankCode: "0003", accountNumber: "123", holder: "에이", enabled: true }], updatedAt: 1, updatedBy: "adminA" };

  // popbillSettings
  await t("설정: 같은 회사 직원 읽기", () => assertSucceeds(getDoc(doc(ST, "popbillSettings/에이운송"))));
  await t("설정: 다른 회사 읽기 거절", () => assertFails(getDoc(doc(ST, "popbillSettings/비운송"))));
  await t("설정: 기사 읽기 거절", () => assertFails(getDoc(doc(DR, "popbillSettings/에이운송"))));
  await t("설정: 화주 읽기 거절", () => assertFails(getDoc(doc(SH, "popbillSettings/에이운송"))));
  await t("설정: 승인 전 거절", () => assertFails(getDoc(doc(PE, "popbillSettings/에이운송"))));
  await t("설정: 로그인 안 함 거절", () => assertFails(getDoc(doc(anon, "popbillSettings/에이운송"))));
  await t("설정: 회사 관리자 쓰기", () => assertSucceeds(setDoc(doc(AD, "popbillSettings/에이운송"), settings, { merge: true })));
  await t("설정: 회사 마스터 쓰기", () => assertSucceeds(updateDoc(doc(MS, "popbillSettings/에이운송"), { alimtalk: { enabled: true } })));
  await t("설정: 일반 직원 쓰기 거절", () => assertFails(updateDoc(doc(ST, "popbillSettings/에이운송"), { alimtalk: { enabled: false } })));
  await t("설정: 다른 회사 관리자 쓰기 거절", () => assertFails(setDoc(doc(BD, "popbillSettings/에이운송"), settings, { merge: true })));
  await t("설정: 회사 이름 바꿔 쓰기 거절", () => assertFails(setDoc(doc(AD, "popbillSettings/에이운송"), { ...settings, companyName: "비운송" })));
  await t("설정: 모르는 칸 거절", () => assertFails(setDoc(doc(AD, "popbillSettings/에이운송"), { secretKey: "x" }, { merge: true })));
  await t("설정: 다른 회사 문서 새로 만들기 거절", () => assertFails(setDoc(doc(AD, "popbillSettings/씨운송"), { companyName: "씨운송" })));
  await t("설정: 지우기 거절(최고관리자만)", () => assertFails(deleteDoc(doc(AD, "popbillSettings/에이운송"))));

  // 서버만 쓰는 문서
  for (const [col, mine, other] of [["bankSyncState", "에이운송", "비운송"], ["bankAliases", "에이운송", "비운송"]]) {
    await t(`${col}: 같은 회사 직원 읽기`, () => assertSucceeds(getDoc(doc(ST, `${col}/${mine}`))));
    await t(`${col}: 다른 회사 읽기 거절`, () => assertFails(getDoc(doc(ST, `${col}/${other}`))));
    await t(`${col}: 기사 읽기 거절`, () => assertFails(getDoc(doc(DR, `${col}/${mine}`))));
    await t(`${col}: 관리자도 쓰기 거절(서버만)`, () => assertFails(setDoc(doc(AD, `${col}/${mine}`), { companyName: mine, x: 1 })));
  }
  for (const [col, mine, other] of [["bankTxns", "에이운송__acc1__T1", "비운송__acc1__T1"], ["alimtalkLogs", "orders_o1_A_client", "orders_o2_B_client"]]) {
    await t(`${col}: 같은 회사 문서 읽기`, () => assertSucceeds(getDoc(doc(ST, `${col}/${mine}`))));
    await t(`${col}: 다른 회사 문서 읽기 거절`, () => assertFails(getDoc(doc(ST, `${col}/${other}`))));
    await t(`${col}: 회사 조건 목록 읽기`, () => assertSucceeds(getDocs(query(collection(ST, col), where("companyName", "==", "에이운송")))));
    await t(`${col}: 회사 조건 없는 목록 거절`, () => assertFails(getDocs(collection(ST, col))));
    await t(`${col}: 다른 회사 조건 목록 거절`, () => assertFails(getDocs(query(collection(ST, col), where("companyName", "==", "비운송")))));
    await t(`${col}: 기사 · 화주 읽기 거절`, () => Promise.all([assertFails(getDoc(doc(DR, `${col}/${mine}`))), assertFails(getDoc(doc(SH, `${col}/${mine}`)))]));
    await t(`${col}: 관리자도 새로 만들기 거절(서버만)`, () => assertFails(setDoc(doc(AD, `${col}/new1`), { companyName: "에이운송" })));
    await t(`${col}: 관리자도 고치기 거절(서버만)`, () => assertFails(updateDoc(doc(AD, `${col}/${mine}`), { status: "confirmed" })));
    await t(`${col}: 관리자도 지우기 거절(서버만)`, () => assertFails(deleteDoc(doc(AD, `${col}/${mine}`))));
  }
  await t("bankTxns: 상태 조건(in) 목록 읽기", () => assertSucceeds(getDocs(query(collection(ST, "bankTxns"), where("companyName", "==", "에이운송"), where("status", "in", ["review", "auto", "new"])))));

  console.log(out.join("\n"));
  console.log(`\n팝빌 자동화 규칙 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
