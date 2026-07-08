import { Link } from "react-router-dom";
import { FolderOpen, ShieldCheck, ChevronRight, LogOut } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import BuildInfo from "../components/BuildInfo";

const ITEMS = [
  { to: "/documents", label: "서류함", icon: FolderOpen },
  { to: "/safety", label: "안전교육", icon: ShieldCheck },
  { to: "/safety/archive", label: "안전교육자료", icon: ShieldCheck },
];

export default function MyInfoPage() {
  const { profile, logout } = useAuth();

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">내정보</h2>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-base font-semibold text-primary">
            {profile?.name?.[0] || "K"}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{profile?.name}님</p>
            <p className="text-xs text-muted">{profile?.phone}</p>
          </div>
        </div>
      </Card>

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

      <Button variant="outline" className="w-full" onClick={logout}>
        <LogOut size={16} /> 로그아웃
      </Button>
      <BuildInfo className="pt-2" />
    </div>
  );
}
