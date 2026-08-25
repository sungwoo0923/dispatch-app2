// src/planner/PlannerMoodToast.jsx — 상대방이 "오늘의 기분"을 바꿀 때마다 화면
// 위쪽에 짧게 떴다 사라지는 알림. 여러 개가 쌓여있어도 한꺼번에 다 뜨지 않고,
// 하나가 뜨고 사라진 다음에야 그 다음 것이 이어서 뜬다(큐 방식).
import React, { useEffect, useState } from "react";
import { usePlannerMoodNotifications, consumeMoodNotification, MOOD_OPTIONS } from "../adminPlannerData";
import { ACCENT } from "./plannerTheme";

const SHOW_MS = 3200;
const FADE_MS = 400;

export default function PlannerMoodToast({ groupId, myUid }) {
  const queue = usePlannerMoodNotifications(groupId, myUid);
  const [current, setCurrent] = useState(null);
  const [visible, setVisible] = useState(false);

  // 큐에 다음 항목이 있고 지금 보여줄 게 없으면 하나 꺼내온다.
  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
  }, [queue, current]);

  useEffect(() => {
    if (!current) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    const hideTimer = setTimeout(() => setVisible(false), SHOW_MS);
    const doneTimer = setTimeout(async () => {
      try { await consumeMoodNotification(current.id); } catch {}
      setCurrent(null);
    }, SHOW_MS + FADE_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hideTimer);
      clearTimeout(doneTimer);
    };
  }, [current]);

  if (!current) return null;
  const label = MOOD_OPTIONS.find((m) => m.value === current.mood)?.label || current.mood;

  return (
    <div
      style={{
        position: "fixed", top: 14, left: "50%", zIndex: 100000, pointerEvents: "none",
        transform: `translateX(-50%) translateY(${visible ? "0px" : "-14px"})`,
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
      }}
    >
      <div style={{ background: ACCENT, color: "#fff", padding: "9px 18px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", whiteSpace: "nowrap" }}>
        {current.fromName || "상대방"}님의 기분 · {label}
      </div>
    </div>
  );
}
