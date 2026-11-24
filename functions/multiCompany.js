// ======================= functions/multiCompany.js =======================
// 🏢 2026-11-24 한 계정이 여러 운송사를 오가며 쓰기(예: 태진 · 큐런 대표) — 서버 쪽 계산
//  · users/{uid}.multiCompanies : 오갈 수 있는 회사 목록 — 최고관리자만 적는다(firestore.rules multiCoWriteOk)
//  · users/{uid}.activeCompany  : 지금 쓰는 회사 — 본인이 목록 안에서만 고른다(비우거나 원래 회사면 원래 회사)
//  · companyName(원래 소속 회사)은 그대로 — 근태 · 급여 · 연차 같은 내 인사 기록은 원래 회사에만 남는다
//  · 다른 회사에서는 통합관리자(allMgr)로 동작한다(마스터 · 부서 권한은 원래 회사 것이라 넘어가지 않는다 · 직책은 그대로)
//  ⚠ src/multiCompany.js 와 같은 계산(화면) — scripts/multiCompany.test.mjs 가 둘을 같이 검사한다
const NO_MULTI_ROLES = ["totalMaster", "driver", "shipper", "cafeUser"];
const MAX_COMPANIES = 10;

const s = (v) => (typeof v === "string" ? v.trim() : "");
// 허락된 다른 회사 목록(원래 회사 · 빈 칸 · 중복 제외)
function multiCompaniesOf(u) {
  const home = s(u?.companyName);
  const raw = Array.isArray(u?.multiCompanies) ? u.multiCompanies : [];
  const out = [];
  raw.forEach((v) => { const c = s(v); if (c && c !== home && !out.includes(c) && out.length < MAX_COMPANIES) out.push(c); });
  return out;
}
function canMulti(u) {
  return !!u && !NO_MULTI_ROLES.includes(s(u.role)) && u.approved !== false && s(u.employmentStatus) !== "퇴사" && s(u.companyName) !== "";
}
// 다른 회사로 들어가 있으면 그 회사 이름, 아니면 ''(허락되지 않은 값 · 원래 회사 · 빈 칸)
function guestCompanyOf(u) {
  const a = s(u?.activeCompany);
  if (!a || a === s(u?.companyName) || !canMulti(u)) return "";
  return multiCompaniesOf(u).includes(a) ? a : "";
}
// 지금 쓰는 회사
function activeCompanyOf(u) {
  return guestCompanyOf(u) || (typeof u?.companyName === "string" ? u.companyName : "");
}
// 권한 계산에 쓸 사용자 값 — 다른 회사로 들어가 있으면 회사 · 역할을 바꿔 준다(아니면 받은 값 그대로)
function effectiveUser(u) {
  const g = guestCompanyOf(u);
  if (!g) return u;
  return { ...u, companyName: g, role: "allMgr", isMaster: false, team: "", legacyTeam: "", subAdmin: false, homeCompany: u.companyName, guestCompany: true };
}

module.exports = { NO_MULTI_ROLES, MAX_COMPANIES, multiCompaniesOf, canMulti, guestCompanyOf, activeCompanyOf, effectiveUser };
