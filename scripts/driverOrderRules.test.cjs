// 🔒 2026-11-08 기사 계정 — 오더 운임·금액 칸 수정 불가 · 오더 만들기/지우기 불가 · 등록 기기(driverDevices)는 서버만(Firestore 에뮬레이터)
//  기사앱이 쓰는 칸(기사확인상태 · 상차/하차 · 사진 수 · 거절 · 배차 해제)은 그대로 된다.
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/driverOrderRules.test.cjs"
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection } = require("firebase/firestore");

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}
const CO = "테스트운송사";

(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.HUB_PROJECT || "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: true });
    await setDoc(doc(db, "users/drv"), { companyName: CO, approved: true, role: "driver", name: "기사" });
    await setDoc(doc(db, "users/staff"), { companyName: CO, approved: true, role: "user", team: "배차팀", name: "직원" });
    await setDoc(doc(db, "users/other"), { companyName: "다른운송", approved: true, role: "admin", name: "남" });
    for (const col of ["orders", "dispatch"]) {
      await setDoc(doc(db, `${col}/o1`), { companyName: CO, 차량번호: "경기97가1234", 기사운임: 100000, 청구운임: 150000, 수수료: 50000, 기사확인상태: "대기", 배차상태: "배차완료" });
    }
    await setDoc(doc(db, "driverDevices/drv"), { uid: "drv", companyName: CO, id: "abc" });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();

  for (const col of ["orders", "dispatch"]) {
    await t(`${col}: 기사 — 수락·상차·사진 칸 수정 OK`, () => assertSucceeds(updateDoc(doc(as("drv"), `${col}/o1`), { 기사확인상태: "수락", 상차완료: true, attachCount: 2 })));
    await t(`${col}: 기사 — 거절(배차 해제) OK`, () => assertSucceeds(updateDoc(doc(as("drv"), `${col}/o1`), { 기사확인상태: "거절", 차량번호: "", 이름: "", 배차상태: "배차중" })));
    await t(`${col}: 기사 — 기사운임 수정 거절`, () => assertFails(updateDoc(doc(as("drv"), `${col}/o1`), { 기사운임: 999999 })));
    await t(`${col}: 기사 — 청구운임·수수료 수정 거절`, () => assertFails(updateDoc(doc(as("drv"), `${col}/o1`), { 청구운임: 1, 수수료: 1 })));
    await t(`${col}: 기사 — 상태와 같이 몰래 운임 수정 거절`, () => assertFails(updateDoc(doc(as("drv"), `${col}/o1`), { 기사확인상태: "수락", 기사운임: 999999 })));
    await t(`${col}: 기사 — 오더 만들기 거절`, () => assertFails(addDoc(collection(as("drv"), col), { companyName: CO, 기사운임: 1 })));
    await t(`${col}: 기사 — 오더 지우기 거절`, () => assertFails(deleteDoc(doc(as("drv"), `${col}/o1`))));
    await t(`${col}: 직원 — 운임 수정 OK`, () => assertSucceeds(updateDoc(doc(as("staff"), `${col}/o1`), { 기사운임: 120000 })));
  }
  await t("등록 기기: 기사 본인 읽기 OK · 쓰기 거절", async () => {
    await assertSucceeds(getDoc(doc(as("drv"), "driverDevices/drv")));
    await assertFails(setDoc(doc(as("drv"), "driverDevices/drv"), { uid: "drv", companyName: CO, id: null }));
  });
  await t("등록 기기: 같은 회사 직원 읽기 OK · 쓰기 거절", async () => {
    await assertSucceeds(getDoc(doc(as("staff"), "driverDevices/drv")));
    await assertFails(deleteDoc(doc(as("staff"), "driverDevices/drv")));
  });
  await t("등록 기기: 다른 회사 읽기 거절", () => assertFails(getDoc(doc(as("other"), "driverDevices/drv"))));

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
