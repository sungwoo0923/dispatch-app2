// ======================= src/menuTree.js =======================
// ⭐ 2026-11-10 메뉴 통일 — 상단 메뉴 속메뉴(navMenus MENU_SUBS)와 각 화면 왼쪽 메뉴(사이드)가 같은 목록을 쓰게 한 곳에서 정한다.
//  · 전자결재: 홈 사이드(ap:키) · 부서/임원 화면 전자결재(ExecSuite) · 모바일 전자결재(MobilePcViews) · 상단 속메뉴가 모두 이 목록
//  · 배지(숫자)는 각 화면이 key로 붙인다.
export const APPROVAL_MENU = [
  { key: "inbox", label: "결재함", en: "INBOX", icon: "stamp" },
  { key: "leave", label: "근태·휴가 신청", en: "ATTENDANCE", icon: "clock" },
  { key: "expense", label: "비용·지출 결의", en: "EXPENSE", icon: "wallet" },
  { key: "draft", label: "업무 기안·품의", en: "PROPOSAL", icon: "file" },
  { key: "report", label: "업무 보고·인사", en: "REPORT", icon: "list" },
  { key: "contract", label: "계약서", en: "CONTRACT", icon: "pen" },
  { key: "handover", label: "인수인계", en: "HANDOVER", icon: "link" },
  { key: "mine", label: "내 기안함", en: "MY DOCUMENTS", icon: "send" },
  { key: "lines", label: "결재선 관리", en: "LINES", icon: "route" },
];
// 상단 속메뉴용 [key, label] — prefix: 홈 사이드는 "ap:"
export const approvalSubs = (prefix = "") => APPROVAL_MENU.map((it) => [`${prefix}${it.key}`, it.label]);
// 화면 왼쪽 메뉴용 — badges: { key: 숫자 | { badge, badgeTitle, ... } }
export const approvalNavItems = (prefix = "", extra = {}) => APPROVAL_MENU.map((it) => ({ ...it, key: `${prefix}${it.key}`, ...(extra[it.key] || {}) }));
