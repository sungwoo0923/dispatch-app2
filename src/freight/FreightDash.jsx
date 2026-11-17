// ======================= src/freight/FreightDash.jsx =======================
// 🚢 2026-11-12 대시보드 · 마감보드 · 손익 · 통합 현황 · Job 타임라인 · 거래처 360
// 🎨 2026-11-18 내륙 화면과 같은 모양 — 흰 카드 + 회색 테두리, 숫자 칸 한 줄, 표 머리줄 남색, 상태는 글씨 색으로만
import React from "react";
import {
  statusList, HANDOFF_STATUS, isDone, topDeadline, deadlinesOf, dueInfo, overCost, legPnl, sumPnl, won, wonShort, fmtDT, todayYmd, ymOf, groupByJob, legTitle, clientMatrix,
  CNTR_TYPES,
} from "./freightCore";
import { Card, Kpi, Btn, Sel, Seg, Empty, StatusChip, DueChip, Stepper, ModeChip, ModeIcon, MODE_NAME, MONO, TH, TD, THEAD_BG, NOTE, SearchIn } from "./ui";
import { profitCls, profitRateCls, profitColor } from "../marginPct"; // ⭐ 2026-11-17 이익 색(플러스 빨강 · 마이너스 파랑)

const kstYmd = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : "");
const monthOptions = () => { const out = []; const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); for (let i = 0; i < 12; i++) { const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; out.push([ym, `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`]); d.setUTCMonth(d.getUTCMonth() - 1); } return out; };
const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

// 한 영역의 숫자 요약
export function modeStats(jobs, mode, now = Date.now()) {
  const l = jobs.filter((j) => j.mode === mode);
  const active = l.filter((j) => !isDone(j) && j.status !== HANDOFF_STATUS);
  const today = todayYmd(now); const ym = today.slice(0, 7);
  const dues = active.map((j) => topDeadline(j, now)).filter(Boolean);
  const month = l.filter((j) => ymOf(kstYmd(j.createdAtMs)) === ym);
  return {
    total: l.length, active: active.length, today: l.filter((j) => kstYmd(j.createdAtMs) === today).length,
    urgent: dues.filter((d) => d.level === "urgent").length, over: dues.filter((d) => d.level === "over").length,
    handoff: l.filter((j) => j.status === HANDOFF_STATUS).length, monthCount: month.length, pnl: sumPnl(month),
    noDriver: mode === "container" ? active.filter((j) => !j.driver && !j.carNo).length : 0,
  };
}
// 내륙(기존 배차 오더)의 이번 달 요약
export function inlandStats(rows, now = Date.now()) {
  const today = todayYmd(now); const ym = today.slice(0, 7);
  const ok = (rows || []).filter((r) => r && r.상차일 && !/취소/.test(String(r.배차상태 || r.상태 || "")));
  const month = ok.filter((r) => ymOf(r.상차일) === ym);
  const sale = month.reduce((a, r) => a + num(r.청구운임), 0); const cost = month.reduce((a, r) => a + num(r.기사운임), 0);
  return { today: ok.filter((r) => r.상차일 === today).length, monthCount: month.length, noDriver: ok.filter((r) => r.상차일 >= today && !String(r.차량번호 || "").trim()).length, pnl: { sale, cost, profit: sale - cost, margin: sale > 0 ? Math.round(((sale - cost) / sale) * 1000) / 10 : 0 } };
}

// 목록 한 줄(마감 · 인계)
const ROW = "w-full flex items-center gap-2.5 px-1 h-11 border-b border-[#EEF1F6] last:border-b-0 hover:bg-[#F7F9FC] text-left min-w-0";
function DueRow({ job, due, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen?.(job)} className={ROW}>
      <ModeChip mode={job.mode} />
      <span className="text-[12.5px] font-black text-[#0F1A30] tabular-nums shrink-0" style={{ fontFamily: MONO }}>{job.refNo}</span>
      <span className="text-[12.5px] font-semibold text-[#3A4A66] truncate flex-1">{job.client} · {legTitle(job)}</span>
      <span className="text-[12px] font-semibold text-[#9AA9C3] tabular-nums hidden sm:inline">{fmtDT(due.raw)}</span>
      <DueChip due={due} />
    </button>
  );
}

// ── 영역 대시보드 ─────────────────────────────────────────────────────
export function ModeDashboard({ mode, jobs, onOpen, go, canEdit }) {
  const now = Date.now();
  const s = modeStats(jobs, mode, now);
  const mine = jobs.filter((j) => j.mode === mode);
  const active = mine.filter((j) => !isDone(j) && j.status !== HANDOFF_STATUS);
  const dues = active.map((j) => ({ job: j, due: topDeadline(j, now) })).filter((x) => x.due).sort((a, b) => a.due.at - b.due.at).slice(0, 7);
  const sts = statusList(mode); const maxSt = Math.max(1, ...sts.map((x) => mine.filter((j) => j.status === x).length));
  const bySize = mode === "container" ? CNTR_TYPES.map((t) => [t.key, active.filter((j) => j.size === t.key).length]).filter((x) => x[1] > 0) : [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Kpi label="진행 중" value={s.active} unit="건" sub={`오늘 등록 ${s.today}건`} onClick={() => go("list")} />
        <Kpi label="24시간 안 마감" value={s.urgent} unit="건" tone={s.urgent ? "warn" : ""} sub="마감보드에서 확인" onClick={() => go("deadline")} />
        <Kpi label="마감 지남" value={s.over} unit="건" tone={s.over ? "bad" : ""} sub="초과 비용 발생 가능" onClick={() => go("deadline")} />
        <Kpi label="받은 인계 요청" value={s.handoff} unit="건" tone={s.handoff ? "warn" : ""} sub="인계함에서 접수" onClick={() => go("handoff")} />
        {mode === "container" ? <Kpi label="미배차" value={s.noDriver} unit="건" tone={s.noDriver ? "warn" : ""} sub="기사 · 차량 미정" onClick={() => go("list")} /> : <Kpi label="이번 달 등록" value={s.monthCount} unit="건" sub={`전체 ${s.total}건`} onClick={() => go("list")} />}
        <Kpi label="이번 달 이익" value={wonShort(s.pnl.profit)} unit="원" color={profitColor(s.pnl.profit) || undefined} sub={`매출 ${wonShort(s.pnl.sale)} · ${s.pnl.margin}%`} onClick={() => go("pnl")} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
        <Card title="지금 급한 마감" en="NEXT DEADLINES" right={<Btn size="sm" onClick={() => go("deadline")}>마감보드</Btn>}>
          {dues.length === 0 ? <Empty mode={mode} title="다가오는 마감이 없어요" desc="일정 · 마감 시각을 넣으면 여기에 순서대로 보여요." action={canEdit && mode !== "inland" && !mine.length ? <Btn kind="primary" size="sm" onClick={() => go("new")}>+ 첫 건 등록</Btn> : null} />
            : <div>{dues.map((x) => <DueRow key={x.job.id} {...x} onOpen={onOpen} />)}</div>}
        </Card>
        <Card title="단계별 진행" en="PIPELINE">
          <div className="space-y-2">
            {sts.map((x) => { const n = mine.filter((j) => j.status === x).length; return (
              <div key={x} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[12.5px] font-semibold text-[#3A4A66] truncate">{x}</span>
                <div className="flex-1 h-2 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full rounded-full bg-[#1B2B4B]" style={{ width: `${(n / maxSt) * 100}%` }} /></div>
                <span className="w-8 text-right text-[13px] font-black text-[#0F1A30] tabular-nums">{n}</span>
              </div>
            ); })}
          </div>
          {bySize.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#EEF1F6] flex items-center gap-x-3 gap-y-1 flex-wrap">
              <span className="text-[12px] font-bold text-[#9AA9C3]">진행 중 규격</span>
              {bySize.map(([k, n]) => <span key={k} className="text-[12.5px] font-bold text-[#3A4A66] tabular-nums">{k} <b className="text-[#0F1A30]">{n}</b></span>)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── 마감보드 ─────────────────────────────────────────────────────────
const LANES = [
  { key: "over", title: "마감 지남", en: "OVERDUE", fg: "#C2362B" },
  { key: "urgent", title: "24시간 안", en: "WITHIN 24H", fg: "#C2362B" },
  { key: "soon", title: "3일 안", en: "WITHIN 3 DAYS", fg: "#B26A00" },
  { key: "ok", title: "그 이후", en: "LATER", fg: "#0F1A30" },
];
export function DeadlineBoard({ jobs, mode = "", onOpen }) {
  const [only, setOnly] = React.useState("전체");
  const [, tick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t); }, []);
  const now = Date.now();
  const items = [];
  jobs.filter((j) => (!mode || j.mode === mode) && !isDone(j) && j.status !== HANDOFF_STATUS).forEach((j) => {
    deadlinesOf(j).forEach((d) => { if (only === "비용 발생" && !d.penalty) return; const info = dueInfo(d.at, now); if (info.level === "over" && !d.penalty) return; items.push({ job: j, d: { ...d, ...info } }); });
  });
  items.sort((a, b) => a.d.at - b.d.at);
  const overTotal = jobs.filter((j) => !mode || j.mode === mode).reduce((a, j) => a + overCost(j, now).cost, 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <Seg size="sm" value={only} onChange={setOnly} options={["전체", "비용 발생"]} />
        <span className={NOTE}>비용 발생은 넘기면 비용이 나가는 마감이에요(반입 마감 · 반납 기한 · 프리타임 · 서류 마감)</span>
        {overTotal > 0 && <span className="ml-auto text-[#C2362B] text-[12.5px] font-black tabular-nums">예상 초과 비용 {won(overTotal)}원</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-3 items-start">
        {LANES.map((lane) => { const l = items.filter((x) => x.d.level === lane.key); return (
          <section key={lane.key} className="rounded-xl bg-white border border-[#E3E8F0] overflow-hidden min-w-0">
            <div className="px-4 h-11 flex items-center gap-2 border-b border-[#EEF1F6]">
              <span className="text-[14px] font-extrabold" style={{ color: lane.fg }}>{lane.title}</span>
              <span className="text-[9.5px] font-extrabold tracking-[0.2em] text-[#9AA9C3]" style={{ fontFamily: MONO }}>{lane.en}</span>
              <span className="ml-auto text-[13px] font-black tabular-nums" style={{ color: l.length ? lane.fg : "#9AA9C3" }}>{l.length}건</span>
            </div>
            <div className="max-h-[62vh] overflow-y-auto">
              {l.length === 0 && <div className="py-8 text-center text-[12.5px] font-semibold text-[#C3CCDB]">없음</div>}
              {l.map(({ job, d }) => { const oc = lane.key === "over" ? overCost(job, now) : null; return (
                <button key={`${job.id}:${d.key}`} type="button" onClick={() => onOpen(job)} className="w-full text-left px-4 py-2.5 border-b border-[#EEF1F6] last:border-b-0 hover:bg-[#F7F9FC] min-w-0">
                  <div className="flex items-center gap-1.5"><ModeChip mode={job.mode} /><span className="text-[12px] font-black text-[#0F1A30] tabular-nums truncate" style={{ fontFamily: MONO }}>{job.refNo}</span><span className="ml-auto"><DueChip due={d} showLabel={false} /></span></div>
                  <div className="mt-1 text-[13px] font-bold text-[#0F1A30] truncate">{d.label} · <span className="tabular-nums">{fmtDT(d.raw)}</span></div>
                  <div className="text-[12px] font-medium text-[#5B6B85] truncate">{job.client} · {legTitle(job)}</div>
                  {oc && oc.cost > 0 && <div className="mt-0.5 text-[12px] font-bold text-[#C2362B] tabular-nums">예상 초과 비용 {won(oc.cost)}원</div>}
                </button>
              ); })}
            </div>
          </section>
        ); })}
      </div>
    </div>
  );
}

// ── 손익 ─────────────────────────────────────────────────────────────
export function PnlPage({ jobs, mode = "", inlandRows = null, onOpen }) {
  const months = React.useMemo(monthOptions, []);
  const [ym, setYm] = React.useState(months[0][0]);
  const [view, setView] = React.useState("Job");
  const inMonth = jobs.filter((j) => ymOf(kstYmd(j.createdAtMs)) === ym);
  const scoped = inMonth.filter((j) => !mode || j.mode === mode);
  const tot = sumPnl(inlandRows ? scoped.filter((j) => !j._linked) : scoped); // 배차 오더와 연결된 내륙 구간은 내륙 매출에 이미 들어 있다
  // Job 단위 — 같은 Job 의 모든 구간(다른 팀 구간 포함)을 합쳐 실제 이익을 본다
  const jobNos = new Set(scoped.map((j) => j.jobNo));
  const groups = groupByJob(jobs.filter((j) => jobNos.has(j.jobNo)));
  const byClient = (() => { const m = new Map(); scoped.forEach((j) => { const k = j.client || "(거래처 없음)"; const o = m.get(k) || { client: k, legs: [] }; o.legs.push(j); m.set(k, o); }); return [...m.values()].map((o) => ({ ...o, pnl: sumPnl(o.legs) })).sort((a, b) => b.pnl.sale - a.pnl.sale); })();
  const inl = inlandRows ? (() => { const r = inlandRows.filter((x) => x && ymOf(x.상차일) === ym && !/취소/.test(String(x.배차상태 || ""))); const sale = r.reduce((a, x) => a + num(x.청구운임), 0); const cost = r.reduce((a, x) => a + num(x.기사운임), 0); return { count: r.length, sale, cost, profit: sale - cost }; })() : null;
  const all = inl ? { sale: tot.sale + inl.sale, cost: tot.cost + inl.cost, profit: tot.profit + inl.profit } : tot;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="w-[150px]"><Sel value={ym} onChange={(v) => setYm(v || months[0][0])} options={months} /></div>
        <Seg size="sm" value={view} onChange={setView} options={["Job", "거래처"]} />
        <span className={NOTE}>등록일 기준이에요 · 외화는 입력한 환율로 원화 환산해요</span>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <Kpi label="매출 (청구)" value={wonShort(all.sale)} unit="원" sub={`${won(all.sale)}원`} />
        <Kpi label="매입 (지급)" value={wonShort(all.cost)} unit="원" sub={`${won(all.cost)}원`} />
        <Kpi label="이익" value={wonShort(all.profit)} unit="원" color={profitColor(all.profit) || undefined} sub={all.sale > 0 ? `이익률 ${Math.round((all.profit / all.sale) * 1000) / 10}%` : "-"} />
        <Kpi label="건수" value={scoped.length + (inl?.count || 0)} unit="건" sub={inl ? `내륙 ${inl.count} · 그 외 ${scoped.length}` : `Job ${groups.length}개`} />
      </div>
      {inl && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {[["inland", inl], ...["container", "sea", "air"].map((m) => [m, sumPnl(inMonth.filter((j) => j.mode === m))])].map(([m, p]) => (
            <div key={m} className="rounded-xl border border-[#E3E8F0] bg-white px-4 py-3">
              <div className="flex items-center gap-2"><ModeChip mode={m} /><span className="ml-auto text-[12px] font-semibold text-[#9AA9C3]">매출 {wonShort(p.sale)}</span></div>
              <div className={`mt-1.5 text-[18px] font-black tabular-nums ${profitCls(p.profit, "text-[#0F1A30]")}`}>{wonShort(p.profit)}<span className="text-[12px] font-bold text-[#7A89A3] ml-1">원 이익</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full rounded-full bg-[#1B2B4B]" style={{ width: `${all.sale > 0 ? Math.min(100, (p.sale / all.sale) * 100) : 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      <Card pad={false} title={view === "Job" ? "Job 별 손익" : "거래처별 손익"} en={view === "Job" ? "BY JOB" : "BY CLIENT"}>
        {(view === "Job" ? groups : byClient).length === 0 ? <Empty mode={mode || "group"} title="이 달에 등록된 건이 없어요" /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[820px]">
              <thead style={{ background: THEAD_BG }}><tr>
                <th className={TH}>{view === "Job" ? "Job" : "거래처"}</th><th className={TH}>{view === "Job" ? "거래처" : "건수"}</th><th className={TH}>구간</th>
                <th className={`${TH} text-right`}>매출</th><th className={`${TH} text-right`}>매입</th><th className={`${TH} text-right`}>이익</th><th className={`${TH} text-right`}>이익률</th>
              </tr></thead>
              <tbody>
                {(view === "Job" ? groups : byClient).map((g) => (
                  <tr key={g.jobNo || g.client} className="border-b border-[#EEF1F6] hover:bg-[#F7F9FC]">
                    <td className={`${TD} font-black text-[#0F1A30]`} style={view === "Job" ? { fontFamily: MONO } : undefined}>{g.jobNo || g.client}</td>
                    <td className={`${TD} font-semibold max-w-[200px] truncate`}>{view === "Job" ? g.client || "-" : `${g.legs.length}건`}</td>
                    <td className={TD}><div className="flex gap-2 flex-wrap">{(view === "Job" ? g.legs : [...new Set(g.legs.map((l) => l.mode))].map((m) => ({ id: m, mode: m }))).map((l) => (
                      view === "Job" ? <button key={l.id} type="button" onClick={() => onOpen(l)} title={`${l.refNo} · ${l.status}`} className="hover:underline"><ModeChip mode={l.mode} /></button> : <ModeChip key={l.id} mode={l.mode} />
                    ))}</div></td>
                    <td className={`${TD} text-right tabular-nums font-semibold`}>{won(g.pnl.sale)}</td><td className={`${TD} text-right tabular-nums font-semibold`}>{won(g.pnl.cost)}</td>
                    <td className={`${TD} text-right tabular-nums font-black ${profitCls(g.pnl.profit, "text-[#0F1A30]")}`}>{won(g.pnl.profit)}</td>
                    <td className={`${TD} text-right tabular-nums font-bold ${g.pnl.sale > 0 ? profitRateCls(g.pnl.margin) : ""}`}>{g.pnl.sale > 0 ? `${g.pnl.margin}%` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── 통합 현황(임원 · 대표) ─────────────────────────────────────────────
function ModeCard({ mode, label, cells, profit, margin, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-left rounded-xl border border-[#E3E8F0] bg-white hover:border-[#1B2B4B] transition p-4 min-w-0">
      <div className="flex items-center gap-2"><ModeIcon mode={mode} size={16} className="text-[#2D4C82]" /><span className="text-[14px] font-extrabold text-[#0F1A30]">{label}</span><span className="ml-auto text-[11.5px] font-semibold text-[#9AA9C3]">열기 →</span></div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
        {cells.map(([l, v, c]) => <div key={l}><div className="text-[18px] font-black tabular-nums" style={{ color: v && c ? c : "#0F1A30" }}>{v}</div><div className="text-[11.5px] font-semibold text-[#7A89A3]">{l}</div></div>)}
      </div>
      <div className="mt-2.5 pt-2.5 border-t border-[#EEF1F6] flex justify-between text-[12px] font-semibold"><span className="text-[#7A89A3]">이익</span><span className="tabular-nums font-bold" style={{ color: profitColor(profit) || "#0F1A30" }}>{wonShort(profit)}원 · {margin}%</span></div>
    </button>
  );
}
export function GroupOverview({ jobs, modules, inlandRows, onOpen, goBiz }) {
  const now = Date.now();
  const inl = inlandStats(inlandRows, now);
  const stats = modules.filter((m) => m !== "inland").map((m) => [m, modeStats(jobs, m, now)]);
  const totSale = (modules.includes("inland") ? inl.pnl.sale : 0) + stats.reduce((a, x) => a + x[1].pnl.sale, 0);
  const totProfit = (modules.includes("inland") ? inl.pnl.profit : 0) + stats.reduce((a, x) => a + x[1].pnl.profit, 0);
  const active = jobs.filter((j) => !isDone(j) && j.status !== HANDOFF_STATUS);
  const dues = active.map((j) => ({ job: j, due: topDeadline(j, now) })).filter((x) => x.due && x.due.level !== "ok").sort((a, b) => a.due.at - b.due.at).slice(0, 8);
  const waiting = jobs.filter((j) => j.status === HANDOFF_STATUS);
  const overTotal = jobs.reduce((a, j) => a + overCost(j, now).cost, 0);
  const rate = totSale > 0 ? Math.round((totProfit / totSale) * 1000) / 10 : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Kpi label="이번 달 매출" value={wonShort(totSale)} unit="원" sub="전 사업부 합계" />
        <Kpi label="이번 달 이익" value={wonShort(totProfit)} unit="원" color={profitColor(totProfit) || undefined} sub="매출 − 매입" />
        <Kpi label="이익률" value={rate == null ? "-" : `${rate}%`} sub="이익 ÷ 매출" />
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${modules.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-2.5`}>
        {modules.includes("inland") && (
          <ModeCard mode="inland" label="내륙운송" onClick={() => goBiz("inland")} profit={inl.pnl.profit} margin={inl.pnl.margin}
            cells={[["오늘 상차", inl.today, ""], ["미배차", inl.noDriver, "#B26A00"], ["이번 달", inl.monthCount, ""]]} />
        )}
        {stats.map(([m, s]) => (
          <ModeCard key={m} mode={m} label={MODE_NAME[m]} onClick={() => goBiz(m)} profit={s.pnl.profit} margin={s.pnl.margin}
            cells={[["진행 중", s.active, ""], ["24시간 안", s.urgent, "#B26A00"], ["마감 지남", s.over, "#C2362B"]]} />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
        <Card title="전사 급한 마감" en="RISK" right={overTotal > 0 ? <span className="text-[#C2362B] text-[12.5px] font-black tabular-nums">예상 초과 비용 {won(overTotal)}원</span> : null}>
          {dues.length === 0 ? <Empty mode="group" title="3일 안에 닥친 마감이 없어요" /> : <div>{dues.map((x) => <DueRow key={x.job.id} {...x} onOpen={onOpen} />)}</div>}
        </Card>
        <Card title="팀 사이 인계 대기" en="HANDOFF QUEUE">
          {waiting.length === 0 ? <Empty mode="group" title="대기 중인 인계가 없어요" desc="해상 · 항공 → 컨테이너 → 내륙으로 넘긴 건이 접수 전이면 여기에 보여요." /> : (
            <div>
              {waiting.slice(0, 8).map((j) => (
                <button key={j.id} type="button" onClick={() => onOpen(j)} className={ROW}>
                  <ModeChip mode={j.fromMode} /><span className="text-[#9AA9C3] font-black">→</span><ModeChip mode={j.mode} />
                  <span className="text-[12.5px] font-semibold text-[#3A4A66] truncate flex-1">{j.client} · {j.jobNo}</span>
                  <span className="text-[12px] font-bold text-[#B26A00] whitespace-nowrap">{dueInfo(j.createdAtMs || now, now).text.replace("지남", "째 대기")}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Job 타임라인 ──────────────────────────────────────────────────────
export function JobTimeline({ jobs, onOpen }) {
  const [q, setQ] = React.useState(""); const [scope, setScope] = React.useState("진행");
  const groups = groupByJob(jobs).filter((g) => (scope === "전체" ? true : scope === "진행" ? !g.done : g.done))
    .filter((g) => { const k = q.trim().toLowerCase(); return !k || [g.jobNo, g.client, ...g.legs.map((l) => `${l.refNo} ${legTitle(l)}`)].some((v) => String(v || "").toLowerCase().includes(k)); });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <Seg size="sm" value={scope} onChange={setScope} options={["진행", "완료", "전체"]} />
        <SearchIn value={q} onChange={setQ} placeholder="Job 번호 · 거래처 · B/L · 컨테이너 번호" className="w-full max-w-[320px]" />
        <span className="ml-auto text-[12.5px] font-bold text-[#7A89A3] tabular-nums">Job {groups.length}개</span>
      </div>
      {groups.length === 0 && <Card><Empty mode="group" title="해당하는 Job 이 없어요" desc="화물 하나가 해상 · 항공 → 컨테이너 → 내륙으로 이어지는 흐름이 여기에 한 줄로 보여요." /></Card>}
      {groups.slice(0, 60).map((g) => (
        <section key={g.jobNo} className="rounded-xl bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="px-4 min-h-[44px] py-1.5 flex items-center gap-3 border-b border-[#EEF1F6] flex-wrap">
            <span className="text-[13px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{g.jobNo}</span>
            <span className="text-[14px] font-extrabold text-[#0F1A30] truncate">{g.client || "거래처 없음"}</span>
            {g.direction && <span className="text-[12px] font-semibold text-[#7A89A3]">{g.direction}</span>}
            <span className="ml-auto text-[12.5px] font-semibold text-[#7A89A3]">매출 <b className="text-[#0F1A30] tabular-nums">{won(g.pnl.sale)}</b> · 이익 <b className={`tabular-nums ${profitCls(g.pnl.profit, "text-[#0F1A30]")}`}>{won(g.pnl.profit)}</b></span>
          </div>
          <div className="p-3 flex items-stretch gap-0 overflow-x-auto">
            {g.legs.map((l, i) => { const due = topDeadline(l); const p = legPnl(l); return (
              <React.Fragment key={l.id}>
                {i > 0 && <div className="shrink-0 w-8 flex items-center"><span className="w-full h-[2px] bg-[#DCE3EE] relative"><span className="absolute -right-0.5 -top-[4px] w-2.5 h-2.5 rotate-45 border-t-2 border-r-2 border-[#9AA9C3]" /></span></div>}
                <button type="button" onClick={() => onOpen(l)} className="shrink-0 w-[240px] text-left rounded-lg border border-[#E3E8F0] hover:border-[#1B2B4B] bg-white p-3">
                  <div className="flex items-center gap-1.5"><ModeChip mode={l.mode} /><span className="text-[12px] font-black text-[#0F1A30] tabular-nums truncate" style={{ fontFamily: MONO }}>{l.refNo}</span></div>
                  <div className="mt-1.5 text-[12.5px] font-semibold text-[#3A4A66] truncate">{legTitle(l) || "-"}</div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap"><StatusChip job={l} />{due && <DueChip due={due} />}</div>
                  <div className="mt-2"><Stepper job={l} compact /></div>
                  <div className="mt-1.5 text-[12px] font-semibold text-[#9AA9C3] tabular-nums">이익 <span className={p.sale || p.cost ? profitCls(p.profit) : ""}>{p.sale || p.cost ? `${won(p.profit)}원` : "-"}</span></div>
                </button>
              </React.Fragment>
            ); })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── 거래처 360 ────────────────────────────────────────────────────────
export function Clients360({ jobs, inlandRows, modules }) {
  const [only, setOnly] = React.useState("전체");
  const ym12 = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 12); return d.toISOString().slice(0, 10); })();
  const rows = clientMatrix(jobs, modules.includes("inland") ? (inlandRows || []).filter((r) => r && r.상차일 >= ym12) : [], modules);
  const list = only === "영업 기회" ? rows.filter((r) => r.missing.length > 0 && r.missing.length < modules.length) : rows;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <Seg size="sm" value={only} onChange={setOnly} options={["전체", "영업 기회"]} />
        <span className={NOTE}>최근 12개월 동안 거래처가 당사의 어느 사업부를 이용했는지 보여요 · 비어 있는 칸이 영업 기회예요</span>
        <span className="ml-auto text-[12.5px] font-bold text-[#7A89A3] tabular-nums">{list.length}곳</span>
      </div>
      <Card pad={false}>
        {list.length === 0 ? <Empty mode="group" title="거래 내역이 없어요" /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[860px]">
              <thead style={{ background: THEAD_BG }}><tr>
                <th className={TH}>거래처</th>{modules.map((m) => <th key={m} className={`${TH} text-center`}>{MODE_NAME[m]}</th>)}
                <th className={`${TH} text-right`}>건수</th><th className={`${TH} text-right`}>매출</th><th className={`${TH} text-right`}>이익</th><th className={TH}>영업 기회</th>
              </tr></thead>
              <tbody>
                {list.slice(0, 200).map((r) => (
                  <tr key={r.client} className="border-b border-[#EEF1F6] hover:bg-[#F7F9FC]">
                    <td className={`${TD} font-bold text-[#0F1A30] max-w-[240px] truncate`}>{r.client}</td>
                    {modules.map((m) => <td key={m} className={`${TD} text-center tabular-nums`}>{r.by[m] ? <span className="font-black text-[#0F1A30]">{r.by[m].count}건</span> : <span className="text-[#C3CCDB]">-</span>}</td>)}
                    <td className={`${TD} text-right tabular-nums font-semibold`}>{r.count}</td><td className={`${TD} text-right tabular-nums font-semibold`}>{won(r.sale)}</td>
                    <td className={`${TD} text-right tabular-nums font-black ${profitCls(r.profit, "text-[#0F1A30]")}`}>{won(r.profit)}</td>
                    <td className={TD}><div className="flex gap-2">{r.missing.map((m) => <span key={m} className="text-[#B26A00] text-[12px] font-bold">{MODE_NAME[m]} 제안</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
