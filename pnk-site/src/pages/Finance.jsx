// ======================= pnk-site/src/pages/Finance.jsx =======================
// 매출 · 손익 — PnK PROJECT 장부(pnkFinance, 관리자만). 월별 손익 그래프 · 서비스별 매출 · 비용 구성 · 장부 표.
//  대표 계정이면 로지스웹 수납 관리(platformInvoices)의 입금 완료 금액을 불러와 [장부에 넣기] 할 수 있다.
import React from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeCtx } from "../App";
import { PRODUCTS, addRow, by, invoiceByMonth, loadPlatform, patchRow, productLabel, removeRow, useCol, won, ymd, num } from "../pnkApi";
import { Btn, Card, Chip, Empty, Field, Hero, HeroBtn, Input, Loading, Modal, Select, Stat, cx, fail, DateInput, MonthPicker } from "../ui";

const INCOME_CATS = ["구독료", "도입비", "허브 수수료", "추가 기능", "기타 매출"];
const EXPENSE_CATS = ["인건비", "서버 · 클라우드", "문자 · 알림톡", "광고 · 마케팅", "사무실 임대료", "외주 · 개발", "세금 · 공과", "기타 비용"];
const NAVY = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#8FA6D6", "#A9B9DC", "#C9D3E4", "#E2E8F2"];
const tip = { borderRadius: 12, border: "1px solid #E3E8F0", fontSize: 12 };
const man = (v) => `${Math.round((Number(v) || 0) / 10000).toLocaleString()}만`;

export default function Finance() {
  const me = useMeCtx();
  const [rows] = useCol("pnkFinance", [], []);
  const [month, setMonth] = React.useState(ymd().slice(0, 7));
  const [edit, setEdit] = React.useState(null);
  const [plat, setPlat] = React.useState(null);
  React.useEffect(() => { if (me.owner) loadPlatform().then(setPlat); }, [me.owner]);

  const months = React.useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return Array.from({ length: 12 }, (_, i) => ymd(new Date(y, m - 12 + i, 1)).slice(0, 7));
  }, [month]);
  const all = rows || [];
  const sumOf = (l, kind) => l.filter((r) => r.kind === kind).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const trend = months.map((m) => { const l = all.filter((r) => String(r.date).startsWith(m)); const inc = sumOf(l, "income"); const exp = sumOf(l, "expense"); return { m: `${Number(m.slice(5))}월`, 매출: inc, 비용: exp, 이익: inc - exp }; });
  const cur = all.filter((r) => String(r.date).startsWith(month));
  const inc = sumOf(cur, "income"); const exp = sumOf(cur, "expense"); const profit = inc - exp;
  const prev = trend[10] || { 매출: 0, 이익: 0 };
  const yearKey = month.slice(0, 4);
  const yearL = all.filter((r) => String(r.date).startsWith(yearKey));
  const yInc = sumOf(yearL, "income"); const yExp = sumOf(yearL, "expense");
  const diff = (a, b) => (b ? `${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / Math.abs(b)) * 100))}% (전달 대비)` : "전달 기록 없음");

  const expPie = EXPENSE_CATS.map((c) => ({ name: c, value: cur.filter((r) => r.kind === "expense" && r.category === c).reduce((a, r) => a + (Number(r.amount) || 0), 0) })).filter((x) => x.value > 0)
    .concat(cur.filter((r) => r.kind === "expense" && !EXPENSE_CATS.includes(r.category)).length ? [{ name: "그 밖", value: cur.filter((r) => r.kind === "expense" && !EXPENSE_CATS.includes(r.category)).reduce((a, r) => a + (Number(r.amount) || 0), 0) }] : []);
  const byProd = PRODUCTS.map((p) => ({ ...p, inc: cur.filter((r) => r.kind === "income" && (r.product || "common") === p.key).reduce((a, r) => a + (Number(r.amount) || 0), 0), exp: cur.filter((r) => r.kind === "expense" && (r.product || "common") === p.key).reduce((a, r) => a + (Number(r.amount) || 0), 0) })).filter((p) => p.inc || p.exp);
  const maxProd = Math.max(1, ...byProd.map((p) => Math.max(p.inc, p.exp)));
  const inv = plat ? invoiceByMonth(plat.invoices)[month] : null;
  const imported = cur.some((r) => r.source === `invoices:${month}`);

  const importInv = () => {
    if (!inv?.paid) return;
    const b = by(me);
    addRow("pnkFinance", { date: `${month}-28`, kind: "income", category: "구독료", product: "logisweb", amount: inv.paid, memo: `로지스웹 수납 관리 ${month} 입금 완료 ${inv.count}건 합계`, source: `invoices:${month}`, createdBy: b.uid, createdByName: b.name }).catch(fail);
  };

  return (
    <div>
      <Hero title="매출 · 손익">
        <MonthPicker value={month} onChange={(v) => v && setMonth(v)} />
        <HeroBtn sub icon="plus" onClick={() => setEdit({ kind: "expense", date: ymd() })}>비용 입력</HeroBtn>
        <HeroBtn icon="plus" onClick={() => setEdit({ kind: "income", date: ymd() })}>매출 입력</HeroBtn>
      </Hero>

      {!rows ? <Loading /> : (<>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
          <Stat icon="trend" label={`${Number(month.slice(5))}월 매출`} value={man(inc)} sub={diff(inc, prev.매출)} />
          <Stat icon="receipt" label={`${Number(month.slice(5))}월 비용`} value={man(exp)} sub={`${cur.filter((r) => r.kind === "expense").length}건`} />
          <Stat icon="money" label={`${Number(month.slice(5))}월 영업이익`} value={man(profit)} sub={inc ? `이익률 ${Math.round((profit / inc) * 100)}%` : "매출 없음"} />
          <Stat icon="chart" label={`${yearKey}년 누적 이익`} value={man(yInc - yExp)} sub={`매출 ${man(yInc)} · 비용 ${man(yExp)}`} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5 mb-5">
          <Card title="월별 손익" className="xl:col-span-2">
            <div className="h-[280px] -ml-3">
              <ResponsiveContainer>
                <ComposedChart data={trend}>
                  <CartesianGrid stroke="#EEF1F6" vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 12, fill: "#7A8AA8" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={man} tick={{ fontSize: 11.5, fill: "#7A8AA8" }} axisLine={false} tickLine={false} width={54} />
                  <Tooltip contentStyle={tip} formatter={(v) => won(v)} cursor={{ fill: "#F4F6FA" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="매출" fill="#1B2B4B" radius={[6, 6, 0, 0]} barSize={16} />
                  <Bar dataKey="비용" fill="#C9D3E4" radius={[6, 6, 0, 0]} barSize={16} />
                  <Line type="monotone" dataKey="이익" stroke="#4B6CB7" strokeWidth={3} dot={{ r: 3.5, fill: "#fff", strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title={`${Number(month.slice(5))}월 비용 구성`}>
            {expPie.length === 0 ? <Empty icon="pie">비용 기록이 없습니다.</Empty> : (<>
              <div className="h-[180px]"><ResponsiveContainer><PieChart>
                <Pie data={expPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">{expPie.map((_, i) => <Cell key={i} fill={NAVY[i % NAVY.length]} />)}</Pie>
                <Tooltip contentStyle={tip} formatter={(v) => won(v)} />
              </PieChart></ResponsiveContainer></div>
              <ul className="space-y-1.5 mt-2">{expPie.sort((a, b) => b.value - a.value).map((p, i) => (
                <li key={p.name} className="flex items-center gap-2 text-[12.5px]"><span className="w-2.5 h-2.5 rounded-full" style={{ background: NAVY[i % NAVY.length] }} /><span className="font-bold">{p.name}</span><span className="ml-auto tnum font-bold">{won(p.value)}</span><span className="w-9 text-right text-[#7A8AA8] tnum">{Math.round((p.value / exp) * 100)}%</span></li>
              ))}</ul>
            </>)}
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5 mb-5">
          <Card title="서비스별 매출 · 비용" className="xl:col-span-2">
            {byProd.length === 0 ? <Empty>이달 기록이 없습니다.</Empty> : (
              <ul className="space-y-4">{byProd.map((p) => (
                <li key={p.key}>
                  <div className="flex items-center text-[13px] mb-1.5"><b className="flex-1">{p.label}</b><span className="tnum font-bold">{won(p.inc - p.exp)}</span><span className="ml-1 text-[#7A8AA8] text-[12px]">손익</span></div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2"><span className="w-8 text-[11px] font-bold text-[#7A8AA8]">매출</span><div className="flex-1 h-3 rounded-full bg-navy-50 overflow-hidden"><div className="h-full rounded-full bg-navy" style={{ width: `${(p.inc / maxProd) * 100}%` }} /></div><span className="w-24 text-right text-[12px] tnum">{won(p.inc)}</span></div>
                    <div className="flex items-center gap-2"><span className="w-8 text-[11px] font-bold text-[#7A8AA8]">비용</span><div className="flex-1 h-3 rounded-full bg-navy-50 overflow-hidden"><div className="h-full rounded-full bg-[#A9B9DC]" style={{ width: `${(p.exp / maxProd) * 100}%` }} /></div><span className="w-24 text-right text-[12px] tnum">{won(p.exp)}</span></div>
                  </div>
                </li>
              ))}</ul>
            )}
          </Card>
          <Card title="로지스웹 수납 연동">
            {!me.owner ? <div className="text-[13px] text-[#7A8AA8]">대표 계정에서 로지스웹 수납 관리 금액을 불러옵니다.</div> : !inv ? <div className="text-[13px] text-[#7A8AA8] py-4">{plat ? `${month} 청구 기록이 없습니다.` : "불러오는 중…"}</div> : (
              <div className="space-y-2">
                {[["청구", inv.billed], ["입금 완료", inv.paid], ["연체", inv.overdue]].map(([k, v]) => (
                  <div key={k} className="flex items-center rounded-2xl bg-navy-50 px-4 py-2.5"><span className="text-[13px] font-bold text-[#5A6A86] flex-1">{k}</span><span className={cx("text-[15px] font-black tnum", k === "연체" && v > 0 && "text-rose-600")}>{won(v)}</span></div>
                ))}
                <Btn kind={imported ? "ghost" : "primary"} disabled={imported || !inv.paid} onClick={importInv} className="w-full mt-1">{imported ? "이미 장부에 넣었습니다" : "입금 완료 금액을 장부에 넣기"}</Btn>
              </div>
            )}
          </Card>
        </div>

        <Card title={`${month} 장부`} right={<span className="text-[12.5px] text-[#7A8AA8]">{cur.length}건</span>} pad={false}>
          {cur.length === 0 ? <Empty icon="receipt">이달 기록이 없습니다. 위 [매출 입력] · [비용 입력]으로 적어 주세요.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px] min-w-[640px]">
                <thead><tr className="text-left text-[12px] text-[#7A8AA8] bg-[#F8FAFD]">{["날짜", "구분", "항목", "서비스", "금액", "메모"].map((h) => <th key={h} className={cx("px-4 py-2.5 font-bold", h === "금액" && "text-right")}>{h}</th>)}</tr></thead>
                <tbody>{cur.sort((a, b) => String(b.date).localeCompare(String(a.date))).map((r) => (
                  <tr key={r.id} onClick={() => setEdit(r)} className="border-t border-[#EEF1F6] hover:bg-[#F8FAFD] cursor-pointer">
                    <td className="px-4 py-2.5 tnum">{String(r.date).slice(5).replace("-", "/")}</td>
                    <td className="px-4 py-2.5"><Chip tone={r.kind === "income" ? "dark" : "gray"}>{r.kind === "income" ? "매출" : "비용"}</Chip></td>
                    <td className="px-4 py-2.5 font-bold">{r.category}</td><td className="px-4 py-2.5 text-[#5A6A86]">{productLabel(r.product)}</td>
                    <td className={cx("px-4 py-2.5 text-right tnum font-black", r.kind === "expense" && "text-[#5A6A86]")}>{r.kind === "expense" ? "-" : ""}{won(r.amount)}</td>
                    <td className="px-4 py-2.5 text-[#7A8AA8] max-w-[280px] truncate">{r.memo}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr className="border-t-2 border-line bg-[#F8FAFD] font-black"><td colSpan={4} className="px-4 py-3">합계 (매출 − 비용)</td><td className="px-4 py-3 text-right tnum">{won(profit)}</td><td /></tr></tfoot>
              </table>
            </div>
          )}
        </Card>
      </>)}
      {edit && <EntryEditor entry={edit} me={me} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EntryEditor({ entry, me, onClose }) {
  const isNew = !entry.id;
  const [f, setF] = React.useState({ date: entry.date || ymd(), kind: entry.kind || "income", category: entry.category || "", product: entry.product || "logisweb", amount: entry.amount ? String(entry.amount) : "", memo: entry.memo || "" });
  const cats = f.kind === "income" ? INCOME_CATS : EXPENSE_CATS;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!num(f.amount)) { window.alert("금액을 입력해 주세요."); return; }
    const data = { ...f, category: f.category || cats[0], amount: num(f.amount) };
    try {
      if (isNew) { const b = by(me); await addRow("pnkFinance", { ...data, createdBy: b.uid, createdByName: b.name }); }
      else await patchRow("pnkFinance", entry.id, data);
      onClose();
    } catch (e) { fail(e); }
  };
  const del = () => { if (window.confirm("이 기록을 지울까요?")) removeRow("pnkFinance", entry.id).then(onClose).catch(fail); };
  return (
    <Modal open title={isNew ? (f.kind === "income" ? "매출 입력" : "비용 입력") : "장부 고치기"} onClose={onClose}
      footer={<>{!isNew && <Btn kind="danger" icon="trash" onClick={del} className="mr-auto">지우기</Btn>}<Btn kind="ghost" onClick={onClose}>취소</Btn><Btn onClick={save}>저장</Btn></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1.5">{[["income", "매출"], ["expense", "비용"]].map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, kind: k, category: "" })} className={cx("h-10 rounded-xl text-[13.5px] font-black border", f.kind === k ? "bg-navy text-white border-navy" : "border-[#DCE3EE] text-[#3A4A66]")}>{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="날짜"><DateInput value={f.date} onChange={set("date")} /></Field>
          <Field label="금액(원)"><Input inputMode="numeric" value={f.amount ? Number(num(f.amount)).toLocaleString() : ""} onChange={set("amount")} autoFocus /></Field>
          <Field label="항목"><Select custom value={f.category || cats[0]} onChange={set("category")} options={cats} /></Field>
          <Field label="서비스"><Select value={f.product} onChange={set("product")} options={PRODUCTS} /></Field>
        </div>
        <Field label="메모"><Input value={f.memo} onChange={set("memo")} placeholder="거래처 · 내용" /></Field>
      </div>
    </Modal>
  );
}
