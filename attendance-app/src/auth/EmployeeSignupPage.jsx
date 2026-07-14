import { useState } from "react";
import { Link } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import { toDateKey } from "../utils/dateUtils";
import { phoneToAuthEmail, normalizePhone } from "../utils/phoneAuth";
import { notifyAdmins } from "../utils/notifyAdmins";
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
  // 회원ID로 쓰이는 연락처는 대시 없이 숫자만 저장한다 — 붙여넣기로
  // "010-2377-0728"처럼 들어와도 자동으로 "01023770728"만 남긴다.
  const updatePhone = (e) => setForm((f) => ({ ...f, phone: normalizePhone(e.target.value).slice(0, 11) }));

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

  // 근로자가 가입을 완료해 실제 users 문서(uid)가 생기는 순간, 스케줄등록 >
  // 대기 인원 현황에도 바로 잡히도록 오늘 날짜로 "대기" 스케줄을 하나 만들어둔다
  // — 관리자가 근로자등록만 해둔 시점(pendingEmployees)엔 uid가 없어 스케줄을
  // 만들 수 없으므로, 실제 계정이 생기는 이 시점이 유일하게 가능한 지점이다.
  const createInitialSchedule = async (uid, name, cid, workSiteId) => {
    const dateKey = toDateKey();
    const existing = await getDocs(
      query(collection(db, "schedules"), where("uid", "==", uid), where("date", "==", dateKey))
    ).catch(() => null);
    if (existing && !existing.empty) return;
    await addDoc(collection(db, "schedules"), {
      companyId: cid,
      uid,
      name,
      date: toDateKey(),
      startTime: "09:00",
      endTime: "18:00",
      siteId: workSiteId || null,
      siteName: "",
      status: "대기",
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  const submitDetails = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loginPhone = pendingProfile ? pendingProfile.phone : form.phone;
      const cred = await createUserWithEmailAndPassword(auth, phoneToAuthEmail(loginPhone), form.password);

      if (pendingProfile) {
        // Spread every field the admin entered at 근로자등록 time (사업자,
        // 근무정보, 급여계좌, 템플릿 선택 등) rather than cherry-picking a fixed
        // subset, so nothing collected there silently gets dropped here.
        await setDoc(doc(db, "users", cred.user.uid), {
          ...pendingProfile,
          role: "employee",
          companyId,
          hireDate: pendingProfile.hireDate || toDateKey(),
          approved: true, // pre-vetted by admin at registration time
          employmentStatus: "재직",
          createdAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, "pendingEmployees", code.trim().toUpperCase()));
        await createInitialSchedule(cred.user.uid, pendingProfile.name, companyId, pendingProfile.workSiteId);
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
        await createInitialSchedule(cred.user.uid, form.name, companyId, null);
        notifyAdmins(companyId, { title: "신규 가입 승인 대기", message: `${form.name}님이 가입코드로 회원가입했습니다.`, link: "/employees" }).catch(() => {});
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
            <FormField
              label="연락처(회원ID)"
              required
              value={form.phone}
              onChange={updatePhone}
              placeholder="대시(-) 없이 숫자만 입력"
              inputMode="numeric"
            />
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
