// ======================= src/screenReport.js =======================
// 📍 2026-11-13 지금 보는 화면 — 관리센터(운송사 관제 · 화주사 관제 · 지금 접속 중)에 "어느 메뉴에 있는지" 실시간 표시
//  · 화면이 바뀔 때마다 내 로그인 기록(loginSessions/{내 세션})에 screen · screenAt · screenApp 을 적는다(본인 문서라 규칙 변경 없음)
//  · 같은 화면이면 다시 적지 않고, 빠르게 여러 번 바꿔도 2초에 한 번만 적는다(쓰기 비용 아낌)
//  · 화면을 가리면(다른 창 · 탭) screenHidden = true → 관리센터에서 "자리 비움"으로 보인다
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { SESSIONS_COLL, getMySessionId } from "./loginSessions";
import { CUR_VER, CUR_BUILD } from "./releaseGate";

const MOBILE_LABEL = { list: "배차현황", form: "오더등록", detail: "오더 상세", unassigned: "미배차", canceled: "취소 오더", fixedroute: "고정노선", ratecard: "단가표", fare: "운임조회", fleet: "지입차", dept: "부서 화면", approval: "전자결재",
  staff: "직원관리", perms: "권한 설정", myinfo: "내 정보", intel: "인사이트", drvacc: "기사 계정", drivers: "기사관리", clients: "거래처관리", settings: "설정", schedule: "일정", sales: "매출", notice: "공지", handover: "인수인계", gsheet: "구글시트", attendance: "근태", status: "현황", home: "홈" };
const SHIPPER_LABEL = { home: "홈", order: "오더 접수", status: "배차 현황", transport: "배차 현황", history: "이용 내역", detail: "오더 상세", settlement: "정산", settings: "설정", notice: "공지", inquiry: "문의", mypage: "내 정보", "change-password": "비밀번호 변경" };
export const mobileScreenLabel = (page) => MOBILE_LABEL[page] || String(page || "");
export const shipperScreenLabel = (page) => SHIPPER_LABEL[page] || String(page || "");

let last = ""; let lastHidden = null; let timer = null; let pending = null;
const flush = () => {
  timer = null;
  const id = getMySessionId(); const p = pending; pending = null;
  if (!id || !p) return;
  if (typeof window !== "undefined" && window.__kpPreviewDemo) return; // 둘러보기는 저장하지 않는다
  updateDoc(doc(db, SESSIONS_COLL, id), p).catch(() => {});
};
// label: 사람이 읽는 화면 이름("배차현황") · app: "pc" | "mobile" | "shipper" | "driver"
export function reportScreen(label, app = "pc") {
  const l = String(label || "").slice(0, 40);
  if (!l || l === last) return;
  last = l;
  pending = { ...(pending || {}), screen: l, screenAt: Date.now(), screenApp: app, screenHidden: false, appVer: CUR_VER, appBuild: CUR_BUILD }; // appVer: 이 사람이 쓰는 화면 버전(업데이트 배포 확인용)
  if (!timer) timer = setTimeout(flush, 2000);
}
// 창을 가리거나 다시 볼 때
export function installScreenVisibility() {
  if (typeof document === "undefined" || installScreenVisibility.done) return;
  installScreenVisibility.done = true;
  document.addEventListener("visibilitychange", () => {
    const hidden = document.visibilityState !== "visible";
    if (hidden === lastHidden || !last) return;
    lastHidden = hidden;
    pending = { ...(pending || {}), screenHidden: hidden, ...(hidden ? {} : { screenAt: Date.now() }) };
    if (!timer) timer = setTimeout(flush, hidden ? 0 : 2000);
  });
}
