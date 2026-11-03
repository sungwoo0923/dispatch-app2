// ======================= src/FixedRouteStatus.jsx =======================
// 🛣 2026-11-03 배차현황 › 고정노선현황 — 고정노선 › 배차표 양식(화주사 구글시트)의 오더를 배차현황과 같은 화면으로
//  · 버튼·합계(건수·청구·기사·수수료)·필터·기간·검색·어제/당일/내일/전체·기사복사·업로드링크·대용량·선택삭제·엑셀·일마감은
//    배차현황(DispatchStatus)을 그대로 쓰고, 표의 열만 그 양식(시트 제목줄) 순서로 바꾼다(fixedForm).
//  · 화면을 열어 두면 30초마다 서버가 시트와 맞춘다(새 날짜 탭·새 줄 → 오더, 시트에서 바뀐 칸 → 프로그램, 프로그램에서 바꾼 칸 → 시트)
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { sheetApi } from "./RouteBoard";
import { ownerOf, rateFor } from "./routeBoardSheet";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const toInt = (v) => parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
const normPlate = (s = "") => String(s).replace(/\s+/g, "").toUpperCase();
const pad = (n) => String(n).padStart(2, "0");
const parseHM = (v) => {
  const s = String(v || "").trim(); if (!s) return "";
  let m = s.match(/(오전|오후)\s*(\d{1,2})(?::(\d{2}))?/);
  if (m) { let h = +m[2] % 12; if (m[1] === "오후") h += 12; return `${pad(h)}:${m[3] || "00"}`; }
  m = s.match(/^(\d{1,2})(?::|시\s*)?(\d{2})?분?$/) || s.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] < 24) return `${pad(+m[1])}:${m[2] || "00"}`;
  return "";
};
const korTime = (hm) => { if (!hm) return ""; const [h, m] = hm.split(":").map(Number); return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`; };
const TIME_FIELDS = new Set(["상차시간", "하차시간"]);
const MONEY_FIELDS = new Set(["청구운임", "기사운임"]);

// 표 머리글 — 선택·순번 + 상차일·상차지(묶음) + 시트 열 순서 + 배차상태·운임(시트에 없으면)
export function fixedHeaderOf(form) {
  const cols = (form?.columns || []).filter((c) => c.kind !== "no");
  const has = (f) => cols.some((c) => c.kind === "field" && c.field === f);
  return ["선택", "순번", "상차일", "상차지", ...cols.map((c) => c.label), "배차상태", ...["청구운임", "기사운임"].filter((f) => !has(f)), "수수료"];
}
const cargoText = (qty) => { const total = Object.values(qty).reduce((a, n) => a + n, 0); return { 화물내용: Object.keys(qty).length ? `${Object.entries(qty).map(([k, n]) => `${k} ${n}`).join(" · ")} (총 ${total})` : "", 화물수량: total ? String(total) : "" }; };
const valueOf = (c, row) => {
  if (c.kind === "qty") return row.품목수량?.[c.label] ? String(row.품목수량[c.label]) : "";
  if (c.kind === "extra") return String(row.추가정보?.[c.label] ?? "");
  if (c.kind === "sum") { const t = Object.values(row.품목수량 || {}).reduce((a, n) => a + toInt(n), 0); return t ? String(t) : ""; }
  const v = String(row[c.field] ?? "");
  return TIME_FIELDS.has(c.field) ? (parseHM(v) || v) : v;
};

// 칸 하나(바로 고치기) — 엔터·칸 밖 누르면 저장, Esc 되돌리기
function Cell({ value, onCommit, numeric, wide, placeholder, disabled, title, strong }) {
  const [v, setV] = React.useState(value);
  const [edit, setEdit] = React.useState(false);
  React.useEffect(() => { if (!edit) setV(value); }, [value, edit]);
  const commit = () => { setEdit(false); if (String(v) !== String(value)) onCommit(v); };
  return (
    <input value={v} disabled={disabled} title={title} placeholder={placeholder} inputMode={numeric ? "numeric" : undefined}
      size={Math.max(numeric ? 3 : 6, Math.min(wide ? 34 : 18, String(v || placeholder || "").length + 1))}
      onFocus={(e) => { setEdit(true); e.target.select(); }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value); setEdit(false); setTimeout(() => e.target.blur(), 0); } }}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      className={`kp-frs-cell ${wide ? "min-w-[150px] text-left" : numeric ? "min-w-[54px] text-center tabular-nums" : "min-w-[84px] text-center"} ${strong ? "font-black" : "font-semibold"}`} />
  );
}

// 한 줄의 칸들(시트 열 순서) — 고치면 바로 오더에 저장(patchDispatch) → 서버가 30초 안에 시트에도 써 준다
export function FixedRouteCells({ form, row, drivers = [], onPatch, disabled = false }) {
  const td = "px-1.5 py-1.5 border-b border-[#E9EDF4] border-r border-r-[#F1F4F9] text-center whitespace-nowrap";
  const cols = (form?.columns || []).filter((c) => c.kind !== "no");
  // ⭐ 2026-11-03 단가표 — 파레트 수·도착지가 바뀌면 청구운임 자동(직접 고친 운임이면 그대로)
  const fareOf = (q, addr) => {
    if (!form?.rateTable?.length || row.운임수동) return {};
    const n = Object.values(q || {}).reduce((a, x) => a + toInt(x), 0);
    const r = rateFor(form.rateTable, addr ?? row.하차지주소 ?? "", n);
    return r ? { 청구운임: String(r.total), 수수료: String(r.total - toInt(row.기사운임)), 단가표지역: r.region, 파렛단가: r.per } : {};
  };
  const commit = (c, raw) => {
    const val = String(raw ?? "").trim();
    if (c.kind === "qty") {
      const q = { ...(row.품목수량 || {}) }; if (toInt(val)) q[c.label] = toInt(val); else delete q[c.label];
      return onPatch({ 품목수량: q, ...cargoText(q), ...fareOf(q) });
    }
    if (c.kind === "field" && c.field === "하차지주소") return onPatch({ 하차지주소: val, ...fareOf(row.품목수량, val) });
    if (c.kind === "extra") return onPatch({ 추가정보: { ...(row.추가정보 || {}), [c.label]: val } });
    if (c.field === "차량번호") {
      const d = val ? drivers.find((x) => normPlate(x.차량번호) === normPlate(val)) : null;
      return onPatch({ 차량번호: val, ...(d ? { 이름: d.이름 || "", 전화번호: d.전화번호 || "" } : !val ? { 이름: "", 전화번호: "" } : {}),
        ...(val && (row.배차상태 === "배차중" || !row.배차상태) ? { 배차상태: "배차완료" } : !val && row.배차상태 === "배차완료" ? { 배차상태: "배차중" } : {}) });
    }
    if (TIME_FIELDS.has(c.field)) return onPatch({ [c.field]: parseHM(val) ? korTime(parseHM(val)) : val });
    if (MONEY_FIELDS.has(c.field)) { const n = toInt(val); const p = { [c.field]: n ? String(n) : "" }; const sale = c.field === "청구운임" ? n : toInt(row.청구운임); const drv = c.field === "기사운임" ? n : toInt(row.기사운임); return onPatch({ ...p, 수수료: String(sale - drv), ...(c.field === "청구운임" ? { 운임수동: !!n } : {}) }); } // 청구운임을 직접 고치면 단가표 자동 계산 멈춤(비우면 다시 자동)
    return onPatch({ [c.field]: val });
  };
  const has = (f) => cols.some((c) => c.kind === "field" && c.field === f);
  const money = (f) => (
    <td key={f} className={td} title={f === "청구운임" && row.단가표지역 ? `단가표 ${row.단가표지역} · 파렛당 ${Number(row.파렛단가 || 0).toLocaleString()}원${row.운임수동 ? " (직접 입력 — 자동 계산 멈춤)" : ""}` : f === "청구운임" && row.운임수동 ? "직접 입력한 운임(단가표 자동 계산 멈춤) — 비우면 다시 자동" : undefined}>
      <Cell value={toInt(row[f]) ? toInt(row[f]).toLocaleString() : ""} numeric disabled={disabled} onCommit={(v) => commit({ kind: "field", field: f }, v)} />
      {f === "청구운임" && row.단가표지역 && !row.운임수동 && <div className="text-[10px] font-bold text-[#4B6CB7] -mt-0.5">단가표</div>}
      {f === "청구운임" && row.운임수동 && <div className="text-[10px] font-bold text-[#B54708] -mt-0.5">직접 입력</div>}
    </td>
  );
  const st = row.배차상태 || "배차중";
  return (
    <>
      <td className={`${td} tabular-nums text-[13px] font-bold text-[#3A4A66]`} style={{ fontFamily: MONO }}>{String(row.상차일 || "").slice(5).replace("-", ".")}</td>
      <td className={`${td} text-[13px] font-black text-[#1B2B4B]`}>{row.배차표묶음 || row.상차지명 || "-"}</td>
      {cols.map((c) => {
        const own = ownerOf(c);
        const v = valueOf(c, row);
        const isQty = c.kind === "qty";
        const bg = isQty ? (v ? "bg-[#FFF8DB]" : "bg-[#FFFCEF]") : own === "운송사" ? "bg-[#F3F7FF]" : "";
        if (c.kind === "sum") return <td key={c.id} className={`${td} font-black text-[14px] text-[#0F1A30] tabular-nums bg-[#FFF3B0]`} style={{ fontFamily: MONO }}>{v}</td>;
        if (c.kind === "field" && c.field === "차량번호" && !v) {
          return <td key={c.id} className={`${td} ${bg}`}><Cell value="" disabled={disabled} placeholder="미배차" onCommit={(x) => commit(c, x)} title="차량번호 입력" /></td>;
        }
        return (
          <td key={c.id} className={`${td} ${bg}`} title={own === "화주" ? "업체(화주)가 시트에 입력하는 칸" : own === "운송사" ? "운송사가 입력하는 칸" : ""}>
            <Cell value={v} disabled={disabled} numeric={isQty || (c.kind === "field" && MONEY_FIELDS.has(c.field))} wide={c.kind === "field" && ["하차지명", "하차지주소", "메모"].includes(c.field)}
              strong={c.kind === "field" && c.field === "하차지명"} onCommit={(x) => commit(c, x)} />
          </td>
        );
      })}
      <td className={td}>
        <span className={`inline-flex items-center h-7 px-2.5 rounded-lg text-[12px] font-black ${st === "배차완료" ? "bg-[#1B2B4B] text-white" : st === "배차취소" ? "bg-red-50 text-red-600 border border-red-200" : "bg-white text-[#B54708] border border-[#F7C97A]"}`}>{st}</span>
        {row.시트삭제됨 && <div className="mt-0.5 text-[10.5px] font-black text-red-600">시트에서 삭제됨</div>}
      </td>
      {!has("청구운임") && money("청구운임")}
      {!has("기사운임") && money("기사운임")}
      <td className={`${td} text-[13.5px] font-black tabular-nums ${toInt(row.청구운임) - toInt(row.기사운임) < 0 ? "text-red-600" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{(toInt(row.청구운임) - toInt(row.기사운임)).toLocaleString()}</td>
    </>
  );
}

// 머리줄(양식 고르기 · 시트 연동 상태) + 배차현황 화면
export default function FixedRouteStatusHost({ company, dispatchData = [], render }) {
  const [forms, setForms] = React.useState(null);
  const [formId, setFormId] = React.useState(() => { try { return localStorage.getItem("kpFixedStatusForm") || ""; } catch { return ""; } });
  const [sync, setSync] = React.useState({ at: 0, busy: false, err: "", last: null });
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "routeBoards"), where("companyName", "==", company)), (s) => setForms(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))), () => setForms([]));
  }, [company]);
  const form = (forms || []).find((f) => f.id === formId) || (forms || [])[0] || null;
  React.useEffect(() => { try { if (form?.id) localStorage.setItem("kpFixedStatusForm", form.id); } catch { /* 무시 */ } }, [form?.id]);
  const rowsOf = React.useCallback((f) => (dispatchData || []).filter((r) => r.배차표Id === f.id), [dispatchData]);
  const rows = form ? rowsOf(form) : [];
  // 30초마다 시트와 맞춤(화면을 연 동안) — 서버가 새 탭·새 줄·바뀐 칸을 처리
  const runSync = React.useCallback(async (f, quiet = true) => {
    if (!f?.sheetUrl || f.autoSync === false) return;
    setSync((s) => ({ ...s, busy: true }));
    try { const r = await sheetApi({ action: "sync", url: f.sheetUrl, boardId: f.id }); setSync({ at: Date.now(), busy: false, err: "", last: r }); }
    catch (e) { setSync((s) => ({ ...s, busy: false, at: Date.now(), err: quiet ? String(e?.message || e) : (window.alert?.(`시트와 맞추지 못했습니다: ${e?.message || e}`), String(e?.message || e)) })); }
  }, []);
  React.useEffect(() => {
    if (!form?.sheetUrl || form.autoSync === false) return undefined;
    runSync(form);
    const t = setInterval(() => { if (document.visibilityState === "visible") runSync(form); }, 30000);
    return () => clearInterval(t);
  }, [form?.id, form?.sheetUrl, form?.autoSync, runSync]); // eslint-disable-line react-hooks/exhaustive-deps

  if (forms === null) return <div className="py-16 text-center text-[14px] text-[#7A8AA6]">불러오는 중…</div>;
  if (!forms.length) return (
    <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-10 text-center">
      <div className="text-[16px] font-black text-[#0F1A30]">고정노선 배차표 양식이 없습니다</div>
      <div className="text-[13.5px] text-[#7A8AA6] mt-1.5">지입차관리 › 고정노선 › [배차표]에서 화주사 구글시트로 양식을 먼저 만들어 주세요.</div>
    </div>
  );
  const unassigned = rows.filter((r) => !normPlate(r.차량번호) && r.배차상태 !== "배차취소").length;
  return (
    <div className="space-y-3 kp-frs">
      <style>{`.kp-frs-cell{height:34px;padding:0 8px;border-radius:8px;border:1px solid transparent;background:transparent;font-size:13.5px;color:#0F1A30;outline:none;transition:border-color .12s,background .12s}
        .kp-frs-cell:hover{border-color:#DCE3EE;background:#fff}.kp-frs-cell:focus{border-color:#2D4C82;background:#fff;box-shadow:0 0 0 3px rgba(45,76,130,.12)}
        .kp-frs-cell::placeholder{color:#D92D20;font-weight:800;opacity:.75}.kp-frs-cell:disabled{opacity:.6}`}</style>
      <div className="relative overflow-hidden rounded-[22px] px-4 md:px-6 py-4 text-white" style={{ background: "radial-gradient(900px 300px at 90% -20%, rgba(110,149,232,.28), transparent 60%), linear-gradient(120deg,#060C1A 0%,#0F1A30 45%,#1B2B4B 100%)" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/24px 24px" }} />
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.32em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>FIXED ROUTE · LIVE BOARD</div>
            <div className="text-[22px] font-black mt-0.5">고정노선현황</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {forms.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormId(f.id)}
                className={`h-10 px-4 rounded-xl text-[14px] font-black whitespace-nowrap border transition ${form?.id === f.id ? "bg-white text-[#0F1A30] border-white" : "bg-white/[0.06] text-white/80 border-white/15 hover:bg-white/[0.12]"}`}>
                {f.name}<span className={`ml-2 text-[11.5px] tabular-nums ${form?.id === f.id ? "text-[#7A8AA6]" : "text-white/45"}`} style={{ fontFamily: MONO }}>{rowsOf(f).length}</span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[13px] font-black border ${unassigned ? "bg-[#F7B955]/15 border-[#F7B955]/50 text-[#FCD9A0]" : "bg-white/[0.06] border-white/15 text-white/70"}`}>
              미배차 <span className="text-[17px] tabular-nums" style={{ fontFamily: MONO }}>{unassigned}</span>
            </span>
            {form?.sheetUrl ? (
              <button type="button" onClick={() => runSync(form, false)} disabled={sync.busy} title="지금 시트와 맞추기"
                className="h-10 px-3.5 rounded-xl inline-flex items-center gap-2 text-[12.5px] font-bold bg-white/[0.06] border border-white/15 text-white/85 hover:bg-white/[0.12] disabled:opacity-60">
                <span className={`w-2 h-2 rounded-full ${sync.err ? "bg-[#FF8A7A]" : form.autoSync === false ? "bg-white/40" : "bg-[#4ADE80] shadow-[0_0_8px_#4ADE80]"} ${sync.busy ? "animate-pulse" : ""}`} />
                {sync.busy ? "시트와 맞추는 중…" : sync.err ? "시트 연동 오류 · 다시" : form.autoSync === false ? "자동 연동 꺼짐 · 지금 맞추기" : `시트 실시간 연동 · ${sync.at ? new Date(sync.at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "확인 중"}`}
              </button>
            ) : <span className="text-[12.5px] text-white/55">시트 주소가 없는 양식입니다</span>}
          </div>
        </div>
        {sync.err && <div className="relative mt-2 text-[12.5px] text-[#FFB4A8]">{sync.err}</div>}
        <div className="relative mt-2 flex items-center gap-3 flex-wrap text-[11.5px] text-white/55">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#FFF8DB]" />리터·파레트 수량</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#F3F7FF]" />운송사 입력 칸</span>
          <span>칸을 눌러 바로 고치면 저장 → 30초 안에 시트에도 반영 · 시트에서 고친 내용도 30초마다 들어옵니다</span>
        </div>
      </div>
      {form && render(form, rows)}
    </div>
  );
}
