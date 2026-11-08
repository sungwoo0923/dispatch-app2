// 🔒 2026-11-08 기사 서류함(지급명세서 driverStatements · 과태료 fleetPenalties) — 기사가 바꿀 수 있는 상태값 규칙 테스트(Firestore 에뮬레이터)
//  · 기사 본인 것: 읽음·확인·기사 확인·이의 신청 OK, 직접 내는 과태료만 '납부 완료' OK
//  · '취소', 기사 부담(공제)·회사 부담 건의 '납부 완료', 금액 수정, 남의 서류는 거절
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/driverInboxRules.test.cjs"
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc } = require("firebase/firestore");

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
  const seed = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users/drv"), { companyName: CO, approved: true, role: "driver", name: "기사" });
      await setDoc(doc(db, "users/drv2"), { companyName: CO, approved: true, role: "driver", name: "다른 기사" });
      await setDoc(doc(db, "users/office"), { companyName: CO, approved: true, role: "admin", name: "직원" });
      await setDoc(doc(db, "fleetPenalties/self"), { companyName: CO, driverId: "drv", payer: "기사 직접 납부", status: "접수", amount: 40000 });
      await setDoc(doc(db, "fleetPenalties/deduct"), { companyName: CO, driverId: "drv", payer: "기사 부담(지급액 공제)", status: "접수", amount: 40000 });
      await setDoc(doc(db, "fleetPenalties/company"), { companyName: CO, driverId: "drv", payer: "회사 부담", status: "접수", amount: 40000 });
      await setDoc(doc(db, "driverStatements/s1"), { companyName: CO, driverId: "drv", status: "sent", period: "2026-10" });
    });
  };
  const as = (uid) => env.authenticatedContext(uid).firestore();

  await seed();
  await t("과태료: 기사 확인 OK", () => assertSucceeds(updateDoc(doc(as("drv"), "fleetPenalties/self"), { status: "기사 확인", readAt: 1 })));
  await t("과태료: 이의 신청 OK", () => assertSucceeds(updateDoc(doc(as("drv"), "fleetPenalties/deduct"), { status: "이의 신청", objectedAt: 1, driverAction: "이의 신청" })));
  await t("과태료: 직접 내는 건 납부 완료 OK", () => assertSucceeds(updateDoc(doc(as("drv"), "fleetPenalties/self"), { status: "납부 완료", paidAt: 1, driverAction: "납부 완료" })));
  await t("과태료: 공제 건 납부 완료 거절", () => assertFails(updateDoc(doc(as("drv"), "fleetPenalties/deduct"), { status: "납부 완료" })));
  await t("과태료: 회사 부담 건 납부 완료 거절", () => assertFails(updateDoc(doc(as("drv"), "fleetPenalties/company"), { status: "납부 완료" })));
  await t("과태료: 기사가 취소 거절", () => assertFails(updateDoc(doc(as("drv"), "fleetPenalties/company"), { status: "취소" })));
  await t("과태료: 상태 그대로 메모만 OK", () => assertSucceeds(updateDoc(doc(as("drv"), "fleetPenalties/company"), { driverMemo: "확인했어요" })));
  await t("과태료: 금액 수정 거절", () => assertFails(updateDoc(doc(as("drv"), "fleetPenalties/company"), { amount: 0 })));
  await t("과태료: 다른 기사 거절", () => assertFails(updateDoc(doc(as("drv2"), "fleetPenalties/company"), { readAt: 1 })));
  await t("과태료: 직원은 취소 OK", () => assertSucceeds(updateDoc(doc(as("office"), "fleetPenalties/company"), { status: "취소" })));
  await t("명세서: 읽음·확인 OK", async () => {
    await assertSucceeds(updateDoc(doc(as("drv"), "driverStatements/s1"), { status: "read", readAt: 1 }));
    await assertSucceeds(updateDoc(doc(as("drv"), "driverStatements/s1"), { status: "confirmed", confirmedAt: 1 }));
  });
  await t("명세서: 다른 상태 거절", () => assertFails(updateDoc(doc(as("drv"), "driverStatements/s1"), { status: "paid" })));

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
