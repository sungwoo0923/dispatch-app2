process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin"); admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore(), auth = admin.auth();
const CO = "한결로지스";
const kim = (await auth.getUserByEmail("kim@hangyeol.demo")).uid;
// 기존 demo-d* 삭제
for (const d of (await db.collection("drivers").get()).docs) if (d.id.startsWith("demo-d")) await d.ref.delete();
const D = [
  ["박정훈", "경기90사4127", "11톤", "윙바디", 37.02, 126.86, "운송중", 72], ["이민수", "경기82아7712", "5톤", "냉장탑", 36.12, 128.11, "운송중", 81],
  ["최용석", "충북80바2031", "5톤", "카고", 36.35, 128.0, "운송중", 88], ["윤재호", "충남91자5560", "25톤", "카고", 36.97, 126.72, "상차중", 0],
  ["한상우", "경기87배0918", "2.5톤", "냉동탑", 35.19, 126.8, "하차중", 0], ["오세민", "서울83사3349", "1톤", "탑", 36.8, 127.15, "운송중", 93],
  ["서준혁", "경북81마6620", "5톤", "카고", 36.78, 127.0, "출근", 0], ["임태경", "강원80아1482", "5톤", "냉장탑", 37.45, 128.1, "운송중", 76],
  ["정해진", "전남90바7745", "11톤", "카고", 35.55, 129.3, "상차중", 0], ["김태호", "인천97아5520", "11톤", "윙바디", 37.48, 126.68, "복귀중", 64],
  ["노승철", "경기91바1186", "11톤", "윙바디", 37.21, 127.43, "운송중", 85], ["강민석", "경남88사2207", "3.5톤", "탑", 35.23, 128.68, "휴식", 0],
];
const now = admin.firestore.Timestamp.now();
for (const [i, [name, plate, ton, kind, lat, lng, st, spd]] of D.entries()) {
  const email = `driver${i + 1}@hangyeol.demo`;
  let u; try { u = await auth.getUserByEmail(email); } catch { u = await auth.createUser({ email, password: "demo1234!", displayName: name }); }
  const phone = `010-${4100 + i * 37}-${2200 + i * 53}`;
  await db.doc(`users/${u.uid}`).set({ email, name, role: "driver", approved: true, companyName: CO, carNo: plate, vehicleType: `${ton} ${kind}`, phone, tutorialDone: true }, { merge: true });
  await db.doc(`drivers/${u.uid}`).set({
    이름: name, name, 차량번호: plate, carNo: plate, 차량톤수: ton, 톤수: ton, 차량종류: kind, vehicleType: `${ton} ${kind}`, 전화번호: phone, phone,
    등급: i < 9 ? "지입" : "직영", companyName: CO, uid: u.uid, approved: true, status: st, mainStatus: st, state: st,
    location: { lat, lng }, updatedAt: now, heartbeatAt: now, active: true, speed: spd, totalDistance: 80 + i * 23, workMinutes: 200 + i * 11,
    workStartAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - (5 + i % 4) * 3600e3)), 담당자: { uid: kim, name: "김도윤" },
    근무요일: ["월", "화", "수", "목", "금"], 거주지: pick(i),
  }, { merge: true });
}
function pick(i) { return ["인천 서구", "화성 향남", "청주 흥덕", "당진 송악", "광주 광산", "천안 서북", "평택 포승", "원주 문막", "울산 남구", "인천 부평", "용인 처인", "창원 성산"][i]; }
// 중복 로그인 기록 정리
for (const c of ["loginSessions", "activeSessions", "sessions"]) for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
console.log("ok"); process.exit(0);
