// ======================= src/bizModules.js =======================
// 🧭 2026-11-12 업무 영역(내륙 · 컨테이너 · 해상 · 항공) — 운송사마다 쓰는 업무가 다르다.
//  · 가입할 때 고른다(Signup.jsx) → 승인하면 companyFeatures/{회사} 에 modInland · modContainer · modSea · modAir 로 저장
//  · 4개를 모두 고르면 "통합(종합물류)" — 1~3개는 고른 영역만(2026-11-13 사용자 요청: 3개도 개별)
//  · 예전부터 쓰던 운송사는 내륙만(기본값). 아래 PRESET 회사는 저장값이 없어도 통합
//  · 메뉴 키: "biz:<영역>:<화면>" — 상단 메뉴 · 왼쪽 메뉴 · menuState가 이 키를 그대로 쓴다
import { useCompanyFeatures } from "./companyFeatures";

export const BIZ = {
  inland: { key: "inland", label: "내륙운송", short: "내륙", en: "INLAND", feature: "modInland", color: "#2D4C82", desc: "윙바디 · 카고 · 냉동탑 등 내륙 화물 배차" },
  container: { key: "container", label: "컨테이너운송", short: "컨테이너", en: "CONTAINER", feature: "modContainer", color: "#1B2B4B", desc: "수출입 컨테이너 픽업 · 작업 · 반입/반납" },
  sea: { key: "sea", label: "해상", short: "해상", en: "OCEAN", feature: "modSea", color: "#4B6CB7", desc: "FCL · LCL 선적, B/L, 서류 · 화물 마감" },
  air: { key: "air", label: "항공", short: "항공", en: "AIR", feature: "modAir", color: "#7C97CC", desc: "AWB, 편명, 운임중량, 반입 마감" },
};
export const BIZ_KEYS = ["inland", "container", "sea", "air"];
export const GROUP = { key: "group", label: "통합 현황", short: "통합", en: "GROUP CONTROL", color: "#0F1A30", desc: "전 사업부 건수 · 마감 · 손익을 한 화면에서" };
export const bizInfo = (k) => BIZ[k] || (k === "group" ? GROUP : BIZ.inland);

// 저장값이 없어도 통합으로 여는 회사(사용자 요청 2026-11-12) — 관리센터에서 끄면 그 값이 우선
// 🛠 2026-11-13 사용자 요청 — 업무 영역을 고르기 전에 가입한 운송사는 전부 내륙만. 통합 · 컨테이너 등은 관리센터에서 회사별로 켠다
export const BIZ_PRESET = {};
export function presetFeatures(company) {
  const p = BIZ_PRESET[String(company || "").trim()];
  if (!p) return null;
  const o = {};
  BIZ_KEYS.forEach((k) => { o[BIZ[k].feature] = p.includes(k); });
  return o;
}

// 가입 화면 규칙 — 고른 그대로(4개 모두 = 통합). 아무것도 안 고르면 내륙
export function packModules(selected) {
  const s = BIZ_KEYS.filter((k) => (selected || []).includes(k));
  return s.length ? s : ["inland"];
}
export const isAllModules = (list) => BIZ_KEYS.every((k) => (list || []).includes(k));
export const modulesLabel = (list) => (isAllModules(list) ? "통합(내륙 · 컨테이너 · 해상 · 항공)" : (list || []).map((k) => BIZ[k]?.short).filter(Boolean).join(" · ") || "내륙");
// companyFeatures 에 쓸 값
export function modulesToFeatures(list) {
  const o = {};
  BIZ_KEYS.forEach((k) => { o[BIZ[k].feature] = (list || []).includes(k); });
  return o;
}
export function modulesFromFeatures(f) {
  const out = BIZ_KEYS.filter((k) => f?.[BIZ[k].feature] === true);
  return out.length ? out : ["inland"];
}
// 이 회사가 쓰는 업무 영역 — { list: ["inland", ...], loaded }
export function useBizModules(company) {
  const f = useCompanyFeatures(company);
  const key = BIZ_KEYS.map((k) => (f[BIZ[k].feature] === true ? "1" : "0")).join("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return { list: modulesFromFeatures(f), loaded: f.loaded, key };
}

// ── 메뉴 ─────────────────────────────────────────────────────────────
export const isBizMenu = (m) => typeof m === "string" && m.startsWith("biz:");
export const bizMenuKey = (biz, page) => `biz:${biz}:${page}`;
export const parseBizMenu = (m) => { const [, biz, page] = String(m || "").split(":"); return { biz, page }; };
// 🎨 2026-11-18 컨테이너 · 해상 · 항공 메뉴를 내륙과 같은 묶음으로(사용자 요청 — "디자인 전체를 내륙과 동일하게")
//  홈 / 배차(오더등록 · 실시간현황 · 운송현황) / 운임(운임조회) / 기사관리 / 거래처 / 매출(매출관리) / 정산(정산관리) / 지입차관리 / 회사관리 / 관리자메뉴
//  예전 화면 키(dash · deadline · handoff)는 운송현황 안의 탭으로 연다(FreightWorkspace)
const PAGE_LABEL = {
  dash: "대시보드", new: "오더등록", live: "실시간현황", list: "운송현황", fare: "운임조회", deadline: "마감보드", pnl: "매출관리", settle: "정산관리", handoff: "인계함", staff: "업무 담당",
  overview: "통합 현황", jobs: "Job 타임라인", clients: "거래처 360",
};
const PAGE_LABEL_BY_BIZ = {
  sea: { new: "선적등록", live: "실시간선적", list: "선적현황" },
  air: { new: "항공등록", live: "실시간항공", list: "항공현황" },
  group: { deadline: "전사 마감", pnl: "전사 손익" },
};
export function bizMenuLabel(m) {
  if (!isBizMenu(m)) return "";
  const { biz, page } = parseBizMenu(m);
  return PAGE_LABEL_BY_BIZ[biz]?.[page] || PAGE_LABEL[page] || "";
}
export const BIZ_MENU_ICON = { dash: "dashboard", new: "truck", live: "pulse", list: "sheet", fare: "money", deadline: "clock", pnl: "chart", settle: "inbox", handoff: "link", staff: "users", overview: "chart", jobs: "route", clients: "building" };
// 운송현황 안의 탭(내륙 배차현황 › 미배차현황 · 고정노선현황처럼)
export const BIZ_LIST_TABS = ["list", "pending", "deadline", "handoff"];
const GROUP_PAGES = ["overview", "jobs", "deadline", "pnl", "clients", "staff"];
// 그 업무 영역의 상단 메뉴 목록(내륙은 기존 목록을 그대로 쓰므로 null)
export function bizTopMenus(biz) {
  if (biz === "group") return ["HOME", ...GROUP_PAGES.map((p) => bizMenuKey("group", p)), "회사관리", "관리자메뉴"];
  if (!["container", "sea", "air"].includes(biz)) return null;
  const k = (p) => bizMenuKey(biz, p);
  return ["HOME", k("new"), k("live"), k("list"), k("fare"),
    ...(biz === "container" ? ["기사관리"] : []), "거래처관리", k("pnl"), k("settle"),
    ...(biz === "container" ? ["지입차관리"] : []), "회사관리", "관리자메뉴"];
}
export function bizSideGroups(biz) {
  const top = bizTopMenus(biz);
  if (!top) return null;
  if (biz === "group") return [{ label: bizInfo(biz).label, items: top.filter(isBizMenu) }, { label: "공통", items: top.filter((m) => !isBizMenu(m)) }];
  const k = (p) => bizMenuKey(biz, p);
  return [
    { label: "홈", items: ["HOME"] },
    { label: "배차", items: [k("new"), k("live"), k("list")] },
    { label: "운임", items: [k("fare")] },
    ...(biz === "container" ? [{ label: "기사관리", items: ["기사관리"] }] : []),
    { label: "거래처", items: ["거래처관리"] },
    { label: "매출", items: [k("pnl")] },
    { label: "정산", items: [k("settle")] },
    ...(biz === "container" ? [{ label: "지입차관리", items: ["지입차관리"] }] : []),
    { label: "회사관리", items: ["회사관리"] },
    { label: "관리자메뉴", items: ["관리자메뉴"] },
  ];
}
// 처음 화면 — 내륙처럼 HOME(업무별 홈 데크). 통합은 통합 현황
export const bizFirstMenu = (biz) => (biz === "group" ? bizMenuKey("group", "overview") : "HOME");

// 계정마다 마지막으로 본 업무 영역
const LS = (uid) => `kpBiz:${uid || "me"}`;
export function readBiz(uid) { try { return localStorage.getItem(LS(uid)) || ""; } catch { return ""; } }
export function writeBiz(uid, biz) { try { localStorage.setItem(LS(uid), biz); } catch { /* 무시 */ } }

// 그 업무의 화면 목록(모바일 탭) — [[메뉴 키, 이름]]
export function bizPages(biz) {
  const pages = biz === "group" ? GROUP_PAGES : biz === "inland" ? ["handoff"] : ["new", "live", "list", "fare", "pnl", "settle"];
  return pages.map((p) => { const k = bizMenuKey(biz, p); return [k, biz === "inland" ? "내륙 인계함" : bizMenuLabel(k)]; });
}
