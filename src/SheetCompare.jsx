// ======================= src/SheetCompare.jsx =======================
// 🔍 2026-11-16 구글시트 연동 › [프로그램 비교] — 시트와 프로그램 오더가 지금 같은지 실시간으로 확인하는 팝업
//  · 서버가 시트를 읽어 실시간 반영과 같은 규칙으로 짝을 짓고(아무것도 쓰지 않음) 다른 값 · 시트에만 · 프로그램에만을 돌려준다
//  · [실시간 확인]을 켜 두면 20초마다 다시 비교한다 · 다른 게 있으면 [지금 반영]으로 시트 값을 프로그램에 맞춘다
import React from "react";
import { createPortal } from "react-dom";
import { sheetLiveCompare, sheetLiveRunNow } from "./CarrierMigratePanel";

const NUM = { fontVariantNumeric: "tabular-nums" };
const C = { ink: "#0F1A30", sub: "#5B6B85", mute: "#8D97AB", line: "#E3E8F0", ok: "#0F7A52", warn: "#B25F00", bad: "#C62F25", blue: "#2457D6" };
const LABEL = { 이름: "기사명", 화물내용: "화물", 차량톤수: "톤수", 차량종류: "차종" };
const val = (v) => (v === "" || v == null ? "(빈칸)" : typeof v === "number" ? v.toLocaleString("ko-KR") : String(v));
const route = (x) => `${x.상차지명 || "-"} → ${x.하차지명 || "-"}`;
const ago = (ms, now) => { if (!ms) return ""; const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 5 ? "방금" : s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`; };

export function SheetCompareModal({ co, onClose }) {
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [live, setLive] = React.useState(true);
  const [tab, setTab] = React.useState("diff");
  const [now, setNow] = React.useState(Date.now());
  const runRef = React.useRef(false);
  const load = React.useCallback(async () => {
    if (runRef.current) return; runRef.current = true; setBusy((b) => b || "load"); setErr("");
    try { setRes(await sheetLiveCompare(co)); } catch (e) { setErr(e?.message || String(e)); } finally { runRef.current = false; setBusy(""); }
  }, [co]);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (!live) return undefined; const t = setInterval(load, 20000); return () => clearInterval(t); }, [live, load]);
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const fix = async () => { setBusy("fix"); setErr(""); try { await sheetLiveRunNow(co); runRef.current = false; await load(); } catch (e) { setErr(e?.message || String(e)); setBusy(""); } };

  const total = res ? res.diffCount + res.sheetOnlyCount + res.programOnlyCount : 0;
  const allSame = res && total === 0;
  const cards = res ? [
    ["same", "같음", res.same, C.ok], ["diff", "값이 다름", res.diffCount, res.diffCount ? C.bad : C.mute],
    ["sheet", "시트에만 있음", res.sheetOnlyCount, res.sheetOnlyCount ? C.warn : C.mute], ["prog", "프로그램에만 있음", res.programOnlyCount, res.programOnlyCount ? C.warn : C.mute],
  ] : [];
  const node = (
    <div className="fixed inset-0 z-[100040] flex items-center justify-center p-3 sm:p-6" style={{ background: "rgba(11,20,40,.5)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[1000px] max-h-[92vh] rounded-[22px] bg-white flex flex-col overflow-hidden" role="dialog" aria-label="프로그램 비교" data-kp="sheet-compare">
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[#E3E8F0] flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.22em]" style={{ color: C.blue }}>SHEET ↔ PROGRAM</div>
            <div className="text-[19px] font-black" style={{ color: C.ink }}>프로그램 비교 · {co}</div>
            <div className="text-[13px] mt-0.5" style={{ color: C.sub }}>
              {res ? <>상차일 <b style={NUM}>{res.from}</b>부터 · 탭 {res.tabs.length}개 · 시트 {res.sheetRows.toLocaleString()}줄 · 프로그램 {res.programRows.toLocaleString()}건 · <span style={NUM}>{ago(res.at, now)}</span> 확인</> : "시트를 읽는 중이에요…"}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13.5px] font-bold cursor-pointer" style={{ color: C.sub }}>
            <input type="checkbox" id="cmp-live" checked={live} onChange={(e) => setLive(e.target.checked)} className="w-4 h-4 accent-[#2457D6]" />실시간 확인(20초마다)
          </label>
          <button type="button" onClick={load} disabled={!!busy} className="h-10 px-4 rounded-xl border border-[#DCE3EE] text-[14px] font-bold disabled:opacity-40">{busy === "load" ? "비교 중…" : "다시 비교"}</button>
          <button type="button" aria-label="닫기" onClick={onClose} className="w-10 h-10 rounded-xl border border-[#DCE3EE] text-[18px]">×</button>
        </div>
        <div className="px-5 sm:px-6 py-4 border-b border-[#E3E8F0]">
          {err && <div className="mb-3 text-[13.5px] font-bold" style={{ color: C.bad }}>비교하지 못했어요. {err}</div>}
          {res && (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-[17px] font-black" style={{ color: allSame ? C.ok : C.bad }}>{allSame ? "✓ 시트와 프로그램이 같아요" : `다른 곳 ${total.toLocaleString()}건`}</div>
              <div className="flex gap-2 flex-wrap ml-auto">
                {cards.map(([k, l, v, col]) => (
                  <button key={k} type="button" disabled={k === "same"} onClick={() => setTab(k)} aria-pressed={tab === k}
                    className={`px-3.5 py-2 rounded-xl border text-left ${tab === k && k !== "same" ? "border-[#0F1A30]" : "border-[#E3E8F0]"}`}>
                    <div className="text-[12px] font-bold" style={{ color: C.mute }}>{l}</div>
                    <div className="text-[20px] font-black leading-tight" style={{ ...NUM, color: col }}>{v.toLocaleString()}</div>
                  </button>))}
              </div>
            </div>)}
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          {!res ? <div className="py-16 text-center text-[14px]" style={{ color: C.mute }}>{busy ? "시트를 읽고 프로그램 오더와 맞춰 보는 중이에요…" : ""}</div>
            : tab === "diff" ? (res.diffs.length ? (
              <div className="space-y-2">
                {res.diffs.map((d) => (
                  <div key={d.id} className="rounded-xl border border-[#E3E8F0] px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap text-[13.5px]" style={NUM}><b>{d.상차일}</b><span className="font-bold">{d.거래처명}</span><span style={{ color: C.sub }}>{route(d)}</span><span className="ml-auto text-[12px]" style={{ color: C.mute }}>{d.이전출처}</span></div>
                    <div className="mt-2 grid gap-1">
                      {d.fields.map((f) => (
                        <div key={f.k} className="grid grid-cols-[86px_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[13px]" style={NUM}>
                          <span className="font-bold" style={{ color: C.sub }}>{LABEL[f.k] || f.k}</span>
                          <span className="truncate"><span className="text-[11.5px] mr-1" style={{ color: C.mute }}>프로그램</span>{val(f.program)}</span>
                          <span className="truncate font-black" style={{ color: C.bad }}><span className="text-[11.5px] font-bold mr-1" style={{ color: C.mute }}>시트</span>{val(f.sheet)}</span>
                        </div>))}
                    </div>
                  </div>))}
                {res.diffCount > res.diffs.length && <div className="text-center text-[13px]" style={{ color: C.mute }}>외 {res.diffCount - res.diffs.length}건</div>}
              </div>) : <Empty text="값이 다른 오더가 없어요" />)
            : (() => { const list = tab === "sheet" ? res.sheetOnly : res.programOnly; const cnt = tab === "sheet" ? res.sheetOnlyCount : res.programOnlyCount; return list.length ? (
              <div className="overflow-x-auto rounded-xl border border-[#E3E8F0]">
                <table className="kp-plain w-full min-w-[720px] text-[13.5px]" style={NUM}>
                  <thead><tr className="text-[12px]" style={{ color: C.mute }}>{["상차일", "거래처", "구간", "차량 · 기사", "청구", "기사", "시트 위치"].map((h) => <th key={h} className="px-3 py-2 text-left font-bold border-b border-[#E3E8F0]">{h}</th>)}</tr></thead>
                  <tbody>{list.map((x, i) => (
                    <tr key={x.id || `${x.이전출처}-${i}`} className="border-b border-[#EEF1F6] last:border-b-0">
                      <td className="px-3 py-2">{x.상차일}</td><td className="px-3 py-2 font-bold">{x.거래처명}</td><td className="px-3 py-2">{route(x)}</td>
                      <td className="px-3 py-2" style={{ color: C.sub }}>{x.차량번호} {x.이름}</td><td className="px-3 py-2">{val(x.청구운임)}</td><td className="px-3 py-2">{val(x.기사운임)}</td><td className="px-3 py-2 text-[12px]" style={{ color: C.mute }}>{x.이전출처}</td>
                    </tr>))}</tbody>
                </table>
                {cnt > list.length && <div className="p-2 text-center text-[13px]" style={{ color: C.mute }}>외 {cnt - list.length}건</div>}
              </div>) : <Empty text={tab === "sheet" ? "시트에만 있는 줄이 없어요" : "프로그램에만 있는 오더가 없어요"} />; })()}
        </div>
        <div className="px-5 sm:px-6 py-3 border-t border-[#E3E8F0] flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0 text-[12.5px]" style={{ color: C.mute }}>비교는 읽기만 해요. [지금 반영]을 누르면 실시간 반영 규칙대로 시트 값을 프로그램에 맞춰요(프로그램에서 고친 칸은 그대로).</div>
          <button type="button" onClick={fix} disabled={!!busy || !res || allSame} className="h-10 px-5 rounded-xl text-[14px] font-black text-white disabled:opacity-35" style={{ background: C.ink }}>{busy === "fix" ? "반영 중…" : "지금 반영"}</button>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
const Empty = ({ text }) => <div className="py-14 text-center text-[14.5px] font-black" style={{ color: C.ok }}>✓ {text}</div>;

export function SheetCompareButton({ co, className = "" }) {
  const [open, setOpen] = React.useState(false);
  return (<>
    <button type="button" data-kp="sheet-compare-btn" onClick={() => setOpen(true)} className={className || "h-10 px-4 rounded-xl border border-[#2D4C82] text-[#2D4C82] text-[13.5px] font-black whitespace-nowrap"}>프로그램 비교</button>
    {open && <SheetCompareModal co={co} onClose={() => setOpen(false)} />}
  </>);
}
