import { useState } from "react";
import { Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import { generateInviteCode } from "../utils/ids";
import { formatPhoneNumber } from "../utils/phoneAuth";
import BuildInfo from "../components/BuildInfo";
import { DEFAULT_PAYROLL_RATES } from "../utils/payroll";
import { PENDING_INVITE_KEY } from "../constants/session";
import { TEAM_OPTIONS, POSITION_OPTIONS } from "../constants/hr";
import { SUPER_ADMIN_EMAIL } from "../constants/superAdmin";

async function createUniqueCompanyCode() {
  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode();
    const snap = await getDoc(doc(db, "companies", code));
    if (!snap.exists()) return code;
  }
  throw new Error("초대코드 생성에 실패했습니다. 다시 시도해주세요.");
}

// 부서/직급 start out editable-per-company, seeded from the app defaults so
// existing selects have sensible options from day one. A 사업자 matching the
// company's own name is also seeded so 근로자등록의 "사업자" 선택란이 처음부터
// 비어있지 않게 한다 — 실제 사업자등록번호는 조직 > 사업자에서 나중에 채우면 된다.
async function seedOrgDefaults(companyId, companyName) {
  const batch = writeBatch(db);
  TEAM_OPTIONS.forEach((name) => batch.set(doc(collection(db, "departments")), { companyId, name }));
  POSITION_OPTIONS.forEach((name) => batch.set(doc(collection(db, "positions")), { companyId, name }));
  batch.set(doc(collection(db, "businessEntities")), {
    companyId,
    name: companyName,
    regNumber: "",
    phone: "",
    address: "",
    memberDetailYN: "등록",
    active: "사용",
  });
  await batch.commit();
}

export default function AdminSignupPage() {
  const [mode, setMode] = useState("new"); // 'new' | 'join'
  const [form, setForm] = useState({ companyName: "", adminCode: "", name: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const updatePhone = (e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }));

  const handleSubmitNew = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const code = await createUniqueCompanyCode();
      const isSuperAdminSignup = form.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

      // Written before sign-in so it's already present the instant
      // onAuthStateChanged flips the top-level router to the admin tree
      // (App.jsx reads this to show the invite-code screen once).
      sessionStorage.setItem(
        PENDING_INVITE_KEY,
        JSON.stringify({ code, companyName: form.companyName, pending: !isSuperAdminSignup })
      );

      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);

      await setDoc(doc(db, "companies", code), {
        name: form.companyName,
        inviteCode: code,
        payrollRates: DEFAULT_PAYROLL_RATES,
        // New companies wait for the platform super-admin's approval before
        // the admin can use the app; the super-admin's own company (the
        // very first one, with no one above it to approve it) is exempt.
        status: isSuperAdminSignup ? "approved" : "pending",
        applicant: { name: form.name, phone: form.phone, email: form.email.trim() },
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, "admins", cred.user.uid), {
        companyId: code,
        createdAt: serverTimestamp(),
      });

      // Seeded before the `users` doc write below, since that write is what
      // flips onAuthStateChanged's profile listener and redirects the admin
      // into the app — anything awaited after it races the redirect and, if
      // the component has already unmounted by the time it settles, a
      // failure here would silently vanish into the catch block below.
      await seedOrgDefaults(code, form.companyName);

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

  const handleSubmitJoin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const code = form.adminCode.trim().toUpperCase();
      const inviteSnap = await getDoc(doc(db, "adminInvites", code));
      if (!inviteSnap.exists()) {
        setError("관리자 초대코드를 다시 확인해주세요.");
        setLoading(false);
        return;
      }
      const { companyId } = inviteSnap.data();

      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);

      await setDoc(doc(db, "admins", cred.user.uid), { companyId, createdAt: serverTimestamp() });
      await setDoc(doc(db, "users", cred.user.uid), {
        role: "admin",
        companyId,
        name: form.name,
        phone: form.phone,
        approved: true,
        employmentStatus: "재직",
        createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, "adminInvites", code));
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "이미 사용 중인 이메일입니다." : "회원가입에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="관리자 회원가입" title={mode === "new" ? "새 회사 개설" : "기존 회사 관리자로 합류"}>
      <div className="mb-5 flex rounded-xl bg-slate-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`flex-1 rounded-lg py-2 font-medium transition-colors ${mode === "new" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
        >
          새 회사 개설
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`flex-1 rounded-lg py-2 font-medium transition-colors ${mode === "join" ? "bg-white text-primary shadow-sm" : "text-muted"}`}
        >
          관리자 코드로 합류
        </button>
      </div>

      {mode === "new" ? (
        <form onSubmit={handleSubmitNew}>
          <FormField label="회사명" required value={form.companyName} onChange={update("companyName")} placeholder="(주)케이피물류" />
          <FormField label="관리자 이름" required value={form.name} onChange={update("name")} placeholder="홍길동" />
          <FormField label="연락처" required value={form.phone} onChange={updatePhone} placeholder="010-0000-0000" maxLength={13} />
          <FormField label="이메일(회원ID)" type="email" required value={form.email} onChange={update("email")} placeholder="admin@company.com" />
          <FormField label="비밀번호" type="password" required minLength={6} value={form.password} onChange={update("password")} placeholder="6자 이상" />
          {error && <p className="mb-3 text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "생성 중..." : "회사 개설하고 시작하기"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmitJoin}>
          <FormField
            label="관리자 초대코드"
            required
            value={form.adminCode}
            onChange={update("adminCode")}
            placeholder="기존 관리자에게 받은 코드"
            style={{ textTransform: "uppercase" }}
          />
          <FormField label="이름" required value={form.name} onChange={update("name")} placeholder="홍길동" />
          <FormField label="연락처" required value={form.phone} onChange={updatePhone} placeholder="010-0000-0000" maxLength={13} />
          <FormField label="이메일(회원ID)" type="email" required value={form.email} onChange={update("email")} placeholder="admin@company.com" />
          <FormField label="비밀번호" type="password" required minLength={6} value={form.password} onChange={update("password")} placeholder="6자 이상" />
          {error && <p className="mb-3 text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "가입 중..." : "관리자로 합류하기"}
          </Button>
        </form>
      )}

      <div className="mt-5 text-center text-xs text-muted">
        이미 계정이 있으신가요?{" "}
        <Link to="/admin-login" className="text-primary hover:underline">
          관리자 로그인
        </Link>
      </div>
      <BuildInfo className="mt-6" />
    </AuthShell>
  );
}
