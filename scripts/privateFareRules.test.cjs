// 🔒 2026-11-10 비공개 청구운임 — 보안 규칙 테스트(Firestore 에뮬레이터 전용)
//  privateFareSettings/{회사}(viewers만 읽기·고치기 · 처음 만들기는 같은 회사 마스터/관리자) · /fares(viewers만)
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/privateFareRules.test.cjs"
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection } = require("firebase/firestore");

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
    await setDoc(doc(db, "users/owner"), { companyName: "큐런", approved: true, role: "user" }); // 비공개 청구 담당(마스터 아님)
    await setDoc(doc(db, "users/master"), { companyName: "큐런", approved: true, role: "admin", isMaster: true });
    await setDoc(doc(db, "users/staff"), { companyName: "큐런", approved: true, role: "user" });
    await setDoc(doc(db, "users/other"), { companyName: "비운송", approved: true, role: "admin", isMaster: true });
    await setDoc(doc(db, "users/tm"), { companyName: "돌캐", approved: true, role: "totalMaster" });
    await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: true });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const OW = as("owner"), MA = as("master"), ST = as("staff"), OT = as("other"), TM = as("tm");
  const S = "privateFareSettings/큐런";

  await t("없을 때: 직원도 '없음' 확인", () => assertSucceeds(getDoc(doc(ST, S))));
  await t("만들기: 일반 직원 거절", () => assertFails(setDoc(doc(ST, S), { companyName: "큐런", viewers: ["staff"] })));
  await t("만들기: 다른 회사 마스터 거절", () => assertFails(setDoc(doc(OT, S), { companyName: "큐런", viewers: ["other"] })));
  await t("만들기: 빈 viewers 거절", () => assertFails(setDoc(doc(MA, S), { companyName: "큐런", viewers: [] })));
  await t("만들기: 같은 회사 마스터가 담당자만 넣어 만들기", () => assertSucceeds(setDoc(doc(MA, S), { companyName: "큐런", viewers: ["owner"], clients: [{ name: "홍길거래처", mode: "add", value: 100000 }] })));
  await t("설정 읽기: 담당자", () => assertSucceeds(getDoc(doc(OW, S))));
  await t("설정 읽기: 마스터(담당자 아님) 거절", () => assertFails(getDoc(doc(MA, S))));
  await t("설정 읽기: 직원 거절", () => assertFails(getDoc(doc(ST, S))));
  await t("설정 읽기: 최고관리자 거절", () => assertFails(getDoc(doc(TM, S))));
  await t("설정 고치기: 마스터가 자기 넣기 거절", () => assertFails(setDoc(doc(MA, S), { companyName: "큐런", viewers: ["owner", "master"] })));
  await t("설정 고치기: 담당자", () => assertSucceeds(updateDoc(doc(OW, S), { clients: [{ name: "홍길거래처", mode: "manual", value: 0 }] })));
  await t("설정 고치기: 회사명 바꾸기 거절", () => assertFails(updateDoc(doc(OW, S), { companyName: "비운송" })));
  await t("설정 지우기 거절", () => assertFails(deleteDoc(doc(OW, S))));
  await t("설정 목록 거절", () => assertFails(getDocs(collection(ST, "privateFareSettings"))));
  const F = `${S}/fares/o1`;
  await t("금액 쓰기: 담당자", () => assertSucceeds(setDoc(doc(OW, F), { orderId: "o1", client: "홍길거래처", base: 400000, amount: 500000 })));
  await t("금액 읽기: 담당자 목록", () => assertSucceeds(getDocs(collection(OW, `${S}/fares`))));
  await t("금액 읽기: 직원 거절", () => assertFails(getDoc(doc(ST, F))));
  await t("금액 읽기: 마스터 거절", () => assertFails(getDoc(doc(MA, F))));
  await t("금액 목록: 직원 거절", () => assertFails(getDocs(collection(ST, `${S}/fares`))));
  await t("금액 쓰기: 직원 거절", () => assertFails(setDoc(doc(ST, F), { amount: 1 })));
  await t("금액 읽기: 다른 회사 거절", () => assertFails(getDoc(doc(OT, F))));
  await t("금액 읽기: 최고관리자 거절", () => assertFails(getDoc(doc(TM, F))));

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
