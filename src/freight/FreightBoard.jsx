// ======================= src/freight/FreightBoard.jsx =======================
// 🚢 2026-11-12 운송현황(표) · 인계함 · 상세 창(진행 단계 · 마감 · 손익 · 인계 · 이력)
import React from "react";
import {
  statusList, HANDOFF_STATUS, nextStatus, isDone, progressPct, topDeadline, deadlinesOf, dueInfo, overCost, legPnl, sumPnl, won, fmtDT, fmtCntrNo, fmtAwb,
  portLabel, airportLabel, airline, legTitle, handoffTargets, cntrType,
} from "./freightCore";
import { setLegStatus, removeLeg, requestHandoff } from "./freightStore";
import FreightForm from "./FreightForm";
import { Card, Btn, Sel, Seg, Empty, StatusChip, DueChip, Stepper, Drawer, ContainerArt, RouteArt, routeEnds, ModeChip, MODE_NAME, MONO } from "./ui";

const TH = "px-3 h-10 text-left text-[11.5px] font-extrabold text-white/80 whitespace-nowrap";
const TD = "px-3 h-[52px] text-[13px] text-[#3A4A66] whitespace-nowrap";
const mono = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

// 영역별 표 칸
const COLS = {
  container: [
    ["구분", (j) => j.trip || "-"], ["규격", (j) => <b className="text-[#0F1A30]">{j.size || "-"}</b>], ["컨테이너 번호", (j) => <span style={mono} className="font-bold text-[#0F1A30]">{fmtCntrNo(j.cntrNo) || "-"}</span>],
    ["선사", (j) => j.line || "-"], ["픽업지", (j) => j.pickupPlace || "-"], ["작업지", (j) => j.doorPlace || "-"], ["작업", (j) => fmtDT(j.doorDate ? `${j.doorDate}${j.doorTime ? `T${j.doorTime}` : ""}` : "") || "-"],
    ["기사 · 차량", (j) => [j.driver, j.carNo].filter(Boolean).join(" · ") || <span className="text-[#B26A00] font-bold">미배차</span>],
  ],
  sea: [
    ["형태", (j) => <b className="text-[#0F1A30]">{j.seaType || "-"}</b>], ["B/L", (j) => <span style={mono} className="font-bold text-[#0F1A30]">{j.hblNo || j.mblNo || "-"}</span>],
    ["구간", (j) => (j.pol && j.pod ? `${j.pol} → ${j.pod}` : "-")], ["선사 · 선명", (j) => [j.line, j.vessel].filter(Boolean).join(" · ") || "-"],
    ["ETD", (j) => fmtDT(j.etd) || "-"], ["ETA", (j) => fmtDT(j.eta) || "-"],
    ["물량", (j) => (j.seaType === "FCL" ? (j.cntrs || []).map((c) => `${c.size}×${c.qty}`).join(", ") : j.cbm ? `${j.cbm} CBM` : "") || "-"],
  ],
  air: [
    ["AWB", (j) => <span style={mono} className="font-bold text-[#0F1A30]">{j.hawbNo || fmtAwb(j.mawbNo) || "-"}</span>], ["구간", (j) => (j.dep && j.arr ? `${j.dep} → ${j.arr}` : "-")],
    ["항공편", (j) => [airline(j.airline)?.[1], j.flightNo].filter(Boolean).join(" · ") || "-"], ["ETD", (j) => fmtDT(j.etd) || "-"], ["ETA", (j) => fmtDT(j.eta) || "-"],
    ["개수", (j) => (j.pieces ? `${j.pieces} PCS` : "-")], ["C/W", (j) => (j.cw ? `${Number(j.cw).toLocaleString("ko-KR")} kg` : "-")],
  ],
  inland: [
    ["상차지", (j) => j.pickupPlace || "-"], ["하차지", (j) => j.dropPlace || "-"], ["상차", (j) => fmtDT(j.pickupDate ? `${j.pickupDate}${j.pickupTime ? `T${j.pickupTime}` : ""}` : "") || "-"],
    ["차량", (j) => [j.carTon, j.carType].filter(Boolean).join(" ") || "-"], ["기사 · 차량", (j) => [j.driver, j.carNo].filter(Boolean).join(" · ") || "-"], ["앞 구간", (j) => (j.fromMode ? `${MODE_NAME[j.fromMode]} ${j.fromRef || ""}` : "-")],
  ],
};

// 상세 창 — 영역별 정보
function facts(j) {
  if (j.mode === "container") return [
    ["운송 구분", j.trip], ["규격", cntrType(j.size)?.label || j.size], ["컨테이너 번호", fmtCntrNo(j.cntrNo)], ["씰 번호", j.sealNo], ["선사", j.line], ["부킹 번호", j.bookingNo], ["B/L 번호", j.blNo],
    ["선명 · 항차", [j.vessel, j.voyage].filter(Boolean).join(" ")], ["중량", j.weight ? `${j.weight}톤` : ""], ["위험물", j.dg === "Y" ? "위험물" : ""], ["설정 온도", j.temp ? `${j.temp}℃` : ""], ["품명", j.cargo],
    ["픽업지", j.pickupPlace], ["작업지", j.doorPlace], ["작업", fmtDT(j.doorDate ? `${j.doorDate}${j.doorTime ? `T${j.doorTime}` : ""}` : "")], [j.trip === "수출" ? "반입 터미널" : "반납지", j.returnPlace],
    ["차량 구분", j.carKind], ["기사", j.driver], ["차량 번호", j.carNo], ["연락처", j.driverPhone], ["샤시", j.chassis], ["운임 구분", j.fareKind],
  ];
  if (j.mode === "sea") return [
    ["수출입", j.direction], ["선적 형태", j.seaType], ["인코텀즈", j.incoterms], ["운임 조건", j.freightTerm], ["운송 조건", j.serviceTerm], ["B/L 종류", j.blType],
    ["House B/L", j.hblNo], ["Master B/L", j.mblNo], ["부킹 번호", j.bookingNo], ["선사", j.line], ["선명 · 항차", [j.vessel, j.voyage].filter(Boolean).join(" ")],
    ["선적항", portLabel(j.pol)], ["도착항", portLabel(j.pod)], ["ETD", fmtDT(j.etd)], ["ETA", fmtDT(j.eta)],
    ["컨테이너", j.seaType === "FCL" ? (j.cntrs || []).map((c) => `${c.size} × ${c.qty}`).join(", ") : ""], ["포장", j.pkgQty ? `${j.pkgQty} ${String(j.pkgUnit || "").split(" ")[0]}` : ""],
    ["총중량", j.grossWeight ? `${Number(j.grossWeight).toLocaleString("ko-KR")} kg` : ""], ["용적", j.cbm ? `${j.cbm} CBM` : ""], ["품명", j.commodity],
    ["송하인", j.shipper], ["수하인", j.consignee], ["해외 파트너", j.partner], ["관세사", j.broker],
  ];
  if (j.mode === "air") return [
    ["수출입", j.direction], ["인코텀즈", j.incoterms], ["운임 조건", j.freightTerm], ["항공사", airline(j.airline)?.[1]], ["편명", j.flightNo], ["Master AWB", fmtAwb(j.mawbNo)], ["House AWB", j.hawbNo],
    ["출발", airportLabel(j.dep)], ["도착", airportLabel(j.arr)], ["ETD", fmtDT(j.etd)], ["ETA", fmtDT(j.eta)], ["반입 창고", j.warehouse],
    ["개수", j.pieces ? `${j.pieces} PCS` : ""], ["실중량", j.grossWeight ? `${j.grossWeight} kg` : ""], ["부피중량", j.volWeight ? `${j.volWeight} kg` : ""], ["운임중량", j.cw ? `${j.cw} kg` : ""], ["품명", j.commodity],
    ["송하인", j.shipper], ["수하인", j.consignee], ["해외 파트너", j.partner], ["관세사", j.broker],
  ];
  return [
    ["상차지", j.pickupPlace], ["하차지", j.dropPlace], ["상차", fmtDT(j.pickupDate ? `${j.pickupDate}${j.pickupTime ? `T${j.pickupTime}` : ""}` : "")], ["차량", [j.carTon, j.carType].filter(Boolean).join(" ")],
    ["기사", j.driver], ["차량 번호", j.carNo], ["화물", j.cargo], ["포장 수량", j.pkgQty], ["중량", j.weight],
  ];
}

export function LegDrawer({ job, jobs, modules, me, canEdit, onClose, onEdit, onOpenLeg }) {
  const [busy, setBusy] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  React.useEffect(() => { setConfirmDel(false); }, [job?.id]);
  if (!job) return null;
  const now = Date.now();
  const next = nextStatus(job);
  const dls = deadlinesOf(job);
  const pnl = legPnl(job);
  const siblings = jobs.filter((x) => x.jobNo === job.jobNo && x.id !== job.id);
  const jobPnl = sumPnl([job, ...siblings]);
  const over = overCost(job, now);
  const targets = handoffTargets(job, modules).filter((t) => !siblings.some((s) => s.mode === t && s.fromLeg === job.id));
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { window.alert(`처리하지 못했습니다. ${e?.message || ""}`); } setBusy(false); };
  const ends = routeEnds(job);
  return (
    <Drawer open onClose={onClose} sub={`${job.jobNo} · ${MODE_NAME[job.mode]}`} title={`${job.refNo} · ${job.client || "거래처 없음"}`}
      footer={canEdit ? (<>
        {confirmDel
          ? <><span className="text-[12.5px] font-bold text-[#C2362B]">이 건을 삭제할까요?</span><Btn kind="danger" size="sm" disabled={busy} onClick={() => run(async () => { await removeLeg(job); onClose(); })}>삭제</Btn><Btn size="sm" onClick={() => setConfirmDel(false)}>취소</Btn></>
          : <Btn kind="danger" size="sm" onClick={() => setConfirmDel(true)}>삭제</Btn>}
        <div className="ml-auto flex gap-2">
          <Btn onClick={() => onEdit(job)}>{job.status === HANDOFF_STATUS ? "내용 채우고 접수" : "수정"}</Btn>
          {next && job.status !== HANDOFF_STATUS && <Btn kind="primary" disabled={busy} onClick={() => run(() => setLegStatus(job, next, me))}>다음 단계 · {next}</Btn>}
        </div>
      </>) : null}>
      <div className="rounded-2xl p-4 text-white flex flex-col items-center" style={{ background: "linear-gradient(135deg,#0B1428 0%,#14203A 45%,#1B2B4B 75%,#2D4C82 100%)" }}>
        {job.mode === "container" ? <ContainerArt size={job.size} cntrNo={fmtCntrNo(job.cntrNo)} line={job.line} height={92} />
          : job.mode === "inland" ? <div className="py-4 text-[15px] font-black">{job.pickupPlace || "상차지"} → {job.dropPlace || "하차지"}</div>
          : <RouteArt mode={job.mode} {...ends} pct={progressPct(job)} />}
        <div className="mt-2 flex items-center gap-2 flex-wrap justify-center">
          <StatusChip job={job} />
          {dls.slice(0, 3).map((d) => <DueChip key={d.key} due={{ ...d, ...dueInfo(d.at, now) }} />)}
        </div>
      </div>

      <Card title="진행 단계" en="PROGRESS" right={canEdit && job.status !== HANDOFF_STATUS ? (
        <div className="w-[150px]"><Sel value={job.status} onChange={(v) => v && v !== job.status && run(() => setLegStatus(job, v, me))} options={statusList(job.mode)} /></div>
      ) : null}>
        <Stepper job={job} />
      </Card>

      {over.days > 0 && (
        <div className="rounded-2xl px-4 py-3 border border-[#F0C9C5] bg-[#FDF3F2] text-[13px] font-bold text-[#C2362B]">
          {job.mode === "container" ? "반납 기한" : "프리타임"}을 {over.days}일 넘겼습니다{over.cost > 0 ? ` · 예상 초과 비용 ${won(over.cost)}원` : " · 하루 비용을 넣으면 예상 금액이 나옵니다"}.
        </div>
      )}

      {dls.length > 0 && (
        <Card title="마감 · 일정" en="DEADLINES">
          <div className="space-y-2">
            {dls.map((d) => (
              <div key={d.key} className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-[#3A4A66] w-28 shrink-0">{d.label}</span>
                <span className="text-[13px] font-black text-[#0F1A30] tabular-nums">{fmtDT(d.raw)}</span>
                <span className="ml-auto"><DueChip due={{ ...d, ...dueInfo(d.at, now) }} showLabel={false} /></span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="상세" en="DETAIL">
        <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
          {facts(job).filter((x) => x[1]).map(([l, v]) => (
            <div key={l} className="min-w-0"><div className="text-[11.5px] font-bold text-[#9AA9C3]">{l}</div><div className="text-[13.5px] font-bold text-[#0F1A30] break-words">{v}</div></div>
          ))}
        </div>
        {job.memo && <div className="mt-3 pt-3 border-t border-[#EEF1F6] text-[13px] text-[#3A4A66] whitespace-pre-wrap">{job.memo}</div>}
      </Card>

      <Card title="손익" en="P&L" right={<span className="text-[12px] font-bold text-[#7A89A3]">Job 전체 이익 <b className={jobPnl.profit < 0 ? "text-[#C2362B]" : "text-[#0F1A30]"}>{won(jobPnl.profit)}원</b></span>}>
        <div className="grid grid-cols-3 gap-2">
          {[["청구", pnl.sale], ["지급", pnl.cost], ["이익", pnl.profit]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2.5"><div className="text-[11.5px] font-bold text-[#7A89A3]">{l}</div><div className={`text-[16px] font-black tabular-nums ${l === "이익" && v < 0 ? "text-[#C2362B]" : "text-[#0F1A30]"}`}>{won(v)}</div></div>
          ))}
        </div>
        {[["청구", job.sales], ["지급", job.costs]].map(([l, lines]) => (Array.isArray(lines) && lines.length > 0 ? (
          <div key={l} className="mt-3">
            <div className="text-[11.5px] font-extrabold text-[#9AA9C3] mb-1">{l} 항목</div>
            {lines.map((x, i) => <div key={i} className="flex items-center gap-2 h-7 text-[12.5px]"><span className="font-bold text-[#3A4A66] truncate">{x.item}</span>{x.vendor && <span className="text-[#9AA9C3] truncate">{x.vendor}</span>}<span className="ml-auto font-black text-[#0F1A30] tabular-nums">{x.cur && x.cur !== "KRW" ? `${x.cur} ${x.amount}` : `${won(x.amount)}원`}</span></div>)}
          </div>
        ) : null))}
      </Card>

      <Card title="Job 연결 구간" en="LINKED LEGS">
        {siblings.length === 0 && <div className="text-[13px] text-[#9AA9C3] font-semibold">아직 이어진 구간이 없습니다.</div>}
        <div className="space-y-1.5">
          {siblings.map((s) => (
            <button key={s.id} type="button" onClick={() => onOpenLeg?.(s)} className="w-full flex items-center gap-2 px-3 h-11 rounded-xl border border-[#E3E8F0] bg-white hover:border-[#2D4C82] text-left">
              <ModeChip mode={s.mode} /><span className="text-[12.5px] font-extrabold text-[#0F1A30] tabular-nums">{s.refNo}</span><span className="text-[12.5px] text-[#5B6B85] truncate flex-1">{legTitle(s)}</span><StatusChip job={s} />
            </button>
          ))}
        </div>
        {canEdit && targets.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#EEF1F6] flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-bold text-[#5B6B85]">다음 구간 인계</span>
            {targets.map((t) => <Btn key={t} size="sm" kind="soft" disabled={busy} onClick={() => run(() => requestHandoff(job, t, {}, me))}>{MODE_NAME[t]}팀에 요청</Btn>)}
          </div>
        )}
      </Card>

      {Array.isArray(job.history) && job.history.length > 0 && (
        <Card title="이력" en="HISTORY">
          <div className="space-y-2">
            {[...job.history].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[12.5px]">
                <span className="mt-1.5 w-1.5 h-1.5 rotate-45 bg-[#4B6CB7] shrink-0" />
                <span className="font-bold text-[#0F1A30] flex-1">{h.text}</span>
                <span className="text-[#9AA9C3] font-semibold whitespace-nowrap tabular-nums">{h.by ? `${h.by} · ` : ""}{new Date(h.at + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ").replace("-", ".")}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Drawer>
  );
}

// 운송현황 · 인계함 공용 표
export default function FreightBoard({ mode, jobs, allJobs, handoffOnly = false, modules, me, canEdit, formProps, onNew }) {
  const [q, setQ] = React.useState("");
  const [st, setSt] = React.useState("");
  const [scope, setScope] = React.useState("진행");
  const [dir, setDir] = React.useState("");
  const [openId, setOpenId] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  const now = Date.now();
  const mine = React.useMemo(() => jobs.filter((j) => j.mode === mode && (handoffOnly ? j.status === HANDOFF_STATUS : true)), [jobs, mode, handoffOnly]);
  const rows = React.useMemo(() => {
    const key = q.trim().toLowerCase();
    return mine.filter((j) => {
      if (!handoffOnly) {
        if (scope === "진행" && isDone(j)) return false;
        if (scope === "완료" && !isDone(j)) return false;
        if (st && j.status !== st) return false;
        if (dir && (j.direction || j.trip) !== dir) return false;
      }
      if (!key) return true;
      return [j.jobNo, j.refNo, j.client, j.cntrNo, j.blNo, j.hblNo, j.mblNo, j.hawbNo, j.mawbNo, j.bookingNo, j.vessel, j.flightNo, j.driver, j.carNo, j.doorPlace, j.pickupPlace, j.dropPlace].some((v) => String(v || "").toLowerCase().includes(key));
    });
  }, [mine, q, st, scope, dir, handoffOnly]);
  const open = openId ? allJobs.find((j) => j.id === openId) : null;

  if (edit) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4"><Btn size="sm" onClick={() => setEdit(null)}>← 목록으로</Btn><span className="text-[14px] font-black text-[#0F1A30]">{edit.refNo} {edit.status === HANDOFF_STATUS ? "인계 접수" : "수정"}</span></div>
        <FreightForm {...formProps} mode={edit.mode} initial={edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} />
      </div>
    );
  }
  const cols = COLS[mode] || COLS.inland;
  return (
    <>
      <Card pad={false}>
        <div className="p-4 flex items-center gap-2.5 flex-wrap border-b border-[#EEF1F6]">
          {!handoffOnly && <Seg size="sm" value={scope} onChange={setScope} options={["진행", "완료", "전체"]} />}
          {!handoffOnly && mode !== "inland" && <Seg size="sm" value={dir} onChange={setDir} options={[["", "전체"], ["수출", "수출"], ["수입", "수입"]]} />}
          {!handoffOnly && <div className="w-[150px]"><Sel value={st} onChange={setSt} options={statusList(mode)} placeholder="상태 전체" /></div>}
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="번호 · 거래처 · 기사 검색"
              className="w-full h-10 border border-[#DCE3EE] rounded-xl pl-9 pr-3 text-[13.5px] font-semibold text-[#0F1A30] placeholder:text-[#9AA9C3] focus:outline-none focus:border-[#2D4C82]" />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          </div>
          <span className="ml-auto text-[12.5px] font-bold text-[#7A89A3] tabular-nums">{rows.length}건</span>
          {onNew && canEdit && !handoffOnly && <Btn kind="primary" size="sm" onClick={onNew}>+ 등록</Btn>}
        </div>
        {rows.length === 0 ? (
          <Empty mode={mode} title={handoffOnly ? "받은 인계 요청이 없습니다" : "조건에 맞는 건이 없습니다"} desc={handoffOnly ? "다른 팀이 인계를 요청하면 여기에 뜹니다." : "검색 · 상태 조건을 바꿔 보세요."} action={onNew && canEdit && !handoffOnly ? <Btn kind="primary" onClick={onNew}>+ 새로 등록</Btn> : null} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[980px]">
              <thead style={{ background: "#0F1A30" }}>
                <tr>
                  <th className={TH}>번호</th><th className={TH}>거래처</th>
                  {cols.map(([l]) => <th key={l} className={TH}>{l}</th>)}
                  <th className={TH}>진행</th><th className={TH}>마감</th><th className={`${TH} text-right`}>이익</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => {
                  const due = topDeadline(j, now); const p = legPnl(j);
                  return (
                    <tr key={j.id} onClick={() => setOpenId(j.id)} className="border-b border-[#EEF1F6] hover:bg-[#F5F8FD] cursor-pointer">
                      <td className={TD}><div className="font-black text-[#0F1A30] text-[12.5px]" style={mono}>{j.refNo}</div><div className="text-[11px] font-bold text-[#9AA9C3]" style={mono}>{j.jobNo}</div></td>
                      <td className={`${TD} font-bold text-[#0F1A30] max-w-[180px] truncate`}>{j.client || "-"}</td>
                      {cols.map(([l, fn]) => <td key={l} className={`${TD} max-w-[190px] truncate`}>{fn(j)}</td>)}
                      <td className={TD}><div className="flex flex-col gap-1"><StatusChip job={j} /><Stepper job={j} compact /></div></td>
                      <td className={TD}><DueChip due={due} /></td>
                      <td className={`${TD} text-right font-black tabular-nums ${p.profit < 0 ? "text-[#C2362B]" : "text-[#0F1A30]"}`}>{p.sale || p.cost ? won(p.profit) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <LegDrawer job={open} jobs={allJobs} modules={modules} me={me} canEdit={canEdit} onClose={() => setOpenId("")} onEdit={(j) => { setOpenId(""); setEdit(j); }} onOpenLeg={(s) => setOpenId(s.id)} />
    </>
  );
}
