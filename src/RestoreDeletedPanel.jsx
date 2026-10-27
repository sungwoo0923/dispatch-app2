// ======================= src/RestoreDeletedPanel.jsx =======================
// ⭐ 삭제 오더 복구(2026-10-27, 최고관리자 전용)
//  - 지운 날짜를 고르면 그날 프로그램에서 삭제한 오더를 "지우기 직전 내용"으로 보여주고, 골라서 되살린다.
//  - 서버가 Firestore의 지난 시점 읽기(특정 시점 복구, PITR)를 쓴다 — 콘솔에서 PITR이 켜져 있어야 최근 7일까지 가능.
import React from "react";
import { auth, FUNCTIONS_BASE } from "./firebase";

async function callApi(body) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/restoreDeleted`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("서버 응답을 받지 못했습니다. 서버 배포 여부를 확인하거나 잠시 후 다시 시도해 주세요.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* 무시 */ }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

const CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

export default function RestoreDeletedPanel() {
  const [date, setDate] = React.useState(() => new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [data, setData] = React.useState(null);
  const [sel, setSel] = React.useState(() => new Set());
  const [done, setDone] = React.useState(null);

  const list = async () => {
    setBusy("list"); setErr(""); setDone(null); setSel(new Set());
    try { setData(await callApi({ action: "list", date })); } catch (e) { setErr(e.message); setData(null); } finally { setBusy(""); }
  };
  const restore = async () => {
    const items = (data?.items || []).filter((x) => sel.has(`${x.col}/${x.id}`)).map(({ col, id, at }) => ({ col, id, at }));
    if (!items.length) return;
    if (!window.confirm(`선택한 오더 ${items.length}건을 되살릴까요?\n(지우기 직전 내용 그대로 다시 생깁니다)`)) return;
    setBusy("restore"); setErr("");
    try {
      const d = await callApi({ action: "restore", items });
      setDone(d);
      setData((prev) => prev && { ...prev, items: prev.items.filter((x) => !sel.has(`${x.col}/${x.id}`)) });
      setSel(new Set());
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  };

  const items = data?.items || [];
  const allOn = items.length > 0 && items.every((x) => sel.has(`${x.col}/${x.id}`));
  const toggle = (k) => setSel((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className={CARD}>
      <div className="px-5 sm:px-6 py-5 border-b border-[#EEF1F6]">
        <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">RESTORE</div>
        <div className="text-[18px] font-black text-[#0F1A30]">삭제 오더 복구</div>
        <div className="text-[13.5px] text-[#5B6B85] mt-1">
          <b className="text-[#0F1A30]">지운 날짜</b>를 고르면 그날 프로그램에서 삭제한 오더를 지우기 직전 내용으로 보여줍니다. 골라서 되살릴 수 있습니다.
        </div>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[13px] font-bold text-[#7A879C]">지운 날짜</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#4B6CB7]" />
          <button onClick={list} disabled={!!busy || !date}
            className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-50">
            {busy === "list" ? "찾는 중…" : "조회"}
          </button>
        </div>

        {err && <div className="text-[13px] font-bold text-[#0F1A30]">⚠ {err}</div>}

        {data && (
          <div className="px-4 py-3 rounded-2xl bg-[#F5F8FD] border border-[#EDF1F7] text-[13px] text-[#0F1A30] space-y-1">
            <div><b>{data.date}</b> 삭제 기록 {data.logged}건 · 되살릴 수 있는 오더 <b>{items.length}</b>건
              {data.already ? ` · 이미 되살아남 ${data.already}건` : ""}{data.missing ? ` · 내용을 못 읽음 ${data.missing}건` : ""}</div>
            {(data.pitrOff || (data.logged > 0 && items.length === 0 && (data.missing || data.failed))) && (
              <div className="text-[12.5px] text-[#5B6B85]">
                지우기 전 내용을 읽을 수 없습니다. Firebase 콘솔 → Firestore Database → <b>재해 복구(Disaster recovery)</b>에서
                <b> 특정 시점 복구(PITR)</b>가 켜져 있어야 최근 7일까지 읽을 수 있습니다(꺼져 있으면 1시간 전까지만).
              </div>
            )}
          </div>
        )}
        {done && <div className="text-[13.5px] font-bold text-[#0F1A30]">{done.restored}건 되살림 완료 — 배차현황에서 확인해 보세요.</div>}

        {items.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-[13px] font-bold text-[#0F1A30]">
                <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(items.map((x) => `${x.col}/${x.id}`)))} />
                전체 선택 ({sel.size}/{items.length})
              </label>
              <button onClick={restore} disabled={!!busy || sel.size === 0}
                className="h-11 px-6 rounded-2xl bg-[#0F1A30] text-white text-[14.5px] font-black disabled:opacity-40">
                {busy === "restore" ? "되살리는 중…" : `선택 복구 (${sel.size}건)`}
              </button>
            </div>
            <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
              {items.map((x, i) => {
                const k = `${x.col}/${x.id}`;
                return (
                  <label key={k} className={`grid grid-cols-[24px_70px_86px_minmax(0,1fr)] sm:grid-cols-[24px_70px_96px_minmax(0,1fr)_minmax(0,1.4fr)_120px_110px] gap-x-3 gap-y-0.5 items-center px-4 py-3 text-[13.5px] cursor-pointer ${i > 0 ? "border-t border-[#EEF1F6]" : ""} ${sel.has(k) ? "bg-[#EEF3FB]" : ""}`}>
                    <input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} />
                    <span className="text-[#7A879C] font-semibold tabular-nums">{fmtTime(x.at)} 삭제</span>
                    <span className="font-extrabold text-[#0F1A30] tabular-nums">{x.상차일 || "-"}</span>
                    <span className="font-bold text-[#0F1A30] truncate">{x.거래처명 || "-"}</span>
                    <span className="text-[#3A4A66] truncate col-start-4 sm:col-start-auto">{x.상차지명 || "-"} → {x.하차지명 || "-"}</span>
                    <span className="text-[#5B6B85] font-semibold truncate col-start-4 sm:col-start-auto">{x.차량번호 || x.배차상태 || ""}</span>
                    <span className="text-[#0F1A30] font-bold tabular-nums col-start-4 sm:col-start-auto sm:text-right">{Number(x.청구운임 || 0).toLocaleString()}원</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
