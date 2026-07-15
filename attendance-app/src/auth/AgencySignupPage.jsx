import { useState } from "react";
import { Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import { generateInviteCode } from "../utils/ids";
import { formatPhoneNumber } from "../utils/phoneAuth";
import BuildInfo from "../components/BuildInfo";

async function createUniqueAgencyCode() {
  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode();
    const snap = await getDoc(doc(db, "agencies", code));
    if (!snap.exists()) return code;
  }
  throw new Error("연동코드 생성에 실패했습니다. 다시 시도해주세요.");
}

// 남강인력 같은 외부 인력사무소가 KP-work에 가입하는 화면 — 회사(도급사)
// 관리자 가입과 거의 같은 구조지만, companies가 아니라 agencies 컬렉션에
// 개설되고 role이 "agency"라는 점만 다르다. 가입 후 발급되는 연동코드를
// 도급사 쪽 "외부인력 > 연동업체"에 등록해야 서로 요청장을 주고받을 수 있다.
export default function AgencySignupPage() {
  const [form, setForm] = useState({ agencyName: "", name: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const updatePhone = (e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const code = await createUniqueAgencyCode();
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);

      await setDoc(doc(db, "agencies", code), {
        name: form.agencyName,
        agencyCode: code,
        phone: form.phone,
        contactName: form.name,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "agencyAdmins", cred.user.uid), {
        agencyId: code,
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "users", cred.user.uid), {
        role: "agency",
        agencyId: code,
        name: form.name,
        phone: form.phone,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "이미 사용 중인 이메일입니다." : "회원가입에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="인력사무소 회원가입" title="외부 인력사무소 개설">
      <form onSubmit={handleSubmit}>
        <FormField label="인력사무소명" required value={form.agencyName} onChange={update("agencyName")} placeholder="남강인력" />
        <FormField label="담당자 이름" required value={form.name} onChange={update("name")} placeholder="홍길동" />
        <FormField label="연락처" required value={form.phone} onChange={updatePhone} placeholder="010-0000-0000" maxLength={13} />
        <FormField label="이메일(회원ID)" type="email" required value={form.email} onChange={update("email")} placeholder="agency@example.com" />
        <FormField label="비밀번호" type="password" required minLength={6} value={form.password} onChange={update("password")} placeholder="6자 이상" />
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "생성 중..." : "인력사무소 개설하고 시작하기"}
        </Button>
      </form>
      <p className="mt-4 text-xs text-muted">
        가입 후 발급되는 연동코드를 요청을 받을 도급사에 전달하면, 도급사가 "외부인력 &gt; 연동업체"에서 그 코드로 귀사를 등록해
        요청장을 보낼 수 있습니다.
      </p>

      <div className="mt-5 text-center text-xs text-muted">
        이미 계정이 있으신가요?{" "}
        <Link to="/admin-login" className="text-primary hover:underline">
          로그인
        </Link>
      </div>
      <BuildInfo className="mt-6" />
    </AuthShell>
  );
}
