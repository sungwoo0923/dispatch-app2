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
} from "lucide-react";

export const NAV = [
  { to: "/", label: "홈", icon: LayoutDashboard, end: true },
  {
    to: "/employees",
    label: "근로자",
    icon: Users,
    children: [
      { to: "/employees", label: "근로자 목록" },
      { to: "/employees/contracts", label: "계약서" },
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
  { to: "/leaves", label: "휴가", icon: CalendarClock },
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
  { to: "/templates", label: "템플릿", icon: LayoutTemplate },
  {
    to: "/settings/admins",
    label: "설정",
    icon: Settings,
    children: [
      { to: "/settings/admins", label: "관리자 계정" },
      { to: "/settings/org", label: "부서·직급" },
    ],
  },
];

// Flattened path -> { section, label } lookup for the breadcrumb bar.
export function resolveBreadcrumb(pathname) {
  for (const item of NAV) {
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
