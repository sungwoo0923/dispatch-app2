// 💬 2026-11-18 사내문자(업무폰 문자 연결) — 보안 규칙 테스트(Firestore 에뮬레이터 전용)
//  smsBox/{uid} · smsBox/{uid}/msgs/{id} 는 "본인만" — 최고관리자 · 회사 관리자 · 같은 회사 직원도 못 읽고 못 쓴다
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/officeSmsRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 가 필요 — NODE_PATH로 넘겨도 된다. 포트는 EMU_FS_PORT(기본 8080))
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, collectionGroup, query, where, orderBy, limit } = require("firebase/firestore");

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/staffA"), { companyName: "에이운송", approved: true, role: "user" });
    await setDoc(doc(db, "users/staffA2"), { companyName: "에이운송", approved: true, role: "user" });
    await setDoc(doc(db, "users/adminA"), { companyName: "에이운송", approved: true, role: "admin", isMaster: true });
    await setDoc(doc(db, "users/tm"), { companyName: "돌캐", approved: true, role: "totalMaster", email: "tjddnqkf@naver.com" });
    await setDoc(doc(db, "users/driverA"), { companyName: "에이운송", approved: true, role: "driver" });
    await setDoc(doc(db, "smsBox/staffA"), { linked: true, device: "Galaxy", companyName: "에이운송" });
    await setDoc(doc(db, "smsBox/staffA/msgs/m1"), { peer: "01011112222", dir: "in", body: "출발했어요", at: 1, companyName: "에이운송" });
  });
  const as = (uid, tok) => env.authenticatedContext(uid, tok).firestore();
  const A = as("staffA"), A2 = as("staffA2"), AD = as("adminA"), TM = as("tm", { email: "tjddnqkf@naver.com" }), DR = as("driverA");
  const anon = env.unauthenticatedContext().firestore();

  // 본인
  await t("본인: 상태 읽기", () => assertSucceeds(getDoc(doc(A, "smsBox/staffA"))));
  await t("본인: 상태 쓰기(휴대폰 앱)", () => assertSucceeds(setDoc(doc(A, "smsBox/staffA"), { linked: true, device: "S24" }, { merge: true })));
  await t("본인: 문자 목록", () => assertSucceeds(getDocs(query(collection(A, "smsBox/staffA/msgs"), orderBy("at", "desc"), limit(50)))));
  await t("본인: 대기열 조회(휴대폰 앱)", () => assertSucceeds(getDocs(query(collection(A, "smsBox/staffA/msgs"), where("status", "==", "queued")))));
  await t("본인: 보내기(대기열 넣기)", () => assertSucceeds(addDoc(collection(A, "smsBox/staffA/msgs"), { peer: "01011112222", dir: "out", body: "상차지 주소", status: "queued", at: 2 })));
  await t("본인: 읽음 표시", () => assertSucceeds(updateDoc(doc(A, "smsBox/staffA/msgs/m1"), { read: true })));
  await t("본인: 지우기", () => assertSucceeds(deleteDoc(doc(A, "smsBox/staffA/msgs/m1"))));

  // 다른 사람 — 전부 거절
  for (const [who, F] of [["같은 회사 직원", A2], ["회사 마스터 관리자", AD], ["최고관리자", TM], ["기사", DR], ["로그인 안 함", anon]]) {
    await t(`${who}: 상태 읽기 거절`, () => assertFails(getDoc(doc(F, "smsBox/staffA"))));
    await t(`${who}: 문자 목록 거절`, () => assertFails(getDocs(collection(F, "smsBox/staffA/msgs"))));
    await t(`${who}: 문자 한 건 읽기 거절`, () => assertFails(getDoc(doc(F, "smsBox/staffA/msgs/m1"))));
    await t(`${who}: 남의 업무폰으로 보내기 거절`, () => assertFails(addDoc(collection(F, "smsBox/staffA/msgs"), { peer: "01011112222", dir: "out", body: "x", status: "queued", at: 3 })));
    await t(`${who}: 상태 바꾸기 거절`, () => assertFails(setDoc(doc(F, "smsBox/staffA"), { linked: false }, { merge: true })));
  }
  await t("최고관리자: 전체 문자 모아 보기(collectionGroup) 거절", () => assertFails(getDocs(collectionGroup(TM, "msgs"))));
  await t("최고관리자: smsBox 목록 거절", () => assertFails(getDocs(collection(TM, "smsBox"))));
  await t("최고관리자: 내 것은 됨", () => assertSucceeds(setDoc(doc(TM, "smsBox/tm"), { linked: true })));

  // 사내문자 보내기 방식(userSettings) — 본인만
  await t("보내기 방식: 본인 저장", () => assertSucceeds(setDoc(doc(A, "userSettings/staffA"), { officeSmsRoute: "office" }, { merge: true })));
  await t("보내기 방식: 남의 것 읽기 거절", () => assertFails(getDoc(doc(TM, "userSettings/staffA"))));

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
