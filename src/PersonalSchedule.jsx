// ======================= src/PersonalSchedule.jsx =======================
// 🗓 2026-11-03 개인 일정(나만 보는 스케줄러) — 직원 일정·임원 일정 화면에서 [개인일정] 스위치를 켜면 이 달력으로 바뀐다.
//  · 스위치 상태는 계정별로 기억(userPrefs/{uid}.personalScheduleMode + 이 기기 localStorage) — 다른 메뉴 다녀와도, 다른 기기에서도 그대로
//  · personalSchedules/{id}: { uid, companyName, title, date, endDate, allDay, start, end, place, memo, color,
//      remind("none"|"morning"|"10m"|"30m"|"1h"|"1d"|"2d"|"7d"), push(bool), remindAt(ms), pushPending(bool), createdAt, updatedAt }
//  · 알림: push를 체크하면 remindAt에 서버(sendPersonalScheduleReminders, 5분마다)가 휴대폰 푸시
//          당일에는 PC 접속 시 오른쪽 아래 배너 · 모바일은 위쪽 알림줄(잠깐 떴다 사라짐) — PersonalTodayHost
//  · 생일: 직원 일정·임원 일정 달력에 "○○○ 생일" 표시(birthdaysOn)
import React from "react";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect";
import { TimeSelect } from "./kpInputs";
import { getNationalHolidayLabel } from "./attendanceUtils";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const kstMs = (ymd, hm) => Date.parse(`${ymd}T${hm || "00:00"}:00+09:00`) || 0;
const hmLabel = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`; };

// ── 생일(직원 일정·임원 일정 달력 공용) ─────────────────────────────
//  birthDate "YYYY-MM-DD"의 월-일이 같은 날 · 2/29생은 윤년이 아니면 2/28
export function birthdaysOn(staff, ymd) {
  const md = ymd.slice(5);
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return (staff || []).filter((u) => {
    const b = String(u.birthDate || "").slice(5, 10);
    if (!/^\d{2}-\d{2}$/.test(b)) return false;
    if (b === "02-29" && !leap(+ymd.slice(0, 4))) return md === "02-28";
    return b === md;
  });
}

// ── 개인일정 스위치(계정별 기억) ──────────────────────────────────────
const LS_KEY = (uid) => `kpPersonalSched:${uid}`;
export function usePersonalMode() {
  const uid = auth.currentUser?.uid || "";
  const [on, setOn] = React.useState(() => { try { return localStorage.getItem(LS_KEY(uid)) === "1"; } catch { return false; } });
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, "userPrefs", uid), (s) => {
      const v = s.data()?.personalScheduleMode;
      if (typeof v === "boolean") { setOn(v); try { localStorage.setItem(LS_KEY(uid), v ? "1" : "0"); } catch { /* 무시 */ } }
    }, () => {});
  }, [uid]);
  const set = (v) => {
    setOn(v);
    try { localStorage.setItem(LS_KEY(uid), v ? "1" : "0"); } catch { /* 무시 */ }
    if (uid) setDoc(doc(db, "userPrefs", uid), { personalScheduleMode: v }, { merge: true }).catch(() => {});
  };
  return [on, set];
}
// 메뉴에서 바로 개인 일정으로 들어갈 때(모바일 사내 업무 › 개인 일정) — 스위치를 켜 두고 직원 일정 화면으로 이동
export function turnOnPersonalMode() {
  const uid = auth.currentUser?.uid || "";
  try { localStorage.setItem(LS_KEY(uid), "1"); } catch { /* 무시 */ }
  if (uid) setDoc(doc(db, "userPrefs", uid), { personalScheduleMode: true }, { merge: true }).catch(() => {});
}
// 켜기/끄기 스위치 — dark: 어두운 머리말 위(직원 일정·임원 일정 모두 어두운 머리말)
export function PersonalModeSwitch({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} title={on ? "회사 일정으로 돌아가기" : "나만 보는 개인 일정으로 바꾸기"}
      className={`h-9 pl-3 pr-1.5 rounded-xl inline-flex items-center gap-2 text-[13px] font-black whitespace-nowrap border transition ${on ? "bg-white text-[#0F1A30] border-white" : "bg-white/10 text-white border-white/20 hover:bg-white/15"}`}>
      개인일정
      <span className={`relative w-10 h-6 rounded-full transition ${on ? "bg-[#1B2B4B]" : "bg-white/25"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="w-7 text-left text-[11px] tracking-wider" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{on ? "ON" : "OFF"}</span>
    </button>
  );
}

// ── 개인 일정 데이터 ──────────────────────────────────────────────────
export const REMIND_OPTS = [
  ["none", "알림 없음"], ["morning", "당일 오전 8:30"], ["10m", "10분 전"], ["30m", "30분 전"], ["1h", "1시간 전"],
  ["1d", "하루 전 오전 9:00"], ["2d", "이틀 전 오전 9:00"], ["7d", "일주일 전 오전 9:00"],
];
const TIMED_ONLY = new Set(["10m", "30m", "1h"]);
// 알림 시각(ms) — 종일 일정은 "N분 전" 대신 그날 오전 9시 기준
export function remindAtOf(e) {
  const r = e.remind || "none";
  if (r === "none" || !e.date) return 0;
  if (r === "morning") return kstMs(e.date, "08:30");
  if (r === "1d" || r === "2d" || r === "7d") return kstMs(addDay(e.date, -{ "1d": 1, "2d": 2, "7d": 7 }[r]), "09:00");
  const base = e.allDay || !e.start ? kstMs(e.date, "09:00") : kstMs(e.date, e.start);
  return base - { "10m": 10, "30m": 30, "1h": 60 }[r] * 60000;
}
const COLORS = [["#1B2B4B", "남색"], ["#4B6CB7", "파랑"], ["#067647", "초록"], ["#B54708", "주황"], ["#D92D20", "빨강"], ["#6941C6", "보라"]];
function usePersonalSchedules(uid) {
  const [list, setList] = React.useState([]);
  React.useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "personalSchedules"), where("uid", "==", uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [uid]);
  return list;
}
const daysOf = (e) => { const out = []; for (let x = e.date, i = 0; x && x <= (e.endDate || e.date) && i < 62; x = addDay(x, 1), i += 1) out.push(x); return out; };
const sortKey = (e) => `${e.allDay || !e.start ? "0" : "1"}${e.start || ""}`;

// ── 개인 일정 달력 ────────────────────────────────────────────────────
export function PersonalSchedule({ company, modeSwitch, staff = [] }) {
  const uid = auth.currentUser?.uid || "";
  const list = usePersonalSchedules(uid);
  const today = kstToday();
  const [ym, setYm] = React.useState(today.slice(0, 7));
  const [pick, setPick] = React.useState(today);
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const by = {}; list.forEach((e) => daysOf(e).forEach((d) => { (by[d] = by[d] || []).push(e); }));
  Object.values(by).forEach((l) => l.sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
  const first = new Date(`${ym}-01T00:00:00Z`); const startDow = first.getUTCDay();
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((startDow + dim) / 7) * 7 }, (_, i) => { const n = i - startDow + 1; return n >= 1 && n <= dim ? `${ym}-${String(n).padStart(2, "0")}` : null; });
  const move = (n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setYm(d.toISOString().slice(0, 7)); };
  const upcoming = list.filter((e) => (e.endDate || e.date) >= today).sort((a, b) => (a.date + sortKey(a)).localeCompare(b.date + sortKey(b))).slice(0, 8);
  const blank = (d) => ({ title: "", date: d || pick, endDate: d || pick, allDay: false, start: "10:00", end: "11:00", place: "", memo: "", color: COLORS[0][0], remind: "none", push: false });
  const save = async () => {
    const e = edit;
    if (!e.title.trim()) return alert("일정 제목을 입력해 주세요.");
    if (!e.allDay && e.end && e.start && e.end <= e.start && (e.endDate || e.date) === e.date) return alert("끝나는 시각이 시작 시각보다 늦어야 합니다.");
    setBusy(true);
    try {
      const remind = e.allDay && TIMED_ONLY.has(e.remind) ? "morning" : e.remind;
      const data = { uid, companyName: company || "", title: e.title.trim().slice(0, 120), date: e.date, endDate: e.endDate && e.endDate >= e.date ? e.endDate : e.date,
        allDay: !!e.allDay, start: e.allDay ? "" : e.start || "", end: e.allDay ? "" : e.end || "", place: (e.place || "").trim(), memo: (e.memo || "").trim(), color: e.color || COLORS[0][0], remind };
      const at = remindAtOf(data);
      const push = !!e.push && remind !== "none" && at > Date.now();
      Object.assign(data, { push: !!e.push && remind !== "none", remindAt: at, pushPending: push, updatedAt: serverTimestamp() });
      if (e.id) await updateDoc(doc(db, "personalSchedules", e.id), data);
      else await addDoc(collection(db, "personalSchedules"), { ...data, createdAt: serverTimestamp() });
      setEdit(null);
    } catch (err) { alert(`저장하지 못했습니다: ${err?.message || err}`); } finally { setBusy(false); }
  };
  const remove = async (e) => { if (!window.confirm("이 일정을 지울까요?")) return; await runDelete({ label: "일정", task: () => deleteDoc(doc(db, "personalSchedules", e.id)) }).catch((err) => alert(err.message)); setEdit(null); }; // ⭐ 2026-11-05 삭제 진행 창
  const dayList = by[pick] || [];
  const dayBirth = birthdaysOn(staff, pick);
  const inp = "h-11 w-full px-3.5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
  const lab = "text-[13px] font-black text-[#3A4A66] mb-1.5";

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[22px] px-4 md:px-6 py-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MY · SCHEDULE</div>
            <div className="text-[20px] md:text-[24px] font-black mt-0.5">개인 일정</div>
            <div className="text-[12.5px] text-white/55">나만 보는 일정입니다 · 날짜를 두 번 누르면 바로 등록</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {modeSwitch}
            <div className="flex items-center gap-1.5">{/* 달 이동·등록은 한 묶음(휴대폰에서 줄이 갈라지지 않게) */}
              <button type="button" onClick={() => move(-1)} className="w-9 h-9 rounded-xl bg-white/10 font-black">‹</button>
              <span className="h-9 px-3.5 rounded-xl bg-white text-[#0B1530] font-black grid place-items-center tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{ym.replace("-", ".")}</span>
              <button type="button" onClick={() => move(1)} className="w-9 h-9 rounded-xl bg-white/10 font-black">›</button>
              <button type="button" onClick={() => setEdit(blank())} className="h-9 px-4 rounded-xl bg-white text-[#0F1A30] text-[13.5px] font-black whitespace-nowrap">+ 일정 등록</button>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#EEF1F6]">
            {DOW.map((d, i) => <div key={d} className={`py-2 text-center text-[12px] font-black ${i === 0 ? "text-[#D92D20]" : i === 6 ? "text-[#2D4C82]" : "text-[#5B6B85]"}`}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const l = d ? by[d] || [] : [];
              const bd = d ? birthdaysOn(staff, d) : [];
              return (
                <button key={i} type="button" disabled={!d} onClick={() => d && setPick(d)} onDoubleClick={() => d && setEdit(blank(d))}
                  className={`text-left min-h-[64px] md:min-h-[104px] p-1 md:p-1.5 border-b border-r border-[#F1F4F9] ${!d ? "bg-[#FAFBFD]" : pick === d ? "bg-[#F2F6FD] ring-2 ring-inset ring-[#2D4C82]" : "hover:bg-[#F8FAFD]"}`}>
                  {d && (
                    <>
                      <div className="flex items-center gap-1 min-w-0">
                        <div className={`text-[12px] md:text-[13px] font-black tabular-nums shrink-0 ${d === today ? "w-6 h-6 rounded-full bg-[#0F1A30] text-white grid place-items-center" : (i % 7 === 0 || getNationalHolidayLabel(d)) ? "text-[#D92D20]" : i % 7 === 6 ? "text-[#2D4C82]" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{Number(d.slice(8))}</div>
                        {getNationalHolidayLabel(d) && <span className="hidden md:inline text-[10.5px] font-bold text-[#D92D20] truncate">{getNationalHolidayLabel(d)}</span>}
                      </div>
                      <div className="hidden md:block mt-1 space-y-0.5">
                        {bd.map((u) => <BirthChip key={u.id} name={u.name} />)}
                        {l.slice(0, 3).map((e) => (
                          <div key={`${e.id}${d}`} className="rounded-md px-1.5 py-[1px] text-[11px] font-bold truncate text-white" style={{ background: e.color || "#1B2B4B" }}>
                            {!e.allDay && e.start && d === e.date ? `${e.start} ` : ""}{e.title}
                          </div>
                        ))}
                        {l.length > 3 && <div className="text-[10.5px] font-bold text-[#7A879C] px-1">+{l.length - 3}</div>}
                      </div>
                      {(l.length > 0 || bd.length > 0) && <div className="md:hidden mt-1 flex items-center gap-0.5 flex-wrap">{bd.length > 0 && <span className="text-[9px]">🎂</span>}{l.slice(0, 4).map((e) => <span key={`${e.id}${d}`} className="w-1.5 h-1.5 rounded-full" style={{ background: e.color || "#1B2B4B" }} />)}</div>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-3 self-start">
          <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-[#EEF1F6] flex items-center gap-2">
              <div className="flex-1"><div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>DAY DETAIL</div>
                <div className="text-[15px] font-black text-[#0F1A30]">{pick.replace(/-/g, ".")} ({DOW[new Date(`${pick}T00:00:00Z`).getUTCDay()]})</div></div>
              <button type="button" onClick={() => setEdit(blank(pick))} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">+ 이 날 등록</button>
            </div>
            {dayBirth.length > 0 && <div className="px-4 pt-3 flex flex-wrap gap-1.5">{dayBirth.map((u) => <BirthChip key={u.id} name={u.name} big />)}</div>}
            {!dayList.length ? <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">이 날은 개인 일정이 없습니다</div> : (
              <div className="p-3 space-y-2">
                {dayList.map((e) => (
                  <button key={e.id} type="button" onClick={() => setEdit({ ...blank(), ...e })} className="w-full text-left rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 hover:bg-[#F7F9FC]">
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color || "#1B2B4B" }} />
                      <span className="text-[14.5px] font-black text-[#0F1A30] truncate flex-1">{e.title}</span>
                      {e.push && e.remind !== "none" && <span className="text-[11px] font-black text-[#2D4C82]" title="휴대폰 푸시 알림">🔔</span>}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[#7A879C] tabular-nums">{e.allDay || !e.start ? "종일" : `${hmLabel(e.start)}${e.end ? ` ~ ${hmLabel(e.end)}` : ""}`}{e.endDate && e.endDate !== e.date ? ` · ${e.date.slice(5)}~${e.endDate.slice(5)}` : ""}{e.place ? ` · ${e.place}` : ""}</div>
                    {e.memo && <div className="mt-0.5 text-[12.5px] text-[#5B6B85] line-clamp-2">{e.memo}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-[#EEF1F6]"><div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>UPCOMING</div><div className="text-[15px] font-black text-[#0F1A30]">다가오는 일정</div></div>
            {!upcoming.length ? <div className="py-6 text-center text-[13px] font-bold text-[#9AA9C3]">예정된 일정이 없습니다</div> : upcoming.map((e) => (
              <button key={e.id} type="button" onClick={() => { setPick(e.date); setYm(e.date.slice(0, 7)); }} className="w-full text-left flex items-center gap-3 px-4 py-2 border-b border-[#F1F4F9] last:border-b-0 hover:bg-[#F7F9FC]">
                <span className="w-11 shrink-0 text-center"><span className="block text-[10.5px] font-black text-[#7A879C]">{DOW[new Date(`${e.date}T00:00:00Z`).getUTCDay()]}</span><span className="block text-[15px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{e.date.slice(5).replace("-", ".")}</span></span>
                <span className="min-w-0 flex-1"><span className="block text-[14px] font-black text-[#0F1A30] truncate">{e.title}</span><span className="block text-[12px] text-[#7A879C] truncate">{e.allDay || !e.start ? "종일" : hmLabel(e.start)}{e.place ? ` · ${e.place}` : ""}</span></span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color || "#1B2B4B" }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 z-[100000] bg-black/45 flex justify-end" onClick={() => setEdit(null)}>
          <div className="h-full w-full md:w-[520px] bg-white flex flex-col shadow-[-24px_0_60px_rgba(15,26,48,0.25)]" onClick={(ev) => ev.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#EEF1F6] flex items-center gap-3" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 16px)" }}>
              <div className="flex-1"><div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{edit.id ? "EDIT · MY SCHEDULE" : "NEW · MY SCHEDULE"}</div><div className="text-[20px] font-black text-[#0F1A30]">{edit.id ? "개인 일정 수정" : "개인 일정 등록"}</div></div>
              <button type="button" onClick={() => setEdit(null)} className="w-10 h-10 rounded-xl border border-[#DCE3EE] text-[#5B6B85]">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div><div className={lab}>제목</div><input value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} className={inp} placeholder="예: 거래처 미팅 · 병원 예약" autoFocus /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><div className={lab}>시작일</div><CustomDatePicker value={edit.date} onChange={(e) => setEdit((p) => ({ ...p, date: e.target.value, endDate: !p.endDate || p.endDate < e.target.value ? e.target.value : p.endDate }))} className={inp} showIcon /></div>
                <div><div className={lab}>종료일</div><CustomDatePicker value={edit.endDate} onChange={(e) => setEdit((p) => ({ ...p, endDate: e.target.value && e.target.value < p.date ? p.date : e.target.value }))} className={inp} showIcon /></div>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-[#E3E8F0] px-3.5 h-12 cursor-pointer">
                <span className="text-[14px] font-black text-[#0F1A30]">종일</span>
                <span className={`relative w-11 h-6 rounded-full transition ${edit.allDay ? "bg-[#1B2B4B]" : "bg-[#DCE3EE]"}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${edit.allDay ? "left-[22px]" : "left-0.5"}`} /></span>
                <input type="checkbox" className="hidden" checked={!!edit.allDay} onChange={(e) => setEdit((p) => ({ ...p, allDay: e.target.checked }))} />
              </label>
              {!edit.allDay && (
                <div className="space-y-3">
                  <div><div className={lab}>시작 시각</div><TimeSelect value={edit.start} onChange={(v) => setEdit((p) => ({ ...p, start: v, end: p.end && v && p.end <= v ? `${String(Math.min(23, +v.slice(0, 2) + 1)).padStart(2, "0")}:${v.slice(3)}` : p.end }))} emptyLabel="시각 선택" className="h-11" /></div>
                  <div><div className={lab}>종료 시각</div><TimeSelect value={edit.end} onChange={(v) => setEdit((p) => ({ ...p, end: v }))} emptyLabel="없음" className="h-11" /></div>
                </div>
              )}
              <div><div className={lab}>장소</div><input value={edit.place} onChange={(e) => setEdit((p) => ({ ...p, place: e.target.value }))} className={inp} placeholder="(선택)" /></div>
              <div><div className={lab}>메모</div><textarea value={edit.memo} onChange={(e) => setEdit((p) => ({ ...p, memo: e.target.value }))} rows={3} className={`${inp} h-auto py-2.5`} placeholder="(선택)" /></div>
              <div><div className={lab}>색</div>
                <div className="flex gap-2">{COLORS.map(([c, n]) => <button key={c} type="button" title={n} onClick={() => setEdit((p) => ({ ...p, color: c }))} className={`w-9 h-9 rounded-full grid place-items-center ${edit.color === c ? "ring-2 ring-offset-2 ring-[#0F1A30]" : ""}`} style={{ background: c }}>{edit.color === c && <span className="text-white text-[14px] font-black">✓</span>}</button>)}</div>
              </div>
              <div className="rounded-2xl border border-[#E3E8F0] bg-[#F7F9FC] p-3.5 space-y-3">
                <div><div className={lab}>알림</div>
                  <CustomSelect value={edit.remind} onChange={(e) => setEdit((p) => ({ ...p, remind: e.target.value }))} className={inp}>
                    {REMIND_OPTS.filter(([k]) => !(edit.allDay && TIMED_ONLY.has(k))).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </CustomSelect>
                </div>
                <label className={`flex items-center gap-2.5 ${edit.remind === "none" ? "opacity-40" : "cursor-pointer"}`}>
                  <input type="checkbox" disabled={edit.remind === "none"} checked={!!edit.push && edit.remind !== "none"} onChange={(e) => setEdit((p) => ({ ...p, push: e.target.checked }))} className="w-[18px] h-[18px] accent-[#1B2B4B]" />
                  <span className="text-[14px] font-black text-[#0F1A30]">휴대폰 푸시 알림 받기</span>
                </label>
                <div className="text-[12.5px] text-[#7A879C] leading-relaxed">
                  {edit.remind !== "none" && remindAtOf(edit) > 0 && <>알림 시각: <b className="text-[#1B2B4B]">{new Date(remindAtOf({ ...edit, remind: edit.allDay && TIMED_ONLY.has(edit.remind) ? "morning" : edit.remind })).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</b><br /></>}
                  일정 당일에는 PC에 접속하면 오른쪽 아래 알림, 휴대폰은 앱을 열면 위쪽 알림으로도 알려 드립니다.
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-[#EEF1F6] flex gap-2" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 14px)" }}>
              {edit.id && <button type="button" onClick={() => remove(edit)} className="h-12 px-4 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#D92D20]">삭제</button>}
              <button type="button" onClick={() => setEdit(null)} className="h-12 px-5 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#5B6B85]">취소</button>
              <button type="button" disabled={busy} onClick={save} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 생일 표시(달력 칸 · 하루 상세) — dark: 임원 일정(어두운 바탕)
export function BirthChip({ name, big = false, dark = false }) {
  return (
    <div className={`rounded-md truncate font-black inline-flex items-center gap-1 max-w-full ${big ? "px-2.5 py-1 text-[13px]" : "px-1.5 py-[1px] text-[11px] w-full"}`}
      style={dark ? { background: "rgba(255,180,168,0.14)", color: "#FFD1C8", border: "1px solid rgba(255,180,168,0.35)" } : { background: "#FDF0F3", color: "#B4234B", border: "1px solid #F7C9D5" }}>
      <span>🎂</span><span className="truncate">{name} 생일</span>
    </div>
  );
}

// ── 오늘 개인 일정 알림(당일) — PC: 오른쪽 아래 배너 · 모바일: 위쪽 알림줄 · 일정마다 하루 한 번(이 기기) ──
export function PersonalTodayHost({ uid, mobile = false }) {
  const list = usePersonalSchedules(uid);
  React.useEffect(() => {
    if (!uid || !list.length) return;
    const today = kstToday();
    if (new Date(Date.now() + 9 * 3600e3).getUTCHours() < 6) return; // 새벽에는 띄우지 않음
    const todays = list.filter((e) => e.date <= today && (e.endDate || e.date) >= today).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const key = `kpPersonalToday:${uid}:${today}`;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || "[]"); } catch { /* 무시 */ }
    const fresh = todays.filter((e) => !seen.includes(e.id));
    if (!fresh.length) return;
    try { localStorage.setItem(key, JSON.stringify([...seen, ...fresh.map((e) => e.id)])); } catch { /* 무시 */ }
    const line = (e) => `${e.allDay || !e.start ? "종일" : hmLabel(e.start)} · ${e.title}`;
    const text = fresh.length === 1 ? line(fresh[0]) : `${line(fresh[0])} 외 ${fresh.length - 1}건`;
    if (mobile) window.dispatchEvent(new CustomEvent("kp-top-banner", { detail: { text: `📅 오늘 일정 — ${text}` } }));
    else window.dispatchEvent(new CustomEvent("kp-banner", { detail: { id: `ps-${today}-${fresh[0].id}`, kind: "schedule", label: "오늘 개인 일정", title: text, body: fresh.length > 1 ? fresh.slice(1, 4).map(line).join("\n") : (fresh[0].place || fresh[0].memo || ""), duration: 15000 } }));
  }, [uid, list, mobile]);
  return null;
}
