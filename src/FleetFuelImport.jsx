// ======================= src/FleetFuelImport.jsx =======================
// ⛽ 2026-11-27 일괄 지급명세서 [주유비] — 은행 · 카드 사용내역 엑셀을 올려 기사님별 주유비를 그 달 공제로 넣는다(직접 입력도 된다)
//  ① 엑셀 올리기 → 날짜 · 금액 · 카드 · 내용 칸 자동 인식(src/fleetFuel.js) → 선택한 달 내역만
//  ② 카드 끝 4자리 · 차량번호로 기사님 자동 지정, 못 찾은 줄은 [기사 선택] — 저장하면 그 카드를 기억(다음 달 자동)
//  ③ 아래 기사님별 합계(직접 고칠 수 있음) → [저장] = drivers/{id}.주유비[달] (지급명세서 자동 공제 "주유비")
import React from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { arrayUnion, deleteField, doc, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { parseFuelSheet, matchFuelRow, sumByDriver, cardLast4, fuelOf } from "./fleetFuel";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const onlyNum = (v) => String(v ?? "").replace(/[^\d]/g, "");
const NUMF = { fontVariantNumeric: "tabular-nums" };
const th = "px-3 py-3 text-left text-[13.5px] font-black text-[#DCE6F7] whitespace-nowrap";
const td = "px-3 py-2.5 text-[14.5px] whitespace-nowrap";

export default function FleetFuelImport({ open, ym, drivers = [], onClose }) {
  const [file, setFile] = React.useState("");
  const [parsed, setParsed] = React.useState(null); // { rows, cols }
  const [assign, setAssign] = React.useState({}); // 줄 번호 → 기사 id
  const [how, setHow] = React.useState({}); // 줄 번호 → "카드" | "차량번호" | "직접"
  const [onlyMonth, setOnlyMonth] = React.useState(true);
  const [filter, setFilter] = React.useState("all"); // all | need
  const [amt, setAmt] = React.useState({}); // 기사 id → 금액(문자)
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const fileRef = React.useRef(null);
  const list = React.useMemo(() => [...drivers].sort((a, b) => String(a.이름 || "").localeCompare(String(b.이름 || ""), "ko")), [drivers]);
  const byId = React.useMemo(() => new Map(list.map((d) => [d.id, d])), [list]);

  React.useEffect(() => {
    if (!open) return;
    setFile(""); setParsed(null); setAssign({}); setHow({}); setErr(""); setFilter("all");
    const m = {}; list.forEach((d) => { const f = fuelOf(d, ym); if (f) m[d.id] = String(f.amount); }); setAmt(m);
  }, [open, ym]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = React.useMemo(() => (parsed?.rows || []).filter((r) => !onlyMonth || r.date.slice(0, 7) === ym), [parsed, onlyMonth, ym]);
  const sums = React.useMemo(() => sumByDriver(rows, assign), [rows, assign]);
  // 엑셀을 올렸으면 합계를 아래 표에 채운다(직접 고친 값은 다시 올리기 전까지 그대로)
  const applySums = (s) => setAmt((p) => { const n = { ...p }; Object.entries(s).forEach(([id, v]) => { n[id] = String(Math.max(0, v.amount)); }); return n; });

  const readFile = async (f) => {
    if (!f) return; setErr("");
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      let best = null;
      wb.SheetNames.forEach((n) => { const aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }); const p = parseFuelSheet(aoa, { year: Number(ym.slice(0, 4)) }); if (!best || p.rows.length > best.rows.length) best = p; });
      if (!best?.rows.length) { setErr(best?.error || "읽을 수 있는 거래 내역이 없습니다. 날짜와 금액(출금액 · 이용금액) 칸이 있는 엑셀인지 확인해 주십시오."); return; }
      const a = {}; const h = {};
      best.rows.forEach((r) => { const m = matchFuelRow(r, list); if (m.id) { a[r.i] = m.id; h[r.i] = m.by; } });
      setFile(f.name); setParsed(best); setAssign(a); setHow(h);
      applySums(sumByDriver(best.rows.filter((r) => r.date.slice(0, 7) === ym), a));
    } catch (e) { setErr(`엑셀을 읽지 못했습니다: ${e?.message || e}`); }
  };
  const setRow = (i, id) => {
    const nA = { ...assign, [i]: id }; if (!id) delete nA[i];
    setAssign(nA); setHow((p) => ({ ...p, [i]: id ? "직접" : "" })); applySums(sumByDriver(rows, nA));
  };

  const need = rows.filter((r) => !assign[r.i]);
  const shown = filter === "need" ? need : rows;
  const total = Object.values(amt).reduce((s, v) => s + (Number(onlyNum(v)) || 0), 0);
  const changed = list.filter((d) => (Number(onlyNum(amt[d.id])) || 0) !== (fuelOf(d, ym)?.amount || 0));

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const by = auth.currentUser?.email || "직원";
      // 직접 지정한 줄의 카드 끝 4자리를 기사 정보에 기억(다음 달부터 자동)
      const learn = {};
      rows.forEach((r) => { if (how[r.i] === "직접" && assign[r.i]) { const c = cardLast4(r.card); const d = byId.get(assign[r.i]); if (c && !(Array.isArray(d?.유류카드) ? d.유류카드 : []).includes(c)) (learn[assign[r.i]] ||= new Set()).add(c); } });
      const ids = new Set([...changed.map((d) => d.id), ...Object.keys(learn)]);
      for (const id of ids) {
        const v = Number(onlyNum(amt[id])) || 0;
        const patch = {};
        if (changed.some((d) => d.id === id)) patch.주유비 = { [ym]: v > 0 ? { amount: v, count: sums[id]?.count || 0, at: Date.now(), by, src: file ? `엑셀 ${file}` : "직접 입력" } : deleteField() };
        if (learn[id]) patch.유류카드 = arrayUnion(...learn[id]);
        await setDoc(doc(db, "drivers", id), patch, { merge: true });
      }
      onClose?.(true);
    } catch (e) { setErr(String(e?.code || "").includes("permission") ? "저장할 권한이 없습니다." : `저장하지 못했습니다: ${e?.message || e}`); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  const ymKo = `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="주유비 불러오기" className="fixed inset-0 z-[99995] flex items-center justify-center p-4" style={{ background: "rgba(8,14,30,.55)" }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="w-[1320px] max-w-full max-h-[94vh] flex flex-col rounded-[24px] bg-[#F3F6FA] overflow-hidden shadow-[0_30px_80px_rgba(8,14,30,.45)]">
        <div className="px-6 py-5 text-white flex items-center gap-4 flex-wrap" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">FUEL · {ymKo}</div>
            <div className="text-[22px] font-black mt-0.5">주유비 불러오기</div>
            <div className="text-[14px] text-white/75 mt-1">은행 · 카드 사용내역 엑셀을 올리면 기사님별 주유비가 집계되어 지급명세서에 ‘주유비’로 공제됩니다.</div>
          </div>
          <div className="flex gap-2">
            {[["엑셀 건수", parsed ? `${rows.length}건` : "-"], ["확인 필요", parsed ? `${need.length}건` : "-"], ["주유비 합계", `${won(total)}원`]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/[0.08] border border-white/15 px-4 py-2 min-w-[118px]"><div className="text-[12px] font-bold text-white/60">{k}</div><div className="text-[18px] font-black" style={NUMF}>{v}</div></div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
          {/* 왼쪽 — 엑셀 내역 */}
          <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-hidden">
            <div className="px-4 py-3.5 flex items-center gap-2 flex-wrap border-b border-[#EEF1F6]">
              <div className="text-[16px] font-black text-[#0F1A30] mr-auto">① 사용내역 엑셀</div>
              {parsed && <>
                <div className="inline-flex p-1 rounded-xl bg-[#EEF2F8] gap-1">
                  {[["all", `전체 ${rows.length}`], ["need", `확인 필요 ${need.length}`]].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`h-8 px-3 rounded-lg text-[13px] font-black ${filter === k ? "bg-white text-[#0F1A30] shadow" : "text-[#5B6B85]"}`}>{l}</button>)}
                </div>
                <label className="flex items-center gap-1.5 text-[13px] font-bold text-[#3A4A66]"><input type="checkbox" className="w-4 h-4" checked={onlyMonth} onChange={(e) => setOnlyMonth(e.target.checked)} />{Number(ym.slice(5))}월 내역만</label>
              </>}
              <button type="button" onClick={() => fileRef.current?.click()} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">{parsed ? "다른 엑셀" : "엑셀 올리기"}</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            {!parsed ? (
              <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}
                className="w-full px-6 py-14 text-center hover:bg-[#F8FAFD]">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEF2FA] text-[#2D4C82] grid place-items-center text-[26px] font-black">⇪</div>
                <div className="mt-3 text-[17px] font-black text-[#0F1A30]">은행 · 카드 사용내역 엑셀을 끌어다 놓거나 눌러서 올려 주십시오</div>
                <div className="mt-1.5 text-[14px] text-[#5B6B85] leading-relaxed">xlsx · xls · csv · 날짜와 금액(출금액 · 이용금액) 칸이 있으면 됩니다<br />카드 끝 4자리 또는 차량번호로 기사님을 자동으로 찾습니다</div>
                <div className="mt-4 text-[13.5px] text-[#5B6B85]">엑셀이 없으면 오른쪽 표에 금액을 직접 입력하셔도 됩니다.</div>
              </button>
            ) : (
              <div className="max-h-[52vh] overflow-auto">
                <table className="w-full table-fixed">
                  <colgroup><col className="w-[70px]" /><col className="w-[84px]" /><col /><col className="w-[110px]" /><col className="w-[232px]" /></colgroup>
                  <thead className="sticky top-0 z-[1]"><tr className="bg-[#0B1428]">
                    {["일자", "카드", "내용", "금액", "기사님"].map((h, i) => <th key={h} className={`${th} ${i === 3 ? "text-right" : ""}`}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {shown.map((r, k) => (
                      <tr key={r.i} className={`border-b border-[#EEF1F6] ${!assign[r.i] ? "bg-[#F4F7FC]" : k % 2 ? "bg-[#FAFBFD]" : "bg-white"}`}>
                        <td className={`${td} text-[#3A4A66]`} style={NUMF}>{r.date.slice(5).replace("-", ".")}</td>
                        <td className={`${td} text-[#3A4A66]`} style={NUMF}>{cardLast4(r.card) ? `****${cardLast4(r.card)}` : "-"}</td>
                        <td className={`${td} text-[#0F1A30] truncate`} title={r.text}>{r.text || "-"}</td>
                        <td className={`${td} text-right font-black ${r.amount < 0 ? "text-[#2D4C82]" : "text-[#0B1428]"}`} style={NUMF}>{won(r.amount)}</td>
                        <td className={`${td}`}>
                          <div className="flex items-center gap-1.5">
                            <select value={assign[r.i] || ""} onChange={(e) => setRow(r.i, e.target.value)} className={`h-9 w-full min-w-0 px-2 rounded-lg border text-[13.5px] font-bold outline-none ${assign[r.i] ? "border-[#DCE3EE] text-[#0F1A30] bg-white" : "border-[#2D4C82] text-[#2D4C82] bg-white"}`}>
                              <option value="">기사 선택</option>
                              {list.map((d) => <option key={d.id} value={d.id}>{d.이름} · {d.차량번호 || "-"}</option>)}
                            </select>
                            {how[r.i] && how[r.i] !== "직접" && <span className="h-6 px-1.5 rounded-md bg-[#EEF2FA] text-[#2D4C82] text-[11.5px] font-black inline-flex items-center whitespace-nowrap">{how[r.i]}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!shown.length && <tr><td colSpan={5} className="py-12 text-center text-[14.5px] font-bold text-[#5B6B85]">{filter === "need" ? "확인이 필요한 줄이 없습니다" : `${Number(ym.slice(5))}월 내역이 없습니다 · ‘${Number(ym.slice(5))}월 내역만’을 끄면 전체가 보입니다`}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {parsed && <div className="px-4 py-2.5 border-t border-[#EEF1F6] text-[12.5px] text-[#5B6B85]">{file} · 인식한 칸: 일자 ‘{parsed.cols.date}’ · 금액 ‘{parsed.cols.amount}’{parsed.cols.card ? ` · 카드 ‘${parsed.cols.card}’` : ""} · 직접 고른 카드는 저장할 때 기사 정보에 기억됩니다</div>}
          </div>

          {/* 오른쪽 — 기사님별 합계(직접 입력 가능) */}
          <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-hidden lg:sticky lg:top-0">
            <div className="px-4 py-3.5 border-b border-[#EEF1F6] flex items-center"><div className="text-[16px] font-black text-[#0F1A30]">② 기사님별 {Number(ym.slice(5))}월 주유비</div><span className="ml-auto text-[13px] font-bold text-[#5B6B85]">금액을 직접 고칠 수 있습니다</span></div>
            <div className="max-h-[52vh] overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-[1]"><tr className="bg-[#0B1428]">{["기사님", "차량번호", "건수", "주유비"].map((h, i) => <th key={h} className={`${th} ${i >= 2 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {list.map((d, k) => { const saved = fuelOf(d, ym)?.amount || 0; const v = Number(onlyNum(amt[d.id])) || 0; return (
                    <tr key={d.id} className={`border-b border-[#EEF1F6] ${k % 2 ? "bg-[#FAFBFD]" : "bg-white"}`}>
                      <td className={`${td} font-black text-[#0F1A30]`}>{d.이름 || "-"}</td>
                      <td className={`${td} text-[#3A4A66]`} style={NUMF}>{d.차량번호 || "-"}</td>
                      <td className={`${td} text-right text-[#3A4A66]`} style={NUMF}>{sums[d.id]?.count || (saved ? fuelOf(d, ym)?.count || "" : "") || "-"}</td>
                      <td className={`${td} text-right`}>
                        <input inputMode="numeric" value={amt[d.id] ? won(onlyNum(amt[d.id])) : ""} onChange={(e) => setAmt((p) => ({ ...p, [d.id]: onlyNum(e.target.value) }))} placeholder="0"
                          className={`h-9 w-[128px] px-2.5 rounded-lg border text-right text-[15px] font-black outline-none focus:border-[#2D4C82] ${v !== saved ? "border-[#2D4C82] bg-[#F4F7FC] text-[#0F1A30]" : "border-[#DCE3EE] text-[#0F1A30]"}`} style={NUMF} />
                      </td>
                    </tr>); })}
                  {!list.length && <tr><td colSpan={4} className="py-12 text-center text-[14.5px] font-bold text-[#5B6B85]">지입 · 직영 · 임대 기사님이 없습니다</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-[#EEF1F6] bg-[#F8FAFD] flex items-center text-[15px] font-black text-[#0F1A30]"><span>합계</span><span className="ml-auto" style={NUMF}>{won(total)}원</span></div>
          </div>
        </div>

        <div className="px-6 py-4 bg-white border-t border-[#E3E8F0] flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] text-[#5B6B85]">{need.length ? `기사님이 지정되지 않은 ${need.length}건은 합계에 들어가지 않습니다.` : "저장하면 지급명세서 공제에 ‘주유비’로 바로 반영됩니다."}</span>
          {err && <span className="text-[13.5px] font-black text-[#C62F25]">{err}</span>}
          <button type="button" onClick={() => onClose?.()} disabled={busy} className="ml-auto h-11 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-black text-[#5B6B85]">취소</button>
          <button type="button" onClick={save} disabled={busy || (!changed.length && !rows.some((r) => how[r.i] === "직접"))} className="h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-40">{busy ? "저장 중…" : `저장${changed.length ? ` · ${changed.length}명` : ""}`}</button>
        </div>
      </div>
    </div>, document.body);
}
