// 🧪 2026-11-26 기사 계정이 나에게 배정된 오더에 [수락] · [상차완료] · 상차 사진 · 상차지 도착 · [운송완료] · [거절]을 저장할 수 있는지
//  (11/25 규칙에서 상차완료근거 · 상차지도착일시 · 상차지도착근거 · 배차방식이 빠져 기사앱에 "처리 중 오류가 발생했습니다"가 떴다)
//  실행: firebase emulators:exec --only firestore --project demo-kpdrv "node scripts/driverOrderRules.test.cjs"
const fs = require("fs");
const path = require("path");
const AC = require(path.resolve(__dirname, "..", "functions", "authClaims.js"));
const claimsOf = (u) => AC.mergeClaims({}, AC.computeUserClaims(u, { plan: null, customRole: null, roleOverride: null }).claims, null, 1);
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, serverTimestamp, arrayUnion, increment } = require("firebase/firestore");

const ROOT = path.resolve(__dirname, "..");
const RULES = process.env.RULES || path.join(ROOT, "firestore.rules");
const CO = "큐런";
const DRV = { companyName: CO, approved: true, role: "driver" };
const OTHER = { companyName: CO, approved: true, role: "driver" };
let pass = 0, fail = 0; const out = [];
async function t(name, fn) { try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); } }
const tl = (type) => ({ 기사타임라인: arrayUnion({ type, at: Date.now(), by: "테스트1" }), _lastModified: Date.now() });

(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-kpdrv", firestore: { rules: fs.readFileSync(RULES, "utf8"), host: "127.0.0.1", port: Number(process.env.EMU_FS_PORT || 8080) } });
  const seed = async (id, extra = {}) => env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "users", "drv"), DRV);
    await setDoc(doc(db, "users", "drv2"), OTHER);
    await setDoc(doc(db, "orders", id), { companyName: CO, 차량번호: "99어9999", 이름: "테스트1", 상차지주소: "인천 연수구", 기사운임: 150000, 기사확인상태: "수락", 배차상태: "배차완료", 배차방식: "지입", ...extra });
    await setDoc(doc(db, "driverOrders", `orders__${id}`), { driverUid: "drv", companyName: CO });
  });
  const dbAs = (uid, u) => env.authenticatedContext(uid, claimsOf(u)).firestore();
  const me = dbAs("drv", DRV);

  await seed("o1");
  await t("상차완료 버튼(상차지 도착 기록 같이)", () => assertSucceeds(updateDoc(doc(me, "orders", "o1"), {
    상차완료일시: serverTimestamp(), 상차완료근거: "기사버튼", 상차지도착주소: "인천 연수구", 상차지도착일시: serverTimestamp(), 상차지도착근거: "기사버튼", ...tl("상차완료") })));
  await seed("o2");
  await t("상차지 도착 자동 기록", () => assertSucceeds(updateDoc(doc(me, "orders", "o2"), {
    상차지도착주소: "인천 연수구", 상차지도착일시: serverTimestamp(), 상차지도착근거: "현재위치", ...tl("상차지도착") })));
  await seed("o3");
  await t("상차 사진 전송", () => assertSucceeds(updateDoc(doc(me, "orders", "o3"), {
    attachCount: increment(1), 상차지도착주소: "인천 연수구", 상차지도착일시: serverTimestamp(), 상차지도착근거: "상차사진", 상차완료일시: serverTimestamp(), 상차완료근거: "상차사진", ...tl("사진전송") })));
  await seed("o4");
  await t("운송완료", () => assertSucceeds(updateDoc(doc(me, "orders", "o4"), { 기사확인상태: "완료", 기사완료일시: serverTimestamp(), ...tl("운송완료") })));
  await seed("o5", { 기사확인상태: "대기" });
  await t("거절(배정 흔적 지우기 · 배차방식 비우기)", () => assertSucceeds(updateDoc(doc(me, "orders", "o5"), {
    기사확인상태: "거절", 기사거절사유: "", 수정거절: false, 기사확인일시: serverTimestamp(), ...tl("거절"),
    차량번호: "", 이름: "", 전화번호: "", 배차상태: "배차중", 상태: "배차중", 업체전달상태: "미전달", 배차확정일시: null, 배차확정자: null, 배차방식: "" })));
  await seed("o6");
  await t("기사는 운임은 못 바꾼다", () => assertFails(updateDoc(doc(me, "orders", "o6"), { 기사운임: 999999 })));
  await t("다른 기사는 내 오더에 상차완료 못 한다", () => assertFails(updateDoc(doc(dbAs("drv2", OTHER), "orders", "o6"), { 상차완료일시: serverTimestamp(), 상차완료근거: "기사버튼" })));

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\ndriverOrderRules: ${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
