import { useEffect, useState } from "react";
import { Fingerprint, Check } from "lucide-react";
import Button from "./Button";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import {
  isPlatformAuthenticatorAvailable,
  hasBiometricRegistered,
  registerBiometric,
  removeBiometric,
  getLoginMethod,
  setLoginMethod,
} from "../utils/biometricAuth";

// PC/모바일 공용 — 관리자 "내 정보"와 직원 "내정보"에서 동일하게 쓴다.
// 등록은 이 기기(브라우저)에만 저장되므로, 기기를 바꾸면 다시 등록해야 한다.
export default function BiometricSettingsCard({ uid, label, className = "", onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [supported, setSupported] = useState(true);
  const [registered, setRegistered] = useState(() => hasBiometricRegistered(uid));
  const [method, setMethod] = useState(() => getLoginMethod(uid));
  const [working, setWorking] = useState(false);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setSupported);
  }, []);

  const register = async () => {
    setWorking(true);
    try {
      await registerBiometric(uid, label);
      setRegistered(true);
      setMethod("biometric");
      onChange?.();
      toast.success("이 기기에 생체인증이 등록되었습니다");
    } catch {
      toast.error("등록에 실패했습니다. 취소했거나 이 기기/브라우저가 지원하지 않을 수 있습니다.");
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    if (!(await confirm("이 기기의 생체인증 등록을 해제하시겠습니까?", "delete"))) return;
    removeBiometric(uid);
    setRegistered(false);
    setMethod("password");
    onChange?.();
    toast.success("생체인증이 해제되었습니다");
  };

  const choose = (m) => {
    setLoginMethod(uid, m);
    setMethod(m);
    onChange?.();
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <Fingerprint size={16} className="text-primary" />
        <p className="text-sm font-semibold text-ink">생체인증 로그인 (이 기기)</p>
      </div>

      {!supported ? (
        <p className="text-xs text-muted">이 기기/브라우저에서는 지문·Face ID 생체인증을 지원하지 않습니다.</p>
      ) : !registered ? (
        <div>
          <p className="mb-2 text-xs text-muted">이 기기에 지문 또는 Face ID를 등록하면, 다음부터 비밀번호 없이 앱을 열 수 있습니다.</p>
          <Button size="sm" variant="outline" onClick={register} disabled={working}>
            <Fingerprint size={13} /> {working ? "등록 중..." : "이 기기에 등록하기"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">다음부터 앱을 열 때:</p>
          <div className="flex flex-nowrap gap-2">
            <button
              type="button"
              onClick={() => choose("biometric")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium ${
                method === "biometric" ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
              }`}
            >
              {method === "biometric" && <Check size={13} />} 지문/Face ID
            </button>
            <button
              type="button"
              onClick={() => choose("password")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium ${
                method === "password" ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
              }`}
            >
              {method === "password" && <Check size={13} />} 비밀번호
            </button>
          </div>
          <button type="button" onClick={remove} className="text-xs text-muted underline hover:text-danger">
            이 기기 생체인증 해제
          </button>
        </div>
      )}
    </div>
  );
}
