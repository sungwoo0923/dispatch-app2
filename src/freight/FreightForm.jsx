// ======================= src/freight/FreightForm.jsx =======================
// 🚢 2026-11-12 컨테이너 오더 · 해상 선적 · 항공 등록(수정 · 인계 접수도 같은 화면) — 드롭다운 · 달력 · 시간 고르기 위주
import React from "react";
import {
  CNTR_TYPES, cntrType, CNTR_TRIPS, CNTR_FARE_KINDS, CNTR_CAR_KINDS, CHASSIS, LINES, TERMINALS, checkCntrNo, cleanCntrNo, fmtCntrNo,
  SEA_TYPES, INCOTERMS, SERVICE_TERMS, BL_TYPES, FREIGHT_TERMS, PKG_UNITS, PORTS, portName,
  AIRPORTS, AIRLINES, airline, AIR_WAREHOUSES, checkAwb, cleanAwb, fmtAwb, volumeWeight, chargeableWeight, cbmOf, revenueTon,
  CHARGE_ITEMS, CURRENCIES, lineKrw, sumLines, won, DIRECTIONS, statusList, HANDOFF_STATUS, toMs, handoffTargets, legPnl, legTitle,
} from "./freightCore";
const todayK = () => ymdK(); const plusDays = addDays; const nextMon = nextMonday;
import { createLegs, updateLeg, requestHandoff } from "./freightStore";
import { rateOf, loadRates, ratesInfo } from "./fxRates"; // 💱 오늘 환율(못 받으면 기본값)
import { createPortal } from "react-dom";
import { Card, Field, Grid, Sel, Combo, DateIn, DateTimeIn, TextIn, NumIn, Btn, ModeChip, MODE_NAME, MONO, FieldLook } from "./ui";
import CustomDatePicker from "../CustomDatePicker";
import { TimeSelect, DateTimeSelect } from "../kpTimePick";
import { DM_BTN_PRIMARY, DM_BTN_SECONDARY, dmToggleCls, DmDot, DmIcon, OrderCalendar, NoteCard, ymdK, addDays, nextMonday } from "./inlandLook"; // 🎨 2026-11-18 내륙 오더등록 모양
import { similarJobs, fareStats, routeText } from "./freightFare"; // 💰 같은 구간 지난 운임
import { profitCls } from "../marginPct"; // ⭐ 2026-11-17 이익 색(플러스 빨강 · 마이너스 파랑)
// 🎨 2026-11-18 내륙 오더등록과 같은 모양(버튼 줄 · 날짜 줄 · 남색 ORDER ENTRY 카드 · 밑줄형 칸 · 달력 · 메모 카드)

const QTY = Array.from({ length: 20 }, (_, i) => [String(i + 1), `${i + 1}대`]);
const TEMPS = Array.from({ length: 11 }, (_, i) => { const t = -25 + i * 5; return [String(t), `${t > 0 ? "+" : ""}${t}℃`]; });
const CAR_TYPES = ["윙바디", "카고", "탑차", "냉동탑", "냉장탑", "리프트", "호루", "라보·다마스"];
const CAR_TONS = ["1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "5톤 플러스", "8톤", "11톤", "14톤", "18톤", "25톤"];
const CNTR_OPTIONS = ["일반", "냉동", "특수"].map((k) => ({ group: k, items: CNTR_TYPES.filter((t) => t.kind === k).map((t) => [t.key, t.label]) }));
const AIRLINE_OPTIONS = AIRLINES.map((a) => [a[0], `${a[1]} (${a[0]} · ${a[2]})`]);
const codeOptions = (groups) => groups.map((g) => ({ group: g.group, items: g.items.map((x) => [x[0], `${x[1]} (${x[0]})`]) }));
const PORT_OPTIONS = codeOptions(PORTS);
const AIRPORT_OPTIONS = codeOptions(AIRPORTS);

const blank = (mode) => {
  const base = { mode, direction: "수입", client: "", memo: "", note: "", urgent: false, sales: [], costs: [] };
  if (mode === "container") return { ...base, trip: "수입", size: "40HC", cntrNo: "", sealNo: "", line: "", bookingNo: "", blNo: "", vessel: "", voyage: "", weight: "", dg: "N", temp: "", cargo: "", pickupPlace: "", doorPlace: "", doorDate: "", doorTime: "", returnPlace: "", cargoClosing: "", freeTimeEnd: "", overRate: "", carKind: "", driver: "", carNo: "", driverPhone: "", chassis: "", fareKind: "왕복" };
  if (mode === "sea") return { ...base, seaType: "FCL", incoterms: "", serviceTerm: "", freightTerm: "", blType: "", hblNo: "", mblNo: "", bookingNo: "", line: "", vessel: "", voyage: "", pol: "", pod: "", etd: "", eta: "", docClosing: "", cargoClosing: "", freeTimeEnd: "", overRate: "", cntrs: [{ size: "40HC", qty: "1" }], pkgQty: "", pkgUnit: "", grossWeight: "", cbm: "", commodity: "", shipper: "", consignee: "", partner: "", broker: "" };
  if (mode === "air") return { ...base, incoterms: "", freightTerm: "", airline: "", mawbNo: "", hawbNo: "", flightNo: "", dep: "", arr: "", etd: "", eta: "", warehouse: "", cargoCutoff: "", pieces: "", grossWeight: "", dimL: "", dimW: "", dimH: "", commodity: "", shipper: "", consignee: "", partner: "", broker: "" };
  return { ...base, pickupPlace: "", dropPlace: "", pickupDate: "", pickupTime: "", carType: "", carTon: "", cargo: "", pkgQty: "", weight: "", driver: "", carNo: "", driverPhone: "" };
};

// 운임 줄(청구 · 지급) 편집
function Lines({ title, mode, lines, onChange, vendor = false }) {
  const set = (i, k, v) => onChange(lines.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === "cur" ? { rate: v === "KRW" ? "" : String(rateOf(v) || "") } : {}) } : l)));
  const add = () => onChange([...lines, { item: CHARGE_ITEMS[mode][lines.length ? Math.min(lines.length, CHARGE_ITEMS[mode].length - 1) : 0], cur: "KRW", amount: "", rate: "", vendor: "" }]);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-extrabold text-[#0F1A30]">{title}</span>
        <span className="text-[12.5px] font-black text-[#0F1A30] tabular-nums">{won(sumLines(lines))}원</span>
        <Btn size="sm" kind="soft" onClick={add} className="ml-auto">+ 항목 추가</Btn>
      </div>
      {!lines.length && <div className="h-9 rounded-lg border border-dashed border-[#DCE3EE] grid place-items-center text-[12.5px] text-[#9AA9C3] font-semibold">항목을 추가해 주세요</div>}
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className={`grid gap-1.5 items-center ${vendor ? "grid-cols-[minmax(0,1.3fr)_84px_minmax(0,1fr)_minmax(0,1fr)_32px]" : "grid-cols-[minmax(0,1.4fr)_84px_minmax(0,1fr)_32px]"}`}>
            <Sel value={l.item} onChange={(v) => set(i, "item", v)} options={CHARGE_ITEMS[mode]} placeholder="항목" />
            <Sel value={l.cur} onChange={(v) => set(i, "cur", v || "KRW")} options={CURRENCIES} placeholder="통화" />
            <div className="min-w-0">
              <NumIn value={l.amount} onChange={(v) => set(i, "amount", v)} decimals={l.cur !== "KRW"} unit={l.cur === "KRW" ? "원" : l.cur} />
              {l.cur !== "KRW" && (
                <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-[#7A89A3]">
                  환율 <input value={l.rate || ""} onChange={(e) => set(i, "rate", e.target.value.replace(/[^0-9.]/g, ""))} className="w-16 h-6 px-1.5 rounded-md border border-[#DCE3EE] text-[11.5px] font-bold text-[#0F1A30] tabular-nums focus:outline-none focus:border-[#1B2B4B]" />
                  <span className="tabular-nums">= {won(lineKrw(l))}원</span>
                </div>
              )}
            </div>
            {vendor && <TextIn value={l.vendor} onChange={(v) => set(i, "vendor", v)} placeholder="지급처" />}
            <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="삭제" className="w-8 h-9 rounded-lg text-[#9AA9C3] hover:text-[#C2362B] grid place-items-center text-[13px] font-black">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FreightForm({ mode, initial = null, jobs = [], clients = [], drivers = [], places = [], modules = [], me = "", onDone, onCancel, onGoList }) {
  const editing = !!(initial && initial.id);
  const accepting = editing && initial.status === HANDOFF_STATUS;
  const [f, setF] = React.useState(() => ({ ...blank(mode), ...(initial || {}) }));
  const [qty, setQty] = React.useState("1");
  const [linkJob, setLinkJob] = React.useState(initial?.jobNo || "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [saved, setSaved] = React.useState(null);
  const [fx, setFx] = React.useState(ratesInfo);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [fareOpen, setFareOpen] = React.useState(false);
  React.useEffect(() => { let on = true; loadRates().then(() => { if (on) setFx(ratesInfo()); }); return () => { on = false; }; }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const patch = (o) => setF((p) => ({ ...p, ...o }));

  const jobOptions = React.useMemo(() => {
    const seen = new Map();
    jobs.forEach((j) => { if (j.jobNo && !seen.has(j.jobNo)) seen.set(j.jobNo, j); });
    return [...seen.values()].slice(0, 60).map((j) => [j.jobNo, `${j.jobNo} · ${j.client || "거래처 없음"}`]);
  }, [jobs]);
  const driverOptions = React.useMemo(() => drivers.map((d) => [d.이름, d.차량번호].filter(Boolean).join(" · ")).filter(Boolean), [drivers]);
  const pickDriver = (v) => {
    const d = drivers.find((x) => [x.이름, x.차량번호].filter(Boolean).join(" · ") === v);
    if (d) patch({ driver: d.이름 || "", carNo: d.차량번호 || "", driverPhone: d.전화번호 || "" }); else set("driver", v);
  };

  const cntrChk = mode === "container" ? checkCntrNo(f.cntrNo) : { ok: true, msg: "" };
  const awbChk = mode === "air" ? checkAwb(f.mawbNo) : { ok: true, msg: "" };
  const ct = cntrType(f.size);
  const volW = mode === "air" ? volumeWeight(f.dimL, f.dimW, f.dimH, f.pieces || 1) : 0;
  const cw = mode === "air" ? chargeableWeight(f.grossWeight, volW) : 0;
  const transit = f.etd && f.eta ? Math.round((toMs(String(f.eta).slice(0, 10)) - toMs(String(f.etd).slice(0, 10))) / 86400000) : null;
  const sale = sumLines(f.sales); const cost = sumLines(f.costs); const profit = sale - cost;

  const submit = async () => {
    setErr("");
    if (!String(f.client || "").trim()) { setErr("거래처를 고르세요."); return; }
    if (mode === "sea" && (!f.pol || !f.pod)) { setErr("선적항(POL)과 도착항(POD)을 고르세요."); return; }
    if (mode === "air" && (!f.dep || !f.arr)) { setErr("출발 · 도착 공항을 고르세요."); return; }
    setBusy(true);
    try {
      const data = { ...f, client: String(f.client).trim() };
      if (mode === "container") { data.cntrNo = cleanCntrNo(f.cntrNo); data.direction = f.trip === "수출" ? "수출" : f.trip === "수입" ? "수입" : f.direction; }
      if (mode === "air") { data.mawbNo = cleanAwb(f.mawbNo); data.volWeight = volW; data.cw = cw; data.cbm = cbmOf(f.dimL, f.dimW, f.dimH, f.pieces || 1); }
      if (mode === "sea") data.rt = revenueTon(f.cbm, f.grossWeight);
      if (editing) {
        const next = accepting ? { ...data, status: statusList(mode)[0] } : data;
        await updateLeg(initial, next, accepting ? "인계 접수" : "내용 수정", me);
        setSaved({ legs: [{ ...initial, ...next }], edit: true });
      } else {
        const legs = await createLegs({ ...data, jobNo: linkJob || "", manager: me }, mode === "container" ? qty : 1, me);
        setSaved({ legs });
      }
    } catch (e) { setErr(`저장하지 못했습니다. ${e?.message || ""}`); }
    setBusy(false);
  };
  const reset = () => { setF(blank(mode)); setQty("1"); setLinkJob(""); setSaved(null); setErr(""); };

  // ── 저장 뒤 화면: 번호 안내 + 다음 구간 인계 ──
  if (saved) {
    const first = saved.legs[0];
    const targets = handoffTargets(first, modules);
    return (
      <Card>
        <div className="py-6 flex flex-col items-center text-center">
          <div className="w-11 h-11 rounded-full grid place-items-center border-2 border-[#1E8E3E] text-[#1E8E3E] text-[20px] font-black">✓</div>
          <div className="text-[17px] font-black text-[#0F1A30] mt-3">{saved.edit ? "저장했습니다" : `${saved.legs.length}건 등록했습니다`}</div>
          <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap justify-center">
            <span className="text-[13px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{first.jobNo}</span>
            {saved.legs.slice(0, 6).map((l) => <span key={l.id} className="text-[12.5px] font-bold text-[#2D4C82] tabular-nums">{l.refNo}</span>)}
            {saved.legs.length > 6 && <span className="text-[12.5px] font-bold text-[#7A89A3]">외 {saved.legs.length - 6}건</span>}
          </div>
          {targets.length > 0 && !saved.handed && (
            <div className="mt-5 w-full max-w-[520px] rounded-xl border border-[#E3E8F0] bg-white p-4 text-left">
              <div className="text-[13.5px] font-extrabold text-[#0F1A30]">다음 구간을 바로 인계할까요?</div>
              <div className="text-[12.5px] text-[#5B6B85] mt-0.5">같은 Job 번호로 이어지고, 받는 팀 인계함에 보여요. 거래처 · 번호 · 일정은 그대로 넘어가요.</div>
              <div className="mt-3 flex gap-2 flex-wrap">
                {targets.map((t) => (
                  <Btn key={t} kind="primary" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await requestHandoff(first, t, {}, me); setSaved((s) => ({ ...s, handed: t })); } catch (e) { setErr(e?.message || "인계 실패"); } setBusy(false); }}>
                    {MODE_NAME[t]}팀에 인계 요청
                  </Btn>
                ))}
              </div>
            </div>
          )}
          {saved.handed && <div className="mt-4 text-[13.5px] font-bold text-[#1E8E3E]">{MODE_NAME[saved.handed]}팀 인계함으로 보냈습니다.</div>}
          {err && <div className="mt-3 text-[13px] font-bold text-[#C2362B]">{err}</div>}
          <div className="mt-5 flex gap-2 flex-wrap justify-center">
            {!editing && <Btn onClick={reset}>계속 등록</Btn>}
            <Btn kind="primary" onClick={() => (onDone ? onDone(first) : onGoList?.())}>{editing ? "닫기" : "현황 보기"}</Btn>
          </div>
        </div>
      </Card>
    );
  }

  // ── 화면: 내륙 오더등록과 같은 모양 ──────────────────────────────────
  //  위: 버튼 줄(오더복사 · 초기화 · 운임조회 | 수출입 · 긴급 등 켜고 끄기) + 날짜 줄(작업일 · 출항 · 출발)
  //  가운데: 남색 머리 "ORDER ENTRY" 카드 안에 밑줄형 입력칸(4 → 6 → 8칸)
  //  아래: 메모 카드 2개 + [저장]   오른쪽: 달력(등록할 때만)
  const showCal = !editing;
  const dateA = mode === "container" ? "doorDate" : "etd";
  const dateB = mode === "container" ? (f.trip === "수출" ? "cargoClosing" : "freeTimeEnd") : "eta";
  const ymd = (v) => String(v || "").slice(0, 10);
  const setDateKeepTime = (k, d) => { const cur = String(f[k] || ""); set(k, cur.length > 10 ? `${d}${cur.slice(10)}` : d); };
  const marks = [ymd(f[dateA]), ymd(f[dateB])];
  const calLabels = mode === "container" ? ["작업일", f.trip === "수출" ? "반입마감" : "반납기한"] : mode === "sea" ? ["출항", "입항"] : ["출발", "도착"];
  const t0 = todayK(); const t1 = plusDays(t0, 1);
  const dateBox = "border-2 border-[#1B2B4B] rounded-lg px-2 py-1.5 text-[13px] font-semibold text-[#1B2B4B] outline-none bg-white";
  const quick = "px-2.5 py-1 text-[12px] font-semibold rounded-lg bg-[#1B2B4B] text-white hover:bg-[#243a60] transition";
  const dirOpts = mode === "container" ? CNTR_TRIPS : DIRECTIONS;
  const dirKey = mode === "container" ? "trip" : "direction";
  const sameRoute = similarJobs(f, jobs, { exclude: initial?.id || "" });
  const head = { container: "컨테이너 오더 정보", sea: "선적 정보", air: "항공 화물 정보", inland: "내륙 운송 정보" }[mode];
  const Sec = ({ en, title, right }) => (
    <div className="col-span-full flex items-center gap-2 pt-1">
      <span className="w-1.5 h-1.5 rotate-45 bg-[#2D4C82] shrink-0" />
      <span className="text-[10px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>{en}</span>
      <span className="text-[14px] font-black text-[#0F1A30]">{title}</span>
      <span className="flex-1 h-px bg-[#EEF1F6]" />
      {right}
    </div>
  );

  return (
    <FieldLook.Provider value="line">
    <div className={showCal ? "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-5 items-start" : ""}>
    <div className="min-w-0">
      {accepting && (
        <div className="mb-3 rounded-xl px-4 py-2.5 border border-[#E3E8F0] bg-white text-[13px] font-semibold text-[#3A4A66] flex items-center gap-2 flex-wrap">
          <ModeChip mode={initial.fromMode} /> 팀이 인계한 건이에요({initial.fromRef}). 비어 있는 칸을 채우고 [접수]를 누르면 진행 건으로 바뀌어요.
        </div>
      )}

      {!editing && (
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <h2 className="text-lg font-bold">{{ container: "오더등록", sea: "선적등록", air: "항공등록", inland: "오더등록" }[mode]}</h2>
          {/* 💱 내륙 오더등록의 유가 칸 자리 — 오늘 환율 */}
          {mode !== "inland" && (
            <div className="inline-flex items-center gap-3 h-11 px-4 rounded-xl bg-[#1B2B4B] text-white" title={fx.live ? `${fx.day} 환율(자동)` : "기본 환율: 운임 줄에서 직접 고칠 수 있어요"}>
              <span className="h-7 px-2 rounded-md bg-white text-[#0F1A30] text-[12px] font-black grid place-items-center">{fx.live ? "오늘 환율" : "기본 환율"}</span>
              {["USD", "EUR", "JPY", "CNY"].map((c) => <span key={c} className="text-[13px] font-bold tabular-nums whitespace-nowrap"><span className="text-white/60 mr-1">{c}</span>{rateOf(c).toLocaleString("ko-KR")}</span>)}
            </div>
          )}
        </div>
      )}

      {/* ================== 버튼 줄 + 날짜 줄 ================== */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden mb-4">
        <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#EDF1F7] bg-[linear-gradient(180deg,#FBFCFE,#F5F7FB)]" style={{ minHeight: 56 }}>
          <div className="flex items-center gap-2 flex-wrap">
            {!editing && <button type="button" onClick={() => setCopyOpen(true)} className={DM_BTN_PRIMARY}><DmIcon name="copy" />오더복사</button>}
            {!editing && <button type="button" onClick={reset} className={DM_BTN_SECONDARY}><DmIcon name="reset" />초기화</button>}
            <button type="button" onClick={() => setFareOpen(true)} className={DM_BTN_SECONDARY}><DmIcon name="fare" />운임조회{sameRoute.length ? <span className="ml-0.5 text-[11px] font-black text-[#2D4C82]">{sameRoute.length}</span> : null}</button>
            {onCancel && <button type="button" onClick={onCancel} className={DM_BTN_SECONDARY}>← 목록으로</button>}
          </div>
          <span className="hidden md:block w-px h-6 bg-[#DCE3EE]" />
          <div className="flex items-center gap-2 flex-wrap">
            {dirOpts.map((o) => (
              <button key={o} type="button" aria-pressed={f[dirKey] === o} className={dmToggleCls(f[dirKey] === o)} onClick={() => set(dirKey, o)}><DmDot on={f[dirKey] === o} />{o}</button>
            ))}
            {mode === "sea" && <span className="w-px h-6 bg-[#DCE3EE]" />}
            {mode === "sea" && SEA_TYPES.map((o) => (
              <button key={o} type="button" aria-pressed={f.seaType === o} className={dmToggleCls(f.seaType === o)} onClick={() => set("seaType", o)}><DmDot on={f.seaType === o} />{o}</button>
            ))}
            <span className="w-px h-6 bg-[#DCE3EE]" />
            {mode === "container" && <button type="button" aria-pressed={f.dg === "Y"} className={`${dmToggleCls(f.dg === "Y")} ${f.dg === "Y" ? "!bg-[#0F1A30] !border-[#0F1A30]" : ""}`} onClick={() => set("dg", f.dg === "Y" ? "N" : "Y")}><DmDot on={f.dg === "Y"} alert />위험물</button>}
            <button type="button" aria-pressed={!!f.urgent} className={`${dmToggleCls(!!f.urgent)} ${f.urgent ? "!bg-[#0F1A30] !border-[#0F1A30]" : ""}`} onClick={() => set("urgent", !f.urgent)}><DmDot on={!!f.urgent} alert />긴급</button>
          </div>
        </div>
        {/* 날짜 줄 — 내륙 "상차 · 하차" 자리 */}
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap whitespace-nowrap">
          {mode === "container" && (<>
            <label className="text-[13px] font-bold text-[#1B2B4B]">작업</label>
            <CustomDatePicker value={f.doorDate || ""} showIcon className={dateBox} onChange={(e) => set("doorDate", e.target.value)} />
            <TimeSelect value={f.doorTime || ""} onChange={(e) => set("doorTime", e.target.value)} className={`${dateBox} py-1`} />
            <div className="flex gap-1 ml-1">
              <button type="button" className={quick} onClick={() => set("doorDate", t0)}>당일</button>
              <button type="button" className={quick} onClick={() => set("doorDate", t1)}>내일</button>
              <button type="button" className={quick} onClick={() => set("doorDate", nextMon(t0))}>월요일</button>
            </div>
            <label className="text-[13px] font-bold text-[#1B2B4B] ml-4">{f.trip === "수출" ? "반입마감" : "반납기한"}</label>
            {f.trip === "수출"
              ? <DateTimeSelect value={f.cargoClosing || ""} onChange={(e) => set("cargoClosing", e.target.value)} dateClassName={dateBox} timeClassName={`${dateBox} py-1`} />
              : <CustomDatePicker value={f.freeTimeEnd || ""} showIcon className={dateBox} onChange={(e) => set("freeTimeEnd", e.target.value)} />}
            {f.trip !== "수출" && (
              <div className="flex gap-1 ml-1">
                {[3, 5, 7].map((n) => <button key={n} type="button" className={quick} onClick={() => set("freeTimeEnd", plusDays(ymd(f.doorDate) || t0, n))}>+{n}일</button>)}
              </div>
            )}
          </>)}
          {mode === "sea" && (<>
            <label className="text-[13px] font-bold text-[#1B2B4B]">출항(ETD)</label>
            <CustomDatePicker value={ymd(f.etd)} showIcon className={dateBox} onChange={(e) => set("etd", e.target.value)} />
            <div className="flex gap-1 ml-1">
              <button type="button" className={quick} onClick={() => set("etd", t0)}>당일</button>
              <button type="button" className={quick} onClick={() => set("etd", t1)}>내일</button>
            </div>
            <label className="text-[13px] font-bold text-[#1B2B4B] ml-4">입항(ETA)</label>
            <CustomDatePicker value={ymd(f.eta)} showIcon min={ymd(f.etd)} className={dateBox} onChange={(e) => set("eta", e.target.value)} />
            <div className="flex gap-1 ml-1" title="출항일에서 며칠 뒤 도착하는지(항로별 운항일수)">
              {[3, 7, 14, 30].map((n) => <button key={n} type="button" className={quick} onClick={() => set("eta", plusDays(ymd(f.etd) || t0, n))}>+{n}일</button>)}
            </div>
            {transit != null && transit >= 0 && <span className="ml-2 text-[12.5px] font-black text-[#2D4C82]">운항 {transit}일</span>}
          </>)}
          {mode === "air" && (<>
            <label className="text-[13px] font-bold text-[#1B2B4B]">출발(ETD)</label>
            <DateTimeSelect value={f.etd || ""} onChange={(e) => set("etd", e.target.value)} dateClassName={dateBox} timeClassName={`${dateBox} py-1`} />
            <div className="flex gap-1 ml-1">
              <button type="button" className={quick} onClick={() => setDateKeepTime("etd", t0)}>당일</button>
              <button type="button" className={quick} onClick={() => setDateKeepTime("etd", t1)}>내일</button>
            </div>
            <label className="text-[13px] font-bold text-[#1B2B4B] ml-4">도착(ETA)</label>
            <DateTimeSelect value={f.eta || ""} onChange={(e) => set("eta", e.target.value)} dateClassName={dateBox} timeClassName={`${dateBox} py-1`} />
            <div className="flex gap-1 ml-1">
              <button type="button" className={quick} onClick={() => setDateKeepTime("eta", ymd(f.etd) || t0)}>당일 도착</button>
              <button type="button" className={quick} onClick={() => setDateKeepTime("eta", plusDays(ymd(f.etd) || t0, 1))}>+1일</button>
            </div>
          </>)}
          {mode === "inland" && (<>
            <label className="text-[13px] font-bold text-[#1B2B4B]">상차</label>
            <CustomDatePicker value={f.pickupDate || ""} showIcon className={dateBox} onChange={(e) => set("pickupDate", e.target.value)} />
            <TimeSelect value={f.pickupTime || ""} onChange={(e) => set("pickupTime", e.target.value)} className={`${dateBox} py-1`} />
            <div className="flex gap-1 ml-1"><button type="button" className={quick} onClick={() => set("pickupDate", t0)}>당일</button><button type="button" className={quick} onClick={() => set("pickupDate", t1)}>내일</button></div>
          </>)}
        </div>
      </div>

      {/* ================== 오더 정보(남색 머리) ================== */}
      <div className="kp-order-form bg-white border border-[#E3E8F0] rounded-[24px] pb-6 px-6 overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_30px_rgba(16,24,40,0.07)] space-y-5">
        <div className="-mx-6">
          <div className="relative px-6 py-3.5 flex items-center justify-between overflow-hidden" style={{ background: "linear-gradient(120deg,#0B1428 0%,#0F1A30 40%,#1B2B4B 75%,#2D4C82 100%)" }}>
            <span className="absolute inset-0 opacity-[0.08] pointer-events-none" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
            <span className="relative flex items-baseline gap-2.5">
              <span className="text-[10px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ORDER ENTRY</span>
              <span className="text-[15px] font-black text-white">{head}</span>
            </span>
            <span className="relative text-[12.5px] font-bold text-white/70 truncate max-w-[55%]">
              {mode === "container" && ct ? [ct.iso, ct.cbm ? `${ct.cbm} CBM` : "", `최대 ${ct.payload}톤`].filter(Boolean).join(" · ") : null}
              {mode === "sea" ? [f.pol && f.pod ? `${portName(f.pol)} → ${portName(f.pod)}` : "", f.line, f.vessel && `${f.vessel}${f.voyage ? ` ${f.voyage}` : ""}`].filter(Boolean).join(" · ") : null}
              {mode === "air" ? (cw ? `운임중량 ${cw.toLocaleString("ko-KR")} kg (${volW > Number(f.grossWeight || 0) ? "부피중량" : "실중량"} 적용)` : [f.dep && f.arr ? `${f.dep} → ${f.arr}` : "", f.flightNo].filter(Boolean).join(" · ")) : null}
            </span>
          </div>
        </div>

        {/* 기본 */}
        <Grid>
          <Sec en="BASIC" title="기본 정보" />
          <Field label="거래처" required span={2}><Combo value={f.client} onChange={(v) => set("client", v)} options={clients} placeholder="거래처 검색/입력" /></Field>
          {!editing && <Field label="Job 연결" hint="이어지는 건"><Sel value={linkJob} onChange={setLinkJob} options={jobOptions} placeholder="새 Job 으로 등록" /></Field>}
          {(mode === "sea" || mode === "air") && <Field label="인코텀즈"><Sel value={f.incoterms} onChange={(v) => set("incoterms", v)} options={INCOTERMS} /></Field>}
          {(mode === "sea" || mode === "air") && <Field label="운임 조건"><Sel value={f.freightTerm} onChange={(v) => set("freightTerm", v)} options={FREIGHT_TERMS} /></Field>}
          {mode === "sea" && <Field label="운송 조건"><Sel value={f.serviceTerm} onChange={(v) => set("serviceTerm", v)} options={SERVICE_TERMS} /></Field>}
          {mode === "sea" && <Field label="B/L 종류"><Sel value={f.blType} onChange={(v) => set("blType", v)} options={BL_TYPES} /></Field>}
          {mode === "container" && <Field label="운임 구분"><Sel value={f.fareKind} onChange={(v) => set("fareKind", v)} options={CNTR_FARE_KINDS} /></Field>}
        </Grid>

        {/* ── 컨테이너 ── */}
        {mode === "container" && (<>
          <Grid>
            <Sec en="CONTAINER" title="컨테이너" />
            <Field label="규격" required><Sel value={f.size} onChange={(v) => set("size", v || "40HC")} options={CNTR_OPTIONS} /></Field>
            {!editing && <Field label="수량" hint="같은 내용 여러 대"><Sel value={qty} onChange={(v) => setQty(v || "1")} options={QTY} /></Field>}
            <Field label="선사"><Combo value={f.line} onChange={(v) => set("line", v)} options={LINES} placeholder="선사 선택" /></Field>
            <Field label="컨테이너 번호" ok={f.cntrNo && cntrChk.ok ? cntrChk.msg : ""} err={!cntrChk.ok ? cntrChk.msg : ""}>
              <TextIn value={fmtCntrNo(f.cntrNo)} onChange={(v) => set("cntrNo", cleanCntrNo(v))} upper placeholder="HMMU 123456 7" maxLength={13} />
            </Field>
            <Field label="씰 번호"><TextIn value={f.sealNo} onChange={(v) => set("sealNo", v)} upper placeholder="SEAL NO." /></Field>
            <Field label="부킹 번호"><TextIn value={f.bookingNo} onChange={(v) => set("bookingNo", v)} upper placeholder="BOOKING NO." /></Field>
            <Field label="B/L 번호"><TextIn value={f.blNo} onChange={(v) => set("blNo", v)} upper placeholder="B/L NO." /></Field>
            <Field label="선명 · 항차"><div className="grid grid-cols-[minmax(0,1fr)_70px] gap-1.5"><TextIn value={f.vessel} onChange={(v) => set("vessel", v)} upper placeholder="VESSEL" /><TextIn value={f.voyage} onChange={(v) => set("voyage", v)} upper placeholder="VOY." /></div></Field>
            <Field label="화물 중량" err={ct && Number(f.weight) > ct.payload ? `최대 ${ct.payload}톤 초과` : ""}><NumIn value={f.weight} onChange={(v) => set("weight", v)} decimals unit="톤" /></Field>
            {ct?.kind === "냉동" && <Field label="설정 온도"><Sel value={f.temp} onChange={(v) => set("temp", v)} options={TEMPS} /></Field>}
            <Field label="품명" span={2}><TextIn value={f.cargo} onChange={(v) => set("cargo", v)} placeholder="품명" /></Field>
          </Grid>
          <Grid>
            <Sec en="ROUTE" title="픽업 → 작업지 → 반납" />
            <Field label={f.trip === "수출" ? "공컨테이너 픽업지" : "픽업지 (반출 터미널)"} span={2}><Combo value={f.pickupPlace} onChange={(v) => set("pickupPlace", v)} options={TERMINALS} placeholder="터미널 · CY 선택" /></Field>
            <Field label="작업지 (도어)" span={2}><Combo value={f.doorPlace} onChange={(v) => set("doorPlace", v)} options={places} placeholder="상하차지 검색/입력" /></Field>
            <Field label={f.trip === "수출" ? "반입 터미널" : "공컨테이너 반납지"} span={2}><Combo value={f.returnPlace} onChange={(v) => set("returnPlace", v)} options={TERMINALS} placeholder="터미널 · CY 선택" /></Field>
            {f.trip !== "수출" && <Field label="초과 시 하루 비용" hint="DEM · DET"><NumIn value={f.overRate} onChange={(v) => set("overRate", v)} unit="원" /></Field>}
          </Grid>
          <Grid>
            <Sec en="DISPATCH" title="배차" />
            <Field label="기사" span={2}><Combo value={f.driver} onChange={pickDriver} options={driverOptions} placeholder="기사 검색/입력" /></Field>
            <Field label="차량번호"><TextIn value={f.carNo} onChange={(v) => set("carNo", v)} placeholder="차량번호" /></Field>
            <Field label="전화번호"><TextIn value={f.driverPhone} onChange={(v) => set("driverPhone", v)} placeholder="010-0000-0000" inputMode="tel" /></Field>
            <Field label="차량 구분"><Sel value={f.carKind} onChange={(v) => set("carKind", v)} options={CNTR_CAR_KINDS} /></Field>
            <Field label="샤시"><Sel value={f.chassis} onChange={(v) => set("chassis", v)} options={CHASSIS} /></Field>
          </Grid>
        </>)}

        {/* ── 해상 ── */}
        {mode === "sea" && (<>
          <Grid>
            <Sec en="VOYAGE" title="선적 일정" />
            <Field label="선적항 (POL)" required span={2}><Sel value={f.pol} onChange={(v) => set("pol", v)} options={PORT_OPTIONS} placeholder="항구 선택" /></Field>
            <Field label="도착항 (POD)" required span={2}><Sel value={f.pod} onChange={(v) => set("pod", v)} options={PORT_OPTIONS} placeholder="항구 선택" /></Field>
            <Field label="선사"><Combo value={f.line} onChange={(v) => set("line", v)} options={LINES} placeholder="선사 선택" /></Field>
            <Field label="선명 · 항차" span={2}><div className="grid grid-cols-[minmax(0,1fr)_80px] gap-1.5"><TextIn value={f.vessel} onChange={(v) => set("vessel", v)} upper placeholder="VESSEL" /><TextIn value={f.voyage} onChange={(v) => set("voyage", v)} upper placeholder="VOY." /></div></Field>
            <Field label="서류 마감" span={2}><DateTimeIn value={f.docClosing} onChange={(v) => set("docClosing", v)} /></Field>
            <Field label="화물 마감 (Cargo Closing)" span={2}><DateTimeIn value={f.cargoClosing} onChange={(v) => set("cargoClosing", v)} /></Field>
            {f.direction === "수입" && <Field label="프리타임 종료일"><DateIn value={f.freeTimeEnd} onChange={(v) => set("freeTimeEnd", v)} min={f.eta || ""} /></Field>}
            {f.direction === "수입" && <Field label="초과 시 하루 비용" hint="1대"><NumIn value={f.overRate} onChange={(v) => set("overRate", v)} unit="원" /></Field>}
          </Grid>
          <Grid>
            <Sec en="B/L & CARGO" title="B/L · 화물" right={f.seaType === "LCL" && (f.cbm || f.grossWeight) ? <span className="text-[12px] font-black text-[#2D4C82]">운임톤(R/T) {revenueTon(f.cbm, f.grossWeight)}</span> : null} />
            <Field label="House B/L"><TextIn value={f.hblNo} onChange={(v) => set("hblNo", v)} upper placeholder="HBL NO." /></Field>
            <Field label="Master B/L"><TextIn value={f.mblNo} onChange={(v) => set("mblNo", v)} upper placeholder="MBL NO." /></Field>
            <Field label="부킹 번호"><TextIn value={f.bookingNo} onChange={(v) => set("bookingNo", v)} upper placeholder="BOOKING NO." /></Field>
            <Field label="품명"><TextIn value={f.commodity} onChange={(v) => set("commodity", v)} placeholder="품명" /></Field>
            {f.seaType === "FCL" && (
              <Field label="컨테이너" span={2}>
                <div className="space-y-1.5">
                  {(f.cntrs || []).map((c, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_80px_28px] gap-1.5 items-center">
                      <Sel value={c.size} onChange={(v) => set("cntrs", f.cntrs.map((x, j) => (j === i ? { ...x, size: v } : x)))} options={CNTR_OPTIONS} />
                      <Sel value={c.qty} onChange={(v) => set("cntrs", f.cntrs.map((x, j) => (j === i ? { ...x, qty: v || "1" } : x)))} options={QTY} />
                      <button type="button" onClick={() => set("cntrs", f.cntrs.filter((_, j) => j !== i))} className="w-7 h-8 rounded-lg text-[#9AA9C3] hover:text-[#C2362B] grid place-items-center font-black" aria-label="삭제">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => set("cntrs", [...(f.cntrs || []), { size: "20GP", qty: "1" }])} className="h-7 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[11.5px] font-black">+ 규격 추가</button>
                </div>
              </Field>
            )}
            <Field label="포장 수량"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-1.5"><NumIn value={f.pkgQty} onChange={(v) => set("pkgQty", v)} /><Sel value={f.pkgUnit} onChange={(v) => set("pkgUnit", v)} options={PKG_UNITS} placeholder="단위" /></div></Field>
            <Field label="총중량"><NumIn value={f.grossWeight} onChange={(v) => set("grossWeight", v)} decimals unit="kg" /></Field>
            <Field label="용적"><NumIn value={f.cbm} onChange={(v) => set("cbm", v)} decimals unit="CBM" /></Field>
            <Field label="송하인 (Shipper)" span={2}><TextIn value={f.shipper} onChange={(v) => set("shipper", v)} placeholder="Shipper" /></Field>
            <Field label="수하인 (Consignee)" span={2}><TextIn value={f.consignee} onChange={(v) => set("consignee", v)} placeholder="Consignee" /></Field>
            <Field label="해외 파트너"><TextIn value={f.partner} onChange={(v) => set("partner", v)} placeholder="현지 대리점" /></Field>
            <Field label="관세사"><TextIn value={f.broker} onChange={(v) => set("broker", v)} placeholder="관세사" /></Field>
          </Grid>
        </>)}

        {/* ── 항공 ── */}
        {mode === "air" && (<>
          <Grid>
            <Sec en="FLIGHT" title="항공편" />
            <Field label="항공사" span={2}><Sel value={f.airline} onChange={(v) => { const a = airline(v); patch({ airline: v, mawbNo: a && cleanAwb(f.mawbNo).length <= 3 ? a[2] : f.mawbNo, flightNo: a && !f.flightNo ? a[0] : f.flightNo }); }} options={AIRLINE_OPTIONS} placeholder="항공사 선택" /></Field>
            <Field label="편명"><TextIn value={f.flightNo} onChange={(v) => set("flightNo", v)} upper placeholder="KE001" maxLength={8} /></Field>
            <Field label="Master AWB" ok={f.mawbNo && cleanAwb(f.mawbNo).length === 11 && awbChk.ok ? awbChk.msg : ""} err={cleanAwb(f.mawbNo).length === 11 && !awbChk.ok ? awbChk.msg : ""}>
              <TextIn value={fmtAwb(f.mawbNo)} onChange={(v) => set("mawbNo", cleanAwb(v))} placeholder="180-1234 5675" inputMode="numeric" maxLength={13} />
            </Field>
            <Field label="House AWB"><TextIn value={f.hawbNo} onChange={(v) => set("hawbNo", v)} upper placeholder="HAWB NO." /></Field>
            <Field label="출발 공항" required><Sel value={f.dep} onChange={(v) => set("dep", v)} options={AIRPORT_OPTIONS} placeholder="공항 선택" /></Field>
            <Field label="도착 공항" required><Sel value={f.arr} onChange={(v) => set("arr", v)} options={AIRPORT_OPTIONS} placeholder="공항 선택" /></Field>
            <Field label="반입 마감" span={2}><DateTimeIn value={f.cargoCutoff} onChange={(v) => set("cargoCutoff", v)} /></Field>
            <Field label="반입 창고" span={2}><Combo value={f.warehouse} onChange={(v) => set("warehouse", v)} options={AIR_WAREHOUSES} placeholder="창고 검색/입력" /></Field>
          </Grid>
          <Grid>
            <Sec en="CHARGEABLE WEIGHT" title="화물 · 운임중량" right={<span className="text-[12px] font-bold text-[#5B6B85] whitespace-nowrap">실중량 {Number(f.grossWeight || 0).toLocaleString("ko-KR")} · 부피중량(÷6000) {volW.toLocaleString("ko-KR")} → <b className="text-[#0F1A30]">{cw ? cw.toLocaleString("ko-KR") : 0} kg</b></span>} />
            <Field label="개수"><NumIn value={f.pieces} onChange={(v) => set("pieces", v)} unit="PCS" /></Field>
            <Field label="실중량"><NumIn value={f.grossWeight} onChange={(v) => set("grossWeight", v)} decimals unit="kg" /></Field>
            <Field label="가로"><NumIn value={f.dimL} onChange={(v) => set("dimL", v)} decimals unit="cm" /></Field>
            <Field label="세로"><NumIn value={f.dimW} onChange={(v) => set("dimW", v)} decimals unit="cm" /></Field>
            <Field label="높이"><NumIn value={f.dimH} onChange={(v) => set("dimH", v)} decimals unit="cm" /></Field>
            <Field label="품명" span={3}><TextIn value={f.commodity} onChange={(v) => set("commodity", v)} placeholder="품명" /></Field>
            <Field label="송하인 (Shipper)" span={2}><TextIn value={f.shipper} onChange={(v) => set("shipper", v)} placeholder="Shipper" /></Field>
            <Field label="수하인 (Consignee)" span={2}><TextIn value={f.consignee} onChange={(v) => set("consignee", v)} placeholder="Consignee" /></Field>
            <Field label="해외 파트너" span={2}><TextIn value={f.partner} onChange={(v) => set("partner", v)} placeholder="현지 대리점" /></Field>
            <Field label="관세사" span={2}><TextIn value={f.broker} onChange={(v) => set("broker", v)} placeholder="관세사" /></Field>
          </Grid>
        </>)}

        {/* ── 내륙 구간(인계받은 건) ── */}
        {mode === "inland" && (
          <Grid>
            <Sec en="INLAND LEG" title="내륙 운송" />
            <Field label="상차지" span={2}><Combo value={f.pickupPlace} onChange={(v) => set("pickupPlace", v)} options={places} placeholder="상차지 검색" /></Field>
            <Field label="하차지" span={2}><Combo value={f.dropPlace} onChange={(v) => set("dropPlace", v)} options={places} placeholder="하차지 검색" /></Field>
            <Field label="차량종류"><Sel value={f.carType} onChange={(v) => set("carType", v)} options={CAR_TYPES} /></Field>
            <Field label="차량톤수"><Sel value={f.carTon} onChange={(v) => set("carTon", v)} options={CAR_TONS} /></Field>
            <Field label="기사명"><Combo value={f.driver} onChange={pickDriver} options={driverOptions} placeholder="기사 검색" /></Field>
            <Field label="차량번호"><TextIn value={f.carNo} onChange={(v) => set("carNo", v)} placeholder="차량번호" /></Field>
            <Field label="화물내용" span={2}><TextIn value={f.cargo} onChange={(v) => set("cargo", v)} placeholder="화물 내용" /></Field>
          </Grid>
        )}

        {/* ── 운임 ── */}
        <div>
          <Sec en={fx.live ? `CHARGES · ${fx.day} 환율 자동` : "CHARGES · 기본 환율"} title="운임" right={<span className={`text-[13px] font-black tabular-nums ${profitCls(profit, "text-[#0F1A30]")}`}>수익 {won(profit)}원{sale > 0 ? ` · ${Math.round((profit / sale) * 1000) / 10}%` : ""}</span>} />
          <FieldLook.Provider value="box">
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Lines title="청구운임 (매출)" mode={mode} lines={f.sales || []} onChange={(v) => set("sales", v)} />
              <Lines title="지급운임 (매입)" mode={mode} lines={f.costs || []} onChange={(v) => set("costs", v)} vendor />
            </div>
          </FieldLook.Provider>
        </div>

        {/* 메모 카드 — 내륙 MEMO · DRIVER NOTE 자리 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <NoteCard en="MEMO" title="메모" sub="내부용" value={f.memo} onChange={(v) => set("memo", v)} placeholder="내부 메모 입력" />
          <NoteCard en={mode === "container" ? "DRIVER NOTE" : "PARTNER NOTE"} title="전달사항" sub={mode === "container" ? "기사님께" : "파트너 · 관세사께"} value={f.note} onChange={(v) => set("note", v)}
            placeholder={mode === "container" ? "운송 기사님께 전달할 내용을 입력하세요" : "해외 파트너 · 관세사에게 전달할 내용을 입력하세요"} />
        </div>

        <div className="pt-4 border-t border-[#EEF1F6] flex items-center gap-3 flex-wrap">
          {err ? <span className="text-[13px] font-bold text-[#C2362B]">{err}</span> : <span className="text-[12.5px] font-semibold text-[#7A89A3]">청구 {won(sale)}원 · 지급 {won(cost)}원</span>}
          <div className="ml-auto flex gap-2">
            {onCancel && <button type="button" onClick={onCancel} className={`${DM_BTN_SECONDARY} !h-12 !px-6 !text-[14px]`}>취소</button>}
            <button type="button" disabled={busy} onClick={submit} className={`${DM_BTN_PRIMARY} !h-12 !px-7 !text-[14px]`}><DmIcon name="check" />{busy ? "저장 중…" : accepting ? "접수" : editing ? "저장" : mode === "container" && Number(qty) > 1 ? `${qty}대 저장` : "저장"}</button>
          </div>
        </div>
      </div>
    </div>
    {showCal && (
      <div className="hidden xl:block sticky top-3">
        <OrderCalendar marks={marks} labels={calLabels} value={marks[0]} onPick={(d) => (mode === "air" ? setDateKeepTime("etd", d) : set(dateA, d))} />
        {sameRoute.length > 0 && (
          <button type="button" onClick={() => setFareOpen(true)} className="mt-3 w-full text-left rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3 hover:border-[#1B2B4B]">
            <div className="text-[10px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>SAME ROUTE</div>
            <div className="text-[13.5px] font-black text-[#0F1A30] mt-0.5">같은 구간 지난 운임 {sameRoute.length}건</div>
            {(() => { const s2 = fareStats(sameRoute); return s2.sale ? <div className="text-[12.5px] font-bold text-[#5B6B85] mt-0.5 tabular-nums">청구 {won(s2.sale.min)} ~ {won(s2.sale.max)}원 · 평균 {won(s2.sale.avg)}원</div> : null; })()}
          </button>
        )}
      </div>
    )}
    </div>
    {copyOpen && <CopyPicker mode={mode} jobs={jobs} onClose={() => setCopyOpen(false)} onPick={(j) => { setF({ ...blank(mode), ...copyable(j) }); setCopyOpen(false); }} />}
    {fareOpen && <FarePeek cond={f} list={sameRoute} onClose={() => setFareOpen(false)} onApply={(p) => { setF((x) => ({ ...x, sales: p.sales, costs: p.costs })); setFareOpen(false); }} />}
    </FieldLook.Provider>
  );
}

// 오더복사 — 지난 건을 골라 내용을 그대로 채운다(번호 · 진행 상태 · 기록 · 날짜는 빼고)
const NO_COPY = ["id", "refNo", "jobNo", "status", "history", "createdAt", "createdAtMs", "updatedAt", "fromLeg", "fromMode", "fromRef", "dispatchId", "settle", "doorDate", "doorTime", "etd", "eta", "cargoClosing", "docClosing", "freeTimeEnd", "cargoCutoff", "cntrNo", "sealNo", "companyName", "_linked", "_orderMissing"];
const copyable = (j) => { const o = {}; Object.keys(j || {}).forEach((k) => { if (!NO_COPY.includes(k)) o[k] = j[k]; }); return o; };
function CopyPicker({ mode, jobs, onClose, onPick }) {
  const [q, setQ] = React.useState("");
  const list = jobs.filter((j) => j.mode === mode).filter((j) => { const k = q.trim().toLowerCase(); return !k || [j.client, legTitle(j), j.refNo, routeText(j)].some((v) => String(v || "").toLowerCase().includes(k)); }).slice(0, 80);
  return createPortal(
    <div className="kp-pc-pop fixed inset-0 z-[2147481500] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[760px] max-w-full max-h-[86vh] flex flex-col overflow-hidden">
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div><h3 className="text-white font-bold text-[16px]">오더복사</h3><p className="text-white/60 text-[12px] mt-0.5">지난 건을 누르면 내용이 채워져요(번호 · 날짜 · 진행 상태는 새로)</p></div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg">×</button>
        </div>
        <div className="p-4 border-b border-[#EEF1F6]"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 구간 · 번호 검색" className="w-full h-10 px-3 rounded-xl border border-[#DCE3EE] text-[13.5px] font-semibold focus:outline-none focus:border-[#1B2B4B]" /></div>
        <div className="flex-1 overflow-y-auto">
          {!list.length && <div className="py-14 text-center text-[13px] text-gray-500">복사할 지난 건이 없어요.</div>}
          {list.map((j) => { const p = legPnl(j); return (
            <button key={j.id} type="button" onClick={() => onPick(j)} className="w-full text-left px-5 py-3 border-b border-[#F1F4F9] hover:bg-[#F5F8FD] flex items-center gap-3">
              <span className="text-[12px] font-black text-[#5B6B85] tabular-nums w-[92px] shrink-0" style={{ fontFamily: MONO }}>{j.refNo}</span>
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black text-[#0F1A30] truncate">{j.client || "-"}</span><span className="block text-[12.5px] font-semibold text-[#5B6B85] truncate">{routeText(j) || legTitle(j)}</span></span>
              {p.sale > 0 && <span className="text-[12.5px] font-black text-[#0F1A30] tabular-nums">{won(p.sale)}원</span>}
            </button>
          ); })}
        </div>
      </div>
    </div>, document.body);
}
// 운임조회(입력 중) — 같은 구간 지난 건의 청구 · 지급 · 수익. [이 운임 쓰기]로 운임 줄을 그대로 가져온다
function FarePeek({ cond, list, onClose, onApply }) {
  const st = fareStats(list);
  return createPortal(
    <div className="kp-pc-pop fixed inset-0 z-[2147481500] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-[820px] max-w-full max-h-[86vh] flex flex-col overflow-hidden">
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <div><h3 className="text-white font-bold text-[16px]">운임조회 · {routeText(cond) || "구간을 먼저 넣어 주세요"}</h3><p className="text-white/60 text-[12px] mt-0.5">같은 구간 먼저, 최근 건 먼저 보여요</p></div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg">×</button>
        </div>
        {st.sale && (
          <div className="px-6 py-3 flex items-center gap-2 flex-wrap border-b border-[#EEF1F6]">
            <span className="px-3 py-1.5 rounded-xl bg-[#1B2B4B] text-white text-[12.5px] font-black">{list.length}건</span>
            <span className="px-3 py-1.5 rounded-xl border border-[#1B2B4B]/20 text-[12.5px] font-bold">청구 최저 <b>{won(st.sale.min)}</b> · 평균 <b>{won(st.sale.avg)}</b> · 최고 <b>{won(st.sale.max)}</b></span>
            {st.cost && <span className="px-3 py-1.5 rounded-xl border border-[#1B2B4B]/20 text-[12.5px] font-bold">지급 평균 <b>{won(st.cost.avg)}</b></span>}
            {st.perKg && <span className="px-3 py-1.5 rounded-xl border border-[#1B2B4B]/20 text-[12.5px] font-bold">kg당 평균 <b>{won(st.perKg.avg)}</b>원</span>}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {!list.length && <div className="py-14 text-center text-[13px] text-gray-500">{routeText(cond) ? "같은 구간의 지난 운임이 없어요." : "픽업지 · 작업지(컨테이너), 선적항 · 도착항(해상), 출발 · 도착 공항(항공)을 먼저 넣으면 찾아 드려요."}</div>}
          {list.length > 0 && (
            <table className="w-full">
              <thead className="bg-[#1B2B4B] sticky top-0"><tr>{["구분", "번호", "거래처", "구간", "청구", "지급", "수익", ""].map((h) => <th key={h} className="px-3 py-2.5 text-[13px] font-bold text-white text-center whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {list.map(({ j, p, score }, i) => (
                  <tr key={j.id} className={i % 2 ? "bg-[#F9FBFD]" : "bg-white"}>
                    <td className="px-3 py-2 text-center text-[12px] font-black whitespace-nowrap" style={{ color: score === 2 ? "#1B2B4B" : "#9AA9C3" }}>{score === 2 ? "같은 구간" : "비슷"}</td>
                    <td className="px-3 py-2 text-center text-[12.5px] font-bold tabular-nums whitespace-nowrap">{j.refNo}</td>
                    <td className="px-3 py-2 text-[13px] font-bold truncate max-w-[160px]">{j.client}</td>
                    <td className="px-3 py-2 text-[12.5px] truncate max-w-[220px]">{routeText(j)}</td>
                    <td className="px-3 py-2 text-right text-[13px] font-black tabular-nums">{won(p.sale)}</td>
                    <td className="px-3 py-2 text-right text-[13px] tabular-nums">{won(p.cost)}</td>
                    <td className={`px-3 py-2 text-right text-[13px] font-black tabular-nums ${profitCls(p.profit, "")}`}>{won(p.profit)}</td>
                    <td className="px-3 py-2 text-center"><button type="button" onClick={() => onApply({ sales: (j.sales || []).map((l) => ({ ...l })), costs: (j.costs || []).map((l) => ({ ...l })) })} className="h-7 px-2.5 rounded-lg bg-[#1B2B4B] text-white text-[11.5px] font-black whitespace-nowrap">이 운임 쓰기</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>, document.body);
}
