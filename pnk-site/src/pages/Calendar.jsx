// ======================= pnk-site/src/pages/Calendar.jsx =======================
// 일정 — 회사 일정(pnkEvents) + 영업 다음 연락(pnkSales.nextDate) + 업무 기한(pnkTasks.due)을 한 달력에
import React from "react";
import { useNavigate } from "react-router-dom";
import { useMeCtx } from "../App";
import { EVENT_TYPES, addRow, by, patchRow, removeRow, useCol, where, ymd } from "../pnkApi";
import { Btn, Card, Field, Hero, HeroBtn, Input, Modal, Select, Textarea, cx, fail, DateInput, TimeInput } from "../ui";
import Icon from "../icons";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const typeOf = (k) => EVENT_TYPES.find((t) => t.key === k) || EVENT_TYPES[EVENT_TYPES.length - 1];

export default function CalendarPage() {
  const me = useMeCtx();
  const nav = useNavigate();
  const [cur, setCur] = React.useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = React.useState(ymd());
  const [edit, setEdit] = React.useState(null);
  const [show, setShow] = React.useState({ ev: true, sales: true, task: true });
  const y = cur.getFullYear(); const m = cur.getMonth();
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const from = ymd(days[0]); const to = ymd(days[41]);
  const [events] = useCol("pnkEvents", [where("date", ">=", from), where("date", "<=", to)], [from, to]);
  const [sales] = useCol("pnkSales", [], []);
  const [tasks] = useCol("pnkTasks", [], []);
  const today = ymd();

  const byDay = React.useMemo(() => {
    const out = {};
    const push = (d, x) => { (out[d] || (out[d] = [])).push(x); };
    if (show.ev) (events || []).forEach((e) => push(e.date, { kind: "ev", id: e.id, title: e.title, time: e.time, dot: typeOf(e.type).dot, raw: e }));
    if (show.sales) (sales || []).filter((s) => s.nextDate && !["won", "lost"].includes(s.stage)).forEach((s) => push(s.nextDate, { kind: "sales", id: s.id, title: `${s.company} · ${s.nextAction || "연락"}`, dot: "bg-sky-600" }));
    if (show.task) (tasks || []).filter((t) => t.due && t.status !== "done").forEach((t) => push(t.due, { kind: "task", id: t.id, title: t.title, dot: "bg-[#8FA6D6]" }));
    Object.values(out).forEach((l) => l.sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99"))));
    return out;
  }, [events, sales, tasks, show]);
  const selItems = byDay[sel] || [];
  const go = (n) => setCur(new Date(y, m + n, 1));
  const open = (x) => (x.kind === "ev" ? setEdit(x.raw) : nav(x.kind === "sales" ? "/sales" : "/tasks"));

  return (
    <div>
      <Hero en="CALENDAR" title="일정" desc="회사 일정 · 영업 연락 · 업무 기한을 한 달력에서 봅니다.">
        <HeroBtn icon="plus" onClick={() => setEdit({ date: sel })}>일정 추가</HeroBtn>
      </Hero>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 md:gap-5">
        <Card pad={false}>
          <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-[#EEF1F6] flex-wrap">
            <button type="button" onClick={() => go(-1)} className="w-9 h-9 rounded-xl border border-line flex items-center justify-center hover:border-navy-500" aria-label="이전 달">‹</button>
            <div className="text-[18px] font-black tnum w-[120px] text-center">{y}년 {m + 1}월</div>
            <button type="button" onClick={() => go(1)} className="w-9 h-9 rounded-xl border border-line flex items-center justify-center hover:border-navy-500" aria-label="다음 달">›</button>
            <Btn kind="ghost" onClick={() => { const d = new Date(); setCur(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(today); }}>오늘</Btn>
            <div className="ml-auto flex gap-1.5 flex-wrap">
              {[["ev", "회사 일정", "bg-navy-700"], ["sales", "영업 연락", "bg-sky-600"], ["task", "업무 기한", "bg-[#8FA6D6]"]].map(([k, l, dot]) => (
                <button key={k} type="button" onClick={() => setShow({ ...show, [k]: !show[k] })} className={cx("h-8 px-2.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border", show[k] ? "border-navy-500/40 bg-navy-50" : "border-line text-[#A0ABBE]")}>
                  <span className={cx("w-2 h-2 rounded-full", dot, !show[k] && "opacity-30")} />{l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[12px] font-bold text-[#7A8AA8] border-b border-[#EEF1F6]">
            {WEEK.map((w, i) => <div key={w} className={cx("py-2", i === 0 && "text-rose-500", i === 6 && "text-navy-500")}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const k = ymd(d); const inM = d.getMonth() === m; const items = byDay[k] || [];
              return (
                <button key={k} type="button" onClick={() => setSel(k)} onDoubleClick={() => setEdit({ date: k })}
                  className={cx("text-left min-h-[64px] md:min-h-[108px] p-1.5 md:p-2 border-b border-r border-[#EEF1F6] align-top transition", i % 7 === 6 && "border-r-0",
                    !inM && "bg-[#FAFBFD]", sel === k && "bg-navy-50 ring-2 ring-inset ring-navy-500/50")}>
                  <div className={cx("text-[12.5px] font-black tnum w-6 h-6 rounded-full flex items-center justify-center",
                    k === today ? "bg-navy text-white" : !inM ? "text-[#C0C8D6]" : d.getDay() === 0 ? "text-rose-500" : "text-[#22304D]")}>{d.getDate()}</div>
                  <div className="hidden md:block mt-1 space-y-0.5">
                    {items.slice(0, 3).map((x) => (
                      <div key={x.kind + x.id} className="flex items-center gap-1 text-[11.5px] font-semibold truncate"><span className={cx("w-1.5 h-1.5 rounded-full shrink-0", x.dot)} /><span className="truncate">{x.time ? `${x.time} ` : ""}{x.title}</span></div>
                    ))}
                    {items.length > 3 && <div className="text-[11px] font-bold text-[#7A8AA8]">+{items.length - 3}</div>}
                  </div>
                  <div className="md:hidden mt-1 flex gap-0.5 flex-wrap">{items.slice(0, 4).map((x) => <span key={x.kind + x.id} className={cx("w-1.5 h-1.5 rounded-full", x.dot)} />)}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card en={sel === today ? "TODAY" : "DAY"} title={`${Number(sel.slice(5, 7))}월 ${Number(sel.slice(8))}일 (${WEEK[new Date(sel).getDay()]})`} right={<Btn kind="soft" icon="plus" onClick={() => setEdit({ date: sel })}>추가</Btn>}>
          {selItems.length === 0 ? <div className="py-8 text-center text-[13px] text-[#7A8AA8]">일정이 없습니다.<br /><span className="text-[12px]">달력 날짜를 두 번 누르면 바로 추가</span></div> : (
            <ul className="space-y-2">
              {selItems.map((x) => (
                <li key={x.kind + x.id}>
                  <button type="button" onClick={() => open(x)} className="w-full text-left flex items-start gap-3 rounded-2xl border border-line px-3.5 py-3 hover:border-navy-500">
                    <span className={cx("mt-1.5 w-2.5 h-2.5 rounded-full shrink-0", x.dot)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold">{x.title}</div>
                      <div className="text-[12px] text-[#7A8AA8]">{x.kind === "ev" ? `${typeOf(x.raw.type).label} · ${x.time || "종일"}${x.raw.memo ? ` · ${x.raw.memo}` : ""}` : x.kind === "sales" ? "영업 다음 연락" : "업무 기한"}</div>
                    </div>
                    <Icon name="link" size={14} className="text-[#C0C8D6] mt-1" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {edit && <EventEditor ev={edit} me={me} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EventEditor({ ev, me, onClose }) {
  const isNew = !ev.id;
  const [f, setF] = React.useState({ title: ev.title || "", date: ev.date || ymd(), time: ev.time || "", type: ev.type || "meeting", memo: ev.memo || "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.title.trim()) { window.alert("일정 이름을 입력해 주세요."); return; }
    try {
      if (isNew) { const b = by(me); await addRow("pnkEvents", { ...f, title: f.title.trim(), createdBy: b.uid, createdByName: b.name }); }
      else await patchRow("pnkEvents", ev.id, { ...f, title: f.title.trim() });
      onClose();
    } catch (e) { fail(e); }
  };
  const del = () => { if (window.confirm("이 일정을 지울까요?")) removeRow("pnkEvents", ev.id).then(onClose).catch(fail); };
  return (
    <Modal open title={isNew ? "일정 추가" : "일정 고치기"} onClose={onClose}
      footer={<>{!isNew && <Btn kind="danger" icon="trash" onClick={del} className="mr-auto">지우기</Btn>}<Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></>}>
      <div className="space-y-3">
        <Field label="일정"><Input value={f.title} onChange={set("title")} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="날짜"><DateInput value={f.date} onChange={set("date")} /></Field>
          <Field label="시간" hint="비우면 종일"><TimeInput value={f.time} onChange={set("time")} placeholder="종일" /></Field>
        </div>
        <Field label="종류"><Select value={f.type} onChange={set("type")} options={EVENT_TYPES} /></Field>
        <Field label="메모"><Textarea rows={3} value={f.memo} onChange={set("memo")} placeholder="장소 · 참석자 등" /></Field>
      </div>
    </Modal>
  );
}
