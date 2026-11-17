// ======================= src/ApprovalComment.jsx =======================
import React from "react";
import { createPortal } from "react-dom";

// 💬 2026-11-17 결재 이력의 의견(반려 사유 · 메모) — 작고 흐려서 잘 안 보였다(사용자 요청)
//  · 15px · 진한 글씨 · 줄 간격 넓게 · 반려는 빨간 왼쪽 선, 승인은 남색 선
//  · 길면 4줄까지만 보이고 [자세히 보기] → 가운데 큰 팝업(17px)으로 전체 내용 · 복사 버튼
export function HistoryComment({ h }) {
  const [open, setOpen] = React.useState(false);
  const text = String(h.comment || "");
  const long = text.length > 90 || text.split("\n").length > 4;
  const bar = h.action === "반려" ? "#E5484D" : h.action === "승인" ? "#1B2B4B" : "#9AA9C3";
  React.useEffect(() => { if (!open) return undefined; const k = (e) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  const when = h.at ? new Date(h.at).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <>
      <div className="mt-1.5 rounded-lg bg-white border border-[#E3E8F0] border-l-[3px] px-3 py-2" style={{ borderLeftColor: bar }} data-ap-comment>
        <div className={`text-[15px] leading-[1.65] font-medium text-[#0F1A30] whitespace-pre-wrap break-keep [overflow-wrap:anywhere] ${long ? "line-clamp-4" : ""}`}>{text}</div>
        {long && <button type="button" onClick={() => setOpen(true)} className="mt-1.5 h-7 px-2.5 rounded-md bg-[#EEF3FB] text-[#2D4C82] text-[12.5px] font-black hover:bg-[#E1EAF8]">자세히 보기</button>}
        {!long && text.length > 30 && <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[12px] font-bold text-[#5B6B85] underline underline-offset-2 hover:text-[#1B2B4B]">크게 보기</button>}
      </div>
      {open && createPortal(
        <div className="fixed inset-0 z-[100005] bg-[#0B1324]/55 flex items-center justify-center p-4" onClick={() => setOpen(false)} data-ap-comment-modal>
          <div className="w-full max-w-[640px] max-h-[86vh] bg-white rounded-2xl shadow-[0_24px_60px_rgba(11,19,36,.4)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E3E8F0] flex items-center gap-3" style={{ borderTop: `4px solid ${bar}` }}>
              <div className="min-w-0 mr-auto">
                <div className="text-[12px] font-bold text-[#5B6B85]">{h.action === "반려" ? "반려 사유" : h.action === "승인" ? "승인 의견" : "의견"}</div>
                <div className="text-[18px] font-black text-[#0F1A30] truncate">{h.name} <span style={{ color: bar }}>{h.action}</span><span className="ml-2 text-[13px] font-semibold text-[#7A879C]">{when}</span></div>
              </div>
              <button type="button" onClick={() => { try { navigator.clipboard?.writeText(text); } catch { /* 무시 */ } }} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66] hover:bg-[#F4F6FA]">복사</button>
              <button type="button" onClick={() => setOpen(false)} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 text-[17px] leading-[1.8] font-medium text-[#0F1A30] whitespace-pre-wrap break-keep [overflow-wrap:anywhere]">{text}</div>
          </div>
        </div>, document.body)}
    </>
  );
}
