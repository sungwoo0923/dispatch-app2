import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { shouldLockInsteadOfSignOut, verifyBiometric, BIOMETRIC_SESSION_KEY } from "../utils/biometricAuth";
import Button from "./Button";

// 앱을 다시 열 때(탭/앱 껐다 켜기) 이 기기에 생체인증이 등록되어 있고
// "다음부터 생체인증으로 로그인"이 켜져 있으면, 실제 라우트를 그리기 전에
// 지문/Face ID 확인을 한 번 더 요구한다. 세션 내 재확인(뒤로가기 등)은
// sessionStorage로 건너뛴다 — 탭을 완전히 새로 열 때만 다시 잠긴다.
export default function BiometricGate({ children }) {
  const { user, logout } = useAuth();
  const shouldLock = shouldLockInsteadOfSignOut(user?.uid);
  const [unlocked, setUnlocked] = useState(() => !shouldLock || sessionStorage.getItem(BIOMETRIC_SESSION_KEY) === user?.uid);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const attempt = async () => {
    setVerifying(true);
    setError("");
    try {
      const ok = await verifyBiometric(user.uid);
      if (ok) {
        sessionStorage.setItem(BIOMETRIC_SESSION_KEY, user.uid);
        setUnlocked(true);
      } else {
        setError("생체인증에 실패했습니다. 다시 시도해주세요.");
      }
    } catch {
      setError("생체인증을 사용할 수 없습니다. 다시 시도하거나 비밀번호로 로그인해주세요.");
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (shouldLock && !unlocked) attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLock]);

  if (!shouldLock || unlocked) return children;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-6 text-center">
      <img src="/logo.png" alt="KP-Work" className="w-32" />
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary">
        <Fingerprint size={30} />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">생체인증으로 로그인</p>
        <p className="mt-1 text-xs text-muted">지문 또는 Face ID로 본인 확인 후 계속 진행하세요</p>
      </div>
      {error && <p className="max-w-xs text-xs text-danger">{error}</p>}
      <Button onClick={attempt} disabled={verifying} size="lg">
        {verifying ? "확인 중..." : "다시 시도"}
      </Button>
      <button type="button" onClick={() => logout()} className="text-xs text-muted underline">
        비밀번호로 로그인
      </button>
    </div>
  );
}
