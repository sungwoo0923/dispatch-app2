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
        아래 <strong className="text-ink">회사코드</strong>를 직원들에게 공유해주세요. 직원은 로그인 화면 &gt; 직원 회원가입에서 이 코드로 가입합니다.
      </p>
      <div className="mb-3 rounded-xl bg-primary-light px-4 py-3 text-center text-2xl font-bold tracking-widest text-primary">
        {payload.code}
      </div>
      <p className="mb-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-muted">
        ※ 이 회사코드는 <strong>직원 가입 전용</strong>입니다. 다른 관리자를 추가로 초대하려면, 로그인 후
        사이드바 &gt; 내 정보 &gt; 관리자 계정 화면에서 별도의 <strong>관리자 초대코드</strong>를 새로 발급해야 합니다.
      </p>
      <Button className="w-full" size="lg" onClick={onDismiss}>
        시작하기
      </Button>
    </AuthShell>
  );
}
