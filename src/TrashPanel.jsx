// ======================= src/TrashPanel.jsx =======================
// 🗑️ 휴지통(2026-10-27) — 프로그램에서 지운 오더는 어떤 화면에서 지웠든 7일 동안 보관된다(서버가 자동 보관).
//   지운 기간을 고르면 목록이 나오고, 골라서 되살린다. 관리자는 자기 회사 것만, 최고관리자는 전체.
//   휴지통이 생기기 전에 지운 오더는 Firebase "특정 시점 복구(PITR)"가 켜져 있을 때만 최고관리자에게 함께 보인다.
import React from "react";
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

  const input = "h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
  return (
    <div className={KP_CARD}>
      <KpCardHead eyebrow="TRASH" title="휴지통"
        desc={<>지운 오더는 <b className="text-[#0F1A30]">7일 동안</b> 여기에 보관됩니다. 골라서 지우기 직전 그대로 되살릴 수 있습니다.</>} />
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
            <button onClick={restore} disabled={!!busy || sel.size === 0}
              className="h-11 px-6 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-40 shadow-[0_8px_18px_rgba(15,26,48,0.22)]">
              {busy === "restore" ? "되살리는 중…" : `선택 복구 (${sel.size}건)`}
            </button>
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
    </div>
  );
}
