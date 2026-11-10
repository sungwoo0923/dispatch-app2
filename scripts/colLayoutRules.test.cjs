// 🧩 2026-11-10 컬럼 수정 보안 규칙 테스트 — Firestore 에뮬레이터
//  실행: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/colLayoutRules.test.cjs"
//  ① 내 배치(colLayouts/{uid}) — 본인만 읽고 씀 · 다른 회사 이름으로 못 씀
//  ② 회사 전체 적용(colLayoutsCompany/{회사}) — 같은 회사 직원 읽기 · 쓰기 / 조회전용 · 기사 · 화주 · 다른 회사는 못 씀
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");

const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
const A = "에이운송", B = "비운송";
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name} :: ${String(e?.message || e).slice(0, 180)}`); } }
const USERS = {
  hong: { companyName: A, approved: true, role: "user" }, park: { companyName: A, approved: true, role: "user" },
  view: { companyName: A, approved: true, role: "viewer" }, drv: { companyName: A, approved: true, role: "driver" },
  ship: { companyName: A, approved: true, role: "shipper" }, other: { companyName: B, approved: true, role: "user" },
  wait: { companyName: A, approved: false, role: "user" },
};
const lay = { "순번|등록일#3": { order: ["순번", "상차일", "등록일"], hidden: ["등록일"], base: 0 } };

(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-collayout-rules", firestore: { rules: fs.readFileSync(path.join(process.env.REPO || path.resolve(__dirname, ".."), "firestore.rules"), "utf8"), host: "127.0.0.1", port: FS_PORT } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [uid, u] of Object.entries(USERS)) await setDoc(doc(db, "users", uid), u);
    await setDoc(doc(db, "systemConfig", "tenancy"), { serverFilter: true });
    await setDoc(doc(db, "colLayouts", "park"), { uid: "park", companyName: A, layouts: lay });
    await setDoc(doc(db, "colLayoutsCompany", A), { companyName: A, layouts: {} });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();

  await t("내 배치 — 본인 저장", () => assertSucceeds(setDoc(doc(as("hong"), "colLayouts", "hong"), { uid: "hong", companyName: A, layouts: lay })));
  await t("내 배치 — 본인 읽기", () => assertSucceeds(getDoc(doc(as("hong"), "colLayouts", "hong"))));
  await t("내 배치 — 같은 회사 다른 사람 배치 읽기 막힘", () => assertFails(getDoc(doc(as("hong"), "colLayouts", "park"))));
  await t("내 배치 — 다른 사람 배치 고치기 막힘", () => assertFails(setDoc(doc(as("hong"), "colLayouts", "park"), { uid: "park", companyName: A, layouts: {} })));
  await t("내 배치 — uid 바꿔 쓰기 막힘", () => assertFails(setDoc(doc(as("hong"), "colLayouts", "hong"), { uid: "park", companyName: A, layouts: {} })));
  await t("내 배치 — 다른 회사 이름으로 막힘", () => assertFails(setDoc(doc(as("hong"), "colLayouts", "hong"), { uid: "hong", companyName: B, layouts: {} })));
  await t("내 배치 — 승인 전 계정 막힘", () => assertFails(setDoc(doc(as("wait"), "colLayouts", "wait"), { uid: "wait", companyName: A, layouts: {} })));
  await t("내 배치 — 로그인 안 하면 막힘", () => assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "colLayouts", "park"))));

  await t("전체 적용 — 같은 회사 직원 읽기", () => assertSucceeds(getDoc(doc(as("park"), "colLayoutsCompany", A))));
  await t("전체 적용 — 같은 회사 직원 저장", () => assertSucceeds(setDoc(doc(as("hong"), "colLayoutsCompany", A), { companyName: A, layouts: { k: { order: ["a"], hidden: [], v: 1 } } }, { merge: true })));
  await t("전체 적용 — 조회전용 저장 막힘", () => assertFails(setDoc(doc(as("view"), "colLayoutsCompany", A), { companyName: A, layouts: {} }, { merge: true })));
  await t("전체 적용 — 기사 저장 막힘", () => assertFails(setDoc(doc(as("drv"), "colLayoutsCompany", A), { companyName: A, layouts: {} }, { merge: true })));
  await t("전체 적용 — 화주 저장 막힘", () => assertFails(setDoc(doc(as("ship"), "colLayoutsCompany", A), { companyName: A, layouts: {} }, { merge: true })));
  await t("전체 적용 — 다른 회사 읽기 막힘", () => assertFails(getDoc(doc(as("other"), "colLayoutsCompany", A))));
  await t("전체 적용 — 다른 회사 저장 막힘", () => assertFails(setDoc(doc(as("other"), "colLayoutsCompany", A), { companyName: A, layouts: {} }, { merge: true })));
  await t("전체 적용 — 회사 이름 바꿔 쓰기 막힘", () => assertFails(setDoc(doc(as("hong"), "colLayoutsCompany", A), { companyName: B, layouts: {} }, { merge: true })));

  await env.cleanup();
  console.log(`\n${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
