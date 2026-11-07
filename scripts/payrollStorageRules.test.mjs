// ⭐ 2026-11-07 근로계약서 파일(payrollDocs) Storage 보안 규칙 테스트 — Firestore + Storage 에뮬레이터
//  실행: firebase emulators:exec --only firestore,storage --project demo-payroll "node scripts/payrollStorageRules.test.mjs"
//  (FS_EMU · ST_EMU 로 주소를 바꿀 수 있음)
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const FS = process.env.FS_EMU || process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const ST = process.env.ST_EMU || process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
const PROJECT = process.env.GCLOUD_PROJECT || "demo-payroll";
const BUCKET = `${PROJECT}.appspot.com`;
const toVal = (v) => (v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : { integerValue: String(v) });
async function seed(path, data) {
  const r = await fetch(`http://${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toVal(v)])) }) });
  assert.ok(r.ok, await r.text());
}
const CO = "테스트운송";
const KEY = CO; // 공백 없음 → safeId 그대로
const soon = new Date(Date.now() + 20 * 60000);
await seed("users/acct", { role: "test", companyName: CO, approved: true });
await seed("users/locked", { role: "test", companyName: CO, approved: true });
await seed("users/hr", { role: "hrManager", companyName: CO, approved: true });
await seed("users/other", { role: "test", companyName: "다른운송", approved: true });
for (const id of ["acct", "hr"]) await seed(`payrollUnlocks/${id}`, { uid: id, companyName: CO, expiresAt: soon });
await seed("payrollUnlocks/other", { uid: "other", companyName: "다른운송", expiresAt: soon });
await seed("users/sp", { role: "acctStaff", companyName: "한빛 물류", approved: true });
await seed("payrollUnlocks/sp", { uid: "sp", companyName: "한빛 물류", expiresAt: soon });

const apps = [];
// 에뮬레이터용 가짜 토큰(서명 없음) — Storage 에뮬레이터는 mockUserToken을 그대로 믿는다
function as(uid) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "x", storageBucket: BUCKET }, `s_${uid}_${apps.length}`);
  apps.push(app);
  const st = getStorage(app);
  const [h, p] = ST.split(":");
  connectStorageEmulator(st, h, Number(p), { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@t.kr` } });
  return st;
}
void getAuth; void connectAuthEmulator;
const ok = async (name, pr) => { try { await pr; console.log(`  ✓ 허용: ${name}`); } catch (e) { throw new Error(`허용돼야 함 — ${name}: ${e.code || e.message}`); } };
const no = async (name, pr) => { try { await pr; } catch (e) { if (/unauthorized|403|permission/i.test(String(e.code || e.message))) { console.log(`  ✓ 거부: ${name}`); return; } throw e; } throw new Error(`거부돼야 함 — ${name}`); };
const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);
const path = `payrollDocs/${KEY}/emp1/1_계약서.pdf`;
const acct = as("acct"); const locked = as("locked"); const hr = as("hr"); const other = as("other");
await ok("경리(해제): PDF 올리기", uploadBytes(ref(acct, path), pdf, { contentType: "application/pdf" }));
await ok("경리(해제): 읽기", getBytes(ref(acct, path)));
await no("경리(해제): 실행 파일 올리기", uploadBytes(ref(acct, `payrollDocs/${KEY}/emp1/x.html`), pdf, { contentType: "text/html" }));
await no("경리(잠김): 읽기", getBytes(ref(locked, path)));
await no("인사관리자(경리 아님): 읽기", getBytes(ref(hr, path)));
await no("다른 회사 경리: 읽기", getBytes(ref(other, path)));
await no("다른 회사 경리: 우리 회사 폴더에 올리기", uploadBytes(ref(other, `payrollDocs/${KEY}/emp1/y.pdf`), pdf, { contentType: "application/pdf" }));
await ok("띄어쓰기 있는 회사(한빛_물류 폴더): 올리기", uploadBytes(ref(as("sp"), "payrollDocs/한빛_물류/e/1.pdf"), pdf, { contentType: "application/pdf" }));
await no("띄어쓰기 회사 경리: 다른 회사 폴더", getBytes(ref(as("sp"), path)));
await ok("경리(해제): 지우기", deleteObject(ref(acct, path)));
await Promise.all(apps.map((a) => deleteApp(a)));
console.log("\n근로계약서 파일 보안 규칙 테스트 통과");
process.exit(0);
