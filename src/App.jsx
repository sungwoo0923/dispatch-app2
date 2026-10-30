// ======================= src/App.jsx =======================

import React, { useState, useEffect, useRef } from "react";
import { setTenant, setServerFilter, setPreviewMode } from "./fsTenant";
import { setPreviewPlan } from "./plans";
import { installEscClose } from "./kpDialog";
installEscClose();
import { safeLocalSet } from "./safeStorage";
import UpdateBanner from "./UpdateBanner";
import VersionCheck from "./VersionCheck";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db, DEFAULT_COMPANY } from "./firebase";
import { setBlindViewerRole, setAutoBlind } from "./blind";
import {
  checkLoginSession, replaceAndCreate, watchMySession, startHeartbeat, installEndOnSignOut,
  KIND_LABEL, END_REASON_LABEL, sessionLastMs, timeAgo,
} from "./loginSessions";
import { LoginManagerModal } from "./LoginManager";
import { PcVerifyGate, isPcMfaPassed } from "./MfaModal";
import { doc, onSnapshot, addDoc, collection, serverTimestamp, query, orderBy, limit, getDocs, getDoc, deleteDoc } from "firebase/firestore";

// 역할별 대형 화면은 지연 로딩(code-splitting)한다 — 이전에는 전부 하나의 번들로
// 즉시 로드되어, 로그인 화면 하나만 보려 해도 운송사/화주사/모바일 프로그램 전체
// 코드를 다운로드/파싱해야 했다(초기 접속 로딩이 느린 주된 원인).
const ShipperApp = React.lazy(() => import("./shipper/ShipperApp"));
const DispatchApp = React.lazy(() => import("./DispatchApp"));
const MobileApp = React.lazy(() => import("./mobile/MobileApp"));
const ShipperMobileApp = React.lazy(() => import("./mobile/ShipperMobileApp"));

// ⭐ 로딩 속도 개선 — 운송사 프로그램 본체(PC: DispatchApp, 폰: MobileApp)는 로그인
// 확인(Firebase 인증 + 사용자 문서 조회)이 다 끝난 "뒤에야" 다운로드를 시작해서,
// 두 대기 시간이 그대로 더해졌다. 첫 화면을 여는 순간 바로 미리 받기 시작해 겹치게 한다.
(function prefetchMainApp() {
  try {
    if (typeof window === "undefined" || window.Capacitor?.isNativePlatform?.()) return;
    const p = window.location.pathname;
    if (!(p === "/" || p.startsWith("/app") || p === "/login" || p === "/transport-login")) return;
    const ua = navigator.userAgent.toLowerCase();
    const phone = /iphone|ipod|android(?!.*tablet)/.test(ua) || window.innerWidth < 768;
    (phone ? import("./mobile/MobileApp") : import("./DispatchApp")).catch(() => {});
  } catch { /* 미리받기 실패는 무시 — 원래대로 필요할 때 받는다 */ }
})();

// ⭐ 로딩 속도 개선 — 기사앱/회원가입/업로드 페이지 등은 운송사 PC 사용자가 거의
// 열지 않는 화면인데, 첫 번들에 같이 들어 있어서(약 600KB, html2canvas 포함) 프로그램을
// 열 때마다 다운로드/해석 시간이 늘었다. 필요할 때만 불러오도록 지연 로딩으로 바꾼다.
const DriverHome = React.lazy(() => import("./driver/DriverHome"));
const DriverLogin = React.lazy(() => import("./driver/DriverLogin"));
const DriverRegister = React.lazy(() => import("./driver/DriverRegister"));

import Login from "./Login";
import KpLogoMark, { KP_MARK_CSS } from "./KpLogoMark";
import TransportLogin from "./TransportLogin";
const Signup = React.lazy(() => import("./Signup"));
import ShipperLogin from "./shipper/ShipperLogin";
const ShipperSignup = React.lazy(() => import("./shipper/ShipperSignup"));
const ShipperPending = React.lazy(() => import("./shipper/ShipperPending"));

import NoAccess from "./NoAccess";
const UploadPage = React.lazy(() => import("./UploadPage"));
const DriverSearchPage = React.lazy(() => import("./DriverSearchPage"));
const ShortLinkRedirect = React.lazy(() => import("./ShortLinkRedirect"));
const StandardFare = React.lazy(() => import("./StandardFare"));
const ChangePassword = React.lazy(() => import("./ChangePassword"));
const PlatformCenter = React.lazy(() => import("./PlatformCenter"));
const EntryChooser = React.lazy(() => import("./PlatformCenter").then((m) => ({ default: m.EntryChooser })));
const ContractSign = React.lazy(() => import("./ContractSign"));

// ⭐ 관리자 겸 개발자 계정 — 배차/화주/모바일 등 프로그램 어디서든, users 문서
// 상태(role 필드 오타, 퇴사 처리, 문서 자체가 없는 경우 등)와 무관하게 무조건
// 최고관리자로 로그인되어야 한다는 요구사항. 아래 인증 리스너에서 이 이메일이면
// Firestore 데이터를 신뢰하지 않고 role/approved를 강제로 덮어쓴다.
const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

/* =======================================================================
   디바이스 감지
======================================================================= */
function isSmartPhone() {
  const ua = navigator.userAgent.toLowerCase();
  const isIpad =
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    ua.includes("ipad");
  if (isIpad) return false;
  if (ua.includes("tablet")) return false;
  const isPhoneUA = /iphone|ipod|android(?!.*tablet)/.test(ua);
  const isSmallScreen = window.innerWidth < 768;
  return isPhoneUA || isSmallScreen;
}

// ★ 태블릿 감지 (iPad, Android 태블릿, 터치 지원 중간 사이즈)
// 폴더블 폰 등 안드로이드 폰은 제외 ("mobile" UA 포함)
function isTabletDevice() {
  const ua = navigator.userAgent.toLowerCase();
  // 폰 UA → 태블릿으로 취급하지 않음
  const isPhone = /iphone|ipod/.test(ua) || (ua.includes("android") && ua.includes("mobile"));
  if (isPhone) return false;
  const isIpad =
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    ua.includes("ipad");
  const isAndroidTablet = ua.includes("android") && !ua.includes("mobile");
  const isMidScreen = window.innerWidth >= 768 && window.innerWidth <= 1366;
  const hasTouch = navigator.maxTouchPoints > 1;
  return isIpad || isAndroidTablet || (isMidScreen && hasTouch);
}

// 🔷 첫 화면(스플래시) — 네이비 배경, 디지털 로고 마크, 얇은 진행 막대
function KpSplash() {
  const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "radial-gradient(90% 60% at 50% 0%, #22396A 0%, #0F1A30 55%, #060D1C 100%)", userSelect: "none", WebkitUserSelect: "none", overflow: "hidden" }}>
      <style>{KP_MARK_CSS + `
        @keyframes kpSplashUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes kpSplashBar { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
      `}</style>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 360, height: 360, transform: "translate(-50%,-58%)", borderRadius: "50%", background: "radial-gradient(circle, rgba(110,149,232,0.22), transparent 65%)" }} />
      <div style={{ position: "relative", filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.45))" }}><KpLogoMark size={92} /></div>
      <div style={{ position: "relative", marginTop: 22, color: "#fff", fontFamily: MONO, fontWeight: 900, fontSize: 22, letterSpacing: "0.32em", paddingLeft: "0.32em", animation: "kpSplashUp .45s ease .15s both" }}>KP-FLOW</div>
      <div style={{ position: "relative", marginTop: 6, color: "rgba(207,224,255,0.45)", fontWeight: 700, fontSize: 10.5, letterSpacing: "0.3em", paddingLeft: "0.3em", animation: "kpSplashUp .45s ease .22s both" }}>LOGISTICS DISPATCH SYSTEM</div>
      <div style={{ position: "relative", marginTop: 28, width: 120, height: 2, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden", animation: "kpSplashUp .45s ease .3s both" }}>
        <div style={{ width: "40%", height: "100%", borderRadius: 2, background: "linear-gradient(90deg, transparent, #CFE0FF, transparent)", animation: "kpSplashBar 1.1s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// 최고관리자 진입 선택(탭/창 단위로 기억 — 새로 로그인하거나 창을 닫으면 다시 고른다)
const kpEntry = () => { try { return sessionStorage.getItem("kpEntry") || ""; } catch { return ""; } };

// ⭐ 버그수정 — 진입 선택값은 /app 화면을 그릴 "그 순간" 읽어야 한다. App 본문에서 읽으면
//  선택 화면에서 "배차 프로그램"을 눌러도 App이 다시 그려지지 않아 옛 값(선택 전)으로 판단해
//  선택 화면으로 되돌아갔다(새로고침해야 들어가짐).
// 👀 승인 전 둘러보기 — 가입 신청 후 승인 전까지 가입 때 고른 요금제의 메뉴로 프로그램을 미리 본다.
//  서버에는 아무것도 묻지 않고(빈 화면), 저장도 막는다. 나가면 새로고침으로 원래대로.
const PREVIEW_PLAN_NAME = { lite: "라이트", basic: "베이직", standard: "스탠다드", pro: "프로" };
function PreviewApp() {
  const qs = new URLSearchParams(window.location.search);
  const co = (qs.get("co") || "").trim() || "우리 회사";
  const plan = PREVIEW_PLAN_NAME[qs.get("plan")] ? qs.get("plan") : "standard";
  setPreviewMode(true); setPreviewPlan(plan); setTenant(co);
  const fakeUser = React.useMemo(() => ({ uid: "preview", email: "preview@kp-flow.app", displayName: "둘러보기" }), []);
  const [toast, setToast] = React.useState(false);
  React.useEffect(() => {
    try { localStorage.setItem("userCompany", co); } catch { /* 무시 */ }
    const on = () => { setToast(true); setTimeout(() => setToast(false), 2600); };
    window.addEventListener("kp:previewBlocked", on);
    return () => window.removeEventListener("kp:previewBlocked", on);
  }, [co]);
  const exit = () => { try { localStorage.removeItem("userCompany"); } catch { /* 무시 */ } window.location.href = "/login"; };
  return (
    <>
      {isSmartPhone() ? <MobileApp role="admin" user={fakeUser} userCompany={co} /> : <DispatchApp role="admin" user={fakeUser} userCompany={co} />}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[2147483000] flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-2xl text-white shadow-[0_12px_30px_rgba(11,20,40,0.35)] max-w-[calc(100vw-24px)]" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
        <span className="text-[12.5px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">둘러보기 · {co} · {PREVIEW_PLAN_NAME[plan]} 요금제 · 승인 전이라 저장되지 않습니다</span>
        <button type="button" onClick={exit} className="shrink-0 h-8 px-3 rounded-xl bg-white text-[#0B1428] text-[12.5px] font-black">나가기</button>
      </div>
      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-20 z-[2147483000] px-4 py-2.5 rounded-xl bg-[#0B1428] text-white text-[13px] font-bold shadow-lg whitespace-nowrap">둘러보기에서는 저장되지 않습니다 · 승인 후 이용해 주세요</div>}
    </>
  );
}

function EntryGate({ children }) {
  return kpEntry() === "app" ? children : <Navigate to="/choose" replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [userCompany, setUserCompany] = useState("");
  // ⭐ 블라인드 오더 노출 판정용 — 렌더 중 바로 반영(하위 화면 첫 렌더 전에 알아야 함)
  setBlindViewerRole(role, user?.email);
  // ⭐ 자동 블라인드 설정 — 최고관리자만 구독(다른 사용자는 읽을 권한도 없음)
  const isTmForBlind = role === "totalMaster" || user?.email === "tjddnqkf@naver.com";
  useEffect(() => {
    if (!isTmForBlind) { setAutoBlind(false); return; }
    const unsub = onSnapshot(doc(db, "siteConfig", "blindMine"), (snap) => setAutoBlind(snap.exists() && snap.data().enabled === true), () => {});
    return () => { unsub(); setAutoBlind(false); };
  }, [isTmForBlind]);
  // ⭐ 로그인 선택 화면의 "최근 로그인" — 실제로 로그인에 성공한 계정 종류를 이 기기에 기억한다
  useEffect(() => {
    if (!user || !role) return;
    const kind = role === "driver" ? "driver" : role === "shipper" ? "shipper" : role === "cafeUser" ? null : "transport";
    if (kind) { try { localStorage.setItem("lastLoginRole", kind); } catch { /* 무시 */ } }
  }, [user, role]);
  // updateReady 팝업 제거됨 - UpdateBanner가 자동 처리
  const [splashDone, setSplashDone] = useState(false);

  // ⭐ 로그인 관리 — 같은 계정으로 PC 2대(또는 모바일 2대)가 동시에 로그인하지 못하게 한다(최고관리자 제외).
  //  sessionConflict: 같은 종류 기기가 이미 로그인 중 → "기존 로그인 끊고 로그인 / 취소" 선택창
  //  kickedReason: 이 기기가 다른 곳에서 끊김 → 로그아웃 후 안내창
  const [sessionConflict, setSessionConflict] = useState(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [kickedReason, setKickedReason] = useState(null);
  const sessionGateRef = useRef({ uid: null, stop: null });
  useEffect(() => { installEndOnSignOut(); }, []);
  const startSessionWatch = (id) => {
    const unwatch = watchMySession(id, (reason) => {
      setKickedReason(reason);
      signOut(auth).catch(() => {});
    });
    const stopBeat = startHeartbeat(id);
    sessionGateRef.current.stop = () => { unwatch(); stopBeat(); };
  };
  useEffect(() => {
    if (!user || !role || role === "cafeUser") {
      if (!user) {
        sessionGateRef.current.stop?.();
        sessionGateRef.current = { uid: null, stop: null };
        setSessionConflict(null);
      }
      return;
    }
    if (sessionGateRef.current.uid === user.uid) return;
    sessionGateRef.current = { uid: user.uid, stop: null };
    let cancelled = false;
    const run = async () => {
      // 로그인 화면이 회사코드 등을 확인하는 중(잠깐 로그인했다가 다시 로그아웃할 수 있음)이면 끝날 때까지 기다린다
      for (let i = 0; i < 60; i++) {
        if (sessionStorage.getItem("transportValidating") !== "true" && sessionStorage.getItem("shipperValidating") !== "true") break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (cancelled || auth.currentUser?.uid !== user.uid) return;
      const info = { ...(sessionLogRef.current.info || {}), role };
      try {
        const res = await checkLoginSession(user, info);
        if (cancelled) return;
        if (res.status === "ok") startSessionWatch(res.id);
        else if (res.status === "revoked") { setKickedReason(res.reason); signOut(auth).catch(() => {}); }
        else if (res.status === "conflict") setSessionConflict({ ...res, info });
      } catch (e) {
        // 세션 기록이 안 되더라도(권한·네트워크) 로그인 자체는 막지 않는다
        console.warn("로그인 세션 확인 실패:", e?.message || e);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [user, role]);
  const acceptSessionConflict = async () => {
    if (!sessionConflict || !user) return;
    setSessionBusy(true);
    try {
      const id = await replaceAndCreate(user, sessionConflict.info, sessionConflict.conflicts);
      setSessionConflict(null);
      startSessionWatch(id);
    } catch (e) {
      alert(`기존 로그인을 끊지 못했습니다: ${e?.message || e}`);
    } finally {
      setSessionBusy(false);
    }
  };
  // ⭐ 최고관리자 PC 2차 인증 — PC에서 로그인하면 등록된 휴대폰으로 문자 인증을 통과해야 프로그램이 열린다(모바일 제외)
  const [masterPcPhone, setMasterPcPhone] = useState(null); // null = 아직 모름
  const [pcMfaTick, setPcMfaTick] = useState(0);
  useEffect(() => {
    const h = () => setPcMfaTick((v) => v + 1);
    window.addEventListener("kp-pc-mfa-ok", h);
    window.addEventListener("storage", h); // 다른 탭에서 인증하면 이 탭도 바로 열린다
    return () => { window.removeEventListener("kp-pc-mfa-ok", h); window.removeEventListener("storage", h); };
  }, []);
  // ⭐ PC 화면(DispatchApp)을 보여줄 때만 — 화면을 고르는 기준(isSmartPhone)과 똑같이 판단해야 폴더블·분할화면에서 모바일인데 묻는 일이 없다
  const isPcDevice = !isSmartPhone();
  const needPcMfa = !!(user && role === "totalMaster" && isPcDevice && masterPcPhone && !isPcMfaPassed(user.uid)) && pcMfaTick >= 0;
  // 아직 번호를 등록하지 않았으면(PC에서) 로그인할 때 한 번 안내한다
  const [mfaNag, setMfaNag] = useState(false);
  const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
  useEffect(() => {
    if (!user || role !== "totalMaster" || !isPcDevice || masterPcPhone !== "") return;
    try {
      if (sessionStorage.getItem("mfaNagShown") === "1") return;
      sessionStorage.setItem("mfaNagShown", "1");
      setMfaNag(true);
    } catch { /* 무시 */ }
  }, [user, role, masterPcPhone, isPcDevice]);
  const cancelSessionConflict = () => {
    setSessionConflict(null);
    signOut(auth).catch(() => {});
  };

  // ★ 태블릿 감지 상태
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkTablet = () => setIsTablet(isTabletDevice());
    checkTablet();
    window.addEventListener("resize", checkTablet);
    return () => window.removeEventListener("resize", checkTablet);
  }, []);

  // ★ 스플래시 후 데스크톱 viewport 복원 (index.html 기본값: user-scalable=no)
  useEffect(() => {
    const isMobile = isSmartPhone();
    const isTab = isTabletDevice();
    if (!isMobile && !isTab && !loading && splashDone) {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover";
    }
  }, [loading, splashDone]);

  // ★ 작은 화면(폰)이 데스크탑 사이트를 요청한 경우 viewport 스케일 보정
  // 단, 실제 모바일 앱(MobileApp)을 보여줄 때는 절대 적용하지 않음
  useEffect(() => {
    if (isTablet) return; // 태블릿 전용 effect가 이미 처리함
    if (isSmartPhone()) {
      // 모바일 앱 모드: 데스크탑 사이트 보다가 모바일로 돌아온 경우
      // viewport를 모바일 기본값으로 명시적 복원 (user-scalable=no 포함)
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
      return;
    }
    // 이 시점에서는 phone UA가 아닌데 screen.width < 768 → 안드로이드 폰이 데스크탑 요청한 경우
    // ⚠️ 폴더블(갤럭시Z폴드 등) 일부 기기에서 스크롤할 때 주소창이 접혔다 펴지며
    // resize 이벤트가 계속 발생하는데, 매번 viewport meta content를 다시 쓰면
    // 그 자체가 리플로우를 유발해 다시 resize를 트리거하는 피드백 루프가 생겨
    // 화면이 떨리며 스크롤이 계속 맨 위로 튕기는 증상이 나타났다. 실제로 계산된
    // 값이 바뀔 때만, 그것도 살짝 디바운스해서 반영하도록 방어한다.
    let lastScaleContent = null;
    let scaleTimer = null;
    const applyScale = () => {
      const screenW = window.screen.width || window.innerWidth;
      if (screenW >= 768) return; // 실제 폰 화면이 아니면 무시
      const meta = document.querySelector('meta[name="viewport"]');
      if (!meta) return;
      const w = Math.min(screenW, window.innerWidth);
      const TARGET = 1200;
      const scale = Math.min(1, w / TARGET).toFixed(3);
      const content = `width=${TARGET}, initial-scale=${scale}, minimum-scale=0.2, maximum-scale=5.0, user-scalable=yes`;
      if (content === lastScaleContent) return; // 값이 그대로면 재적용하지 않음(리플로우 방지)
      lastScaleContent = content;
      meta.content = content;
    };
    const applyScaleDebounced = () => {
      clearTimeout(scaleTimer);
      scaleTimer = setTimeout(applyScale, 120);
    };
    applyScale();
    window.addEventListener("resize", applyScaleDebounced);
    const onOri = () => setTimeout(applyScale, 150);
    window.addEventListener("orientationchange", onOri);
    return () => {
      clearTimeout(scaleTimer);
      window.removeEventListener("resize", applyScaleDebounced);
      window.removeEventListener("orientationchange", onOri);
    };
  }, [isTablet]);

  // ★ 태블릿 viewport 동적 조정 (가로/세로 모드 모두 대응)
  useEffect(() => {
    if (!isTablet) return;

    // ⚠️ 위 applyScale과 동일한 이유로, 계산된 값이 실제로 바뀔 때만(디바운스 포함)
    // meta content를 다시 쓴다 — 폴더블 기기에서 스크롤 중 resize가 연속 발생해도
    // 화면이 떨리며 상단으로 튕기지 않도록 방지.
    let lastViewportContent = null;
    let viewportTimer = null;
    const updateViewport = () => {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "viewport";
        document.head.appendChild(meta);
      }
      // Use the smaller of screen.width (physical device CSS px) and innerWidth
      // so that phones requesting desktop mode (innerWidth ~1024) still scale
      // down based on the actual device screen size (e.g. 390px)
      const w = Math.min(window.screen.width || window.innerWidth, window.innerWidth);
      const TARGET = 1200;
      const scale = Math.min(1, (w / TARGET)).toFixed(3);
      const content = `width=${TARGET}, initial-scale=${scale}, minimum-scale=0.3, maximum-scale=5.0, user-scalable=yes`;
      if (content === lastViewportContent) return;
      lastViewportContent = content;
      meta.content = content;
    };
    const updateViewportDebounced = () => {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(updateViewport, 120);
    };

    updateViewport();
    window.addEventListener("resize", updateViewportDebounced);
    const onOrientationChange = () => setTimeout(updateViewport, 120);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      clearTimeout(viewportTimer);
      window.removeEventListener("resize", updateViewportDebounced);
      window.removeEventListener("orientationchange", onOrientationChange);
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover";
    };
  }, [isTablet]);

  // ★ 태블릿용 전역 CSS 주입
  useEffect(() => {
    if (!isTablet) return;

    const styleId = "tablet-global-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
        style.textContent = `
      /* ═══════════ 태블릿 전용 CSS ═══════════ */

      /* 상단 메뉴: 전체 가로 스크롤 + 스크롤바 표시 */
      header nav,
      .menu-tab-container,
      .tab-scroll-container {
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        flex-wrap: nowrap !important;
        scrollbar-width: thin !important;
      }

      header nav::-webkit-scrollbar {
        height: 4px !important;
        display: block !important;
      }
      header nav::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.3) !important;
        border-radius: 4px !important;
      }
      header nav::-webkit-scrollbar-track {
        background: transparent !important;
      }

      /* 메뉴 버튼 축소 방지 */
      header nav > button,
      .menu-tab-container > button,
      .tab-scroll-container > button {
        flex-shrink: 0 !important;
        white-space: nowrap !important;
      }

      /* 입력 필드 태블릿 대응 */
      @media (min-width: 768px) and (max-width: 1400px) and (pointer: coarse) {
        input[type="text"],
        input[type="date"],
        input[type="number"],
        input[type="tel"],
        input[type="email"],
        input[type="search"],
        input[type="password"],
        select,
        textarea {
          min-height: 42px !important;
          font-size: 14px !important;
          padding: 8px 12px !important;
        }

        /* 8칸 그리드 → 세로모드 4칸, 가로모드 6칸 */
        .grid.grid-cols-8 {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        }

        form.grid.grid-cols-8 {
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 12px !important;
        }

        .col-span-2 {
          grid-column: span 2 / span 2 !important;
        }

        .col-span-8 {
          grid-column: 1 / -1 !important;
        }

        /* 팝업 최대 너비 */
        .fixed [class*="w-["] {
          max-width: 92vw !important;
        }

        /* 대시보드 너비 자동 조정 */
        .w-\\[1300px\\] {
          width: 100% !important;
          max-width: 100% !important;
        }

        /* 메인 레이아웃: flex row → column */
        .flex.items-start.gap-6.w-full {
          flex-direction: column !important;
        }
        .flex.items-start.gap-6.w-full > .flex-1,
        .flex.items-start.gap-6.w-full > div {
          width: 100% !important;
          max-width: 100% !important;
        }

        /* 헤더 높이 확보 */
        header .flex.items-center.px-6.h-14 {
          height: auto !important;
          min-height: 56px !important;
          padding: 8px 16px !important;
          flex-wrap: wrap !important;
        }

        /* 로고 영역 축소 */
        header .min-w-\\[180px\\] {
          min-width: auto !important;
        }

        /* 유저 영역 축소 */
        header .min-w-\\[180px\\]:last-child {
          min-width: auto !important;
        }
      }

      /* 가로 모드 */
      @media (orientation: landscape) and (max-width: 1400px) and (pointer: coarse) {
        .grid.grid-cols-8,
        form.grid.grid-cols-8 {
          grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        }
      }

      /* 태블릿 테이블 스크롤 */
      @media (max-width: 1400px) and (pointer: coarse) {
        table {
          display: block;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        thead, tbody, tr {
          display: table;
          width: 100%;
          table-layout: fixed;
        }
      }
    `;

    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, [isTablet]);

  // 스플래시 — 예전엔 인증/데이터 로딩이 훨씬 먼저 끝나도 무조건 모바일 3초 /
  // PC 1.5초를 다 채운 뒤에야 화면이 넘어갔다(특히 일부 폴더블 기기에서 "로딩이
  // 오래 걸린다"는 문의의 상당 부분이 실제 로딩이 아니라 이 고정 대기시간이었음).
  // 이제는 "최소 노출 시간"만 짧게 보장(브랜드 화면이 순간 반짝이고 사라지는 것
  // 방지용)하고, 실제 인증 처리(loading)가 끝나는 즉시 그 다음으로 넘어간다 —
  // 로딩이 최소 시간보다 오래 걸리면 로딩이 끝나는 순간 바로 전환되고, 로딩이 더
  // 빨리 끝나면 최소 시간만 채우고 전환된다.
  const [minSplashDone, setMinSplashDone] = useState(false);
  useEffect(() => {
    const MIN_MS = isSmartPhone() ? 500 : 350;
    const timer = setTimeout(() => setMinSplashDone(true), MIN_MS);
    return () => clearTimeout(timer);
  }, []);
  // ⭐ 2026-10-29 — 로고 화면이 너무 빨리 지나간다는 의견으로 PC·모바일 모두 1초 더 보여준다
  //    (준비가 끝난 뒤 1초 유지 → 실제 로딩이 길어도 항상 지금보다 정확히 1초 길게 보인다)
  const SPLASH_EXTRA_MS = 1000;
  useEffect(() => {
    if (loading || !minSplashDone) return;
    const t = setTimeout(() => setSplashDone(true), SPLASH_EXTRA_MS);
    return () => clearTimeout(t);
  }, [loading, minSplashDone]);

  const updateShownRef = useRef(false);

  // 네트워크 문제로 Firestore 응답 없을 때 영구 로딩 방지 (8초 타임아웃)
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  // 업데이트 이벤트 - UpdateBanner.jsx가 처리하므로 App에서는 제거

  // 최고관리자용 접속이력(sessionLogs) 기록 — 로그인/로그아웃 시점을 남긴다.
  // (탭을 그냥 닫는 경우는 onAuthStateChanged가 발화하지 않아 로그아웃 기록이 남지 않는
  //  일반적인 한계가 있음 — 명시적 로그아웃/세션 종료 시에만 기록된다.)
  const sessionLogRef = useRef({ uid: null, info: null });

  // 접속이력이 무한정 쌓이지 않도록, 기록을 남길 때마다 최신 50건만 남기고
  // 과거순으로 초과분을 정리한다.
  const pruneSessionLogs = async () => {
    try {
      const snap = await getDocs(query(collection(db, "sessionLogs"), orderBy("at", "desc"), limit(200)));
      const excess = snap.docs.slice(50);
      if (excess.length) {
        await Promise.all(excess.map((d) => deleteDoc(doc(db, "sessionLogs", d.id))));
      }
    } catch {}
  };

  // 인증 + 역할
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        try { sessionStorage.removeItem("kpEntry"); } catch { }
        if (sessionLogRef.current.uid && sessionLogRef.current.info) {
          addDoc(collection(db, "sessionLogs"), {
            ...sessionLogRef.current.info,
            event: "logout",
            at: serverTimestamp(),
          }).then(pruneSessionLogs).catch(() => {});
        }
        sessionLogRef.current = { uid: null, info: null };
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }
      setUser(u);
      const isMasterEmail = u.email === TOTAL_MASTER_EMAIL;
      // 🔒 운송사 분리 2단계 스위치(관리센터에서 예전 데이터 정리 후 켜짐) — 로그인 때마다 최신 값으로
      getDoc(doc(db, "systemConfig", "tenancy")).then((t) => setServerFilter(t.exists() && t.data()?.serverFilter === true)).catch(() => {});
      const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.employmentStatus === "퇴사" && !isMasterEmail) {
            alert("퇴사 처리된 계정입니다. 관리자에게 문의해주세요.");
            signOut(auth);
            setUser(null);
            setRole(null);
            setLoading(false);
            return;
          }
          const dataRole = isMasterEmail ? "totalMaster" : (data.role || "user");
          setRole(dataRole);
          setMasterPcPhone(data.pcVerifyPhone || "");
          // 스냅샷은 프로필이 바뀔 때마다 재발화될 수 있어, 이 uid로 로그인 기록을 아직
          // 남기지 않았을 때만(세션당 1회) 기록한다.
          if (sessionLogRef.current.uid !== u.uid) {
            const loginInfo = {
              uid: u.uid,
              email: u.email || "",
              name: data.name || data.이름 || data.담당자명 || "",
              role: dataRole,
              companyName: dataRole === "totalMaster"
                ? (localStorage.getItem("loginCompany") || "")
                : (data.companyName || ""),
            };
            sessionLogRef.current = { uid: u.uid, info: loginInfo };
            addDoc(collection(db, "sessionLogs"), {
              ...loginInfo,
              event: "login",
              at: serverTimestamp(),
            }).then(pruneSessionLogs).catch(() => {});
          }
          // approved !== false allows old accounts (undefined) and explicitly true
          // only blocks accounts explicitly set to false (new unapproved signups)
          setApproved(isMasterEmail ? true : data.approved !== false);
          try { window.__kpMeTeam = String(data.team || "").trim(); } catch { /* 무시 */ }
          if (dataRole === "totalMaster") {
            // totalMaster uses the company they typed at login, not their Firestore doc
            // ⭐ 저장된 회사명이 지워졌으면(캐시 정리 등) 본인 문서의 회사 → 기본 회사 순으로 채운다 —
            // 비어 있으면 회사관리·매출관리 등이 어느 회사인지 몰라 "로딩 중"에서 멈췄다.
            const loginCompany = localStorage.getItem("loginCompany") || data.companyName || DEFAULT_COMPANY || "";
            setTenant(loginCompany);
            setUserCompany(loginCompany);
            safeLocalSet("userCompany", loginCompany);
            safeLocalSet("loginCompany", loginCompany);
          } else {
            // 🏢 운송사 직원·기사만 자기 회사 데이터로 거른다(화주사·배차마당은 다른 화면 구조라 제외)
            setTenant(["shipper", "cafeUser"].includes(dataRole) ? "" : (data.companyName || DEFAULT_COMPANY));
            setUserCompany(data.companyName || "");
            safeLocalSet("userCompany", data.companyName || "");
          }
          // localStorage가 꽉 찬 경우 대용량 항목 먼저 정리 후 저장
          const safeSetItem = (key, val) => {
            try { localStorage.setItem(key, val); } catch {
              ["mobileNotifs", "attachments", "detailAttachments"].forEach(k => { try { localStorage.removeItem(k); } catch {} });
              // shownNotifs_ prefix 항목도 정리
              Object.keys(localStorage).filter(k2 => k2.startsWith("shownNotifs_") || k2.startsWith("attach_")).forEach(k2 => { try { localStorage.removeItem(k2); } catch {} });
              safeLocalSet(key, val);
            }
          };
          safeSetItem("role", dataRole);
        } else if (isMasterEmail) {
          setMasterPcPhone("");
          // users 문서 자체가 없어도(예: KP-Planner 전용으로만 가입해본 경우) 이
          // 이메일은 무조건 최고관리자로 들어가야 한다.
          setRole("totalMaster");
          setApproved(true);
          const loginCompany = localStorage.getItem("loginCompany") || DEFAULT_COMPANY || "";
          setTenant(loginCompany);
          setUserCompany(loginCompany);
          safeLocalSet("userCompany", loginCompany); safeLocalSet("loginCompany", loginCompany); safeLocalSet("role", "totalMaster");
        } else {
          setTenant("");
          setRole(null);
          setApproved(false);
          setUserCompany("");
        }
        setLoading(false);
      });
      return () => unsubUser();
    });
    return () => unsub();
  }, []);

  // 공개 라우트는 인증/스플래시 없이 바로 렌더링 (Android PWA start_url 우회)
  const PUBLIC_ROUTES = { "/driver-upload": DriverSearchPage, "/upload": UploadPage };
  const publicMatch = PUBLIC_ROUTES[window.location.pathname];
  if (publicMatch) {
    const PublicComp = publicMatch;
    return <Router><Routes><Route path="*" element={<PublicComp />} /></Routes></Router>;
  }

  // 기사전달용 짧은 업로드 링크 (/u/{code}) — /upload?id=...&t=...로 리다이렉트
  const shortLinkMatch = window.location.pathname.match(/^\/u\/([A-Za-z0-9]+)$/);
  if (shortLinkMatch) {
    return <Router><Routes><Route path="*" element={<React.Suspense fallback={null}><ShortLinkRedirect code={shortLinkMatch[1]} /></React.Suspense>} /></Routes></Router>;
  }

  // ✍ 전자계약 서명 링크 (/sign/{계약ID}) — 로그인 없이 고객이 열어 서명
  const signMatch = window.location.pathname.match(/^\/sign\/([A-Za-z0-9_-]+)$/);
  if (signMatch) {
    return <Router><Routes><Route path="*" element={<React.Suspense fallback={null}><ContractSign id={signMatch[1]} /></React.Suspense>} /></Routes></Router>;
  }

  // 로딩/스플래시 — ⭐ 2026-10-28 디지털 리디자인(네이비 + 디지털 로고 마크). index.html의 첫 화면과 똑같이 생겨서
  // "앱 파일 받는 중 → 로그인 확인 중" 사이에 화면이 바뀌는 티가 나지 않는다.
  if (loading || !splashDone) {
    return <KpSplash />;
  }

  const isMobile = isSmartPhone();

  const routeFallback = (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(90% 60% at 50% 0%, #22396A 0%, #0F1A30 55%, #060D1C 100%)" }}>
      <style>{`
        @keyframes routeFallbackPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1); }
        }
      `}</style>
      <div style={{ display: "flex", gap: "9px" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#8FB0F0", animation: "routeFallbackPulse 1.1s ease-in-out 0.9s infinite" }} />
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#8FB0F0", animation: "routeFallbackPulse 1.1s ease-in-out 1.1s infinite" }} />
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#8FB0F0", animation: "routeFallbackPulse 1.1s ease-in-out 1.3s infinite" }} />
      </div>
    </div>
  );

  // 📱 기사앱(APK)은 기사 전용 — 운송사·화주사 선택 없이 바로 기사 로그인
  const isDriverApk = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
  const rootRedirect = isDriverApk ? "/driver-login" : "/login";

  return (
    <>
      {/* 자동 업데이트 배너 (팝업 없이 상단 배너로 표시 후 자동 새로고침). */}
      <UpdateBanner />
      <VersionCheck />

      {/* ⭐ 중복 로그인 선택창 */}
      {sessionConflict && (
        <div className="fixed inset-0 z-[100000] bg-black/55 flex items-center justify-center p-5">
          <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 text-white">
              <div className="text-[17px] font-black">이미 로그인된 {KIND_LABEL[sessionConflict.kind]}가 있습니다</div>
              <div className="text-[12.5px] text-white/70 mt-0.5">한 계정은 PC 1대 + 모바일 1대까지 동시에 쓸 수 있습니다</div>
            </div>
            <div className="px-6 py-5 space-y-2">
              {sessionConflict.conflicts.map((c) => (
                <div key={c.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-[14px] font-bold text-gray-800">{c.device || KIND_LABEL[c.kind]}</div>
                  <div className="text-[12.5px] text-gray-500 mt-0.5">마지막 활동 {timeAgo(sessionLastMs(c))}</div>
                </div>
              ))}
              <p className="text-[13px] text-gray-600 pt-1">기존 로그인을 끊고 이 {KIND_LABEL[sessionConflict.kind]}에서 로그인할까요? 기존 기기는 바로 로그아웃됩니다.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 px-6 pb-6">
              <button onClick={cancelSessionConflict} disabled={sessionBusy} className="py-3 rounded-xl border border-gray-300 text-[14px] font-bold text-gray-700 hover:bg-gray-50">취소</button>
              <button onClick={acceptSessionConflict} disabled={sessionBusy} className="py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60] disabled:opacity-60">
                {sessionBusy ? "처리 중…" : "기존 로그인 끊고 로그인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⭐ 최고관리자 PC 2차 인증 화면 — 통과 전까지 프로그램을 가린다 */}
      {needPcMfa && !sessionConflict && (
        <PcVerifyGate uid={user.uid} phone={masterPcPhone} onCancel={() => signOut(auth).catch(() => {})} />
      )}

      {/* ⭐ 최고관리자 2차 인증 등록 안내 */}
      {mfaNag && !needPcMfa && !sessionConflict && user && (
        <div className="fixed inset-0 z-[100000] bg-black/55 flex items-center justify-center p-5">
          <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-5 text-white">
              <div className="text-[17px] font-black">PC 2차 인증을 등록해 주세요</div>
              <div className="text-[12.5px] text-white/70 mt-0.5">최고관리자 계정은 전체 회사 데이터를 다룰 수 있어 보안이 중요합니다</div>
            </div>
            <div className="px-6 py-5 text-[13.5px] text-gray-700 leading-relaxed">
              휴대폰 번호를 등록하면 <b>PC에서</b> 로그인할 때마다 비밀번호 다음에 <b>문자로 받은 인증번호 6자리</b>를 입력해야 프로그램이 열립니다. 모바일은 묻지 않습니다.
            </div>
            <div className="grid grid-cols-2 gap-2 px-6 pb-6">
              <button onClick={() => setMfaNag(false)} className="py-3 rounded-xl border border-gray-300 text-[14px] font-bold text-gray-700 hover:bg-gray-50">나중에</button>
              <button onClick={() => { setMfaNag(false); setMfaSetupOpen(true); }} className="py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold hover:bg-[#243a60]">지금 등록하기</button>
            </div>
          </div>
        </div>
      )}
      {mfaSetupOpen && user && <LoginManagerModal user={user} onClose={() => setMfaSetupOpen(false)} />}

      {/* ⭐ 다른 곳에서 연결이 끊겨 로그아웃됐다는 안내 */}
      {kickedReason && (
        <div className="fixed inset-0 z-[100000] bg-black/55 flex items-center justify-center p-5">
          <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-2xl p-6 text-center">
            <div className="text-[17px] font-black text-[#1B2B4B]">로그아웃되었습니다</div>
            <p className="text-[13.5px] text-gray-600 mt-2 leading-relaxed">
              {kickedReason === "duplicate" ? "같은 계정으로 다른 기기에서 로그인해서 이 기기의 로그인이 끊겼습니다."
                : kickedReason === "password" ? "비밀번호가 변경되어 이 기기의 로그인이 끊겼습니다."
                  : kickedReason === "admin" ? "관리자가 이 기기의 로그인을 끊었습니다."
                    : `이 기기의 로그인이 끊겼습니다. (${END_REASON_LABEL[kickedReason] || "연결 끊기"})`}
            </p>
            <button onClick={() => setKickedReason(null)} className="mt-5 w-full py-3 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-bold">확인</button>
          </div>
        </div>
      )}

      <Router>
        <React.Suspense fallback={routeFallback}>
        <Routes>
          <Route path="/" element={<Navigate to={rootRedirect} replace />} />

          <Route
            path="/login"
            element={
              user
                ? role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : role === "shipper"
                    ? (approved ? <Navigate to="/shipper" replace /> : <Navigate to="/shipper-pending" replace />)
                    : <Navigate to="/app" replace />
                : (isDriverApk ? <Navigate to="/driver-login" replace /> : <Login />)
            }
          />

          <Route path="/signup" element={<Signup />} />

          <Route
            path="/transport-login"
            element={(() => {
              const validating = sessionStorage.getItem("transportValidating") === "true";
              const skip = sessionStorage.getItem("skipLoginPopup") === "true";
              if (user && !validating && !skip) {
                return role === "driver"
                  ? <Navigate to="/driver-home" replace />
                  : role === "shipper"
                    ? (approved ? <Navigate to="/shipper" replace /> : <Navigate to="/shipper-pending" replace />)
                    : <Navigate to="/app" replace />;
              }
              if (isDriverApk) return <Navigate to="/driver-login" replace />;
              return <TransportLogin />;
            })()}
          />

          <Route
            path="/shipper-login"
            element={(() => {
              const shipperValidating = sessionStorage.getItem("shipperValidating") === "true";
              const skip = sessionStorage.getItem("skipLoginPopup") === "true";
              if (user && role === "shipper" && !shipperValidating && !skip) {
                return approved ? <Navigate to="/shipper" replace /> : <Navigate to="/shipper-pending" replace />;
              }
              return <ShipperLogin />;
            })()}
          />

          <Route path="/shipper-signup" element={<ShipperSignup />} />

          <Route
            path="/shipper-pending"
            element={
              user && role === "shipper"
                ? (approved ? <Navigate to="/shipper" replace /> : <ShipperPending />)
                : <Navigate to="/shipper-login" replace />
            }
          />

          <Route
            path="/shipper/*"
            element={
              user && (role === "shipper" || user.email === "tjddnqkf@naver.com")
                ? ((approved || user.email === "tjddnqkf@naver.com")
                    ? (isMobile ? <ShipperMobileApp /> : <ShipperApp />)
                    : <Navigate to="/shipper-pending" replace />)
                : <Navigate to="/shipper-login" replace />
            }
          />

          <Route
            path="/driver-login"
            element={user && role === "driver" && approved ? <Navigate to="/driver-home" replace /> : <DriverLogin />}
          />
          <Route
            path="/driver-register"
            element={user && role === "driver" && approved ? <Navigate to="/driver-home" replace /> : <DriverRegister />}
          />
          <Route
            path="/driver-home"
            element={user && role === "driver" && approved ? <DriverHome /> : <Navigate to="/driver-login" replace />}
          />

          <Route
            path="/app"
            element={
              user && role !== "shipper" && role !== "driver" && approved
                ? (role === "totalMaster"
                    ? <EntryGate>{isMobile ? <MobileApp role={role} user={user} userCompany={userCompany} /> : <DispatchApp role={role} user={user} userCompany={userCompany} />}</EntryGate>
                    : isMobile ? <MobileApp role={role} user={user} userCompany={userCompany} /> : <DispatchApp role={role} user={user} userCompany={userCompany} />)
                : <Navigate to="/login" replace />
            }
          />

          {/* 🛰 최고관리자: 로그인할 때마다 "관리자 관리센터 / 배차 프로그램" 선택 */}
          <Route
            path="/choose"
            element={user && role === "totalMaster" ? <EntryChooser user={user} /> : <Navigate to="/app" replace />}
          />
          <Route
            path="/platform"
            element={user && role === "totalMaster" ? <PlatformCenter user={user} /> : <Navigate to="/app" replace />}
          />

          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/standard-fare" element={<StandardFare />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/driver-upload" element={<DriverSearchPage />} />
          <Route path="/no-access" element={<NoAccess />} />
          <Route path="/preview" element={<PreviewApp />} />

          <Route
            path="*"
            element={
              user
                ? role === "shipper"
                  ? <Navigate to="/shipper" replace />
                  : role === "driver"
                    ? <Navigate to="/driver-home" replace />
                    : <Navigate to="/app" replace />
                : <Navigate to={rootRedirect} replace />
            }
          />
        </Routes>
        </React.Suspense>
      </Router>
    </>
  );
}
