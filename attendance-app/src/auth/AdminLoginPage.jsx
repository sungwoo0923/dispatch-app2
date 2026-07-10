import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import AuthShell, { FormField } from "./AuthShell";
import Button from "../components/Button";
import BuildInfo from "../components/BuildInfo";
import { useLanguage } from "../hooks/useLanguage";
import { SUPER_ADMIN_EMAIL } from "../constants/superAdmin";
import { SUPER_ADMIN_PICK_COMPANY_KEY } from "../constants/session";

// Only email+password are needed to authenticate — a regular admin's account
// is permanently bound to exactly one company (admins/{uid}.companyId), so
// there is nothing for them to pick or mistype. The super-admin is the only
// account that can view more than one company; for them, after this sign-in
// succeeds, App.jsx hands off to <SuperAdminCompanyPicker/> (via the
// sessionStorage flag below) so they can search by company name instead of
// needing to remember a raw code.
export default function AdminLoginPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (cred.user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        sessionStorage.setItem(SUPER_ADMIN_PICK_COMPANY_KEY, "1");
      }
    } catch (err) {
      setError(t("login.adminEmailError"));
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle={t("login.adminLogin")} title={t("login.adminLogin")}>
      <form onSubmit={handleSubmit}>
        <FormField
          label={t("login.email")}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@company.com"
        />
        <FormField
          label={t("login.password")}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
      <div className="mt-5 flex items-center justify-center gap-4 text-xs text-muted">
        <Link to="/admin-signup" className="hover:text-primary">
          {t("login.adminSignup")}
        </Link>
        <span className="text-slate-300">|</span>
        <Link to="/login" className="hover:text-primary">
          {t("login.employeeLogin")}
        </Link>
      </div>
      <BuildInfo className="mt-6" />
    </AuthShell>
  );
}
