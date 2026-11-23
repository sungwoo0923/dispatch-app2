// 🔒 2026-11-23 운송사 분리 보안 규칙 테스트(Firestore 에뮬레이터) — "다른 운송사 정보는 절대 안 보이고 못 고친다"
//  실행: java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8181 &
//        FS_EMU=127.0.0.1:8181 node scripts/tenantIsolation.test.mjs
//  확인: ① 운송사 직원은 다른 운송사 오더 · 거래처 · 기사 · 직원 · 결재를 못 읽고 못 쓴다(스위치와 상관없이)
//        ② 가입만 한 사람이 approved 칸을 빼거나 true 로 적어 스스로 관리자가 되지 못한다 · 기사 선등록만으로 스스로 승인되지 못한다
//        ③ 화주사 이름을 운송사 이름과 똑같이 지어도 그 운송사 데이터가 안 열린다 · 같은 이름의 다른 화주사 오더가 안 보인다
//        ④ 결재 문서 company 를 다른 회사로 못 적는다 · 기사 문서를 다른 회사로 못 만든다 · 위치 문서에 회사 이름을 못 끼운다
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { setLogLevel, getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where } from "firebase/firestore";

setLogLevel("silent");
const HOST = process.env.FS_EMU || "127.0.0.1:8181";
const PROJECT = "demo-tenant-isolation";
const base = `http://${HOST}`;
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const put = await fetch(`${base}/emulator/v1/projects/${PROJECT}:securityRules`, { method: "PUT", body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) });
assert.ok(put.ok, `규칙 올리기 실패: ${await put.text()}`);
await fetch(`${base}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
const toVal = (v) => (v === null ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } });
async function seed(path, data) {
  const r = await fetch(`${base}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toVal(v)])) }) });
  assert.ok(r.ok, `seed ${path}: ${await r.text()}`);
}
// 운송사 A · B, A에 연동된 화주 "삼성"(같은 이름 화주가 C에도), 이름을 "B"로 지은 화주(A 연동), 아직 아무 문서 없는 가입자
await seed("users/aAdmin", { role: "admin", companyName: "A운송", approved: true, name: "A관리자" });
await seed("users/aDrv", { role: "driver", companyName: "A운송", approved: true, name: "A기사", carNo: "11가1111" });
await seed("users/bAdmin", { role: "admin", companyName: "B운송", approved: true, name: "B관리자", phone: "010-0000-0000" });
await seed("users/bStaff", { role: "user", companyName: "B운송", approved: true, name: "B직원" });
await seed("users/shipS", { role: "shipper", companyName: "삼성", approved: true, name: "삼성담당", linkedTransportCompany: { companyName: "A운송" } });
await seed("users/shipFake", { role: "shipper", companyName: "B운송", approved: true, name: "가짜", position: "대표", team: "인사", isMaster: true, linkedTransportCompany: { companyName: "A운송" } });
await seed("orders/b1", { companyName: "B운송", 거래처명: "B거래처", 상차일: "2026-11-23", 기사운임: 100000 });
await seed("orders/a1", { companyName: "A운송", 거래처명: "삼성", shipperCompany: "삼성", 상차일: "2026-11-23" });
await seed("orders/c1", { companyName: "C운송", 거래처명: "삼성", shipperCompany: "삼성", 상차일: "2026-11-23" });
await seed("clients/bc", { companyName: "B운송", 거래처명: "B거래처", 전화번호: "02-000-0000" });
await seed("drivers/bd", { companyName: "B운송", 이름: "B기사", 차량번호: "22나2222", 전화번호: "010-2222-2222" });
await seed("drivers/B운송__33다3333", { companyName: "B운송", 이름: "홍길동", 차량번호: "33다3333" });
await seed("companySettings/B운송", { companyName: "B운송", secret: "x" });
await seed("approvals/bap", { companyName: "B운송", company: "B운송", cat: "expense", participants: ["bStaff"], drafterUid: "bStaff", status: "pending" });
await seed("notices/bn", { companyName: "B운송", title: "B공지", audience: "internal" });
await seed("attendance/2026-11-23_bStaff", { uid: "bStaff", date: "2026-11-23" }); // 회사 칸 없는 예전 기록
await seed("clients/ac", { companyName: "A운송", 거래처명: "A거래처" });
await seed("acctLedger/al", { companyName: "A운송", 금액: 1000 });
await seed("hrResumes/hr", { companyName: "A운송", name: "지원자" });
await seed("salesLeads/sl", { companyName: "A운송", name: "리드" });
await seed("vehicleLedger/vl", { companyName: "A운송", plateKey: "11가1111" });
await seed("transportApplications/ta", { companyName: "A운송", type: "신규", status: "approved", companyCode: "SECRET", 직인: "data:image/png;base64,xx" });
await seed("someUnruledCol/x", { companyName: "A운송", v: 1 });

let n = 0;
function as(uid) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "x" }, `a_${uid}_${n++}`);
  const db = getFirestore(app);
  const [h, p] = HOST.split(":");
  if (uid) connectFirestoreEmulator(db, h, Number(p), { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@test.kr` } });
  else connectFirestoreEmulator(db, h, Number(p));
  return db;
}
let pass = 0;
const ok = async (name, pr) => { try { await pr; pass++; console.log(`  ✓ 허용: ${name}`); } catch (e) { throw new Error(`허용돼야 함 — ${name}: ${e.message}`); } };
const no = async (name, pr) => { try { await pr; } catch (e) { if (/PERMISSION_DENIED|permission/i.test(String(e.code || e.message))) { pass++; console.log(`  ✓ 거부: ${name}`); return; } throw e; } throw new Error(`거부돼야 함 — ${name}`); };

const aAdmin = as("aAdmin"); const aDrv = as("aDrv"); const shipS = as("shipS"); const shipFake = as("shipFake"); const anon = as(null);

console.log("① 운송사 A 직원 → B 데이터");
await ok("A 직원: 우리 회사 오더 목록", getDocs(query(collection(aAdmin, "orders"), where("companyName", "==", "A운송"))));
await no("A 직원: B 오더 한 건", getDoc(doc(aAdmin, "orders/b1")));
await no("A 직원: B 오더 목록", getDocs(query(collection(aAdmin, "orders"), where("companyName", "==", "B운송"))));
await no("A 직원: 회사 조건 없는 오더 전체", getDocs(collection(aAdmin, "orders")));
await no("A 직원: B 거래처", getDoc(doc(aAdmin, "clients/bc")));
await no("A 직원: B 기사", getDoc(doc(aAdmin, "drivers/bd")));
await no("A 직원: B 기사 목록", getDocs(query(collection(aAdmin, "drivers"), where("companyName", "==", "B운송"))));
await no("A 직원: B 직원 문서", getDoc(doc(aAdmin, "users/bAdmin")));
await no("A 직원: B 직원 목록", getDocs(query(collection(aAdmin, "users"), where("companyName", "==", "B운송"))));
await no("A 직원: B 결재 문서", getDoc(doc(aAdmin, "approvals/bap")));
await no("A 직원: B 공지", getDoc(doc(aAdmin, "notices/bn")));
await no("A 직원: B 회사 설정", getDoc(doc(aAdmin, "companySettings/B운송")));
await no("A 직원: 회사 칸 없는 예전 근태 기록", getDoc(doc(aAdmin, "attendance/2026-11-23_bStaff")));
await no("A 직원: B 이름으로 오더 만들기", setDoc(doc(aAdmin, "orders/x1"), { companyName: "B운송", 상차일: "2026-11-23" }));
await no("A 직원: 우리 오더를 B 로 옮기기", updateDoc(doc(aAdmin, "orders/a1"), { companyName: "B운송" }));
await no("A 직원: B 오더 고치기", updateDoc(doc(aAdmin, "orders/b1"), { 기사운임: 1 }));
await no("A 직원: 결재 company 를 B 로", setDoc(doc(aAdmin, "approvals/x"), { companyName: "A운송", company: "B운송", cat: "expense", drafterUid: "aAdmin", participants: ["aAdmin"], status: "pending" }));
await no("A 직원: 회사 칸 빼고 근태 기록 만들기", setDoc(doc(aAdmin, "attendance/x"), { uid: "aAdmin" }));
await no("A 기사: B 오더", getDoc(doc(aDrv, "orders/b1")));

console.log("② 가입만 한 사람(승인 전) — 스스로 다른 운송사 관리자 되기");
const att = as("attacker");
await no("approved 칸을 빼고 B 관리자로 가입", setDoc(doc(att, "users/attacker"), { companyName: "B운송", role: "admin", name: "x" }));
await no("approved:true 로 B 관리자 가입", setDoc(doc(att, "users/attacker"), { companyName: "B운송", role: "admin", approved: true, name: "x" }));
await no("기사 선등록(차량번호 + 이름)만 맞춰 스스로 승인", setDoc(doc(att, "users/attacker"), { companyName: "B운송", role: "driver", approved: true, name: "홍길동", carNo: "33다3333" }));
await no("승인 대기인데 마스터 · 권한 미리 넣기", setDoc(doc(att, "users/attacker"), { companyName: "B운송", role: "admin", approved: false, isMaster: true }));
await ok("정상 가입 신청(approved:false)", setDoc(doc(att, "users/attacker"), { companyName: "B운송", role: "admin", approved: false, isMaster: false, name: "x" }));
await no("승인 대기 → B 오더", getDoc(doc(att, "orders/b1")));
await no("승인 대기 → B 직원 목록", getDocs(query(collection(att, "users"), where("companyName", "==", "B운송"))));
await no("승인 대기 → 스스로 approved 바꾸기", updateDoc(doc(att, "users/attacker"), { approved: true }));
await updateDoc(doc(att, "users/attacker"), { carNo: "33다3333" });
await no("승인 대기 → 내 차량번호로 B 선등록 기사 문서 지우기", deleteDoc(doc(att, "drivers/B운송__33다3333")));
const att2 = as("attacker2");
await ok("기사 가입 신청(approved:false)", setDoc(doc(att2, "users/attacker2"), { companyName: "C운송", role: "driver", approved: false, name: "y" }));
await no("내 계정 회사(C)와 다른 회사(B)로 기사 문서 만들기", setDoc(doc(att2, "drivers/attacker2"), { companyName: "B운송", name: "y" }));
await ok("내 계정 회사(C)로 기사 문서 만들기", setDoc(doc(att2, "drivers/attacker2"), { companyName: "C운송", name: "y" }));
await no("내 기사 문서 회사를 B 로 바꾸기", updateDoc(doc(att2, "drivers/attacker2"), { companyName: "B운송" }));

console.log("③ 화주 — 같은 이름 · 운송사와 같은 이름");
await ok("화주 삼성(A 연동): A 가 보낸 오더 한 건", getDoc(doc(shipS, "orders/a1")));
await ok("화주 삼성(A 연동): A 가 보낸 오더 목록", getDocs(query(collection(shipS, "orders"), where("shipperCompany", "==", "삼성"), where("companyName", "==", "A운송"))));
await no("화주 삼성(A 연동): C 가 다른 '삼성'에 보낸 오더", getDoc(doc(shipS, "orders/c1")));
await no("화주 삼성: 운송사 조건 없는 오더 목록", getDocs(query(collection(shipS, "orders"), where("shipperCompany", "==", "삼성"))));
await no("화주 삼성: 받은 오더를 다른 운송사로 옮기기", updateDoc(doc(shipS, "orders/a1"), { companyName: "C운송" }));
await no("'B운송' 이름 화주: B 오더", getDoc(doc(shipFake, "orders/b1")));
await no("'B운송' 이름 화주: B 직원 목록", getDocs(query(collection(shipFake, "users"), where("companyName", "==", "B운송"))));
await no("'B운송' 이름 화주: B 직원 문서", getDoc(doc(shipFake, "users/bAdmin")));
await no("'B운송' 이름 화주: B 회사 설정", getDoc(doc(shipFake, "companySettings/B운송")));
await no("'B운송' 이름 화주: B 결재", getDoc(doc(shipFake, "approvals/bap")));
await ok("'B운송' 이름 화주: 같은 화주사 화주 목록", getDocs(query(collection(shipFake, "users"), where("companyName", "==", "B운송"), where("role", "==", "shipper"))));

console.log("⑤ 기사 — 같은 회사라도 사무 자료는 못 봄");
await ok("A 기사: 우리 회사 오더(내 차량 오더 화면)", getDoc(doc(aDrv, "orders/a1")));
await ok("A 기사: 차량 장부", getDoc(doc(aDrv, "vehicleLedger/vl")));
await no("A 기사: 거래처", getDoc(doc(aDrv, "clients/ac")));
await no("A 기사: 회계 장부", getDoc(doc(aDrv, "acctLedger/al")));
await no("A 기사: 입사 지원서", getDoc(doc(aDrv, "hrResumes/hr")));
await no("A 기사: 영업 리드", getDoc(doc(aDrv, "salesLeads/sl")));
await no("A 기사: 운송사 가입 신청서(직인 · 회사 코드)", getDoc(doc(aDrv, "transportApplications/ta")));
await no("A 기사: 따로 규칙 없는 컬렉션", getDoc(doc(aDrv, "someUnruledCol/x")));
await ok("A 직원: 거래처(사무 직원은 그대로)", getDoc(doc(aAdmin, "clients/ac")));
await ok("A 직원: 가입 신청서(사무 직원은 그대로)", getDoc(doc(aAdmin, "transportApplications/ta")));

console.log("⑥ 화주 — 연동 운송사와 공유해도 되는 것만");
await no("화주 삼성(A 연동): A 직원 문서", getDoc(doc(shipS, "users/aAdmin")));
await no("화주 삼성(A 연동): A 직원 목록", getDocs(query(collection(shipS, "users"), where("companyName", "==", "A운송"))));
await no("화주 삼성(A 연동): A 가입 신청서(직인 · 회사 코드)", getDoc(doc(shipS, "transportApplications/ta")));
await no("화주 삼성(A 연동): A 거래처", getDoc(doc(shipS, "clients/ac")));

console.log("④ 로그인 없는 위치 공유");
await ok("위치만 쓰기", setDoc(doc(anon, "liveLocations/a1"), { 위치: { lat: 1, lng: 2 } }));
await no("위치 문서에 회사 이름 끼우기", setDoc(doc(anon, "liveLocations/z1"), { 위치: { lat: 1, lng: 2 }, companyName: "B운송" }));
await no("로그인 없이 기사 업로드 기록 만들기", addDoc(collection(anon, "driver_uploads"), { companyName: "B운송" }));

console.log(`\n운송사 분리 규칙 테스트 통과 (${pass}개)`);
process.exit(0);
