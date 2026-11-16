// 🧪 2026-11-16 직원 계정(운송관리자 · 배차 · 경리)이 오더를 등록 · 수정 · 삭제 · 조회할 수 있는지 — 최고관리자만 되던 문제 점검
//  실행: firebase emulators:exec --only firestore --project demo-kpstaff "node scripts/staffWriteRules.test.cjs"
//   RULES 환경변수로 다른 규칙 파일을 넣으면 그 규칙으로 돌린다(예전 규칙과 비교할 때)
//  확인: 서버 분리 잠금(systemConfig/tenancy.serverFilter = true)을 켠 상태에서
//   ① 같은 회사 직원: 오더 조회 · 등록 · 수정 · 삭제 · "없는 오더 확인"(orders · dispatch 중 어디 있는지 찾기 · 고정노선 오더 만들기 전 확인)
//   ② 다른 회사 직원은 읽기 · 수정 · 삭제 모두 막힘(없는 문서 확인은 "없음"만)
const fs = require("fs");
const path = require("path");
// 실제 로그인처럼 권한 토큰(functions/authClaims.js — 서버가 넣는 값)을 붙인다. 토큰이 없으면 규칙이 문서를 여러 번 읽어 한도에 걸린다
const AC = require(path.resolve(__dirname, "..", "functions", "authClaims.js"));
const claimsOf = (u) => AC.mergeClaims({}, AC.computeUserClaims(u, { plan: null, customRole: null, roleOverride: null }).claims, null, 1);
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, writeBatch } = require("firebase/firestore");

const ROOT = path.resolve(__dirname, "..");
const RULES = process.env.RULES || path.join(ROOT, "firestore.rules");
const CO = "큐런", OTHER = "다른운송";
const USERS = {
  admin: { companyName: CO, approved: true, role: "admin" },     // 운송관리자
  user: { companyName: CO, approved: true, role: "user" },       // 배차(운송사무원)
  acct: { companyName: CO, approved: true, role: "test" },       // 경리
  viewer: { companyName: CO, approved: true, role: "viewer" },
  other: { companyName: OTHER, approved: true, role: "admin" },
  master: { companyName: CO, approved: true, role: "totalMaster" },
};
let pass = 0, fail = 0; const out = [];
async function t(name, fn) { try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 160)}`); } }

(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-kpstaff", firestore: { rules: fs.readFileSync(RULES, "utf8"), host: "127.0.0.1", port: Number(process.env.EMU_FS_PORT || 8080) } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [uid, u] of Object.entries(USERS)) await setDoc(doc(db, "users", uid), u);
    await setDoc(doc(db, "systemConfig", "tenancy"), { serverFilter: true });
    await setDoc(doc(db, "orders", "old1"), { companyName: CO, 상차일: "2026-11-01", 청구운임: 300000, 거래처명: "가" });
    await setDoc(doc(db, "orders", "old2"), { companyName: CO, 상차일: "2026-11-01", 청구운임: 300000 });
    await setDoc(doc(db, "dispatch", "d1"), { companyName: CO, 상차일: "2026-11-02", 청구운임: 100000 });
    await setDoc(doc(db, "orders", "oth1"), { companyName: OTHER, 상차일: "2026-11-01" });
  });
  const USERS_REF = typeof U !== "undefined" ? U : USERS;
  const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.kr`, ...claimsOf(USERS_REF[uid] || {}) }).firestore();

  for (const uid of ["admin", "user", "acct", "master"]) {
    const db = as(uid);
    await t(`${uid} · 없는 오더 확인(dispatch → orders 찾기)`, () => assertSucceeds(getDoc(doc(db, "dispatch", "old1"))));
    await t(`${uid} · 고정노선 오더 만들기 전 확인(없는 orders)`, () => assertSucceeds(getDoc(doc(db, "orders", `route_${uid}`))));
    await t(`${uid} · 예전 오더 읽기`, () => assertSucceeds(getDoc(doc(db, "orders", "old1"))));
    await t(`${uid} · 회사 오더 목록`, () => assertSucceeds(getDocs(query(collection(db, "orders"), where("companyName", "==", CO)))));
    await t(`${uid} · 예전 오더 운임 수정`, () => assertSucceeds(updateDoc(doc(db, "orders", "old1"), { 청구운임: 350000, 수수료: 50000, _lastModified: Date.now() })));
    await t(`${uid} · dispatch 오더 수정`, () => assertSucceeds(updateDoc(doc(db, "dispatch", "d1"), { 기사운임: 80000 })));
    await t(`${uid} · 오더 등록`, () => assertSucceeds(setDoc(doc(db, "orders", `new_${uid}`), { companyName: CO, 상차일: "2026-11-16" })));
    await t(`${uid} · 삭제 기록 + 오더 삭제(묶음)`, async () => { const b = writeBatch(db); b.set(doc(db, "deletedOrders", `orders_new_${uid}`), { col: "orders", id: `new_${uid}`, companyName: CO, at: Date.now() }); b.delete(doc(db, "orders", `new_${uid}`)); await assertSucceeds(b.commit()); });
    await t(`${uid} · 이미 지워진(없는) 오더 삭제 — 묶음이 통째로 거부되지 않게`, () => assertSucceeds(deleteDoc(doc(db, "orders", `gone_${uid}`))));
  }
  // ③ 직원이 매일 고치는 회사 데이터 — 거래처 · 상하차지 · 고정거래처 · 기사 · 배차표 · 고정노선 · 마감 기록 · 출근
  const COLS = ["clients", "places", "fixedClients", "drivers", "routeBoards", "fixedRoutes", "arDesk", "recurringOrders"];
  for (const uid of ["admin", "user", "acct"]) {
    const db = as(uid);
    for (const col of COLS) {
      const id = `${col}_${uid}`;
      await t(`${uid} · ${col} 없는 문서 확인`, () => assertSucceeds(getDoc(doc(db, col, `nope_${id}`))));
      await t(`${uid} · ${col} 등록`, () => assertSucceeds(setDoc(doc(db, col, id), { companyName: CO, name: "가" })));
      await t(`${uid} · ${col} 수정`, () => assertSucceeds(updateDoc(doc(db, col, id), { name: "나" })));
      await t(`${uid} · ${col} 회사 목록`, () => assertSucceeds(getDocs(query(collection(db, col), where("companyName", "==", CO)))));
      await t(`${uid} · ${col} 삭제`, () => assertSucceeds(deleteDoc(doc(db, col, id))));
    }
    await t(`${uid} · 내 출근 기록`, () => assertSucceeds(setDoc(doc(db, "attendance", `2026-11-16_${uid}`), { uid, companyName: CO, status: "출근", checkInTime: "x", source: "manual" }, { merge: true })));
  }
  {
    const db = as("other");
    await t("다른 회사 · 남의 오더 읽기 막힘", () => assertFails(getDoc(doc(db, "orders", "old1"))));
    await t("다른 회사 · 남의 오더 수정 막힘", () => assertFails(updateDoc(doc(db, "orders", "old1"), { 청구운임: 1 })));
    await t("다른 회사 · 남의 오더 삭제 막힘", () => assertFails(deleteDoc(doc(db, "orders", "old2"))));
    await t("다른 회사 · 남의 회사 이름으로 등록 막힘", () => assertFails(setDoc(doc(db, "orders", "x9"), { companyName: CO })));
    await t("다른 회사 · 회사 바꾸기 막힘", () => assertFails(updateDoc(doc(db, "orders", "oth1"), { companyName: CO })));
  }
  {
    const anon = env.unauthenticatedContext().firestore();
    await t("로그인 안 함 · 없는 오더 확인 막힘", () => assertFails(getDoc(doc(anon, "orders", "nope"))));
    await t("로그인 안 함 · 삭제 막힘", () => assertFails(deleteDoc(doc(anon, "orders", "nope"))));
  }
  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed  (rules: ${path.basename(RULES)})`);
  process.exit(fail ? 1 : 0);
})();
