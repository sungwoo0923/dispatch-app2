// src/planner/PlannerMiniGames.jsx — "미니게임" 메뉴 (PC/모바일 공용).
// 배우자와 재미로 하는 가위바위보 / 반응속도 게임. 점수는 계속 누적된다.
import React, { useEffect, useRef, useState } from "react";
import {
  usePlannerGameState, usePlannerGameScores, submitRpsChoice, RPS_CHOICES,
  startReactionRound, submitReactionTime,
} from "../adminPlannerData";
import { useGroupMembers } from "./plannerAuth";
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

function ReactionGame({ groupId, myUid, myName, otherUid, otherName, state, scores }) {
  const reaction = state.reaction || {};
  const [localPhase, setLocalPhase] = useState("idle"); // idle | waiting | go | submitted
  const [goAt, setGoAt] = useState(0);
  const timeoutRef = useRef(null);
  const seenStartRef = useRef(null);

  useEffect(() => {
    if (reaction.phase === "waiting" && reaction.startedAt && seenStartRef.current !== reaction.startedAt?.seconds) {
      seenStartRef.current = reaction.startedAt?.seconds;
      setLocalPhase("waiting");
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setGoAt(Date.now());
        setLocalPhase("go");
      }, reaction.delayMs || 2000);
    }
    if (reaction.phase === "idle") {
      clearTimeout(timeoutRef.current);
      setLocalPhase("idle");
    }
    return () => clearTimeout(timeoutRef.current);
  }, [reaction.phase, reaction.startedAt, reaction.delayMs]);

  const start = async () => { await startReactionRound(groupId); };
  const tap = async () => {
    if (localPhase !== "go") return;
    const ms = Date.now() - goAt;
    setLocalPhase("submitted");
    await submitReactionTime(groupId, myUid, myName, ms, otherUid);
  };

  const myScore = scores[myUid]?.reaction || { w: 0, l: 0, d: 0 };
  const theirScore = scores[otherUid]?.reaction || { w: 0, l: 0, d: 0 };
  const lastResult = reaction.lastResult;
  const resultLabel = lastResult?.myUid === myUid
    ? (lastResult.result === "win" ? "내가 더 빨랐어요!" : lastResult.result === "lose" ? "상대가 더 빨랐어요" : "동시에 눌렀어요")
    : (lastResult?.result === "win" ? "상대가 더 빨랐어요" : lastResult?.result === "lose" ? "내가 더 빨랐어요!" : lastResult ? "동시에 눌렀어요" : "");

  return (
    <div className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
      <div className="text-[13px] font-bold text-gray-700 mb-3">반응속도 게임</div>

      {localPhase === "idle" && (
        <button onClick={start} className="w-full py-3 rounded-lg text-white text-[13px] font-bold" style={{ background: ACCENT }}>
          라운드 시작
        </button>
      )}
      {localPhase === "waiting" && (
        <div className="w-full py-6 rounded-lg text-center text-[13px] font-bold text-gray-400 border" style={{ borderColor: ACCENT_BORDER }}>
          신호를 기다리세요...
        </div>
      )}
      {localPhase === "go" && (
        <button onClick={tap} className="w-full py-6 rounded-lg text-white text-[15px] font-extrabold" style={{ background: ACCENT }}>
          지금 눌러요!
        </button>
      )}
      {localPhase === "submitted" && (
        <div className="w-full py-6 rounded-lg text-center text-[12.5px] text-gray-400 border" style={{ borderColor: ACCENT_BORDER }}>
          {otherName || "배우자"}님을 기다리는 중...
        </div>
      )}

      {lastResult && (
        <div className="rounded-lg p-2.5 my-3 text-center" style={{ background: ACCENT_SOFT }}>
          <div className="text-[12.5px] font-bold" style={{ color: ACCENT }}>{resultLabel}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">나: {lastResult.myUid === myUid ? lastResult.mineMs : lastResult.theirsMs}ms · {otherName || "배우자"}: {lastResult.myUid === myUid ? lastResult.theirsMs : lastResult.mineMs}ms</div>
        </div>
      )}

      <ScoreRow label="누적 전적" mine={myScore} theirs={theirScore} otherName={otherName} />
    </div>
  );
}

export default function PlannerMiniGames({ account }) {
  const members = useGroupMembers(account.groupId);
  const other = members.find((m) => m.uid !== account.uid);
  const state = usePlannerGameState(account.groupId);
  const scores = usePlannerGameScores(account.groupId);

  if (!other) {
    return (
      <div className="max-w-lg mx-auto text-center py-14 text-[12.5px] text-gray-400 bg-white border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
        배우자가 아직 가입하지 않았어요. 배우자를 초대하면 미니게임을 같이 즐길 수 있어요.
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="text-[12.5px] text-gray-500">배우자와 실시간으로 즐기는 미니게임이에요. 점수는 계속 쌓여요.</div>
      <RockPaperScissors groupId={account.groupId} myUid={account.uid} myName={account.name} otherUid={other.uid} otherName={other.name} state={state} scores={scores} />
      <ReactionGame groupId={account.groupId} myUid={account.uid} myName={account.name} otherUid={other.uid} otherName={other.name} state={state} scores={scores} />
    </div>
  );
}
