// ⭐ 2026-11-06 급여·연차 촉진 보안 규칙 테스트(Firestore 에뮬레이터)
//  실행: java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 8181 &
//        FS_EMU=127.0.0.1:8181 node scripts/payrollRules.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { setLogLevel, getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } from "firebase/firestore";

setLogLevel("silent");
const HOST = process.env.FS_EMU || "127.0.0.1:8181";
const PROJECT = "demo-payroll";
const base = `http://${HOST}`;
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const put = await fetch(`${base}/emulator/v1/projects/${PROJECT}:securityRules`, { method: "PUT", body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) });
assert.ok(put.ok, `규칙 올리기 실패: ${await put.text()}`);
await fetch(`${base}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });

// 관리자 권한으로 데이터 넣기(규칙 무시)
const toVal = (v) => (v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(toVal) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } });
async function seed(path, data) {
  const r = await fetch(`${base}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toVal(v)])) }) });
  assert.ok(r.ok, `seed ${path}: ${await r.text()}`);
}
const CO = "테스트운송";
// ⭐ 2026-11-07 급여는 경리만 + 비밀번호 잠금 해제(payrollUnlocks/{uid}) 동안만
const users = {
  emp: { role: "user", companyName: CO, approved: true, name: "직원" },
  emp2: { role: "user", companyName: CO, approved: true, name: "직원2" },
  acct: { role: "test", companyName: CO, approved: true, name: "경리(잠금 해제)" },
  acctLocked: { role: "test", companyName: CO, approved: true, name: "경리(잠김)" },
  acctExpired: { role: "acctStaff", companyName: CO, approved: true, name: "경리사무원(만료)" },
  acctOtherUnlock: { role: "test", companyName: CO, approved: true, name: "경리(다른 회사 잠금 해제)" },
  finTeam: { role: "user", companyName: CO, approved: true, name: "총무팀 직원", team: "총무팀" },
  hrAcct: { role: "hrAcct", companyName: CO, approved: true, name: "통합인사" },
  hr: { role: "hrManager", companyName: CO, approved: true, name: "인사" },
  ceo: { role: "admin", companyName: CO, approved: true, name: "대표", position: "대표" },
  master: { role: "admin", companyName: CO, approved: true, name: "마스터", isMaster: true },
  other: { role: "test", companyName: "다른운송", approved: true, name: "다른회사 경리" },
};
for (const [id, u] of Object.entries(users)) await seed(`users/${id}`, u);
const soon = new Date(Date.now() + 20 * 60000); const past = new Date(Date.now() - 60000);
for (const id of ["acct", "finTeam", "hrAcct", "hr", "ceo", "master"]) await seed(`payrollUnlocks/${id}`, { uid: id, companyName: CO, expiresAt: soon });
await seed(`payrollUnlocks/acctExpired`, { uid: "acctExpired", companyName: CO, expiresAt: past });
await seed(`payrollUnlocks/acctOtherUnlock`, { uid: "acctOtherUnlock", companyName: "다른운송", expiresAt: soon });
await seed(`payrollUnlocks/other`, { uid: "other", companyName: "다른운송", expiresAt: soon });
await seed(`payrollSecrets/${CO}`, { companyName: CO, salt: "x", hash: "y" });
await seed(`payslips/s_emp`, { companyName: CO, uid: "emp", ym: "2026-10", status: "paid", published: true, result: { net: 100 } });
await seed(`payslips/s_emp_draft`, { companyName: CO, uid: "emp", ym: "2026-11", status: "draft", published: false, result: { net: 100 } });
await seed(`payslips/s_emp2`, { companyName: CO, uid: "emp2", ym: "2026-10", status: "confirmed", published: true, result: { net: 200 } });
await seed(`payrollEmployees/e_emp`, { companyName: CO, uid: "emp", baseMonthly: 3000000 });
await seed(`payrollRuns/r_1`, { companyName: CO, ym: "2026-10", status: "paid" });
await seed(`leavePromotions/lp_emp`, { companyName: CO, uid: "emp", periodFrom: "2026-03-15", log: [{ type: "n1", at: 1 }] });

const apps = [];
function as(uid) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "x" }, `a_${uid}_${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  const [h, p] = HOST.split(":");
  connectFirestoreEmulator(db, h, Number(p), { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@test.kr` } });
  return db;
}
const ok = async (name, pr) => { try { await pr; console.log(`  ✓ 허용: ${name}`); } catch (e) { throw new Error(`허용돼야 함 — ${name}: ${e.message}`); } };
const no = async (name, pr) => { try { await pr; } catch (e) { if (/PERMISSION_DENIED|permission/i.test(String(e.code || e.message))) { console.log(`  ✓ 거부: ${name}`); return; } throw e; } throw new Error(`거부돼야 함 — ${name}`); };

const emp = as("emp"); const acct = as("acct"); const hr = as("hr"); const ceo = as("ceo"); const master = as("master"); const other = as("other");
const locked = as("acctLocked"); const expired = as("acctExpired"); const otherUnlock = as("acctOtherUnlock"); const fin = as("finTeam"); const hrAcct = as("hrAcct");
// 직원 — 본인 발행 명세서만(비밀번호 없이)
await ok("직원: 본인 발행 명세서 읽기", getDoc(doc(emp, "payslips/s_emp")));
await ok("직원: 본인 발행 명세서 목록(uid+published)", getDocs(query(collection(emp, "payslips"), where("uid", "==", "emp"), where("published", "==", true))));
await no("직원: 남의 명세서 읽기", getDoc(doc(emp, "payslips/s_emp2")));
await no("직원: 본인 미발행(작성 중) 명세서", getDoc(doc(emp, "payslips/s_emp_draft")));
await no("직원: 회사 전체 명세서 목록", getDocs(query(collection(emp, "payslips"), where("companyName", "==", CO), where("ym", "==", "2026-10"))));
await ok("직원: 본인 명세서 읽음 표시", updateDoc(doc(emp, "payslips/s_emp"), { readAt: 1 }));
await no("직원: 본인 명세서 금액 고치기", updateDoc(doc(emp, "payslips/s_emp"), { result: { net: 999999 } }));
await no("직원: 급여 설정 읽기", getDoc(doc(emp, "payrollEmployees/e_emp")));
await no("직원: 요율 설정 쓰기", setDoc(doc(emp, `payrollSettings/${CO}`), { companyName: CO, years: {} }));
// 비밀번호 문서 · 잠금 해제 문서 — 서버만 쓴다
await no("경리: 비밀번호 해시 읽기", getDoc(doc(acct, `payrollSecrets/${CO}`)));
await no("최고관리자 아닌 마스터: 비밀번호 해시 읽기", getDoc(doc(master, `payrollSecrets/${CO}`)));
await ok("경리: 내 잠금 해제 문서 읽기(남은 시간)", getDoc(doc(acct, "payrollUnlocks/acct")));
await no("경리: 남의 잠금 해제 문서 읽기", getDoc(doc(acct, "payrollUnlocks/finTeam")));
await no("잠긴 경리: 스스로 잠금 해제 문서 만들기", setDoc(doc(locked, "payrollUnlocks/acctLocked"), { uid: "acctLocked", companyName: CO, expiresAt: soon }));
await no("경리: 잠금 해제 시간 늘리기", setDoc(doc(acct, "payrollUnlocks/acct"), { uid: "acct", companyName: CO, expiresAt: new Date(Date.now() + 864e5) }));
// 경리(잠금 해제) — 회사 전체 읽기·쓰기
await ok("경리(해제): 남의 명세서 읽기", getDoc(doc(acct, "payslips/s_emp2")));
await ok("경리(해제): 회사 명세서 목록", getDocs(query(collection(acct, "payslips"), where("companyName", "==", CO), where("ym", "==", "2026-10"))));
await ok("경리(해제): 급여 설정 목록", getDocs(query(collection(acct, "payrollEmployees"), where("companyName", "==", CO))));
await ok("경리(해제): 급여 처리 기록 목록", getDocs(query(collection(acct, "payrollRuns"), where("companyName", "==", CO))));
await ok("경리(해제): 급여 설정 쓰기", setDoc(doc(acct, "payrollEmployees/e_emp2"), { companyName: CO, uid: "emp2", baseMonthly: 2500000 }));
await ok("경리(해제): 작성 중 명세서 수정", updateDoc(doc(acct, "payslips/s_emp_draft"), { result: { net: 150 } }));
await no("경리(해제): 확정된 명세서 금액 수정(잠금)", updateDoc(doc(acct, "payslips/s_emp2"), { result: { net: 1 } }));
await ok("경리(해제): 확정 해제(상태만)", updateDoc(doc(acct, "payslips/s_emp2"), { status: "draft", published: false, unlockReason: "정정" }));
await ok("경리(해제): 요율 설정 저장", setDoc(doc(acct, `payrollSettings/${CO}`), { companyName: CO, years: { 2026: { npEmp: 4.75 } } }));
await no("경리(해제): 다른 회사 이름으로 급여 설정 만들기", setDoc(doc(acct, "payrollEmployees/e_x_other"), { companyName: "다른운송", uid: "x" }));
// 경리지만 잠김 · 만료 · 다른 회사 잠금 해제
await no("경리(잠김): 명세서 읽기", getDoc(doc(locked, "payslips/s_emp2")));
await no("경리(잠김): 회사 명세서 목록", getDocs(query(collection(locked, "payslips"), where("companyName", "==", CO))));
await no("경리(잠김): 급여 설정 읽기", getDoc(doc(locked, "payrollEmployees/e_emp")));
await no("경리(잠김): 급여 설정 쓰기", setDoc(doc(locked, "payrollEmployees/e_l"), { companyName: CO, uid: "l" }));
await no("경리(잠김): 요율 저장", setDoc(doc(locked, `payrollSettings/${CO}`), { companyName: CO, years: {} }));
await ok("경리(잠김): 요율 문서 읽기(사람별 급여 없음)", getDoc(doc(locked, `payrollSettings/${CO}`)));
await no("경리사무원(만료): 명세서 읽기", getDoc(doc(expired, "payslips/s_emp2")));
await no("경리(다른 회사 잠금 해제): 우리 회사 명세서", getDoc(doc(otherUnlock, "payslips/s_emp2")));
await no("다른 회사 경리: 우리 회사 명세서", getDoc(doc(other, "payslips/s_emp")));
await no("다른 회사 경리: 우리 회사 명세서 목록", getDocs(query(collection(other, "payslips"), where("companyName", "==", CO))));
// 부서가 총무·회계면 역할이 일반 직원이어도 급여 담당 · 통합인사관리자도(서버는 화면 전환을 모른다)
await ok("총무팀 직원(해제): 명세서 읽기", getDoc(doc(fin, "payslips/s_emp2")));
await ok("통합인사관리자(해제): 급여 설정 읽기", getDoc(doc(hrAcct, "payrollEmployees/e_emp")));
// 인사관리자 · 대표 · 회사 마스터 — 경리가 아니면 잠금 해제 문서가 있어도 못 본다(예전 조회·수정 권한 없앰)
await no("인사관리자: 명세서 조회", getDoc(doc(hr, "payslips/s_emp")));
await no("인사관리자: 급여 설정 목록", getDocs(query(collection(hr, "payrollEmployees"), where("companyName", "==", CO))));
await ok("인사관리자: 연차 촉진 설정(leave만) 저장", setDoc(doc(hr, `payrollSettings/${CO}`), { leave: { basis: "fiscal" }, leaveUpdatedBy: "hr" }, { merge: true }));
await no("인사관리자: 요율 바꾸기", setDoc(doc(hr, `payrollSettings/${CO}`), { years: { 2026: { npEmp: 1 } } }, { merge: true }));
await no("대표: 명세서 조회", getDoc(doc(ceo, "payslips/s_emp2")));
await no("대표: 급여 설정 쓰기", setDoc(doc(ceo, "payrollEmployees/e_x"), { companyName: CO, uid: "x" }));
await no("회사 마스터: 급여 설정 쓰기", setDoc(doc(master, "payrollEmployees/e_x"), { companyName: CO, uid: "x" }));
await no("회사 마스터: 명세서 목록", getDocs(query(collection(master, "payslips"), where("companyName", "==", CO))));
// 알림
await no("직원: 남에게 명세서 알림 만들기", setDoc(doc(emp, "hrNotices/n1"), { companyName: CO, uid: "emp2", kind: "payslip" }));
await ok("경리(해제): 명세서 발행 알림 만들기", setDoc(doc(acct, "hrNotices/n2"), { companyName: CO, uid: "emp", kind: "payslip" }));
await no("경리(잠김): 명세서 발행 알림 만들기", setDoc(doc(locked, "hrNotices/n3"), { companyName: CO, uid: "emp", kind: "payslip" }));
await ok("직원: 내 알림 읽기", getDoc(doc(emp, "hrNotices/n2")));
await no("다른 직원: 남의 알림 읽기", getDoc(doc(as("emp2"), "hrNotices/n2")));
// 연차 촉진 — 기록은 덧붙이기만
await ok("직원: 사용 계획 제출(기록 1줄 추가)", updateDoc(doc(emp, "leavePromotions/lp_emp"), { plan: { dates: ["2026-12-01"], submittedAt: 2 }, log: [{ type: "n1", at: 1 }, { type: "plan", at: 2 }] }));
await no("직원: 발송 기록 지우기", updateDoc(doc(emp, "leavePromotions/lp_emp"), { plan: { dates: [] }, log: [{ type: "plan", at: 3 }] }));
await no("직원: 1차 통보 시각 바꾸기", updateDoc(doc(emp, "leavePromotions/lp_emp"), { n1: { sentAt: 0 } }));
await no("인사: 기록 지우기", updateDoc(doc(hr, "leavePromotions/lp_emp"), { log: [] }));
await ok("인사: 2차 발송 기록 추가", updateDoc(doc(hr, "leavePromotions/lp_emp"), { n2: { sentAt: 5 }, log: [{ type: "n1", at: 1 }, { type: "plan", at: 2 }, { type: "n2", at: 5 }] }));
await no("다른 직원: 남의 연차 촉진 문서", getDoc(doc(as("emp2"), "leavePromotions/lp_emp")));

await Promise.all(apps.map((a) => deleteApp(a)));
console.log("\n급여·연차 촉진 보안 규칙 테스트 통과");
process.exit(0);
