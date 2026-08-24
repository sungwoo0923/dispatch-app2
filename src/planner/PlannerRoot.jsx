// src/planner/PlannerRoot.jsx — 로그인 이후 KP-Planner 메인 화면.
// 배차프로그램 화면과는 완전히 별개의 셸(헤더/메뉴)이고, 안의 내용만
// AdminPlanner(PC)/AdminPlannerMobile(모바일)을 그대로 재사용한다.
import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import KPPlannerLogo from "./KPPlannerLogo";
import PlannerSplash from "./PlannerSplash";
import PlannerAdminPanel from "./PlannerAdminPanel";
import PlannerMobileShell from "./PlannerMobileShell";
import PlannerMyInfo from "./PlannerMyInfo";
import PlannerNotificationBell from "./PlannerNotificationBell";
import { usePlannerAccount, plannerLogout, useGroupMembers, TOTAL_MASTER_EMAIL } from "./plannerAuth";
import { ACCENT, applyGenderTheme } from "./plannerTheme";
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

function GroupCodeBadge({ groupId }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(groupId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      onClick={copy}
      title="눌러서 복사 — 배우자 초대용 가족 코드"
      style={{
        fontSize: 11.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.28)",
        border: "1px solid rgba(255,255,255,0.4)", borderRadius: 999, padding: "4px 10px", cursor: "pointer",
        letterSpacing: 1,
      }}
    >
      {copied ? "복사됨" : groupId}
    </button>
  );
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
  const isOwner = account.email === TOTAL_MASTER_EMAIL;
  const otherLabel = useOtherMembersLabel(account);
  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#fffafc" }}>
      <div style={{ background: ACCENT, padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ filter: "brightness(0) invert(1)" }}>
            <KPPlannerLogo size="sm" showTagline={false} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5 }}>{account.name}님 · {otherLabel}</span>
          <GroupCodeBadge groupId={account.groupId} />
          <PlannerNotificationBell groupId={account.groupId} />
          <button
            onClick={() => setShowMyInfo(true)}
            style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
          >
            내정보
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
      <AdminPlanner userCompany={account.groupId} myRealName={account.name} myUid={account.uid} myGender={account.gender} />

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
    </div>
  );
}

export default function PlannerRoot() {
  const { loading, user, account } = usePlannerAccount();
  const [accountOverride, setAccountOverride] = useState(null);
  useEffect(() => { document.title = "KP-Planner"; }, []);
  useEffect(() => { setAccountOverride(null); }, [account]);

  const effectiveAccount = accountOverride || account;

  if (loading) return <PlannerSplash />;
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

  return isSmartPhone()
    ? <PlannerMobileShell account={effectiveAccount} onUpdated={setAccountOverride} />
    : <PlannerDesktopShell account={effectiveAccount} onUpdated={setAccountOverride} />;
}
