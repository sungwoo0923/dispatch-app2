// ⭐ 2026-11-06 로지스웹 허브 콜 테스트(에뮬레이터 전용 · 배포 안 함). 경로·포트는 테스트 환경에 맞게 바꿔 쓰세요.
// 에뮬레이터 시험 데이터 — 기존 로지스웹 계정(운송사 직원 · 소속 기사 · 화주사 · 최고관리자) + 보드 예시 오더
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
const admin = require("/home/user/dispatch-app2/node_modules/firebase-admin");
admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const auth = admin.auth();
const FV = admin.firestore.FieldValue;
const kst = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

async function user(email, password, data) {
  let u;
  try { u = await auth.getUserByEmail(email); } catch { u = await auth.createUser({ email, password, displayName: data.name || "" }); }
  await db.doc(`users/${u.uid}`).set({ email, ...data, createdAt: FV.serverTimestamp() });
  return u.uid;
}
(async () => {
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-kpflow/databases/(default)/documents", { method: "DELETE" });
  await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-kpflow/accounts", { method: "DELETE" });
  const adminUid = await user("admin@hub.test", "test1234", { role: "totalMaster", companyName: "로지스웹", companyCode: "LW0001", approved: true, name: "허브관리자", phone: "010-1000-0000" });
  await user("staff@hanbit.test", "test1234", { role: "admin", companyName: "한빛로지스", companyCode: "HB1234", approved: true, name: "김배차", phone: "010-3333-4444" });
  await user("경기12가3456@driver.run25.kr", "경기12가3456", { role: "driver", approved: true, companyName: "한빛로지스", name: "박기사", carNo: "경기12가3456", phone: "010-5555-6666", 차량종류: "윙바디", 차량톤수: "5톤", 거주지: "경기 화성시" });
  await user("ship@daehan.test", "test1234", { role: "shipper", companyName: "대한식품", companyCode: "DH777", approved: true, name: "이화주", phone: "010-7777-8888" });
  // 보드 예시(이미 승인된 허브 화주 · 운송사 회원이 올린 오더)
  const s1 = (await auth.createUser({ email: "sample1@hub.test", password: "test1234" })).uid;
  const s2 = (await auth.createUser({ email: "sample2@hub.test", password: "test1234" })).uid;
  await db.doc(`hubMembers/${s1}`).set({ uid: s1, role: "shipper", source: "signup", status: "approved", docsVerified: true, bizStatus: "계속사업자", name: "정물류", phone: "010-2020-3030", companyName: "서해유통", email: "sample1@hub.test", prefs: {}, createdAt: FV.serverTimestamp() });
  await db.doc(`hubMembers/${s2}`).set({ uid: s2, role: "carrier", source: "signup", status: "approved", docsVerified: true, bizStatus: "계속사업자", name: "오운송", phone: "010-4040-5050", companyName: "동해운수", email: "sample2@hub.test", prefs: {}, createdAt: FV.serverTimestamp() });
  const rows = [
    [s1, "shipper", "서해유통", "정물류", "인천", "서구", "충남", "천안시", 0, "08:30", "생활용품 박스", "5톤", "윙바디", 340000, 12, true, "인수증", "편도", "독차", 120],
    [s2, "carrier", "동해운수", "오운송", "경기", "평택시", "경남", "창원시", 0, "14:00", "철강 코일", "11톤", "카고", 720000, 0, false, "계산서", "편도", "독차", 330],
    [s1, "shipper", "서해유통", "정물류", "서울", "송파구", "대전", "유성구", 1, "09:00", "전자부품", "1톤", "탑", 210000, 4, false, "선불", "편도", "혼적", 165],
    [s2, "carrier", "동해운수", "오운송", "경북", "구미시", "경기", "이천시", 1, "06:00", "냉동식품 16파레트", "11톤", "냉동윙", 780000, 16, true, "인수증", "편도", "독차", 230],
    [s1, "shipper", "서해유통", "정물류", "부산", "강서구", "경기", "화성시", 2, "10:00", "음료", "5톤", "윙바디", 560000, 10, false, "착불", "편도", "독차", 380],
    [s2, "carrier", "동해운수", "오운송", "충북", "음성군", "전남", "광양시", 1, "13:30", "기계 부품", "3.5톤", "카고", 0, 0, false, "계좌이체", "왕복", "혼적", 260],
  ];
  let i = 0;
  for (const [uid, role, co, nm, a1, a2, b1, b2, dd, time, cargo, ton, car, fare, pal, urgent, pay, trip, load, km] of rows) {
    const ref = db.collection("hubOrders").doc();
    await ref.set({ v: 3, posterUid: uid, posterRole: role, posterSource: "signup", posterCompany: co, posterName: nm, posterVerified: true, status: "open",
      상차시도: a1, 상차시군구: a2, 하차시도: b1, 하차시군구: b2, 상차일: kst(dd), 상차시간: time, 하차일: kst(dd), 하차시간: "", 화물내용: cargo, 중량: "", 파레트: pal,
      차량종류: car, 차량톤수: ton, 톤수값: parseFloat(ton), 상차방법: "지게차", 하차방법: "지게차", 운임: fare, 수수료: 0, 지급방식: pay, 긴급: urgent, 운행유형: trip, 적재: load, 공개메모: "", 거리km: km,
      takerUid: null, takerRole: null, assignedAt: null, cancelCount: 0,
      createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - (rows.length - i) * 7 * 60000), updatedAt: FV.serverTimestamp() });
    await ref.collection("private").doc("detail").set({ 상차지명: `${a2} 물류센터`, 상차지주소: `${a1} ${a2} 물류로 ${10 + i}`, 하차지명: `${b2} 센터`, 하차지주소: `${b1} ${b2} 산업로 ${20 + i}`, posterPhone: role === "shipper" ? "010-2020-3030" : "010-4040-5050", posterName: nm, posterCompany: co });
    i++;
  }
  console.log("seeded", { adminUid });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
