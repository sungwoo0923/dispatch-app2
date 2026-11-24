// ======================= src/multiCompany.js =======================
// 🏢 2026-11-24 한 계정이 여러 운송사를 오가며 쓰기(예: 태진 · 큐런 대표) — 화면 쪽 계산
//  · users/{uid}.multiCompanies : 오갈 수 있는 회사 목록 — 최고관리자만 적는다(firestore.rules multiCoWriteOk)
//  · users/{uid}.activeCompany  : 지금 쓰는 회사 — 본인이 목록 안에서만 고른다(비우거나 원래 회사면 원래 회사)
//  · companyName(원래 소속 회사)은 그대로 — 근태 · 급여 · 연차 같은 내 인사 기록은 원래 회사에만 남는다
//  · 다른 회사에서는 통합관리자(allMgr)로 동작한다(마스터 · 부서 권한은 원래 회사 것이라 넘어가지 않는다 · 직책은 그대로)
//  ⚠ functions/multiCompany.js 와 같은 계산(서버) — scripts/multiCompany.test.mjs 가 둘을 같이 검사한다
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

export { NO_MULTI_ROLES, MAX_COMPANIES, multiCompaniesOf, canMulti, guestCompanyOf, activeCompanyOf, effectiveUser };

// ───────────── 화면 상태(App.jsx 가 users/{uid} 를 받을 때마다 채운다) ─────────────
//  home: 원래 소속 회사 · list: 오갈 수 있는 다른 회사 · active: 지금 쓰는 회사 · guest: 다른 회사로 들어가 있는지
// 🎨 회사마다 다른 색(사용자 요청 "회사전환마다 색다르게") — 내 회사 목록 안 순서로 정해 두 회사가 같은 색이 되지 않게
export const CO_TONES = [
  { key: "navy", main: "#2D4C82", deep: "#0F1A30", soft: "#EEF3FC", ink: "#1B2B4B", name: "네이비" },
  { key: "emerald", main: "#0F7B5F", deep: "#06362A", soft: "#E8F5F0", ink: "#0B4D3C", name: "에메랄드" },
  { key: "wine", main: "#8A2F45", deep: "#3A1220", soft: "#F8ECEF", ink: "#5E1F2F", name: "와인" },
  { key: "gold", main: "#9A7430", deep: "#3B2C10", soft: "#FAF4E6", ink: "#6B5020", name: "골드" },
  { key: "violet", main: "#5B4A9E", deep: "#221A45", soft: "#F0EDFA", ink: "#3D3170", name: "바이올렛" },
  { key: "teal", main: "#0E6E80", deep: "#06303A", soft: "#E6F3F6", ink: "#0A4A57", name: "틸" },
];
let mState = { uid: "", home: "", list: [], active: "", guest: false };
const mSubs = new Set();
export function getMultiState() { return mState; }
export function subscribeMulti(fn) { mSubs.add(fn); return () => mSubs.delete(fn); }
export function setMultiState(next) {
  const n = { uid: "", home: "", list: [], active: "", guest: false, ...(next || {}) };
  if (JSON.stringify(n) === JSON.stringify(mState)) return;
  mState = n;
  applyCompanyTone();
  mSubs.forEach((f) => { try { f(mState); } catch { /* 무시 */ } });
}
// 사용자 문서(원본) → 화면 상태
export function multiStateOf(uid, raw) {
  if (!raw || !canMulti(raw)) return { uid: uid || "", home: s(raw?.companyName), list: [], active: s(raw?.companyName), guest: false };
  const g = guestCompanyOf(raw);
  return { uid: uid || "", home: s(raw.companyName), list: multiCompaniesOf(raw), active: g || s(raw.companyName), guest: !!g };
}
export function toneOf(co, st = mState) {
  const all = [st.home, ...st.list];
  const i = all.indexOf(s(co));
  return CO_TONES[(i < 0 ? 0 : i) % CO_TONES.length];
}
// 여러 회사 계정만 화면 맨 위 얇은 띠 · 회사 칩에 회사 색을 입힌다(그 밖의 계정은 지금 화면 그대로)
function applyCompanyTone() {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (!mState.list.length) { el.removeAttribute("data-kp-co-tone"); return; }
  const t = toneOf(mState.active);
  el.setAttribute("data-kp-co-tone", t.key);
  el.style.setProperty("--kp-co-main", t.main);
  el.style.setProperty("--kp-co-deep", t.deep);
  el.style.setProperty("--kp-co-soft", t.soft);
}
