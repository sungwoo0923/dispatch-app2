// ======================= src/LeaveArea.jsx =======================
// ⭐ 2026-11-07 연차 관리 한곳으로 — [연차 현황](HrTools LeaveLedger) · [연차 사용 촉진](LeavePromotion, 근로기준법 61조)
//  예전엔 "연차 사용 촉진"이 따로 메뉴였다 → 인사관리부 › 연차 관리 안의 탭으로 합침(PC · 모바일 같음)
//  열 때 촉진 탭으로: initial="promo" 또는 sessionStorage kpLeaveTab="promo"(알림 [연차 사용 촉진 열기])
import React from "react";
import { LeaveLedger } from "./HrTools";

const LeavePromotionBoard = React.lazy(() => import("./LeavePromotion"));

export default function LeaveArea({ company, isViewer = false, canManage = false, promoManage = false, showPromo = true, initial = "" }) {
  const [tab, setTab] = React.useState(() => { let v = initial; try { v = v || sessionStorage.getItem("kpLeaveTab") || ""; sessionStorage.removeItem("kpLeaveTab"); } catch { /* 무시 */ } return v === "promo" && showPromo ? "promo" : "ledger"; });
  React.useEffect(() => {
    const h = () => { try { if (sessionStorage.getItem("kpLeaveTab") === "promo") { sessionStorage.removeItem("kpLeaveTab"); setTab("promo"); } } catch { /* 무시 */ } };
    window.addEventListener("kp-leave-tab", h); return () => window.removeEventListener("kp-leave-tab", h);
  }, []);
  return (
    <div className="space-y-3" data-testid="leave-area">
      {showPromo && (
        <div className="inline-flex p-1 rounded-xl bg-white border border-[#E3E8F0] gap-1" role="tablist">
          {[["ledger", "연차 현황"], ["promo", "연차 사용 촉진"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-10 px-4 rounded-lg text-[14px] font-black whitespace-nowrap ${tab === k ? "bg-[#0F1A30] text-white" : "text-[#3A4A66] hover:bg-[#F5F8FD]"}`} data-testid={`leave-tab-${k}`}>{l}</button>
          ))}
        </div>
      )}
      {tab === "promo" && showPromo
        ? <React.Suspense fallback={<div className="py-24 text-center text-[14px] font-bold text-[#7A879C]">불러오는 중…</div>}><LeavePromotionBoard company={company} canManage={promoManage} /></React.Suspense>
        : <LeaveLedger company={company} isViewer={isViewer} canManage={canManage} />}
    </div>
  );
}
