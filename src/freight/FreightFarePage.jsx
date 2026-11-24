// ======================= src/freight/FreightFarePage.jsx =======================
// 💰 2026-11-18 컨테이너 · 해상 · 항공 운임조회 — 내륙 운임(단가표 · 운임조회)과 같은 모양(왼쪽 세부 메뉴 + 남색 조건 카드 + 결과)
//  · 구간별 운임표: 지난 건을 구간으로 묶어 건수 · 평균 청구 · 평균 지급 · 평균 수익(항공은 kg당 단가)
//  · 운임 찾기: 구간 조건을 넣으면 같은 구간 → 비슷한 구간 순서로 지난 운임
import React from "react";
import KpSubNav from "../KpSubNav";
import { won, PORTS, AIRPORTS, TERMINALS, CNTR_TYPES, portName } from "./freightCore";
import { similarJobs, fareStats, laneTable, routeText } from "./freightFare";
import { Sel, Combo, MONO } from "./ui";
import { NavyTable } from "./inlandLook";
import { profitColor } from "../marginPct";

const LABEL = { container: "컨테이너", sea: "해상", air: "항공" };
const codeOptions = (groups) => groups.map((g) => ({ group: g.group, items: g.items.map((x) => [x[0], `${x[1]} (${x[0]})`]) }));
const ymd = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : "-");

function CondCard({ mode, cond, setCond, places }) {
  const set = (k, v) => setCond((c) => ({ ...c, [k]: v }));
  const lbl = "block text-[13px] font-extrabold text-[#3A4A66] mb-1.5";
  return (
    <div className="rounded-[20px] bg-white border border-[#E3E8F0] overflow-hidden shadow-[0_12px_30px_rgba(16,24,40,0.07)]">
      <div className="px-5 py-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 40%,#1B2B4B 75%,#2D4C82 100%)" }}>
        <div className="text-[10px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ROUTE INPUT</div>
        <div className="text-[16px] font-black">구간 조건</div>
      </div>
      <div className="p-5 space-y-4">
        {mode === "container" && (<>
          <div><label className={lbl}>픽업지 (터미널 · CY)</label><Combo value={cond.pickupPlace || ""} onChange={(v) => set("pickupPlace", v)} options={TERMINALS} placeholder="예: 부산신항 PNC" /></div>
          <div><label className={lbl}>작업지 (도어) *</label><Combo value={cond.doorPlace || ""} onChange={(v) => set("doorPlace", v)} options={places} placeholder="상하차지 검색" /></div>
          <div><label className={lbl}>규격</label><Sel value={cond.size || ""} onChange={(v) => set("size", v)} options={CNTR_TYPES.map((t) => [t.key, t.label])} placeholder="전체(20 · 40)" /></div>
        </>)}
        {mode === "sea" && (<>
          <div><label className={lbl}>선적항 (POL) *</label><Sel value={cond.pol || ""} onChange={(v) => set("pol", v)} options={codeOptions(PORTS)} placeholder="항구 선택" /></div>
          <div><label className={lbl}>도착항 (POD) *</label><Sel value={cond.pod || ""} onChange={(v) => set("pod", v)} options={codeOptions(PORTS)} placeholder="항구 선택" /></div>
          <div><label className={lbl}>형태</label><Sel value={cond.seaType || ""} onChange={(v) => set("seaType", v)} options={["FCL", "LCL", "BULK", "RO-RO"]} placeholder="전체" /></div>
        </>)}
        {mode === "air" && (<>
          <div><label className={lbl}>출발 공항 *</label><Sel value={cond.dep || ""} onChange={(v) => set("dep", v)} options={codeOptions(AIRPORTS)} placeholder="공항 선택" /></div>
          <div><label className={lbl}>도착 공항 *</label><Sel value={cond.arr || ""} onChange={(v) => set("arr", v)} options={codeOptions(AIRPORTS)} placeholder="공항 선택" /></div>
        </>)}
        <button type="button" onClick={() => setCond({ mode })} className="w-full h-10 rounded-xl border border-[#DCE3EE] text-[13px] font-extrabold text-[#1B2B4B] hover:border-[#1B2B4B]">조건 지우기</button>
      </div>
    </div>
  );
}

function StatCard({ label, st, unit = "원" }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 min-w-0">
      <div className="text-[12px] font-bold text-white/60">{label}</div>
      {st ? (<>
        <div className="text-[22px] font-black text-white tabular-nums mt-0.5">{won(st.avg)}<span className="text-[12px] text-white/60 ml-1">{unit}</span></div>
        <div className="text-[11.5px] font-bold text-white/55 tabular-nums">최저 {won(st.min)} · 최고 {won(st.max)} · {st.n}건</div>
      </>) : <div className="text-[14px] font-bold text-white/40 mt-1">-</div>}
    </div>
  );
}

export default function FreightFarePage({ mode, jobs, places = [], onOpen }) {
  const [tab, setTab] = React.useState("find");
  const [cond, setCond] = React.useState({ mode });
  React.useEffect(() => { setCond({ mode }); }, [mode]);
  const ready = mode === "container" ? !!cond.doorPlace : mode === "sea" ? !!(cond.pol && cond.pod) : !!(cond.dep && cond.arr);
  const found = ready ? similarJobs(cond, jobs, { limit: 200 }) : [];
  const st = fareStats(found);
  const lanes = React.useMemo(() => laneTable(jobs, mode), [jobs, mode]);
  const items = [
    { key: "find", label: "운임 찾기", en: "FARE SEARCH", icon: "money" },
    { key: "lanes", label: "구간별 운임표", en: "BY ROUTE", icon: "route" },
  ];
  const laneCols = [
    { key: "route", label: mode === "container" ? "픽업 → 작업지 · 규격" : "구간", align: "left", cell: (g) => <b>{routeText(g.sample) || "-"}</b> },
    ...(mode === "sea" ? [{ key: "names", label: "항구", cell: (g) => `${portName(g.sample.pol)} → ${portName(g.sample.pod)}` }] : []),
    { key: "n", label: "건수", cell: (g) => `${g.n}건` },
    { key: "sale", label: "평균 청구", align: "right", cell: (g) => <b>{won(g.avgSale)}</b> },
    { key: "cost", label: "평균 지급", align: "right", cell: (g) => won(g.avgCost) },
    { key: "profit", label: "평균 수익", align: "right", cell: (g) => <b style={{ color: profitColor(g.avgProfit) }}>{won(g.avgProfit)}</b> },
    ...(mode === "air" ? [{ key: "kg", label: "kg당 청구", align: "right", cell: (g) => (g.perKg ? `${won(g.perKg)}원` : "-") }] : []),
    { key: "last", label: "최근", cell: (g) => ymd(g.last) },
  ];
  const findCols = [
    { key: "score", label: "구분", cell: (x) => <b style={{ color: x.score === 2 ? "#1B2B4B" : "#9AA9C3" }}>{x.score === 2 ? "같은 구간" : "비슷한 구간"}</b> },
    { key: "date", label: "등록일", cell: (x) => ymd(x.j.createdAtMs) },
    { key: "client", label: "거래처명", align: "left", cell: (x) => <b>{x.j.client || "-"}</b> },
    { key: "route", label: "구간", align: "left", cell: (x) => routeText(x.j) || "-" },
    { key: "sale", label: "청구운임", align: "right", cell: (x) => <b>{won(x.p.sale)}</b> },
    { key: "cost", label: "지급운임", align: "right", cell: (x) => won(x.p.cost) },
    { key: "profit", label: "수익", align: "right", cell: (x) => <b style={{ color: profitColor(x.p.profit) }}>{won(x.p.profit)}</b> },
    ...(mode === "air" ? [{ key: "kg", label: "kg당", align: "right", cell: (x) => (Number(x.j.cw) > 0 && x.p.sale ? `${won(Math.round(x.p.sale / Number(x.j.cw)))}원` : "-") }] : []),
  ];
  return (
    <KpSubNav code={`${{ container: "CONTAINER", sea: "OCEAN", air: "AIR" }[mode]} FARE`} title="운임조회" icon="money" items={items} active={tab} onSelect={setTab}>
      {tab === "find" ? (
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>FARE · {LABEL[mode]}</div>
          <h2 className="text-[21px] font-black text-[#0F1A30]">운임 찾기</h2>
          <p className="text-[13px] font-medium text-[#5B6B85] mb-4">지난 {LABEL[mode]} 건에서 같은 구간 운임을 찾아 최저 · 평균 · 최고를 보여 줘요.</p>
          <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
            <CondCard mode={mode} cond={cond} setCond={setCond} places={places} />
            <div className="space-y-4 min-w-0">
              <div className="rounded-[20px] px-6 py-5 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 40%,#1B2B4B 75%,#2D4C82 100%)" }}>
                {!ready ? (
                  <div className="py-8 text-center">
                    <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>RATE ENGINE · READY</div>
                    <div className="text-[17px] font-black mt-2">왼쪽에 구간 조건을 넣으면 지난 운임을 찾아요</div>
                    <div className="text-[13px] text-white/60 mt-1">{mode === "container" ? "작업지(도어)만 넣어도 돼요. 픽업지 · 규격까지 같으면 '같은 구간'" : mode === "sea" ? "선적항 · 도착항을 넣어 주세요. 형태가 같으면 '같은 구간'" : "출발 · 도착 공항을 넣어 주세요. kg당 단가도 계산해요"}</div>
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>RESULT</div>
                    <div className="text-[17px] font-black mb-3">{routeText(cond) || "-"} · {found.length}건</div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <StatCard label="청구운임(평균)" st={st.sale} />
                      <StatCard label="지급운임(평균)" st={st.cost} />
                      {mode === "air" ? <StatCard label="kg당 청구(평균)" st={st.perKg} /> : <StatCard label="수익(평균)" st={st.sale && st.cost ? { avg: st.sale.avg - st.cost.avg, min: st.sale.min - st.cost.max, max: st.sale.max - st.cost.min, n: found.length } : null} />}
                    </div>
                  </>
                )}
              </div>
              {ready && <NavyTable rows={found} cols={findCols} rowKey={(x) => x.j.id} onRowClick={(x) => onOpen?.(x.j)} empty="같은 구간의 지난 운임이 없어요." />}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>FARE · BY ROUTE</div>
          <h2 className="text-[21px] font-black text-[#0F1A30]">구간별 운임표</h2>
          <p className="text-[13px] font-medium text-[#5B6B85] mb-4">많이 다닌 구간부터 · 평균 운임과 수익이에요. 줄을 누르면 그 구간으로 운임 찾기를 열어요.</p>
          <NavyTable rows={lanes} cols={laneCols} rowKey={(g) => g.key}
            onRowClick={(g) => { const j = g.sample; setCond(mode === "container" ? { mode, pickupPlace: j.pickupPlace, doorPlace: j.doorPlace, size: j.size } : mode === "sea" ? { mode, pol: j.pol, pod: j.pod, seaType: j.seaType } : { mode, dep: j.dep, arr: j.arr }); setTab("find"); }}
            empty="운임이 들어간 지난 건이 아직 없어요." />
        </div>
      )}
    </KpSubNav>
  );
}
