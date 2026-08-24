// src/planner/PlannerMobileShell.jsx — KP-Planner 모바일 셸(햄버거 메뉴 + 슬라이드 메뉴).
// PlannerRoot(실제 모바일 화면)와 PlannerAdminPanel(관리자 메뉴의 "모바일 미리보기")가
// 완전히 동일한 컴포넌트를 그대로 재사용한다 — 예전엔 미리보기가 AdminPlannerMobile을
// 직접 불러서 옛날 탭 UI가 보이는 불일치가 있었는데, 이 파일로 추출해서 해결했다.
import React, { Suspense, useState } from "react";
import AdminPlannerMobile from "../mobile/AdminPlannerMobile";
import PlannerCycleTracker from "./PlannerCycleTracker";
import PlannerMessenger from "./PlannerMessenger";
import PlannerMyInfo from "./PlannerMyInfo";
import PlannerNotificationBell from "./PlannerNotificationBell";
import PlannerEventMoney from "./PlannerEventMoney";
import PlannerTimeline from "./PlannerTimeline";
import PlannerTimeCapsule from "./PlannerTimeCapsule";
import PlannerMiniGames from "./PlannerMiniGames";
import PlannerSettings from "./PlannerSettings";
import { plannerLogout, TOTAL_MASTER_EMAIL } from "./plannerAuth";
import { usePlannerUnreadCount } from "../adminPlannerData";
import { ACCENT, BG } from "./plannerTheme";

// ⭐ PlannerAdminPanel.jsx는 "모바일 미리보기"에서 이 파일을 그대로 불러 쓴다 — 여기서
// 그 파일을 정적으로 import하면 순환참조가 생기므로, 실제로 열 때만 lazy 로드한다
// (미리보기 안에서는 previewMode=true라 애초에 관리자 메뉴 항목 자체가 안 보인다).
const PlannerAdminPanel = React.lazy(() => import("./PlannerAdminPanel"));

// ⭐ 메신저는 메뉴 목록이 아니라 상단 헤더의 종 아이콘 옆 채팅 아이콘으로 바로 연다
// (메뉴에 묻혀있는 것보다 접근성이 낫다는 요청).
export const PLANNER_MENU_ITEMS = [
  ["dashboard", "홈"],
  ["ledger", "수입·지출"],
  ["calendar", "일정"],
  ["family", "이벤트 예산"],
  ["eventMoney", "경조사"],
  ["ourStory", "타임라인"],
  ["timeCapsule", "타임캡슐"],
  ["cycle", "생리주기"],
  ["games", "미니게임"],
  ["myinfo", "내정보"],
  ["settings", "설정"],
];

function ChatIconButton({ onClick, unreadCount = 0 }) {
  return (
    <button onClick={onClick} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", position: "relative" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
      {unreadCount > 0 && (
        <span style={{ position: "absolute", top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

// previewMode: 관리자 메뉴의 "모바일 미리보기" 안에서 렌더링될 때 true — 이 안에서는
// 관리자 메뉴로 또 들어가는 항목 자체를 숨긴다(미리보기 안에 미리보기가 열리는 걸 방지).
export default function PlannerMobileShell({ account, onUpdated, previewMode = false }) {
  const [page, setPage] = useState("dashboard");
  const [showMenu, setShowMenu] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMessenger, setShowMessenger] = useState(false);
  const isMaster = account.email === TOTAL_MASTER_EMAIL;
  const menuItems = isMaster && !previewMode ? [...PLANNER_MENU_ITEMS, ["__admin__", "관리자 메뉴"]] : PLANNER_MENU_ITEMS;
  const pageTitle = PLANNER_MENU_ITEMS.find(([v]) => v === page)?.[1] || "홈";
  const unreadCount = usePlannerUnreadCount(account.groupId, account.uid);

  return (
    <div style={{ width: "100%", minHeight: "100vh", display: "flex", flexDirection: "column", background: BG }}>
      {/* ⭐ 3분할 그리드(1fr auto 1fr) — 좌/우 폭이 서로 달라도 가운데(가족 이름)가
          항상 화면 정중앙에 오도록 한다(flex+빈 스페이서 방식은 좌우 폭이 다르면
          중앙이 어긋났다). */}
      <div style={{ background: ACCENT, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 8 }}>
        <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {pageTitle}
        </div>
        <button
          onClick={() => setPage("dashboard")}
          style={{ color: "#fff", fontWeight: 800, fontSize: 16, textAlign: "center", whiteSpace: "nowrap", background: "none", border: "none" }}
        >
          {account.groupName || "우리 가족"}
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          <ChatIconButton onClick={() => setShowMessenger(true)} unreadCount={unreadCount} />
          <PlannerNotificationBell groupId={account.groupId} />
          <button onClick={() => setShowMenu(true)} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {(page === "dashboard" || page === "ledger" || page === "calendar" || page === "family") && (
          <AdminPlannerMobile
            userCompany={account.groupId} dispatcherName={account.name} activeTab={page} onTabChange={setPage} hideTabBar
            myUid={account.uid} myGender={account.gender} coupleStartDate={account.coupleStartDate}
          />
        )}
        {page === "cycle" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerCycleTracker groupId={account.groupId} myUid={account.uid} myGender={account.gender} myName={account.name} />
          </div>
        )}
        {page === "eventMoney" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerEventMoney account={account} />
          </div>
        )}
        {page === "ourStory" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerTimeline account={account} onCoupleStartDateChange={(next) => onUpdated?.({ ...account, coupleStartDate: next })} />
          </div>
        )}
        {page === "timeCapsule" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerTimeCapsule account={account} />
          </div>
        )}
        {page === "games" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerMiniGames account={account} />
          </div>
        )}
        {page === "myinfo" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerMyInfo account={account} onUpdated={onUpdated} />
          </div>
        )}
        {page === "settings" && (
          <div className="px-4 pt-4 pb-24">
            <PlannerSettings account={account} onUpdated={onUpdated} />
          </div>
        )}
      </div>

      {showMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex" }} onClick={() => setShowMenu(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
          <div style={{ position: "relative", marginLeft: "auto", width: 260, height: "100%", background: "#fff", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #f9e6ee" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4A2E3D" }}>메뉴</div>
              <div style={{ fontSize: 11.5, color: "#7d6a75", marginTop: 2 }}>{account.groupName || "우리 가족"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
              {menuItems.map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => {
                    setShowMenu(false);
                    if (v === "__admin__") setShowAdmin(true);
                    else setPage(v);
                  }}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 20px", fontSize: 13.5, fontWeight: 600, border: "none", cursor: "pointer",
                    background: page === v ? ACCENT : "transparent",
                    color: page === v ? "#fff" : v === "__admin__" ? ACCENT : "#4A2E3D",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ padding: "16px 20px", borderTop: "1px solid #f9e6ee" }}>
              <button onClick={plannerLogout} style={{ fontSize: 13, fontWeight: 600, color: "#7d6a75", background: "none", border: "none", cursor: "pointer" }}>
                로그아웃
              </button>
              <div style={{ fontSize: 10.5, fontFamily: "monospace", color: "#c9b8c2", marginTop: 10 }}>v{__APP_VERSION__}</div>
            </div>
          </div>
        </div>
      )}

      {showMessenger && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: BG, display: "flex", flexDirection: "column" }}>
          <div style={{ background: ACCENT, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setShowMessenger(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>‹</button>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>메신저</div>
          </div>
          <div className="flex-1 px-4 pt-3 pb-3 min-h-0">
            <PlannerMessenger groupId={account.groupId} myUid={account.uid} myName={account.name} />
          </div>
        </div>
      )}

      {showAdmin && (
        <Suspense fallback={null}>
          <PlannerAdminPanel account={account} onClose={() => setShowAdmin(false)} onUpdated={onUpdated} />
        </Suspense>
      )}
    </div>
  );
}
