// ======================= src/CopyCountDialog.jsx =======================
// ⭐ 2026-11-06 오더 복사/수정 패널 [복사 등록] — "몇 건 복사할까요?" 창 (PC·모바일 공용)
//   · 건수 1~30 · 건마다 상차일/하차일(달력) — 처음엔 모두 오늘 · 건별로 바꿀 수 있다
//   · askCopyDates() 를 부르면 창이 뜨고, [복사]를 누르면 [{상차일, 하차일}, …] / 닫으면 null
import React from "react";
import { createRoot } from "react-dom/client";
import CustomDatePicker from "./CustomDatePicker";

const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const MAX = 30;

function CopyCountDialog({ title, sub, mobile, alimtalk, onDone }) {
  const today = kstToday();
  // 💬 2026-11-08 알림톡 보내기(복사본 전체) — 처음 값은 회사 기본값(alimtalk), 안 넘기면 칸을 숨긴다
  const [talk, setTalk] = React.useState(alimtalk === true);
  const [count, setCount] = React.useState(1);
  const [rows, setRows] = React.useState(() => [{ 상차일: today, 하차일: today }]);
  const [err, setErr] = React.useState("");
  const setN = (n) => {
    const v = Math.max(1, Math.min(MAX, parseInt(n, 10) || 1));
    setCount(v);
    setRows((prev) => Array.from({ length: v }, (_, i) => prev[i] || { 상차일: today, 하차일: today }));
    setErr("");
  };
  const setRow = (i, k, v) => setRows((prev) => prev.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, [k]: v };
    if (k === "상차일" && v && (!r.하차일 || r.하차일 < v)) n.하차일 = v; // 상차일을 뒤로 옮기면 하차일도 따라감
    return n;
  }));
  const allSame = (k, v) => setRows((prev) => prev.map((r) => { const n = { ...r, [k]: v }; if (k === "상차일" && n.하차일 < v) n.하차일 = v; return n; }));
  const submit = () => {
    const bad = rows.findIndex((r) => !r.상차일 || !r.하차일 || r.하차일 < r.상차일);
    if (bad >= 0) { setErr(`${bad + 1}번째 — 하차일이 상차일보다 앞설 수 없어요.`); return; }
    onDone(rows.map((r) => ({ ...r, ...(typeof alimtalk === "boolean" ? { 알림톡: talk } : {}) })));
  };
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); onDone(null); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onDone]);
  const dp = "h-9 w-full px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[13.5px] font-semibold text-[#0F1A30] text-left";
  return (
    <div className="fixed inset-0 z-[999990] flex items-center justify-center bg-[#0F1A30]/50 p-3" data-kp="copy-count-dialog"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <div className={`w-full ${mobile ? "max-w-[440px]" : "max-w-[560px]"} max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.38)]`}
        style={{ fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif" }}>
        <div className="px-5 py-4 text-white" style={{ background: "linear-gradient(120deg,#0F1A30 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="text-[16.5px] font-black">{title || "복사 등록"}</div>
          <div className="text-[12.5px] text-white/70 font-semibold mt-0.5">{sub || "몇 건을 복사할지 고르고, 건마다 상차일·하차일을 정해 주세요."}</div>
        </div>
        <div className="px-5 pt-4 pb-3 border-b border-[#E9EDF4] flex items-center gap-3 flex-wrap">
          <span className="text-[13.5px] font-black text-[#1B2B4B]">복사 건수</span>
          <div className="inline-flex items-center rounded-xl border border-[#DCE3EE] overflow-hidden">
            <button type="button" onClick={() => setN(count - 1)} disabled={count <= 1} className="w-10 h-10 text-[18px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] disabled:opacity-30">−</button>
            <input value={count} inputMode="numeric" onChange={(e) => setN(e.target.value.replace(/[^\d]/g, "") || 1)} data-kp="copy-count"
              className="w-14 h-10 text-center text-[16px] font-black text-[#0F1A30] tabular-nums outline-none border-x border-[#DCE3EE]" />
            <button type="button" onClick={() => setN(count + 1)} disabled={count >= MAX} className="w-10 h-10 text-[18px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD] disabled:opacity-30">＋</button>
          </div>
          <span className="text-[12px] font-semibold text-[#7A8AA6]">최대 {MAX}건</span>
          {count > 1 && (
            <button type="button" onClick={() => { allSame("상차일", rows[0].상차일); allSame("하차일", rows[0].하차일); }}
              className="ml-auto h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#2D4C82] hover:bg-[#F5F8FD]">1번 날짜로 모두 맞추기</button>
          )}
        </div>
        <div className="flex-1 overflow-auto px-5 py-3 space-y-2">
          <div className="grid grid-cols-[36px_1fr_1fr] gap-2 text-[12px] font-black text-[#5B6B85] px-1">
            <span>#</span><span>상차일</span><span>하차일</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[36px_1fr_1fr] gap-2 items-center" data-kp="copy-row">
              <span className="w-8 h-8 rounded-lg bg-[#EEF3FB] text-[#1B2B4B] text-[13px] font-black inline-flex items-center justify-center tabular-nums">{i + 1}</span>
              <CustomDatePicker value={r.상차일} onChange={(e) => setRow(i, "상차일", e.target.value)} className={dp} />
              <CustomDatePicker value={r.하차일} onChange={(e) => setRow(i, "하차일", e.target.value)} className={`${dp} ${r.하차일 < r.상차일 ? "!border-[#D92D20]" : ""}`} />
            </div>
          ))}
        </div>
        {typeof alimtalk === "boolean" && (
          <div className="px-5 py-2.5 border-t border-[#E9EDF4] flex items-center gap-3" data-kp="copy-alimtalk">
            <span className="inline-flex items-center justify-center min-w-8 h-8 px-1.5 rounded-lg shrink-0 text-[10.5px] font-black tracking-tight" style={{ background: talk ? "#FEE500" : "#F1F4F8", color: talk ? "#3C1E1E" : "#9AA9C3" }}>TALK</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-black text-[#0F1A30]">알림톡 보내기 <span className="ml-1 text-[11.5px] font-bold text-[#9AA9C3]">{talk === alimtalk ? "회사 기본값" : `복사본만 ${talk ? "켬" : "끔"}`}</span></div>
              <div className="text-[12px] text-[#7A879C]">배차완료되면 거래처 담당자 · 기사에게 보내요 · 건당 약 8~15원</div>
            </div>
            <button type="button" role="switch" aria-checked={talk} aria-label="알림톡 보내기" onClick={() => setTalk((v) => !v)}
              className={`ml-auto relative inline-flex shrink-0 w-11 h-6 rounded-full transition ${talk ? "bg-[#1B2B4B]" : "bg-[#D5DCE7]"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${talk ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        )}
        {err && <div className="px-5 pb-1 text-[13px] font-bold text-[#D92D20]">{err}</div>}
        <div className="px-5 py-4 border-t border-[#E9EDF4] bg-[#F7F9FC] flex gap-2.5">
          <button type="button" onClick={() => onDone(null)} className="flex-1 h-11 rounded-xl border border-[#E3E8F0] bg-white text-[#3A4A66] text-[14px] font-extrabold hover:bg-[#F5F8FD]">취소</button>
          <button type="button" onClick={submit} data-kp="copy-submit" className="flex-[1.4] h-11 rounded-xl bg-[#0F1A30] hover:bg-[#1B2B4B] text-white text-[14.5px] font-black">{count}건 복사</button>
        </div>
      </div>
    </div>
  );
}

let _open = null;
export function askCopyDates(opts = {}) {
  if (_open) return _open;
  _open = new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v) => { resolve(v); _open = null; setTimeout(() => { try { root.unmount(); } catch { /* 무시 */ } host.remove(); }, 0); };
    root.render(<CopyCountDialog {...opts} onDone={done} />);
  });
  return _open;
}
export default CopyCountDialog;
