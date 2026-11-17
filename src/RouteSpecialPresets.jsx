// ======================= src/RouteSpecialPresets.jsx =======================
// ⭐ 2026-11-17 회사관리 › 노선 특수운임 — 노선(거래처 · 상차지 · 하차지)마다 늘 붙는 특수운임을 한 번 정해 두면 오더에 자동으로 들어가요
//  예) 에이제이 → 트레이더스 칠곡 = 지게차비용 35,000원 · 에이제이 → 에브리데이 여주 = 지게차비용 50,000원 · 야상 +20,000원(야간 상차일 때만)
//  · 표: 거래처 · 상차지 · 하차지 · 항목 · 금액 · 부담 · 조건 · 사용 — [+ 노선 추가] · 수정 · 삭제 · 검색
//  · [기존 자료로 자동 설정]: 지난 3~6개월 오더를 보고 노선마다 늘 붙던 특수운임을 찾아 보여 줌 → 골라서 저장
//  · "구글시트에서 들어오는 오더에도 적용"(관리자): 시트 줄에 그 금액 칸이 비어 있을 때만 서버가 넣는다(companySettings/{회사}.routePresetSheet)
//  계산 · 저장 규칙: functions/routePresetCore.mjs · src/routePreset.js
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getTenant } from "./fsTenant";
import { kpAlert, kpConfirm } from "./kpDialog";
import { SPECIAL_TYPES } from "./forkliftCore";
import { isJyCompany } from "./jyOnly";
import {
  useRoutePresets, saveRoutePreset, deleteRoutePreset, routePresetIdOf, loadSeedOrders,
  seedProposals, proposalsToPresets, presetError, cleanItem, slotOf, nk, routeLabel, LEVEL_LABEL, levelOf, TYPE_LABEL,
} from "./routePreset";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const MODE_LABEL = { 기사: "기사운임에서 차감", 회사: "회사 부담", 청구: "거래처에 추가 청구" };
const PAYEE_LABEL = { 기사: "배차 기사에게", 외부: "회사가 따로 지급", 없음: "지급 없음(청구만)" };
const typeName = (it) => (it.종류 === "지게차" ? "지게차비용" : it.이름 ? `${it.이름}${it.종류 !== "기타" ? ` (${TYPE_LABEL[it.종류] || it.종류})` : ""}` : TYPE_LABEL[it.종류] || it.종류);
const modeText = (it) => `${MODE_LABEL[it.부담] || it.부담}${it.종류 !== "지게차" && it.받는사람 !== "기사" ? ` · ${PAYEE_LABEL[it.받는사람]}` : ""}`;
const condText = (it) => (it.조건 === "야간" ? "야간 상차일 때만" : "늘");

export default function RouteSpecialPresets({ canEdit = true, canAdmin = false, mobile = false }) {
  const list = useRoutePresets();
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null); // { id?, 거래처명, 상차지명, 하차지명, items }
  const [seed, setSeed] = React.useState(false);
  const [showOld, setShowOld] = React.useState(false);
  const co = getTenant() || "";
  const [sheetOn, setSheetOn] = React.useState(false);
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, "companySettings", co), (s) => setSheetOn(((s.exists() ? s.data() : {}) || {}).routePresetSheet === true), () => {});
  }, [co]);
  const toggleSheet = async (on) => {
    try { await setDoc(doc(db, "companySettings", co), { routePresetSheet: !!on }, { merge: true }); }
    catch (e) { kpAlert(`바꾸지 못했어요: ${e?.code || e?.message || e}`); }
  };
  const v2 = list.filter((p) => !p.legacy);
  const old = list.filter((p) => p.legacy && p.items.length);
  const hit = (p) => { const t = nk(q); return !t || [p.거래처명, p.상차지명, p.하차지명, ...p.items.map(typeName)].some((v) => nk(v).includes(t)); };
  const shown = v2.filter(hit).sort((a, b) => a.거래처명.localeCompare(b.거래처명, "ko") || a.하차지명.localeCompare(b.하차지명, "ko") || a.상차지명.localeCompare(b.상차지명, "ko"));
  const rows = shown.flatMap((p) => p.items.map((it, i) => ({ p, it, i, first: i === 0, span: p.items.length })));
  const del = async (p, it) => {
    if (!canEdit) return;
    const last = p.items.length <= 1;
    if (!(await kpConfirm(last ? `${routeLabel(p)} 노선 고정을 지울까요?\n이미 저장된 오더는 그대로예요.` : `${routeLabel(p)}에서 '${typeName(it)}'만 뺄까요?`))) return;
    try {
      if (last) await deleteRoutePreset(p.id);
      else await saveRoutePreset({ ...p, items: p.items.filter((x) => slotOf(x) !== slotOf(it)) }, { oldId: p.id });
    } catch (e) { kpAlert(`지우지 못했어요: ${e?.message || e}`); }
  };
  const toggleUse = async (p) => { try { await saveRoutePreset({ ...p, 사용: p.사용 === false }, { oldId: p.id }); } catch (e) { kpAlert(`바꾸지 못했어요: ${e?.message || e}`); } };
  const th = "px-3 py-2.5 text-center font-extrabold whitespace-nowrap";
  const td = "px-3 py-2 whitespace-nowrap";
  return (
    <div className="flex flex-col gap-4 w-full" data-route-presets="1">
      <div className="rounded-[20px] bg-[#0F1A30] text-white p-5 md:p-6 shadow-[0_10px_28px_rgba(11,20,40,0.25)] relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-[#2D4C82]/40 blur-2xl pointer-events-none" />
        <div className="relative flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ROUTE SPECIAL FARE</div>
            <div className="text-[20px] md:text-[22px] font-extrabold mt-1">노선별 고정 특수운임</div>
            <div className="text-[14px] text-[#B9C7E3] mt-1.5 leading-relaxed break-keep">
              늘 같은 금액이 붙는 노선을 한 번만 정해 두세요. 그 노선으로 오더를 넣으면 <b className="text-white">지게차비용 · 야상 같은 특수운임이 자동으로</b> 들어가고, 청구운임 · 기사운임 · 수수료도 같이 맞춰져요.
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSeed(true)} data-route-seed="1" className="h-[42px] px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-extrabold hover:bg-[#EAF0FB]">기존 자료로 자동 설정</button>
              <button type="button" onClick={() => setEdit({ 거래처명: "", 상차지명: "", 하차지명: "", items: [cleanItem({ 종류: "지게차", 금액: 0, 부담: "청구" })] })} data-route-add="1" className="h-[42px] px-4 rounded-xl bg-[#2D4C82] text-white text-[14px] font-extrabold hover:bg-[#3A5E9C]">+ 노선 추가</button>
            </div>
          )}
        </div>
        <div className="relative mt-3 text-[13px] text-[#B9C7E3] leading-relaxed break-keep">
          찾는 순서: ① 거래처 · 상차지 · 하차지가 모두 같은 노선 → ② 거래처 · 하차지 → ③ 거래처 · 상차지. 오더에서 직접 넣은 특수운임은 건드리지 않아요.
        </div>
        <label className={`relative mt-3 flex items-start gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 ${canAdmin ? "cursor-pointer" : "opacity-60"}`}>
          <input type="checkbox" className="mt-1" checked={sheetOn} disabled={!canAdmin} onChange={(e) => toggleSheet(e.target.checked)} data-route-sheet="1" />
          <span className="text-[13.5px] leading-relaxed break-keep"><b>구글시트에서 들어오는 오더에도 적용</b> — 시트 줄에 그 금액 칸(대행료 · 야상 등)이 비어 있을 때만 넣어요. 칸이 채워져 있으면 시트 값을 그대로 써요(두 번 더하지 않아요).{!canAdmin && " · 관리자만 바꿀 수 있어요"}</span>
        </label>
      </div>

      <div className="rounded-[20px] bg-white border border-[#E3E8F0] p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="mr-auto">
            <div className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#2D4C82]" style={{ fontFamily: MONO }}>ROUTES</div>
            <div className="text-[16px] font-extrabold text-[#0F1A30] leading-tight">고정 노선 <span className="text-[13px] font-bold text-[#6B7A99] tabular-nums">{v2.length}개</span></div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 · 상하차지 · 항목 검색" className={`h-9 ${mobile ? "w-full" : "w-60"} px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold`} data-route-search="1" />
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#EEF1F6]">
          <table className="w-full text-[13.5px]" style={{ minWidth: 920 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["거래처", "상차지", "하차지", "항목", "금액", "부담", "조건", "사용", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="py-12 text-center text-[#9AA9C3] break-keep">{v2.length ? "검색 결과가 없어요" : "아직 고정 노선이 없어요 — [기존 자료로 자동 설정]을 누르면 지난 오더에서 찾아 드려요"}</td></tr>}
              {rows.map(({ p, it, first, span }) => (
                <tr key={`${p.id}-${slotOf(it)}`} className={`border-t border-[#EEF1F6] ${p.사용 === false ? "opacity-50" : ""}`} data-route-row={p.id}>
                  {first && <td rowSpan={span} className={`${td} font-black text-[#0F1A30] align-top`}>{p.거래처명}</td>}
                  {first && <td rowSpan={span} className={`${td} align-top`}>{p.상차지명 || <span className="text-[#9AA9C3]">모든 상차지</span>}</td>}
                  {first && <td rowSpan={span} className={`${td} align-top font-bold`}>{p.하차지명 || <span className="text-[#9AA9C3] font-semibold">모든 하차지</span>}</td>}
                  <td className={td}>{typeName(it)}</td>
                  <td className={`${td} text-right tabular-nums font-black`} style={{ fontFamily: MONO }}>{won(it.금액)}</td>
                  <td className={`${td} text-[12.5px]`}>{modeText(it)}</td>
                  <td className={td}>{it.조건 === "야간" ? <span className="px-2 py-0.5 rounded-md bg-[#1B2B4B] text-[#E9C46A] text-[12px] font-black">야간 상차일 때만</span> : <span className="text-[#5B6B85]">늘</span>}</td>
                  {first && <td rowSpan={span} className={`${td} text-center align-top`}><button type="button" disabled={!canEdit} onClick={() => toggleUse(p)} className={`h-7 px-2.5 rounded-lg text-[12px] font-black ${p.사용 === false ? "border border-[#DCE3EE] text-[#7A89A3]" : "bg-[#0F1A30] text-white"}`}>{p.사용 === false ? "꺼짐" : "사용"}</button></td>}
                  <td className={`${td} text-center`}>{canEdit && <span className="inline-flex gap-1">
                    {first && <button type="button" onClick={() => setEdit({ ...p })} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black">수정</button>}
                    <button type="button" onClick={() => del(p, it)} className="h-8 px-2.5 rounded-lg border border-[#F0D3D3] text-[12px] font-black text-[#B4342A]">삭제</button>
                  </span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[13px] text-[#6B7A99] leading-relaxed break-keep">
          · 노선을 바꾸면(거래처 · 상차지 · 하차지 · 상차시간) 자동으로 넣은 항목은 다시 계산해요. [특수운임] 팝업에서 직접 [적용]한 오더는 그대로 둬요.<br />
          · 야간 상차 = 상차시간 18:00 ~ 05:00, 또는 구글시트 입고시간이 "야상"인 오더예요.<br />
          · 구글시트 실시간 반영을 쓰는 회사(JY로지스틱스 등)는 프로그램에서 넣은 지게차비용 · 야상이 시트의 대행료 · 야상(추가) 칸에 같이 적혀요.
        </div>
        {old.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={() => setShowOld((v) => !v)} className="text-[13px] font-bold text-[#2D4C82]">{showOld ? "▾" : "▸"} 예전 "상차지 기억"(지게차 [불러오기]용) {old.length}개 — 자동으로 넣지는 않아요</button>
            {showOld && (
              <ul className="mt-2 divide-y divide-[#EEF2F8] rounded-xl border border-[#EEF1F6]">
                {old.map((p) => (
                  <li key={p.id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-bold text-[#0F1A30]">{p.거래처명 || "?"} · {p.상차지명}</span>
                    <span className="tabular-nums">지게차 {won(p.items[0].금액)} · {MODE_LABEL[p.items[0].부담]}</span>
                    {canEdit && <button type="button" onClick={() => setEdit({ 거래처명: p.거래처명, 상차지명: p.상차지명, 하차지명: "", items: p.items.map((x) => ({ ...x })) })} className="ml-auto h-7 px-2.5 rounded-lg border border-[#DCE3EE] text-[12px] font-black">자동으로 넣기</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {edit && <PresetEditor value={edit} list={v2} onClose={() => setEdit(null)} />}
      {seed && <SeedModal existing={v2} onClose={() => setSeed(false)} />}
    </div>
  );
}

// ─── 노선 하나 추가 · 수정 ───
function PresetEditor({ value, list, onClose }) {
  const [f, setF] = React.useState(() => ({ 사용: true, ...value, items: (value.items || []).map((x) => ({ ...x })) }));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const jy = isJyCompany();
  const setItem = (i, patch) => setF((p) => ({ ...p, items: p.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const addItem = () => setF((p) => ({ ...p, items: [...p.items, cleanItem({ 종류: p.items.some((x) => x.종류 === "지게차") ? "할증" : "지게차", 이름: p.items.some((x) => x.종류 === "지게차") ? "야상" : "", 금액: 0, 부담: "청구", 받는사람: jy ? "없음" : "기사" })] }));
  const save = async () => {
    const e = presetError(f);
    if (e) { setErr(e); return; }
    const id = routePresetIdOf(f);
    if (id !== value.id && list.some((p) => p.id === id) && !(await kpConfirm("같은 노선이 이미 있어요. 이 내용으로 바꿀까요?"))) return;
    setBusy(true);
    try { await saveRoutePreset({ ...f, 출처: value.출처 || "직접" }, { oldId: value.id || "" }); onClose(); }
    catch (x) { setErr(`저장하지 못했어요: ${x?.code || x?.message || x}`); } finally { setBusy(false); }
  };
  const lbl = "text-[12px] font-extrabold text-[#5B6B85] mb-1";
  const sel = "h-10 w-full px-2 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-semibold";
  return (
    <div className="fixed inset-0 z-[100060] bg-[#0B1428]/60 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[760px] max-h-[90vh] flex flex-col rounded-[22px] bg-white overflow-hidden shadow-2xl" data-route-editor="1">
        <div className="px-5 py-4 bg-[#0F1A30] text-white"><div className="text-[10.5px] tracking-[0.22em] font-extrabold text-[#8FB0F0]">ROUTE PRESET</div><div className="text-[17px] font-black">{value.id ? "노선 고정 수정" : "노선 고정 추가"}</div></div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><div className={lbl}>거래처 *</div><input className={inp} value={f.거래처명} onChange={(e) => setF({ ...f, 거래처명: e.target.value })} placeholder="예: 에이제이" autoFocus data-route-client="1" /></div>
            <div><div className={lbl}>상차지 (비우면 모든 상차지)</div><input className={inp} value={f.상차지명} onChange={(e) => setF({ ...f, 상차지명: e.target.value })} placeholder="예: 에이제이" data-route-from="1" /></div>
            <div><div className={lbl}>하차지 (비우면 모든 하차지)</div><input className={inp} value={f.하차지명} onChange={(e) => setF({ ...f, 하차지명: e.target.value })} placeholder="예: 트레이더스 칠곡" data-route-to="1" /></div>
          </div>
          <div className="text-[12.5px] text-[#6B7A99]">찾는 단계: <b>{(f.상차지명 || f.하차지명) ? LEVEL_LABEL[levelOf(f)] : "상차지나 하차지를 넣어 주세요"}</b> · 이름은 띄어쓰기가 달라도 같은 곳으로 봐요</div>
          <div className="space-y-2">
            {f.items.map((it, i) => (
              <div key={i} className="rounded-xl border border-[#E3E8F0] bg-[#F7F9FD] p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end" data-route-item={i}>
                <div className="col-span-2 sm:col-span-1"><div className={lbl}>항목</div>
                  <select className={sel} value={it.종류} onChange={(e) => setItem(i, { 종류: e.target.value, ...(e.target.value === "지게차" ? { 이름: "", 받는사람: "외부" } : {}) })}>
                    {SPECIAL_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select></div>
                <div><div className={lbl}>이름</div><input className={inp} disabled={it.종류 === "지게차"} value={it.이름 || ""} onChange={(e) => setItem(i, { 이름: e.target.value })} placeholder={it.종류 === "할증" ? "야상" : ""} /></div>
                <div><div className={lbl}>금액(원)</div><input className={`${inp} text-right tabular-nums`} inputMode="numeric" value={Number(it.금액) ? won(it.금액) : ""} onChange={(e) => setItem(i, { 금액: e.target.value.replace(/[^\d]/g, "") })} data-route-amount={i} /></div>
                {it.종류 !== "지게차" && <div><div className={lbl}>받는 사람</div>
                  <select className={sel} value={it.받는사람 || "기사"} onChange={(e) => setItem(i, { 받는사람: e.target.value, ...(e.target.value === "없음" ? { 부담: "청구" } : {}) })}>
                    {["기사", "외부", ...(jy || it.받는사람 === "없음" ? ["없음"] : [])].map((k) => <option key={k} value={k}>{PAYEE_LABEL[k]}</option>)}
                  </select></div>}
                <div className={it.종류 === "지게차" ? "col-span-1 sm:col-span-2" : ""}><div className={lbl}>부담</div>
                  <select className={sel} value={it.부담 || "청구"} onChange={(e) => setItem(i, { 부담: e.target.value })}>
                    {(it.종류 === "지게차" || it.받는사람 === "외부" ? ["기사", "회사", "청구"] : it.받는사람 === "없음" ? ["청구"] : ["회사", "청구"]).map((k) => <option key={k} value={k}>{MODE_LABEL[k]}</option>)}
                  </select></div>
                <div className="flex items-end gap-1"><div className="flex-1"><div className={lbl}>조건</div>
                  <select className={sel} value={it.조건 || "항상"} onChange={(e) => setItem(i, { 조건: e.target.value })} data-route-cond={i}>
                    <option value="항상">늘</option><option value="야간">야간 상차일 때만</option>
                  </select></div>
                  <button type="button" onClick={() => setF((p) => ({ ...p, items: p.items.filter((_, k) => k !== i) }))} className="h-10 w-9 rounded-lg text-[#B4342A] hover:bg-[#FDECEC]" title="이 항목 빼기">✕</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addItem} className="w-full h-10 rounded-xl border border-dashed border-[#9AA9C3] text-[13px] font-black text-[#1B2B4B] hover:border-[#4B6CB7]">+ 항목 추가</button>
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] font-bold text-[#1B2B4B]"><input type="checkbox" checked={f.사용 !== false} onChange={(e) => setF({ ...f, 사용: e.target.checked })} />사용(오더에 자동으로 넣기)</label>
          {err && <div className="text-[13.5px] font-bold text-red-600">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-[#EEF1F6] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#DCE3EE] font-black text-[13.5px]">취소</button>
          <button type="button" disabled={busy} onClick={save} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white font-black text-[13.5px] disabled:opacity-40" data-route-save="1">{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 기존 자료로 자동 설정 ───
function SeedModal({ existing, onClose }) {
  const [months, setMonths] = React.useState(6);
  const [state, setState] = React.useState({ step: "idle" }); // idle · loading · done · error
  const [pick, setPick] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setState({ step: "loading" });
    try {
      const { orders, from } = await loadSeedOrders(months);
      const list = seedProposals(orders, { existing });
      setPick(new Set(list.filter((p) => p.status !== "same").map((p) => p.id)));
      setState({ step: "done", list, from, count: orders.length });
    } catch (e) { setState({ step: "error", msg: e?.code || e?.message || String(e) }); }
  };
  React.useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = state.list || [];
  const chosen = list.filter((p) => pick.has(p.id));
  const save = async () => {
    if (!chosen.length) return;
    setBusy(true);
    try {
      const docs = proposalsToPresets(chosen, existing);
      for (const d of docs) {
        const old = existing.find((e) => routePresetIdOf(e) === routePresetIdOf(d));
        await saveRoutePreset({ ...d, 출처: old?.출처 || "기존 자료" }, { oldId: old?.id || "" });
      }
      kpAlert(`노선 ${docs.length}개(항목 ${chosen.length}개)를 저장했어요.\n이제 그 노선으로 오더를 넣으면 자동으로 들어가요.`);
      onClose();
    } catch (e) { kpAlert(`저장하지 못했어요: ${e?.code || e?.message || e}`); } finally { setBusy(false); }
  };
  const toggle = (id) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const STATUS = { new: ["새로", "bg-[#EAF0FB] text-[#2D4C82]"], diff: ["지금과 다름", "bg-[#FFF4E5] text-[#B54708]"], same: ["이미 있음", "bg-[#F1F4F9] text-[#7A89A3]"] };
  return (
    <div className="fixed inset-0 z-[100060] bg-[#0B1428]/60 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-[1040px] max-h-[90vh] flex flex-col rounded-[22px] bg-white overflow-hidden shadow-2xl" data-route-seed-modal="1">
        <div className="px-5 py-4 bg-[#0F1A30] text-white flex flex-wrap items-center gap-3">
          <div className="mr-auto"><div className="text-[10.5px] tracking-[0.22em] font-extrabold text-[#8FB0F0]">SET UP FROM PAST ORDERS</div><div className="text-[17px] font-black">기존 자료로 자동 설정</div>
            <div className="text-[12.5px] text-white/60 break-keep">노선마다 오더가 3건 이상이고, 같은 금액 · 같은 부담이 70% 넘게 붙어 있던 특수운임을 찾았어요. 야간 상차 오더에만 붙던 것은 "야간 상차일 때만"으로 넣어요.</div></div>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-9 px-2 rounded-lg bg-white/10 border border-white/20 text-[13px] font-bold">
            {[3, 6].map((m) => <option key={m} value={m} className="text-black">최근 {m}개월</option>)}
          </select>
          <button type="button" onClick={run} disabled={state.step === "loading"} className="h-9 px-3 rounded-lg bg-white text-[#0F1A30] text-[13px] font-black disabled:opacity-40">다시 찾기</button>
        </div>
        <div className="flex-1 overflow-auto">
          {state.step === "loading" && <div className="py-16 text-center text-[#7A89A3] font-bold">지난 오더를 살펴보는 중이에요…</div>}
          {state.step === "error" && <div className="py-16 text-center text-[#B4342A] font-bold break-keep">오더를 읽지 못했어요 ({state.msg})</div>}
          {state.step === "done" && (
            <>
              <div className="px-5 py-2.5 text-[12.5px] text-[#5B6B85] bg-[#F7F9FC] border-b border-[#EEF1F6]">{state.from}부터 오더 {state.count.toLocaleString()}건을 봤어요 · 찾은 항목 {list.length}개</div>
              <table className="w-full text-[13px]" style={{ minWidth: 900 }}>
                <thead><tr className="bg-[#F1F4F9] text-[#3A4A66]">
                  <th className="px-3 py-2"><input type="checkbox" checked={list.length > 0 && chosen.length === list.length} onChange={(e) => setPick(new Set(e.target.checked ? list.map((p) => p.id) : []))} /></th>
                  {["거래처", "상차지", "하차지", "항목", "금액", "부담", "조건", "근거", "상태"].map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={10} className="py-14 text-center text-[#9AA9C3] break-keep">늘 같은 특수운임이 붙는 노선을 찾지 못했어요. [+ 노선 추가]로 직접 넣어 주세요.</td></tr>}
                  {list.map((p) => (
                    <tr key={p.id} className={`border-t border-[#EEF1F6] ${pick.has(p.id) ? "" : "opacity-60"}`} data-seed-row={p.id}>
                      <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={pick.has(p.id)} onChange={() => toggle(p.id)} /></td>
                      <td className="px-3 py-1.5 font-bold whitespace-nowrap">{p.거래처명}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{p.상차지명 || <span className="text-[#9AA9C3]">모든 상차지</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap font-bold">{p.하차지명 || <span className="text-[#9AA9C3] font-semibold">모든 하차지</span>}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{typeName(p.item)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-black">{won(p.item.금액)}{p.status === "diff" && p.current ? <div className="text-[11px] font-bold text-[#B54708]">지금 {won(p.current.금액)}</div> : null}</td>
                      <td className="px-3 py-1.5 text-[12px]">{modeText(p.item)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{condText(p.item)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-[12px]"><b>{p.count}</b>/{p.total}건 · <b>{Math.round(p.share * 100)}%</b>{p.item.조건 === "야간" ? ` (야간 ${p.nightCount}건 중)` : ""}</td>
                      <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-md text-[11.5px] font-black ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#EEF1F6] flex items-center justify-end gap-2">
          <span className="mr-auto text-[12.5px] text-[#7A89A3] break-keep">저장해도 이미 등록된 오더는 바뀌지 않아요. 앞으로 넣는 오더부터 자동으로 들어가요.</span>
          <button type="button" onClick={onClose} disabled={busy} className="h-10 px-4 rounded-xl border border-[#DCE3EE] font-black text-[13.5px]">닫기</button>
          <button type="button" disabled={busy || !chosen.length} onClick={save} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white font-black text-[13.5px] disabled:opacity-40" data-seed-save="1">{busy ? "저장 중…" : `고른 ${chosen.length}개 저장`}</button>
        </div>
      </div>
    </div>
  );
}
