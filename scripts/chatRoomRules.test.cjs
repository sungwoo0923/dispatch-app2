// 🧪 2026-11-26 단체방 내보내기 — 방장만 다른 사람을 뺄 수 있고, 누구나 자기는 나갈 수 있다 · 초대 · 이름 바꾸기는 멤버 누구나
//  실행: firebase emulators:exec --only firestore --project demo-kpchat "node scripts/chatRoomRules.test.cjs"
const fs = require("fs");
const path = require("path");
const AC = require(path.resolve(__dirname, "..", "functions", "authClaims.js"));
const claimsOf = (u) => AC.mergeClaims({}, AC.computeUserClaims(u, { plan: null, customRole: null, roleOverride: null }).claims, null, 1);
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, arrayRemove, arrayUnion } = require("firebase/firestore");
const RULES = process.env.RULES || path.join(path.resolve(__dirname, ".."), "firestore.rules");
const U = { companyName: "큐런", approved: true, role: "user" };
let pass = 0, fail = 0; const out = [];
async function t(name, fn) { try { await fn(); pass += 1; out.push(`PASS ${name}`); } catch (e) { fail += 1; out.push(`FAIL ${name} :: ${String(e?.message || e).slice(0, 160)}`); } }
(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-kpchat", firestore: { rules: fs.readFileSync(RULES, "utf8"), host: "127.0.0.1", port: Number(process.env.EMU_FS_PORT || 8080) } });
  const seed = (id) => env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const u of ["boss", "a", "b", "c"]) await setDoc(doc(db, "users", u), U);
    await setDoc(doc(db, "chat_rooms", id), { type: "group", createdBy: "boss", members: ["boss", "a", "b"], name: "단톡" });
  });
  const as = (uid) => env.authenticatedContext(uid, claimsOf(U)).firestore();
  await seed("r1"); await t("방장이 a 내보내기", () => assertSucceeds(updateDoc(doc(as("boss"), "chat_rooms", "r1"), { members: arrayRemove("a") })));
  await seed("r2"); await t("a 가 b 내보내기 → 막힘", () => assertFails(updateDoc(doc(as("a"), "chat_rooms", "r2"), { members: arrayRemove("b") })));
  await seed("r3"); await t("a 가 스스로 나가기", () => assertSucceeds(updateDoc(doc(as("a"), "chat_rooms", "r3"), { members: arrayRemove("a") })));
  await seed("r4"); await t("a 가 c 초대", () => assertSucceeds(updateDoc(doc(as("a"), "chat_rooms", "r4"), { members: arrayUnion("c") })));
  await seed("r5"); await t("a 가 방 이름 바꾸기", () => assertSucceeds(updateDoc(doc(as("a"), "chat_rooms", "r5"), { name: "새 이름" })));
  await seed("r6"); await t("방에 없는 c 는 못 바꿈", () => assertFails(updateDoc(doc(as("c"), "chat_rooms", "r6"), { name: "x" })));
  await env.cleanup();
  console.log(out.join("\n")); console.log(`\nchatRoomRules: ${pass} 통과 · ${fail} 실패`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
