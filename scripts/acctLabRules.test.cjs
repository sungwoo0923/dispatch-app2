// 📒 2026-11-08 계정과목 목록(acctAccounts) · 일반전표(acctJournal) · 자금 예측 예정 항목(acctPlanned) 보안 규칙 테스트(Firestore 에뮬레이터)
//  · 계정과목: 같은 회사 직원은 읽기만, 추가는 경리 담당(경리관리자·경리사무원·재무/경리/회계/총무 부서·최고관리자)만
//  · 전표·예정 항목: 경리 담당만 쓰기 · 대표 등 자금 열람자는 읽기 · 다른 회사는 아무것도 못 함
//  · 공용 규칙(/{col}/{rest=**})이 이 컬렉션들을 다시 열어 주지 않는지(제외 목록) 확인
//  실행 예: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/acctLabRules.test.cjs"
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, arrayUnion } = require("firebase/firestore");

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 200)}`); }
}
const CO = "테스트운송사", OTHER = "다른운송";

(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.HUB_PROJECT || "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "systemConfig/tenancy"), { serverFilter: true });
    const u = (id, x) => setDoc(doc(db, `users/${id}`), { companyName: CO, approved: true, ...x });
    await u("acct", { role: "test", name: "경리관리자" });
    await u("clerk", { role: "acctStaff", name: "경리사원" });
    await u("finTeam", { role: "user", team: "총무팀", name: "총무" });
    await u("staff", { role: "user", team: "배차팀", name: "배차직원" });
    await u("admin", { role: "admin", team: "배차팀", name: "운송관리자" });
    await u("ceo", { role: "admin", position: "대표", name: "대표" });
    await u("driver", { role: "driver", name: "기사" });
    await setDoc(doc(db, "users/otherAcct"), { companyName: OTHER, approved: true, role: "test", name: "남의 경리" });
    await setDoc(doc(db, `acctAccounts/${CO}`), { companyName: CO, items: ["협회비"] });
    await setDoc(doc(db, "acctJournal/j1"), { companyName: CO, date: "2026-11-01", lines: [] });
    await setDoc(doc(db, "acctPlanned/p1"), { companyName: CO, date: "2026-12-01", type: "지출", name: "보험", amount: 1000 });
  });
  const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@t.kr` }).firestore();
  const accDoc = (db) => doc(db, `acctAccounts/${CO}`);
  const addAcc = (db, name) => setDoc(accDoc(db), { companyName: CO, items: arrayUnion(name) }, { merge: true });

  // ── 계정과목 ──
  await t("계정과목: 같은 회사 일반 직원 읽기 OK", () => assertSucceeds(getDoc(accDoc(as("staff")))));
  await t("계정과목: 일반 직원 추가 거절", () => assertFails(addAcc(as("staff"), "몰래추가")));
  await t("계정과목: 운송 관리자도 경리가 아니면 추가 거절", () => assertFails(addAcc(as("admin"), "관리자추가")));
  await t("계정과목: 기사 추가 거절", () => assertFails(addAcc(as("driver"), "기사추가")));
  await t("계정과목: 경리관리자 추가 OK", () => assertSucceeds(addAcc(as("acct"), "차량리스료")));
  await t("계정과목: 경리사원 추가 OK", () => assertSucceeds(addAcc(as("clerk"), "협회비2")));
  await t("계정과목: 총무팀(재무 부서) 추가 OK", () => assertSucceeds(addAcc(as("finTeam"), "수수료2")));
  await t("계정과목: 다른 회사 경리 읽기 거절", () => assertFails(getDoc(accDoc(as("otherAcct")))));
  await t("계정과목: 다른 회사 경리 추가 거절", () => assertFails(addAcc(as("otherAcct"), "침입")));
  await t("계정과목: 경리라도 회사명 바꿔치기 거절", () => assertFails(setDoc(accDoc(as("acct")), { companyName: OTHER, items: [] })));
  await t("계정과목: 목록 지우기는 최고관리자만", () => assertFails(deleteDoc(accDoc(as("acct")))));

  // ── 일반전표 ──
  const entry = { companyName: CO, date: "2026-11-08", kind: "대체", memo: "감가상각", lines: [{ side: "D", acct: "기타", amount: 1 }, { side: "C", acct: "비품", amount: 1 }] };
  await t("전표: 경리 입력 OK", () => assertSucceeds(addDoc(collection(as("acct"), "acctJournal"), entry)));
  await t("전표: 일반 직원 입력 거절", () => assertFails(addDoc(collection(as("staff"), "acctJournal"), entry)));
  await t("전표: 운송 관리자 입력 거절(읽기만)", () => assertFails(addDoc(collection(as("admin"), "acctJournal"), entry)));
  await t("전표: 대표 읽기 OK", () => assertSucceeds(getDoc(doc(as("ceo"), "acctJournal/j1"))));
  await t("전표: 일반 직원 읽기 거절", () => assertFails(getDoc(doc(as("staff"), "acctJournal/j1"))));
  await t("전표: 다른 회사 경리 읽기 거절", () => assertFails(getDoc(doc(as("otherAcct"), "acctJournal/j1"))));
  await t("전표: 다른 회사 이름으로 입력 거절", () => assertFails(addDoc(collection(as("acct"), "acctJournal"), { ...entry, companyName: OTHER })));
  await t("전표: 경리 삭제 OK · 일반 직원 삭제 거절", async () => {
    await assertFails(deleteDoc(doc(as("staff"), "acctJournal/j1")));
    await assertSucceeds(deleteDoc(doc(as("clerk"), "acctJournal/j1")));
  });

  // ── 자금 예측 예정 항목 ──
  const plan = { companyName: CO, date: "2027-01-10", type: "지출", name: "부가세", amount: 500000 };
  await t("예정: 경리 추가 OK", () => assertSucceeds(addDoc(collection(as("clerk"), "acctPlanned"), plan)));
  await t("예정: 일반 직원 추가 거절", () => assertFails(addDoc(collection(as("staff"), "acctPlanned"), plan)));
  await t("예정: 일반 직원 수정 거절", () => assertFails(updateDoc(doc(as("staff"), "acctPlanned/p1"), { amount: 1 })));
  await t("예정: 대표 읽기 OK · 일반 직원 읽기 거절", async () => {
    await assertSucceeds(getDoc(doc(as("ceo"), "acctPlanned/p1")));
    await assertFails(getDoc(doc(as("staff"), "acctPlanned/p1")));
  });

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
