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

// 성능 점검용: URL에 demoN=300 처럼 주면 오더 개수를 늘린다(기본 30, 최대 2000)
function demoCount() {
  try { const n = parseInt(new URLSearchParams(window.location.search).get("demoN") || "", 10); return n > 0 ? Math.min(n, 2000) : 30; } catch { return 30; }
}

function orders(col) {
  const out = [];
  const N = demoCount();
  for (let i = 0; i < N; i++) {
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

// ⭐ 2026-11-05 고정노선현황(구글시트 배차표) 점검 — URL에 demoRoute=1 이 있을 때만 배차표 양식 1개 + 그 오더 12건(운송업체 칸 포함)
const demoRouteOn = () => { try { return new URLSearchParams(window.location.search).get("demoRoute") === "1"; } catch { return false; } };
const ROUTE_CARRIERS = ["태진물류", "대성운수", "한길로지스", ""];
function routeBoard() {
  return fakeDoc("routeBoards", "demo-rb-1", {
    name: "삼다수 배차표", client: "(주)태진", dropOffset: 1, sheetUrl: "",
    groups: [{ name: "1센터", 상차지명: "1센터", 상차지주소: "" }, { name: "2센터", 상차지명: "2센터", 상차지주소: "" }],
    columns: [
      { id: "c1", label: "도착지", kind: "field", field: "하차지명" }, { id: "c2", label: "시군구", kind: "field", field: "하차지주소" },
      { id: "c3", label: "0.5L", kind: "qty" }, { id: "c4", label: "2L", kind: "qty" }, { id: "c5", label: "총계", kind: "sum" },
      { id: "c6", label: "차량번호", kind: "field", field: "차량번호" }, { id: "c7", label: "운송업체", kind: "extra" },
    ],
  });
}
function routeOrders() {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const day = ymd(i % 3 === 0 ? 1 : 0);
    out.push(fakeDoc("dispatch", `demo-rb-o-${i}`, {
      상차일: ymd(-1), 하차일: day, 입고일: day, 발주일: ymd(-1), 배차표Id: "demo-rb-1", 배차표명: "삼다수 배차표", 배차표묶음: i % 2 ? "2센터" : "1센터", 배차표순번: i + 1, 시트줄: i + 5,
      거래처명: "(주)태진", 상차지명: i % 2 ? "2센터" : "1센터", 하차지명: `도착지 ${i + 1}`, 하차지주소: ["경기 오산시", "경기 평택시", "충남 천안시"][i % 3],
      품목수량: { "0.5L": 6 + i, "2L": 4 }, 추가정보: { 운송업체: ROUTE_CARRIERS[i % 4] }, 차량번호: i % 4 === 3 ? "" : i === 1 ? "경기81바1037" : `경기9${i}바${2000 + i}`,
      배차상태: i % 4 === 3 ? "배차중" : "배차완료", 청구운임: 200000 + i * 10000, 기사운임: 170000 + i * 9000, 지급방식: "계산서", 배차방식: "고정",
    }));
  }
  return out;
}

// ⭐ 2026-11-05 기사앱 가입 승인 창 점검 — 가입 대기 기사 3명 + 승인된 기사 1명(users), 가입 때 만든 drivers/{uid},
//  사무실이 미리 등록한 같은 기사(연동 후보), 사업자등록증 사진(driver_documents)
const DEMO_SIGNUPS = [
  // 기사관리 demo-drv-0(김철수 · 경기80바1000)과 차량번호·이름 같음, 연락처 다름 → 연동 + 다른 값 표시
  { id: "demo-u-0", name: "김철수", carNo: "경기80바1000", phone: "010-5555-1234", 차량종류: "카고", 차량톤수: "5톤", 거주지: "경기 평택시", 요청사항: "야간 운행 가능합니다. 주 5일 희망", hireDate: "2026-11-10", 정산계좌: { bank: "국민은행", acct: "12345678901234", holder: "김철수" }, 사업자번호: "1234567890", 사업자상호: "철수운수", approved: false, at: 2 },
  // 같은 연락처의 예전 차량 기록 + 같은 차량번호 → 후보 2개
  { id: "demo-u-1", name: "이영희", carNo: "경기81바1037", phone: "010-2011-3007", 차량종류: "윙바디", 차량톤수: "11톤", 거주지: "경기 이천시", 요청사항: "", hireDate: "", 정산계좌: null, 사업자번호: "", 사업자상호: "", approved: false, at: 1 },
  // 기사관리에 없음 → 새로 등록
  { id: "demo-u-2", name: "홍길동", carNo: "서울12가3456", phone: "010-7777-8888", 차량종류: "냉동탑", 차량톤수: "2.5톤", 거주지: "서울 강서구", 요청사항: "냉동 화물 위주", hireDate: "2026-11-15", 정산계좌: { bank: "신한은행", acct: "110222333444", holder: "홍길동" }, 사업자번호: "2208123456", 사업자상호: "길동냉동", approved: false, at: 0 },
  { id: "demo-u-3", name: "박민준", carNo: "경기82바1074", phone: "010-2022-3014", 차량종류: "냉동탑", 차량톤수: "2.5톤", 거주지: "경기 수원시", approved: true, at: 9 },
];
const BIZ_SVG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220"><rect width="300" height="220" fill="#fff" stroke="#1B2B4B" stroke-width="6"/><text x="150" y="60" font-size="22" text-anchor="middle" font-weight="bold" fill="#0F1A30">사업자등록증</text><text x="30" y="110" font-size="14" fill="#333">상호: 철수운수</text><text x="30" y="140" font-size="14" fill="#333">등록번호: 123-45-67890</text><text x="30" y="170" font-size="14" fill="#333">대표자: 김철수</text></svg>')}`;
const demoTs = (daysAgo) => ({ seconds: Math.floor((Date.now() - daysAgo * 86400000) / 1000), nanoseconds: 0 });
// ⭐ 2026-11-05 실시간 관제 점검 — 지입·직영·임대 기사 5명에 기사앱 위치(가짜)·속도·상태 · 최근 이동경로
//  [등급, 위도, 경도, 속도, 상태, 몇 분 전 수신, 진행 방향(이동경로를 그릴 때 거꾸로 따라감)]
const DEMO_LIVE = [
  ["지입", 37.214, 127.088, 0, "대기", 1, [0, 0]],
  ["지입", 36.812, 127.147, 72, "운송중", 0.3, [0.004, 0.0012]],
  ["직영", 35.081, 128.832, 0, "상차중", 1.2, [-0.0006, 0.0018]],
  ["일반", 37.5, 127.0, 0, "대기", 2, [0, 0]],
  ["임대", 37.458, 126.452, 38, "운송중", 8, [-0.001, -0.003]],
  ["지입", 36.502, 127.262, 0, "휴식", 41, [0.002, 0.0005]],
];
function demoLive(i) {
  const [등급, lat, lng, speed, status, minAgo] = DEMO_LIVE[i] || [];
  if (!등급) return {};
  const ms = Date.now() - minAgo * 60000;
  return { 등급, uid: `demo-drv-${i}`, location: { lat, lng }, speed, status, mainStatus: status, updatedAt: ms, heartbeatAt: ms };
}
function demoTracks() {
  const out = [];
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  DEMO_LIVE.forEach(([g, lat, lng, , , minAgo, [dLat, dLng]], i) => {
    if (g === "일반" || (!dLat && !dLng)) return;
    for (let k = 40; k >= 1; k--) {
      const wob = Math.sin(k / 3) * 0.0015;
      out.push(fakeDoc("gps_tracks", `demo-trk-${i}-${k}`, {
        driverId: `demo-drv-${i}`, lat: lat - dLat * k + wob * (dLng ? 1 : 0), lng: lng - dLng * k + wob * (dLat ? 1 : 0),
        speed: 60, accuracy: 12, date: today, timestamp: Date.now() - (minAgo + k * 2) * 60000,
      }));
    }
  });
  return out;
}

export function demoDocsFor(col) {
  if (col === "users") return DEMO_SIGNUPS.map((u) => fakeDoc(col, u.id, { uid: u.id, role: "driver", email: `${u.carNo}@driver.run25.kr`, vehicleType: `${u.차량종류} ${u.차량톤수}`, termsAgreed: true, privacyAgreed: true, gpsAgreed: true, createdAt: demoTs(u.at), ...u, at: undefined }));
  if (col === "driver_documents") return [fakeDoc(col, "demo-dd-0", { driverId: "demo-u-0", docType: "bizReg", docLabel: "사업자등록증", status: "제출", fileName: "사업자등록증.jpg", fileType: "image/svg+xml", dataUrl: BIZ_SVG, uploadedAt: demoTs(2) })];
  if (col === "dispatch") return demoRouteOn() ? [...orders("dispatch"), ...routeOrders()] : orders("dispatch");
  if (col === "routeBoards" && demoRouteOn()) return [routeBoard()];
  if (col === "drivers") return [
    ...NAMES.map((n, i) => fakeDoc(col, `demo-drv-${i}`, { companyName: "", 이름: n, 차량번호: `경기${80 + i}바${1000 + i * 37}`, 전화번호: `010-${2000 + i * 11}-${3000 + i * 7}`, 차량종류: CARS[i][0], 차량톤수: CARS[i][1], ...demoLive(i), ...(i === 0 ? { 등급: "직영", 담당자: { name: "최서연" }, 등록자: "정우성", 거주지: "", createdAt: demoTs(120) } : {}) })),
    fakeDoc(col, "demo-drv-old", { 이름: "이영희", 차량번호: "경기70바7777", 전화번호: "010-2011-3007", 차량종류: "카고", 차량톤수: "5톤", 등급: "임대", 등록자: "김철수", createdAt: demoTs(400) }),
    ...DEMO_SIGNUPS.filter((u) => !u.approved).map((u) => fakeDoc(col, u.id, { uid: u.id, 이름: u.name, name: u.name, 차량번호: u.carNo, carNo: u.carNo, 전화번호: u.phone, phone: u.phone, 차량종류: u.차량종류, 차량톤수: u.차량톤수, 거주지: u.거주지, approved: false, createdAt: demoTs(u.at) })),
  ];
  if (col === "gps_tracks") return demoTracks();
  if (col === "clients") return CLIENTS.map((n, i) => fakeDoc(col, `demo-cl-${i}`, { companyName: "", 거래처명: n, 주소: PLACES[i % PLACES.length][1], 담당자: NAMES[i % NAMES.length], 연락처: `02-${300 + i}-${4000 + i}` }));
  // ⭐ 2026-11-05 고정노선 화면 점검용(운행 ON/OFF·목록) — 1개는 ON, 1개는 OFF
  if (col === "fixedRoutes") return [
    { name: "평택→수원 데일리", client: CLIENTS[0], active: true, days: ["월", "화", "수", "목", "금"], startTime: "07:00", startDate: "2026-11-02", endDate: "" },
    { name: "인천 야간 셔틀", client: CLIENTS[1], active: false, days: ["월", "수", "금"], startTime: "21:30", startDate: "2026-10-01", endDate: "2026-12-31" },
  ].map((r, i) => fakeDoc(col, `demo-fr-${i}`, { companyName: "", color: "#2D4C82", autoDispatch: true, autoAccept: true, skipDates: [], driverName: NAMES[i], carNo: `경기${80 + i}바${1000 + i * 37}`, tonnage: "5톤", vehicleType: "윙바디", fareClient: "180000", fareDriver: "150000", payMethod: "계산서",
    stops: [{ type: "상차", name: PLACES[i][0], addr: PLACES[i][1], time: "07:00" }, { type: "경유", name: PLACES[i + 1][0], addr: PLACES[i + 1][1], time: "" }, { type: "하차", name: PLACES[i + 2][0], addr: PLACES[i + 2][1], time: "" }], ...r }));
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
