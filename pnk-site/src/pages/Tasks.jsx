// ======================= pnk-site/src/pages/Tasks.jsx =======================
// 업무 보드 — 할 일 · 진행 중 · 완료 세 칸. PC는 끌어서 옮기기, 휴대폰은 [→] 버튼. 서비스(로지스웹 · 허브 · 홈페이지 · 기사앱)별로 나눠 본다.
import React from "react";
import { useMeCtx } from "../App";
import { PRODUCTS, addRow, by, patchRow, productLabel, removeRow, useCol, where, ymd } from "../pnkApi";
import { Btn, Chip, Field, Hero, HeroBtn, Input, Loading, Modal, Select, Textarea, cx, fail, DateInput } from "../ui";

const COLS = [
  { key: "todo", label: "할 일", en: "TO DO" },
  { key: "doing", label: "진행 중", en: "DOING" },
  { key: "done", label: "완료", en: "DONE" },
];
const PRI = [{ key: "high", label: "긴급" }, { key: "normal", label: "보통" }, { key: "low", label: "낮음" }];

export default function Tasks() {
  const me = useMeCtx();
  const [rows] = useCol("pnkTasks", [], []);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [prod, setProd] = React.useState("");
  const [who, setWho] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const [drag, setDrag] = React.useState(null);
  const today = ymd();
  const list = (rows || []).filter((t) => (!prod || t.product === prod) && (!who || (who === "me" ? t.assigneeUid === me.user.uid : t.assigneeUid === who)));
  const move = (t, status) => patchRow("pnkTasks", t.id, { status, ...(status === "done" ? { doneAt: Date.now() } : {}) }).catch(fail);
  const doneCnt = list.filter((t) => t.status === "done").length;
  const pct = list.length ? Math.round((doneCnt / list.length) * 100) : 0;

  return (
    <div>
      <Hero en="TASK BOARD" title="업무 보드" desc="서비스별 할 일을 나누고, 누가 무엇을 하는지 함께 봅니다.">
        <HeroBtn icon="plus" onClick={() => setEdit({})}>업무 추가</HeroBtn>
      </Hero>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex gap-1 p-1 bg-white border border-line rounded-2xl overflow-x-auto no-scrollbar max-w-full">
          {[{ key: "", label: "전체" }, ...PRODUCTS].map((p) => (
            <button key={p.key} type="button" onClick={() => setProd(p.key)} className={cx("h-9 px-3.5 rounded-xl text-[13px] font-black whitespace-nowrap", prod === p.key ? "bg-navy text-white" : "text-[#5A6A86] hover:bg-navy-50")}>
              {p.label}<span className="ml-1 opacity-70 text-[11px]">{(rows || []).filter((t) => (!p.key || t.product === p.key) && t.status !== "done").length}</span>
            </button>
          ))}
        </div>
        <Select value={who} onChange={(e) => setWho(e.target.value)} className="lg:w-[180px]" options={[{ key: "", label: "담당자 전체" }, { key: "me", label: "내 업무" }, ...(members || []).map((m) => ({ key: m.uid, label: m.name }))]} />
        <div className="lg:ml-auto flex items-center gap-3 bg-white border border-line rounded-2xl px-4 h-11">
          <span className="text-[12.5px] font-bold text-[#5A6A86]">완료율</span>
          <div className="w-32 h-2 rounded-full bg-navy-100 overflow-hidden"><div className="h-full bg-navy rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
          <span className="text-[13px] font-black tnum">{pct}%</span>
        </div>
      </div>

      {!rows ? <Loading /> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map((c) => {
            const items = list.filter((t) => (t.status || "todo") === c.key)
              .sort((a, b) => (c.key === "done" ? (b.doneAt || 0) - (a.doneAt || 0) : String(a.due || "9999").localeCompare(String(b.due || "9999"))));
            return (
              <div key={c.key} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag && drag.status !== c.key) move(drag, c.key); setDrag(null); }}
                className={cx("rounded-[22px] p-3 min-h-[300px] transition", drag ? "bg-navy-100/70 ring-2 ring-dashed ring-navy-500/30" : "bg-[#E9EDF4]")}>
                <div className="flex items-center gap-2 px-2 pt-1 pb-3">
                  <span className="text-[10.5px] font-extrabold tracking-[0.16em] text-[#7A8AA8]">{c.en}</span>
                  <span className="text-[14.5px] font-black">{c.label}</span>
                  <span className="ml-auto text-[12px] font-black text-[#5A6A86] bg-white rounded-lg px-2 h-6 flex items-center tnum">{items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {items.slice(0, c.key === "done" ? 20 : 999).map((t) => {
                    const late = t.due && t.due < today && c.key !== "done";
                    return (
                      <div key={t.id} draggable onDragStart={() => setDrag(t)} onDragEnd={() => setDrag(null)} onClick={() => setEdit(t)}
                        className={cx("bg-white rounded-2xl border border-line p-3.5 cursor-pointer hover:border-navy-500 hover:shadow-md transition", c.key === "done" && "opacity-65")}>
                        <div className="flex items-start gap-2">
                          {t.priority === "high" && <span className="mt-1.5 w-2 h-2 rounded-full bg-rose-500 shrink-0" title="긴급" />}
                          <div className={cx("flex-1 text-[14px] font-bold leading-snug", c.key === "done" && "line-through")}>{t.title}</div>
                        </div>
                        {t.desc && <div className="mt-1 text-[12.5px] text-[#7A8AA8] line-clamp-2">{t.desc}</div>}
                        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                          <Chip tone="gray">{productLabel(t.product)}</Chip>
                          {t.due && <Chip tone={late ? "red" : "navy"}>{late ? "기한 지남 " : ""}{t.due.slice(5).replace("-", "/")}</Chip>}
                          <span className="ml-auto flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-full bg-navy text-white text-[11px] font-black flex items-center justify-center" title={t.assigneeName}>{(t.assigneeName || "?").slice(0, 1)}</span>
                            {c.key !== "done" && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); move(t, c.key === "todo" ? "doing" : "done"); }}
                                className="md:hidden h-6 px-2 rounded-lg bg-navy-100 text-navy text-[11.5px] font-black">{c.key === "todo" ? "시작 →" : "완료 ✓"}</button>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="py-8 text-center text-[12.5px] text-[#7A8AA8]">{drag ? "여기에 놓기" : "비어 있음"}</div>}
                </div>
                {c.key === "todo" && <button type="button" onClick={() => setEdit({ product: prod || "common" })} className="mt-2.5 w-full h-10 rounded-xl border-2 border-dashed border-[#C9D3E4] text-[13px] font-bold text-[#7A8AA8] hover:border-navy-500 hover:text-navy">+ 업무 추가</button>}
              </div>
            );
          })}
        </div>
      )}

      {edit && <TaskEditor task={edit} me={me} members={members || []} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TaskEditor({ task, me, members, onClose }) {
  const isNew = !task.id;
  const [f, setF] = React.useState({
    title: task.title || "", desc: task.desc || "", status: task.status || "todo", product: task.product || "common",
    priority: task.priority || "normal", assigneeUid: task.assigneeUid || me.user.uid, due: task.due || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.title.trim()) { window.alert("업무 이름을 입력해 주세요."); return; }
    const a = members.find((m) => m.uid === f.assigneeUid);
    const data = { ...f, title: f.title.trim(), assigneeName: a?.name || "" };
    try {
      if (isNew) { const b = by(me); await addRow("pnkTasks", { ...data, createdBy: b.uid, createdByName: b.name, order: Date.now() }); }
      else await patchRow("pnkTasks", task.id, data);
      onClose();
    } catch (e) { fail(e); }
  };
  const del = () => { if (window.confirm("이 업무를 지울까요?")) removeRow("pnkTasks", task.id).then(onClose).catch(fail); };
  return (
    <Modal open title={isNew ? "업무 추가" : "업무 고치기"} onClose={onClose}
      footer={<>{!isNew && <Btn kind="danger" icon="trash" onClick={del} className="mr-auto">지우기</Btn>}<Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></>}>
      <div className="space-y-3">
        <Field label="업무"><Input value={f.title} onChange={set("title")} autoFocus /></Field>
        <Field label="설명"><Textarea rows={4} value={f.desc} onChange={set("desc")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="서비스"><Select value={f.product} onChange={set("product")} options={PRODUCTS} /></Field>
          <Field label="담당자"><Select value={f.assigneeUid} onChange={set("assigneeUid")} options={members.map((m) => ({ key: m.uid, label: `${m.name}${m.dept ? ` · ${m.dept}` : ""}` }))} /></Field>
          <Field label="기한"><DateInput value={f.due} onChange={set("due")} /></Field>
          <Field label="중요도"><Select value={f.priority} onChange={set("priority")} options={PRI} /></Field>
          <Field label="상태" className="col-span-2">
            <div className="grid grid-cols-3 gap-1.5">{COLS.map((c) => <button key={c.key} type="button" onClick={() => setF({ ...f, status: c.key })} className={cx("h-10 rounded-xl text-[13px] font-black border", f.status === c.key ? "bg-navy text-white border-navy" : "border-[#DCE3EE] text-[#3A4A66]")}>{c.label}</button>)}</div>
          </Field>
        </div>
        {!isNew && <div className="text-[12px] text-[#7A8AA8]">만든 사람 {task.createdByName || "-"}</div>}
      </div>
    </Modal>
  );
}

