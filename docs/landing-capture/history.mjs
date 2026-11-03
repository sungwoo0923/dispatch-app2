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
const DRIVERS = [
  ["박정훈", "경기90사4127", "11톤", "윙바디", 37.3, 127.0], ["이민수", "경기82아7712", "5톤", "냉장탑", 36.12, 128.11], ["최용석", "충북80바2031", "5톤", "카고", 35.95, 128.45],
  ["윤재호", "충남91자5560", "25톤", "카고", 36.95, 126.75], ["한상우", "경기87배0918", "2.5톤", "냉동탑", 35.19, 126.81], ["오세민", "서울83사3349", "1톤", "탑", 36.6, 127.3],
  ["서준혁", "경북81마6620", "5톤", "카고", 36.78, 127.0], ["임태경", "강원80아1482", "5톤", "냉장탑", 37.5, 128.4], ["정해진", "전남90바7745", "11톤", "카고", 35.2, 128.9],
  ["김태호", "인천97아5520", "11톤", "윙바디", 37.48, 126.7], ["노승철", "경기91바1186", "11톤", "윙바디", 37.0, 127.1], ["강민석", "경남88사2207", "3.5톤", "탑", 35.5, 128.7],
];
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
const t0 = new Date("2026-01-02"), t1 = new Date(dayOff(-41));
for (let d = new Date(t0); d <= t1; d.setDate(d.getDate() + 1)) {
  const date = ymd(d); const wd = d.getDay(); const m = d.getMonth();
  const base = 8 + m * 1.6;
  const n = wd === 0 ? 1 : wd === 6 ? 4 : Math.round(base + rnd() * 5);
  for (let i = 0; i < n; i++) await addOrder(date, Math.floor(rnd() * 100), false);
}
seed = 99; seq = 5000;
for (let i = 0; i < batch0.length; i += 450) {
  const b = db.batch();
  batch0.slice(i, i + 450).forEach((d, j) => b.set(db.doc(`orders/demo-h${i + j}`), d));
  await b.commit();
}
console.log("history", batch0.length); process.exit(0);
