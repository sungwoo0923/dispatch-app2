// 🔒 2026-11-23 운송사 · 화주 · 기사 분리 전체 점검(Firestore 에뮬레이터) — 규칙에 나오는 모든 컬렉션 · 화면 코드가 쓰는 모든 컬렉션에
//  B운송 데이터를 넣고, A운송 관리자 · 직원 · 기사 · 연동 화주 · 'B운송' 이름 화주 · 가입 대기 · 로그인 안 함으로 읽기 · 목록 · 쓰기를 해 본다.
//  공개 · 플랫폼 공용 컬렉션(아래 PUBLIC) 말고 하나라도 열리면 실패. 규칙을 고칠 때마다 돌린다.
//  실행: java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8181 &
//        node scripts/tenantMatrix.test.mjs
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { setLogLevel, getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, collection, query, where, limit } from "firebase/firestore";
setLogLevel("silent");
const PROJECT = "demo-matrix", base = "http://127.0.0.1:8181";
const rules = readFileSync("firestore.rules", "utf8");
await fetch(`${base}/emulator/v1/projects/${PROJECT}:securityRules`, { method: "PUT", body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) });
await fetch(`${base}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
const toVal = (v) => (v === null ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } });
const seed = async (p, d) => { const r = await fetch(`${base}/v1/projects/${PROJECT}/databases/(default)/documents/${p}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, toVal(v)])) }) }); if (!r.ok) throw new Error(p + " " + await r.text()); };
// 컬렉션 이름 — 규칙의 match · 목록 + 화면 · 서버 코드의 collection(db, "…") · doc(db, "…")
import { globSync } from "node:fs";
const rulesText = rules;
const colSet = new Set([...rulesText.matchAll(/match \/([A-Za-z_][A-Za-z0-9_]*)\/\{/g)].map((m) => m[1]));
for (const m of rulesText.matchAll(/in \[([^\]]+)\]/g)) for (const x of m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) colSet.add(x[1]);
for (const f of [...globSync("src/**/*.{js,jsx}"), ...globSync("functions/*.js")]) {
  const t = readFileSync(f, "utf8");
  for (const m of t.matchAll(/(?:collection|doc)\(\s*db\s*,\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)) colSet.add(m[1]);
  for (const m of t.matchAll(/collection\("([A-Za-z_][A-Za-z0-9_]*)"\)/g)) colSet.add(m[1]);
}
const cols = [...colSet].filter((c) => !c.startsWith("pnk")).sort();
const B = { companyName: "B운송", company: "B운송", co: "B운송", transportCompany: "B운송", linkedTransportCompany: { companyName: "B운송" }, shipperCompany: "B화주", uid: "bStaff", userId: "bStaff", driverId: "bDrv", driverUid: "bDrv", shipperUid: "bShip", ownerUid: "bStaff", fromUid: "bStaff", requesterUid: "bStaff", drafterUid: "bStaff", toUid: "bStaff", members: ["bStaff"], participants: ["bStaff"], to: ["bStaff"], 청구운임: 300000, 기사운임: 250000, secret: "B비밀", role: "admin", approved: true, status: "approved", type: "신규", audience: "internal", authorUid: "bStaff" };
await seed("users/aAdmin", { role: "admin", companyName: "A운송", approved: true, name: "A관리자" });
await seed("users/aStaff", { role: "user", companyName: "A운송", approved: true, name: "A직원" });
await seed("users/aDrv", { role: "driver", companyName: "A운송", approved: true, name: "A기사", carNo: "11가1111" });
await seed("users/shipA", { role: "shipper", companyName: "삼성", approved: true, name: "화주", linkedTransportCompany: { companyName: "A운송" } });
await seed("users/shipB", { role: "shipper", companyName: "B운송", approved: true, name: "가짜", position: "대표", team: "인사", isMaster: true, permissions: { master: true }, linkedTransportCompany: { companyName: "A운송" } });
await seed("users/pend", { role: "admin", companyName: "B운송", approved: false, name: "대기" });
await seed("users/bStaff", { ...B, role: "admin" });
for (const c of cols) { if (c === "users") continue; try { await seed(`${c}/bdoc`, B); await seed(`${c}/B운송`, B); } catch { /* 시스템 이름 */ } }
await seed("orders/bOrder", B); await seed("orders/bOrder/attachments/x", B); await seed("chat_rooms/broom", B); await seed("chat_rooms/broom/messages/m", B); await seed("chat_messages/bm", { ...B, roomId: "broom" });
let n = 0;
const as = (uid) => { const app = initializeApp({ projectId: PROJECT, apiKey: "x" }, `a${n++}`); const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8181, uid ? { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@t.kr` } } : undefined); return db; };
const actors = { A관리자: as("aAdmin"), A직원: as("aStaff"), A기사: as("aDrv"), 화주A연동: as("shipA"), 화주B이름: as("shipB"), 가입대기: as("pend"), 비로그인: as(null) };
const ok = async (p) => { try { await p; return true; } catch { return false; } };
const hits = [];
for (const [who, db] of Object.entries(actors)) {
  for (const c of cols) {
    const r = [];
    if (await ok(getDoc(doc(db, c, "bdoc")).then((s) => { if (!s.exists()) throw 0; }))) r.push("get");
    if (await ok(getDoc(doc(db, c, "B운송")).then((s) => { if (!s.exists()) throw 0; }))) r.push("get(B운송)");
    if (await ok(getDocs(query(collection(db, c), where("companyName", "==", "B운송"), limit(5))).then((s) => { if (s.empty) throw 0; }))) r.push("list");
    if (await ok(setDoc(doc(db, c, `w_${who}`), { ...B, by: who }))) r.push("write");
    if (r.length) hits.push(`${who}\t${c}\t${r.join(",")}`);
  }
  for (const [label, p] of [["orders/bOrder/attachments", getDocs(collection(db, "orders/bOrder/attachments"))], ["chat_rooms/broom/messages", getDocs(collection(db, "chat_rooms/broom/messages"))]]) {
    if (await ok(p.then((s) => { if (s.empty) throw 0; }))) hits.push(`${who}\t${label}\tlist`);
  }
}
// 누구에게나 열려 있어도 되는 것(회사 데이터가 아닌 공개 · 플랫폼 공용) — 오더마켓 글은 운송사 사무 직원끼리 보는 거래소
const PUBLIC = new Set(["uiConfig", "textOverridesPublic", "textOverrides", "smsRelay", "publicRelease", "publicCompanies", "publicPricing", "liveLocations",
  "landingInquiries", "contracts", "systemConfig", "hubSettings", "weatherCache", "shortLinks", "customRoles"]);
const bad = hits.filter((h) => { const [who, c] = h.split("\t"); if (PUBLIC.has(c)) return false; if (c === "cafeOrders" && ["A관리자", "A직원"].includes(who)) return false; return true; });
console.log(`컬렉션 ${cols.length}개 × 사용자 ${Object.keys(actors).length}명 점검`);
if (bad.length) { console.log("✗ 다른 회사 · 역할 데이터가 열린 곳:\n" + bad.join("\n")); process.exit(1); }
console.log("운송사 · 화주 · 기사 분리 전체 점검 통과");
process.exit(0);
