// src/planner/PlannerAlertBanner.jsx — 화면 상단에 뜨는 알림 배너.
// (1) 상대방 생리 예정일이 3일 이내로 다가오면 여성이 아닌 쪽 화면에 안내
// (2) 등록된 기념일이 한 달 전/일주일 전/당일에 안내
// 둘 다 "설정 > 알림"이 꺼져 있으면 전혀 뜨지 않고, 한 번 닫으면 그날은 다시
// 뜨지 않는다(localStorage로 오늘 날짜 기준 기억).
import React, { useEffect, useMemo, useState } from "react";
import {
  usePlannerEntries, useGroupCycles, computeCycleInfo, todayStr, nextOccurrence,
} from "../adminPlannerData";
import { useGroupMembers } from "./plannerAuth";
import { ACCENT } from "./plannerTheme";

const DISMISS_PREFIX = "kp_alert_dismissed_";

function isDismissed(key) {
  try { return localStorage.getItem(DISMISS_PREFIX + key) === todayStr(); } catch { return false; }
}
function dismiss(key) {
  try { localStorage.setItem(DISMISS_PREFIX + key, todayStr()); } catch {}
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

// 생리 D-2/D-1에 보여줄 가벼운 멘트 — 예민해질 수 있는 시기니 상대방이 좀 더
// 다정하게 챙겨줬으면 하는 마음을 유쾌하게 담았다.
const CYCLE_FUN_MESSAGES = [
  (name, d) => `${name}님 생리 D-${d}! 오늘은 그냥 다 받아주는 날로 정하는 거 어때요?`,
  (name, d) => `곧 ${name}님이 예민 모드 발동할 수도 있어요. 미리 초콜릿 하나 준비해두세요!`,
  (name, d) => `잔소리는 잠시 넣어두고, 오늘은 안아주기 타이밍입니다. (D-${d})`,
  (name, d) => `${name}님 컨디션 난이도 상승 예정! 오늘의 미션: 무조건 "네~"`,
  (name, d) => `생리 D-${d}, 다정함 200% 충전하고 출근하세요.`,
];

export default function PlannerAlertBanner({ account }) {
  const { groupId, uid, gender, notificationsEnabled } = account || {};
  const [tick, setTick] = useState(0); // 배너를 닫으면 목록을 다시 계산하기 위한 트리거
  const members = useGroupMembers(groupId);
  const cycles = useGroupCycles(groupId);
  const { entries } = usePlannerEntries(groupId);
  const schedules = useMemo(() => entries.filter((e) => e.type === "schedule"), [entries]);

  const alerts = useMemo(() => {
    if (notificationsEnabled === false) return [];
    const today = todayStr();
    const out = [];

    // 1) 생리 예정일 — 여성이 아닌 상대방 화면에만.
    if (gender !== "female") {
      const females = members.filter((m) => m.gender === "female");
      females.forEach((f) => {
        const cycle = cycles.find((c) => c.uid === f.uid);
        if (!cycle) return;
        const info = computeCycleInfo(cycle);
        if (!info?.nextPeriodStart) return;
        const d = daysBetween(today, info.nextPeriodStart);
        if (d < 1 || d > 3) return;
        const key = `cycle_${f.uid}_${d}`;
        if (isDismissed(key)) return;
        const text = d === 3
          ? `${f.name || "상대방"}님의 생리가 3일 남았어요.`
          : CYCLE_FUN_MESSAGES[(f.uid.length + d) % CYCLE_FUN_MESSAGES.length](f.name || "상대방", d);
        out.push({ key, text });
      });
    }

    // 2) 기념일 — 한 달 전(30일)/일주일 전(7일)/당일(0일).
    schedules.forEach((s) => {
      if (!s.date) return;
      const effectiveDate = s.recurring ? nextOccurrence(s.date, today) : s.date;
      const d = daysBetween(today, effectiveDate);
      if (![30, 7, 0].includes(d)) return;
      const key = `anniv_${s.id}_${d}`;
      if (isDismissed(key)) return;
      const label = d === 30 ? "한 달 뒤예요" : d === 7 ? "일주일 뒤예요" : "오늘이에요";
      out.push({ key, text: `"${s.title}"이(가) ${label}.` });
    });

    return out;
  }, [notificationsEnabled, gender, members, cycles, schedules, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!groupId || alerts.length === 0) return null;

  return (
    <div style={{ position: "fixed", top: 8, left: 0, right: 0, zIndex: 10030, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, pointerEvents: "none" }}>
      {alerts.map((a) => (
        <div
          key={a.key}
          style={{
            pointerEvents: "auto", maxWidth: "92vw", width: 380, background: "#fff", borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: `1.5px solid ${ACCENT}`,
            padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#374151", lineHeight: 1.4 }}>{a.text}</div>
          <button
            onClick={() => { dismiss(a.key); setTick((v) => v + 1); }}
            style={{ flexShrink: 0, background: "none", border: "none", color: "#9ca3af", fontSize: 15, lineHeight: 1, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
