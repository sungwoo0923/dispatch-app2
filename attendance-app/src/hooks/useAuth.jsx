import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { SUPER_ADMIN_EMAIL } from "../constants/superAdmin";
import { SUPER_ADMIN_ACTIVE_COMPANY_KEY } from "../constants/session";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  // Which company's data the super-admin is currently viewing. Regular
  // admins never set this, so it has no effect on them.
  const [activeCompanyId, setActiveCompanyIdState] = useState(
    () => sessionStorage.getItem(SUPER_ADMIN_ACTIVE_COMPANY_KEY) || null
  );

  const setActiveCompanyId = (code) => {
    if (code) sessionStorage.setItem(SUPER_ADMIN_ACTIVE_COMPANY_KEY, code);
    else sessionStorage.removeItem(SUPER_ADMIN_ACTIVE_COMPANY_KEY);
    setActiveCompanyIdState(code);
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      } else {
        // 관리자 목록의 "최종접속일시" 표시용 — 실패해도(문서가 아직 없는 가입
        // 직후 등) 로그인 자체를 막을 이유가 없으니 fire-and-forget으로 둔다.
        updateDoc(doc(db, "users", u.uid), { lastLoginAt: serverTimestamp() }).catch(() => {});
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return () => unsubProfile();
  }, [user]);

  const isSuperAdmin = !!user?.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

  // The company the rest of the app should read/write as. For a regular
  // admin this is always their own admins/{uid}.companyId (profile.companyId);
  // for the super-admin it's whichever 회사코드 they logged in with (or
  // switched to), so every existing admin page that already keys off
  // profile.companyId transparently operates on that company without needing
  // per-page changes.
  const effectiveProfile =
    profile && isSuperAdmin && activeCompanyId && activeCompanyId !== profile.companyId
      ? { ...profile, companyId: activeCompanyId }
      : profile;

  // Company-approval gate: only relevant for role === "admin". Kept in the
  // shared auth context (not fetched per-page) since App.jsx needs it before
  // it can decide whether to render the admin route tree at all.
  useEffect(() => {
    if (!effectiveProfile?.companyId || effectiveProfile.role !== "admin") {
      setCompany(null);
      setCompanyLoading(false);
      return;
    }
    setCompanyLoading(true);
    const unsubCompany = onSnapshot(doc(db, "companies", effectiveProfile.companyId), (snap) => {
      setCompany(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setCompanyLoading(false);
    });
    return () => unsubCompany();
  }, [effectiveProfile?.companyId, effectiveProfile?.role]);

  const value = {
    user,
    profile: effectiveProfile,
    loading,
    company,
    companyLoading,
    isSuperAdmin,
    activeCompanyId,
    setActiveCompanyId,
    logout: () => {
      setActiveCompanyId(null);
      return signOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
