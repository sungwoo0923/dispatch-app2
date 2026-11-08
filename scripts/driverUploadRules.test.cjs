// ⭐ 2026-11-08 보안 — 기사 마스터(drivers/{차량번호}) · 오더 한 건 읽기 · 첨부(attachments) 규칙 테스트(Firestore 에뮬레이터 전용)
//  · 허브 가입 계정 · 다른 회사 계정 · users 문서 없는 새 계정 · 로그인 안 한 사람은 drivers/{차량번호}·오더·첨부를 못 읽는다
//  · 기사 본인 · 같은 회사 사무 직원 · 최고관리자는 읽는다
//  · 업로드 링크(로그인 없음)의 직접 읽기/쓰기는 막히고 서버 함수(uploadAccess)만 쓴다
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/driverUploadRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 필요 — NODE_PATH. 포트 EMU_FS_PORT, 기본 8080. HUB_REPO=규칙 파일이 있는 폴더)
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
const A = "에이운송", B = "비운송";
const PRE_A = `${A}__12가3456`;

(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.HUB_PROJECT || "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
  });
  const seed = (lock) => env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: lock });
    await setDoc(doc(db, "users/userA"), { companyName: A, approved: true, role: "user" });
    await setDoc(doc(db, "users/adminA"), { companyName: A, approved: true, role: "admin" });
    await setDoc(doc(db, "users/drvA"), { companyName: A, approved: true, role: "driver", carNo: "34나5678" });
    await setDoc(doc(db, "users/drvA2"), { companyName: A, approved: true, role: "driver", carNo: "56다7890" });
    await setDoc(doc(db, "users/userB"), { companyName: B, approved: true, role: "admin" });
    await setDoc(doc(db, "users/userD"), { companyName: "돌캐", approved: true, role: "user" });
    await setDoc(doc(db, "users/hub1"), { companyName: "", approved: true, role: "cafeUser" });
    await setDoc(doc(db, "users/shipS"), { companyName: "에스상사", approved: true, role: "shipper", linkedTransportCompany: { companyName: A } });
    await setDoc(doc(db, "users/shipT"), { companyName: "티상사", approved: true, role: "shipper", linkedTransportCompany: { companyName: B } });
    await setDoc(doc(db, "users/master"), { companyName: A, approved: true, role: "totalMaster" });
    // 기사 마스터
    await setDoc(doc(db, `drivers/${PRE_A}`), { companyName: A, 이름: "홍길동", 전화번호: "010-1111-2222", 차량번호: "12가3456" });
    await setDoc(doc(db, "drivers/12가9999"), { 이름: "옛기사", 전화번호: "010-3333-4444", 차량번호: "12가9999" }); // 회사명 없는 예전(돌캐) 문서
    await setDoc(doc(db, "drivers/drvA"), { uid: "drvA", companyName: A, 이름: "에이기사", 차량번호: "34나5678" });
    await setDoc(doc(db, "drivers/linkedX"), { uid: "drvA2", companyName: A, 이름: "에이기사2", 차량번호: "56다7890" });
    // 오더·첨부
    await setDoc(doc(db, "orders/oA"), { companyName: A, 상차일: "2026-11-08", 업로드토큰: "tokA", attachCount: 0 });
    await setDoc(doc(db, "orders/oA/attachments/x1"), { base64: "data:image/png;base64,AA" });
    await setDoc(doc(db, "orders/oS"), { companyName: A, shipperCompany: "에스상사", 상차일: "2026-11-08" });
    await setDoc(doc(db, "dispatch/dA"), { companyName: A, 상차일: "2026-11-08" });
    await setDoc(doc(db, "fixedClients/fA"), { companyName: A, 날짜: "2026-11-08" });
    await setDoc(doc(db, "driver_uploads/mu1"), { 상차일: "2026-11-08", source: "manual_upload" });
    await setDoc(doc(db, "driver_uploads/mu1/attachments/m1"), { base64: "data:image/png;base64,AA" });
  });
  await env.clearFirestore();
  await seed(true);
  const as = (uid, tok) => env.authenticatedContext(uid, tok).firestore();
  const ANON = env.unauthenticatedContext().firestore();
  const UA = as("userA"), AA = as("adminA"), DA = as("drvA"), DA2 = as("drvA2"), UB = as("userB"), UD = as("userD");
  const HUB = as("hub1"), NEW = as("newDriverNoDoc"), SS = as("shipS"), ST = as("shipT");
  const M = as("master", { email: "tjddnqkf@naver.com" });

  // ── drivers/{차량번호} ──
  await t("drivers: 로그인 안 한 사람 선등록 문서 거절", () => assertFails(getDoc(doc(ANON, `drivers/${PRE_A}`))));
  await t("drivers: users 문서 없는 새 계정(예전 기사 로그인 흐름) 거절", () => assertFails(getDoc(doc(NEW, `drivers/${PRE_A}`))));
  await t("drivers: 허브 가입 계정 거절", () => assertFails(getDoc(doc(HUB, `drivers/${PRE_A}`))));
  await t("drivers: 다른 회사 직원 거절", () => assertFails(getDoc(doc(UB, `drivers/${PRE_A}`))));
  await t("drivers: 화주 계정 거절", () => assertFails(getDoc(doc(SS, `drivers/${PRE_A}`))));
  await t("drivers: 같은 회사 다른 기사 거절", () => assertFails(getDoc(doc(DA, `drivers/${PRE_A}`))));
  await t("drivers: 같은 회사 직원 읽기", () => assertSucceeds(getDoc(doc(UA, `drivers/${PRE_A}`))));
  await t("drivers: 같은 회사 관리자 읽기", () => assertSucceeds(getDoc(doc(AA, `drivers/${PRE_A}`))));
  await t("drivers: 최고관리자 읽기", () => assertSucceeds(getDoc(doc(M, `drivers/${PRE_A}`))));
  await t("drivers: 기사 본인(문서 이름 = uid)", () => assertSucceeds(getDoc(doc(DA, "drivers/drvA"))));
  await t("drivers: 기사 본인(uid 칸 = 나)", () => assertSucceeds(getDoc(doc(DA2, "drivers/linkedX"))));
  await t("drivers: 다른 기사 문서 거절", () => assertFails(getDoc(doc(DA2, "drivers/drvA"))));
  await t("drivers: 회사명 없는 예전 문서 — 기본 회사(돌캐) 직원 읽기", () => assertSucceeds(getDoc(doc(UD, "drivers/12가9999"))));
  await t("drivers: 회사명 없는 예전 문서 — 다른 회사·새 계정 거절", async () => {
    await assertFails(getDoc(doc(UA, "drivers/12가9999")));
    await assertFails(getDoc(doc(NEW, "drivers/12가9999")));
  });
  await t("drivers: 같은 회사 목록", () => assertSucceeds(getDocs(query(collection(UA, "drivers"), where("companyName", "==", A)))));
  await t("drivers: 다른 회사 목록 거절", () => assertFails(getDocs(query(collection(UB, "drivers"), where("companyName", "==", A)))));
  await t("drivers: 새 계정이 자기 uid 문서 만들기(가입 흐름 유지)", () => assertSucceeds(setDoc(doc(NEW, "drivers/newDriverNoDoc"), { uid: "newDriverNoDoc", companyName: A })));

  // ── 오더 한 건 ──
  await t("orders: 로그인 안 한 사람 한 건 읽기 거절(예전: 누구나)", () => assertFails(getDoc(doc(ANON, "orders/oA"))));
  await t("orders: 허브 계정 거절", () => assertFails(getDoc(doc(HUB, "orders/oA"))));
  await t("orders: 다른 회사 거절", () => assertFails(getDoc(doc(UB, "orders/oA"))));
  await t("orders: 같은 회사 직원·기사 읽기", async () => { await assertSucceeds(getDoc(doc(UA, "orders/oA"))); await assertSucceeds(getDoc(doc(DA, "orders/oA"))); });
  await t("orders: 그 오더의 화주 읽기 / 다른 화주 거절", async () => { await assertSucceeds(getDoc(doc(SS, "orders/oS"))); await assertFails(getDoc(doc(ST, "orders/oS"))); });
  await t("orders: 로그인 안 한 사람 attachCount·잠금 수정 거절(예전 isPublicOrderUpdate)", async () => {
    await assertFails(updateDoc(doc(ANON, "orders/oA"), { attachCount: 5 }));
    await assertFails(updateDoc(doc(ANON, "orders/oA"), { 업로드잠금: true }));
    await assertFails(updateDoc(doc(ANON, "orders/oA"), { 위치공유중: true }));
  });
  await t("orders: 다른 회사 attachCount 수정 거절", () => assertFails(updateDoc(doc(UB, "orders/oA"), { attachCount: 5 })));
  await t("orders: 같은 회사 직원 수정", () => assertSucceeds(updateDoc(doc(UA, "orders/oA"), { attachCount: 1 })));
  await t("dispatch·fixedClients: 로그인 안 한 사람 한 건 읽기 거절", async () => {
    await assertFails(getDoc(doc(ANON, "dispatch/dA")));
    await assertFails(getDoc(doc(ANON, "fixedClients/fA")));
    await assertFails(updateDoc(doc(ANON, "dispatch/dA"), { attachCount: 1 }));
    await assertFails(updateDoc(doc(ANON, "fixedClients/fA"), { attachCount: 1 }));
  });
  await t("dispatch·fixedClients: 같은 회사 읽기 / 다른 회사 거절", async () => {
    await assertSucceeds(getDoc(doc(UA, "dispatch/dA")));
    await assertSucceeds(getDoc(doc(UA, "fixedClients/fA")));
    await assertFails(getDoc(doc(UB, "dispatch/dA")));
    await assertFails(getDoc(doc(UB, "fixedClients/fA")));
  });

  // ── 첨부 ──
  await t("attachments: 로그인 안 한 사람 읽기·올리기·지우기 거절(예전: 누구나)", async () => {
    await assertFails(getDoc(doc(ANON, "orders/oA/attachments/x1")));
    await assertFails(setDoc(doc(ANON, "orders/oA/attachments/evil"), { base64: "x" }));
    await assertFails(deleteDoc(doc(ANON, "orders/oA/attachments/x1")));
  });
  await t("attachments: 허브·다른 회사 읽기·올리기 거절", async () => {
    await assertFails(getDoc(doc(HUB, "orders/oA/attachments/x1")));
    await assertFails(getDoc(doc(UB, "orders/oA/attachments/x1")));
    await assertFails(setDoc(doc(UB, "orders/oA/attachments/evil"), { base64: "x" }));
    await assertFails(deleteDoc(doc(UB, "orders/oA/attachments/x1")));
  });
  await t("attachments: 같은 회사 직원 읽기·올리기·지우기", async () => {
    await assertSucceeds(getDoc(doc(UA, "orders/oA/attachments/x1")));
    await assertSucceeds(setDoc(doc(UA, "orders/oA/attachments/s1"), { base64: "x" }));
    await assertSucceeds(deleteDoc(doc(UA, "orders/oA/attachments/s1")));
  });
  await t("attachments: 같은 회사 기사(기사앱) 올리기", () => assertSucceeds(setDoc(doc(DA, "orders/oA/attachments/d1"), { base64: "x" })));
  await t("attachments: 그 오더 화주 읽기", () => assertSucceeds(getDocs(collection(SS, "orders/oS/attachments"))));
  await t("attachments: 회사명 없는 수동 업로드 — 사무 직원 한 건 읽기 / 로그인 안 함·화주·허브 거절", async () => {
    await assertSucceeds(getDoc(doc(UA, "driver_uploads/mu1/attachments/m1")));
    await assertFails(getDoc(doc(ANON, "driver_uploads/mu1/attachments/m1")));
    await assertFails(getDoc(doc(SS, "driver_uploads/mu1/attachments/m1")));
    await assertFails(getDoc(doc(HUB, "driver_uploads/mu1/attachments/m1")));
    await assertFails(setDoc(doc(ANON, "driver_uploads/mu1/attachments/e"), { base64: "x" }));
  });

  // ── 잠금 전(serverFilter false) — 로그인 안 한 사람은 그래도 못 읽는다 ──
  await seed(false);
  await t("잠금 전: 로그인 안 한 사람 오더 목록·한 건 거절(예전: 목록도 누구나)", async () => {
    await assertFails(getDocs(collection(ANON, "orders")));
    await assertFails(getDoc(doc(ANON, "orders/oA")));
  });
  await t("잠금 전: 허브 계정 drivers/{차량번호} 거절 · 다른 회사 직원도 거절", async () => {
    await assertFails(getDoc(doc(HUB, `drivers/${PRE_A}`)));
    await assertFails(getDoc(doc(UB, `drivers/${PRE_A}`)));
  });
  await t("잠금 전: 승인된 직원 오더 목록(예전과 같음)", () => assertSucceeds(getDocs(collection(UB, "orders"))));

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
