// ======================= src/freight/FreightStatus.jsx =======================
// 🎨 2026-11-18 컨테이너 · 해상 · 항공 "운송현황 · 실시간현황" — 내륙 배차현황 · 실시간배차현황과 같은 모양
//  · 운송현황(list): 왼쪽 세부 메뉴(운송현황 · 미배차/부킹대기 · 마감보드 · 인계함) + 알약(총 · 청구 · 지급 · 수익) + 날짜 · 검색 줄 + 남색 표
//  · 실시간현황(live): 어제 · 오늘 · 내일 건을 바로(날짜 칸 없이)
//  · 오더등록 아래(embed): 오늘 건 — 내륙 오더등록 아래 목록처럼
//  칸은 업무마다 다르다(업무자가 늘 보던 순서): 컨테이너 = 작업일 · 컨테이너 번호 · 픽업 → 작업지 → 반납 · 기사
//  해상 = ETD · ETA · POL → POD · B/L · 마감, 항공 = ETD · ETA · 출발 → 도착 · AWB · 운임중량
import React from "react";
import * as XLSX from "xlsx";
import KpSubNav from "../KpSubNav";
import CustomSelect from "../CustomSelect";
import { HANDOFF_STATUS, isDone, legPnl, topDeadline, fmtCntrNo, fmtAwb, airline, portName, statusList } from "./freightCore";
import { removeLeg } from "./freightStore";
import { StatusChip, DueChip, MONO } from "./ui";
import { DeadlineBoard } from "./FreightDash";
import { KpiPills, DateSearchBar, NavyTable, smallBtn, ymdK, addDays } from "./inlandLook";
import { profitColor } from "../marginPct";

const mono = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };
const dash = (v) => (v === undefined || v === null || v === "" ? "-" : v);
const md = (v) => { const s = String(v || ""); if (!s) return "-"; const d = s.slice(0, 10); const t = s.length > 10 ? s.slice(11, 16) : ""; return `${d.slice(5).replace("-", "/")}${t ? ` ${t}` : ""}`; };
const wonCell = (n) => (n ? Math.round(n).toLocaleString("ko-KR") : "-");

// 업무별 기준 날짜(목록 · 기간 조회) — 컨테이너 작업일, 해상 · 항공 출발(ETD). 없으면 등록일
export function dateOf(j) {
  const d = j.mode === "container" ? j.doorDate : j.mode === "inland" ? j.pickupDate : j.etd;
  if (d) return String(d).slice(0, 10);
  return j.createdAtMs ? ymdK(new Date(j.createdAtMs)) : "";
}
const regDate = (j) => (j.createdAtMs ? ymdK(new Date(j.createdAtMs)).slice(5).replace("-", "/") : "-");

// 업무별 "미배차" 기준 — 컨테이너는 기사 · 차량 미정, 해상 · 항공은 아직 부킹 단계
export function isPending(j) {
  if (isDone(j) || j.status === HANDOFF_STATUS) return false;
  if (j.mode === "container" || j.mode === "inland") return !String(j.driver || "").trim() && !String(j.carNo || "").trim();
  return statusList(j.mode).indexOf(j.status) <= 0;
}
export const PENDING_LABEL = { container: "미배차현황", sea: "부킹대기", air: "부킹대기" };
export const LIST_LABEL = { container: "운송현황", sea: "선적현황", air: "항공현황" };
const DATE_LABEL = { container: "작업일 기준", sea: "출항일(ETD) 기준", air: "출발(ETD) 기준" };

const money = (j) => legPnl(j);
const statusCell = { key: "status", label: "진행상태", cell: (j) => <StatusChip job={j} />, text: (j) => j.status || "" };
const dueCell = { key: "due", label: "다음 마감", cell: (j) => <DueChip due={topDeadline(j)} />, text: (j) => { const d = topDeadline(j); return d ? `${d.label} ${d.text}` : ""; } };
const moneyCols = [
  { key: "sale", label: "청구운임", align: "right", cell: (j) => wonCell(money(j).sale), text: (j) => money(j).sale },
  { key: "cost", label: "지급운임", align: "right", cell: (j) => wonCell(money(j).cost), text: (j) => money(j).cost },
  { key: "profit", label: "수익", align: "right", cell: (j) => { const p = money(j); return p.sale || p.cost ? <b style={{ color: profitColor(p.profit) }}>{wonCell(p.profit)}</b> : "-"; }, text: (j) => money(j).profit },
];
const memoCol = { key: "memo", label: "메모", wrap: true, cell: (j) => dash(j.memo), text: (j) => j.memo || "" };

export const COLS = {
  container: [
    { key: "reg", label: "등록일", cell: regDate, text: regDate },
    { key: "date", label: "작업일", cell: (j) => md(j.doorDate), text: (j) => j.doorDate || "" },
    { key: "time", label: "작업시간", cell: (j) => dash(j.doorTime), text: (j) => j.doorTime || "" },
    { key: "trip", label: "구분", cell: (j) => <b>{dash(j.trip)}</b>, text: (j) => j.trip || "" },
    { key: "client", label: "거래처명", align: "left", wrap: true, cell: (j) => <b>{dash(j.client)}</b>, text: (j) => j.client || "" },
    { key: "line", label: "선사", cell: (j) => dash(j.line), text: (j) => j.line || "" },
    { key: "cntr", label: "컨테이너번호", cell: (j) => <span style={mono} className="font-bold">{dash(fmtCntrNo(j.cntrNo))}</span>, text: (j) => fmtCntrNo(j.cntrNo) || "" },
    { key: "size", label: "규격", cell: (j) => <b>{dash(j.size)}</b>, text: (j) => j.size || "" },
    { key: "pick", label: "픽업지", align: "left", wrap: true, cell: (j) => dash(j.pickupPlace), text: (j) => j.pickupPlace || "" },
    { key: "door", label: "작업지(도어)", align: "left", wrap: true, cell: (j) => dash(j.doorPlace), text: (j) => j.doorPlace || "" },
    { key: "ret", label: "반납·반입지", align: "left", wrap: true, cell: (j) => dash(j.returnPlace), text: (j) => j.returnPlace || "" },
    { key: "limit", label: "반납기한·반입마감", cell: (j) => md(j.trip === "수출" ? j.cargoClosing : j.freeTimeEnd), text: (j) => (j.trip === "수출" ? j.cargoClosing : j.freeTimeEnd) || "" },
    { key: "car", label: "차량번호", cell: (j) => (j.carNo ? <b>{j.carNo}</b> : isPending(j) ? <span className="text-[#B26A00] font-bold">미배차</span> : "-"), text: (j) => j.carNo || "" },
    { key: "driver", label: "기사명", cell: (j) => dash(j.driver), text: (j) => j.driver || "" },
    { key: "phone", label: "전화번호", cell: (j) => dash(j.driverPhone), text: (j) => j.driverPhone || "" },
    statusCell, dueCell, ...moneyCols, memoCol,
  ],
  sea: [
    { key: "reg", label: "등록일", cell: regDate, text: regDate },
    { key: "dir", label: "구분", cell: (j) => <b>{dash(j.direction)}</b>, text: (j) => j.direction || "" },
    { key: "type", label: "형태", cell: (j) => <b>{dash(j.seaType)}</b>, text: (j) => j.seaType || "" },
    { key: "client", label: "거래처명", align: "left", wrap: true, cell: (j) => <b>{dash(j.client)}</b>, text: (j) => j.client || "" },
    { key: "etd", label: "출항(ETD)", cell: (j) => md(j.etd), text: (j) => j.etd || "" },
    { key: "eta", label: "입항(ETA)", cell: (j) => md(j.eta), text: (j) => j.eta || "" },
    { key: "route", label: "구간(POL → POD)", cell: (j) => (j.pol && j.pod ? <b>{portName(j.pol)} → {portName(j.pod)}</b> : "-"), text: (j) => (j.pol && j.pod ? `${j.pol} → ${j.pod}` : "") },
    { key: "line", label: "선사", cell: (j) => dash(j.line), text: (j) => j.line || "" },
    { key: "vessel", label: "선명·항차", cell: (j) => dash([j.vessel, j.voyage].filter(Boolean).join(" ")), text: (j) => [j.vessel, j.voyage].filter(Boolean).join(" ") },
    { key: "hbl", label: "House B/L", cell: (j) => <span style={mono} className="font-bold">{dash(j.hblNo)}</span>, text: (j) => j.hblNo || "" },
    { key: "mbl", label: "Master B/L", cell: (j) => <span style={mono}>{dash(j.mblNo)}</span>, text: (j) => j.mblNo || "" },
    { key: "qty", label: "물량", cell: (j) => dash(j.seaType === "FCL" ? (j.cntrs || []).map((c) => `${c.size}×${c.qty}`).join(", ") : j.cbm ? `${j.cbm} CBM` : ""), text: (j) => (j.seaType === "FCL" ? (j.cntrs || []).map((c) => `${c.size}×${c.qty}`).join(", ") : j.cbm ? `${j.cbm} CBM` : "") },
    { key: "doc", label: "서류마감", cell: (j) => md(j.docClosing), text: (j) => j.docClosing || "" },
    { key: "cargo", label: "화물마감", cell: (j) => md(j.cargoClosing), text: (j) => j.cargoClosing || "" },
    { key: "shipper", label: "송하인", align: "left", wrap: true, cell: (j) => dash(j.shipper), text: (j) => j.shipper || "" },
    { key: "consignee", label: "수하인", align: "left", wrap: true, cell: (j) => dash(j.consignee), text: (j) => j.consignee || "" },
    statusCell, dueCell, ...moneyCols, memoCol,
  ],
  air: [
    { key: "reg", label: "등록일", cell: regDate, text: regDate },
    { key: "dir", label: "구분", cell: (j) => <b>{dash(j.direction)}</b>, text: (j) => j.direction || "" },
    { key: "client", label: "거래처명", align: "left", wrap: true, cell: (j) => <b>{dash(j.client)}</b>, text: (j) => j.client || "" },
    { key: "etd", label: "출발(ETD)", cell: (j) => md(j.etd), text: (j) => j.etd || "" },
    { key: "eta", label: "도착(ETA)", cell: (j) => md(j.eta), text: (j) => j.eta || "" },
    { key: "route", label: "구간", cell: (j) => (j.dep && j.arr ? <b>{j.dep} → {j.arr}</b> : "-"), text: (j) => (j.dep && j.arr ? `${j.dep} → ${j.arr}` : "") },
    { key: "airline", label: "항공사", cell: (j) => dash(airline(j.airline)?.[1]), text: (j) => airline(j.airline)?.[1] || "" },
    { key: "flight", label: "편명", cell: (j) => <span style={mono} className="font-bold">{dash(j.flightNo)}</span>, text: (j) => j.flightNo || "" },
    { key: "mawb", label: "Master AWB", cell: (j) => <span style={mono} className="font-bold">{dash(fmtAwb(j.mawbNo))}</span>, text: (j) => fmtAwb(j.mawbNo) || "" },
    { key: "hawb", label: "House AWB", cell: (j) => <span style={mono}>{dash(j.hawbNo)}</span>, text: (j) => j.hawbNo || "" },
    { key: "cut", label: "반입마감", cell: (j) => md(j.cargoCutoff), text: (j) => j.cargoCutoff || "" },
    { key: "pcs", label: "개수", cell: (j) => (j.pieces ? `${j.pieces} PCS` : "-"), text: (j) => j.pieces || "" },
    { key: "gw", label: "실중량", align: "right", cell: (j) => (j.grossWeight ? `${Number(j.grossWeight).toLocaleString("ko-KR")} kg` : "-"), text: (j) => j.grossWeight || "" },
    { key: "cw", label: "운임중량", align: "right", cell: (j) => (j.cw ? <b>{Number(j.cw).toLocaleString("ko-KR")} kg</b> : "-"), text: (j) => j.cw || "" },
    { key: "wh", label: "반입창고", align: "left", wrap: true, cell: (j) => dash(j.warehouse), text: (j) => j.warehouse || "" },
    statusCell, dueCell, ...moneyCols, memoCol,
  ],
};
const SEARCH = {
  container: [["all", "통합"], ["client", "거래처"], ["cntr", "컨테이너"], ["line", "선사"], ["place", "픽업·작업지"], ["driver", "기사·차량"]],
  sea: [["all", "통합"], ["client", "거래처"], ["bl", "B/L"], ["line", "선사·선명"], ["port", "항구"]],
  air: [["all", "통합"], ["client", "거래처"], ["awb", "AWB"], ["flight", "항공사·편명"], ["port", "공항"]],
};
function matchSearch(j, type, q) {
  if (!q) return true;
  const has = (...vs) => vs.some((v) => String(v || "").toLowerCase().includes(q));
  if (type === "client") return has(j.client);
  if (type === "cntr") return has(j.cntrNo, fmtCntrNo(j.cntrNo));
  if (type === "line") return has(j.line, j.vessel);
  if (type === "place") return has(j.pickupPlace, j.doorPlace, j.returnPlace);
  if (type === "driver") return has(j.driver, j.carNo, j.driverPhone);
  if (type === "bl") return has(j.hblNo, j.mblNo, j.bookingNo, j.blNo);
  if (type === "port") return has(j.pol, j.pod, portName(j.pol), portName(j.pod), j.dep, j.arr);
  if (type === "awb") return has(j.mawbNo, fmtAwb(j.mawbNo), j.hawbNo);
  if (type === "flight") return has(j.flightNo, j.airline, airline(j.airline)?.[1]);
  return has(j.refNo, j.jobNo, j.client, j.cntrNo, j.blNo, j.hblNo, j.mblNo, j.hawbNo, j.mawbNo, j.bookingNo, j.line, j.vessel, j.flightNo, j.driver, j.carNo, j.pickupPlace, j.doorPlace, j.returnPlace, j.pol, j.pod, j.dep, j.arr, j.memo, j.shipper, j.consignee);
}

// 표 + 알약 + 날짜 · 검색 줄(세 화면이 같이 쓴다)
export function StatusTable({ mode, jobs, variant = "list", tab = "list", canEdit, onOpen, onEdit, onNew, title }) {
  const t = ymdK();
  const [range, setRange] = React.useState(() => (variant === "live" ? [addDays(t, -1), addDays(t, 1)] : variant === "embed" ? [t, t] : [addDays(t, -6), addDays(t, 7)]));
  const [st, setSt] = React.useState("ALL");
  const [stype, setStype] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(() => new Set());
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(100);
  const cols = COLS[mode] || COLS.container;

  const base = React.useMemo(() => jobs.filter((j) => j.mode === mode), [jobs, mode]);
  const inTab = React.useMemo(() => base.filter((j) => (tab === "pending" ? isPending(j) : tab === "handoff" ? j.status === HANDOFF_STATUS : j.status !== HANDOFF_STATUS)), [base, tab]);
  // 인계함 · 미배차는 기간과 상관없이 전부(놓치지 않게) — 내륙 미배차현황과 같다
  const inRange = React.useMemo(() => (tab === "list" ? inTab.filter((j) => { const d = dateOf(j); return !d || (d >= range[0] && d <= range[1]); }) : inTab), [inTab, range, tab]);
  const counts = React.useMemo(() => ({ ALL: inRange.length, RUN: inRange.filter((j) => !isDone(j)).length, DONE: inRange.filter(isDone).length, PEND: inRange.filter(isPending).length }), [inRange]);
  const rows = React.useMemo(() => {
    const k = q.trim().toLowerCase();
    return inRange
      .filter((j) => (st === "RUN" ? !isDone(j) : st === "DONE" ? isDone(j) : st === "PEND" ? isPending(j) : true))
      .filter((j) => matchSearch(j, stype, k))
      .sort((a, b) => (dateOf(a) || "").localeCompare(dateOf(b) || "") || (a.createdAtMs || 0) - (b.createdAtMs || 0));
  }, [inRange, st, stype, q]);
  React.useEffect(() => { setPage(0); }, [range, st, stype, q, tab]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, page * pageSize + pageSize);
  const sum = rows.reduce((a, j) => { const p = legPnl(j); a.sale += p.sale; a.cost += p.cost; return a; }, { sale: 0, cost: 0 });

  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (list) => setSel((s) => (list.every((r) => s.has(r.id)) ? new Set() : new Set(list.map((r) => r.id))));
  const delSel = async () => {
    if (!sel.size) { window.alert("삭제할 항목을 선택하세요."); return; }
    if (!window.confirm(`선택한 ${sel.size}건을 삭제할까요?`)) return;
    for (const j of base.filter((x) => sel.has(x.id))) { try { await removeLeg(j); } catch { /* 계속 */ } }
    setSel(new Set());
  };
  const excel = () => {
    const out = rows.map((j, i) => { const o = { 순번: i + 1, 번호: j.refNo || "", Job: j.jobNo || "" }; cols.forEach((c) => { o[c.label] = c.text ? c.text(j) : ""; }); return o; });
    const ws = XLSX.utils.json_to_sheet(out); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, LIST_LABEL[mode] || "현황");
    XLSX.writeFile(wb, `${LIST_LABEL[mode] || "현황"}_${range[0]}_${range[1]}.xlsx`);
  };
  const tone = (j) => (isPending(j) ? "warn" : "");

  return (
    <div>
      {title && <h2 className="text-lg font-bold mb-2">{title}</h2>}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <KpiPills count={rows.length} sale={sum.sale} cost={sum.cost} profit={sum.sale - sum.cost} pageSize={pageSize} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
        <div className="w-px h-8 bg-gray-300 mx-1 shrink-0" />
        <CustomSelect value={st} onChange={(e) => setSt(e.target.value)} className="h-[34px] px-3 rounded-lg text-[12px] font-semibold border border-gray-300 bg-white text-gray-700 cursor-pointer focus:outline-none focus:border-[#1B2B4B] transition">
          <option value="ALL">전체 {counts.ALL}</option>
          <option value="RUN">진행 중 {counts.RUN}</option>
          <option value="PEND">{mode === "container" ? "미배차" : "부킹대기"} {counts.PEND}</option>
          <option value="DONE">완료 {counts.DONE}</option>
        </CustomSelect>
        <span className="text-[12px] font-bold text-[#7A89A3]">{DATE_LABEL[mode]}</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap mb-2 w-full">
        {variant === "list" && (<>
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${page === 0 ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100 shadow-sm"}`}>◀ 이전</button>
          <span className="text-[11px] font-semibold text-gray-600 px-1 whitespace-nowrap">{page + 1}<span className="text-gray-500"> / {pages}</span></span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${page + 1 >= pages ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100 shadow-sm"}`}>다음 ▶</button>
        </>)}
        {tab === "list"
          ? <DateSearchBar live={variant !== "list"} start={range[0]} end={range[1]} onRange={(a, b) => setRange([a, b])} searchTypes={SEARCH[mode] || SEARCH.container} searchType={stype} onSearchType={setStype} onSearch={setQ} />
          : <DateSearchBar live start="" end="" onRange={() => {}} searchTypes={SEARCH[mode] || SEARCH.container} searchType={stype} onSearchType={setStype} onSearch={setQ} />}
        <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
          {onNew && canEdit && <button type="button" className={smallBtn("dark")} onClick={onNew}>+ 새 오더</button>}
          {canEdit && <button type="button" className={smallBtn("red")} onClick={delSel}>선택삭제</button>}
          <button type="button" className={smallBtn("gray")} onClick={() => setSel(new Set())}>선택초기화</button>
          <button type="button" className={smallBtn()} onClick={excel}>엑셀다운</button>
        </div>
      </div>
      <NavyTable rows={pageRows} cols={cols} selected={sel} onToggle={toggle} onToggleAll={toggleAll} startIndex={page * pageSize}
        onRowClick={(j) => toggle(j.id)} onRowDoubleClick={canEdit ? onEdit : onOpen} onRowContext={onOpen} rowTone={tone}
        empty={tab === "handoff" ? "받은 인계 요청이 없어요. 다른 팀이 인계하면 여기에 보여요." : tab === "pending" ? "모두 처리됐어요." : "조회된 결과가 없습니다."} />
      {variant === "list" && pages > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[13px] font-semibold disabled:opacity-40">◀ 이전</button>
          <span className="px-2 py-1.5 text-[13px] font-bold tabular-nums">{page + 1} / {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[13px] font-semibold disabled:opacity-40">다음 ▶</button>
        </div>
      )}
      <div className="mt-2 text-[12px] font-semibold text-[#7A89A3]">두 번 누르면 수정 · 오른쪽 클릭하면 상세(진행 단계 · 마감 · 인계){tab === "list" ? " · 주황 줄은 아직 " + (mode === "container" ? "기사 · 차량이 없는 건" : "부킹 단계인 건") : ""}</div>
    </div>
  );
}

// 운송현황 — 내륙 배차현황처럼 왼쪽 세부 메뉴
export default function FreightStatus({ mode, jobs, tab: tabProp = "list", canEdit, onOpen, onEdit, onNew }) {
  const [tab, setTab] = React.useState(tabProp);
  React.useEffect(() => { setTab(tabProp); }, [tabProp]);
  const base = jobs.filter((j) => j.mode === mode);
  const pend = base.filter(isPending).length;
  const hand = base.filter((j) => j.status === HANDOFF_STATUS).length;
  const now = Date.now();
  const soon = base.filter((j) => { const d = topDeadline(j, now); return d && (d.level === "over" || d.level === "urgent"); }).length;
  const listLabel = LIST_LABEL[mode] || "운송현황";
  const items = [
    { key: "list", label: listLabel, en: "ALL ORDERS", icon: "list" },
    { key: "pending", label: PENDING_LABEL[mode] || "미배차현황", en: "PENDING", icon: "hourglass", badge: pend, badgeTitle: `${PENDING_LABEL[mode]} ${pend}건` },
    { key: "deadline", label: "마감보드", en: "DEADLINES", icon: "clock", badge: soon, badgeTitle: `급한 마감 ${soon}건` },
    { key: "handoff", label: "인계함", en: "HANDOFF", icon: "link", badge: hand, badgeTitle: `받은 인계 ${hand}건` },
  ];
  const label = items.find((x) => x.key === tab)?.label || listLabel;
  return (
    <KpSubNav code={`${{ container: "CONTAINER", sea: "OCEAN", air: "AIR" }[mode] || "FREIGHT"} STATUS`} title={listLabel} icon="truck" items={items} active={tab} onSelect={setTab}>
      {tab === "deadline"
        ? (<div><h2 className="text-lg font-bold mb-3">마감보드</h2><DeadlineBoard jobs={jobs} mode={mode} onOpen={onOpen} /></div>)
        : <StatusTable key={tab} mode={mode} jobs={jobs} tab={tab} canEdit={canEdit} onOpen={onOpen} onEdit={onEdit} onNew={onNew} title={label} />}
    </KpSubNav>
  );
}

// 실시간현황 — 내륙 실시간배차현황처럼 어제 · 오늘 · 내일
export function FreightLive({ mode, jobs, canEdit, onOpen, onEdit, onNew }) {
  return <StatusTable mode={mode} jobs={jobs} variant="live" canEdit={canEdit} onOpen={onOpen} onEdit={onEdit} onNew={onNew} />;
}
