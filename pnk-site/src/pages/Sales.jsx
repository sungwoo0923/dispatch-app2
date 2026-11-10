// ======================= pnk-site/src/pages/Sales.jsx =======================
// 영업 관리 — 영업 대상 회사를 단계(발굴 → 첫 연락 → 시연 → 견적 → 계약 → 도입)별로 관리하고, 다음 연락일을 일정에 띄운다.
//  pnkSales: { company, contact, phone, email, product, stage, value(월 예상 금액), nextDate, nextAction, ownerUid, ownerName, memo, notes:[{at,by,text}] }
import React from "react";
import { arrayUnion } from "firebase/firestore";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeCtx } from "../App";
import { PRODUCTS, SALES_STAGES, kstDateTime, addRow, by, patchRow, productLabel, removeRow, stageLabel, useCol, where, won, ymd, num } from "../pnkApi";
import { Btn, Card, Chip, Field, Hero, HeroBtn, Input, Loading, Modal, Select, Stat, Tabs, Textarea, cx, fail, DateInput } from "../ui";

const NEXT_ACTIONS = ["첫 연락(전화)", "요금제 안내", "자료 · 소개서 보내기", "현장 시연", "무료 체험 안내", "견적서 보내기", "계약서 보내기", "계약서 서명", "도입 교육", "결과 확인 전화"];
const OPEN = SALES_STAGES.filter((s) => !["won", "lost"].includes(s.key));
const NAVY = ["#C9D3E4", "#A9B9DC", "#8FA6D6", "#4B6CB7", "#2D4C82", "#1B2B4B"];

export default function Sales() {
  const me = useMeCtx();
  const [rows] = useCol("pnkSales", [], []);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [view, setView] = React.useState("pipe");
  const [edit, setEdit] = React.useState(null);
  const [q, setQ] = React.useState("");
  const today = ymd();
  const mm = today.slice(0, 7);
  const list = (rows || []).filter((s) => !q || `${s.company} ${s.contact} ${s.ownerName}`.toLowerCase().includes(q.toLowerCase()));
  const open = list.filter((s) => !["won", "lost"].includes(s.stage));
  const pipeVal = open.reduce((a, s) => a + (Number(s.value) || 0), 0);
  const weighted = open.reduce((a, s) => a + (Number(s.value) || 0) * (SALES_STAGES.find((x) => x.key === s.stage)?.p || 0), 0);
  const wonM = list.filter((s) => s.stage === "won" && String(s.wonAt || "").startsWith(mm));
  const closed = list.filter((s) => ["won", "lost"].includes(s.stage));
  const rate = closed.length ? Math.round((closed.filter((s) => s.stage === "won").length / closed.length) * 100) : 0;
  const due = open.filter((s) => s.nextDate && s.nextDate <= today);
  const funnel = SALES_STAGES.filter((s) => s.key !== "lost").map((s, i) => ({ name: s.label, n: list.filter((x) => x.stage === s.key).length, i }));

  const move = (s, stage) => patchRow("pnkSales", s.id, { stage, ...(stage === "won" ? { wonAt: today } : {}) }).catch(fail);

  return (
    <div>
      <Hero en="SALES PIPELINE" title="영업 관리" desc="도입 문의부터 계약까지 — 다음 연락일은 일정과 대시보드에 자동으로 뜹니다.">
        <HeroBtn icon="plus" onClick={() => setEdit({})}>영업 대상 추가</HeroBtn>
      </Hero>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
        <Stat icon="handshake" label="진행 중" value={`${open.length}곳`} sub={`월 예상 ${won(pipeVal)}`} />
        <Stat icon="pie" label="가중 예상 매출" value={`${Math.round(weighted / 10000).toLocaleString()}만`} sub="단계별 확률 반영(월)" />
        <Stat icon="check" label="이달 도입" value={`${wonM.length}곳`} sub={`월 ${won(wonM.reduce((a, s) => a + (Number(s.value) || 0), 0))}`} />
        <Stat icon="bell" label="오늘까지 연락" value={`${due.length}곳`} sub={`성공률 ${rate}%`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 md:gap-5 mb-5">
        <Card en="FUNNEL" title="단계별 영업 현황">
          <div className="h-[210px]">
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12.5, fill: "#3A4A66", fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12 }} cursor={{ fill: "#F4F6FA" }} formatter={(v) => [`${v}곳`, "회사"]} />
                <Bar dataKey="n" radius={[0, 8, 8, 0]} barSize={20}>
                  {funnel.map((f) => <Cell key={f.name} fill={NAVY[f.i % NAVY.length]} />)}
                  <LabelList dataKey="n" position="right" style={{ fontSize: 12, fontWeight: 800, fill: "#1B2B4B" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card en="FOLLOW UP" title="연락할 곳" pad={false}>
          {due.length === 0 ? <div className="py-8 text-center text-[13px] text-[#7A8AA8]">오늘까지 연락할 곳이 없습니다.</div> : (
            <ul className="divide-y divide-[#EEF1F6]">
              {due.slice(0, 6).map((s) => (
                <li key={s.id}><button type="button" onClick={() => setEdit(s)} className="w-full text-left px-5 py-3 hover:bg-navy-50 flex items-center gap-3">
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-black truncate">{s.company}</div><div className="text-[12px] text-[#7A8AA8] truncate">{s.nextAction || "연락"} · {s.ownerName}</div></div>
                  <Chip tone={s.nextDate < today ? "red" : "navy"}>{s.nextDate < today ? "지남" : "오늘"}</Chip>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Tabs items={[{ key: "pipe", label: "단계별 보기" }, { key: "list", label: "목록" }]} value={view} onChange={setView} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사 · 담당자 검색" className="sm:ml-auto sm:w-[260px] mb-4" />
      </div>

      {!rows ? <Loading /> : view === "pipe" ? (
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
          {[...OPEN, ...SALES_STAGES.filter((s) => ["won", "lost"].includes(s.key))].map((st) => {
            const items = list.filter((s) => s.stage === st.key);
            const sum = items.reduce((a, s) => a + (Number(s.value) || 0), 0);
            return (
              <div key={st.key} className="w-[260px] shrink-0 snap-start rounded-[20px] bg-[#E9EDF4] p-2.5">
                <div className="px-2 pt-1 pb-2.5">
                  <div className="flex items-center gap-2"><span className="text-[14px] font-black">{st.label}</span><span className="ml-auto text-[12px] font-black text-[#5A6A86] bg-white rounded-lg px-2 h-6 flex items-center">{items.length}</span></div>
                  <div className="text-[11.5px] font-bold text-[#7A8AA8] tnum">월 {won(sum)}</div>
                </div>
                <div className="space-y-2">
                  {items.map((s) => {
                    const idx = SALES_STAGES.findIndex((x) => x.key === s.stage);
                    const nxt = OPEN[idx + 1] ? OPEN[idx + 1].key : idx === OPEN.length - 1 ? "won" : null;
                    return (
                      <div key={s.id} onClick={() => setEdit(s)} className="bg-white rounded-2xl border border-line p-3 cursor-pointer hover:border-navy-500 transition">
                        <div className="text-[14px] font-black truncate">{s.company}</div>
                        <div className="text-[12px] text-[#7A8AA8] truncate">{s.contact} · {productLabel(s.product)}</div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-[13px] font-black tnum">{won(s.value)}</span>
                          {s.nextDate && st.key !== "won" && st.key !== "lost" && <Chip tone={s.nextDate < today ? "red" : "gray"} className="ml-auto">{s.nextDate.slice(5).replace("-", "/")}</Chip>}
                        </div>
                        {nxt && <button type="button" onClick={(e) => { e.stopPropagation(); move(s, nxt); }} className="mt-2 w-full h-7 rounded-lg bg-navy-50 text-navy text-[11.5px] font-black hover:bg-navy-100">{stageLabel(nxt)}(으)로 →</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] min-w-[760px]">
              <thead><tr className="text-left text-[12px] text-[#7A8AA8] bg-[#F8FAFD]">{["회사", "담당자(고객)", "단계", "월 예상", "다음 연락", "영업 담당"].map((h) => <th key={h} className="px-4 py-2.5 font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {list.sort((a, b) => String(a.nextDate || "9").localeCompare(String(b.nextDate || "9"))).map((s) => (
                  <tr key={s.id} onClick={() => setEdit(s)} className="border-t border-[#EEF1F6] hover:bg-[#F8FAFD] cursor-pointer">
                    <td className="px-4 py-3 font-black">{s.company}</td><td className="px-4 py-3">{s.contact} <span className="text-[#7A8AA8]">{s.phone}</span></td>
                    <td className="px-4 py-3"><Chip tone={s.stage === "won" ? "green" : s.stage === "lost" ? "gray" : "navy"}>{stageLabel(s.stage)}</Chip></td>
                    <td className="px-4 py-3 tnum font-bold">{won(s.value)}</td>
                    <td className={cx("px-4 py-3 tnum", s.nextDate && s.nextDate < today && "text-rose-600 font-bold")}>{s.nextDate || "-"} <span className="text-[#7A8AA8] font-normal">{s.nextAction}</span></td>
                    <td className="px-4 py-3">{s.ownerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {edit && <SalesEditor deal={edit} me={me} members={members || []} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SalesEditor({ deal, me, members, onClose }) {
  const isNew = !deal.id;
  const [f, setF] = React.useState({
    company: deal.company || "", contact: deal.contact || "", phone: deal.phone || "", email: deal.email || "", product: deal.product || "logisweb",
    stage: deal.stage || "lead", value: deal.value ? String(deal.value) : "", nextDate: deal.nextDate || "", nextAction: deal.nextAction || "",
    ownerUid: deal.ownerUid || me.user.uid, memo: deal.memo || "",
  });
  const [note, setNote] = React.useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.company.trim()) { window.alert("회사 이름을 입력해 주세요."); return; }
    const o = members.find((m) => m.uid === f.ownerUid);
    const data = { ...f, company: f.company.trim(), value: num(f.value), ownerName: o?.name || "", ...(f.stage === "won" && deal.stage !== "won" ? { wonAt: ymd() } : {}) };
    try {
      if (isNew) { const b = by(me); await addRow("pnkSales", { ...data, notes: [], createdBy: b.uid }); }
      else await patchRow("pnkSales", deal.id, data);
      onClose();
    } catch (e) { fail(e); }
  };
  const addNote = () => {
    if (!note.trim() || isNew) return;
    patchRow("pnkSales", deal.id, { notes: arrayUnion({ at: Date.now(), by: me.member?.name || "", text: note.trim() }) }).then(() => setNote("")).catch(fail);
  };
  const del = () => { if (window.confirm("이 영업 대상을 지울까요?")) removeRow("pnkSales", deal.id).then(onClose).catch(fail); };
  return (
    <Modal open wide title={isNew ? "영업 대상 추가" : deal.company} onClose={onClose}
      footer={<>{!isNew && <Btn kind="danger" icon="trash" onClick={del} className="mr-auto">지우기</Btn>}<Btn kind="ghost" onClick={onClose}>닫기</Btn><Btn onClick={save}>저장</Btn></>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-3">
          <Field label="회사 이름"><Input value={f.company} onChange={set("company")} autoFocus={isNew} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="고객 담당자"><Input value={f.contact} onChange={set("contact")} /></Field>
            <Field label="연락처"><Input value={f.phone} onChange={set("phone")} /></Field>
          </div>
          <Field label="이메일"><Input value={f.email} onChange={set("email")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="서비스"><Select value={f.product} onChange={set("product")} options={PRODUCTS} /></Field>
            <Field label="월 예상 금액(원)"><Input inputMode="numeric" value={f.value} onChange={set("value")} placeholder="199000" /></Field>
          </div>
          <Field label="단계">
            <div className="grid grid-cols-4 gap-1.5">{SALES_STAGES.map((s) => <button key={s.key} type="button" onClick={() => setF({ ...f, stage: s.key })} className={cx("h-9 rounded-xl text-[12px] font-black border", f.stage === s.key ? "bg-navy text-white border-navy" : "border-[#DCE3EE] text-[#3A4A66]")}>{s.label}</button>)}</div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="다음 연락일"><DateInput value={f.nextDate} onChange={set("nextDate")} /></Field>
            <Field label="할 일"><Select custom value={f.nextAction} onChange={set("nextAction")} placeholder="고르거나 직접 입력" options={NEXT_ACTIONS} /></Field>
          </div>
          <Field label="영업 담당"><Select value={f.ownerUid} onChange={set("ownerUid")} options={members.map((m) => ({ key: m.uid, label: m.name }))} /></Field>
          <Field label="메모"><Textarea rows={3} value={f.memo} onChange={set("memo")} /></Field>
        </div>
        <div>
          <div className="text-[12.5px] font-bold text-[#3A4A66] mb-1">연락 기록</div>
          {isNew ? <div className="text-[12.5px] text-[#7A8AA8] rounded-2xl bg-navy-50 p-4">저장한 뒤 통화 · 미팅 기록을 남길 수 있습니다.</div> : (<>
            <div className="flex gap-2 mb-3"><Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addNote(); }} placeholder="예: 대표와 통화 — 다음 주 시연 희망" /><Btn onClick={addNote}>기록</Btn></div>
            <ol className="relative border-l-2 border-navy-100 ml-2 space-y-3">
              {(deal.notes || []).slice().sort((a, b) => b.at - a.at).map((n) => (
                <li key={n.at} className="pl-4 relative"><span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-navy ring-4 ring-white" />
                  <div className="text-[11.5px] text-[#7A8AA8] tnum">{kstDateTime(n.at)} · {n.by}</div>
                  <div className="text-[13.5px] whitespace-pre-wrap">{n.text}</div></li>
              ))}
              {!(deal.notes || []).length && <li className="pl-4 text-[12.5px] text-[#7A8AA8]">아직 기록이 없습니다.</li>}
            </ol>
          </>)}
        </div>
      </div>
    </Modal>
  );
}
