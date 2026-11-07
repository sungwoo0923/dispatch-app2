// ======================= cafe-site/src/cafeConstants.js =======================
// 오더마켓(예전 이름: 배차마당) 공용 상수 — 운송 프로그램(DispatchApp.jsx)의
// 드롭다운과 항목/순서를 동일하게 맞춘다. 운송 프로그램은 거대한 번들이라
// 그대로 import하면 이 사이트에도 전체가 딸려오므로, 값만 그대로 복사해 둔다.

// ⭐ 2026-11-06 서비스 이름 — 여기 한 곳만 바꾸면 사이트 전체(제목·로고·문구·index.html)가 바뀐다.
//  운송 프로그램 쪽 버튼 문구는 본체 src/orderMarketConfig.js 의 같은 이름 상수를 함께 바꿔 주세요.
export const MARKET_NAME = "로지스웹 허브"; // ⭐ 2026-11-06 대표님 확정 이름
export const MARKET_NAME_EN = "LogisWeb Hub";
export const MARKET_SHORT = "허브"; // 버튼/짧은 문구용("저장 + 허브 등록")
export const MARKET_TAGLINE = "운송사끼리 오더를 주고받는 실시간 오더 거래소";
export const PROGRAM_URL = "https://app.logisweb.co.kr/login"; // 로지스웹 운송 프로그램

export const VEHICLE_TYPES = ["라보", "다마스", "오토바이", "윙바디", "탑", "카고", "냉장윙", "냉동윙", "냉장탑", "냉동탑", "냉장/냉동탑", "냉장/냉동윙"];
export const PAY_TYPES = ["계산서", "착불", "선불", "계좌이체"];
export const LOAD_METHODS = ["지게차", "수작업", "직접수작업", "수도움", "크레인"];
export const TON_UNITS = ["톤", "kg", "직접입력"];

export const APPLY_CANCEL_WINDOW_MS = 10000; // (예전 게시글) 배차신청 후 취소 가능 시간(10초)

// ⭐ 2026-11-06 오더 거래 단계 — open(모집중) → matched(매칭완료) → dispatched(배차완료) → delivered(운송완료)
//  예전 게시글(v 없음)은 applying(신청중)/confirmed(배차확정) 단계를 그대로 쓴다.
export const STATUS_META = {
  open: { label: "모집중", step: 0 },
  matched: { label: "매칭완료", step: 1 },
  dispatched: { label: "배차완료", step: 2 },
  delivered: { label: "운송완료", step: 3 },
  cancelled: { label: "취소", step: -1 },
  applying: { label: "신청중", step: 0 },
  confirmed: { label: "배차확정", step: 2 },
};
export const ACTIVE_MATCH = ["matched", "dispatched", "delivered"];
export const isV2 = (o) => Number(o?.v || 0) >= 2;

// 시·도 — 주소 첫 단어를 짧은 이름으로 맞춘다
export const SIDO = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"];
const SIDO_ALIAS = {
  서울특별시: "서울", 서울시: "서울", 부산광역시: "부산", 부산시: "부산", 대구광역시: "대구", 대구시: "대구",
  인천광역시: "인천", 인천시: "인천", 광주광역시: "광주", 광주시: "광주", 대전광역시: "대전", 대전시: "대전",
  울산광역시: "울산", 울산시: "울산", 세종특별자치시: "세종", 세종시: "세종", 경기도: "경기", 강원도: "강원",
  강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북",
  전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주", 제주도: "제주",
};
// "경기도 화성시 향남읍 ..." → { sido: "경기", sigungu: "화성시" } — 정확한 주소는 매칭 전까지 숨기고 시/구만 보인다
export function toRegion(addr) {
  const t = String(addr || "").trim().split(/\s+/).filter(Boolean);
  if (!t.length) return { sido: "", sigungu: "" };
  const first = t[0];
  const sido = SIDO_ALIAS[first] || (SIDO.includes(first) ? first : "");
  if (!sido) return { sido: "", sigungu: "" };
  let sigungu = t[1] || "";
  if (sido === "세종") sigungu = "";
  else if (/시$/.test(sigungu) && /구$/.test(t[2] || "")) sigungu = `${sigungu} ${t[2]}`;
  if (!/(시|군|구)$/.test(sigungu)) sigungu = "";
  return { sido, sigungu };
}
export const regionText = (sido, sigungu) => [sido, sigungu].filter(Boolean).join(" ");

// 오더 한 건의 상·하차 지역(새 글은 시/구 칸, 예전 글은 주소에서 계산)
export function pickRegion(o, side) {
  const sd = o?.[`${side}시도`];
  if (sd) return { sido: sd, sigungu: o[`${side}시군구`] || "" };
  return toRegion(o?.[`${side}지주소`]);
}

// "120,000원" / 120000 / "12만" → 120000 (없으면 0)
export function fareNum(v) {
  if (typeof v === "number") return v;
  const s = String(v || "");
  const man = s.match(/([\d.]+)\s*만/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const d = s.replace(/[^\d]/g, "");
  return d ? Number(d) : 0;
}
export const won = (n) => (n ? `${Number(n).toLocaleString()}원` : "");
// 톤수 숫자(톤) — "1.1톤" → 1.1, "1200kg" → 1.2
export function tonNum(v) {
  const s = String(v || "");
  const m = s.match(/([\d.]+)\s*(kg|톤|t)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return /kg/i.test(m[2] || "") ? n / 1000 : n;
}
export const TON_BUCKETS = [
  ["", "전체"],
  ["s", "1톤 이하", 0, 1.4],
  ["m", "2.5~3.5톤", 1.5, 4.4],
  ["l", "5톤", 4.5, 8],
  ["xl", "11톤 이상", 8.1, 999],
];
