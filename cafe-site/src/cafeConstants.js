// ======================= cafe-site/src/cafeConstants.js =======================
// 배차마당(카페형 오더 공유 사이트) 공용 상수 — 운송 프로그램(DispatchApp.jsx)의
// 드롭다운과 항목/순서를 동일하게 맞춘다. 운송 프로그램은 거대한 번들이라
// 그대로 import하면 카페 사이트에도 전체가 딸려오므로, 값만 그대로 복사해 둔다.

export const VEHICLE_TYPES = ["라보", "다마스", "오토바이", "윙바디", "탑", "카고", "냉장윙", "냉동윙", "냉장탑", "냉동탑", "냉장/냉동탑", "냉장/냉동윙"];
export const PAY_TYPES = ["계산서", "착불", "선불", "계좌이체"];
export const LOAD_METHODS = ["지게차", "수작업", "직접수작업", "수도움", "크레인"];

export const APPLY_CANCEL_WINDOW_MS = 10000; // 배차신청 후 취소 가능 시간(10초)
