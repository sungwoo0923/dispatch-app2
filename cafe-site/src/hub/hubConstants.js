// ======================= cafe-site/src/hub/hubConstants.js =======================
// ⭐ 2026-11-06 로지스웹 허브 — 화물 "콜" 앱(차주 · 화주 · 운송사) 공용 상수.
//  역할: driver(차주) · shipper(화주) · carrier(운송사)
//  회원 출처(source): signup(허브 가입 · 관리자 승인) · logisweb-staff(로지스웹 운송사 직원) ·
//                     logisweb-driver(로지스웹 소속 기사) · logisweb-shipper(로지스웹 화주사)
//  오더(hubOrders) 단계: open(모집중) → assigned(10초 뒤 confirmed = 운송중) → delivered(운송완료 · 회차) | cancelled(취소)

export const CANCEL_WINDOW_MS = 10000; // 배차신청 후 취소 가능 시간(서버 규칙도 10초)
export const MAX_QUICK_CANCELS = 5; // 한 오더에서 10초 내 취소가 이만큼 쌓이면 더 이상 배차신청 불가(창 악용 방지)

export const ROLES = {
  driver: { label: "차주", en: "DRIVER", desc: "오더를 받아 운송해요", icon: "truck" },
  shipper: { label: "화주", en: "SHIPPER", desc: "화물을 올리고 차를 찾아요", icon: "building" },
  carrier: { label: "운송사", en: "CARRIER", desc: "오더를 올리고 받아요", icon: "swap" },
};
export const SOURCE_LABEL = {
  signup: "허브 가입",
  "logisweb-staff": "로지스웹 운송사",
  "logisweb-driver": "로지스웹 소속 기사",
  "logisweb-shipper": "로지스웹 화주사",
};
export const canPost = (m) => !!m && m.status === "approved" && (m.role === "shipper" || m.role === "carrier");
export const canTake = (m) => !!m && m.status === "approved" && (m.role === "driver" || m.role === "carrier") && !m.penalty?.blocked;
// 배차신청은 본인 실계좌가 있어야(규칙 hubHasBank와 같은 기준)
export const hasBank = (m) => !!(m?.bank?.bank && String(m.bank.number || "").replace(/[^\d]/g, "").length >= 6 && String(m.bank.holder || "").trim());

// 가입 서류 — 역할별 필수/선택
export const DOC_TYPES = {
  bizReg: "사업자등록증",
  cargoLicense: "화물운송종사자격증",
  carReg: "자동차등록증",
  driverLicense: "운전면허증",
  insurance: "적재물배상보험 증권",
  bankbook: "통장사본",
  employment: "담당자 재직·위임 확인서",
  transportPermit: "화물운송사업 허가증",
};
export const ROLE_DOCS = {
  driver: { required: ["bizReg", "cargoLicense", "carReg", "driverLicense", "insurance", "bankbook"], optional: [] },
  shipper: { required: ["bizReg"], optional: ["employment"] },
  carrier: { required: ["bizReg", "transportPermit"], optional: ["employment", "bankbook"] },
};
export const BIZ_STATUS = ["확인 전", "계속사업자", "휴업자", "폐업자"];

// ⭐ 2026-11-07 (3차) 목록은 로지스웹 배차 프로그램과 같은 값(배차 오더로 옮길 때 그대로 맞도록)
//  차종 = src/vehicleTypes.js VT_DEFAULTS (+ 허브에서 쓰던 츄레라 · 덤프 · 기타) · 상하차방법 = src/companyDropdownOptions.jsx 상하차방법
export const HUB_VEHICLES = ["라보/다마스", "카고", "윙/카고", "윙바디", "리프트", "탑차", "냉장탑", "냉동탑", "냉장윙", "냉동윙", "냉장/냉동탑", "냉장/냉동윙", "오토바이", "츄레라", "덤프", "기타"];
export const HUB_TONS = ["0.5톤", "1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "5톤축", "8톤", "9.5톤", "11톤", "14톤", "18톤", "25톤"];
export const PAY_METHODS = ["인수증", "선불", "착불"];
export const LOAD_METHODS = ["지게차", "수작업", "직접수작업", "수도움", "크레인", "리프트"];
export const COUNT_OPTIONS = ["1대", "2대", "3대", "4대", "5대", "6대", "7대", "8대", "9대", "10대"];
export const REQUESTER_TYPES = ["화주", "운수사", "주선사"];
export const PAY_TERM_OPTIONS = [["days:0", "확인한 날"], ["days:3", "3일 뒤"], ["days:7", "7일 뒤"], ["days:15", "15일 뒤"], ["days:30", "30일 뒤"], ["next:5", "다음 달 5일"], ["next:10", "다음 달 10일"], ["next:15", "다음 달 15일"], ["next:25", "다음 달 25일"], ["next:31", "다음 달 말일"]];
// 배차 프로그램 지급방식으로 옮길 값(functions/hubSync.js lwPay와 같은 기준)
export const lwPayOf = (p) => (p === "선불" || p === "착불" ? p : p === "계좌이체" ? "계좌이체" : "계산서");
// 예치금 · 정산(서버 functions/hubWallet.js와 같은 기준)
//  인수증: 확정 때 등록자 잔액에서 운임을 보류 → 계산서 확인 → 지급예정일에 차주 실계좌로
//  선불 · 착불: 차주가 화주에게 직접 받고, 수수료는 운송완료 때 차주 잔액에서 등록자에게
export const DEPOSIT_PAY = ["인수증", "예치금"];
export const CASH_PAY = ["선불", "착불"];
export const payKind = (m) => (DEPOSIT_PAY.includes(m) ? "deposit" : CASH_PAY.includes(m) ? "cash" : "direct");
export const PAY_HINT = {
  deposit: "확정되면 운임이 잔액에서 빠지고, 계산서 확인 뒤 지급일에 보내드려요.",
  cash: "차주가 화주에게 직접 받아요. 수수료는 차주 잔액에서 들어와요.",
  direct: "등록자와 차주가 직접 주고받아요.",
};
export const LEDGER_LABEL = {
  charge: "충전", hold: "배차 확정", release: "환불", return_refund: "회차 환불", deduct: "운임 정산", fee_income: "수수료 입금", payout_scheduled: "운송료 지급 예정",
  payout_done: "운송료 지급", fee_paid: "수수료 납부", fee_owed: "미정산 발생", debt_paid: "미정산 상환", adjust: "관리자 조정", platform_fee: "플랫폼 수수료",
  withdraw_req: "출금 신청", withdraw_done: "출금 완료", withdraw_cancel: "출금 취소",
};
export const SETTLE_LABEL = {
  held: "운임 보류 중", hold_failed: "잔액 부족", released: "환불 완료", settled: "정산 완료", fee_paid: "수수료 정산 완료", fee_owed: "수수료 미정산",
};
export const BANKS = ["국민", "신한", "우리", "하나", "농협", "기업", "SC제일", "씨티", "카카오뱅크", "토스뱅크", "케이뱅크", "새마을금고", "신협", "우체국", "수협", "부산", "대구", "경남", "광주", "전북", "제주", "산업"];

// ⭐ 2026-11-06 관리자가 바꾸는 목록(hubSettings/config.lists) — 같은 배열을 그 자리에서 바꿔 모든 화면이 함께 따라간다
const DEFAULT_LISTS = {};
export function applyHubLists(lists) {
  const targets = { vehicles: HUB_VEHICLES, tons: HUB_TONS, payMethods: PAY_METHODS, loadMethods: LOAD_METHODS, regions: SIDO_LIST };
  for (const [k, arr] of Object.entries(targets)) {
    if (!DEFAULT_LISTS[k]) DEFAULT_LISTS[k] = [...arr];
    let next = Array.isArray(lists?.[k]) && lists[k].length ? lists[k].map((x) => String(x).trim()).filter(Boolean) : DEFAULT_LISTS[k];
    if (k === "regions") next = next.filter((s) => SIGUNGU[s]);
    if (!next.length) next = DEFAULT_LISTS[k];
    arr.splice(0, arr.length, ...next);
  }
}
export const defaultLists = () => { applyHubLists(null); return Object.fromEntries(Object.entries(DEFAULT_LISTS).map(([k, v]) => [k, [...v]])); };
// 기본 수수료(설정: 정액 원 · 운임의 %)
export function defaultFee(cfg, fare) {
  const f = cfg?.fee || {};
  if (f.mode === "percent") return Math.round(((Number(fare) || 0) * (Number(f.value) || 0)) / 100 / 1000) * 1000;
  return Number(f.value) || 0;
}

// ⭐ 2026-11-06 주소 → 허브 지역(시·도 / 시·군·구) — 오더 스캔 결과를 허브 칸에 넣을 때
const SIDO_ALIAS = [
  [/^서울(특별시|시)?$/, "서울"], [/^부산(광역시|시)?$/, "부산"], [/^대구(광역시|시)?$/, "대구"], [/^인천(광역시|시)?$/, "인천"], [/^광주(광역시)?$/, "광주"],
  [/^대전(광역시|시)?$/, "대전"], [/^울산(광역시|시)?$/, "울산"], [/^세종(특별자치시|시)?$/, "세종"], [/^경기(도)?$/, "경기"], [/^강원(특별자치도|도)?$/, "강원"],
  [/^충(청)?북(도)?$|^충청북도$/, "충북"], [/^충(청)?남(도)?$|^충청남도$/, "충남"], [/^전(라)?북(도)?$|^전라북도$|^전북특별자치도$/, "전북"], [/^전(라)?남(도)?$|^전라남도$/, "전남"],
  [/^경(상)?북(도)?$|^경상북도$/, "경북"], [/^경(상)?남(도)?$|^경상남도$/, "경남"], [/^제주(특별자치도|도)?$/, "제주"],
];
export function regionFromAddress(addr) {
  const toks = String(addr || "").replace(/[(),]/g, " ").split(/\s+/).filter(Boolean);
  let sido = "", sgg = "";
  for (let i = 0; i < Math.min(toks.length, 3) && !sido; i++) {
    const hit = SIDO_ALIAS.find(([re]) => re.test(toks[i]));
    if (hit) {
      sido = hit[1];
      const list = sigunguOf(sido);
      for (const t of toks.slice(i + 1, i + 3)) { const m = list.find((g) => g === t || (t.length >= 2 && g.startsWith(t.replace(/(시|군|구)$/, "")) && g.length - t.length <= 1)); if (m) { sgg = m; break; } }
      if (sido === "세종") sgg = "세종시";
    }
  }
  if (!sido) {
    // 시·도 없이 "화성시 향남읍 …" — 시·군·구 이름이 한 곳에만 있으면 그곳
    for (const t of toks.slice(0, 2)) {
      const hits = Object.keys(SIGUNGU).filter((sd) => sigunguOf(sd).includes(t));
      if (hits.length === 1) { sido = hits[0]; sgg = t; break; }
    }
  }
  return { sido, sigungu: sgg };
}
// 스캔 글자 → 허브 목록 값(가장 비슷한 것)
export function matchListValue(list, raw) {
  const v = String(raw || "").replace(/\s+/g, "");
  if (!v) return "";
  return list.find((x) => x === v) || list.find((x) => v.includes(x)) || list.find((x) => x.includes(v)) || "";
}

// 시·도 → 시·군·구 (2024 행정구역)
export const SIGUNGU = {
  서울: "강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 동작구 마포구 서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 종로구 중구 중랑구",
  경기: "가평군 고양시 과천시 광명시 광주시 구리시 군포시 김포시 남양주시 동두천시 부천시 성남시 수원시 시흥시 안산시 안성시 안양시 양주시 양평군 여주시 연천군 오산시 용인시 의왕시 의정부시 이천시 파주시 평택시 포천시 하남시 화성시",
  인천: "강화군 계양구 남동구 동구 미추홀구 부평구 서구 연수구 옹진군 중구",
  강원: "강릉시 고성군 동해시 삼척시 속초시 양구군 양양군 영월군 원주시 인제군 정선군 철원군 춘천시 태백시 평창군 홍천군 화천군 횡성군",
  충북: "괴산군 단양군 보은군 영동군 옥천군 음성군 제천시 증평군 진천군 청주시 충주시",
  충남: "계룡시 공주시 금산군 논산시 당진시 보령시 부여군 서산시 서천군 아산시 예산군 천안시 청양군 태안군 홍성군",
  대전: "대덕구 동구 서구 유성구 중구",
  세종: "세종시",
  전북: "고창군 군산시 김제시 남원시 무주군 부안군 순창군 완주군 익산시 임실군 장수군 전주시 정읍시 진안군",
  전남: "강진군 고흥군 곡성군 광양시 구례군 나주시 담양군 목포시 무안군 보성군 순천시 신안군 여수시 영광군 영암군 완도군 장성군 장흥군 진도군 함평군 해남군 화순군",
  광주: "광산구 남구 동구 북구 서구",
  경북: "경산시 경주시 고령군 구미시 군위군 김천시 문경시 봉화군 상주시 성주군 안동시 영덕군 영양군 영주시 영천시 예천군 울릉군 울진군 의성군 청도군 청송군 칠곡군 포항시",
  경남: "거제시 거창군 고성군 김해시 남해군 밀양시 사천시 산청군 양산시 의령군 진주시 창녕군 창원시 통영시 하동군 함안군 함양군 합천군",
  대구: "남구 달서구 달성군 동구 북구 서구 수성구 중구",
  울산: "남구 동구 북구 울주군 중구",
  부산: "강서구 금정구 기장군 남구 동구 동래구 부산진구 북구 사상구 사하구 서구 수영구 연제구 영도구 중구 해운대구",
  제주: "서귀포시 제주시",
};
export const SIDO_LIST = Object.keys(SIGUNGU);
export const sigunguOf = (sido) => (SIGUNGU[sido] || "").split(" ").filter(Boolean);

// 거리 계산용 대략 좌표(시·도 중심 + 물류가 많은 시·군·구). 정확한 주소 좌표는 매칭 전에 공개하지 않으므로
//  지역 중심끼리의 직선거리 × 1.25(도로 보정)로 "약 몇 km"만 보여준다.
const SIDO_LL = {
  서울: [37.5665, 126.978], 부산: [35.1796, 129.0756], 대구: [35.8714, 128.6014], 인천: [37.4563, 126.7052],
  광주: [35.1595, 126.8526], 대전: [36.3504, 127.3845], 울산: [35.5384, 129.3114], 세종: [36.48, 127.289],
  경기: [37.2636, 127.0286], 강원: [37.8228, 128.1555], 충북: [36.6357, 127.4917], 충남: [36.6584, 126.6728],
  전북: [35.8242, 127.148], 전남: [34.8161, 126.4629], 경북: [36.4919, 128.8889], 경남: [35.2279, 128.6811], 제주: [33.4996, 126.5312],
};
const SGG_LL = {
  "경기 수원시": [37.2636, 127.0286], "경기 화성시": [37.1995, 126.8312], "경기 평택시": [36.9921, 127.1129], "경기 용인시": [37.2411, 127.1776],
  "경기 성남시": [37.42, 127.1265], "경기 고양시": [37.6584, 126.832], "경기 부천시": [37.5034, 126.766], "경기 안산시": [37.3219, 126.8309],
  "경기 안양시": [37.3943, 126.9568], "경기 김포시": [37.6153, 126.7156], "경기 파주시": [37.7599, 126.7799], "경기 이천시": [37.272, 127.435],
  "경기 광주시": [37.4295, 127.255], "경기 시흥시": [37.38, 126.803], "경기 남양주시": [37.636, 127.2165], "경기 의정부시": [37.7381, 127.0337],
  "경기 오산시": [37.1498, 127.0772], "경기 안성시": [37.008, 127.2797], "경기 포천시": [37.8949, 127.2003], "경기 하남시": [37.5393, 127.2149],
  "경기 여주시": [37.2984, 127.637], "경기 양주시": [37.7853, 127.0458], "경기 군포시": [37.3617, 126.9352], "경기 광명시": [37.4786, 126.8646],
  "강원 춘천시": [37.8813, 127.7298], "강원 원주시": [37.3422, 127.9202], "강원 강릉시": [37.7519, 128.8761],
  "충북 청주시": [36.6424, 127.489], "충북 충주시": [36.991, 127.9259], "충북 음성군": [36.9403, 127.6906], "충북 진천군": [36.8554, 127.4356], "충북 제천시": [37.1326, 128.191],
  "충남 천안시": [36.8151, 127.1139], "충남 아산시": [36.7898, 127.0019], "충남 당진시": [36.8897, 126.6459], "충남 서산시": [36.7848, 126.4503], "충남 논산시": [36.1872, 127.0987], "충남 공주시": [36.4466, 127.119],
  "전북 전주시": [35.8242, 127.148], "전북 군산시": [35.9676, 126.7366], "전북 익산시": [35.9483, 126.9577], "전북 완주군": [35.9046, 127.1622], "전북 김제시": [35.8036, 126.8809], "전북 정읍시": [35.5699, 126.8559],
  "전남 순천시": [34.9507, 127.4872], "전남 여수시": [34.7604, 127.6622], "전남 광양시": [34.9407, 127.6959], "전남 목포시": [34.8118, 126.3922], "전남 나주시": [35.016, 126.7108],
  "경북 포항시": [36.019, 129.3435], "경북 구미시": [36.1195, 128.3446], "경북 경주시": [35.8562, 129.2247], "경북 경산시": [35.8251, 128.7414], "경북 김천시": [36.1398, 128.1136],
  "경북 안동시": [36.5684, 128.7294], "경북 칠곡군": [35.9956, 128.4017], "경북 영천시": [35.9733, 128.9386], "경북 상주시": [36.4109, 128.159],
  "경남 창원시": [35.2279, 128.6811], "경남 김해시": [35.2285, 128.8894], "경남 양산시": [35.335, 129.0373], "경남 진주시": [35.18, 128.1076], "경남 거제시": [34.8806, 128.6211],
  "경남 함안군": [35.2725, 128.4065], "경남 밀양시": [35.5038, 128.7464], "경남 사천시": [35.0036, 128.0642], "경남 통영시": [34.8544, 128.4331],
  "부산 강서구": [35.2122, 128.9806], "부산 사상구": [35.1527, 128.991], "부산 해운대구": [35.1631, 129.1636], "부산 기장군": [35.2445, 129.2222],
  "인천 서구": [37.5455, 126.676], "인천 중구": [37.4738, 126.6216], "인천 남동구": [37.447, 126.7314], "인천 연수구": [37.41, 126.6783], "인천 부평구": [37.507, 126.7219], "인천 계양구": [37.5372, 126.7377],
  "대구 달서구": [35.8299, 128.5328], "대구 달성군": [35.7746, 128.4314], "울산 울주군": [35.5223, 129.2424], "울산 북구": [35.5827, 129.3613], "울산 남구": [35.5439, 129.33],
  "광주 광산구": [35.1396, 126.7936], "대전 유성구": [36.3622, 127.3561], "대전 대덕구": [36.3467, 127.4156], "제주 서귀포시": [33.2541, 126.56],
};
export function regionLL(sido, sigungu) {
  return SGG_LL[`${sido} ${sigungu}`] || SIDO_LL[sido] || null;
}
const hav = (a, b) => {
  const R = 6371, toR = (d) => (d * Math.PI) / 180;
  const dLa = toR(b[0] - a[0]), dLo = toR(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// 도로 거리 추정(km) — 같은 지역이면 15km로 본다(시내 운행)
export function estimateKm(aSido, aSgg, bSido, bSgg) {
  const a = regionLL(aSido, aSgg), b = regionLL(bSido, bSgg);
  if (!a || !b) return 0;
  const d = hav(a, b) * 1.25;
  return Math.max(15, Math.round(d));
}
export const kmBetweenLL = (a, b) => (a && b ? Math.round(hav(a, b) * 1.25) : 0);
// 내 위치(위도·경도) → 가장 가까운 지역
export function nearestRegion(lat, lng) {
  let best = null, bd = 1e9;
  const all = [...Object.entries(SGG_LL).map(([k, v]) => [k.split(" ")[0], k.split(" ").slice(1).join(" "), v]), ...Object.entries(SIDO_LL).map(([k, v]) => [k, "", v])];
  for (const [sd, sg, ll] of all) { const d = hav([lat, lng], ll); if (d < bd) { bd = d; best = { sido: sd, sigungu: sg, ll }; } }
  return best;
}

// 톤수 숫자 — "5톤축" → 5, "1.4톤" → 1.4
export function tonValue(v) {
  const m = String(v || "").match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}
// ⭐ 참고 운임(추정) — 시장 평균을 단순화한 식(기본료 + km당). "적정성" 표시에만 쓰며 실제 운임 결정에 쓰지 않는다.
const FARE_BASE = [[1.4, 40000, 900], [3.5, 60000, 1150], [5.9, 80000, 1400], [11.9, 100000, 1700], [99, 120000, 2000]];
export function referenceFare(ton, km) {
  if (!km) return 0;
  const t = tonValue(ton) || 1;
  const [, base, perKm] = FARE_BASE.find(([max]) => t <= max) || FARE_BASE[FARE_BASE.length - 1];
  return Math.round((base + perKm * km) / 1000) * 1000;
}
// 운임 적정성 — { label, tone: "good" | "fair" | "low" }
export function fareFitness(fare, ton, km, roundTrip = false) {
  const ref = referenceFare(ton, km) * (roundTrip ? 1.6 : 1);
  if (!fare || !ref) return null;
  const r = fare / ref;
  if (r >= 1.1) return { label: "운임 좋음", tone: "good", ratio: r, ref };
  if (r >= 0.9) return { label: "적정 운임", tone: "fair", ratio: r, ref };
  return { label: "낮은 운임", tone: "low", ratio: r, ref };
}

export const won = (n) => (Number(n) ? `${Number(n).toLocaleString()}원` : "협의");
export const wonPlain = (n) => `${(Math.round(Number(n) || 0)).toLocaleString("ko-KR")}원`;
export const manwon = (n) => {
  const v = Number(n) || 0;
  if (!v) return "협의";
  if (v >= 10000 && v % 1000 === 0) return `${(v / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })}만원`;
  return `${v.toLocaleString()}원`;
};
export const fmtPhone = (v) => {
  const d = String(v || "").replace(/[^\d]/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
};
export const fmtBizNo = (v) => {
  const d = String(v || "").replace(/[^\d]/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};
// 사업자등록번호 체크섬(국세청 공개 규칙) — 오타·가짜 번호 1차 걸러내기
export function bizNoValid(v) {
  const d = String(v || "").replace(/[^\d]/g, "");
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * w[i];
  s += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (s % 10)) % 10 === Number(d[9]);
}
export const maskName = (n) => { const s = String(n || ""); return s.length <= 1 ? s : s.length === 2 ? `${s[0]}*` : `${s[0]}${"*".repeat(s.length - 2)}${s.slice(-1)}`; };

// ⭐ 2026-11-07 (3차) 단계: 모집중 → 확정 대기(10초) → 운송중(확정, 위치 공유) → 운송완료 | 회차 | 취소. 상차완료 단계 없음
export const STATUS = {
  open: { label: "모집중", step: 0 },
  assigned: { label: "운송중", step: 1 },
  delivered: { label: "운송완료", step: 2 },
  cancelled: { label: "취소", step: -1 },
};
export const ACTIVE = ["assigned", "loaded"];
export function stageOf(o) {
  if (!o) return "open";
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "delivered") return o.회차?.status === "accepted" ? "returned" : "delivered";
  if (o.status === "loaded") return "moving";
  if (o.status === "assigned") return o.confirmed ? "moving" : "pending";
  return "open";
}
export const STAGE_LABEL = { open: "모집중", pending: "확정 대기", moving: "운송중", delivered: "운송완료", returned: "회차", cancelled: "취소" };
export const stageLabel = (o) => STAGE_LABEL[stageOf(o)];
// 회차 합의가 되면 회차비, 아니면 운임
export const payAmountOf = (o) => (o?.회차?.status === "accepted" ? Number(o.회차.amount) || 0 : Number(o?.운임) || 0);
// 회사 키(규칙 hubKeyOf · functions/hubSync.js companyKeyOf와 같은 계산) — 같은 회사끼리만 기록 · 오더복사 · 고객관리를 나눈다
export function companyKeyOf(m) {
  if (!m) return "";
  if (m.companyKey) return m.companyKey;
  if (m.source && m.source !== "signup") return `lw:${m.companyName || ""}`;
  const d = String(m.bizNo || "").replace(/[^\d]/g, "");
  return d ? `biz:${d}` : `uid:${m.uid || m.id || ""}`;
}
export const isLinked = (m) => !!m && m.source && m.source !== "signup";
// 상차 지역 키 — 보드 검색(시·도 또는 "시·도 시·군·구")
export const regionKeysOf = (sido, sgg) => [sido, sgg ? `${sido} ${sgg}` : ""].filter(Boolean);
export const regionKeyLabel = (k) => String(k || "");
// 지급예정일 — "days:7"(7일 뒤) · "next:10"(다음 달 10일, 31이면 말일)
export function payDateFrom(term, base = kstYmd()) {
  const [mode, nRaw] = String(term || "days:7").split(":");
  const n = Number(nRaw) || 0;
  const d = new Date(`${base}T00:00:00Z`);
  if (mode === "next") {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(n, last))).toISOString().slice(0, 10);
  }
  return new Date(d.getTime() + n * 86400e3).toISOString().slice(0, 10);
}

export const kstYmd = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
export function dayLabel(ymd) {
  if (!ymd) return "";
  const diff = Math.round((new Date(`${ymd}T00:00:00Z`) - new Date(`${kstYmd()}T00:00:00Z`)) / 86400e3);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === 2) return "모레";
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${"일월화수목금토"[d.getUTCDay()]})`;
}
export const tsMs = (t) => (t?.toMillis ? t.toMillis() : typeof t === "number" ? t : t?.seconds ? t.seconds * 1000 : 0);
export function ago(t) {
  const ms = tsMs(t);
  if (!ms) return "방금";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
export const routeText = (o) => `${[o.상차시도, o.상차시군구].filter(Boolean).join(" ")} → ${[o.하차시도, o.하차시군구].filter(Boolean).join(" ")}`;
// 콜 읽어주기(TTS) 문장
export const speakText = (o) => `${o.긴급 ? "긴급. " : ""}${o.상차시도} ${o.상차시군구 || ""} 출발, ${o.하차시도} ${o.하차시군구 || ""} 도착. ${o.차량톤수 || ""} ${o.차량종류 || ""}. 운임 ${manwon(o.운임)}.`;
