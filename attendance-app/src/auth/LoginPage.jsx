import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="도급직원 출퇴근 · 급여관리">
      <form onSubmit={handleSubmit}>
        <FormField
          label="이메일"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <FormField
          label="비밀번호"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </Button>
      </form>
      <div className="mt-5 flex items-center justify-center gap-4 text-xs text-muted">
        <Link to="/employee-signup" className="hover:text-primary">
          직원 회원가입
        </Link>
        <span className="text-slate-300">|</span>
        <Link to="/admin-signup" className="hover:text-primary">
          관리자(회사) 회원가입
        </Link>
      </div>
    </AuthShell>
  );
}
