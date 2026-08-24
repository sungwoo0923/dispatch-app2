// src/planner/PlannerMiniGames.jsx — "미니게임" 메뉴 (PC/모바일 공용).
// 배우자와 재미로 하는 가위바위보 / 구슬 터뜨리기. 안에 게임별 속메뉴(탭)로 나뉘어
// 있고, 점수는 계속 누적된다.
import React, { useState } from "react";
import {
  usePlannerGameState, usePlannerGameScores, submitRpsChoice, RPS_CHOICES,
} from "../adminPlannerData";
import { useGroupMembers } from "./plannerAuth";
import PlannerMatchGame from "./PlannerMatchGame";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

function ScoreRow({ label, mine, theirs, otherName }) {
  return (
    <div className="flex items-center justify-between text-[12px] py-1">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-700">
        나 {mine.w}승 {mine.l}패 {mine.d}무 <span className="text-gray-300 mx-1">·</span> {otherName || "배우자"} {theirs.w}승 {theirs.l}패 {theirs.d}무
      </span>
    </div>
  );
}

function RockPaperScissors({ groupId, myUid, myName, otherUid, otherName, state, scores }) {
  const [picking, setPicking] = useState(false);
  const rps = state.rps || {};
  const myChoice = rps.choices?.[myUid];
  const theirChoice = rps.choices?.[otherUid];
  const lastResult = rps.lastResult;

  const pick = async (choice) => {
    setPicking(true);
    try { await submitRpsChoice(groupId, myUid, myName, choice, otherUid); } finally { setPicking(false); }
  };

  const myScore = scores[myUid]?.rps || { w: 0, l: 0, d: 0 };
  const theirScore = scores[otherUid]?.rps || { w: 0, l: 0, d: 0 };
  const resultLabel = lastResult?.myUid === myUid
    ? (lastResult.result === "win" ? "이겼어요!" : lastResult.result === "lose" ? "졌어요" : "비겼어요")
    : (lastResult?.result === "win" ? "졌어요" : lastResult?.result === "lose" ? "이겼어요!" : lastResult ? "비겼어요" : "");

  return (
    <div className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
      <div className="text-[13px] font-bold text-gray-700 mb-3">가위바위보</div>

      {myChoice && !theirChoice ? (
        <div className="text-center py-4 text-[12.5px] text-gray-500">냈어요! {otherName || "배우자"}님이 낼 때까지 기다리는 중...</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {RPS_CHOICES.map((c) => (
            <button
              key={c}
              onClick={() => pick(c)}
              disabled={picking}
              className="py-3 rounded-lg text-[13px] font-bold border"
              style={{ color: ACCENT, borderColor: ACCENT_BORDER }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {lastResult && (
        <div className="rounded-lg p-2.5 mb-3 text-center" style={{ background: ACCENT_SOFT }}>
          <div className="text-[12.5px] font-bold" style={{ color: ACCENT }}>{resultLabel}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            나: {lastResult.myUid === myUid ? lastResult.mine : lastResult.theirs} · {otherName || "배우자"}: {lastResult.myUid === myUid ? lastResult.theirs : lastResult.mine}
          </div>
        </div>
      )}

      <ScoreRow label="누적 전적" mine={myScore} theirs={theirScore} otherName={otherName} />
    </div>
  );
}

// Bejeweled/Candy Crush류 매치 퍼즐 게임 — 60초 도전제라 실시간 대전이 아니라
// "각자 도전해서 최고 점수 겨루기" 방식이라 카드에서 바로 시작할 수 있게 한다.
function MatchGameCard({ account, other, scores, onPlay }) {
  const myBest = scores[account.uid]?.matchGame?.best || 0;
  const theirBest = scores[other.uid]?.matchGame?.best || 0;
  return (
    <div className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[13px] font-bold text-gray-700">구슬 터뜨리기</div>
        <button onClick={onPlay} className="text-[11.5px] font-bold px-3 py-1.5 rounded-full text-white" style={{ background: ACCENT }}>플레이</button>
      </div>
      <div className="text-[11.5px] text-gray-400 mb-2.5">60초 동안 같은 색 구슬 5개를 한 줄로 모아 터뜨려 보세요.</div>
      <div className="flex items-center justify-between text-[12px] font-bold" style={{ color: ACCENT }}>
        <span>나 최고 {myBest}</span>
        <span className="text-gray-400 font-semibold">{other.name || "배우자"} 최고 {theirBest}</span>
      </div>
    </div>
  );
}

const GAME_TABS = [
  ["rps", "가위바위보"],
  ["match", "구슬 터뜨리기"],
];

export default function PlannerMiniGames({ account }) {
  const members = useGroupMembers(account.groupId);
  const other = members.find((m) => m.uid !== account.uid);
  const state = usePlannerGameState(account.groupId);
  const scores = usePlannerGameScores(account.groupId);
  const [showMatchGame, setShowMatchGame] = useState(false);
  const [tab, setTab] = useState("rps");

  if (!other) {
    return (
      <div className="max-w-lg mx-auto text-center py-14 text-[12.5px] text-gray-400 bg-white border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
        배우자가 아직 가입하지 않았어요. 배우자를 초대하면 미니게임을 같이 즐길 수 있어요.
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="text-[12.5px] text-gray-500">배우자와 즐기는 미니게임이에요. 점수는 계속 쌓여요.</div>

      <div className="flex gap-2">
        {GAME_TABS.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className="flex-1 py-2.5 rounded-lg text-[12.5px] font-bold border"
            style={tab === v ? { background: ACCENT, color: "#fff", borderColor: ACCENT } : { color: ACCENT, borderColor: ACCENT_BORDER }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "rps" && (
        <RockPaperScissors groupId={account.groupId} myUid={account.uid} myName={account.name} otherUid={other.uid} otherName={other.name} state={state} scores={scores} />
      )}
      {tab === "match" && (
        <MatchGameCard account={account} other={other} scores={scores} onPlay={() => setShowMatchGame(true)} />
      )}

      {showMatchGame && (
        <PlannerMatchGame
          groupId={account.groupId}
          myUid={account.uid}
          myName={account.name}
          myBest={scores[account.uid]?.matchGame?.best || 0}
          otherName={other.name}
          otherBest={scores[other.uid]?.matchGame?.best || 0}
          onClose={() => setShowMatchGame(false)}
        />
      )}
    </div>
  );
}
