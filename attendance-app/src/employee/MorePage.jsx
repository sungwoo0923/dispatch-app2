import { Link } from "react-router-dom";
import { Wallet, CalendarClock, FileSignature, FolderOpen, ShieldCheck, MessageSquare, ChevronRight } from "lucide-react";
import Card from "../components/Card";

const ITEMS = [
  { to: "/payslips", label: "급여명세서", icon: Wallet },
  { to: "/leave", label: "휴가", icon: CalendarClock },
  { to: "/contracts", label: "계약서", icon: FileSignature },
  { to: "/documents", label: "서류함", icon: FolderOpen },
  { to: "/safety", label: "안전교육", icon: ShieldCheck },
  { to: "/board", label: "게시판", icon: MessageSquare },
];

export default function MorePage() {
  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">더보기</h2>
      {ITEMS.map(({ to, label, icon: Icon }) => (
        <Link key={to} to={to}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Icon size={18} />
              </div>
              <p className="text-sm font-medium text-ink">{label}</p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
