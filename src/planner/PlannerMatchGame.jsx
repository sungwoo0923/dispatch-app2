// src/planner/PlannerMatchGame.jsx — "구슬 터뜨리기" 미니게임(비주얼 레퍼런스는
// Bejeweled/Candy Crush류의 매치 퍼즐). 보드에 색깔 구슬이 꽉 차 있고, 인접한
// 두 구슬을 상하좌우로 맞바꿔서 같은 색 3개 이상을 한 줄로 모으면 터진다.
// ⭐ 처음엔 "5개 이상"으로 만들었는데, 인접한 두 칸만 맞바꾸는 방식에서는 한 번의
// 스왑으로 5줄을 완성하는 경우가 사실상 거의 없어서(4개가 이미 나란히 있어야
// 함) 거의 매번 "옮겼다가 그대로 되돌아가는" 것처럼 보이는 문제가 있었다.
// Bejeweled/Candy Crush 등 실제 매치 게임들도 전부 3개 기준이라 그에 맞춰 낮췄다.
// 터진 자리는 위에서 새 구슬이 랜덤으로 떨어져 채운다. 60초 동안 혼자 플레이해서
// 점수를 내고, 상대방과는 최고 점수로 겨룬다(동시 조작 아님 — 각자 도전 후 비교).
// ⭐ 구슬이 납작한 동전 같다는 피드백으로 방사형 그라데이션+하이라이트로 입체감을
// 줬고, 터질 때 진동+효과음+더 큰 임팩트를, 못 옮기는 자리를 누르면 빨간 테두리
// +진동+경고음을 주도록 손맛을 더했다. 시작 전엔 3-2-1-START 카운트다운이 뜬다.
// ⭐ 선택 표시는 칙칙한 검은 테두리 대신 흰 링+컬러 글로우로, 스왑은 순간이동이
// 아니라 슥- 밀리는 슬라이딩으로, 콤보엔 화면이 흔들리는 임팩트를 추가했다.
// ⭐ 내기가 걸린 라운드에서는 "다시 하기"가 상대가 이번
// 라운드를 끝낼 때까지 잠긴다 — 안 그러면 먼저 끝낸 사람이 계속 재도전해서
// 점수가 바뀌어버리는 문제가 있었다. 기다리는 동안엔 실시간으로 상대(나) 화면을
// 보드/점수/남은시간을 저장해서, 상대가 "지켜보기"로 볼 수 있게 한다.
import React, { useEffect, useRef, useState } from "react";
import { submitMatchGameScore, updateLiveMatchSnapshot, clearLiveMatchSnapshot } from "../adminPlannerData";
import { playPopSound, playComboSound, playErrorSound, vibrate } from "./plannerSound";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

const ROWS = 8;
const COLS = 8;
const GAME_SECONDS = 60;
const SLIDE_MS = 190; // 스왑 슬라이딩 속도 — 너무 느리지 않으면서 눈에 보이게
const SHARD_ANGLES = [0, 60, 120, 180, 240, 300]; // 폭발 파편이 튀는 방향(6방향)
// ⭐ 색 종류가 적을수록 우연히 같은 색이 나란히 놓일 확률이 높아져서 콤보(연쇄)가
// 더 자주 터진다 — 색이 너무 적으면 밋밋해지니, 6개였던 걸 5개로만 살짝 줄였다.
export const COLORS = [
  "#ef4444", // 빨강
  "#f97316", // 주황
  "#eab308", // 노랑
  "#22c55e", // 초록
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
export function ballGradient(hex) {
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

// 두 인접 칸 사이의 방향(-1/0/1) — 슬라이딩 애니메이션에서 어느 쪽으로 얼마나
// 밀어야 하는지 계산할 때 쓴다.
function cellDir(a, b) {
  const ra = Math.floor(a / COLS), ca = a % COLS;
  const rb = Math.floor(b / COLS), cb = b % COLS;
  return { dx: cb - ca, dy: rb - ra };
}

const COUNTDOWN_STEPS = ["3", "2", "1", "START!"];

export default function PlannerMatchGame({
  groupId, myUid, myName, myBest, otherUid, otherName, otherBest, betText, roundComplete, onClose,
}) {
  const [board, setBoard] = useState(makeBoard);
  const [selected, setSelected] = useState(null);
  const [popping, setPopping] = useState(new Set());
  const [invalidPair, setInvalidPair] = useState(new Set());
  const [slide, setSlide] = useState(null); // { a, b } — 슬라이딩 중인 두 칸
  const [swapping, setSwapping] = useState(false);
  const [shake, setShake] = useState(null); // { name, magnitude } — 화면 흔들림
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(GAME_SECONDS);
  const [phase, setPhase] = useState("ready"); // ready | countdown | playing | resolving | over
  const [countdownStep, setCountdownStep] = useState(0);
  const [combo, setCombo] = useState(null); // { key, chain } — 콤보 임팩트 문구
  const [submitError, setSubmitError] = useState(""); // 점수 저장이 실패했을 때 안내
  const busyRef = useRef(false);
  const shakeTimerRef = useRef(null);

  // ⭐ 예전엔 submitMatchGameScore 실패를 그냥 .catch(() => {})로 조용히
  // 무시해서, Firestore 오류(할당량 초과 등)가 나도 사용자는 점수가 잘
  // 저장된 줄 알고 있었다 — "이겼는데 최고점이 0으로 보인다"는 혼란의
  // 실제 원인이었다. 이제는 실패하면 화면에 이유를 보여주고 다시 시도할
  // 수 있게 한다.
  const submitScore = async (finalScore) => {
    try {
      await submitMatchGameScore(groupId, myUid, myName, finalScore, otherUid);
      setSubmitError("");
    } catch (err) {
      setSubmitError(err?.message ? `점수 저장에 실패했어요 (${err.message})` : "점수 저장에 실패했어요. 네트워크를 확인해 주세요.");
    }
  };

  // ⭐ 이미 내가 이번 라운드 점수를 냈는데 상대(otherUid)는 아직이면, 상대가
  // 끝날 때까지 "다시 하기"를 잠근다 — 안 그러면 내기 점수가 자꾸 바뀐다.
  const waitingForPartner = !!otherUid && !roundComplete;

  useEffect(() => {
    if (phase !== "playing") return;
    if (secondsLeft <= 0) {
      setPhase("over");
      submitScore(score);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft, groupId, myUid, myName, score, otherUid]);

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

  // ⭐ 플레이 중일 때만, 보드/점수/남은시간이 바뀔 때마다 실시간 스냅샷을 남겨서
  // 상대가 "지켜보기"로 볼 수 있게 한다. 게임이 끝나거나 창을 닫으면 지운다.
  // ⭐ 매 초/매 스왑마다 그때그때 쓰기(write)를 하면 Firestore 일일 할당량을
  // 금방 소진해버릴 수 있어서, 최신 값은 ref로만 들고 있다가 2.5초 주기로 한
  // 번씩만 저장한다 — 관전 화면이 살짝 덜 촘촘히 업데이트되는 정도의 트레이드
  // 오프로 실제 쓰기 횟수를 크게 줄인다.
  const liveSnapshotRef = useRef({ board, score, secondsLeft });
  useEffect(() => { liveSnapshotRef.current = { board, score, secondsLeft }; }, [board, score, secondsLeft]);
  useEffect(() => {
    if (phase !== "playing" && phase !== "resolving") return;
    updateLiveMatchSnapshot(groupId, myUid, myName, liveSnapshotRef.current);
    const t = setInterval(() => {
      updateLiveMatchSnapshot(groupId, myUid, myName, liveSnapshotRef.current);
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => {
      clearLiveMatchSnapshot(groupId).catch(() => {});
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerShake = (chain) => {
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    const name = `kpShake${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const magnitude = Math.min(11, 3 + chain * 2.2);
    setShake({ name, magnitude });
    shakeTimerRef.current = setTimeout(() => setShake(null), 320);
  };

  const resolveCascade = async (startBoard) => {
    busyRef.current = true;
    setPhase("resolving");
    let cur = startBoard;
    let gained = 0;
    let chain = 0;
    // ⭐ 콤보(연쇄)가 이어질수록 점수가 2배씩 뛰도록 — 1연쇄는 그대로, 2연쇄는
    // 2배, 3연쇄는 4배... 식으로 뒤로 갈수록 폭발적으로 점수가 오른다.
    let multiplier = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const matched = findMatches(cur);
      if (matched.size === 0) break;
      chain += 1;
      gained += matched.size * multiplier;
      setPopping(matched);
      vibrate(chain > 1 ? [25, 30, 25] : 30);
      if (chain > 1) {
        playComboSound(chain);
      } else {
        playPopSound(1);
      }
      triggerShake(chain);
      // ⭐ 콤보(연쇄) 임팩트 — 한 번의 스왑으로 2연쇄 이상 터지면 화면 중앙에
      // "N COMBO!" 문구가 팍 떴다 사라진다.
      if (chain > 1) setCombo({ key: Date.now(), chain });
      await new Promise((res) => setTimeout(res, 320));
      cur = collapseAndRefill(cur, matched);
      setBoard(cur);
      setPopping(new Set());
      multiplier *= 2;
      await new Promise((res) => setTimeout(res, 160));
    }
    if (gained > 0) setScore((s) => s + gained);
    setPhase(secondsLeft > 0 ? "playing" : "over");
    busyRef.current = false;
  };

  const start = () => {
    // ⭐ 라운드가 이미 끝난 뒤 다시 도전하는 경우, 예전엔 여기서 별도로
    // startNewMatchRound를 미리 호출해 라운드를 초기화했는데 — 두 사람이 거의
    // 동시에 재도전하면 그 초기화 쓰기가 상대가 방금 낸 점수를 지워버리는
    // 경합이 생겼다. 이제는 점수를 제출하는 submitMatchGameScore 트랜잭션이
    // "이미 끝난 라운드"를 알아서 새 라운드로 취급하므로, 여기서는 그냥 내
    // 화면만 초기화하면 된다.
    setBoard(makeBoard());
    setScore(0);
    setSecondsLeft(GAME_SECONDS);
    setSelected(null);
    setInvalidPair(new Set());
    setSlide(null);
    setSwapping(false);
    setCountdownStep(0);
    setCombo(null);
    setPhase("countdown");
  };

  // ⭐ 연쇄 반응(resolveCascade) 도중엔 중단 버튼 자체를 안 보이게 해서, 끝나고
  // resolveCascade가 phase를 "playing"으로 되돌리며 중단 상태를 덮어쓰는 충돌을 막는다.
  const quit = () => {
    setPhase("over");
    submitScore(score);
    clearLiveMatchSnapshot(groupId).catch(() => {});
  };

  // 두 칸을 슬라이딩으로 서로 밀어 자리를 바꾼다 — 애니메이션이 끝난 뒤에야
  // 실제 board 데이터를 바꾸고, 바뀐 배열을 그대로 돌려준다(같은 함수를 다시
  // 호출하면 되돌리기 애니메이션도 된다).
  const slideSwap = (aIdx, bIdx) => new Promise((resolve) => {
    setSlide({ a: aIdx, b: bIdx });
    setTimeout(() => {
      setBoard((prev) => {
        const next = [...prev];
        [next[aIdx], next[bIdx]] = [next[bIdx], next[aIdx]];
        resolve(next);
        return next;
      });
      setSlide(null);
    }, SLIDE_MS);
  });

  // 두 칸을 실제로 맞바꿔보고, 매치가 안 되면 손맛(빨간 테두리+진동+경고음)을
  // 주고 되돌리고, 매치가 되면 연쇄 반응을 시작한다 — 탭으로 선택해서
  // 바꾸는 방식과 스와이프 방식 둘 다 이 함수 하나를 공유한다.
  const attemptSwap = async (a, b) => {
    if (phase !== "playing" || busyRef.current || swapping) return;
    if (a == null || b == null || a === b || !isAdjacent(a, b)) return;
    setSelected(null);
    setSwapping(true);
    const swapped = await slideSwap(a, b);

    const matched = findMatches(swapped);
    if (matched.size === 0) {
      setInvalidPair(new Set([a, b]));
      vibrate(60);
      playErrorSound();
      await slideSwap(a, b);
      setInvalidPair(new Set());
      setSwapping(false);
      return;
    }
    setSwapping(false);
    resolveCascade(swapped);
  };

  // 탭 방식 — 구슬 하나를 누르고, 인접한 다른 구슬을 다시 누르면 자리가 바뀐다.
  const onCellClick = (idx) => {
    if (phase !== "playing" || busyRef.current || swapping) return;
    // ⭐ 방금 스와이프로 이미 처리된 동작이면, 뒤이어 자동으로 따라오는 click
    // 이벤트는 무시해야 한다(안 그러면 스와이프+클릭이 중복으로 처리된다).
    // dragRef는 pointerup에서 바로 비워지므로, 이 판단에는 별도 플래그를 쓴다.
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (selected == null) { setSelected(idx); return; }
    if (selected === idx) { setSelected(null); return; }
    if (!isAdjacent(selected, idx)) { setSelected(idx); return; }
    attemptSwap(selected, idx);
  };

  // ⭐ 스와이프 방식 — 구슬을 누른 채로 상하좌우 어느 방향으로든 밀면, 그 방향의
  // 인접 칸과 바로 자리가 바뀐다(따로 두 번 탭할 필요 없음). 드래그 시작점에서
  // 일정 거리(SWIPE_THRESHOLD) 이상 움직인 방향으로 판정한다.
  const dragRef = useRef(null); // { idx, x, y, moved }
  const suppressClickRef = useRef(false);
  const SWIPE_THRESHOLD = 16;

  const onCellPointerDown = (idx, e) => {
    if (phase !== "playing" || busyRef.current || swapping) return;
    dragRef.current = { idx, x: e.clientX, y: e.clientY, moved: false };
  };

  useEffect(() => {
    if (phase !== "playing") return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || d.moved) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      d.moved = true;
      suppressClickRef.current = true;
      const ra = Math.floor(d.idx / COLS), ca = d.idx % COLS;
      let ta = ra, tc = ca;
      if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
      else ta += dy > 0 ? 1 : -1;
      if (ta < 0 || ta >= ROWS || tc < 0 || tc >= COLS) return;
      attemptSwap(d.idx, ta * COLS + tc);
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, swapping]);

  return (
    <div className="fixed inset-0 z-[10025] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={phase === "playing" ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl p-4 w-full max-w-[420px] max-h-[92vh] overflow-y-auto">
        {betText && (
          <div
            className="rounded-lg px-3 py-2 mb-3 text-[12px] font-extrabold text-center kp-bet-blink"
            style={{ background: ACCENT, color: "#fff" }}
          >
            오늘의 내기 : {betText}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-extrabold text-gray-800">구슬 터뜨리기</div>
          {phase !== "playing" && phase !== "countdown" && (
            <button onClick={onClose} className="text-gray-400 text-[18px] leading-none">✕</button>
          )}
        </div>

        <div className="flex items-center justify-between mb-2.5 text-[12.5px] font-bold">
          <span style={{ color: ACCENT }}>점수 {score}</span>
          <span className="text-gray-500">{phase === "playing" || phase === "resolving" ? `남은 시간 ${secondsLeft}초` : "60초 도전"}</span>
        </div>

        <div className="relative" style={{ animation: shake ? `${shake.name} 300ms ease` : undefined }}>
          {shake && (
            <style>{`
              @keyframes ${shake.name} {
                10%, 90% { transform: translate(-${shake.magnitude}px, 0); }
                20%, 80% { transform: translate(${shake.magnitude}px, 0); }
                30%, 50%, 70% { transform: translate(-${shake.magnitude}px, ${shake.magnitude / 2}px); }
                40%, 60% { transform: translate(${shake.magnitude}px, -${shake.magnitude / 2}px); }
              }
            `}</style>
          )}
          <div
            className="grid gap-[3px] rounded-xl p-2 mx-auto"
            style={{ position: "relative", zIndex: 0, gridTemplateColumns: `repeat(${COLS}, 1fr)`, background: "#f3f4f6", width: "100%", aspectRatio: "1 / 1", maxWidth: 380 }}
          >
            {board.map((v, idx) => {
              const isPopping = popping.has(idx);
              const isInvalid = invalidPair.has(idx);
              const isSelected = selected === idx;
              const isSliding = slide && (slide.a === idx || slide.b === idx);
              let slideTransform = "";
              if (isSliding) {
                const dir = slide.a === idx ? cellDir(slide.a, slide.b) : cellDir(slide.b, slide.a);
                slideTransform = `translate(${dir.dx * 100}%, ${dir.dy * 100}%) `;
              }
              const scalePart = isPopping ? "scale(1.9) rotate(12deg)" : isInvalid ? "scale(0.88)" : isSelected ? "scale(1.1)" : "scale(1)";
              return (
                <button
                  key={idx}
                  onClick={() => onCellClick(idx)}
                  onPointerDown={(e) => onCellPointerDown(idx, e)}
                  disabled={phase !== "playing" || swapping}
                  className="rounded-full"
                  style={{
                    position: "relative",
                    touchAction: "none",
                    background: v == null ? "transparent" : ballGradient(COLORS[v]),
                    // ⭐ 선택 표시를 칙칙한 검은 테두리 대신 흰 링 + 컬러 글로우로 바꿔서
                    // 게임다운 "광이 나는" 느낌을 주고, 잘못된 이동만 빨간 테두리로 경고한다.
                    outline: isInvalid ? "2.5px solid #ef4444" : "none",
                    outlineOffset: -2,
                    boxShadow: v == null ? "none" : isInvalid
                      ? "0 2px 3px rgba(0,0,0,0.28), inset 0 -3px 5px rgba(0,0,0,0.28), inset 0 3px 4px rgba(255,255,255,0.75)"
                      : isSelected
                      ? `0 0 0 2.5px #fff, 0 0 15px 5px ${COLORS[v]}, inset 0 -3px 5px rgba(0,0,0,0.2), inset 0 3px 5px rgba(255,255,255,0.9)`
                      : isPopping
                      ? `0 0 16px 4px ${COLORS[v]}, inset 0 -3px 5px rgba(0,0,0,0.25), inset 0 3px 4px rgba(255,255,255,0.7)`
                      : "0 2px 3px rgba(0,0,0,0.28), inset 0 -3px 5px rgba(0,0,0,0.28), inset 0 3px 4px rgba(255,255,255,0.75)",
                    transform: `${slideTransform}${scalePart}`,
                    opacity: isPopping ? 0 : 1,
                    zIndex: isSliding ? 5 : isSelected ? 3 : 1,
                    transition: isSliding
                      ? `transform ${SLIDE_MS}ms ease-in-out`
                      : isPopping
                      ? "transform 320ms cubic-bezier(.34,1.56,.64,1), opacity 320ms ease"
                      : "transform 160ms ease, box-shadow 160ms ease",
                  }}
                >
                  {/* ⭐ 그냥 사라지는 대신 폭발하는 느낌을 주려고, 터지는 순간
                      충격파 링 + 사방으로 튀는 파편을 같이 띄운다. */}
                  {isPopping && v != null && (
                    <>
                      <span
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{ border: `3px solid ${COLORS[v]}`, animation: "kpShockwave 380ms ease-out forwards" }}
                      />
                      {SHARD_ANGLES.map((deg) => (
                        <span
                          key={deg}
                          className="absolute rounded-full pointer-events-none"
                          style={{
                            width: 6, height: 6, top: "50%", left: "50%", marginTop: -3, marginLeft: -3,
                            background: COLORS[v],
                            "--tx": `${Math.round(Math.cos((deg * Math.PI) / 180) * 28)}px`,
                            "--ty": `${Math.round(Math.sin((deg * Math.PI) / 180) * 28)}px`,
                            animation: "kpShard 380ms ease-out forwards",
                          }}
                        />
                      ))}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ zIndex: 30, background: "rgba(17,24,39,0.55)" }}>
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

          {combo && (
            <div key={combo.key} className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 30 }}>
              <div
                className="font-extrabold text-center"
                style={{
                  color: ACCENT,
                  fontSize: 30,
                  WebkitTextStroke: "1.5px #ffffff",
                  textShadow: "0 3px 10px rgba(0,0,0,0.25)",
                  animation: "kpComboPop 0.7s cubic-bezier(.34,1.56,.64,1) forwards",
                }}
              >
                {combo.chain} COMBO!
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
          @keyframes kpComboPop {
            0% { opacity: 0; transform: scale(0.5) rotate(-6deg); }
            35% { opacity: 1; transform: scale(1.25) rotate(3deg); }
            60% { transform: scale(1) rotate(0deg); }
            100% { opacity: 0; transform: scale(1.15) translateY(-14px); }
          }
          .kp-bet-blink { animation: kpBetBlink 1.6s ease-in-out infinite; }
          @keyframes kpBetBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          @keyframes kpShockwave {
            0% { transform: scale(0.3); opacity: 0.9; }
            100% { transform: scale(2.4); opacity: 0; }
          }
          @keyframes kpShard {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            100% { transform: translate(var(--tx), var(--ty)) scale(0.2); opacity: 0; }
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
              <span>{otherName || "상대방"} 최고 {otherBest || 0}</span>
            </div>
            {submitError && (
              <div className="rounded-xl px-3.5 py-2.5 mb-3 text-center bg-red-50 border border-red-200">
                <div className="text-[11.5px] font-bold text-red-500">{submitError}</div>
                <button onClick={() => submitScore(score)} className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-full bg-red-500 text-white">
                  다시 저장하기
                </button>
              </div>
            )}
            {waitingForPartner ? (
              <div className="rounded-xl px-3.5 py-3 text-center" style={{ background: ACCENT_SOFT, border: `1px solid ${ACCENT_BORDER}` }}>
                <div className="text-[12px] font-bold" style={{ color: ACCENT }}>
                  {`${otherName || "상대방"}이 끝날 때까지 다시 하기가 잠겨요`}
                </div>
                <div className="text-[10.5px] text-gray-400 mt-1 leading-relaxed">내기 점수가 계속 바뀌면 안 되니까, 상대방이 끝난 뒤에 다시 도전할 수 있어요.</div>
                <button onClick={onClose} className="w-full mt-3 py-2.5 rounded-xl border text-gray-600 text-[13px] font-semibold bg-white" style={{ borderColor: ACCENT_BORDER }}>닫기</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-gray-600 text-[13px] font-semibold" style={{ borderColor: ACCENT_BORDER }}>닫기</button>
                <button onClick={start} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>다시 하기</button>
              </div>
            )}
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
