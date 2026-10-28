// ======================= src/TrashPanel.jsx =======================
// 🗑️ 휴지통(2026-10-27) — 프로그램에서 지운 오더는 어떤 화면에서 지웠든 7일 동안 보관된다(서버가 자동 보관).
//   지운 기간을 고르면 목록이 나오고, 골라서 되살린다. 관리자는 자기 회사 것만, 최고관리자는 전체.
//   휴지통이 생기기 전에 지운 오더는 Firebase "특정 시점 복구(PITR)"가 켜져 있을 때만 최고관리자에게 함께 보인다.
import React from "react";
import { imeFocusRef } from "./imeFocus";
import { callFn, KP_CARD, KpCardHead, kstToday, addDays, won } from "./kpApi";

const fmtAt = (ms) => new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function TrashPanel({ company = "" }) {
  const [from, setFrom] = React.useState(() => addDays(kstToday(), -6));
  const [to, setTo] = React.useState(kstToday);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [data, setData] = React.useState(null);
  const [sel, setSel] = React.useState(() => new Set());
  const [done, setDone] = React.useState(null);
  const [purgeAsk, setPurgeAsk] = React.useState(false);
  const [purgeText, setPurgeText] = React.useState("");
  const [purgeProg, setPurgeProg] = React.useState(null); // { done, total }

  const load = React.useCallback(async () => {
    setBusy("list"); setErr(""); setSel(new Set());
    try { setData(await callFn("restoreDeleted", { action: "list", from, to, company })); } catch (e) { setErr(e.message); setData(null); } finally { setBusy(""); }
  }, [from, to, company]);
  React.useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = React.useMemo(() => {
    const k = q.trim().toLowerCase();
    const all = data?.items || [];
    if (!k) return all;
    return all.filter((x) => [x.거래처명, x.상차지명, x.하차지명, x.차량번호, x.deletedBy].some((v) => String(v || "").toLowerCase().includes(k)));
  }, [data, q]);
  const keyOf = (x) => `${x.col}/${x.id}`;
  const allOn = items.length > 0 && items.every((x) => sel.has(keyOf(x)));
  const toggle = (k) => setSel((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const restore = async () => {
    const list = (data?.items || []).filter((x) => sel.has(keyOf(x))).map(({ col, id, at }) => ({ col, id, at }));
    if (!list.length) return;
    if (!window.confirm(`선택한 오더 ${list.length}건을 되살릴까요?\n지우기 직전 내용 그대로 다시 생깁니다.`)) return;
    setBusy("restore"); setErr("");
    try {
      const d = await callFn("restoreDeleted", { action: "restore", items: list, company });
      setDone(d.restored);
      setData((p) => p && { ...p, items: p.items.filter((x) => !sel.has(keyOf(x))) });
      setSel(new Set());
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  // 🔥 완전삭제 — 5건씩 나눠 보내며 진행률을 보여준다. 되돌릴 수 없다.
  const purge = async () => {
    const list = (data?.items || []).filter((x) => sel.has(keyOf(x))).map(({ col, id }) => ({ col, id }));
    if (!list.length) return;
    setPurgeAsk(false); setPurgeText(""); setErr("");
    setPurgeProg({ done: 0, total: list.length });
    const gone = new Set();
    try {
      for (let i = 0; i < list.length; i += 5) {
        const chunk = list.slice(i, i + 5);
        await callFn("restoreDeleted", { action: "purge", items: chunk, company });
        chunk.forEach((x) => gone.add(`${x.col}/${x.id}`));
        setPurgeProg({ done: Math.min(list.length, i + chunk.length), total: list.length });
      }
      setDone(null);
    } catch (e) { setErr(`완전삭제 중 오류 — ${gone.size}건까지 지웠습니다: ${e.message}`); }
    setData((p) => p && { ...p, items: p.items.filter((x) => !gone.has(keyOf(x))) });
    setSel(new Set());
    setTimeout(() => setPurgeProg(null), 600);
  };

  const input = "h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
  return (
    <div className={KP_CARD}>
      <KpCardHead eyebrow="TRASH" title="휴지통"
        desc={<>지운 오더는 <b className="text-[#0F1A30]">7일 동안</b> 여기에 보관됩니다. 골라서 되살리거나, <b className="text-[#0F1A30]">완전삭제</b>로 흔적 없이 지울 수 있습니다.</>} />
      <div className="px-5 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-[#7A879C]">지운 날</span>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className={input} />
          <span className="text-[13px] font-bold text-[#7A879C]">~</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} />
          <button onClick={load} disabled={!!busy} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">
            {busy === "list" ? "찾는 중…" : "조회"}
          </button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처·상하차지·차량번호·지운 사람" className={`${input} flex-1 min-w-[200px] font-medium`} />
        </div>

        {err && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {err}</div>}
        {done != null && <div className="px-4 py-3 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7] text-[13.5px] font-bold text-[#0F1A30]">{done}건 되살림 완료 — 배차현황에서 바로 보입니다.</div>}
        {data?.pitrOff && (
          <div className="px-4 py-3 rounded-2xl border border-[#E3E8F0] text-[12.5px] text-[#5B6B85]">
            휴지통이 생기기 전에 지운 오더 {data.missing || ""}건은 내용을 읽지 못했습니다(Firebase 콘솔의 "특정 시점 복구"가 꺼져 있음).
          </div>
        )}

        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-[13.5px] font-bold text-[#0F1A30]">
              <input type="checkbox" checked={allOn} disabled={!items.length} onChange={() => setSel(allOn ? new Set() : new Set(items.map(keyOf)))} />
              전체 선택 <span className="text-[#7A879C] font-semibold">({sel.size}/{items.length}건)</span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => setPurgeAsk(true)} disabled={!!busy || !!purgeProg || sel.size === 0}
                className="h-11 px-5 rounded-2xl border border-[#0F1A30] text-[#0F1A30] text-[14px] font-black disabled:opacity-30">
                완전삭제
              </button>
              <button onClick={restore} disabled={!!busy || !!purgeProg || sel.size === 0}
                className="h-11 px-6 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-40 shadow-[0_8px_18px_rgba(15,26,48,0.22)]">
                {busy === "restore" ? "되살리는 중…" : `선택 복구 (${sel.size}건)`}
              </button>
            </div>
          </div>
        )}

        {data && (items.length === 0 ? (
          <div className="px-5 py-10 rounded-2xl border border-dashed border-[#DCE3EE] text-center text-[13.5px] text-[#9AA9C3]">이 기간에 지운 오더가 없습니다</div>
        ) : (
          <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
            {items.map((x, i) => {
              const k = keyOf(x);
              return (
                <label key={k} className={`grid grid-cols-[22px_minmax(0,1fr)] sm:grid-cols-[22px_108px_92px_minmax(0,1fr)_minmax(0,1.5fr)_110px_104px] gap-x-3 gap-y-0.5 items-center px-4 py-3 text-[13.5px] cursor-pointer ${i ? "border-t border-[#EEF1F6]" : ""} ${sel.has(k) ? "bg-[#EEF3FB]" : "hover:bg-[#F8FAFD]"}`}>
                  <input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} />
                  <span className="text-[12.5px] text-[#7A879C] font-semibold leading-tight">{fmtAt(x.at)}<br className="hidden sm:block" /><span className="sm:hidden"> · </span>{x.deletedBy ? x.deletedBy.split("@")[0] : ""}</span>
                  <span className="font-extrabold text-[#0F1A30] tabular-nums col-start-2 sm:col-start-auto">{x.상차일 || "-"}</span>
                  <span className="font-bold text-[#0F1A30] truncate col-start-2 sm:col-start-auto">{x.거래처명 || "-"}</span>
                  <span className="text-[#3A4A66] truncate col-start-2 sm:col-start-auto">{x.상차지명 || "-"} → {x.하차지명 || "-"}</span>
                  <span className="text-[#5B6B85] font-semibold truncate col-start-2 sm:col-start-auto">{x.차량번호 || x.배차상태 || ""}</span>
                  <span className="text-[#0F1A30] font-bold tabular-nums col-start-2 sm:col-start-auto sm:text-right">{won(x.청구운임)}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>

      {/* 완전삭제 확인 — "완전삭제"를 직접 입력해야 진행 */}
      {purgeAsk && (
        <div className="fixed inset-0 z-[1000000] bg-[#0F1A30]/50 flex items-center justify-center p-4" onClick={() => setPurgeAsk(false)}>
          <div className="w-full max-w-[440px] bg-white rounded-[22px] shadow-[0_24px_60px_rgba(15,26,48,0.35)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 bg-[#0F1A30] text-white">
              <div className="text-[11px] font-extrabold tracking-[0.22em] text-white/60">PERMANENT DELETE</div>
              <div className="text-[19px] font-black">완전삭제 · {sel.size}건</div>
            </div>
            <div className="px-6 py-5 space-y-3 text-[13.5px] text-[#3A4A66] leading-relaxed">
              <p>선택한 오더를 <b className="text-[#0F1A30]">휴지통·첨부파일·화주사 사본·기사 알림·운행기록 사본·구글시트 줄</b>까지 모두 지웁니다.</p>
              <p className="font-black text-[#0F1A30]">지운 뒤에는 절대 되돌릴 수 없습니다.</p>
              <input value={purgeText} onChange={(e) => setPurgeText(e.target.value)} placeholder="계속하려면 '완전삭제'를 입력하세요" ref={imeFocusRef}
                className="w-full h-11 px-3.5 rounded-xl border border-[#DCE3EE] text-[14px] font-bold text-[#0F1A30] outline-none focus:border-[#0F1A30]" />
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setPurgeAsk(false)} className="flex-1 h-12 rounded-2xl border border-[#E3E8F0] text-[#0F1A30] text-[14.5px] font-black">취소</button>
              <button onClick={purge} disabled={purgeText.trim() !== "완전삭제"} className="flex-[1.3] h-12 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-30">완전삭제</button>
            </div>
          </div>
        </div>
      )}
      {/* 완전삭제 진행률 */}
      {purgeProg && (
        <div className="fixed inset-0 z-[1000001] bg-[#0F1A30]/60 flex items-center justify-center p-4">
          <div className="w-full max-w-[380px] bg-white rounded-[22px] px-7 py-7 shadow-[0_24px_60px_rgba(15,26,48,0.35)] text-center">
            <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">DELETING</div>
            <div className="text-[44px] font-black text-[#0F1A30] tabular-nums leading-tight mt-1">{Math.round((purgeProg.done / purgeProg.total) * 100)}<span className="text-[20px]">%</span></div>
            <div className="mt-3 h-2.5 rounded-full bg-[#EEF1F6] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#1B2B4B] to-[#4B6CB7] transition-all duration-300" style={{ width: `${(purgeProg.done / purgeProg.total) * 100}%` }} />
            </div>
            <div className="mt-3 text-[13px] font-bold text-[#5B6B85]">{purgeProg.done} / {purgeProg.total}건 완전삭제 {purgeProg.done === purgeProg.total ? "완료" : "중… 창을 닫지 마세요"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
