// ======================= src/companyBiz.jsx =======================
// 🏢 2026-11-03 한 운송사 · 여러 사업자(예: 태진 · 위드 · 가나) — 오더마다 "청구 사업자"를 고르고
//    현황·정산·매출·거래명세서가 사업자별로 나뉜다.
//  · 저장: companySettings/{회사}.bizList = [{ id, name, bizNo, ceo, addr, phone, fax, email, type, item, bankName, bankNo, bankHolder, seal }]
//    ─ 첫 번째(기본) 사업자는 따로 저장하지 않는다 = 회사정보(transportApplications)의 그 회사 자체
//  · 오더: 청구사업자(사업자 이름) — 비어 있으면 기본 사업자(회사 이름)
//  · 거래처(clients): 기본사업자 — 그 거래처를 고르면 청구 사업자가 자동으로 맞춰진다
//  · 추가 사업자가 하나도 없으면 화면에 아무것도 안 보인다(지금과 똑같음)
import React from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { fmtBizNo, fmtPhone } from "./formatInput";
import { BANK_NAMES, formatAccount } from "./bankUtil";
import { CustomSelect } from "./CustomSelect";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const store = new Map(); // 회사 → { list, listeners:Set, unsub }
function sub(co, cb) {
  let s = store.get(co);
  if (!s) { s = { list: [], listeners: new Set(), unsub: null }; store.set(co, s); }
  s.listeners.add(cb);
  start(co, s);
  cb(s.list);
  return () => { s.listeners.delete(cb); };
}
// ⭐ 2026-11-03 연결이 한 번 거부되면(규칙 배포 전 등) 예전엔 다시 듣지 않아 새로고침 전까지 목록이 안 바뀌었다 → 잠시 뒤 다시 연결
function start(co, s) {
  if (s.unsub) return;
  s.unsub = onSnapshot(doc(db, "companySettings", co), (x) => {
    s.list = (x.exists() && Array.isArray(x.data()?.bizList) ? x.data().bizList : []).filter((b) => b && String(b.name || "").trim());
    s.listeners.forEach((f) => f(s.list));
  }, () => {
    s.unsub = null;
    setTimeout(() => { if (s.listeners.size) start(co, s); }, 8000);
  });
}
// 저장 직후 화면에 바로 반영(서버 응답을 기다리지 않음)
function setLocal(co, list) {
  const s = store.get(co); if (!s) return;
  s.list = list.filter((b) => b && String(b.name || "").trim());
  s.listeners.forEach((f) => f(s.list));
}

// { company, extra: 추가 사업자들, names: [기본, ...추가], multi, defaultName, find(name) }
export function useCompanyBiz(company) {
  const co = String(company || "").trim();
  const [extra, setExtra] = React.useState(() => store.get(co)?.list || []);
  React.useEffect(() => (co ? sub(co, setExtra) : undefined), [co]);
  return React.useMemo(() => {
    const names = [co, ...extra.map((b) => String(b.name).trim()).filter((n) => n && n !== co)];
    return { company: co, extra, names, multi: names.length > 1, defaultName: co, find: (n) => extra.find((b) => String(b.name).trim() === String(n || "").trim()) || null };
  }, [co, extra]);
}

// 오더의 청구 사업자(없으면 회사 = 기본 사업자)
export const bizOf = (order, company) => String(order?.청구사업자 || "").trim() || String(company || order?.companyName || "").trim();

// 거래명세서 등 "공급자" 정보 — 기본 사업자는 회사정보 그대로, 추가 사업자는 그 사업자 정보로(빈 칸은 회사정보를 쓰지 않고 비움)
export function printInfoForBiz(base, biz) {
  if (!biz) return base;
  const contact = [biz.phone && `TEL ${biz.phone}`, biz.fax && `FAX ${biz.fax}`].filter(Boolean).join(" / ");
  return {
    ...base,
    name: biz.name || base.name, ceo: biz.ceo || "", bizNo: biz.bizNo || "", type: biz.type || base.type, item: biz.item || base.item,
    addr: biz.addr || "", phone: biz.phone || "", fax: biz.fax || "", contact,
    bank: biz.bankName ? `${biz.bankName} ${biz.bankNo || ""}`.trim() : "", email: biz.email || "", seal: biz.seal || "",
  };
}

// 작은 사업자 표시(현황 표의 거래처 앞) — 기본 사업자는 회색, 추가 사업자는 남색
export function BizChip({ name, main = false, className = "" }) {
  if (!name) return null;
  return (
    <span title={`청구 사업자: ${name}`} className={`inline-flex items-center h-[18px] px-1.5 mr-1 rounded-[5px] text-[10.5px] font-black leading-none align-middle whitespace-nowrap ${main ? "bg-[#EEF2F8] text-[#5B6B85] border border-[#DCE3EE]" : "bg-[#1B2B4B] text-white"} ${className}`}>{String(name).slice(0, 4)}</span>
  );
}

// 청구 사업자 고르기(오더 등록·수정)
export function BizPicker({ biz, value, onChange, size = "md", label = "청구 사업자" }) {
  if (!biz?.multi) return null;
  const cur = String(value || "").trim() || biz.defaultName;
  const h = size === "sm" ? "h-8 text-[12px]" : "h-9 text-[13px]";
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {label && <span className="text-[12px] font-black text-[#5B6B85] whitespace-nowrap">{label}</span>}
      <div className="inline-flex p-0.5 rounded-xl bg-[#EEF2F8] border border-[#DCE3EE]">
        {biz.names.map((n) => (
          <button key={n} type="button" onClick={() => onChange(n === biz.defaultName ? "" : n)}
            className={`${h} px-3 rounded-lg font-black whitespace-nowrap transition ${cur === n ? "bg-[#0F1A30] text-white shadow-[0_3px_10px_rgba(15,26,48,.25)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{n}</button>
        ))}
      </div>
    </div>
  );
}

// 사업자 고르기 필터(현황·정산·매출) — "" = 전체
export function BizFilter({ biz, value, onChange, className = "" }) {
  if (!biz?.multi) return null;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} title="청구 사업자로 거르기"
      className={`h-[30px] px-2 rounded-lg border border-[#1B2B4B] bg-white text-[11.5px] font-black text-[#0F1A30] cursor-pointer ${className}`}>
      <option value="">사업자 전체</option>
      {biz.names.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}
export const bizMatch = (order, company, filter) => !filter || bizOf(order, company) === filter;

// ── 회사정보 › 사업자 관리 ──
const EMPTY_BIZ = { name: "", bizNo: "", ceo: "", addr: "", phone: "", fax: "", email: "", type: "운수업", item: "화물운송주선", bankName: "", bankNo: "", bankHolder: "" };
export function BizListEditor({ company, canEdit }) {
  const biz = useCompanyBiz(company);
  const [edit, setEdit] = React.useState(null); // { idx, v }
  const [busy, setBusy] = React.useState(false);
  const save = async (list) => {
    setBusy(true);
    try {
      await setDoc(doc(db, "companySettings", company), { companyName: company, bizList: list, bizListAt: serverTimestamp() }, { merge: true });
      setLocal(company, list); setEdit(null);
    } catch (e) {
      window.alert(/permission|insufficient/i.test(String(e?.message || e)) ? "저장 권한이 없습니다. (관리자·경리·인사·마스터만 저장할 수 있어요 — PC에서 firebase deploy --only firestore:rules 를 했는지도 확인해 주세요)" : `저장하지 못했습니다: ${e?.message || e}`);
    } finally { setBusy(false); }
  };
  const submit = () => {
    const v = { ...edit.v, name: String(edit.v.name || "").trim() };
    if (!v.name) { window.alert("상호(사업자 이름)를 입력해 주세요."); return; }
    if (v.name === company || biz.extra.some((b, i) => i !== edit.idx && String(b.name).trim() === v.name)) { window.alert("이미 있는 사업자 이름입니다."); return; }
    const list = [...biz.extra];
    if (edit.idx == null) list.push({ ...v, id: `biz_${Date.now().toString(36)}` }); else list[edit.idx] = { ...list[edit.idx], ...v };
    save(list);
  };
  const remove = (i) => {
    if (!window.confirm(`'${biz.extra[i].name}' 사업자를 목록에서 뺄까요?\n이미 이 사업자로 등록한 오더는 그대로 남고, 새 오더에서만 고를 수 없게 됩니다.`)) return;
    save(biz.extra.filter((_, j) => j !== i));
  };
  const onSeal = (file) => {
    if (!file) return;
    if (file.size > 400 * 1024) { window.alert("직인 이미지는 400KB 이하로 올려 주세요."); return; }
    const r = new FileReader(); r.onload = () => setEdit((e) => ({ ...e, v: { ...e.v, seal: String(r.result || "") } })); r.readAsDataURL(file);
  };
  const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
  // ⭐ 사업자번호·전화·팩스는 하이픈 자동, 계좌번호는 은행 형식에 맞춰
  const fmtOf = { bizNo: fmtBizNo, phone: fmtPhone, fax: fmtPhone };
  const F = (k, label, ph = "", extra = {}) => (
    <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">{label}</div>
      <input className={inp} value={edit.v[k] || ""} placeholder={ph} inputMode={fmtOf[k] || k === "bankNo" ? "numeric" : undefined} {...extra}
        onChange={(e) => { const raw = e.target.value; const v = fmtOf[k] ? fmtOf[k](raw) : k === "bankNo" ? formatAccount(edit.v.bankName, raw) : raw; setEdit((x) => ({ ...x, v: { ...x.v, [k]: v } })); }} /></label>
  );
  return (
    <div className="mt-6 rounded-[20px] border border-[#E3E8F0] bg-white overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>BUSINESS ENTITIES</div>
          <div className="text-[17px] font-black">사업자 관리 <span className="text-[12px] font-bold text-white/55 ml-1">한 회사 · 여러 사업자로 청구</span></div>
        </div>
        {canEdit && <button type="button" onClick={() => setEdit({ idx: null, v: { ...EMPTY_BIZ } })} className="ml-auto h-9 px-4 rounded-xl bg-white text-[#0F1A30] text-[13px] font-black">＋ 사업자 추가</button>}
      </div>
      <div className="p-4 space-y-2">
        <div className="text-[15px] text-[#3A4A66] leading-relaxed font-semibold">사업자를 추가하면 오더 등록 화면에 <b>청구 사업자</b> 고르기가 생기고, 실시간·배차현황에 사업자 표시와 필터가, 거래명세서·미수금·매출에 사업자별 조회가 생깁니다. 거래처마다 기본 사업자를 정해 두면 거래처를 고를 때 자동으로 맞춰집니다.</div>
        <div className="flex items-center gap-3 rounded-xl border border-[#E3E8F0] bg-[#F7F9FC] px-4 py-3">
          <span className="px-2 h-6 rounded-md bg-[#EEF2F8] border border-[#DCE3EE] text-[11px] font-black text-[#5B6B85] inline-flex items-center">기본</span>
          <span className="text-[14px] font-black text-[#0F1A30]">{company}</span>
          <span className="text-[13.5px] text-[#5B6B85]">위 회사정보(사업자번호·계좌·직인)를 그대로 씁니다</span>
        </div>
        {biz.extra.map((b, i) => (
          <div key={b.id || b.name} className="flex items-center gap-3 rounded-xl border border-[#E3E8F0] px-4 py-3 flex-wrap">
            <span className="px-2 h-6 rounded-md bg-[#1B2B4B] text-white text-[11px] font-black inline-flex items-center">추가</span>
            <span className="text-[14px] font-black text-[#0F1A30]">{b.name}</span>
            <span className="text-[12px] text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO }}>{b.bizNo || "사업자번호 없음"}</span>
            <span className="text-[12px] text-[#7A8AA6]">{[b.ceo && `대표 ${b.ceo}`, b.bankName && `${b.bankName} ${b.bankNo || ""}`].filter(Boolean).join(" · ")}</span>
            {canEdit && <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => setEdit({ idx: i, v: { ...EMPTY_BIZ, ...b } })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B]">수정</button>
              <button type="button" onClick={() => remove(i)} className="h-8 px-3 rounded-lg border border-[#F3C3BD] text-[12px] font-black text-[#B42318]">빼기</button>
            </span>}
          </div>
        ))}
        {!biz.extra.length && <div className="text-[14px] text-[#7A8AA6] px-1">추가 사업자가 없습니다 — 지금은 모든 오더가 {company}(으)로 청구됩니다.</div>}
      </div>
      {edit && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0F1A30]/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEdit(null); }}>
          <div className="w-full max-w-[620px] max-h-[92vh] overflow-auto rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.35)]">
            <div className="px-6 py-4 bg-[#1B2B4B] text-white text-[16px] font-black">{edit.idx == null ? "사업자 추가" : "사업자 수정"}</div>
            <div className="p-6 grid grid-cols-2 gap-3">
              <div className="col-span-2">{F("name", "상호(사업자 이름) *", "예) 가나물류")}</div>
              {F("bizNo", "사업자등록번호", "000-00-00000")}{F("ceo", "대표자")}
              <div className="col-span-2">{F("addr", "사업장 주소")}</div>
              {F("type", "업태")}{F("item", "종목")}
              {F("phone", "전화")}{F("fax", "팩스")}
              <div className="col-span-2">{F("email", "청구 메일 주소(보내는 사람 표시)")}</div>
              <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">입금 은행</div>
                <CustomSelect value={edit.v.bankName || ""} onChange={(e) => setEdit((x) => ({ ...x, v: { ...x.v, bankName: e.target.value, bankNo: formatAccount(e.target.value, x.v.bankNo || "") } }))} className={`${inp} cursor-pointer`}>
                  <option value="">은행 선택</option>
                  {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                </CustomSelect></label>
              {F("bankNo", "계좌번호", "숫자만 입력")}
              {F("bankHolder", "예금주")}
              <label className="block"><div className="text-[12.5px] font-black text-[#3A4A66] mb-1">직인(거래명세서 도장)</div>
                <div className="flex items-center gap-2">
                  {edit.v.seal ? <img src={edit.v.seal} alt="직인" className="w-10 h-10 object-contain rounded border border-[#E3E8F0]" /> : <span className="w-10 h-10 rounded border border-dashed border-[#C9D3E3]" />}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onSeal(e.target.files?.[0])} className="text-[12px]" />
                </div></label>
            </div>
            <div className="px-6 pb-6 flex gap-2.5">
              <button type="button" onClick={() => setEdit(null)} disabled={busy} className="flex-1 h-11 rounded-xl border border-[#E3E8F0] text-[#3A4A66] text-[14px] font-extrabold">취소</button>
              <button type="button" onClick={submit} disabled={busy} className="flex-1 h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black disabled:opacity-60">{busy ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 사업자별로 보기(매출관리 등) — 위쪽에 사업자 고르기 줄, 아래 화면에는 고른 사업자 오더만 넘긴다
export function BizScope({ company, data, children, label = "매출 사업자" }) {
  const biz = useCompanyBiz(company);
  const [sel, setSel] = React.useState("");
  const rows = React.useMemo(() => (!biz.multi || !sel ? data || [] : (data || []).filter((r) => bizOf(r, biz.defaultName) === sel)), [data, sel, biz]);
  return (
    <>
      {biz.multi && (
        <div className="mb-3 flex items-center gap-3 flex-wrap rounded-2xl px-4 py-2.5 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <span className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>BUSINESS</span>
          <span className="text-[12.5px] font-black text-white/80">{label}</span>
          <div className="inline-flex p-0.5 rounded-xl bg-white/10 border border-white/15 overflow-x-auto">
            {["", ...biz.names].map((n) => (
              <button key={n || "all"} type="button" onClick={() => setSel(n)} className={`h-8 px-3.5 rounded-lg text-[12.5px] font-black whitespace-nowrap transition ${sel === n ? "bg-white text-[#0F1A30]" : "text-white/75 hover:text-white"}`}>{n || "전체"}</button>
            ))}
          </div>
        </div>
      )}
      {children(rows, sel)}
    </>
  );
}
