// src/planner/PlannerMatchGame.jsx — "구슬 터뜨리기" 미니게임(비주얼 레퍼런스는
// Bejeweled/Candy Crush류의 매치 퍼즐). 보드에 색깔 구슬이 꽉 차 있고, 인접한
// 두 구슬을 상하좌우로 맞바꿔서 같은 색 5개 이상을 한 줄로 모으면 터진다.
// 터진 자리는 위에서 새 구슬이 랜덤으로 떨어져 채운다. 60초 동안 혼자 플레이해서
// 점수를 내고, 배우자와는 최고 점수로 겨룬다(동시 조작 아님 — 각자 도전 후 비교).
import React, { useEffect, useRef, useState } from "react";
import { submitMatchGameScore } from "../adminPlannerData";
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
        ((c >= 4 && board[r * COLS + c - 1] === v && board[r * COLS + c - 2] === v && board[r * COLS + c - 3] === v && board[r * COLS + c - 4] === v) ||
          (r >= 4 && board[(r - 1) * COLS + c] === v && board[(r - 2) * COLS + c] === v && board[(r - 3) * COLS + c] === v && board[(r - 4) * COLS + c] === v))
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
        if (c - runStart >= 5) for (let k = runStart; k < c; k++) matched.add(r * COLS + k);
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
        if (r - runStart >= 5) for (let k = runStart; k < r; k++) matched.add(k * COLS + c);
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

export default function PlannerMatchGame({ groupId, myUid, myName, myBest, otherName, otherBest, onClose }) {
  const [board, setBoard] = useState(makeBoard);
  const [selected, setSelected] = useState(null);
  const [popping, setPopping] = useState(new Set());
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(GAME_SECONDS);
  const [phase, setPhase] = useState("ready"); // ready | playing | resolving | over
  const busyRef = useRef(false);

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

  const resolveCascade = async (startBoard) => {
    busyRef.current = true;
    setPhase("resolving");
    let cur = startBoard;
    let gained = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const matched = findMatches(cur);
      if (matched.size === 0) break;
      gained += matched.size;
      setPopping(matched);
      await new Promise((res) => setTimeout(res, 260));
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
    setPhase("playing");
  };

  const onCellClick = (idx) => {
    if (phase !== "playing" || busyRef.current) return;
    if (selected == null) { setSelected(idx); return; }
    if (selected === idx) { setSelected(null); return; }
    if (!isAdjacent(selected, idx)) { setSelected(idx); return; }

    const swapped = [...board];
    [swapped[selected], swapped[idx]] = [swapped[idx], swapped[selected]];
    setSelected(null);

    const matched = findMatches(swapped);
    if (matched.size === 0) {
      // 매치가 안 되면 잠깐 보여줬다가 원래대로 되돌린다.
      setBoard(swapped);
      setTimeout(() => setBoard(board), 160);
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
          {phase !== "playing" && (
            <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
          )}
        </div>

        <div className="flex items-center justify-between mb-2.5 text-[12.5px] font-bold">
          <span style={{ color: ACCENT }}>점수 {score}</span>
          <span className="text-gray-500">{phase === "playing" || phase === "resolving" ? `남은 시간 ${secondsLeft}초` : "60초 도전"}</span>
        </div>

        <div
          className="grid gap-[3px] rounded-xl p-2 mx-auto"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, background: "#f3f4f6", width: "100%", aspectRatio: "1 / 1", maxWidth: 380 }}
        >
          {board.map((v, idx) => (
            <button
              key={idx}
              onClick={() => onCellClick(idx)}
              disabled={phase !== "playing"}
              className="rounded-full flex items-center justify-center"
              style={{
                background: v == null ? "transparent" : COLORS[v],
                outline: selected === idx ? "2.5px solid #111827" : "none",
                outlineOffset: -2,
                transform: popping.has(idx) ? "scale(1.35)" : "scale(1)",
                opacity: popping.has(idx) ? 0 : 1,
                transition: "transform 220ms ease, opacity 220ms ease",
                boxShadow: v == null ? "none" : "inset 0 -3px 4px rgba(0,0,0,0.18), inset 0 2px 3px rgba(255,255,255,0.5)",
              }}
            />
          ))}
        </div>

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
          <div className="text-center text-[11px] text-gray-400 mt-2.5">구슬 두 개를 눌러서 자리를 바꿔보세요. 같은 색 5개가 한 줄이 되면 터져요.</div>
        )}
      </div>
    </div>
  );
}
