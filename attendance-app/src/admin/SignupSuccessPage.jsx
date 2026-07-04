import AuthShell from "../auth/AuthShell";
import Button from "../components/Button";

export default function SignupSuccessPage({ payload, onDismiss }) {
  return (
    <AuthShell subtitle="회사 개설 완료" title={payload.pending ? "가입 신청이 접수되었습니다" : "회사가 개설되었습니다"}>
      {payload.pending && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
          최고관리자 승인 후 서비스를 이용하실 수 있습니다. 승인이 완료되면 지금 계정으로 바로 로그인해 이용하실 수 있어요.
        </p>
      )}
      <p className="mb-2 text-sm text-muted">
        아래 초대코드를 직원들에게 공유해주세요. 직원은 이 코드로 회원가입합니다.
      </p>
      <div className="mb-5 rounded-xl bg-primary-light px-4 py-3 text-center text-2xl font-bold tracking-widest text-primary">
        {payload.code}
      </div>
      <Button className="w-full" size="lg" onClick={onDismiss}>
        시작하기
      </Button>
    </AuthShell>
  );
}
