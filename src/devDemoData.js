// ======================= src/devDemoData.js =======================
// 🧪 개발 전용(import.meta.env.DEV) — 둘러보기(/preview) 화면 점검용 가짜 데이터.
//  URL에 demo=1 이 있을 때만 fsTenant.js가 orders/dispatch/drivers/clients/notices 목록 조회에 이 값을 돌려준다.
//  배포 빌드에서는 fsTenant.js의 import.meta.env.DEV 분기가 통째로 빠져 이 파일도 포함되지 않는다.

export function isDemoOn() {
  try { return new URLSearchParams(window.location.search).get("demo") === "1"; } catch { return false; }
}

const ymd = (off) => {
  const d = new Date(); d.setDate(d.getDate() + off);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const CLIENTS = ["(주)한빛물류센터", "대한통운 평택허브", "삼성전자 기흥캠퍼스 자재팀", "LG디스플레이 파주", "CJ대한통운", "쿠팡 이천2센터", "롯데글로벌로지스 김해", "현대모비스 아산공장 출하장"];
const PLACES = [
  ["평택항 컨테이너터미널", "경기도 평택시 포승읍 평택항만길 73"],
  ["이천 물류센터 B동", "경기도 이천시 마장면 서이천로 578번길 120"],
  ["부산신항 3부두", "부산광역시 강서구 성북동 신항남로 200"],
  ["인천공항 화물터미널", "인천광역시 중구 공항동로 296번길 98-30"],
  ["대전 대덕테크노밸리", "대전광역시 유성구 테크노2로 187"],
  ["광주 하남산단 4번로", "광주광역시 광산구 하남산단4번로 123-45"],
  ["김해 물류단지", "경상남도 김해시 상동면 대감리 산 15-3"],
  ["화성 동탄 산업단지 제2공장", "경기도 화성시 동탄산단8길 15-21 (영천동)"],
];
const CARGO = ["파렛트 12개 (전자부품)", "냉동식품 3톤", "철근 및 H빔 자재 · 길이 6m · 상차 시 지게차 필요", "가구 소형 20박스", "스티로폼 박스 혼적", "기계부품 2파렛트"];
const CARS = [["카고", "5톤"], ["윙바디", "11톤"], ["냉동탑", "2.5톤"], ["라보", "1톤"], ["다마스", "0.5톤"], ["리프트", "25톤"]];
const NAMES = ["김철수", "이영희", "박민준", "최서연", "정우성", "한지민"];

let demoCo = "";
function fakeDoc(col, id, data0) {
  const data = { ...data0, companyName: demoCo };
  const ref = { id, type: "document", path: `${col}/${id}`, parent: { id: col, type: "collection" } };
  return { id, ref, exists: () => true, data: () => ({ ...data }), get: (k) => data[k], metadata: { fromCache: false, hasPendingWrites: false } };
}

function orders(col) {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const [pn, pa] = PLACES[i % PLACES.length];
    const [dn, da] = PLACES[(i * 3 + 2) % PLACES.length];
    const [ct, ton] = CARS[i % CARS.length];
    const done = i % 3 !== 0;
    const day = ymd(i % 4 === 0 ? 1 : i % 7 === 0 ? -1 : 0);
    out.push(fakeDoc(col, `demo-${col}-${i}`, {
      companyName: "", 상차일: day, 하차일: day, 등록일: ymd(-1),
      상차시간: `${String(6 + (i % 12)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, 하차시간: i % 2 ? "당일" : "14:00",
      거래처명: CLIENTS[i % CLIENTS.length], 상차지명: pn, 상차지주소: pa, 하차지명: dn, 하차지주소: da,
      화물내용: CARGO[i % CARGO.length], 차량종류: ct, 차량톤수: ton,
      차량번호: done ? `경기${80 + i}바${1000 + i * 37}` : "", 이름: done ? NAMES[i % NAMES.length] : "", 전화번호: done ? `010-${2000 + i * 11}-${3000 + i * 7}` : "",
      배차상태: done ? "배차완료" : "배차중", 청구운임: 150000 + i * 23000, 기사운임: 120000 + i * 19000,
      메모: i % 4 === 0 ? "상차지 도착 전 담당자에게 꼭 전화 부탁드립니다. 지게차 상차, 하차는 수작업" : "",
      지급방식: ["계산서", "착불", "선불", "손실"][i % 4], 배차방식: ["24시", "직접배차", "인성", "고정"][i % 4],
      등록자명: NAMES[(i + 2) % NAMES.length], 혼적여부: i % 5 === 0 ? "혼적" : "독차",
    }));
  }
  return out;
}

export function demoDocsFor(col) {
  if (col === "dispatch") return orders("dispatch");
  if (col === "drivers") return NAMES.map((n, i) => fakeDoc(col, `demo-drv-${i}`, { companyName: "", 이름: n, 차량번호: `경기${80 + i}바${1000 + i * 37}`, 전화번호: `010-${2000 + i * 11}-${3000 + i * 7}`, 차량종류: CARS[i][0], 차량톤수: CARS[i][1] }));
  if (col === "clients") return CLIENTS.map((n, i) => fakeDoc(col, `demo-cl-${i}`, { companyName: "", 거래처명: n, 주소: PLACES[i % PLACES.length][1], 담당자: NAMES[i % NAMES.length], 연락처: `02-${300 + i}-${4000 + i}` }));
  if (col === "notices") return [0, 1, 2].map((i) => fakeDoc(col, `demo-nt-${i}`, { companyName: "", title: ["11월 배차 운영 안내 — 연말 물량 증가에 따른 야간 배차 인력 보강", "차량 점검 일정", "신규 거래처 등록 절차 변경"][i], content: "내용입니다.", createdAt: new Date(Date.now() - i * 86400000), author: NAMES[i], readBy: ["preview"] }));
  return null;
}

export function demoQuerySnap(ref, col, co) {
  demoCo = co || "";
  const docs = demoDocsFor(col);
  if (!docs) return null;
  return {
    docs, size: docs.length, empty: docs.length === 0,
    forEach: (fn, t) => docs.forEach(fn, t),
    docChanges: () => docs.map((doc, i) => ({ type: "added", doc, oldIndex: -1, newIndex: i })),
    metadata: { fromCache: false, hasPendingWrites: false, isEqual: () => true }, query: ref, isEqual: () => false,
  };
}
