// ⭐ 2026-11-07 원격 지원 · 화면 제어 보안 규칙 테스트(Firestore 에뮬레이터)
//  실행: java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8181 &
//        FS_EMU=127.0.0.1:8181 node scripts/supportControlRules.test.mjs
//  확인: 제어 허용(controlAllowed)은 직원 본인만 켠다 · 최고관리자는 끄기만 · 제어 명령(controlCmds)은 최고관리자가, 허용된 동안에만
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { setLogLevel, getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection } from "firebase/firestore";

setLogLevel("silent");
const HOST = process.env.FS_EMU || "127.0.0.1:8181";
const PROJECT = "demo-support-control";
const base = `http://${HOST}`;
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const put = await fetch(`${base}/emulator/v1/projects/${PROJECT}:securityRules`, { method: "PUT", body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) });
assert.ok(put.ok, `규칙 올리기 실패: ${await put.text()}`);
await fetch(`${base}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
const toVal = (v) => (typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : { integerValue: String(v) });
async function seed(path, data) {
  const r = await fetch(`${base}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toVal(v)])) }) });
  assert.ok(r.ok, `seed ${path}: ${await r.text()}`);
}
await seed("users/emp", { role: "user", companyName: "테스트운송", approved: true, name: "직원" });
await seed("users/emp2", { role: "user", companyName: "테스트운송", approved: true, name: "다른 직원" });
await seed("users/master", { role: "totalMaster", companyName: "돌캐", approved: true, name: "최고관리자" });

let n = 0;
function as(uid) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "x" }, `a_${uid}_${n++}`);
  const db = getFirestore(app);
  const [h, p] = HOST.split(":");
  connectFirestoreEmulator(db, h, Number(p), { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@test.kr` } });
  return db;
}
const ok = async (name, pr) => { try { await pr; console.log(`  ✓ 허용: ${name}`); } catch (e) { throw new Error(`허용돼야 함 — ${name}: ${e.message}`); } };
const no = async (name, pr) => { try { await pr; } catch (e) { if (/PERMISSION_DENIED|permission/i.test(String(e.code || e.message))) { console.log(`  ✓ 거부: ${name}`); return; } throw e; } throw new Error(`거부돼야 함 — ${name}`); };

const emp = as("emp"); const emp2 = as("emp2"); const master = as("master");
await no("직원: 처음부터 제어 허용된 세션 만들기", setDoc(doc(emp, "supportSessions/s0"), { requesterUid: "emp", status: "waiting", controlAllowed: true }));
await ok("직원: 세션 만들기", setDoc(doc(emp, "supportSessions/s1"), { requesterUid: "emp", status: "waiting", controlAllowed: false, controlRequested: false }));
await ok("관리자: 제어 요청", updateDoc(doc(master, "supportSessions/s1"), { controlRequested: true }));
await no("관리자: 제어 허용을 직접 켜기", updateDoc(doc(master, "supportSessions/s1"), { controlAllowed: true }));
await no("관리자: 허용 전 제어 명령 쓰기", addDoc(collection(master, "supportSessions/s1/controlCmds"), { m: { t: "d", x: 0.5, y: 0.5 }, at: 1 }));
await no("다른 직원: 제어 허용 켜기", updateDoc(doc(emp2, "supportSessions/s1"), { controlAllowed: true }));
await ok("직원 본인: 제어 허용", updateDoc(doc(emp, "supportSessions/s1"), { controlAllowed: true, controlRequested: false }));
await ok("관리자: 허용된 동안 다른 값 바꾸기(포인터)", updateDoc(doc(master, "supportSessions/s1"), { pointer: { x: 0.1, y: 0.2, at: 3 } }));
await ok("관리자: 허용된 동안 제어 명령 쓰기", addDoc(collection(master, "supportSessions/s1/controlCmds"), { m: { t: "d", x: 0.5, y: 0.5 }, at: 2 }));
await no("직원 본인: 제어 명령 쓰기(관리자만)", addDoc(collection(emp, "supportSessions/s1/controlCmds"), { m: { t: "d", x: 0.5, y: 0.5 }, at: 2 }));
await no("다른 직원: 제어 명령 읽기", getDocs(collection(emp2, "supportSessions/s1/controlCmds")));
await ok("직원 본인: 제어 명령 읽기", getDocs(collection(emp, "supportSessions/s1/controlCmds")));
await ok("직원 본인: 채팅(messages)은 그대로", addDoc(collection(emp, "supportSessions/s1/messages"), { from: "requester", text: "안녕하세요", at: 1 }));
await ok("관리자: 채팅(messages)은 그대로", addDoc(collection(master, "supportSessions/s1/messages"), { from: "master", text: "네", at: 2 }));
await ok("관리자: ICE 후보(calleeCandidates)는 그대로", addDoc(collection(master, "supportSessions/s1/calleeCandidates"), { candidate: "x" }));
await ok("관리자: 제어 끝내기(허용 끄기)", updateDoc(doc(master, "supportSessions/s1"), { controlAllowed: false, controlEndedBy: "master" }));
await no("관리자: 끈 뒤 다시 켜기", updateDoc(doc(master, "supportSessions/s1"), { controlAllowed: true }));
await no("관리자: 끈 뒤 제어 명령 쓰기", addDoc(collection(master, "supportSessions/s1/controlCmds"), { m: { t: "d", x: 0.5, y: 0.5 }, at: 4 }));
await ok("관리자: 세션 읽기", getDoc(doc(master, "supportSessions/s1")));
console.log("\n원격 지원 · 화면 제어 규칙 테스트 통과");
process.exit(0);
