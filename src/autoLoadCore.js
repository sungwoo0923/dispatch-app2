// ======================= src/autoLoadCore.js =======================
// 🚚 2026-11-10 자동 상차완료(상차지 들렀다 출발) 판정 — 순수 함수(firebase 없음, scripts/autoLoad.test.mjs가 그대로 읽는다)
//  · 사용자 제보: 하차지만 바꾼 오더를 기사가 재승인하자마자 "상차완료 → 운송중"이 됐다.
//    원인: "상차지 다녀옴"을 오늘 GPS 기록(지나간 흔적)만으로도 기록하고, 그 상태에서 상차지에서 3km 넘게 떨어져 있으면
//          곧바로 자동 상차완료로 처리했다 → 실제로 상차지 반경 안에 있은 적 없이도 상차완료가 찍힐 수 있었다.
//  · 이제 자동 상차완료는 아래를 모두 만족할 때만:
//    ① 상차완료가 아직 없음 ② 지금 상차지 주소로 "실제로 반경 안에 들어와 기록된" 방문(근거 = 현재위치)
//    ③ 그 방문 후 3분 이상 지남(상차지 근처에 실제로 머문 뒤) ④ 기사가 확인하지 않은 오더 수정이 없음
//    ⑤ 재승인(수정확인) 직후 2분은 보류 ⑥ 상차지에서 3km 넘게 벗어남(출발)
export const LOAD_DEPART_KM = 3;
export const VISIT_RADIUS_KM = 1;
export const MIN_STAY_MS = 3 * 60 * 1000;
export const REAPPROVE_HOLD_MS = 2 * 60 * 1000;

export const tsMsOf = (t) => (t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : (typeof t === "number" ? t : null)));
const normAddr = (a) => String(a || "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").trim();

// 상차지에 "실제로" 들어온 기록인가(지나간 GPS 흔적·사진이 아니라 반경 안 현재 위치로 기록됨)
export function isLiveVisit(order) {
  if (!order?.상차지도착주소 || normAddr(order.상차지도착주소) !== normAddr(order.상차지주소)) return false;
  return order.상차지도착근거 === "현재위치";
}

// 자동 상차완료를 해도 되는가 — distKm: 지금 위치 ↔ 상차지 거리(km, 모르면 null)
export function shouldAutoLoad({ order, distKm, now = Date.now(), pendingChange = false }) {
  if (!order || order.상차완료일시) return false;
  if (!isLiveVisit(order)) return false;
  if (pendingChange) return false;
  const visitMs = tsMsOf(order.상차지도착일시);
  if (!visitMs || now - visitMs < MIN_STAY_MS) return false;
  const reMs = tsMsOf(order.수정확인일시);
  if (reMs && now - reMs < REAPPROVE_HOLD_MS) return false;
  if (distKm == null || !(distKm > LOAD_DEPART_KM)) return false;
  return true;
}

// 화면 표시용 "상차한 것으로 볼까" — 상차완료(버튼·사진·자동)가 기록됐거나, 실제 방문 뒤 3km 넘게 출발한 경우만
export function isLoadedCore(order, distKm) {
  if (!order) return false;
  if (order.상차완료일시) return true;
  if (!isLiveVisit(order)) return false;
  return distKm != null && distKm > LOAD_DEPART_KM;
}
