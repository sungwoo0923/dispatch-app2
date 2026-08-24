// src/planner/PlannerRoot.jsx — 로그인 이후 KP-Planner 메인 화면.
// 배차프로그램 화면과는 완전히 별개의 셸(헤더/메뉴)이고, 안의 내용만
// AdminPlanner(PC)/AdminPlannerMobile(모바일)을 그대로 재사용한다.
import React, { useState, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import KPPlannerLogo from "./KPPlannerLogo";
import PlannerSplash from "./PlannerSplash";
import PlannerAdminPanel from "./PlannerAdminPanel";
import PlannerMobileShell from "./PlannerMobileShell";
import PlannerMyInfo from "./PlannerMyInfo";
import PlannerSettings from "./PlannerSettings";
import PlannerMessenger from "./PlannerMessenger";
import PlannerNotificationBell from "./PlannerNotificationBell";
import { usePlannerAccount, plannerLogout, useGroupMembers, TOTAL_MASTER_EMAIL } from "./plannerAuth";
import { usePlannerUnreadCount } from "../adminPlannerData";
import PlannerAlertBanner from "./PlannerAlertBanner";
import { ACCENT, BG, applyGenderTheme } from "./plannerTheme";
import AdminPlanner from "../AdminPlanner";

function isSmartPhone() {
  const ua = navigator.userAgent.toLowerCase();
  const isIpad = (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || ua.includes("ipad");
  if (isIpad) return false;
  if (ua.includes("tablet")) return false;
  const isPhoneUA = /iphone|ipod|android(?!.*tablet)/.test(ua);
  const isSmallScreen = window.innerWidth < 768;
  return isPhoneUA || isSmallScreen;
}

// ⭐ 헤더에 "내 이름 · 가족 이름"이 아니라 "내 이름 · 배우자 이름"으로 보이길
// 원해서, 같은 가족 코드의 다른 구성원 이름에도 "님"을 붙여서 보여준다(아직
// 배우자가 가입 전이라 나 혼자뿐이면 가족 이름으로 대체).
function useOtherMembersLabel(account) {
  const members = useGroupMembers(account.groupId);
  const others = members.filter((m) => m.uid !== account.uid);
  if (others.length === 0) return account.groupName || "우리 가족";
  return others.map((m) => `${m.name || "이름없음"}님`).join(" · ");
}

function PlannerDesktopShell({ account, onUpdated }) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMyInfo, setShowMyInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMessenger, setShowMessenger] = useState(false);
  const [homeSignal, setHomeSignal] = useState(0);
  const isOwner = account.email === TOTAL_MASTER_EMAIL;
  const otherLabel = useOtherMembersLabel(account);
  const unreadCount = usePlannerUnreadCount(account.groupId, account.uid);
  return (
    <div style={{ width: "100%", minHeight: "100vh", background: BG }}>
      <div style={{ background: ACCENT, padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={() => setHomeSignal((v) => v + 1)}
          style={{ display: "flex", alignItems: "center", gap: 14, background: "none", border: "none", cursor: "pointer" }}
          title="홈으로"
        >
          <div style={{ filter: "brightness(0) invert(1)" }}>
            <KPPlannerLogo size="sm" showTagline={false} />
          </div>
          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: 700 }}>{account.groupName || "우리 가족"}</div>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5 }}>{account.name}님 · {otherLabel}</span>
          <button
            onClick={() => setShowMessenger(true)}
            style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", position: "relative" }}
            title="메신저"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {unreadCount > 0 && (
              <span style={{ position: "absolute", top: 0, right: 0, minWidth: 14, height: 14, borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          <PlannerNotificationBell groupId={account.groupId} />
          <button
            onClick={() => setShowMyInfo(true)}
            style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
          >
            내정보
          </button>
          <button
            onClick={() => setShowSettings(true)}
            style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
          >
            설정
          </button>
          {isOwner && (
            <button
              onClick={() => setShowAdmin(true)}
              style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
            >
              관리자 메뉴
            </button>
          )}
          <button onClick={plannerLogout} style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.85)", background: "none", border: "none", cursor: "pointer" }}>
            로그아웃
          </button>
        </div>
      </div>
      <AdminPlanner
        userCompany={account.groupId} myRealName={account.name} myUid={account.uid} myGender={account.gender}
        coupleStartDate={account.coupleStartDate} onAccountUpdated={(patch) => onUpdated?.({ ...account, ...patch })}
        goHomeSignal={homeSignal}
      />

      {showAdmin && (
        <PlannerAdminPanel account={account} onClose={() => setShowAdmin(false)} onUpdated={onUpdated} />
      )}
      {showMyInfo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setShowMyInfo(false)} />
          <div style={{ position: "relative", width: 420, maxWidth: "100%", background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#2a2a30" }}>내정보</div>
              <button onClick={() => setShowMyInfo(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#6b7280", cursor: "pointer" }}>✕</button>
            </div>
            <PlannerMyInfo account={account} onUpdated={onUpdated} />
          </div>
        </div>
      )}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setShowSettings(false)} />
          <div style={{ position: "relative", width: 420, maxWidth: "100%", background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#2a2a30" }}>설정</div>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#6b7280", cursor: "pointer" }}>✕</button>
            </div>
            <PlannerSettings account={account} onUpdated={onUpdated} />
          </div>
        </div>
      )}
      {showMessenger && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setShowMessenger(false)} />
          <div style={{ position: "relative", width: 480, maxWidth: "100%", height: 600, maxHeight: "85vh", background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 10px 30px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#2a2a30" }}>메신저</div>
              <button onClick={() => setShowMessenger(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#6b7280", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <PlannerMessenger groupId={account.groupId} myUid={account.uid} myName={account.name} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ⭐ 앱을 "처음" 열 때만 로고가 천천히 나타났다가(최소 노출시간 보장) 천천히
// 사라지는 스플래시를 보여준다 — 로그인 화면에서 로그인 버튼을 눌러 /planner로
// 넘어올 때처럼, 이미 이번 세션에서 한 번 스플래시를 본 뒤에는 다시 보여주지
// 않고 로그인 확인이 끝나는 즉시 바로 화면을 넘긴다("로그인하면 바로 홈으로").
let firstSplashShown = false;
const MIN_SPLASH_MS = 1200;
const SPLASH_FADE_MS = 450;

export default function PlannerRoot() {
  const { loading, user, account } = usePlannerAccount();
  const [accountOverride, setAccountOverride] = useState(null);
  const isFirstShowRef = useRef(!firstSplashShown);
  if (isFirstShowRef.current) firstSplashShown = true;
  const [splashPhase, setSplashPhase] = useState(() => (isFirstShowRef.current ? "visible" : (loading ? "visible" : "done")));
  const mountedAt = useRef(Date.now());
  useEffect(() => { document.title = "KP-Planner"; }, []);
  useEffect(() => { setAccountOverride(null); }, [account]);

  useEffect(() => {
    if (loading) return;
    if (!isFirstShowRef.current) { setSplashPhase("done"); return; }
    const elapsed = Date.now() - mountedAt.current;
    const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
    const t = setTimeout(() => setSplashPhase("fading"), wait);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (splashPhase !== "fading") return;
    const t = setTimeout(() => setSplashPhase("done"), SPLASH_FADE_MS);
    return () => clearTimeout(t);
  }, [splashPhase]);

  const effectiveAccount = accountOverride || account;

  if (splashPhase !== "done") return <PlannerSplash fadeOut={splashPhase === "fading"} />;
  if (!user) return <Navigate to="/planner-login" replace />;

  if (!effectiveAccount) {
    return (
      <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center" }}>
          <KPPlannerLogo size="md" />
          <div style={{ marginTop: 24, fontSize: 13.5, color: "#6e5c67", lineHeight: 1.7 }}>
            이 계정은 KP-Planner 계정이 아닙니다.<br />
            다른 계정으로 다시 로그인해 주세요.
          </div>
          <button
            onClick={plannerLogout}
            style={{ marginTop: 18, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#EC6FA0", border: "none", borderRadius: 10, cursor: "pointer" }}
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // ⭐ 화면을 그리기 전에, 로그인한 계정의 성별에 맞는 팔레트를 반영한다(남자는
  // 네이비+화이트, 여자/기본은 핑크). AdminPlanner/AdminPlannerMobile은 모듈에서
  // 이 값을 직접 읽으므로, 이 호출이 먼저 끝난 뒤에 아래에서 그 컴포넌트들이
  // 렌더링돼야 첫 화면부터 올바른 색이 보인다.
  applyGenderTheme(effectiveAccount.gender);

  return (
    <>
      <PlannerAlertBanner account={effectiveAccount} />
      {isSmartPhone()
        ? <PlannerMobileShell account={effectiveAccount} onUpdated={setAccountOverride} />
        : <PlannerDesktopShell account={effectiveAccount} onUpdated={setAccountOverride} />}
    </>
  );
}
