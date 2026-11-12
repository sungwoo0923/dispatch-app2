// ======================= src/freight/FreightForm.jsx =======================
// 🚢 2026-11-12 컨테이너 오더 · 해상 선적 · 항공 등록(수정 · 인계 접수도 같은 화면) — 드롭다운 · 달력 · 시간 고르기 위주
import React from "react";
import {
  CNTR_TYPES, cntrType, CNTR_TRIPS, CNTR_FARE_KINDS, CNTR_CAR_KINDS, CHASSIS, LINES, TERMINALS, checkCntrNo, cleanCntrNo, fmtCntrNo,
  SEA_TYPES, INCOTERMS, SERVICE_TERMS, BL_TYPES, FREIGHT_TERMS, PKG_UNITS, PORTS, portName,
  AIRPORTS, AIRLINES, airline, AIR_WAREHOUSES, checkAwb, cleanAwb, fmtAwb, volumeWeight, chargeableWeight, cbmOf, revenueTon,
  CHARGE_ITEMS, CURRENCIES, lineKrw, sumLines, won, DIRECTIONS, statusList, HANDOFF_STATUS, toMs, handoffTargets,
} from "./freightCore";
import { createLegs, updateLeg, requestHandoff } from "./freightStore";
import { rateOf, loadRates, ratesInfo } from "./fxRates"; // 💱 오늘 환율(못 받으면 기본값)
import { Card, Field, Grid, Sel, Combo, DateIn, TimeIn, DateTimeIn, TextIn, NumIn, Seg, Btn, ContainerArt, RouteArt, ModeChip, MODE_NAME, MONO, NAVY, GRID } from "./ui";

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
  const base = { mode, direction: "수입", client: "", memo: "", sales: [], costs: [] };
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
        <span className="text-[13px] font-black text-[#0F1A30]">{title}</span>
        <span className="text-[12.5px] font-black text-[#2D4C82] tabular-nums">{won(sumLines(lines))}원</span>
        <Btn size="sm" kind="soft" onClick={add} className="ml-auto">+ 항목 추가</Btn>
      </div>
      {!lines.length && <div className="h-10 rounded-xl border border-dashed border-[#DCE3EE] grid place-items-center text-[12.5px] text-[#9AA9C3] font-semibold">항목을 추가하세요</div>}
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className={`grid gap-1.5 items-center ${vendor ? "grid-cols-[minmax(0,1.3fr)_84px_minmax(0,1fr)_minmax(0,1fr)_32px]" : "grid-cols-[minmax(0,1.4fr)_84px_minmax(0,1fr)_32px]"}`}>
            <Sel value={l.item} onChange={(v) => set(i, "item", v)} options={CHARGE_ITEMS[mode]} placeholder="항목" />
            <Sel value={l.cur} onChange={(v) => set(i, "cur", v || "KRW")} options={CURRENCIES} placeholder="통화" />
            <div className="min-w-0">
              <NumIn value={l.amount} onChange={(v) => set(i, "amount", v)} decimals={l.cur !== "KRW"} unit={l.cur === "KRW" ? "원" : l.cur} />
              {l.cur !== "KRW" && (
                <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-[#7A89A3]">
                  환율 <input value={l.rate || ""} onChange={(e) => set(i, "rate", e.target.value.replace(/[^0-9.]/g, ""))} className="w-16 h-6 px-1.5 rounded-md border border-[#DCE3EE] text-[11.5px] font-bold text-[#0F1A30] tabular-nums" />
                  <span className="tabular-nums">= {won(lineKrw(l))}원</span>
                </div>
              )}
            </div>
            {vendor && <TextIn value={l.vendor} onChange={(v) => set(i, "vendor", v)} placeholder="지급처" />}
            <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="삭제" className="w-8 h-10 rounded-lg text-[#9AA9C3] hover:text-[#C2362B] hover:bg-[#F5F8FD] grid place-items-center text-[14px] font-black">✕</button>
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
        <div className="py-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl grid place-items-center text-white text-[24px] font-black" style={{ background: NAVY }}>✓</div>
          <div className="text-[19px] font-black text-[#0F1A30] mt-4">{saved.edit ? "저장했습니다" : `${saved.legs.length}건 등록했습니다`}</div>
          <div className="mt-2 flex items-center gap-2 flex-wrap justify-center">
            <span className="h-7 px-2.5 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black tabular-nums inline-flex items-center" style={{ fontFamily: MONO }}>{first.jobNo}</span>
            {saved.legs.slice(0, 6).map((l) => <span key={l.id} className="h-7 px-2.5 rounded-lg bg-[#EEF3FB] text-[#1B2B4B] text-[12.5px] font-extrabold tabular-nums inline-flex items-center">{l.refNo}</span>)}
            {saved.legs.length > 6 && <span className="text-[12.5px] font-bold text-[#7A89A3]">외 {saved.legs.length - 6}건</span>}
          </div>
          {targets.length > 0 && !saved.handed && (
            <div className="mt-6 w-full max-w-[520px] rounded-2xl border border-[#E3E8F0] bg-[#F5F8FD] p-4 text-left">
              <div className="text-[13.5px] font-black text-[#0F1A30]">다음 구간을 바로 인계할까요?</div>
              <div className="text-[12.5px] text-[#5B6B85] mt-0.5">같은 Job 번호로 이어지고, 받는 팀 인계함에 뜹니다. 거래처 · 번호 · 일정은 그대로 넘어갑니다.</div>
              <div className="mt-3 flex gap-2 flex-wrap">
                {targets.map((t) => (
                  <Btn key={t} kind="primary" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await requestHandoff(first, t, {}, me); setSaved((s) => ({ ...s, handed: t })); } catch (e) { setErr(e?.message || "인계 실패"); } setBusy(false); }}>
                    {MODE_NAME[t]}팀에 인계 요청
                  </Btn>
                ))}
              </div>
            </div>
          )}
          {saved.handed && <div className="mt-5 text-[13.5px] font-black text-[#2D4C82]">{MODE_NAME[saved.handed]}팀 인계함으로 보냈습니다.</div>}
          {err && <div className="mt-3 text-[13px] font-bold text-[#C2362B]">{err}</div>}
          <div className="mt-6 flex gap-2 flex-wrap justify-center">
            {!editing && <Btn onClick={reset}>계속 등록</Btn>}
            <Btn kind="primary" onClick={() => (onDone ? onDone(first) : onGoList?.())}>{editing ? "닫기" : "현황 보기"}</Btn>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {accepting && (
        <div className="rounded-2xl px-4 py-3 border border-[#E3E8F0] bg-[#F5F8FD] text-[13px] font-bold text-[#3A4A66] flex items-center gap-2 flex-wrap">
          <ModeChip mode={initial.fromMode} /> 팀이 인계한 건입니다({initial.fromRef}). 비어 있는 칸을 채우고 [접수]를 누르면 진행 건으로 바뀝니다.
        </div>
      )}

      {/* ── 기본 ── */}
      <Card title="기본 정보" en="BASIC">
        <Grid>
          {mode === "container" ? (
            <Field label="운송 구분" required span={2}><Seg value={f.trip} onChange={(v) => set("trip", v)} options={CNTR_TRIPS} /></Field>
          ) : mode === "inland" ? (
            <Field label="수출입"><Seg value={f.direction} onChange={(v) => set("direction", v)} options={DIRECTIONS} /></Field>
          ) : (
            <Field label="수출입" required><Seg value={f.direction} onChange={(v) => set("direction", v)} options={DIRECTIONS} /></Field>
          )}
          {mode === "sea" && <Field label="선적 형태" required><Seg value={f.seaType} onChange={(v) => set("seaType", v)} options={SEA_TYPES} /></Field>}
          <Field label="거래처" required><Combo value={f.client} onChange={(v) => set("client", v)} options={clients} placeholder="거래처 선택 또는 입력" /></Field>
          {!editing && <Field label="Job 연결" hint="이어지는 건"><Sel value={linkJob} onChange={setLinkJob} options={jobOptions} placeholder="새 Job 으로 등록" /></Field>}
          {(mode === "sea" || mode === "air") && <Field label="인코텀즈"><Sel value={f.incoterms} onChange={(v) => set("incoterms", v)} options={INCOTERMS} /></Field>}
          {(mode === "sea" || mode === "air") && <Field label="운임 조건"><Sel value={f.freightTerm} onChange={(v) => set("freightTerm", v)} options={FREIGHT_TERMS} /></Field>}
          {mode === "sea" && <Field label="운송 조건"><Sel value={f.serviceTerm} onChange={(v) => set("serviceTerm", v)} options={SERVICE_TERMS} /></Field>}
          {mode === "sea" && <Field label="B/L 종류"><Sel value={f.blType} onChange={(v) => set("blType", v)} options={BL_TYPES} /></Field>}
        </Grid>
      </Card>

      {/* ── 컨테이너 ── */}
      {mode === "container" && (<>
        <Card title="컨테이너" en="CONTAINER">
          <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-5">
            <div className="rounded-2xl p-4 text-white flex flex-col items-center justify-center min-h-[190px]" style={{ background: `${GRID}, ${NAVY}` }}>
              <ContainerArt size={f.size} cntrNo={fmtCntrNo(f.cntrNo)} line={f.line} height={104} />
              <div className="mt-2 flex gap-1.5 flex-wrap justify-center">
                {ct && [ct.iso, ct.cbm ? `${ct.cbm} CBM` : "", `최대 ${ct.payload}톤`].filter(Boolean).map((x) => <span key={x} className="h-6 px-2 rounded-lg bg-white/10 text-[11.5px] font-extrabold tabular-nums inline-flex items-center">{x}</span>)}
              </div>
            </div>
            <Grid cols={3}>
              <Field label="규격" required><Sel value={f.size} onChange={(v) => set("size", v || "40HC")} options={CNTR_OPTIONS} /></Field>
              {!editing && <Field label="수량" hint="같은 내용으로 여러 대"><Sel value={qty} onChange={(v) => setQty(v || "1")} options={QTY} /></Field>}
              <Field label="선사"><Combo value={f.line} onChange={(v) => set("line", v)} options={LINES} placeholder="선사 선택" /></Field>
              <Field label="컨테이너 번호" ok={f.cntrNo && cntrChk.ok ? cntrChk.msg : ""} err={!cntrChk.ok ? cntrChk.msg : ""}>
                <TextIn value={fmtCntrNo(f.cntrNo)} onChange={(v) => set("cntrNo", cleanCntrNo(v))} upper placeholder="HMMU 123456 7" maxLength={13} />
              </Field>
              <Field label="씰 번호"><TextIn value={f.sealNo} onChange={(v) => set("sealNo", v)} upper placeholder="SEAL NO." /></Field>
              <Field label="부킹 번호"><TextIn value={f.bookingNo} onChange={(v) => set("bookingNo", v)} upper placeholder="BOOKING NO." /></Field>
              <Field label="B/L 번호"><TextIn value={f.blNo} onChange={(v) => set("blNo", v)} upper placeholder="B/L NO." /></Field>
              <Field label="선명"><TextIn value={f.vessel} onChange={(v) => set("vessel", v)} upper placeholder="VESSEL" /></Field>
              <Field label="항차"><TextIn value={f.voyage} onChange={(v) => set("voyage", v)} upper placeholder="VOY." /></Field>
              <Field label="화물 중량"><NumIn value={f.weight} onChange={(v) => set("weight", v)} decimals unit="톤" /></Field>
              <Field label="위험물"><Seg value={f.dg} onChange={(v) => set("dg", v)} options={[["N", "일반"], ["Y", "위험물"]]} /></Field>
              {ct?.kind === "냉동" && <Field label="설정 온도"><Sel value={f.temp} onChange={(v) => set("temp", v)} options={TEMPS} /></Field>}
              <Field label="품명" span={ct?.kind === "냉동" ? 1 : 2}><TextIn value={f.cargo} onChange={(v) => set("cargo", v)} placeholder="품명" /></Field>
            </Grid>
          </div>
          {ct && Number(f.weight) > ct.payload && <div className="mt-3 text-[12.5px] font-bold text-[#C2362B]">중량이 {ct.key} 최대 적재중량({ct.payload}톤)을 넘습니다.</div>}
        </Card>
        <Card title="구간 · 일정" en="ROUTE & SCHEDULE">
          <Grid>
            <Field label={f.trip === "수출" ? "공컨테이너 픽업지" : "픽업지 (반출 터미널)"}><Combo value={f.pickupPlace} onChange={(v) => set("pickupPlace", v)} options={TERMINALS} placeholder="터미널 · CY 선택" /></Field>
            <Field label="작업지 (도어)"><Combo value={f.doorPlace} onChange={(v) => set("doorPlace", v)} options={places} placeholder="상하차지 선택 또는 입력" /></Field>
            <Field label="작업일"><DateIn value={f.doorDate} onChange={(v) => set("doorDate", v)} /></Field>
            <Field label="작업 시각"><TimeIn value={f.doorTime} onChange={(v) => set("doorTime", v)} /></Field>
            <Field label={f.trip === "수출" ? "반입 터미널" : "공컨테이너 반납지"}><Combo value={f.returnPlace} onChange={(v) => set("returnPlace", v)} options={TERMINALS} placeholder="터미널 · CY 선택" /></Field>
            {f.trip === "수출"
              ? <Field label="반입 마감 (Cargo Closing)" span={2}><DateTimeIn value={f.cargoClosing} onChange={(v) => set("cargoClosing", v)} /></Field>
              : <Field label="반납 기한 (프리타임)"><DateIn value={f.freeTimeEnd} onChange={(v) => set("freeTimeEnd", v)} /></Field>}
            {f.trip !== "수출" && <Field label="초과 시 하루 비용" hint="DEM · DET"><NumIn value={f.overRate} onChange={(v) => set("overRate", v)} unit="원" /></Field>}
          </Grid>
        </Card>
        <Card title="배차" en="DISPATCH">
          <Grid>
            <Field label="차량 구분"><Sel value={f.carKind} onChange={(v) => set("carKind", v)} options={CNTR_CAR_KINDS} /></Field>
            <Field label="기사"><Combo value={f.driver} onChange={pickDriver} options={driverOptions} placeholder="기사 선택 또는 입력" /></Field>
            <Field label="차량 번호"><TextIn value={f.carNo} onChange={(v) => set("carNo", v)} placeholder="차량 번호" /></Field>
            <Field label="기사 연락처"><TextIn value={f.driverPhone} onChange={(v) => set("driverPhone", v)} placeholder="010-0000-0000" inputMode="tel" /></Field>
            <Field label="샤시"><Sel value={f.chassis} onChange={(v) => set("chassis", v)} options={CHASSIS} /></Field>
            <Field label="운임 구분"><Sel value={f.fareKind} onChange={(v) => set("fareKind", v)} options={CNTR_FARE_KINDS} /></Field>
          </Grid>
        </Card>
      </>)}

      {/* ── 해상 ── */}
      {mode === "sea" && (<>
        <Card title="선적 일정" en="VOYAGE">
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5">
            <div className="rounded-2xl p-4 text-white flex flex-col items-center justify-center min-h-[190px]" style={{ background: `${GRID}, ${NAVY}` }}>
              <RouteArt mode="sea" from={portName(f.pol)} to={portName(f.pod)} fromSub={f.pol} toSub={f.pod} pct={50} />
              <div className="mt-1 flex gap-1.5 flex-wrap justify-center">
                {[f.line, f.vessel && `${f.vessel}${f.voyage ? ` ${f.voyage}` : ""}`, transit != null && transit >= 0 ? `운항 ${transit}일` : ""].filter(Boolean).map((x) => <span key={x} className="h-6 px-2 rounded-lg bg-white/10 text-[11.5px] font-extrabold inline-flex items-center">{x}</span>)}
              </div>
            </div>
            <Grid cols={3}>
              <Field label="선적항 (POL)" required><Sel value={f.pol} onChange={(v) => set("pol", v)} options={PORT_OPTIONS} placeholder="항구 선택" /></Field>
              <Field label="도착항 (POD)" required><Sel value={f.pod} onChange={(v) => set("pod", v)} options={PORT_OPTIONS} placeholder="항구 선택" /></Field>
              <Field label="선사"><Combo value={f.line} onChange={(v) => set("line", v)} options={LINES} placeholder="선사 선택" /></Field>
              <Field label="출항일 (ETD)"><DateIn value={f.etd} onChange={(v) => set("etd", v)} /></Field>
              <Field label="입항일 (ETA)"><DateIn value={f.eta} onChange={(v) => set("eta", v)} min={f.etd || ""} /></Field>
              <Field label="선명 · 항차"><div className="grid grid-cols-[minmax(0,1fr)_88px] gap-1.5"><TextIn value={f.vessel} onChange={(v) => set("vessel", v)} upper placeholder="VESSEL" /><TextIn value={f.voyage} onChange={(v) => set("voyage", v)} upper placeholder="VOY." /></div></Field>
              <Field label="서류 마감" span={1}><DateTimeIn value={f.docClosing} onChange={(v) => set("docClosing", v)} /></Field>
              <Field label="화물 마감 (Cargo Closing)"><DateTimeIn value={f.cargoClosing} onChange={(v) => set("cargoClosing", v)} /></Field>
              {f.direction === "수입" && <Field label="프리타임 종료일"><DateIn value={f.freeTimeEnd} onChange={(v) => set("freeTimeEnd", v)} min={f.eta || ""} /></Field>}
              {f.direction === "수입" && <Field label="초과 시 하루 비용" hint="컨테이너 1대"><NumIn value={f.overRate} onChange={(v) => set("overRate", v)} unit="원" /></Field>}
            </Grid>
          </div>
        </Card>
        <Card title="B/L · 화물" en="B/L & CARGO">
          <Grid>
            <Field label="House B/L"><TextIn value={f.hblNo} onChange={(v) => set("hblNo", v)} upper placeholder="HBL NO." /></Field>
            <Field label="Master B/L"><TextIn value={f.mblNo} onChange={(v) => set("mblNo", v)} upper placeholder="MBL NO." /></Field>
            <Field label="부킹 번호"><TextIn value={f.bookingNo} onChange={(v) => set("bookingNo", v)} upper placeholder="BOOKING NO." /></Field>
            <Field label="품명"><TextIn value={f.commodity} onChange={(v) => set("commodity", v)} placeholder="품명" /></Field>
            {f.seaType === "FCL" && (
              <Field label="컨테이너" span={2}>
                <div className="space-y-1.5">
                  {(f.cntrs || []).map((c, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_32px] gap-1.5">
                      <Sel value={c.size} onChange={(v) => set("cntrs", f.cntrs.map((x, j) => (j === i ? { ...x, size: v } : x)))} options={CNTR_OPTIONS} />
                      <Sel value={c.qty} onChange={(v) => set("cntrs", f.cntrs.map((x, j) => (j === i ? { ...x, qty: v || "1" } : x)))} options={QTY} />
                      <button type="button" onClick={() => set("cntrs", f.cntrs.filter((_, j) => j !== i))} className="w-8 h-10 rounded-lg text-[#9AA9C3] hover:text-[#C2362B] grid place-items-center font-black" aria-label="삭제">✕</button>
                    </div>
                  ))}
                  <Btn size="sm" kind="soft" onClick={() => set("cntrs", [...(f.cntrs || []), { size: "20GP", qty: "1" }])}>+ 규격 추가</Btn>
                </div>
              </Field>
            )}
            <Field label="포장 수량"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-1.5"><NumIn value={f.pkgQty} onChange={(v) => set("pkgQty", v)} /><Sel value={f.pkgUnit} onChange={(v) => set("pkgUnit", v)} options={PKG_UNITS} placeholder="단위" /></div></Field>
            <Field label="총중량"><NumIn value={f.grossWeight} onChange={(v) => set("grossWeight", v)} decimals unit="kg" /></Field>
            <Field label="용적" ok={f.seaType === "LCL" && (f.cbm || f.grossWeight) ? `운임톤(R/T) ${revenueTon(f.cbm, f.grossWeight)}` : ""}><NumIn value={f.cbm} onChange={(v) => set("cbm", v)} decimals unit="CBM" /></Field>
            <Field label="송하인 (Shipper)"><TextIn value={f.shipper} onChange={(v) => set("shipper", v)} placeholder="Shipper" /></Field>
            <Field label="수하인 (Consignee)"><TextIn value={f.consignee} onChange={(v) => set("consignee", v)} placeholder="Consignee" /></Field>
            <Field label="해외 파트너"><TextIn value={f.partner} onChange={(v) => set("partner", v)} placeholder="현지 대리점" /></Field>
            <Field label="관세사"><TextIn value={f.broker} onChange={(v) => set("broker", v)} placeholder="관세사" /></Field>
          </Grid>
        </Card>
      </>)}

      {/* ── 항공 ── */}
      {mode === "air" && (<>
        <Card title="항공편" en="FLIGHT">
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5">
            <div className="rounded-2xl p-4 text-white flex flex-col items-center justify-center min-h-[190px]" style={{ background: `${GRID}, ${NAVY}` }}>
              <RouteArt mode="air" from={f.dep} to={f.arr} pct={50} />
              <div className="mt-1 flex gap-1.5 flex-wrap justify-center">
                {[airline(f.airline)?.[1], f.flightNo].filter(Boolean).map((x) => <span key={x} className="h-6 px-2 rounded-lg bg-white/10 text-[11.5px] font-extrabold inline-flex items-center">{x}</span>)}
              </div>
            </div>
            <Grid cols={3}>
              <Field label="항공사"><Sel value={f.airline} onChange={(v) => { const a = airline(v); patch({ airline: v, mawbNo: a && cleanAwb(f.mawbNo).length <= 3 ? a[2] : f.mawbNo, flightNo: a && !f.flightNo ? a[0] : f.flightNo }); }} options={AIRLINE_OPTIONS} placeholder="항공사 선택" /></Field>
              <Field label="편명"><TextIn value={f.flightNo} onChange={(v) => set("flightNo", v)} upper placeholder="KE001" maxLength={8} /></Field>
              <Field label="Master AWB" ok={f.mawbNo && cleanAwb(f.mawbNo).length === 11 && awbChk.ok ? awbChk.msg : ""} err={cleanAwb(f.mawbNo).length === 11 && !awbChk.ok ? awbChk.msg : ""}>
                <TextIn value={fmtAwb(f.mawbNo)} onChange={(v) => set("mawbNo", cleanAwb(v))} placeholder="180-1234 5675" inputMode="numeric" maxLength={13} />
              </Field>
              <Field label="출발 공항" required><Sel value={f.dep} onChange={(v) => set("dep", v)} options={AIRPORT_OPTIONS} placeholder="공항 선택" /></Field>
              <Field label="도착 공항" required><Sel value={f.arr} onChange={(v) => set("arr", v)} options={AIRPORT_OPTIONS} placeholder="공항 선택" /></Field>
              <Field label="House AWB"><TextIn value={f.hawbNo} onChange={(v) => set("hawbNo", v)} upper placeholder="HAWB NO." /></Field>
              <Field label="출발 (ETD)"><DateTimeIn value={f.etd} onChange={(v) => set("etd", v)} /></Field>
              <Field label="도착 (ETA)"><DateTimeIn value={f.eta} onChange={(v) => set("eta", v)} /></Field>
              <Field label="반입 마감"><DateTimeIn value={f.cargoCutoff} onChange={(v) => set("cargoCutoff", v)} /></Field>
              <Field label="반입 창고" span={2}><Combo value={f.warehouse} onChange={(v) => set("warehouse", v)} options={AIR_WAREHOUSES} placeholder="창고 선택 또는 입력" /></Field>
            </Grid>
          </div>
        </Card>
        <Card title="화물 · 운임중량" en="CARGO & CHARGEABLE WEIGHT">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5">
            <Grid cols={3}>
              <Field label="개수"><NumIn value={f.pieces} onChange={(v) => set("pieces", v)} unit="PCS" /></Field>
              <Field label="실중량"><NumIn value={f.grossWeight} onChange={(v) => set("grossWeight", v)} decimals unit="kg" /></Field>
              <Field label="품명"><TextIn value={f.commodity} onChange={(v) => set("commodity", v)} placeholder="품명" /></Field>
              <Field label="가로"><NumIn value={f.dimL} onChange={(v) => set("dimL", v)} decimals unit="cm" /></Field>
              <Field label="세로"><NumIn value={f.dimW} onChange={(v) => set("dimW", v)} decimals unit="cm" /></Field>
              <Field label="높이"><NumIn value={f.dimH} onChange={(v) => set("dimH", v)} decimals unit="cm" /></Field>
              <Field label="송하인 (Shipper)"><TextIn value={f.shipper} onChange={(v) => set("shipper", v)} placeholder="Shipper" /></Field>
              <Field label="수하인 (Consignee)"><TextIn value={f.consignee} onChange={(v) => set("consignee", v)} placeholder="Consignee" /></Field>
              <Field label="해외 파트너"><TextIn value={f.partner} onChange={(v) => set("partner", v)} placeholder="현지 대리점" /></Field>
              <Field label="관세사"><TextIn value={f.broker} onChange={(v) => set("broker", v)} placeholder="관세사" /></Field>
            </Grid>
            <div className="rounded-2xl p-5 text-white" style={{ background: `${GRID}, ${NAVY}` }}>
              <div className="text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>CHARGEABLE WEIGHT</div>
              <div className="flex items-baseline gap-1.5 mt-2"><span className="text-[38px] font-black tabular-nums leading-none">{cw ? cw.toLocaleString("ko-KR") : "0"}</span><span className="text-[14px] font-bold text-white/60">kg</span></div>
              <div className="mt-4 space-y-1.5 text-[12.5px] font-bold">
                <div className="flex justify-between"><span className="text-white/60">실중량</span><span className="tabular-nums">{Number(f.grossWeight || 0).toLocaleString("ko-KR")} kg</span></div>
                <div className="flex justify-between"><span className="text-white/60">부피중량 (÷6000)</span><span className="tabular-nums">{volW.toLocaleString("ko-KR")} kg</span></div>
                <div className="flex justify-between"><span className="text-white/60">적용</span><span>{volW > Number(f.grossWeight || 0) ? "부피중량" : "실중량"}</span></div>
              </div>
            </div>
          </div>
        </Card>
      </>)}

      {/* ── 내륙 구간(인계받은 건) ── */}
      {mode === "inland" && (
        <Card title="내륙 운송" en="INLAND LEG">
          <Grid>
            <Field label="상차지"><Combo value={f.pickupPlace} onChange={(v) => set("pickupPlace", v)} options={places} placeholder="상차지 선택 또는 입력" /></Field>
            <Field label="하차지"><Combo value={f.dropPlace} onChange={(v) => set("dropPlace", v)} options={places} placeholder="하차지 선택 또는 입력" /></Field>
            <Field label="상차일"><DateIn value={f.pickupDate} onChange={(v) => set("pickupDate", v)} /></Field>
            <Field label="상차 시각"><TimeIn value={f.pickupTime} onChange={(v) => set("pickupTime", v)} /></Field>
            <Field label="차량 종류"><Sel value={f.carType} onChange={(v) => set("carType", v)} options={CAR_TYPES} /></Field>
            <Field label="톤수"><Sel value={f.carTon} onChange={(v) => set("carTon", v)} options={CAR_TONS} /></Field>
            <Field label="기사"><Combo value={f.driver} onChange={pickDriver} options={driverOptions} placeholder="기사 선택 또는 입력" /></Field>
            <Field label="차량 번호"><TextIn value={f.carNo} onChange={(v) => set("carNo", v)} placeholder="차량 번호" /></Field>
            <Field label="화물" span={2}><TextIn value={f.cargo} onChange={(v) => set("cargo", v)} placeholder="화물 내용" /></Field>
          </Grid>
        </Card>
      )}

      {/* ── 운임 ── */}
      <Card title="운임" en={fx.live ? `CHARGES · ${fx.day} 환율 자동` : "CHARGES · 기본 환율"} right={<span className={`text-[13px] font-black tabular-nums ${profit < 0 ? "text-[#C2362B]" : "text-[#0F1A30]"}`}>이익 {won(profit)}원{sale > 0 ? ` · ${Math.round((profit / sale) * 1000) / 10}%` : ""}</span>}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Lines title="청구 (매출)" mode={mode} lines={f.sales || []} onChange={(v) => set("sales", v)} />
          <Lines title="지급 (매입)" mode={mode} lines={f.costs || []} onChange={(v) => set("costs", v)} vendor />
        </div>
      </Card>

      <Card title="메모" en="MEMO">
        <textarea value={f.memo || ""} onChange={(e) => set("memo", e.target.value)} rows={3} placeholder="전달 사항"
          className="w-full border border-[#DCE3EE] rounded-xl px-3 py-2.5 text-[14px] font-medium text-[#0F1A30] placeholder:text-[#9AA9C3] focus:outline-none focus:border-[#2D4C82] resize-y" />
      </Card>

      <div className="sticky bottom-3 z-10 rounded-2xl bg-white/95 backdrop-blur border border-[#E3E8F0] shadow-[0_12px_30px_rgba(15,26,48,.14)] px-4 py-3 flex items-center gap-3 flex-wrap">
        {err ? <span className="text-[13px] font-bold text-[#C2362B]">{err}</span> : <span className="text-[12.5px] font-semibold text-[#7A89A3]">청구 {won(sale)}원 · 지급 {won(cost)}원</span>}
        <div className="ml-auto flex gap-2">
          {onCancel && <Btn onClick={onCancel}>취소</Btn>}
          {!editing && <Btn onClick={reset}>초기화</Btn>}
          <Btn kind="primary" disabled={busy} onClick={submit}>{busy ? "저장 중…" : accepting ? "접수" : editing ? "저장" : mode === "container" && Number(qty) > 1 ? `${qty}대 등록` : "등록"}</Btn>
        </div>
      </div>
    </div>
  );
}
