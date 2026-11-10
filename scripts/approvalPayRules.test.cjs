// 💸 2026-11-10 전자결재 지급완료(paid) 보안 규칙 테스트 — Firestore 에뮬레이터
//  실행: firebase emulators:exec --only firestore --project demo-kpflow "node scripts/approvalPayRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 필요 — NODE_PATH로 넘겨도 된다. 포트 EMU_FS_PORT(기본 8080))
//  예전: 경리가 그 지출결의의 결재자(참여자)이기도 하면 앞 규칙 계산이 한도(1000)를 다 써서 지급 완료 처리가 막혔다
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const fbFs = require(require.resolve("firebase/firestore", { paths: [path.dirname(require.resolve("@firebase/rules-unit-testing"))] }));
const { doc, setDoc, updateDoc } = fbFs;
const ROOT = process.env.REPO || path.resolve(__dirname, "..");
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name} :: ${String(e?.message || e).slice(0, 160)}`); } }
(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-ap-pay", firestore: { rules: fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8"), host: "127.0.0.1", port: Number(process.env.EMU_FS_PORT || 8080) } });
  const base = { company: "A", companyName: "A", status: "approved", cat: "expense", form: "spend", drafterUid: "drafter", step: 0, history: [], data: { lines: [{ vendor: "정비소", total: "85000" }], vexIds: ["v1"] }, images: ["data:" + "x".repeat(200000)] };
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "users/acct"), { companyName: "A", approved: true, role: "test" });
    await setDoc(doc(db, "users/user"), { companyName: "A", approved: true, role: "user" });
    await setDoc(doc(db, "users/acctB"), { companyName: "B", approved: true, role: "test" });
    await setDoc(doc(db, "approvals/inLine"), { ...base, participants: ["drafter", "acct", "user"], line: [{ uid: "acct", status: "approved" }] });
    await setDoc(doc(db, "approvals/notInLine"), { ...base, participants: ["drafter", "user"], line: [{ uid: "user", status: "approved" }] });
    await setDoc(doc(db, "approvals/pending"), { ...base, status: "pending", participants: ["drafter", "acct"], line: [{ uid: "acct", status: "pending" }] });
  });
  const as = (u) => env.authenticatedContext(u).firestore();
  const pay = { paid: { at: 1, date: "2026-11-10", by: "acct" }, updatedAt: 1 };
  await t("경리 — 내가 결재자인 문서 지급 완료(예전엔 막힘)", () => assertSucceeds(updateDoc(doc(as("acct"), "approvals/inLine"), pay)));
  await t("경리 — 지급 취소", () => assertSucceeds(updateDoc(doc(as("acct"), "approvals/inLine"), { paid: null, updatedAt: 2 })));
  await t("경리 — 결재선에 없는 문서 지급 완료", () => assertSucceeds(updateDoc(doc(as("acct"), "approvals/notInLine"), pay)));
  await t("일반 직원 — 지급 완료 막힘", () => assertFails(updateDoc(doc(as("user"), "approvals/inLine"), pay)));
  await t("다른 회사 경리 — 막힘", () => assertFails(updateDoc(doc(as("acctB"), "approvals/inLine"), pay)));
  await t("경리 — 지급 칸 말고 금액 고치기 막힘", () => assertFails(updateDoc(doc(as("acct"), "approvals/inLine"), { ...pay, amount: 1 })));
  await t("결재자도 아닌 일반 직원이 진행 중 문서에 지급 표시 막힘", () => assertFails(updateDoc(doc(as("user"), "approvals/pending"), pay)));
  await env.cleanup();
  console.log(`\n지급완료 규칙: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
