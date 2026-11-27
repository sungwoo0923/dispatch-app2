// ======================= src/dispatch/OrderWorkAssist.jsx =======================
// 🧭 2026-11-27 오더등록 아래 "작업 도우미" — 실시간배차현황 전체 표(8천 줄 · 글자 칠 때마다 다시 그려져 입력이 느렸다) 대신
//  ① 오늘 배차 현황 한 줄(누르면 실시간배차현황) ② 오늘 내가 등록한 오더(최근 10건 · [방금] 표시 · 누르면 배차현황에서 그 오더)
//  🗓 2026-11-27 시안 D — 위 입력창은 원래대로 두고 오른쪽 '오늘 일정'(요약 · 달력 · 주요 일정)과 아래 '배차 목록'만 새 모양
//   (거래처 최근 노선은 사용자 요청으로 뺐다)
//  사용자 결정: 시안 반영 · 알록달록하지 않게(남색 한 계열) · 우선 최고관리자만(다른 계정은 예전처럼 전체 표)
//  예전 화면은 머리의 [전체 표]로 돌아간다(이 기기에 기억 — kpOrderAssistMode)
import React from "react";
import { isUnassignedOrder } from "../unassignedRule";
import { orderProfit } from "../forkliftCore"; // 수수료 = 청구 − 기사 − 회사가 따로 지급(배차현황 수수료와 같은 식)

const MONO = "'Noto Sans KR','Apple SD Gothic Neo',sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums" };
const C = { ink: "#0F1A30", navy: "#1B2B4B", mid: "#2D4C82", sub: "#5B6B85", dim: "#8A97AD", line: "#E3E8F0", soft: "#F5F7FB", tint: "#EEF3FB" };
const won = (v) => Math.round(Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0).toLocaleString("ko-KR");
const kst = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : v ? Date.parse(v) || 0 : 0);
const hhmm = (ms) => { const d = new Date(ms + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const md = (d) => (d ? `${d.slice(5, 7)}-${d.slice(8, 10)}` : "");
const isCancel = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
const tel = (v) => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(v || ""); };
const idOf = (r) => r?._id || r?.id || r?.docId || "";
// 상태 — 색 대신 남색 진하기 · 모양(빈 원 → 반 · 꽉 찬 원)
const stateOf = (r) => (String(r?.배차상태 || "").trim() === "배차완료" ? "done" : isUnassignedOrder(r) ? "todo" : "wait");
const STATE = { todo: { label: "미배차" }, wait: { label: "배차중" }, done: { label: "배차완료" } };
function StateMark({ k }) {
  // 🎨 2026-11-27 알록달록하지 않게 — 남색 진하기로만: 미배차(점선) · 배차중(옅은 남색) · 배차완료(진한 남색)
  const st = k === "done" ? { background: C.ink, color: "#fff", border: `1px solid ${C.ink}` } : k === "wait" ? { background: C.tint, color: C.navy, border: "1px solid #C9D6EC" } : { background: "#fff", color: "#3A4A66", border: "1px dashed #AEBBD0" };
  return <span className="inline-flex items-center justify-center h-[24px] min-w-[64px] px-2 rounded-full text-[11.5px] font-extrabold" style={st}>{STATE[k].label}</span>;
}

export const readAssistMode = () => { try { return localStorage.getItem("kpOrderAssistMode") === "table" ? "table" : "assist"; } catch { return "assist"; } };
const saveAssistMode = (v) => { try { localStorage.setItem("kpOrderAssistMode", v); } catch { /* 무시 */ } };

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
// 상차시간 — "09:30" · "오후 3시" · "15시 30분" 등 여러 모양을 24시간 "HH:MM" 으로(못 읽으면 맨 뒤 · 그대로 표시)
const timeOf = (r) => {
  const raw = `${String(r.상차시간구분 || "")} ${String(r.상차시간 || "")}`.trim();
  const m = /(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/.exec(raw);
  if (!m) return { k: 9999, txt: String(r.상차시간 || "").trim() || "미정" };
  let h = +m[1]; const mi = +(m[2] || 0);
  if (/오후/.test(raw) && h < 12) h += 12; if (/오전/.test(raw) && h === 12) h = 0;
  return { k: h * 60 + mi, txt: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` };
};

// 오른쪽 '오늘 일정' 카드 — 머리(날짜) · [배차 · 완료 · 미배차] · 달력(calendar 로 받음) · 주요 일정(오늘 상차 · 시간순)
export function SideAssist({ calendar, rows = [] }) {
  const [more, setMore] = React.useState(false);
  const today = kst(0);
  const todayList = React.useMemo(() => (rows || []).filter((r) => !isCancel(r) && r.source !== "transport_transmit" && String(r.상차일 || "").slice(0, 10) === today), [rows, today]);
  const cnt = React.useMemo(() => { const k = { all: todayList.length, todo: 0, wait: 0, done: 0 }; todayList.forEach((r) => { k[stateOf(r)] += 1; }); return k; }, [todayList]);
  const agendaAll = React.useMemo(() => todayList.map((r) => ({ r, t: timeOf(r) })).sort((a, b) => a.t.k - b.t.k), [todayList]);
  const agenda = more ? agendaAll : agendaAll.slice(0, 4);
  const d = new Date(`${today}T00:00:00Z`);
  const open = (r) => { const id = idOf(r); if (id && window.__selectOrder) window.__selectOrder(id); };
  return (
    <div className="flex flex-col" style={{ flex: "1 1 0%", minWidth: 0, fontFamily: MONO, color: C.ink }} data-kp="side-assist">
      <div className="rounded-[18px] overflow-hidden bg-white border border-[#E1E7F0] shadow-[0_10px_28px_rgba(16,24,40,0.06)] flex flex-col">
        <div className="px-4 py-3.5 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#0F1A30,#1B2B4B 60%,#2D4C82)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          <span className="text-[15px] font-black">오늘 일정</span>
          <span className="ml-auto text-[13px] font-bold text-[#C9D3E3]" style={NUM}>{today.replace(/-/g, ".")} ({DOW[d.getUTCDay()]})</span>
        </div>
        <div className="px-3.5 py-3 grid grid-cols-3 gap-[7px]">
          {[["배차", cnt.all], ["완료", cnt.done], ["미배차", cnt.todo]].map(([l, n]) => (
            <div key={l} className="flex items-center justify-center gap-1 h-[30px] rounded-[9px] border border-[#DCE3EE] bg-white text-[12px] font-extrabold text-[#1B2B4B]">
              {l} <b className="font-black" style={NUM}>{n}</b>건
            </div>
          ))}
        </div>
        <div className="px-4 pb-1">{calendar}</div>
        <div className="px-4 pt-3.5 pb-4 mt-2 border-t border-[#EEF2F8]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13.5px] font-black">주요 일정</span>
            {agendaAll.length > 4 && <button type="button" onClick={() => setMore((v) => !v)} className="text-[12px] font-bold text-[#8A97AD] hover:text-[#1B2B4B]">{more ? "접기 ‹" : `더보기 ${agendaAll.length - 4} ›`}</button>}
          </div>
          {agenda.length === 0 ? <div className="text-[12.5px] text-[#8A97AD] py-1.5">오늘 상차 오더가 없어요</div> : (
            <div className={`flex flex-col gap-1 ${more ? "max-h-[220px] overflow-y-auto" : ""}`}>
              {agenda.map(({ r, t }, i) => (
                <button key={idOf(r) || i} type="button" onClick={() => open(r)} title="누르면 배차현황에서 이 오더가 열려요"
                  className="w-full flex items-center gap-2 py-1 text-left text-[12.5px] rounded-md hover:bg-[#F5F7FB]">
                  <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: stateOf(r) === "done" ? C.navy : "#fff", border: `1.5px solid ${C.navy}` }} />
                  <b className="w-[40px] shrink-0 font-extrabold" style={{ ...NUM, color: t.k === 9999 ? C.dim : C.ink }}>{t.txt.slice(0, 5)}</b>
                  <span className="min-w-0 truncate text-[#3A4A66]">{r.거래처명 || r.상차지명 || "-"} → {r.하차지명 || "-"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 아래 '배차 목록' — 오늘 등록한 오더(내 오더 / 팀 전체) · 필터 · 엑셀 · 체크 · 관리 · 쪽 나눔
// props: rows(실시간 오더) · myEmail · myName · mode · onMode(v)
const COLS = [
  ["등록", 56, "left"], ["상차일", 52, "left"], ["거래처", 116, "left"], ["상차지", 136, "left"], ["하차지", 136, "left"],
  ["화물내용", 96, "left"], ["톤수", 52, "left"], ["차량종류", 72, "left"], ["차량번호", 110, "left"], ["기사명", 74, "left"], ["번호", 116, "left"],
  ["청구", 84, "right"], ["기사운임", 84, "right"], ["수수료", 78, "right"], ["상태", 82, "center"],
];
const pillCls = (on) => `h-[30px] px-3 rounded-[9px] border text-[12px] font-extrabold whitespace-nowrap inline-flex items-center gap-1.5 ${on ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#DCE3EE] text-[#1B2B4B] hover:bg-[#F5F7FB]"}`;
const plainRow = (r, at) => [hhmm(at), md(String(r.상차일 || "")), r.거래처명 || "", r.상차지명 || "", r.하차지명 || "", r.화물내용 || "", r.차량톤수 || "", r.차량종류 || "", r.차량번호 || "", r.이름 || r.기사명 || "", tel(r.전화번호), Number(String(r.청구운임 || 0).replace(/[^\d.-]/g, "")) || 0, Number(String(r.기사운임 || 0).replace(/[^\d.-]/g, "")) || 0, orderProfit(r), STATE[stateOf(r)].label];

export default function OrderWorkAssist({ rows = [], myEmail = "", myName = "", mode = "assist", onMode }) {
  const [scope, setScope] = React.useState("me"); // me | team
  const [showFilter, setShowFilter] = React.useState(false);
  const [st, setSt] = React.useState("all"); // all | todo | wait | done
  const [q, setQ] = React.useState("");
  const [size, setSize] = React.useState(() => { try { return [10, 20, 50].includes(+localStorage.getItem("kpOrderAssistSize")) ? +localStorage.getItem("kpOrderAssistSize") : 10; } catch { return 10; } });
  const [page, setPage] = React.useState(1);
  const [picked, setPicked] = React.useState(() => new Set());
  const live = React.useMemo(() => (rows || []).filter((r) => !isCancel(r) && r.source !== "transport_transmit"), [rows]);

  // 오늘 등록한 오더(등록 시각 기준) — 내 것 / 팀 전체
  const mineOf = React.useCallback((r) => {
    const e = String(r.createdByEmail || "").trim().toLowerCase();
    if (e && myEmail) return e === String(myEmail).toLowerCase();
    const n = String(r.등록자 || r.작성자 || "").trim();
    return !!n && (n === myName || n === myEmail);
  }, [myEmail, myName]);
  const todayRows = React.useMemo(() => live
    .map((r) => ({ r, at: msOf(r.createdAt) }))
    .filter((x) => x.at && kst(0) === new Date(x.at + 9 * 3600e3).toISOString().slice(0, 10))
    .sort((a, b) => b.at - a.at), [live]);
  const mine = React.useMemo(() => todayRows.filter((x) => mineOf(x.r)), [todayRows, mineOf]);
  const base = scope === "me" ? mine : todayRows;
  const list = React.useMemo(() => {
    const k = q.trim().toLowerCase().replace(/\s+/g, "");
    return base.filter(({ r }) => (st === "all" || stateOf(r) === st)
      && (!k || [r.거래처명, r.상차지명, r.하차지명, r.차량번호, r.이름, r.기사명, r.화물내용, r.전화번호].some((v) => String(v || "").toLowerCase().replace(/\s+/g, "").includes(k))));
  }, [base, st, q]);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages);
  const view = list.slice((cur - 1) * size, cur * size);
  React.useEffect(() => { setPage(1); }, [scope, st, q, size]);
  const freshId = todayRows[0] && Date.now() - todayRows[0].at < 10 * 60e3 ? idOf(todayRows[0].r) : "";

  const open = (r) => { const id = idOf(r); if (id && window.__selectOrder) window.__selectOrder(id); };
  const setMode = (v) => { saveAssistMode(v); onMode?.(v); };
  const togglePick = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageIds = view.map(({ r }) => idOf(r)).filter(Boolean);
  const allOn = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const togglePage = () => setPicked((p) => { const n = new Set(p); pageIds.forEach((id) => (allOn ? n.delete(id) : n.add(id))); return n; });
  const pickedN = list.filter(({ r }) => picked.has(idOf(r))).length;
  const filterOn = st !== "all" || !!q.trim();

  // 엑셀 — 체크한 오더가 있으면 그것만, 없으면 지금 목록(필터 적용) 전체
  const [busy, setBusy] = React.useState(false);
  const downloadXlsx = async () => {
    const src = pickedN ? list.filter(({ r }) => picked.has(idOf(r))) : list;
    if (!src.length || busy) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([COLS.map(([h]) => h), ...src.map(({ r, at }) => plainRow(r, at))]);
      ws["!cols"] = COLS.map(([, w]) => ({ wpx: Math.max(60, w) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "배차 목록");
      XLSX.writeFile(wb, `배차목록_${kst(0)}${scope === "me" ? "_내오더" : ""}.xlsx`);
    } finally { setBusy(false); }
  };

  const th = "px-1.5 py-2.5 text-[11.5px] font-extrabold text-[#3A4A66] bg-[#F3F6FB] whitespace-nowrap first:rounded-l-[9px] last:rounded-r-[9px]";
  const td = "px-1.5 py-[9px] border-b border-[#EEF2F8] whitespace-nowrap overflow-hidden text-ellipsis";
  const nums = (() => { const s = Math.max(1, Math.min(cur - 2, pages - 4)); return Array.from({ length: Math.min(5, pages) }, (_, i) => s + i); })();

  return (
    <section className="mt-4 bg-white rounded-[18px] border border-[#E1E7F0] shadow-[0_10px_28px_rgba(16,24,40,0.06)] px-4 pt-3 pb-3" style={{ fontFamily: MONO, color: C.ink }} data-kp="order-assist">
      {/* 머리 — [배차 목록 (N건)] · 내 오더 · 팀 전체 | 필터 · 엑셀 다운로드 · 작업 도우미 · 전체 표 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={pillCls(true)} style={NUM}>배차 목록 ({list.length}건)</span>
        {[["me", "내 오더", mine.length], ["team", "팀 전체", todayRows.length]].map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setScope(k)} aria-pressed={scope === k}
            className={`h-[30px] px-3 rounded-[9px] border text-[12px] whitespace-nowrap ${scope === k ? "bg-[#EEF3FB] border-[#1B2B4B] text-[#0F1A30] font-black" : "bg-white border-[#DCE3EE] text-[#5B6B85] font-bold hover:text-[#0F1A30]"}`} style={NUM}>{l} {n}</button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setShowFilter((v) => !v)} aria-expanded={showFilter} className={pillCls(showFilter || filterOn)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>필터{filterOn ? " ·" : ""}
          </button>
          <button type="button" onClick={downloadXlsx} disabled={!list.length || busy} title={pickedN ? `체크한 ${pickedN}건을 엑셀로 받아요` : "지금 목록을 엑셀로 받아요"} className={`${pillCls(false)} disabled:opacity-50`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>엑셀 다운로드{pickedN ? ` ${pickedN}` : ""}
          </button>
          {[["assist", "작업 도우미"], ["table", "전체 표"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k} className={pillCls(mode === k)}>{l}</button>
          ))}
        </div>
      </div>

      {showFilter && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-[12px] bg-[#F7F9FC] border border-[#E9EEF5]">
          <span className="text-[12px] font-extrabold text-[#5B6B85]">상태</span>
          <div className="flex gap-1">
            {[["all", "전체"], ["todo", "미배차"], ["wait", "배차중"], ["done", "배차완료"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSt(k)} aria-pressed={st === k}
                className={`h-[28px] px-2.5 rounded-[7px] border text-[11.5px] font-extrabold ${st === k ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "bg-white border-[#E3E8F0] text-[#5B6B85]"}`}>{l}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 상하차지 · 차량번호 · 기사명"
            className="ml-2 h-[30px] w-[260px] max-w-full px-2.5 rounded-[8px] border border-[#DCE3EE] bg-white text-[12.5px] outline-none focus:border-[#1B2B4B]" />
          {filterOn && <button type="button" onClick={() => { setSt("all"); setQ(""); }} className="text-[12px] font-bold text-[#5B6B85] hover:text-[#0F1A30] underline">초기화</button>}
        </div>
      )}

      {view.length === 0 ? (
        <div className="mt-3 py-12 text-center text-[13.5px] text-[#8A97AD] border border-dashed border-[#DCE3EE] rounded-[14px]">
          {filterOn ? "조건에 맞는 오더가 없어요." : `오늘 ${scope === "me" ? "내가 " : ""}등록한 오더가 아직 없어요. 위에서 저장하면 여기에 바로 보여요.`}
        </div>
      ) : (
        <div className="overflow-x-auto mt-2.5">
          <table className="w-full text-[12px]" style={{ ...NUM, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", minWidth: 1420 }}>
            <colgroup><col style={{ width: 32 }} />{COLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}<col style={{ width: 44 }} /></colgroup>
            <thead><tr>
              <th className={`${th} text-center`}><input type="checkbox" checked={allOn} onChange={togglePage} aria-label="이 쪽 오더 모두 고르기" className="w-3.5 h-3.5 accent-[#1B2B4B] align-middle" /></th>
              {COLS.map(([h, , al]) => <th key={h} className={`${th} text-${al}`}>{h}</th>)}
              <th className={`${th} text-center`}>관리</th>
            </tr></thead>
            <tbody>
              {view.map(({ r, at }, i) => {
                const id = idOf(r);
                const fresh = id && id === freshId;
                const on = picked.has(id);
                const fee = orderProfit(r);
                const cells = [
                  fresh ? <span className="inline-block text-[10.5px] font-black text-white bg-[#1B2B4B] rounded-md px-1.5 py-0.5">방금</span> : <span className="text-[#7A89A3]">{hhmm(at)}</span>,
                  <span>{md(String(r.상차일 || ""))}</span>,
                  <span className="font-extrabold">{r.거래처명 || "-"}</span>,
                  <span>{r.상차지명 || "-"}</span>,
                  <span>{r.하차지명 || "-"}</span>,
                  <span className="text-[#3A4A66]">{r.화물내용 || "-"}</span>,
                  <span>{r.차량톤수 || "-"}</span>,
                  <span>{r.차량종류 || "-"}</span>,
                  <span>{r.차량번호 || <span className="text-[#AEBBD0]">미배정</span>}</span>,
                  <span>{r.이름 || r.기사명 || <span className="text-[#AEBBD0]">-</span>}</span>,
                  <span className="text-[#3A4A66]">{tel(r.전화번호) || "-"}</span>,
                  <span className="font-extrabold">{won(r.청구운임)}</span>,
                  <span>{won(r.기사운임)}</span>,
                  <span className="font-extrabold" style={{ color: fee < 0 ? C.mid : C.ink }}>{won(fee)}</span>,
                  <StateMark k={stateOf(r)} />,
                ];
                return (
                  <tr key={id || i} onDoubleClick={() => open(r)} style={{ background: on ? "#EEF3FB" : fresh ? "#F3F7FF" : "#fff" }} className="hover:bg-[#F7F9FC]">
                    <td className={`${td} text-center`} onDoubleClick={(e) => e.stopPropagation()}>{id && <input type="checkbox" checked={on} onChange={() => togglePick(id)} aria-label={`${r.거래처명 || "오더"} 고르기`} className="w-3.5 h-3.5 accent-[#1B2B4B] align-middle" />}</td>
                    {cells.map((c, ci) => (
                      <td key={COLS[ci][0]} className={`${td} text-${COLS[ci][2]}`} title={typeof c?.props?.children === "string" ? c.props.children : undefined}>{c}</td>
                    ))}
                    <td className={`${td} text-center`}>
                      <button type="button" onClick={() => open(r)} aria-label="배차현황에서 이 오더 열기" title="배차현황에서 이 오더 열기(수정 · 배차)"
                        className="w-8 h-7 rounded-[8px] inline-grid place-items-center text-[#5B6B85] font-black hover:bg-[#EEF3FB] hover:text-[#0F1A30]">···</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 아래 — 총 N건 중 a - b건 · 쪽 번호 · N개씩 보기 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-[#5B6B85]" style={NUM}>
        <span>{list.length ? `총 ${list.length}건 중 ${(cur - 1) * size + 1} - ${Math.min(cur * size, list.length)}건 표시` : "총 0건"}{pickedN ? ` · ${pickedN}건 고름` : ""}</span>
        <span className="hidden min-[1200px]:inline text-[#AEBBD0]">· 줄을 두 번 누르거나 ···를 누르면 배차현황에서 그 오더가 열려요</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setPage(cur - 1)} disabled={cur <= 1} aria-label="이전 쪽" className={`${pillCls(false)} w-[30px] justify-center px-0 disabled:opacity-40`}>‹</button>
          {nums.map((n) => <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === cur ? "page" : undefined} className={`${pillCls(n === cur)} w-[30px] justify-center px-0`}>{n}</button>)}
          <button type="button" onClick={() => setPage(cur + 1)} disabled={cur >= pages} aria-label="다음 쪽" className={`${pillCls(false)} w-[30px] justify-center px-0 disabled:opacity-40`}>›</button>
        </div>
        <select value={size} onChange={(e) => { const v = +e.target.value; setSize(v); try { localStorage.setItem("kpOrderAssistSize", String(v)); } catch { /* 무시 */ } }} aria-label="한 쪽에 보일 오더 수"
          className="ml-2 h-[30px] px-2.5 rounded-[9px] border border-[#DCE3EE] bg-white text-[12px] font-extrabold text-[#1B2B4B]">
          {[10, 20, 50].map((n) => <option key={n} value={n}>{n}개씩 보기</option>)}
        </select>
      </div>
    </section>
  );
}
