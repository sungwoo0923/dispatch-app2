import { useState } from "react";
import { Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import { toDateKey } from "../utils/dateUtils";

export default function EmployeeSignupPage() {
  const [form, setForm] = useState({ inviteCode: "", name: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const code = form.inviteCode.trim().toUpperCase();
      const companySnap = await getDoc(doc(db, "companies", code));
      if (!companySnap.exists()) {
        setError("초대코드를 다시 확인해주세요.");
        setLoading(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);

      await setDoc(doc(db, "users", cred.user.uid), {
        role: "employee",
        companyId: code,
        name: form.name,
        phone: form.phone,
        approved: false,
        employmentStatus: "재직",
        hireDate: toDateKey(),
        workSiteId: null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "이미 사용 중인 이메일입니다." : "회원가입에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="직원 회원가입" title="회사 초대코드로 가입">
      <form onSubmit={handleSubmit}>
        <FormField
          label="회사 초대코드"
          required
          value={form.inviteCode}
          onChange={update("inviteCode")}
          placeholder="관리자에게 받은 코드 (예: A3B7K9)"
          style={{ textTransform: "uppercase" }}
        />
        <FormField label="이름" required value={form.name} onChange={update("name")} placeholder="홍길동" />
        <FormField label="연락처" required value={form.phone} onChange={update("phone")} placeholder="010-0000-0000" />
        <FormField label="이메일" type="email" required value={form.email} onChange={update("email")} placeholder="you@company.com" />
        <FormField label="비밀번호" type="password" required minLength={6} value={form.password} onChange={update("password")} placeholder="6자 이상" />
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "가입 중..." : "가입 신청"}
        </Button>
      </form>
      <div className="mt-5 text-center text-xs text-muted">
        이미 계정이 있으신가요?{" "}
        <Link to="/login" className="text-primary hover:underline">
          로그인
        </Link>
      </div>
    </AuthShell>
  );
}
