// src/planner/PlannerReceiptCapture.jsx — 영수증 사진 첨부 + 스캔(OCR) 자동 금액 인식.
// 사진을 찍거나 고르면: (1) Storage에 업로드하고 (2) 스캔 중 애니메이션을 보여주며
// tesseract.js로 텍스트를 읽어서 (3) 합계로 보이는 금액을 자동으로 입력칸에 채워준다.
import React, { useRef, useState } from "react";
import { uploadReceiptPhoto, scanReceiptAmount } from "../adminPlannerData";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerReceiptCapture({ groupId, photoURL, onScanned, onPhotoChange }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setScanning(true);
    try {
      const [url, scan] = await Promise.all([
        uploadReceiptPhoto(groupId, file).catch(() => null),
        scanReceiptAmount(file).catch(() => null),
      ]);
      if (url) onPhotoChange?.(url);
      if (scan?.amount) onScanned?.(scan.amount);
      else if (!scan) setError("영수증을 인식하지 못했어요. 금액을 직접 입력해 주세요.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {photoURL ? (
        <div className="flex items-center gap-2">
          <img src={photoURL} alt="영수증" className="w-14 h-14 rounded-lg object-cover border" style={{ borderColor: ACCENT_BORDER }} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[12px] font-semibold px-3 py-2 rounded-lg border"
            style={{ color: ACCENT, borderColor: ACCENT_BORDER }}
          >
            다시 촬영/선택
          </button>
          <button type="button" onClick={() => onPhotoChange?.("")} className="text-[12px] font-semibold text-gray-400">삭제</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full py-2.5 rounded-lg border border-dashed text-[12.5px] font-semibold flex items-center justify-center gap-1.5"
          style={{ borderColor: ACCENT_BORDER, color: ACCENT }}
        >
          📷 영수증 촬영/사진 선택 — 자동으로 금액을 읽어드려요
        </button>
      )}
      {error && <div className="text-[11px] text-gray-400 mt-1">{error}</div>}

      {scanning && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl px-8 py-7 flex flex-col items-center gap-3 shadow-2xl">
            <div className="relative w-20 h-24 rounded-lg overflow-hidden border-2" style={{ borderColor: ACCENT }}>
              <div className="absolute inset-0" style={{ background: ACCENT_SOFT }} />
              <div className="absolute inset-x-0 h-1 planner-scan-line" style={{ background: ACCENT }} />
              <div className="absolute inset-2 space-y-1.5 opacity-40">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-1 rounded" style={{ background: ACCENT }} />)}
              </div>
            </div>
            <div className="text-[13px] font-bold" style={{ color: ACCENT }}>영수증을 스캔하는 중...</div>
            <style>{`
              @keyframes plannerScanMove { 0% { top: 0; } 100% { top: 100%; } }
              .planner-scan-line { animation: plannerScanMove 1.1s ease-in-out infinite alternate; }
            `}</style>
          </div>
        </div>
      )}
    </div>
  );
}
