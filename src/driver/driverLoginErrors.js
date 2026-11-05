// src/driver/driverLoginErrors.js
// ⭐ 2026-11-05 기사 로그인 실패 사유 — 예전엔 어떤 이유로 실패해도 "차량번호 또는 이름이 올바르지 않습니다" 한 줄이거나,
//  화면이 새로고침되듯 로그인 화면으로 돌아와 아무 안내도 없었다. 실패 원인을 코드로 나눠 기사님이 바로 알아볼 수 있는
//  큰 글씨 안내(제목 + 이유 + 해결 방법)로 바꾼다. 화면(React)과 분리해 두어 단위 시험이 가능하다.

// 로그인 확인 중 표시 — App.jsx가 이 값을 보고 /driver-login·/driver-register에서 /driver-home으로 넘기지 않고,
//  퇴사 안내창(alert)·로그인 세션 기록도 잠시 미룬다(확인이 끝난 뒤 이 화면이 직접 안내한다).
export const DRIVER_BUSY_KEY = "driverValidating";
export const DRIVER_BUSY_EVENT = "kp:driverValidating";
export function setDriverBusy(on) {
  try {
    if (on) sessionStorage.setItem(DRIVER_BUSY_KEY, "true");
    else sessionStorage.removeItem(DRIVER_BUSY_KEY);
  } catch { /* 저장 불가 — 무시 */ }
  try { window.dispatchEvent(new CustomEvent(DRIVER_BUSY_EVENT, { detail: !!on })); } catch { /* 무시 */ }
}
export function isDriverBusy() {
  try { return sessionStorage.getItem(DRIVER_BUSY_KEY) === "true"; } catch { return false; }
}

// 화면이 다시 그려져도(라우트 이동·재마운트) 안내가 사라지지 않게 잠깐 보관
export const DRIVER_ERR_KEY = "driverLoginError";
export function keepDriverLoginError(info) {
  try {
    if (info) sessionStorage.setItem(DRIVER_ERR_KEY, JSON.stringify({ ...info, at: Date.now() }));
    else sessionStorage.removeItem(DRIVER_ERR_KEY);
  } catch { /* 무시 */ }
}
export function takeDriverLoginError() {
  try {
    const v = JSON.parse(sessionStorage.getItem(DRIVER_ERR_KEY) || "null");
    sessionStorage.removeItem(DRIVER_ERR_KEY);
    // 2분이 지난 안내는 버린다(다음 날 앱을 열었는데 어제 실패 안내가 뜨는 일 방지)
    if (v && Date.now() - (v.at || 0) < 120000) return v;
  } catch { /* 무시 */ }
  return null;
}

export function driverLoginError(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

const norm = (v) => String(v || "").replace(/\s+/g, "").toLowerCase();
export const sameText = (a, b) => norm(a) === norm(b);

// users/{uid} 문서로 로그인 가능 여부 판단 — 통과하면 null, 아니면 실패 코드
export function checkDriverUserDoc(u, { name, companyName }) {
  if (!u) return "driver/no-user-doc";
  if (u.role !== "driver") return "driver/not-driver";
  // 이름·운송사가 다르면 그 이유를 먼저 알려준다(남의 계정 상태를 먼저 보여주지 않게)
  if (u.name && !sameText(u.name, name)) return "driver/name-mismatch";
  if (u.companyName && !sameText(u.companyName, companyName)) return "driver/company-mismatch";
  const st = String(u.employmentStatus || "").trim();
  const status = String(u.status || "").trim().toLowerCase();
  if (st === "퇴사" || ["deleted", "withdrawn", "퇴사"].includes(status)) return "driver/retired";
  if (st === "정지" || u.suspended === true || u.disabled === true || ["suspended", "정지", "blocked"].includes(status)) return "driver/suspended";
  // 다른 작업(관리자 승인 화면)이 거절을 어떤 필드로 남기든 알아보도록 넓게 본다 — 기본은 approved:false
  const ap = String(u.approvalStatus || u.signupStatus || u.승인상태 || "").trim().toLowerCase();
  const rejected = u.rejected === true || !!u.rejectedAt || ["rejected", "거절", "반려"].includes(ap) || ["rejected", "거절", "반려"].includes(status);
  if (rejected) return "driver/rejected";
  if (!u.approved) return "driver/pending";
  return null;
}

const NETWORK_CODES = new Set(["auth/network-request-failed", "unavailable", "deadline-exceeded", "auth/timeout", "driver/network", "auth/internal-error"]);

// 오류 → { code, tone, title, message, hint }  (tone: "error" | "wait" | "stop" | "net")
export function describeDriverLoginError(err, ctx = {}) {
  const code = err?.code || "";
  const plate = String(ctx.carNo || "").trim();
  const co = String(ctx.companyName || "").trim();
  const nm = String(ctx.name || "").trim();
  const reason = String(err?.reason || "").trim();
  const base = { code: code || "unknown" };
  if (code === "driver/empty") return { ...base, tone: "error", title: "입력하지 않은 칸이 있습니다", message: `${err.field || "소속 운송사명 · 차량번호 · 이름"} 칸이 비어 있습니다.`, hint: "세 칸을 모두 채운 뒤 로그인을 눌러주세요." };
  if (NETWORK_CODES.has(code) || (typeof navigator !== "undefined" && navigator.onLine === false))
    return { ...base, code: code || "driver/network", tone: "net", title: "인터넷 연결이 불안정합니다", message: "서버에 연결하지 못해 로그인을 확인하지 못했습니다.", hint: "와이파이나 데이터가 켜져 있는지 확인한 뒤 다시 눌러주세요." };
  if (code === "auth/too-many-requests") return { ...base, tone: "stop", title: "잠시 후 다시 시도해 주세요", message: "로그인 시도가 너무 많아 잠시 막혔습니다.", hint: "1~2분 정도 기다렸다가 다시 로그인해 주세요." };
  if (code === "auth/user-disabled" || code === "driver/suspended") return { ...base, tone: "stop", title: "사용이 정지된 계정입니다", message: "관리자가 이 기사 계정의 사용을 정지했습니다.", hint: "소속 운송사 관리자에게 문의해 주세요." };
  if (code === "driver/retired") return { ...base, tone: "stop", title: "퇴사 처리된 계정입니다", message: "이 기사 계정은 퇴사 처리되어 로그인할 수 없습니다.", hint: "다시 일하시게 되었다면 소속 운송사 관리자에게 문의해 주세요." };
  if (code === "driver/pending") return { ...base, tone: "wait", title: "승인 대기 중입니다", message: `${co ? `'${co}' ` : ""}관리자가 가입 신청을 아직 승인하지 않았습니다.`, hint: "승인되면 같은 정보로 바로 로그인할 수 있습니다. 급하시면 운송사에 연락해 주세요." };
  if (code === "driver/rejected") return { ...base, tone: "stop", title: "가입 신청이 거절되었습니다", message: reason ? `거절 사유: ${reason}` : "소속 운송사 관리자가 가입 신청을 거절했습니다.", hint: "운송사명·차량번호·이름이 맞는지 확인하고 운송사 관리자에게 문의해 주세요." };
  if (code === "driver/name-mismatch") return { ...base, tone: "error", title: "이름이 다릅니다", message: `차량번호 ${plate || ""}로 등록된 기사 이름과 입력하신 이름${nm ? `('${nm}')` : ""}이 다릅니다.`.replace(/\s+로/, "로"), hint: "가입할 때 적은 실명을 띄어쓰기 없이 정확히 입력해 주세요." };
  if (code === "driver/company-mismatch" || code === "driver/other-company") return { ...base, tone: "error", title: "소속 운송사가 다릅니다", message: `차량번호 ${plate || ""}는 ${co ? `'${co}'` : "입력하신 운송사"} 소속으로 등록되어 있지 않습니다.`, hint: "가입할 때 고른 운송사명을 정확히 입력해 주세요. 다른 운송사로 옮기셨다면 그 운송사로 새로 기사 등록을 해주세요." };
  if (code === "driver/not-driver") return { ...base, tone: "error", title: "기사 계정이 아닙니다", message: "이 정보는 운송사 직원 또는 화주사 계정입니다.", hint: "가입하신 로그인 화면(운송사/화주사)에서 로그인해 주세요." };
  if (code === "driver/no-user-doc") return { ...base, tone: "error", title: "가입 정보를 찾을 수 없습니다", message: "계정은 있지만 기사 가입 정보가 없습니다(거절되었거나 삭제되었을 수 있습니다).", hint: "기사 등록을 다시 하시거나 운송사 관리자에게 문의해 주세요." };
  if (code === "driver/not-registered" || code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-login-credentials" || code === "auth/invalid-email")
    return { ...base, code: "driver/not-registered", tone: "error", title: "등록된 차량번호가 없습니다", message: `${plate ? `차량번호 '${plate}'` : "입력하신 차량번호"}로 가입된 기사 정보를 찾지 못했습니다.`, hint: "차량번호를 다시 확인해 주세요(예: 경기97가1234). 아직 가입하지 않으셨다면 아래 '기사 등록하기'를 눌러주세요." };
  return { ...base, tone: "error", title: "로그인하지 못했습니다", message: "알 수 없는 이유로 로그인 확인에 실패했습니다.", hint: `잠시 후 다시 시도해 주세요. 계속되면 운송사 관리자에게 문의해 주세요.${code ? ` (오류: ${code})` : ""}` };
}
