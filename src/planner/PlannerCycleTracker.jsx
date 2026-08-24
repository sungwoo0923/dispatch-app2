// src/planner/PlannerCycleTracker.jsx — 생리주기/가임기 메뉴 (PC/모바일 공용).
// 여자 계정만 기록을 입력할 수 있고, 남자 계정은 결과(가임기/배란일/임신 확률)만
// 읽을 수 있다. 의학적 진단이 아닌 통상적인 계산법에 따른 참고용 추정치임을 안내한다.
import React, { useEffect, useMemo, useState } from "react";
import { useGroupMembers } from "./plannerAuth";
import { useGroupCycles, saveCycleData, computeCycleInfo, todayStr } from "../adminPlannerData";
import PlannerDatePicker from "./PlannerDatePicker";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function MiniCalendar({ info, lastPeriodStart, periodLength }) {
  const base = info?.nextPeriodStart ? new Date(info.nextPeriodStart + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());
  useEffect(() => { setViewYear(base.getFullYear()); setViewMonth(base.getMonth()); }, [info?.nextPeriodStart]); // eslint-disable-line

  const first = new Date(viewYear, viewMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const fmt = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayS = todayStr();
  const goMonth = (delta) => {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  };

  const periodEndFromStart = (startStr) => {
    if (!startStr) return null;
    const d = new Date(startStr + "T00:00:00");
    d.setDate(d.getDate() + (Number(periodLength) || 5) - 1);
    return fmt(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const currentPeriodEnd = periodEndFromStart(lastPeriodStart);

  const dayKind = (dateStr) => {
    if (lastPeriodStart && dateStr >= lastPeriodStart && dateStr <= currentPeriodEnd) return "period";
    if (info && dateStr >= info.nextPeriodStart && dateStr <= info.periodEnd) return "period"; // 다음 달 예정 생리 기간(대략)
    if (info && dateStr === info.ovulationDate) return "ovulation";
    if (info && dateStr >= info.fertileStart && dateStr <= info.fertileEnd) return "fertile";
    return null;
  };

  return (
    <div className="bg-white border rounded-xl p-3" style={{ borderColor: ACCENT_BORDER }}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg font-bold" style={{ color: ACCENT }}>‹</button>
        <div className="text-[13px] font-bold" style={{ color: ACCENT }}>{viewYear}년 {viewMonth + 1}월</div>
        <button type="button" onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg font-bold" style={{ color: ACCENT }}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_KO.map((w, i) => (
          <div key={w} className={`text-center text-[10.5px] font-bold py-0.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-400"}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const dateStr = fmt(viewYear, viewMonth, d);
          const kind = dayKind(dateStr);
          const isToday = dateStr === todayS;
          let style = { color: "#9ca3af" };
          if (kind === "period") style = { background: "#fecaca", color: "#b91c1c", fontWeight: 800 };
          else if (kind === "ovulation") style = { background: ACCENT, color: "#fff", fontWeight: 900 };
          else if (kind === "fertile") style = { background: ACCENT_SOFT, color: ACCENT, fontWeight: 800 };
          return (
            <div key={i} className="h-8 rounded-lg flex items-center justify-center text-[11.5px]" style={{ ...style, outline: isToday ? `1.5px solid ${ACCENT}` : "none" }}>
              {d}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2.5 mt-2.5 pt-2 border-t text-[10px] text-gray-400" style={{ borderColor: ACCENT_SOFT }}>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: "#fecaca" }} />생리 기간</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: ACCENT_SOFT }} />가임기</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ background: ACCENT }} />배란일(확률 최고)</span>
      </div>
    </div>
  );
}

function CycleSummary({ info }) {
  if (!info) {
    return <div className="bg-white border rounded-xl py-10 text-center text-[12.5px] text-gray-400" style={{ borderColor: ACCENT_BORDER }}>아직 기록이 없습니다.</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white border rounded-xl p-3.5" style={{ borderColor: ACCENT_BORDER }}>
        <div className="text-[11px] font-bold text-gray-400 mb-1">오늘 상태</div>
        <div className="text-[14px] font-extrabold" style={{ color: ACCENT }}>{info.todayPhase}</div>
      </div>
      <div className="bg-white border rounded-xl p-3.5" style={{ borderColor: ACCENT_BORDER }}>
        <div className="text-[11px] font-bold text-gray-400 mb-1">다음 생리 예정일</div>
        <div className="text-[14px] font-extrabold text-gray-700">{info.nextPeriodStart}</div>
      </div>
      <div className="bg-white border rounded-xl p-3.5" style={{ borderColor: ACCENT_BORDER }}>
        <div className="text-[11px] font-bold text-gray-400 mb-1">임신 확률 최고 (배란일)</div>
        <div className="text-[14px] font-extrabold" style={{ color: ACCENT }}>{info.ovulationDate}</div>
      </div>
      <div className="bg-white border rounded-xl p-3.5" style={{ borderColor: ACCENT_BORDER }}>
        <div className="text-[11px] font-bold text-gray-400 mb-1">가임기 (확률 높음)</div>
        <div className="text-[13px] font-extrabold text-gray-700">{info.fertileStart} ~ {info.fertileEnd}</div>
      </div>
    </div>
  );
}

export default function PlannerCycleTracker({ groupId, myUid, myGender, myName }) {
  const members = useGroupMembers(groupId);
  const cycles = useGroupCycles(groupId);
  const myCycle = cycles.find((c) => c.uid === myUid);

  const [lastPeriodStart, setLastPeriodStart] = useState(myCycle?.lastPeriodStart || "");
  const [cycleLength, setCycleLength] = useState(String(myCycle?.cycleLength || 28));
  const [periodLength, setPeriodLength] = useState(String(myCycle?.periodLength || 5));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (myCycle) {
      setLastPeriodStart(myCycle.lastPeriodStart || "");
      setCycleLength(String(myCycle.cycleLength || 28));
      setPeriodLength(String(myCycle.periodLength || 5));
    }
  }, [myCycle?.lastPeriodStart, myCycle?.cycleLength, myCycle?.periodLength]); // eslint-disable-line

  const myInfo = useMemo(
    () => computeCycleInfo({ lastPeriodStart, cycleLength, periodLength }),
    [lastPeriodStart, cycleLength, periodLength]
  );

  const save = async () => {
    if (!lastPeriodStart) { alert("마지막 생리 시작일을 선택해 주세요."); return; }
    setSaving(true);
    try {
      await saveCycleData(myUid, {
        groupId, ownerName: myName || "", lastPeriodStart,
        cycleLength: Number(cycleLength) || 28, periodLength: Number(periodLength) || 5,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (myGender === "female") {
    return (
      <div className="space-y-4 max-w-xl">
        <div className="text-[12px] text-gray-400">직접 입력한 기록은 나만 수정할 수 있고, 남편(배우자)은 결과만 볼 수 있어요.</div>
        <div className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="text-[12px] font-semibold text-gray-500 mb-1">마지막 생리 시작일</div>
              <PlannerDatePicker value={lastPeriodStart} onChange={setLastPeriodStart} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[12px] font-semibold text-gray-500 mb-1">평균 생리 주기(일)</div>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-[13px]" style={{ borderColor: ACCENT_BORDER }} value={cycleLength} onChange={(e) => setCycleLength(e.target.value)} />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-gray-500 mb-1">생리 기간(일)</div>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-[13px]" style={{ borderColor: ACCENT_BORDER }} value={periodLength} onChange={(e) => setPeriodLength(e.target.value)} />
              </div>
            </div>
          </div>
          <button onClick={save} disabled={saving} className="w-full mt-3 py-2.5 rounded-xl text-white text-[13px] font-bold" style={{ background: ACCENT }}>
            {saving ? "저장 중..." : savedFlash ? "저장됨" : "저장"}
          </button>
        </div>

        <CycleSummary info={myInfo} />
        <MiniCalendar info={myInfo} lastPeriodStart={lastPeriodStart} periodLength={periodLength} />
        <div className="text-[10.5px] text-gray-400 leading-relaxed">
          * 통상적인 계산법(평균 주기 기준 배란일 = 다음 생리 14일 전)에 따른 참고용 추정치이며, 의학적 진단을 대체하지 않습니다.
        </div>
      </div>
    );
  }

  // 남자 계정 — 읽기 전용. 그룹 내 여자 구성원의 기록을 찾아 보여준다.
  const femaleMembers = members.filter((m) => m.gender === "female");
  const entries = femaleMembers
    .map((m) => ({ member: m, cycle: cycles.find((c) => c.uid === m.uid) }))
    .filter((e) => e.cycle);

  return (
    <div className="space-y-4 max-w-xl">
      <div className="text-[12px] text-gray-400">배우자가 입력한 생리주기 기록을 볼 수 있어요 (입력은 할 수 없어요).</div>
      {entries.length === 0 && (
        <div className="bg-white border rounded-xl py-16 text-center text-[13px] text-gray-400" style={{ borderColor: ACCENT_BORDER }}>
          아직 등록된 기록이 없습니다.
        </div>
      )}
      {entries.map(({ member, cycle }) => {
        const info = computeCycleInfo(cycle);
        return (
          <div key={member.uid} className="space-y-2">
            <div className="text-[13px] font-bold text-gray-700">{member.name}님의 기록</div>
            <CycleSummary info={info} />
            <MiniCalendar info={info} lastPeriodStart={cycle.lastPeriodStart} periodLength={cycle.periodLength} />
          </div>
        );
      })}
      <div className="text-[10.5px] text-gray-400 leading-relaxed">
        * 통상적인 계산법에 따른 참고용 추정치이며, 의학적 진단을 대체하지 않습니다.
      </div>
    </div>
  );
}
