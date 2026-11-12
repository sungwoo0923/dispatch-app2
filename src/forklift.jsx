// ======================= src/forklift.jsx =======================
// 🏗 2026-11-09 지게차비용 — 화면 조각(계산은 src/forkliftCore.js)
//  · ForkliftDriverManager  기사관리 › 지게차 기사 (등록·수정·삭제·검색·대용량 업로드)
//  · ForkliftFeeRow         오더 등록·수정 화면의 [+ 지게차] 칩 → 금액 · 지게차 기사 · 부담 방식 한 줄 + 요약
//                           같은 거래처·상차지로 예전에 넣은 지게차 값이 있으면 "이 상차지는 지게차 …" 제안 칩
//  · ForkliftChip           표(실시간·배차현황)의 기사운임 옆 작은 표시
//  · ForkliftPayouts        정산관리 › 지게차 지급 (지게차 기사별 합계 · 지급완료 · 엑셀)
//  저장: forkliftDrivers/{id} · forkliftPresets/{회사__거래처__상차지} — 회사명은 fsTenant가 붙이고 거른다
import React from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { getTenant } from "./fsTenant";
import BankAccountInput from "./BankAccountInput";
import BulkUploadChooser, { downloadTemplateXlsx } from "./BulkUploadChooser";
import { fmtPhone } from "./formatInput";
import { kpAlert, kpConfirm } from "./kpDialog";
import { MonthPicker } from "./kpInputs";
import { bumpForkliftPayout } from "./ledgerAuto"; // 지급완료 → 수입·지출 장부 자동
import { isJyCompany } from "./jyOnly"; // 🏷 JY로지스틱스 전용(특수운임 "지급 없음")
import {
  FORKLIFT_MODES, FORKLIFT_UPLOAD_COLS, fkAmount, fkMode, fkModeLabel, fkPresetKey, forkliftApply, forkliftClear,
  forkliftPayoutGroups, forkliftRowFromSheet, forkliftSummary, hasForklift,
  SPECIAL_TYPES, SPECIAL_MODES, sfItems, sfMode, sfPayee, sfName, hasSpecial, specialCount, specialTotal, specialLines, specialApplyAll, orderProfit, paidOut, fkNum,
  forkliftTransferRows,
} from "./forkliftCore";

export * from "./forkliftCore";

const COL = "forkliftDrivers";
const PRESET_COL = "forkliftPresets";
const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// ─── 지게차 기사 목록(실시간, 한 번만 구독해서 여러 화면이 같이 쓴다) ───
let cache = null; const subs = new Set(); let unsub = null;
function ensureSub() {
  if (unsub) return;
  try {
    unsub = onSnapshot(collection(db, COL), (s) => {
      cache = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.이름 || "").localeCompare(String(b.이름 || ""), "ko"));
      subs.forEach((f) => f(cache));
    }, () => { cache = cache || []; subs.forEach((f) => f(cache)); });
  } catch { cache = []; }
}
export function useForkliftDrivers() {
  const [list, setList] = React.useState(cache || []);
  React.useEffect(() => {
    subs.add(setList); ensureSub(); if (cache) setList(cache);
    return () => { subs.delete(setList); if (!subs.size && unsub) { unsub(); unsub = null; cache = null; } };
  }, []);
  return list;
}
const cleanDriver = (f) => ({
  이름: String(f.이름 || "").trim(), 전화번호: String(f.전화번호 || "").replace(/\D/g, ""), 지게차회사: String(f.지게차회사 || "").trim(),
  은행: String(f.은행 || "").trim(), 계좌번호: String(f.계좌번호 || "").trim(), 예금주: String(f.예금주 || "").trim(),
  메모: String(f.메모 || "").trim(), 사용: f.사용 !== false,
});
export async function saveForkliftDriver(f, id) {
  const data = { ...cleanDriver(f), updatedAt: serverTimestamp() };
  if (!data.이름) throw new Error("이름을 입력해 주세요");
  if (id) { await setDoc(doc(db, COL, id), data, { merge: true }); return id; }
  const r = await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() });
  return r.id;
}

// ─── 기사관리 › 지게차 기사 ───
export function ForkliftDriverManager({ isViewer = false }) {
  const list = useForkliftDrivers();
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null); // { id?, ...fields }
  const [chooser, setChooser] = React.useState(false);
  const [preview, setPreview] = React.useState(null); // [{ row, errors, dup }]
  const [busy, setBusy] = React.useState(false);
  const rows = list.filter((d) => !q.trim() || [d.이름, d.전화번호, d.지게차회사, d.예금주].some((v) => String(v || "").includes(q.trim().replace(/-/g, ""))) || String(d.이름 || "").includes(q.trim()));
  const del = async (d) => {
    if (isViewer) return;
    if (!(await kpConfirm(`지게차 기사 '${d.이름}'을(를) 삭제할까요?\n이미 저장된 오더의 지게차 기록은 그대로 남습니다.`))) return;
    try { await deleteDoc(doc(db, COL, d.id)); } catch (e) { kpAlert(`삭제 실패: ${e.message}`); }
  };
  const onTemplate = () => downloadTemplateXlsx(XLSX, "지게차기사_대용량업로드_양식.xlsx", "지게차기사", FORKLIFT_UPLOAD_COLS,
    [["김지게", "010-1234-5678", "경동지게차", "KB국민", "123456-01-123456", "김지게", "경동 상차 전담"], ["박리프트", "01098765432", "인천리프트", "신한", "110-123-456789", "박리프트", ""]],
    [["이름", "필수"], ["전화번호", "하이픈 있어도 됨"], ["지게차회사", "소속 업체(없으면 비움)"], ["은행", "KB국민·신한·우리·하나·NH농협 등 (은행명 열도 인식)"], ["계좌번호", "숫자·하이픈"], ["예금주", "지급 받는 사람"], ["메모", "자유"]]);
  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const out = json.map(forkliftRowFromSheet).filter((r) => Object.values(r.row).some(Boolean))
        .map((r) => ({ ...r, dup: list.find((d) => d.이름 === r.row.이름 && (!r.row.전화번호 || String(d.전화번호 || "") === r.row.전화번호)) || null }));
      setChooser(false); setPreview(out);
    } catch (err) { kpAlert(`엑셀을 읽지 못했어요: ${err.message}`); }
  };
  const commit = async () => {
    const ok = (preview || []).filter((r) => !r.errors.length);
    if (!ok.length) return;
    setBusy(true);
    try {
      for (let i = 0; i < ok.length; i += 400) {
        const b = writeBatch(db);
        ok.slice(i, i + 400).forEach((r) => {
          const ref = r.dup ? doc(db, COL, r.dup.id) : doc(collection(db, COL));
          b.set(ref, { ...cleanDriver(r.row), updatedAt: serverTimestamp(), ...(r.dup ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
        });
        await b.commit();
      }
      setPreview(null); kpAlert(`지게차 기사 ${ok.length}명을 저장했습니다.`);
    } catch (e) { kpAlert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const th = "px-3 py-2.5 text-center font-extrabold whitespace-nowrap";
  const td = "px-3 py-2 text-center whitespace-nowrap";
  return (
    <div className="space-y-3" data-forklift-manager>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>FORKLIFT DRIVERS</div>
          <div className="text-[16px] font-black text-[#0F1A30]">지게차 기사 <span className="text-[13px] text-[#7A89A3] font-bold">{list.length}명</span></div>
          <div className="text-[12px] text-[#7A89A3]">오더의 지게차비용을 받는 기사 — 오더등록 [+ 지게차]에서 고르고, 정산관리 › 지게차 지급에서 지급합니다</div>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·전화·회사 검색" className="h-9 w-52 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold" />
        {!isViewer && <button type="button" onClick={() => setChooser(true)} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] hover:border-[#4B6CB7]">대용량 업로드</button>}
        {!isViewer && <button type="button" onClick={() => setEdit({ 사용: true })} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">+ 지게차 기사</button>}
      </div>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-x-auto">
        <table className="w-full text-[13.5px]" style={{ minWidth: 900 }}>
          <thead><tr className="bg-[#1B2B4B] text-white">{["이름", "전화번호", "지게차회사", "은행", "계좌번호", "예금주", "메모", "사용", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="py-14 text-center text-[#9AA9C3]">{list.length ? "검색 결과가 없습니다" : "등록된 지게차 기사가 없습니다 — [+ 지게차 기사] 또는 [대용량 업로드]로 등록하세요"}</td></tr>}
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-[#EEF1F6] hover:bg-[#F7F9FC]">
                <td className={`${td} font-black text-[#0F1A30]`}>{d.이름}</td>
                <td className={`${td} tabular-nums`}>{fmtPhone(d.전화번호)}</td>
                <td className={td}>{d.지게차회사 || "-"}</td>
                <td className={td}>{d.은행 || "-"}</td>
                <td className={`${td} tabular-nums`}>{d.계좌번호 || "-"}</td>
                <td className={td}>{d.예금주 || "-"}</td>
                <td className={`${td} max-w-[220px] truncate text-left`}>{d.메모 || ""}</td>
                <td className={td}>{d.사용 === false ? <span className="text-[#9AA9C3] font-bold">안 씀</span> : <span className="font-bold text-[#1B2B4B]">사용</span>}</td>
                <td className={td}>{!isViewer && <span className="inline-flex gap-1"><button type="button" onClick={() => setEdit({ ...d })} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black">수정</button><button type="button" onClick={() => del(d)} className="h-8 px-2.5 rounded-lg border border-[#F0D3D3] text-[12px] font-black text-[#B4342A]">삭제</button></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <ForkliftDriverModal value={edit} onClose={() => setEdit(null)} />}
      {chooser && <BulkUploadChooser onClose={() => setChooser(false)} onTemplate={onTemplate} onFile={onFile}
        title="지게차 기사 대용량 업로드" subtitle="엑셀로 지게차 기사를 한꺼번에 등록합니다. 처음이면 양식부터 받아 주세요."
        templateDesc="이름·전화번호·지게차회사·은행·계좌번호·예금주·메모 열과 예시 2줄이 들어 있습니다." templateTips={["전화번호 하이픈 있어도 됨", "같은 이름+전화번호는 고쳐서 저장"]}
        uploadDesc="작성한 양식(.xlsx)을 고르면 줄마다 확인 결과를 먼저 보여드리고, 확인 후 저장합니다." uploadTips={["빈 줄은 자동으로 건너뜀", "오류 줄은 빼고 저장"]} />}
      {preview && (
        <div className="fixed inset-0 z-[100050] bg-[#0B1428]/60 flex items-center justify-center p-4">
          <div className="w-full max-w-[920px] max-h-[86vh] flex flex-col rounded-[22px] bg-white overflow-hidden shadow-2xl">
            <div className="px-5 py-4 bg-[#0F1A30] text-white flex items-center gap-3">
              <div className="mr-auto"><div className="text-[10.5px] tracking-[0.22em] font-extrabold text-[#8FB0F0]">UPLOAD PREVIEW</div><div className="text-[17px] font-black">지게차 기사 {preview.length}줄 확인</div></div>
              <span className="text-[12.5px] font-bold text-white/70">저장 {preview.filter((r) => !r.errors.length).length} · 오류 {preview.filter((r) => r.errors.length).length} · 기존 수정 {preview.filter((r) => r.dup && !r.errors.length).length}</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-[13px]"><thead><tr className="bg-[#F1F4F9] text-[#3A4A66]">{["상태", ...FORKLIFT_UPLOAD_COLS].map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{preview.map((r, i) => (
                  <tr key={i} className={`border-t border-[#EEF1F6] ${r.errors.length ? "bg-[#FDF2F2]" : ""}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap font-bold">{r.errors.length ? <span className="text-[#B4342A]">{r.errors.join(", ")}</span> : r.dup ? <span className="text-[#2D4C82]">기존 수정</span> : <span className="text-[#1B2B4B]">새로 등록</span>}</td>
                    {FORKLIFT_UPLOAD_COLS.map((k) => <td key={k} className="px-3 py-1.5 whitespace-nowrap">{k === "전화번호" ? fmtPhone(r.row[k]) : r.row[k === "은행" ? "은행" : k]}</td>)}
                  </tr>))}</tbody></table>
            </div>
            <div className="px-5 py-3 border-t border-[#EEF1F6] flex justify-end gap-2">
              <button type="button" onClick={() => setPreview(null)} className="h-10 px-4 rounded-xl border border-[#DCE3EE] font-black text-[13.5px]">취소</button>
              <button type="button" disabled={busy || !preview.some((r) => !r.errors.length)} onClick={commit} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white font-black text-[13.5px] disabled:opacity-40">{busy ? "저장 중…" : `${preview.filter((r) => !r.errors.length).length}명 저장`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ForkliftDriverModal({ value, onClose, onSaved }) {
  const [f, setF] = React.useState(() => ({ 사용: true, ...value }));
  const [busy, setBusy] = React.useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try { const id = await saveForkliftDriver(f, f.id); onSaved?.({ ...cleanDriver(f), id }); onClose(); }
    catch (e) { kpAlert(e.message); } finally { setBusy(false); }
  };
  const lbl = "text-[12px] font-extrabold text-[#5B6B85] mb-1";
  return (
    <div className="fixed inset-0 z-[100060] bg-[#0B1428]/60 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[560px] rounded-[22px] bg-white overflow-hidden shadow-2xl">
        <div className="px-5 py-4 bg-[#0F1A30] text-white"><div className="text-[10.5px] tracking-[0.22em] font-extrabold text-[#8FB0F0]">FORKLIFT DRIVER</div><div className="text-[17px] font-black">{f.id ? "지게차 기사 수정" : "지게차 기사 등록"}</div></div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <div><div className={lbl}>이름 *</div><input className={inp} value={f.이름 || ""} onChange={(e) => set({ 이름: e.target.value })} autoFocus /></div>
          <div><div className={lbl}>전화번호</div><input className={inp} inputMode="tel" value={fmtPhone(f.전화번호 || "")} onChange={(e) => set({ 전화번호: e.target.value.replace(/\D/g, "") })} /></div>
          <div className="col-span-2"><div className={lbl}>지게차회사</div><input className={inp} value={f.지게차회사 || ""} onChange={(e) => set({ 지게차회사: e.target.value })} placeholder="소속 업체(없으면 비움)" /></div>
          <div className="col-span-2"><div className={lbl}>지급 계좌</div>
            <BankAccountInput noFav value={{ bank: f.은행 || "", acct: f.계좌번호 || "", holder: f.예금주 || "" }} onChange={(v) => set({ 은행: v.bank, 계좌번호: v.acct, 예금주: v.holder })} />
          </div>
          <div className="col-span-2"><div className={lbl}>메모</div><input className={inp} value={f.메모 || ""} onChange={(e) => set({ 메모: e.target.value })} /></div>
          <label className="col-span-2 inline-flex items-center gap-2 text-[13px] font-bold text-[#1B2B4B]"><input type="checkbox" checked={f.사용 !== false} onChange={(e) => set({ 사용: e.target.checked })} />사용(오더에서 고를 수 있음)</label>
        </div>
        <div className="px-5 py-3 border-t border-[#EEF1F6] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#DCE3EE] font-black text-[13.5px]">취소</button>
          <button type="button" disabled={busy} onClick={save} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white font-black text-[13.5px] disabled:opacity-40">{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 지게차 기사 고르기(검색 · 바로 추가) ───
function ForkliftPicker({ value, name, onPick, disabled }) {
  const list = useForkliftDrivers();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [adding, setAdding] = React.useState(null);
  const box = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = list.find((d) => d.id === value);
  const shown = list.filter((d) => d.사용 !== false || d.id === value).filter((d) => !q.trim() || `${d.이름} ${d.전화번호} ${d.지게차회사}`.includes(q.trim()));
  return (
    <div className="relative min-w-0" ref={box}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="h-9 w-full min-w-[150px] px-2.5 rounded-lg border border-[#C9D5EA] bg-white text-left text-[13px] font-bold text-[#0F1A30] flex items-center gap-1.5">
        <span className="truncate flex-1">{cur ? `${cur.이름}${cur.지게차회사 ? ` · ${cur.지게차회사}` : ""}` : name || <span className="text-[#9AA9C3]">지게차 기사 선택</span>}</span>
        <span className="text-[#7A89A3]">▾</span>
      </button>
      {open && (
        <div className="absolute z-[100030] mt-1 w-[280px] rounded-xl bg-white border border-[#DCE3EE] shadow-[0_18px_40px_rgba(15,26,48,0.18)] p-1.5">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·전화·회사 검색" className="h-9 w-full px-2.5 rounded-lg border border-[#E3E8F0] text-[13px] mb-1" />
          <div className="max-h-[220px] overflow-y-auto">
            <button type="button" onClick={() => { onPick({ id: "", 이름: "", 전화번호: "", 지게차회사: "" }); setOpen(false); setQ(""); }} className={`w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#EEF3FC] text-[13px] font-bold text-[#7A89A3] ${!value && !name ? "bg-[#EEF3FC]" : ""}`}>선택 안 함 · 나중에 정하기</button>
            {shown.length === 0 && <div className="py-4 text-center text-[12.5px] text-[#9AA9C3]">{list.length ? "검색 결과 없음" : "등록된 지게차 기사가 없습니다"}</div>}
            {shown.map((d) => (
              <button key={d.id} type="button" onClick={() => { onPick(d); setOpen(false); setQ(""); }} className={`w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#EEF3FC] ${d.id === value ? "bg-[#EEF3FC]" : ""}`}>
                <div className="text-[13.5px] font-black text-[#0F1A30]">{d.이름} <span className="text-[12px] font-bold text-[#7A89A3]">{d.지게차회사 || ""}</span></div>
                <div className="text-[11.5px] text-[#7A89A3] tabular-nums">{fmtPhone(d.전화번호)}{d.은행 ? ` · ${d.은행}` : ""}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setAdding({ 이름: q.trim(), 사용: true }); setOpen(false); }} className="mt-1 w-full h-9 rounded-lg border border-dashed border-[#9AA9C3] text-[12.5px] font-black text-[#1B2B4B] hover:border-[#4B6CB7]">+ 새 지게차 기사</button>
        </div>
      )}
      {adding && <ForkliftDriverModal value={adding} onClose={() => setAdding(null)} onSaved={(d) => onPick(d)} />}
    </div>
  );
}

// ─── 상차지 기억(거래처 + 상차지 → 지게차 기본값) ───
const presetId = (o) => { const k = fkPresetKey(o); const co = String(getTenant() || "").replace(/[/#?[\]\s]/g, "_"); return k ? `${co || "_"}__${k}` : ""; };
function useForkliftPreset(form) {
  const id = presetId(form);
  const [p, setP] = React.useState(null);
  React.useEffect(() => {
    setP(null);
    if (!id) return undefined;
    let alive = true;
    const t = setTimeout(() => { getDoc(doc(db, PRESET_COL, id)).then((s) => { if (alive) setP(s.exists() ? s.data() : null); }).catch(() => {}); }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [id]);
  return [p, id];
}
export function rememberForkliftPreset(form) {
  const id = presetId(form);
  if (!id || !hasForklift(form)) return Promise.resolve();
  return setDoc(doc(db, PRESET_COL, id), {
    거래처명: form.거래처명 || "", 상차지명: form.상차지명 || "", 지게차비용: fkAmount(form), 지게차부담: fkMode(form),
    지게차기사ID: form.지게차기사ID || "", 지게차기사명: form.지게차기사명 || "", 지게차기사전화: form.지게차기사전화 || "", 지게차회사: form.지게차회사 || "", updatedAt: serverTimestamp(),
  }, { merge: true }).catch(() => {});
}

// ─── 오더 화면의 [+ 지게차] ───
//  form: 오더 값 · setForm: (updater) => void  (React setState 와 같은 모양)
//  asString: 운임 칸을 문자열로 다루는 화면이면 true(기본)
//  part: "chip" = 꺼져 있을 때의 [+ 지게차]·제안 칩만 · "row" = 켜져 있을 때의 입력 줄만 · 비우면 둘 다(자리에 맞게)
export function ForkliftFeeRow({ form, setForm, asString = true, disabled = false, compact = false, className = "", part }) {
  const on = hasForklift(form) || !!form?.지게차부담;
  const [preset] = useForkliftPreset(on ? {} : form);
  const [remember, setRemember] = React.useState(true);
  const lastSaved = React.useRef("");
  const apply = (patch, key = "__forklift") => setForm((p) => {
    const next = forkliftApply(p, { ...p, ...patch }, key, { asString });
    return next;
  });
  // 기억 갱신(값이 바뀌고 1.2초 뒤)
  React.useEffect(() => {
    if (!remember || !hasForklift(form) || disabled) return undefined;
    const sig = `${presetId(form)}|${fkAmount(form)}|${fkMode(form)}|${form.지게차기사ID || ""}`;
    if (sig === lastSaved.current) return undefined;
    const t = setTimeout(() => { lastSaved.current = sig; rememberForkliftPreset(form); }, 1200);
    return () => clearTimeout(t);
  }, [remember, form?.지게차비용, form?.지게차부담, form?.지게차기사ID, form?.상차지명, form?.거래처명, disabled]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!form) return null;
  if (part === "row" && !on) return null;
  if (part === "chip" && on) return null;
  if (!on) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`} data-forklift="off">
        <button type="button" disabled={disabled} onClick={() => setForm((p) => ({ ...p, 지게차부담: p.지게차부담 || "기사" }))}
          className="h-7 px-2.5 rounded-full border border-dashed border-[#9AA9C3] text-[12px] font-black text-[#1B2B4B] hover:border-[#4B6CB7] hover:bg-[#F2F6FC] disabled:opacity-40">+ 지게차</button>
        {preset && fkAmount(preset) > 0 && !disabled && (
          <button type="button" onClick={() => apply({ 지게차비용: String(fkAmount(preset)), 지게차부담: fkMode(preset), 지게차기사ID: preset.지게차기사ID || "", 지게차기사명: preset.지게차기사명 || "", 지게차기사전화: preset.지게차기사전화 || "", 지게차회사: preset.지게차회사 || "" })}
            className="h-7 px-2.5 rounded-full bg-[#0F1A30] text-white text-[12px] font-bold inline-flex items-center gap-1.5" title="같은 거래처·상차지로 예전에 넣은 지게차 값">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0] animate-pulse" />이 상차지는 지게차 {won(fkAmount(preset))}{preset.지게차기사명 ? ` · ${preset.지게차기사명}` : ""} <b className="text-[#8FB0F0]">[적용]</b>
          </button>
        )}
      </div>
    );
  }
  const mode = fkMode(form);
  return (
    <div className={`rounded-xl border border-[#C9D5EA] bg-[#F7F9FD] px-2.5 py-2 ${className}`} data-forklift="on">
      <div className={`flex ${compact ? "flex-col items-stretch" : "flex-wrap items-center"} gap-2`}>
        <span className="text-[11px] font-extrabold tracking-[0.14em] text-[#4B6CB7] shrink-0" style={{ fontFamily: MONO }}>FORKLIFT</span>
        <div className="relative shrink-0">
          <input inputMode="numeric" disabled={disabled} value={fkAmount(form) ? won(fkAmount(form)) : String(form.지게차비용 || "").replace(/[^\d]/g, "")} placeholder="지게차비용"
            onChange={(e) => apply({ 지게차비용: e.target.value.replace(/[^\d]/g, ""), 지게차부담: mode }, "지게차비용")}
            className="h-9 w-[130px] pl-2.5 pr-7 rounded-lg border border-[#C9D5EA] bg-white text-right text-[14px] font-black tabular-nums text-[#0F1A30] outline-none focus:border-[#2D4C82]" />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-bold text-[#7A89A3]">원</span>
        </div>
        <ForkliftPicker disabled={disabled} value={form.지게차기사ID || ""} name={form.지게차기사명 || ""}
          onPick={(d) => setForm((p) => ({ ...p, 지게차기사ID: d.id || "", 지게차기사명: d.이름 || "", 지게차기사전화: d.전화번호 || "", 지게차회사: d.지게차회사 || "" }))} />
        <div className="inline-flex rounded-lg border border-[#C9D5EA] bg-white p-0.5 shrink-0">
          {FORKLIFT_MODES.map((m) => (
            <button key={m.key} type="button" disabled={disabled} title={m.label} onClick={() => apply({ 지게차부담: m.key }, "지게차부담")}
              className={`h-8 px-2.5 rounded-md text-[12px] font-black whitespace-nowrap ${mode === m.key ? "bg-[#0F1A30] text-white" : "text-[#5B6B85] hover:bg-[#EEF3FC]"}`}>{m.short}</button>
          ))}
        </div>
        <button type="button" disabled={disabled} onClick={() => setForm((p) => forkliftClear(p, { asString }))} title="지게차 빼기(운임 원래대로)"
          className="h-8 w-8 rounded-lg text-[#7A89A3] hover:bg-[#EEF3FC] shrink-0">✕</button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12px] font-bold text-[#1B2B4B] tabular-nums">{forkliftSummary(form)}</span>
        <label className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-bold text-[#7A89A3]"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />이 거래처·상차지에 기억</label>
      </div>
    </div>
  );
}


// ─── 🧾 2026-11-09 [특수운임 적용] 버튼 + 팝업 ───
//  지게차비용(지게차 기사·부담 방식) + 대기료·수작업·경유·할증·통행료·기타를 한 팝업에서 넣고 [적용]
//  form · setForm(updater) · asString: 예전 ForkliftFeeRow와 같음 · btnClass: 버튼 모양(배차관리 토글 버튼 등) · mobile: 아래에서 올라오는 시트
export function specialBadgeText(o) {
  if (!hasSpecial(o)) return "";
  const n = specialCount(o);
  if (n === 1 && hasForklift(o)) return `지게차 ${won(fkAmount(o))}`;
  if (n === 1) return `${sfName(sfItems(o)[0])} ${won(fkNum(sfItems(o)[0].금액))}`;
  return `${n}건 · ${won(specialTotal(o))}`;
}
export function SpecialFareButton({ form, setForm, asString = true, disabled = false, btnClass, mobile = false, className = "" }) {
  const [open, setOpen] = React.useState(false);
  if (!form) return null;
  const on = hasSpecial(form);
  const cls = (typeof btnClass === "function" ? btnClass(on) : btnClass) || `inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[13px] font-extrabold whitespace-nowrap transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B] shadow-[0_4px_12px_rgba(27,43,75,0.22)]" : "bg-white text-[#5B6B85] border-[#DCE3EE] hover:border-[#2D4C82] hover:text-[#0F1A30]"}`;
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} data-tour="special-fare" data-special-fare={on ? "on" : "off"} aria-pressed={on}
        title={on ? specialLines(form).join("\n") : "지게차비용·대기료·경유·할증 등 특수한 운임을 넣습니다"} className={`${cls} ${className}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3v18M5 8h11a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11" /></svg>
        특수운임{on ? <span className="ml-0.5 px-1.5 h-[18px] inline-flex items-center rounded-md bg-[#E9C46A] text-[#0F1A30] text-[11px] font-black tabular-nums">{specialBadgeText(form)}</span> : " 적용"}
      </button>
      {open && <SpecialFareModal form={form} asString={asString} mobile={mobile} onClose={() => setOpen(false)} onApply={(fn) => { setForm(fn); setOpen(false); }} />}
    </>
  );
}
function SpecialFareModal({ form, asString, mobile, onClose, onApply }) {
  const isMobile = mobile || (typeof window !== "undefined" && window.innerWidth < 768);
  const [fork, setFork] = React.useState(() => ({ 지게차비용: fkAmount(form) || "", 지게차부담: hasForklift(form) ? fkMode(form) : "기사", 지게차기사ID: form.지게차기사ID || "", 지게차기사명: form.지게차기사명 || "", 지게차기사전화: form.지게차기사전화 || "", 지게차회사: form.지게차회사 || "" }));
  const [items, setItems] = React.useState(() => {
    const m = {}; sfItems(form).forEach((it) => { m[it.종류 || "기타"] = { ...it, 금액: fkNum(it.금액) }; }); return m;
  });
  const [sel, setSel] = React.useState(() => (hasForklift(form) || !sfItems(form).length ? "지게차" : (sfItems(form)[0].종류 || "기타")));
  const [remember, setRemember] = React.useState(true);
  const [preset] = useForkliftPreset(form);
  React.useEffect(() => { const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true); }, [onClose]);
  const itemList = Object.values(items).filter((x) => fkNum(x.금액) > 0);
  const draft = { fork: fkNum(fork.지게차비용) > 0 ? fork : null, items: itemList };
  // 미리보기 — 특수운임을 모두 걷어낸 원래 운임 → 적용 후
  const base = specialApplyAll(form, {}, { asString });
  const after = specialApplyAll(form, draft, { asString });
  const amtOf = (k) => (k === "지게차" ? fkNum(fork.지게차비용) : fkNum(items[k]?.금액));
  const t = SPECIAL_TYPES.find((x) => x.key === sel) || SPECIAL_TYPES[0];
  const it = items[sel] || { 종류: sel, 이름: "", 금액: "", 부담: t.mode, 받는사람: t.payee, 메모: "" };
  const setIt = (patch) => setItems((p) => ({ ...p, [sel]: { ...(p[sel] || it), ...patch } }));
  const removeSel = () => {
    if (sel === "지게차") setFork((f) => ({ ...f, 지게차비용: "", 지게차기사ID: "", 지게차기사명: "", 지게차기사전화: "", 지게차회사: "" }));
    else setItems((p) => { const n = { ...p }; delete n[sel]; return n; });
  };
  const apply = () => {
    const res = specialApplyAll(form, draft, { asString });
    if (remember && hasForklift(res)) rememberForkliftPreset(res);
    onApply(() => res);
  };
  const moneyInput = (val, onCh) => (
    <div className="relative">
      <input inputMode="numeric" autoFocus value={fkNum(val) ? won(fkNum(val)) : ""} placeholder="0" onChange={(e) => onCh(e.target.value.replace(/[^\d]/g, ""))}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") apply(); }}
        className="h-12 w-full pl-3 pr-9 rounded-xl border border-[#C9D5EA] bg-white text-right text-[20px] font-black tabular-nums text-[#0F1A30] outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#4B6CB7]/15" style={{ fontFamily: MONO, fontSize: isMobile ? 20 : undefined }} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#7A89A3]">원</span>
    </div>
  );
  const modeSeg = (cur, onPick, allowed) => (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#C9D5EA] bg-white p-1">
      {SPECIAL_MODES.map((m) => {
        const ok = allowed.includes(m.key);
        return (
          <button key={m.key} type="button" disabled={!ok} title={ok ? m.label : "배차 기사에게 주는 돈은 기사운임에서 뺄 수 없습니다"} onClick={() => onPick(m.key)}
            className={`h-10 rounded-lg text-[12.5px] font-black whitespace-nowrap ${cur === m.key ? "bg-[#0F1A30] text-white" : ok ? "text-[#3A4A66] hover:bg-[#EEF3FC]" : "text-[#C3CDDD] cursor-not-allowed"}`}>{m.short}</button>
        );
      })}
    </div>
  );
  const lbl = (txt) => <div className="text-[11.5px] font-extrabold tracking-[0.08em] text-[#5B6B85] mb-1.5">{txt}</div>;
  const c = (n) => won(n);
  const diffRow = (name, a, b) => (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <span className="font-bold text-[#5B6B85]">{name}</span>
      <span className="tabular-nums font-black text-[#0F1A30]" style={{ fontFamily: MONO }}>{a === b ? c(b) : <>{c(a)} <span className="text-[#9AA9C3]">→</span> <span className={b > a ? "text-[#2D4C82]" : "text-[#B4342A]"}>{c(b)}</span></>}</span>
    </div>
  );
  const listCol = (
    <div className={isMobile ? "flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" : "flex flex-col gap-1"}>
      {SPECIAL_TYPES.map((x) => {
        const a = amtOf(x.key); const act = sel === x.key;
        return (
          <button key={x.key} type="button" onClick={() => setSel(x.key)} data-sf-type={x.key}
            className={`${isMobile ? "shrink-0 h-10 px-3" : "w-full px-3 py-2.5"} rounded-xl text-left border transition ${act ? "bg-[#0F1A30] border-[#0F1A30] text-white" : a ? "bg-[#EEF3FC] border-[#C9D5EA] text-[#0F1A30]" : "bg-white border-[#E3E8F0] text-[#3A4A66] hover:border-[#9AA9C3]"}`}>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a ? "bg-[#E9C46A]" : act ? "bg-white/40" : "bg-[#C9D5EA]"}`} />
              <span className="text-[13px] font-black whitespace-nowrap">{x.key === "기타" && items.기타?.이름 ? items.기타.이름 : x.label}</span>
              {!isMobile && a > 0 && <span className={`ml-auto text-[12px] font-black tabular-nums ${act ? "text-[#E9C46A]" : "text-[#2D4C82]"}`}>{c(a)}</span>}
            </div>
            {!isMobile && <div className={`mt-0.5 pl-3.5 text-[11px] font-semibold ${act ? "text-white/55" : "text-[#9AA9C3]"}`}>{x.desc}</div>}
          </button>
        );
      })}
    </div>
  );
  const editor = sel === "지게차" ? (
    <div className="space-y-4">
      {preset && fkAmount(preset) > 0 && !fkNum(fork.지게차비용) && (
        <button type="button" onClick={() => setFork({ 지게차비용: fkAmount(preset), 지게차부담: fkMode(preset), 지게차기사ID: preset.지게차기사ID || "", 지게차기사명: preset.지게차기사명 || "", 지게차기사전화: preset.지게차기사전화 || "", 지게차회사: preset.지게차회사 || "" })}
          className="w-full rounded-xl bg-[#0F1A30] text-white px-3 py-2.5 text-[12.5px] font-bold flex items-center gap-2 text-left">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8FB0F0] animate-pulse shrink-0" /><span className="flex-1">이 상차지는 지게차 {c(fkAmount(preset))}{preset.지게차기사명 ? ` · ${preset.지게차기사명}` : ""}</span><b className="text-[#8FB0F0]">[불러오기]</b>
        </button>
      )}
      <div>{lbl("지게차비용")}{moneyInput(fork.지게차비용, (v) => setFork((f) => ({ ...f, 지게차비용: v })))}</div>
      <div>{lbl("지게차 기사 (비워 둬도 됩니다)")}<ForkliftPicker value={fork.지게차기사ID || ""} name={fork.지게차기사명 || ""} onPick={(d) => setFork((f) => ({ ...f, 지게차기사ID: d.id || "", 지게차기사명: d.이름 || "", 지게차기사전화: d.전화번호 || "", 지게차회사: d.지게차회사 || "" }))} /></div>
      <div>{lbl("누가 부담하나요")}{modeSeg(fkMode(fork), (k) => setFork((f) => ({ ...f, 지게차부담: k })), ["기사", "회사", "청구"])}</div>
      <label className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#7A89A3]"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />이 거래처·상차지에 기억(다음에 [불러오기])</label>
    </div>
  ) : (
    <div className="space-y-4">
      {sel === "기타" && <div>{lbl("항목 이름")}<input value={it.이름 || ""} onChange={(e) => setIt({ 이름: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder="예: 상차 보조비" className={inp} /></div>}
      <div>{lbl(sel === "기타" ? "금액" : t.label)}{moneyInput(it.금액, (v) => setIt({ 금액: v }))}</div>
      <div>{lbl("누가 받나요")}
        <div className={`grid ${isJyCompany() || sfPayee(it) === "없음" ? "grid-cols-3" : "grid-cols-2"} gap-1 rounded-xl border border-[#C9D5EA] bg-white p-1`}>
          {[["기사", "배차 기사에게 더 줌"], ["외부", "회사가 따로 지급"], ["없음", "지급 없음(청구만)"]].filter(([k]) => k !== "없음" || isJyCompany() || sfPayee(it) === "없음" /* 🏷 JY로지스틱스만(이미 그렇게 저장된 항목은 보이게) */).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setIt({ 받는사람: k, 부담: sfMode({ ...it, 받는사람: k }) })}
              className={`h-10 rounded-lg text-[12.5px] font-black ${sfPayee(it) === k ? "bg-[#0F1A30] text-white" : "text-[#3A4A66] hover:bg-[#EEF3FC]"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>{lbl("누가 부담하나요")}{modeSeg(sfMode(it), (k) => setIt({ 부담: k }), sfPayee(it) === "없음" ? ["청구"] : sfPayee(it) === "기사" ? ["회사", "청구"] : ["기사", "회사", "청구"])}</div>
      <div>{lbl("메모 (선택)")}<input value={it.메모 || ""} onChange={(e) => setIt({ 메모: e.target.value })} onKeyDown={(e) => e.stopPropagation()} placeholder={sfPayee(it) === "외부" ? "받는 곳·사람" : "사유"} className={inp} /></div>
    </div>
  );
  const n = (draft.fork ? 1 : 0) + itemList.length;
  const body = (
    <div className={`fixed inset-0 z-[100060] bg-[#0B1428]/55 backdrop-blur-[2px] flex ${isMobile ? "items-end" : "items-center justify-center p-4"}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-special-modal="1">
      <div className={`bg-[#F4F6FA] shadow-[0_30px_80px_rgba(0,0,0,0.45)] overflow-hidden flex flex-col ${isMobile ? "w-full max-h-[92vh] rounded-t-[24px]" : "w-full max-w-[860px] max-h-[90vh] rounded-[22px]"}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative px-5 py-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          {isMobile && <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-white/30" />}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>SPECIAL FARE</div>
              <div className="text-[18px] font-black mt-0.5">특수운임 적용</div>
              <div className="text-[12px] text-white/60 mt-0.5 truncate">{[form.거래처명, form.상차지명 && `${form.상차지명} → ${form.하차지명 || ""}`].filter(Boolean).join(" · ") || "이 오더"}</div>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold hover:bg-white/20">닫기 ✕</button>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto ${isMobile ? "p-4 space-y-4" : "p-5 grid grid-cols-[230px_1fr] gap-5"}`}>
          {listCol}
          <div className="rounded-[18px] bg-white border border-[#E3E8F0] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-black text-[#0F1A30]">{sel === "기타" && it.이름 ? it.이름 : t.label}</div>
              {amtOf(sel) > 0 && <button type="button" onClick={removeSel} className="h-8 px-2.5 rounded-lg border border-[#E3E8F0] text-[12px] font-black text-[#B4342A] hover:bg-[#FDECEC]">빼기</button>}
            </div>
            <div key={sel}>{editor}</div>
          </div>
        </div>
        <div className="border-t border-[#E3E8F0] bg-white px-5 py-3.5" style={isMobile ? { paddingBottom: "max(14px, env(safe-area-inset-bottom))" } : undefined}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-1 mb-2.5" data-sf-preview="1">
            {diffRow("청구운임", fkNum(base.청구운임), fkNum(after.청구운임))}
            {diffRow("기사운임", fkNum(base.기사운임), fkNum(after.기사운임))}
            {diffRow("수익", orderProfit(base), orderProfit(after))}
          </div>
          {paidOut(after) > 0 && <div className="text-[11.5px] font-bold text-[#7A89A3] mb-2">회사가 따로 지급 {c(paidOut(after))}원{hasForklift(after) ? ` (지게차 ${c(fkAmount(after))}${after.지게차기사명 ? ` · ${after.지게차기사명}` : ""})` : ""}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[14px] font-black text-[#3A4A66] hover:bg-[#F4F6FA]">취소</button>
            <button type="button" onClick={apply} data-sf-apply="1" className="flex-[2] h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B]">{n ? `적용 · ${n}건` : "적용(특수운임 없음)"}</button>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}

// 표 칸 옆 작은 표시
export function ForkliftChip({ row, className = "" }) {
  if (!hasSpecial(row)) return null;
  const only = specialCount(row) === 1 && hasForklift(row);
  return (
    <span className={`inline-flex items-center px-1.5 h-[18px] rounded-md bg-[#1B2B4B] text-[#E9C46A] text-[10.5px] font-black tabular-nums whitespace-nowrap align-middle ${className}`}
      title={specialLines(row).join("\n") + (hasForklift(row) && row.지게차지급완료 ? "\n지게차 지급완료" : "")}>{only ? "지게차" : `특수 ${specialCount(row)}`}</span>
  );
}
// 엑셀 내보내기 공용 열
export const forkliftExcelCols = (r) => ({ 특수운임: specialLines(r).join(" / "), 지게차비용: fkAmount(r) || "", 지게차기사: r?.지게차기사명 || "", 지게차부담: hasForklift(r) ? fkModeLabel(r) : "", 지게차지급: hasForklift(r) ? (r.지게차지급완료 ? "지급완료" : "미지급") : "" });

// ─── 정산관리 › 지게차 지급 ───
export function ForkliftPayouts({ orders = [], patchDispatch, isViewer = false }) {
  const drivers = useForkliftDrivers();
  const dMap = React.useMemo(() => Object.fromEntries(drivers.map((d) => [d.id, d])), [drivers]);
  const [ym, setYm] = React.useState(() => kstDay().slice(0, 7));
  const [only, setOnly] = React.useState("미지급");
  const [open, setOpen] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const inMonth = (o) => !ym || String(o.상차일 || "").slice(0, 7) === ym;
  const groups = forkliftPayoutGroups((orders || []).filter(inMonth));
  const shown = groups.filter((g) => only === "전체" || (only === "미지급" ? g.unpaid > 0 : g.paid > 0));
  const sum = groups.reduce((a, g) => ({ total: a.total + g.total, paid: a.paid + g.paid, unpaid: a.unpaid + g.unpaid }), { total: 0, paid: 0, unpaid: 0 });
  const markPaid = async (rows, paid = true) => {
    if (isViewer || !patchDispatch) return;
    const target = rows.filter((r) => !!r.지게차지급완료 !== paid);
    if (!target.length) return;
    if (!(await kpConfirm(`${target.length}건을 ${paid ? "지급완료" : "미지급"}로 바꿀까요?`))) return;
    setBusy(true);
    try {
      for (const r of target) {
        const date = paid ? kstDay() : "";
        await patchDispatch(r._id || r.id, { 지게차지급완료: paid, 지게차지급일: date, __system: true });
        // 수입·지출 장부(지급일별 "지게차비 지급")에 자동 반영 — 되돌리면 빠진다
        bumpForkliftPayout(db, { date: paid ? date : (r.지게차지급일 || kstDay()), amount: paid ? fkAmount(r) : -fkAmount(r), count: paid ? 1 : -1, company: r.companyName || getTenant() }).catch(() => {});
      }
    } finally { setBusy(false); }
  };
  const exportXlsx = () => {
    const rows = [];
    groups.forEach((g) => g.rows.forEach((r) => { const d = dMap[r.지게차기사ID] || {}; rows.push({ 지게차기사: g.name, 전화번호: fmtPhone(d.전화번호 || g.phone), 지게차회사: d.지게차회사 || g.company, 은행: d.은행 || "", 계좌번호: d.계좌번호 || "", 예금주: d.예금주 || "", 상차일: r.상차일 || "", 거래처: r.거래처명 || "", 상차지: r.상차지명 || "", 하차지: r.하차지명 || "", 지게차비용: fkAmount(r), 부담: fkModeLabel(r), 지급: r.지게차지급완료 ? "지급완료" : "미지급", 지급일: r.지게차지급일 || "" }); }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "지게차지급"); XLSX.writeFile(wb, `지게차지급_${ym || "전체"}.xlsx`);
  };
  // ⭐ 2026-11-09 이체 엑셀 — 은행 대량이체에 바로 올리는 양식(기사별 미지급 합계 · 계좌 없는 기사는 빼고 알려 줌)
  const exportTransfer = async () => {
    const { rows, missing, total } = forkliftTransferRows(groups, dMap, { ym, payer: getTenant() });
    if (!rows.length) { await kpAlert(missing.length ? `미지급 기사 모두 계좌가 등록돼 있지 않아요.\n\n${missing.join(", ")}\n\n지게차 기사 관리에서 계좌를 먼저 등록해 주세요.` : "이 기간에 지급할(미지급) 지게차비가 없어요."); return; }
    if (missing.length && !(await kpConfirm(`계좌가 없는 기사 ${missing.length}명은 이체 엑셀에서 빠져요.\n\n${missing.join(", ")}\n\n나머지 ${rows.length}명(${total.toLocaleString()}원)만 받을까요?`))) return;
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["은행", "계좌번호", "예금주", "금액", "받는분 통장표시", "내 통장표시", "메모"] });
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
    rows.forEach((_, i) => { const c = ws[XLSX.utils.encode_cell({ r: i + 1, c: 1 })]; if (c) { c.t = "s"; c.v = String(c.v); } }); // 계좌번호 앞자리 0이 사라지지 않게 글자로
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "대량이체");
    XLSX.writeFile(wb, `지게차지급_이체_${ym || "전체"}.xlsx`);
  };
  return (
    <div className="p-4 space-y-3" data-forklift-payouts>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto"><div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>FORKLIFT PAYOUT</div><div className="text-[16px] font-black text-[#0F1A30]">지게차 지급</div><div className="text-[12px] text-[#7A89A3]">오더에 넣은 지게차비용을 지게차 기사별로 모아 지급합니다(배차취소 제외 · 상차일 기준)</div></div>
        <MonthPicker value={ym} onChange={setYm} clearable placeholder="전체 기간" /* ⭐ 2026-11-09 브라우저 월 선택(영문 표시) → 프로그램 달력 */ />
        <div className="inline-flex rounded-lg border border-[#DCE3EE] p-0.5">{["미지급", "지급완료", "전체"].map((k) => <button key={k} type="button" onClick={() => setOnly(k)} className={`h-8 px-3 rounded-md text-[12.5px] font-black ${only === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{k}</button>)}</div>
        <button type="button" onClick={exportXlsx} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B]">엑셀</button>
        <button type="button" onClick={exportTransfer} disabled={!sum.unpaid} data-testid="fk-transfer-xlsx" title="기사별 미지급 합계를 은행 대량이체 양식(은행·계좌번호·예금주·금액·통장표시)으로 받아요" className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-40">이체 엑셀</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[["지게차비 합계", sum.total], ["미지급", sum.unpaid], ["지급완료", sum.paid]].map(([k, v], i) => (
          <div key={k} className={`rounded-[16px] px-4 py-3 border ${i === 1 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}><div className={`text-[12.5px] font-bold ${i === 1 ? "text-white/60" : "text-[#7A879C]"}`}>{k}</div><div className="text-[22px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(v)}<span className="text-[12px] ml-1 opacity-50">원</span></div></div>
        ))}
      </div>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-x-auto">
        <table className="w-full text-[13.5px]" style={{ minWidth: 860 }}>
          <thead><tr className="bg-[#1B2B4B] text-white">{["지게차 기사", "지게차회사", "지급 계좌", "건수", "합계", "미지급", "지급완료", ""].map((h) => <th key={h} className="px-3 py-2.5 font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8} className="py-14 text-center text-[#9AA9C3]">이 달에 {only === "전체" ? "" : `${only} `}지게차비가 없습니다</td></tr>}
            {shown.map((g) => { const d = dMap[g.id] || {}; return (
              <React.Fragment key={g.id}>
                <tr className="border-t border-[#EEF1F6] hover:bg-[#F7F9FC] cursor-pointer" onClick={() => setOpen(open === g.id ? null : g.id)}>
                  <td className="px-3 py-2 font-black text-[#0F1A30] whitespace-nowrap">{open === g.id ? "▾" : "▸"} {g.name}<div className="text-[11.5px] font-bold text-[#7A89A3] tabular-nums">{fmtPhone(d.전화번호 || g.phone)}</div></td>
                  <td className="px-3 py-2 text-center">{d.지게차회사 || g.company || "-"}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap tabular-nums">{d.은행 ? `${d.은행} ${d.계좌번호 || ""} ${d.예금주 || ""}` : <span className="text-[#9AA9C3]">계좌 미등록</span>}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{g.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{won(g.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-black text-[#0F1A30]">{won(g.unpaid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#5B6B85]">{won(g.paid)}</td>
                  <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>{!isViewer && g.unpaid > 0 && <button type="button" disabled={busy} onClick={() => markPaid(g.rows, true)} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black disabled:opacity-40">전체 지급완료</button>}</td>
                </tr>
                {open === g.id && g.rows.map((r) => (
                  <tr key={r._id || r.id} className="bg-[#FAFBFD] border-t border-[#F1F4F9] text-[12.5px]">
                    <td className="px-3 py-1.5 pl-8 tabular-nums">{r.상차일 || ""}</td>
                    <td className="px-3 py-1.5" colSpan={2}>{r.거래처명 || ""} · {r.상차지명 || ""} → {r.하차지명 || ""}</td>
                    <td className="px-3 py-1.5 text-center">{fkModeLabel(r)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{won(fkAmount(r))}</td>
                    <td className="px-3 py-1.5 text-right" colSpan={2}>{r.지게차지급완료 ? <span className="font-bold text-[#1B2B4B]">지급완료 {r.지게차지급일 || ""}</span> : <span className="font-bold text-[#B54708]">미지급</span>}</td>
                    <td className="px-3 py-1.5 text-center">{!isViewer && <button type="button" disabled={busy} onClick={() => markPaid([r], !r.지게차지급완료)} className="h-7 px-2.5 rounded-md border border-[#DCE3EE] text-[11.5px] font-black">{r.지게차지급완료 ? "지급 취소" : "지급완료"}</button>}</td>
                  </tr>
                ))}
              </React.Fragment>
            ); })}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-[#7A879C]">수익 = 청구운임 − 기사운임 − 지게차비용 · 기사 차감이면 기사운임에서 이미 빠져 있고, 추가 청구면 청구운임에 이미 더해져 있습니다. 매출관리·정산의 수익에도 같은 식이 쓰입니다.</div>
    </div>
  );
}
