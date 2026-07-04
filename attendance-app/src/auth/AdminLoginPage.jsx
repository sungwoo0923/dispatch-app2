import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import BuildInfo from "../components/BuildInfo";
import { useAuth } from "../hooks/useAuth";
import { SUPER_ADMIN_EMAIL } from "../constants/superAdmin";

export default function AdminLoginPage() {
  const { setActiveCompanyId } = useAuth();
  const [companyCode, setCompanyCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const code = companyCode.trim().toUpperCase();
      const isSuperAdminEmail = email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

      const companySnap = await getDoc(doc(db, "companies", code));
      if (!companySnap.exists()) {
        setError("회사코드를 다시 확인해주세요.");
        setLoading(false);
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      if (isSuperAdminEmail) {
        // 최고관리자는 어느 회사 코드를 입력하든 그 회사의 프로그램으로 로그인된다.
        setActiveCompanyId(code);
        return;
      }

      const adminSnap = await getDoc(doc(db, "admins", cred.user.uid));
      const myCompanyId = adminSnap.exists() ? adminSnap.data().companyId : null;
      if (myCompanyId !== code) {
        await signOut(auth);
        setError("회사코드가 일치하지 않습니다. 본인 회사의 코드를 입력해주세요.");
        setLoading(false);
        return;
      }
      setActiveCompanyId(null);
    } catch (err) {
      setError("회사코드, 이메일 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="관리자 로그인" title="관리자 로그인">
      <form onSubmit={handleSubmit}>
        <FormField
          label="회사코드"
          required
          value={companyCode}
          onChange={(e) => setCompanyCode(e.target.value)}
          placeholder="회사 개설 시 발급된 코드"
          style={{ textTransform: "uppercase" }}
        />
        <FormField
          label="이메일"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@company.com"
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
        <Link to="/admin-signup" className="hover:text-primary">
          관리자(회사) 회원가입
        </Link>
        <span className="text-slate-300">|</span>
        <Link to="/login" className="hover:text-primary">
          직원 로그인
        </Link>
      </div>
      <BuildInfo className="mt-6" />
    </AuthShell>
  );
}
