// ======================= src/sessionPurge.js =======================
// 🔒 2026-11-07 보안 점검 — 계정을 바꿔 쓰는 PC·휴대폰에서 앞 사람(다른 운송사)의 데이터가 잠깐이라도 보이지 않게.
//  · 로그아웃하면: 회사 데이터가 든 브라우저 저장값(알림 목록·지난 실적 합계·첨부 캐시·24시콜 로그인 등)을 지우고,
//    Firestore가 기기에 저장해 둔 문서(IndexedDB — 오더·기사·직원 명부 사본)도 지운 뒤 새로 고친다.
//    (서버 규칙은 다른 회사 문서를 내려주지 않지만, 기기에 남은 사본은 다음 사람 화면의 "저장본 먼저 보여주기"에 섞일 수 있다)
//  · 다른 계정으로 바로 로그인한 경우(로그아웃 없이): 저장값만 지운다(기기 저장본은 다음 로그아웃 때).
//  화면 설정(글자 크기·테마·창 위치 등)은 남긴다.
import { terminate, clearIndexedDbPersistence } from "firebase/firestore";

const LAST_UID = "kpLastUid";
// 회사·사람 데이터가 들어 있는 저장값
const KEYS = [
  "mobileNotifs", "homePastStats", "rateCardHistory", "dispatchDateState", "dispatchStatusState", "mobileLastSyncAt",
  "attachments", "detailAttachments", "call24_ddPwd", "call24_ddID", "userName", "uid", "userCompany", "role",
  "shipperCompany", "shipperCode", "transportCode", "fixedTransport", "routeBoard:last", "seenToasts", "kpServerFilter",
  // 🔒 2026-11-23 배차 화면 저장본(최근 오더 · 기사 · 거래처 · 작성 중 오더 · 수정 중 칸)과 내 이름 — 같은 PC를 다른 운송사 사람이 쓸 때 앞 사람 것이 잠깐이라도 보이지 않게
  "dispatchData", "drivers", "clients", "dispatchForm", "realtimeEdit", "kpMyName", "loginCompany", "kpRecentCompanies", "kpDriverViewCo",
];
const PREFIXES = [
  "saved_attach_", "attach_", "shownNotifs_", "urgentSeen_", "urgentSnoozed_", "mobileUrgentSeen_", "fixedTransport_",
  "shipperOrderDraft_", "vcLater_", "fcConfig_", "kpMsgToastSeen:", "kpDlSig:",
];

// 🔒 2026-11-23 예전 오더 보관본(IndexedDB kpOrderHistory — PC · 폰 13개월)도 지운다 — 회사별로 따로 보관해 다른 회사 화면에 섞이진 않지만,
//  같은 PC를 다른 운송사 사람이 쓸 때 앞 사람 회사 오더가 기기에 남아 있지 않게
function purgeHistoryCache() {
  try { if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase("kpOrderHistory"); } catch { /* 무시 */ }
}
export function purgeAccountStorage() {
  purgeHistoryCache();
  // 🔒 2026-11-23 탭 저장소(sessionStorage)의 앞 사람 자료 — 결재 자동 입력 · 영수증 대기열 · 견적 초안 · 화면 잠금 해제 표시(로그아웃해도 같은 탭에 남았다)
  ["kpApPreset", "kpApPresetQueue", "exec_intel_ok", "sales_ok", "kpQuoteSeed", "kpHrTab", "kpFundsTab", "kpSalesTab"].forEach((k) => { try { sessionStorage.removeItem(k); } catch { /* 무시 */ } });
  try {
    const all = Object.keys(localStorage);
    all.forEach((k) => {
      if (KEYS.includes(k) || PREFIXES.some((p) => k.startsWith(p))) { try { localStorage.removeItem(k); } catch { /* 무시 */ } }
    });
  } catch { /* 저장소 없음 */ }
}

// 로그인 완료(역할 확인) 때 — 지난번과 다른 계정이면 저장값을 먼저 지운다. 지웠으면 true
export function noteSignedInUid(uid) {
  if (!uid) return false;
  let last = "";
  try { last = localStorage.getItem(LAST_UID) || ""; } catch { /* 무시 */ }
  let purged = false;
  if (last && last !== uid) { purgeAccountStorage(); purged = true; }
  try { localStorage.setItem(LAST_UID, uid); } catch { /* 무시 */ }
  return purged;
}

let clearing = false;
// 로그아웃 때 — 저장값 + 기기 저장본(IndexedDB)을 지우고 새로 고친다(한 번만)
export async function purgeOnSignOut(db) {
  if (clearing) return;
  clearing = true;
  purgeAccountStorage();
  try { localStorage.removeItem(LAST_UID); } catch { /* 무시 */ }
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    // 다른 탭이 같은 저장소를 쓰고 있으면 지우지 못한다 — 다음 로그아웃 때 다시 시도(서버 규칙이 다른 회사 문서는 새로 내려주지 않음)
    console.warn("[로그아웃 정리] 기기 저장본 지우기 실패:", e?.message || e);
  }
  try { window.location.reload(); } catch { /* 무시 */ }
}
