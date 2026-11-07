// ======================= src/MyInfoTabs.jsx =======================
// ⭐ 2026-11-07 내정보 안 탭(모바일 MobileMyInfo 겉 탭 · PC는 MyProfilePage extraTabs로 myInfoExtraTabs) — [내 정보](기존 화면 그대로) · [급여명세서](MyPayslipsSection) · [연차 사용 계획](MyLeavePlan)
//  예전엔 회사관리 › 급여명세서 · 연차 사용 계획이 따로 메뉴였다 → 본인 것이라 내정보 안으로(PC 회사관리 › 내정보 · 모바일 내정보 같음)
//  내정보 화면 자체(MyProfilePage · MobileMyInfo)는 건드리지 않고 겉에서 탭만 씌운다
//  다른 화면에서 바로 열기: sessionStorage kpMyInfoTab = "급여명세서" | "연차 사용 계획" + window 이벤트 "kp-myinfo-tab"
import React from "react";

const MyPayslipsSection = React.lazy(() => import("./Payroll").then((m) => ({ default: m.MyPayslipsSection })));
const MyLeavePlan = React.lazy(() => import("./LeavePromotion").then((m) => ({ default: m.MyLeavePlan })));
export const MY_INFO_TABS = ["내 정보", "급여명세서", "연차 사용 계획"];
const peek = () => { try { return sessionStorage.getItem("kpMyInfoTab") || ""; } catch { return ""; } };
const fb = <div className="py-20 text-center text-[14px] font-bold text-[#7A879C]">불러오는 중…</div>;
// PC 내정보(MyProfilePage)의 extraTabs로 넘기는 탭 2개 — 내정보 화면이 탭 줄을 직접 그린다
export function myInfoExtraTabs(company, uid) {
  return [
    { key: "급여명세서", render: () => <React.Suspense fallback={fb}><MyPayslipsSection company={company} uid={uid} /></React.Suspense> },
    { key: "연차 사용 계획", render: () => <React.Suspense fallback={fb}><MyLeavePlan company={company} uid={uid} /></React.Suspense> },
  ];
}
// 다른 화면(알림 [급여명세서 열기])에서 정한 탭을 받는다 — useState 초기값 + 이벤트
export const initialMyInfoTab = (fallback = "내 정보") => (MY_INFO_TABS.includes(peek()) ? peek() : fallback);
export function useMyInfoTabLink(setTab) {
  React.useEffect(() => {
    try { sessionStorage.removeItem("kpMyInfoTab"); } catch { /* 무시 */ }
    const h = () => { const v = peek(); if (MY_INFO_TABS.includes(v)) { setTab(v); try { sessionStorage.removeItem("kpMyInfoTab"); } catch { /* 무시 */ } } };
    window.addEventListener("kp-myinfo-tab", h); return () => window.removeEventListener("kp-myinfo-tab", h);
  }, [setTab]);
}

export default function MyInfoTabs({ company, uid, children, mobile = false, enabled = true }) {
  const [tab, setTab] = React.useState(() => initialMyInfoTab());
  useMyInfoTabLink(setTab);
  if (!enabled) return children;
  const fallback = <div className="py-20 text-center text-[14px] font-bold text-[#7A879C]">불러오는 중…</div>;
  return (
    <div className="min-w-0" data-testid="myinfo-tabs">
      <div className={`${mobile ? "sticky top-0 z-20 px-3 pt-2 pb-2 bg-[#F4F6FA]/95 backdrop-blur" : "mb-3"}`}>
        <div className={`flex p-1 rounded-xl bg-white border border-[#E3E8F0] gap-1 ${mobile ? "" : "w-fit"}`} role="tablist" aria-label="내정보">
          {MY_INFO_TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`${mobile ? "flex-1" : "px-4"} h-10 rounded-lg text-[14px] font-black whitespace-nowrap ${tab === k ? "bg-[#0F1A30] text-white" : "text-[#3A4A66] hover:bg-[#F5F8FD]"}`} data-testid={`myinfo-tab-${k}`}>{k}</button>
          ))}
        </div>
      </div>
      {tab === "내 정보" ? children : (
        <div className={mobile ? "px-3 pb-6" : ""}>
          <React.Suspense fallback={fallback}>
            {tab === "급여명세서" && <MyPayslipsSection company={company} uid={uid} />}
            {tab === "연차 사용 계획" && <MyLeavePlan company={company} uid={uid} />}
          </React.Suspense>
        </div>
      )}
    </div>
  );
}
