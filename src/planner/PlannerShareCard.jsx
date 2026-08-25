// src/planner/PlannerShareCard.jsx — "이번 달 요약"을 카톡 등으로 공유하는 기능.
// 예전엔 표 형태 PDF를 만들어 공유했는데, 알록달록하고 복잡해 보인다는 피드백에
// 맞춰 한 가지 강조색만 쓰는 깔끔한 요약 카드 이미지 한 장으로 바꿨다. 아이콘을
// 누르면 미리보기 팝업이 뜨고, 거기서 실제 공유(또는 저장)를 확정한다.
import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { fmtWon, todayStr } from "../adminPlannerData";
import { ACCENT } from "./plannerTheme";
import useBodyScrollLock from "./useBodyScrollLock";

function MonthlySummaryCard({ innerRef, label, totalIncome, totalExpense }) {
  const balance = totalIncome - totalExpense;
  return (
    <div style={{ position: "fixed", left: -99999, top: 0 }}>
      <div ref={innerRef} style={{ width: 600, background: "#ffffff", padding: 40 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af", letterSpacing: 1.5 }}>KP-PLANNER</div>
        <div style={{ fontSize: 23, fontWeight: 800, color: "#1f2937", marginTop: 6 }}>{label} 요약</div>
        <div style={{ height: 1, background: "#e5e7eb", margin: "22px 0" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>총 수입</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#1f2937" }}>{fmtWon(totalIncome)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>총 지출</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{fmtWon(totalExpense)}</span>
          </div>
          <div style={{ height: 1, background: "#e5e7eb" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#1f2937" }}>잔액</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: ACCENT }}>{fmtWon(balance)}</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 28 }}>{todayStr()} 기준</div>
      </div>
    </div>
  );
}

function PreviewModal({ imgURL, filename, onClose }) {
  useBodyScrollLock();
  const [sharing, setSharing] = useState(false);

  const doShare = async () => {
    setSharing(true);
    try {
      const res = await fetch(imgURL);
      const blob = await res.blob();
      const file = new File([blob], `${filename}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
      } else {
        const a = document.createElement("a");
        a.href = imgURL;
        a.download = `${filename}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // 사용자가 공유 시트를 취소한 경우 등 — 조용히 무시.
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10030] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-2xl p-4 max-w-[360px] w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-[13px] font-bold text-gray-700 mb-3">이 내용을 공유해요</div>
        <img src={imgURL} alt="이번 달 요약" className="w-full rounded-xl border border-gray-100" />
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-[13px] font-semibold">닫기</button>
          <button onClick={doShare} disabled={sharing} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>
            {sharing ? "준비 중..." : "공유하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// className으로 상단 헤더의 아이콘 버튼 스타일을 그대로 넘겨받는다(년도 옆 자리).
export default function PlannerMonthlyShareButton({ label, totalIncome, totalExpense, className, iconColor = "#6b7280" }) {
  const captureRef = useRef(null);
  const [preview, setPreview] = useState(null); // null | dataURL

  const openPreview = async () => {
    const canvas = await html2canvas(captureRef.current, { scale: 2, backgroundColor: "#ffffff" });
    setPreview(canvas.toDataURL("image/png"));
  };

  return (
    <>
      <button type="button" onClick={openPreview} className={className} title="이번 달 요약 공유">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </button>
      <MonthlySummaryCard innerRef={captureRef} label={label} totalIncome={totalIncome} totalExpense={totalExpense} />
      {preview && <PreviewModal imgURL={preview} filename={`이번달요약_${label}`} onClose={() => setPreview(null)} />}
    </>
  );
}
