import { Hourglass, XCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";

const COPY = {
  rejected: {
    title: "가입 신청이 거절되었습니다",
    body: (name) => `'${name}'의 가입 신청이 거절되었습니다. 요청하신 도급사에 문의해주세요.`,
  },
  pending: {
    title: "가입 승인 대기 중입니다",
    body: (name) => `'${name}'의 가입 신청이 요청하신 도급사 관리자의 승인을 기다리고 있습니다. 승인 후 다시 로그인해주세요.`,
  },
};

export default function AgencyApprovalPendingPage() {
  const { logout, agency } = useAuth();
  const status = agency?.status === "rejected" ? "rejected" : "pending";
  const copy = COPY[status];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div
        className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${
          status === "rejected" ? "bg-red-50 text-danger" : "bg-primary-light text-primary"
        }`}
      >
        {status === "rejected" ? <XCircle size={30} /> : <Hourglass size={30} />}
      </div>
      <h1 className="mb-1 text-lg font-bold text-ink">{copy.title}</h1>
      <p className="mb-6 max-w-xs text-sm text-muted">{copy.body(agency?.name)}</p>
      <Button variant="outline" onClick={logout}>
        로그아웃
      </Button>
    </div>
  );
}
