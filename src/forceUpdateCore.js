// ======================= src/forceUpdateCore.js =======================
// ⏱ 2026-11-24 강제 업데이트 예약 — 계산만(화면 · 관리센터 · 테스트가 같이 쓴다)
//  문서: systemConfig/forceUpdate (최고관리자만 쓰고, 로그인한 누구나 읽는다 — firestore.rules systemConfig)
//   { id, active, fireAt(ms), createdAt(ms), by, scope: "all" | "pick", companies: [..], shippers: bool,
//     build, version, message, history: [{ id, at, scope, companies, mins, version, canceled }] }
export const FORCE_DOC = ["systemConfig", "forceUpdate"];
export const DEFAULT_FORCE_MSG = "안정성 향상과 기능 개선을 위해 최신 버전이 적용됩니다 · 작성 중인 내용은 미리 저장해 주세요";
export const DELAY_OPTIONS = [0, 1, 3, 5, 10, 30];

const s = (v) => (typeof v === "string" ? v.trim() : "");
// 이 사람(회사 · 역할)이 예약 대상인지 — 최고관리자 · 부관리자는 대상이 아니다(늘 최신 화면)
export function forceApplies(cfg, { company = "", role = "", linkedCompany = "" } = {}) {
  if (!cfg || cfg.active !== true || !Number(cfg.fireAt)) return false;
  if (role === "totalMaster") return false;
  if (role === "shipper") {
    if (cfg.shippers !== true) return false;
    if (cfg.scope !== "pick") return true;
    return (cfg.companies || []).map(s).includes(s(linkedCompany));
  }
  if (cfg.scope !== "pick") return true;
  return (cfg.companies || []).map(s).includes(s(company));
}
// 이 화면이 예약 버전보다 예전인지(같거나 새로우면 안내 없음)
export function forceBehind(cfg, curBuild) {
  const b = s(cfg?.build); const c = s(curBuild);
  if (!b || !c) return false;
  return c < b;
}
// 남은 시간(초) — 음수면 0
export function forceLeft(cfg, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(cfg?.fireAt) - now) / 1000));
}
export function fmtLeft(sec) {
  const m = Math.floor(sec / 60); const r = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
