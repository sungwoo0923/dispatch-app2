import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarClock,
  Wallet,
  BarChart3,
  ShieldCheck,
  MessageSquare,
  Settings,
  LayoutTemplate,
  Building2,
  Lock,
  KeyRound,
} from "lucide-react";

export const NAV = [
  { to: "/", label: "홈", icon: LayoutDashboard, end: true },
  {
    to: "/employees",
    label: "근로자",
    icon: Users,
    children: [
      { to: "/employees", label: "근로자 목록" },
      { to: "/employees/contracts", label: "계약관리" },
      { to: "/employees/documents", label: "서류함" },
      { to: "/employees/inquiries", label: "문의함" },
      { to: "/employees/status", label: "입퇴사현황" },
      { to: "/employees/history-access", label: "조회기간 확장요청" },
    ],
  },
  {
    to: "/schedule",
    label: "스케줄",
    icon: CalendarDays,
    children: [
      { to: "/schedule", label: "스케줄등록" },
      { to: "/attendance", label: "출근현황" },
    ],
  },
  {
    to: "/leaves/settings",
    label: "휴가",
    icon: CalendarClock,
    children: [
      { to: "/leaves/settings", label: "휴가설정" },
      { to: "/leaves/management", label: "근로자휴가관리" },
      { to: "/leaves", label: "근로자휴가신청현황" },
      { to: "/leaves/usage", label: "휴가사용현황" },
    ],
  },
  {
    to: "/safety",
    label: "안전",
    icon: ShieldCheck,
    children: [
      { to: "/safety", label: "안전교육현황" },
      { to: "/safety/settings", label: "센터별 안전관리" },
      { to: "/safety/materials", label: "안전교육자료" },
    ],
  },
  {
    to: "/payroll",
    label: "정산",
    icon: Wallet,
    children: [
      { to: "/payroll", label: "급여" },
      { to: "/payroll/settings", label: "센터별 정산설정" },
    ],
  },
  {
    to: "/stats",
    label: "통계",
    icon: BarChart3,
    children: [
      { to: "/stats", label: "오늘 현황" },
      { to: "/stats/attendance-count", label: "근로자별출근집계" },
      { to: "/stats/monthly-grid", label: "근로자별월별출근집계" },
      { to: "/stats/monthly-time", label: "근로자별월별출퇴근시간집계" },
      { to: "/stats/site-aggregate", label: "센터별집계" },
    ],
  },
  { to: "/board", label: "게시판", icon: MessageSquare },
  {
    to: "/org/entities",
    label: "조직",
    icon: Building2,
    children: [
      { to: "/org/entities", label: "사업자" },
      { to: "/org/vendors", label: "소속업체" },
      { to: "/org/centers", label: "센터" },
      { to: "/org/devices", label: "디바이스" },
    ],
  },
  {
    to: "/permissions/groups",
    label: "권한",
    icon: Lock,
    children: [
      { to: "/permissions/groups", label: "그룹등록" },
      { to: "/permissions/menus", label: "그룹별메뉴" },
    ],
  },
  {
    to: "/templates/shift",
    label: "템플릿",
    icon: LayoutTemplate,
    children: [
      { to: "/templates/shift", label: "시간" },
      { to: "/templates/allowance", label: "수당" },
      { to: "/templates/insurance", label: "보험요율" },
      { to: "/templates/reports", label: "센터별리포트" },
    ],
  },
  {
    to: "/settings/admins",
    label: "설정",
    icon: Settings,
    children: [
      { to: "/settings/admins", label: "관리자 계정" },
      { to: "/settings/org", label: "부서·직급" },
      { to: "/settings/me", label: "내 정보" },
    ],
  },
];

// 최고관리자(super admin)에게만 노출되는 항목. NAV에 포함시키지 않고 따로 두어
// AdminLayout/Breadcrumb에서 isSuperAdmin일 때만 붙이도록 한다.
export const SUPER_ADMIN_NAV_ITEM = { to: "/platform/companies", label: "가입자관리", icon: KeyRound };

// 그룹(권한)이 지정된 관리자라도 항상 접근 가능해야 하는 경로 — 홈(대시보드)과
// 본인 정보 화면까지 막히면 로그인 후 아무것도 못 하는 상태가 될 수 있다.
const ALWAYS_ALLOWED_PATHS = ["/", "/settings/me", "/notifications"];

// allowedMenuPaths가 null/undefined면 "제한 없음"(그룹이 없는 관리자 또는
// 최고관리자)으로 취급한다 — useAuth.jsx의 allowedMenuPaths 계산 규칙과 반드시 맞춰야 한다.
export function isMenuAllowed(path, allowedMenuPaths) {
  if (!allowedMenuPaths) return true;
  if (ALWAYS_ALLOWED_PATHS.includes(path)) return true;
  return allowedMenuPaths.has(path);
}

export function filterNavByPermission(navItems, allowedMenuPaths) {
  if (!allowedMenuPaths) return navItems;
  return navItems
    .map((item) => {
      if (item.children) {
        const children = item.children.filter((c) => isMenuAllowed(c.to, allowedMenuPaths));
        return children.length > 0 ? { ...item, children } : null;
      }
      return isMenuAllowed(item.to, allowedMenuPaths) ? item : null;
    })
    .filter(Boolean);
}

// Flattened path -> { section, label } lookup for the breadcrumb bar.
export function resolveBreadcrumb(pathname, navItems = NAV) {
  for (const item of navItems) {
    if (item.children) {
      const child = item.children.find((c) => pathname === c.to);
      if (child) return { section: item.label, label: child.label };
      if (pathname === item.to) return { section: item.label, label: item.children[0].label };
    } else if (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/")) {
      return { section: null, label: item.label };
    }
  }
  return { section: null, label: "" };
}
