// src/planner/PlannerMobileShell.jsx — KP-Planner 모바일 셸(햄버거 메뉴 + 슬라이드 메뉴).
// PlannerRoot(실제 모바일 화면)와 PlannerAdminPanel(관리자 메뉴의 "모바일 미리보기")가
// 완전히 동일한 컴포넌트를 그대로 재사용한다 — 예전엔 미리보기가 AdminPlannerMobile을
// 직접 불러서 옛날 탭 UI가 보이는 불일치가 있었는데, 이 파일로 추출해서 해결했다.
import React, { useState } from "react";
import AdminPlannerMobile from "../mobile/AdminPlannerMobile";
import PlannerCycleTracker from "./PlannerCycleTracker";
import PlannerMessenger from "./PlannerMessenger";
import PlannerMyInfo from "./PlannerMyInfo";
import { plannerLogout } from "./plannerAuth";
import { ACCENT } from "./plannerTheme";

export const PLANNER_MENU_ITEMS = [
  ["dashboard", "홈"],
  ["ledger", "수입·지출"],
  ["calendar", "일정"],
  ["family", "이벤트 예산"],
  ["cycle", "생리주기"],
  ["messenger", "메신저"],
  ["myinfo", "내정보"],
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

export default function PlannerMobileShell({ account, onUpdated }) {
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
        {(page === "dashboard" || page === "ledger" || page === "calendar" || page === "family") && (
          <AdminPlannerMobile userCompany={account.groupId} dispatcherName={account.name} activeTab={page} onTabChange={setPage} hideTabBar />
        )}
        {page === "cycle" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerCycleTracker groupId={account.groupId} myUid={account.uid} myGender={account.gender} myName={account.name} />
          </div>
        )}
        {page === "messenger" && (
          <div className="px-4 pt-4 pb-4" style={{ height: "calc(100vh - 56px)" }}>
            <PlannerMessenger groupId={account.groupId} myUid={account.uid} myName={account.name} />
          </div>
        )}
        {page === "myinfo" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerMyInfo account={account} onUpdated={onUpdated} />
          </div>
        )}
      </div>

      {showMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex" }} onClick={() => setShowMenu(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
          <div style={{ position: "relative", marginLeft: "auto", width: 260, height: "100%", background: "#fff", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #f9e6ee" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4A2E3D" }}>메뉴</div>
              <div style={{ fontSize: 11.5, color: "#a58a97", marginTop: 2 }}>{account.groupName || "우리 가족"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
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
