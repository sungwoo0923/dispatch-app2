// 2026-11-08 테스트 회사 가짜 데이터(seedTestCompany) 테스트
//  순수 검사(에뮬레이터 없이도): 대상 회사 허용 목록 · 테스트 표시 판별
//  에뮬레이터 검사(FIRESTORE_EMULATOR_HOST가 있을 때):
//   java -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-*.jar --host 127.0.0.1 --port 9680 &
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:9680 NODE_PATH=functions/node_modules node scripts/seedTestCompany.test.cjs
//  ① 다른 회사 이름(돌캐 · 공백 붙은 이름)은 최고관리자라도 거절 · 최고관리자 아닌 사람 거절
//  ② seed → 끊어서(짧은 시간) 이어가며 끝까지 · 두 번 해도 수가 같다(중복 없음)
//  ③ 실제 직원: 비어 있는 인사 칸만 채움(역할 · 승인 그대로) · 실제 출근기록은 덮어쓰지 않음
//  ④ reset · clear: 표시 없는 실제 문서 · 다른 회사 문서 · 표시가 다른 문서는 그대로, 채운 인사 칸은 되돌림
//  ⑤ refresh: 테스트 문서만 덮어쓰고 수가 맞음
const assert = require("node:assert/strict");
const path = require("node:path");
const { checkTargetCompany, makeSeedTestCompany } = require("../functions/seedTestCompany");

const CO = "테스트운송사";
let pass = 0;
const ok = (name) => { pass += 1; console.log(`  ✓ ${name}`); };

async function pure() {
  const core = await import(path.join(__dirname, "../functions/seedTestData.mjs"));
  assert.equal(checkTargetCompany(CO, core.SEED_ALLOWED_COMPANIES), CO);
  for (const bad of ["돌캐", "테스트운송사 ", " 테스트운송사", "테스트운송", "", null, undefined, "TP-JK4PBN"]) {
    assert.throws(() => checkTargetCompany(bad, core.SEED_ALLOWED_COMPANIES), /가짜 데이터는|회사를/);
  }
  assert.throws(() => core.buildSeedData({ company: "돌캐" }), /테스트운송사에만/);
  ok("대상 회사 허용 목록 밖은 거절(이름 앞뒤 공백 포함)");

  assert.equal(core.isSeedDoc({ _seed: "test-v1", companyName: CO }, CO), true);
  assert.equal(core.isSeedDoc({ _seed: "test-v1", companyName: "돌캐" }, "돌캐"), false, "허용 목록 밖 회사는 표시가 있어도 아님");
  assert.equal(core.isSeedDoc({ _seed: "test-v1", companyName: "돌캐" }, CO), false);
  assert.equal(core.isSeedDoc({ _seed: "test-v2", companyName: CO }, CO), false);
  assert.equal(core.isSeedDoc({ _seed: true, companyName: CO }, CO), false);
  assert.equal(core.isSeedDoc({ companyName: CO }, CO), false);
  assert.equal(core.isSeedDoc(null, CO), false);
  ok("지울 수 있는 문서 판별(표시 test-v1 + 같은 회사만)");

  const B = core.buildSeedData({ company: CO, now: Date.parse("2026-11-08T03:00:00Z"), realUsers: [{ uid: "realAdmin", name: "실제관리자", role: "admin" }] });
  const all = Object.entries(B.docs).flatMap(([c, l]) => l.map((e) => [c, e]));
  assert.ok(all.every(([, e]) => e.data._seed === "test-v1" && e.data.companyName === CO), "모든 문서에 표시 · 회사");
  assert.ok(all.every(([c, e]) => e.id.startsWith("seed_") || (c === "orders" && e.id.startsWith("fr_seed_fr_")) || ["attendance", "payrollEmployees", "payrollRuns", "payslips"].includes(c)), "번호 규칙");
  assert.ok(!all.some(([c]) => core.SEED_NEVER.has(c)), "건드리지 않는 컬렉션 없음");
  assert.ok(B.docs.users.every((e) => e.data.email.endsWith("@test.logisweb.co.kr")), "가짜 직원 이메일");
  assert.ok(!B.docs.users.some((e) => e.id === "realAdmin"), "실제 직원 문서는 만들지 않음");
  assert.ok(B.docs.attendance.filter((e) => e.data.uid === "realAdmin").every((e) => e.createOnly && e.data.date < "2026-11-08"), "실제 직원 출근은 지난 날만 · 없을 때만");
  const bz = B.docs.clients.map((e) => e.data.사업자번호.replace(/-/g, ""));
  const { bizNoValid } = await import(path.join(__dirname, "../functions/publicDataCore.mjs"));
  assert.ok(bz.every(bizNoValid), "사업자번호 검증식");
  const st = new Set(B.docs.orders.map((e) => e.data.배차상태));
  ["배차완료", "배차중", "승인대기", "배차취소"].forEach((s) => assert.ok(st.has(s), s));
  const days = B.docs.orders.map((e) => e.data.상차일).sort();
  assert.ok(days[0] <= "2026-05-12" && days[days.length - 1] >= "2026-11-22", "지난 6개월 ~ 다음 2주");
  ok(`만든 데이터 모양(${B.meta.total}건 · 오더 ${B.docs.orders.length}건)`);
  return core;
}

async function emulator(core) {
  const { initializeApp } = require("firebase-admin/app");
  const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-seed-test" });
  const db = getFirestore();
  const clearAll = async () => { for (const c of await db.listCollections()) await db.recursiveDelete(c); };
  await clearAll();
  // 실제 계정들
  await db.collection("users").doc("tm").set({ role: "totalMaster", email: "tm@x.com", name: "최고" });
  await db.collection("users").doc("realAdmin").set({ role: "admin", approved: true, companyName: CO, name: "실제관리자", email: "boss@tp.com" });
  await db.collection("users").doc("realStaff").set({ role: "user", approved: true, companyName: CO, name: "실제직원", team: "운송팀", email: "st@tp.com" });
  await db.collection("users").doc("realDriver").set({ role: "driver", approved: true, companyName: CO, name: "실제기사" });
  // 지우면 안 되는 문서
  await db.collection("orders").doc("real_1").set({ companyName: CO, 거래처명: "진짜 거래처", 상차일: "2026-11-08" });
  await db.collection("orders").doc("other_1").set({ companyName: "돌캐", _seed: "test-v1", 거래처명: "다른 회사" });
  await db.collection("orders").doc("v2_1").set({ companyName: CO, _seed: "test-v2" });
  await db.collection("clients").doc("seed_cl_99").set({ companyName: CO, 거래처명: "표시 없는 seed 번호" });
  const realAtt = (() => { const d = new Date(Date.now() + 9 * 3600e3 - 3 * 86400e3); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  await db.collection("attendance").doc(`${realAtt}_realStaff`).set({ uid: "realStaff", date: realAtt, status: "출근", checkInTime: "real", companyName: CO });

  const bulk = [];
  const S = makeSeedTestCompany({ db, FieldValue, Timestamp, budgetMs: 150, setBulkMode: async (c, on) => bulk.push([c, on]), log: { log() {} } });
  const TM = { uid: "tm", token: { email: "tm@x.com" } };

  await assert.rejects(S.handle({ action: "seed", company: "돌캐" }, TM), /테스트운송사/);
  await assert.rejects(S.handle({ action: "reset", company: "테스트운송사 " }, TM), /테스트운송사/);
  await assert.rejects(S.handle({ action: "seed", company: CO }, { uid: "realAdmin", token: { email: "boss@tp.com" } }), /최고관리자/);
  await assert.rejects(S.handle({ action: "seed", company: CO }, null), /로그인/);
  assert.equal((await db.collection("orders").where("companyName", "==", "돌캐").get()).size, 1);
  ok("에뮬레이터: 다른 회사 · 권한 없는 사람 거절(아무것도 안 씀)");

  const loop = async (action) => {
    let cursor = null; let r; let n = 0;
    do { r = await S.handle({ action, company: CO, cursor }, TM); cursor = r.cursor; n += 1; assert.ok(n < 200, "끝나지 않음"); } while (r.partial);
    return { r, n };
  };
  const a = await loop("seed");
  assert.ok(a.n > 1, `끊어서 이어감(${a.n}번)`);
  const s1 = await S.handle({ action: "status", company: CO }, TM);
  const b = await loop("seed");
  const s2 = await S.handle({ action: "status", company: CO }, TM);
  assert.deepEqual(s2.counts, s1.counts, "두 번 넣어도 같은 수");
  assert.equal(Object.values(b.r.done).filter((v, i) => Object.keys(b.r.done)[i].startsWith("written:")).reduce((x, y) => x + y, 0), 0, "두 번째는 쓴 것 없음");
  assert.ok(s1.counts.orders > 250 && s1.counts.users === 6 && s1.counts.payslips >= 6, JSON.stringify(s1.counts));
  assert.ok(bulk.some(([c, on]) => c === CO && on) && bulk.every(([c]) => c === CO), "대량 작업 표시는 테스트 회사만");
  ok(`에뮬레이터: seed 끊어서 끝까지(${a.n}번) · 두 번 해도 ${s1.total}건 그대로`);

  const ra = (await db.collection("users").doc("realAdmin").get()).data();
  assert.equal(ra.role, "admin"); assert.equal(ra.approved, true); assert.ok(ra.team && ra._seedFilled?.team === ra.team);
  const rs = (await db.collection("users").doc("realStaff").get()).data();
  assert.equal(rs.team, "운송팀", "있던 칸은 그대로"); assert.ok(!("team" in (rs._seedFilled || {})));
  assert.equal((await db.collection("attendance").doc(`${realAtt}_realStaff`).get()).data().checkInTime, "real", "실제 출근기록 그대로");
  assert.ok(!(await db.collection("users").doc("realDriver").get()).data()._seedFilled, "기사 계정은 안 건드림");
  ok("에뮬레이터: 실제 직원은 빈 인사 칸만 · 실제 출근기록 그대로");

  // 사람이 바꾼 칸은 되돌리지 않는다
  await db.collection("users").doc("realAdmin").update({ position: "부장" });
  // 앱이 테스트 노선에서 만든 오더(표시 없음)
  await db.collection("orders").doc("fr_seed_fr_1_2026-12-31").set({ companyName: CO, 고정노선Id: "seed_fr_1", 등록기기: "고정노선", 상차일: "2026-12-31" });
  const c = await loop("reset");
  const s3 = await S.handle({ action: "status", company: CO }, TM);
  assert.deepEqual(s3.counts, s1.counts, "다시 채운 수 같음");
  assert.ok(c.r.done["deleted:orders"] >= s1.counts.orders, "지우고 다시 씀");
  for (const [col, id] of [["orders", "real_1"], ["orders", "other_1"], ["orders", "v2_1"], ["clients", "seed_cl_99"], ["users", "tm"], ["users", "realDriver"]]) assert.ok((await db.collection(col).doc(id).get()).exists, `${col}/${id} 남아 있어야`);
  assert.equal((await db.collection("orders").doc("fr_seed_fr_1_2026-12-31").get()).exists, false, "테스트 노선에서 나온 오더는 지움");
  ok("에뮬레이터: reset은 테스트 문서만 지우고 다시 채움(표시 없는 문서 · 다른 회사 · 다른 표시는 그대로)");

  const e = await loop("refresh");
  const s4 = await S.handle({ action: "status", company: CO }, TM);
  assert.deepEqual(s4.counts, s1.counts);
  assert.ok(Object.keys(e.r.done).some((k) => k.startsWith("written:orders")), "테스트 문서 덮어씀");
  ok("에뮬레이터: refresh 날짜 맞추기(덮어쓰기 · 수 그대로)");

  if (process.env.SEED_KEEP === "1") { console.log(`\n테스트 ${pass}개 통과 (데이터 남김)`); return; }
  await loop("clear");
  const s5 = await S.handle({ action: "status", company: CO }, TM);
  assert.equal(s5.total, 0);
  const ra2 = (await db.collection("users").doc("realAdmin").get()).data();
  assert.ok(!ra2.team && !ra2._seedFilled && ra2.position === "부장" && ra2.role === "admin", JSON.stringify(ra2));
  assert.ok((await db.collection("orders").doc("real_1").get()).exists);
  assert.equal((await db.collection("attendance").doc(`${realAtt}_realStaff`).get()).data().checkInTime, "real");
  ok("에뮬레이터: clear 후 0건 · 채운 칸만 되돌림(사람이 바꾼 칸은 그대로)");
}

(async () => {
  const core = await pure();
  if (process.env.FIRESTORE_EMULATOR_HOST) await emulator(core);
  else console.log("  (FIRESTORE_EMULATOR_HOST가 없어 에뮬레이터 검사는 건너뜀)");
  console.log(`\n테스트 ${pass}개 통과`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
