import AuthShell from "../auth/AuthShell";
import Button from "../components/Button";

export default function SignupSuccessPage({ payload, onDismiss }) {
  return (
    <AuthShell subtitle="회사 개설 완료" title="회사가 개설되었습니다">
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
