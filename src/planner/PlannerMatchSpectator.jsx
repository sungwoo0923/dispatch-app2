// src/planner/PlannerMatchSpectator.jsx — 상대가 "구슬 터뜨리기"를 플레이하는
// 동안 기다리는 사람이 "지켜보기"를 누르면 뜨는 실시간 관전 화면. 조작은 안
// 되고, PlannerMatchGame이 짧은 주기로 저장해두는 보드/점수/남은시간 스냅샷을
// 그대로 보여주기만 한다.
import React from "react";
import { COLORS, ballGradient } from "./PlannerMatchGame";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

const COLS = 8;

export default function PlannerMatchSpectator({ liveMatch, onClose }) {
  useBodyScrollLock();
  const board = liveMatch?.board || [];

  return (
    <div className="fixed inset-0 z-[10026] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl p-4 w-full max-w-[420px] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-extrabold text-gray-800">{liveMatch?.name || "상대방"} 지켜보는 중</div>
          <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
        </div>

        <div className="flex items-center justify-between mb-2.5 text-[12.5px] font-bold">
          <span style={{ color: ACCENT }}>점수 {liveMatch?.score ?? 0}</span>
          <span className="text-gray-500">남은 시간 {liveMatch?.secondsLeft ?? "-"}초</span>
        </div>

        {board.length > 0 ? (
          <div
            className="grid gap-[3px] rounded-xl p-2 mx-auto"
            style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, background: "#f3f4f6", width: "100%", aspectRatio: "1 / 1", maxWidth: 380 }}
          >
            {board.map((v, idx) => (
              <div
                key={idx}
                className="rounded-full"
                style={{
                  background: v == null ? "transparent" : ballGradient(COLORS[v]),
                  boxShadow: v == null ? "none" : "0 2px 3px rgba(0,0,0,0.28), inset 0 -3px 5px rgba(0,0,0,0.28), inset 0 3px 4px rgba(255,255,255,0.75)",
                  transition: "background 160ms ease",
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-[12px] text-gray-400 py-14 border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
            화면을 불러오는 중이에요...
          </div>
        )}

        <div className="text-center text-[11px] text-gray-400 mt-3 leading-relaxed">실시간으로 상대방 화면을 보여드려요. 직접 조작할 수는 없어요.</div>
      </div>
    </div>
  );
}
