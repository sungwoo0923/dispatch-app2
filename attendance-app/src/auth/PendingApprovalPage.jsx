import { Hourglass } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";

export default function PendingApprovalPage() {
  const { logout, profile } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-light text-primary">
        <Hourglass size={30} />
      </div>
      <h1 className="mb-1 text-lg font-bold text-ink">승인 대기 중입니다</h1>
      <p className="mb-6 max-w-xs text-sm text-muted">
        {profile?.name}님의 가입 신청이 관리자 승인을 기다리고 있습니다. 승인 후 다시 로그인해주세요.
      </p>
      <Button variant="outline" onClick={logout}>
        로그아웃
      </Button>
    </div>
  );
}
