import { useState } from "react";
import { Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import { generateInviteCode } from "../utils/ids";
import { DEFAULT_PAYROLL_RATES } from "../utils/payroll";
import { PENDING_INVITE_KEY } from "../constants/session";

async function createUniqueCompanyCode() {
  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode();
    const snap = await getDoc(doc(db, "companies", code));
    if (!snap.exists()) return code;
  }
  throw new Error("초대코드 생성에 실패했습니다. 다시 시도해주세요.");
}

export default function AdminSignupPage() {
  const [form, setForm] = useState({ companyName: "", name: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const code = await createUniqueCompanyCode();

      // Written before sign-in so it's already present the instant
      // onAuthStateChanged flips the top-level router to the admin tree
      // (App.jsx reads this to show the invite-code screen once).
      sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code, companyName: form.companyName }));

      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);

      await setDoc(doc(db, "companies", code), {
        name: form.companyName,
        inviteCode: code,
        payrollRates: DEFAULT_PAYROLL_RATES,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "admins", cred.user.uid), {
        companyId: code,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "users", cred.user.uid), {
        role: "admin",
        companyId: code,
        name: form.name,
        phone: form.phone,
        approved: true,
        employmentStatus: "재직",
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      setError(err.code === "auth/email-already-in-use" ? "이미 사용 중인 이메일입니다." : "회원가입에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="관리자(회사) 회원가입" title="새 회사 개설">
      <form onSubmit={handleSubmit}>
        <FormField label="회사명" required value={form.companyName} onChange={update("companyName")} placeholder="(주)케이피물류" />
        <FormField label="관리자 이름" required value={form.name} onChange={update("name")} placeholder="홍길동" />
        <FormField label="연락처" required value={form.phone} onChange={update("phone")} placeholder="010-0000-0000" />
        <FormField label="이메일" type="email" required value={form.email} onChange={update("email")} placeholder="admin@company.com" />
        <FormField label="비밀번호" type="password" required minLength={6} value={form.password} onChange={update("password")} placeholder="6자 이상" />
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "생성 중..." : "회사 개설하고 시작하기"}
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
