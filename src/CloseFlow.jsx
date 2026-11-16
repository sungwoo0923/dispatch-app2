// ======================= src/CloseFlow.jsx =======================
// ✅ 2026-11-16 2단계 마감 화면 — 배차자가 먼저(1차), 경리팀이 마지막(2차)
//  · mode "disp": 배차현황 › 월 마감 — 내가 등록한 오더가 있는 거래처를 1차 마감해 경리팀에 넘긴다 · 일 마감(내 하루 배차)
//  · mode "acct": 정산관리 › 마감 검증 — 넘어온 거래처를 승인하거나 사유를 적어 반려한다 · 승인한 곳은 명세서로 바로 간다
//  · 꾸밈: 바탕색 없이 선과 글씨색으로만 상태를 나눈다(초록 = 끝 · 주황 = 기다림 · 빨강 = 고칠 것 · 파랑 = 지금 할 일)
//  계산 · 저장 값은 src/closeFlow.js(순수 함수) · 기록은 arDesk(kind "close" · "dayclose")
import React from "react";
import { useArDesk, arDeskId } from "./SettleDesk";
import useNarrow from "./useNarrow"; // 📱 2026-11-16 휴대폰 — 표 대신 카드
import { won, short, kstYm } from "./settleCore";
import {
  CLOSE_STATUS, CLOSE_RULES, closeBoard, closeCounts, dayBoard, canSubmit, canApprove, canReject, canUnlock,
  submitPatch, approvePatch, rejectPatch, unlockPatch, prevYmOf,
} from "./closeFlow";

export const TONE = { ok: "text-[#0F7A52]", warn: "text-[#B25F00]", bad: "text-[#C62F25]", blue: "text-[#2457D6]", mute: "text-[#8D97AB]", fg: "text-[#16233D]" };
const NUM = { fontVariantNumeric: "tabular-nums" };
const btn = "h-9 px-3.5 rounded-xl border border-[#DCE2EC] bg-transparent text-[13.5px] font-bold text-[#16233D] hover:border-[#9FB0CC] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const btnPri = "h-9 px-3.5 rounded-xl border border-[#2457D6] bg-transparent text-[13.5px] font-black text-[#2457D6] hover:border-[#16233D] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const btnBad = "h-9 px-3.5 rounded-xl border border-[#C62F25] bg-transparent text-[13.5px] font-black text-[#C62F25] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const box = "rounded-2xl border border-[#DCE2EC]";
const ymText = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
const nextYm = (ym) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 7); };
const fmtAt = (ms) => { if (!ms) return ""; const d = new Date(Number(ms) + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function StatusText({ row }) {
  const s = CLOSE_STATUS[row.status];
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={`text-[13px] font-black ${TONE[s.tone]}`}>{s.label}</span>
      {row.changed && <span className="text-[12px] font-bold text-[#C62F25]">마감 뒤 금액이 바뀌었어요</span>}
    </span>
  );
}
function CheckText({ row }) {
  const parts = [];
  CLOSE_RULES.forEach((r) => { const c = row.checks[r.key].length; if (c) parts.push(<span key={r.key} className={`font-bold ${r.block ? TONE.bad : TONE.warn}`}>{r.label.replace("같은 날 같은 구간 ", "")} {c}</span>); });
  if (row.bigDiff) parts.push(<span key="diff" className={`font-bold ${TONE.warn}`}>지난달 {row.diff > 0 ? "+" : ""}{Math.round(row.diff * 100)}%</span>);
  return parts.length ? <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[13px]">{parts}</span> : <span className={`text-[13px] font-bold ${TONE.ok}`}>이상 없음</span>;
}

// 검사에 걸린 오더 몇 줄 — 누르면 그 오더를 연다(배차현황)
function CheckList({ checks, onOpenOrder, bigDiff, diff, prevSale }) {
  const line = (o) => `${o.상차일 || ""} · ${o.상차지명 || o.상차지 || "-"} → ${o.하차지명 || o.하차지 || "-"} · ${o.차량번호 || "차량 없음"} · ${won(Number(String(o.청구운임 || 0).replace(/[^\d.-]/g, "")))}원`;
  return (
    <div>
      {CLOSE_RULES.map((r) => {
        const list = checks[r.key]; const bad = list.length > 0;
        return (
          <div key={r.key} className="flex gap-2.5 py-2 border-t border-[#DCE2EC] first:border-t-0 text-[13.5px]">
            <span className={`w-5 shrink-0 text-center font-black ${bad ? (r.block ? TONE.bad : TONE.warn) : TONE.ok}`}>{bad ? "✕" : "✓"}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[#16233D]">{r.label} {bad && <span className={r.block ? TONE.bad : TONE.warn}>{list.length}건</span>}</div>
              <div className="text-[12px] text-[#8D97AB]">{bad ? (r.block ? `${r.desc} · 고쳐야 1차 마감할 수 있어요` : `${r.desc} · 사유를 메모로 남기면 넘어갈 수 있어요`) : "문제없어요"}</div>
              {bad && (
                <ul className="mt-1 space-y-0.5">
                  {list.slice(0, 5).map((o, i) => (
                    <li key={o._id || o.id || i}>
                      {onOpenOrder && (o._id || o.id)
                        ? <button type="button" onClick={() => onOpenOrder(o)} className="text-left text-[12.5px] text-[#2457D6] hover:underline" style={NUM}>{line(o)}</button>
                        : <span className="text-[12.5px] text-[#5A6781]" style={NUM}>{line(o)}</span>}
                    </li>))}
                  {list.length > 5 && <li className="text-[12px] text-[#8D97AB]">외 {list.length - 5}건</li>}
                </ul>)}
            </div>
          </div>);
      })}
      <div className="flex gap-2.5 py-2 border-t border-[#DCE2EC] text-[13.5px]">
        <span className={`w-5 shrink-0 text-center font-black ${bigDiff ? TONE.warn : TONE.ok}`}>{bigDiff ? "!" : "✓"}</span>
        <div><div className="font-bold text-[#16233D]">지난달과 금액 차이</div>
          <div className="text-[12px] text-[#8D97AB]" style={NUM}>{prevSale ? `지난달 ${short(prevSale)}원 · ${diff > 0 ? "+" : ""}${Math.round(diff * 100)}%${bigDiff ? " · 30% 넘게 달라요. 메모로 이유를 남겨 주세요" : ""}` : "지난달 청구가 없어요"}</div></div>
      </div>
    </div>
  );
}

export default function CloseFlow({ orders = [], company = "", mode = "disp", me = null, staffName, isViewer = false, onOpenOrder, onOpenInvoice }) {
  const desk = useArDesk(company);
  const ph = useNarrow(640);
  const [ym, setYm] = React.useState(() => kstYm(-1 + (new Date(Date.now() + 9 * 3600e3).getUTCDate() > 20 ? 1 : 0)));
  const [unit, setUnit] = React.useState("month"); // 배차자: month | day
  const [day, setDay] = React.useState(kstDay);
  const [filter, setFilter] = React.useState(mode === "acct" ? "submitted" : "all");
  const [sel, setSel] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const closeOf = React.useCallback((c, m) => desk.closes.get(`${c}|${m}`) || null, [desk.closes]);
  const board = React.useMemo(() => closeBoard(orders, ym, { closeOf, me }), [orders, ym, closeOf, me]);
  const scope = React.useMemo(() => (mode === "disp" ? board.filter((r) => r.mine) : board), [board, mode]);
  const counts = React.useMemo(() => closeCounts(scope), [scope]);
  const list = React.useMemo(() => (filter === "all" ? scope : scope.filter((r) => r.status === filter)), [scope, filter]);
  const cur = list.find((r) => r.client === sel) || list[0] || null;
  React.useEffect(() => { setNote(""); setMsg(""); }, [sel, ym]);
  // 📱 휴대폰 — 카드를 누르면 아래 자세히 보기로 내려 준다
  const detailRef = React.useRef(null);
  React.useEffect(() => { if (ph && sel) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [ph, sel]);

  const ownersOf = (row) => {
    if (!staffName) return "";
    const m = new Map(); row.rows.forEach((o) => { const nm = staffName(o) || "미지정"; m.set(nm, (m.get(nm) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 2).join(", ");
  };
  const act = async (kind, row) => {
    if (isViewer || busy || !row) return;
    if (kind === "reject" && !note.trim()) { setMsg("반려 사유를 적어 주세요. 배차자에게 그대로 보여요."); return; }
    const patch = kind === "submit" ? submitPatch(row, me, note.trim())
      : kind === "approve" ? approvePatch(row, me)
      : kind === "reject" ? rejectPatch(row, me, note)
      : unlockPatch(row, me, note.trim());
    setBusy(true);
    try {
      await desk.save(row.doc?.id || arDeskId(desk.company, "close", row.client, row.ym), patch);
      setMsg({ submit: "1차 마감했어요. 경리팀 검증 목록에 올라갔어요.", approve: "2차 승인했어요. 이제 명세서를 보내면 돼요.", reject: "반려했어요. 배차자 화면에 사유가 보여요.", unlock: "마감을 풀었어요. 고친 뒤 다시 1차 마감하면 돼요." }[kind]);
      setNote("");
    } finally { setBusy(false); }
  };

  // 일 마감(배차자)
  const dayKey = `${String(me?.email || "").toLowerCase()}|${day}`;
  const dayDoc = desk.dayCloses.get(dayKey);
  const dayRow = React.useMemo(() => (mode === "disp" && unit === "day" ? dayBoard(orders, day, me) : null), [orders, day, me, mode, unit]);
  const closeDay = async () => {
    if (isViewer || busy || !dayRow || dayRow.block) return;
    setBusy(true);
    try { await desk.save(arDeskId(desk.company, "dayclose", me?.email || "", day), { kind: "dayclose", by: String(me?.email || "").toLowerCase(), byName: me?.name || "", date: day, count: dayRow.count, sale: dayRow.sale, at: Date.now() }); setMsg(`${day} 일 마감을 기록했어요.`); }
    finally { setBusy(false); }
  };

  const flow = [
    { who: "배차자", what: "내 거래처 정리", desc: "자동 검사로 운임 · 배차 · 중복을 맞춰요", n: counts.none + counts.rejected, tone: counts.rejected ? "bad" : "mute" },
    { who: "배차자", what: "1차 마감", desc: "올리면 경리팀 검증 목록에 보여요", n: null },
    { who: "경리팀", what: "2차 검증", desc: "승인하거나 사유를 적어 반려해요", n: counts.submitted, tone: "warn" },
    { who: "경리팀", what: "업체에 발송", desc: "거래처 양식으로 명세서를 보내요", n: counts.approved, tone: "ok" },
  ];
  const filters = mode === "acct"
    ? [["submitted", "검증 대기", "warn"], ["rejected", "반려", "bad"], ["approved", "승인", "ok"], ["none", "1차 마감 전", "mute"], ["all", "전체", "fg"]]
    : [["all", "내 거래처 전체", "fg"], ["none", "1차 마감 전", "mute"], ["rejected", "반려", "bad"], ["submitted", "검증 대기", "warn"], ["approved", "승인", "ok"]];

  const actionCell = (r) => (mode === "disp"
                      ? (canSubmit(r) ? <button type="button" className={btnPri} disabled={isViewer || busy} onClick={() => act("submit", r)}>{r.status === "rejected" ? "다시 1차 마감" : "1차 마감"}</button>
                        : r.status === "none" || r.status === "rejected" ? <span className={`text-[12.5px] font-bold ${TONE.bad}`}>고칠 것 {r.block}건</span>
                        : <span className="text-[12.5px] text-[#8D97AB]">{r.status === "approved" ? "경리 확인 끝" : "경리 확인 중"}</span>)
                      : (canApprove(r) ? <button type="button" className={btnPri} disabled={isViewer || busy} onClick={() => act("approve", r)}>승인</button>
                        : r.status === "approved" ? <button type="button" className={btn} onClick={() => onOpenInvoice?.(r.client, r.ym)}>명세서</button>
                        : <span className="text-[12.5px] text-[#8D97AB]">{r.status === "rejected" ? "배차자 수정 중" : r.changed ? "다시 1차 마감 필요" : "배차자 마감 전"}</span>));

  return (
    <div className="p-1 sm:p-2 space-y-4 text-[#16233D]" data-kp={mode === "acct" ? "close-review" : "close-mine"}>
      <div className="flex items-end gap-x-4 gap-y-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[20px] font-black">{mode === "acct" ? "마감 검증" : "월 마감"}</div>
          <div className="text-[13.5px] text-[#5A6781]">{mode === "acct" ? "배차자가 1차 마감한 거래처를 다시 보고, 맞으면 승인해요. 승인한 곳만 명세서로 넘어가요." : "내가 배차한 거래처를 먼저 맞춰서 1차 마감해요. 경리팀이 2차로 확인한 뒤 업체에 보내요."}</div>
        </div>
        {mode === "disp" && (
          <div className="flex gap-4 ml-auto" role="group" aria-label="마감 단위">
            {[["month", "월 마감"], ["day", "일 마감"]].map(([k, l]) => <button key={k} type="button" aria-pressed={unit === k} onClick={() => { setUnit(k); setMsg(""); }} className={`text-[14.5px] font-black ${unit === k ? TONE.blue : TONE.mute}`}>{l}</button>)}
          </div>)}
      </div>

      {unit === "day" && mode === "disp" ? (
        <section className={`${box} p-4 space-y-3`}>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="date" id="close-day" value={day} onChange={(e) => setDay(e.target.value)} className="h-10 rounded-xl border border-[#DCE2EC] bg-transparent px-3 text-[14px] font-bold" />
            <span className="text-[14px]" style={NUM}>내 오더 <b>{dayRow.count}</b>건 · 청구 <b>{won(dayRow.sale)}</b>원</span>
            <span className="ml-auto text-[13.5px] font-bold">{dayDoc ? <span className={TONE.ok}>{fmtAt(dayDoc.at)} 일 마감함 ({dayDoc.count}건)</span> : <span className={TONE.mute}>아직 일 마감 전</span>}</span>
          </div>
          <CheckList checks={dayRow.checks} onOpenOrder={onOpenOrder} bigDiff={false} diff={0} prevSale={0} />
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className={btnPri} disabled={isViewer || busy || !dayRow.count || dayRow.block > 0} onClick={closeDay}>{dayDoc ? "다시 일 마감" : "이날 배차 일 마감"}</button>
            {dayRow.block > 0 && <span className={`text-[13px] font-bold ${TONE.bad}`}>빨간 글씨 항목을 먼저 고쳐 주세요.</span>}
            {msg && <span className={`text-[13px] font-bold ${TONE.ok}`}>{msg}</span>}
          </div>
          <div className="text-[12.5px] text-[#8D97AB]">일 마감은 그날 내 배차를 확인했다는 기록이에요. 월 마감은 위의 [월 마감]에서 거래처별로 해요.</div>
        </section>
      ) : (<>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className={btn} aria-label="이전 달" onClick={() => setYm(prevYmOf(ym))}>‹</button>
          <span className="text-[16px] font-black px-1" style={NUM}>{ymText(ym)}</span>
          <button type="button" className={btn} aria-label="다음 달" onClick={() => setYm(nextYm(ym))}>›</button>
        </div>

        <div className={`${box} grid grid-cols-2 lg:grid-cols-4 overflow-hidden`}>
          {flow.map((f, i) => (
            <div key={f.what} className={`relative px-4 py-3 border-[#DCE2EC] ${i % 2 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
              <div className="text-[12px] font-bold text-[#8D97AB]">{i + 1} · {f.who}</div>
              <div className="font-black">{f.what}</div>
              <div className="text-[12.5px] text-[#5A6781]">{f.desc}</div>
              {f.n != null && <span className={`absolute top-3 right-4 text-[16px] font-black ${TONE[f.tone]}`} style={NUM}>{f.n}</span>}
            </div>))}
        </div>

        <div className="flex gap-x-5 gap-y-1 flex-wrap" role="group" aria-label="상태로 보기">
          {filters.map(([k, l, t]) => { const c = k === "all" ? scope.length : counts[k]; return (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setSel(""); }}
              className={`text-[14px] font-black ${filter === k ? `${TONE.blue} underline underline-offset-[6px] decoration-2` : TONE.mute}`}>{l} <span className={filter === k ? TONE.blue : TONE[t]} style={NUM}>{c}</span></button>); })}
        </div>

        <div className={ph ? "space-y-2" : `${box} overflow-x-auto`}>
          {list.length === 0 ? (
            <div className={`py-10 text-center text-[14px] text-[#8D97AB] ${ph ? box : ""}`}>{mode === "disp" && !scope.length ? `${ymText(ym)}에 내가 등록한 오더가 없어요.` : "이 상태의 거래처가 없어요."}</div>
          ) : ph ? list.map((r) => { const on = cur?.client === r.client; return (
            <div key={r.client} role="button" tabIndex={0} onClick={() => setSel(r.client)} onKeyDown={(e) => { if (e.key === "Enter") setSel(r.client); }}
              className={`${box} p-3.5 space-y-1.5 ${on ? "border-[#2457D6]" : ""}`} data-kp="close-card">
              <div className="flex items-start gap-2">
                <div className={`flex-1 min-w-0 text-[15.5px] font-black truncate ${on ? TONE.blue : ""}`}>{r.client}</div>
                <StatusText row={r} />
              </div>
              <div className="text-[13.5px] text-[#5A6781]" style={NUM}>{r.count}건 · <b className="text-[#16233D]">{won(r.sale)}원</b>{mode === "acct" ? ` · ${r.doc?.submittedByName || ownersOf(r) || "-"}` : ""}</div>
              <CheckText row={r} />
              <div className="pt-1" onClick={(e) => e.stopPropagation()}>{actionCell(r)}</div>
            </div>); }) : (
            <table className="kp-plain w-full text-[14px] min-w-[760px]" style={NUM}>
              <thead><tr className="text-[12px] text-[#8D97AB]">
                <th className="text-left font-bold px-3 py-2.5 border-b border-[#DCE2EC]">거래처</th>
                {mode === "acct" && <th className="text-left font-bold px-3 py-2.5 border-b border-[#DCE2EC]">배차자</th>}
                <th className="text-right font-bold px-3 py-2.5 border-b border-[#DCE2EC]">오더</th>
                <th className="text-right font-bold px-3 py-2.5 border-b border-[#DCE2EC]">청구 합계</th>
                <th className="text-left font-bold px-3 py-2.5 border-b border-[#DCE2EC]">자동 검사</th>
                <th className="text-left font-bold px-3 py-2.5 border-b border-[#DCE2EC]">상태</th>
                <th className="border-b border-[#DCE2EC]" />
              </tr></thead>
              <tbody>{list.map((r) => { const on = cur?.client === r.client; return (
                <tr key={r.client} onClick={() => setSel(r.client)} className="cursor-pointer border-b border-[#DCE2EC] last:border-b-0">
                  <td className={`px-3 py-2.5 font-black ${on ? TONE.blue : ""}`}>{on ? "▸ " : ""}{r.client}</td>
                  {mode === "acct" && <td className="px-3 py-2.5 text-[13px] text-[#5A6781]">{r.doc?.submittedByName || ownersOf(r) || "-"}</td>}
                  <td className="px-3 py-2.5 text-right">{r.count}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{won(r.sale)}</td>
                  <td className="px-3 py-2.5"><CheckText row={r} /></td>
                  <td className="px-3 py-2.5"><StatusText row={r} /></td>
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>{actionCell(r)}
                  </td>
                </tr>); })}</tbody>
            </table>)}
        </div>

        {cur && (
          <section ref={detailRef} className={`${box} p-4 grid grid-cols-1 lg:grid-cols-2 gap-5 scroll-mt-16`}>
            <div className="min-w-0">
              <div className="text-[15px] font-black">{cur.client} <span className="font-medium text-[#5A6781]" style={NUM}>· {cur.count}건 · {won(cur.sale)}원</span></div>
              {cur.status === "rejected" && cur.doc?.reason && <div className={`mt-1.5 text-[13.5px] ${TONE.bad}`}><b className="mr-2">반려 사유</b>{cur.doc.reason}</div>}
              {cur.changed && <div className={`mt-1.5 text-[13.5px] ${TONE.bad}`}><b className="mr-2">금액 바뀜</b>1차 마감 때 {cur.doc.snapshot.count}건 · {won(cur.doc.snapshot.sale)}원 → 지금 {cur.count}건 · {won(cur.sale)}원. 배차자가 다시 1차 마감해야 승인할 수 있어요.</div>}
              <div className="mt-2"><CheckList checks={cur.checks} onOpenOrder={onOpenOrder} bigDiff={cur.bigDiff} diff={cur.diff} prevSale={cur.prevSale} /></div>
              {!isViewer && (
                <div className="mt-3 space-y-2">
                  <label htmlFor="close-note" className="text-[12.5px] text-[#8D97AB]">{mode === "acct" ? "반려 사유 · 메모 (반려할 때는 꼭 적어요. 배차자에게 그대로 보여요)" : "메모 (역마진 · 금액 차이 이유 등. 경리팀에 같이 보여요)"}</label>
                  <textarea id="close-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={mode === "acct" ? "예: 11/12 세진로지스 대기료가 빠졌어요" : "예: 신규 노선이 늘어서 금액이 커졌어요"} className="w-full rounded-xl border border-[#DCE2EC] bg-transparent px-3 py-2 text-[13.5px] outline-none focus:border-[#2457D6]" />
                  <div className="flex gap-2 flex-wrap items-center">
                    {mode === "disp" ? (<>
                      <button type="button" className={btnPri} disabled={busy || !canSubmit(cur)} onClick={() => act("submit", cur)}>{cur.status === "rejected" ? "고쳐서 다시 1차 마감" : cur.changed ? "바뀐 금액으로 다시 1차 마감" : "1차 마감하고 경리팀에 넘기기"}</button>
                      {canUnlock(cur, "disp") && <button type="button" className={btn} disabled={busy} onClick={() => act("unlock", cur)}>마감 풀기</button>}
                    </>) : (<>
                      <button type="button" className={btnPri} disabled={busy || !canApprove(cur)} onClick={() => act("approve", cur)}>2차 승인</button>
                      <button type="button" className={btnBad} disabled={busy || !canReject(cur)} onClick={() => act("reject", cur)}>반려</button>
                      {canUnlock(cur, "acct") && cur.status === "approved" && <button type="button" className={btn} disabled={busy} onClick={() => act("unlock", cur)}>승인 풀기</button>}
                      <button type="button" className={btn} onClick={() => onOpenInvoice?.(cur.client, cur.ym)}>명세서 보기</button>
                    </>)}
                    {mode === "disp" && cur.block > 0 && <span className={`text-[13px] font-bold ${TONE.bad}`}>빨간 글씨 항목을 배차현황에서 고친 뒤 1차 마감할 수 있어요.</span>}
                    {msg && <span className={`text-[13px] font-bold ${msg.includes("적어") ? TONE.bad : TONE.ok}`}>{msg}</span>}
                  </div>
                </div>)}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-black mb-1">기록</div>
              {(cur.doc?.log || []).length ? (
                <ul className="text-[13px]">
                  {cur.doc.log.map((l, i) => (
                    <li key={i} className="flex gap-2.5 py-1.5 border-t border-dashed border-[#DCE2EC] first:border-t-0">
                      <time className="text-[12px] text-[#8D97AB] whitespace-nowrap" style={NUM}>{fmtAt(l.at)}</time>
                      <span><b>{l.by}</b> · <span className={l.act === "반려" ? TONE.bad : l.act === "2차 승인" ? TONE.ok : ""}>{l.act}</span>{l.note ? ` · ${l.note}` : ""}</span>
                    </li>))}
                </ul>) : <div className="text-[12.5px] text-[#8D97AB]">아직 기록이 없어요. 1차 마감하면 누가 언제 했는지 남아요.</div>}
            </div>
          </section>)}
      </>)}
    </div>
  );
}
