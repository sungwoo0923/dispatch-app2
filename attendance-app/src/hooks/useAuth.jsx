import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, updateDoc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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
    // 일부 인앱 브라우저(카카오톡 등)에서 인증 영속성 저장소가 막혀있으면
    // onAuthStateChanged가 영영 안 불릴 수 있다 — 그러면 loading이 계속
    // true로 남아 로딩화면에서 멈춘다. 일정 시간 안에 응답이 없으면
    // 로그아웃 상태로 간주해 로그인화면을 보여준다(무한로딩보다는 낫고,
    // 로그인 자체는 이 지연과 무관하게 동작한다).
    const stuckTimer = setTimeout(() => setLoading((prev) => (prev ? false : prev)), 8000);
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      clearTimeout(stuckTimer);
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
    return () => {
      clearTimeout(stuckTimer);
      unsubAuth();
    };
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

  // 메신저 친구목록/문의 담당자 선택 등 "회사 구성원 전체 조회"가 필요한
  // 화면은 PII가 담긴 users 컬렉션을 직접 list하지 못하도록 규칙으로
  // 막혀있다(관리자만 가능). 대신 이름/직책/연락처 정도만 담은
  // chat_profiles를 회사 구성원끼리 서로 조회할 수 있게 열어뒀는데, 그
  // 문서가 메신저를 최소 한 번 열어야만 생성되면 한 번도 안 연 사용자는
  // 다른 사람 목록에 영영 안 뜬다 — 그래서 로그인 시점에 없으면 바로
  // 만들어 회사 전체 구성원이 항상 조회 가능하도록 보장한다. effectiveProfile의
  // companyId를 쓰는 이유: 슈퍼관리자가 다른 회사로 전환해 들어간 상태라면
  // 그 회사 기준으로 chat_profiles가 생성되어야 메신저(같은 effectiveProfile
  // 기준 company를 쓰는)의 친구목록에 뜬다.
  useEffect(() => {
    if (!user || !effectiveProfile?.companyId) return;
    const ref = doc(db, "chat_profiles", user.uid);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) return;
        return setDoc(ref, {
          uid: user.uid,
          email: user.email || "",
          company: effectiveProfile.companyId,
          role: effectiveProfile.role || "employee",
          name: effectiveProfile.name || user.email?.split("@")[0] || "",
          statusMsg: "",
          photo: "",
          position: effectiveProfile.position || "",
          phone: effectiveProfile.phone || "",
          createdAt: serverTimestamp(),
        });
      })
      .catch(() => {});
  }, [user, effectiveProfile?.companyId, effectiveProfile?.role, effectiveProfile?.name]);

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
