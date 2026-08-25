// src/planner/PlannerMiniGames.jsx — "미니게임" 메뉴 (PC/모바일 공용).
// 배우자와 내기를 걸고 하는 구슬 터뜨리기. 점수는 계속 누적된다.
// ⭐ 가위바위보는 없앴고(구슬 터뜨리기만 남김), 플레이 전에 반드시 내기를 먼저
// 정해야 시작할 수 있다.
import React, { useMemo, useState } from "react";
import {
  usePlannerGameState, usePlannerGameScores, setPlannerGameBet, GAME_BET_OPTIONS,
} from "../adminPlannerData";
import { useGroupMembers } from "./plannerAuth";
import PlannerMatchGame from "./PlannerMatchGame";
import PlannerInfoTip from "./PlannerInfoTip";
import PlannerCategorySelect from "./PlannerCategorySelect";
import useBodyScrollLock from "./useBodyScrollLock";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

// 플레이 전에 무슨 내기를 걸지 정하는 팝업 — 화면 중앙에 뜨고, 목록은 위아래로
// 스크롤해서 볼 수 있다. 목록에 없으면 직접 입력도 가능.
function BetPickerModal({ groupId, myUid, myName, currentText, onClose }) {
  useBodyScrollLock();
  const [picked, setPicked] = useState(currentText || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!picked.trim()) { alert("내기를 골라주세요."); return; }
    setSaving(true);
    try {
      await setPlannerGameBet(groupId, picked.trim(), myUid, myName);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10030] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl p-5 w-full max-w-[380px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[14.5px] font-extrabold text-gray-800">무슨 내기를 할까요?</div>
          <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
        </div>
        <div className="text-[11px] text-gray-400 mb-3">이번 판에서 지면 뭘 해줄지 정해보세요.</div>

        <div className="mb-3">
          <PlannerCategorySelect
            value={picked}
            onChange={setPicked}
            options={GAME_BET_OPTIONS}
            placeholder="목록에서 고르거나 직접 입력"
            className="w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none bg-white"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
          {GAME_BET_OPTIONS.map((b) => (
            <button
              key={b}
              onClick={() => setPicked(b)}
              className="w-full text-left px-3.5 py-2.5 text-[12.5px] font-semibold border-b last:border-b-0"
              style={picked === b ? { background: ACCENT_SOFT, color: ACCENT, borderColor: ACCENT_SOFT } : { color: "#4b5563", borderColor: "#f3f4f6" }}
            >
              {b}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-gray-600 text-[13px] font-semibold" style={{ borderColor: ACCENT_BORDER }}>취소</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-50" style={{ background: ACCENT }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Bejeweled/Candy Crush류 매치 퍼즐 게임 — 60초 도전제라 실시간 대전이 아니라
// "각자 도전해서 최고 점수 겨루기" 방식이라 카드에서 바로 시작할 수 있게 한다.
function MatchGameCard({ account, other, scores, betText, onPlay, onOpenBet }) {
  const myBest = scores[account.uid]?.matchGame?.best || 0;
  const theirBest = scores[other.uid]?.matchGame?.best || 0;
  return (
    <div className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[13px] font-bold text-gray-700">구슬 터뜨리기</div>
        <button
          onClick={betText ? onPlay : onOpenBet}
          className="text-[11.5px] font-bold px-3 py-1.5 rounded-full text-white"
          style={{ background: ACCENT }}
        >
          플레이
        </button>
      </div>
      <div className="text-[11.5px] text-gray-400 mb-2.5">60초 동안 같은 색 구슬 3개 이상을 한 줄로 모아 터뜨려 보세요.</div>

      <button onClick={onOpenBet} className="w-full flex items-center justify-between rounded-lg px-3 py-2 mb-2.5 text-left" style={{ background: betText ? "#fff7ed" : ACCENT_SOFT, border: `1px solid ${betText ? "#fed7aa" : ACCENT_BORDER}` }}>
        <span className="text-[11.5px] font-bold" style={{ color: betText ? "#c2410c" : ACCENT }}>
          {betText ? `내기: ${betText}` : "내기를 먼저 정해주세요"}
        </span>
        <span className="text-[10.5px] font-semibold" style={{ color: betText ? "#c2410c" : ACCENT }}>{betText ? "변경" : "정하기"}</span>
      </button>

      <div className="flex items-center justify-between text-[12px] font-bold" style={{ color: ACCENT }}>
        <span>나 최고 {myBest}</span>
        <span className="text-gray-400 font-semibold">{other.name || "배우자"} 최고 {theirBest}</span>
      </div>
    </div>
  );
}

export default function PlannerMiniGames({ account }) {
  const members = useGroupMembers(account.groupId);
  const other = members.find((m) => m.uid !== account.uid);
  const state = usePlannerGameState(account.groupId);
  const scores = usePlannerGameScores(account.groupId);
  const [showMatchGame, setShowMatchGame] = useState(false);
  const [showBet, setShowBet] = useState(false);
  const betText = state?.bet?.text || "";

  if (!other) {
    return (
      <div className="max-w-lg mx-auto text-center py-14 text-[12.5px] text-gray-400 bg-white border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
        배우자가 아직 가입하지 않았어요. 배우자를 초대하면 미니게임을 같이 즐길 수 있어요.
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex justify-end">
        <PlannerInfoTip align="right" text="상대방과 내기할 수 있는 미니게임이에요. 내기를 정하고 플레이를 시작하세요." />
      </div>

      <MatchGameCard
        account={account} other={other} scores={scores} betText={betText}
        onPlay={() => setShowMatchGame(true)}
        onOpenBet={() => setShowBet(true)}
      />

      {showBet && (
        <BetPickerModal groupId={account.groupId} myUid={account.uid} myName={account.name} currentText={betText} onClose={() => setShowBet(false)} />
      )}

      {showMatchGame && (
        <PlannerMatchGame
          groupId={account.groupId}
          myUid={account.uid}
          myName={account.name}
          myBest={scores[account.uid]?.matchGame?.best || 0}
          otherName={other.name}
          otherBest={scores[other.uid]?.matchGame?.best || 0}
          betText={betText}
          onClose={() => setShowMatchGame(false)}
        />
      )}
    </div>
  );
}
