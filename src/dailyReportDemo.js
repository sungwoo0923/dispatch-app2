// ======================= src/dailyReportDemo.js =======================
// 🧪 개발 전용 — /preview?demo=1 에서 일일 경영 보고 화면을 점검할 가짜 데이터(최근 75일 오더·차량·직원·근태·자금)
//  화면(DailyReport.jsx)이 import.meta.env.DEV && isDemoOn() 일 때만 부른다. 같은 날이면 늘 같은 숫자(고정 난수).
import { addDay, dowOf, isBizDay, kstToday } from "./dailyReportCore";

function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const TOP = [["한빛물산", 0.146, 14.8], ["대성로지스", 0.125, 13.9], ["세원유통", 0.105, 15.2], ["미래식품", 0.095, 12.6], ["동방제지", 0.077, 7.4], ["그린팜", 0.067, 16.1], ["오성철강", 0.057, 6.1], ["해든리테일", 0.05, 13]];
const OTHERS = Array.from({ length: 31 }, (_, i) => `거래처${String(i + 1).padStart(2, "0")}`);
const PLACES = ["평택", "인천항", "화성", "부산신항", "안산", "이천", "김포", "용인", "김해", "광주(경기)", "천안", "아산"];
const ROUTES = [["평택", "이천", 12], ["인천항", "김포", 9], ["화성", "용인", 8], ["부산신항", "김해", 6], ["안산", "광주(경기)", 5]];
const NAMES = ["김도윤", "이서진", "박지훈", "최유나", "정민호", "한소희", "오세훈", "윤가람", "장하늘", "임채원", "강민석", "조은비", "신동욱", "권나래", "황보람", "송지아", "유재석", "문가영", "배수지", "남궁민"];

let cache = null;
export function dailyReportDemo(company = "테스트운송") {
  const today = kstToday();
  if (cache && cache.today === today && cache.company === company) return cache;
  const r = rng(Number(today.replace(/-/g, "")) % 100000 + 7);
  // 차량(지입 24 · 직영 8 · 임대 6)
  const drivers = [];
  [["지입", 24], ["직영", 8], ["임대", 6]].forEach(([g, n], gi) => { for (let i = 0; i < n; i++) drivers.push({ id: `bd-drv-${gi}-${i}`, 등급: g, 이름: NAMES[(gi * 7 + i) % NAMES.length], 차량번호: `경기${80 + gi}바${1000 + i * 37}`, companyName: company, care: i === 3 && g === "지입" ? { dates: { cargoInsurance: addDay(today, 5) } } : i === 1 && g === "직영" ? { dates: { inspection: addDay(today, 12) } } : {} }); });
  const fleetPlates = drivers.map((d) => d.차량번호);
  const rows = [];
  const start = addDay(today, -75);
  let oid = 0;
  for (let d = start; d < addDay(today, 2); d = addDay(d, 1)) {
    const w = dowOf(d);
    const biz = isBizDay(d);
    const base = biz ? 1080 + r() * 190 : w === 6 ? 380 + r() * 80 : 140 + r() * 40; // 만원
    const target = (d === addDay(today, -1) && biz ? 1248 : base) * 1e4;
    const n = Math.max(3, Math.round(target / 143000));
    const mg = biz ? 0.12 + r() * 0.016 : 0.105 + r() * 0.012;
    const future = d >= today;
    for (let i = 0; i < n; i++) {
      const x = r();
      let acc = 0; let cl = null; let cm = mg * 100;
      for (const [nm, share, m] of TOP) { acc += share; if (x < acc) { cl = nm; cm = m; break; } }
      if (!cl) cl = OTHERS[Math.floor(r() * OTHERS.length)];
      const sale = Math.round((target / n) * (0.7 + r() * 0.6) / 1000) * 1000;
      const m = (cm / 100) * (0.85 + r() * 0.3);
      const low = (cl === "오성철강" || cl === "동방제지") && r() < 0.35;
      const drv = Math.round(sale * (1 - (low ? 0.035 : m)) / 1000) * 1000;
      const rt = r() < 0.45 ? ROUTES[Math.floor(r() * ROUTES.length)] : [PLACES[Math.floor(r() * PLACES.length)], PLACES[Math.floor(r() * PLACES.length)]];
      const cancel = r() < 0.03;
      const unassigned = future ? r() < 0.25 : d === addDay(today, -1) && i < 2;
      const plate = unassigned ? "" : r() < 0.82 ? fleetPlates[Math.floor(r() * 34)] : `서울${10 + Math.floor(r() * 80)}사${1000 + Math.floor(r() * 8000)}`;
      oid += 1;
      rows.push({ _id: `bd-o-${oid}`, __col: "orders", companyName: company, 상차일: d, 거래처명: cl, 상차지명: rt[0], 하차지명: rt[1], 청구운임: sale, 기사운임: drv, 차량번호: plate, 차량톤수: ["11톤", "5톤", "2.5톤"][oid % 3], 차량종류: ["윙바디", "카고", "탑"][oid % 3], 배차상태: cancel ? "배차취소" : unassigned ? "배차중" : "배차완료", 상차시간: `0${5 + (oid % 4)}:${oid % 2 ? "12" : "30"}` });
    }
  }
  // 사무직 직원 20명 · 근태
  const people = NAMES.map((n, i) => ({ uid: i === 0 ? "preview" : `bd-st-${i}`, name: i === 0 ? "김대표" : n, position: i === 0 ? "대표이사" : i === 1 ? "상무" : i === 2 ? "이사" : i === 3 ? "팀장" : ["대리", "사원", "과장"][i % 3], team: i < 3 ? "임원" : ["배차팀", "정산팀", "영업팀", "경리팀"][i % 4], role: i === 0 ? "admin" : "user", email: `${i === 0 ? "ceo" : `staff${i}`}@test-unsong.co.kr`, workStartTime: "09:00", companyName: company, approved: true, employmentStatus: "재직", hireDate: i === 4 ? addDay(today, -3) : "2023-03-02" }));
  const attendance = {};
  for (let k = 0; k <= 20; k++) {
    const d = addDay(today, -k);
    if (!isBizDay(d)) { attendance[d] = []; continue; }
    attendance[d] = people.slice(0, 18).map((p, i) => ({ uid: p.uid, date: d, status: i === 16 || i === 17 ? "연차" : i === 15 ? "외근" : "출근", checkInTime: `${d}T0${i === 5 ? 9 : 8}:${i === 5 ? "24" : String(30 + (i % 25)).padStart(2, "0")}:00` }));
  }
  // 자금 — 최근 수입·지출 장부 · 고정비 · 미수 수금
  const ledger = [];
  for (let k = 1; k <= 12; k++) {
    const d = addDay(today, -k);
    if (!isBizDay(d)) continue;
    ledger.push({ date: d, type: "수입", amount: Math.round((1000 + r() * 150) * 1e4) });
    ledger.push({ date: d, type: "지출", amount: Math.round((860 + r() * 120 + (k === 4 ? 300 : 0)) * 1e4) });
  }
  const dueDay = (n) => Number(addDay(today, n).slice(8, 10));
  const recurring = [
    { id: "bd-rc-1", type: "지출", name: "지입 기사 운송료 지급", amount: 42800000, day: dueDay(0), active: true },
    { id: "bd-rc-2", type: "지출", name: "유류 카드 대금", amount: 6200000, day: dueDay(0), active: true },
    { id: "bd-rc-3", type: "지출", name: "임대차량 리스료", amount: 5400000, day: dueDay(4), active: true },
  ];
  const arPayments = {};
  const inv = {};
  rows.forEach((o) => { if (o.배차상태 === "배차완료" && o.상차일 < today && o.상차일.slice(0, 4) === today.slice(0, 4)) inv[o.거래처명] = (inv[o.거래처명] || 0) + o.청구운임; });
  const OWE = { 오성철강: 14200000, 해든리테일: 9800000, 대성로지스: 7500000 };
  Object.entries(inv).forEach(([c, v]) => { const owe = OWE[c] ?? Math.round(v * (0.08 + r() * 0.1)); arPayments[c] = Math.max(0, v - owe); });
  cache = { today, company, rows, drivers, people, attendance, ledger, recurring, arPayments, approvalsTodo: 4, yearlyTarget: 26000 * 1e4 * 12 };
  return cache;
}
