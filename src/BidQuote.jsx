// ======================= src/BidQuote.jsx =======================
// 🧮 2026-11-23 단가표 › 입찰견적 — 업체 견적 양식(엑셀 파일 · 복사한 표)을 넣으면 칸마다 원가 · 권장가 · 마진을 계산하고 이상한 단가를 알려준다
//  · 5단계(이전 / 다음): ① 표 넣기 → ② 조건 → ③ 거리 → ④ 단가 검토 → ⑤ 제출 · 결과 — 한 화면이 길게 늘어나지 않게(2026-11-23 사용자 요청)
//  · 저장: bidQuotes(입찰 한 건 = 문서 하나, companyName) · bidCostProfiles(회사별 할증 · 마진 기본값, companyName)
//  · 원본 엑셀 파일은 서버에 올리지 않는다(화주 정보 보호) — 이 화면을 연 동안만 기억하고, 단가를 써넣어 바로 내려받는다
//  · 계산은 src/bidQuoteCore.js, 엑셀 읽기 · 쓰기는 src/bidExcel.js(둘 다 node 테스트) — 이 파일은 화면만
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { kpConfirm } from "./kpDialog";
import { runDelete } from "./DeleteProgress";
import { getDrivingRoute } from "./tmapFareCalc";
import {
  BID_DEFAULTS, CARGO_TYPES, LEVEL_TEXT, splitPasted, parseBidGrid, mergeVolumes, evaluateBid, fillBids, adjustBids,
  bidToTsv, historyStats, targetOf, isBackhaulAddr, money, fmtWon, fmtPct, tonForKg, tonForPallet,
  findTables, carryOverDests, similarProject, resultInsight,
} from "./bidQuoteCore";

const card = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const boxInput = "w-full h-10 px-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] text-[13.5px] font-semibold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-medium focus:bg-white focus:outline-none transition";
const smallInput = "h-8 px-2.5 rounded-lg bg-[#F5F8FD] border border-[#E3E8F0] text-[12.5px] font-semibold text-[#0F1A30] placeholder:text-[#9AA9C3] placeholder:font-medium focus:bg-white focus:outline-none";
const btn = "h-9 px-3.5 rounded-xl bg-white border border-[#DCE3EF] text-[#1B2B4B] text-[12.5px] font-bold hover:bg-[#F5F8FD] transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const btnDark = "h-9 px-4 rounded-xl bg-[#1B2B4B] text-white text-[12.5px] font-bold hover:bg-[#2D4C82] transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
const STATUS = ["작성중", "제출", "낙찰", "탈락"];
const STEPS = [["input", "표 넣기"], ["cond", "조건"], ["dist", "거리"], ["review", "단가 검토"], ["submit", "제출 · 결과"]];
// 신호 색 — 네이비 계열 화면에 맞춰 옅게
const LV = {
  loss: { dot: "#D64545", bg: "#FDECEC", tx: "#B42318" },
  thin: { dot: "#E58A2B", bg: "#FEF3E6", tx: "#B54708" },
  low: { dot: "#D9B02B", bg: "#FFF9E5", tx: "#8A6A00" },
  ok: { dot: "#2E9E6A", bg: "#ECF8F2", tx: "#18794E" },
  high: { dot: "#4B6CB7", bg: "#EEF3FB", tx: "#2D4C82" },
  none: { dot: "#C4CDDC", bg: "#FFFFFF", tx: "#8796AE" },
  nokm: { dot: "#C4CDDC", bg: "#F7F8FA", tx: "#8796AE" },
};
const WARN_TAG = { loss: "손해", thin: "마진", order: "순서", rule: "할증", km: "거리" };
const emptyProject = (co) => ({
  companyName: co, title: "", client: "", dueDate: "", status: "작성중", note: "",
  origin: "", originAddress: "", mode: "독차", sizeKind: "ton", destOn: "col",
  opts: { cargo: "일반", handwork: false, forklift: 0, allIn: false, port: false, extraPerCase: 0, targetMargin: "", rulePct: "" },
  dests: [], sizes: [], cells: {}, source: null, result: { gapPct: "", memo: "" },
});
const PROFILE_FIELDS = [
  ["마진", [["targetMargin", "권장가 마진", "%"], ["aggressiveMargin", "공격가 마진", "%"], ["minMargin", "하한가 마진", "%"], ["roundUnit", "올림 단위", "원"]]],
  ["원가 기준", [["tableToCost", "거리 요율 → 기사운임", "%"], ["histMax", "실적 반영 최대", "%"]]],
  ["화물 할증", [["dangerPct", "위험물", "%"], ["coldPct", "냉장", "%"], ["frozenPct", "냉동", "%"], ["hvacPct", "냉난방", "%"]]],
  ["작업 비용", [["handworkCase", "수작업 건당", "원"], ["handworkPerTon", "수작업 톤당", "원"], ["forkliftEach", "지게차 1회", "원"], ["portWait", "항만 · 보세 대기", "원"]]],
  ["ALL-IN 기대비용", [["nightPct", "야간 할증", "%"], ["nightShare", "야간 발생 비율", "%"], ["holidayPct", "휴일 할증", "%"], ["holidayShare", "휴일 발생 비율", "%"]]],
  ["지역", [["backhaulPct", "귀로 어려운 지역", "%"]]],
  ["혼적(LCL)", [["mixRefTon", "기준 차량", "톤"], ["mixLoad", "평균 적재율", "%"], ["mixMinShare", "최소 차지 비율", "%"], ["mixFixed", "집하 · 배송 고정비", "원"]]],
];
// 원본 엑셀 파일 — 서버에 올리지 않고 이 화면을 연 동안만(입찰 id → { name, buffer })
const FILES = new Map();
const readBuf = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsArrayBuffer(file); });
const saveBlob = (buf, name) => {
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 3000);
};

function Seg({ value, onChange, items, size = "md" }) {
  return (
    <div className="flex p-1 rounded-xl bg-[#EEF2F8] gap-1">
      {items.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`flex-1 ${size === "sm" ? "h-7 text-[12px]" : "h-8 text-[12.5px]"} px-2 rounded-[9px] font-bold transition whitespace-nowrap ${value === v ? "bg-white text-[#0F1A30] shadow-[0_2px_8px_rgba(15,26,48,0.14)]" : "text-[#5B6B85] hover:text-[#0F1A30]"}`}>{l}</button>
      ))}
    </div>
  );
}
function Check({ on, onChange, label, sub }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`flex items-start gap-2 text-left px-3 py-2 rounded-xl border transition ${on ? "border-[#2D4C82] bg-[#EEF3FB]" : "border-[#E3E8F0] bg-white hover:bg-[#F5F8FD]"}`}>
      <span className={`mt-0.5 w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 ${on ? "bg-[#1B2B4B] border-[#1B2B4B]" : "border-[#B8C3D6] bg-white"}`}>
        {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 12l5 5L20 7" /></svg>}
      </span>
      <span><span className="block text-[12.5px] font-bold text-[#0F1A30]">{label}</span>{sub && <span className="block text-[11px] text-[#7A8AA5] mt-0.5">{sub}</span>}</span>
    </button>
  );
}
const Label = ({ children }) => <div className="text-[11.5px] font-bold text-[#3A4A66] mb-1">{children}</div>;
const numIn = (v) => (v === "" || v == null ? "" : Number(String(v).replace(/[^\d.-]/g, "")) || 0);
const StepTitle = ({ title, sub }) => (
  <div className="mb-4">
    <div className="text-[16px] font-black text-[#0F1A30]">{title}</div>
    {sub && <div className="text-[12.5px] text-[#5B6B85] mt-0.5 break-keep">{sub}</div>}
  </div>
);

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-[20px] shadow-2xl w-full ${wide ? "max-w-[760px]" : "max-w-[520px]"} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEF2F8]">
          <div className="text-[16px] font-black text-[#0F1A30]">{title}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#F5F8FD] text-[#5B6B85] text-[18px]">×</button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function BidQuote({ dispatchData = [], userCompany = "", clients = [] }) {
  const co = (userCompany || "").trim();
  const [list, setList] = useState([]);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileDoc, setProfileDoc] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(null); // "grid" | "vol"
  const [step, setStep] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  const [view, setView] = useState("bid"); // bid | rec | cost | margin
  const [side, setSide] = useState("detail"); // detail | warns
  const [focus, setFocus] = useState(null);
  const [kmBusy, setKmBusy] = useState(false);
  const [adjPct, setAdjPct] = useState(-3);
  const [toast, setToast] = useState("");
  const [book, setBook] = useState(null); // 방금 올린 엑셀 { name, buffer, tables: [{ sheet, ...grid }] }
  const [fileBusy, setFileBusy] = useState(false);
  const saveTimer = useRef(null);
  const fileRef = useRef(null);
  const reFileRef = useRef(null);

  // ── 불러오기 ──
  useEffect(() => {
    if (!co) { setList([]); return; }
    const un1 = onSnapshot(query(collection(db, "bidQuotes"), where("companyName", "==", co)), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
      setList(rows);
    }, (e) => console.error("bidQuotes", e));
    const un2 = onSnapshot(query(collection(db, "bidCostProfiles"), where("companyName", "==", co)), (snap) => {
      setProfileDoc(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    }, (e) => console.error("bidCostProfiles", e));
    return () => { un1(); un2(); };
  }, [co]);
  const P = useMemo(() => {
    const out = { ...BID_DEFAULTS };
    Object.keys(BID_DEFAULTS).forEach((k) => { const v = profileDoc?.values?.[k]; if (v !== undefined && v !== "") out[k] = typeof BID_DEFAULTS[k] === "number" ? Number(v) || 0 : v; });
    return out;
  }, [profileDoc]);

  // 선택한 문서 → 편집본(편집 중이면 덮어쓰지 않는다)
  useEffect(() => {
    if (!selId) return;
    const d = list.find((x) => x.id === selId);
    if (d && !dirty) setDraft({ ...emptyProject(co), ...d, opts: { ...emptyProject(co).opts, ...(d.opts || {}) }, result: { gapPct: "", memo: "", ...(d.result || {}) } });
  }, [selId, list]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch) => { setDraft((d) => ({ ...d, ...(typeof patch === "function" ? patch(d) : patch) })); setDirty(true); };
  const changeOpt = (k, v) => change((d) => ({ opts: { ...d.opts, [k]: v } }));
  // 1.5초 멈추면 자동 저장
  useEffect(() => {
    if (!dirty || !draft?.id) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 1500);
    return () => clearTimeout(saveTimer.current);
  }, [draft, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(d = draft) {
    if (!d) return;
    setSaving(true);
    const { id, createdAt, updatedAt, ...data } = d; // eslint-disable-line no-unused-vars
    try {
      if (id) await updateDoc(doc(db, "bidQuotes", id), { ...data, companyName: co, updatedAt: serverTimestamp() });
      else {
        const ref = await addDoc(collection(db, "bidQuotes"), { ...data, companyName: co, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        setDraft((x) => ({ ...x, id: ref.id })); setSelId(ref.id);
      }
      setDirty(false);
    } catch (e) { console.error(e); flash("저장하지 못했어요. [저장]을 다시 눌러 주세요"); }
    setSaving(false);
  }
  const narrow = () => typeof window !== "undefined" && window.innerWidth < 1280;
  function flash(t) { setToast(t); setTimeout(() => setToast(""), 2800); }

  async function createNew() {
    if (dirty) await save();
    const p = emptyProject(co);
    p.title = `입찰견적 ${new Date().toLocaleDateString("ko-KR")}`;
    try {
      const ref = await addDoc(collection(db, "bidQuotes"), { ...p, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setDirty(false); setSelId(ref.id); setDraft({ ...p, id: ref.id }); setStep(0); setFocus(null); setBook(null);
      if (narrow()) setListOpen(false);
    } catch (e) { console.error(e); flash("만들지 못했어요"); }
  }
  async function openOne(id) {
    if (dirty) await save();
    const d = list.find((x) => x.id === id);
    setDirty(false); setFocus(null); setSelId(id); setBook(null);
    setStep(!d?.sizes?.length ? 0 : 3);
    if (narrow()) setListOpen(false);
  }
  async function removeOne(item) {
    if (!(await kpConfirm(`"${item.title || "입찰견적"}"을 지울까요?`, { title: "입찰견적 삭제", okText: "삭제", danger: true }))) return;
    await runDelete({ label: "입찰견적", task: () => deleteDoc(doc(db, "bidQuotes", item.id)) });
    FILES.delete(item.id);
    if (selId === item.id) { setSelId(null); setDraft(null); setDirty(false); }
  }
  async function duplicate() {
    if (!draft) return;
    const { id, createdAt, updatedAt, ...data } = draft; // eslint-disable-line no-unused-vars
    const ref = await addDoc(collection(db, "bidQuotes"), { ...data, title: `${data.title || "입찰견적"} (사본)`, status: "작성중", result: { gapPct: "", memo: "" }, companyName: co, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (FILES.has(id)) FILES.set(ref.id, FILES.get(id));
    setDirty(false); setSelId(ref.id); flash("사본을 만들었어요");
  }

  // ── 실적(예전 오더) ──
  const histFn = useMemo(() => {
    if (!draft) return null;
    const cache = new Map();
    return (s, d) => {
      if (draft.mode === "혼적") return null;
      const ton = draft.sizeKind === "ton" ? Number(s.value) || null : draft.sizeKind === "pallet" ? tonForPallet(s.value || 1) : tonForKg(s.value || 1000);
      const k = `${d.label}|${ton}`;
      if (!cache.has(k)) cache.set(k, historyStats(dispatchData, { dest: d.label, origin: draft.origin, ton }));
      return cache.get(k);
    };
  }, [dispatchData, draft?.mode, draft?.sizeKind, draft?.origin, draft?.dests]); // eslint-disable-line react-hooks/exhaustive-deps
  const destHist = useMemo(() => {
    const m = {};
    (draft?.dests || []).forEach((d) => { m[d.label] = dispatchData.length ? historyStats(dispatchData, { dest: d.label, origin: draft.origin }).n : 0; });
    return m;
  }, [dispatchData, draft?.dests?.map((d) => d.label).join("|"), draft?.origin]); // eslint-disable-line react-hooks/exhaustive-deps
  const ev = useMemo(() => (draft && draft.sizes?.length && draft.dests?.length ? evaluateBid(draft, P, histFn) : null), [draft, P, histFn]);
  const insight = useMemo(() => (draft ? resultInsight(list, draft.client, draft.id) : null), [list, draft?.client, draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 표 넣기(붙여넣기 · 엑셀) ──
  function guessAddress(label) {
    const k = String(label || "").replace(/\s|\(.*?\)|공장|본사|연구소|센터/g, "");
    if (k.length < 2) return "";
    const c = (clients || []).find((x) => x.주소 && String(x.거래처명 || "").replace(/\s/g, "").includes(k));
    if (c) return c.주소;
    const o = (dispatchData || []).find((r) => r.하차지주소 && String(r.하차지명 || "").replace(/\s/g, "").includes(k));
    return o?.하차지주소 || "";
  }
  // 읽은 표 → 입찰견적 한 건의 내용(지난 입찰에서 주소 · 거리 이어 받기 = 양식 기억)
  function projectFromGrid(base, g, meta = {}) {
    const others = list.filter((x) => x.id !== base.id);
    let dests = g.dests.map((x) => {
      const old = (base.dests || []).find((o) => o.label === x.label);
      return old ? { ...x, address: old.address, km: old.km, backhaul: old.backhaul } : x;
    });
    const carried = carryOverDests(dests, others);
    dests = carried.dests.map((d) => {
      const address = d.address || guessAddress(d.label);
      return { ...d, address, backhaul: d.backhaul || isBackhaulAddr(address, P) };
    });
    const sim = similarProject(dests, others);
    const defaultTitle = !base.title || /^입찰견적 \d/.test(base.title);
    const origin = base.origin || meta.origin || "";
    const next = {
      ...base, ...g, dests,
      title: defaultTitle && meta.title ? meta.title.replace(/^\s*\d+\)\s*/, "") : base.title,
      origin,
      originAddress: base.originAddress || (sim && sim.origin === origin ? sim.originAddress : "") || "",
      client: base.client || sim?.client || "",
      mode: meta.mode || (g.sizeKind === "weight" && /혼적|lcl/i.test(base.title) ? "혼적" : base.mode),
      source: meta.sheet ? { fileName: meta.fileName, sheet: meta.sheet, title: meta.title || "", addrs: g.addrs } : null,
    };
    ["headStart", "headRow", "endRow", "addrs", "labelCols", "hasVolume", "sheet"].forEach((k) => { delete next[k]; });
    return { next, carried: carried.hit, sim };
  }
  function applyPaste(text, kind, opt) {
    const rows = splitPasted(text);
    if (kind === "vol") { change((d) => mergeVolumes(d, rows)); flash("물량을 넣었어요"); return true; }
    const g = parseBidGrid(rows, opt);
    if (!g || !g.sizes.length || !g.dests.length) { flash("표를 읽지 못했어요. 머리줄(도착지 · 톤수)까지 같이 복사해 주세요"); return false; }
    const { next, carried } = projectFromGrid(draft, g, {});
    setDraft(next); setDirty(true); setFocus(null);
    flash(`도착지 ${g.dests.length}곳 · 규격 ${g.sizes.length}개를 읽었어요${g.hasVolume ? " (물량도 함께)" : ""}${carried ? ` · 지난 입찰에서 ${carried}곳 거리를 가져왔어요` : ""}`);
    return true;
  }
  async function onPickFile(file) {
    if (!file) return;
    setFileBusy(true);
    try {
      const buffer = await readBuf(file);
      const { readWorkbook } = await import("./bidExcel");
      const sheets = await readWorkbook(buffer.slice(0));
      const tables = [];
      sheets.forEach((s) => findTables(s.aoa).forEach((t) => tables.push({ sheet: s.name, ...t })));
      setBook({ name: file.name, buffer, tables });
      if (!tables.length) flash("이 파일에서 단가표 모양을 찾지 못했어요. 표를 복사해 붙여 넣어 주세요");
    } catch (e) { console.error(e); flash("엑셀 파일을 열지 못했어요(.xlsx 파일만 돼요)"); }
    setFileBusy(false);
  }
  function pickTable(t) {
    const { next, carried } = projectFromGrid(draft, t, { sheet: t.sheet, fileName: book.name, title: t.title, origin: t.origin, mode: t.mode });
    FILES.set(draft.id, { name: book.name, buffer: book.buffer });
    setDraft(next); setDirty(true); setFocus(null);
    flash(`"${t.title || t.sheet}" 표로 시작해요${carried ? ` · 지난 입찰에서 ${carried}곳 거리를 가져왔어요` : ""}`);
  }
  async function makeAllTables() {
    if (!book?.tables?.length) return;
    if (!(await kpConfirm(`표 ${book.tables.length}개를 입찰견적 ${book.tables.length}개로 나눠 만들까요? 지금 화면에는 첫 번째 표가 들어가요.`, { title: "표마다 따로 만들기", okText: "만들기" }))) return;
    const [first, ...rest] = book.tables;
    for (const t of rest) {
      const base = { ...emptyProject(co), client: draft.client, dueDate: draft.dueDate, opts: { ...draft.opts } };
      const { next } = projectFromGrid(base, t, { sheet: t.sheet, fileName: book.name, title: t.title, origin: t.origin, mode: t.mode });
      const { id, ...data } = next; // eslint-disable-line no-unused-vars
      const ref = await addDoc(collection(db, "bidQuotes"), { ...data, companyName: co, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      FILES.set(ref.id, { name: book.name, buffer: book.buffer });
    }
    pickTable(first);
    flash(`입찰견적 ${book.tables.length}개를 만들었어요. 왼쪽 목록에서 하나씩 열면 돼요`);
  }

  // ── 거리 ──
  async function calcAllKm() {
    if (!draft.originAddress) { flash("출발지 주소를 먼저 적어 주세요"); return; }
    setKmBusy(true);
    let okN = 0, ngN = 0;
    const dests = [...draft.dests];
    for (let i = 0; i < dests.length; i++) {
      const d = dests[i];
      if (!d.address) { ngN++; continue; }
      const r = await getDrivingRoute(draft.originAddress, d.address).catch(() => null);
      if (r?.km) { dests[i] = { ...d, km: Math.round(r.km) }; okN++; } else ngN++;
    }
    change({ dests });
    setKmBusy(false);
    flash(`거리 ${okN}곳 계산${ngN ? ` · ${ngN}곳은 주소를 확인해 주세요` : ""}`);
  }
  const setDest = (key, patch) => change((d) => ({ dests: d.dests.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const setCell = (key, patch) => change((d) => ({ cells: { ...d.cells, [key]: { ...(d.cells?.[key] || {}), ...patch } } }));

  // ── 내보내기 ──
  async function copyTsv() {
    const t = bidToTsv(draft, { withLabels: false });
    try { await navigator.clipboard.writeText(t); flash("복사했어요. 원래 양식의 첫 단가 칸을 누르고 붙여 넣으면 돼요"); }
    catch { flash("복사하지 못했어요. 브라우저 권한을 확인해 주세요"); }
  }
  async function downloadXlsx() {
    const XLSX = await import("xlsx");
    const rows = splitPasted(bidToTsv(draft, { withLabels: true })).map((r, i) => r.map((c, j) => (i && j && c ? Number(c) : c)));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "입찰단가");
    XLSX.writeFile(wb, `${draft.title || "입찰견적"}.xlsx`);
  }
  async function writeOriginal(fileFromPicker) {
    const src = draft.source;
    if (!src?.addrs) return;
    let f = FILES.get(draft.id);
    if (fileFromPicker) {
      const buffer = await readBuf(fileFromPicker);
      f = { name: fileFromPicker.name, buffer };
      FILES.set(draft.id, f);
    }
    if (!f) { reFileRef.current?.click(); return; }
    try {
      const { writeBids } = await import("./bidExcel");
      const values = {};
      Object.entries(src.addrs).forEach(([k, a]) => { const b = money(draft.cells?.[k]?.bid); if (b) values[a] = b; });
      const { buffer, count } = await writeBids(f.buffer.slice(0), src.sheet, values);
      saveBlob(buffer, f.name.replace(/\.xlsx$/i, "") + "_단가입력.xlsx");
      flash(`원본 양식 "${src.sheet}" 시트에 단가 ${count}칸을 넣었어요`);
    } catch (e) { console.error(e); flash(e?.message || "원본 파일에 쓰지 못했어요. 같은 파일인지 확인해 주세요"); }
  }

  // ── 표 방향(원래 양식 그대로) ──
  const rowsArr = draft ? (draft.destOn === "row" ? draft.dests : draft.sizes) : [];
  const colsArr = draft ? (draft.destOn === "row" ? draft.sizes : draft.dests) : [];
  const keyOf = (r, c) => (draft.destOn === "row" ? `${c.key}|${r.key}` : `${r.key}|${c.key}`);
  const focusInfo = focus && ev?.cells[focus];
  const focusSize = focus && draft?.sizes.find((s) => s.key === focus.split("|")[0]);
  const focusDest = focus && draft?.dests.find((d) => d.key === focus.split("|")[1]);
  const kmMissing = draft ? draft.dests.filter((d) => !d.km).length : 0;
  const emptyBids = ev ? Object.values(ev.cells).filter((c) => !c.bid).length : 0;
  const stepDone = draft ? [draft.sizes.length > 0, true, draft.dests.length > 0 && kmMissing === 0, emptyBids === 0 && !!ev, ["제출", "낙찰", "탈락"].includes(draft.status)] : [];
  const goStep = (i) => { setStep(Math.max(0, Math.min(STEPS.length - 1, i))); window.scrollTo?.({ top: 0, behavior: "smooth" }); };

  if (!co) return <div className="p-6 text-[13px] text-[#5B6B85]">회사 정보를 불러오는 중이에요.</div>;

  return (
    <div className={`grid grid-cols-1 ${listOpen ? "xl:grid-cols-[240px_1fr]" : ""} gap-4 items-start`}>
      {/* ── 왼쪽: 저장된 입찰견적 ── */}
      {listOpen && (
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-[#EEF2F8]">
            <div className="text-[14px] font-black text-[#0F1A30]">입찰견적 <span className="text-[#8796AE] font-bold">{list.length}</span></div>
            <div className="flex items-center gap-1">
              <button onClick={createNew} className={btnDark}>+ 새로</button>
              {draft && <button onClick={() => setListOpen(false)} title="목록 접기" className="w-8 h-9 rounded-xl text-[#5B6B85] hover:bg-[#F5F8FD] font-bold">‹</button>}
            </div>
          </div>
          <div className="max-h-[260px] xl:max-h-[62vh] overflow-y-auto">
            {list.length === 0 && <div className="px-4 py-6 text-[12.5px] text-[#7A8AA5] leading-relaxed break-keep">업체에서 받은 견적 양식을 넣으면 칸마다 적정 단가를 계산해 드려요. [+ 새로]를 눌러 시작하면 돼요.</div>}
            {list.map((it) => (
              <div key={it.id} onClick={() => openOne(it.id)}
                className={`px-4 py-3 border-b border-[#F1F4F9] cursor-pointer group ${selId === it.id ? "bg-[#EEF3FB]" : "hover:bg-[#F8FAFD]"}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[#0F1A30] truncate flex-1">{it.title || "입찰견적"}</span>
                  <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${it.status === "낙찰" ? "bg-[#ECF8F2] text-[#18794E]" : it.status === "탈락" ? "bg-[#F2F4F7] text-[#667085]" : it.status === "제출" ? "bg-[#EEF3FB] text-[#2D4C82]" : "bg-[#FFF9E5] text-[#8A6A00]"}`}>{it.status || "작성중"}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-[#7A8AA5]">
                  <span className="truncate flex-1">{[it.client, it.dueDate && `마감 ${it.dueDate}`].filter(Boolean).join(" · ") || `${(it.dests || []).length}곳 × ${(it.sizes || []).length}구간`}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeOne(it); }} className="opacity-0 group-hover:opacity-100 text-[#B42318] font-bold">삭제</button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-[#EEF2F8]">
            <button onClick={() => setProfileOpen(true)} className={`${btn} w-full`}>할증 · 마진 기본값 설정</button>
          </div>
        </div>
      )}

      {/* ── 오른쪽: 단계별 편집 ── */}
      {!draft ? (
        <div className={`${card} p-8 text-center`}>
          <div className="text-[16px] font-black text-[#0F1A30]">입찰 단가, 원가부터 따져 볼까요?</div>
          <p className="text-[13px] text-[#5B6B85] mt-2 leading-relaxed break-keep">
            ① 업체 견적 엑셀을 올려요 → ② 화물 조건을 골라요 → ③ 거리를 넣어요 → ④ 칸마다 원가 · 마진을 보고 단가를 정해요 → ⑤ 원래 양식에 넣어 받아요
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <button onClick={createNew} className={btnDark}>+ 새 입찰견적</button>
            <button onClick={() => setProfileOpen(true)} className={btn}>할증 · 마진 기본값</button>
          </div>
        </div>
      ) : (
        <div className={`${card} min-w-0 flex flex-col`}>
          {/* 머리: 이름 · 저장 · 단계 */}
          <div className="px-4 md:px-5 pt-4 pb-3 border-b border-[#EEF2F8]">
            <div className="flex items-center gap-2 flex-wrap">
              {!listOpen && <button onClick={() => setListOpen(true)} className={btn} title="목록 펼치기">› 목록</button>}
              <input value={draft.title} onChange={(e) => change({ title: e.target.value })} placeholder="입찰 이름(예: 2027 KCC 수입 LCL)"
                className="flex-1 min-w-[180px] text-[17px] font-black text-[#0F1A30] bg-transparent border-0 border-b-2 border-transparent focus:border-[#DCE3EE] focus:outline-none py-1" />
              <span className="text-[11.5px] font-bold text-[#8796AE]">{saving ? "저장 중…" : dirty ? "저장 전" : "저장됨"}</span>
              <button onClick={duplicate} className={btn}>사본</button>
              <button onClick={() => save()} disabled={!dirty || saving} className={btnDark}>저장</button>
            </div>
            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-0.5">
              {STEPS.map(([k, l], i) => (
                <button key={k} onClick={() => goStep(i)}
                  className={`flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-xl text-[12.5px] font-bold whitespace-nowrap transition ${step === i ? "bg-[#1B2B4B] text-white" : "bg-[#F5F8FD] text-[#5B6B85] hover:text-[#0F1A30]"}`}>
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11.5px] ${step === i ? "bg-white/15" : stepDone[i] ? "bg-[#ECF8F2] text-[#18794E]" : "bg-white text-[#8796AE]"}`}>{stepDone[i] && step !== i ? "✓" : i + 1}</span>{l}
                  {k === "dist" && kmMissing > 0 && draft.dests.length > 0 && <span className={`text-[10.5px] px-1.5 rounded-md ${step === i ? "bg-white/15" : "bg-[#FEF3E6] text-[#B54708]"}`}>{kmMissing}</span>}
                  {k === "review" && ev?.warns.length > 0 && <span className={`text-[10.5px] px-1.5 rounded-md ${step === i ? "bg-white/15" : "bg-[#FDECEC] text-[#B42318]"}`}>{ev.warns.length}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 몸통: 지금 단계만 */}
          <div className="p-4 md:p-5 min-h-[420px]">
            {/* ① 표 넣기 */}
            {step === 0 && (
              <div>
                <StepTitle title="업체 견적 양식을 넣어 주세요" sub="엑셀 파일을 그대로 올리면 시트 안의 단가표를 모두 찾아요. 파일이 없으면 표를 복사해 붙여 넣어도 돼요." />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button onClick={() => fileRef.current?.click()} disabled={fileBusy} className="text-left rounded-2xl border-2 border-dashed border-[#C9D4E5] hover:border-[#2D4C82] hover:bg-[#F8FAFD] p-5 transition">
                    <div className="text-[14.5px] font-black text-[#0F1A30]">{fileBusy ? "파일 읽는 중…" : "엑셀 파일 올리기"}</div>
                    <div className="text-[12px] text-[#5B6B85] mt-1 break-keep">받은 .xlsx 그대로 올리면 돼요. 나중에 단가를 원래 칸에 넣어 다시 받을 수 있어요. 파일은 서버에 올라가지 않아요.</div>
                  </button>
                  <button onClick={() => setPasteOpen("grid")} className="text-left rounded-2xl border-2 border-dashed border-[#C9D4E5] hover:border-[#2D4C82] hover:bg-[#F8FAFD] p-5 transition">
                    <div className="text-[14.5px] font-black text-[#0F1A30]">복사해서 붙여넣기</div>
                    <div className="text-[12px] text-[#5B6B85] mt-1 break-keep">엑셀 · 메일에서 표를 머리줄까지 드래그해 복사(Ctrl+C)한 뒤 붙여 넣어요.</div>
                  </button>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
                {book && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <div className="text-[13px] font-black text-[#0F1A30]">{book.name} — 단가표 {book.tables.length}개를 찾았어요</div>
                      {book.tables.length > 1 && <button onClick={makeAllTables} className={btn}>표마다 따로 만들기</button>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                      {book.tables.map((t, i) => (
                        <div key={i} className="rounded-xl border border-[#E3E8F0] p-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold text-[#0F1A30] truncate">{t.title || `표 ${i + 1}`}</div>
                            <div className="text-[11.5px] text-[#5B6B85] mt-0.5">
                              시트 {t.sheet} · 도착지 {t.dests.length}곳 × {t.sizeKind === "ton" ? "톤수" : t.sizeKind === "pallet" ? "파렛" : "중량"} {t.sizes.length}개
                              {t.hasVolume ? " · 물량 있음" : ""}{Object.values(t.cells).some((c) => c.prev) ? " · 단가 채워짐" : " · 빈 양식"}
                            </div>
                            <div className="text-[11.5px] text-[#8796AE]">{[t.origin && `출발 ${t.origin}`, t.mode].filter(Boolean).join(" · ")}</div>
                          </div>
                          <button onClick={() => pickTable(t)} className={btnDark}>이 표로</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {draft.sizes.length > 0 && (
                  <div className="mt-4 rounded-xl bg-[#F5F8FD] px-4 py-3 text-[12.5px] text-[#0F1A30] flex items-center gap-3 flex-wrap">
                    <span className="font-black">지금 들어간 표</span>
                    <span>도착지 {draft.dests.length}곳 × 규격 {draft.sizes.length}개 ({draft.destOn === "row" ? "도착지가 세로" : "도착지가 가로"})</span>
                    {draft.source?.sheet && <span className="text-[#2D4C82] font-bold">원본 연결: {draft.source.fileName} › {draft.source.sheet}</span>}
                    <button onClick={() => setPasteOpen("vol")} className={`${btn} h-8 ml-auto`}>물량만 따로 붙여넣기</button>
                  </div>
                )}
              </div>
            )}

            {/* ② 조건 */}
            {step === 1 && (
              <div>
                <StepTitle title="화주 · 화물 조건" sub="고른 조건은 모든 칸 원가에 바로 반영돼요. 표 줄 이름에 '냉난방'처럼 적힌 줄은 그 줄만 할증이 붙어요." />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label>화주(업체)</Label><input className={boxInput} value={draft.client} onChange={(e) => change({ client: e.target.value })} placeholder="예: KCC" /></div>
                  <div><Label>제출 마감</Label><input type="date" className={boxInput} value={draft.dueDate} onChange={(e) => change({ dueDate: e.target.value })} /></div>
                  <div><Label>운송 형태</Label><Seg value={draft.mode} onChange={(v) => change({ mode: v })} items={[["독차", "독차"], ["혼적", "혼적(LCL)"]]} /></div>
                  <div><Label>규격 기준</Label><Seg value={draft.sizeKind} onChange={(v) => change({ sizeKind: v })} items={[["ton", "톤수"], ["weight", "중량"], ["pallet", "파렛"]]} /></div>
                </div>
                <div className="mt-4"><Label>화물 종류</Label><div className="max-w-[480px]"><Seg value={draft.opts.cargo} onChange={(v) => changeOpt("cargo", v)} items={CARGO_TYPES.map((c) => [c, c])} /></div></div>
                {draft.opts.cargo === "위험물" && <div className="mt-2 text-[12px] font-bold text-[#B54708]">⚠ 위험물은 운반업 허가 차량만 배차할 수 있어요. 허가 차량 기사님 운임으로 원가를 확인해 주세요.</div>}
                <div className="mt-4"><Label>작업 · 운영 조건</Label>
                  <div className="flex flex-wrap gap-2 items-stretch">
                    <Check on={draft.opts.handwork} onChange={(v) => changeOpt("handwork", v)} label="수작업" sub={`건당 ${fmtWon(P.handworkCase)} + 톤당 ${fmtWon(P.handworkPerTon)}원`} />
                    <div className="flex items-center gap-1.5 px-3 rounded-xl border border-[#E3E8F0]">
                      <span className="text-[12.5px] font-bold text-[#0F1A30]">지게차</span>
                      {[0, 1, 2].map((n) => <button key={n} onClick={() => changeOpt("forklift", n)} className={`h-7 px-2 rounded-lg text-[12px] font-bold ${Number(draft.opts.forklift) === n ? "bg-[#1B2B4B] text-white" : "text-[#5B6B85] hover:bg-[#F5F8FD]"}`}>{n ? `${n}회` : "없음"}</button>)}
                    </div>
                    <Check on={draft.opts.allIn} onChange={(v) => changeOpt("allIn", v)} label="ALL-IN 조건" sub="야간 · 휴일 할증을 단가에 녹여요" />
                    <Check on={draft.opts.port} onChange={(v) => changeOpt("port", v)} label="항만 · 보세 상차" sub={`대기비 ${fmtWon(P.portWait)}원`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div><Label>목표 마진 %(비우면 {P.targetMargin}%)</Label><input className={boxInput} inputMode="decimal" value={draft.opts.targetMargin} onChange={(e) => changeOpt("targetMargin", numIn(e.target.value))} placeholder={`${P.targetMargin}`} /></div>
                  <div><Label>화주가 정한 할증 %(냉난방 줄 등)</Label><input className={boxInput} inputMode="decimal" value={draft.opts.rulePct} onChange={(e) => changeOpt("rulePct", numIn(e.target.value))} placeholder="예: 30" /></div>
                  <div><Label>기타 건당 비용(원)</Label><input className={boxInput} inputMode="numeric" value={draft.opts.extraPerCase ? fmtWon(draft.opts.extraPerCase) : ""} onChange={(e) => changeOpt("extraPerCase", money(e.target.value))} placeholder="예: 보세운송 수수료" /></div>
                  <div><Label>메모(안내문 조건 등)</Label><input className={boxInput} value={draft.note} onChange={(e) => change({ note: e.target.value })} placeholder="회차료 · 대기료는 별도" /></div>
                </div>
              </div>
            )}

            {/* ③ 거리 */}
            {step === 2 && (
              <div>
                <StepTitle title="출발지와 도착지 거리" sub="거리가 있어야 원가가 나와요. 주소는 거래처 · 지난 오더 · 지난 입찰에서 찾아 미리 채워 뒀어요." />
                {draft.dests.length === 0 ? <div className="text-[13px] text-[#7A8AA5]">① 표 넣기를 먼저 해 주세요.</div> : (
                  <>
                    <div className="flex gap-2 flex-wrap items-end mb-3">
                      <div className="w-[150px]"><Label>출발지</Label><input className={boxInput} value={draft.origin} onChange={(e) => change({ origin: e.target.value })} placeholder="예: 부산신항" /></div>
                      <div className="flex-1 min-w-[220px]"><Label>출발지 주소</Label><input className={boxInput} value={draft.originAddress} onChange={(e) => change({ originAddress: e.target.value })} placeholder="예: 부산 강서구 신항로 …" /></div>
                      <button onClick={calcAllKm} disabled={kmBusy} className={`${btnDark} h-10`}>{kmBusy ? "계산 중…" : "거리 한 번에 계산"}</button>
                    </div>
                    <div className="overflow-auto max-h-[52vh] rounded-xl border border-[#E3E8F0]">
                      <table className="w-full text-[12.5px] min-w-[620px]">
                        <thead className="sticky top-0 bg-[#F5F8FD] z-10"><tr className="text-[#5B6B85] text-left">{["도착지", "주소", "거리(km)", "귀로 어려움", "실적"].map((h) => <th key={h} className="py-2 px-2.5 font-bold">{h}</th>)}</tr></thead>
                        <tbody>
                          {draft.dests.map((d) => (
                            <tr key={d.key} className="border-t border-[#F1F4F9]">
                              <td className="py-1 px-2.5 font-bold text-[#0F1A30] whitespace-nowrap">{d.label}</td>
                              <td className="py-1 px-2.5"><input className={`${smallInput} w-full`} value={d.address} onChange={(e) => setDest(d.key, { address: e.target.value, backhaul: isBackhaulAddr(e.target.value, P) || d.backhaul })} placeholder="주소" /></td>
                              <td className="py-1 px-2.5 w-[92px]"><input className={`${smallInput} w-full text-right ${!d.km ? "border-[#F2C38B] bg-[#FEF8F0]" : ""}`} inputMode="numeric" value={d.km || ""} onChange={(e) => setDest(d.key, { km: numIn(e.target.value) })} placeholder="0" /></td>
                              <td className="py-1 px-2.5 w-[96px]"><button onClick={() => setDest(d.key, { backhaul: !d.backhaul })} className={`h-8 px-2.5 rounded-lg text-[12px] font-bold ${d.backhaul ? "bg-[#1B2B4B] text-white" : "bg-[#F5F8FD] text-[#5B6B85]"}`}>{d.backhaul ? `+${P.backhaulPct}%` : "아니요"}</button></td>
                              <td className="py-1 px-2.5 text-[#5B6B85] whitespace-nowrap">{destHist[d.label] ? `${destHist[d.label]}건` : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ④ 단가 검토 */}
            {step === 3 && (
              !ev ? <div className="text-[13px] text-[#7A8AA5]">① 표 넣기를 먼저 해 주세요.</div> : (
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <div className="min-w-[260px]"><Seg value={view} onChange={setView} size="sm" items={[["bid", "제출 단가"], ["rec", "권장가"], ["cost", "원가"], ["margin", "마진"]]} /></div>
                    <div className="w-px h-6 bg-[#E3E8F0] mx-1 hidden md:block" />
                    <button onClick={() => change((d) => fillBids(d, ev, "rec"))} className={btn}>전부 권장가</button>
                    <button onClick={() => change((d) => fillBids(d, ev, "rec", { onlyEmpty: true }))} className={btn}>빈 칸만 권장가</button>
                    <button onClick={() => change((d) => fillBids(d, ev, "smart"))} className={btn} title="물량 상위 20% 칸은 공격가, 나머지는 권장가">물량 많은 칸 공격가</button>
                    <button onClick={() => change((d) => fillBids(d, ev, "prev"))} className={btn}>처음 단가로</button>
                    <span className="flex items-center gap-1">
                      <input className={`${smallInput} h-9 w-[58px] text-right`} value={adjPct} onChange={(e) => setAdjPct(e.target.value.replace(/[^\d.-]/g, ""))} />
                      <button onClick={() => change((d) => adjustBids(d, Number(adjPct) || 0, P.roundUnit))} className={btn}>% 전체 조정</button>
                    </span>
                  </div>
                  {insight && insight.lostGap > 0 && (
                    <div className="mb-3 rounded-xl bg-[#EEF3FB] px-3.5 py-2.5 text-[12.5px] text-[#1B2B4B] flex items-center gap-2 flex-wrap">
                      <span className="font-black">지난 입찰 결과</span>
                      <span>{insight.scope === "same" ? `${draft.client} ` : "전체 "}{insight.n}건 중 낙찰 {insight.won}건 · 떨어졌을 때 평균 {insight.lostGap}% 비쌌어요</span>
                      <button onClick={() => change((d) => adjustBids(d, -insight.lostGap, P.roundUnit))} className={`${btn} h-8 ml-auto`}>전체 −{insight.lostGap}% 해 보기</button>
                    </div>
                  )}
                  <div className="flex flex-col lg:flex-row gap-3 items-stretch">
                    <div className="flex-1 min-w-0">
                      <div className="overflow-auto max-h-[56vh] rounded-xl border border-[#E3E8F0]">
                        <table className="text-[12px] border-collapse">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-[#F5F8FD]">
                              <th className="sticky left-0 z-20 bg-[#F5F8FD] px-2 py-2 text-left font-bold text-[#5B6B85] min-w-[104px] border-b border-r border-[#E3E8F0]">{draft.destOn === "row" ? "도착지 \\ 규격" : "규격 \\ 도착지"}</th>
                              {colsArr.map((c) => (
                                <th key={c.key} className="px-2 py-1.5 font-bold text-[#0F1A30] min-w-[90px] border-b border-[#E3E8F0] whitespace-nowrap">
                                  {c.label}{draft.destOn !== "row" && <div className={`text-[10.5px] font-semibold ${c.km ? "text-[#8796AE]" : "text-[#B54708]"}`}>{c.km ? `${c.km}km` : "거리 없음"}</div>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rowsArr.map((r) => (
                              <tr key={r.key}>
                                <td className="sticky left-0 z-[5] bg-white px-2 py-1 font-bold text-[#0F1A30] border-b border-r border-[#EEF2F8] whitespace-nowrap">
                                  {r.label}{draft.destOn === "row" && <span className={`ml-1 text-[10.5px] font-semibold ${r.km ? "text-[#8796AE]" : "text-[#B54708]"}`}>{r.km ? `${r.km}km` : "거리 없음"}</span>}
                                </td>
                                {colsArr.map((c) => {
                                  const k = keyOf(r, c); const x = ev.cells[k]; const cell = draft.cells?.[k] || {};
                                  const lv = LV[x?.level || "none"];
                                  const shown = view === "rec" ? x?.rec : view === "cost" ? x?.cost : null;
                                  return (
                                    <td key={c.key} onClick={() => { setFocus(k); setSide("detail"); }} title={x ? `${LEVEL_TEXT[x.level]} · 원가 ${fmtWon(x.cost)} · 권장 ${fmtWon(x.rec)}` : ""}
                                      className={`px-1 py-0.5 border-b border-[#EEF2F8] align-top cursor-pointer ${focus === k ? "outline outline-2 outline-[#2D4C82] -outline-offset-2" : ""}`} style={{ background: lv.bg }}>
                                      {view === "bid" ? (
                                        <input value={cell.bid ? fmtWon(cell.bid) : ""} onChange={(e) => setCell(k, { bid: money(e.target.value) })} onFocus={() => { setFocus(k); setSide("detail"); }}
                                          className="w-full min-w-[78px] h-7 px-1.5 text-right font-bold text-[#0F1A30] bg-white/70 rounded-md border border-transparent focus:border-[#B8C3D6] focus:outline-none" />
                                      ) : view === "margin" ? (
                                        <div className="h-7 leading-7 text-right px-1.5 font-bold" style={{ color: lv.tx }}>{x?.bid && !x.noKm ? `${fmtPct(x.margin)}%` : "-"}</div>
                                      ) : (
                                        <div className="h-7 leading-7 text-right px-1.5 font-bold text-[#0F1A30]">{x && !x.noKm ? fmtWon(shown) : "-"}</div>
                                      )}
                                      <div className="flex items-center justify-end gap-1 px-1 text-[10px] font-semibold leading-3 pb-0.5" style={{ color: lv.tx }}>
                                        {x?.vol ? <span className="text-[#8796AE]">{x.vol}건</span> : null}
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: lv.dot }} />
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-[11.5px] font-bold">
                        {["loss", "thin", "low", "ok", "high", "nokm"].map((l) => (
                          <span key={l} className="inline-flex items-center gap-1.5" style={{ color: LV[l].tx }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: LV[l].dot }} />{LEVEL_TEXT[l]} {ev.sum.levels[l] || 0}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* 옆 칸: 칸 자세히 · 확인할 곳 */}
                    <div className="lg:w-[330px] shrink-0 rounded-xl border border-[#E3E8F0] p-3 flex flex-col lg:max-h-[60vh]">
                      <Seg value={side} onChange={setSide} size="sm" items={[["detail", "칸 자세히"], ["warns", `확인할 곳 ${ev.warns.length}`]]} />
                      <div className="mt-3 overflow-y-auto flex-1 min-h-[120px]">
                        {side === "detail" ? (!focusInfo ? (
                          <div className="text-[12.5px] text-[#7A8AA5] break-keep">표에서 칸을 누르면 원가가 어떻게 나왔는지, 하한 · 공격 · 권장가가 얼마인지 보여 드려요.</div>
                        ) : (
                          <>
                            <div className="text-[13.5px] font-black text-[#0F1A30]">{focusDest?.label} · {focusSize?.label}</div>
                            <div className="text-[11.5px] text-[#5B6B85] mt-0.5">{focusInfo.how}{focusInfo.ton ? ` · ${focusInfo.ton}톤 기준` : ""}{focusDest?.km ? ` · ${focusDest.km}km` : ""}</div>
                            {focusInfo.noKm && <div className="mt-2 text-[12px] font-bold text-[#B54708]">거리가 없어 판단하지 않았어요. ③ 거리에서 넣어 주세요.</div>}
                            <div className="mt-2.5 space-y-1 text-[12px]">
                              {[
                                ["기본 원가(기사운임)", `${fmtWon(focusInfo.base)}원`],
                                ["할증", `${focusInfo.pct ? `+${fmtPct(focusInfo.pct / 100)}%` : "없음"}${focusInfo.cargo !== "일반" ? ` (${focusInfo.cargo})` : ""}`],
                                ["건당 비용", focusInfo.fixed ? `+${fmtWon(focusInfo.fixed)}원` : "없음"],
                                ["원가 합계", `${fmtWon(focusInfo.cost)}원`],
                                focusInfo.hist?.n ? ["실적", `${focusInfo.hist.n}건 · 기사 ${fmtWon(focusInfo.hist.cost)}원${focusInfo.hist.sale ? ` · 청구 ${fmtWon(focusInfo.hist.sale)}원` : ""}`] : null,
                                focusInfo.prev ? ["처음 단가", `${fmtWon(focusInfo.prev)}원`] : null,
                                focusInfo.vol ? ["예상 물량", `${focusInfo.vol}건`] : null,
                              ].filter(Boolean).map(([a, b]) => (
                                <div key={a} className="flex justify-between gap-3"><span className="text-[#5B6B85]">{a}</span><span className="font-bold text-[#0F1A30] text-right">{b}</span></div>
                              ))}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5 mt-3">
                              {[["floor", "하한가", `${P.minMargin}%`], ["aggr", "공격가", `${Math.min(targetOf(draft.opts, P), P.aggressiveMargin)}%`], ["rec", "권장가", `${targetOf(draft.opts, P)}%`]].map(([k, l, s]) => (
                                <button key={k} onClick={() => setCell(focus, { bid: focusInfo[k] })} className={`rounded-lg border p-2 text-left transition hover:border-[#2D4C82] ${focusInfo.bid === focusInfo[k] ? "border-[#2D4C82] bg-[#EEF3FB]" : "border-[#E3E8F0]"}`}>
                                  <div className="text-[10.5px] font-bold text-[#5B6B85]">{l} · {s}</div>
                                  <div className="text-[13px] font-black text-[#0F1A30]">{fmtWon(focusInfo[k])}</div>
                                </button>
                              ))}
                            </div>
                            <div className="text-[10.5px] text-[#8796AE] mt-1">누르면 그 값이 제출 단가로 들어가요</div>
                            {focusInfo.bid ? <div className="mt-2 text-[12.5px] font-bold" style={{ color: LV[focusInfo.level].tx }}>제출 {fmtWon(focusInfo.bid)}원 → 마진 {fmtPct(focusInfo.margin)}% · {LEVEL_TEXT[focusInfo.level]}</div> : null}
                          </>
                        )) : (
                          <div className="space-y-0.5">
                            {ev.warns.length === 0 && <div className="text-[12.5px] text-[#18794E] font-bold">눈에 띄는 문제는 없어요.</div>}
                            {ev.warns.slice(0, 300).map((w, i) => (
                              <button key={i} onClick={() => { setFocus(w.key); setSide("detail"); }} className="w-full text-left flex gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F5F8FD] text-[12px]">
                                <span className="shrink-0 font-bold" style={{ color: w.type === "loss" ? LV.loss.tx : w.type === "thin" ? LV.thin.tx : "#2D4C82" }}>{WARN_TAG[w.type]}</span>
                                <span className="text-[#0F1A30] break-keep">{w.text}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* ⑤ 제출 · 결과 */}
            {step === 4 && (
              !ev ? <div className="text-[13px] text-[#7A8AA5]">① 표 넣기를 먼저 해 주세요.</div> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <StepTitle title="물량으로 본 1년 예상" sub={ev.sum.vol ? `물량 ${fmtWon(ev.sum.vol)}건 기준${ev.sum.skippedVol ? ` · 거리 없는 칸 물량 ${fmtWon(ev.sum.skippedVol)}건은 뺐어요` : ""}` : "물량을 넣으면 1년 매출 · 이익이 나와요(① 표 넣기 › 물량만 따로 붙여넣기)."} />
                    <div className="grid grid-cols-2 gap-2">
                      {[["예상 매출", ev.sum.vol ? `${fmtWon(ev.sum.rev)}원` : "-"], ["예상 원가", ev.sum.vol ? `${fmtWon(ev.sum.cost)}원` : "-"], ["예상 이익", ev.sum.vol ? `${fmtWon(ev.sum.profit)}원` : "-"], ["평균 마진", ev.sum.vol ? `${fmtPct(ev.sum.margin)}%` : "-"]].map(([a, b]) => (
                        <div key={a} className="rounded-xl bg-[#F5F8FD] px-3 py-2.5"><div className="text-[11px] font-bold text-[#5B6B85]">{a}</div><div className="text-[15px] font-black text-[#0F1A30]">{b}</div></div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3 text-[11.5px] font-bold">
                      {["loss", "thin", "low", "ok", "high", "none", "nokm"].map((l) => (ev.sum.levels[l] ? (
                        <span key={l} className="inline-flex items-center gap-1.5" style={{ color: LV[l].tx }}><span className="w-2 h-2 rounded-full" style={{ background: LV[l].dot }} />{LEVEL_TEXT[l]} {ev.sum.levels[l]}</span>
                      ) : null))}
                    </div>
                    {(ev.sum.levels.loss || emptyBids) ? (
                      <div className="mt-3 rounded-xl bg-[#FEF3E6] px-3.5 py-2.5 text-[12.5px] text-[#B54708] font-bold break-keep">
                        {ev.sum.levels.loss ? `손해 나는 칸 ${ev.sum.levels.loss}개` : ""}{ev.sum.levels.loss && emptyBids ? " · " : ""}{emptyBids ? `단가가 빈 칸 ${emptyBids}개` : ""}가 있어요. ④ 단가 검토에서 확인해 주세요.
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <StepTitle title="업체에 낼 파일 만들기" />
                      <div className="flex flex-col gap-2">
                        {draft.source?.addrs ? (
                          <>
                            <button onClick={() => writeOriginal()} className={`${btnDark} h-11 text-[13px]`}>원본 양식에 단가 넣어 받기</button>
                            <div className="text-[11.5px] text-[#7A8AA5] break-keep">{draft.source.fileName} › {draft.source.sheet} 시트의 단가 칸에만 숫자를 넣어요. 서식 · 병합 · 다른 시트는 그대로예요.{FILES.has(draft.id) ? "" : " 이 화면을 다시 열었다면 같은 원본 파일을 한 번 더 골라 주세요."}</div>
                            <input ref={reFileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) writeOriginal(f); }} />
                          </>
                        ) : <div className="text-[12px] text-[#7A8AA5] break-keep">엑셀 파일로 넣은 표만 원본 양식에 바로 써넣을 수 있어요. 붙여 넣은 표는 [단가 복사]로 원래 양식에 붙여 넣으면 돼요.</div>}
                        <div className="flex gap-2">
                          <button onClick={copyTsv} className={`${btn} flex-1`}>단가 복사(양식에 붙여넣기)</button>
                          <button onClick={downloadXlsx} className={`${btn} flex-1`}>단가표만 엑셀 저장</button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <StepTitle title="결과 남기기" sub="낙찰 · 탈락과 낙찰가 차이를 남겨 두면 다음 입찰 때 ④ 단가 검토에서 알려 드려요." />
                      <Seg value={draft.status} onChange={(v) => change({ status: v })} items={STATUS.map((s) => [s, s])} />
                      {(draft.status === "낙찰" || draft.status === "탈락") && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div><Label>낙찰가와 차이 %(우리가 비쌌으면 +)</Label><input className={boxInput} inputMode="decimal" value={draft.result?.gapPct ?? ""} onChange={(e) => change((d) => ({ result: { ...(d.result || {}), gapPct: e.target.value.replace(/[^\d.-]/g, "") } }))} placeholder="예: 7" /></div>
                          <div><Label>메모</Label><input className={boxInput} value={draft.result?.memo || ""} onChange={(e) => change((d) => ({ result: { ...(d.result || {}), memo: e.target.value } }))} placeholder="예: 울산 구간에서 밀림" /></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {/* 아래: 이전 · 다음 */}
          <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur rounded-b-[20px] border-t border-[#EEF2F8] px-4 md:px-5 py-3 flex items-center gap-2">
            <button onClick={() => goStep(step - 1)} disabled={step === 0} className={btn}>← 이전</button>
            <div className="flex-1 text-center text-[12px] font-bold text-[#8796AE]">{step + 1} / {STEPS.length} · {STEPS[step][1]}</div>
            {step < STEPS.length - 1
              ? <button onClick={() => goStep(step + 1)} disabled={step === 0 && !draft.sizes.length} className={btnDark}>다음 · {STEPS[step + 1][1]} →</button>
              : <button onClick={() => save()} disabled={!dirty || saving} className={btnDark}>저장</button>}
          </div>
        </div>
      )}

      {pasteOpen && <PasteModal kind={pasteOpen} onClose={() => setPasteOpen(null)} onApply={(t, opt) => { if (applyPaste(t, pasteOpen, opt)) setPasteOpen(null); }} />}
      {profileOpen && <ProfileModal co={co} profileDoc={profileDoc} values={P} onClose={() => setProfileOpen(false)} onSaved={() => flash("기본값을 저장했어요")} />}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2.5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-bold shadow-xl max-w-[92vw] text-center">{toast}</div>}
    </div>
  );
}

function PasteModal({ kind, onClose, onApply }) {
  const [text, setText] = useState("");
  const [destOn, setDestOn] = useState("");
  const [sizeKind, setSizeKind] = useState("");
  const preview = useMemo(() => (kind === "grid" && text.trim() ? parseBidGrid(splitPasted(text), { destOn: destOn || undefined, sizeKind: sizeKind || undefined }) : null), [text, destOn, sizeKind, kind]);
  return (
    <Modal title={kind === "vol" ? "물량 붙여넣기" : "표 붙여넣기"} onClose={onClose} wide>
      <p className="text-[12.5px] text-[#5B6B85] leading-relaxed break-keep">
        {kind === "vol"
          ? "물량(건수) 표를 머리줄(도착지 · 규격 이름)까지 같이 복사해 붙여 넣으면 돼요. 이름이 같은 칸에 들어가요."
          : "업체 견적 양식에서 머리줄(도착지 · 톤수 · 중량)과 이름 칸까지 같이 드래그해 복사(Ctrl+C)한 뒤 여기 붙여 넣으면 돼요(Ctrl+V). 단가 칸이 비어 있어도 괜찮아요. 같은 도착지 이름이 두 번 나오면 앞쪽은 물량, 뒤쪽은 단가로 읽어요."}
      </p>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="여기에 붙여 넣기"
        className="mt-3 w-full h-[180px] p-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] text-[12px] font-mono focus:bg-white focus:outline-none" />
      {kind === "grid" && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div><Label>도착지 방향</Label><Seg value={destOn || preview?.destOn || "col"} onChange={setDestOn} items={[["col", "도착지가 가로(열)"], ["row", "도착지가 세로(행)"]]} /></div>
          <div><Label>규격 기준</Label><Seg value={sizeKind || preview?.sizeKind || "ton"} onChange={setSizeKind} items={[["ton", "톤수"], ["weight", "중량 kg"], ["pallet", "파렛"]]} /></div>
        </div>
      )}
      {preview && (
        <div className="mt-3 rounded-xl bg-[#F5F8FD] px-3.5 py-3 text-[12.5px] text-[#0F1A30] space-y-1">
          <div><b>도착지 {preview.dests.length}곳</b> — {preview.dests.slice(0, 8).map((d) => d.label).join(", ")}{preview.dests.length > 8 ? " …" : ""}</div>
          <div><b>규격 {preview.sizes.length}개</b> — {preview.sizes.slice(0, 8).map((s) => s.label).join(", ")}{preview.sizes.length > 8 ? " …" : ""}</div>
          <div><b>단가 있는 칸 {Object.values(preview.cells).filter((c) => c.bid).length}개</b>{preview.hasVolume ? " · 물량 묶음도 찾았어요" : ""}</div>
        </div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={btn}>닫기</button>
        <button onClick={() => onApply(text, { destOn: destOn || undefined, sizeKind: sizeKind || undefined })} disabled={!text.trim()} className={btnDark}>넣기</button>
      </div>
    </Modal>
  );
}

function ProfileModal({ co, profileDoc, values, onClose, onSaved }) {
  const [v, setV] = useState(() => ({ ...values }));
  const [busy, setBusy] = useState(false);
  async function saveIt() {
    setBusy(true);
    try {
      const id = profileDoc?.id || co;
      await setDoc(doc(db, "bidCostProfiles", id), { companyName: co, values: v, updatedAt: serverTimestamp() }, { merge: true });
      onSaved(); onClose();
    } catch (e) { console.error(e); alert("저장하지 못했어요"); }
    setBusy(false);
  }
  return (
    <Modal title="할증 · 마진 기본값" onClose={onClose} wide>
      <p className="text-[12.5px] text-[#5B6B85] break-keep">회사가 쓰는 기준으로 바꿔 두면 모든 입찰견적 계산에 써요. 입찰마다 다른 마진은 ② 조건의 "목표 마진"에 적으면 돼요.</p>
      <div className="space-y-4 mt-4">
        {PROFILE_FIELDS.map(([group, fields]) => (
          <div key={group}>
            <div className="text-[12.5px] font-black text-[#0F1A30] mb-1.5">{group}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {fields.map(([k, l, unit]) => (
                <label key={k} className="block">
                  <span className="block text-[11px] font-bold text-[#5B6B85] mb-0.5">{l}</span>
                  <span className="flex items-center gap-1">
                    <input className={`${boxInput} h-9 text-right`} inputMode="decimal" value={unit === "원" ? fmtWon(v[k]) : v[k]} onChange={(e) => setV((o) => ({ ...o, [k]: Number(String(e.target.value).replace(/[^\d.]/g, "")) || 0 }))} />
                    <span className="text-[11.5px] text-[#8796AE] w-5">{unit}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div className="text-[12.5px] font-black text-[#0F1A30] mb-1.5">귀로 어려운 지역(주소에 이 말이 있으면 자동 체크)</div>
          <input className={boxInput} value={v.backhaulRegions} onChange={(e) => setV((o) => ({ ...o, backhaulRegions: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-between gap-2 mt-5">
        <button onClick={() => setV({ ...BID_DEFAULTS })} className={btn}>처음 값으로</button>
        <div className="flex gap-2"><button onClick={onClose} className={btn}>닫기</button><button onClick={saveIt} disabled={busy} className={btnDark}>저장</button></div>
      </div>
    </Modal>
  );
}
