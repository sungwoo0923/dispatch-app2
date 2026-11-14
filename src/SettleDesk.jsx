// ======================= src/SettleDesk.jsx =======================
// 🧾 2026-11-07 정산관리 › 거래처정산 리디자인 — 거래명세서 단계 보드 · 명세서 편집 그리드 · 미수금 데스크 · 공용 팝업 틀
//  · 화면 조각만 모았다. 금액 계산(청구운임 · 세액 · 미정산 · 입금 배분)은 DispatchApp.jsx의 ClientSettlement가 지금처럼 하고
//    이 파일은 받은 숫자를 그리기만 한다(회계관리 · AI 비서가 쓰는 미수금 숫자는 건드리지 않음).
//  · 단계 기록: arDesk 컬렉션(회사별) — kind "stmt"(거래처·청구월 명세서 단계 · includePrepaid) / kind "client"(미수금 메모 · 다음 할 일 · 상태) / kind "config"(stmtIncludePrepaid)
import React from "react";
import { createPortal } from "react-dom";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, setDoc, where, serverTimestamp } from "firebase/firestore";
import CustomDatePicker from "./CustomDatePicker";
import useNarrow from "./useNarrow"; // 📱 2026-11-10 휴대폰 폭 — 단계 표시 2줄 · 명세서 표 칸 줄이기

export const SD = { ink: "#0F1A30", navy: "#1B2B4B", blue: "#2D4C82", sub: "#5B6B85", mute: "#9AA9C3", line: "#E3E8F0", hair: "#EEF2F8", soft: "#F4F6FA", sky: "#8FB0F0", ice: "#CFE0FF" };
const NUM = { fontVariantNumeric: "tabular-nums" };
const won = (n) => (Number(n) || 0).toLocaleString();
export const shortWon = (n) => {
  const v = Number(n) || 0; const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
  return v.toLocaleString();
};
const ymLabel = (ym) => (ym ? `${ym.slice(0, 4)}.${ym.slice(5, 7)}` : "");
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const tsMs = (t) => (typeof t === "number" ? t : t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : t ? new Date(t).getTime() || 0 : 0);
const fmtDay = (ms) => { if (!ms) return ""; const d = new Date(ms + 9 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const fmtDayTime = (ms) => { if (!ms) return ""; const d = new Date(ms + 9 * 3600e3); return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

// ───────────────────────── 공용 버튼 · 팝업 ─────────────────────────
export const sdBtn = "h-10 px-3.5 rounded-xl border border-[#D5DDEA] bg-white text-[14px] font-bold text-[#1B2B4B] hover:bg-[#F4F6FA] hover:border-[#B8C4D8] transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
export const sdBtnPri = "h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
export const sdInp = "h-10 w-full rounded-xl border border-[#D5DDEA] bg-white px-3 text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/10 placeholder:text-[#9AA9C3]";
export const sdCard = "bg-white rounded-2xl border border-[#E3E8F0] shadow-[0_1px_2px_rgba(15,26,48,0.04)]";

export function Ico({ d, size = 16, w = 2.1, className = "" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{[].concat(d).map((p, i) => <path key={i} d={p} />)}</svg>;
}
export const IC = {
  x: "M6 6l12 12M18 6L6 18", send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"], print: ["M6 9V3h12v6", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
  back: "M15 18l-6-6 6-6", next: "M9 18l6-6-6-6", search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-3.5-3.5"], check: "M5 12l5 5L20 7", plus: "M12 5v14M5 12h14",
  doc: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 13h6M9 17h4"], won: ["M4 7l3 10 3-8 2 6 2-6 3 8 3-10", "M3 11h18"], bell: ["M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8", "M10 21a2 2 0 0 0 4 0"],
  mail: ["M4 5h16v14H4z", "M4 7l8 6 8-6"], clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"], pen: ["M4 20h4L19 9l-4-4L4 16z"], phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  excel: ["M6 3h9l4 4v14H6z", "M9 11l4 6M13 11l-4 6"], list: ["M8 6h12M8 12h12M8 18h12", "M4 6h.01M4 12h.01M4 18h.01"], grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  upload: ["M12 16V4", "M7 9l5-5 5 5", "M4 20h16"], info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 8h.01"], building: ["M4 21V5l8-3v19", "M12 9h8v12", "M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01"],
};

// 팝업 공용 틀 — 남색 머리(영문 작은 제목 · 제목 · 설명 · 닫기) · 내용 · 아래 버튼 줄(주 버튼은 오른쪽 끝)
export function KpModal({ open = true, onClose, en, title, sub, width = 560, children, footer, bodyClass = "p-6", z = 99999, portal = false, busy = false }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, busy, onClose]);
  if (!open) return null;
  const node = (
    <div className="kp-modal fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 bg-[#0B1428]/55 backdrop-blur-[2px]" style={{ zIndex: z }} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="kp-modal-panel bg-white w-full rounded-t-[22px] sm:rounded-[22px] shadow-[0_24px_64px_rgba(11,20,40,0.35)] flex flex-col overflow-hidden max-h-[92vh]" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative shrink-0 px-6 py-4 text-white flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div className="min-w-0 flex-1">
            {en && <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={NUM}>{en}</div>}
            <div className="text-[18px] font-black leading-snug truncate">{title}</div>
            {sub && <div className="text-[14px] text-white/70 mt-0.5 truncate">{sub}</div>}
          </div>
          <button type="button" aria-label="닫기" disabled={busy} onClick={onClose} className="shrink-0 w-9 h-9 -mr-1 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-40"><Ico d={IC.x} size={16} w={2.4} /></button>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClass}`}>{children}</div>
        {footer && <div className="shrink-0 px-6 py-3.5 border-t border-[#E3E8F0] bg-[#F8FAFD] flex items-center gap-2 flex-wrap justify-end">{footer}</div>}
      </div>
    </div>
  );
  return portal ? createPortal(node, document.body) : node;
}

// ───────────────────────── 단계 기록(arDesk) ─────────────────────────
export const STMT_STAGES = [
  { k: "미작성", label: "미작성", en: "TODO", hint: "아직 명세서를 만들지 않았어요" },
  { k: "작성", label: "작성", en: "DRAFT", hint: "명세서를 만들어 두었어요" },
  { k: "발송", label: "발송", en: "SENT", hint: "거래처에 보냈어요" },
  { k: "확인", label: "거래처 확인", en: "CHECKED", hint: "거래처가 내역을 확인했어요" },
  { k: "계산서요청", label: "계산서 요청", en: "TAX REQ", hint: "거래처가 계산서를 요청했어요" },
  { k: "계산서발행", label: "계산서 발행", en: "ISSUED", hint: "세금계산서를 발행했어요" },
  { k: "마감", label: "마감", en: "CLOSED", hint: "이 달 정산을 마쳤어요" },
];
export const stageIdx = (k) => Math.max(0, STMT_STAGES.findIndex((s) => s.k === k));
export const stageLabel = (k) => STMT_STAGES[stageIdx(k)].label;
const safeKey = (x) => String(x || "").replace(/[/\s#?[\]]/g, "_").slice(0, 120);
export const arDeskId = (co, kind, ...parts) => [co, kind, ...parts].map(safeKey).join("__");

// 회사의 arDesk 문서를 구독 — 저장은 화면에 먼저 반영(둘러보기·느린 연결에서도 바로 보이게)
export function useArDesk(company) {
  const co = String(company || "").trim();
  const [docs, setDocs] = React.useState([]);
  const [local, setLocal] = React.useState({});
  React.useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(query(collection(db, "arDesk"), where("companyName", "==", co)), (snap) => setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [co]);
  const all = React.useMemo(() => {
    const m = new Map();
    docs.forEach((d) => m.set(d.id, d));
    Object.entries(local).forEach(([id, p]) => m.set(id, { ...(m.get(id) || {}), ...p, id }));
    return [...m.values()];
  }, [docs, local]);
  const stmts = React.useMemo(() => { const m = new Map(); all.filter((d) => d.kind === "stmt").forEach((d) => m.set(`${d.biz || ""}|${d.client}|${d.yyyymm}`, d)); return m; }, [all]);
  const notes = React.useMemo(() => { const m = new Map(); all.filter((d) => d.kind === "client").forEach((d) => m.set(`${d.biz || ""}|${d.client}`, d)); return m; }, [all]);
  const save = React.useCallback(async (id, patch) => {
    setLocal((l) => ({ ...l, [id]: { ...(l[id] || {}), ...patch } }));
    try { await setDoc(doc(db, "arDesk", id), { ...patch, companyName: co, updatedAt: serverTimestamp() }, { merge: true }); } catch (e) { console.warn("arDesk 저장 실패", e); }
  }, [co]);
  // ⭐ 2026-11-07 회사 설정(kind "config") — 거래명세서 선불·착불 포함 기본값(stmtIncludePrepaid · 처음엔 빼기)
  const configId = arDeskId(co, "config");
  const config = React.useMemo(() => all.find((d) => d.id === configId) || null, [all, configId]);
  const saveConfig = React.useCallback((patch) => save(configId, { kind: "config", ...patch }), [save, configId]);
  return { stmts, notes, save, config, saveConfig, company: co };
}

// ───────────────────────── 단계 표시 ─────────────────────────
// 작은 진행 점(목록용) — 지나온 단계는 채운 점, 지금 단계는 큰 점
export function StageDots({ stage }) {
  const cur = stageIdx(stage);
  return (
    <div className="flex items-center" aria-label={`${stageLabel(stage)} 단계`}>
      {STMT_STAGES.slice(1).map((s, i) => {
        const idx = i + 1; const done = idx <= cur;
        return (
          <React.Fragment key={s.k}>
            {i > 0 && <span className="h-[2px] w-2.5" style={{ background: idx <= cur ? SD.blue : SD.line }} />}
            <span title={s.label} className="rounded-full shrink-0" style={{ width: idx === cur ? 10 : 7, height: idx === cur ? 10 : 7, background: done ? (idx === cur ? SD.ink : SD.blue) : "#fff", border: `1.5px solid ${done ? (idx === cur ? SD.ink : SD.blue) : "#C9D3E3"}` }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}
export function StageBadge({ stage }) {
  const i = stageIdx(stage);
  const cls = i === 0 ? "bg-white text-[#5B6B85] border border-dashed border-[#B8C4D8]" : i === 6 ? "bg-[#0F1A30] text-white" : i >= 4 ? "bg-[#2D4C82] text-white" : "bg-[#EEF3FB] text-[#1B2B4B] border border-[#CFE0FF]";
  return <span className={`inline-flex items-center h-7 px-2.5 rounded-lg text-[13px] font-black whitespace-nowrap ${cls}`}>{stageLabel(stage)}</span>;
}

// 큰 단계 표시(편집 화면) — 다음 단계 버튼은 바로 누를 수 있게 강조
export function StageStepper({ stage, history = [], onSet, disabled, sentHint }) {
  const cur = stageIdx(stage);
  const at = (k) => { const h = [...history].reverse().find((x) => x.stage === k); return h ? tsMs(h.at) : 0; };
  const ph = useNarrow(640); // 📱 휴대폰 — 옆으로 밀지 않고 4칸씩 2줄
  return (
    <div className={ph ? "grid grid-cols-4 gap-y-1" : "flex items-stretch gap-0 overflow-x-auto no-scrollbar"} style={{ scrollbarWidth: "none" }} data-kp="stmt-stepper">
      {STMT_STAGES.map((s, i) => {
        const done = i <= cur; const isCur = i === cur; const isNext = i === cur + 1;
        const t = i > 0 ? at(s.k) : 0;
        return (
          <React.Fragment key={s.k}>
            {i > 0 && !ph && <div className="self-center h-[2px] min-w-[10px] flex-1" style={{ background: i <= cur ? SD.blue : SD.line }} />}
            <button type="button" disabled={disabled || i === 0 || i === cur} onClick={() => onSet?.(s.k)}
              title={i === 0 ? s.hint : isCur ? "지금 단계" : i < cur ? `${s.label}(으)로 되돌리기` : `${s.label}(으)로 기록`}
              className={`shrink-0 flex flex-col items-center gap-1 ${ph ? "min-w-0 px-0.5" : "px-1.5"} py-1 rounded-xl transition ${isNext && !disabled ? "hover:bg-[#EEF3FB]" : ""} disabled:cursor-default`}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black ${isCur ? "bg-[#0F1A30] text-white ring-4 ring-[#CFE0FF]" : done ? "bg-[#2D4C82] text-white" : isNext ? "bg-white text-[#1B2B4B] border-2 border-[#1B2B4B]" : "bg-white text-[#9AA9C3] border-2 border-[#DCE3EE]"}`} style={NUM}>
                {done && !isCur && i > 0 ? <Ico d={IC.check} size={14} w={3} /> : i}
              </span>
              <span className={`${ph ? "text-[12px]" : "text-[13px]"} font-black whitespace-nowrap ${isCur ? "text-[#0F1A30]" : done ? "text-[#2D4C82]" : isNext ? "text-[#1B2B4B]" : "text-[#9AA9C3]"}`}>{s.label}</span>
              <span className="text-[12px] font-bold text-[#9AA9C3] h-4" style={NUM}>{t ? fmtDay(t) : s.k === "발송" && sentHint ? sentHint : ""}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ───────────────────────── 거래명세서 단계 보드 ─────────────────────────
// groups: [{ key, client, yyyymm, count, supply, vat, total, stage, settled, lastAt, email, hasDoc }]
// ⭐ 2026-11-07 거래명세서 "선불·착불 포함" 스위치 — 명세서 편집(이 명세서만) · 단계 보드(회사 기본)
export function PrepaidToggle({ on, onChange, excluded = 0, label = "선불·착불 포함", hint = "", disabled = false, testId = "stmt-prepaid-toggle", compact = false }) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "" : "rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3"}`}>
      <button type="button" role="switch" aria-checked={!!on} aria-label={label} data-testid={testId} disabled={disabled} onClick={() => onChange?.(!on)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${on ? "bg-[#1B2B4B]" : "bg-[#C9D2E0]"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <div className="min-w-0">
        <div className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">{label}</div>
        {(hint || (!on && excluded > 0)) && <div className="text-[12.5px] font-bold text-[#5B6B85] truncate" data-testid={`${testId}-note`}>{!on && excluded > 0 ? `선불·착불 ${excluded.toLocaleString()}건 제외` : hint}</div>}
      </div>
    </div>
  );
}

// ⭐ 2026-11-09 거래처정산 2분할 — 왼쪽 거래처 목록(이 달 · 단계 · 합계). 고르면 오른쪽 명세서가 바뀐다
//  넓은 화면(2xl)은 세로 목록, 그보다 좁으면 가로로 넘겨 보는 줄
// ⭐ 2026-11-09 월말 일괄 발송 — [일괄 발송]을 누르면 "작성 완료" 거래처를 골라 한 번에 보낸다(발송 목록 창에서 메일 확인 후 발송)
//  ⭐ 입금 확인으로 자동 마감된 곳은 "입금 확인" 표시
export const stmtReady = (g) => stageIdx(g?.stage) === 1 && (g?.count || 0) > 0;
export function StatementClientRail({ month, setMonth, groups = [], sel, onSel, onBoard, onBulkSend, disabled = false }) {
  const [q, setQ] = React.useState("");
  const [pick, setPick] = React.useState(false);
  const [chosen, setChosen] = React.useState(() => new Set());
  React.useEffect(() => { setChosen(new Set()); }, [month]);
  const shown = React.useMemo(() => {
    const nq = q.trim().toLowerCase().replace(/\s+/g, "");
    return groups.filter((g) => !nq || String(g.client || "").toLowerCase().replace(/\s+/g, "").includes(nq));
  }, [groups, q]);
  const [y, m] = String(month || "").split("-").map(Number);
  const shift = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const total = groups.reduce((s, g) => s + (g.total || 0), 0);
  const closed = groups.filter((g) => g.stage === "마감").length;
  const ready = groups.filter(stmtReady);
  const picked = groups.filter((g) => chosen.has(g.key) && stmtReady(g));
  const toggle = (k) => setChosen((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const sendPicked = () => {
    if (!picked.length || !onBulkSend) return;
    onBulkSend(picked);
    setPick(false); setChosen(new Set());
  };
  const boxRef = React.useRef(null);
  React.useEffect(() => { try { boxRef.current?.querySelector("[data-on='1']")?.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* 무시 */ } }, [sel, month, shown.length]);
  return (
    <div ref={boxRef} className={`${sdCard} p-3 min-w-0 xl:sticky xl:top-3`} data-testid="stmt-client-rail">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => shift(-1)} className="w-9 h-9 shrink-0 rounded-lg border border-[#D5DDEA] text-[#1B2B4B] flex items-center justify-center hover:bg-[#F4F6FA]" aria-label="이전 달" data-testid="stmt-rail-prev"><Ico d={IC.back} size={15} /></button>
        <div className="flex-1 min-w-0 text-center whitespace-nowrap text-[#0F1A30]" style={NUM}><span className="text-[12px] font-bold text-[#5B6B85] mr-1">{y}</span><span className="text-[16px] font-black">{m}월</span></div>
        <button type="button" onClick={() => shift(1)} className="w-9 h-9 shrink-0 rounded-lg border border-[#D5DDEA] text-[#1B2B4B] flex items-center justify-center hover:bg-[#F4F6FA]" aria-label="다음 달"><Ico d={IC.next} size={15} /></button>
        {onBoard && <button type="button" onClick={onBoard} className="h-9 px-2.5 rounded-lg border border-[#D5DDEA] text-[13px] font-bold text-[#1B2B4B] hover:bg-[#F4F6FA] inline-flex items-center gap-1 whitespace-nowrap" title="단계 보드로 한눈에 보기 · 여러 곳 한 번에 처리"><Ico d={IC.grid} size={14} />보드</button>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px] font-bold text-[#5B6B85]" style={NUM}>
        <span className="truncate">거래처 {groups.length}곳 · 마감 {closed}</span><span className="text-[#0F1A30] font-black whitespace-nowrap">{shortWon(total)}</span>
      </div>
      {onBulkSend && !disabled && (
        !pick ? (
          <button type="button" onClick={() => { setPick(true); setChosen(new Set(ready.map((g) => g.key))); }} disabled={!ready.length} data-testid="stmt-rail-bulk"
            className="mt-2 w-full h-9 rounded-lg border border-[#D5DDEA] bg-white text-[13px] font-bold text-[#1B2B4B] hover:bg-[#F4F6FA] inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40"
            title={ready.length ? "작성 완료한 거래처를 골라 명세서 메일을 한 번에 보내요" : "작성 완료한 거래처가 없어요"}>
            <Ico d={IC.send} size={14} />일괄 발송{ready.length ? <span className="min-w-[20px] h-5 px-1 rounded-md bg-[#EEF2F8] text-[#0F1A30] text-[12px] font-black inline-flex items-center justify-center" style={NUM}>{ready.length}</span> : null}
          </button>
        ) : (
          <div className="mt-2 rounded-xl border border-[#1B2B4B] bg-[#F4F7FC] p-2" data-testid="stmt-rail-pick">
            <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-0.5 text-[12.5px] font-black text-[#0F1A30]">
              <span className="whitespace-nowrap" style={NUM}>{picked.length}곳 선택 · 작성 완료 {ready.length}곳</span>
              <button type="button" onClick={() => setChosen(picked.length === ready.length ? new Set() : new Set(ready.map((g) => g.key)))} className="text-[12px] font-bold text-[#1B2B4B] underline underline-offset-2 whitespace-nowrap">{picked.length === ready.length ? "모두 해제" : "모두 선택"}</button>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button type="button" onClick={() => { setPick(false); setChosen(new Set()); }} className="h-9 px-3 rounded-lg border border-[#D5DDEA] bg-white text-[13px] font-bold text-[#1B2B4B] whitespace-nowrap">취소</button>
              <button type="button" onClick={sendPicked} disabled={!picked.length} data-testid="stmt-rail-send" className="flex-1 h-9 px-2 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black whitespace-nowrap disabled:opacity-40">{picked.length}곳 발송</button>
            </div>
          </div>
        )
      )}
      {groups.length > 6 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 찾기" className={`${sdInp} mt-2 h-9`} />}
      <div className="mt-2 flex xl:flex-col gap-1.5 overflow-x-auto xl:overflow-x-visible xl:max-h-[calc(100vh-280px)] xl:overflow-y-auto no-scrollbar" style={{ scrollbarWidth: "thin" }}>
        {shown.length === 0 && <div className="px-2 py-6 text-center text-[13px] font-bold text-[#9AA9C3] w-full">{groups.length ? "찾는 거래처가 없어요" : "이 달에 청구할 오더가 없어요"}</div>}
        {shown.map((g) => {
          const on = !pick && g.client === sel;
          const can = pick && stmtReady(g);
          const checked = can && chosen.has(g.key);
          return (
            <button key={g.key} type="button" onClick={() => (pick ? can && toggle(g.key) : onSel(g))} data-testid="stmt-rail-item" data-on={on ? "1" : "0"}
              className={`shrink-0 xl:shrink text-left rounded-xl px-3 py-2 border transition min-w-[180px] xl:min-w-0 ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white" : checked ? "bg-[#EEF3FB] border-[#1B2B4B]" : pick && !can ? "bg-white border-[#E3E8F0] opacity-45 cursor-default" : "bg-white border-[#E3E8F0] hover:border-[#B8C4D8] hover:bg-[#F8FAFD]"}`}>
              <div className="flex items-center gap-2 min-w-0">
                {pick && <span className={`w-4 h-4 shrink-0 rounded border inline-flex items-center justify-center ${checked ? "bg-[#0F1A30] border-[#0F1A30] text-white" : "border-[#B8C4D8] bg-white"}`}>{checked && <Ico d={IC.check} size={11} w={3} />}</span>}
                <span className={`text-[14px] font-black truncate flex-1 ${on ? "text-white" : "text-[#0F1A30]"}`}>{g.client}</span>
                <span className={`text-[12px] font-black px-1.5 h-5 rounded-md inline-flex items-center whitespace-nowrap ${on ? "bg-white/15 text-white" : stageIdx(g.stage) === 0 ? "border border-dashed border-[#B8C4D8] text-[#5B6B85]" : stageIdx(g.stage) === 6 ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FB] text-[#1B2B4B]"}`}>{stageLabel(g.stage)}</span>
              </div>
              <div className={`mt-0.5 flex items-center justify-between gap-2 text-[12.5px] font-bold ${on ? "text-white/70" : "text-[#5B6B85]"}`} style={NUM}>
                <span className="whitespace-nowrap truncate min-w-0">{(g.count || 0).toLocaleString()}건{g.settled ? <span className={`ml-1 ${on ? "text-white" : "text-[#1E6B4A]"}`} title="미수금관리에서 입금 확인(정산완료)">· 입금</span> : null}{pick && can && !g.email ? <span className="ml-1 text-[#A6400E]">· 메일 없음</span> : null}</span><span className={`whitespace-nowrap ${on ? "text-white font-black" : "text-[#0F1A30] font-black"}`}>{(g.total || 0).toLocaleString()}원</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StatementBoard({ month, setMonth, recentMonths = [], groups, onOpen, onAdvance, onBulk, onManual, bizLabel, tools = null }) {
  const [stageF, setStageF] = React.useState("");
  const [q, setQ] = React.useState("");
  const [openOnly, setOpenOnly] = React.useState(false);
  const [sel, setSel] = React.useState(() => new Set());
  const [focus, setFocus] = React.useState(0);
  const listRef = React.useRef(null);
  React.useEffect(() => { setSel(new Set()); setFocus(0); }, [month]);
  const counts = React.useMemo(() => { const c = {}; const amt = {}; STMT_STAGES.forEach((s) => { c[s.k] = 0; amt[s.k] = 0; }); groups.forEach((g) => { c[g.stage] += 1; amt[g.stage] += g.total; }); return { c, amt }; }, [groups]);
  const shown = React.useMemo(() => {
    const nq = q.trim().toLowerCase().replace(/\s+/g, "");
    return groups.filter((g) => (!stageF || g.stage === stageF) && (!openOnly || g.stage !== "마감") && (!nq || g.client.toLowerCase().replace(/\s+/g, "").includes(nq)))
      .sort((a, b) => stageIdx(a.stage) - stageIdx(b.stage) || b.total - a.total);
  }, [groups, stageF, q, openOnly]);
  const selGroups = shown.filter((g) => sel.has(g.key));
  const total = groups.reduce((s, g) => s + g.total, 0);
  const closed = groups.filter((g) => g.stage === "마감").length;
  const toggle = (k) => setSel((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const onKey = (e) => {
    if (!shown.length || ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); setFocus((f) => Math.min(shown.length - 1, f + 1)); }
    else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); onOpen(shown[Math.min(focus, shown.length - 1)]); }
    else if (e.key === " ") { e.preventDefault(); toggle(shown[Math.min(focus, shown.length - 1)].key); }
  };
  React.useEffect(() => { listRef.current?.querySelector(`[data-row='${focus}']`)?.scrollIntoView({ block: "nearest" }); }, [focus]);
  const [y, m] = month.split("-").map(Number);
  const shift = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  return (
    <div className="space-y-3">
      {/* 머리: 청구월 · 요약 */}
      <div className={`${sdCard} p-4`}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} aria-label="이전 달" className="w-9 h-9 rounded-xl border border-[#D5DDEA] text-[#1B2B4B] hover:bg-[#F4F6FA] flex items-center justify-center"><Ico d={IC.back} /></button>
            <div className="px-2 text-center min-w-[120px]">
              <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#9AA9C3]">BILLING MONTH</div>
              <div className="text-[20px] font-black text-[#0F1A30] leading-tight" style={NUM}>{y}년 {m}월</div>
            </div>
            <button type="button" onClick={() => shift(1)} aria-label="다음 달" className="w-9 h-9 rounded-xl border border-[#D5DDEA] text-[#1B2B4B] hover:bg-[#F4F6FA] flex items-center justify-center"><Ico d={IC.next} /></button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
            {recentMonths.map((r) => (
              <button key={r.ym} type="button" onClick={() => setMonth(r.ym)} className={`h-8 px-2.5 rounded-lg text-[13px] font-black whitespace-nowrap inline-flex items-center gap-1 ${r.ym === month ? "bg-[#0F1A30] text-white" : "bg-[#F4F6FA] text-[#3A4A66] hover:bg-[#EEF2F8]"}`} style={NUM}>
                {Number(r.ym.slice(5))}월{r.open > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-md text-[11px] inline-flex items-center justify-center ${r.ym === month ? "bg-white/20" : "bg-white text-[#1B2B4B] border border-[#DCE3EE]"}`}>{r.open}</span>}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <div className="text-[13px] font-bold text-[#5B6B85]">청구 합계{bizLabel ? ` · ${bizLabel}` : ""}</div>
              <div className="text-[20px] font-black text-[#0F1A30] leading-tight" style={NUM}>{won(total)}<span className="text-[13px] text-[#9AA9C3] ml-0.5">원</span></div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-bold text-[#5B6B85]">마감</div>
              <div className="text-[20px] font-black text-[#0F1A30] leading-tight" style={NUM}>{closed}<span className="text-[14px] text-[#9AA9C3]">/{groups.length}곳</span></div>
            </div>
          </div>
        </div>
        {/* 단계 칩 — 누르면 그 단계만 */}
        <div className="mt-4 grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {STMT_STAGES.map((s, i) => {
            const on = stageF === s.k; const n = counts.c[s.k];
            return (
              <button key={s.k} type="button" onClick={() => setStageF(on ? "" : s.k)} title={s.hint}
                className={`relative text-left rounded-xl px-3 py-2.5 border transition ${on ? "bg-[#0F1A30] border-[#0F1A30] text-white shadow-[0_8px_18px_rgba(15,26,48,0.2)]" : n ? "bg-white border-[#DCE3EE] hover:border-[#8FB0F0]" : "bg-[#FAFBFD] border-[#EEF2F8] text-[#9AA9C3]"}`}>
                <div className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded-full text-[11px] font-black flex items-center justify-center ${on ? "bg-white/15 text-white" : i === 6 ? "bg-[#0F1A30] text-white" : i === 0 ? "border border-dashed border-[#B8C4D8] text-[#5B6B85]" : "bg-[#EEF3FB] text-[#2D4C82]"}`} style={NUM}>{i}</span>
                  <span className={`text-[13px] font-black truncate ${on ? "text-white" : n ? "text-[#1B2B4B]" : ""}`}>{s.label}</span>
                </div>
                <div className={`mt-1 text-[22px] font-black leading-none ${on ? "text-white" : n ? "text-[#0F1A30]" : ""}`} style={NUM}>{n}<span className={`text-[13px] ml-0.5 ${on ? "text-white/60" : "text-[#9AA9C3]"}`}>곳</span></div>
                <div className={`mt-1 text-[12px] font-bold truncate ${on ? "text-white/60" : "text-[#9AA9C3]"}`} style={NUM}>{n ? `${shortWon(counts.amt[s.k])}원` : "-"}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 목록 */}
      <div className={`${sdCard} overflow-hidden`} onKeyDown={onKey}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E3E8F0] flex-wrap">
          <div className="relative w-full sm:w-[260px]">
            <Ico d={IC.search} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA9C3] pointer-events-none" />
            <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 검색" className={`${sdInp} pl-9`} />
          </div>
          <label className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-[#D5DDEA] text-[14px] font-bold text-[#3A4A66] cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 accent-[#0F1A30]" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />마감 안 된 곳만
          </label>
          {stageF && <button type="button" onClick={() => setStageF("")} className="h-10 px-3 rounded-xl bg-[#EEF3FB] text-[#1B2B4B] text-[14px] font-black inline-flex items-center gap-1.5">{stageLabel(stageF)}<Ico d={IC.x} size={13} w={2.6} /></button>}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {tools}
            <button type="button" onClick={onManual} className={sdBtn} title="기사명 · 여러 달 · 직접 기간으로 조회"><Ico d={IC.search} size={15} />직접 조회</button>
          </div>
        </div>
        {selGroups.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F1A30] text-white flex-wrap">
            <span className="text-[14px] font-black" style={NUM}>{selGroups.length}곳 선택</span>
            <span className="text-[13px] text-white/60" style={NUM}>{won(selGroups.reduce((s, g) => s + g.total, 0))}원</span>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={() => onBulk("작성", selGroups)} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[14px] font-black">일괄 작성</button>
              <button type="button" onClick={() => onBulk("발송", selGroups)} className="h-9 px-3 rounded-lg bg-white text-[#0F1A30] text-[14px] font-black inline-flex items-center gap-1.5"><Ico d={IC.send} size={14} />일괄 발송</button>
              <button type="button" onClick={() => onBulk("계산서발행", selGroups)} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[14px] font-black" title="선택한 거래처를 계산서 발행 단계로 기록(발행 자체는 각 명세서에서)">일괄 발행 기록</button>
              <button type="button" onClick={() => onBulk("마감", selGroups)} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[14px] font-black">일괄 마감</button>
              <button type="button" onClick={() => setSel(new Set())} className="h-9 px-2.5 rounded-lg text-white/70 hover:text-white text-[14px] font-bold">해제</button>
            </div>
          </div>
        )}
        <div ref={listRef} className="max-h-[calc(100vh-430px)] min-h-[240px] overflow-y-auto" tabIndex={0} aria-label="거래명세서 목록 · 위아래 화살표로 이동, Enter 열기, Space 선택">
          {!shown.length ? (
            <div className="py-16 text-center">
              <div className="text-[16px] font-black text-[#0F1A30]">{groups.length ? "조건에 맞는 거래처가 없어요" : "이 달에는 청구할 오더가 없어요"}</div>
              <div className="text-[14px] text-[#9AA9C3] mt-1">{groups.length ? "검색어나 단계 필터를 바꿔 보세요" : "배차완료 · 청구운임이 있는 오더만 모아요"}</div>
            </div>
          ) : (
            <table className="kp-sd w-full" style={{ tableLayout: "fixed", minWidth: 760 }}>
              <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 140 }} /><col style={{ width: 150 }} /><col style={{ width: 112 }} /><col style={{ width: 172 }} /></colgroup>
              <thead>
                <tr className="text-left text-[13px] text-[#5B6B85] bg-[#F8FAFD]">
                  <th className="px-3 py-2.5 sticky top-0 bg-[#F8FAFD] z-[1]"><input type="checkbox" aria-label="모두 선택" className="w-4 h-4 accent-[#0F1A30]" checked={shown.length > 0 && shown.every((g) => sel.has(g.key))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((g) => g.key)) : new Set())} /></th>
                  <th className="px-2 py-2.5 font-black sticky top-0 bg-[#F8FAFD] z-[1]">거래처</th>
                  <th className="px-2 py-2.5 font-black text-right sticky top-0 bg-[#F8FAFD] z-[1]">건수</th>
                  <th className="px-2 py-2.5 font-black text-right sticky top-0 bg-[#F8FAFD] z-[1]">청구액(VAT 포함)</th>
                  <th className="px-2 py-2.5 font-black sticky top-0 bg-[#F8FAFD] z-[1]">진행</th>
                  <th className="px-2 py-2.5 font-black sticky top-0 bg-[#F8FAFD] z-[1]">단계</th>
                  <th className="px-3 py-2.5 sticky top-0 bg-[#F8FAFD] z-[1]" />
                </tr>
              </thead>
              <tbody>
                {shown.map((g, i) => {
                  const nx = STMT_STAGES[stageIdx(g.stage) + 1];
                  return (
                    <tr key={g.key} data-row={i} onClick={() => setFocus(i)} onDoubleClick={() => onOpen(g)}
                      className={`border-t border-[#EEF2F8] transition ${sel.has(g.key) ? "bg-[#EEF3FB]" : i === focus ? "bg-[#F8FAFD]" : "hover:bg-[#F8FAFD]"}`}>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`${g.client} 선택`} className="w-4 h-4 accent-[#0F1A30]" checked={sel.has(g.key)} onChange={() => toggle(g.key)} /></td>
                      <td className="px-2 py-3 min-w-0">
                        <button type="button" onClick={() => onOpen(g)} className="block max-w-full text-left">
                          <span className="block truncate text-[15px] font-black text-[#0F1A30] hover:underline underline-offset-2">{g.client}</span>
                          <span className="block truncate text-[13px] text-[#9AA9C3]">{g.email || "이메일 없음"}{g.settled ? " · 입금 완료" : ""}{g.lastAt ? ` · ${fmtDay(g.lastAt)} 기록` : ""}</span>
                        </button>
                      </td>
                      <td className="px-2 py-3 text-right text-[14px] text-[#3A4A66]" style={NUM}>{g.count}건{g.prepaidOut > 0 && <div className="text-[11.5px] font-bold text-[#9AA9C3] whitespace-nowrap" title="선불·착불은 명세서에서 뺐어요(미수금에는 들어가요)">선불·착불 {g.prepaidOut}건 제외</div>}</td>
                      <td className="px-2 py-3 text-right text-[15px] font-black text-[#0F1A30]" style={NUM}>{won(g.total)}</td>
                      <td className="px-2 py-3"><StageDots stage={g.stage} /></td>
                      <td className="px-2 py-3"><StageBadge stage={g.stage} /></td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {nx && <button type="button" onClick={() => onAdvance(g, nx.k)} className="h-8 px-2.5 rounded-lg border border-[#D5DDEA] text-[13px] font-black text-[#1B2B4B] hover:bg-[#EEF3FB] mr-1.5" title={`${nx.label}(으)로 기록`}>{nx.k === "발송" ? "보내기" : nx.k === "작성" ? "작성" : `${nx.label}`}</button>}
                        <button type="button" onClick={() => onOpen(g)} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">열기</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 border-t border-[#E3E8F0] bg-[#F8FAFD] text-[13px] text-[#9AA9C3]">↑↓ 이동 · Enter 열기 · Space 선택 · 거래처명을 누르면 명세서 편집</div>
      </div>
    </div>
  );
}

// ───────────────────────── 명세서 줄 편집 그리드 ─────────────────────────
// rows: 조회된 오더(청구운임 > 0) / included: Set(_id) / onAmount(row, 새 공급가) → 오더의 청구운임을 고친다(기존 오더 수정과 같은 저장)
export function StatementLineGrid({ rows, included, onToggle, onToggleAll, onAmount, onOpenOrder, readOnly }) {
  const refs = React.useRef([]);
  const [edit, setEdit] = React.useState({});
  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const commit = async (r, i, move) => {
    const v = edit[r._id];
    if (v != null && toInt(v) !== toInt(r.청구운임) && toInt(v) > 0) await onAmount?.(r, toInt(v));
    setEdit((e) => { const n = { ...e }; delete n[r._id]; return n; });
    if (move) refs.current[i + move]?.focus();
  };
  const incRows = rows.filter((r) => included.has(r._id));
  const sup = incRows.reduce((s, r) => s + toInt(edit[r._id] ?? r.청구운임), 0);
  const vat = incRows.reduce((s, r) => s + Math.round(toInt(edit[r._id] ?? r.청구운임) * 0.1), 0);
  const allOn = rows.length > 0 && incRows.length === rows.length;
  const ph = useNarrow(640); // 📱 2026-11-10 휴대폰 — No·세액 칸을 빼고 화면 폭에 맞춤(세액은 아래 합계에)
  return (
    <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden bg-white">
      <div className="max-h-[460px] overflow-auto">
        <table className="kp-sd w-full" style={{ tableLayout: "fixed", minWidth: ph ? 0 : 470 }}>
          {ph ? <colgroup><col style={{ width: 32 }} /><col style={{ width: 46 }} /><col /><col style={{ width: 96 }} /></colgroup>
            : <colgroup><col style={{ width: 38 }} /><col style={{ width: 36 }} /><col style={{ width: 58 }} /><col /><col style={{ width: 118 }} /><col style={{ width: 78 }} /></colgroup>}
          <thead>
            <tr className="text-[13px] text-[#5B6B85]">
              {[["", "c"], ["No", "c"], ["날짜", "l"], [ph ? "구간 · 기사" : "구간 · 기사 · 화물", "l"], ["공급가액", "r"], ["세액", "r"]].map(([h, a], i) => (ph && (i === 1 || i === 5)) ? null : (
                <th key={i} className={`sticky top-0 z-[1] bg-[#F4F6FA] px-2 py-2.5 font-black ${a === "r" ? "text-right" : a === "c" ? "text-center" : "text-left"}`}>
                  {i === 0 ? <input type="checkbox" aria-label="모두 포함" className="w-4 h-4 accent-[#0F1A30]" checked={allOn} onChange={() => onToggleAll?.(!allOn)} /> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const on = included.has(r._id);
              const v = edit[r._id] ?? toInt(r.청구운임).toLocaleString();
              return (
                <tr key={r._id} className={`border-t border-[#EEF2F8] ${on ? "" : "bg-[#FAFBFD]"}`}>
                  <td className="px-2 py-2 text-center"><input type="checkbox" aria-label="명세서에 넣기" className="w-4 h-4 accent-[#0F1A30]" checked={on} onChange={() => onToggle?.(r._id, !on)} /></td>
                  {!ph && <td className="px-2 py-2 text-center text-[13px] text-[#9AA9C3]" style={NUM}>{i + 1}</td>}
                  <td className={`${ph ? "px-1 text-[13px]" : "px-2 text-[14px]"} py-2 whitespace-nowrap ${on ? "text-[#3A4A66]" : "text-[#9AA9C3] line-through"}`} style={NUM}>{String(r.상차일 || "").slice(5)}</td>
                  <td className="px-2 py-2 min-w-0">
                    <button type="button" onClick={() => onOpenOrder?.(r)} className={`block max-w-full text-left truncate text-[14px] font-bold ${on ? "text-[#0F1A30]" : "text-[#9AA9C3] line-through"} hover:underline underline-offset-2`} title="오더 상세">
                      {r.상차지명 || r.상차지 || "-"} <span className="text-[#9AA9C3]">→</span> {r.하차지명 || r.하차지 || "-"}
                    </button>
                    <div className="truncate text-[13px] text-[#9AA9C3]">{[r.이름 || r.기사명, r.차량번호, r.화물내용].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-1.5 py-1.5 text-right">
                    <input ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete="off" disabled={readOnly || !on} aria-label="공급가액"
                      value={v}
                      onFocus={(e) => { setEdit((x) => ({ ...x, [r._id]: String(toInt(r.청구운임)) })); setTimeout(() => e.target.select(), 0); }}
                      onChange={(e) => setEdit((x) => ({ ...x, [r._id]: e.target.value.replace(/[^\d]/g, "") }))}
                      onBlur={() => commit(r, i, 0)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); commit(r, i, 1); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); commit(r, i, -1); }
                        else if (e.key === "Escape") { setEdit((x) => { const n = { ...x }; delete n[r._id]; return n; }); e.currentTarget.blur(); }
                      }}
                      className="h-9 w-full rounded-lg border border-transparent hover:border-[#D5DDEA] focus:border-[#1B2B4B] focus:ring-2 focus:ring-[#1B2B4B]/10 bg-transparent focus:bg-white px-2 text-right text-[15px] font-black text-[#0F1A30] outline-none disabled:text-[#9AA9C3]" style={NUM} />
                  </td>
                  {!ph && <td className="px-2 py-2 text-right text-[14px] text-[#5B6B85]" style={NUM}>{on ? won(Math.round(toInt(edit[r._id] ?? r.청구운임) * 0.1)) : "-"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t-2 border-[#0F1A30] bg-[#F8FAFD]">
        {[["건수", `${incRows.length}/${rows.length}`], ["공급가액", won(sup)], ["세액", won(vat)], ["합계", won(sup + vat)]].map(([k, v], i) => (
          <div key={k} className={`px-3 py-2.5 ${i % 2 ? "border-l border-[#E3E8F0]" : ""} ${i === 2 ? "sm:border-l" : ""} ${i >= 2 ? "border-t sm:border-t-0 border-[#E3E8F0]" : ""} ${i === 3 ? "bg-[#0F1A30] text-white" : ""}`}>
            <div className={`text-[12px] font-bold ${i === 3 ? "text-white/60" : "text-[#5B6B85]"}`}>{k}</div>
            <div className={`text-[17px] font-black truncate ${i === 3 ? "text-white" : "text-[#0F1A30]"}`} style={NUM}>{v}</div>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 text-[13px] text-[#9AA9C3] border-t border-[#E3E8F0]">금액 칸에서 Enter · ↑↓ 로 다음 줄 · Esc 취소 · 바꾼 금액은 그 오더의 청구운임으로 저장돼요</div>
    </div>
  );
}

// 명세서 이력(단계 기록 + 보낸 메일)
export function StatementHistory({ history = [], logs = [] }) {
  const items = [
    ...history.map((h) => ({ at: tsMs(h.at), title: stageLabel(h.stage), body: h.note || "", by: h.by || "", kind: "stage" })),
    ...logs.map((l) => ({ at: tsMs(l.sentAt), title: l.status === "failed" ? "메일 발송 실패" : String(l.type || "").includes("예약") ? "메일 예약" : "메일 발송", body: `${l.to || ""}${l.error ? ` · ${l.error}` : ""}`, by: l.sentBy || "", kind: l.status === "failed" ? "fail" : "mail" })),
  ].sort((a, b) => b.at - a.at);
  if (!items.length) return <div className="py-6 text-center text-[14px] text-[#9AA9C3]">아직 기록이 없어요</div>;
  return (
    <ol className="relative pl-5">
      <span className="absolute left-[7px] top-1 bottom-1 w-[2px] bg-[#EEF2F8]" />
      {items.map((it, i) => (
        <li key={i} className="relative pb-3 last:pb-0">
          <span className={`absolute -left-5 top-1 w-4 h-4 rounded-full border-2 border-white ${it.kind === "fail" ? "bg-[#B42318]" : it.kind === "mail" ? "bg-[#8FB0F0]" : "bg-[#1B2B4B]"}`} />
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-black text-[#0F1A30]">{it.title}</span>
            <span className="text-[13px] text-[#9AA9C3]" style={NUM}>{fmtDayTime(it.at)}</span>
          </div>
          {(it.body || it.by) && <div className="text-[13px] text-[#5B6B85] truncate">{[it.body, it.by].filter(Boolean).join(" · ")}</div>}
        </li>
      ))}
    </ol>
  );
}

// 단계 기록 팝업(날짜 · 메모) — 거래처 확인 · 계산서 요청 · 계산서 발행 · 마감
export function StageRecordModal({ open, target, onClose, onSave }) {
  const [date, setDate] = React.useState(kstToday());
  const [note, setNote] = React.useState("");
  React.useEffect(() => { if (open) { setDate(kstToday()); setNote(""); } }, [open]);
  if (!open || !target) return null;
  const s = STMT_STAGES[stageIdx(target.stage)];
  const many = target.groups?.length > 1;
  return (
    <KpModal open onClose={onClose} en={`STAGE · ${s.en}`} title={`${s.label}(으)로 기록`} sub={many ? `${target.groups.length}곳 · ${ymLabel(target.groups[0]?.yyyymm)}` : `${target.groups?.[0]?.client || ""} · ${ymLabel(target.groups?.[0]?.yyyymm)}`} width={460}
      footer={<><button type="button" onClick={onClose} className={sdBtn}>취소</button><button type="button" onClick={() => onSave({ date, note: note.trim() })} className={sdBtnPri}><Ico d={IC.check} size={15} w={2.6} />기록하기</button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-[#F4F6FA] px-4 py-3 text-[14px] text-[#3A4A66]">{s.hint}</div>
        <label className="block"><span className="block text-[14px] font-black text-[#3A4A66] mb-1.5">날짜</span>
          <CustomDatePicker className={`${sdInp} text-left`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="block"><span className="block text-[14px] font-black text-[#3A4A66] mb-1.5">메모 <span className="text-[#9AA9C3] font-bold">(선택)</span></span>
          <input autoComplete="off" className={sdInp} value={note} onChange={(e) => setNote(e.target.value)} placeholder={target.stage === "계산서발행" ? "예: 승인번호 2026110700001" : "예: 담당 과장 메일로 확인"} onKeyDown={(e) => { if (e.key === "Enter") onSave({ date, note: note.trim() }); }} /></label>
      </div>
    </KpModal>
  );
}

// ───────────────────────── 미수금 데스크 ─────────────────────────
export const AR_STATUS = {
  정상: { fg: "#1E6B4A", bg: "#E7F4EC", dot: "#2E9466" },
  주의: { fg: "#8A5A00", bg: "#FBF1DC", dot: "#D49B1E" },
  연체: { fg: "#A6400E", bg: "#FCEBE1", dot: "#E06A2C" },
  추심: { fg: "#9B1C1C", bg: "#FCE8E8", dot: "#C93131" },
};
export function ArStatusBadge({ s, manual }) {
  const c = AR_STATUS[s] || AR_STATUS.정상;
  return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[13px] font-black whitespace-nowrap" style={{ background: c.bg, color: c.fg }} title={manual ? "직접 지정한 상태" : "경과일로 자동 판단"}><span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />{s}</span>;
}
export const AGING = [
  { k: "due", label: "기한 전", en: "NOT DUE", color: "#CFE0FF" },
  { k: "d30", label: "1~30일", en: "1-30", color: "#8FB0F0" },
  { k: "d60", label: "31~60일", en: "31-60", color: "#4B6CB7" },
  { k: "d90", label: "61~90일", en: "61-90", color: "#1B2B4B" },
  { k: "d90p", label: "90일 넘음", en: "90+", color: "#C93131" },
];
export const agingKey = (over) => (over == null || over <= 0 ? "due" : over <= 30 ? "d30" : over <= 60 ? "d60" : over <= 90 ? "d90" : "d90p");

export function Spark({ values = [], w = 96, h = 28, color = SD.blue, fill = true }) {
  const vs = values.length ? values : [0];
  const max = Math.max(1, ...vs);
  const step = vs.length > 1 ? w / (vs.length - 1) : w;
  const pts = vs.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {fill && <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity="0.1" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="2.6" fill={color} />
    </svg>
  );
}

// 위쪽 요약: 총 미수 · 연체 · 거래처 · 평균 경과 + 연령 막대 + 월말 잔액 추이
export function ArOverview({ total, supplyTotal, overdue, clientCount, avgDays, aging, trend, months, bucket, setBucket }) {
  const sum = AGING.reduce((s, a) => s + (aging[a.k]?.amt || 0), 0);
  const maxT = Math.max(1, ...trend);
  return (
    <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[["총 미수금", `${won(total)}`, "원", `공급가 ${shortWon(supplyTotal)}원`], ["기한 지난 금액", `${won(overdue)}`, "원", total ? `전체의 ${Math.round((overdue / total) * 100)}%` : "-"], ["미수 거래처", `${clientCount}`, "곳", "잔액이 있는 곳"], ["평균 경과", `${avgDays}`, "일", "금액 가중 평균"]].map(([k, v, u, s], i) => (
            <div key={k} className={`rounded-2xl px-4 py-3.5 ${i === 0 ? "bg-[#0F1A30] text-white" : "bg-white border border-[#E3E8F0]"}`}>
              <div className={`text-[13px] font-bold ${i === 0 ? "text-white/60" : "text-[#5B6B85]"}`}>{k}</div>
              <div className={`text-[20px] sm:text-[24px] font-black leading-tight truncate ${i === 0 ? "text-white" : "text-[#0F1A30]"}`} style={NUM}>{v}<span className={`text-[13px] ml-0.5 ${i === 0 ? "text-white/50" : "text-[#9AA9C3]"}`}>{u}</span></div>
              <div className={`text-[12px] font-bold mt-0.5 truncate ${i === 0 ? "text-white/50" : "text-[#9AA9C3]"}`}>{s}</div>
            </div>
          ))}
        </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">
      <div className={`${sdCard} p-4`}>
        <div>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-[14px] font-black text-[#0F1A30]">연령별 미수금 <span className="text-[13px] font-bold text-[#9AA9C3]">결제 예정일 기준 · 조건이 없으면 청구월 말일</span></div>
            {bucket && <button type="button" onClick={() => setBucket("")} className="h-7 px-2 rounded-lg bg-[#EEF3FB] text-[#1B2B4B] text-[13px] font-black inline-flex items-center gap-1">필터 해제<Ico d={IC.x} size={12} w={2.6} /></button>}
          </div>
          <div className="flex h-4 rounded-full overflow-hidden bg-[#EEF2F8]">
            {AGING.map((a) => { const v = aging[a.k]?.amt || 0; return v > 0 ? <button key={a.k} type="button" title={`${a.label} ${won(v)}원`} onClick={() => setBucket(bucket === a.k ? "" : a.k)} style={{ width: `${(v / (sum || 1)) * 100}%`, background: a.color, opacity: bucket && bucket !== a.k ? 0.3 : 1 }} /> : null; })}
          </div>
          <div className="mt-2.5 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {AGING.map((a) => {
              const x = aging[a.k] || { amt: 0, n: 0 }; const on = bucket === a.k;
              return (
                <button key={a.k} type="button" onClick={() => setBucket(on ? "" : a.k)} className={`text-left rounded-xl px-2.5 py-2 border transition ${on ? "border-[#0F1A30] bg-[#F4F6FA]" : "border-[#EEF2F8] hover:border-[#C9D3E3]"}`}>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} /><span className="text-[13px] font-black text-[#3A4A66] truncate">{a.label}</span></div>
                  <div className="text-[15px] font-black text-[#0F1A30] mt-0.5 truncate" style={NUM}>{shortWon(x.amt)}</div>
                  <div className="text-[12px] font-bold text-[#9AA9C3]" style={NUM}>{x.n}곳</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className={`${sdCard} p-4 flex flex-col`}>
        <div className="flex items-center justify-between">
          <div className="text-[14px] font-black text-[#0F1A30]">월말 미수 잔액 추이</div>
          <div className="text-[13px] font-bold text-[#9AA9C3]">청구 후 그 달 말까지 못 받은 금액</div>
        </div>
        <div className="flex-1 min-h-[150px] mt-3 flex items-end gap-1.5">
          {trend.map((v, i) => (
            <div key={months[i]} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end" title={`${ymLabel(months[i])} ${won(v)}원`}>
              <div className="text-[11px] font-bold text-[#5B6B85] truncate" style={NUM}>{v ? shortWon(v) : ""}</div>
              <div className="w-full rounded-t-md" style={{ height: `${Math.max(2, (v / maxT) * 120)}px`, background: i === trend.length - 1 ? SD.ink : v ? "#4B6CB7" : SD.hair }} />
              <div className={`text-[12px] font-bold ${i === trend.length - 1 ? "text-[#0F1A30]" : "text-[#9AA9C3]"}`} style={NUM}>{Number(String(months[i]).slice(5))}월</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}

// 거래처 목록(미수금)
export function ArClientList({ rows, sel, onSel, sort, setSort }) {
  const head = [["client", "거래처 · 다음 할 일"], ["out", "미수금"], ["over", "경과"], ["last", "최근 입금"], ["trend", "추이"], ["status", "상태"]];
  const listRef = React.useRef(null);
  const onKey = (e) => {
    const i = rows.findIndex((r) => r.client === sel);
    if (e.key === "ArrowDown") { e.preventDefault(); const n = rows[Math.min(rows.length - 1, i + 1)]; if (n) onSel(n.client); }
    if (e.key === "ArrowUp") { e.preventDefault(); const n = rows[Math.max(0, i - 1)]; if (n) onSel(n.client); }
  };
  React.useEffect(() => { const el = listRef.current?.querySelector("[data-on='1']"); const box = listRef.current; if (el && box) { const t = el.offsetTop - box.clientHeight / 2; if (el.offsetTop < box.scrollTop + 40 || el.offsetTop > box.scrollTop + box.clientHeight - 60) box.scrollTop = Math.max(0, t); } }, [sel]);
  if (!rows.length) return <div className="py-16 text-center"><div className="text-[16px] font-black text-[#0F1A30]">받을 돈이 없어요</div><div className="text-[14px] text-[#9AA9C3] mt-1">기간이나 필터를 바꿔 보세요</div></div>;
  const today = kstToday();
  return (
    <div ref={listRef} className="overflow-auto max-h-[calc(100vh-300px)] min-h-[260px]" tabIndex={0} onKeyDown={onKey} aria-label="미수 거래처 목록 · 위아래 화살표로 이동">
      <table className="kp-sd w-full" style={{ tableLayout: "fixed", minWidth: 620 }}>
        <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 96 }} /><col style={{ width: 74 }} /><col style={{ width: 88 }} /><col style={{ width: 82 }} /></colgroup>
        <thead>
          <tr className="text-[13px] text-[#5B6B85]">
            {head.map(([k, h]) => (
              <th key={k} className={`sticky top-0 z-[1] bg-[#F8FAFD] px-2 py-2.5 font-black ${["out", "over"].includes(k) ? "text-right" : "text-left"} ${k === "client" ? "pl-4" : ""}`}>
                {["client", "out", "over", "last"].includes(k)
                  ? <button type="button" onClick={() => setSort(sort.k === k ? { k, d: -sort.d } : { k, d: k === "client" ? 1 : -1 })} className="inline-flex items-center gap-0.5 hover:text-[#0F1A30]">{h}{sort.k === k && <span className="text-[11px]">{sort.d > 0 ? "▲" : "▼"}</span>}</button>
                  : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = r.client === sel;
            const late = r.nextDate && r.nextDate <= today;
            return (
              <tr key={r.client} data-on={on ? "1" : "0"} onClick={() => onSel(r.client)} className={`border-t border-[#EEF2F8] cursor-pointer transition ${on ? "bg-[#EEF3FB] shadow-[inset_3px_0_0_#0F1A30]" : "hover:bg-[#F8FAFD]"}`}>
                <td className="pl-4 pr-2 py-2.5 min-w-0">
                  <div className="truncate text-[15px] font-black text-[#0F1A30]">{r.client}</div>
                  {r.nextAction
                    ? <div className="truncate text-[13px] font-bold" style={{ color: late ? AR_STATUS.연체.fg : SD.sub }}>{r.nextDate ? `${r.nextDate.slice(5).replace("-", "/")}${r.nextDate < today ? " 지남" : r.nextDate === today ? " 오늘" : ""} · ` : ""}{r.nextAction}</div>
                    : <div className="truncate text-[13px] text-[#9AA9C3]">{[r.contact, r.phone].filter(Boolean).join(" · ") || "담당자 미등록"}</div>}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <div className="text-[15px] font-black text-[#0F1A30]" style={NUM}>{won(r.out)}</div>
                  <div className="text-[12px] font-bold text-[#9AA9C3]" style={NUM}>{r.openMonths}개월</div>
                </td>
                <td className="px-2 py-2.5 text-right">
                  <div className="text-[15px] font-black" style={{ ...NUM, color: r.over > 90 ? AR_STATUS.추심.fg : r.over > 30 ? AR_STATUS.연체.fg : r.over > 0 ? AR_STATUS.주의.fg : SD.sub }}>{r.over > 0 ? `${r.over}일` : "기한 전"}</div>
                  <div className="text-[12px] font-bold text-[#9AA9C3]" style={NUM}>{r.oldest ? `${ymLabel(r.oldest)}부터` : ""}</div>
                </td>
                <td className="px-2 py-2.5 text-[14px] text-[#3A4A66]" style={NUM}>{r.lastPay ? fmtDay(r.lastPay) : "-"}</td>
                <td className="px-2 py-2.5"><Spark values={r.trend} color={r.over > 90 ? AR_STATUS.추심.dot : SD.blue} w={76} h={26} /></td>
                <td className="px-2 py-2.5"><ArStatusBadge s={r.status} manual={r.manual} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 발생 지도 — 거래처 × 청구월, 언제부터 쌓였고 어떻게 바뀌는지 한눈에
export function ArAccrualMap({ rows, months, onSel, sel }) {
  const cell = (c) => {
    if (!c) return { bg: "#fff", bd: SD.hair, t: "" };
    if (c.st === "정산완료") return { bg: "#EEF2F8", bd: "#E3E8F0", t: "입금 완료" };
    if (c.st === "진행중") return { bg: "#fff", bd: "#C9D3E3", t: "이번 달(청구 전)" };
    const a = AGING.find((x) => x.k === agingKey(c.over));
    return { bg: c.st === "일부입금" ? `repeating-linear-gradient(135deg, ${a.color} 0 4px, #fff 4px 7px)` : a.color, bd: a.color, t: `${c.st} · ${c.over > 0 ? `${c.over}일 지남` : "기한 전"}` };
  };
  return (
    <div className="overflow-auto max-h-[calc(100vh-420px)] min-h-[260px]">
      <table className="kp-sd border-separate" style={{ borderSpacing: 3, minWidth: 330 + months.length * 37 }}>
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-[2] bg-white text-left px-2 py-1.5 text-[13px] font-black text-[#5B6B85] min-w-[180px]">거래처</th>
            {months.map((m, i) => <th key={m} className="sticky top-0 z-[1] bg-white px-0 py-1.5 text-[12px] font-bold text-[#9AA9C3] whitespace-nowrap text-center" style={NUM}>{i === 0 || m.endsWith("-01") ? `${m.slice(2, 4)}.` : ""}{Number(m.slice(5))}월</th>)}
            <th className="sticky top-0 z-[1] bg-white px-2 py-1.5 text-right text-[13px] font-black text-[#5B6B85]">미수금</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.client} className="cursor-pointer" onClick={() => onSel(r.client)}>
              <td className={`sticky left-0 z-[1] px-2 py-1 text-[14px] font-black truncate max-w-[180px] rounded-lg ${r.client === sel ? "bg-[#EEF3FB] text-[#0F1A30]" : "bg-white text-[#1B2B4B]"}`}>{r.client}</td>
              {months.map((m) => { const c = cell(r.cells[m]); return <td key={m} className="p-0" title={`${r.client} · ${ymLabel(m)}${r.cells[m] ? ` · ${won(r.cells[m].amt)}원 · ${c.t}` : " · 청구 없음"}`}><div className="rounded-md" style={{ width: 34, height: 26, background: c.bg, border: `1px solid ${c.bd}` }} /></td>; })}
              <td className="px-2 text-right text-[14px] font-black text-[#0F1A30] whitespace-nowrap" style={NUM}>{won(r.out)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 flex-wrap px-2 pt-3 text-[13px] font-bold text-[#5B6B85]">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm" style={{ background: "#EEF2F8", border: "1px solid #E3E8F0" }} />입금 완료</span>
        {AGING.map((a) => <span key={a.k} className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm" style={{ background: a.color }} />{a.label}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm" style={{ background: "repeating-linear-gradient(135deg,#8FB0F0 0 4px,#fff 4px 7px)" }} />일부 입금</span>
      </div>
    </div>
  );
}

// 상세 패널 — 거래처 요약 · 빠른 입금 · 다음 할 일 · 타임라인 · 월별 원장
// 💡 2026-11-14 미수금 — 경과일 단계별 추천 행동(회수 순서: 안내 → 확인 전화 → 독촉 → 공식 독촉 · 거래 조정)
export const AR_PLAYBOOK = [
  { max: 0, tone: "#0F7A43", title: "기한 전이에요", act: "입금 예정일만 적어 두면 돼요. 기한 2~3일 전에 안내 메일을 한 번 보내면 좋아요." },
  { max: 30, tone: "#2D4C82", title: "가볍게 안내할 때예요", act: "명세서와 계좌를 다시 보내며 정중하게 확인을 부탁해요. [독촉 메일] 또는 아래 문구를 복사해 문자로 보내요." },
  { max: 60, tone: "#B7791F", title: "전화로 확인할 때예요", act: "담당자에게 전화해서 결재 상황과 입금 예정일을 받아 [약속]으로 기록해요. 결재 라인이 바뀌었는지도 물어봐요." },
  { max: 90, tone: "#C05621", title: "공식적으로 독촉할 때예요", act: "독촉 메일을 다시 보내고 [미수금 보고서]를 붙여요. 대표님께도 공유하고, 새 오더는 선입금이나 한도를 정해 받는 걸 검토해요." },
  { max: Infinity, tone: "#B4342A", title: "회수 조치를 검토할 때예요", act: "새 오더를 잠시 멈추고 내용증명 · 지급명령(전자소송) 같은 법적 절차를 상담해요. 끝내 못 받으면 회계에서 대손으로 처리해요." },
];
export function ArNextAction({ data, expectDate, onRemind }) {
  const [copied, setCopied] = React.useState(false);
  if (!data || !(data.out > 0)) return null;
  const over = Number(data.over) || 0;
  const step = AR_PLAYBOOK.find((p) => over <= p.max) || AR_PLAYBOOK[AR_PLAYBOOK.length - 1];
  const today = kstToday();
  const late = expectDate && expectDate < today ? Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${expectDate}T00:00:00Z`)) / 864e5) : 0;
  const msg = `[${data.client}] 안녕하세요. ${data.oldest ? `${ymLabel(data.oldest)}부터 ` : ""}운송료 ${won(data.out)}원(부가세 포함)이 아직 입금 전으로 확인돼요. 확인 부탁드리며, 입금 예정일을 알려 주시면 감사하겠습니다.`;
  const copy = async () => { try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("아래 문구를 복사해 주세요", msg); } };
  return (
    <div className="px-4 pt-4" data-ar-next>
      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: `${step.tone}55`, background: `${step.tone}0D` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-black px-2 py-0.5 rounded-md text-white" style={{ background: step.tone }}>추천 다음 할 일</span>
          <span className="text-[15px] font-black text-[#0F1A30]">{over > 0 ? `${over}일 지났어요 · ` : ""}{step.title}</span>
          {late > 0 && <span className="text-[12.5px] font-black px-2 py-0.5 rounded-md bg-[#B4342A] text-white">입금 약속 {late}일 지남</span>}
        </div>
        <div className="mt-1.5 text-[14px] leading-[1.6] text-[#2B3A55]">{late > 0 ? `약속한 입금일(${expectDate.slice(5).replace("-", "/")})이 지났어요. 오늘 바로 전화로 확인하고 새 약속일을 기록해 주세요. ` : ""}{step.act}</div>
        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={copy} className="h-9 px-3 rounded-lg bg-white border border-[#C9D5EA] text-[#1B2B4B] text-[13px] font-black">{copied ? "복사했어요 ✓" : "독촉 문구 복사(문자 · 카톡용)"}</button>
          {onRemind && <button type="button" onClick={onRemind} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black">독촉 메일 보내기</button>}
        </div>
      </div>
    </div>
  );
}

export function ArDetail({ data, note, onSaveNote, onQuickPay, quickPreview, onRemind, onReport, onClose, ledger, info, isViewer }) {
  const [tab, setTab] = React.useState("timeline");
  const [amt, setAmt] = React.useState("");
  const [payDate, setPayDate] = React.useState(kstToday());
  const [payName, setPayName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [n, setN] = React.useState({ memo: "", nextAction: "", nextDate: "", expectDate: "", status: "" });
  const [logText, setLogText] = React.useState("");
  const [logType, setLogType] = React.useState("call");
  React.useEffect(() => {
    setN({ memo: note?.memo || "", nextAction: note?.nextAction || "", nextDate: note?.nextDate || "", expectDate: note?.expectDate || "", status: note?.status || "" });
    setAmt(""); setPayName(data?.client || ""); setLogText("");
  }, [data?.client, note?.updatedAt, note?.memo, note?.nextAction, note?.nextDate, note?.expectDate, note?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return (
    <div className={`${sdCard} p-8 text-center`}>
      <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F4F6FA] text-[#9AA9C3] flex items-center justify-center"><Ico d={IC.building} size={22} /></div>
      <div className="mt-3 text-[16px] font-black text-[#0F1A30]">거래처를 고르세요</div>
      <div className="mt-1 text-[14px] text-[#9AA9C3]">미수 내역 · 입금 처리 · 독촉 기록을 여기서 바로 해요</div>
    </div>
  );
  const amount = parseInt(String(amt).replace(/[^\d]/g, ""), 10) || 0;
  const plan = amount > 0 ? quickPreview?.(amount) : null;
  const dirty = ["memo", "nextAction", "nextDate", "expectDate", "status"].some((k) => (n[k] || "") !== (note?.[k] || ""));
  const tl = data.timeline || [];
  return (
    <div className={`${sdCard} overflow-hidden`}>
      <div className="px-5 py-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.24em] text-[#8FB0F0]">RECEIVABLE</div>
            <div className="text-[19px] font-black truncate">{data.client}</div>
            <div className="text-[13px] text-white/60 truncate">{[data.contact, data.phone, data.email].filter(Boolean).join(" · ") || "담당자 정보 없음"}{data.rule ? ` · 결제 ${data.rule}` : ""}</div>
          </div>
          <ArStatusBadge s={data.status} manual={data.manual} />
          {onClose && <button type="button" onClick={onClose} aria-label="닫기" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"><Ico d={IC.x} size={15} w={2.4} /></button>}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] gap-2">
          {[["미수금", won(data.out)], ["첫 미수", data.oldest ? ymLabel(data.oldest) : "-"], ["경과", data.over > 0 ? `${data.over}일` : "기한 전"], ["입금 예정", n.expectDate ? n.expectDate.slice(5).replace("-", "/") : "-"]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/[0.07] border border-white/10 px-2.5 py-2 min-w-0">
              <div className="text-[12px] font-bold text-white/55 truncate">{k}</div>
              <div className="text-[15px] font-black truncate" style={NUM}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <button type="button" onClick={onRemind} className="h-9 px-3 rounded-lg bg-white text-[#0F1A30] text-[13px] font-black inline-flex items-center gap-1.5"><Ico d={IC.mail} size={14} />독촉 메일</button>
          <button type="button" onClick={onReport} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[13px] font-black inline-flex items-center gap-1.5"><Ico d={IC.doc} size={14} />미수금 보고서</button>
          {data.phone && <a href={`tel:${data.phone}`} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[13px] font-black inline-flex items-center gap-1.5 ml-auto"><Ico d={IC.phone} size={14} />전화</a>}
        </div>
      </div>

      {/* 💡 2026-11-14 다음 할 일 추천 · 입금 약속 지남 · 독촉 문구 복사 — 경과일에 맞춰 무엇을 하면 좋은지 */}
      <ArNextAction data={data} expectDate={n.expectDate} onRemind={onRemind} />

      {/* 빠른 입금 처리 — 오래된 달부터 채움(입금 엑셀 자동 매칭과 같은 규칙) */}
      <div className="p-4 border-b border-[#E3E8F0]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[15px] font-black text-[#0F1A30]">입금 처리</div>
          <div className="hidden sm:block text-[13px] text-[#9AA9C3]">금액이 딱 맞는 달 먼저, 없으면 오래된 달부터</div>
        </div>
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2">
          <input inputMode="numeric" autoComplete="off" disabled={isViewer} value={amt ? Number(String(amt).replace(/[^\d]/g, "") || 0).toLocaleString() : ""} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ""))} placeholder="입금액(VAT 포함)" className={`${sdInp} text-right font-black text-[16px]`} style={NUM} />
          <CustomDatePicker className={`${sdInp} text-left`} value={payDate} onChange={(e) => setPayDate(e.target.value)} placeholder="입금일" />
        </div>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {data.out > 0 && <button type="button" onClick={() => setAmt(String(data.out))} className="h-8 px-2.5 rounded-lg bg-[#F4F6FA] text-[13px] font-black text-[#1B2B4B]">전액 {shortWon(data.out)}</button>}
          {(data.openList || []).slice(0, 3).map((m) => <button key={m.k} type="button" onClick={() => setAmt(String(m.remain))} className="h-8 px-2.5 rounded-lg bg-[#F4F6FA] text-[13px] font-bold text-[#3A4A66]" style={NUM}>{Number(m.yyyymm.slice(5))}월 {shortWon(m.remain)}</button>)}
          <input autoComplete="off" value={payName} onChange={(e) => setPayName(e.target.value)} placeholder="입금자명" className="h-8 px-2.5 rounded-lg border border-[#D5DDEA] text-[13px] font-bold w-[130px] ml-auto outline-none focus:border-[#1B2B4B]" />
        </div>
        {plan && (
          <div className="mt-2.5 rounded-xl bg-[#F4F6FA] px-3 py-2.5">
            {plan.alloc.length ? plan.alloc.map((a) => (
              <div key={a.k} className="flex items-center gap-2 text-[14px]" style={NUM}>
                <span className="font-black text-[#0F1A30] w-16">{ymLabel(a.yyyymm)}</span>
                <span className="text-[#5B6B85]">{won(a.amount)}원</span>
                <span className={`ml-auto text-[13px] font-black ${a.full ? "text-[#1E6B4A]" : "text-[#8A5A00]"}`}>{a.full ? "정산완료" : "일부입금"}</span>
              </div>
            )) : <div className="text-[14px] text-[#5B6B85]">남은 미정산 달이 없어요</div>}
            {plan.over > 0 && <div className="mt-1 text-[13px] font-bold text-[#A6400E]" style={NUM}>{won(plan.over)}원은 남아요(초과 입금)</div>}
          </div>
        )}
        <button type="button" disabled={isViewer || !plan?.alloc?.length || busy} onClick={async () => { setBusy(true); try { await onQuickPay(amount, payDate, payName); setAmt(""); } finally { setBusy(false); } }} className={`${sdBtnPri} w-full mt-2.5`}>
          <Ico d={IC.check} size={15} w={2.6} />{busy ? "처리 중…" : amount ? `${won(amount)}원 입금 처리` : "입금액을 넣어 주세요"}
        </button>
      </div>

      <div className="flex items-center gap-1 px-3 border-b border-[#E3E8F0] overflow-x-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
        {[["timeline", "타임라인"], ["next", "할 일 · 메모"], ["ledger", "월별 원장"], ["info", "거래처 정보"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`h-11 px-3 text-[14px] font-black whitespace-nowrap border-b-2 -mb-px ${tab === k ? "border-[#0F1A30] text-[#0F1A30]" : "border-transparent text-[#9AA9C3] hover:text-[#3A4A66]"}`}>{l}</button>
        ))}

      </div>

      <div className="p-4">
        {tab === "timeline" && (
          <>
            <div className="flex items-center gap-1.5 mb-3">
              <div className="inline-flex p-0.5 rounded-lg bg-[#F4F6FA] shrink-0">
                {[["call", "통화"], ["promise", "약속"], ["memo", "메모"]].map(([k, l]) => <button key={k} type="button" onClick={() => setLogType(k)} className={`h-8 px-2.5 rounded-md text-[13px] font-black ${logType === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#5B6B85]"}`}>{l}</button>)}
              </div>
              <input autoComplete="off" disabled={isViewer} value={logText} onChange={(e) => setLogText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && logText.trim()) { onSaveNote({ addLog: { type: logType, text: logText.trim() } }); setLogText(""); } }} placeholder="기록 남기기 (Enter)" className={`${sdInp} h-9`} />
            </div>
            {!tl.length ? <div className="py-6 text-center text-[14px] text-[#9AA9C3]">기록이 없어요</div> : (
              <ol className="relative pl-5 max-h-[360px] xl:max-h-[620px] overflow-y-auto">
                <span className="absolute left-[7px] top-1 bottom-1 w-[2px] bg-[#EEF2F8]" />
                {tl.map((t, i) => (
                  <li key={i} className="relative pb-3 last:pb-0">
                    <span className="absolute -left-5 top-1 w-4 h-4 rounded-full border-2 border-white" style={{ background: t.color }} />
                    <div className="flex items-baseline gap-2"><span className="text-[14px] font-black text-[#0F1A30]">{t.title}</span><span className="text-[13px] text-[#9AA9C3]" style={NUM}>{t.date}</span>{t.amt != null && <span className="ml-auto text-[14px] font-black" style={{ ...NUM, color: t.amtColor || SD.ink }}>{t.amt}</span>}</div>
                    {t.body && <div className="text-[13px] text-[#5B6B85]">{t.body}</div>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        {tab === "next" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block col-span-2"><span className="block text-[14px] font-black text-[#3A4A66] mb-1">다음 할 일</span><input autoComplete="off" disabled={isViewer} className={sdInp} value={n.nextAction} onChange={(e) => setN((x) => ({ ...x, nextAction: e.target.value }))} placeholder="예: 담당자 통화, 독촉 메일 2차" /></label>
              <label className="block"><span className="block text-[14px] font-black text-[#3A4A66] mb-1">할 날짜</span><CustomDatePicker className={`${sdInp} text-left`} value={n.nextDate} onChange={(e) => setN((x) => ({ ...x, nextDate: e.target.value }))} placeholder="날짜" /></label>
              <label className="block"><span className="block text-[14px] font-black text-[#3A4A66] mb-1">입금 예정일</span><CustomDatePicker className={`${sdInp} text-left`} value={n.expectDate} onChange={(e) => setN((x) => ({ ...x, expectDate: e.target.value }))} placeholder="날짜" /></label>
            </div>
            <div>
              <span className="block text-[14px] font-black text-[#3A4A66] mb-1">상태</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button type="button" onClick={() => setN((x) => ({ ...x, status: "" }))} className={`h-9 px-3 rounded-lg text-[13px] font-black border ${!n.status ? "border-[#0F1A30] bg-[#0F1A30] text-white" : "border-[#D5DDEA] text-[#3A4A66]"}`}>자동({data.autoStatus})</button>
                {Object.keys(AR_STATUS).map((s) => <button key={s} type="button" onClick={() => setN((x) => ({ ...x, status: s }))} className={`h-9 px-3 rounded-lg text-[13px] font-black border ${n.status === s ? "border-[#0F1A30] bg-[#0F1A30] text-white" : "border-[#D5DDEA] text-[#3A4A66]"}`}>{s}</button>)}
              </div>
            </div>
            <label className="block"><span className="block text-[14px] font-black text-[#3A4A66] mb-1">메모</span><textarea disabled={isViewer} rows={3} className="w-full rounded-xl border border-[#D5DDEA] px-3 py-2.5 text-[14px] text-[#0F1A30] outline-none focus:border-[#1B2B4B] resize-none" value={n.memo} onChange={(e) => setN((x) => ({ ...x, memo: e.target.value }))} placeholder="거래처 사정, 결재 일정 등" /></label>
            <div className="flex justify-end"><button type="button" disabled={isViewer || !dirty} onClick={() => onSaveNote({ patch: n })} className={sdBtnPri}>저장</button></div>
          </div>
        )}
        {tab === "ledger" && ledger}
        {tab === "info" && info}
      </div>
    </div>
  );
}
