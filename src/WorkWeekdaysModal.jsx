// ======================= src/WorkWeekdaysModal.jsx =======================
// 🗓 2026-11-23 근무 요일 설정 팝업(출근기록부 › [근무 요일]) — 사용자 요청: 펼침 패널 말고 팝업, 안에서 [회사 전체 | 개별 설정]
//  · 회사 전체: 요일 선택 · 빠른 선택(주 5일 · 주 6일 · 주말 · 매일) · 이번 달 근무일 미리보기 · 적용 대상 인원
//    · 스마트: 이번 달 회사 기준 쉬는 날에 출근한 직원이 있으면 알려 주고 [개별 설정으로 보기]
//  · 개별 설정: 직원 검색 드롭다운(이름 · 부서 · 직책, ↑↓ Enter) → [회사 기준 | 개별 설정] → 요일
//    · 스마트: 최근 8주 출근 기록으로 근무 요일 추천([추천대로 적용])
//  · 저장: companySettings/{회사}.workWeekdays · users/{uid}.workWeekdays(null = 회사 기준) — 본인 것은 보안 규칙상 다른 인사 담당자가
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  DEFAULT_WORK_WEEKDAYS, WEEKDAY_NAMES, WEEKDAY_ORDER, normWeekdays, weekdaysText, monthWorkDays,
  suggestWeekdays, offDayWorkersByWeekday,
} from "./attendanceUtils";
import { saveCompanyWorkWeekdays, saveEmployeeWorkWeekdays } from "./workWeekdays";
import { kpConfirm } from "./kpDialog";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const PRESETS = [
  ["주 5일", "월~금", [1, 2, 3, 4, 5]],
  ["주 6일", "월~토", [1, 2, 3, 4, 5, 6]],
  ["주말", "토 · 일", [0, 6]],
  ["매일", "월~일", [0, 1, 2, 3, 4, 5, 6]],
];
const same = (a, b) => JSON.stringify(normWeekdays(a)) === JSON.stringify(normWeekdays(b));
const kstYmd = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

// 요일 고르기 — 둥근 버튼 7개 + 빠른 선택 + 요약
function WeekdayPicker({ value, onChange, holidays, ym, disabled }) {
  const w = normWeekdays(value) || [];
  const toggle = (d) => !disabled && onChange(w.includes(d) ? w.filter((x) => x !== d) : [...w, d]);
  const n = w.length;
  const monthDays = n ? monthWorkDays(ym, w, holidays) : 0;
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_ORDER.map((d) => {
          const on = w.includes(d);
          return (
            <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={on}
              className={`h-12 rounded-2xl text-[15px] font-black transition-all border ${on
                ? "bg-gradient-to-b from-[#24395F] to-[#14213A] text-white border-[#14213A] shadow-[0_6px_14px_-6px_rgba(20,33,58,0.6)]"
                : `bg-white border-[#DCE3EE] hover:border-[#9FB2D3] ${d === 0 ? "text-[#D23F3F]" : d === 6 ? "text-[#2D5BD8]" : "text-[#5B6B85]"}`}`}>
              {WEEKDAY_NAMES[d]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {PRESETS.map(([label, sub, v]) => {
          const on = same(w, v);
          return (
            <button key={label} type="button" onClick={() => onChange(v)}
              className={`h-8 px-3 rounded-full text-[12.5px] font-bold border transition ${on ? "bg-[#EEF3FC] border-[#9FB2D3] text-[#1B2B4B]" : "bg-white border-[#E3E8F0] text-[#5B6B85] hover:border-[#9FB2D3]"}`}>
              {label} <span className="font-semibold text-[#8A97AD]">{sub}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12.5px]">
        {n ? (
          <>
            <span className="px-2 py-0.5 rounded-md bg-[#0F1A30] text-white font-black">주 {n}일</span>
            <span className="font-bold text-[#1B2B4B]">{weekdaysText(w)}</span>
            <span className="text-[#8A97AD]">· 이번 달 근무일 <b className="text-[#1B2B4B]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{monthDays}</b>일(공휴일 빼고)</span>
          </>
        ) : <span className="font-bold text-[#C0352F]">근무 요일을 하루 이상 골라 주세요</span>}
      </div>
    </div>
  );
}

// 직원 검색 드롭다운(입력 + 목록 · ↑↓ Enter Esc)
function StaffCombo({ employees, value, onChange, coWeekdays }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const sel = employees.find((e) => e.uid === value);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return employees.filter((e) => !k || `${e.name || ""} ${e.email || ""} ${e.team || ""} ${e.position || ""}`.toLowerCase().includes(k));
  }, [employees, q]);
  useEffect(() => {
    const close = (ev) => { if (boxRef.current && !boxRef.current.contains(ev.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const pick = (e) => { onChange(e.uid); setQ(""); setOpen(false); };
  return (
    <div ref={boxRef} className="relative">
      <div className={`flex items-center gap-2 h-12 px-3.5 rounded-2xl border bg-white transition ${open ? "border-[#2D4C82] ring-4 ring-[#2D4C82]/10" : "border-[#DCE3EE]"}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A97AD" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={open ? q : (sel ? `${sel.name || sel.email}` : q)} placeholder="직원 이름 · 부서 · 직책 검색"
          onFocus={() => { setOpen(true); setQ(""); setHi(0); }}
          onChange={(ev) => { setQ(ev.target.value); setOpen(true); setHi(0); }}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowDown") { ev.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
            else if (ev.key === "ArrowUp") { ev.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (ev.key === "Enter" && open && list[hi]) { ev.preventDefault(); pick(list[hi]); }
            else if (ev.key === "Escape" && open) { ev.stopPropagation(); setOpen(false); }
          }}
          className="flex-1 min-w-0 bg-transparent !border-0 !shadow-none text-[14.5px] font-bold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-medium focus:outline-none" />
        {sel && !open && <span className="text-[12px] font-semibold text-[#8A97AD] truncate max-w-[140px]">{[sel.team, sel.position].filter(Boolean).join(" · ")}</span>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A97AD" strokeWidth="2.4" strokeLinecap="round" className={`transition ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-[#E3E8F0] bg-white shadow-[0_18px_40px_-12px_rgba(15,26,48,0.35)] py-1.5">
          {list.length === 0 && <div className="px-4 py-3 text-[13px] text-[#8A97AD]">검색 결과가 없어요.</div>}
          {list.map((e, i) => {
            const own = normWeekdays(e.workWeekdays);
            return (
              <button key={e.uid} type="button" onMouseEnter={() => setHi(i)} onMouseDown={(ev) => { ev.preventDefault(); pick(e); }}
                className={`w-full text-left flex items-center gap-3 px-3.5 py-2.5 ${i === hi ? "bg-[#F2F6FC]" : ""} ${e.uid === value ? "font-black" : ""}`}>
                <span className="w-8 h-8 rounded-full bg-[#EEF3FC] text-[#1B2B4B] text-[13px] font-black flex items-center justify-center shrink-0">{String(e.name || e.email || "?").slice(0, 1)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-[#0F1A30] truncate">{e.name || e.email}</span>
                  <span className="block text-[11.5px] text-[#8A97AD] truncate">{[e.team, e.position].filter(Boolean).join(" · ") || "부서 미지정"}</span>
                </span>
                <span className={`text-[11.5px] font-black px-2 py-0.5 rounded-md shrink-0 ${own ? "bg-[#F4F0FC] text-[#5B3FA8]" : "bg-[#F5F7FB] text-[#8A97AD]"}`}>{own ? `개별 · ${weekdaysText(own)}` : `회사 기준 · ${weekdaysText(coWeekdays)}`}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WorkWeekdaysModal({ company, employees = [], coWeekdays = DEFAULT_WORK_WEEKDAYS, holidays = [], records = [], myUid = "", initialTab = "company", initialUid = "", onClose }) {
  const [tab, setTab] = useState(initialTab);
  const ym = kstYmd().slice(0, 7);
  // 회사 전체
  const [coInput, setCoInput] = useState(coWeekdays);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const following = employees.filter((e) => !normWeekdays(e.workWeekdays));
  const custom = employees.filter((e) => normWeekdays(e.workWeekdays));
  const offWorkers = useMemo(() => offDayWorkersByWeekday(records, employees, coWeekdays, holidays), [records, employees, coWeekdays, holidays]);
  // 개별 설정
  const [uid, setUid] = useState(initialUid || "");
  const emp = employees.find((e) => e.uid === uid) || null;
  const [mode, setMode] = useState("company");
  const [empInput, setEmpInput] = useState(coWeekdays);
  const [hist, setHist] = useState(null); // 최근 8주 출근 기록
  useEffect(() => {
    if (!emp) return;
    const own = normWeekdays(emp.workWeekdays);
    setMode(own ? "custom" : "company"); setEmpInput(own || coWeekdays); setDone("");
    setHist(null);
    let alive = true;
    getDocs(query(collection(db, "attendance"), where("companyName", "==", company), where("uid", "==", emp.uid)))
      .then((s) => { if (alive) setHist(s.docs.map((d) => d.data())); })
      .catch(() => { if (alive) setHist([]); });
    return () => { alive = false; };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggestion = useMemo(() => (hist ? suggestWeekdays(hist, { from: kstYmd(-56), to: kstYmd(-1), holidays }) : null), [hist, holidays]);
  const empCurrent = emp ? (normWeekdays(emp.workWeekdays) || null) : null;
  const empNext = mode === "custom" ? normWeekdays(empInput) : null;
  const empDirty = emp && JSON.stringify(empCurrent) !== JSON.stringify(empNext);
  const isMe = emp && emp.uid === myUid;

  const saveCompany = async () => {
    const w = normWeekdays(coInput); if (!w) return;
    setBusy(true);
    try { await saveCompanyWorkWeekdays(company, w); setDone(`회사 근무 요일을 ${weekdaysText(w)}로 저장했어요 · ${following.length}명에게 적용`); }
    catch (e) { setDone(`저장하지 못했어요: ${e?.message || e}`); }
    setBusy(false);
  };
  const saveEmp = async () => {
    if (!emp || !empDirty) return;
    if (mode === "custom" && !empNext) return;
    setBusy(true);
    try { await saveEmployeeWorkWeekdays(emp.uid, empNext); setDone(`${emp.name || emp.email}님 근무 요일을 ${empNext ? `개별 설정 · ${weekdaysText(empNext)}` : `회사 기준 · ${weekdaysText(coWeekdays)}`}로 저장했어요`); }
    catch (e) { setDone(isMe ? "내 근무 요일은 다른 인사 담당자가 바꿔야 해요." : `저장하지 못했어요: ${e?.message || e}`); }
    setBusy(false);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const goEmp = (u) => { setTab("person"); setUid(u); };
  // 개별 설정 해제 → 회사 기준으로 되돌리기
  const resetToCompany = async (e) => {
    if (e.uid === myUid) { setDone("내 근무 요일은 다른 인사 담당자가 바꿔야 해요."); return; }
    if (!(await kpConfirm(`${e.name || e.email}님의 개별 설정(${weekdaysText(e.workWeekdays)})을 해제하고 회사 기준(${weekdaysText(coWeekdays)})으로 되돌릴까요?`, { title: "개별 설정 해제", okText: "해제" }))) return;
    setBusy(true);
    try { await saveEmployeeWorkWeekdays(e.uid, null); setDone(`${e.name || e.email}님을 회사 기준(${weekdaysText(coWeekdays)})으로 되돌렸어요`); }
    catch (err) { setDone(`해제하지 못했어요: ${err?.message || err}`); }
    setBusy(false);
  };
  const offDays = Object.keys(offWorkers).map(Number).sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
  const nameOf = (u) => { const e = employees.find((x) => x.uid === u); return e ? (e.name || e.email) : ""; };

  return (
    <div className="fixed inset-0 z-[99999] bg-[#0F1A30]/50 backdrop-blur-[2px] flex items-center justify-center p-4" data-kp="work-weekdays-modal">{/* 바깥을 눌러도 닫히지 않음 */}
      <div className="w-full max-w-[560px] max-h-[92vh] bg-white rounded-[24px] shadow-[0_30px_80px_-20px_rgba(15,26,48,0.55)] overflow-hidden flex flex-col">
        {/* 머리 */}
        <div className="relative px-6 pt-5 pb-4 text-white" style={{ background: "linear-gradient(120deg, #0F1A30 0%, #1B2B4B 55%, #2D4C82 100%)" }}>
          <span className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "14px 14px" }} />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>WORK SCHEDULE</div>
              <div className="text-[19px] font-black mt-0.5">근무 요일 설정</div>
              <div className="text-[12.5px] text-white/70 mt-0.5">회사 기준 <b className="text-white">{weekdaysText(coWeekdays)}</b> · 회사 기준 {following.length}명 · 개별 설정 {custom.length}명</div>
            </div>
            <button onClick={onClose} aria-label="닫기" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-[18px] leading-none">×</button>
          </div>
          <div className="relative mt-4 flex p-1 rounded-2xl bg-white/10 gap-1">
            {[["company", "회사 전체"], ["person", "개별 설정"]].map(([k, l]) => (
              <button key={k} onClick={() => { setTab(k); setDone(""); }}
                className={`flex-1 h-10 rounded-xl text-[13.5px] font-black transition ${tab === k ? "bg-white text-[#0F1A30] shadow" : "text-white/80 hover:text-white"}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* 몸통 */}
        <div className="px-6 py-5 overflow-y-auto">
          {tab === "company" ? (
            <div className="space-y-4">
              <div>
                <div className="text-[13px] font-black text-[#0F1A30] mb-0.5">회사 기준 근무 요일</div>
                <div className="text-[12px] text-[#8A97AD] mb-3">개별 설정이 없는 직원 {following.length}명에게 적용돼요. 근무 요일이 아닌 날은 휴무로 보이고 미출근으로 세지 않아요.</div>
                <WeekdayPicker value={coInput} onChange={setCoInput} holidays={holidays} ym={ym} />
              </div>
              {offDays.length > 0 && (
                <div className="rounded-2xl border border-[#E2D8F6] bg-[#F8F5FE] px-4 py-3">
                  <div className="text-[12.5px] font-black text-[#5B3FA8] flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-[#7C5CC4] text-white text-[11px] flex items-center justify-center">i</span>이번 달 쉬는 날 출근 현황</div>
                  {offDays.map((d) => (
                    <div key={d} className="mt-1.5 text-[12.5px] text-[#3A2A6E]">
                      <b>{WEEKDAY_NAMES[d]}요일</b>에 출근한 직원 {offWorkers[d].length}명 — {offWorkers[d].slice(0, 4).map(nameOf).join(", ")}{offWorkers[d].length > 4 ? " 외" : ""}
                      {offWorkers[d].length >= Math.max(2, Math.ceil(following.length / 2))
                        ? <button onClick={() => setCoInput((v) => [...(normWeekdays(v) || []), d])} className="ml-2 font-black underline underline-offset-2">회사 기준에 {WEEKDAY_NAMES[d]}요일 넣기</button>
                        : <button onClick={() => goEmp(offWorkers[d][0])} className="ml-2 font-black underline underline-offset-2">개별 설정으로 보기</button>}
                    </div>
                  ))}
                </div>
              )}
              {custom.length > 0 && (
                <div>
                  <div className="flex items-end justify-between mb-1.5">
                    <div className="text-[12.5px] font-black text-[#3A4A66]">개별 설정된 직원 {custom.length}명</div>
                    <div className="text-[11.5px] text-[#8A97AD]">이름을 누르면 수정 · × 를 누르면 회사 기준으로</div>
                  </div>
                  <div className="rounded-2xl border border-[#EEE8FA] divide-y divide-[#F1ECFB] overflow-hidden">
                    {custom.map((e) => (
                      <div key={e.uid} className="flex items-center gap-3 px-3.5 py-2.5 bg-white hover:bg-[#FBF9FF]">
                        <button onClick={() => goEmp(e.uid)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
                          <span className="w-7 h-7 rounded-full bg-[#F4F0FC] text-[#5B3FA8] text-[12px] font-black flex items-center justify-center shrink-0">{String(e.name || e.email || "?").slice(0, 1)}</span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-bold text-[#0F1A30] truncate">{e.name || e.email}</span>
                            <span className="block text-[11px] text-[#8A97AD] truncate">{[e.team, e.position].filter(Boolean).join(" · ") || "부서 미지정"}</span>
                          </span>
                        </button>
                        <span className="text-[12px] font-black px-2 py-0.5 rounded-md bg-[#F4F0FC] text-[#5B3FA8] shrink-0">개별 · {weekdaysText(e.workWeekdays)}</span>
                        <button onClick={() => resetToCompany(e)} disabled={busy} title="개별 설정 해제(회사 기준으로)" aria-label={`${e.name || e.email} 개별 설정 해제`}
                          className="w-8 h-8 rounded-lg border border-[#E3E8F0] text-[#8A97AD] hover:text-[#C0352F] hover:border-[#F6D2D2] hover:bg-[#FFF5F5] text-[16px] leading-none shrink-0 disabled:opacity-40">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[13px] font-black text-[#0F1A30] mb-2">직원 선택</div>
                <StaffCombo employees={employees} value={uid} onChange={setUid} coWeekdays={coWeekdays} />
              </div>
              {!emp ? (
                <div className="rounded-2xl border border-dashed border-[#DCE3EE] px-4 py-6 text-center text-[13px] text-[#8A97AD]">직원을 고르면 지금 근무 요일과 최근 출근 기록으로 본 추천이 나와요.</div>
              ) : (
                <>
                  <div className="flex items-center gap-3 rounded-2xl bg-[#F5F7FB] px-4 py-3">
                    <span className="w-10 h-10 rounded-full bg-[#1B2B4B] text-white text-[15px] font-black flex items-center justify-center">{String(emp.name || emp.email || "?").slice(0, 1)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-black text-[#0F1A30]">{emp.name || emp.email}</div>
                      <div className="text-[12px] text-[#8A97AD]">{[emp.team, emp.position].filter(Boolean).join(" · ") || "부서 미지정"} · {emp.workStartTime || "09:00"}~{emp.workEndTime || "18:00"}</div>
                    </div>
                    <span className={`text-[12px] font-black px-2.5 py-1 rounded-lg ${empCurrent ? "bg-[#F4F0FC] text-[#5B3FA8]" : "bg-white text-[#5B6B85] border border-[#E3E8F0]"}`}>지금 {empCurrent ? `개별 · ${weekdaysText(empCurrent)}` : `회사 기준 · ${weekdaysText(coWeekdays)}`}</span>
                  </div>
                  <div className="flex p-1 rounded-2xl bg-[#EEF2F8] gap-1">
                    {[["company", "회사 기준 적용", weekdaysText(coWeekdays)], ["custom", "개별 설정", "이 직원만 다른 요일"]].map(([k, l, s]) => (
                      <button key={k} onClick={() => { setMode(k); if (k === "custom" && !normWeekdays(empInput)) setEmpInput(coWeekdays); }}
                        className={`flex-1 py-2 rounded-xl transition ${mode === k ? "bg-white shadow-[0_2px_8px_rgba(15,26,48,0.12)]" : "hover:bg-white/50"}`}>
                        <div className={`text-[13px] font-black ${mode === k ? "text-[#0F1A30]" : "text-[#5B6B85]"}`}>{l}</div>
                        <div className="text-[11px] text-[#8A97AD]">{s}</div>
                      </button>
                    ))}
                  </div>
                  {mode === "custom" && <WeekdayPicker value={empInput} onChange={setEmpInput} holidays={holidays} ym={ym} />}
                  {/* 🧠 최근 8주 출근 기록으로 추천 */}
                  <div className="rounded-2xl border border-[#D5E0F3] bg-[#F4F8FF] px-4 py-3">
                    <div className="text-[12.5px] font-black text-[#1B2B4B]">최근 8주 출근 패턴</div>
                    {hist === null ? <div className="text-[12.5px] text-[#8A97AD] mt-1">출근 기록을 보는 중…</div>
                      : !suggestion ? <div className="text-[12.5px] text-[#8A97AD] mt-1">출근 기록이 적어 추천하기 어려워요.</div>
                        : (
                          <>
                            <div className="grid grid-cols-7 gap-1 mt-2">
                              {WEEKDAY_ORDER.map((d) => {
                                const r = Math.round((suggestion.rate[d] || 0) * 100);
                                return (
                                  <div key={d} className="text-center">
                                    <div className="h-10 rounded-lg bg-white border border-[#E3E8F0] flex items-end overflow-hidden"><div className={`w-full ${r >= 50 ? "bg-[#2D4C82]" : "bg-[#C9D4E6]"}`} style={{ height: `${Math.max(4, r)}%` }} /></div>
                                    <div className="text-[11px] font-bold text-[#5B6B85] mt-0.5">{WEEKDAY_NAMES[d]}</div>
                                    <div className="text-[10.5px] text-[#8A97AD]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r}%</div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="mt-2 text-[12.5px] text-[#1B2B4B] flex items-center gap-2 flex-wrap">
                              <span>주로 <b>{weekdaysText(suggestion.weekdays)}</b>에 출근했어요(출근 {suggestion.workedDays}일).</span>
                              {same(suggestion.weekdays, mode === "custom" ? empInput : coWeekdays)
                                ? <span className="text-[#18794E] font-black">지금 설정과 같아요 ✓</span>
                                : same(suggestion.weekdays, coWeekdays)
                                  ? <button onClick={() => setMode("company")} className="h-7 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black">회사 기준으로 두기</button>
                                  : <button onClick={() => { setMode("custom"); setEmpInput(suggestion.weekdays); }} className="h-7 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-black">추천대로 개별 설정</button>}
                            </div>
                          </>
                        )}
                  </div>
                  {isMe && <div className="text-[12px] font-bold text-[#B54708]">내 근무 요일은 보안상 다른 인사 담당자가 바꿔야 해요.</div>}
                </>
              )}
            </div>
          )}
        </div>

        {/* 아래 */}
        <div className="px-6 py-4 border-t border-[#EEF1F6] flex items-center gap-2">
          <div className={`flex-1 text-[12.5px] font-bold ${/못|않/.test(done) ? "text-[#C0352F]" : "text-[#18794E]"}`}>{done}</div>
          <button onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] text-[#5B6B85] text-[14px] font-bold hover:bg-[#F5F7FB]">닫기</button>
          {tab === "company"
            ? <button onClick={saveCompany} disabled={busy || !normWeekdays(coInput) || same(coInput, coWeekdays)} className="h-11 px-6 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black disabled:opacity-40">{busy ? "저장 중…" : "회사 기준 저장"}</button>
            : <button onClick={saveEmp} disabled={busy || !empDirty || isMe || (mode === "custom" && !empNext)} className="h-11 px-6 rounded-xl bg-[#1B2B4B] text-white text-[14px] font-black disabled:opacity-40">{busy ? "저장 중…" : "개별 설정 저장"}</button>}
        </div>
      </div>
    </div>
  );
}
