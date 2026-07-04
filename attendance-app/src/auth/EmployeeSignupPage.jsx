import { useState } from "react";
import { Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import { toDateKey } from "../utils/dateUtils";
import { phoneToAuthEmail, formatPhoneNumber } from "../utils/phoneAuth";
import BuildInfo from "../components/BuildInfo";

export default function EmployeeSignupPage() {
  const [step, setStep] = useState("code"); // 'code' | 'details'
  const [code, setCode] = useState("");
  const [pendingProfile, setPendingProfile] = useState(null); // set if admin pre-registered this worker
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const updatePhone = (e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }));

  const submitCode = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const trimmedCode = code.trim().toUpperCase();

    const pendingSnap = await getDoc(doc(db, "pendingEmployees", trimmedCode));
    if (pendingSnap.exists()) {
      const data = pendingSnap.data();
      setPendingProfile(data);
      setCompanyId(data.companyId);
      setForm((f) => ({ ...f, name: data.name, phone: data.phone }));
      setStep("details");
      setLoading(false);
      return;
    }

    const companySnap = await getDoc(doc(db, "companies", trimmedCode));
    if (companySnap.exists()) {
      setPendingProfile(null);
      setCompanyId(trimmedCode);
      setStep("details");
      setLoading(false);
      return;
    }

    setError("코드를 다시 확인해주세요.");
    setLoading(false);
  };

  const submitDetails = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loginPhone = pendingProfile ? pendingProfile.phone : form.phone;
      const cred = await createUserWithEmailAndPassword(auth, phoneToAuthEmail(loginPhone), form.password);

      if (pendingProfile) {
        await setDoc(doc(db, "users", cred.user.uid), {
          role: "employee",
          companyId,
          name: pendingProfile.name,
          phone: pendingProfile.phone,
          gender: pendingProfile.gender || "",
          nationality: pendingProfile.nationality || "",
          visaStatus: pendingProfile.visaStatus || "",
          employeeCode: pendingProfile.employeeCode || "",
          vendorId: pendingProfile.vendorId || null,
          employmentType: pendingProfile.employmentType || "",
          team: pendingProfile.team || "",
          position: pendingProfile.position || "",
          hireDate: pendingProfile.hireDate || toDateKey(),
          workSiteId: pendingProfile.workSiteId || null,
          insuranceApplied: pendingProfile.insuranceApplied || "N",
          note: pendingProfile.note || "",
          approved: true, // pre-vetted by admin at registration time
          employmentStatus: "재직",
          createdAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, "pendingEmployees", code.trim().toUpperCase()));
      } else {
        await setDoc(doc(db, "users", cred.user.uid), {
          role: "employee",
          companyId,
          name: form.name,
          phone: form.phone,
          approved: false,
          employmentStatus: "재직",
          hireDate: toDateKey(),
          workSiteId: null,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "이미 가입된 휴대전화번호입니다." : "회원가입에 실패했습니다. 다시 시도해주세요.");
      setLoading(false);
    }
  };

  if (step === "code") {
    return (
      <AuthShell subtitle="직원 회원가입" title="가입코드 입력">
        <form onSubmit={submitCode}>
          <FormField
            label="가입코드 또는 회사 초대코드"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="관리자에게 받은 코드"
            style={{ textTransform: "uppercase" }}
          />
          <p className="mb-3 text-xs text-muted">
            관리자가 미리 등록해준 개인 가입코드가 있다면 그걸 입력하세요. 없다면 회사 초대코드를 입력해 직접 정보를 입력할 수 있습니다.
          </p>
          {error && <p className="mb-3 text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "확인 중..." : "다음"}
          </Button>
        </form>
        <div className="mt-5 text-center text-xs text-muted">
          이미 계정이 있으신가요?{" "}
          <Link to="/login" className="text-primary hover:underline">
            로그인
          </Link>
        </div>
        <BuildInfo className="mt-6" />
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="직원 회원가입" title={pendingProfile ? "로그인 정보 설정" : "회사 초대코드로 가입"}>
      <form onSubmit={submitDetails}>
        {pendingProfile ? (
          <div className="mb-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm">
            <p className="text-ink">{pendingProfile.name}</p>
            <p className="text-xs text-muted">{pendingProfile.phone}</p>
          </div>
        ) : (
          <>
            <FormField label="이름" required value={form.name} onChange={update("name")} placeholder="홍길동" />
            <FormField label="연락처(회원ID)" required value={form.phone} onChange={updatePhone} placeholder="010-0000-0000" maxLength={13} />
          </>
        )}
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
      <BuildInfo className="mt-6" />
    </AuthShell>
  );
}
