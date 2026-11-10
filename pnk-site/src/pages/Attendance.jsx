// ======================= pnk-site/src/pages/Attendance.jsx =======================
// 출퇴근 · 근태 — 큰 출근/퇴근 버튼(한국 시간) · 근무 장소 · 오늘 우리 회사 출근 현황 · 내 한 달 기록 · (관리자) 전체 월별 표 · 엑셀(CSV)
//  pnkAttendance/{uid}_{날짜}  · 출근 기준 시각은 회사 정보(pnkCompany/info.workStart · workEnd, 기본 09:00~18:00)
import React from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useMeCtx } from "../App";
import { DEFAULT_WORK, PLACES, hm, patchRow, useCol, useDocLive, where, ymd } from "../pnkApi";
import { Btn, Card, Chip, Empty, Field, Hero, HourMinuteInput, MonthPicker, Select, Stat, Tabs, Textarea, cx, fail } from "../ui";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const kstMin = (ms) => { const d = new Date(ms + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const dur = (min) => (min > 0 ? `${Math.floor(min / 60)}시간 ${String(min % 60).padStart(2, "0")}분` : "-");
const dow = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

function useNow(ms = 1000) {
  const [t, setT] = React.useState(Date.now());
  React.useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

export default function Attendance() {
  const me = useMeCtx();
  const uid = me.user.uid;
  const now = useNow();
  const today = ymd();
  const info = useDocLive("pnkCompany/info");
  const work = { start: info?.workStart || DEFAULT_WORK.start, end: info?.workEnd || DEFAULT_WORK.end };
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [tab, setTab] = React.useState("me");
  const [todayRows] = useCol("pnkAttendance", [where("date", "==", today)], [today]);
  const [mine] = useCol("pnkAttendance", [where("uid", "==", uid), where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`)], [uid, month]);
  const [allMonth] = useCol(me.isAdmin && tab === "all" ? "pnkAttendance" : null, [where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`)], [month, tab, me.isAdmin]);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [leaveEv] = useCol("pnkEvents", [where("date", ">=", `${month < today.slice(0, 7) ? month : today.slice(0, 7)}-01`), where("date", "<=", `${month > today.slice(0, 7) ? month : today.slice(0, 7)}-31`)], [month, today]);
  const rec = (todayRows || []).find((r) => r.uid === uid);
  const [place, setPlace] = React.useState("office");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const checkIn = async () => {
    setBusy(true);
    try {
      const late = kstMin(Date.now()) > toMin(work.start);
      await setDoc(doc(db, "pnkAttendance", `${uid}_${today}`), {
        uid, name: me.member?.name || "", empNo: me.member?.empNo || "", dept: me.member?.dept || "", date: today,
        inAt: Date.now(), outAt: 0, place, late, note, workMin: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const checkOut = async () => {
    if (!rec) return;
    if (rec.outAt && !window.confirm("이미 퇴근을 찍었습니다. 지금 시각으로 다시 찍을까요?")) return;
    setBusy(true);
    try {
      const out = Date.now();
      await patchRow("pnkAttendance", rec.id, { outAt: out, workMin: Math.max(0, Math.round((out - rec.inAt) / 60000) - (out - rec.inAt > 6 * 3600e3 ? 60 : 0)), outNote: note || "" });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const k = new Date(now + 9 * 3600e3);
  const clock = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}:${String(k.getUTCSeconds()).padStart(2, "0")}`;
  const working = rec && !rec.outAt ? Math.round((now - rec.inAt) / 60000) : 0;
  const ms = (mine || []);
  const workDays = ms.filter((r) => r.inAt).length;
  const lateN = ms.filter((r) => r.late).length;
  const totalMin = ms.reduce((a, r) => a + (r.workMin || 0), 0);
  const leaveDaysOf = (u, date) => (leaveEv || []).some((e) => e.type === "leave" && e.leaveUid === u && e.date === date);

  // 한 달 날짜
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const byDate = Object.fromEntries(ms.map((r) => [r.date, r]));

  const exportCsv = () => {
    const rows = [["날짜", "사번", "이름", "부서", "출근", "퇴근", "근무", "장소", "지각", "메모"]];
    (allMonth || []).sort((a, b) => (a.date + a.name).localeCompare(b.date + b.name)).forEach((r) => rows.push([r.date, r.empNo, r.name, r.dept, r.inAt ? hm(new Date(r.inAt)) : "", r.outAt ? hm(new Date(r.outAt)) : "", dur(r.workMin), PLACES.find((p) => p.key === r.place)?.label || "", r.late ? "지각" : "", (r.note || "").replace(/[\r\n,]/g, " ")]));
    const blob = new Blob(["﻿" + rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `PnK_근태_${month}.csv`; a.click();
  };

  return (
    <div>
      <Hero en="ATTENDANCE" title="출퇴근 · 근태" desc={`근무 시간 ${work.start} ~ ${work.end} · 한국 시간 기준`} />

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4 md:gap-5 mb-5">
        {/* 출퇴근 카드 */}
        <section className="relative overflow-hidden rounded-[26px] p-6 text-white shadow-[0_14px_34px_rgba(27,43,75,0.25)]" style={{ background: "linear-gradient(150deg, #14213D 0%, #1B2B4B 50%, #2D4C82 100%)" }}>
          <div className="absolute -right-10 -top-14 w-56 h-56 rounded-full bg-white/[0.06]" />
          <div className="relative">
            <div className="text-[13px] font-bold text-blue-100/85">{Number(today.slice(5, 7))}월 {Number(today.slice(8))}일 {WEEK[dow(today)]}요일 · {me.member?.name} ({me.member?.empNo})</div>
            <div className="mt-2 text-[52px] font-black tabular-nums tracking-tight leading-none">{clock}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[["출근", rec?.inAt ? hm(new Date(rec.inAt)) : "--:--"], ["퇴근", rec?.outAt ? hm(new Date(rec.outAt)) : "--:--"], ["근무", rec?.outAt ? dur(rec.workMin) : working ? dur(working) : "-"]].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-white/10 py-2.5"><div className="text-[11.5px] text-blue-100/80 font-bold">{l}</div><div className="text-[15px] font-black tabular-nums">{v}</div></div>
              ))}
            </div>
            {rec?.late && <div className="mt-2 text-[12.5px] font-bold text-rose-200">지각 ({work.start} 이후 출근)</div>}
            <div className="mt-4 flex gap-1.5">
              {PLACES.map((p) => <button key={p.key} type="button" disabled={!!rec} onClick={() => setPlace(p.key)} className={cx("flex-1 h-9 rounded-xl text-[12.5px] font-black", (rec ? rec.place : place) === p.key ? "bg-white text-navy" : "bg-white/10 text-white/80", rec && "opacity-80")}>{p.label}</button>)}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={rec ? "퇴근 메모(선택)" : "출근 메모(선택) — 예: 고객사 방문 후 출근"} className="mt-2 w-full h-10 px-3 rounded-xl bg-white/10 text-white placeholder-white/50 text-[13.5px] outline-none focus:bg-white/15" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy || !!rec} onClick={checkIn} className="h-14 rounded-2xl bg-white text-navy text-[17px] font-black disabled:opacity-40 shadow-lg">출근</button>
              <button type="button" disabled={busy || !rec} onClick={checkOut} className="h-14 rounded-2xl bg-[#4B6CB7] text-white text-[17px] font-black disabled:opacity-40 shadow-lg ring-1 ring-white/20">{rec?.outAt ? "퇴근 다시" : "퇴근"}</button>
            </div>
          </div>
        </section>

        {/* 오늘 우리 회사 */}
        <Card en="TODAY" title="오늘 출근 현황" right={<Chip>{(todayRows || []).length} / {(members || []).length}명</Chip>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2">
            {(members || []).map((mm) => {
              const r = (todayRows || []).find((x) => x.uid === mm.uid);
              const off = leaveDaysOf(mm.uid, today);
              const st = off ? ["휴가", "gray"] : !r ? ["출근 전", "gray"] : r.outAt ? ["퇴근", "navy"] : [PLACES.find((p) => p.key === r.place)?.label || "근무 중", "green"];
              return (
                <div key={mm.uid} className="flex items-center gap-3 rounded-2xl border border-line px-3.5 py-2.5">
                  <div className="relative"><div className="w-9 h-9 rounded-full bg-navy text-white text-[13px] font-black flex items-center justify-center">{mm.name.slice(0, 1)}</div>
                    <span className={cx("absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full ring-2 ring-white", r && !r.outAt ? "bg-emerald-500" : r ? "bg-navy-500" : "bg-[#C9D3E4]")} /></div>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-black truncate">{mm.name} <span className="text-[11.5px] text-[#7A8AA8] font-bold">{mm.dept}</span></div>
                    <div className="text-[12px] text-[#7A8AA8] tabular-nums">{r?.inAt ? `${hm(new Date(r.inAt))} 출근` : "-"}{r?.outAt ? ` · ${hm(new Date(r.outAt))} 퇴근` : ""}{r?.late ? " · 지각" : ""}</div></div>
                  <Chip tone={st[1]}>{st[0]}</Chip>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ key: "me", label: "내 근태" }, ...(me.isAdmin ? [{ key: "all", label: "전체 근태(관리자)" }] : [])]} />
        <div className="mb-4 ml-auto flex items-center gap-2"><MonthPicker value={month} onChange={(v) => v && setMonth(v)} />{tab === "all" && <Btn kind="ghost" icon="download" onClick={exportCsv}>엑셀(CSV)</Btn>}</div>
      </div>

      {tab === "me" ? (<>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
          <Stat icon="calendar" label="출근한 날" value={`${workDays}일`} sub={`${Number(month.slice(5))}월`} />
          <Stat icon="clock" label="총 근무" value={dur(totalMin)} sub={workDays ? `하루 평균 ${dur(Math.round(totalMin / Math.max(1, ms.filter((r) => r.outAt).length)))}` : ""} />
          <Stat icon="alert" label="지각" value={`${lateN}번`} sub={`${work.start} 이후 출근`} />
          <Stat icon="home" label="재택 · 외근" value={`${ms.filter((r) => r.place && r.place !== "office").length}일`} sub="사무실 밖 근무" />
        </div>
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] min-w-[620px]">
              <thead><tr className="text-left text-[12px] text-[#7A8AA8] bg-[#F8FAFD]">{["날짜", "출근", "퇴근", "근무", "장소", "메모"].map((h) => <th key={h} className="px-4 py-2.5 font-bold">{h}</th>)}</tr></thead>
              <tbody>{days.filter((d) => d <= today).reverse().map((d) => {
                const r = byDate[d]; const w = dow(d); const off = leaveDaysOf(uid, d);
                return (
                  <tr key={d} className={cx("border-t border-[#EEF1F6]", (w === 0 || w === 6) && "bg-[#FAFBFD] text-[#A0ABBE]")}>
                    <td className="px-4 py-2.5 tabular-nums font-bold">{d.slice(5).replace("-", "/")} <span className={w === 0 ? "text-rose-500" : w === 6 ? "text-navy-500" : "text-[#7A8AA8]"}>{WEEK[w]}</span></td>
                    <td className="px-4 py-2.5 tabular-nums">{r?.inAt ? <>{hm(new Date(r.inAt))}{r.late && <Chip tone="red" className="ml-1.5">지각</Chip>}</> : off ? <Chip tone="gray">휴가</Chip> : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r?.outAt ? hm(new Date(r.outAt)) : r?.inAt && d < today ? <span className="text-rose-600 font-bold text-[12px]">퇴근 안 찍음</span> : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{dur(r?.workMin)}</td>
                    <td className="px-4 py-2.5">{r ? PLACES.find((p) => p.key === r.place)?.label : ""}</td>
                    <td className="px-4 py-2.5 text-[#7A8AA8] truncate max-w-[260px]">{[r?.note, r?.outNote].filter(Boolean).join(" / ")}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
      </>) : (
        <AllTable members={members || []} rows={allMonth} days={days} today={today} isLeave={leaveDaysOf} />
      )}
    </div>
  );
}

// 관리자 — 사람 × 날짜 표(칸 색: 정상 · 지각 · 재택/외근 · 휴가 · 없음)
function AllTable({ members, rows, days, today, isLeave }) {
  const [edit, setEdit] = React.useState(null);
  if (!rows) return <Card><Empty>불러오는 중…</Empty></Card>;
  const map = {};
  rows.forEach((r) => { map[`${r.uid}_${r.date}`] = r; });
  return (
    <Card pad={false}>
      <div className="overflow-x-auto">
        <table className="text-[12px] border-collapse">
          <thead><tr className="bg-[#F8FAFD] text-[#7A8AA8]">
            <th className="sticky left-0 bg-[#F8FAFD] px-3 py-2 text-left font-bold min-w-[130px]">구성원</th>
            {days.map((d) => { const w = dow(d); return <th key={d} className={cx("px-1 py-2 font-bold w-8 text-center", w === 0 && "text-rose-500", w === 6 && "text-navy-500")}>{Number(d.slice(8))}</th>; })}
            <th className="px-3 py-2 font-bold">출근</th><th className="px-3 py-2 font-bold">지각</th>
          </tr></thead>
          <tbody>{members.map((m) => {
            const mine = rows.filter((r) => r.uid === m.uid);
            return (
              <tr key={m.uid} className="border-t border-[#EEF1F6]">
                <td className="sticky left-0 bg-white px-3 py-1.5 font-bold whitespace-nowrap">{m.name} <span className="text-[#A0ABBE] font-medium">{m.empNo}</span></td>
                {days.map((d) => {
                  const r = map[`${m.uid}_${d}`]; const w = dow(d); const off = isLeave(m.uid, d);
                  const c = r ? (r.late ? "bg-rose-400" : r.place !== "office" ? "bg-[#8FA6D6]" : "bg-navy") : off ? "bg-amber-300" : d > today || w === 0 || w === 6 ? "bg-transparent" : "bg-[#E9EDF4]";
                  return <td key={d} className="px-0.5 py-1.5 text-center"><button type="button" title={r ? `${d} ${hm(new Date(r.inAt))}~${r.outAt ? hm(new Date(r.outAt)) : ""}` : d} onClick={() => r && setEdit(r)} className={cx("w-6 h-6 rounded-md", c, r && "hover:ring-2 hover:ring-navy-500")} /></td>;
                })}
                <td className="px-3 text-center font-black tabular-nums">{mine.length}</td>
                <td className="px-3 text-center font-black tabular-nums text-rose-600">{mine.filter((r) => r.late).length || ""}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-[#EEF1F6] flex flex-wrap gap-3 text-[12px] text-[#5A6A86]">
        {[["bg-navy", "정상 출근"], ["bg-rose-400", "지각"], ["bg-[#8FA6D6]", "재택 · 외근"], ["bg-amber-300", "휴가"], ["bg-[#E9EDF4]", "기록 없음"]].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx("w-3.5 h-3.5 rounded", c)} />{l}</span>)}
        <span className="ml-auto">칸을 누르면 기록을 고칠 수 있습니다</span>
      </div>
      {edit && <FixModal r={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function FixModal({ r, onClose }) {
  const [inT, setIn] = React.useState(r.inAt ? hm(new Date(r.inAt)) : "");
  const [outT, setOut] = React.useState(r.outAt ? hm(new Date(r.outAt)) : "");
  const [place, setPlace] = React.useState(r.place || "office");
  const [note, setNote] = React.useState(r.note || "");
  const at = (t) => (t ? Date.parse(`${r.date}T${t}:00+09:00`) : 0);
  const save = () => {
    const i = at(inT); const o = at(outT);
    patchRow("pnkAttendance", r.id, { inAt: i, outAt: o, place, note: `${note}${note.includes("(관리자 수정)") ? "" : " (관리자 수정)"}`.trim(), workMin: i && o ? Math.max(0, Math.round((o - i) / 60000) - (o - i > 6 * 3600e3 ? 60 : 0)) : 0 }).then(onClose).catch(fail);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-[22px] w-full max-w-[420px] p-5 space-y-3">
        <div className="text-[16px] font-black">{r.name} · {r.date} 근태 고치기</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="출근"><HourMinuteInput value={inT} onChange={(e) => setIn(e.target.value)} /></Field>
          <Field label="퇴근"><HourMinuteInput value={outT} onChange={(e) => setOut(e.target.value)} /></Field>
        </div>
        <Select value={place} onChange={(e) => setPlace(e.target.value)} options={PLACES} />
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="수정 사유" />
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></div>
      </div>
    </div>
  );
}
