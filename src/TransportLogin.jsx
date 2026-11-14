// ======================= src/TransportLogin.jsx =======================
import React, { useState, useEffect } from "react";
import { imeFocusRef } from "./imeFocus";
import { safeLocalSet, isQuota, freeLocalStorage, trimLocalStorage } from "./safeStorage";
import { auth, db } from "./firebase";
import { signInWithEmailAndPassword, signInWithCustomToken, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, getAuth, multiFactor } from "firebase/auth";
import { initializeApp, getApps } from "firebase/app";
import BigCheck from "./components/BigCheck";
import { doc, getDoc, getFirestore, collection, getDocs, query, where } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMfaPrompt, mfaErrorText } from "./MfaModal";
import { LogisMark, LogisWordmark, LogisTag } from "./brand"; // 🔷 2026-11-04 LogisWeb 로고
import { MARKET_NAME } from "./orderMarketConfig"; // ⭐ 2026-11-06 허브(예전 배차마당) 이름
import { AdminLoginGate, adminAuthTime, isAdminGatePassed, markAdminGatePassed, ADMIN_GATE_EVENT, warmAdminGate } from "./AdminGate"; // 🔐 2026-11-11 2차 비밀번호를 로그인 카드 안에서
import { UserLoginGate, BioLoginButton } from "./UserSecurity"; // 🔐 2026-11-14 일반 계정 2차 인증(선택) · 얼굴 · 지문 로그인

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

// ⭐ 사용자 요청 — 로그아웃해도 지워지지 않는 "로그인 정보 저장"(회사코드/회사명/이메일)과
// "자동 로그인"(체크 해제 시 브라우저를 닫으면 로그아웃) 설정. 로그아웃 시 지워지는
// loginCompany/transportCode와 분리해서 따로 보관한다.
const SAVED_KEY = "transportLoginSaved";
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "null"); } catch { return null; }
}

export default function TransportLogin() {
  const saved = loadSaved();
  const [rememberInfo, setRememberInfo] = useState(saved ? saved.remember !== false : true);
  const [autoLogin, setAutoLogin] = useState(saved ? saved.autoLogin !== false : true);
  const [companyCode, setCompanyCode] = useState(
    () => (saved?.remember !== false && saved?.companyCode) || localStorage.getItem("transportCode") || ""
  );
  const [companyName, setCompanyName] = useState(
    () => (saved?.remember !== false && saved?.companyName) || localStorage.getItem("loginCompany") || ""
  );
  const [email, setEmail] = useState(() => (saved?.remember !== false && saved?.email) || "");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewInfo, setPreviewInfo] = useState(null); // 승인 대기 계정 — 둘러보기 버튼
  const [msg, setMsg] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [loginTime, setLoginTime] = useState("");
  const [showCodeLookup, setShowCodeLookup] = useState(false);
  const [codeLookupQ, setCodeLookupQ] = useState("");
  const [codeResults, setCodeResults] = useState([]);
  const [codeSearching, setCodeSearching] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // 🔐 2026-11-11 최고관리자 · 부관리자 — 1차(비밀번호)를 통과하면 화면이 넘어가지 않고 이 카드 안에 2차 비밀번호 키패드가 뜬다
  //  window.__kpGateInline 이 켜져 있는 동안 App.jsx의 전체 화면 보안 확인은 숨는다(새로고침하면 꺼져 예전처럼 전체 화면으로)
  const [gate, setGate] = useState(null); // { user, authTime, sub }
  const gateRef = React.useRef(null);
  gateRef.current = gate;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { warmAdminGate(); }, []); // ⚡ 2026-11-13 최고관리자 보안 확인(2차 비밀번호 · 문자)을 미리 준비
  const navigate = useNavigate();

  // Enter key in popup
  useEffect(() => {
    if (!showPopup) return;
    const handleKey = (e) => {
      if (e.key === "Enter") {
        sessionStorage.removeItem("skipLoginPopup");
        navigate("/app", { replace: true });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showPopup, navigate]);

  // Countdown auto-navigate
  useEffect(() => {
    if (!showPopup) return;
    if (countdown === 0) {
      sessionStorage.removeItem("skipLoginPopup");
      navigate("/app", { replace: true });
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, showPopup, navigate]);

  // cleanup: remove semaphore if component unmounts during validation
  useEffect(() => {
    return () => {
      sessionStorage.removeItem("transportValidating");
      if (window.__kpGateInline) { window.__kpGateInline = false; window.dispatchEvent(new Event(ADMIN_GATE_EVENT)); }
    };
  }, []);
  const finishLogin = () => {
    sessionStorage.removeItem("transportValidating");
    sessionStorage.setItem("skipLoginPopup", "true");
    setLoginTime(new Date().toLocaleString("ko-KR"));
    setShowPopup(true);
    setCountdown(3);
  };
  // 2차 비밀번호(· 처음 보는 기기 문자)를 통과하면 → 로그인 완료 창
  useEffect(() => {
    const h = () => {
      const g = gateRef.current;
      if (!g || !isAdminGatePassed(g.user.uid, g.authTime)) return;
      window.__kpGateInline = false;
      setGate(null);
      finishLogin();
    };
    window.addEventListener(ADMIN_GATE_EVENT, h);
    return () => window.removeEventListener(ADMIN_GATE_EVENT, h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelGate = async () => {
    window.__kpGateInline = false;
    setGate(null); setPw("");
    sessionStorage.removeItem("transportValidating");
    await signOut(auth).catch(() => {});
  };

  // ⭐ transportApplications는 로그인해야 읽을 수 있는 컬렉션이라(Firestore 규칙),
  // 로그인 "전" 화면인 여기서 직접 조회하면 항상 권한 오류로 막혀 결과가 비어
  // 보였다 — 로그인 없이도 호출 가능한 Cloud Function(lookupCompanyCode)을
  // 통해 회사명/코드만 받아온다.
  // ⭐ 최고관리자 전용 — 화면의 이메일/비밀번호(최고관리자 계정)로 "별도" 인증 인스턴스에서
  // 토큰만 받아 서버 함수에 보낸다(메인 로그인 상태에는 영향 없음).
  const [codeError, setCodeError] = useState("");
  // ⭐ 최고관리자 2차 인증(휴대폰 문자) — 비밀번호가 맞으면 Firebase가 "2차 인증 필요"를 알려주고, 문자 인증창을 띄운다
  const [mfaUi, askMfa] = useMfaPrompt();
  const signInMfa = async (authInst) => {
    try {
      return await signInWithEmailAndPassword(authInst, email.trim(), pw);
    } catch (e) {
      if (e?.code === "auth/multi-factor-auth-required") {
        const r = await askMfa(e, authInst);
        // ⭐ 2026-10-26 — 예전 방식(Firebase 계정 자체에 등록된 문자인증)은 모바일·회사코드 검색까지 매번 문자를 요구했다.
        //    지금은 PC 전용 인증(PcVerifyGate)을 쓰므로, 한 번 통과하면 예전 등록을 자동으로 지운다(이후 모바일은 문자 없음).
        try {
          const mf = multiFactor(r.user);
          for (const f of [...(mf.enrolledFactors || [])]) await mf.unenroll(f);
        } catch (err) { console.warn("예전 2차 인증 해제 실패:", err?.code || err); }
        return r;
      }
      throw e;
    }
  };
  const isMasterEmail = email.trim().toLowerCase() === TOTAL_MASTER_EMAIL;
  const searchCompanyCode = async () => {
    const q2 = codeLookupQ.trim();
    if (!q2) return;
    setCodeError("");
    if (!pw) { setCodeError("최고관리자 비밀번호를 로그인 칸에 먼저 입력해주세요."); return; }
    setCodeSearching(true);
    let lookupAuth = null;
    try {
      const lookupApp = getApps().find(a => a.name === "codeLookup") || initializeApp(auth.app.options, "codeLookup");
      lookupAuth = getAuth(lookupApp);
      const cred = await signInMfa(lookupAuth);
      if ((cred.user.email || "").toLowerCase() !== TOTAL_MASTER_EMAIL) {
        setCodeError("최고관리자만 사용할 수 있습니다.");
        setCodeResults([]);
        return;
      }
      // ⭐ 서버 함수(lookupCompanyCode)는 배포 권한 문제로 한 번도 배포되지 않아 결과가 항상
      // 비었다. 최고관리자로 인증된 별도 인스턴스에서 직접 조회한다(가입신청서 + 사용자 문서).
      const ldb = getFirestore(lookupApp);
      const qLower = q2.toLowerCase();
      const seen = new Map();
      const add = (name, code) => {
        name = String(name || "").trim(); code = String(code || "").trim();
        if (!name || !code) return;
        if (!name.toLowerCase().includes(qLower) && !code.toLowerCase().includes(qLower)) return;
        seen.set(`${name}|${code}`, { companyName: name, companyCode: code });
      };
      const [apps, users] = await Promise.all([
        getDocs(collection(ldb, "transportApplications")),
        getDocs(query(collection(ldb, "users"), where("companyCode", ">", ""))),
      ]);
      apps.docs.forEach(d => { const a = d.data(); if (a.status === "approved" || a.status === "승인") add(a.companyName, a.companyCode); });
      users.docs.forEach(d => { const u = d.data(); add(u.companyName, u.companyCode); });
      setCodeResults(Array.from(seen.values()).slice(0, 50));
    } catch (e) {
      setCodeError(String(e?.code || "").startsWith("auth/")
        ? "최고관리자 인증에 실패했습니다. 비밀번호를 확인해주세요."
        : `조회 중 오류가 발생했습니다: ${e?.message || e}`);
      setCodeResults([]);
    } finally {
      if (lookupAuth) signOut(lookupAuth).catch(() => {});
      setCodeSearching(false);
    }
  };

  const login = async () => {
    setError(null); setPreviewInfo(null);
    setMsg(null);

    if (!companyCode.trim()) return setError("회사코드는 필수 항목입니다. 승인 안내 이메일을 확인해주세요.");
    if (!companyName.trim()) return setError("회사명을 입력해주세요.");
    if (!email.trim() || !pw.trim()) return setError("이메일과 비밀번호를 입력해주세요.");

    try {
      setLoading(true);
      // Semaphore set BEFORE auth so App.jsx won't redirect while we validate
      sessionStorage.setItem("transportValidating", "true");
      window.__kpGateInline = true; // 최고관리자면 이 화면에서 2차 비밀번호를 받는다(아래)
      // 자동 로그인: 체크하면 브라우저/앱을 껐다 켜도 로그인 유지, 해제하면 닫을 때 로그아웃
      await setPersistence(auth, autoLogin ? browserLocalPersistence : browserSessionPersistence).catch(() => {});

      // 네트워크가 순간 끊기거나 새 버전(서비스워커) 교체 직후엔 첫 요청이 실패할 수 있어 1회 자동 재시도
      // ⭐ Firebase 로그인 자체가 로그인 정보를 브라우저 저장공간(localStorage)에 쓰는데,
      // 저장공간이 꽉 차 있으면(오류 22) 로그인이 실패한다 — 미리 큰 캐시를 정리한다.
      trimLocalStorage();
      let credential;
      try {
        credential = await signInMfa(auth);
      } catch (e1) {
        if (isQuota(e1)) {
          freeLocalStorage(3 * 1024 * 1024);
        } else if (e1?.code === "auth/network-request-failed") {
          await new Promise(r => setTimeout(r, 1200));
        } else {
          throw e1;
        }
        credential = await signInMfa(auth);
      }
      const uid = credential.user.uid;
      const inputEmail = email.trim().toLowerCase();
      const inputCompanyName = companyName.trim();
      const inputCompanyCode = companyCode.trim();
      let needGate = inputEmail === TOTAL_MASTER_EMAIL;
      let userMfa = ""; // 일반 계정이 켠 2차 인증 방식(pin | keypad)

      if (inputEmail !== TOTAL_MASTER_EMAIL) {
        const userSnap = await getDoc(doc(db, "users", uid));

        if (!userSnap.exists()) {
          sessionStorage.removeItem("transportValidating");
          window.__kpGateInline = false;
          await signOut(auth);
          setError("등록된 계정 정보가 없습니다.");
          return;
        }

        const userData = userSnap.data();

        // ⭐ 운송사 로그인은 운송사 직원 계정만 — 화주·기사·허브(예전 배차마당) 열람 계정은 각자 로그인 화면에서만 로그인
        // ⭐ 2026-11-06 허브 이름은 src/orderMarketConfig.js
        const OTHER_LOGIN = { shipper: "화주사 로그인", driver: "기사앱", cafeUser: MARKET_NAME };
        if (OTHER_LOGIN[userData.role]) {
          sessionStorage.removeItem("transportValidating");
          window.__kpGateInline = false;
          await signOut(auth);
          setError(`운송사 계정이 아닙니다. ${OTHER_LOGIN[userData.role]} 화면에서 로그인해주세요.`);
          return;
        }

        // ⭐ 2026-11-05 부관리자(role totalMaster) — 최고관리자처럼 아무 운송사로나 들어간다(회사명·코드 확인 생략)
        const isSubAdmin = userData.role === "totalMaster" && userData.subAdmin === true && userData.userStatus !== "banned" && userData.userStatus !== "suspended";
        needGate = userData.role === "totalMaster";
        if (userData.mfaOpt === true) userMfa = userData.mfaKind === "keypad" ? "keypad" : "pin";
        if (!isSubAdmin && (userData.companyName || "") !== inputCompanyName) {
          sessionStorage.removeItem("transportValidating");
          window.__kpGateInline = false;
          await signOut(auth);
          setError("회사명이 일치하지 않습니다. 가입한 회사명을 정확히 입력해주세요.");
          return;
        }

        // ⭐ 2026-11-06 계약종료된 운송사 — 로그인 단계에서 바로 안내(관리센터 › 이용 계약·만료). 부관리자는 예외
        if (!isSubAdmin) {
          const plan = await getDoc(doc(db, "companyPlans", String(userData.companyName || "돌캐").trim() || "돌캐")).catch(() => null);
          if (plan?.exists() && plan.data()?.status === "ended") {
            sessionStorage.removeItem("transportValidating");
            window.__kpGateInline = false;
          await signOut(auth);
            setError("계약이 종료되었습니다. 관리자에게 문의해 주세요.");
            return;
          }
        }

        if (userData.userStatus === "banned") {
          sessionStorage.removeItem("transportValidating");
          window.__kpGateInline = false;
          await signOut(auth);
          setError("영구 정지된 계정입니다. 관리자에게 문의하세요.");
          return;
        }

        if (userData.userStatus === "suspended") {
          sessionStorage.removeItem("transportValidating");
          window.__kpGateInline = false;
          await signOut(auth);
          setError("사용 정지된 계정입니다. 관리자에게 문의하세요.");
          return;
        }

        if (!userData.approved) {
          sessionStorage.removeItem("transportValidating");
          window.__kpGateInline = false;
          await signOut(auth);
          setPreviewInfo({ co: userData.companyName || "", plan: userData.requestedPlan || "" });
          setError("관리자 승인 대기 중입니다. 승인 후 로그인이 가능합니다.");
          return;
        }

        if (userData.companyCode && !isSubAdmin) {
          if (!inputCompanyCode) {
            sessionStorage.removeItem("transportValidating");
            window.__kpGateInline = false;
          await signOut(auth);
            setError("회사코드를 입력해주세요. 코드는 가입 승인 시 이메일로 안내받으셨습니다.");
            return;
          }
          if (userData.companyCode !== inputCompanyCode) {
            sessionStorage.removeItem("transportValidating");
            window.__kpGateInline = false;
          await signOut(auth);
            setError("회사코드가 일치하지 않습니다. 승인 안내 이메일을 확인해주세요.");
            return;
          }
        }

        safeLocalSet("loginCompany", inputCompanyName);
        safeLocalSet("userCompany", inputCompanyName);
      } else {
        // totalMaster: loginCompany를 반드시 갱신해야 헤더에 올바른 회사명이 표시됨
        safeLocalSet("loginCompany", inputCompanyName);
      }
      safeLocalSet("userCompany", inputCompanyName);
      // 앱이 이미 예전 회사로 데이터를 거르기 시작했을 수 있어 확인된 회사로 다시 맞추게 알린다
      window.dispatchEvent(new CustomEvent("kp:loginCompany", { detail: inputCompanyName }));

      if (inputCompanyCode) {
        safeLocalSet("transportCode", inputCompanyCode);
      }

      try {
        safeLocalSet(SAVED_KEY, JSON.stringify(rememberInfo
          ? { remember: true, autoLogin, companyCode: inputCompanyCode, companyName: inputCompanyName, email: email.trim() }
          : { remember: false, autoLogin }));
      } catch { /* 저장 실패 무시 */ }
      // 🔐 2026-11-14 일반 계정 — 2차 인증을 켠 계정만 같은 카드에서 PIN · 키패드
      if (!needGate && userMfa) {
        const authTime = await adminAuthTime(credential.user);
        if (!isAdminGatePassed(uid, authTime)) {
          try { document.activeElement?.blur?.(); } catch { /* 무시 */ }
          setGate({ user: credential.user, authTime, general: true, kind: userMfa });
          return;
        }
      }
      // 🔐 최고관리자 · 부관리자 — 같은 카드에서 2차 비밀번호(키패드)
      if (needGate) {
        const authTime = await adminAuthTime(credential.user);
        if (!isAdminGatePassed(uid, authTime)) {
          try { document.activeElement?.blur?.(); } catch { /* 무시 */ }
          setGate({ user: credential.user, authTime, sub: inputEmail !== TOTAL_MASTER_EMAIL });
          return;
        }
      }
      window.__kpGateInline = false;
      // Validation done — switch from validation semaphore to popup semaphore
      finishLogin();
    } catch (err) {
      window.__kpGateInline = false;
      sessionStorage.removeItem("transportValidating");
      const code = err.code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("비밀번호가 일치하지 않습니다.");
      } else if (code === "mfa/cancelled" || code === "auth/invalid-verification-code" || code === "auth/code-expired" || code === "auth/operation-not-allowed") {
        setError(mfaErrorText(err));
      } else if (code === "auth/user-not-found") {
        setError("등록된 이메일이 없습니다.");
      } else if (code === "auth/too-many-requests") {
        setError("로그인 시도가 너무 많아 잠시 잠겼습니다. 몇 분 뒤 다시 시도하거나 '비밀번호 찾기'로 재설정해주세요.");
      } else if (code === "auth/network-request-failed") {
        setError("인터넷 연결이 불안정해 로그인하지 못했습니다. 잠시 후 다시 시도해주세요.");
      } else if (code === "auth/user-disabled") {
        setError("사용이 중지된 계정입니다. 관리자에게 문의하세요.");
      } else if (code === "auth/invalid-email") {
        setError("이메일 형식이 올바르지 않습니다.");
      } else {
        // 원인 파악용으로 오류 코드를 같이 보여준다
        console.error("[로그인 실패]", err);
        setError(`로그인에 실패했습니다. 입력 정보를 확인해주세요. (${code || err?.message || "unknown"})`);
      }
    } finally {
      setLoading(false);
    }
  };

  // 👆 얼굴 · 지문 로그인 — 서버가 확인하고 준 로그인 토큰으로 들어온다(2차 비밀번호 · 회사코드는 묻지 않는다)
  //  최고관리자는 어느 운송사로 들어갈지 정해야 해서 지금 화면에 적힌(저장된) 회사명을 쓴다
  const bioSignIn = async (r) => {
    setError(null); setLoading(true);
    try {
      sessionStorage.setItem("transportValidating", "true");
      window.__kpGateInline = true; // 전체 화면 보안 확인이 잠깐 뜨지 않게(아래에서 통과 표시)
      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      trimLocalStorage();
      const cred = await signInWithCustomToken(auth, r.token);
      const co = r.email === TOTAL_MASTER_EMAIL || r.sub ? (companyName.trim() || localStorage.getItem("loginCompany") || "") : r.companyName;
      if ((r.email === TOTAL_MASTER_EMAIL || r.sub) && !co) {
        sessionStorage.removeItem("transportValidating");
        await signOut(auth).catch(() => {});
        setError("들어갈 회사명을 먼저 적어 주세요.");
        return;
      }
      safeLocalSet("loginCompany", co);
      safeLocalSet("userCompany", co);
      if (r.companyCode) safeLocalSet("transportCode", r.companyCode);
      window.dispatchEvent(new CustomEvent("kp:loginCompany", { detail: co }));
      markAdminGatePassed(cred.user.uid, await adminAuthTime(cred.user)); // 얼굴 · 지문 = 2단계 확인 완료
      window.__kpGateInline = false;
      finishLogin();
    } catch (e) {
      window.__kpGateInline = false;
      sessionStorage.removeItem("transportValidating");
      setError(e?.message || "얼굴 · 지문으로 로그인하지 못했습니다");
    } finally { setLoading(false); }
  };

  const resetPw = async () => {
    if (!email.trim()) return setError("이메일을 먼저 입력해주세요.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("재설정 링크를 이메일로 발송했습니다.");
      setError(null);
    } catch {
      setError("해당 이메일을 찾을 수 없습니다.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !loading) login();
  };

  const fieldIcon = {
    code: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    company: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" /></>,
    email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    pw: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></>,
  };
  const field = (key, label, input) => (
    <div className="mb-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11.5px] font-extrabold tracking-[0.12em] text-[#7A879C]">{label}</label>
        {key === "code" && isMasterEmail && (
          <button type="button" onClick={() => { setShowCodeLookup(true); setCodeLookupQ(""); setCodeResults([]); setCodeError(""); }}
            className="text-[11.5px] text-[#4B6CB7] font-extrabold hover:underline">회사코드 찾기</button>
        )}
      </div>
      <div className="group flex items-center gap-2.5 h-[46px] sm:h-[50px] px-3.5 sm:px-4 rounded-[13px] bg-[#F5F7FB] border border-[#E3E8F0] transition focus-within:bg-white focus-within:border-[#2D4C82] focus-within:shadow-[0_0_0_4px_rgba(45,76,130,0.10)]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-[#9AA9C3] group-focus-within:text-[#1B2B4B] shrink-0">{fieldIcon[key]}</svg>
        {input}
      </div>
    </div>
  );
  const inputCls = "flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold text-[#0F1A30] placeholder:text-[#B4BFD0] placeholder:font-medium";
  const pad = (n) => String(n).padStart(2, "0");

  return (
    <>
    {mfaUi}
    <style>{`
      @keyframes kpLoginIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      @keyframes kpPulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
      @keyframes kpScan { from { transform: translateY(-100%); } to { transform: translateY(100%); } }
      .kp-login-in { animation: kpLoginIn .5s cubic-bezier(.2,.8,.2,1) both; }
      .kp-pulse { animation: kpPulse 1.6s ease-in-out infinite; }
    `}</style>
    <div className="min-h-screen w-full flex items-stretch bg-[#F2F4F8]">
      {/* 왼쪽 — 브랜드 패널(PC) */}
      <div className="hidden lg:flex relative flex-col justify-between w-[46%] max-w-[720px] overflow-hidden px-14 py-12 text-white"
        style={{ background: "linear-gradient(150deg, #060E1F 0%, #0F1A30 45%, #1B2B4B 100%)" }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="absolute -right-40 -top-40 w-[520px] h-[520px] rounded-full" style={{ background: "radial-gradient(circle, rgba(110,149,232,0.22), transparent 65%)" }} />
        <div className="absolute -left-24 bottom-[-180px] w-[460px] h-[460px] rounded-full" style={{ background: "radial-gradient(circle, rgba(75,108,183,0.18), transparent 65%)" }} />

        <div className="relative flex items-center gap-3">
          <LogisMark size={46} />
          <div>
            <div className="mb-2"><LogisWordmark height={16} /></div>
            <div className="text-[10.5px] font-bold tracking-[0.3em] text-white/45">LOGISTICS DISPATCH NETWORK</div>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 text-[11.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#6E95E8] kp-pulse" /> SYSTEM ONLINE
          </div>
          <div className="mt-4 font-black leading-none tabular-nums" style={{ fontSize: 88, letterSpacing: "-0.02em", fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>
            {pad(now.getHours())}<span className="kp-pulse text-white/40">:</span>{pad(now.getMinutes())}
            <span className="text-[30px] text-white/35 ml-2">{pad(now.getSeconds())}</span>
          </div>
          <div className="mt-3 text-[15px] font-semibold text-white/60">
            {now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </div>
          <div className="mt-10 text-[30px] font-black leading-snug tracking-tight">배차의 모든 순간을<br />하나의 흐름으로.</div>
          <div className="mt-3 text-[14px] text-white/50 leading-relaxed">오더 등록부터 배차·정산·마감까지<br />운송사 업무를 한 화면에서 처리합니다.</div>
        </div>

        <div className="relative flex items-center gap-6 text-[11px] font-bold tracking-[0.2em] text-white/35">
          <span>SECURE · TLS</span><span>REAL-TIME SYNC</span><span>© LogisWeb</span>
        </div>
      </div>

      {/* 오른쪽 — 로그인 폼 */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-4 py-6 sm:py-10 relative">
        <div className="kp-login-in w-full max-w-[420px]">
          {/* 모바일 머리 */}
          <div className="lg:hidden flex flex-col items-center mb-4">
            <LogisMark size={52} style={{ filter: "drop-shadow(0 10px 24px rgba(15,26,48,0.25))" }} />
            <div className="mt-2.5"><LogisTag height={13} chip /></div>
            <div className="mt-1.5 text-[10.5px] font-bold tracking-[0.3em] text-[#9AA9C3]">LOGISTICS DISPATCH NETWORK</div>
          </div>

          <div className="bg-white rounded-[26px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_24px_60px_rgba(15,26,48,0.10)] px-5 sm:px-10 pt-6 sm:pt-9 pb-6 sm:pb-8">
            <div className="text-[11.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]">TRANSPORT SIGN IN</div>
            <h1 className="mt-1 text-[22px] sm:text-[26px] font-black text-[#0F1A30] tracking-tight">운송사 로그인</h1>
            <p className="text-[12.5px] sm:text-[13.5px] text-[#7A879C] mt-1 mb-5 sm:mb-7">{gate ? (gate.general ? "2차 인증을 켠 계정입니다 — 한 번 더 확인합니다" : `${gate.sub ? "부관리자" : "최고관리자"} 계정 — 2차 비밀번호를 넣어 주세요`) : "승인 메일로 받은 회사코드로 로그인하세요"}</p>

            {gate ? (
              <div data-login-gate>
                {/* ① 1차 — 방금 넣은 정보(확인 완료) */}
                <div className="flex items-center gap-3 rounded-[14px] bg-[#F5F7FB] border border-[#E3E8F0] px-3.5 py-3 mb-4">
                  <span className="w-6 h-6 rounded-full bg-emerald-500 text-white grid place-items-center shrink-0"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></span>
                  <div className="flex-1 min-w-0 leading-tight">
                    <div className="text-[11px] font-extrabold tracking-[0.12em] text-[#7A879C]">1차 비밀번호 확인 완료</div>
                    <div className="text-[13.5px] font-black text-[#0F1A30] truncate">{email}</div>
                  </div>
                  <span className="text-[11.5px] font-bold text-[#9AA9C3] truncate max-w-[110px]">{companyName}</span>
                </div>
                {/* ② 2차 — 화면 키패드(같은 카드 안) */}
                {gate.general
                  ? <UserLoginGate inline key={`${gate.user.uid}:${gate.authTime}`} user={gate.user} authTime={gate.authTime} kind={gate.kind} onCancel={cancelGate} />
                  : <AdminLoginGate inline key={`${gate.user.uid}:${gate.authTime}`} user={gate.user} authTime={gate.authTime} sub={gate.sub} onCancel={cancelGate} />}
              </div>
            ) : (<>
            {/* 👆 2026-11-14 이 기기에 얼굴 · 지문을 등록한 계정 — 맨 위에서 비밀번호 없이 바로(등록 안 한 기기에는 안 보인다) */}
            <BioLoginButton onToken={bioSignIn} disabled={loading} divider={<div className="flex items-center gap-3 my-4"><span className="flex-1 h-px bg-[#EEF1F6]" /><span className="text-[11.5px] font-bold text-[#9AA9C3]">또는 비밀번호로 로그인</span><span className="flex-1 h-px bg-[#EEF1F6]" /></div>} />
            {field("code", "회사코드", (
              <input type="text" placeholder="승인 후 발급된 코드" value={companyCode} onChange={(e) => setCompanyCode(e.target.value.toUpperCase())} onKeyDown={handleKeyDown}
                className={`${inputCls} ${companyCode ? "tracking-[0.12em] tabular-nums" : ""}`} />
            ))}
            {field("company", "회사명", (
              <input type="text" placeholder="가입한 회사명" value={companyName} onChange={(e) => setCompanyName(e.target.value)} onKeyDown={handleKeyDown} className={inputCls} />
            ))}
            {field("email", "이메일", (
              <input type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown} className={inputCls} />
            ))}
            {field("pw", "비밀번호", (
              <>
                <input type={showPw ? "text" : "password"} placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={handleKeyDown} className={inputCls} />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="text-[11.5px] font-extrabold text-[#9AA9C3] hover:text-[#0F1A30] shrink-0">{showPw ? "숨기기" : "보기"}</button>
              </>
            ))}

            {/* ⭐ 로그인 정보 저장 / 자동 로그인 */}
            <div className="flex items-center justify-between mt-4 mb-5">
              <BigCheck checked={rememberInfo} onChange={setRememberInfo} label="로그인 정보 저장" />
              <BigCheck checked={autoLogin} onChange={setAutoLogin} label="자동 로그인" />
            </div>

            {error && (
              <div className="flex gap-2 text-[13px] font-semibold text-[#0F1A30] mb-4 bg-[#FFF5F4] border border-[#F3D3CF] rounded-xl px-3.5 py-2.5">
                <span className="text-[#C2453D] font-black">!</span><span>{error}</span>
              </div>
            )}
            {/* ⭐ 2026-11-04 승인 전 둘러보기 없앰 */}
            {msg && (
              <div className="text-[13px] font-semibold text-[#0F1A30] mb-4 bg-[#F2F6FC] border border-[#D9E3F3] rounded-xl px-3.5 py-2.5">{msg}</div>
            )}

            <button onClick={login} disabled={loading}
              className="w-full h-[50px] sm:h-[54px] rounded-[14px] text-white text-[15px] font-black tracking-[0.04em] flex items-center justify-center gap-2 shadow-[0_14px_28px_rgba(15,26,48,0.28)] hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
              style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? "확인 중…" : "로그인"}
              {!loading && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
            </button>

            {!loading && (
              <div className="text-center mt-3.5">
                <button onClick={resetPw} className="text-[12.5px] font-bold text-[#9AA9C3] hover:text-[#0F1A30] transition">비밀번호를 잊으셨나요?</button>
              </div>
            )}

            <div className="flex items-center gap-3 my-6"><span className="flex-1 h-px bg-[#EEF1F6]" /><span className="text-[11px] font-bold tracking-[0.2em] text-[#C2CBD9]">OR</span><span className="flex-1 h-px bg-[#EEF1F6]" /></div>

            <div className="grid grid-cols-2 gap-2.5">
              <Link to="/signup" className="h-11 rounded-xl border border-[#0F1A30] text-[#0F1A30] text-[13.5px] font-black flex items-center justify-center hover:bg-[#0F1A30] hover:text-white transition">운송사 회원가입</Link>
              <Link to="/login" className="h-11 rounded-xl border border-[#E3E8F0] text-[#5B6B85] text-[13.5px] font-bold flex items-center justify-center hover:bg-[#F5F7FB] transition">다른 유형 로그인</Link>
            </div>
            </>)}
          </div>
          <div className="flex justify-center mt-5 text-[11px] font-bold tracking-[0.2em] text-[#B4BFD0]"><LogisTag height={7.5} chip text="LOGISTICS" /></div>
        </div>
      </div>

      {/* 로그인 완료 — 디지털 카운트다운 */}
      {showPopup && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center px-4" style={{ background: "rgba(6,14,31,0.72)" }}>
          <div className="kp-login-in relative w-full max-w-[380px] rounded-[28px] overflow-hidden text-white shadow-[0_30px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
            style={{ background: "linear-gradient(160deg, #0B1428 0%, #0F1A30 50%, #1B2B4B 100%)" }}>
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
            <div className="relative px-8 pt-8 pb-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.28em] text-[#8FB0F0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6E95E8] kp-pulse" /> AUTHENTICATED
                </div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
              </div>
              <div className="mt-3 text-[24px] font-black tracking-tight">로그인 완료</div>
              <div className="text-[13px] text-white/55 mt-0.5">{companyName || "LogisWeb"}</div>

              {/* 큰 디지털 카운트 */}
              <div className="mt-7 flex flex-col items-center">
                <div className="relative w-[148px] h-[148px]">
                  <svg width="148" height="148" className="-rotate-90">
                    <circle cx="74" cy="74" r="64" stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
                    <circle cx="74" cy="74" r="64" stroke="url(#kpRing)" strokeWidth="6" fill="none" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 64} strokeDashoffset={(2 * Math.PI * 64 * (3 - countdown)) / 3}
                      style={{ transition: "stroke-dashoffset 1s linear" }} />
                    <defs><linearGradient id="kpRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8FB0F0" /><stop offset="100%" stopColor="#ffffff" /></linearGradient></defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div key={countdown} className="kp-login-in font-black tabular-nums leading-none" style={{ fontSize: 60, fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" }}>{pad(countdown)}</div>
                    <div className="text-[10px] font-extrabold tracking-[0.3em] text-white/40 mt-1">SEC</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-1.5">
                  {[3, 2, 1].map((n) => <span key={n} className={`h-1 w-10 rounded-full transition-colors duration-500 ${countdown < n ? "bg-white" : "bg-white/15"}`} />)}
                </div>
                <div className="mt-3 text-[12.5px] font-semibold text-white/55">잠시 후 업무 화면으로 이동합니다</div>
              </div>

              <div className="mt-7 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 divide-y divide-white/10">
                {[["ACCOUNT", email], ["SIGNED IN", loginTime]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-3 gap-3">
                    <span className="text-[10.5px] font-extrabold tracking-[0.22em] text-white/40 shrink-0">{k}</span>
                    <span className="text-[13px] font-bold text-white/90 truncate tabular-nums">{v}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => { sessionStorage.removeItem("skipLoginPopup"); navigate("/app", { replace: true }); }}
                className="mt-5 w-full h-[50px] rounded-[14px] bg-white text-[#0F1A30] text-[14.5px] font-black tracking-[0.04em] hover:bg-[#EEF3FB] transition">
                바로 시작하기 <span className="text-[#9AA9C3] font-bold text-[12px] ml-1">Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회사코드 찾기 모달 */}
      {showCodeLookup && (
        <div className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center"
          onClick={() => setShowCodeLookup(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]">회사코드 찾기</h3>
                <p className="text-white/60 text-[12px] mt-0.5">회사명으로 코드를 검색합니다</p>
              </div>
              <button onClick={() => setShowCodeLookup(false)} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-5">
              <div className="flex gap-2 mb-4">
                <input
                  ref={imeFocusRef}
                  value={codeLookupQ}
                  onChange={e => setCodeLookupQ(e.target.value)}
                  onKeyUp={e => { if (e.key === "Enter") searchCompanyCode(); }}
                  placeholder="회사명을 입력하세요"
                  className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#1B2B4B] transition"
                />
                <button
                  onClick={searchCompanyCode}
                  disabled={codeSearching || !codeLookupQ.trim()}
                  className="px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50 transition"
                  style={{ background: "#1B2B4B" }}
                >
                  {codeSearching ? "검색 중..." : "검색"}
                </button>
              </div>
              {codeError && (
                <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{codeError}</div>
              )}
              {codeResults.length > 0 ? (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  {codeResults.map(r => (
                    <div key={`${r.companyName}|${r.companyCode}`} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-blue-50/30">
                      <div>
                        <div className="text-[13px] font-semibold text-gray-800">{r.companyName}</div>
                        <div className="text-[12px] tabular-nums text-[#1B2B4B] font-bold">{r.companyCode}</div>
                      </div>
                      <button
                        onClick={() => {
                          setCompanyCode(r.companyCode);
                          setCompanyName(r.companyName);
                          setShowCodeLookup(false);
                        }}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#1B2B4B] border border-[#1B2B4B]/30 hover:bg-[#1B2B4B]/10 transition"
                      >
                        선택
                      </button>
                    </div>
                  ))}
                </div>
              ) : codeLookupQ && !codeSearching && !codeError ? (
                <div className="text-center py-6 text-[13px] text-gray-400">검색 결과가 없습니다</div>
              ) : null}
              <p className="text-[11px] text-gray-400 mt-4 text-center">
                코드를 찾지 못하면 관리자에게 문의하세요
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
