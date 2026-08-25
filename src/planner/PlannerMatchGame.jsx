// src/planner/PlannerMatchGame.jsx — "구슬 터뜨리기" 미니게임(비주얼 레퍼런스는
// Bejeweled/Candy Crush류의 매치 퍼즐). 보드에 색깔 구슬이 꽉 차 있고, 인접한
// 두 구슬을 상하좌우로 맞바꿔서 같은 색 3개 이상을 한 줄로 모으면 터진다.
// ⭐ 처음엔 "5개 이상"으로 만들었는데, 인접한 두 칸만 맞바꾸는 방식에서는 한 번의
// 스왑으로 5줄을 완성하는 경우가 사실상 거의 없어서(4개가 이미 나란히 있어야
// 함) 거의 매번 "옮겼다가 그대로 되돌아가는" 것처럼 보이는 문제가 있었다.
// Bejeweled/Candy Crush 등 실제 매치 게임들도 전부 3개 기준이라 그에 맞춰 낮췄다.
// 터진 자리는 위에서 새 구슬이 랜덤으로 떨어져 채운다. 60초 동안 혼자 플레이해서
// 점수를 내고, 배우자와는 최고 점수로 겨룬다(동시 조작 아님 — 각자 도전 후 비교).
// ⭐ 구슬이 납작한 동전 같다는 피드백으로 방사형 그라데이션+하이라이트로 입체감을
// 줬고, 터질 때 진동+효과음+더 큰 임팩트를, 못 옮기는 자리를 누르면 빨간 테두리
// +진동+경고음을 주도록 손맛을 더했다. 시작 전엔 3-2-1-START 카운트다운이 뜬다.
import React, { useEffect, useRef, useState } from "react";
import { submitMatchGameScore } from "../adminPlannerData";
import { playPopSound, playErrorSound, vibrate } from "./plannerSound";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

const ROWS = 8;
const COLS = 8;
const GAME_SECONDS = 60;
const COLORS = [
  "#ef4444", // 빨강
  "#f97316", // 주황
  "#eab308", // 노랑
  "#22c55e", // 초록
  "#14b8a6", // 청록
  "#a855f7", // 보라
];

// 구슬에 입체감을 주기 위한 방사형 그라데이션(위 왼쪽에 광원) — 단색 배경 대신
// 밝은 하이라이트 → 원색 → 어두운 그림자 순으로 번지게 해서 실제 유리구슬처럼 보이게 한다.
function shade(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
function ballGradient(hex) {
  return `radial-gradient(circle at 32% 26%, ${shade(hex, 90)} 0%, ${hex} 48%, ${shade(hex, -55)} 100%)`;
}

function randColor() { return Math.floor(Math.random() * COLORS.length); }

function makeBoard() {
  const board = new Array(ROWS * COLS).fill(0);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let v;
      let tries = 0;
      do {
        v = randColor();
        tries++;
      } while (
        tries < 10 &&
        ((c >= 2 && board[r * COLS + c - 1] === v && board[r * COLS + c - 2] === v) ||
          (r >= 2 && board[(r - 1) * COLS + c] === v && board[(r - 2) * COLS + c] === v))
      );
      board[r * COLS + c] = v;
    }
  }
  return board;
}

function findMatches(board) {
  const matched = new Set();
  for (let r = 0; r < ROWS; r++) {
    let runStart = 0;
    for (let c = 1; c <= COLS; c++) {
      const cur = c < COLS ? board[r * COLS + c] : -1;
      const prev = board[r * COLS + c - 1];
      if (cur !== prev) {
        if (c - runStart >= 3) for (let k = runStart; k < c; k++) matched.add(r * COLS + k);
        runStart = c;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let runStart = 0;
    for (let r = 1; r <= ROWS; r++) {
      const cur = r < ROWS ? board[r * COLS + c] : -1;
      const prev = board[(r - 1) * COLS + c];
      if (cur !== prev) {
        if (r - runStart >= 3) for (let k = runStart; k < r; k++) matched.add(k * COLS + c);
        runStart = r;
      }
    }
  }
  return matched;
}

function collapseAndRefill(board, matched) {
  const next = [...board];
  matched.forEach((idx) => { next[idx] = null; });
  for (let c = 0; c < COLS; c++) {
    const colVals = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const v = next[r * COLS + c];
      if (v != null) colVals.push(v);
    }
    while (colVals.length < ROWS) colVals.push(randColor());
    for (let r = ROWS - 1, i = 0; r >= 0; r--, i++) next[r * COLS + c] = colVals[i];
  }
  return next;
}

function isAdjacent(a, b) {
  const ra = Math.floor(a / COLS), ca = a % COLS;
  const rb = Math.floor(b / COLS), cb = b % COLS;
  return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1);
}

const COUNTDOWN_STEPS = ["3", "2", "1", "START!"];

export default function PlannerMatchGame({ groupId, myUid, myName, myBest, otherName, otherBest, betText, onClose }) {
  const [board, setBoard] = useState(makeBoard);
  const [selected, setSelected] = useState(null);
  const [popping, setPopping] = useState(new Set());
  const [invalidPair, setInvalidPair] = useState(new Set());
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(GAME_SECONDS);
  const [phase, setPhase] = useState("ready"); // ready | countdown | playing | resolving | over
  const [countdownStep, setCountdownStep] = useState(0);
  const busyRef = useRef(false);
  const comboRef = useRef(0);

  useEffect(() => {
    if (phase !== "playing") return;
    if (secondsLeft <= 0) {
      setPhase("over");
      submitMatchGameScore(groupId, myUid, myName, score).catch(() => {});
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft, groupId, myUid, myName, score]);

  // 3-2-1-START 카운트다운 — 끝나면 바로 playing으로 전환.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdownStep >= COUNTDOWN_STEPS.length) {
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setCountdownStep((s) => s + 1), countdownStep === COUNTDOWN_STEPS.length - 1 ? 420 : 620);
    return () => clearTimeout(t);
  }, [phase, countdownStep]);

  const resolveCascade = async (startBoard) => {
    busyRef.current = true;
    setPhase("resolving");
    let cur = startBoard;
    let gained = 0;
    let chain = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const matched = findMatches(cur);
      if (matched.size === 0) break;
      chain += 1;
      gained += matched.size;
      setPopping(matched);
      vibrate(chain > 1 ? [25, 30, 25] : 30);
      playPopSound(1 + (chain - 1) * 0.12);
      await new Promise((res) => setTimeout(res, 320));
      cur = collapseAndRefill(cur, matched);
      setBoard(cur);
      setPopping(new Set());
      await new Promise((res) => setTimeout(res, 160));
    }
    if (gained > 0) setScore((s) => s + gained);
    setPhase(secondsLeft > 0 ? "playing" : "over");
    busyRef.current = false;
  };

  const start = () => {
    setBoard(makeBoard());
    setScore(0);
    setSecondsLeft(GAME_SECONDS);
    setSelected(null);
    setInvalidPair(new Set());
    setCountdownStep(0);
    setPhase("countdown");
  };

  // ⭐ 연쇄 반응(resolveCascade) 도중엔 중단 버튼 자체를 안 보이게 해서, 끝나고
  // resolveCascade가 phase를 "playing"으로 되돌리며 중단 상태를 덮어쓰는 충돌을 막는다.
  const quit = () => {
    setPhase("over");
    submitMatchGameScore(groupId, myUid, myName, score).catch(() => {});
  };

  const onCellClick = (idx) => {
    if (phase !== "playing" || busyRef.current) return;
    if (selected == null) { setSelected(idx); return; }
    if (selected === idx) { setSelected(null); return; }
    if (!isAdjacent(selected, idx)) { setSelected(idx); return; }

    const swapped = [...board];
    [swapped[selected], swapped[idx]] = [swapped[idx], swapped[selected]];
    const pair = new Set([selected, idx]);
    setSelected(null);

    const matched = findMatches(swapped);
    if (matched.size === 0) {
      // ⭐ 매치가 안 되는 이동 — 손맛을 위해 빨간 테두리 + 진동 + 경고음을 주고
      // 잠깐 보여줬다가 원래대로 되돌린다.
      setInvalidPair(pair);
      vibrate(60);
      playErrorSound();
      setBoard(swapped);
      setTimeout(() => { setBoard(board); setInvalidPair(new Set()); }, 220);
      return;
    }
    setBoard(swapped);
    resolveCascade(swapped);
  };

  return (
    <div className="fixed inset-0 z-[10025] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={phase === "playing" ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl p-4 w-full max-w-[420px] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-extrabold text-gray-800">구슬 터뜨리기</div>
          {phase !== "playing" && phase !== "countdown" && (
            <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
          )}
        </div>

        {betText && (
          <div className="rounded-lg px-3 py-2 mb-2.5 text-[11.5px] font-bold text-center" style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }}>
            내기: {betText}
          </div>
        )}

        <div className="flex items-center justify-between mb-2.5 text-[12.5px] font-bold">
          <span style={{ color: ACCENT }}>점수 {score}</span>
          <span className="text-gray-500">{phase === "playing" || phase === "resolving" ? `남은 시간 ${secondsLeft}초` : "60초 도전"}</span>
        </div>

        <div className="relative">
          <div
            className="grid gap-[3px] rounded-xl p-2 mx-auto"
            style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, background: "#f3f4f6", width: "100%", aspectRatio: "1 / 1", maxWidth: 380 }}
          >
            {board.map((v, idx) => {
              const isPopping = popping.has(idx);
              const isInvalid = invalidPair.has(idx);
              return (
                <button
                  key={idx}
                  onClick={() => onCellClick(idx)}
                  disabled={phase !== "playing"}
                  className="rounded-full"
                  style={{
                    background: v == null ? "transparent" : ballGradient(COLORS[v]),
                    outline: isInvalid ? "2.5px solid #ef4444" : selected === idx ? "2.5px solid #111827" : "none",
                    outlineOffset: -2,
                    transform: isPopping ? "scale(1.9) rotate(12deg)" : isInvalid ? "scale(0.88)" : "scale(1)",
                    opacity: isPopping ? 0 : 1,
                    transition: isPopping ? "transform 320ms cubic-bezier(.34,1.56,.64,1), opacity 320ms ease" : "transform 160ms ease",
                    boxShadow: v == null ? "none" : isPopping
                      ? `0 0 16px 4px ${COLORS[v]}, inset 0 -3px 5px rgba(0,0,0,0.25), inset 0 3px 4px rgba(255,255,255,0.7)`
                      : "0 2px 3px rgba(0,0,0,0.28), inset 0 -3px 5px rgba(0,0,0,0.28), inset 0 3px 4px rgba(255,255,255,0.75)",
                  }}
                />
              );
            })}
          </div>

          {phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: "rgba(17,24,39,0.55)" }}>
              <div
                key={countdownStep}
                className="font-extrabold text-white"
                style={{
                  fontSize: countdownStep === COUNTDOWN_STEPS.length - 1 ? 44 : 72,
                  textShadow: "0 4px 18px rgba(0,0,0,0.5)",
                  animation: "kpMatchCountdownPop 0.5s cubic-bezier(.34,1.56,.64,1)",
                }}
              >
                {COUNTDOWN_STEPS[countdownStep] || ""}
              </div>
            </div>
          )}
        </div>
        <style>{`
          @keyframes kpMatchCountdownPop {
            0% { opacity: 0; transform: scale(0.4); }
            60% { opacity: 1; transform: scale(1.15); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {phase === "ready" && (
          <button onClick={start} className="w-full mt-4 py-3 rounded-xl text-white text-[14px] font-extrabold" style={{ background: ACCENT }}>
            시작하기
          </button>
        )}
        {phase === "over" && (
          <div className="mt-4">
            <div className="rounded-xl p-3.5 text-center mb-3" style={{ background: ACCENT }}>
              <div className="text-[12px] font-semibold text-white/85">이번 점수</div>
              <div className="text-[24px] font-extrabold text-white">{score}</div>
            </div>
            <div className="flex items-center justify-between text-[12px] text-gray-500 mb-3 px-1">
              <span>나 최고 {Math.max(myBest || 0, score)}</span>
              <span>{otherName || "배우자"} 최고 {otherBest || 0}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-gray-600 text-[13px] font-semibold" style={{ borderColor: ACCENT_BORDER }}>닫기</button>
              <button onClick={start} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>다시 하기</button>
            </div>
          </div>
        )}
        {(phase === "playing" || phase === "resolving") && (
          <>
            <div className="text-center text-[11px] text-gray-400 mt-2.5 mb-2.5">구슬 두 개를 눌러서 자리를 바꿔보세요. 같은 색 3개 이상이 한 줄이 되면 터져요.</div>
            {phase === "playing" && (
              <button onClick={quit} className="w-full py-2 rounded-lg border text-[12px] font-semibold text-gray-500" style={{ borderColor: ACCENT_BORDER }}>
                게임 중단
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
