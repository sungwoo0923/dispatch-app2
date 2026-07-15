import { useState } from "react";
import { Hourglass, XCircle, Copy, Check } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/Button";

const COPY = {
  rejected: {
    title: "가입 신청이 거절되었습니다",
    body: (name) => `'${name}'의 가입 신청이 거절되었습니다. 문의사항은 요청하신 도급사에 연락해주세요.`,
  },
  pending: {
    title: "가입 승인 대기 중입니다",
    body: (name) => `'${name}'의 가입 신청이 도급사 관리자의 승인을 기다리고 있습니다. 승인되면 아래 연동코드로 다시 로그인해주세요.`,
  },
};

export default function AgencyApprovalPendingPage() {
  const { logout, agency } = useAuth();
  const [copied, setCopied] = useState(false);
  const status = agency?.status === "rejected" ? "rejected" : "pending";
  const copy = COPY[status];

  const copyCode = () => {
    if (!agency?.id) return;
    navigator.clipboard?.writeText(agency.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
      <p className="mb-5 max-w-xs text-sm text-muted">{copy.body(agency?.name)}</p>
      {status === "pending" && agency?.id && (
        <button
          type="button"
          onClick={copyCode}
          className="mb-6 inline-flex items-center gap-2 rounded-xl bg-primary-light px-4 py-2.5 font-mono text-base font-bold text-primary"
        >
          {agency.id} {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      )}
      <Button variant="outline" onClick={logout}>
        로그아웃
      </Button>
    </div>
  );
}
