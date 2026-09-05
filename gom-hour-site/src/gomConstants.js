// ==================== gom-hour-site/src/gomConstants.js ====================
// 주문페이지에서 쓰는 기본값 모음. 여기 있는 값들은 전부 "관리자페이지가
// 아직 없을 때 쓰는 초기값"이다 — 나중에 관리자페이지에서
// Firestore(gomSettings/pricing, gomOptions)를 채우면 그 값이 우선 적용되고,
// 컬렉션이 비어있을 때만 이 파일의 기본값이 화면에 쓰인다.

// 카카오톡 문의 채널 링크 — 실제 채널 URL로 교체하세요.
export const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_xxxxxxx/chat";

// 종류 선택지 (박스형 2/4구, 부케형 5/7구)
export const KIND_OPTIONS = [
  { id: "box-2", group: "box", label: "박스형 2구", defaultPrice: 33000 },
  { id: "box-4", group: "box", label: "박스형 4구", defaultPrice: 55000 },
  { id: "bouquet-5", group: "bouquet", label: "부케형 5구", defaultPrice: 45000 },
  { id: "bouquet-7", group: "bouquet", label: "부케형 7구", defaultPrice: 65000 },
];

// gomSettings/pricing 문서가 없을 때 쓰는 기본 가격표
export const DEFAULT_PRICES = KIND_OPTIONS.reduce((acc, k) => {
  acc[k.id] = k.defaultPrice;
  return acc;
}, {});

// 추가 선택 옵션 기본값 (gomOptions 컬렉션이 비어있을 때 사용).
// type: "checkbox"(단순 추가) / "checkbox_qty"(수량 선택) / "select"(택1) / "text"(문구 입력)
// appliesTo: 빈 배열([])이면 모든 종류에 표시, 아니면 지정된 kind id에서만 표시
export const DEFAULT_OPTIONS = [
  {
    id: "flavor-creamcheese",
    category: "flavor",
    label: "맛 변경 — 크림치즈",
    type: "checkbox",
    price: 2000,
    appliesTo: [],
    order: 1,
    active: true,
  },
  {
    id: "candle-default",
    category: "candle",
    label: "기본 곰돌이 초 선택",
    type: "select",
    price: 0,
    appliesTo: [],
    order: 2,
    active: true,
    choices: [
      { id: "candle-classic", label: "클래식 곰돌이", price: 0 },
      { id: "candle-pink", label: "핑크 곰돌이", price: 0 },
      { id: "candle-brown", label: "브라운 곰돌이", price: 0 },
    ],
  },
  {
    id: "single-bear-add",
    category: "singleBearAdd",
    label: "싱글곰 추가",
    type: "checkbox_qty",
    price: 5000,
    appliesTo: [],
    order: 3,
    active: true,
  },
  {
    id: "couple-bear-change",
    category: "coupleBearChange",
    label: "커플곰 변경",
    type: "checkbox",
    price: 3000,
    appliesTo: [],
    order: 4,
    active: true,
  },
  {
    id: "couple-bear-add",
    category: "coupleBearAdd",
    label: "커플곰 추가",
    type: "checkbox_qty",
    price: 8000,
    appliesTo: [],
    order: 5,
    active: true,
  },
  {
    id: "lettering-add",
    category: "lettering",
    label: "레터링 추가",
    type: "text",
    price: 3000,
    appliesTo: ["box-2", "box-4"], // 박스형 선택 시에만 노출
    order: 6,
    active: true,
  },
  {
    id: "special-box",
    category: "specialBox",
    label: "스페셜 박스로 변경",
    type: "checkbox",
    price: 10000,
    appliesTo: ["box-4"], // 박스형 4구에서만 노출
    order: 7,
    active: true,
  },
];

export function formatWon(n) {
  return (n || 0).toLocaleString("ko-KR") + "원";
}
