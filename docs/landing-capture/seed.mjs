// 로컬 에뮬레이터 전용 가상 데이터 (실제 서버와 무관)
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-kpflow" });
const db = admin.firestore();
const auth = admin.auth();
const CO = "한결로지스";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
const dayOff = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---------- 직원 ----------
const STAFF = [
  ["kim@hangyeol.demo", "김도윤", "팀장", "admin", "배차팀"],
  ["lee@hangyeol.demo", "이서연", "대리", "user", "배차팀"],
  ["park@hangyeol.demo", "박지훈", "주임", "user", "배차팀"],
  ["jung@hangyeol.demo", "정하늘", "사원", "user", "배차팀"],
  ["choi@hangyeol.demo", "최영민", "이사", "admin", "경영지원"],
  ["ceo@hangyeol.demo", "정대현", "대표이사", "admin", "임원"],
];
const uids = {};
for (const [email, name, position, role, team] of STAFF) {
  let u;
  try { u = await auth.getUserByEmail(email); } catch { u = await auth.createUser({ email, password: "demo1234!", displayName: name }); }
  uids[name] = u.uid;
  await db.doc(`users/${u.uid}`).set({ email, name, 이름: name, position, 직급: position, role, team, 부서: team, companyName: CO, approved: true, employmentStatus: "재직", createdAt: admin.firestore.Timestamp.now(), phone: "010-0000-0000" }, { merge: true });
}

// ---------- 거래처 · 장소 ----------
const PLACES = [
  ["대성식품 1공장", "인천 서구 오류동 1546"], ["평택 포승 물류센터", "경기 평택시 포승읍 평택항로 268"], ["미래전자부품 향남공장", "경기 화성시 향남읍 제약공단1길 41"],
  ["부산 강서 미음센터", "부산 강서구 미음산단로 127"], ["그린팜 이천 저온창고", "경기 이천시 마장면 서이천로 521"], ["대구 성서공단 물류", "대구 달서구 성서공단로 214"],
  ["세진케미칼 당진공장", "충남 당진시 송악읍 부곡공단4길 28"], ["울산 여천 탱크터미널", "울산 남구 여천로 217"], ["동서제약 기흥센터", "경기 용인시 기흥구 공세로 150"],
  ["광주 하남산단 3번로", "광주 광산구 하남산단3번로 45"], ["코스모리빙 김포센터", "경기 김포시 고촌읍 아라육로 152"], ["대전 관평 물류", "대전 유성구 테크노2로 199"],
  ["창원 성산 웅남", "경남 창원시 성산구 웅남로 646"], ["한빛산업 둔포공장", "충남 아산시 둔포면 아산밸리로 182"], ["구미 1공단", "경북 구미시 1공단로 172"],
  ["청주 오창 과학단지", "충북 청주시 청원구 오창읍 과학산업2로 587"], ["인천 남동공단", "인천 남동구 남동서로 193"], ["강릉 주문진 물류", "강원 강릉시 주문진읍 주문로 210"],
  ["여수 국가산단", "전남 여수시 여수산단로 1038"], ["김해 진례 센터", "경남 김해시 진례면 서부로 491"],
];
const CLIENTS = ["대성식품", "미래전자부품", "그린팜유통", "세진케미칼", "동서제약", "코스모리빙", "한빛산업", "오성테크", "서해수산", "누리가구"];
for (const [i, c] of CLIENTS.entries()) {
  await db.doc(`clients/demo-c${i}`).set({ 거래처명: c, 업체명: c, 사업자번호: `1${i}4-8${i}-0${i}221`, 대표자: pick(["김", "이", "박", "최"]) + "대표", 담당자: pick(["정과장", "윤대리", "한부장", "서과장"]), 연락처: `010-****-${2200 + i * 13}`, 주소: PLACES[i * 2][1], companyName: CO, 거래처구분: "기본", createdAt: admin.firestore.Timestamp.now() });
}
for (const [i, [n, a]] of PLACES.entries()) {
  await db.doc(`places/demo-p${i}`).set({ 업체명: n, 주소: a, 담당자: "", 담당자번호: "", companyName: CO });
}

// ---------- 기사 ----------
const DRIVERS = [
  ["박정훈", "경기90사4127", "11톤", "윙바디", 37.3, 127.0], ["이민수", "경기82아7712", "5톤", "냉장탑", 36.12, 128.11], ["최용석", "충북80바2031", "5톤", "카고", 35.95, 128.45],
  ["윤재호", "충남91자5560", "25톤", "카고", 36.95, 126.75], ["한상우", "경기87배0918", "2.5톤", "냉동탑", 35.19, 126.81], ["오세민", "서울83사3349", "1톤", "탑", 36.6, 127.3],
  ["서준혁", "경북81마6620", "5톤", "카고", 36.78, 127.0], ["임태경", "강원80아1482", "5톤", "냉장탑", 37.5, 128.4], ["정해진", "전남90바7745", "11톤", "카고", 35.2, 128.9],
  ["김태호", "인천97아5520", "11톤", "윙바디", 37.48, 126.7], ["노승철", "경기91바1186", "11톤", "윙바디", 37.0, 127.1], ["강민석", "경남88사2207", "3.5톤", "탑", 35.5, 128.7],
];
for (const [i, [name, plate, ton, kind, lat, lng]] of DRIVERS.entries()) {
  await db.doc(`drivers/demo-d${i}`).set({ 이름: name, name, 차량번호: plate, 차량톤수: ton, 톤수: ton, 차량종류: kind, 전화번호: `010-****-${3100 + i * 17}`, companyName: CO, 구분: i < 8 ? "지입" : "용차", type: i < 8 ? "fleet" : "spot", approved: true, location: { lat, lng }, 위치갱신일시: admin.firestore.Timestamp.now(), status: pick(["운송중", "운송중", "상차중", "대기"]) });
}

// ---------- 오더 ----------
const LANES = [
  [0, 1, 0, "11톤", "윙바디", 620000, 540000], [2, 3, 1, "5톤", "냉장탑", 780000, 680000], [4, 5, 2, "5톤", "카고", 560000, 480000],
  [6, 7, 3, "25톤", "카고", 1250000, 1080000], [8, 9, 4, "2.5톤", "냉동탑", 520000, 450000], [10, 11, 5, "1톤", "탑", 240000, 200000],
  [1, 12, 0, "11톤", "윙바디", 690000, 600000], [13, 14, 6, "5톤", "카고", 430000, 370000], [15, 16, 1, "3.5톤", "탑", 330000, 285000],
  [4, 17, 2, "5톤", "냉장탑", 480000, 410000], [7, 18, 3, "11톤", "카고", 610000, 530000], [3, 19, 7, "1톤", "탑", 150000, 125000],
  [16, 1, 8, "5톤", "카고", 350000, 300000], [11, 0, 9, "2.5톤", "카고", 410000, 350000],
];
const CARGO = ["파레트 14P", "냉동식품 10P", "전자부품 8P", "의약품 6P", "화학원료 드럼 40", "가구 혼적", "수산물 박스 320", "잡화 12P"];
const batch0 = [];
let seq = 0;
async function addOrder(date, i, statusBias) {
  const L = LANES[i % LANES.length];
  const [s, h, c, ton, kind, bill0, pay0] = L;
  const v = 1 + (rnd() - 0.5) * 0.12;
  const bill = Math.round((bill0 * v) / 10000) * 10000;
  const pay = Math.round((pay0 * v) / 10000) * 10000;
  const hour = 6 + Math.floor(rnd() * 11);
  const unassigned = statusBias && rnd() < 0.07;
  const d = DRIVERS.find((x) => x[2] === ton) || pick(DRIVERS);
  const staff = pick(["김도윤", "이서연", "박지훈", "정하늘"]);
  seq += 1;
  const doc = {
    순번: String(seq), 등록일: date, 거래처명: CLIENTS[c], 상차지명: PLACES[s][0], 상차지주소: PLACES[s][1], 하차지명: PLACES[h][0], 하차지주소: PLACES[h][1],
    경유상차목록: [], 경유하차목록: [], 화물내용: pick(CARGO), 화물타입: "파레트", 톤수타입: "톤", 운행유형: "편도", 차량종류: kind, 차량톤수: ton,
    차량번호: unassigned ? "" : d[1], 이름: unassigned ? "" : d[0], 전화번호: unassigned ? "" : `010-****-${4000 + seq % 900}`,
    상차방법: pick(["지게차", "수작업", "지게차"]), 하차방법: pick(["지게차", "수작업"]), 상차일: date, 상차시간: `${pad(hour)}:${pick(["00", "30"])}`,
    하차일: date, 하차시간: `${pad(Math.min(hour + 5, 22))}:00`, 청구운임: String(bill), 기사운임: unassigned ? "" : String(pay), 수수료: "",
    지급방식: pick(["계산서", "계산서", "계좌이체"]), 배차방식: pick(["직접배차", "24시", "인성"]), 메모: "", 메모중요도: "NORMAL", 전달사항: "",
    배차상태: unassigned ? "배차중" : "배차완료", 독차: false, 혼적: false, 긴급: unassigned && rnd() < 0.5, 작성자: staff, 담당자: staff, 등록자: staff,
    companyName: CO, createdAt: admin.firestore.Timestamp.fromDate(new Date(`${date}T0${Math.floor(rnd() * 9)}:10:00+09:00`)),
  };
  batch0.push(doc);
}
for (let k = -40; k <= 1; k++) {
  const date = dayOff(k);
  const wd = new Date(date).getDay();
  const n = k === 0 ? 128 : wd === 0 ? 8 : wd === 6 ? 22 : 40 + Math.floor(rnd() * 20);
  for (let i = 0; i < n; i++) await addOrder(date, Math.floor(rnd() * 100), k >= 0);
}
for (let i = 0; i < batch0.length; i += 400) {
  const b = db.batch();
  batch0.slice(i, i + 400).forEach((d, j) => b.set(db.doc(`orders/demo-o${i + j}`), d));
  await b.commit();
}
console.log("users", Object.keys(uids).length, "orders", batch0.length);
console.log(JSON.stringify(uids));
process.exit(0);
