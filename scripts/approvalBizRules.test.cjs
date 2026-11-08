// 📑📎 2026-11-08 전자결재 사업계획서 결재선 · 첨부 파일(Storage) · 사업계획 읽기 보안 규칙 테스트(Firestore + Storage 에뮬레이터)
//  실행 예: firebase emulators:exec --only firestore,storage --project demo-kpflow "node scripts/approvalBizRules.test.cjs"
//  (@firebase/rules-unit-testing · firebase 가 필요 — NODE_PATH로 넘겨도 된다. 포트는 EMU_FS_PORT(기본 8080) · EMU_ST_PORT(기본 9199))
//  storage 에뮬레이터가 없으면(ONLY=firestore) 첨부 파일 테스트는 건너뛴다.
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
// rules-unit-testing과 같은 firebase 묶음을 쓴다(앱 node_modules의 firebase와 섞이면 "Expected first argument to collection()" 오류)
const fbFs = require(require.resolve("firebase/firestore", { paths: [path.dirname(require.resolve("@firebase/rules-unit-testing"))] }));
const { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } = fbFs;

const ROOT = process.env.HUB_REPO || path.resolve(__dirname, "..");
const FS_PORT = Number(process.env.EMU_FS_PORT || 8080);
const ST_PORT = Number(process.env.EMU_ST_PORT || 9199);
const WITH_ST = !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
let pass = 0, fail = 0;
const out = [];
async function t(name, fn) {
  try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 240)}`); }
}
const CO = "에이 운송"; // 띄어쓰기 있는 회사 → Storage 회사 키 "에이_운송"
const KEY = "에이_운송";
const B_CO = "비운송";

(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.HUB_PROJECT || "demo-kpflow",
    firestore: { rules: fs.readFileSync(`${ROOT}/firestore.rules`, "utf8"), host: "127.0.0.1", port: FS_PORT },
    ...(WITH_ST ? { storage: { rules: fs.readFileSync(`${ROOT}/storage.rules`, "utf8"), host: "127.0.0.1", port: ST_PORT } } : {}),
  });
  await env.clearFirestore();
  const U = {
    st: { role: "user", team: "배차팀", position: "사원", name: "정사원" },
    tl: { role: "user", team: "배차팀", position: "팀장", name: "김팀장" },
    fin: { role: "user", team: "재무팀", position: "과장", name: "이재무" },
    acct: { role: "test", team: "", position: "대리", name: "한경리" },
    ex: { role: "user", team: "임원", position: "상무", name: "박상무" },
    ceo: { role: "user", team: "임원", position: "대표이사", name: "최대표" },
    other: { role: "user", team: "배차팀", position: "사원", name: "남직원" },
    drv: { role: "driver", name: "기사" },
  };
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, u] of Object.entries(U)) await setDoc(doc(db, `users/${id}`), { companyName: CO, approved: true, ...u });
    await setDoc(doc(db, "users/finB"), { companyName: B_CO, approved: true, role: "test", team: "재무팀" });
    await setDoc(doc(db, "users/exB"), { companyName: B_CO, approved: true, role: "user", position: "상무" });
    await setDoc(doc(db, "users/ceoB"), { companyName: B_CO, approved: true, role: "user", position: "대표" });
    // 승인된 사업계획서 + 연결된 지출결의(정사원 기안)
    await setDoc(doc(db, "approvals/plan1"), { company: CO, companyName: CO, form: "bizplan", cat: "draft", status: "approved", drafterUid: "st", participants: ["st", "tl", "fin", "ex", "ceo"], line: [{ uid: "fin", kind: "합의", status: "approved" }, { uid: "ceo", kind: "결재", status: "approved" }], amount: 1000 });
    await setDoc(doc(db, "approvals/planPend"), { company: CO, companyName: CO, form: "bizplan", cat: "draft", status: "pending", drafterUid: "st", participants: ["st", "fin", "ceo"], line: [{ uid: "fin", kind: "합의", status: "pending" }], step: 0 });
    await setDoc(doc(db, "approvals/exp1"), { company: CO, companyName: CO, form: "spend", cat: "expense", status: "approved", drafterUid: "st", participants: ["st", "tl"], planId: "plan1", amount: 300, line: [{ uid: "tl", status: "approved" }], step: 1 });
    await setDoc(doc(db, "approvals/exp2"), { company: CO, companyName: CO, form: "spend", cat: "expense", status: "approved", drafterUid: "st", participants: ["st", "tl"], amount: 300, line: [{ uid: "tl", status: "approved" }], step: 1 });
    await setDoc(doc(db, "approvals/sick1"), { company: CO, companyName: CO, form: "sick", cat: "leave", status: "pending", drafterUid: "st", participants: ["st", "tl"], line: [{ uid: "tl", status: "pending" }], step: 0 });
  });
  const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@t.kr` });
  const fsOf = (uid) => as(uid).firestore();
  const L = (...xs) => xs.map(([uid, kind], i) => ({ uid, name: U[uid]?.name || uid, kind, status: i === 0 ? "pending" : "wait", at: 0 }));
  const base = (over) => ({ company: CO, companyName: CO, cat: "draft", form: "bizplan", status: "pending", step: 0, drafterUid: "st", title: "사업계획서", data: { name: "천안" }, ...over });
  const mk = (line, finIdx, over = {}) => base({ line, ...(finIdx === undefined ? {} : { finIdx }), participants: ["st", ...line.map((x) => x.uid)], ...over });

  // ───────── 사업계획서 필수 결재선(서버 검사) ─────────
  await t("사업계획서: 팀장 → 경리(합의) → 임원 → 대표 상신 허용", () => assertSucceeds(setDoc(doc(fsOf("st"), "approvals/b1"), mk(L(["tl", "결재"], ["fin", "합의"], ["ex", "결재"], ["ceo", "결재"]), 1))));
  await t("사업계획서: 권한 경리(test) 합의도 허용", () => assertSucceeds(setDoc(doc(fsOf("st"), "approvals/b2"), mk(L(["acct", "합의"], ["ex", "결재"], ["ceo", "결재"]), 0))));
  await t("사업계획서: 경리 없이(finIdx 없음) 직접 쓰기 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/b3"), mk(L(["tl", "결재"], ["ex", "결재"], ["ceo", "결재"]), undefined))));
  await t("사업계획서: finIdx가 경리 아닌 사람(팀장)을 가리키면 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/b4"), mk(L(["tl", "합의"], ["ex", "결재"], ["ceo", "결재"]), 0))));
  await t("사업계획서: 결재선 이름·부서를 '재무팀'으로 꾸며도(users 문서로 확인) 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/b5"), mk([{ uid: "tl", name: "이재무", team: "재무팀", kind: "합의", status: "pending" }, { uid: "ceo", kind: "결재", status: "wait" }], 0))));
  await t("사업계획서: 경리를 '결재'로 넣으면 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/b6"), mk(L(["fin", "결재"], ["ex", "결재"], ["ceo", "결재"]), 0))));
  await t("사업계획서: 맨 끝이 대표가 아니면 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/b7"), mk(L(["fin", "합의"], ["ceo", "결재"], ["ex", "결재"]), 0))));
  await t("사업계획서: 대표 없이 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/b8"), mk(L(["fin", "합의"], ["ex", "결재"]), 0))));
  await t("사업계획서: 다른 회사 경리·대표로 채우면 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/b9"), mk(L(["finB", "합의"], ["exB", "결재"], ["ceoB", "결재"]), 0))));
  await t("사업계획서: 대표가 기안하면 대표 최종 조건 없이 허용(경리 합의는 필요)", () => assertSucceeds(setDoc(doc(fsOf("ceo"), "approvals/b10"), base({ drafterUid: "ceo", line: L(["fin", "합의"], ["ex", "결재"]), finIdx: 0, participants: ["ceo", "fin", "ex"] }))));
  await t("다른 양식(기안서)은 결재선 제한 없음", () => assertSucceeds(setDoc(doc(fsOf("st"), "approvals/g1"), base({ form: "general", line: L(["tl", "결재"]), participants: ["st", "tl"] }))));
  await t("기안서로 올린 뒤 양식을 사업계획서로 바꾸기 거절", () => assertFails(updateDoc(doc(fsOf("st"), "approvals/g1"), { form: "bizplan" })));
  await t("기안자 대기 중 수정(첨부 files 추가) 허용", () => assertSucceeds(updateDoc(doc(fsOf("st"), "approvals/b1"), { files: [{ name: "a.pdf", path: `approvals/${KEY}/b1/1_a.pdf`, size: 10, type: "application/pdf", uploadedBy: "st", at: 1 }] })));
  await t("첨부 정보 11개 거절", () => assertFails(updateDoc(doc(fsOf("st"), "approvals/b1"), { files: Array.from({ length: 11 }, (_, i) => ({ name: `${i}.pdf`, path: `p${i}` })) })));
  await t("새 문서 첨부 정보 11개 거절", () => assertFails(setDoc(doc(fsOf("st"), "approvals/g2"), base({ form: "general", line: L(["tl", "결재"]), participants: ["st", "tl"], files: Array.from({ length: 11 }, (_, i) => ({ name: `${i}` })) }))));

  // ───────── 기존 결재 흐름(바뀐 규칙에 걸리지 않는지) ─────────
  await t("기존: 내 결재 문서 목록(participants array-contains)", () => assertSucceeds(getDocs(query(collection(fsOf("tl"), "approvals"), where("participants", "array-contains", "tl")))));
  await t("기존: 지금 차례 결재자(팀장)가 승인 → 다음 결재자", () => assertSucceeds(updateDoc(doc(fsOf("tl"), "approvals/b1"), { line: L(["tl", "결재"], ["fin", "합의"], ["ex", "결재"], ["ceo", "결재"]).map((x, i) => ({ ...x, status: i === 0 ? "approved" : i === 1 ? "pending" : "wait" })), step: 1 })));
  await t("기존: 차례 아닌 대표가 승인 거절", () => assertFails(updateDoc(doc(fsOf("ceo"), "approvals/b2"), { status: "approved", step: 3 })));
  await t("기존: 기안자 회수", () => assertSucceeds(updateDoc(doc(fsOf("st"), "approvals/g1"), { status: "withdrawn" })));
  await t("기존: 경리가 승인된 지출결의 지급완료", () => assertSucceeds(updateDoc(doc(fsOf("fin"), "approvals/exp1"), { paid: { at: 1, date: "2026-11-08", by: "fin" } })));

  // ───────── 사업계획 읽기(관련 사업계획 고르기 · 임원 경영 분석) ─────────
  const qPlans = (db) => getDocs(query(collection(db, "approvals"), where("company", "==", CO), where("form", "==", "bizplan"), where("status", "==", "approved")));
  await t("같은 회사 직원: 승인된 사업계획서 목록 읽기", () => assertSucceeds(qPlans(fsOf("other"))));
  await t("같은 회사 직원: 진행 중 사업계획서(참여 안 함)는 못 읽음", () => assertFails(getDoc(doc(fsOf("other"), "approvals/planPend"))));
  await t("다른 회사 직원: 우리 회사 승인 사업계획서 목록 거절", () => assertFails(getDocs(query(collection(fsOf("finB"), "approvals"), where("company", "==", CO), where("form", "==", "bizplan"), where("status", "==", "approved")))));
  await t("기사: 승인된 사업계획서 목록 거절", () => assertFails(qPlans(fsOf("drv"))));
  await t("임원: 우리 회사 사업계획서 전부(진행 중 포함) 목록", () => assertSucceeds(getDocs(query(collection(fsOf("ex"), "approvals"), where("company", "==", CO), where("form", "==", "bizplan")))));
  await t("임원: 사업계획에 연결된 지출(planId in) 목록", () => assertSucceeds(getDocs(query(collection(fsOf("ex"), "approvals"), where("company", "==", CO), where("planId", "in", ["plan1", "planX"])))));
  await t("임원: 연결 안 된 지출결의(참여 안 함)는 못 읽음", () => assertFails(getDoc(doc(fsOf("ex"), "approvals/exp2"))));
  await t("일반 직원: 사업계획 연결 지출 목록 거절", () => assertFails(getDocs(query(collection(fsOf("other"), "approvals"), where("company", "==", CO), where("planId", "in", ["plan1"])))));
  await t("다른 회사 임원: 우리 사업계획서 목록 거절", () => assertFails(getDocs(query(collection(fsOf("exB"), "approvals"), where("company", "==", CO), where("form", "==", "bizplan")))));

  // ───────── 첨부 파일(Storage) ─────────
  if (WITH_ST) {
    const stOf = (uid) => as(uid).storage();
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
    const put = (uid, p, type = "application/pdf", meta = { uploadedBy: uid }, data = bytes) => stOf(uid).ref(p).put(data, { contentType: type, customMetadata: meta });
    const read = (uid, p) => stOf(uid).ref(p).getMetadata();
    const del = (uid, p) => stOf(uid).ref(p).delete();
    const NEW = `approvals/${KEY}/newdoc1/1_계획.pdf`;
    await t("첨부: 상신 전(문서 없음) 같은 회사 직원이 PDF 올리기", () => assertSucceeds(put("st", NEW)));
    await t("첨부: PPTX 올리기", () => assertSucceeds(put("st", `approvals/${KEY}/newdoc1/2_발표.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation")));
    await t("첨부: HWP · XLSX · ZIP 올리기", async () => {
      await assertSucceeds(put("st", `approvals/${KEY}/newdoc1/3_a.hwp`, "application/x-hwp"));
      await assertSucceeds(put("st", `approvals/${KEY}/newdoc1/4_a.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
      await assertSucceeds(put("st", `approvals/${KEY}/newdoc1/5_a.zip`, "application/zip"));
    });
    await t("첨부: 상신 전 파일은 올린 사람만 읽기", async () => { await assertSucceeds(read("st", NEW)); await assertFails(read("other", NEW)); });
    await t("첨부: 실행 파일(html) · SVG 거절", async () => {
      await assertFails(put("st", `approvals/${KEY}/newdoc1/x.html`, "text/html"));
      await assertFails(put("st", `approvals/${KEY}/newdoc1/x.svg`, "image/svg+xml"));
    });
    await t("첨부: 20MB 이상 거절", () => assertFails(put("st", `approvals/${KEY}/newdoc1/big.pdf`, "application/pdf", { uploadedBy: "st" }, new Uint8Array(20 * 1024 * 1024))));
    await t("첨부: uploadedBy를 남으로 적으면 거절", () => assertFails(put("st", `approvals/${KEY}/newdoc1/y.pdf`, "application/pdf", { uploadedBy: "tl" })));
    await t("첨부: 다른 회사 직원이 우리 회사 폴더에 올리기 거절", () => assertFails(put("finB", `approvals/${KEY}/newdoc2/y.pdf`, "application/pdf", { uploadedBy: "finB" })));
    await t("첨부: 기사 올리기 거절", () => assertFails(put("drv", `approvals/${KEY}/newdoc3/y.pdf`, "application/pdf", { uploadedBy: "drv" })));
    await t("첨부: 덮어쓰기 거절", () => assertFails(put("st", NEW)));
    // 상신 뒤(문서 있음)
    const P1 = `approvals/${KEY}/b1/1_a.pdf`;
    await t("첨부: 진행 중 문서의 기안자가 올리기", () => assertSucceeds(put("st", P1)));
    await t("첨부: 진행 중 문서에 기안자 아닌 참여자가 올리기 거절", () => assertFails(put("tl", `approvals/${KEY}/b1/2_b.pdf`, "application/pdf", { uploadedBy: "tl" })));
    await t("첨부: 결재 참여자(경리·대표) 읽기", async () => { await assertSucceeds(read("fin", P1)); await assertSucceeds(read("ceo", P1)); });
    await t("첨부: 참여하지 않은 같은 회사 직원 읽기 거절", () => assertFails(read("other", P1)));
    await t("첨부: 다른 회사 경리 읽기 거절", () => assertFails(read("finB", P1)));
    // 병가 진단서 — 참여자만
    const S1 = `approvals/${KEY}/sick1/1_진단서.jpg`;
    await env.withSecurityRulesDisabled(async (ctx) => { await ctx.storage().ref(S1).put(bytes, { contentType: "image/jpeg", customMetadata: { uploadedBy: "st" } }); await ctx.storage().ref(`approvals/${KEY}/plan1/1_계획.pdf`).put(bytes, { contentType: "application/pdf", customMetadata: { uploadedBy: "st" } }); await ctx.storage().ref(`approvals/${KEY}/exp1/1_영수증.pdf`).put(bytes, { contentType: "application/pdf", customMetadata: { uploadedBy: "st" } }); });
    await t("첨부: 병가 진단서는 결재자 읽기 · 다른 직원 거절", async () => { await assertSucceeds(read("tl", S1)); await assertFails(read("other", S1)); });
    await t("첨부: 승인된 사업계획서 첨부는 같은 회사 직원 읽기", () => assertSucceeds(read("other", `approvals/${KEY}/plan1/1_계획.pdf`)));
    await t("첨부: 경리(test) · 임원은 회사 결재 첨부 읽기", async () => { await assertSucceeds(read("acct", `approvals/${KEY}/exp1/1_영수증.pdf`)); await assertSucceeds(read("ex", `approvals/${KEY}/exp1/1_영수증.pdf`)); });
    await t("첨부: 승인된 문서 폴더에 기안자가 새로 올리기 거절", () => assertFails(put("st", `approvals/${KEY}/plan1/2_x.pdf`)));
    await t("첨부: 승인된 문서 첨부 지우기 거절(기안자도)", () => assertFails(del("st", `approvals/${KEY}/plan1/1_계획.pdf`)));
    await t("첨부: 첫 결재자가 승인한 뒤에는 기안자도 못 지움", () => assertFails(del("st", P1)));
    await t("첨부: 진행 중(첫 결재 전) 문서 첨부를 기안자가 지우기", async () => { const p2 = `approvals/${KEY}/b2/1_a.pdf`; await assertSucceeds(put("st", p2)); await assertSucceeds(del("st", p2)); });
    await t("첨부: 남이 올린 파일 지우기 거절", () => assertFails(del("other", NEW)));
    await t("첨부: 상신 전 내 파일 지우기", () => assertSucceeds(del("st", NEW)));
  } else {
    out.push("SKIP 첨부 파일(Storage) — storage 에뮬레이터 없음(ONLY=firestore,storage 로 실행)");
  }

  await env.cleanup();
  console.log(out.join("\n"));
  console.log(`\n전자결재 사업계획서·첨부 규칙: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
