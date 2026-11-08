// ======================= functions/seedTestData.mjs =======================
// 🧪 2026-11-08 테스트 회사 가짜 데이터 만들기(순수 함수 · 저장은 functions/seedTestCompany.js)
//  · 개발 둘러보기 데이터(src/devDemoData.js)와 같은 칸 이름 · 같은 값 모양을 쓰고, 날짜는 "지금(한국 시간)" 기준으로 만든다
//    (지난 6개월 · 오늘 · 내일 · 다음 2주). 같은 날 같은 입력이면 같은 결과(문서 번호도 같음 → 몇 번 눌러도 중복 없음).
//  · 모든 문서에 _seed: "test-v1" · companyName(회사) 표시. 회사 칸이 company인 화면(전자결재 · 게시판 · 사내메일 · 메신저 · 수금)은 company도 같이.
//  · 시각 값은 { __ts: ms } 로 두고 저장할 때 Firestore Timestamp로 바꾼다(이 파일은 Firebase를 모른다).
//  · 실제 직원(realUsers)은 이름 · 역할만 빌려 쓴다(결재선 · 받는 사람 · 메신저 방). 실제 직원 문서는 여기서 만들지 않는다.
import { calcPayslipFull, hoursFromAttendance, presetFor } from "./payrollCalcCore.mjs";

export const SEED_TAG = "test-v1";
export const SEED_ALLOWED_COMPANIES = Object.freeze(["테스트운송사"]);
const DAY = 86400000;
const KST = 9 * 3600000;

// ── 날짜(한국 시간) ──
const kstYmd = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ymShift = (ymd, n) => { const d = new Date(`${ymd.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const dow = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const isWeekend = (ymd) => [0, 6].includes(dow(ymd));
const atKst = (ymd, hhmm) => Date.parse(`${ymd}T${hhmm}:00+09:00`);
const ts = (ms) => ({ __ts: Math.round(ms) });
const pad = (n, w = 2) => String(n).padStart(w, "0");
const safeId = (s) => String(s || "").replace(/[/\s#?[\]]/g, "_").slice(0, 80);
const round1000 = (n) => Math.round(n / 1000) * 1000;
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
// 법정공휴일(출근기록 · 급여 계산에서 쉬는 날) · src/attendanceUtils.js KR_NATIONAL_HOLIDAYS와 같은 날짜(2026 ~ 2027)
const KR_HOLIDAYS = new Set(["2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-07-17", "2026-08-15", "2026-08-17",
  "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25", "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13",
  "2027-06-06", "2027-07-17", "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-04", "2027-10-09", "2027-10-11", "2027-12-25", "2027-12-27"]);
const isOffDay = (ymd) => [0, 6].includes(new Date(`${ymd}T00:00:00Z`).getUTCDay()) || KR_HOLIDAYS.has(ymd);

// 같은 입력 → 같은 수(문서마다 고정)
function rngOf(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 국세청 검증식이 맞는 사업자번호(앞 9자리 → 끝자리 계산)
export function bizNoWithCheck(nine) {
  const d = String(nine).replace(/\D/g, "").padStart(9, "0").slice(0, 9);
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * w[i];
  s += Math.floor((Number(d[8]) * 5) / 10);
  const c = (10 - (s % 10)) % 10;
  const all = d + c;
  return `${all.slice(0, 3)}-${all.slice(3, 5)}-${all.slice(5)}`;
}

// ── 기본 목록 ──
//  [거래처명, 주소, 담당자, 연락처, 결제일, 입금 습관(안 받은 달: 몇 달 전)]
const CLIENTS = [
  ["(주)한빛물류센터", "경기도 평택시 포승읍 평택항만길 73", "김도윤", "031-683-4410", "익월 말일", []],
  ["대성유통(주)", "경기도 이천시 마장면 서이천로 578", "이서연", "031-645-2281", "익월 10일", [1, 2]],
  ["미래식품(주)", "충청남도 천안시 서북구 직산읍 4산단로 55", "박지훈", "041-585-7720", "익월 말일", [1]],
  ["동방스틸", "경상남도 김해시 상동면 대감로 120", "최민재", "055-338-1090", "30일", [1, 2, 3, 4]],
  ["새솔가구", "경기도 포천시 가산면 가산로 211", "정하은", "031-542-3307", "익월 25일", []],
  ["청림전자부품(주)", "경기도 화성시 동탄산단8길 15", "한유진", "031-8015-6620", "익월 10일", [1, 2, 3]],
  ["그린팜농산", "전라남도 나주시 왕곡면 혁신산단로 88", "오세훈", "061-337-4402", "익월 말일", [1]],
  ["태양화학(주)", "울산광역시 남구 산업로 412", "윤가람", "052-271-9035", "익월 말일", []],
  ["우리마트 물류센터", "경기도 용인시 처인구 백암면 원삼로 300", "장예린", "031-338-5571", "익월 15일", [1]],
  ["한결제지(주)", "충청북도 청주시 흥덕구 오송읍 오송생명로 190", "임태현", "043-237-8812", "익월 말일", [2]],
];
const BIZ9 = ["124810452", "135860217", "214879033", "301812546", "415872290", "126863105", "409813378", "610819024", "142877631", "317862208"];
// [업체명, 주소, 담당자, 연락처, 지역]
const PLACES = [
  ["평택항 컨테이너터미널", "경기도 평택시 포승읍 평택항만길 73", "강현우", "010-4021-3381", "경기"],
  ["이천 물류센터 B동", "경기도 이천시 마장면 서이천로 578번길 120", "서민아", "010-5530-2219", "경기"],
  ["부산신항 3부두", "부산광역시 강서구 신항남로 200", "문재석", "010-7781-4402", "부산"],
  ["인천공항 화물터미널", "인천광역시 중구 공항동로 296번길 98-30", "배지호", "010-3364-9910", "인천"],
  ["대전 대덕테크노밸리", "대전광역시 유성구 테크노2로 187", "남궁별", "010-6672-1185", "대전"],
  ["광주 하남산단 4번로", "광주광역시 광산구 하남산단4번로 123-45", "조은비", "010-2218-7764", "광주"],
  ["김해 물류단지", "경상남도 김해시 상동면 대감리 15-3", "황보준", "010-9043-5528", "경남"],
  ["화성 동탄 제2공장", "경기도 화성시 동탄산단8길 15-21", "고은성", "010-8851-3307", "경기"],
  ["천안 직산 물류창고", "충청남도 천안시 서북구 직산읍 4산단로 55", "유다인", "010-4410-6623", "충남"],
  ["용인 백암 냉동창고", "경기도 용인시 처인구 백암면 원삼로 300", "신동혁", "010-5592-8810", "경기"],
  ["울산 온산공단 2단지", "울산광역시 울주군 온산읍 산암로 77", "권나래", "010-3381-2256", "울산"],
  ["청주 오송 바이오단지", "충청북도 청주시 흥덕구 오송읍 오송생명로 190", "류시원", "010-6620-4471", "충북"],
  ["수원 권선 유통센터", "경기도 수원시 권선구 산업로 156", "도하린", "010-7713-9025", "경기"],
  ["대구 성서산단 3차", "대구광역시 달서구 성서공단로 230", "송태윤", "010-2054-3318", "대구"],
  ["포천 가산 가구단지", "경기도 포천시 가산면 가산로 211", "안소희", "010-9916-0742", "경기"],
  ["나주 혁신산단 농산물센터", "전라남도 나주시 왕곡면 혁신산단로 88", "변재민", "010-4487-1953", "전남"],
];
const CARGO = ["파렛트 12개 (전자부품)", "냉동식품 3톤", "철근 및 H빔 자재", "가구 소형 20박스", "스티로폼 박스 혼적", "기계부품 3파렛트", "제지 롤 8개", "농산물 박스 120개", "화학 원료 드럼 16개", "음료 파렛트 10개"];
// [차량종류, 톤수, 기본 운임]
const CARS = [["카고", "5톤", 260000], ["윙바디", "11톤", 420000], ["냉동탑", "2.5톤", 210000], ["카고", "1톤", 110000], ["다마스", "0.5톤", 70000], ["윙바디", "25톤", 620000], ["카고", "3.5톤", 180000], ["리프트", "5톤", 280000]];
// [이름, 등급, 차량번호, 전화, 차량 번호(CARS), 세금계산서발행]
const DRIVERS = [
  ["김철수", "지입", "경기99바7001", "010-7101-3001", 0, true], ["이영호", "지입", "경기99바7002", "010-7102-3002", 1, true],
  ["박민준", "지입", "경기99바7003", "010-7103-3003", 2, false], ["최서진", "지입", "경기99바7004", "010-7104-3004", 1, true],
  ["정우성", "지입", "경기99바7005", "010-7105-3005", 0, false], ["한지훈", "지입", "경기99바7006", "010-7106-3006", 5, true],
  ["오상민", "지입", "경기99바7007", "010-7107-3007", 6, false], ["유재석", "지입", "경기99바7008", "010-7108-3008", 7, false],
  ["강동원", "직영", "경기99사7101", "010-7201-3101", 0, false], ["서강준", "직영", "경기99사7102", "010-7202-3102", 1, false],
  ["윤도현", "직영", "경기99사7103", "010-7203-3103", 2, false], ["장기용", "직영", "경기99사7104", "010-7204-3104", 3, false],
  ["임시완", "직영", "경기99사7105", "010-7205-3105", 6, false], ["송중기", "직영", "경기99사7106", "010-7206-3106", 4, false],
  ["조인성", "임대", "경기99아7201", "010-7301-3201", 1, false], ["황정민", "임대", "경기99아7202", "010-7302-3202", 5, false],
  ["류준열", "임대", "경기99아7203", "010-7303-3203", 0, false], ["남궁민", "임대", "경기99아7204", "010-7304-3204", 2, false],
  ["배성우", "일반", "서울99자7301", "010-7401-3301", 3, false], ["문성근", "일반", "서울99자7302", "010-7402-3302", 4, false],
];
// 가짜 직원(로그인 계정 없음 · users 문서만) [번호, 이름, 부서, 직책, 역할, 입사일(몇 달 전), 생년월일, 급여]
const STAFF = [
  ["01", "박서준", "운영팀", "과장", "user", 52, "1987-04-12", { payType: "monthly", baseMonthly: 3600000, positionAllow: 200000, meal: 200000, car: 200000, dependents: 3, children: 1 }],
  ["02", "김하늘", "운송팀", "대리", "user", 30, "1991-08-23", { payType: "monthly", baseMonthly: 3100000, meal: 200000, dependents: 2 }],
  ["03", "이수민", "운송팀", "사원", "user", 9, "1998-01-30", { payType: "monthly", baseMonthly: 2650000, meal: 200000, dependents: 1 }],
  ["04", "최경리", "경리/회계팀", "차장", "test", 70, "1983-11-05", { payType: "monthly", baseMonthly: 4100000, positionAllow: 300000, meal: 200000, dependents: 4, children: 2 }],
  ["05", "정인사", "인사팀", "대리", "hrManager", 26, "1990-06-17", { payType: "monthly", baseMonthly: 3200000, meal: 200000, dependents: 1 }],
  ["06", "한아름", "운영팀", "사원", "user", 4, "2000-03-09", { payType: "hourly", hourlyWage: 12000, meal: 200000, dependents: 1 }],
];
const REAL_PAY = { payType: "monthly", baseMonthly: 3400000, meal: 200000, dependents: 1 };

/**
 * 가짜 데이터 전체를 만든다.
 * @param {{ now?: number, company: string, realUsers?: Array<{uid:string,name?:string,role?:string,team?:string,position?:string,email?:string,hireDate?:string}> }} opt
 * @returns {{ docs: Record<string, Array<{id:string,data:object,createOnly?:boolean,realRef?:boolean}>>, userFill: Array<{uid:string,fields:object}>, meta: object }}
 */
export function buildSeedData({ now = Date.now(), company, realUsers = [] }) {
  if (!SEED_ALLOWED_COMPANIES.includes(company)) throw new Error(`테스트 데이터는 ${SEED_ALLOWED_COMPANIES.join(", ")}에만 만들 수 있어요`);
  const co = company;
  const today = kstYmd(now);
  const curYm = today.slice(0, 7);
  const docs = {};
  const put = (col, id, data, extra = {}) => { (docs[col] ||= []).push({ id, data: { ...data, companyName: co, _seed: SEED_TAG }, ...extra }); };
  const R = rngOf(`${co}|${today}`);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  // ── 사람 ──
  const real = realUsers.filter((u) => u && u.uid).map((u) => ({ uid: u.uid, name: u.name || String(u.email || "").split("@")[0] || "직원", role: u.role || "user", team: u.team || "", position: u.position || "", email: u.email || "", real: true }));
  const fake = STAFF.map(([n, name, team, position, role, monthsAgo, birthDate, pay]) => ({
    uid: `seed_st${n}`, name, team, position, role, email: `seed${n}@test.logisweb.co.kr`, birthDate, pay,
    hireDate: `${ymShift(today, -monthsAgo)}-${pad(1 + (Number(n) * 3) % 27)}`, phone: `010-55${n}-90${n}`,
  }));
  const people = [...real, ...fake];
  const adminReal = real.find((u) => ["admin", "allMgr", "totalMaster"].includes(u.role)) || real[0] || null;
  const boss = adminReal || fake[0];
  const acct = fake[3]; const hr = fake[4];
  const prof = (u) => ({ uid: u.uid, name: u.name, team: u.team || "", position: u.position || "" });

  fake.forEach((u) => put("users", u.uid, {
    uid: u.uid, name: u.name, email: u.email, role: u.role, approved: true, employmentStatus: "재직", team: u.team, position: u.position,
    hireDate: u.hireDate, birthDate: u.birthDate, phone: u.phone, termsAgreed: true, privacyAgreed: true, createdAt: ts(atKst(u.hireDate, "09:00")),
    seedNote: "테스트용 가짜 직원(로그인 계정 없음)",
  }));
  // 실제 직원 · 비어 있는 인사 칸만 채운다(역할 · 승인 · 로그인은 건드리지 않음)
  const userFill = real.map((u, i) => {
    const f = {};
    if (!u.team) f.team = ["운영팀", "운송팀", "경리/회계팀"][i % 3];
    if (!u.position) f.position = ["대리", "과장", "사원"][i % 3];
    const src = realUsers.find((x) => x.uid === u.uid) || {};
    if (!src.hireDate) f.hireDate = `${ymShift(today, -(14 + i * 7))}-0${1 + (i % 9)}`;
    return { uid: u.uid, fields: f };
  }).filter((x) => Object.keys(x.fields).length);

  // ── 거래처 · 상하차지 · 기사 ──
  CLIENTS.forEach(([name, addr, mgr, tel, payDay], i) => put("clients", `seed_cl_${pad(i + 1)}`, {
    id: `seed_cl_${pad(i + 1)}`, 거래처명: name, 주소: addr, 담당자: mgr, 연락처: tel, 이메일: `billing${i + 1}@client.example`,
    사업자번호: bizNoWithCheck(BIZ9[i]), 대표자: ["홍성민", "윤재원", "백승호", "노현정", "차은우"][i % 5], 결제일: payDay, 등급: i < 3 ? "VIP" : "일반",
    contacts: [{ name: mgr, phone: tel, isPrimary: true }], 메모: i === 3 ? "결제 지연 잦음. 월초에 독촉 연락" : "",
  }));
  PLACES.forEach(([name, addr, mgr, tel, region], i) => put("places", `seed_pl_${pad(i + 1)}`, {
    업체명: name, 주소: addr, 담당자: mgr, 담당자번호: tel, 지역: region, contacts: [{ name: mgr, phone: tel, isPrimary: true }, ...(i % 4 === 0 ? [{ name: "야간 담당", phone: `010-90${pad(i)}-11${pad(i)}`, isPrimary: false }] : [])],
    메모: i % 5 === 0 ? "지게차 상차 가능, 도착 30분 전 연락" : "", 점심시작시간: "12:00", 점심종료시간: "13:00",
  }));
  DRIVERS.forEach(([name, grade, plate, tel, ci, taxInv], i) => put("drivers", `seed_drv_${pad(i + 1)}`, {
    이름: name, 차량번호: plate, 전화번호: tel, 차량종류: CARS[ci][0], 차량톤수: CARS[ci][1], 등급: grade,
    ...(taxInv ? { 세금계산서발행: true } : {}), ...(grade === "지입" && i < 3 ? { uid: `seed_drv_${pad(i + 1)}` } : {}),
    거주지: ["경기 평택시", "경기 이천시", "충남 천안시", "인천 서구", "경기 화성시"][i % 5], 등록자: boss.name, createdAt: ts(now - (400 - i * 15) * DAY),
    정산계좌: { bank: ["국민은행", "신한은행", "농협은행", "우리은행"][i % 4], acct: `1002${pad(i + 1, 3)}55${pad(i * 7, 4)}`, holder: name }, seedNote: "테스트용 가짜 기사",
  }));

  // ── 오더(지난 6개월 + 오늘 · 내일 + 다음 2주) ──
  const start = addDays(today, -182);
  let seq = 0;
  const orderRows = [];
  for (let d = start; d <= addDays(today, 14); d = addDays(d, 1)) {
    const off = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
    let n;
    if (off === 0) n = 14; else if (off === 1) n = 10; else if (off > 1) n = isWeekend(d) ? 0 : 2; else n = isWeekend(d) ? (R() < 0.3 ? 1 : 0) : 1 + (R() < 0.6 ? 1 : 0);
    for (let k = 0; k < n; k++) orderRows.push({ d, off, k });
  }
  const openOf = new Map(CLIENTS.map((c, i) => [i, c[5]]));
  const monthsAgo = (ym) => { const [y1, m1] = curYm.split("-").map(Number); const [y2, m2] = ym.split("-").map(Number); return (y1 - y2) * 12 + (m1 - m2); };
  const monthBill = {}; // 거래처 · 달 청구 합계(부분 입금 계산용)
  orderRows.forEach(({ d, off, k }) => {
    seq += 1;
    const id = `seed_ord_${pad(seq, 4)}`;
    const r = rngOf(id);
    const ci = Math.floor(r() * CLIENTS.length);
    const pi = Math.floor(r() * PLACES.length); let di = Math.floor(r() * PLACES.length); if (di === pi) di = (di + 5) % PLACES.length;
    const car = CARS[Math.floor(r() * CARS.length)];
    const fare = round1000(car[2] * (0.85 + r() * 0.6));
    const drvFare = round1000(fare * (0.84 + r() * 0.07));
    const u = r();
    let st;
    if (off < 0) st = u < 0.06 ? "배차취소" : "배차완료";
    else if (off === 0) st = u < 0.5 ? "배차완료" : u < 0.8 ? "배차중" : u < 0.92 ? "승인대기" : "배차취소";
    else if (off === 1) st = u < 0.4 ? "배차완료" : u < 0.85 ? "배차중" : "승인대기";
    else st = u < 0.25 ? "배차완료" : "배차중";
    const pay = r() < 0.75 ? "계산서" : r() < 0.5 ? "선불" : "착불";
    const drvI = st === "승인대기" ? Math.floor(r() * 3) : Math.floor(r() * DRIVERS.length);
    const dv = DRIVERS[drvI];
    const hasCar = st === "배차완료" || st === "승인대기";
    const ym = d.slice(0, 7);
    const ago = monthsAgo(ym);
    const paid = st === "배차완료" && ago >= 1 && !(openOf.get(ci) || []).includes(ago);
    if (st === "배차완료" && ago >= 1) { const key = `${ci}|${ym}`; monthBill[key] = (monthBill[key] || 0) + fare; }
    const hh = 6 + Math.floor(r() * 12);
    const writer = pick(people);
    const created = Math.min(now - 60000, atKst(addDays(d, -1 - Math.floor(r() * 3)), `${pad(9 + Math.floor(r() * 8))}:${pad(Math.floor(r() * 60))}`));
    const data = {
      등록일: kstYmd(created), 상차일: d, 하차일: r() < 0.85 ? d : addDays(d, 1), 상차시간: `${pad(hh)}:${r() < 0.5 ? "00" : "30"}`, 하차시간: r() < 0.5 ? "당일" : `${pad(Math.min(21, hh + 4))}:00`,
      거래처명: CLIENTS[ci][0], 상차지명: PLACES[pi][0], 상차지주소: PLACES[pi][1], 상차지담당자: PLACES[pi][2], 상차지담당자번호: PLACES[pi][3],
      하차지명: PLACES[di][0], 하차지주소: PLACES[di][1], 하차지담당자: PLACES[di][2], 하차지담당자번호: PLACES[di][3],
      경유지_상차: [], 경유지_하차: [], 화물내용: CARGO[Math.floor(r() * CARGO.length)], 차량종류: car[0], 차량톤수: car[1], 톤수: car[1],
      차량번호: hasCar ? dv[2] : "", 이름: hasCar ? dv[0] : "", 전화번호: hasCar ? dv[3] : "",
      배차상태: st, 상태: st === "배차취소" ? "취소" : st, 청구운임: fare, 기사운임: drvFare, 수수료: String(fare - drvFare), 지급방식: pay,
      배차방식: ["직접배차", "24시", "인성", "직접배차"][Math.floor(r() * 4)], 혼적여부: r() < 0.15 ? "혼적" : "독차", 운행유형: "편도",
      메모: r() < 0.2 ? "상차지 도착 전 담당자에게 전화 부탁드립니다" : "", 작성자: writer.email || "", 등록자명: writer.name, 등록기기: "PC",
      createdAt: ts(created), _lastModified: created,
      ...(st === "승인대기" ? { 기사확인상태: "대기" } : {}),
      ...(st === "배차완료" ? { 배차완료일시: Math.min(now - 30000, created + 3600000), 배차확정자: writer.name } : {}),
      ...(st === "배차중" && off === 0 ? { urgentPushSentAt: ts(now) } : {}), // 미배차 임박 알림이 테스트 회사 직원에게 가지 않게
      ...(r() < 0.06 && off >= 0 && st === "배차중" ? { 긴급: true } : {}),
      ...(paid ? { 정산상태: { [ym]: "정산완료" }, 정산일: { [ym]: `${ymShift(d, 1)}-${pad(5 + ci)}` } } : {}),
    };
    put("orders", id, data);
  });

  // ── 고정노선(3개) + 노선 오더(앱이 만드는 번호 fr_{노선}_{날짜}와 같게 → 앱이 다시 만들지 않음) ──
  const routes = [
    { id: "seed_fr_1", name: "평택→수원 데일리", ci: 0, days: ["월", "화", "수", "목", "금"], startTime: "07:00", stops: [0, 12, 7], drv: 0, fc: 230000, fd: 195000, active: true },
    { id: "seed_fr_2", name: "이천 냉동 셔틀", ci: 8, days: ["월", "수", "금"], startTime: "05:30", stops: [1, 9], drv: 2, fc: 210000, fd: 180000, active: true },
    { id: "seed_fr_3", name: "천안 야간 간선", ci: 2, days: ["화", "목"], startTime: "21:30", stops: [8, 4], drv: 9, fc: 380000, fd: 330000, active: false },
  ];
  const genTo = (() => { const a = lastDay(curYm); const b = addDays(today, 14); return a > b ? a : b; })();
  routes.forEach((rt) => {
    const dv = DRIVERS[rt.drv];
    const stops = rt.stops.map((pi, i) => ({ type: i === 0 ? "상차" : i === rt.stops.length - 1 ? "하차" : "경유", name: PLACES[pi][0], addr: PLACES[pi][1], manager: PLACES[pi][2], contact: PLACES[pi][3], time: i === 0 ? rt.startTime : "" }));
    put("fixedRoutes", rt.id, {
      name: rt.name, client: CLIENTS[rt.ci][0], active: rt.active, days: rt.days, startTime: rt.startTime, startDate: addDays(today, -60), endDate: "",
      color: "#2D4C82", autoDispatch: true, autoAccept: false, skipDates: [], driverName: dv[0], carNo: dv[2], phone: dv[3], tonnage: CARS[dv[4]][1], vehicleType: CARS[dv[4]][0],
      fareClient: String(rt.fc), fareDriver: String(rt.fd), payMethod: "계산서", dispatchType: "고정기사", stops, genThrough: rt.active ? genTo : "", createdAt: ts(now - 60 * DAY),
    });
    if (!rt.active) return;
    for (let d = addDays(today, -30); d <= genTo; d = addDays(d, 1)) {
      if (!rt.days.includes(WEEK_KO[dow(d)])) continue;
      const f = stops[0]; const l = stops[stops.length - 1];
      const past = d < today;
      put("orders", `fr_${rt.id}_${d}`, {
        등록일: addDays(d, -1), 상차일: d, 하차일: d, 상차시간: rt.startTime, 하차시간: "당일", 거래처명: CLIENTS[rt.ci][0],
        상차지명: f.name, 상차지주소: f.addr, 상차지담당자: f.manager, 상차지담당자번호: f.contact, 하차지명: l.name, 하차지주소: l.addr, 하차지담당자: l.manager, 하차지담당자번호: l.contact,
        경유지_상차: [], 경유상차목록: [], 경유지_하차: stops.length > 2 ? [{ 업체명: stops[1].name, 주소: stops[1].addr }] : [], 경유하차목록: [], 근무일자목록: [],
        차량톤수: CARS[dv[4]][1], 톤수: CARS[dv[4]][1], 차량종류: CARS[dv[4]][0], 화물내용: "정기 물량", 청구운임: rt.fc, 기사운임: rt.fd, 수수료: String(rt.fc - rt.fd),
        차량번호: dv[2], 이름: dv[0], 전화번호: dv[3], 배차상태: "배차완료", 상태: "배차완료", 배차완료일시: atKst(addDays(d, -1), "18:00"), 배차확정자: "고정노선",
        배차방식: "고정기사", 지급방식: "계산서", 운행유형: "편도", 혼적여부: "독차", 메모: `[고정노선] ${rt.name}`, 고정노선Id: rt.id, 고정노선명: rt.name,
        작성자: "", 등록기기: "고정노선", createdAt: ts(Math.min(now - 60000, atKst(addDays(d, -1), "06:00"))), _lastModified: atKst(addDays(d, -1), "06:00"),
        ...(past && monthsAgo(d.slice(0, 7)) >= 1 && !(openOf.get(rt.ci) || []).includes(monthsAgo(d.slice(0, 7))) ? { 정산상태: { [d.slice(0, 7)]: "정산완료" }, 정산일: { [d.slice(0, 7)]: `${ymShift(d, 1)}-0${5 + (rt.ci % 4)}` } } : {}),
      });
      if (past && monthsAgo(d.slice(0, 7)) >= 1) { const key = `${rt.ci}|${d.slice(0, 7)}`; monthBill[key] = (monthBill[key] || 0) + rt.fc; }
    }
  });

  // ── 고정노선 배차표(시트 주소 없음 · 자동 동기화 안 함) + 그 오더(어제 발주 · 오늘 · 내일 입고) ──
  put("routeBoards", "seed_rb_1", {
    name: "생수 배차표", client: CLIENTS[8][0], dropOffset: 1, sheetUrl: "", autoSync: false,
    groups: [{ name: "1센터", 상차지명: PLACES[9][0], 상차지주소: PLACES[9][1] }, { name: "2센터", 상차지명: PLACES[1][0], 상차지주소: PLACES[1][1] }],
    columns: [{ id: "c1", label: "도착지", kind: "field", field: "하차지명" }, { id: "c2", label: "시군구", kind: "field", field: "하차지주소" }, { id: "c3", label: "0.5L", kind: "qty" }, { id: "c4", label: "2L", kind: "qty" },
      { id: "c5", label: "총계", kind: "sum" }, { id: "c6", label: "차량번호", kind: "field", field: "차량번호" }, { id: "c7", label: "운송업체", kind: "extra" }],
    createdAt: ts(now - 30 * DAY),
  });
  for (let i = 0; i < 12; i++) {
    const day = i % 3 === 0 ? addDays(today, 1) : today;
    const g = i % 2 ? "2센터" : "1센터";
    const gp = i % 2 ? PLACES[1] : PLACES[9];
    const dp = PLACES[(i * 5 + 2) % PLACES.length];
    const dv = DRIVERS[8 + (i % 6)];
    const done = i % 4 !== 3;
    put("orders", `seed_rbo_${pad(i + 1)}`, {
      등록일: addDays(today, -1), 상차일: day, 하차일: day, 입고일: day, 발주일: addDays(today, -1), 배차표Id: "seed_rb_1", 배차표명: "생수 배차표", 배차표묶음: g, 배차표순번: i + 1, 시트줄: i + 5,
      거래처명: CLIENTS[8][0], 상차지명: gp[0], 상차지주소: gp[1], 하차지명: dp[0], 하차지주소: dp[1], 경유지_상차: [], 경유지_하차: [], 품목수량: { "0.5L": 6 + i, "2L": 4 + (i % 3) }, 추가정보: { 운송업체: ["태진물류", "대성운수", "한길로지스", ""][i % 4] },
      차량종류: "카고", 차량톤수: "5톤", 톤수: "5톤", 화물내용: "생수 파렛트", 차량번호: done ? dv[2] : "", 이름: done ? dv[0] : "", 전화번호: done ? dv[3] : "", 배차상태: done ? "배차완료" : "배차중", 상태: done ? "배차완료" : "배차중",
      청구운임: 200000 + i * 10000, 기사운임: 170000 + i * 9000, 수수료: String(30000 + i * 1000), 지급방식: "계산서", 배차방식: "고정", 작성자: "배차표 자동", 등록기기: "배차표", ...(done ? { 배차확정자: boss.name } : { urgentPushSentAt: ts(now) }),
      createdAt: ts(now - DAY), _lastModified: now - DAY,
    });
  }

  // ── 고정거래처(지난 3개월 · 수량 단가) ──
  let fcn = 0;
  for (let k = 0; k < 90; k += 3) {
    const d = addDays(today, -k); if (isWeekend(d)) continue;
    fcn += 1; const r = rngOf(`fc${fcn}`); const dv = DRIVERS[4 + (fcn % 6)];
    const qty = 6 + Math.floor(r() * 30); const drvUnit = 5091; const feeUnit = 909;
    put("fixedClients", `seed_fc_${pad(fcn, 3)}`, {
      id: `seed_fc_${pad(fcn, 3)}`, 날짜: d, 정산완료: k > 35, 거래처명: fcn % 2 ? "그린팜농산" : "새솔가구", 톤수: "1톤", 수량: qty, 차량번호: dv[2], 이름: dv[0], 핸드폰번호: dv[3],
      기사단가: drvUnit, 수수료단가: feeUnit, 수수료기준: "수량", 선결제: qty * 360, 기사운임: drvUnit * qty, 수수료: feeUnit * qty, 실수수료: feeUnit * qty - qty * 360, 청구운임: (drvUnit + feeUnit) * qty, 지급방식: "착불",
    });
  }

  // ── 단가표 ──
  const TON = ["다마스/라보", "1톤", "1.4톤", "2.5톤", "3.5톤", "3.5톤광폭", "5톤", "5톤축", "5톤플축", "8톤", "11톤", "11톤축", "15톤", "18톤", "25톤"];
  [["평택항 기준", "경기도 평택시 포승읍 평택항만길 73", [12, 1, 4, 7, 2]], ["이천 물류센터 기준", "경기도 이천시 마장면 서이천로 578", [3, 13, 10, 6, 15]]].forEach(([base, addr, dests], si) => {
    const cols = TON.map((label, i) => ({ id: `c${si}${pad(i)}`, label, isDefault: true }));
    const rows = dests.map((pi, j) => {
      const p = PLACES[pi] || PLACES[j];
      const factor = 1 + j * 0.18;
      const prices = {};
      [["1톤", 110000], ["2.5톤", 190000], ["5톤", 270000], ["11톤", 430000], ["25톤", 640000], ["다마스/라보", 70000]].forEach(([l, v]) => { const c = cols.find((x) => x.label === l); prices[c.id] = round1000(v * factor); });
      return { id: `r${si}${j}`, name: p[0], address: p[1], prices };
    });
    put("multiRateSheets", `seed_rate_${si + 1}`, { baseName: base, baseAddress: addr, note: "부가세 별도 · 대기 1시간 초과 시 시간당 2만원", columns: cols, rows, createdAt: ts(now - 40 * DAY), updatedAt: ts(now - (5 + si) * DAY) });
  });

  // ── 정산: 거래명세서 단계 · 미수금 메모 · 부분 입금 · 발송 기록 ──
  const lastYm = ymShift(today, -1);
  const by = (boss.email || "seed@test.logisweb.co.kr");
  const hist = (stages) => stages.map(([s, daysAgo]) => ({ stage: s, at: now - daysAgo * DAY, by }));
  [[0, "발송", [["작성", 6], ["발송", 5]]], [5, "계산서요청", [["작성", 6], ["발송", 6], ["확인", 4], ["계산서요청", 2]]], [6, "확인", [["작성", 5], ["발송", 5], ["확인", 1]]],
    [7, "마감", [["작성", 7], ["발송", 7], ["확인", 6], ["계산서요청", 6], ["계산서발행", 5], ["마감", 3]]], [1, "작성", [["작성", 1]]], [8, "계산서발행", [["작성", 6], ["발송", 6], ["확인", 5], ["계산서요청", 4], ["계산서발행", 2]]]]
    .forEach(([ci, stage, h]) => put("arDesk", `seed_ar_st_${ci}`, { kind: "stmt", client: CLIENTS[ci][0], yyyymm: lastYm, biz: co, stage, history: hist(h), updatedAt: ts(now - h[h.length - 1][1] * DAY) }));
  put("arDesk", "seed_ar_cn_3", { kind: "client", biz: co, client: CLIENTS[3][0], status: "추심", memo: "자재팀 결재 지연, 담당 과장과 통화함", expectDate: addDays(today, 9), nextAction: "독촉 메일 2차", nextDate: addDays(today, 2),
    log: [{ type: "call", text: "담당 과장 통화, 이번 달 말 처리 약속", at: now - 12 * DAY, by }, { type: "memo", text: "결재 라인 바뀜(본부장 승인 필요)", at: now - 4 * DAY, by }], updatedAt: ts(now - 4 * DAY) });
  put("arDesk", "seed_ar_cn_1", { kind: "client", biz: co, client: CLIENTS[1][0], memo: "분할 입금 중", expectDate: addDays(today, 5), nextAction: "잔액 확인 전화", nextDate: addDays(today, 1),
    log: [{ type: "promise", text: "다음 주 잔액 입금 약속", at: now - 6 * DAY, by }], updatedAt: ts(now - 6 * DAY) });
  let apn = 0;
  CLIENTS.forEach(([name], ci) => {
    const open = (openOf.get(ci) || []).slice().sort((a, b) => b - a);
    if (!open.length) return;
    const oldest = ymShift(today, -open[0]);
    const billed = Math.round((monthBill[`${ci}|${oldest}`] || 0) * 1.1);
    if (!billed) return;
    apn += 1;
    const dd = addDays(today, -(8 + apn * 3));
    put("arPayments", `seed_arp_${pad(apn)}`, { company: co, client: name, yyyymm: oldest, amount: round1000(billed * (0.3 + (ci % 3) * 0.15)), full: false, depositName: name.replace(/\(주\)|주식회사/g, "").slice(0, 6), depositDate: dd, at: ts(atKst(dd, "14:20")), by });
  });
  [[0, "거래명세서", "success", 5], [3, "미수금", "success", 15], [1, "미수금", "success", 8], [5, "거래명세서", "fail", 2]].forEach(([ci, type, status, d], i) => put("emailLogs", `seed_el_${i + 1}`, {
    type, client: CLIENTS[ci][0], to: `billing${ci + 1}@client.example`, subject: type === "거래명세서" ? `[거래명세서] ${CLIENTS[ci][0]} ${lastYm}` : `[미수금현황] ${CLIENTS[ci][0]}`, status, sentAt: now - d * DAY, sentBy: by,
  }));

  // ── 자금: 통장 · 현금 · 카드 · 대출, 장부, 고정비 ──
  const fundStart = `${ymShift(today, -6)}-01`;
  put("acctFunds", "seed_fund_bank", { kind: "보통예금", name: "운영 통장", bank: "IBK기업은행", number: "01012345678901", holder: co, payType: "", linkFundId: "", openingBalance: 48000000, openingDate: fundStart, checks: [], active: true, createdAt: ts(now - 190 * DAY) });
  put("acctFunds", "seed_fund_cash", { kind: "현금", name: "사무실 금고", bank: "", number: "", holder: "", payType: "", linkFundId: "", openingBalance: 1200000, openingDate: fundStart, checks: [], active: true, createdAt: ts(now - 190 * DAY) });
  put("acctFunds", "seed_fund_card", { kind: "법인카드", name: "법인카드(신한)", bank: "신한카드", number: "4518000011112222", holder: co, payType: "신용", linkFundId: "", openingBalance: 10000000, openingDate: fundStart, checks: [], active: true, createdAt: ts(now - 190 * DAY) });
  put("acctFunds", "seed_fund_loan", { kind: "대출", name: "운영자금 대출", bank: "KB국민은행", number: "99900011122233", holder: co, payType: "", linkFundId: "", openingBalance: 30000000, openingDate: fundStart, checks: [{ date: addDays(today, -20), balance: 27500000, at: now - 20 * DAY, by }], active: true, createdAt: ts(now - 190 * DAY) });
  const RECUR = [["사무실 임대료", "임차료", 2200000, "25", "자동이체", "(주)평택빌딩", "seed_fund_bank"], ["인터넷 · 전화", "통신비", 165000, "20", "자동이체", "KT", "seed_fund_bank"], ["화물 적재물 보험", "보험료", 480000, "10", "자동이체", "삼정화재", "seed_fund_bank"], ["배차 프로그램 이용료", "지급수수료", 99000, "5", "법인카드", "로지스웹", "seed_fund_card"], ["정수기 렌탈", "복리후생비", 33000, "15", "자동이체", "청호나이스", "seed_fund_bank"]];
  RECUR.forEach(([name, account, amount, day, method, vendor, fundId], i) => put("acctRecurring", `seed_rc_${i + 1}`, { type: "지출", name, account, amount, day, method, vendor, fundId, active: true, createdAt: ts(now - 170 * DAY) }));
  let ln = 0;
  const led = (date, type, account, item, amount, method, vendor, fundId, extra = {}) => { ln += 1; put("acctLedger", `seed_led_${pad(ln, 3)}`, { date, type, account, fundId, item, amount: round1000(amount) || amount, method, vendor, memo: "", evidence: method === "법인카드" ? "카드전표" : "", receipt: "", createdAt: ts(atKst(date, "17:00")), createdBy: by, ...extra }); };
  for (let m = 5; m >= 0; m--) {
    const ym = ymShift(today, -m);
    const lim = m === 0 ? today : lastDay(ym);
    const inDay = (dd) => { const s = `${ym}-${pad(dd)}`; return s <= lim ? s : null; };
    RECUR.forEach(([name, account, amount, day, method, vendor, fundId], i) => { const dd = inDay(Number(day)); if (dd) put("acctLedger", `seed_led_rc${i + 1}_${ym}`, { date: dd, type: "지출", account, item: name, amount, method, fundId, vendor, memo: "고정비 자동 반영", evidence: "", receipt: "", recurId: `seed_rc_${i + 1}`, createdAt: ts(atKst(dd, "09:00")), createdBy: by }); });
    [[8, 16500000], [18, 12800000], [27, 9400000]].forEach(([dd, amt], j) => { const s = inDay(dd); if (s) led(s, "수입", "운송수입", `거래처 운임 입금 ${j + 1}차`, amt * (0.9 + ((m + j) % 4) * 0.06), "계좌이체", CLIENTS[(m + j) % CLIENTS.length][0], "seed_fund_bank"); });
    [[3, "유류비", "주유(법인카드)", 380000, "법인카드", "SK에너지", "seed_fund_card"], [11, "복리후생비", "직원 점심 식대", 214000, "법인카드", "한솥", "seed_fund_card"], [14, "차량유지비", "업무 차량 엔진오일", 128000, "법인카드", "스피드메이트", "seed_fund_card"],
      [10, "급여·상여", "직원 급여 이체", 21800000, "계좌이체", "직원 급여", "seed_fund_bank"], [22, "운반비", "협력 기사 운임 지급", 15600000, "계좌이체", "기사 운임", "seed_fund_bank"], [16, "소모품비", "복사용지 · 토너", 96000, "현금", "오피스디포", "seed_fund_cash"],
      [24, "접대비", "거래처 미팅", 186000, "법인카드", "한식당 모래내", "seed_fund_card"], [28, "세금과공과", "자동차세", 152000, "계좌이체", "평택시청", "seed_fund_bank"]]
      .forEach(([dd, account, item, amt, method, vendor, fundId]) => { const s = inDay(dd); if (s) led(s, "지출", account, item, amt * (0.92 + ((m * 3 + dd) % 5) * 0.04), method, vendor, fundId); });
  }
  [["노트북(배차용)", "IT기기", 2, 1450000, "운영팀", "사용중"], ["사무용 의자", "사무가구", 8, 189000, "사무실", "사용중"], ["복합기", "사무기기", 1, 2300000, "사무실", "수리중"], ["복사용지 A4", "소모품", 6, 25000, "창고", "사용중", 10], ["무전기", "차량·장비", 4, 98000, "운송팀", "보관"], ["모니터 27인치", "IT기기", 5, 289000, "운영팀", "사용중"]]
    .forEach(([name, category, qty, price, location, status, minQty], i) => put("officeAssets", `seed_asset_${i + 1}`, { name, category, qty, unit: category === "소모품" ? "박스" : "개", minQty: minQty || 0, location, holder: i % 2 ? fake[0].name : acct.name, purchaseDate: addDays(today, -(30 + i * 40)), price, vendor: "오피스몰", status, code: `AS-${pad(i + 1, 3)}`, memo: "", photo: "", toLedger: false, history: [{ at: now - (30 + i * 40) * DAY, kind: "등록", n: qty, by }], createdAt: ts(now - (30 + i * 40) * DAY) }));

  // ── 출근기록(지난달 1일 ~ 오늘) · 급여 ──
  const attFrom = `${lastYm}-01`;
  const attOf = {}; // uid → 기록(급여 계산용)
  people.forEach((u, pi) => {
    for (let d = attFrom; d <= today; d = addDays(d, 1)) {
      if (isOffDay(d)) continue;
      if (u.real && d >= today) continue; // 실제 직원은 오늘 기록을 만들지 않는다(직접 출근 처리하는 날)
      if (u.hireDate && d < u.hireDate) continue;
      const r = rngOf(`${u.uid}|${d}`);
      const x = r();
      const leave = x < 0.04;
      const late = !leave && x > 0.94;
      const inT = late ? `09:${pad(10 + Math.floor(r() * 30))}` : `08:${pad(35 + Math.floor(r() * 24))}`;
      const outT = d === today ? null : (r() < 0.18 ? `${20 + Math.floor(r() * 2)}:${pad(Math.floor(r() * 50))}` : `18:${pad(Math.floor(r() * 25))}`);
      const rec = leave
        ? { status: "연차", checkInTime: null, checkOutTime: null }
        : { status: "출근", checkInTime: new Date(atKst(d, inT)).toISOString(), checkOutTime: outT ? new Date(atKst(d, outT)).toISOString() : null, ...(late ? { lateReason: ["교통 체증", "병원 진료 후 출근", "자녀 등원"][pi % 3] } : {}) };
      const data = { uid: u.uid, name: u.name, date: d, month: d.slice(0, 7), source: "seed", ...rec };
      put("attendance", `${d}_${u.uid}`, data, u.real ? { createOnly: true, realRef: true } : {});
      // 급여 계산용 사본 · 시각을 "한국 시간 그대로"(오프셋 없는 글자)로 넣어 서버(UTC)에서도 야간 · 연장 시간이 맞게 계산되게
      (attOf[u.uid] ||= []).push({ ...data, checkInTime: rec.checkInTime ? `${d}T${inT}:00` : null, checkOutTime: rec.checkOutTime ? `${d}T${outT}:00` : null });
    }
  });
  const rates = presetFor(Number(lastYm.slice(0, 4)));
  const slips = [];
  people.forEach((u) => {
    const emp = { employmentType: "정규직", allowances: [], taxRatePct: 100, ...(u.pay || REAL_PAY) };
    put("payrollEmployees", `${safeId(co)}__${u.uid}`, { ...emp, uid: u.uid, name: u.name, payAccount: { bank: "국민은행", acct: `9400${(u.uid.length * 7919) % 100000}${pad(u.name.length, 3)}`, holder: u.name }, memo: "", updatedAt: ts(now - 20 * DAY), updatedBy: by }, u.real ? { createOnly: true, realRef: true } : {});
    if (u.hireDate && u.hireDate > lastDay(lastYm)) return;
    const recs = (attOf[u.uid] || []).filter((a) => a.month === lastYm);
    const a = hoursFromAttendance(recs, isOffDay);
    const result = calcPayslipFull(emp, { ...a, weeklyHolidayHours: emp.payType === "hourly" ? 32 : 0 }, rates);
    slips.push({ u, emp, a, result });
  });
  const payDate = `${curYm}-10`;
  const sum = (f) => slips.reduce((s, x) => s + (f(x.result) || 0), 0);
  const totals = { n: slips.length, gross: sum((x) => x.gross), deduct: sum((x) => x.totalDeduct), net: sum((x) => x.net), employer: sum((x) => x.employer?.total), tax: sum((x) => (x.deductions || []).filter((d) => d.key === "tax" || d.key === "local").reduce((s, d) => s + d.amount, 0)) };
  const paidPast = today >= payDate;
  put("payrollRuns", `${safeId(co)}_${lastYm}`, { ym: lastYm, totals, rates, payDate, status: paidPast ? "paid" : "confirmed", published: true, publishedAt: now - 6 * DAY, publishedBy: by, confirmedAt: now - 7 * DAY, confirmedBy: by, ...(paidPast ? { paidAt: atKst(payDate, "10:00"), paidBy: by } : {}),
    log: [{ at: now - 7 * DAY, action: "확정", by, detail: `${slips.length}명` }, { at: now - 6 * DAY, action: "명세서 발행", by, detail: `${slips.length}건` }, ...(paidPast ? [{ at: atKst(payDate, "10:00"), action: "지급 처리", by, detail: payDate }] : [])], updatedAt: ts(now - 6 * DAY), updatedBy: by }, { createOnly: true });
  slips.forEach(({ u, emp, a, result }) => put("payslips", `${safeId(co)}_${lastYm}_${u.uid}`, {
    ym: lastYm, uid: u.uid, name: u.name, team: u.team || "", position: u.position || "", birthDate: u.birthDate || "", hireDate: u.hireDate || "", phone: u.phone || "", payType: emp.payType, employmentType: emp.employmentType,
    payDate, payAccount: null, input: {}, att: a, result, rates, status: paidPast ? "paid" : "confirmed", published: true, publishedAt: now - 6 * DAY, publishedBy: by, confirmedAt: now - 7 * DAY, confirmedBy: by,
    ...(paidPast ? { paidDate: payDate, paidAt: atKst(payDate, "10:00") } : {}), updatedAt: ts(now - 6 * DAY), updatedBy: by,
  }, u.real ? { createOnly: true, realRef: true, runGuard: `${safeId(co)}_${lastYm}` } : { runGuard: `${safeId(co)}_${lastYm}` }));

  // ── 전자결재(휴가 · 지출결의 · 업무일지 · 기안) ──
  const approver1 = fake[0].uid === boss.uid ? fake[3] : fake[0];
  const line = (st, step, extra = []) => {
    const L = [{ ...prof(approver1), kind: "결재" }, { ...prof(boss), kind: "결재" }, ...extra.map((x) => ({ ...prof(x), kind: "합의" }))];
    return L.map((s, i) => ({ ...s, status: st === "approved" ? "approved" : st === "rejected" && i === step ? "rejected" : i < step ? "approved" : i === step && st === "pending" ? "pending" : "wait", at: i < step || st === "approved" || (st === "rejected" && i === step) ? now - (3 - Math.min(i, 2)) * DAY : 0, comment: st === "rejected" && i === step ? "일정이 겹쳐요. 다른 날로 다시 올려 주세요" : "" }));
  };
  let apc = 0;
  const appr = (drafter, form, cat, formLabel, title, data, { status = "pending", step = 0, amount = 0, days = 0, summary = "", daysAgo = 2, paid = null, extraLine = [] } = {}) => {
    apc += 1;
    const id = `seed_ap_${pad(apc)}`;
    const created = now - daysAgo * DAY;
    const L = line(status, step, extraLine).map((x, i) => (x.at ? { ...x, at: Math.min(now - 60000, created + (i + 1) * 3600000) } : x));
    const code = { annual: "HL", half: "HH", spend: "EX", card: "EC", daily: "RD", draft: "DR", outside: "HO" }[form] || "DR";
    put("approvals", id, {
      company: co, docNo: `${code}-${kstYmd(created).replace(/-/g, "")}-S${pad(apc)}`, cat, form, formLabel, title, summary, amount, days, data, images: [],
      drafterUid: drafter.uid, drafter: prof(drafter), line: L, cc: [{ uid: hr.uid, name: hr.name }], ccUids: [hr.uid], participants: [...new Set([drafter.uid, ...L.map((s) => s.uid), hr.uid])],
      step: status === "approved" ? L.length : step, status, createdAt: ts(created), updatedAt: ts(created + 3600000),
      history: [{ at: created, uid: drafter.uid, name: drafter.name, action: "상신", comment: "" }, ...(status === "approved" ? L.map((s, i) => ({ at: created + (i + 1) * 3600000, uid: s.uid, name: s.name, action: "승인", comment: "" })) : []), ...(status === "rejected" ? [{ at: created + 7200000, uid: L[step].uid, name: L[step].name, action: "반려", comment: L[step].comment }] : [])],
      redraftOf: null, ...(paid ? { paid } : {}),
    });
  };
  const per = (s, e) => ({ start: s, end: e });
  const nextBiz = (n) => { let d = today; let k = 0; while (k < n) { d = addDays(d, 1); if (!isOffDay(d)) k += 1; } return d; };
  const prevBiz = (n) => { let d = today; let k = 0; while (k < n) { d = addDays(d, -1); if (!isOffDay(d)) k += 1; } return d; };
  appr(fake[1], "annual", "leave", "연차휴가", "연차휴가 신청", { kind: "연차", period: per(nextBiz(3), nextBiz(4)), reason: "가족 행사", contact: fake[1].phone }, { status: "pending", step: 0, days: 2, summary: `연차 ${nextBiz(3)} ~ ${nextBiz(4)} (2일)`, daysAgo: 1 });
  appr(fake[2], "annual", "leave", "연차휴가", "연차휴가 신청", { kind: "연차", period: per(nextBiz(6), nextBiz(6)), reason: "병원 진료" }, { status: "pending", step: 1, days: 1, summary: `연차 ${nextBiz(6)} (1일)`, daysAgo: 2 });
  appr(fake[0], "annual", "leave", "연차휴가", "하계휴가 신청", { kind: "하계휴가", period: per(prevBiz(25), prevBiz(23)), reason: "개인 사유" }, { status: "approved", days: 3, summary: `하계휴가 ${prevBiz(25)} ~ ${prevBiz(23)} (3일)`, daysAgo: 32 });
  appr(fake[5], "half", "leave", "반차", "오후 반차 신청", { date: prevBiz(4), ampm: "오후 반차", reason: "병원 진료" }, { status: "approved", days: 0.5, summary: `오후 반차 ${prevBiz(4)}`, daysAgo: 6 });
  appr(fake[2], "annual", "leave", "연차휴가", "연차휴가 신청", { kind: "연차", period: per(prevBiz(1), prevBiz(1)), reason: "개인 사유" }, { status: "rejected", step: 0, days: 1, summary: `연차 ${prevBiz(1)} (1일)`, daysAgo: 5 });
  const spendData = (vendor, memo, total, account, payM, date) => ({ account, pay: payM, lines: [{ date, vendor, memo, supply: String(Math.round(total / 1.1)), vat: String(total - Math.round(total / 1.1)), total: String(total), bank: { bank: "국민은행", acct: "12345678901234", holder: vendor }, note: "" }], reason: memo, date, vendor });
  appr(fake[0], "spend", "expense", "지출결의서", "차량 정비비 지출결의", spendData("스피드메이트 평택점", "업무 차량 브레이크 패드 교체", 385000, "차량유지비", "계좌이체", prevBiz(9)), { status: "approved", amount: 385000, summary: "스피드메이트 평택점 · 차량유지비 · 385,000원", daysAgo: 10, paid: { at: now - 7 * DAY, by: acct.uid, byName: acct.name, date: prevBiz(6), memo: "기업은행 이체" } });
  appr(fake[1], "spend", "expense", "지출결의서", "사무용품 구매 지출결의", spendData("오피스디포", "복사용지 · 토너 · 파일", 168000, "소모품비", "법인카드", prevBiz(3)), { status: "approved", amount: 168000, summary: "오피스디포 · 소모품비 · 168,000원", daysAgo: 4 });
  appr(fake[5], "spend", "expense", "지출결의서", "거래처 접대비 지출결의", spendData("한식당 모래내", "미래식품 담당자 미팅 식대", 246000, "접대비", "개인카드(정산 요청)", prevBiz(1)), { status: "pending", step: adminReal ? 1 : 0, amount: 246000, summary: "한식당 모래내 · 접대비 · 246,000원", daysAgo: 1 });
  appr(fake[2], "card", "expense", "법인카드 사용보고", "법인카드 사용보고", { date: prevBiz(2), cardNo: "2222", amountV: 54000, shop: "GS25 평택항점", account: "복리후생비", people: "운송팀 3명", reason: "야간 배차 간식" }, { status: "approved", amount: 54000, summary: "GS25 평택항점 · 54,000원", daysAgo: 3, paid: { at: now - 1 * DAY, by: acct.uid, byName: acct.name, date: prevBiz(1), memo: "카드 결제" } });
  appr(fake[1], "daily", "report", "일일 업무일지", "일일 업무일지", { date: prevBiz(1), hours: { start: "09:00", end: "18:00" }, done: "· 배차 28건 처리(긴급 2건)\n· 대성유통 운임 협의\n· 미수금 2건 입금 확인", issue: "평택항 상차 대기 1시간", plan: "11톤 윙바디 추가 섭외" }, { status: "approved", summary: `${prevBiz(1)} 업무일지`, daysAgo: 1 });
  appr(fake[0], "draft", "draft", "기안·품의서", "신규 거래처 등록 품의", { body: "한결제지(주) 정기 물량(월 40건) 계약 건으로 거래처 등록과 단가표 적용을 품의합니다.", purpose: "신규 거래처 등록" }, { status: "pending", step: 0, summary: "한결제지(주) 신규 거래처", daysAgo: 0.2 });

  // ── 일정 · 공지 · 게시판 · 인수인계 · 사내메일 · 메신저 ──
  [[fake[1], "휴가", nextBiz(3), nextBiz(4), "가족 행사"], [fake[0], "외근", nextBiz(1), nextBiz(1), "미래식품 천안공장 방문"], [fake[5], "오후반차", prevBiz(4), prevBiz(4), "병원"], [fake[2], "외근", today, today, "평택항 현장 점검"], [fake[3], "휴가", nextBiz(8), nextBiz(9), "개인 사유"]]
    .forEach(([u, type, s, e, memo], i) => put("schedules", `seed_sc_${i + 1}`, { type, name: u.name, authorUid: u.uid, start: s, end: e, memo, approvers: [{ uid: boss.uid, name: boss.name, status: i === 4 ? "pending" : "approved" }], approvalStatus: i === 4 ? "pending" : "approved", createdAt: ts(now - (i + 1) * DAY) }));
  [["연말 물량 증가에 따른 야간 배차 운영 안내", "공지사항", "12월 한 달 동안 야간 배차 담당을 2명으로 늘립니다. 근무표는 인사팀에서 따로 안내드립니다.", 1, true],
    ["차량 정기 점검 일정", "공지사항", "지입 차량 정기 점검은 다음 주 화요일부터 순서대로 진행합니다.", 4, false],
    ["신규 거래처 등록 절차 변경", "업무안내", "신규 거래처는 사업자번호 확인 후 등록해 주세요. 상태 확인 버튼으로 휴업 · 폐업 여부를 꼭 봐 주세요.", 9, false],
    ["사내 건강검진 안내", "공지사항", "올해 건강검진 마감일은 이번 달 말입니다. 아직 받지 않은 분은 서둘러 주세요.", 20, false]]
    .forEach(([title, category, content, d, pinned], i) => put("notices", `seed_nt_${i + 1}`, { title, category, content, contentHtml: `<p>${content}</p>`, audience: "internal", audiences: ["internal"], image: null, teams: [], targetUids: [], targetNames: [], publishAt: 0, pushPending: false, pinned, ...(pinned ? { pinnedAt: now - d * DAY } : {}), author: (i % 2 ? hr : boss).name, authorUid: (i % 2 ? hr : boss).uid, createdAt: ts(now - d * DAY), readBy: [] }));
  [["free", "점심 맛집 추천해 주세요", "평택항 근처 점심 맛집 공유해요. 저는 항구식당 생선구이 추천합니다.", fake[2], 2], ["free", "주말 등산 모임", "이번 토요일 덕유산 가실 분 댓글 남겨 주세요.", fake[0], 6], ["free", "사무실 커피머신 사용법", "캡슐은 오른쪽 서랍에 있어요. 다 쓰면 경리팀에 말해 주세요.", fake[3], 11], ["admin", "11월 운임 인상 협의 현황", "주요 거래처 3곳 운임 인상 협의 진행 중입니다. 결과는 다음 주 공유합니다.", boss, 3], ["admin", "기사 수수료 정산 기준 정리", "지입 기사 수수료 정산은 매월 5일 기준으로 맞춥니다.", fake[0], 14]]
    .forEach(([board, title, content, u, d], i) => put("boardPosts", `seed_bp_${i + 1}`, { company: co, board, title, content, images: [], pinned: i === 3, authorUid: u.uid, authorName: u.name, authorPosition: u.position || "", createdAt: ts(now - d * DAY), updatedAt: ts(now - d * DAY), readBy: [u.uid], comments: i === 0 ? [{ id: "c1", uid: fake[1].uid, name: fake[1].name, text: "저도 거기 좋아요", at: now - (d - 0.5) * DAY }] : [] }));
  [[fake[0], [fake[1], fake[2]], "평택항 야간 상차 건 내일 07시 담당자 김도윤 과장님께 다시 확인 부탁드립니다.", 0], [fake[3], [boss], "지난달 미수금 정리표 공유드립니다. 동방스틸 4개월 미수, 추심 메모 남겨 두었습니다.", 2], [fake[1], [fake[5]], "휴가 중 대성유통 오더 접수는 박서준 과장님께 넘겨 주세요.", 5]]
    .forEach(([from, to, text, d], i) => put("handovers", `seed_ho_${i + 1}`, { text, date: addDays(today, -d), receivers: to.map((u) => ({ uid: u.uid, name: u.name })), receiverUids: to.map((u) => u.uid), receiver: to.map((u) => u.name).join(", "), receiverUid: to[0].uid, author: from.name, authorUid: from.uid, createdAt: ts(now - d * DAY - 3600000), readBy: d > 1 ? to.map((u) => u.uid) : [] }));
  const toAll = people.filter((u) => u.uid !== fake[3].uid);
  [[fake[3], toAll, "[안내] 이번 달 법인카드 영수증 제출 마감", "이번 달 법인카드 영수증은 25일까지 경리팀에 제출해 주세요.", 1, true],
    [fake[0], [boss], "대성유통 운임 협의 결과 보고", "대성유통 11톤 운임은 3% 인상으로 협의했습니다. 다음 달 1일부터 적용 예정입니다.", 0.3, false],
    [hr, toAll.filter((u) => u.uid !== hr.uid), "[인사] 연차 사용 계획 제출 요청", "남은 연차 사용 계획을 이번 주 금요일까지 전자결재로 올려 주세요.", 3, false],
    [fake[1], [fake[0], boss], "평택항 상차 대기 개선 건", "상차 대기 시간이 길어 예약제를 제안드립니다. 첨부 자료는 다음 메일로 드릴게요.", 6, false],
    [boss, people.filter((u) => u.uid !== boss.uid), "연말 워크숍 일정", "연말 워크숍은 12월 셋째 주 금요일로 정했습니다.", 9, false]]
    .forEach(([from, to, subject, body, d, important], i) => put("internalMails", `seed_ml_${i + 1}`, { company: co, fromUid: from.uid, fromEmail: from.email || "", fromName: from.name, subject, body, images: [], kind: "mail", important, status: "sent", at: ts(now - d * DAY), readBy: d > 2 ? to.map((u) => u.uid) : [], deletedBy: [], starredBy: [], to: to.map((u) => u.uid), toNames: to.map((u) => u.name), cc: [], ccNames: [] }));
  const roomMembers = people.slice(0, 8);
  const profiles = Object.fromEntries(roomMembers.map((u) => [u.uid, { name: u.name, photo: "" }]));
  const room1 = { id: "seed_room_ops", type: "group", name: "배차팀 단톡", members: roomMembers.map((u) => u.uid), memberProfiles: profiles, createdBy: fake[0].uid };
  const dmOther = fake[1];
  const room2 = { id: "seed_room_dm", type: "dm", name: "", members: [boss.uid, dmOther.uid], memberProfiles: { [boss.uid]: { name: boss.name, photo: "" }, [dmOther.uid]: { name: dmOther.name, photo: "" } }, createdBy: dmOther.uid };
  const chat = [
    [room1, fake[0], "오늘 평택항 11톤 2대 더 필요합니다", 180], [room1, fake[1], "윙바디 한 대는 이영호 기사님 가능하대요", 170], [room1, fake[2], "나머지 한 대는 24시에 올려 둘게요", 160],
    [room1, fake[0], "좋아요. 상차 07시라 오늘 안에 확정 부탁해요", 150], [room1, fake[5], "천안 직산 하차지 담당자 번호 바뀌었어요 010-4410-6623", 90], [room1, fake[3], "이번 달 기사 운임 지급은 25일 예정입니다", 40],
    [room1, fake[1], "확인했습니다", 35], [room2, dmOther, "과장님, 대성유통 운임 인상 건 메일로 보고드렸어요", 60], [room2, boss, "확인할게요. 고생했어요", 50], [room2, dmOther, "감사합니다. 내일 오전에 거래처 방문 예정입니다", 20],
  ];
  const lastOf = {};
  chat.forEach(([rm, u, text, minAgo], i) => {
    const at = now - minAgo * 60000;
    put("chat_messages", `seed_msg_${pad(i + 1)}`, { roomId: rm.id, text, type: "text", senderUid: u.uid, senderName: u.name, senderPhoto: "", createdAt: ts(at), edited: false, readBy: [u.uid], totalMembers: rm.members.length, memberUids: rm.members, company: co });
    lastOf[rm.id] = { text, at, uid: u.uid };
  });
  [room1, room2].forEach((rm) => {
    const l = lastOf[rm.id];
    const joinedAt = Object.fromEntries(rm.members.map((m) => [m, ts(now - 30 * DAY)]));
    const unread = Object.fromEntries(rm.members.map((m) => [m, m === l.uid ? 0 : chat.filter(([r2, u2, , mins]) => r2.id === rm.id && u2.uid !== m && mins <= 60).length]));
    const { id, ...rest } = rm;
    put("chat_rooms", id, { ...rest, company: co, lastMsg: l.text, lastAt: ts(l.at), lastSenderUid: l.uid, joinedAt, lastRead: Object.fromEntries(rm.members.map((m) => [m, ts(m === l.uid ? l.at : now - 2 * 3600000)])), unreadCount: unread });
  });

  const counts = Object.fromEntries(Object.entries(docs).map(([c, l]) => [c, l.length]));
  return { docs, userFill, meta: { today, company: co, counts, total: Object.values(counts).reduce((s, n) => s + n, 0), fakeUids: fake.map((u) => u.uid), routeIds: routes.map((r) => r.id) } };
}

// 테스트 데이터인지(지울 수 있는지) · 표시가 정확히 같고 회사도 같아야 한다
export function isSeedDoc(data, company) {
  if (!data || typeof data !== "object") return false;
  if (data._seed !== SEED_TAG) return false;
  return String(data.companyName || "") === String(company || "") && SEED_ALLOWED_COMPANIES.includes(String(company || ""));
}
export const SEED_COLLECTIONS = ["users", "clients", "places", "drivers", "orders", "fixedRoutes", "routeBoards", "fixedClients", "multiRateSheets", "arDesk", "arPayments", "emailLogs",
  "acctFunds", "acctRecurring", "acctLedger", "officeAssets", "attendance", "payrollEmployees", "payrollRuns", "payslips", "approvals", "schedules", "notices", "boardPosts",
  "handovers", "internalMails", "chat_rooms", "chat_messages"];
// 절대 건드리지 않는 컬렉션(서버 전용 · 보관함 · 비밀값)
export const SEED_NEVER = new Set(["resetBackups", "resetJobs", "resetLocks", "resetLogs", "adminSecrets", "payrollSecrets", "payrollUnlocks", "payrollPwAttempts", "hubOrders", "hubWallets", "hubLedger", "weatherCache", "companyPlans", "companySettings", "transportApplications"]);
