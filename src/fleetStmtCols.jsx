// ======================= src/fleetStmtCols.jsx =======================
// 🧾 2026-11-27 지급명세서 운행 내역 칸 설정(업체 요청) — 회사마다 보일 칸 · 순서 · 칸 이름을 고른다
//  · 저장: colLayoutsCompany/{회사}.stmtTripCols = [{ k, label }] (직원 누구나 · 입력칸 설정과 같은 문서)
//  · 기본값 = 예전과 같은 5칸(일자 · 거래처 · 상차 · 하차 · 운임) — 설정하지 않은 회사는 그대로
//  · 운임은 늘 맨 끝(뺄 수 없음) · 발송한 명세서에는 그때의 칸이 함께 저장된다(기사앱에서도 같은 모양)
//  · 보여 주는 모양만 바뀐다 — 오더 값은 그대로(값을 고치려면 운행 내역 줄을 눌러 오더를 고친다)
import React from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export const STMT_COL_DEFS = [
  { k: "date", label: "일자", hint: "상차일" },
  { k: "dropDate", label: "하차일" },
  { k: "client", label: "거래처" },
  { k: "from", label: "상차", hint: "상차지" },
  { k: "to", label: "하차", hint: "하차지" },
  { k: "route", label: "구간", hint: "상차지 → 하차지 한 칸" },
  { k: "via", label: "경유" },
  { k: "carNo", label: "차량번호" },
  { k: "driver", label: "기사" },
  { k: "cargo", label: "화물" },
  { k: "ton", label: "톤수" },
  { k: "routeName", label: "노선" },
  { k: "fare", label: "운임", locked: true },
];
const DEF = new Map(STMT_COL_DEFS.map((c) => [c.k, c]));
export const STMT_COLS_DEFAULT = ["date", "client", "from", "to", "fare"].map((k) => ({ k, label: DEF.get(k).label }));
export function cleanCols(v) {
  const seen = new Set();
  const out = (Array.isArray(v) ? v : []).filter((c) => c && DEF.has(c.k) && c.k !== "fare" && !seen.has(c.k) && seen.add(c.k))
    .map((c) => ({ k: c.k, label: String(c.label || DEF.get(c.k).label).slice(0, 12) }));
  const fare = (Array.isArray(v) ? v : []).find((c) => c?.k === "fare");
  return out.length ? [...out, { k: "fare", label: String(fare?.label || "운임").slice(0, 12) }] : STMT_COLS_DEFAULT;
}
// 운행 한 줄 → 칸 값
export function tripCell(t, k) {
  if (k === "date") return String(t.date || "").slice(5).replace("-", ".");
  if (k === "dropDate") return String(t.dropDate || "").slice(5).replace("-", ".") || "-";
  if (k === "route") return `${t.from || "-"} → ${t.to || "-"}`;
  if (k === "via") return Array.isArray(t.via) ? t.via.join(", ") : (t.via || "");
  if (k === "routeName") return t.route || "";
  return t[k] ?? "";
}

export function useStmtCols(co) {
  const [cols, setCols] = React.useState(STMT_COLS_DEFAULT);
  React.useEffect(() => (co ? onSnapshot(doc(db, "colLayoutsCompany", co), (s) => setCols(cleanCols(s.exists() ? s.data()?.stmtTripCols : null)), () => setCols(STMT_COLS_DEFAULT)) : undefined), [co]);
  return cols;
}

export function StmtColsModal({ open, co, onClose }) {
  const cur = useStmtCols(co);
  const [list, setList] = React.useState(cur);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { if (open) { setList(cur); setErr(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const on = new Set(list.map((c) => c.k));
  const body = list.filter((c) => c.k !== "fare");
  const fare = list.find((c) => c.k === "fare") || { k: "fare", label: "운임" };
  const toggle = (k) => setList((p) => (on.has(k) ? p.filter((c) => c.k !== k) : [...p.filter((c) => c.k !== "fare"), { k, label: DEF.get(k).label }, p.find((c) => c.k === "fare") || { k: "fare", label: "운임" }]));
  const move = (i, d) => setList((p) => { const b = p.filter((c) => c.k !== "fare"); const j = i + d; if (j < 0 || j >= b.length) return p; [b[i], b[j]] = [b[j], b[i]]; return [...b, p.find((c) => c.k === "fare") || fare]; });
  const rename = (k, label) => setList((p) => p.map((c) => (c.k === k ? { ...c, label } : c)));
  const save = async () => {
    if (!body.length) { setErr("운임 말고 한 칸 이상 골라 주십시오."); return; }
    setBusy(true); setErr("");
    try { await setDoc(doc(db, "colLayoutsCompany", co), { companyName: co, stmtTripCols: cleanCols(list) }, { merge: true }); onClose?.(true); }
    catch (e) { setErr(String(e?.code || "").includes("permission") ? "저장할 권한이 없습니다." : `저장하지 못했습니다: ${e?.message || e}`); }
    finally { setBusy(false); }
  };
  const chip = (o) => `h-10 px-3.5 rounded-xl text-[14px] font-black border transition ${o ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#9FB0CC]"}`;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="명세서 칸 설정" className="fixed inset-0 z-[99995] flex items-center justify-center p-4" style={{ background: "rgba(8,14,30,.55)" }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="w-[860px] max-w-full max-h-[92vh] flex flex-col rounded-[24px] bg-white overflow-hidden shadow-[0_30px_80px_rgba(8,14,30,.45)]">
        <div className="px-6 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 65%,#2D4C82)" }}>
          <div className="text-[12px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">STATEMENT · COLUMNS</div>
          <div className="text-[22px] font-black mt-0.5">명세서 칸 설정</div>
          <div className="text-[14px] text-white/75 mt-1">지급명세서 운행 내역에 보일 칸과 순서 · 칸 이름을 정합니다. 우리 회사 모든 명세서에 적용됩니다.</div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <div className="text-[15px] font-black text-[#0F1A30] mb-2.5">① 보일 칸 고르기</div>
            <div className="flex flex-wrap gap-2">
              {STMT_COL_DEFS.filter((c) => !c.locked).map((c) => <button key={c.k} type="button" onClick={() => toggle(c.k)} className={chip(on.has(c.k))} title={c.hint || ""}>{on.has(c.k) ? "✓ " : ""}{c.label}{c.hint ? <span className={`ml-1 text-[12px] font-bold ${on.has(c.k) ? "text-white/60" : "text-[#9AA9C3]"}`}>{c.hint}</span> : null}</button>)}
              <span className={`${chip(true)} inline-flex items-center opacity-70`} title="운임은 늘 맨 끝에 보입니다">✓ 운임(고정)</span>
            </div>
          </div>
          <div>
            <div className="text-[15px] font-black text-[#0F1A30] mb-2.5">② 순서 · 칸 이름</div>
            <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
              {[...body, fare].map((c, i) => (
                <div key={c.k} className={`grid grid-cols-[44px_140px_minmax(0,1fr)_92px] items-center gap-3 px-4 py-2.5 ${i ? "border-t border-[#EEF1F6]" : ""} ${c.k === "fare" ? "bg-[#F8FAFD]" : "bg-white"}`}>
                  <span className="text-[14px] font-black text-[#9AA9C3] text-center" style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  <span className="text-[14px] font-bold text-[#5B6B85]">{DEF.get(c.k).label}{DEF.get(c.k).hint ? ` · ${DEF.get(c.k).hint}` : ""}</span>
                  <input value={c.label} maxLength={12} onChange={(e) => rename(c.k, e.target.value)} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14.5px] font-black text-[#0F1A30] outline-none focus:border-[#2D4C82]" />
                  {c.k === "fare" ? <span className="text-[12.5px] font-bold text-[#9AA9C3] text-center">맨 끝 고정</span> : (
                    <span className="flex gap-1 justify-end">
                      <button type="button" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)} className="w-10 h-10 rounded-xl border border-[#DCE3EE] text-[#1B2B4B] font-black disabled:opacity-30">▲</button>
                      <button type="button" aria-label="아래로" disabled={i >= body.length - 1} onClick={() => move(i, 1)} className="w-10 h-10 rounded-xl border border-[#DCE3EE] text-[#1B2B4B] font-black disabled:opacity-30">▼</button>
                    </span>)}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[15px] font-black text-[#0F1A30] mb-2.5">③ 미리 보기</div>
            <div className="rounded-2xl border border-[#E3E8F0] overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead><tr className="bg-[#F5F8FD]">{[...body, fare].map((c) => <th key={c.k} className={`px-3 py-2.5 font-black text-[#1B2B4B] whitespace-nowrap ${c.k === "fare" ? "text-right" : "text-left"}`}>{c.label || DEF.get(c.k).label}</th>)}</tr></thead>
                <tbody><tr>{[...body, fare].map((c) => <td key={c.k} className={`px-3 py-2.5 text-[#0F1A30] whitespace-nowrap ${c.k === "fare" ? "text-right font-black" : ""}`} style={{ fontVariantNumeric: "tabular-nums" }}>{tripCell({ date: "2026-11-03", dropDate: "2026-11-03", client: "에이제이", from: "안성", to: "평택초저온", via: [], carNo: "충북84아1177", driver: "이준희", cargo: "냉동식품", ton: "11톤", route: "", fare: "165,000" }, c.k) || "-"}</td>)}</tr></tbody>
              </table>
            </div>
            <div className="mt-2 text-[13px] text-[#5B6B85]">보이는 모양만 바뀝니다. 날짜 · 차량번호 등 값을 고치려면 개별 정산서의 운행 내역 줄을 눌러 오더를 수정해 주십시오.</div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E3E8F0] flex items-center gap-2">
          <button type="button" onClick={() => setList(STMT_COLS_DEFAULT)} className="h-11 px-4 rounded-xl border border-[#DCE3EE] text-[14px] font-black text-[#1B2B4B]">기본값으로</button>
          {err && <span className="text-[13.5px] font-black text-[#C62F25]">{err}</span>}
          <button type="button" onClick={() => onClose?.()} disabled={busy} className="ml-auto h-11 px-5 rounded-xl border border-[#DCE3EE] text-[14.5px] font-black text-[#5B6B85]">취소</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-40">{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>, document.body);
}
