import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { User, Lock } from "lucide-react";
import { auth } from "../firebase";
import Button from "../components/Button";
import BuildInfo from "../components/BuildInfo";
import { phoneToAuthEmail, normalizePhone } from "../utils/phoneAuth";

const SAVED_PHONE_KEY = "kpwork_saved_phone";

export default function LoginPage() {
  const [phone, setPhone] = useState(() => localStorage.getItem(SAVED_PHONE_KEY) || "");
  const [password, setPassword] = useState("");
  const [savePhone, setSavePhone] = useState(() => Boolean(localStorage.getItem(SAVED_PHONE_KEY)));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToAuthEmail(phone), password);
      if (savePhone) localStorage.setItem(SAVED_PHONE_KEY, normalizePhone(phone));
      else localStorage.removeItem(SAVED_PHONE_KEY);
    } catch (err) {
      setError("회원ID 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-14">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center">
          <img src="/logo.png" alt="KP-Work" className="h-28 w-auto" />
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-medium text-muted">회원ID(휴대전화번호)</span>
            <div className="relative">
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-light"
                value={phone}
                onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 11))}
                placeholder="대시(-) 없이 숫자만 입력"
                inputMode="numeric"
                maxLength={11}
                required
              />
              <User size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
            </div>
          </label>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs font-medium text-muted">비밀번호</span>
            <div className="relative">
              <input
                type="password"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-light"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                required
              />
              <Lock size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
            </div>
          </label>

          <label className="mb-5 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={savePhone} onChange={(e) => setSavePhone(e.target.checked)} />
            회원ID 저장
          </label>

          {error && <p className="mb-3 text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        <div className="mt-4 rounded-xl bg-slate-50 py-3.5 text-center text-xs text-muted">
          아직 회원이 아니신가요?{" "}
          <Link to="/employee-signup" className="font-medium text-primary hover:underline">
            직원 회원가입
          </Link>
        </div>
        <div className="mt-3 text-center text-xs text-muted">
          관리자이신가요?{" "}
          <Link to="/admin-login" className="text-primary hover:underline">
            관리자 로그인
          </Link>
        </div>
        <BuildInfo className="mt-6" />
      </div>
    </div>
  );
}
