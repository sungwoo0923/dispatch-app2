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
      { to: "/employees/status", label: "입퇴사현황" },
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
  { to: "/stats", label: "통계", icon: BarChart3 },
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
