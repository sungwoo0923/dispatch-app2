// 🧪 개발 전용 — /preview?demo=1&role=exec 에서 경영 분석 · 결재 대기 · 직원 정보 화면을 점검할 가짜 데이터
//  화면(ExecAnalytics.jsx · ExecStaffInfo.jsx)이 import.meta.env.DEV && isDemoOn() 일 때만 부른다. 같은 날이면 늘 같은 숫자(고정 난수).
//  · 오더 약 13개월(신규 거래처 · 끊긴 거래처 · 단가 오른 노선 · 쉬는 차량 포함) · 장부 12개월 · 결재 · 직원 인사 정보
//  · 자금 계좌·고정비는 일일 경영 보고 데모(dailyReportDemo)와 같은 것을 쓴다
import { addDay, isBizDay, kstToday, dowOf } from "./dailyReportCore";
import { dailyReportDemo } from "./dailyReportDemo";

function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
// [이름, 비중, 수익률%, 시작(며칠 전, 없으면 처음부터), 끝(며칠 전, 없으면 지금까지)]
const CLIENTS = [
  ["한빛물산", 0.15, 14.8], ["대성로지스", 0.12, 13.9], ["세원유통", 0.1, 15.2], ["미래식품", 0.09, 12.6], ["동방제지", 0.07, 7.4], ["그린팜", 0.06, 16.1],
  ["오성철강", 0.06, 5.6], ["해든리테일", 0.05, 13], ["태양케미칼", 0.04, 11.2, null, 95], ["삼호전자", 0.035, 12.4, null, 72], ["누리푸드", 0.03, 10.1, null, 130],
  ["가온물류", 0.04, 13.5, 290], ["바른제약", 0.035, 15.8, 200], ["코리아팩", 0.03, 9.2, 120], ["새한건자재", 0.025, 8.1, 70], ["하나유업", 0.02, 14.2, 35], ["대웅기계", 0.015, 12.1, 12],
];
const ADDR = { 평택: "경기도 평택시 포승읍", 이천: "경기도 이천시 마장면", 인천항: "인천광역시 중구 항동", 김포: "경기도 김포시 고촌읍", 화성: "경기도 화성시 남양읍", 용인: "경기도 용인시 처인구", 부산신항: "부산광역시 강서구 성북동", 김해: "경상남도 김해시 한림면", 안산: "경기도 안산시 단원구", 광주: "경기도 광주시 오포읍", 천안: "충청남도 천안시 서북구", 아산: "충청남도 아산시 둔포면", 청주: "충청북도 청주시 흥덕구", 대구: "대구광역시 달서구 성서동" };
const PL = Object.keys(ADDR);
const CLIENT_ROUTES = { 한빛물산: [["평택", "이천"], ["평택", "용인"]], 대성로지스: [["인천항", "김포"], ["인천항", "안산"]], 세원유통: [["화성", "용인"], ["이천", "광주"]], 미래식품: [["천안", "평택"], ["아산", "화성"]], 동방제지: [["청주", "이천"]], 그린팜: [["이천", "김포"]], 오성철강: [["부산신항", "김해"], ["대구", "김해"]], 해든리테일: [["안산", "광주"]] };
const DISP = ["이서진", "박지훈", "최유나", "정민호", "한소희", "오세훈", "윤가람"];

let cache = null;
export function execAnalyticsDemo(company = "테스트운송") {
  const today = kstToday();
  if (cache && cache.today === today && cache.company === company) return cache;
  const base = dailyReportDemo(company);
  const r = rng(Number(today.replace(/-/g, "")) % 100000 + 31);
  const drivers = base.drivers;
  const fleet = drivers.map((d) => d.차량번호);
  // 쉬는 차량: 지입 4대(최근 3주 운행 없음) · 임대 1대(최근 10일)
  const idle = { [fleet[20]]: 22, [fleet[21]]: 26, [fleet[22]]: 40, [fleet[23]]: 18, [fleet[36]]: 10 };
  const rows = [];
  let oid = 0;
  const start = addDay(today, -400);
  for (let d = start; d < addDay(today, 2); d = addDay(d, 1)) {
    const biz = isBizDay(d); const w = dowOf(d);
    const ago = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5);
    const season = 1 + 0.08 * Math.sin((Number(d.slice(5, 7)) / 12) * Math.PI * 2) + (400 - ago) / 400 * 0.12; // 완만한 성장
    const n = Math.round((biz ? 62 + r() * 14 : w === 6 ? 18 : 5) * season);
    const live = CLIENTS.filter((c) => (c[3] == null || ago <= c[3]) && (c[4] == null || ago >= c[4]));
    const tot = live.reduce((s, c) => s + c[1], 0);
    for (let i = 0; i < n; i++) {
      let x = r() * tot; let cl = live[0];
      for (const c of live) { x -= c[1]; if (x <= 0) { cl = c; break; } }
      const [nm, , mg0] = cl;
      const rts = CLIENT_ROUTES[nm];
      const rt = rts && r() < 0.8 ? rts[Math.floor(r() * rts.length)] : [PL[Math.floor(r() * PL.length)], PL[Math.floor(r() * PL.length)]];
      const tr = r(); const ton = tr < 0.6 ? "11톤" : tr < 0.85 ? "5톤" : "2.5톤";
      const tonK = ton === "11톤" ? 1 : ton === "5톤" ? 0.62 : 0.42;
      let sale = Math.round(((380000 + r() * 100000) * tonK) / 1000) * 1000;
      // 최근 6주: 평택→이천 단가 인상(+9%) · 인천항→김포 인하(−7%)
      if (ago <= 42 && rt[0] === "평택" && rt[1] === "이천") sale = Math.round((sale * 1.09) / 1000) * 1000;
      if (ago <= 42 && rt[0] === "인천항" && rt[1] === "김포") sale = Math.round((sale * 0.93) / 1000) * 1000;
      let mg = (mg0 / 100) * (0.85 + r() * 0.3);
      if (nm === "오성철강" && ago <= 60) mg = 0.02 + r() * 0.03; // 최근 마진 악화
      const drv = Math.round((sale * (1 - mg)) / 1000) * 1000;
      const future = d >= today;
      let plate = "";
      if (!(future && r() < 0.3)) {
        if (r() < 0.78) { let p = fleet[Math.floor(r() * fleet.length)]; if (idle[p] && ago <= idle[p]) p = fleet[Math.floor(r() * 20)]; plate = p; }
        else plate = `서울${10 + Math.floor(r() * 80)}사${1000 + Math.floor(r() * 8000)}`;
      }
      oid += 1;
      rows.push({ _id: `ea-o-${oid}`, __col: "orders", companyName: company, 상차일: d, 거래처명: nm, 등록자명: DISP[oid % DISP.length], 상차지명: `${rt[0]} 물류센터`, 하차지명: `${rt[1]} 창고`, 상차지주소: `${ADDR[rt[0]]} 1-${oid % 90}`, 하차지주소: `${ADDR[rt[1]]} 2-${oid % 70}`, 청구운임: sale, 기사운임: drv, 차량번호: plate, 차량톤수: ton, 배차상태: r() < 0.025 ? "배차취소" : plate ? "배차완료" : "배차중" });
    }
  }
  // 장부 12개월 — 운송수입 · 기사운송료(원가, 판관비에서 뺌) · 판관비 계정
  const ledger = [];
  for (let k = 1; k <= 370; k++) {
    const d = addDay(today, -k); if (!isBizDay(d)) continue;
    const day = Number(d.slice(8, 10));
    ledger.push({ date: d, type: "지출", account: "유류비", item: "직영 유류", fundId: "bd-f-5", amount: Math.round((38 + r() * 14) * 1e4) });
    if (k % 3 === 0) ledger.push({ date: d, type: "지출", account: "차량유지비", item: "정비·타이어", fundId: "bd-f-1", amount: Math.round((30 + r() * 40) * 1e4) });
    if (k % 7 === 0) ledger.push({ date: d, type: "지출", account: "복리후생비", item: "식대", fundId: "bd-f-5", amount: Math.round((40 + r() * 20) * 1e4) });
    if (k % 9 === 0) ledger.push({ date: d, type: "지출", account: "접대비", item: "거래처 미팅", fundId: "bd-f-5", amount: Math.round((25 + r() * 30) * 1e4) });
    if (day === 25 || (day >= 23 && day <= 26 && !ledger.some((x) => x.account === "급여·상여" && x.date.slice(0, 7) === d.slice(0, 7)))) { if (!ledger.some((x) => x.account === "급여·상여" && x.date.slice(0, 7) === d.slice(0, 7))) ledger.push({ date: d, type: "지출", account: "급여·상여", item: "사무직 급여", fundId: "bd-f-2", amount: 38400000 }); }
    if (day >= 14 && day <= 16 && !ledger.some((x) => x.account === "임차료" && x.date.slice(0, 7) === d.slice(0, 7))) ledger.push({ date: d, type: "지출", account: "임차료", item: "사무실 임대료", fundId: "bd-f-1", amount: 4400000 });
    if (day >= 9 && day <= 11 && !ledger.some((x) => x.account === "보험료" && x.date.slice(0, 7) === d.slice(0, 7))) ledger.push({ date: d, type: "지출", account: "보험료", item: "4대 보험 · 적재물", fundId: "bd-f-1", amount: 9100000 + Math.round(r() * 8e5) });
    if (day >= 5 && day <= 7 && !ledger.some((x) => x.account === "통신비" && x.date.slice(0, 7) === d.slice(0, 7))) ledger.push({ date: d, type: "지출", account: "통신비", item: "전화·인터넷", fundId: "bd-f-1", amount: 820000 });
    if (day >= 18 && day <= 20 && !ledger.some((x) => x.account === "지급수수료" && x.date.slice(0, 7) === d.slice(0, 7))) ledger.push({ date: d, type: "지출", account: "지급수수료", item: "프로그램·세무", fundId: "bd-f-1", amount: 2600000 });
    ledger.push({ date: d, type: "지출", account: "기사운송료", item: "기사 운송료", fundId: "bd-f-1", amount: Math.round((600 + r() * 90) * 1e4) });
    ledger.push({ date: d, type: "수입", account: "운송수입", item: "운송료 입금", fundId: "bd-f-1", amount: Math.round((720 + r() * 120) * 1e4) });
  }
  // 수금 — 거래처마다 남은 미수(오성철강 · 코리아팩은 오래 밀림)
  const yr = today.slice(0, 4); const inv = {}; const late = {};
  rows.forEach((o) => { if (o.배차상태 !== "배차완료" || o.상차일 >= today || o.상차일.slice(0, 4) !== yr) return; inv[o.거래처명] = (inv[o.거래처명] || 0) + o.청구운임; });
  const LAG = { 오성철강: 78, 코리아팩: 64, 새한건자재: 52, 동방제지: 48, 해든리테일: 41 };
  rows.forEach((o) => { if (o.배차상태 !== "배차완료" || o.상차일 >= today || o.상차일.slice(0, 4) !== yr) return; const lag = LAG[o.거래처명] ?? 32; if (o.상차일 > addDay(today, -lag)) late[o.거래처명] = (late[o.거래처명] || 0) + o.청구운임; });
  const arPayments = Object.fromEntries(Object.entries(inv).map(([c, v]) => [c, Math.max(0, v - (late[c] || 0))]));
  // 결재 — 내 차례 4건 · 다른 결재자 대기 4건
  const ts = (h) => ({ seconds: Math.floor((Date.now() - h * 3600e3) / 1000) });
  const P = base.people;
  const me = { uid: "preview", name: "김대표", position: "대표이사" };
  const sm = { uid: P[1].uid, name: P[1].name, position: "상무" };
  const tl = { uid: P[3].uid, name: P[3].name, position: "팀장" };
  const ap = (id, o) => ({ id, company, docNo: `2026-${String(300 + Number(id.slice(-2))).padStart(4, "0")}`, participants: [o.drafter.uid, ...o.line.map((x) => x.uid)], drafterUid: o.drafter.uid, status: "pending", ...o, createdAt: ts(o.h), updatedAt: ts(o.h / 2) });
  const L = (step, ...ppl) => ppl.map((p, i) => ({ ...p, kind: "결재", status: i < step ? "approved" : i === step ? "pending" : "wait" }));
  const approvals = [
    ap("ea-ap-01", { cat: "expense", form: "expense", formLabel: "지출결의서", title: "11월 지입차 타이어 교체(6대)", summary: "지입 6대 타이어 교체 · 협력 정비소", amount: 8640000, drafter: { uid: P[9].uid, name: P[9].name }, line: L(2, tl, sm, me), step: 2, h: 52 }),
    ap("ea-ap-02", { cat: "expense", form: "purchase", formLabel: "구매품의서", title: "배차팀 모니터 4대 구매", summary: "27인치 모니터 4대", amount: 1360000, drafter: { uid: P[5].uid, name: P[5].name }, line: L(1, tl, me), step: 1, h: 20 }),
    ap("ea-ap-03", { cat: "report", form: "rate", formLabel: "운임 변경", title: "오성철강 부산신항→김해 운임 인상 요청", summary: "11톤 기준 +6% 인상 협의안", amount: 0, drafter: { uid: P[6].uid, name: P[6].name }, line: L(1, sm, me), step: 1, h: 76 }),
    ap("ea-ap-04", { cat: "leave", form: "annual", formLabel: "휴가신청서", title: "연차 신청(2일)", summary: "연차 2일", amount: 0, days: 2, data: { kind: "연차", period: { start: addDay(today, 13), end: addDay(today, 14) } }, drafter: { uid: P[2].uid, name: P[2].name }, line: L(0, me), step: 0, h: 5 }),
    ap("ea-ap-05", { cat: "expense", form: "expense", formLabel: "지출결의서", title: "적재물 보험 갱신(연납)", summary: "적재물 배상 보험 1년", amount: 14200000, drafter: { uid: P[12].uid, name: P[12].name }, line: L(0, sm, me), step: 0, h: 30 }),
    ap("ea-ap-06", { cat: "expense", form: "expense", formLabel: "지출결의서", title: "거래처 미팅 식대", summary: "대성로지스 미팅", amount: 286000, drafter: { uid: P[7].uid, name: P[7].name }, line: L(0, tl, me), step: 0, h: 98 }),
    ap("ea-ap-07", { cat: "report", form: "draft", formLabel: "업무 기안", title: "천안 신규 거점 임차 검토", summary: "월 임차료 380만원 · 3년 계약안", amount: 45600000, drafter: { uid: P[3].uid, name: P[3].name }, line: L(0, sm, me), step: 0, h: 140 }),
    ap("ea-ap-08", { cat: "leave", form: "half", formLabel: "반차신청서", title: "오후 반차", summary: "오후 반차", amount: 0, data: { date: addDay(today, 2), ampm: "오후반차" }, drafter: { uid: P[8].uid, name: P[8].name }, line: L(0, tl), step: 0, h: 3 }),
  ];
  // 연차 사용(올해 승인분) — 직원 정보 잔여 연차용
  P.slice(1).forEach((p, i) => { for (let k = 0; k < (i % 5) + 1; k++) { const s = addDay(today, -20 - k * 37 - i); if (s.slice(0, 4) !== yr) continue; approvals.push({ id: `ea-lv-${i}-${k}`, company, cat: "leave", form: "annual", formLabel: "휴가신청서", title: "연차", status: "approved", drafterUid: p.uid, data: { kind: "연차", period: { start: s, end: s } }, participants: [p.uid], line: [], createdAt: ts(24 * (20 + k * 37)) }); } });
  // 직원 인사 정보(연락처 · 입사일 · 발령 · 자격 · 서류)
  const HIRE = ["2015-03-02", "2017-06-12", "2018-01-08", "2019-04-01", addDay(today, -3), "2020-09-14", "2021-02-01", "2021-07-19", "2022-03-07", "2022-11-21", "2023-03-02", "2023-08-16", "2024-01-15", "2024-05-20", "2024-10-07", "2025-02-03", "2025-06-09", "2025-09-01", "2026-01-05", "2026-04-13"];
  const people = P.map((p, i) => {
    const hire = HIRE[i] || "2023-03-02";
    const st = i === 13 ? "육아휴직" : i === 19 ? "퇴사" : "재직";
    const hist = [{ date: hire, type: "채용", detail: `${p.team} · ${i < 3 ? p.position : "사원"} · 정규직` }];
    if (i > 0 && i < 12) hist.push({ date: addDay(hire, 730), type: "승진", detail: `${i < 3 ? "이사" : "사원"} → ${p.position}` });
    if (i === 6) hist.push({ date: "2025-07-01", type: "전보(부서 이동)", detail: "영업팀 → 배차팀" });
    if (i === 13) hist.push({ date: "2026-08-01", type: "휴직", detail: "육아휴직 2026.08.01 ~ 2027.07.31" });
    return { ...p, id: p.uid, phone: `010-${String(2100 + i * 137).slice(-4)}-${String(5300 + i * 251).slice(-4)}`, hireDate: hire, employType: i === 17 ? "계약직" : i === 18 ? "수습" : "정규직", employmentStatus: st, leave: st === "육아휴직" ? { type: "육아휴직", from: "2026-08-01", to: "2027-07-31" } : null, resignedAt: st === "퇴사" ? addDay(today, -40) : null, personnelHistory: hist, birthDate: `19${70 + (i % 25)}-0${1 + (i % 9)}-1${i % 9}`, workStartTime: "09:00", workEndTime: "18:00" };
  });
  const resumes = Object.fromEntries(people.map((p, i) => [p.uid, { certificates: i % 3 === 0 ? [{ date: "2016-05-20", name: "물류관리사", issuer: "한국산업인력공단" }, { date: "2014-11-02", name: "1종 대형 운전면허", issuer: "도로교통공단" }] : i % 3 === 1 ? [{ date: "2019-08-30", name: "컴퓨터활용능력 1급", issuer: "대한상공회의소" }] : [] }]));
  const profiles = Object.fromEntries(people.map((p, i) => [p.uid, { hireDate: p.hireDate, onboarding: Object.fromEntries(["contract", "insurance", "idcopy", "bank", "privacy", "security", "account", "equip", "edu"].map((k, j) => [k, !(i === 4 && j > 3) && !(i === 18 && j === 5)])) }]));
  // 근태 — 이번 달 영업일
  const attendance = {};
  for (let k = 0; k <= 31; k++) {
    const d = addDay(today, -k); if (d.slice(0, 7) !== today.slice(0, 7) && k > 0) break;
    if (!isBizDay(d)) continue;
    attendance[d] = people.filter((p) => p.employmentStatus === "재직").map((p, i) => ({ uid: p.uid, date: d, status: (i + k) % 23 === 0 ? "연차" : (i + k) % 17 === 0 ? "외근" : "출근", checkInTime: `${d}T0${(i + k) % 11 === 0 ? 9 : 8}:${(i + k) % 11 === 0 ? "12" : String(30 + (i % 25)).padStart(2, "0")}:00` }));
  }
  const recurring = base.recurring.filter((x) => !/운송료/.test(x.name)).map((x) => (/급여/.test(x.name) ? { ...x, account: "급여·상여", amount: 38400000 } : x));
  const BAL = { "bd-f-1": 268000000, "bd-f-2": 96000000, "bd-f-3": 150000000, "bd-f-6": 200000000 };
  const funds = base.funds.map((f) => (BAL[f.id] ? { ...f, openingDate: addDay(today, -1), openingBalance: BAL[f.id] } : f));
  cache = { today, company, rows, drivers, ledger, recurring, funds, arPayments, approvals, people, resumes, profiles, attendance, me };
  return cache;
}
