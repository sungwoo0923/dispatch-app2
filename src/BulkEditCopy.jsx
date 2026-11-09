// ======================= src/BulkEditCopy.jsx =======================
// 🗂 2026-11-09 배차현황·실시간배차현황 우클릭 [일괄수정·복사] — 거의 전체 화면 창, 위쪽 탭 두 개
//  · 일괄수정: 선택한 오더를 줄마다(두 줄 칸) 늘어놓고 상하차일·시간·거래처·상하차지·화물·차량·기사·운임·지급/배차방식·메모를
//    한 화면에서 고친다(가로 스크롤 없음). 위쪽 "선택 칸 일괄 입력"으로 체크한 오더에 같은 값을 한 번에 넣는다.
//    저장은 바뀐 칸만 patchDispatch(손으로 고칠 때와 같은 경로 — 수정 기록·화주사 사본·구글시트·기사 알림 그대로)
//  · 일괄복사: 오더마다 상차일·하차일·시간·복사 횟수(연속 N일 / 평일만)를 정해 한 번에 새 오더로 등록.
//    빠른 날짜(오늘·내일·모레·다음 주 같은 요일·+N일), "상하차 간격 유지", [첫 오더 날짜 전체 적용], 기사 유지 여부,
//    등록 전 미리보기(총 N건). 등록은 오더 복사 패널의 [복사 등록]과 같은 함수(onCopyOne = submitCopyOrderPC).
import React from "react";
import CustomDatePicker from "./CustomDatePicker";
import { CustomSelect } from "./CustomSelect"; // ⭐ 2026-11-09 브라우저 기본 select 대신 프로그램 드롭다운
import { CompanyOptionPicker } from "./companyOptionPicker"; // 지급방식·배차방식은 회사 목록(배차관리와 같은 목록)

const pad = (n) => String(n).padStart(2, "0");
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const kstToday = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymdOf(d); };
const dayGap = (a, b) => { if (!a || !b) return 0; return Math.max(0, Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 864e5)) || 0; };
const dowOf = (s) => new Date(`${s}T00:00:00`).getDay();
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const fmtMD = (s) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}(${DOW[dowOf(s)]})` : "-");
const money = (v) => { const n = Number(String(v ?? "").replace(/[^\d-]/g, "")); return n ? n.toLocaleString() : ""; };
const digits = (v) => String(v ?? "").replace(/[^\d-]/g, "");
const MONO = { fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" };
const idOf = (r) => r?._id || r?.id;

// 복사 계획 → 실제로 만들 오더 날짜 목록 [{ 상차일, 하차일 }]
export function copyDatesOf(plan) {
  const out = [];
  const n = Math.max(1, Math.min(31, Number(plan.count) || 1));
  let d = plan.상차일;
  let guard = 0;
  while (out.length < n && guard < 200) {
    guard += 1;
    const w = dowOf(d);
    if (!(plan.weekdaysOnly && (w === 0 || w === 6))) {
      out.push({ 상차일: d, 하차일: out.length === 0 && !plan.keepGap ? (plan.하차일 || d) : addDays(d, Number(plan.gap) || 0) });
    }
    d = addDays(d, 1);
  }
  return out;
}

const inp = "w-full h-[34px] px-2 rounded-lg border border-[#DCE3EE] bg-white text-[13px] font-semibold text-[#0F1A30] focus:outline-none focus:border-[#4B6CB7] focus:ring-2 focus:ring-[#4B6CB7]/15";
const sel = `${inp} pr-6`;
const lab = "block text-[10.5px] font-extrabold text-[#7A89A3] mb-0.5 tracking-wide";

// 일괄수정 칸 정의 — 두 줄(row: 1, 2)로 나눠 한 화면에 담는다
const EDIT_FIELDS = [
  { key: "상차일", label: "상차일", type: "date", row: 1, span: 2 },
  { key: "상차시간", label: "상차시간", type: "time", row: 1, span: 2 },
  { key: "하차일", label: "하차일", type: "date", row: 1, span: 2 },
  { key: "하차시간", label: "하차시간", type: "time", row: 1, span: 2 },
  { key: "거래처명", label: "거래처명", type: "client", row: 1, span: 3 },
  { key: "상차지명", label: "상차지", type: "place", row: 1, span: 3 },
  { key: "하차지명", label: "하차지", type: "place", row: 1, span: 3 },
  { key: "화물내용", label: "화물", type: "text", row: 1, span: 3 },
  { key: "차량종류", label: "차량종류", type: "vehicle", row: 2, span: 2 },
  { key: "차량톤수", label: "톤수", type: "ton", row: 2, span: 2 },
  { key: "차량번호", label: "차량번호", type: "plate", row: 2, span: 2 },
  { key: "이름", label: "기사명", type: "text", row: 2, span: 2 },
  { key: "전화번호", label: "전화", type: "text", row: 2, span: 2 },
  { key: "청구운임", label: "청구운임", type: "money", row: 2, span: 2 },
  { key: "기사운임", label: "기사운임", type: "money", row: 2, span: 2 },
  { key: "지급방식", label: "지급방식", type: "pay", row: 2, span: 2 },
  { key: "배차방식", label: "배차방식", type: "dispatch", row: 2, span: 2 },
  { key: "메모", label: "메모", type: "text", row: 2, span: 2 },
];

function FieldInput({ f, value, onChange, opts }) {
  const v = value ?? "";
  if (f.type === "date") return <CustomDatePicker value={v} onChange={(e) => onChange(e.target.value)} className={`${inp} text-left`} openOnFocus={false} />;
  if (f.type === "pay" || f.type === "dispatch") return <CompanyOptionPicker optKey={f.type === "pay" ? "지급방식" : "배차방식"} placeholder="-" noneLabel="- (비움)" className={`${sel} text-left`} value={v} onChange={(x) => onChange(x)} />;
  const list = f.type === "time" ? opts.times : f.type === "vehicle" ? opts.vehicles : f.type === "ton" ? opts.tons : f.type === "pay" ? opts.pays : f.type === "dispatch" ? opts.dispatches : null;
  if (list) {
    const all = v && !list.includes(v) ? [v, ...list] : list;
    return (
      <CustomSelect className={`${sel} text-left`} value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">-</option>
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
      </CustomSelect>
    );
  }
  if (f.type === "money") return <input className={`${inp} text-right`} style={MONO} inputMode="numeric" value={money(v)} onChange={(e) => onChange(digits(e.target.value))} placeholder="0" />;
  const dl = f.type === "client" ? "bec-clients" : f.type === "place" ? "bec-places" : f.type === "plate" ? "bec-plates" : undefined;
  return <input className={inp} list={dl} value={v} onChange={(e) => onChange(e.target.value)} autoComplete="off" />;
}

export default function BulkEditCopyModal({
  rows = [], patchDispatch, onClose, onDateShift, onCopyOne, onLegacyEdit,
  drivers = [], clients = [], places = [], timeOptions = [], tonOptions = [], vehicleTypes = [], payTypes = [], dispatchTypes = [],
  isViewer = false, initialTab = "edit", toast,
}) {
  const [tab, setTab] = React.useState(initialTab);
  // 스크롤 잠금(뒤 화면이 같이 움직이지 않게) + Esc 닫기
  React.useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const k = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // 드롭다운·달력·확인창이 떠 있으면 그것만 닫히게(창 전체가 닫혀 고친 값이 날아가지 않게) — FleetOrderPanel과 같은 기준
      if (document.querySelector("[data-kp-popup], [data-opt-menu], [data-vt-menu], [data-vt-dialog], [data-fare-menu], [data-kp-dialog]")) return;
      onClose?.();
    };
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [onClose]);

  const opts = React.useMemo(() => ({
    times: (timeOptions || []).filter(Boolean),
    tons: (tonOptions?.length ? tonOptions : ["0.5톤", "1톤", "1.4톤", "2.5톤", "3.5톤", "5톤", "5톤축", "8톤", "9.5톤", "11톤", "14톤", "15톤", "18톤", "25톤"]).filter(Boolean),
    vehicles: (vehicleTypes || []).filter(Boolean),
    pays: (payTypes || []).filter(Boolean),
    dispatches: (dispatchTypes || []).filter(Boolean),
  }), [timeOptions, tonOptions, vehicleTypes, payTypes, dispatchTypes]);

  const datalists = (
    <>
      <datalist id="bec-clients">{[...new Set((clients || []).map((c) => c?.거래처명 || c?.name).filter(Boolean))].slice(0, 800).map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="bec-places">{[...new Set((places || []).map((p) => p?.업체명 || p?.name).filter(Boolean))].slice(0, 800).map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="bec-plates">{(drivers || []).filter((d) => d?.차량번호).slice(0, 800).map((d) => <option key={d.id || d.차량번호} value={d.차량번호}>{`${d.이름 || ""} ${d.차량종류 || ""} ${d.차량톤수 || ""}`.trim()}</option>)}</datalist>
    </>
  );

  return (
    <div className="fixed inset-0 z-[99990] bg-[#0B1428]/60 backdrop-blur-[2px] flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      {datalists}
      <div className="w-[min(1680px,98vw)] h-[94vh] bg-[#F4F6FA] rounded-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden" data-bulk-edit-copy>
        <div className="px-5 pt-4 pb-0 text-white shrink-0" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={MONO}>BULK · EDIT &amp; COPY</div>
              <div className="text-[19px] font-black leading-tight">선택 오더 일괄수정 · 복사 <span className="text-[13px] font-semibold text-white/60 ml-1">{rows.length}건</span></div>
            </div>
            <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold hover:bg-white/20">닫기 ✕</button>
          </div>
          <div className="mt-3 flex gap-1">
            {[["edit", "일괄수정"], ["copy", "일괄복사"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`h-10 px-5 rounded-t-xl text-[14px] font-black transition ${tab === k ? "bg-[#F4F6FA] text-[#0F1A30]" : "text-white/70 hover:text-white hover:bg-white/10"}`}>{l}</button>
            ))}
          </div>
        </div>
        {tab === "edit"
          ? <EditTab rows={rows} opts={opts} drivers={drivers} patchDispatch={patchDispatch} onClose={onClose} onDateShift={onDateShift} onLegacyEdit={onLegacyEdit} isViewer={isViewer} toast={toast} />
          : <CopyTab rows={rows} opts={opts} onCopyOne={onCopyOne} onClose={onClose} isViewer={isViewer} toast={toast} />}
      </div>
    </div>
  );
}

// ─────────────────────────── 일괄수정 ───────────────────────────
function EditTab({ rows, opts, drivers, patchDispatch, onClose, onDateShift, onLegacyEdit, isViewer, toast }) {
  const init = React.useMemo(() => Object.fromEntries(rows.map((r) => [idOf(r), Object.fromEntries(EDIT_FIELDS.map((f) => [f.key, r[f.key] ?? ""]))])), [rows]);
  const [edited, setEdited] = React.useState(init);
  const [checked, setChecked] = React.useState(() => new Set(rows.map(idOf)));
  const [bulkKey, setBulkKey] = React.useState("상차일");
  const [bulkVal, setBulkVal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const setCell = (id, key, value) => setEdited((p) => {
    const row = { ...p[id], [key]: value };
    // 차량번호를 고르면 기사관리의 이름·전화·차종·톤수를 채운다(비어 있는 칸만)
    if (key === "차량번호") {
      const norm = (s) => String(s || "").replace(/\s/g, "");
      const d = (drivers || []).find((x) => norm(x.차량번호) === norm(value));
      if (d) { row.이름 = d.이름 || row.이름; row.전화번호 = d.전화번호 || row.전화번호; row.차량종류 = row.차량종류 || d.차량종류 || ""; row.차량톤수 = row.차량톤수 || d.차량톤수 || ""; }
    }
    return { ...p, [id]: row };
  });
  const bulkField = EDIT_FIELDS.find((f) => f.key === bulkKey);
  const applyBulk = () => {
    const ids = [...checked];
    if (!ids.length) return;
    ids.forEach((id) => setCell(id, bulkKey, bulkVal));
  };
  const changedOf = (r) => {
    const id = idOf(r); const cur = edited[id] || {};
    const out = {};
    EDIT_FIELDS.forEach((f) => { const a = String(r[f.key] ?? ""), b = String(cur[f.key] ?? ""); if (a !== b) out[f.key] = f.type === "money" ? (b === "" ? "" : Number(b) || 0) : b; });
    return out;
  };
  const changes = rows.map((r) => [r, changedOf(r)]).filter(([, c]) => Object.keys(c).length);
  const save = async () => {
    if (isViewer) return;
    const bad = changes.find(([r, c]) => { const p = c.상차일 ?? r.상차일, d = c.하차일 ?? r.하차일; return p && d && d < p; });
    if (bad) { window.alert(`하차일이 상차일보다 빠른 오더가 있습니다: ${bad[0].거래처명 || ""}`); return; }
    setBusy(true);
    let ok = 0, skipped = 0;
    try {
      for (const [r, c] of changes) {
        // 기사 정보가 새로 들어가면 배차완료로(patchDispatch가 배차확정일시·기사 알림을 처리)
        const patch = { ...c };
        if ("차량번호" in c && String(c.차량번호 || "").trim() && !String(r.차량번호 || "").trim() && r.배차상태 === "배차중") patch.배차상태 = "배차완료";
        const res = await patchDispatch(idOf(r), patch, r);
        if (res === false) { skipped += 1; continue; } // 휴차 보류·운송완료 기사취소 확인에서 취소
        ok += 1;
      }
      toast?.(`${ok}건 수정했습니다${skipped ? ` · ${skipped}건은 취소됨` : ""}`, "success");
      onClose?.();
    } catch (e) {
      // 앞에서 저장된 건수를 알려 줘야 다시 눌러 중복 수정하지 않는다
      window.alert(`${ok ? `${ok}건은 저장됐고, ` : ""}${ok + skipped + 1}번째 오더 저장 중 오류: ${e?.message || e}`);
      if (ok) onClose?.();
    } finally { setBusy(false); }
  };
  const allOn = checked.size === rows.length;
  const gridCols = "grid-cols-[repeat(20,minmax(0,1fr))]";
  return (
    <>
      <div className="px-5 py-3 bg-white border-b border-[#E3E8F0] flex flex-wrap items-end gap-2 shrink-0">
        <div className="text-[12px] font-black text-[#1B2B4B] mr-1 self-center">선택 칸 일괄 입력</div>
        <div className="w-[150px]">
          <span className={lab}>칸</span>
          <CustomSelect className={`${sel} text-left`} value={bulkKey} onChange={(e) => { setBulkKey(e.target.value); setBulkVal(""); }}>
            {EDIT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </CustomSelect>
        </div>
        <div className="w-[220px]"><span className={lab}>값</span><FieldInput f={bulkField} value={bulkVal} onChange={setBulkVal} opts={opts} /></div>
        <button type="button" onClick={applyBulk} disabled={!checked.size} className="h-[34px] px-4 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-40">체크한 {checked.size}건에 적용</button>
        <div className="flex-1" />
        {onDateShift && <button type="button" onClick={onDateShift} className="h-[34px] px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-bold text-[#1B2B4B]">날짜 일괄 이동</button>}
        {onLegacyEdit && <button type="button" onClick={onLegacyEdit} className="h-[34px] px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-bold text-[#1B2B4B]" title="운임구분 계산·전달사항 등">운임·전달사항 상세</button>}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-3 space-y-2 overscroll-contain">
        <label className="flex items-center gap-2 text-[12px] font-bold text-[#5B6B85] px-1">
          <input type="checkbox" checked={allOn} onChange={() => setChecked(allOn ? new Set() : new Set(rows.map(idOf)))} /> 전체 선택 · 바뀐 칸은 파란색
        </label>
        {rows.map((r, i) => {
          const id = idOf(r); const cur = edited[id] || {};
          return (
            <div key={id} className={`rounded-2xl border bg-white px-3 py-2.5 ${checked.has(id) ? "border-[#4B6CB7]/50" : "border-[#E3E8F0]"}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <input type="checkbox" checked={checked.has(id)} onChange={() => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
                <span className="w-6 h-6 rounded-md bg-[#0F1A30] text-white text-[11px] font-black grid place-items-center" style={MONO}>{i + 1}</span>
                <span className="text-[13px] font-black text-[#0F1A30] truncate">{r.거래처명 || "-"}</span>
                <span className="text-[12px] text-[#7A89A3] truncate">{r.상차지명 || ""} → {r.하차지명 || ""}</span>
                <span className="ml-auto text-[11.5px] font-bold text-[#7A89A3]">{r.배차상태 || ""}</span>
              </div>
              {[1, 2].map((rowNo) => (
                <div key={rowNo} className={`grid ${gridCols} gap-1.5 ${rowNo === 2 ? "mt-1.5" : ""}`}>
                  {EDIT_FIELDS.filter((f) => f.row === rowNo).map((f) => {
                    const changed = String(r[f.key] ?? "") !== String(cur[f.key] ?? "");
                    return (
                      <div key={f.key} style={{ gridColumn: `span ${f.span} / span ${f.span}` }} className={changed ? "[&_input]:!bg-[#EEF3FC] [&_select]:!bg-[#EEF3FC] [&_button]:!bg-[#EEF3FC] [&_input]:!border-[#4B6CB7] [&_select]:!border-[#4B6CB7]" : ""}>
                        <span className={lab}>{f.label}</span>
                        <FieldInput f={f} value={cur[f.key]} onChange={(v) => setCell(id, f.key, v)} opts={opts} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="px-5 py-3 bg-white border-t border-[#E3E8F0] flex items-center gap-3 shrink-0">
        <div className="text-[13px] font-bold text-[#5B6B85]">바뀐 오더 <b className="text-[#0F1A30]" style={MONO}>{changes.length}</b>건</div>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#1B2B4B]">취소</button>
        <button type="button" onClick={save} disabled={busy || isViewer || !changes.length} className="h-11 px-7 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-40">{busy ? "저장 중…" : `저장 · ${changes.length}건`}</button>
      </div>
    </>
  );
}

// ─────────────────────────── 일괄복사 ───────────────────────────
function CopyTab({ rows, opts, onCopyOne, onClose, isViewer, toast }) {
  const today = kstToday();
  const [keepGap, setKeepGap] = React.useState(true);
  const [keepDriver, setKeepDriver] = React.useState(false);
  const [plans, setPlans] = React.useState(() => rows.map((r) => {
    const gap = dayGap(r.상차일, r.하차일);
    const p = addDays(today, 1);
    return { id: idOf(r), 상차일: p, 하차일: addDays(p, gap), gap, 상차시간: r.상차시간 || "", 하차시간: r.하차시간 || "", count: 1, weekdaysOnly: false, on: true };
  }));
  const [busy, setBusy] = React.useState(null); // { done, total }
  const setPlan = (i, patch) => setPlans((ps) => ps.map((p, k) => {
    if (k !== i) return p;
    const n = { ...p, ...patch };
    if ("상차일" in patch && keepGap) n.하차일 = addDays(n.상차일, n.gap);
    if ("하차일" in patch && !keepGap) n.gap = dayGap(n.상차일, n.하차일);
    return n;
  }));
  const quick = (base) => [
    ["오늘", today], ["내일", addDays(today, 1)], ["모레", addDays(today, 2)],
    ["다음 주 같은 요일", addDays(base || today, 7)],
  ];
  const applyFirst = () => {
    const f = plans[0]; if (!f) return;
    setPlans((ps) => ps.map((p, i) => (i === 0 ? p : { ...p, 상차일: f.상차일, 하차일: keepGap ? addDays(f.상차일, p.gap) : f.하차일, count: f.count, weekdaysOnly: f.weekdaysOnly })));
  };
  const shiftAll = (n) => setPlans((ps) => ps.map((p) => ({ ...p, 상차일: addDays(p.상차일, n), 하차일: addDays(p.하차일, n) })));
  const expanded = plans.flatMap((p, i) => (p.on ? copyDatesOf({ ...p, keepGap }).map((d) => ({ i, ...d })) : []));
  const past = expanded.find((d) => d.상차일 < today);
  const reversed = expanded.find((d) => d.하차일 < d.상차일);
  const run = async () => {
    if (isViewer || !expanded.length) return;
    if (past) { window.alert("오늘보다 이전 날짜로는 복사할 수 없습니다(지난 날짜는 오늘로 바뀝니다). 날짜를 확인해 주세요."); return; }
    if (reversed) { window.alert("하차일이 상차일보다 빠른 복사본이 있습니다."); return; }
    if (!window.confirm(`총 ${expanded.length}건을 새 오더로 등록할까요?`)) return;
    setBusy({ done: 0, total: expanded.length });
    let ok = 0;
    try {
      for (const d of expanded) {
        const src = rows[d.i]; const p = plans[d.i];
        const order = { ...src, 상차일: d.상차일, 하차일: d.하차일, 상차시간: p.상차시간, 하차시간: p.하차시간 };
        if (!keepDriver) { order.차량번호 = ""; order.이름 = ""; order.전화번호 = ""; order.기사확인상태 = null; }
        const res = await onCopyOne(order);
        if (res === false) break;
        ok += 1; setBusy({ done: ok, total: expanded.length });
      }
      if (ok) toast?.(`${ok}건 복사 등록했습니다${ok < expanded.length ? ` (${expanded.length - ok}건은 등록 안 됨)` : ""}`, "success");
      if (ok === expanded.length) onClose?.();
    } catch (e) {
      window.alert(`${ok ? `${ok}건은 등록됐고, ` : ""}복사 중 오류: ${e?.message || e}\n같은 오더가 겹치지 않게 배차현황에서 확인 후 남은 건만 다시 복사해 주세요.`);
      if (ok) onClose?.();
    } finally { setBusy(null); }
  };
  return (
    <>
      <div className="px-5 py-3 bg-white border-b border-[#E3E8F0] flex flex-wrap items-center gap-2 shrink-0">
        <button type="button" onClick={applyFirst} className="h-[34px] px-4 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-black">첫 오더 날짜 · 횟수 전체 적용</button>
        <span className="text-[12px] font-bold text-[#7A89A3] ml-1">전체 날짜</span>
        {[-1, 1, 7].map((n) => <button key={n} type="button" onClick={() => shiftAll(n)} className="h-[30px] px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B]" style={MONO}>{n > 0 ? `+${n}` : n}일</button>)}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#1B2B4B]"><input type="checkbox" checked={keepGap} onChange={(e) => setKeepGap(e.target.checked)} /> 상하차 간격 유지</label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#1B2B4B] ml-3" title="끄면 기사·차량을 비우고 배차중으로 복사합니다"><input type="checkbox" checked={keepDriver} onChange={(e) => setKeepDriver(e.target.checked)} /> 기사·차량 유지</label>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-3 overscroll-contain">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
          {rows.map((r, i) => {
            const p = plans[i]; const dates = p.on ? copyDatesOf({ ...p, keepGap }) : [];
            return (
              <div key={p.id} className={`rounded-2xl border bg-white px-4 py-3 ${p.on ? "border-[#E3E8F0]" : "border-dashed border-[#DCE3EE] opacity-60"}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={p.on} onChange={(e) => setPlan(i, { on: e.target.checked })} />
                  <span className="w-6 h-6 rounded-md bg-[#0F1A30] text-white text-[11px] font-black grid place-items-center" style={MONO}>{i + 1}</span>
                  <span className="text-[14px] font-black text-[#0F1A30] truncate">{r.거래처명 || "-"}</span>
                  <span className="text-[12px] text-[#7A89A3] truncate">{r.상차지명 || ""} → {r.하차지명 || ""}</span>
                  <span className="ml-auto text-[11.5px] font-bold text-[#9AA9C3] whitespace-nowrap" style={MONO}>원본 {fmtMD(r.상차일)}</span>
                </div>
                <div className="mt-2 grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-3"><span className={lab}>상차일</span><CustomDatePicker value={p.상차일} min={today} onChange={(e) => setPlan(i, { 상차일: e.target.value })} className={`${inp} text-left`} openOnFocus={false} /></div>
                  <div className="col-span-2"><span className={lab}>상차시간</span><FieldInput f={{ type: "time" }} value={p.상차시간} onChange={(v) => setPlan(i, { 상차시간: v })} opts={opts} /></div>
                  <div className="col-span-3"><span className={lab}>하차일{keepGap ? ` (+${p.gap}일)` : ""}</span><CustomDatePicker value={p.하차일} min={p.상차일} disabled={keepGap} onChange={(e) => setPlan(i, { 하차일: e.target.value })} className={`${inp} text-left`} openOnFocus={false} /></div>
                  <div className="col-span-2"><span className={lab}>하차시간</span><FieldInput f={{ type: "time" }} value={p.하차시간} onChange={(v) => setPlan(i, { 하차시간: v })} opts={opts} /></div>
                  <div className="col-span-2"><span className={lab}>복사 횟수</span>
                    <CustomSelect className={`${sel} text-left`} value={p.count} onChange={(e) => setPlan(i, { count: Number(e.target.value) })}>
                      {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n === 1 ? "1건" : `${n}일 연속`}</option>)}
                    </CustomSelect>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {quick(p.상차일).map(([l, d]) => (
                    <button key={l} type="button" onClick={() => setPlan(i, { 상차일: d })} className={`h-[26px] px-2.5 rounded-full text-[11.5px] font-bold border ${p.상차일 === d ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#1B2B4B] border-[#DCE3EE]"}`}>{l}</button>
                  ))}
                  {p.count > 1 && <label className="ml-1 flex items-center gap-1 text-[11.5px] font-bold text-[#5B6B85]"><input type="checkbox" checked={p.weekdaysOnly} onChange={(e) => setPlan(i, { weekdaysOnly: e.target.checked })} /> 주말 빼기</label>}
                  <span className="ml-auto text-[11.5px] font-bold text-[#5B6B85] truncate" style={MONO} title={dates.map((d) => fmtMD(d.상차일)).join(", ")}>
                    {dates.length ? `${dates.length}건 · ${fmtMD(dates[0].상차일)}${dates.length > 1 ? ` ~ ${fmtMD(dates[dates.length - 1].상차일)}` : ""}` : "복사 안 함"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-5 py-3 bg-white border-t border-[#E3E8F0] flex items-center gap-3 shrink-0">
        <div className="text-[13px] font-bold text-[#5B6B85]">새로 만들 오더 <b className="text-[#0F1A30] text-[15px]" style={MONO}>{expanded.length}</b>건{!keepDriver ? " · 기사 비움(배차중)" : ""}</div>
        {past && <div className="text-[12px] font-bold text-[#B4342A]">오늘 이전 날짜가 있습니다</div>}
        <div className="flex-1" />
        {busy && <div className="text-[12.5px] font-bold text-[#2D4C82]" style={MONO}>등록 중 {busy.done}/{busy.total}</div>}
        <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#1B2B4B]">취소</button>
        <button type="button" onClick={run} disabled={!!busy || isViewer || !expanded.length} className="h-11 px-7 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-40">{busy ? "등록 중…" : `복사 등록 · ${expanded.length}건`}</button>
      </div>
    </>
  );
}
