// src/planner/PlannerMiniGames.jsx — "미니게임" 메뉴 (PC/모바일 공용).
// 상대방과 내기를 걸고 하는 구슬 터뜨리기. 점수는 계속 누적된다.
// ⭐ 가위바위보는 없앴고(구슬 터뜨리기만 남김), 플레이 전에 반드시 내기를 먼저
// 정해야 시작할 수 있다. 한쪽이 먼저 플레이하면 상대가 끝날 때까지 내기 변경도,
// 재도전도 잠긴다 — 둘 다 끝나야 결과(승/패)를 확인하고 다음 라운드로 넘어간다.
import React, { useEffect, useState } from "react";
import {
  usePlannerGameState, usePlannerGameScores, setPlannerGameBet, GAME_BET_OPTIONS, resetMyMatchGameStats, resetMiniGameRound,
} from "../adminPlannerData";
import { useGroupMembers, TOTAL_MASTER_EMAIL } from "./plannerAuth";
import PlannerMatchGame from "./PlannerMatchGame";
import PlannerMatchSpectator from "./PlannerMatchSpectator";
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

// 오늘의 내기 배너 — 카드 밖(위)에 따로 두고, 깜빡이는 효과로 눈에 띄게.
function TodayBetBanner({ text }) {
  if (!text) return null;
  return (
    <div className="rounded-xl px-4 py-2.5 text-center kp-bet-blink" style={{ background: ACCENT, color: "#fff" }}>
      <span className="text-[12.5px] font-extrabold">오늘의 내기 : {text}</span>
      <style>{`
        .kp-bet-blink { animation: kpBetBlink 1.6s ease-in-out infinite; }
        @keyframes kpBetBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>
    </div>
  );
}

// 결과 발표 — 막대가 통통 튀다가 최종 점수 비율에 맞춰 멈추고, 이긴 쪽 막대만
// 진하게, 승자 이름이 팍 하고 뜬다.
function ResultBar({ label, score, maxScore, isWinner }) {
  const finalPct = Math.max(8, Math.round((score / maxScore) * 100));
  const animName = `kpBar${label.length}_${score}_${Math.round(Math.random() * 1e6)}`;
  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <style>{`
        @keyframes ${animName} {
          0% { height: 15%; }
          22% { height: 88%; }
          42% { height: 30%; }
          62% { height: 72%; }
          80% { height: 40%; }
          100% { height: ${finalPct}%; }
        }
      `}</style>
      <div className="text-[13px] font-extrabold text-gray-700 mb-1">{score}</div>
      <div className="w-14 h-36 rounded-lg bg-gray-100 overflow-hidden flex items-end">
        <div
          className="w-full rounded-t-lg"
          style={{
            background: isWinner ? ACCENT : "#cbd5e1",
            animation: `${animName} 1.3s cubic-bezier(.34,1.15,.64,1) forwards`,
          }}
        />
      </div>
      <div className="text-[12px] font-bold text-gray-600 mt-1.5 truncate max-w-full">{label}</div>
    </div>
  );
}

function MatchResultModal({ myName, otherName, myScore, otherScore, onClose }) {
  useBodyScrollLock();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1350);
    return () => clearTimeout(t);
  }, []);

  const maxScore = Math.max(myScore, otherScore, 1);
  const iWin = myScore > otherScore;
  const draw = myScore === otherScore;
  const winnerLabel = draw ? "무승부!" : `${iWin ? (myName || "나") : (otherName || "상대방")}님 승리!`;

  return (
    <div className="fixed inset-0 z-[10032] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative bg-white rounded-2xl p-5 w-full max-w-[360px] text-center">
        <div className="text-[13.5px] font-bold text-gray-500 mb-4">구슬 터뜨리기 결과</div>
        <div className="flex items-end justify-center gap-4 mb-2">
          <ResultBar label={myName || "나"} score={myScore} maxScore={maxScore} isWinner={!draw && iWin} />
          <div className="text-[14px] font-extrabold pb-16 shrink-0" style={{ color: ACCENT }}>VS</div>
          <ResultBar label={otherName || "상대방"} score={otherScore} maxScore={maxScore} isWinner={!draw && !iWin} />
        </div>
        <div
          className="text-[19px] font-extrabold mt-3 mb-5"
          style={{ color: draw ? "#6b7280" : ACCENT, opacity: revealed ? 1 : 0, transform: revealed ? "scale(1)" : "scale(0.6)", transition: "all 0.4s cubic-bezier(.34,1.56,.64,1)" }}
        >
          {winnerLabel}
        </div>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl text-white text-[13.5px] font-bold" style={{ background: ACCENT }}>확인</button>
      </div>
    </div>
  );
}

// Bejeweled/Candy Crush류 매치 퍼즐 게임 — 60초 도전제라 실시간 대전이 아니라
// "각자 도전해서 최고 점수 겨루기" 방식. VS 카드 형태로 서로의 최고점/전적을
// 보여주고, 라운드(같은 내기) 진행 상태에 따라 카드가 흐려지며 안내가 뜬다.
function MatchGameCard({ account, other, solo, scores, betText, roundScores, roundComplete, resultSeen, liveMatch, onPlay, onShowResult, onOpenBet, onSpectate, onResetStats, onResetRound, canChangeBet }) {
  const myGame = scores[account.uid]?.matchGame || {};
  const theirGame = other ? (scores[other.uid]?.matchGame || {}) : {};
  // ⭐ 최고관리자가 상대방 없이 테스트할 때는(solo) 기다리거나 결과를 가릴
  // 상대가 없으니, 라운드 잠금/블러 로직을 아예 건너뛴다.
  // ⭐ otherPlayed는 other.uid로 대조하지 않고, 라운드 점수에 "나 아닌 다른
  // 사람"의 기록이 있는지로 직접 판단한다 — 구성원 목록 구독 타이밍 등으로
  // other가 잠깐 어긋나도 "상대가 다 했는데 계속 대기 중"이라고 뜨는 일이
  // 없게 하기 위함.
  const myPlayed = !solo && roundScores[account.uid] != null;
  const otherPlayed = !solo && Object.keys(roundScores).some((k) => k !== account.uid);
  const waiting = myPlayed && !otherPlayed;
  const showResultGate = !solo && roundComplete && !resultSeen;
  const blurred = waiting || showResultGate;
  // 상대가 지금 플레이 중이라는 실시간 스냅샷이 있어야 "지켜보기"를 보여준다.
  const canSpectate = waiting && liveMatch && liveMatch.uid && liveMatch.uid !== account.uid;

  return (
    <div className="bg-white border rounded-2xl overflow-hidden relative" style={{ borderColor: ACCENT_BORDER }}>
      <div className={blurred ? "pointer-events-none" : ""} style={blurred ? { filter: "blur(3px)", opacity: 0.55 } : undefined}>
        <div className="px-4 pt-3.5 pb-2 text-[13px] font-bold text-gray-700 flex items-center justify-between">
          <span>구슬 터뜨리기</span>
          {solo && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: ACCENT_SOFT, color: ACCENT }}>테스트 모드(혼자 플레이)</span>}
        </div>

        <div className="flex items-center justify-center gap-3 px-4 pb-3">
          <div className="flex-1 min-w-0 text-center">
            <div className="text-[12.5px] font-extrabold text-gray-800 truncate">나</div>
            <div className="text-[10.5px] text-gray-400 mt-0.5">최고 {myGame.best || 0}</div>
            <div className="text-[10px] font-bold mt-0.5" style={{ color: ACCENT }}>{myGame.wins || 0}승 {myGame.losses || 0}패{myGame.draws ? ` ${myGame.draws}무` : ""}</div>
          </div>
          {!solo && (
            <>
              <div className="text-[17px] font-extrabold shrink-0" style={{ color: ACCENT }}>VS</div>
              <div className="flex-1 min-w-0 text-center">
                <div className="text-[12.5px] font-extrabold text-gray-800 truncate">{other.name || "상대방"}</div>
                <div className="text-[10.5px] text-gray-400 mt-0.5">최고 {theirGame.best || 0}</div>
                <div className="text-[10px] font-bold text-gray-400 mt-0.5">{theirGame.wins || 0}승 {theirGame.losses || 0}패{theirGame.draws ? ` ${theirGame.draws}무` : ""}</div>
              </div>
            </>
          )}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={onOpenBet}
            disabled={!canChangeBet}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 mb-2.5 text-left disabled:opacity-60"
            style={{ background: ACCENT_SOFT, border: `1px solid ${ACCENT_BORDER}` }}
          >
            <span className="text-[11.5px] font-bold" style={{ color: ACCENT }}>
              {betText ? `내기 : ${betText}` : "내기를 먼저 정해주세요"}
            </span>
            <span className="text-[10.5px] font-semibold" style={{ color: ACCENT }}>{betText ? "변경" : "정하기"}</span>
          </button>

          <button
            onClick={onPlay}
            disabled={!betText}
            className="w-full py-2.5 rounded-xl text-white text-[13px] font-extrabold disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            플레이
          </button>
        </div>
      </div>

      {waiting && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl px-4 py-3 text-center shadow-lg border" style={{ borderColor: ACCENT_BORDER, maxWidth: 240 }}>
            <div className="text-[12.5px] font-bold text-gray-700">상대방이 아직 진행 중이에요</div>
            <div className="text-[11px] text-gray-400 mt-1">끝나면 결과를 확인할 수 있어요</div>
            <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
              {canSpectate && (
                <button onClick={onSpectate} className="text-[11px] font-bold px-3 py-1.5 rounded-full text-white" style={{ background: ACCENT }}>
                  지켜보기
                </button>
              )}
              {/* ⭐ 화면이 계속 이 상태로 안 풀릴 때 쓰는 비상 탈출구 — 지금 걸린
                  내기/라운드를 통째로 지우고 "내기를 정해주세요" 상태로 되돌린다. */}
              <button onClick={onResetRound} className="text-[11px] font-semibold px-3 py-1.5 rounded-full border text-gray-500 bg-white" style={{ borderColor: ACCENT_BORDER }}>
                게임 초기화
              </button>
            </div>
          </div>
        </div>
      )}
      {showResultGate && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button onClick={onShowResult} className="px-5 py-2.5 rounded-full text-white text-[13px] font-extrabold shadow-lg" style={{ background: ACCENT }}>
            결과보기
          </button>
        </div>
      )}

      {/* ⭐ 전적/게임 초기화는 라운드 진행 상태와 무관하게 "언제든" 가능해야 해서,
          맨 뒤에 둬서 대기/결과 오버레이보다 항상 위에서 눌리게 한다. */}
      <div className="relative px-4 pb-3 pt-1 flex items-center justify-center gap-3">
        <button onClick={onResetStats} className="text-[9.5px] text-gray-300 underline">내 전적 초기화</button>
        {!solo && <button onClick={onResetRound} className="text-[9.5px] text-gray-300 underline">게임 초기화</button>}
      </div>
    </div>
  );
}

export default function PlannerMiniGames({ account }) {
  const members = useGroupMembers(account.groupId);
  const other = members.find((m) => m.uid !== account.uid);
  const isOwner = account.email === TOTAL_MASTER_EMAIL;
  // ⭐ 최고관리자는 상대방(연결 상대)이 없어도 테스트할 수 있어야 한다는 요청 —
  // 혼자서도 내기 걸고 플레이할 수 있는 solo 모드로 진행한다.
  const solo = !other && isOwner;
  const state = usePlannerGameState(account.groupId);
  const scores = usePlannerGameScores(account.groupId);
  const [showMatchGame, setShowMatchGame] = useState(false);
  const [showBet, setShowBet] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showSpectator, setShowSpectator] = useState(false);
  const [resultSeen, setResultSeen] = useState(false);

  const betText = state?.bet?.text || "";
  const round = state?.matchRound || {};
  const roundScores = round.scores || {};
  const roundComplete = !!round.settled;
  const liveMatch = state?.liveMatch || null;

  // 새 라운드(내기가 바뀌었거나 다시 시작됨)가 되면 "결과 확인함" 표시를 초기화.
  useEffect(() => { if (!roundComplete) setResultSeen(false); }, [roundComplete, round.betText]);

  if (!other && !isOwner) {
    return (
      <div className="max-w-lg mx-auto text-center py-14 text-[12.5px] text-gray-400 bg-white border rounded-xl" style={{ borderColor: ACCENT_BORDER }}>
        상대방이 아직 가입하지 않았어요. 상대방을 초대하면 미니게임을 같이 즐길 수 있어요.
      </div>
    );
  }

  const myPlayed = !solo && roundScores[account.uid] != null;
  const otherPlayed = !solo && Object.keys(roundScores).some((k) => k !== account.uid);
  // 내기 변경: solo면 언제나 가능. 아니면 아무도 아직 안 냈거나(새 라운드 시작
  // 전), 라운드가 완전히 끝났을 때만 가능.
  const canChangeBet = solo || (!myPlayed && !otherPlayed) || roundComplete;

  // ⭐ 누적 점수(최고점/승패)는 계속 쌓이는 게 기본이지만, 원하면 언제든 내
  // 전적만 초기화할 수 있게 한다 — 진행 중인 라운드/내기와는 무관.
  const resetStats = async () => {
    if (!confirm("내 미니게임 전적(최고점·승/패)을 초기화할까요? 되돌릴 수 없어요.")) return;
    try {
      await resetMyMatchGameStats(account.groupId, account.uid);
    } catch (e) {
      alert("초기화 중 오류가 발생했습니다: " + e.message);
    }
  };

  // ⭐ 라운드/내기/관전 상태가 꼬여서 화면이 안 풀릴 때 쓰는 비상 초기화 —
  // 지금 걸린 내기를 지우고 "내기를 먼저 정해주세요" 상태로 완전히 되돌린다.
  const resetRound = async () => {
    if (!confirm("지금 걸린 내기와 이번 라운드를 초기화할까요? 두 사람 모두 다시 내기를 정해야 해요.")) return;
    try {
      await resetMiniGameRound(account.groupId);
      setShowMatchGame(false);
      setShowResult(false);
      setShowSpectator(false);
      setResultSeen(false);
    } catch (e) {
      alert("초기화 중 오류가 발생했습니다: " + e.message);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-3">
      <div className="flex justify-end">
        <PlannerInfoTip align="right" text="상대방과 내기할 수 있는 미니게임이에요. 내기를 정하고 플레이를 시작하세요." />
      </div>

      <TodayBetBanner text={betText} />

      <MatchGameCard
        account={account} other={other} solo={solo} scores={scores} betText={betText}
        roundScores={roundScores} roundComplete={roundComplete} resultSeen={resultSeen} liveMatch={liveMatch}
        canChangeBet={canChangeBet}
        onPlay={() => setShowMatchGame(true)}
        onOpenBet={() => canChangeBet && setShowBet(true)}
        onShowResult={() => setShowResult(true)}
        onSpectate={() => setShowSpectator(true)}
        onResetStats={resetStats}
        onResetRound={resetRound}
      />

      {showSpectator && liveMatch && (
        <PlannerMatchSpectator liveMatch={liveMatch} onClose={() => setShowSpectator(false)} />
      )}

      {showBet && (
        <BetPickerModal groupId={account.groupId} myUid={account.uid} myName={account.name} currentText={betText} onClose={() => setShowBet(false)} />
      )}

      {showResult && other && (
        <MatchResultModal
          myName={account.name} otherName={other.name}
          myScore={roundScores[account.uid] || 0}
          otherScore={roundScores[Object.keys(roundScores).find((k) => k !== account.uid)] || 0}
          onClose={() => { setShowResult(false); setResultSeen(true); }}
        />
      )}

      {showMatchGame && (
        <PlannerMatchGame
          groupId={account.groupId}
          myUid={account.uid}
          myName={account.name}
          myBest={scores[account.uid]?.matchGame?.best || 0}
          otherUid={other?.uid}
          otherName={other?.name}
          otherBest={other ? (scores[other.uid]?.matchGame?.best || 0) : 0}
          betText={betText}
          roundComplete={solo ? false : roundComplete}
          onClose={() => setShowMatchGame(false)}
        />
      )}
    </div>
  );
}
