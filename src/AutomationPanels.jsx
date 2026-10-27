// ======================= src/AutomationPanels.jsx =======================
// 🔁 정기 오더 / 📊 마감 요약 (2026-10-27)
//  - 정기 오더: 오더복사수정패널의 [정기 오더로 등록]으로 만든 틀(recurringOrders)을 정한 요일마다 서버가 자동으로 만든다.
//    매일 정한 시각(기본 17시)에 "내일" 오더를 미리 만들어 두므로 전날 저녁에 배차를 잡을 수 있다. 자동 생성분은 알림을 보내지 않는다.
//  - 마감 요약: 매일 정한 시각(기본 19시)에 그날 오더·배차완료·미배차·매출·수익과 내일 미배차를 관리자에게 푸시로 보낸다.
import React from "react";
import { db, auth } from "./firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { callFn, KP_CARD, KpCardHead, kstToday, addDays, won } from "./kpApi";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAYS = [1, 2, 3, 4, 5];
const chip = (on) => `h-9 min-w-[38px] px-2.5 rounded-xl text-[13px] font-black border transition ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#4B6CB7]"}`;
const daysLabel = (days = []) => {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return "매일";
  if (s.join() === WEEKDAYS.join()) return "평일(월~금)";
  return s.map((d) => DAYS[d]).join("·") || "요일 없음";
};
const nextRunDate = (days = []) => {
  for (let i = 1; i <= 7; i++) { const d = addDays(kstToday(), i); if (days.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) return d; }
  return null;
};

// ── 자동화 설정(회사별) ──
function useAutomationSettings(company) {
  const [cfg, setCfg] = React.useState({ recurringHour: 17, summaryEnabled: true, summaryHour: 19 });
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "automationSettings", company), (s) => s.exists() && setCfg((p) => ({ ...p, ...s.data() })), () => {});
  }, [company]);
  const save = (patch) => setDoc(doc(db, "automationSettings", company), { ...patch, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" }, { merge: true });
  return [cfg, save];
}
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const HourSelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(Number(e.target.value))}
    className="h-9 px-2.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#0F1A30] bg-white outline-none focus:border-[#4B6CB7]">
    {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:05</option>)}
  </select>
);

// ── 오더복사수정패널에서 여는 "정기 오더로 등록" 창 ──
export function RecurringRegisterModal({ order, onClose, onSaved }) {
  const company = order?.companyName || localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "돌캐";
  const defaultName = `${order?.거래처명 || ""} ${order?.상차지명 || ""}→${order?.하차지명 || ""}`.trim();
  const [name, setName] = React.useState(defaultName);
  const [days, setDays] = React.useState(WEEKDAYS);
  const [withDriver, setWithDriver] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const dropOffset = (() => {
    const a = Date.parse(order?.상차일 || ""); const b = Date.parse(order?.하차일 || "");
    return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
  })();
  const hasDriver = !!String(order?.차량번호 || "").trim();
  const toggle = (d) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const save = async () => {
    if (!days.length) { setErr("요일을 하나 이상 골라 주세요."); return; }
    setBusy(true); setErr("");
    try {
      // 오더 내용만 저장(이력·시스템 값·날짜 제외) — 날짜는 만들 때마다 새로 정한다
      const skip = new Set(["_id", "id", "__col", "history", "createdAt", "updatedAt", "_lastModified", "상차일", "하차일", "등록일", "배차상태", "상태",
        "배차확정일시", "배차확정자", "배차완료일시", "업체전달상태", "업체전달일시", "업체전달방법", "업체전달자", "_gsheetSync", "_gsheetMine", "_gsheetMineSent", "_gsheetMineSentAt",
        "attachCount", "attachViewed", "기사확인상태", "기사확인일시", "기사완료일시", "위치", "위치갱신일시", "위치공유중", "정기오더", "_recurring", "복구일시", "복구자", "블라인드"]);
      const snapshot = {};
      Object.entries(order || {}).forEach(([k, v]) => { if (!skip.has(k) && v !== undefined && typeof v !== "function") snapshot[k] = v; });
      await addDoc(collection(db, "recurringOrders"), {
        name: name.trim() || defaultName, days: [...days].sort(), active: true, withDriver: withDriver && hasDriver, dropOffset,
        order: JSON.parse(JSON.stringify(snapshot)), companyName: company,
        createdBy: auth.currentUser?.email || "", createdAt: serverTimestamp(),
      });
      onSaved?.();
      onClose();
    } catch (e) { setErr(e.message || "저장 실패"); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] bg-white rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 bg-gradient-to-r from-[#0F1A30] via-[#1B2B4B] to-[#2D4C82] text-white">
          <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">RECURRING</div>
          <div className="text-[18px] font-black">정기 오더로 등록</div>
          <div className="text-[12.5px] text-white/70 mt-0.5">고른 요일마다 이 오더가 자동으로 만들어집니다(전날 저녁에 미리)</div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="text-[12.5px] font-bold text-[#7A879C] mb-1.5">이름</div>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3EE] text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12.5px] font-bold text-[#7A879C]">요일</span>
              <span className="flex gap-1.5 text-[12px] font-bold">
                <button type="button" onClick={() => setDays(WEEKDAYS)} className="text-[#4B6CB7]">평일</button>
                <span className="text-[#C9D2E0]">|</span>
                <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="text-[#4B6CB7]">매일</button>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => <button key={d} type="button" onClick={() => toggle(i)} className={chip(days.includes(i))}>{d}</button>)}
            </div>
          </div>
          <label className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border ${hasDriver ? "border-[#E3E8F0] cursor-pointer" : "border-[#EEF1F6] opacity-50"}`}>
            <input type="checkbox" checked={withDriver && hasDriver} disabled={!hasDriver} onChange={(e) => setWithDriver(e.target.checked)} />
            <span className="text-[13.5px] font-bold text-[#0F1A30]">고정 기사도 같이{hasDriver ? ` (${order.차량번호} ${order.이름 || ""})` : " — 이 오더에 기사 정보가 없음"}</span>
          </label>
          <div className="text-[12.5px] text-[#5B6B85] leading-relaxed">
            {order?.거래처명} · {order?.상차지명} → {order?.하차지명}{dropOffset ? ` · 하차 ${dropOffset}일 뒤` : ""}<br />
            청구운임 {won(order?.청구운임)}{order?.기사운임 ? ` · 기사운임 ${won(order.기사운임)}` : ""}
          </div>
          {err && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {err}</div>}
        </div>
        <div className="px-6 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] text-[#0F1A30] text-[14.5px] font-black">취소</button>
          <button onClick={save} disabled={busy} className="flex-[1.4] h-12 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-50">
            {busy ? "저장 중…" : `등록 · ${daysLabel(days)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 관리자메뉴: 정기 오더 목록 ──
export function RecurringOrdersPanel({ company }) {
  const [list, setList] = React.useState(null);
  const [cfg, saveCfg] = useAutomationSettings(company);
  const [runDate, setRunDate] = React.useState(() => addDays(kstToday(), 1));
  const [busy, setBusy] = React.useState("");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "recurringOrders"), where("companyName", "==", company)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)))), () => setList([]));
  }, [company]);
  const patch = (id, p) => updateDoc(doc(db, "recurringOrders", id), p).catch((e) => setMsg(`⚠ ${e.message}`));
  const run = async () => {
    if (!window.confirm(`${runDate} 날짜로 켜진 정기 오더 중 그 요일에 해당하는 것을 지금 만들까요?\n(이미 그 날짜로 만든 정기 오더는 다시 만들지 않습니다)`)) return;
    setBusy("run"); setMsg("");
    try {
      const d = await callFn("automation", { action: "recurringRun", date: runDate, company });
      setMsg(d.created ? `${d.created}건 만들었습니다 — ${d.names.join(", ")}` : "새로 만들 정기 오더가 없습니다(요일이 아니거나 이미 만듦)");
    } catch (e) { setMsg(`⚠ ${e.message}`); } finally { setBusy(""); }
  };

  return (
    <div className={KP_CARD}>
      <KpCardHead eyebrow="RECURRING" title="정기 오더"
        desc={<>매주 같은 노선은 한 번만 등록해 두면 요일마다 자동으로 만들어집니다. 등록은 <b className="text-[#0F1A30]">오더복사수정패널의 [정기 오더로]</b> 버튼에서 합니다.</>} />
      <div className="px-5 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7]">
          <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#0F1A30]">
            매일 <HourSelect value={cfg.recurringHour} onChange={(h) => saveCfg({ recurringHour: h })} /> 에 <b>내일 오더</b> 자동 생성
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)}
              className="h-9 px-2.5 rounded-xl border border-[#DCE3EE] text-[13.5px] font-bold text-[#0F1A30] bg-white outline-none focus:border-[#4B6CB7]" />
            <button onClick={run} disabled={!!busy} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-50">
              {busy === "run" ? "만드는 중…" : "지금 만들기"}
            </button>
          </div>
        </div>
        {msg && <div className="text-[13px] font-bold text-[#0F1A30]">{msg}</div>}

        {list === null ? (
          <div className="py-8 text-center text-[13.5px] text-[#9AA9C3]">불러오는 중…</div>
        ) : list.length === 0 ? (
          <div className="px-5 py-10 rounded-2xl border border-dashed border-[#DCE3EE] text-center text-[13.5px] text-[#9AA9C3] leading-relaxed">
            등록된 정기 오더가 없습니다<br />실시간배차현황에서 오더를 더블클릭 → 오더복사수정패널 위쪽 <b className="text-[#5B6B85]">[정기 오더로]</b>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map((t) => {
              const o = t.order || {};
              const next = t.active ? nextRunDate(t.days) : null;
              return (
                <div key={t.id} className={`rounded-2xl border px-4 py-3.5 ${t.active ? "border-[#E3E8F0] bg-white" : "border-[#EEF1F6] bg-[#FAFBFD]"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-[15px] font-black truncate ${t.active ? "text-[#0F1A30]" : "text-[#9AA9C3]"}`}>{t.name}</div>
                      <div className="text-[12.5px] text-[#5B6B85] mt-0.5 truncate">
                        {o.거래처명} · {o.상차지명} → {o.하차지명} · {o.상차시간 || "시간 미정"} · {won(o.청구운임)}
                        {t.withDriver && o.차량번호 ? ` · 고정기사 ${o.차량번호}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[12px] font-bold text-[#7A879C]">{t.active ? (next ? `다음 ${next.slice(5).replace("-", "/")}(${DAYS[new Date(`${next}T00:00:00Z`).getUTCDay()]})` : "") : "멈춤"}</span>
                      <button onClick={() => patch(t.id, { active: !t.active })}
                        className={`h-8 px-3 rounded-lg text-[12.5px] font-black border ${t.active ? "border-[#E3E8F0] text-[#0F1A30]" : "bg-[#0F1A30] text-white border-[#0F1A30]"}`}>
                        {t.active ? "멈추기" : "다시 켜기"}
                      </button>
                      <button onClick={() => { if (window.confirm(`"${t.name}" 정기 오더를 지울까요?\n(이미 만들어진 오더는 그대로 남습니다)`)) deleteDoc(doc(db, "recurringOrders", t.id)); }}
                        className="h-8 px-3 rounded-lg text-[12.5px] font-black border border-[#E3E8F0] text-[#7A879C]">삭제</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {DAYS.map((d, i) => (
                      <button key={d} onClick={() => {
                        const days = (t.days || []).includes(i) ? t.days.filter((x) => x !== i) : [...(t.days || []), i];
                        if (days.length) patch(t.id, { days: days.sort() });
                      }} className={`${chip((t.days || []).includes(i))} h-8 min-w-[34px] text-[12.5px]`}>{d}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 관리자메뉴: 마감 요약 ──
export function DailySummaryPanel({ company }) {
  const [cfg, saveCfg] = useAutomationSettings(company);
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(async () => {
    if (!company) return;
    const dates = Array.from({ length: 14 }, (_, i) => addDays(kstToday(), -i));
    const snaps = await Promise.all(dates.map((d) => getDoc(doc(db, "dailySummaries", `${company}_${d}`)).catch(() => null)));
    setRows(snaps.filter((s) => s?.exists()).map((s) => s.data()));
  }, [company]);
  React.useEffect(() => { load(); }, [load]);
  const now = async () => {
    setBusy(true); setErr("");
    try { await callFn("automation", { action: "summaryNow", date: kstToday(), company }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const today = rows?.find((r) => r.date === kstToday());

  return (
    <div className={KP_CARD}>
      <KpCardHead eyebrow="DAILY CLOSE" title="마감 요약"
        desc="매일 정한 시각에 오늘 오더·배차완료·미배차·매출·수익과 내일 미배차 건수를 관리자 폰으로 알려줍니다." />
      <div className="px-5 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7]">
          <label className="inline-flex items-center gap-2 text-[13.5px] font-bold text-[#0F1A30]">
            <input type="checkbox" checked={!!cfg.summaryEnabled} onChange={(e) => saveCfg({ summaryEnabled: e.target.checked })} />
            알림 받기
          </label>
          <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#0F1A30]">
            매일 <HourSelect value={cfg.summaryHour} onChange={(h) => saveCfg({ summaryHour: h })} /> 에 보내기
          </div>
          <button onClick={now} disabled={busy} className="ml-auto h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-50">
            {busy ? "계산 중…" : "오늘 지금 계산"}
          </button>
        </div>
        {err && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {err}</div>}

        {today && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[["오늘 오더", `${today.count}건`, `완료 ${today.done} · 미배차 ${today.pending}`], ["매출", won(today.revenue), ""], ["수익", won(today.profit), today.revenue ? `매익률 ${Math.round((today.profit / today.revenue) * 1000) / 10}%` : ""], ["내일 미배차", `${today.tomorrowPending}건`, `내일 오더 ${today.tomorrowCount}건`]].map(([k, v, sub], i) => (
              <div key={k} className={`rounded-2xl px-4 py-3.5 ${i === 0 ? "bg-gradient-to-br from-[#0F1A30] to-[#2D4C82] text-white" : "bg-white border border-[#E3E8F0]"}`}>
                <div className={`text-[12px] font-bold ${i === 0 ? "text-white/60" : "text-[#7A879C]"}`}>{k}</div>
                <div className={`text-[20px] font-black tabular-nums ${i === 0 ? "" : "text-[#0F1A30]"}`}>{v}</div>
                {sub && <div className={`text-[12px] mt-0.5 ${i === 0 ? "text-white/70" : "text-[#5B6B85]"}`}>{sub}</div>}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
          <div className="grid grid-cols-[90px_repeat(5,minmax(0,1fr))] gap-2 px-4 py-2.5 bg-[#F5F8FD] text-[12px] font-bold text-[#7A879C]">
            <span>날짜</span><span className="text-right">오더</span><span className="text-right">미배차</span><span className="text-right">매출</span><span className="text-right">수익</span><span className="text-right">내일 미배차</span>
          </div>
          {rows === null ? (
            <div className="py-8 text-center text-[13.5px] text-[#9AA9C3]">불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-[13.5px] text-[#9AA9C3]">아직 요약이 없습니다 — [오늘 지금 계산]을 눌러 보세요</div>
          ) : rows.map((r) => (
            <div key={r.date} className="grid grid-cols-[90px_repeat(5,minmax(0,1fr))] gap-2 px-4 py-2.5 border-t border-[#EEF1F6] text-[13px] tabular-nums">
              <span className="font-extrabold text-[#0F1A30]">{r.date.slice(5).replace("-", "/")}({DAYS[new Date(`${r.date}T00:00:00Z`).getUTCDay()]})</span>
              <span className="text-right font-bold text-[#0F1A30]">{r.count}</span>
              <span className="text-right text-[#3A4A66]">{r.pending}</span>
              <span className="text-right text-[#3A4A66]">{won(r.revenue)}</span>
              <span className="text-right font-bold text-[#0F1A30]">{won(r.profit)}</span>
              <span className="text-right text-[#3A4A66]">{r.tomorrowPending}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
