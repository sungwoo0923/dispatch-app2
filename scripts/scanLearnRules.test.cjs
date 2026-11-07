// 🧠 2026-11-07 오더 스캔 회사별 학습(scanLearn) · 사용 횟수(scanUsage) — 보안 규칙 테스트(Firestore 에뮬레이터 전용)
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/scanLearnRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 가 필요 — NODE_PATH로 넘겨도 된다. 포트는 EMU_FS_PORT, 기본 8080)
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where } = require("firebase/firestore");

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}
const item = (key, uid, over = {}) => ({
  fp: "abcd1234", labels: ["상차처"], head: "", text: "상차처: A\n하차: B", fields: { 상차지명: "A" }, changed: ["상차지명"],
  aliases: [], labelMap: { 상차처: "상차지명" }, companyKey: key, uid, updatedAtMs: Date.now(), ...over,
});

(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.HUB_PROJECT || "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/staffA"), { companyName: "에이운송", approved: true, role: "user" });
    await setDoc(doc(db, "users/staffA2"), { companyName: "에이운송", approved: true, role: "user" });
    await setDoc(doc(db, "users/staffB"), { companyName: "비운송", approved: true, role: "user" });
    await setDoc(doc(db, "users/pendingA"), { companyName: "에이운송", approved: false });
    await setDoc(doc(db, "users/linkA"), { companyName: "에이운송", approved: true, role: "user" });
    await setDoc(doc(db, "hubMembers/linkA"), { uid: "linkA", role: "carrier", source: "logisweb-staff", status: "approved", companyName: "에이운송" });
    await setDoc(doc(db, "hubMembers/hubS"), { uid: "hubS", role: "shipper", source: "signup", status: "approved", bizNo: "123-45-67891", companyName: "에스상사" });
    await setDoc(doc(db, "hubMembers/hubS2"), { uid: "hubS2", role: "shipper", source: "signup", status: "approved", bizNo: "1234567891", companyName: "에스상사" });
    await setDoc(doc(db, "hubMembers/hubP"), { uid: "hubP", role: "shipper", source: "signup", status: "pending", bizNo: "999-99-99999" });
    await setDoc(doc(db, "scanLearn/lw:비운송/items/b1"), item("lw:비운송", "staffB"));
    await setDoc(doc(db, "scanLearn/biz:1234567891/items/s1"), item("biz:1234567891", "hubS"));
    await setDoc(doc(db, "scanUsage/staffA_20261107"), { ocr: 3 });
  });
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const A = as("staffA"), A2 = as("staffA2"), B = as("staffB"), P = as("pendingA"), L = as("linkA"), H = as("hubS"), H2 = as("hubS2"), HP = as("hubP");
  const anon = env.unauthenticatedContext().firestore();

  await t("직원: 우리 회사 키(lw:회사명)로 쓰기", () => assertSucceeds(setDoc(doc(A, "scanLearn/lw:에이운송/items/a1"), item("lw:에이운송", "staffA"))));
  await t("직원: 우리 회사 기록 읽기", () => assertSucceeds(getDoc(doc(A, "scanLearn/lw:에이운송/items/a1"))));
  await t("같은 회사 동료: 목록 읽기", () => assertSucceeds(getDocs(collection(A2, "scanLearn/lw:에이운송/items"))));
  await t("같은 회사 동료: 같은 양식 조회(fp)", () => assertSucceeds(getDocs(query(collection(A2, "scanLearn/lw:에이운송/items"), where("fp", "==", "abcd1234")))));
  await t("같은 회사 동료: 고쳐 쓰기(본인 uid로)", () => assertSucceeds(setDoc(doc(A2, "scanLearn/lw:에이운송/items/a1"), item("lw:에이운송", "staffA2"))));
  await t("같은 회사 동료: 오래된 기록 지우기", () => assertSucceeds(deleteDoc(doc(A2, "scanLearn/lw:에이운송/items/a1"))));
  await t("다른 회사 기록 읽기 거절", () => assertFails(getDoc(doc(A, "scanLearn/lw:비운송/items/b1"))));
  await t("다른 회사 목록 거절", () => assertFails(getDocs(collection(A, "scanLearn/lw:비운송/items"))));
  await t("다른 회사 키로 쓰기 거절", () => assertFails(setDoc(doc(A, "scanLearn/lw:비운송/items/x"), item("lw:비운송", "staffA"))));
  await t("다른 회사 기록 지우기 거절", () => assertFails(deleteDoc(doc(A, "scanLearn/lw:비운송/items/b1"))));
  await t("경로 키와 문서 companyKey가 다르면 거절", () => assertFails(setDoc(doc(A, "scanLearn/lw:에이운송/items/x2"), item("lw:비운송", "staffA"))));
  await t("다른 사람 uid로 쓰기 거절", () => assertFails(setDoc(doc(A, "scanLearn/lw:에이운송/items/x3"), item("lw:에이운송", "staffB"))));
  await t("모르는 칸 넣으면 거절", () => assertFails(setDoc(doc(A, "scanLearn/lw:에이운송/items/x4"), item("lw:에이운송", "staffA", { secret: 1 }))));
  await t("원문 3,000자 넘으면 거절", () => assertFails(setDoc(doc(A, "scanLearn/lw:에이운송/items/x5"), item("lw:에이운송", "staffA", { text: "가".repeat(3001) }))));
  await t("승인 안 된 직원 거절", () => assertFails(getDocs(collection(P, "scanLearn/lw:에이운송/items"))));
  await t("비로그인 거절", () => assertFails(getDocs(collection(anon, "scanLearn/lw:에이운송/items"))));
  await t("scanLearn 회사 문서 자체 거절", () => assertFails(getDoc(doc(A, "scanLearn/lw:에이운송"))));
  await t("허브 회원: 허브 회사 키(biz:)로 쓰기", () => assertSucceeds(setDoc(doc(H, "scanLearn/biz:1234567891/items/s2"), item("biz:1234567891", "hubS"))));
  await t("허브 같은 회사(같은 사업자번호) 읽기", () => assertSucceeds(getDocs(collection(H2, "scanLearn/biz:1234567891/items"))));
  await t("허브 회원: 운송사 기록 읽기 거절", () => assertFails(getDocs(collection(H, "scanLearn/lw:에이운송/items"))));
  await t("운송사 직원: 허브 회사 기록 읽기 거절", () => assertFails(getDocs(collection(A, "scanLearn/biz:1234567891/items"))));
  await t("허브 승인 전 회원 거절", () => assertFails(setDoc(doc(HP, "scanLearn/biz:99999999999/items/p"), item("biz:99999999999", "hubP"))));
  await t("로지스웹 연결 허브 회원: 같은 회사(lw:) 기록 읽기", () => assertSucceeds(getDocs(collection(L, "scanLearn/lw:에이운송/items"))));
  await t("로지스웹 연결 허브 회원: 다른 회사 거절", () => assertFails(getDocs(collection(L, "scanLearn/lw:비운송/items"))));
  await t("사용 횟수(scanUsage) 읽기 거절(서버만)", () => assertFails(getDoc(doc(A, "scanUsage/staffA_20261107"))));
  await t("사용 횟수(scanUsage) 쓰기 거절(서버만)", () => assertFails(setDoc(doc(A, "scanUsage/staffA_20261107"), { ocr: 0 })));

  console.log(out.join("\n"));
  console.log(`\nscanLearn 규칙 ${pass + fail}개 — 통과 ${pass} · 실패 ${fail}`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
