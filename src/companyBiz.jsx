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
import { doc, onSnapshot, setDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { fmtBizNo, fmtPhone } from "./formatInput";
import { BANK_NAMES, formatAccount } from "./bankUtil";
import { CustomSelect } from "./CustomSelect";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const store = new Map(); // 회사 → { list, memory, listeners:Set, unsub }
function sub(co, cb) {
  let s = store.get(co);
  if (!s) { s = { list: [], memory: {}, listeners: new Set(), unsub: null }; store.set(co, s); }
  s.listeners.add(cb);
  start(co, s);
  cb(s);
  return () => { s.listeners.delete(cb); };
}
const emit = (s) => { const snap = { list: s.list, memory: s.memory }; s.listeners.forEach((f) => f(snap)); };
// ⭐ 2026-11-03 연결이 한 번 거부되면(규칙 배포 전 등) 예전엔 다시 듣지 않아 새로고침 전까지 목록이 안 바뀌었다 → 잠시 뒤 다시 연결
function start(co, s) {
  if (s.unsub) return;
  s.unsub = onSnapshot(doc(db, "companySettings", co), (x) => {
    const d = x.exists() ? x.data() || {} : {};
    s.list = (Array.isArray(d.bizList) ? d.bizList : []).filter((b) => b && String(b.name || "").trim());
    s.memory = d.bizMemory && typeof d.bizMemory === "object" ? d.bizMemory : {};
    emit(s);
  }, () => {
    s.unsub = null;
    setTimeout(() => { if (s.listeners.size) start(co, s); }, 8000);
  });
}
// 저장 직후 화면에 바로 반영(서버 응답을 기다리지 않음)
function setLocal(co, list) {
  const s = store.get(co); if (!s) return;
  s.list = list.filter((b) => b && String(b.name || "").trim());
  emit(s);
}

// { company, extra: 추가 사업자들, names: [기본, ...추가], multi, defaultName, find(name) }
export function useCompanyBiz(company) {
  const co = String(company || "").trim();
  const [st, setSt] = React.useState(() => { const x = store.get(co); return { list: x?.list || [], memory: x?.memory || {} }; });
  React.useEffect(() => (co ? sub(co, (x) => setSt({ list: x.list, memory: x.memory })) : undefined), [co]);
  const extra = st.list;
  const memory = st.memory;
  return React.useMemo(() => {
    const names = [co, ...extra.map((b) => String(b.name).trim()).filter((n) => n && n !== co)];
    return { company: co, extra, memory, names, multi: names.length > 1, defaultName: co, find: (n) => extra.find((b) => String(b.name).trim() === String(n || "").trim()) || null };
  }, [co, extra, memory]);
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

// ── 청구 사업자 기억(2026-11-03) ──
//  · 추가 사업자로 저장한 오더를 기억해 두었다가, 같은 거래처+상차지+하차지가 다시 들어오면 그 사업자로 자동 맞춘다
//  · 저장: companySettings/{회사}.bizMemory = { "k_해시": 사업자이름(거래처+상차지+하차지), "c_해시": 사업자이름(거래처만 — 처음 보는 구간용) }
//  · 이름은 띄어쓰기·대소문자·(주)/주식회사·괄호·점 등을 빼고 비교한다
export const normBizKey = (s) => String(s || "").toLowerCase().replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "").replace(/[\s()[\]{}.,·\-_/\\'"]+/g, "");
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
// { exact: 거래처+상차지+하차지 키(셋 다 있을 때만), client: 거래처 키 }
export function bizMemKeys(client, pickup, drop) {
  const c = normBizKey(client), p = normBizKey(pickup), d = normBizKey(drop);
  if (!c) return { exact: "", client: "" };
  return { exact: p && d ? `k_${hash(`${c}|${p}|${d}`)}` : "", client: `c_${hash(c)}` };
}
// 청구 사업자 자동 결정 — 1) 같은 구간 기억 2) 복사해 온 오더의 사업자 3) 그 거래처로 마지막에 쓴 사업자 4) 거래처 기본 사업자 5) 기본
//  → { name: 사업자 이름, src: "memory" | "copy" | "client-memory" | "client" | "default" }
export function resolveBiz(biz, { client = "", pickup = "", drop = "", seed = "", clientDefault = "" } = {}) {
  if (!biz?.multi) return { name: biz?.defaultName || "", src: "default" };
  const ok = (n) => !!n && biz.names.includes(String(n).trim());
  const m = biz.memory || {};
  const k = bizMemKeys(client, pickup, drop);
  if (k.exact && ok(m[k.exact])) return { name: m[k.exact], src: "memory" };
  if (ok(seed)) return { name: String(seed).trim(), src: "copy" };
  if (k.client && ok(m[k.client])) return { name: m[k.client], src: "client-memory" };
  if (ok(clientDefault)) return { name: String(clientDefault).trim(), src: "client" };
  return { name: biz.defaultName, src: "default" };
}
export const BIZ_SRC_LABEL = { memory: "같은 거래처·상차지·하차지로 지난번에 쓴 사업자", copy: "복사한 오더의 사업자", "client-memory": "이 거래처로 지난번에 쓴 사업자", client: "거래처의 기본 사업자" };
// 저장한 오더의 청구 사업자를 기억한다(바뀐 게 있을 때만 한 번 쓴다 · 실패해도 오더 저장과는 무관)
export function rememberBiz(biz, order, { clientDefault = "" } = {}) {
  try {
    if (!biz?.multi || !biz.company || !order) return;
    const desired = bizOf(order, biz.defaultName);
    if (!biz.names.includes(desired)) return;
    const k = bizMemKeys(order.거래처명, order.상차지명, order.하차지명);
    if (!k.client) return;
    const s = store.get(biz.company);
    const m = { ...((s && s.memory) || biz.memory || {}) };
    const ok = (n) => !!n && biz.names.includes(n);
    const patch = {}, local = {};
    let fallback = ok(m[k.client]) ? m[k.client] : ok(clientDefault) ? clientDefault : biz.defaultName;
    if (desired !== biz.defaultName && m[k.client] !== desired) { patch[k.client] = desired; local[k.client] = desired; fallback = desired; }
    if (k.exact) {
      const has = m[k.exact] != null;
      if (desired === fallback) { if (has) { patch[k.exact] = deleteField(); local[k.exact] = null; } }
      else if (m[k.exact] !== desired) { patch[k.exact] = desired; local[k.exact] = desired; }
    }
    if (!Object.keys(patch).length) return;
    if (s) {
      const next = { ...m };
      Object.entries(local).forEach(([key, v]) => { if (v == null) delete next[key]; else next[key] = v; });
      s.memory = next; emit(s);
    }
    setDoc(doc(db, "companySettings", biz.company), { bizMemory: patch }, { merge: true }).catch((e) => console.warn("청구 사업자 기억 저장 실패:", e?.message || e));
  } catch (e) { console.warn("청구 사업자 기억 실패:", e?.message || e); }
}

// 훅 없이(저장 함수 안 등) — 이미 불러온 사업자 목록으로 기억
export function rememberBizFor(company, order, opts) {
  const co = String(company || "").trim(); const s = store.get(co);
  if (!co || !s || !s.list.length) return;
  const names = [co, ...s.list.map((b) => String(b.name).trim()).filter((n) => n && n !== co)];
  rememberBiz({ company: co, extra: s.list, memory: s.memory, names, multi: names.length > 1, defaultName: co }, order, opts);
}

// 계좌(정산 안내 이미지 등) — 추가 사업자면 그 사업자 계좌, 아니면 회사정보(transportApplications) 계좌
export function bankForBiz(companyBank, bizObj) {
  if (bizObj) return { 계좌은행: bizObj.bankName || "", 계좌번호: bizObj.bankNo || "", 예금주: bizObj.bankHolder || bizObj.name || "" };
  return { 계좌은행: companyBank?.계좌은행 || "", 계좌번호: companyBank?.계좌번호 || "", 예금주: companyBank?.예금주 || "" };
}

// 추가 사업자의 "사업자 정보" 카드 이미지(사업자등록증 이미지가 따로 없을 때 카톡으로 붙여넣기용) → PNG Blob
export async function bizInfoCardBlob(b) {
  const rows = [["상호", b.name], ["사업자등록번호", b.bizNo], ["대표자", b.ceo], ["사업장 주소", b.addr], ["업태 / 종목", [b.type, b.item].filter(Boolean).join(" / ")], ["전화 / 팩스", [b.phone, b.fax].filter(Boolean).join(" / ")], ["입금 계좌", b.bankName ? `${b.bankName} ${b.bankNo || ""} (${b.bankHolder || b.name})` : ""]].filter(([, v]) => String(v || "").trim());
  const W = 680, headerH = 70, rowH = 50, H = headerH + rows.length * rowH + 28;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#F7F9FC"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#0F1A30"; x.fillRect(0, 0, W, headerH);
  x.fillStyle = "#8FB0F0"; x.font = "bold 11px 'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif"; x.textAlign = "left"; x.fillText("BUSINESS  INFO", 28, 26);
  x.fillStyle = "#fff"; x.font = "bold 21px 'Malgun Gothic', sans-serif"; x.fillText(`${b.name} 사업자 정보`, 28, 54);
  rows.forEach(([l, v], i) => {
    const y = headerH + i * rowH;
    x.fillStyle = i % 2 ? "#FAFBFD" : "#fff"; x.fillRect(0, y, W, rowH);
    x.strokeStyle = "#E3E8F0"; x.beginPath(); x.moveTo(0, y + rowH); x.lineTo(W, y + rowH); x.stroke();
    x.fillStyle = "#5B6B85"; x.font = "14px 'Malgun Gothic', sans-serif"; x.textAlign = "left"; x.fillText(l, 28, y + rowH / 2 + 5);
    x.fillStyle = "#0F1A30"; x.font = "bold 15px 'Malgun Gothic', sans-serif"; x.textAlign = "right"; x.fillText(String(v), W - 28, y + rowH / 2 + 5);
  });
  if (b.seal) {
    try { const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = b.seal; }); x.globalAlpha = 0.9; x.drawImage(img, W - 92, 8, 56, 56); x.globalAlpha = 1; } catch { /* 직인 없이 */ }
  }
  return await new Promise((res) => c.toBlob(res, "image/png"));
}

const Ico = {
  chev: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
  search: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
};

// 청구 사업자 고르기 — 검색되는 드롭다운(글자 입력으로 거르기 · ↑/↓ · Enter · Esc)
//  · inline: 우클릭 메뉴처럼 목록을 항상 펼쳐 둔다(Esc → onClose)
//  · value: 사업자 이름("" = 기본). null이면 아무것도 체크하지 않음(여러 건 선택 등)
//  · auto: 자동으로 맞춰진 경우 그 이유(BIZ_SRC_LABEL 키) — 작은 "자동" 표시
export function BizSelect({ biz, value, onChange, className = "", auto = "", inline = false, onClose, id, autoFocus = false, size = "md" }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const names = biz?.names || [];
  const cur = value == null ? null : String(value || "").trim() || biz?.defaultName || "";
  const nq = normBizKey(q);
  const items = names.filter((n) => { if (!nq) return true; const b = biz.find(n); return normBizKey(n).includes(nq) || normBizKey(b?.bizNo).includes(nq) || normBizKey(b?.ceo).includes(nq); });
  const showList = inline || open;
  React.useEffect(() => { const el = listRef.current?.querySelector(`[data-idx="${active}"]`); el?.scrollIntoView?.({ block: "nearest" }); }, [active, showList]);
  React.useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);
  if (!biz?.multi) return null;
  const idxOfCur = Math.max(0, items.indexOf(cur));
  const pick = (n) => { onChange(n === biz.defaultName ? "" : n); setOpen(false); setQ(""); };
  const onKeyDown = (e) => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      if (!showList) { setOpen(true); setActive(idxOfCur); return; }
      setActive((i) => k === "ArrowDown" ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0));
    } else if (k === "Enter") {
      e.preventDefault(); e.stopPropagation();
      if (!showList) { setOpen(true); setActive(idxOfCur); return; }
      if (items[active]) pick(items[active]);
    } else if (k === "Escape") {
      e.preventDefault(); e.stopPropagation();
      if (inline) { if (q) { setQ(""); setActive(0); } else onClose?.(); return; }
      setOpen(false); setQ("");
    } else if (k === "Tab") { setOpen(false); setQ(""); }
  };
  const Row = (n, i) => {
    const b = biz.find(n); const on = cur === n; const act = i === active;
    return (
      <div key={n} data-idx={i} role="option" aria-selected={on} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(n); }}
        className={`flex items-center gap-2 px-2.5 ${size === "sm" ? "h-9" : "h-10"} cursor-pointer rounded-lg transition-colors ${act ? "bg-[#0F1A30] text-white" : "text-[#0F1A30] hover:bg-[#F2F5FA]"}`}>
        <span className={`w-4 shrink-0 ${on ? (act ? "text-[#8FB0F0]" : "text-[#2D4C82]") : "opacity-0"}`}>{Ico.check}</span>
        <span className="text-[13px] font-black whitespace-nowrap">{n}</span>
        {n === biz.defaultName && <span className={`shrink-0 px-1.5 h-[17px] inline-flex items-center rounded text-[9.5px] font-extrabold tracking-[0.14em] ${act ? "bg-white/15 text-white/80" : "bg-[#EEF2F8] text-[#5B6B85]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>MAIN</span>}
        <span className={`ml-auto shrink-0 text-[11px] tabular-nums ${act ? "text-white/60" : "text-[#9AA9C3]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{b?.bizNo || ""}</span>
      </div>
    );
  };
  const list = (
    <div ref={listRef} role="listbox" className={inline ? "mt-1.5 max-h-48 overflow-auto space-y-0.5" : "absolute left-0 top-full mt-1.5 z-[60] min-w-full w-max max-w-[min(420px,92vw)] max-h-60 overflow-auto rounded-xl border border-[#E3E8F0] bg-white p-1 shadow-[0_14px_34px_rgba(15,26,48,0.16)] space-y-0.5"}>
      {items.length ? items.map(Row) : <div className="px-3 py-2.5 text-[12.5px] font-semibold text-[#9AA9C3]">일치하는 사업자가 없습니다</div>}
    </div>
  );
  if (inline) {
    return (
      <div onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none">{Ico.search}</span>
          <input ref={inputRef} id={id} value={q} placeholder="사업자 검색 · ↑↓ Enter" autoComplete="off" role="combobox" aria-expanded="true"
            onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
            className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-[#DCE3EE] bg-[#F7F9FC] text-[12.5px] font-bold text-[#0F1A30] placeholder:text-[#A7B3C6] placeholder:font-medium outline-none focus:bg-white focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/15" />
        </div>
        {list}
      </div>
    );
  }
  return (
    <div className="relative">
      <input ref={inputRef} id={id} data-arrownav role="combobox" aria-expanded={open} autoComplete="off"
        value={open ? q : cur || ""} placeholder={open ? (cur || "사업자 검색") : ""}
        onFocus={() => { setOpen(true); setQ(""); setActive(idxOfCur); }}
        onClick={() => { if (!open) { setOpen(true); setActive(idxOfCur); } }}
        onBlur={() => { setOpen(false); setQ(""); }}
        onChange={(e) => { const t = e.target.value; const base = cur || ""; setQ(!open && base && t.startsWith(base) ? t.slice(base.length) : t); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown} title={auto ? `자동: ${BIZ_SRC_LABEL[auto] || "자동으로 맞춰졌어요"} (바꿀 수 있어요)` : "청구 사업자 — 글자를 쳐서 찾고 ↑↓ Enter"}
        className={`${className} cursor-pointer !pr-[68px]`} />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
        {auto && !open && <span className="px-1.5 h-[18px] inline-flex items-center rounded-md bg-[#EEF3FC] border border-[#D5E0F5] text-[10px] font-extrabold text-[#2D4C82]">자동</span>}
        <span className={`text-[#7A8AA6] transition-transform ${open ? "rotate-180" : ""}`}>{Ico.chev}</span>
      </span>
      {open && list}
    </div>
  );
}

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
          <div className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>BUSINESS ENTITIES</div>
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
            <span className="text-[12px] text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{b.bizNo || "사업자번호 없음"}</span>
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
              <div className="col-span-2">{F("name", "상호(사업자 이름) *", "예) ○○물류")}</div>
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
export function BizScope({ company, data, children, label = "매출 사업자", extra = null }) {
  const biz = useCompanyBiz(company);
  const [sel, setSel] = React.useState("");
  const rows = React.useMemo(() => (!biz.multi || !sel ? data || [] : (data || []).filter((r) => bizOf(r, biz.defaultName) === sel)), [data, sel, biz]);
  return (
    <>
      {biz.multi && (
        <div className="mb-3 flex items-center gap-3 flex-wrap rounded-2xl px-4 py-2.5 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <span className="text-[10.5px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>BUSINESS</span>
          <span className="text-[12.5px] font-black text-white/80">{label}</span>
          <div className="inline-flex p-0.5 rounded-xl bg-white/10 border border-white/15 overflow-x-auto">
            {["", ...biz.names].map((n) => (
              <button key={n || "all"} type="button" onClick={() => setSel(n)} className={`h-8 px-3.5 rounded-lg text-[12.5px] font-black whitespace-nowrap transition ${sel === n ? "bg-white text-[#0F1A30]" : "text-white/75 hover:text-white"}`}>{n || "전체"}</button>
            ))}
          </div>
          {extra && <div className="ml-auto">{extra}</div>}
        </div>
      )}
      {!biz.multi && extra && <div className="mb-3 flex justify-end">{extra}</div>}
      {children(rows, sel)}
    </>
  );
}
