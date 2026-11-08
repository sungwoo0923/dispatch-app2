// ✉️ 2026-11-08 운송사별 발신 메일 컬렉션 — 보안 규칙 테스트(Firestore 에뮬레이터 전용)
//  companyMailSettings(같은 회사 직원 읽기 · 서버만 씀) · companyMailSecrets · companyMailUsage(서버만) · emailLogs(서버가 쓴 기록 · 회사 범위)
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/companyMailRules.test.cjs"
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
    await setDoc(doc(db, "users/staffA"), { companyName: "에이운송", approved: true, role: "user" });
    await setDoc(doc(db, "users/viewerA"), { companyName: "에이운송", approved: true, role: "viewer" });
    await setDoc(doc(db, "users/driverA"), { companyName: "에이운송", approved: true, role: "driver" });
    await setDoc(doc(db, "users/shipperA"), { companyName: "화주사", approved: true, role: "shipper", linkedTransportCompany: { companyName: "에이운송" } });
    await setDoc(doc(db, "users/pendingA"), { companyName: "에이운송", approved: false, role: "user" });
    await setDoc(doc(db, "users/adminB"), { companyName: "비운송", approved: true, role: "admin" });
    await setDoc(doc(db, "users/tm"), { companyName: "돌캐", approved: true, role: "totalMaster" });
    await setDoc(doc(db, "companyMailSettings/에이운송"), { companyName: "에이운송", fromEmail: "a@daum.net", host: "smtp.daum.net", port: 465, hasPassword: true });
    await setDoc(doc(db, "companyMailSettings/비운송"), { companyName: "비운송", fromEmail: "b@naver.com", host: "smtp.naver.com", port: 465, hasPassword: true });
    await setDoc(doc(db, "companyMailSecrets/에이운송"), { companyName: "에이운송", iv: "x", tag: "y", ct: "z" });
    await setDoc(doc(db, "companyMailUsage/에이운송__staffA__2026-11-08"), { companyName: "에이운송", n: 3 });
    await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: true }); // emailLogs 회사 검사는 잠금 스위치를 켠 뒤부터
    await setDoc(doc(db, "emailLogs/la"), { companyName: "에이운송", type: "거래명세서", status: "success", via: "sendCompanyMail" });
    await setDoc(doc(db, "emailLogs/lb"), { companyName: "비운송", type: "거래명세서", status: "success", via: "sendCompanyMail" });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const AD = as("adminA"), ST = as("staffA"), VW = as("viewerA"), DR = as("driverA"), SH = as("shipperA"), PE = as("pendingA"), BD = as("adminB"), TM = as("tm");
  const anon = env.unauthenticatedContext().firestore();
  const S = "companyMailSettings";

  // companyMailSettings — 같은 회사 직원 읽기, 쓰기는 서버만
  await t("설정: 같은 회사 직원 읽기", () => assertSucceeds(getDoc(doc(ST, `${S}/에이운송`))));
  await t("설정: 같은 회사 조회 전용 읽기", () => assertSucceeds(getDoc(doc(VW, `${S}/에이운송`))));
  await t("설정: 같은 회사 관리자 읽기", () => assertSucceeds(getDoc(doc(AD, `${S}/에이운송`))));
  await t("설정: 최고관리자 읽기", () => assertSucceeds(getDoc(doc(TM, `${S}/비운송`))));
  await t("설정: 다른 회사 읽기 거절", () => assertFails(getDoc(doc(ST, `${S}/비운송`))));
  await t("설정: 다른 회사 관리자 읽기 거절", () => assertFails(getDoc(doc(BD, `${S}/에이운송`))));
  await t("설정: 기사 읽기 거절", () => assertFails(getDoc(doc(DR, `${S}/에이운송`))));
  await t("설정: 화주 읽기 거절", () => assertFails(getDoc(doc(SH, `${S}/에이운송`))));
  await t("설정: 승인 전 거절", () => assertFails(getDoc(doc(PE, `${S}/에이운송`))));
  await t("설정: 로그인 안 함 거절", () => assertFails(getDoc(doc(anon, `${S}/에이운송`))));
  await t("설정: 목록 읽기 거절(문서 하나씩만)", () => assertFails(getDocs(collection(ST, S))));
  await t("설정: 관리자도 쓰기 거절(서버만)", () => assertFails(setDoc(doc(AD, `${S}/에이운송`), { companyName: "에이운송", fromEmail: "x@daum.net" })));
  await t("설정: 관리자도 고치기 거절(서버만)", () => assertFails(updateDoc(doc(AD, `${S}/에이운송`), { fromEmail: "x@daum.net" })));
  await t("설정: 관리자도 지우기 거절(서버만)", () => assertFails(deleteDoc(doc(AD, `${S}/에이운송`))));
  await t("설정: 새 회사 문서 만들기 거절", () => assertFails(setDoc(doc(AD, `${S}/새회사`), { companyName: "에이운송" })));
  await t("설정: 최고관리자도 쓰기 거절(서버만)", () => assertFails(setDoc(doc(TM, `${S}/에이운송`), { companyName: "에이운송" })));

  // companyMailSecrets · companyMailUsage — 아무도 못 읽고 못 씀
  for (const [col, id] of [["companyMailSecrets", "에이운송"], ["companyMailUsage", "에이운송__staffA__2026-11-08"]]) {
    await t(`${col}: 같은 회사 관리자 읽기 거절`, () => assertFails(getDoc(doc(AD, `${col}/${id}`))));
    await t(`${col}: 최고관리자 읽기 거절`, () => assertFails(getDoc(doc(TM, `${col}/${id}`))));
    await t(`${col}: 목록 읽기 거절`, () => assertFails(getDocs(query(collection(AD, col), where("companyName", "==", "에이운송")))));
    await t(`${col}: 쓰기 거절`, () => assertFails(setDoc(doc(AD, `${col}/${id}`), { companyName: "에이운송", ct: "aa" })));
    await t(`${col}: 회사명 맞춰 새로 만들기 거절(공용 규칙에 안 걸림)`, () => assertFails(setDoc(doc(AD, `${col}/new1`), { companyName: "에이운송" })));
    await t(`${col}: 지우기 거절`, () => assertFails(deleteDoc(doc(AD, `${col}/${id}`))));
  }

  // emailLogs — 서버가 쓴 기록은 회사 범위로만 읽는다(잠금 스위치 켠 상태)
  await t("발송 기록: 같은 회사 조건 목록 읽기", () => assertSucceeds(getDocs(query(collection(ST, "emailLogs"), where("companyName", "==", "에이운송")))));
  await t("발송 기록: 다른 회사 문서 읽기 거절", () => assertFails(getDoc(doc(ST, "emailLogs/lb"))));
  await t("발송 기록: 다른 회사 조건 목록 거절", () => assertFails(getDocs(query(collection(ST, "emailLogs"), where("companyName", "==", "비운송")))));

  console.log(out.join("\n"));
  console.log(`\n회사 메일 규칙 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
