// src/planner/PlannerRoot.jsx — 로그인 이후 KP-Planner 메인 화면.
// 배차프로그램 화면과는 완전히 별개의 셸(헤더/메뉴)이고, 안의 내용만
// AdminPlanner(PC)/AdminPlannerMobile(모바일)을 그대로 재사용한다.
import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import KPPlannerLogo from "./KPPlannerLogo";
import PlannerSplash from "./PlannerSplash";
import PlannerAdminPanel from "./PlannerAdminPanel";
import { usePlannerAccount, plannerLogout } from "./plannerAuth";
import { ACCENT, applyGenderTheme } from "./plannerTheme";
import AdminPlanner from "../AdminPlanner";
import AdminPlannerMobile from "../mobile/AdminPlannerMobile";

function isSmartPhone() {
  const ua = navigator.userAgent.toLowerCase();
  const isIpad = (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || ua.includes("ipad");
  if (isIpad) return false;
  if (ua.includes("tablet")) return false;
  const isPhoneUA = /iphone|ipod|android(?!.*tablet)/.test(ua);
  const isSmallScreen = window.innerWidth < 768;
  return isPhoneUA || isSmallScreen;
}

const PLANNER_MENU_ITEMS = [
  ["dashboard", "홈"],
  ["ledger", "수입·지출"],
  ["calendar", "일정"],
  ["family", "가족 예산"],
];

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

function PlannerMobileShell({ account }) {
  const [page, setPage] = useState("dashboard");
  const [showMenu, setShowMenu] = useState(false);
  const pageTitle = PLANNER_MENU_ITEMS.find(([v]) => v === page)?.[1] || "홈";

  return (
    <div style={{ width: "100%", minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fffafc" }}>
      <div style={{ background: ACCENT, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{pageTitle}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GroupCodeBadge groupId={account.groupId} />
          <button onClick={() => setShowMenu(true)} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <AdminPlannerMobile userCompany={account.groupId} dispatcherName={account.name} activeTab={page} onTabChange={setPage} hideTabBar />
      </div>

      {showMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex" }} onClick={() => setShowMenu(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
          <div style={{ position: "relative", marginLeft: "auto", width: 260, height: "100%", background: "#fff", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #f9e6ee" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4A2E3D" }}>메뉴</div>
              <div style={{ fontSize: 11.5, color: "#a58a97", marginTop: 2 }}>{account.groupName || "우리 가족"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 0" }}>
              {PLANNER_MENU_ITEMS.map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => { setPage(v); setShowMenu(false); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 20px", fontSize: 13.5, fontWeight: 600, border: "none", cursor: "pointer",
                    background: page === v ? ACCENT : "transparent",
                    color: page === v ? "#fff" : "#4A2E3D",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ padding: "16px 20px", borderTop: "1px solid #f9e6ee" }}>
              <button onClick={plannerLogout} style={{ fontSize: 13, fontWeight: 600, color: "#a58a97", background: "none", border: "none", cursor: "pointer" }}>
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlannerDesktopShell({ account, onUpdated }) {
  const [showAdmin, setShowAdmin] = useState(false);
  const isOwner = account.role === "owner";
  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#fffafc" }}>
      <div style={{ background: ACCENT, padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ filter: "brightness(0) invert(1)" }}>
            <KPPlannerLogo size="sm" showTagline={false} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5 }}>{account.name}님 · {account.groupName || "우리 가족"}</span>
          <GroupCodeBadge groupId={account.groupId} />
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
      <AdminPlanner userCompany={account.groupId} myRealName={account.name} />

      {showAdmin && (
        <PlannerAdminPanel account={account} onClose={() => setShowAdmin(false)} onUpdated={onUpdated} />
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
          <div style={{ marginTop: 24, fontSize: 13.5, color: "#8b7480", lineHeight: 1.7 }}>
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
    ? <PlannerMobileShell account={effectiveAccount} />
    : <PlannerDesktopShell account={effectiveAccount} onUpdated={setAccountOverride} />;
}
