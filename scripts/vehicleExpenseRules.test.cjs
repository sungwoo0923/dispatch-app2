// 🧾 2026-11-10 차량 비용 영수증 · 정기 차량 사진 보안 규칙 테스트 — Firestore 에뮬레이터
//  실행: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/vehicleExpenseRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 필요 — NODE_PATH로 넘겨도 된다. 포트 EMU_FS_PORT(기본 8080))
//  ① 기사: 본인 영수증만 올림(내 회사 · 상태 접수) · 본인 것만 읽음 · 상태를 마음대로 못 바꿈 · 반려된 것만 다시 올림 · 확인 전만 지움
//  ② 직원: 같은 회사 영수증 읽기 · 확인 · 반려 · 고치기 / 다른 회사는 못 봄 · 화주는 못 봄
//  ③ 정기 사진: 기사 본인 문서 id(uid_)만 · 설정은 사무 직원만 바꾸고 같은 회사 누구나 읽음
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, addDoc } = require("firebase/firestore");

const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
const A = "에이운송", B = "비운송";
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name} :: ${String(e?.message || e).slice(0, 180)}`); } }
const USERS = {
  drvA: { companyName: A, approved: true, role: "driver" }, drvA2: { companyName: A, approved: true, role: "driver" },
  staffA: { companyName: A, approved: true, role: "user" }, staffB: { companyName: B, approved: true, role: "user" },
  shipA: { companyName: A, approved: true, role: "shipper" },
};
const exp = (over = {}) => ({ companyName: A, driverId: "drvA", driverName: "김기사", kinds: ["engineOil"], amount: 85000, status: "접수", image: "data:x", ...over });

(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-vex-rules", firestore: { rules: fs.readFileSync(path.join(process.env.REPO || path.resolve(__dirname, ".."), "firestore.rules"), "utf8"), host: "127.0.0.1", port: FS_PORT } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [uid, u] of Object.entries(USERS)) await setDoc(doc(db, "users", uid), u);
    await setDoc(doc(db, "systemConfig", "tenancy"), { serverFilter: true });
    await setDoc(doc(db, "vehicleExpenses", "e1"), exp());
    await setDoc(doc(db, "vehicleExpenses", "e2"), exp({ driverId: "drvA2" }));
    await setDoc(doc(db, "vehicleExpenses", "eRej"), exp({ status: "반려", rejectReason: "흐림" }));
    await setDoc(doc(db, "vehicleExpenses", "eB"), exp({ companyName: B, driverId: "drvB" }));
    await setDoc(doc(db, "vehiclePhotoSettings", A), { companyName: A, on: true, cycle: "weekly" });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const D = as("drvA"), D2 = as("drvA2"), SA = as("staffA"), SB = as("staffB"), SH = as("shipA");

  await t("기사 — 본인 영수증 올리기(접수)", () => assertSucceeds(addDoc(collection(D, "vehicleExpenses"), exp())));
  await t("기사 — 다른 기사 이름으로 올리기 막힘", () => assertFails(addDoc(collection(D, "vehicleExpenses"), exp({ driverId: "drvA2" }))));
  await t("기사 — 다른 회사 이름으로 올리기 막힘", () => assertFails(addDoc(collection(D, "vehicleExpenses"), exp({ companyName: B }))));
  await t("기사 — 처음부터 승인 상태로 올리기 막힘", () => assertFails(addDoc(collection(D, "vehicleExpenses"), exp({ status: "승인" }))));
  await t("기사 — 본인 영수증 목록 읽기", () => assertSucceeds(getDocs(query(collection(D, "vehicleExpenses"), where("driverId", "==", "drvA")))));
  await t("기사 — 같은 회사 다른 기사 영수증 읽기 막힘", () => assertFails(getDoc(doc(D, "vehicleExpenses", "e2"))));
  await t("기사 — 회사 전체 목록 읽기 막힘", () => assertFails(getDocs(query(collection(D, "vehicleExpenses"), where("companyName", "==", A)))));
  await t("기사 — 접수 상태를 승인으로 바꾸기 막힘", () => assertFails(updateDoc(doc(D, "vehicleExpenses", "e1"), { status: "승인" })));
  await t("기사 — 금액 고치기 막힘", () => assertFails(updateDoc(doc(D, "vehicleExpenses", "e1"), { amount: 1 })));
  await t("기사 — 반려된 영수증 다시 찍어 올리기", () => assertSucceeds(updateDoc(doc(D, "vehicleExpenses", "eRej"), { image: "data:y", imgHash: "ab", takenAt: 1, captured: true, status: "접수", rejectReason: "" })));
  await t("기사 — 다른 기사 반려 영수증 고치기 막힘", () => assertFails(updateDoc(doc(D2, "vehicleExpenses", "eRej"), { image: "data:z", status: "접수" })));
  await t("기사 — 확인 전(접수) 본인 영수증 지우기", () => assertSucceeds(deleteDoc(doc(D, "vehicleExpenses", "e1"))));
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "vehicleExpenses", "e1"), exp({ status: "확인" })); });
  await t("기사 — 확인된 영수증 지우기 막힘", () => assertFails(deleteDoc(doc(D, "vehicleExpenses", "e1"))));

  await t("직원 — 같은 회사 목록 읽기", () => assertSucceeds(getDocs(query(collection(SA, "vehicleExpenses"), where("companyName", "==", A)))));
  await t("직원 — 확인 · 반려 · 고치기", () => assertSucceeds(updateDoc(doc(SA, "vehicleExpenses", "e2"), { status: "반려", rejectReason: "다시" })));
  await t("직원 — 회사 이름 바꾸기 막힘", () => assertFails(updateDoc(doc(SA, "vehicleExpenses", "e2"), { companyName: B })));
  await t("다른 회사 직원 — 읽기 막힘", () => assertFails(getDoc(doc(SB, "vehicleExpenses", "e2"))));
  await t("다른 회사 직원 — 고치기 막힘", () => assertFails(updateDoc(doc(SB, "vehicleExpenses", "e2"), { status: "확인" })));
  await t("화주 — 읽기 막힘", () => assertFails(getDoc(doc(SH, "vehicleExpenses", "e2"))));

  await t("정기 사진 — 기사 본인 문서 올리기", () => assertSucceeds(setDoc(doc(D, "vehiclePhotos", "drvA_W2026-11-09_앞"), { companyName: A, driverId: "drvA", periodKey: "W2026-11-09", part: "앞", image: "data:x" })));
  await t("정기 사진 — 같은 칸 다시 찍기(덮어쓰기)", () => assertSucceeds(setDoc(doc(D, "vehiclePhotos", "drvA_W2026-11-09_앞"), { companyName: A, driverId: "drvA", periodKey: "W2026-11-09", part: "앞", image: "data:y" })));
  await t("정기 사진 — 남의 uid 문서 id 막힘", () => assertFails(setDoc(doc(D, "vehiclePhotos", "drvA2_W2026-11-09_앞"), { companyName: A, driverId: "drvA", periodKey: "W2026-11-09", part: "앞" })));
  await t("정기 사진 — 다른 기사 사진 덮어쓰기 막힘", () => assertFails(setDoc(doc(D2, "vehiclePhotos", "drvA_W2026-11-09_앞"), { companyName: A, driverId: "drvA2", periodKey: "W2026-11-09", part: "앞" })));
  await t("정기 사진 — 직원 같은 회사 목록", () => assertSucceeds(getDocs(query(collection(SA, "vehiclePhotos"), where("companyName", "==", A), where("periodKey", "==", "W2026-11-09")))));
  await t("정기 사진 — 다른 회사 직원 읽기 막힘", () => assertFails(getDoc(doc(SB, "vehiclePhotos", "drvA_W2026-11-09_앞"))));
  await t("사진 설정 — 기사 읽기", () => assertSucceeds(getDoc(doc(D, "vehiclePhotoSettings", A))));
  await t("사진 설정 — 기사 바꾸기 막힘", () => assertFails(setDoc(doc(D, "vehiclePhotoSettings", A), { companyName: A, on: false })));
  await t("사진 설정 — 같은 회사 직원 저장", () => assertSucceeds(setDoc(doc(SA, "vehiclePhotoSettings", A), { companyName: A, on: true, cycle: "monthly" })));
  await t("사진 설정 — 다른 회사 직원 저장 막힘", () => assertFails(setDoc(doc(SB, "vehiclePhotoSettings", A), { companyName: A, on: false })));
  await t("사진 설정 — 다른 회사 설정 읽기 막힘", () => assertFails(getDoc(doc(SB, "vehiclePhotoSettings", A))));

  await env.cleanup();
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
