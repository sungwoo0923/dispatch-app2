// ======================= src/billingAccess.js =======================
// 💳 2026-11-03 구독·결제 화면 권한 — 한 곳에서 정하고 관리자메뉴·시작 체크리스트·화면 안 가드가 같이 쓴다
//  · 보기: 경리팀(경리 test · 통합인사경리 hrAcct · 부서 이름에 경리/회계/재무) · 임원(부서 "임원" 또는 대표·전무·이사 등 임원 직책) · 최고관리자
//  · 바꾸기(요금제 변경 요청 · 입금 알림 · 결제 수단): 경리팀·재무 + 최고관리자만. 임원·대표는 보기만
//  · 회사 마스터(운송관리자)라도 위에 해당하지 않으면 안 보인다(마스터가 대표 직책이면 보기 가능)
//  · 서버 규칙(firestore.rules › platformInvoices · planRequests)도 같은 기준
import { isExecProfile } from "./hrConstants";

export const isFinanceProfile = (u, role = "") => {
  const r = role || u?.role || "";
  return r === "test" || r === "hrAcct" || /경리|회계|재무/.test(String(u?.team || ""));
};

export function billingAccess(u, { totalMaster = false, role = "", viewer = false } = {}) {
  const r = role || u?.role || "";
  if (totalMaster || r === "totalMaster") return { view: true, edit: !viewer };
  if (!u || r === "shipper" || r === "driver") return { view: false, edit: false };
  const finance = isFinanceProfile(u, r);
  const exec = isExecProfile(u) || /임원/.test(String(u?.team || ""));
  return { view: finance || exec, edit: finance && !viewer && r !== "viewer" };
}
