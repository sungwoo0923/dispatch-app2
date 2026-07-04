import { Hourglass, XCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";

const COPY = {
  rejected: {
    title: "회사 개설 신청이 거절되었습니다",
    body: (name) => `'${name}'의 개설 신청이 거절되었습니다. 문의사항은 운영팀에 연락해주세요.`,
  },
  suspended: {
    title: "이용이 정지된 회사입니다",
    body: (name) => `'${name}'은(는) 최고관리자에 의해 이용이 정지(탈퇴 처리)되었습니다. 문의사항은 운영팀에 연락해주세요.`,
  },
  pending: {
    title: "회사 개설 승인 대기 중입니다",
    body: (name) => `'${name}'의 개설 신청이 최고관리자 승인을 기다리고 있습니다. 승인 후 다시 로그인해주세요.`,
  },
};

export default function CompanyApprovalPendingPage({ status }) {
  const { logout, company } = useAuth();
  const copy = COPY[status] || COPY.pending;
  const blocked = status === "rejected" || status === "suspended";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <div
        className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${
          blocked ? "bg-red-50 text-danger" : "bg-primary-light text-primary"
        }`}
      >
        {blocked ? <XCircle size={30} /> : <Hourglass size={30} />}
      </div>
      <h1 className="mb-1 text-lg font-bold text-ink">{copy.title}</h1>
      <p className="mb-6 max-w-xs text-sm text-muted">{copy.body(company?.name)}</p>
      <Button variant="outline" onClick={logout}>
        로그아웃
      </Button>
    </div>
  );
}
