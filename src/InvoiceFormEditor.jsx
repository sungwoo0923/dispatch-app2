// ======================= src/InvoiceFormEditor.jsx =======================
// 🧾 2026-11-16 거래명세서 양식 고르기 — 거래처정산 › 명세서 미리보기 위 [양식] 버튼
//  칸을 켜고 끄고 · ▲▼로 순서를 바꾸고 · 칸 이름을 고친다. 아래 미리보기가 바로 바뀐다.
//  [이 거래처 양식으로 저장] → 그 거래처 명세서(화면 · 인쇄 · PDF · 엑셀 · 메일 · 일괄 발송)가 이 모양으로 나간다
//  [회사 기본으로 저장] → 따로 양식이 없는 거래처 모두. 계산 · 저장 값은 src/invoiceForm.js
import React from "react";
import { KpModal } from "./SettleDesk";
import { INVOICE_COLS, FORM_PRESETS, BASE_FORM, DEFAULT_FORM_CLIENT, normalizeForm, pickForm, visibleCols, colLabel, formDoc, sameForm } from "./invoiceForm";
import { arDeskId } from "./SettleDesk";

const NUM = { fontVariantNumeric: "tabular-nums" };
const btn = "h-10 px-4 rounded-xl border border-[#DCE2EC] bg-transparent text-[14px] font-bold text-[#16233D] hover:border-[#9FB0CC] disabled:opacity-40 whitespace-nowrap";
const btnPri = "h-10 px-4 rounded-xl border border-[#2457D6] bg-transparent text-[14px] font-black text-[#2457D6] disabled:opacity-40 whitespace-nowrap";
const won = (v) => (Number(v) || 0).toLocaleString();

export default function InvoiceFormEditor({ open, onClose, desk, client = "", sample = [], isViewer = false }) {
  const start = React.useMemo(() => pickForm(desk?.forms, client), [desk?.forms, client]);
  const [f, setF] = React.useState(() => normalizeForm(start));
  const [renaming, setRenaming] = React.useState("");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => { if (open) { setF(normalizeForm(start)); setMsg(""); setRenaming(""); } }, [open, start]);
  const set = (patch) => { setF((x) => normalizeForm({ ...x, ...patch })); setMsg(""); };
  const toggle = (k) => set({ on: f.on.includes(k) ? f.on.filter((x) => x !== k) : [...f.on, k] });
  const move = (i, d) => { const o = [...f.order]; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; set({ order: o }); };
  const rename = (k, v) => { const base = INVOICE_COLS.find((c) => c.k === k)?.label; const labels = { ...f.labels }; if (v.trim() && v.trim() !== base) labels[k] = v.trim(); else delete labels[k]; set({ labels }); };
  const save = async (who) => {
    if (isViewer || !desk) return;
    const target = who === "company" ? DEFAULT_FORM_CLIENT : client;
    await desk.save(arDeskId(desk.company, "form", target || "_default"), formDoc(target, f));
    setMsg(who === "company" ? "회사 기본 양식으로 저장했어요. 따로 양식이 없는 거래처 모두 이 모양으로 나가요." : `저장했어요. ${client} 명세서는 이제 이 양식으로 나가요.`);
  };
  const clearClient = async () => {
    if (isViewer || !desk || !client) return;
    await desk.save(arDeskId(desk.company, "form", client), { kind: "form-off", client });
    setMsg(`${client} 전용 양식을 지웠어요. 회사 기본 양식으로 나가요.`);
  };
  const cols = visibleCols(f);
  const rows = sample.slice(0, 4);
  const srcText = start.source === "client" ? `${client} 전용 양식` : start.source === "company" ? "회사 기본 양식" : "기본형";

  return (
    <KpModal open={open} onClose={onClose} en="INVOICE FORM" title="거래명세서 양식" sub={client ? `${client} · 지금 ${srcText}` : "거래처를 먼저 고르면 거래처 전용으로 저장할 수 있어요"} width={980} portal
      footer={<>
        {msg && <span className="mr-auto text-[13px] font-bold text-[#0F7A52]">{msg}</span>}
        {client && start.source === "client" && <button type="button" className={btn} disabled={isViewer} onClick={clearClient}>전용 양식 지우기</button>}
        <button type="button" className={btn} disabled={isViewer} onClick={() => save("company")}>회사 기본으로 저장</button>
        <button type="button" className={btnPri} disabled={isViewer || !client || sameForm(f, start) && start.source === "client"} onClick={() => save("client")}>이 거래처 양식으로 저장</button>
      </>}>
      <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-6 text-[#16233D]">
        <div className="space-y-5">
          <div>
            <div className="text-[13px] font-bold text-[#5A6781] mb-2">빠른 양식</div>
            <div className="grid grid-cols-2 gap-2">
              {FORM_PRESETS.map((p) => { const on = sameForm({ ...f, on: p.on, tax: p.tax }, f) && p.on.length === f.on.length && p.on.every((k) => f.on.includes(k)); return (
                <button key={p.key} type="button" aria-pressed={on} onClick={() => set({ on: p.on, tax: p.tax })}
                  className={`text-left rounded-xl border px-3 py-2 ${on ? "border-[#2457D6]" : "border-[#DCE2EC]"}`}>
                  <b className={`block text-[13.5px] ${on ? "text-[#2457D6]" : ""}`}>{p.key}</b><span className="text-[12px] text-[#5A6781]">{p.desc}</span>
                </button>); })}
            </div>
          </div>
          <div>
            <div className="text-[13px] font-bold text-[#5A6781] mb-1">보여 줄 칸 <span className="font-medium text-[#8D97AB]">· 이름을 누르면 바꿀 수 있어요</span></div>
            {f.order.map((k, i) => { const on = f.on.includes(k); return (
              <div key={k} className="flex items-center gap-2 py-1">
                <input type="checkbox" id={`inv-col-${k}`} checked={on} onChange={() => toggle(k)} className="w-4 h-4 accent-[#2457D6]" />
                {renaming === k
                  ? <input id={`inv-rn-${k}`} autoFocus defaultValue={colLabel(f, k)} maxLength={12} onBlur={(e) => { rename(k, e.target.value); setRenaming(""); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(""); }}
                      className="flex-1 min-w-0 h-8 rounded-lg border border-[#DCE2EC] bg-transparent px-2 text-[14px]" />
                  : <button type="button" onClick={() => setRenaming(k)} title="눌러서 칸 이름 바꾸기" className={`flex-1 min-w-0 text-left text-[14px] ${on ? "font-bold" : "text-[#8D97AB] line-through"}`}>{colLabel(f, k)}{f.labels[k] && <span className="ml-1.5 text-[12px] font-medium text-[#8D97AB] no-underline">(원래 {INVOICE_COLS.find((c) => c.k === k).label})</span>}</button>}
                <button type="button" aria-label={`${colLabel(f, k)} 위로`} disabled={i === 0} onClick={() => move(i, -1)} className="w-7 h-7 rounded-lg border border-[#DCE2EC] text-[11px] text-[#5A6781] disabled:opacity-30">▲</button>
                <button type="button" aria-label={`${colLabel(f, k)} 아래로`} disabled={i === f.order.length - 1} onClick={() => move(i, 1)} className="w-7 h-7 rounded-lg border border-[#DCE2EC] text-[11px] text-[#5A6781] disabled:opacity-30">▼</button>
              </div>); })}
          </div>
          <label className="flex items-center gap-2 text-[14px] cursor-pointer">
            <input type="checkbox" id="inv-tax" checked={f.tax} onChange={(e) => set({ tax: e.target.checked })} className="w-4 h-4 accent-[#2457D6]" />
            세액 · 합계 칸 보이기 <span className="text-[12px] text-[#8D97AB]">(끄면 금액 한 칸)</span>
          </label>
          <button type="button" className="text-[13px] font-bold text-[#5A6781] underline underline-offset-4" onClick={() => set({ ...BASE_FORM })}>처음 모양(기본형)으로</button>
        </div>

        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[#5A6781] mb-2">미리보기 <span className="font-medium text-[#8D97AB]">· 보이는 칸 {cols.length}개 · 숨긴 칸 {INVOICE_COLS.length - cols.length}개 · 금액 합계는 칸과 상관없이 같아요</span></div>
          <div className="overflow-x-auto rounded-xl border border-[#DCE2EC]">
            <table className="kp-plain w-full text-[12px] whitespace-nowrap" style={NUM}>
              <thead><tr>{["No", ...cols.map((c) => c.label), ...(f.tax ? ["공급가액", "세액(10%)", "합계"] : ["금액"])].map((h) => <th key={h} className="px-2 py-2 border-b-2 border-[#16233D] font-black">{h}</th>)}</tr></thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={cols.length + (f.tax ? 4 : 2)} className="px-2 py-6 text-center text-[#8D97AB]">명세서를 조회하면 실제 오더로 보여 줘요</td></tr>
                  : rows.map((m, i) => (
                    <tr key={i} className="border-b border-[#DCE2EC]">
                      <td className="px-2 py-1.5 text-center text-[#8D97AB]">{i + 1}</td>
                      {cols.map((c) => <td key={c.k} className="px-2 py-1.5 text-center">{m[c.k] || ""}</td>)}
                      <td className="px-2 py-1.5 text-right font-bold">{won(m.공급가액)}</td>
                      {f.tax && <><td className="px-2 py-1.5 text-right text-[#5A6781]">{won(m.세액)}</td><td className="px-2 py-1.5 text-right font-black">{won(m.공급가액 + m.세액)}</td></>}
                    </tr>))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[12.5px] text-[#8D97AB] leading-relaxed">저장하면 이 거래처의 명세서 화면 · 인쇄 · PDF · 엑셀 · 메일 첨부 · 일괄 발송이 모두 이 모양으로 바뀌어요. 숨긴 칸도 오더에는 그대로 남아 있어요.</div>
        </div>
      </div>
    </KpModal>
  );
}
