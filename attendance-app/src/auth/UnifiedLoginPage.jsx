import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { User, Lock, KeyRound } from "lucide-react";
import { auth, db } from "../firebase";
import Button from "../components/Button";
import BuildInfo from "../components/BuildInfo";
import LanguagePicker from "../components/LanguagePicker";
import LoginCarousel from "../components/LoginCarousel";
import { useLanguage } from "../hooks/useLanguage";
import { phoneToAuthEmail, normalizePhone } from "../utils/phoneAuth";
import { SUPER_ADMIN_EMAIL } from "../constants/superAdmin";
import { SUPER_ADMIN_PICK_COMPANY_KEY } from "../constants/session";

const SAVED_PHONE_KEY = "kpwork_saved_phone";

const TABS = [
  { key: "employee", label: "직원 로그인" },
  { key: "admin", label: "관리자 로그인" },
  { key: "agency", label: "외부인력 로그인" },
];

function InputField({ icon: Icon, ...props }) {
  return (
    <div className="relative">
      <input
        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-light"
        {...props}
      />
      {Icon && <Icon size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-300" />}
    </div>
  );
}

// 이메일/비밀번호 계정(관리자·인력사무소 공용)에 붙는 "비밀번호 찾기" —
// 로그인 ID 자체가 가입 시 등록한 이메일이라 별도 아이디 찾기는 의미가
// 없고, Firebase Auth의 재설정 메일 발송만으로 충분하다.
function PasswordReset({ email, onDone }) {
  const [resetEmail, setResetEmail] = useState(email || "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setSent(true);
    } catch {
      setError("메일 발송에 실패했습니다. 이메일 주소를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      {sent ? (
        <p className="text-xs text-ink">재설정 메일을 보냈습니다. 메일함을 확인해주세요.</p>
      ) : (
        <form onSubmit={send} className="space-y-2">
          <p className="text-xs text-muted">아이디(가입 시 등록한 이메일)로 비밀번호 재설정 메일을 보내드립니다.</p>
          <input
            type="email"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder="가입한 이메일 주소"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "발송 중..." : "재설정 메일 보내기"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onDone}>
              닫기
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function EmployeeTab({ t }) {
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
    } catch {
      setError(t("login.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">{t("login.idLabel")}</span>
          <InputField
            icon={User}
            value={phone}
            onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 11))}
            placeholder={t("login.idPlaceholder")}
            inputMode="numeric"
            required
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">{t("login.password")}</span>
          <InputField
            icon={Lock}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("login.password")}
            required
          />
        </label>
        <label className="mb-5 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={savePhone} onChange={(e) => setSavePhone(e.target.checked)} />
          {t("login.savePhone")}
        </label>
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
      <p className="mt-3 text-center text-[11px] text-muted">비밀번호를 잊으셨다면 소속 회사 관리자에게 문의해주세요.</p>
      <div className="mt-4 rounded-xl bg-slate-50 py-3.5 text-center text-xs text-muted">
        {t("login.noAccount")}{" "}
        <Link to="/employee-signup" className="font-medium text-primary hover:underline">
          {t("login.signupEmployee")}
        </Link>
      </div>
    </>
  );
}

function AdminTab() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (cred.user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        sessionStorage.setItem(SUPER_ADMIN_PICK_COMPANY_KEY, "1");
      }
    } catch {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {resetOpen && <PasswordReset email={email} onDone={() => setResetOpen(false)} />}
      <form onSubmit={handleSubmit}>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">아이디(이메일)</span>
          <InputField icon={User} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.com" required />
        </label>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">비밀번호</span>
          <InputField icon={Lock} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </label>
        <div className="mb-5 text-right">
          <button type="button" onClick={() => setResetOpen((v) => !v)} className="text-xs text-muted hover:text-primary">
            아이디/비밀번호를 잊으셨나요?
          </button>
        </div>
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </Button>
      </form>
      <div className="mt-4 rounded-xl bg-slate-50 py-3.5 text-center text-xs text-muted">
        아직 회원이 아니신가요?{" "}
        <Link to="/admin-signup" className="font-medium text-primary hover:underline">
          관리자 회원가입
        </Link>
      </div>
    </>
  );
}

function AgencyTab() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const data = snap.data();
      if (!data || data.role !== "agency" || data.agencyId !== code.trim().toUpperCase()) {
        await signOut(auth);
        setError("코드가 일치하지 않거나 인력사무소 계정이 아닙니다.");
        return;
      }
    } catch {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {resetOpen && <PasswordReset email={email} onDone={() => setResetOpen(false)} />}
      <form onSubmit={handleSubmit}>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">연동코드</span>
          <InputField
            icon={KeyRound}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="가입 시 발급된 연동코드"
            style={{ textTransform: "uppercase" }}
            required
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">아이디(이메일)</span>
          <InputField icon={User} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agency@example.com" required />
        </label>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">비밀번호</span>
          <InputField icon={Lock} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </label>
        <div className="mb-5 text-right">
          <button type="button" onClick={() => setResetOpen((v) => !v)} className="text-xs text-muted hover:text-primary">
            아이디/비밀번호를 잊으셨나요?
          </button>
        </div>
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </Button>
      </form>
      <p className="mt-3 text-center text-[11px] text-muted">연동코드는 가입 신청 후 승인 대기 화면에서 확인할 수 있습니다.</p>
      <div className="mt-4 rounded-xl bg-slate-50 py-3.5 text-center text-xs text-muted">
        아직 회원이 아니신가요?{" "}
        <Link to="/agency-signup" className="font-medium text-primary hover:underline">
          인력사무소 가입
        </Link>
      </div>
    </>
  );
}

// 관리자/직원/인력사무소 로그인을 탭 하나로 통합한 화면 — 예전에는
// 역할별로 서로 다른 URL(/admin-login, 기본 "/")에 각각 다른 디자인의
// 페이지가 흩어져 있었는데, 참고 이미지(네이버 로그인)처럼 카드 상단
// 탭으로 역할을 고르는 방식이 더 명확하다는 피드백에 따라 하나로 합쳤다.
export default function UnifiedLoginPage({ initialTab = "employee" }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-1/2 lg:block">
        <LoginCarousel />
      </div>

      <div className="flex w-full items-center justify-center px-6 py-14 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-4 flex justify-end">
            <LanguagePicker />
          </div>
          <div className="mb-6 flex flex-col items-center">
            <img src="/logo.png" alt="KP-Work" className="h-16 w-auto lg:h-20" />
          </div>

          <div className="mb-6 flex rounded-xl bg-slate-100 p-1 text-xs font-medium">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`flex-1 rounded-lg py-2.5 transition-colors ${
                  tab === tb.key ? "bg-white text-primary shadow-sm" : "text-muted"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === "employee" && <EmployeeTab key="employee" t={t} />}
          {tab === "admin" && <AdminTab key="admin" />}
          {tab === "agency" && <AgencyTab key="agency" />}

          <BuildInfo className="mt-6" />
        </div>
      </div>
    </div>
  );
}
