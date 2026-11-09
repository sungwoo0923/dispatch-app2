// ======================= src/VehicleLedger.jsx =======================
// ⭐ 2026-11-02 차량관리대장 — 회사별 맞춤 기능(companyFeatures.vehicleLedger, 최고관리자가 켬)
//  ① 차량 전체 현황: 차량번호·회사·현재 기사·연락처·기사 변경일·차대번호·보험사·유류·하이패스·GPS·덮개·박스·차주명·용도
//     머리글 누르면 정렬(오름/내림), 검색·용도·회사·장비 필터, 엑셀 가져오기/내보내기, 기사관리 차량 불러오기
//  ② 관리대장(차량 한 대): 기본 정보 · 수리·정비 이력(부가세 10% 자동, 연·월 합계, 증빙) · 구조변경 · 기사 탑승 이력 ·
//     기본정보 변경·기타 이력 — 한 페이지에서 한눈에, A4 인쇄·엑셀 저장
//  휴대폰(좁은 화면)에서는 표 대신 카드로 그린다.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import { createPortal } from "react-dom";
import { collection, doc, onSnapshot, query, where, setDoc, deleteDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db, auth } from "./firebase";
import { kpConfirm } from "./kpDialog";
import {
  VL_COL, PURPOSE_PRESETS, REPAIR_KINDS, TON_OPTS, INSURER_OPTS, FUEL_CARD_OPTS, HIPASS_OPTS, GPS_OPTS, COVER_OPTS, BOX_OPTS, LEDGER_TYPE_EXTRA, EQUIP, today, uid, won, num, normPlate, plateCore, vehicleDocId, hasEquip, fmtPhone, normDate,
  currentDriver, parseSheetRows, saveEvidence, loadEvidence, deleteEvidence, dataUrlToBlobUrl, repairVat, ledgerPrintHtml, printHtml,
} from "./vehicleLedgerData";
import VehicleCarePanel from "./VehicleCarePanel";
import CustomDatePicker from "./CustomDatePicker"; // 📅 프로그램 달력(배차관리와 같은 달력)
import { careSummary, vehicleDefaults, TRUCK_MODELS } from "./vehicleCare";
import { useVehicleTypes, VehicleTypePicker, VT_DEFAULTS } from "./vehicleTypes"; // 🚚 2026-11-02 회사 공용 차량종류
import { fmtPhone as fmtPhoneLive } from "./formatInput"; // 입력 중 하이픈(02·031·010 등)
import { upsertAutoEntry } from "./ledgerAuto"; // 🔧 2026-11-09 정비비 → 수입·지출 장부 자동
import VehicleHologram, { twinModel, twinCareSummary } from "./VehicleHologram"; // ⭐ 2026-11-09 차량 3D 분석(디지털 트윈·타이어 위치별 교체)

const C = { ink: "#0B1428", navy: "#0F1A30", mid: "#1B2B4B", blue: "#2D4C82", sky: "#8FB0F0", line: "#E3E8F0", soft: "#F4F6FA", sub: "#5B6B85", mute: "#5B6B85" /* ⭐ 2026-11-05 흐린 글씨 금지 — #9AA9C3 → #5B6B85 */, pale: "#EEF2F9" };
// ⭐ 2026-11-05 고정폭 글씨 → 기본 글씨체(흐릿해 보인다는 의견)
const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const TAB = { fontVariantNumeric: "tabular-nums" };
const VL_CSS = `.vl-row{background:#fff}.vl-row:hover{background:#F2F6FD}.vl-row.vl-hot{background:#E6EEFB}.vl-row.vl-hot>td:first-child{box-shadow:inset 3px 0 0 #2D4C82}.vl-row:focus-visible{background:#E6EEFB}.vl-card{transition:box-shadow .15s,border-color .15s}.vl-card:hover{border-color:#8FB0F0 !important;box-shadow:0 8px 22px rgba(27,43,75,.10)}
        .vl-spin{display:inline-block;width:14px;height:14px;border:2px solid #DCE3EE;border-top-color:#1B2B4B;border-radius:50%;animation:vlspin .8s linear infinite;vertical-align:-2px;margin-right:6px}@keyframes vlspin{to{transform:rotate(360deg)}}`;
const HERO_BG = "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";

function useNarrow(bp = 760) {
  const [n, setN] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => { const f = () => setN(window.innerWidth < bp); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [bp]);
  return n;
}

// ── 공통 작은 부품 ──
const inp = { height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid #D5DDEA", fontSize: 15, color: C.navy, background: "#fff", width: "100%", boxSizing: "border-box", outline: "none" };
function Btn({ children, onClick, kind = "ghost", disabled, style, title, type = "button" }) {
  const k = {
    primary: { background: "linear-gradient(135deg,#1B2B4B,#2D4C82)", color: "#fff", border: "1px solid #1B2B4B" },
    ghost: { background: "#fff", color: C.mid, border: "1px solid #D5DDEA" },
    light: { background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(143,176,240,.35)" },
    danger: { background: "#fff", color: "#B42318", border: "1px solid #F1C4BF" },
  }[kind];
  return <button type={type} title={title} disabled={disabled} onClick={onClick} style={{ height: 40, padding: "0 14px", borderRadius: 10, fontSize: 14.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6, ...k, ...style }}>{children}</button>;
}
function Field({ label, children, wide }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: wide ? "1 / -1" : undefined, minWidth: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: C.sub }}>{label}</span>
      {children}
    </label>
  );
}
// ⭐ 2026-11-02 날짜 칸 — 기본(구식) 달력 대신 프로그램 달력. 지우기로 비울 수 있다
const DATE_CLS = "w-full h-10 px-3 rounded-[10px] border border-[#D5DDEA] bg-white text-[15px] font-semibold text-[#0F1A30]";
function DateField({ value, onChange, placeholder = "날짜 선택" }) {
  return <CustomDatePicker value={value || ""} onChange={(e) => onChange(e.target.value || "")} placeholder={placeholder} className={DATE_CLS} showIcon openOnFocus={false} />;
}
// 모델(제조사·모델 목록) · 연식(연도 목록) — 목록에 없으면 직접입력
const MODEL_OPTS = TRUCK_MODELS.map(([mk, md, hint]) => ({ v: md, label: `${mk} ${md}`, sub: hint }));
const makerOf = (model) => TRUCK_MODELS.find((m) => m[1] === model)?.[0] || "";
const YEAR_OPTS = Array.from({ length: new Date().getFullYear() + 1 - 1995 + 1 }, (_, i) => String(new Date().getFullYear() + 1 - i)).map((y) => ({ v: y, label: `${y}년` }));
// ⭐ 2026-11-02 선택 목록(프로그램 스타일) — 버튼 + 떠 있는 목록(찾기·↑↓·Enter·Esc) + 맨 아래 [직접입력]
//   목록에 없는 값도 그대로 보이고, [직접입력]을 누르면 글자 칸으로 바뀐다.
//   options: ["값", …] 또는 [{ v, sub }] · group 이름은 { group: "제목" }
const VL_OPT = (o) => (typeof o === "string" ? { v: o } : o);
function LedgerSelect({ value, onChange, options = [], placeholder = "선택", allowCustom = true, noneLabel = "선택 안 함", customLabel = "직접입력", customPlaceholder = "직접 입력", style, compact = false, title }) {
  const cur = String(value ?? "");
  const list = useMemo(() => options.map(VL_OPT).filter((o) => o && (o.group || String(o.v ?? "").trim())), [options]);
  const vals = useMemo(() => list.filter((o) => !o.group).map((o) => String(o.v)), [list]);
  const [typing, setTyping] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [q, setQ] = useState("");
  const [act, setAct] = useState(0);
  const btn = useRef(null); const menu = useRef(null); const search = useRef(null); const typeRef = useRef(null);
  const nq = q.replace(/\s/g, "").toLowerCase();
  const items = useMemo(() => {
    const base = nq ? list.filter((o) => !o.group && String(o.label ?? o.v).replace(/\s/g, "").toLowerCase().includes(nq)) : list;
    const out = [];
    if (!nq) out.push({ v: "", none: true });
    if (!nq && cur && !vals.includes(cur)) out.push({ v: cur, legacy: true });
    base.forEach((o) => out.push(o));
    if (allowCustom) out.push({ v: "__custom", custom: true });
    return out;
  }, [list, vals, nq, cur, allowCustom]);
  const pickable = items.map((o, i) => (o.group ? -1 : i)).filter((i) => i >= 0);
  const place = () => {
    const el = btn.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(r.width, 260);
    const below = window.innerHeight - r.bottom - 14; const above = r.top - 14;
    const up = below < 280 && above > below;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width: w, maxH: above } : { left, top: r.bottom + 6, width: w, maxH: below });
  };
  const openIt = () => {
    place(); setQ("");
    const i = items.findIndex((o) => !o.group && !o.custom && String(o.v) === cur);
    setAct(i >= 0 ? i : pickable[0] ?? 0); setOpen(true);
    let touch = false; try { touch = window.matchMedia("(pointer: coarse)").matches; } catch { /* 무시 */ }
    setTimeout(() => (touch ? menu.current : search.current)?.focus?.(), 20);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) setTimeout(() => btn.current?.focus(), 0); };
  const pick = (o) => {
    if (o.custom) { setOpen(false); setTyping(true); if (vals.includes(cur)) onChange(""); setTimeout(() => typeRef.current?.focus(), 20); return; }
    close(); if (String(o.v) !== cur) onChange(String(o.v));
  };
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (btn.current?.contains(e.target) || menu.current?.contains(e.target)) return; close(false); };
    const re = (e) => { if (menu.current?.contains(e.target)) return; close(false); };
    document.addEventListener("mousedown", down, true); document.addEventListener("touchstart", down, true);
    window.addEventListener("scroll", re, true); window.addEventListener("resize", re);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("touchstart", down, true); window.removeEventListener("scroll", re, true); window.removeEventListener("resize", re); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) menu.current?.querySelector(`[data-ls-idx="${act}"]`)?.scrollIntoView?.({ block: "nearest" }); }, [act, open]);
  const step = (d) => { const k = pickable.indexOf(act); const n = pickable[Math.max(0, Math.min(pickable.length - 1, (k < 0 ? 0 : k) + d))]; if (n != null) setAct(n); };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { close(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    if (e.key === "Enter") { e.preventDefault(); const o = items[act]; if (o && !o.group) pick(o); else if (nq && allowCustom) { close(); onChange(q.trim()); } }
  };
  const h = compact ? 38 : 40;
  if (typing) return (
    <div style={{ display: "flex", gap: 6 }}>
      <input ref={typeRef} value={cur} onChange={(e) => onChange(e.target.value)} placeholder={customPlaceholder} style={{ ...inp, height: h, border: "1.5px solid #1B2B4B" }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setTyping(false); } }} />
      <button type="button" onClick={() => setTyping(false)} title="목록에서 고르기"
        style={{ flexShrink: 0, height: h, padding: "0 12px", borderRadius: 10, border: "1px solid #D5DDEA", background: "#fff", color: C.mid, fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>목록</button>
    </div>
  );
  const chev = <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", color: C.sub }}><path d="M6 9l6 6 6-6" /></svg>;
  return (<>
    <button ref={btn} type="button" data-ls="1" aria-haspopup="listbox" aria-expanded={open} title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? close() : openIt(); }}
      onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); openIt(); } }}
      style={{ ...inp, height: h, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer", textAlign: "left", fontWeight: cur ? 800 : 600, color: cur ? C.navy : "#5B6B85", borderColor: open ? C.blue : "#D5DDEA", boxShadow: open ? "0 0 0 4px rgba(45,76,130,.12)" : "none", ...(style || {}) }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{cur ? (list.find((o) => !o.group && String(o.v) === cur)?.label ?? cur) : placeholder}</span>{chev}
    </button>
    {open && pos && createPortal(
      <div ref={menu} role="listbox" tabIndex={-1} data-ls-menu="1" onKeyDown={onKey} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 2147483000, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: "0 18px 44px rgba(15,26,48,.22)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: Math.max(220, Math.min(420, pos.maxH || 420)), fontFamily: "'Pretendard','Noto Sans KR',sans-serif", outline: "none" }}>
        <div style={{ padding: "10px 10px 8px", background: "#F7F9FC", borderBottom: "1px solid #EEF2F7" }}>
          <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setAct(0); }} onKeyDown={onKey} placeholder="찾기"
            style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid #DCE3EE", padding: "0 11px", fontSize: 14.5, fontWeight: 700, color: C.navy, outline: "none", boxSizing: "border-box", background: "#fff" }} />
        </div>
        <div style={{ overflowY: "auto", padding: "5px 0", flex: 1 }}>
          {items.map((o, i) => o.group ? (
            <div key={`g_${o.group}_${i}`} style={{ padding: "8px 16px 4px", fontSize: 14, fontWeight: 900, color: C.blue }}>{o.group}</div>
          ) : (
            <div key={`${o.v}_${i}`} role="option" data-ls-idx={i} aria-selected={!o.custom && String(o.v) === cur}
              onMouseEnter={() => setAct(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
              style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 38, margin: o.custom ? "4px 6px 2px" : "0 6px", padding: "0 10px", borderRadius: 10, cursor: "pointer", userSelect: "none",
                background: i === act ? "#EEF3FC" : "transparent", ...(o.custom ? { border: "1.5px dashed #9FB2D3", justifyContent: "center", color: C.mid, fontWeight: 900, fontSize: 14 } : {}) }}>
              {o.custom ? <>✎ {customLabel}</> : (<>
                <span style={{ width: 15, height: 15, borderRadius: 999, flexShrink: 0, display: "grid", placeItems: "center", border: `2px solid ${String(o.v) === cur && !o.none ? "#1B2B4B" : (o.none && !cur ? "#1B2B4B" : "#C9D5EA")}`, background: (String(o.v) === cur && !o.none) || (o.none && !cur) ? "#1B2B4B" : "#fff" }}>{((String(o.v) === cur && !o.none) || (o.none && !cur)) && <span style={{ width: 5, height: 5, borderRadius: 99, background: "#fff" }} />}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14.5, fontWeight: o.none ? 700 : 800, color: o.none ? "#5B6B85" : C.navy }}>{o.none ? noneLabel : (o.label ?? o.v)}</span>
                {o.sub && <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: C.mute }}>{o.sub}</span>}
                {o.legacy && <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 800, color: "#B54708" }}>직접 입력값</span>}
              </>)}
            </div>
          ))}
          {nq && !items.some((o) => !o.group && !o.custom) && <div style={{ padding: "10px 16px", fontSize: 14, fontWeight: 700, color: C.mute }}>찾는 항목이 없습니다 · Enter로 "{q.trim()}" 그대로 입력</div>}
        </div>
      </div>, document.body)}
  </>);
}
// 예전 이름 그대로(수리 구분 등) — 새 선택 목록으로
function SelectOrType({ value, onChange, options, placeholder = "선택" }) {
  return <LedgerSelect value={value} onChange={onChange} options={options} placeholder={placeholder} />;
}
function Modal({ title, onClose, children, footer, width = 760 }) {
  // ⭐ 2026-11-02 Esc로 닫기(맨 위 창만 · 안쪽 목록·달력이 열려 있으면 그것 먼저) — 바깥(어두운 곳)을 눌러도 닫히지 않는다
  const me = useRef(null);
  useEffect(() => {
    const k = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-ls-menu], [data-vt-menu], [data-kp-popup], [data-kp-dialog]")) return;
      const all = document.querySelectorAll(".vl-modal");
      if (all[all.length - 1] !== me.current) return;
      e.preventDefault(); e.stopPropagation(); onClose?.();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div ref={me} className="vl-modal" style={{ position: "fixed", inset: 0, zIndex: 9600, background: "rgba(11,20,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ width: `min(${width}px, 100%)`, maxHeight: "calc(100vh - 24px)", background: "#fff", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 60px rgba(11,20,40,.35)" }}>
        <div style={{ padding: "14px 18px", background: "linear-gradient(120deg,#0B1428,#1B2B4B)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{title}</div>
          <button type="button" onClick={onClose} title="닫기 (Esc)" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(143,176,240,.35)", color: "#fff", height: 34, padding: "0 12px", borderRadius: 9, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>✕ 닫기</button>
        </div>
        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}
const EqDot = ({ on, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, fontSize: 14, fontWeight: 800, background: on ? C.mid : "#F1F4F9", color: on ? "#fff" : "#5B6B85" }}>{label}</span>
);

// ── 기본 정보 입력 폼(등록·수정 공용) ──
const BASIC_KEYS = ["차량번호", "용도", "톤수", "제조사", "모델", "연식", "회사", "차대번호", "보험사", "차주명", "유류카드사", "유류카드번호", "하이패스", "하이패스카드사", "하이패스카드번호", "하이패스유효기간", "하이패스구분", "하이패스단말기", "하이패스명의", "GPS", "덮개", "박스", "박스메모", "메모", "보험만기", "검사만기", "할부만기"];
// 📅 2026-11-09 만기 자동 알림 — 보험·정기검사·할부(리스) 만기일 → 남은 일수(D-day). 30일 안이면 목록·대장에 표시
const DUE_KEYS = [["보험만기", "보험"], ["검사만기", "정기검사"], ["할부만기", "할부·리스"]];
const daysLeft = (d) => { const t = Date.parse(`${String(d || "").slice(0, 10)}T00:00:00+09:00`); if (!Number.isFinite(t)) return null; const k = new Date(Date.now() + 9 * 3600e3); const today0 = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600e3; return Math.round((t - today0) / 864e5); };
export const dueList = (v) => DUE_KEYS.map(([k, label]) => ({ key: k, label, date: v?.[k] || "", d: daysLeft(v?.[k]) })).filter((x) => x.d !== null).sort((a, b) => a.d - b.d);
const dueText = (x) => (x.d < 0 ? `${x.label} 만기 ${-x.d}일 지남` : x.d === 0 ? `${x.label} 오늘 만기` : `${x.label} D-${x.d}`);
const dueTone = (d) => (d <= 7 ? { bg: "#0F1A30", fg: "#fff" } : d <= 30 ? { bg: "#DCE6F7", fg: "#1B2B4B" } : { bg: "#F1F4F9", fg: "#5B6B85" });
const LEDGER_TYPE_BASE = Array.from(new Set([...VT_DEFAULTS, ...LEDGER_TYPE_EXTRA]));
// ⭐ 2026-11-09 하이패스 카드 — 번호 4-4-4-4 하이픈 자동, 유효기간 MM/YY 자동
const fmtCardNo = (x) => String(x || "").replace(/[^\d]/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1-");
const fmtExpiry = (x) => { const d = String(x || "").replace(/[^\d]/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };
const HIPASS_CARD_OPTS = ["KB국민", "신한", "삼성", "현대", "롯데", "하나", "우리", "BC", "NH농협", "IBK기업", "한국도로공사(선불)"];
const HIPASS_TYPE_OPTS = ["후불(신용)", "후불(체크)", "선불(충전식)", "법인카드", "화물차 감면"];
// 소제목 줄
const FormGroup = ({ title, code, children }) => (
  <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
    <div style={{ padding: "9px 14px", background: "#F7F9FC", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 14.5, fontWeight: 900, color: C.navy }}>{title}</span>
      {code && <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.12em", color: C.blue }}>{code}</span>}
    </div>
    <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>{children}</div>
  </div>
);
function BasicForm({ v, set, purposeOpts, companyOpts, isNew, company }) {
  const f = (k) => ({ value: v[k] || "", onChange: (e) => set({ ...v, [k]: e.target.value }), style: inp });
  const sel = (k, options, extra = {}) => <LedgerSelect value={v[k] || ""} onChange={(x) => set({ ...v, [k]: x })} options={options} {...extra} />;
  // 차량종류 — 다른 화면과 같은 회사 공용 목록(＋ 차량종류 추가 포함). 대장에만 있던 형태(암롤 등)도 목록에
  const typeBase = Array.from(new Set([...LEDGER_TYPE_BASE, ...(purposeOpts || [])]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <FormGroup title="차량" code="VEHICLE">
        <Field label="차량번호 *"><input {...f("차량번호")} placeholder="예) 경기12가3456" /></Field>
        <Field label="차량종류"><VehicleTypePicker value={v.용도 || ""} onChange={(x) => set({ ...v, 용도: x })} base={typeBase} company={company} placeholder="선택" style={{ ...inp, cursor: "pointer", fontWeight: v.용도 ? 800 : 600, color: v.용도 ? C.navy : "#5B6B85" }} /></Field>
        <Field label="톤수">{sel("톤수", TON_OPTS, { customPlaceholder: "예) 6.5톤" })}</Field>
        <Field label="모델 (제조사·모델)"><LedgerSelect value={v.모델 || ""} onChange={(x) => set({ ...v, 모델: x, 제조사: makerOf(x) || (x ? v.제조사 || "" : "") })} options={MODEL_OPTS} placeholder="모델 선택" customPlaceholder="예) 엑시언트 25.5톤" /></Field>
        <Field label="연식"><LedgerSelect value={v.연식 || ""} onChange={(x) => set({ ...v, 연식: String(x || "").replace(/[^\d]/g, "").slice(0, 4) })} options={YEAR_OPTS} placeholder="연식 선택" customPlaceholder="예) 2019" /></Field>
        <Field label="차대번호"><input {...f("차대번호")} placeholder="17자리 영문·숫자" style={{ ...inp, fontFamily: MONO, fontVariantNumeric: "tabular-nums", textTransform: "uppercase" }} /></Field>
      </FormGroup>
      <FormGroup title="소속·보험" code="OWNER">
        <Field label="회사(소속)">{sel("회사", companyOpts, { customPlaceholder: "소속·차주 회사" })}</Field>
        <Field label="차주명"><input {...f("차주명")} placeholder="차주 이름" /></Field>
        <Field label="보험사">{sel("보험사", INSURER_OPTS, { customPlaceholder: "보험사 이름" })}</Field>
        <Field label="보험 만기일"><DateField value={v.보험만기 || ""} onChange={(x) => set({ ...v, 보험만기: x })} placeholder="만기일 선택" /></Field>
        <Field label="정기검사 만료일"><DateField value={v.검사만기 || ""} onChange={(x) => set({ ...v, 검사만기: x })} placeholder="만료일 선택" /></Field>
        <Field label="할부·리스 만기일"><DateField value={v.할부만기 || ""} onChange={(x) => set({ ...v, 할부만기: x })} placeholder="없으면 비워 두기" /></Field>
      </FormGroup>
      <FormGroup title="장비" code="EQUIPMENT">
        <Field label="유류카드 카드사">{sel("유류카드사", FUEL_CARD_OPTS, { customPlaceholder: "카드사 이름" })}</Field>
        <Field label="유류카드 번호"><input {...f("유류카드번호")} inputMode="numeric" placeholder="카드 번호" style={{ ...inp, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} /></Field>
        <Field label="하이패스">{sel("하이패스", HIPASS_OPTS, { customPlaceholder: "카드·단말 번호" })}</Field>
        <Field label="GPS">{sel("GPS", GPS_OPTS, { customPlaceholder: "단말·업체 이름" })}</Field>
        <Field label="덮개">{sel("덮개", COVER_OPTS, { customPlaceholder: "덮개 종류" })}</Field>
        <Field label="박스">{sel("박스", BOX_OPTS, { customPlaceholder: "박스 종류" })}</Field>
        <Field label="박스 사용처·제작사" wide><input {...f("박스메모")} placeholder="어디서 쓰는 박스인지 · 제작사" /></Field>
      </FormGroup>
      {/* ⭐ 2026-11-09 하이패스가 있으면 카드 정보 전부 입력 */}
      {hasEquip(v.하이패스) && (
        <FormGroup title="하이패스 카드" code="HI-PASS">
          <Field label="카드사">{sel("하이패스카드사", HIPASS_CARD_OPTS, { customPlaceholder: "카드사 이름" })}</Field>
          <Field label="카드번호"><input value={v.하이패스카드번호 || ""} onChange={(e) => set({ ...v, 하이패스카드번호: fmtCardNo(e.target.value) })} inputMode="numeric" placeholder="0000-0000-0000-0000" style={{ ...inp, fontFamily: MONO, ...TAB }} /></Field>
          <Field label="유효기간 (MM/YY)"><input value={v.하이패스유효기간 || ""} onChange={(e) => set({ ...v, 하이패스유효기간: fmtExpiry(e.target.value) })} inputMode="numeric" placeholder="MM/YY" style={{ ...inp, fontFamily: MONO, ...TAB }} /></Field>
          <Field label="결제 구분">{sel("하이패스구분", HIPASS_TYPE_OPTS, { customPlaceholder: "결제 방식" })}</Field>
          <Field label="단말기 번호"><input {...f("하이패스단말기")} placeholder="OBU 단말기 번호" /></Field>
          <Field label="카드 명의"><input {...f("하이패스명의")} placeholder="명의자(회사·차주)" /></Field>
        </FormGroup>
      )}
      <Field label="메모" wide><textarea value={v.메모 || ""} onChange={(e) => set({ ...v, 메모: e.target.value })} rows={2} placeholder="메모" style={{ ...inp, height: "auto", padding: 10, resize: "vertical", fontFamily: "inherit" }} /></Field>
    </div>
  );
}

// ── 증빙 보기·올리기 ──
function Evidence({ files = [], onAdd, onRemove, canEdit, compact }) {
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null); // { src, name }
  const ref = useRef(null);
  const open = async (m) => {
    try {
      const data = await loadEvidence(m);
      if (!data) return;
      if (m.type === "pdf") window.open(dataUrlToBlobUrl(data), "_blank");
      else setView({ src: data, name: m.name });
    } catch { /* 무시 */ }
  };
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
      {files.map((m) => (
        <span key={m.id} style={{ display: "inline-flex", alignItems: "center", borderRadius: 7, border: `1px solid ${C.line}`, background: C.pale, overflow: "hidden" }}>
          <button type="button" onClick={() => open(m)} title={m.name} style={{ border: "none", background: "transparent", padding: "3px 8px", fontSize: 14, fontWeight: 800, color: C.blue, cursor: "pointer", maxWidth: compact ? 90 : 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.type === "pdf" ? "PDF" : "사진"} · {m.name}</button>
          {canEdit && onRemove && <button type="button" onClick={() => onRemove(m)} style={{ border: "none", borderLeft: `1px solid ${C.line}`, background: "#fff", padding: "3px 6px", fontSize: 14, color: C.mute, cursor: "pointer" }}>×</button>}
        </span>
      ))}
      {canEdit && onAdd && (<>
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} style={{ border: `1px dashed ${C.sky}`, background: "#fff", borderRadius: 7, padding: "3px 9px", fontSize: 14, fontWeight: 800, color: C.blue, cursor: "pointer" }}>{busy ? "올리는 중…" : "+ 증빙"}</button>
        <input ref={ref} type="file" accept="image/*,application/pdf" multiple hidden onChange={async (e) => {
          const fs = Array.from(e.target.files || []); e.target.value = "";
          if (!fs.length) return;
          setBusy(true);
          try { await onAdd(fs); } finally { setBusy(false); }
        }} />
      </>)}
      {!files.length && !canEdit && <span style={{ color: "#5B6B85", fontSize: 14 }}>-</span>}
      {view && (
        <Modal title={view.name} onClose={() => setView(null)} width={900}>
          <img src={view.src} alt={view.name} style={{ width: "100%", height: "auto", borderRadius: 10 }} />
        </Modal>
      )}
    </span>
  );
}

// ── 이력 표 정의 ──
const HIST = {
  repairs: {
    title: "수리·정비 이력", code: "REPAIR",
    fields: [["일자", "date"], ["구분", "kind"], ["내용", "textarea", "정비내용"], ["업체", "text"], ["업체번호", "phone"], ["공가", "money", "공가금액"], ["부가세", "vat", "부가세(10% 자동)"], ["비고", "text"]],
    empty: () => ({ 일자: today(), 구분: "", 내용: "", 업체: "", 업체번호: "", 공가: "", 부가세: "", 비고: "", files: [] }),
  },
  structures: {
    title: "구조변경 이력", code: "STRUCTURE",
    fields: [["일자", "date"], ["내용", "textarea"], ["업체", "text"], ["금액", "money"], ["비고", "text"]],
    empty: () => ({ 일자: today(), 내용: "", 업체: "", 금액: "", 비고: "", files: [] }),
  },
  logs: {
    title: "기본정보 변경·기타 이력", code: "LOG",
    fields: [["일자", "date"], ["내용", "text"], ["구분", "logkind", "변경/이력"], ["날짜", "date", "관련 날짜"], ["세부내용", "textarea"], ["비고", "text"]],
    empty: () => ({ 일자: today(), 내용: "", 구분: "이력", 날짜: "", 세부내용: "", 비고: "" }),
  },
  driverHist: {
    title: "기사 탑승 이력", code: "DRIVER",
    fields: [["이름", "text", "기사명"], ["연락처", "phone"], ["시작", "date", "탑승 시작"], ["종료", "date", "탑승 종료(비우면 현재)"], ["비고", "text"]],
    empty: () => ({ 이름: "", 연락처: "", 시작: today(), 종료: "", 비고: "" }),
  },
};

function RowEditor({ kind, row, onSave, onClose, kindOpts, onDelete }) {
  const def = HIST[kind];
  const [r, setR] = useState(() => ({ ...def.empty(), ...row }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState([]); // 저장과 함께 올릴 증빙(사진·PDF)
  const fileRef = useRef(null);
  const hasFiles = "files" in def.empty();
  const autoVat = Math.round(num(r.공가) * 0.1);
  return (
    <Modal title={`${def.title} ${row?.id ? "수정" : "추가"}`} onClose={onClose}
      footer={<>{row?.id && onDelete && <Btn kind="danger" onClick={onDelete} style={{ marginRight: "auto" }}>삭제</Btn>}<Btn onClick={onClose}>취소</Btn><Btn kind="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(r, pending); } catch (e) { setBusy(false); setErr(`저장하지 못했습니다(${e?.code || e?.message || "오류"}). 다시 시도하세요.`); return; } setBusy(false); }}>{busy ? (pending.length ? "저장·업로드 중…" : "저장 중…") : "저장"}</Btn></>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {def.fields.map(([k, t, label]) => {
          const L = label || k;
          if (t === "textarea") return <Field key={k} label={L} wide><textarea value={r[k] || ""} onChange={(e) => setR({ ...r, [k]: e.target.value })} rows={3} style={{ ...inp, height: "auto", padding: 10, resize: "vertical", fontFamily: "inherit" }} /></Field>;
          if (t === "kind") return <Field key={k} label={L}><SelectOrType value={r[k]} onChange={(x) => setR({ ...r, [k]: x })} options={kindOpts} /></Field>;
          if (t === "logkind") return <Field key={k} label={L}><LedgerSelect allowCustom={false} value={r[k] || "이력"} onChange={(x) => setR({ ...r, [k]: x || "이력" })} options={["변경", "이력"]} noneLabel="이력" /></Field>;
          if (t === "money") return <Field key={k} label={L}><input inputMode="numeric" value={r[k] === "" || r[k] == null ? "" : won(num(r[k]))} onChange={(e) => setR({ ...r, [k]: e.target.value.replace(/[^\d]/g, "") })} style={{ ...inp, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} placeholder="0" /></Field>;
          if (t === "vat") return (
            <Field key={k} label={L}>
              <input inputMode="numeric" value={r.부가세 === "" || r.부가세 == null ? "" : won(num(r.부가세))} onChange={(e) => setR({ ...r, 부가세: e.target.value.replace(/[^\d]/g, "") })} style={{ ...inp, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} placeholder={`${won(autoVat)} (자동)`} />
            </Field>
          );
          if (t === "date") return <Field key={k} label={L}><DateField value={r[k] || ""} onChange={(x) => setR({ ...r, [k]: x })} /></Field>;
          if (t === "phone") return <Field key={k} label={L}><input inputMode="tel" value={r[k] || ""} onChange={(e) => setR({ ...r, [k]: fmtPhoneLive(e.target.value) })} onBlur={(e) => setR({ ...r, [k]: fmtPhone(e.target.value) })} style={inp} /></Field>;
          return <Field key={k} label={L}><input value={r[k] || ""} onChange={(e) => setR({ ...r, [k]: e.target.value })} style={inp} /></Field>;
        })}
      </div>
      {kind === "repairs" && (
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: C.soft, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14.5, fontWeight: 700, color: C.sub }}>
          <span>공가 <b style={{ color: C.navy, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(num(r.공가))}</b></span>
          <span>부가세 <b style={{ color: C.navy, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(repairVat(r))}</b></span>
          <span>합금액 <b style={{ color: C.navy, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 16 }}>{won(num(r.공가) + repairVat(r))}</b>원</span>
        </div>
      )}
      {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FEF3F2", color: "#B42318", fontSize: 14, fontWeight: 800 }}>{err}</div>}
      {hasFiles && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.sub, marginRight: 4 }}>증빙</span>
          {(r.files || []).map((m) => <span key={m.id} style={{ padding: "3px 9px", borderRadius: 7, background: C.pale, fontSize: 14, fontWeight: 800, color: C.blue }}>{m.type === "pdf" ? "PDF" : "사진"} · {m.name}</span>)}
          {pending.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 9px", borderRadius: 7, border: `1px dashed ${C.sky}`, fontSize: 14, fontWeight: 800, color: C.blue }}>
              새 {/pdf/i.test(f.type) ? "PDF" : "사진"} · {f.name.length > 16 ? f.name.slice(0, 15) + "…" : f.name}
              <button type="button" onClick={() => setPending(pending.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: C.mute, cursor: "pointer", fontSize: 14 }}>×</button>
            </span>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: `1px dashed ${C.sky}`, background: "#fff", color: C.blue, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>+ 사진·PDF (촬영 가능)</button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; setPending((p) => [...p, ...fs]); }} />
        </div>
      )}
    </Modal>
  );
}

// ── 엑셀 가져오기 ──
function ImportModal({ onClose, onImport, existing }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    // "차량번호" 머리글이 있는 첫 시트
    for (const name of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
      const p = parseSheetRows(aoa);
      if (!p.error) { setRes({ ...p, sheet: name, file: file.name }); return; }
    }
    setRes({ error: "'차량번호' 머리글이 있는 시트를 찾지 못했습니다", rows: [] });
  };
  const exKeys = new Set(existing.map((v) => normPlate(v.차량번호)));
  const nNew = res?.rows?.filter((r) => !exKeys.has(normPlate(r.차량번호))).length || 0;
  return (
    <Modal title="차량 전체 현황 엑셀 가져오기" onClose={onClose} width={900}
      footer={<><Btn onClick={onClose}>닫기</Btn>{res?.rows?.length > 0 && <Btn kind="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onImport(res.rows); onClose(); } finally { setBusy(false); } }}>{busy ? "가져오는 중…" : `${res.rows.length}대 가져오기 (새 차량 ${nNew} · 갱신 ${res.rows.length - nNew})`}</Btn>}</>}>
      <div style={{ fontSize: 14.5, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>
        머리글에 <b>차량번호</b>가 있는 시트를 읽습니다. 회사·현재 기사·기사 연락처·기사 변경일·차대번호·보험사·유류·하이패스·GPS·덮개·박스·차주명·용도·톤수 칸을 자동으로 맞춥니다.
        이미 있는 차량은 <b>비어 있지 않은 칸만</b> 덮어쓰고, 현재 기사가 바뀌었으면 탑승 이력에 새 줄을 추가합니다.
      </div>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 90, border: `2px dashed ${C.sky}`, borderRadius: 14, background: C.pale, cursor: "pointer", fontSize: 15, fontWeight: 800, color: C.blue }}>
        {res?.file ? `${res.file} · ${res.sheet || ""} 시트` : "엑셀 파일(.xlsx·.xls) 선택"}
        <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f).catch(() => setRes({ error: "파일을 읽지 못했습니다", rows: [] })); }} />
      </label>
      {res?.error && <div style={{ marginTop: 12, color: "#B42318", fontWeight: 800, fontSize: 14.5 }}>{res.error}</div>}
      {res?.rows?.length > 0 && (<>
        <div style={{ margin: "14px 0 8px", fontSize: 14, fontWeight: 800, color: C.sub }}>맞춘 칸: {Object.values(res.map).join(" · ")}</div>
        <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${C.line}`, borderRadius: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead><tr>{["차량번호", "차량종류", "회사", "현재기사", "기사연락처", "기사변경일", "보험사", "차주명"].map((h) => <th key={h} style={{ position: "sticky", top: 0, background: C.mid, color: "#fff", padding: "8px 10px", fontSize: 14, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{res.rows.slice(0, 200).map((r, i) => (
              <tr key={i} style={{ background: exKeys.has(normPlate(r.차량번호)) ? undefined : "#F3F8EE" }}>
                {["차량번호", "용도", "회사", "현재기사", "기사연락처", "기사변경일", "보험사", "차주명"].map((k) => <td key={k} style={{ padding: "7px 10px", fontSize: 14, borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{r[k] || ""}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ marginTop: 6, fontSize: 14, color: C.mute }}>연두색 줄 = 새로 등록되는 차량</div>
      </>)}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 관리대장(차량 한 대)
// ─────────────────────────────────────────────────────────────────────────────
function Section({ id, title, code, right, children }) {
  return (
    <section id={id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", scrollMarginTop: 70 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 16px", background: "#F7F9FC", borderBottom: `1px solid #E8EDF4` }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.12em", color: C.mute }}>{code}</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.navy }}>{title}</div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
const th = { position: "sticky", top: 0, zIndex: 1, background: C.mid, color: "#fff", padding: "10px 10px", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", textAlign: "center" };
const td = { padding: "10px 10px", fontSize: 14.5, fontWeight: 600, color: C.navy, borderTop: "1px solid #EEF1F6", verticalAlign: "top" };

function Ledger({ v, co, appDriver, linkRaw, drivers, canEdit, by, narrow, purposeOpts, companyOpts, kindOpts, onBack, toast, drawer = false, editSignal = 0 }) {
  const ref = doc(db, VL_COL, v.id);
  const [edit, setEdit] = useState(null); // 기본 정보 수정 중 값
  const [editor, setEditor] = useState(null); // { kind, row }
  const appVeh = linkRaw?.vehicle || {}; // 기사앱(기사 문서)에 입력된 제원 — 모델·연식은 기사앱과 같은 곳을 쓴다
  const startEdit = () => { setEdit(Object.fromEntries(BASIC_KEYS.map((k) => [k, (["제조사", "모델", "연식"].includes(k) ? (appVeh[k] || v[k]) : v[k]) || ""]))); setTimeout(() => document.getElementById("vl-basic")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
  // ⭐ 2026-11-02 표에서 두 번 누르면(더블클릭) 오른쪽 패널이 열리면서 바로 기본 정보 수정
  const sigRef = useRef(0);
  useEffect(() => { if (editSignal !== sigRef.current) { sigRef.current = editSignal; if (canEdit) startEdit(); } }, [editSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drvForm, setDrvForm] = useState(null); // { 이름, 연락처, 시작, driverId }
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(0);
  const cur = currentDriver(v);
  const [photo, setPhoto] = useState("");
  const [tlKind, setTlKind] = useState("all");
  const [tlMore, setTlMore] = useState(false);
  const [holo, setHolo] = useState(false); // ⭐ 2026-11-09 3D 차량 분석 창
  const photoRef = useRef(null);
  useEffect(() => { let on = true; setPhoto(""); if (v.photo?.id) loadEvidence(v.photo).then((d) => { if (on) setPhoto(d); }).catch(() => {}); return () => { on = false; }; }, [v.photo?.id]);
  const uploadPhoto = async (file) => {
    if (!/^image\//.test(file.type)) { toast("사진 파일을 고르세요"); return; }
    try {
      const meta = await saveEvidence(co, v.id, file);
      const old = v.photo;
      await mutate(() => ({ photo: meta }));
      if (old?.id) deleteEvidence([old]).catch(() => {});
      toast("차량 사진을 바꿨습니다");
    } catch (e) { toast(e?.message || "사진을 올리지 못했습니다"); }
  };

  // 배열 이력은 트랜잭션으로(여러 명이 동시에 고쳐도 덮어쓰지 않게)
  // ⭐ 2026-11-02 대장 미작성 차량은 열기만 해서는 아무것도 만들지 않는다 — 처음 무언가를 저장할 때 대장을 만든다
  const mutate = (fn) => runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) {
      if (!v.__base) throw new Error("차량이 삭제되었습니다");
      const base = { ...v.__base, createdAt: Date.now() };
      const patch = fn(base);
      tx.set(ref, { ...base, ...patch, updatedAt: Date.now(), updatedBy: by });
      return;
    }
    const patch = fn(s.data());
    tx.update(ref, { ...patch, updatedAt: Date.now(), updatedBy: by });
  });
  // 🔧 2026-11-09 정비·구조변경 비용 → 회계 › 수입·지출 장부에 자동 지출 한 줄(같은 이력은 한 줄 · 삭제하면 빠짐). 장부 권한이 없으면 조용히 건너뜀
  const syncRepairLedger = (kind, row, removed = false) => {
    if (kind !== "repairs" && kind !== "structures") return;
    const amt = removed ? 0 : (kind === "repairs" ? num(row.공가) + repairVat(row) : num(row.금액));
    const plate = v.차량번호 || "";
    upsertAutoEntry(db, `${v.id}_${row.id}`, {
      company: co, date: row.일자, type: "지출", account: "차량유지비", amount: amt, vendor: row.업체 || "",
      item: `${kind === "repairs" ? "차량 정비" : "구조변경"} · ${plate}${row.구분 ? ` · ${row.구분}` : ""}`,
      memo: `차량관리대장 자동 — ${String(row.내용 || "").slice(0, 60)}`, auto: "vehrepair",
    }).catch(() => {});
  };
  const saveRow = async (kind, r, pendingFiles = []) => {
    const row = { ...r, id: r.id || uid() };
    if (kind === "driverHist") row.연락처 = fmtPhone(row.연락처);
    await mutate((d) => {
      const arr = [...(d[kind] || [])];
      const i = arr.findIndex((x) => x.id === row.id);
      if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push({ ...row, createdAt: Date.now(), by });
      return { [kind]: arr };
    });
    if (pendingFiles.length) await addFiles(kind, row, pendingFiles);
    syncRepairLedger(kind, row);
    setEditor(null); if (!pendingFiles.length) toast("저장했습니다");
  };
  const delRow = async (kind, row) => {
    if (!(await kpConfirm(`이 줄을 삭제할까요?${row.files?.length ? ` (증빙 ${row.files.length}건도 함께 삭제)` : ""}`, { title: "이력 삭제", okText: "삭제", danger: true }))) return false;
    await mutate((d) => ({ [kind]: (d[kind] || []).filter((x) => x.id !== row.id) }));
    syncRepairLedger(kind, row, true);
    deleteEvidence(row.files || []).catch(() => {});
    toast("삭제했습니다");
    return true;
  };
  const addFiles = async (kind, row, files) => {
    try {
      const metas = [];
      for (const f of files) metas.push(await saveEvidence(co, v.id, f));
      await mutate((d) => ({ [kind]: (d[kind] || []).map((x) => (x.id === row.id ? { ...x, files: [...(x.files || []), ...metas] } : x)) }));
      toast(`증빙 ${metas.length}건을 올렸습니다`);
    } catch (e) { toast(e?.message || "올리지 못했습니다"); }
  };
  const rmFile = async (kind, row, m) => {
    if (!(await kpConfirm(`'${m.name}' 증빙을 삭제할까요?`, { title: "증빙 삭제", okText: "삭제", danger: true }))) return;
    await mutate((d) => ({ [kind]: (d[kind] || []).map((x) => (x.id === row.id ? { ...x, files: (x.files || []).filter((f) => f.id !== m.id) } : x)) }));
    deleteEvidence([m]).catch(() => {});
  };
  // 기본 정보 저장 — 바뀐 칸은 '변경 이력'에 자동으로 남긴다
  const saveBasic = async () => {
    const next = {}; const changes = [];
    const effective = (k) => (["제조사", "모델", "연식"].includes(k) ? (appVeh[k] || v[k]) : v[k]);
    BASIC_KEYS.forEach((k) => {
      const a = String(effective(k) ?? "").trim(); const b = String(edit[k] ?? "").trim();
      if (a !== b) { next[k] = b; changes.push({ id: uid(), 일자: today(), 내용: `${k === "용도" ? "차량종류" : k} 변경`, 구분: "변경", 날짜: today(), 세부내용: `${a || "(없음)"} → ${b || "(없음)"}`, 비고: `자동 기록 · ${by}`, createdAt: Date.now(), by }); }
    });
    if (!normPlate(edit.차량번호)) { toast("차량번호를 입력하세요"); return; }
    if (!changes.length) { setEdit(null); return; }
    if (next.차량번호 !== undefined) next.plateKey = normPlate(next.차량번호);
    if (next.용도 !== undefined) next.차량종류 = next.용도; // ⭐ 2026-11-02 다른 화면과 같은 이름(차량종류)으로도 저장
    await mutate((d) => ({ ...next, logs: [...(d.logs || []), ...changes] }));
    // ⭐ 모델·연식은 기사앱 '제원'과 같은 곳(기사 문서 vehicle)에도 저장 → 기사앱에 그대로 보인다
    const vk = ["제조사", "모델", "연식"].filter((k) => next[k] !== undefined);
    if (vk.length && linkRaw?.id) {
      try { await setDoc(doc(db, "drivers", linkRaw.id), { vehicle: Object.fromEntries(vk.map((k) => [k, next[k]])), careUpdatedAt: serverTimestamp(), careUpdatedBy: by }, { merge: true }); } catch { /* 권한·오프라인 — 대장에는 저장됨 */ }
    }
    setEdit(null); toast(`${changes.length}개 항목을 저장했습니다`);
  };
  // 기사 변경 — 이전 기사의 탑승을 시작일로 닫고 새 줄 추가
  const changeDriver = async () => {
    const f = drvForm;
    if (!String(f.이름 || "").trim()) { toast("기사 이름을 입력하세요"); return; }
    await mutate((d) => {
      const hist = (d.driverHist || []).map((r) => (r.종료 ? r : { ...r, 종료: f.시작 || today() }));
      const prev = currentDriver(d);
      hist.push({ id: uid(), 이름: f.이름.trim(), 연락처: fmtPhone(f.연락처), 시작: f.시작 || today(), 종료: "", 비고: f.비고 || "", driverId: f.driverId || "", createdAt: Date.now(), by });
      const log = { id: uid(), 일자: today(), 내용: "기사 변경", 구분: "변경", 날짜: f.시작 || today(), 세부내용: `${prev?.이름 || "(없음)"} → ${f.이름.trim()}`, 비고: `자동 기록 · ${by}`, createdAt: Date.now(), by };
      return { driverHist: hist, logs: [...(d.logs || []), log] };
    });
    setDrvForm(null); toast("기사를 변경했습니다");
  };
  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const kv = [["항목", "내용"], ["차량번호", v.차량번호], ["차량종류", v.용도], ["톤수", v.톤수], ["회사", v.회사], ["차대번호", v.차대번호], ["보험사", v.보험사], ["차주명", v.차주명],
      ["현재 기사", cur?.이름 || ""], ["기사 연락처", cur?.연락처 || ""], ["기사 변경일", cur?.시작 || ""], ["유류카드 카드사", v.유류카드사], ["유류카드 번호", v.유류카드번호], ["하이패스", v.하이패스], ["하이패스 카드사", v.하이패스카드사], ["하이패스 카드번호", v.하이패스카드번호], ["하이패스 유효기간", v.하이패스유효기간], ["하이패스 결제구분", v.하이패스구분], ["하이패스 단말기", v.하이패스단말기], ["하이패스 명의", v.하이패스명의], ["GPS", v.GPS], ["덮개", v.덮개], ["박스", v.박스], ["박스 사용처", v.박스메모], ["메모", v.메모]];
    const add = (name, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = w.map((x) => ({ wch: x })); XLSX.utils.book_append_sheet(wb, ws, name); };
    add("기본정보", kv, [16, 40]);
    const rep = [...(v.repairs || [])].sort((a, b) => String(a.일자).localeCompare(String(b.일자)));
    add("수리정비", [["일자", "구분", "정비내용", "업체", "업체번호", "공가금액", "부가세", "합금액", "비고", "증빙"], ...rep.map((r) => [r.일자, r.구분, r.내용, r.업체, r.업체번호, num(r.공가), repairVat(r), num(r.공가) + repairVat(r), r.비고, (r.files || []).length || ""]),
      ["합계", "", "", "", "", rep.reduce((s, r) => s + num(r.공가), 0), rep.reduce((s, r) => s + repairVat(r), 0), rep.reduce((s, r) => s + num(r.공가) + repairVat(r), 0), "", ""]], [12, 12, 40, 16, 15, 12, 11, 12, 20, 6]);
    add("구조변경", [["일자", "내용", "업체", "금액", "비고"], ...(v.structures || []).map((r) => [r.일자, r.내용, r.업체, num(r.금액), r.비고])], [12, 40, 16, 12, 20]);
    add("기사탑승", [["시작", "종료", "기사", "연락처", "비고"], ...(v.driverHist || []).map((r) => [r.시작, r.종료 || "현재", r.이름, r.연락처, r.비고])], [12, 12, 12, 15, 20]);
    // ⭐ 2026-11-09 3D 차량 분석 — 제원(입력·기사앱·기본값 구분) + 타이어 위치별 교체
    const tw = twinModel(v, linkRaw);
    add("제원", [["항목", "값", "출처"], ...Object.entries(tw.vals).map(([k, x]) => [k, x.v === "" ? "" : String(x.v), x.src])], [14, 18, 10]);
    add("타이어", [["위치", "교체일", "교체 km", "브랜드", "규격", "메모", "상태"], ...tw.positions.map((p) => { const st = tw.tireState[p.key]; const r = st.base === "위치별 기록" ? st.rec : null; return [p.label, r?.date || "", r?.km ? Number(r.km) : "", r?.brand || "", r?.size || "", r?.memo || "", st.level === 2 ? "교체 시기 지남" : st.level === 1 ? "곧 교체" : st.level === 0 ? "정상" : "기록 없음"]; })], [18, 12, 10, 14, 12, 20, 14]);
    add("변경기타이력", [["일자", "내용", "변경/이력", "날짜", "세부내용", "비고"], ...(v.logs || []).map((r) => [r.일자, r.내용, r.구분, r.날짜, r.세부내용, r.비고])], [12, 20, 10, 12, 40, 24]);
    XLSX.writeFile(wb, `차량관리대장_${normPlate(v.차량번호)}_${today()}.xlsx`);
  };
  const removeVehicle = async () => {
    if (!(await kpConfirm(`${v.차량번호} 차량과 모든 이력·증빙을 삭제할까요? 되돌릴 수 없습니다.`, { title: "차량 삭제", okText: "삭제", danger: true }))) return;
    const files = [...(v.repairs || []), ...(v.structures || [])].flatMap((r) => r.files || []);
    await runDelete({ label: "차량", task: () => deleteDoc(ref) }); // ⭐ 2026-11-05 삭제 진행 창
    deleteEvidence(files).catch(() => {});
    onBack(); toast("삭제했습니다");
  };

  // 정비 합계(연·월)
  const reps = v.repairs || [];
  const years = Array.from(new Set([String(new Date().getFullYear()), ...reps.map((r) => String(r.일자 || "").slice(0, 4)).filter((y) => /^\d{4}$/.test(y))])).sort().reverse();
  const inYear = (r) => year === "all" || String(r.일자 || "").startsWith(year);
  const monthly = Array.from({ length: 12 }, (_, i) => reps.filter((r) => inYear(r) && Number(String(r.일자 || "").slice(5, 7)) === i + 1).reduce((s, r) => s + num(r.공가) + repairVat(r), 0));
  const repShown = reps.filter((r) => inYear(r) && (!month || Number(String(r.일자 || "").slice(5, 7)) === month)).sort((a, b) => String(b.일자 || "").localeCompare(String(a.일자 || "")));
  const sum = { g: repShown.reduce((s, r) => s + num(r.공가), 0), v: repShown.reduce((s, r) => s + repairVat(r), 0) };
  const maxM = Math.max(1, ...monthly);

  const info = [
    ["차량번호", v.차량번호], ["차량종류", v.용도], ["톤수", v.톤수], ["모델", [appVeh.제조사 || v.제조사, appVeh.모델 || v.모델].filter(Boolean).join(" ")], ["연식", (appVeh.연식 || v.연식) ? `${appVeh.연식 || v.연식}년` : ""], ["회사", v.회사], ["차대번호", v.차대번호], ["보험사", v.보험사], ["차주명", v.차주명],
    ["현재 기사", cur ? cur.이름 : appDriver ? `${appDriver.이름} (기사관리)` : ""], ["기사 연락처", cur ? cur.연락처 : appDriver?.전화번호 || ""], ["기사 변경일", cur?.시작 || ""],
  ];
  const nav = [["vl-basic", "기본 정보"], ["vl-care", "점검·소모품"], ["vl-timeline", "타임라인"], ["vl-repairs", `정비 ${reps.length}`], ["vl-structures", `구조변경 ${(v.structures || []).length}`], ["vl-driverHist", `기사 ${(v.driverHist || []).length}`], ["vl-logs", `변경·기타 ${(v.logs || []).length}`]];
  // 타임라인 — 정비·구조변경·기사 탑승·변경/기타를 날짜순으로
  const TL = { repairs: ["정비", C.blue], structures: ["구조변경", "#6B5BD2"], driverHist: ["기사", "#0E8A6A"], logs: ["변경·기타", C.sub] };
  const events = [
    ...reps.map((r) => ({ k: "repairs", d: r.일자, t: [r.구분, r.내용].filter(Boolean).join(" · ") || "정비", s: [r.업체, r.비고].filter(Boolean).join(" · "), amt: num(r.공가) + repairVat(r), files: r.files?.length || 0 })),
    ...(v.structures || []).map((r) => ({ k: "structures", d: r.일자, t: r.내용 || "구조변경", s: [r.업체, r.비고].filter(Boolean).join(" · "), amt: num(r.금액), files: r.files?.length || 0 })),
    ...(v.driverHist || []).flatMap((r) => [{ k: "driverHist", d: r.시작, t: `${r.이름} 기사 배정 (이 차량 운행 시작)`, s: r.연락처 || "" }, ...(r.종료 ? [{ k: "driverHist", d: r.종료, t: `${r.이름} 기사 교체 (운행 종료)`, s: "" }] : [])]),
    ...(v.logs || []).map((r) => ({ k: "logs", d: r.일자, t: `${r.내용 || "이력"}${r.구분 ? ` (${r.구분})` : ""}`, s: r.세부내용 || r.비고 || "" })),
  ].filter((e) => tlKind === "all" || e.k === tlKind).sort((a, b) => String(b.d || "").localeCompare(String(a.d || "")));
  const evShown = tlMore ? events : events.slice(0, 12);
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // 이력 표(구조변경·기타·기사) — 넓으면 표, 좁으면 카드
  const HistTable = ({ kind, rows, cols, render }) => {
    const sorted = [...rows].sort((a, b) => String(b[cols[0][0]] || "").localeCompare(String(a[cols[0][0]] || "")));
    if (!sorted.length) return <div style={{ padding: 28, textAlign: "center", color: C.mute, fontSize: 14.5 }}>기록이 없습니다</div>;
    if (narrow) return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {sorted.map((r) => (
          <div key={r.id} style={{ padding: "12px 14px", borderTop: `1px solid #EEF1F6` }} onClick={() => canEdit && setEditor({ kind, row: r })}>
            {render ? render(r) : cols.map(([k, l]) => r[k] ? <div key={k} style={{ fontSize: 14.5, color: C.navy, lineHeight: 1.5 }}><b style={{ color: C.sub, fontSize: 14, marginRight: 6 }}>{l}</b>{typeof r[k] === "number" || k === "금액" ? won(num(r[k])) : r[k]}</div> : null)}
            {"files" in HIST[kind].empty() && <div style={{ marginTop: 6 }}><Evidence files={r.files} canEdit={canEdit} compact onAdd={(fs) => addFiles(kind, r, fs)} onRemove={(m) => rmFile(kind, r, m)} /></div>}
          </div>
        ))}
      </div>
    );
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr>{cols.map(([k, l]) => <th key={k} style={th}>{l}</th>)}{"files" in HIST[kind].empty() && <th style={th}>증빙</th>}{canEdit && <th style={{ ...th, width: 110 }}></th>}</tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.id}>
              {cols.map(([k, , st]) => <td key={k} style={{ ...td, ...(st || {}) }}>{k === "금액" ? won(num(r[k])) : k === "종료" ? (r[k] || <b style={{ color: C.blue }}>현재</b>) : r[k] || ""}</td>)}
              {"files" in HIST[kind].empty() && <td style={td}><Evidence files={r.files} canEdit={canEdit} onAdd={(fs) => addFiles(kind, r, fs)} onRemove={(m) => rmFile(kind, r, m)} /></td>}
              {canEdit && <td style={{ ...td, whiteSpace: "nowrap", textAlign: "center" }}><RowActs onEdit={() => setEditor({ kind, row: r })} onDel={() => delRow(kind, r)} /></td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 머리 — 차량 사진 + 번호판 */}
      <div style={{ borderRadius: 18, padding: narrow ? 14 : "18px 22px", color: "#fff", background: HERO_BG, display: "flex", alignItems: "center", gap: narrow ? 12 : 18, flexWrap: "wrap" }}>
        {drawer ? (
          <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.12em", color: C.sky, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{narrow ? "VEHICLE" : "VEHICLE · 차량 정보"}</span>
            {/* ⭐ 2026-11-09 순서: 기본 정보 수정 · 인쇄 · 엑셀 저장 · 닫기 */}
            {canEdit && !edit && <Btn kind="light" onClick={startEdit}>✎ 기본 정보 수정</Btn>}
            <Btn kind="light" onClick={() => printHtml(ledgerPrintHtml(v, co))}>인쇄(A4)</Btn>
            <Btn kind="light" onClick={exportXlsx}>엑셀 저장</Btn>
            <Btn kind="light" onClick={onBack} title="닫기 (Esc)">✕ 닫기</Btn>
          </div>
        ) : <div style={{ width: narrow ? "100%" : "auto" }}><Btn kind="light" onClick={onBack}>← 차량 목록</Btn></div>}
        <button type="button" onClick={() => canEdit && photoRef.current?.click()} title={canEdit ? "차량 사진 바꾸기" : ""} style={{ position: "relative", width: narrow ? 92 : 132, height: narrow ? 70 : 96, borderRadius: 14, border: "1px solid rgba(143,176,240,.35)", background: photo ? `center/cover no-repeat url(${photo})` : "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center", cursor: canEdit ? "pointer" : "default", flexShrink: 0, overflow: "hidden", padding: 0 }}>
          {!photo && <TruckIcon s={narrow ? 34 : 44} />}
          {canEdit && <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "3px 0", background: "rgba(11,20,40,.62)", fontSize: 14, fontWeight: 800, color: "#fff" }}>{photo ? "사진 변경" : "+ 차량 사진"}</span>}
        </button>
        <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadPhoto(f); }} />
        <div style={{ flex: 1, minWidth: narrow ? 0 : 240, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.12em", color: C.sky }}>VEHICLE LEDGER · 관리대장</div>
          <div><Plate text={v.차량번호} size={narrow ? "md" : "lg"} /></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 14, fontWeight: 700 }}>
            {[v.용도, v.톤수, v.회사].filter(Boolean).map((t) => <span key={t} style={{ padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,.1)", border: "1px solid rgba(143,176,240,.25)" }}>{t}</span>)}
            {(cur || appDriver) && <span style={{ padding: "3px 10px", borderRadius: 99, background: "rgba(143,176,240,.22)" }}>기사 {cur?.이름 || appDriver.이름}{(cur?.연락처 || appDriver?.전화번호) ? ` · ${cur?.연락처 || appDriver.전화번호}` : ""}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: narrow ? "stretch" : "flex-end", width: narrow ? "100%" : "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 8, alignItems: "stretch" }}>
          {[["정비", `${reps.length}건`], [`${new Date().getFullYear()} 정비비`, won(reps.filter((r) => String(r.일자 || "").startsWith(String(new Date().getFullYear()))).reduce((s2, r) => s2 + num(r.공가) + repairVat(r), 0))], ["주행거리", linkRaw?.care?.odometer ? `${Number(linkRaw.care.odometer).toLocaleString()}km` : "-"]].map(([l, n]) => (
            <div key={l} style={{ padding: "8px 12px", borderRadius: 12, border: "1px solid rgba(143,176,240,.28)", background: "rgba(255,255,255,.05)", minWidth: narrow ? 0 : 96 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap" }}>{l}</div>
              <div style={{ fontFamily: MONO, fontSize: narrow ? 15 : 18, fontWeight: 800, whiteSpace: "nowrap", ...TAB }}>{n}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="light" onClick={() => setHolo(true)} title="차량을 3D 홀로그램으로 보고 타이어·제원·상태를 분석" style={{ background: "linear-gradient(135deg, rgba(56,225,255,.28), rgba(45,245,196,.18))", border: "1px solid rgba(56,225,255,.6)", boxShadow: "0 0 14px rgba(56,225,255,.25)" }}>◈ 3D 차량 분석</Btn>
          {!drawer && <><Btn kind="light" onClick={() => printHtml(ledgerPrintHtml(v, co))}>인쇄(A4)</Btn><Btn kind="light" onClick={exportXlsx}>엑셀 저장</Btn></>}
          {canEdit && !v.virtual && <Btn kind="light" onClick={removeVehicle}>차량 삭제</Btn>}
        </div>
        </div>
      </div>
      {v.virtual && (
        <div style={{ padding: "12px 16px", borderRadius: 14, border: `1.5px dashed ${C.sky}`, background: "#F4F8FF", color: C.mid, fontSize: 14.5, fontWeight: 700, lineHeight: 1.6 }}>
          <b style={{ color: C.navy }}>대장 미작성 차량</b> — 기사관리에 있는 지입·직영·임대 차량이지만 아직 대장에 저장한 내용이 없습니다. 기본 정보·정비·구조변경·기사 이력 중 하나를 저장하면 대장이 만들어집니다. (열어 보기만 해서는 아무것도 바뀌지 않습니다)
        </div>
      )}
      {/* 바로가기 */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", gap: 6, overflowX: "auto", padding: 6, background: "rgba(244,246,250,.94)", backdropFilter: "blur(6px)", borderRadius: 12, border: `1px solid ${C.line}` }}>
        {nav.map(([id, l]) => <button key={id} type="button" onClick={() => go(id)} style={{ flexShrink: 0, height: 36, padding: "0 14px", borderRadius: 9, border: "none", background: "#fff", color: C.mid, fontSize: 14.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.06)" }}>{l}</button>)}
      </div>

      {/* 기본 정보 */}
      {/* 📅 2026-11-09 만기 자동 알림(30일 안·지난 것) */}
      {dueList(v).filter((x) => x.d <= 30).length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, background: "#0F1A30", color: "#fff" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", color: "#8FB0F0" }}>DUE</span>
          {dueList(v).filter((x) => x.d <= 30).map((x) => <span key={x.key} style={{ padding: "3px 10px", borderRadius: 99, background: x.d <= 7 ? "#fff" : "rgba(255,255,255,.12)", color: x.d <= 7 ? "#0F1A30" : "#fff", fontSize: 13.5, fontWeight: 800 }}>{dueText(x)} · {x.date}</span>)}
        </div>
      )}
      <Section id="vl-basic" title="기본 정보" code="BASIC" right={canEdit && (edit ? <div style={{ display: "flex", gap: 6 }}><Btn onClick={() => setEdit(null)}>취소</Btn><Btn kind="primary" onClick={saveBasic}>저장</Btn></div> : <Btn onClick={startEdit}>수정</Btn>)}>
        <div style={{ padding: 16 }}>
          {edit ? <BasicForm v={edit} set={setEdit} purposeOpts={purposeOpts} companyOpts={companyOpts} company={co} /> : (<>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2, minmax(0,1fr))" : "repeat(5, minmax(0,1fr))", gap: 0, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              {info.map(([k, val]) => (
                <div key={k} style={{ padding: "10px 12px", borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.mute }}>{k}</div>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: val ? C.navy : "#5B6B85", marginTop: 2, wordBreak: "break-all" }}>{val || "-"}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 14, fontWeight: 900, color: C.sub }}>장비</div>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "repeat(5, minmax(0,1fr))", gap: 10, marginTop: 8 }}>
              {[["유류카드", [v.유류카드사, v.유류카드번호].filter(Boolean).join(" · "), hasEquip(v.유류카드번호)], ["하이패스", [v.하이패스, v.하이패스카드사, v.하이패스카드번호, v.하이패스유효기간 && `유효 ${v.하이패스유효기간}`, v.하이패스구분, v.하이패스단말기 && `단말 ${v.하이패스단말기}`, v.하이패스명의 && `명의 ${v.하이패스명의}`].filter(Boolean).join(" · "), hasEquip(v.하이패스)], ["GPS", v.GPS, hasEquip(v.GPS)], ["덮개", v.덮개, hasEquip(v.덮개)], ["박스", [v.박스, v.박스메모].filter(Boolean).join(" · "), hasEquip(v.박스)]].map(([k, val, on]) => (
                <div key={k} style={{ padding: "12px 14px", borderRadius: 12, background: on ? "linear-gradient(135deg,#0F1A30,#1B2B4B)" : C.soft, color: on ? "#fff" : C.mute, display: "flex", alignItems: narrow ? "center" : "flex-start", flexDirection: narrow ? "row" : "column", gap: narrow ? 10 : 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: on ? C.sky : C.mute, minWidth: narrow ? 64 : 0 }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, wordBreak: "break-all" }}>{val || "없음"}</div>
                </div>
              ))}
            </div>
            {v.메모 && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: C.pale, fontSize: 14.5, color: C.navy }}>{v.메모}</div>}
          </>)}
        </div>
      </Section>

      {/* 점검·소모품 — 기존 '차량 관리'(기사앱 점검) 데이터를 그대로(기사 문서에 저장) */}
      <Section id="vl-care" title="점검·소모품" code="CARE · 기사앱 연동" right={linkRaw && <span style={{ fontSize: 14, fontWeight: 700, color: C.sub }}>기사관리 · {linkRaw.이름 || linkRaw.name} 차량 정보와 함께 저장됩니다</span>}>
        <div style={{ padding: narrow ? 12 : "14px 18px" }}>
          {linkRaw
            ? <VehicleCarePanel key={linkRaw.id} driverId={linkRaw.id} drv={linkRaw} by={by} staff large={!narrow} onToast={toast} />
            : <div style={{ padding: 22, textAlign: "center", color: C.sub, fontSize: 14.5, lineHeight: 1.7 }}>기사관리에 이 차량번호로 등록된 기사가 없어 점검·소모품 기록이 없습니다.<br />기사관리에서 기사를 등록하거나 [기사 변경]에서 기사관리 기사를 고르면 주행거리·엔진오일·만기 점검이 여기에 이어집니다.</div>}
        </div>
      </Section>

      {/* 타임라인 */}
      <Section id="vl-timeline" title="이력 타임라인" code="TIMELINE" right={<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {[["all", "전체"], ...Object.entries(TL).map(([k, [l]]) => [k, l])].map(([k, l]) => <button key={k} type="button" onClick={() => setTlKind(k)} style={{ height: 32, padding: "0 12px", borderRadius: 99, border: `1px solid ${tlKind === k ? C.mid : "#D5DDEA"}`, background: tlKind === k ? C.mid : "#fff", color: tlKind === k ? "#fff" : C.sub, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{l}</button>)}
      </div>}>
        {!events.length ? <div style={{ padding: 28, textAlign: "center", color: C.mute, fontSize: 14.5 }}>아직 기록된 이력이 없습니다. 아래에서 정비·구조변경·기사 탑승을 추가하면 여기에 날짜순으로 쌓입니다.</div> : (
          <div style={{ padding: narrow ? "12px 12px 8px" : "16px 22px 10px" }}>
            {evShown.map((e, i) => {
              const [l, col] = TL[e.k];
              const yr = String(e.d || "").slice(0, 4); const prevYr = i ? String(evShown[i - 1].d || "").slice(0, 4) : "";
              return (
                <React.Fragment key={i}>
                  {yr !== prevYr && <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: C.mute, margin: i ? "10px 0 6px" : "0 0 6px" }}>{yr || "날짜 없음"}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: narrow ? "52px 18px 1fr" : "96px 22px 1fr auto", alignItems: "start", columnGap: 8 }}>
                    <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 800, color: C.sub, paddingTop: 2, ...TAB }}>{narrow ? String(e.d || "").slice(5) : e.d}</span>
                    <span style={{ position: "relative", display: "flex", justifyContent: "center", alignSelf: "stretch" }}>
                      <span style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: "#E3E8F0" }} />
                      <span style={{ position: "relative", marginTop: 5, width: 11, height: 11, borderRadius: 99, background: col, boxShadow: "0 0 0 3px #fff" }} />
                    </span>
                    <div style={{ paddingBottom: 12, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, wordBreak: "keep-all" }}><span style={{ fontSize: 14, fontWeight: 900, color: col, marginRight: 6 }}>{l}</span>{e.t}</div>
                      {(e.s || e.files > 0 || (narrow && e.amt)) ? <div style={{ fontSize: 14, color: C.sub, marginTop: 1 }}>{[e.s, e.files ? `증빙 ${e.files}` : "", narrow && e.amt ? `${won(e.amt)}원` : ""].filter(Boolean).join(" · ")}</div> : null}
                    </div>
                    {!narrow && <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 800, color: C.navy, paddingTop: 1, ...TAB }}>{e.amt ? `${won(e.amt)}원` : ""}</span>}
                  </div>
                </React.Fragment>
              );
            })}
            {events.length > 12 && <button type="button" onClick={() => setTlMore(!tlMore)} style={{ display: "block", margin: "0 auto 8px", height: 34, padding: "0 16px", borderRadius: 99, border: "1px solid #D5DDEA", background: "#fff", color: C.mid, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{tlMore ? "접기" : `${events.length - 12}건 더 보기`}</button>}
          </div>
        )}
      </Section>

      {/* 수리·정비 */}
      <Section id="vl-repairs" title="수리·정비 이력" code="REPAIR" right={<div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 120 }}><LedgerSelect compact allowCustom={false} value={year} onChange={(x) => { setYear(x || "all"); setMonth(0); }} noneLabel="전체" placeholder="전체" options={[...years.map((y) => ({ v: y, label: `${y}년` })), { v: "all", label: "전체" }]} style={{ height: 38 }} /></div>
        {canEdit && <Btn kind="primary" onClick={() => setEditor({ kind: "repairs", row: null })}>+ 정비 추가</Btn>}
      </div>}>
        <div style={{ padding: "14px 16px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch", borderBottom: `1px solid #EEF1F6` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, flex: narrow ? "1 1 100%" : "0 0 400px" }}>
            {[["공가", sum.g], ["부가세", sum.v], ["합금액", sum.g + sum.v]].map(([l, n], i) => (
              <div key={l} style={{ padding: "10px 12px", borderRadius: 12, background: i === 2 ? "linear-gradient(135deg,#0F1A30,#2D4C82)" : C.soft, color: i === 2 ? "#fff" : C.navy }}>
                <div style={{ fontSize: 14, fontWeight: 800, opacity: 0.75 }}>{l} · {repShown.length}건</div>
                <div style={{ fontFamily: MONO, fontSize: narrow ? 16 : 19, fontWeight: 800, marginTop: 2 }}>{won(n)}</div>
              </div>
            ))}
          </div>
          {year !== "all" && (
            <div style={{ flex: 1, minWidth: 260, display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 4, alignItems: "end" }}>
              {monthly.map((m, i) => (
                <button key={i} type="button" onClick={() => setMonth(month === i + 1 ? 0 : i + 1)} title={`${i + 1}월 ${won(m)}원`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                  <span style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: C.sub, whiteSpace: "nowrap" }}>{m ? (m >= 10000 ? `${Math.round(m / 10000)}만` : won(m)) : ""}</span>
                  <span style={{ width: "100%", height: Math.max(4, Math.round((m / maxM) * 48)), borderRadius: 4, background: month === i + 1 ? C.blue : m ? C.sky : "#E6EBF3" }} />
                  <span style={{ fontSize: 14, fontWeight: month === i + 1 ? 900 : 700, color: month === i + 1 ? C.blue : C.sub, whiteSpace: "nowrap" }}>{narrow ? i + 1 : `${i + 1}월`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {month > 0 && <div style={{ padding: "8px 16px", fontSize: 14, fontWeight: 800, color: C.blue }}>{year}년 {month}월만 보는 중 · <button type="button" onClick={() => setMonth(0)} style={{ border: "none", background: "none", color: C.sub, textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>전체 월 보기</button></div>}
        {repShown.length === 0 ? <div style={{ padding: 28, textAlign: "center", color: C.mute, fontSize: 14.5 }}>기록이 없습니다</div> : narrow ? (
          <div>{repShown.map((r) => (
            <div key={r.id} style={{ padding: "12px 14px", borderTop: `1px solid #EEF1F6` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={() => canEdit && setEditor({ kind: "repairs", row: r })}>
                <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: C.sub }}>{r.일자}</span>
                {r.구분 && <span style={{ padding: "2px 8px", borderRadius: 6, background: C.pale, color: C.blue, fontSize: 14, fontWeight: 800 }}>{r.구분}</span>}
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.navy }}>{won(num(r.공가) + repairVat(r))}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginTop: 4, whiteSpace: "pre-wrap" }} onClick={() => canEdit && setEditor({ kind: "repairs", row: r })}>{r.내용 || "-"}</div>
              <div style={{ fontSize: 14, color: C.sub, marginTop: 2 }}>{[r.업체, r.업체번호, num(r.공가) ? `공가 ${won(num(r.공가))} + 부가세 ${won(repairVat(r))}` : "", r.비고].filter(Boolean).join(" · ")}</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Evidence files={r.files} canEdit={canEdit} compact onAdd={(fs) => addFiles("repairs", r, fs)} onRemove={(m) => rmFile("repairs", r, m)} />
                {canEdit && <span style={{ marginLeft: "auto" }}><RowActs onEdit={() => setEditor({ kind: "repairs", row: r })} onDel={() => delRow("repairs", r)} /></span>}
              </div>
            </div>
          ))}</div>
        ) : (
          <div style={{ overflow: "auto", maxHeight: 560 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead><tr>{["일자", "구분", "정비내용", "업체", "업체번호", "공가금액", "부가세", "합금액", "비고·증빙"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {repShown.map((r) => (
                  <tr key={r.id} className="vl-row" title={canEdit ? "눌러서 수정·삭제" : ""} onClick={() => canEdit && setEditor({ kind: "repairs", row: r })} style={{ cursor: canEdit ? "pointer" : "default" }}>
                    <td style={{ ...td, whiteSpace: "nowrap", fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{r.일자}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.구분}</td>
                    <td style={{ ...td, minWidth: 170, whiteSpace: "pre-wrap" }}>{r.내용}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.업체}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.업체번호}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{won(num(r.공가))}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: C.sub }}>{won(repairVat(r))}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{won(num(r.공가) + repairVat(r))}</td>
                    <td style={{ ...td, minWidth: 150 }}>{r.비고 && <div style={{ marginBottom: 4 }}>{r.비고}</div>}<Evidence files={r.files} canEdit={canEdit} compact onAdd={(fs) => addFiles("repairs", r, fs)} onRemove={(m) => rmFile("repairs", r, m)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ background: C.soft }}>
                <td colSpan={5} style={{ ...td, fontWeight: 900 }}>합계 {repShown.length}건</td>
                <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 800 }}>{won(sum.g)}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 800 }}>{won(sum.v)}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 900 }}>{won(sum.g + sum.v)}</td>
                <td style={{ ...td, color: C.mute, fontSize: 14, fontWeight: 600 }}>{canEdit ? "줄을 누르면 수정" : ""}</td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </Section>

      {/* 구조변경 */}
      <Section id="vl-structures" title="구조변경 이력" code="STRUCTURE" right={canEdit && <Btn kind="primary" onClick={() => setEditor({ kind: "structures", row: null })}>+ 구조변경 추가</Btn>}>
        {HistTable({ kind: "structures", rows: v.structures || [], cols: [["일자", "일자", { whiteSpace: "nowrap", fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14 }], ["내용", "내용", { minWidth: 260, whiteSpace: "pre-wrap" }], ["업체", "업체", { whiteSpace: "nowrap" }], ["금액", "금액", { textAlign: "right", fontFamily: MONO, fontVariantNumeric: "tabular-nums" }], ["비고", "비고"]] })}
      </Section>

      {/* 기사 탑승 */}
      <Section id="vl-driverHist" title="기사 탑승 이력" code="DRIVER" right={canEdit && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!v.virtual && !cur && appDriver && !(v.driverHist || []).length && <Btn onClick={() => saveRow("driverHist", { 이름: appDriver.이름, 연락처: appDriver.전화번호, 시작: today(), 종료: "", 비고: "기사관리에서 가져옴", driverId: appDriver.id })}>기사관리 기사로 시작</Btn>}
        <Btn onClick={() => setEditor({ kind: "driverHist", row: null })}>+ 과거 이력</Btn>
        <Btn kind="primary" onClick={() => setDrvForm({ 이름: "", 연락처: "", 시작: today(), driverId: "", 비고: "" })}>기사 변경</Btn>
      </div>}>
        <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: `1px solid #EEF1F6` }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.sub }}>현재 기사</span>
          {cur ? <span style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{cur.이름} <a href={`tel:${cur.연락처}`} style={{ fontSize: 14.5, color: C.blue, fontWeight: 700, marginLeft: 6 }}>{cur.연락처}</a> <span style={{ fontSize: 14, color: C.sub, fontWeight: 700, marginLeft: 6 }}>{cur.시작}부터</span></span>
            : <span style={{ fontSize: 14.5, color: C.mute }}>{appDriver ? `탑승 이력 없음 · 기사관리 등록 기사: ${appDriver.이름} ${appDriver.전화번호 || ""}` : "배정된 기사가 없습니다"}</span>}
        </div>
        {HistTable({ kind: "driverHist", rows: v.driverHist || [], cols: [["시작", "시작", { whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }], ["종료", "종료", { whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }], ["이름", "기사", { whiteSpace: "nowrap", fontWeight: 800 }], ["연락처", "연락처", { whiteSpace: "nowrap" }], ["비고", "비고"]],
          render: (r) => <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><b style={{ fontSize: 15.5, color: C.navy }}>{r.이름}</b><a href={`tel:${r.연락처}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 14, color: C.blue }}>{r.연락처}</a><span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 14, color: r.종료 ? C.sub : C.blue, fontWeight: 800 }}>{r.시작} ~ {r.종료 || "현재"}</span>{r.비고 && <div style={{ width: "100%", fontSize: 14, color: C.sub }}>{r.비고}</div>}</div> })}
      </Section>

      {/* 변경·기타 이력 */}
      <Section id="vl-logs" title="기본정보 변경·기타 이력" code="LOG" right={canEdit && <Btn kind="primary" onClick={() => setEditor({ kind: "logs", row: null })}>+ 이력 추가</Btn>}>
        {HistTable({ kind: "logs", rows: v.logs || [], cols: [["일자", "일자", { whiteSpace: "nowrap", fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14 }], ["내용", "내용", { whiteSpace: "nowrap", fontWeight: 800 }], ["구분", "변경/이력", { whiteSpace: "nowrap", textAlign: "center" }], ["날짜", "날짜", { whiteSpace: "nowrap", fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14 }], ["세부내용", "세부내용", { minWidth: 240, whiteSpace: "pre-wrap" }], ["비고", "비고", { color: C.sub }]] })}
      </Section>

      <style>{VL_CSS}</style>
      {holo && <VehicleHologram v={v} linkRaw={linkRaw} by={by} canEdit={canEdit} narrow={narrow} DateField={DateField} onClose={() => setHolo(false)}
        onSave={async (fn, okMsg) => { try { await mutate((d) => fn(d)); toast(okMsg || "저장했습니다"); } catch (e) { toast(e?.message || "저장하지 못했습니다"); throw e; } }} />}
      {editor && <RowEditor kind={editor.kind} row={editor.row} kindOpts={kindOpts} onClose={() => setEditor(null)} onSave={(r, fs) => saveRow(editor.kind, r, fs)} onDelete={canEdit ? async () => { const ok = await delRow(editor.kind, editor.row); if (ok) setEditor(null); } : null} />}
      {drvForm && (
        <Modal title="기사 변경" onClose={() => setDrvForm(null)} width={560}
          footer={<><Btn onClick={() => setDrvForm(null)}>취소</Btn><Btn kind="primary" onClick={changeDriver}>변경 저장</Btn></>}>
          <div style={{ fontSize: 14.5, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>{cur ? <>지금 기사 <b style={{ color: C.navy }}>{cur.이름}</b>의 탑승은 시작일로 자동 종료되고, 새 기사가 현재 기사가 됩니다.</> : "새 기사가 현재 기사가 됩니다."}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
            <Field label="기사관리에서 고르기" wide>
              <LedgerSelect allowCustom={false} value={drvForm.driverId} noneLabel="직접 입력 (아래 칸에 이름·연락처)" placeholder="직접 입력"
                onChange={(id) => { const d = drivers.find((x) => x.id === id); setDrvForm({ ...drvForm, driverId: id, 이름: d ? (d.이름 || d.name || "") : drvForm.이름, 연락처: d ? fmtPhone(d.전화번호 || d.phone || "") : drvForm.연락처 }); }}
                options={drivers.map((d) => ({ v: d.id, label: `${d.이름 || d.name || "-"} · ${d.차량번호 || "-"}`, sub: d.등급 || "" }))} />
            </Field>
            <Field label="기사 이름 *"><input value={drvForm.이름} onChange={(e) => setDrvForm({ ...drvForm, 이름: e.target.value })} style={inp} /></Field>
            <Field label="연락처"><input inputMode="tel" value={drvForm.연락처} onChange={(e) => setDrvForm({ ...drvForm, 연락처: fmtPhoneLive(e.target.value) })} onBlur={(e) => setDrvForm({ ...drvForm, 연락처: fmtPhone(e.target.value) })} style={inp} /></Field>
            <Field label="기사 변경일(탑승 시작)"><DateField value={drvForm.시작} onChange={(x) => setDrvForm({ ...drvForm, 시작: x })} /></Field>
            <Field label="비고"><input value={drvForm.비고} onChange={(e) => setDrvForm({ ...drvForm, 비고: e.target.value })} style={inp} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
// ⭐ 2026-11-02 오른쪽에서 밀려 나오는 차량 정보·수정 패널(예전엔 화면 전체가 대장으로 바뀌어 위에서 수정창이 열렸다)
function LedgerDrawer({ onClose, onDouble, narrow, children }) {
  const openedAt = useRef(Date.now());
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const k = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return; // 안쪽 창이 이미 Esc를 처리했으면 그대로 둔다
      if (document.querySelector(".vl-modal, [data-ls-menu], [data-vt-menu], [data-vt-dialog], [data-kp-dialog], [data-kp-popup]")) return; // 안쪽 창·목록·달력이 먼저 닫힌다
      onClose();
    };
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [onClose]);
  // ⭐ 2026-11-02 바깥(어두운 곳)을 눌러도 닫히지 않는다 — Esc 또는 [✕ 닫기]로만 닫는다(입력하다 실수로 닫히지 않게)
  //   표에서 더블클릭하면 두 번째 클릭이 바탕에 떨어진다 → '수정'으로
  const onBackdrop = (e) => {
    if (Date.now() - openedAt.current < 600 && e.detail >= 2) onDouble?.();
  };
  return createPortal(
    <div data-vl-drawer="1" style={{ position: "fixed", inset: 0, zIndex: 9500 }}>
      <div onClick={onBackdrop} style={{ position: "absolute", inset: 0, background: "rgba(11,20,40,.42)", backdropFilter: "blur(1.5px)", opacity: shown ? 1 : 0, transition: "opacity .22s ease" }} />
      <aside role="dialog" aria-modal="true" aria-label="차량 정보"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: narrow ? "100%" : "min(1000px, 96vw)", background: C.soft, boxShadow: "-24px 0 60px rgba(11,20,40,.28)", display: "flex", flexDirection: "column",
          transform: shown ? "translateX(0)" : "translateX(100%)", transition: "transform .28s cubic-bezier(.2,.8,.2,1)", borderTopLeftRadius: narrow ? 0 : 20, borderBottomLeftRadius: narrow ? 0 : 20, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: narrow ? 10 : 16, fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }}>{children}</div>
      </aside>
    </div>, document.body);
}

function RowActs({ onEdit, onDel }) {
  const b = { height: 32, padding: "0 10px", borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer", background: "#fff" };
  return (
    <span style={{ display: "inline-flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={onEdit} style={{ ...b, border: `1px solid #D5DDEA`, color: C.mid }}>수정</button>
      <button type="button" onClick={onDel} style={{ ...b, border: "1px solid #F1C4BF", color: "#B42318" }}>삭제</button>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 차량 전체 현황
// ─────────────────────────────────────────────────────────────────────────────
// 기존 "차량 관리"(기사앱 점검·소모품) 칸 + 태진 "차량 전체 현황" 칸
const COLS = [
  // ⭐ 2026-11-02 담당자는 순번 바로 뒤(고정 칸) — 누가 맡은 차량인지 먼저 보이게
  ["순번", "순번", 56], ["담당자", "담당자", 96], ["차량번호", "차량번호", 150], ["용도", "차량종류", 110], ["톤수", "톤수", 70], ["회사", "회사", 110], ["현재기사", "현재 기사", 118], ["가입유형", "가입유형", 96], ["기사연락처", "기사 연락처", 136], ["기사변경일", "기사 변경일", 116],
  ["차대번호", "차대번호", 180], ["보험사", "보험사", 90], ["유류카드번호", "유류", 120], ["하이패스", "하이패스", 100], ["GPS", "GPS", 80], ["덮개", "덮개", 70], ["박스", "박스", 90], ["차주명", "차주명", 90],
  ["모델연식", "모델·연식", 140], ["주행거리", "주행거리", 110], ["엔진오일", "엔진오일", 100], ["점검알림", "점검 알림", 200], ["만기", "만기 알림", 150],
];
const EQ_KEYS = EQUIP.map((e) => e.key);

function Plate({ text, size = "md" }) {
  const big = size === "lg";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: big ? 10 : 6, padding: big ? "6px 16px 6px 8px" : "3px 10px 3px 5px", borderRadius: big ? 10 : 7, background: "linear-gradient(180deg,#FFFFFF,#EEF2F8)", border: `${big ? 2.5 : 1.5}px solid #0F1A30`, boxShadow: big ? "0 6px 18px rgba(0,0,0,.25), inset 0 -2px 0 rgba(15,26,48,.08)" : "inset 0 -1px 0 rgba(15,26,48,.08)", whiteSpace: "nowrap" }}>
      <span style={{ width: big ? 8 : 5, alignSelf: "stretch", borderRadius: 3, background: "linear-gradient(180deg,#2D4C82,#1B2B4B)" }} />
      <span style={{ fontSize: big ? 26 : 15.5, fontWeight: 900, color: "#0B1428", letterSpacing: big ? "0.04em" : "0.02em", ...TAB }}>{text}</span>
    </span>
  );
}
const TruckIcon = ({ s = 40, c = C.sky }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="14" height="10" rx="1.5" /><path d="M15 10h4l3 3v3h-7z" /><circle cx="6" cy="18" r="1.8" /><circle cx="18" cy="18" r="1.8" /></svg>
);

function careCells(r) {
  const cs = r.cs;
  if (!cs) return { oil: null, alerts: null };
  const oil = cs.alerts.find((a) => a.key === "engineOil");
  return { oil, oilLast: r.linkRaw?.care?.items?.engineOil, alerts: cs.alerts };
}

// ⭐ 2026-11-02 PC: 한 번 누르면 선택만, 두 번 눌러야 열림 · 휴대폰(터치): 두 번 탭은 확대·지연이 생겨 한 번 탭으로 연다(오른쪽 '열기 ›' 표시)
function VehicleCard({ r, onOpen, onSelect, touch = false, hot = false }) {
  const { alerts } = careCells(r);
  return (
    <button type="button" onClick={touch ? onOpen : onSelect} onDoubleClick={touch ? undefined : onOpen} onKeyDown={(e) => { if (!touch && e.key === "Enter") { e.preventDefault(); onOpen(); } }}
      title={touch ? "" : "두 번 누르면 차량 정보 · 수정 패널이 열립니다"} className={`vl-card${hot ? " vl-hot" : ""}`} style={{ textAlign: "left", border: `1px solid ${hot ? C.mid : C.line}`, background: "#fff", borderRadius: 14, padding: 14, cursor: "pointer", display: "flex", flexDirection: "column", gap: 9, minWidth: 0, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
        <Plate text={r.차량번호} />
        {r.용도 && <span style={{ padding: "2px 8px", borderRadius: 6, background: C.pale, color: C.blue, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{r.용도}</span>}
        {r.톤수 && <span style={{ fontSize: 14, color: C.sub, fontWeight: 700, whiteSpace: "nowrap" }}>{r.톤수}</span>}
        {r.virtual && <span title="아직 대장에 아무것도 저장하지 않은 차량" style={{ marginLeft: "auto", padding: "2px 7px", borderRadius: 6, border: `1px dashed ${C.sky}`, color: C.blue, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>대장 미작성</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 14.5, color: r.현재기사 ? C.navy : C.mute, fontWeight: 800, minWidth: 0 }}>
        <span style={{ whiteSpace: "nowrap" }}>{r.현재기사 || "기사 미배정"}</span>
        {r.가입유형 && <span title="가입유형" style={{ padding: "1px 8px", borderRadius: 6, background: r.가입유형 === "지입" ? C.mid : C.pale, color: r.가입유형 === "지입" ? "#fff" : C.blue, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{r.가입유형}</span>}
        {r.appJoined && <span style={{ padding: "1px 7px", borderRadius: 6, background: C.mid, color: "#fff", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>앱 가입</span>}
        {r.기사연락처 && <span style={{ color: C.blue, fontWeight: 600, whiteSpace: "nowrap", ...TAB }}>{r.기사연락처}</span>}
        <span style={{ marginLeft: "auto", fontSize: 14, color: C.sub, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[r.담당자 && `담당 ${r.담당자}`, r.회사].filter(Boolean).join(" · ")}</span>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{EQUIP.map((e) => <EqDot key={e.key} on={hasEquip(r[e.key])} label={e.label} />)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.sub, fontWeight: 700, borderTop: "1px dashed #E3E8F0", paddingTop: 8 }}>
        <span style={{ fontFamily: MONO, ...TAB }}>{r.cs?.odometer ? `${r.cs.odometer.toLocaleString()}km` : "주행거리 -"}</span>
        <span style={{ marginLeft: "auto" }}>{alerts?.length ? <span style={{ padding: "2px 8px", borderRadius: 6, background: r.cs.over ? C.navy : "#DCE6F7", color: r.cs.over ? "#fff" : C.mid, fontWeight: 800 }}>점검 {alerts.length}</span> : r.linkRaw ? (r.cs?.setupDone || r.cs?.odometer ? "점검 정상" : "점검 미설정") : "점검 데이터 없음"}</span>
        {r.yearCost > 0 && <span style={{ fontFamily: MONO, color: C.navy, ...TAB }}>정비 {won(r.yearCost)}</span>}
        {touch && <span aria-hidden="true" style={{ flexShrink: 0, height: 26, padding: "0 10px", borderRadius: 8, background: C.navy, color: "#fff", fontSize: 14, fontWeight: 800, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>열기 ›</span>}
      </div>
    </button>
  );
}

export default function VehicleLedger({ company = "", drivers = [], canEdit = true, myName = "", by: byProp = "" }) {
  const co = String(company || "").trim();
  const narrow = useNarrow();
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [selId, setSelId] = useState(() => { try { return sessionStorage.getItem("vlSel") || null; } catch { return null; } });
  const [q, setQ] = useState("");
  const [fPurpose, setFPurpose] = useState("");
  const [fCo, setFCo] = useState("");
  const [fEq, setFEq] = useState("");
  const [fCare, setFCare] = useState(false);
  // ⭐ 2026-11-02 정렬은 이 브라우저(내 화면)에만 기억 — 서버에 저장하지 않아 다른 직원 화면에는 영향 없음
  const [sort, setSortRaw] = useState(() => { try { const x = JSON.parse(localStorage.getItem("vlSort") || "null"); if (x && x.k) return x; } catch { /* 무시 */ } return { k: "차량번호", d: 1 }; });
  const setSort = (fn) => setSortRaw((p) => { const n = typeof fn === "function" ? fn(p) : fn; try { localStorage.setItem("vlSort", JSON.stringify(n)); } catch { /* 무시 */ } return n; });
  // 내 차량만 보기(내가 담당자인 차량) — 이 브라우저에만 기억
  const [mine, setMineRaw] = useState(() => { try { return localStorage.getItem("vlMine") === "1"; } catch { return false; } });
  const setMine = (on) => { setMineRaw(on); try { localStorage.setItem("vlMine", on ? "1" : "0"); } catch { /* 무시 */ } };
  const myUid = auth.currentUser?.uid || "";
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("vlMode") || "table"; } catch { return "table"; } });
  const [creating, setCreating] = useState(null);
  const [importing, setImporting] = useState(false);
  const [opening, setOpening] = useState("");
  const [msg, setMsg] = useState("");
  const by = byProp || `${myName || auth.currentUser?.email || "직원"}`;
  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2400); };
  const pick = (id) => { setSelId(id); try { if (id) sessionStorage.setItem("vlSel", id); else sessionStorage.removeItem("vlSel"); } catch { /* 무시 */ } };
  const setModeP = (m) => { setMode(m); try { localStorage.setItem("vlMode", m); } catch { /* 무시 */ } };

  useEffect(() => {
    if (!co) return undefined;
    // fsTenant 자동 필터 대상이 아닌 컬렉션 → 항상 회사 조건을 직접 붙인다
    return onSnapshot(query(collection(db, VL_COL), where("companyName", "==", co)), (s) => { setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoaded(true); setErr(""); }, (e) => { setErr(e?.code || "error"); setLoaded(true); });
  }, [co]);

  // 기사관리(drivers) 연결 — 번호판으로(지역명 유무 무시)
  const fleetDrivers = useMemo(() => drivers.filter((d) => ["지입", "직영", "임대"].includes(d.등급)), [drivers]);
  const drvByPlate = useMemo(() => {
    const m = new Map();
    // 같은 번호판이 여럿이면: 기사앱 가입(uid 있는) 문서 > 지입·직영·임대 > 나머지 — 기사앱이 쓰는 문서와 같은 곳을 본다
    const rank = (d) => (d.uid ? 2 : 0) + (["지입", "직영", "임대"].includes(d.등급) ? 1 : 0);
    drivers.forEach((d) => { const p = d.차량번호 || d.carNo; const k = plateCore(p); if (!k) return; const ex = m.get(k); if (!ex || rank(d) >= rank(ex)) m.set(k, d); });
    return m;
  }, [drivers]);
  const drvById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const thisYear = String(new Date().getFullYear());
  const thisMonth = today().slice(0, 7);

  const rows = useMemo(() => {
    const mk = (v, virtual) => {
      const cur = currentDriver(v);
      // 점검·소모품은 기사 문서(그 기사의 차량번호)에 저장되므로 번호판이 같은 기사 문서를 먼저 쓴다
      const linkRaw = drvByPlate.get(plateCore(v.차량번호)) || (cur?.driverId && plateCore(drvById.get(cur.driverId)?.차량번호) === plateCore(v.차량번호) ? drvById.get(cur.driverId) : null) || null;
      const app = linkRaw ? { id: linkRaw.id, 이름: linkRaw.이름 || linkRaw.name || "", 전화번호: fmtPhone(linkRaw.전화번호 || linkRaw.phone || ""), 등급: linkRaw.등급 || "" } : null;
      const cv = linkRaw ? vehicleDefaults(linkRaw) : null;
      const cs0 = linkRaw ? careSummary({ vehicle: cv, care: linkRaw.care || {} }) : null;
      // ⭐ 2026-11-09 3D 차량 분석의 위치별 타이어 교체 결과를 점검 알림에 합친다(기사 미연결 차량도 타이어 알림은 보이게)
      const cs = (v.tires && Object.keys(v.tires).length) ? twinCareSummary(v, linkRaw) : cs0;
      const reps = v.repairs || [];
      const av = linkRaw?.vehicle || {}; // 기사앱에 실제로 입력된 제원(추정값 아님)
      const mdl = [av.제조사 || v.제조사, av.모델 || v.모델].filter(Boolean).join(" "); const yr = av.연식 || v.연식 || "";
      return {
        ...v, virtual, linkRaw, appDriver: app, cv, cs,
        가입유형: linkRaw?.등급 || "", // ⭐ 2026-11-05 가입유형(지입/직영/임대) 칸
        담당자: linkRaw?.담당자?.name || "", 담당자Uid: linkRaw?.담당자?.uid || "", appJoined: !!linkRaw?.uid,
        용도: v.용도 || v.차량종류 || (virtual ? cv?.적재함 || "" : ""), 톤수: v.톤수 || cv?.톤 || "",
        현재기사: cur?.이름 || app?.이름 || "", 기사연락처: cur?.연락처 || app?.전화번호 || "", 기사변경일: cur?.시작 || "", fromApp: !cur && !!app,
        모델연식: [mdl, yr && `${yr}년`].filter(Boolean).join(" · "),
        만기: (() => { const x = dueList(v)[0]; return x ? x.d : 99999; })(), dues: dueList(v),
        주행거리: cs?.odometer || 0, 점검알림: cs ? cs.alerts.length : -1, 엔진오일: cs0 ? (cs0.alerts.find((a) => a.key === "engineOil")?.level ?? (linkRaw?.care?.items?.engineOil ? 0 : -1)) : -2,
        yearCost: reps.filter((x) => String(x.일자 || "").startsWith(thisYear)).reduce((s, x) => s + num(x.공가) + repairVat(x), 0),
        monthCost: reps.filter((x) => String(x.일자 || "").startsWith(thisMonth)).reduce((s, x) => s + num(x.공가) + repairVat(x), 0),
      };
    };
    const out = list.map((v) => mk(v, false));
    // 기사관리의 지입·직영·임대 차량 중 대장이 아직 없는 차량도 목록에(기존 '차량 관리' 화면과 같은 범위) — 누르면 대장이 만들어진다
    const have = new Set(list.map((v) => plateCore(v.차량번호)));
    const seen = new Set();
    fleetDrivers.forEach((d) => {
      const plate = String(d.차량번호 || d.carNo || "").trim(); const k = plateCore(plate);
      if (!k || have.has(k) || seen.has(k)) return; seen.add(k);
      const key = normPlate(plate); const cv0 = vehicleDefaults(d);
      // 대장 미작성 — 문서는 만들지 않고, 처음 저장할 때 이 기본값으로 만든다(Ledger의 mutate)
      const __base = {
        companyName: co, plateKey: key, 차량번호: plate, 용도: cv0.적재함 || d.차량종류 || "", 차량종류: cv0.적재함 || d.차량종류 || "", 톤수: String(cv0.톤 || d.차량톤수 || ""), 회사: "", 차주명: "",
        repairs: [], structures: [], logs: [],
        driverHist: [{ id: uid(), 이름: d.이름 || d.name || "", 연락처: fmtPhone(d.전화번호 || d.phone || ""), 시작: today(), 종료: "", 비고: "기사관리에서 가져옴", driverId: d.id, createdAt: Date.now(), by }],
      };
      out.push(mk({ id: `virt:${d.id}`, docId: vehicleDocId(co, key), 차량번호: plate, driverHist: [], repairs: [], structures: [], logs: [], __base }, true));
    });
    return out;
  }, [list, fleetDrivers, drvByPlate, drvById, thisYear, thisMonth, co]); // eslint-disable-line react-hooks/exhaustive-deps

  const vtCo = useVehicleTypes(); // 🚚 2026-11-02 회사 공용 차량종류(추가한 이름도 용도·형태 목록에)
  const purposeOpts = useMemo(() => Array.from(new Set([...PURPOSE_PRESETS, ...vtCo.custom, ...list.map((v) => v.용도).filter(Boolean)])), [list, vtCo.custom]);
  const companyOpts = useMemo(() => Array.from(new Set(list.map((v) => v.회사).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")), [list]);
  const kindOpts = useMemo(() => Array.from(new Set([...REPAIR_KINDS, ...list.flatMap((v) => (v.repairs || []).map((r) => r.구분)).filter(Boolean)])), [list]);

  const shown = useMemo(() => {
    const nz = (x) => String(x || "").replace(/[\s\-·.]/g, "").toLowerCase(); // 띄어쓰기·하이픈 무시(차대번호·전화번호도 일부만 쳐서 찾기)
    const qq = nz(q.trim());
    const [ek, ev] = fEq.split(":");
    return rows
      .filter((r) => !fPurpose || (r.용도 || "") === fPurpose)
      .filter((r) => !fCo || (r.회사 || "") === fCo)
      .filter((r) => !ek || (ek === "any" ? EQ_KEYS.some((k) => !hasEquip(r[k])) : hasEquip(r[ek]) === (ev === "1")))
      .filter((r) => !fCare || (r.cs && (r.cs.over || r.cs.soon)))
      .filter((r) => !mine || (myUid && r.담당자Uid === myUid) || (!r.담당자Uid && myName && r.담당자 === myName))
      .filter((r) => !qq || [r.차량번호, r.현재기사, r.기사연락처, r.차주명, r.차대번호, r.회사, r.보험사, r.용도, r.유류카드번호, r.하이패스, r.모델연식, r.담당자].some((x) => nz(x).includes(qq)))
      .sort((a, b) => {
        const x = a[sort.k]; const y = b[sort.k];
        if (typeof x === "number" && typeof y === "number") return sort.d * (x - y);
        return sort.d * String(x || "￿").localeCompare(String(y || "￿"), "ko", { numeric: true });
      });
  }, [rows, q, fPurpose, fCo, fEq, fCare, sort, mine, myUid, myName]);
  // 대장 미작성 차량은 열어도 문서를 만들지 않으므로 docId로 고른다 → 처음 저장해 대장이 생기면 같은 칸이 진짜 대장으로 바뀐다
  const sel = rows.find((r) => r.id === selId) || rows.find((r) => r.virtual && r.docId === selId) || null;
  const selV = sel ? (sel.virtual ? { ...sel, id: sel.docId } : sel) : null;
  // ⭐ 2026-11-09 기사관리 › 기사 수정 [🚚 차량관리] → 그 차량 정보를 바로 연다(window.__kpVlOpenPlate)
  useEffect(() => {
    const tryOpen = () => {
      const plate = window.__kpVlOpenPlate; if (!plate || !loaded) return;
      const r = rows.find((x) => plateCore(x.차량번호) === plateCore(plate));
      window.__kpVlOpenPlate = "";
      if (r) { setHot(r.id); openRow(r); } else { setQ(String(plate)); toast(`${plate} — 차량관리대장에 없는 차량입니다. [차량 등록]으로 추가하세요`); }
    };
    tryOpen();
    window.addEventListener("kp-vl-open", tryOpen);
    return () => window.removeEventListener("kp-vl-open", tryOpen);
  }, [loaded, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const mineCount = useMemo(() => rows.filter((r) => (myUid && r.담당자Uid === myUid) || (!r.담당자Uid && myName && r.담당자 === myName)).length, [rows, myUid, myName]);
  // 기사가 나중에 기사앱에 가입하면(또는 기사관리에 등록되면) PC에서 넣어 둔 모델·연식을 기사 문서(기사앱 제원)에도 한 번 채워 준다
  const vSynced = useRef(new Set());
  useEffect(() => {
    if (!canEdit) return;
    rows.forEach((r) => {
      if (r.virtual || !r.linkRaw?.id) return;
      const av = r.linkRaw.vehicle || {};
      const need = ["제조사", "모델", "연식"].filter((k) => r[k] && !av[k]);
      const key = `${r.linkRaw.id}:${need.join(",")}`;
      if (!need.length || vSynced.current.has(key)) return;
      vSynced.current.add(key);
      setDoc(doc(db, "drivers", r.linkRaw.id), { vehicle: Object.fromEntries(need.map((k) => [k, r[k]])) }, { merge: true }).catch(() => {});
    });
  }, [rows, canEdit]);

  const createVehicle = async (v) => {
    const key = normPlate(v.차량번호);
    if (!key) { toast("차량번호를 입력하세요"); return; }
    if (list.some((x) => normPlate(x.차량번호) === key || x.id === vehicleDocId(co, key))) { toast("이미 등록된 차량번호입니다"); return; }
    const id = vehicleDocId(co, key);
    const data = { companyName: co, plateKey: key, repairs: [], structures: [], driverHist: [], logs: [], createdAt: Date.now(), updatedAt: Date.now(), updatedBy: by };
    BASIC_KEYS.forEach((k) => { data[k] = String(v[k] ?? "").trim(); });
    data.차량종류 = data.용도 || "";
    const app = drvByPlate.get(plateCore(v.차량번호));
    if (app) data.driverHist = [{ id: uid(), 이름: app.이름 || app.name || "", 연락처: fmtPhone(app.전화번호 || app.phone || ""), 시작: today(), 종료: "", 비고: "기사관리에서 가져옴", driverId: app.id, createdAt: Date.now(), by }];
    try {
      await setDoc(doc(db, VL_COL, id), data);
      setCreating(null); toast("등록했습니다"); pick(id);
    } catch (e) { toast(`등록하지 못했습니다(${e?.code || e?.message || "오류"})`); }
  };
  // 대장 미작성 차량(기사관리 차량)을 누르면 대장을 만들고 연다
  // 두 번 누르면 그 차량을 바로 '기본 정보 수정'으로 연다 — { id, n }(n이 바뀔 때마다 수정 시작)
  const [editReq, setEditReq] = useState({ id: "", n: 0 });
  const askEdit = (id) => setEditReq((p) => ({ id, n: p.n + 1 }));
  const closeDrawer = React.useCallback(() => { pick(null); setEditReq((p) => ({ id: "", n: p.n })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ⭐ 2026-11-02 대장 미작성 차량도 열기만 한다(예전엔 여는 순간 대장을 만들어 '미작성'·'앱' 표시가 사라졌다)
  const [hot, setHot] = useState(null); // 한 번 누른(선택한) 줄 — 표시만, 열지 않음
  const openRow = (r, edit = false) => {
    const id = r.virtual ? r.docId : r.id;
    pick(id); if (edit && canEdit) askEdit(id);
  };
  const importRows = async (rowsIn) => {
    const byKey = new Map(list.map((v) => [normPlate(v.차량번호), v]));
    let n = 0;
    try {
      for (const r of rowsIn) {
        const key = normPlate(r.차량번호);
        const ex = byKey.get(key);
        const id = ex?.id || vehicleDocId(co, key);
        const patch = { companyName: co, plateKey: key, updatedAt: Date.now(), updatedBy: by };
        BASIC_KEYS.forEach((k) => { if (r[k] != null && String(r[k]).trim() !== "") patch[k] = String(r[k]).trim(); });
        if (patch.용도) patch.차량종류 = patch.용도;
        if (!ex) Object.assign(patch, { repairs: [], structures: [], logs: [], driverHist: [], createdAt: Date.now() });
        const hist = [...(ex?.driverHist || [])];
        const cur = currentDriver({ driverHist: hist });
        if (r.현재기사 && (!cur || cur.이름 !== r.현재기사)) {
          const start = r.기사변경일 || today();
          const closed = hist.map((h) => (h.종료 ? h : { ...h, 종료: start }));
          const app = drvByPlate.get(plateCore(r.차량번호));
          closed.push({ id: uid(), 이름: r.현재기사, 연락처: r.기사연락처 || "", 시작: start, 종료: "", 비고: "엑셀 가져오기", driverId: app && (app.이름 || app.name) === r.현재기사 ? app.id : "", createdAt: Date.now(), by });
          patch.driverHist = closed;
        } else if (cur && r.기사연락처 && !cur.연락처) {
          patch.driverHist = hist.map((h) => (h.id === cur.id ? { ...h, 연락처: r.기사연락처 } : h));
        }
        await setDoc(doc(db, VL_COL, id), patch, { merge: true });
        byKey.set(key, { ...(ex || {}), ...patch, id });
        n += 1;
      }
      toast(`${n}대를 가져왔습니다`);
    } catch (e) { toast(`${n}대까지 가져오고 멈췄습니다(${e?.code || "오류"})`); throw e; }
  };
  const exportList = () => {
    const head = COLS.map((c) => c[1]).concat(["유류카드사", "박스 사용처", "메모", `${thisYear} 정비비`]);
    const val = (r, k, i) => (k === "순번" ? i + 1 : k === "주행거리" ? (r.주행거리 || "") : k === "엔진오일" ? (careCells(r).oil?.text || (r.엔진오일 === 0 ? "정상" : "")) : k === "점검알림" ? (r.cs ? r.cs.alerts.map((a) => a.label).join(", ") : "") : k === "만기" ? (r.dues || []).map((x) => `${dueText(x)}(${x.date})`).join(", ") : r[k] || "");
    const aoa = [head, ...shown.map((r, i) => COLS.map(([k]) => val(r, k, i)).concat([r.유류카드사 || "", r.박스메모 || "", r.메모 || "", r.yearCost || ""]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = head.map((h, i) => ({ wch: i < COLS.length ? Math.round(COLS[i][2] / 8) : 14 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "차량 전체 현황");
    XLSX.writeFile(wb, `차량전체현황_${co}_${today()}.xlsx`);
  };

  const box = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" };
  const toastEl = msg && <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: C.navy, color: "#fff", padding: "11px 18px", borderRadius: 12, fontSize: 14.5, fontWeight: 800, zIndex: 9999, maxWidth: "90vw", boxShadow: "0 12px 30px rgba(11,20,40,.3)" }}>{msg}</div>;

  if (!co) return <div style={{ padding: 40, textAlign: "center", color: C.mute, fontSize: 15 }}>회사 정보를 불러오는 중…</div>;

  // KPI
  const purposeCnt = Object.entries(rows.reduce((m, r) => { const k = r.용도 || "미지정"; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const eqMissing = rows.filter((r) => EQ_KEYS.some((k) => !hasEquip(r[k]))).length;
  const careNeed = rows.filter((r) => r.cs && (r.cs.over || r.cs.soon)).length;
  const careOver = rows.filter((r) => r.cs && r.cs.over).length;
  const monthCost = rows.reduce((s, r) => s + r.monthCost, 0);
  const yearCost = rows.reduce((s, r) => s + r.yearCost, 0);
  const assigned = rows.filter((r) => r.현재기사).length;
  const virtualN = rows.filter((r) => r.virtual).length;
  const sortBy = (k) => setSort((s) => (s.k === k ? { k, d: -s.d } : { k, d: 1 }));
  const tile = (active) => ({ textAlign: "left", padding: "12px 14px", borderRadius: 14, border: `1px solid ${active ? "#fff" : "rgba(143,176,240,.28)"}`, background: active ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.05)", color: "#fff", minWidth: 0, cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 });
  // ⭐ 2026-11-02 글씨 키움(작아서 안 보인다는 의견)
  const kpiLabel = { fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.12em", color: C.sky, whiteSpace: "nowrap" };
  const kpiNum = { fontFamily: MONO, fontSize: narrow ? 24 : 30, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", ...TAB };
  const kpiSub = { fontSize: 14.5, color: "rgba(255,255,255,.85)", fontWeight: 700, wordBreak: "keep-all", lineHeight: 1.4 };
  const maxP = Math.max(1, ...purposeCnt.map((x) => x[1]));
  const cardMode = narrow || mode === "card";
  const resetFilters = () => { setQ(""); setFPurpose(""); setFCo(""); setFEq(""); setFCare(false); setMine(false); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, ...TAB }}>
      <div style={{ borderRadius: 18, padding: narrow ? 16 : "20px 22px", color: "#fff", background: HERO_BG, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.12em", color: C.sky }}>FLEET · VEHICLE LEDGER</div>
            <div style={{ fontSize: 23, fontWeight: 900, marginTop: 2 }}>차량 관리</div>
            {!narrow && <div style={{ fontSize: 14, color: "rgba(255,255,255,.85)", marginTop: 2 }}>차량 전체 현황 · 장비 · 정비/구조변경/기사 탑승 이력 · 기사앱 점검·소모품을 차량별 관리대장으로 한눈에.</div>}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12.5, color: "rgba(143,176,240,.95)", letterSpacing: "0.12em" }}>{co} · {today()}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2, minmax(0,1fr))" : "1fr 1.5fr 1fr 1fr 1.2fr", gap: 10 }}>
          <button type="button" onClick={resetFilters} style={tile(false)}>
            <span style={kpiLabel}>TOTAL</span>{narrow && <span style={{ fontSize: 14, fontWeight: 800, marginTop: -2 }}>전체 차량</span>}
            <span style={kpiNum}>{rows.length}<span style={{ fontSize: 15, marginLeft: 3, color: "rgba(255,255,255,.85)" }}>대</span></span>
            <span style={kpiSub}>{narrow ? `배정 ${assigned} · 미작성 ${virtualN}` : `기사 배정 ${assigned} · 대장 미작성 ${virtualN}`}</span>
          </button>
          <div style={{ ...tile(false), cursor: "default", gridColumn: narrow ? "1 / -1" : undefined, order: narrow ? 9 : undefined }}>
            <span style={kpiLabel}>BY TYPE · 차량종류별</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
              {purposeCnt.slice(0, 4).map(([k, n]) => (
                <button key={k} type="button" onClick={() => setFPurpose(fPurpose === k || k === "미지정" ? "" : k)} style={{ display: "grid", gridTemplateColumns: "64px 1fr 30px", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, color: "#fff", cursor: "pointer" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: fPurpose === k ? "#fff" : "rgba(255,255,255,.8)" }}>{k}</span>
                  <span style={{ height: 6, borderRadius: 3, background: "rgba(143,176,240,.18)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(n / maxP) * 100}%`, background: fPurpose === k ? "#fff" : C.sky, borderRadius: 3 }} /></span>
                  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, textAlign: "right" }}>{n}</span>
                </button>
              ))}
              {!purposeCnt.length && <span style={kpiSub}>차량이 없습니다</span>}
            </div>
          </div>
          <button type="button" onClick={() => setFEq(fEq === "any:0" ? "" : "any:0")} style={tile(fEq === "any:0")}>
            <span style={kpiLabel}>{narrow ? "EQUIP" : "EQUIP · 장비 미등록"}</span>{narrow && <span style={{ fontSize: 14, fontWeight: 800, marginTop: -2 }}>장비 미등록</span>}
            <span style={kpiNum}>{eqMissing}<span style={{ fontSize: 15, marginLeft: 3, color: "rgba(255,255,255,.85)" }}>대</span></span>
            <span style={kpiSub}>{narrow ? "빈 장비 칸 있음" : "5종 장비 중 빈 칸이 있는 차량"}</span>
          </button>
          <button type="button" onClick={() => setFCare(!fCare)} style={tile(fCare)}>
            <span style={kpiLabel}>{narrow ? "CARE" : "CARE · 점검 필요"}</span>{narrow && <span style={{ fontSize: 14, fontWeight: 800, marginTop: -2 }}>점검 필요</span>}
            <span style={kpiNum}>{careNeed}<span style={{ fontSize: 15, marginLeft: 3, color: "rgba(255,255,255,.85)" }}>대</span></span>
            <span style={kpiSub}>교체 지남 {careOver}{narrow ? "" : " · 기사앱 점검 기준"}</span>
          </button>
          <div style={{ ...tile(false), cursor: "default", background: "linear-gradient(135deg,rgba(143,176,240,.22),rgba(143,176,240,.06))" }}>
            <span style={kpiLabel}>{narrow ? "REPAIR" : "REPAIR · 이번 달 정비비"}</span>{narrow && <span style={{ fontSize: 14, fontWeight: 800, marginTop: -2 }}>이번 달 정비비</span>}
            <span style={kpiNum}>{won(monthCost)}<span style={{ fontSize: 15, marginLeft: 3, color: "rgba(255,255,255,.85)" }}>원</span></span>
            <span style={kpiSub}>{narrow ? `올해 ${won(yearCost)}` : `${thisYear}년 누적 ${won(yearCost)}원`}</span>
          </div>
        </div>
      </div>

      <div style={box}>
        {/* 도구 줄 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 14px", background: "#F7F9FC", borderBottom: `1px solid #E8EDF4` }}>
          <div style={{ display: "flex", flexDirection: "column", marginRight: 6 }}>
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, letterSpacing: "0.12em", color: C.mute, whiteSpace: "nowrap" }}>FLEET LIST <span style={{ fontFamily: "'Pretendard','Noto Sans KR',sans-serif", fontSize: 14, letterSpacing: 0, color: C.blue, fontWeight: 800, marginLeft: 6 }}>{narrow ? "· 탭하면 열기" : "· 두 번 눌러 열기"}</span></span>
            <span style={{ fontSize: 16, fontWeight: 900, color: C.navy, whiteSpace: "nowrap" }}>차량 전체 현황 <span style={{ fontFamily: MONO, color: C.blue }}>{shown.length}</span><span style={{ fontSize: 14, color: C.mute }}> / {rows.length}대</span></span>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="차량번호·기사·차주·차대번호 검색" style={{ ...inp, width: narrow ? "100%" : 250, height: 38 }} />
          {/* ⭐ 2026-11-02 거르기 — 프로그램 스타일 선택 목록(용도 → 차량종류) */}
          <div style={{ width: narrow ? "calc(33% - 6px)" : 150 }}><LedgerSelect compact allowCustom={false} value={fPurpose} onChange={setFPurpose} noneLabel="차량종류 전체" placeholder="차량종류 전체" options={purposeOpts.filter((p) => rows.some((v) => v.용도 === p))} style={{ height: 38 }} /></div>
          <div style={{ width: narrow ? "calc(33% - 6px)" : 140 }}><LedgerSelect compact allowCustom={false} value={fCo} onChange={setFCo} noneLabel="회사 전체" placeholder="회사 전체" options={companyOpts} style={{ height: 38 }} /></div>
          <div style={{ width: narrow ? "calc(34% - 6px)" : 160 }}><LedgerSelect compact allowCustom={false} value={fEq} onChange={setFEq} noneLabel="장비 전체" placeholder="장비 전체" style={{ height: 38 }}
            options={[{ v: "any:0", label: "장비 미등록 있음" }, ...EQUIP.flatMap((e) => [{ v: `${e.key}:1`, label: `${e.label} 있음` }, { v: `${e.key}:0`, label: `${e.label} 없음` }])]} /></div>
          {narrow && (
            <div style={{ width: "100%" }}><LedgerSelect compact allowCustom={false} value={`${sort.k}:${sort.d}`} onChange={(x) => { if (!x) return; const [k, d] = x.split(":"); setSort({ k, d: Number(d) }); }} noneLabel="정렬 기본" style={{ height: 38 }}
              options={COLS.filter(([k]) => !["순번", "엔진오일", "점검알림"].includes(k)).flatMap(([k, l]) => [{ v: `${k}:1`, label: `정렬: ${l} ↑` }, { v: `${k}:-1`, label: `정렬: ${l} ↓` }])} /></div>
          )}
          {/* ⭐ 2026-11-02 내 차량만 보기 — 기사관리에서 내가 담당자로 지정된 차량 */}
          <button type="button" onClick={() => setMine(!mine)} title="기사관리에서 내가 담당자로 지정된 차량만 봅니다 (이 화면에만 적용)"
            style={{ height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${mine ? C.mid : "#D5DDEA"}`, background: mine ? C.mid : "#fff", color: mine ? "#fff" : C.mid, fontSize: 14.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 16, borderRadius: 5, border: `2px solid ${mine ? "#fff" : "#9FB2D3"}`, display: "grid", placeItems: "center", fontSize: 14, lineHeight: 1 }}>{mine ? "✓" : ""}</span>
            내 차량만 보기 <span style={{ fontFamily: MONO, fontSize: 14, opacity: 0.8 }}>{mineCount}</span>
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {!narrow && (
              <div style={{ display: "inline-flex", padding: 3, borderRadius: 10, background: "#E8EDF5" }}>
                {[["table", "표"], ["card", "카드"]].map(([k, l]) => <button key={k} type="button" onClick={() => setModeP(k)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: mode === k ? "#fff" : "transparent", color: mode === k ? C.navy : C.sub, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: mode === k ? "0 1px 3px rgba(16,24,40,.12)" : "none" }}>{l}</button>)}
              </div>
            )}
            {canEdit && <Btn onClick={() => setImporting(true)}>엑셀 가져오기</Btn>}
            <Btn onClick={exportList} disabled={!shown.length}>엑셀 내보내기</Btn>
            {canEdit && <Btn kind="primary" onClick={() => setCreating({})}>+ 차량 등록</Btn>}
          </div>
        </div>
        {(fPurpose || fCo || fEq || fCare || q || mine) && (
          <div style={{ padding: "8px 14px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid #EEF1F6", fontSize: 14, color: C.sub }}>
            <span style={{ fontWeight: 800 }}>필터</span>
            {[q && `검색 "${q}"`, fPurpose && `차량종류 ${fPurpose}`, fCo && `회사 ${fCo}`, fEq && (fEq === "any:0" ? "장비 미등록" : `${EQUIP.find((e) => e.key === fEq.split(":")[0])?.label} ${fEq.endsWith(":1") ? "있음" : "없음"}`), fCare && "점검 필요", mine && "내 차량만"].filter(Boolean).map((t) => <span key={t} style={{ padding: "2px 9px", borderRadius: 99, background: C.pale, color: C.blue, fontWeight: 800 }}>{t}</span>)}
            <button type="button" onClick={resetFilters} style={{ border: "none", background: "none", color: C.sub, textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>모두 지우기</button>
          </div>
        )}
        {err && <div style={{ padding: 14, color: "#B42318", fontWeight: 800, fontSize: 14.5 }}>차량 정보를 불러오지 못했습니다({err}). 잠시 후 다시 시도하거나 관리자에게 권한을 확인하세요.</div>}
        {!loaded ? <div style={{ padding: 48, textAlign: "center", color: C.mute, fontSize: 15 }}><span className="vl-spin" /> 차량 목록을 불러오는 중…</div>
          : !rows.length ? (
            <div style={{ padding: "56px 20px", textAlign: "center", color: C.sub, fontSize: 15, lineHeight: 1.7, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <TruckIcon s={46} c={C.sky} />
              <b style={{ color: C.navy, fontSize: 16 }}>아직 등록된 차량이 없습니다</b>
              <span>[엑셀 가져오기]로 차량 전체 현황 시트를 올리거나 [+ 차량 등록]으로 시작하세요.<br />기사관리에 지입·직영·임대 기사를 등록하면 그 차량도 자동으로 보입니다.</span>
            </div>
          ) : cardMode ? (
            <div style={{ padding: narrow ? 10 : 14, display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {shown.map((r) => <VehicleCard key={r.id} r={r} touch={narrow} hot={hot === r.id} onSelect={() => setHot(r.id)} onOpen={() => { setHot(r.id); openRow(r); }} />)}
              {!shown.length && <div style={{ padding: 30, textAlign: "center", color: C.mute, fontSize: 14.5, gridColumn: "1 / -1" }}>조건에 맞는 차량이 없습니다</div>}
            </div>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "calc(100vh - 360px)", minHeight: 320 }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 2100 }}>
                <thead><tr>{COLS.map(([k, l, w]) => (
                  <th key={k} onClick={() => k !== "순번" && sortBy(k)} title={k === "순번" ? "" : "누르면 정렬 (내 화면에만 적용)"} style={{ ...th, minWidth: w, cursor: k === "순번" ? "default" : "pointer", userSelect: "none", ...(k === "순번" ? { left: 0, zIndex: 3, width: 56 } : {}), ...(k === "담당자" ? { left: 56, zIndex: 3, width: 96 } : {}), ...(k === "차량번호" ? { left: 152, zIndex: 3, textAlign: "left" } : {}), ...(k === "모델연식" ? { borderLeft: "2px solid #8FB0F0" } : {}) }}>
                    {l}{k !== "순번" && <span style={{ marginLeft: 4, fontSize: 14, color: sort.k === k ? "#fff" : "rgba(143,176,240,.95)" }}>{sort.k === k ? (sort.d > 0 ? "▲" : "▼") : "↕"}</span>}
                  </th>
                ))}</tr></thead>
                <tbody>
                  {shown.map((r, ri) => {
                    const cc = careCells(r);
                    return (
                      <tr key={r.id} className={`vl-row${hot === r.id ? " vl-hot" : ""}`} tabIndex={0} aria-selected={hot === r.id} title="두 번 누르면 차량 정보 · 수정 패널이 열립니다"
                        onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }} onClick={() => setHot(r.id)} onDoubleClick={() => { setHot(r.id); openRow(r); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); openRow(r); } }}
                        style={{ cursor: "default", outline: "none", opacity: opening === r.id ? 0.5 : 1 }}>
                        {COLS.map(([k], i) => {
                          const val = r[k];
                          const eq = EQ_KEYS.includes(k);
                          const base = { ...td, whiteSpace: "nowrap", textAlign: "center", borderTop: "none", borderBottom: "1px solid #EEF1F6", ...(k === "모델연식" ? { borderLeft: "2px solid #DCE6F7" } : {}) };
                          if (k === "순번") return <td key={k} style={{ ...base, position: "sticky", left: 0, background: "inherit", zIndex: 1, width: 56, fontFamily: MONO, fontSize: 14, color: C.sub, fontWeight: 800 }}>{ri + 1}</td>;
                          if (k === "차량번호") return <td key={k} style={{ ...base, position: "sticky", left: 152, background: "inherit", textAlign: "left", zIndex: 1, boxShadow: "1px 0 0 #EEF1F6" }}><span style={{ fontWeight: 900, fontSize: 15 }}>{val}</span>{r.virtual && <span title="관리대장 미작성 — 기사관리에 있는 지입·직영·임대 차량이지만 아직 대장에 아무것도 저장하지 않은 차량입니다. 정보를 저장하면 대장이 만들어지고 이 표시는 사라집니다." style={{ marginLeft: 6, padding: "2px 7px", borderRadius: 6, border: `1px dashed ${C.sky}`, fontSize: 14, color: C.blue, fontWeight: 800 }}>대장 미작성</span>}</td>;
                          if (k === "현재기사") return <td key={k} style={{ ...base, fontWeight: 800 }}>{val || <span style={{ color: "#5B6B85" }}>-</span>}{r.appJoined && <span title="이 기사님은 기사앱에 가입했습니다(점검·소모품·제원이 기사앱과 연동)" style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 6, background: C.mid, color: "#fff", fontSize: 14, fontWeight: 800 }}>앱 가입</span>}</td>;
                          if (k === "가입유형") return <td key={k} style={base}>{val ? <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 11px", borderRadius: 8, fontSize: 14, fontWeight: 800, ...(val === "지입" ? { background: C.mid, color: "#fff" } : val === "직영" ? { background: "#E6F2EF", color: "#0F5F57", border: "1px solid #B9DCD5" } : { background: C.pale, color: C.blue, border: "1px solid #C9D7EE" }) }}>{val}</span> : <span style={{ color: C.sub }}>-</span>}</td>;
                          if (k === "담당자") return <td key={k} style={{ ...base, position: "sticky", left: 56, background: "inherit", zIndex: 1, width: 96, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 800, color: val ? (r.담당자Uid && r.담당자Uid === myUid ? C.blue : C.navy) : "#5B6B85" }}>{val || "-"}</td>;
                          if (k === "용도") return <td key={k} style={base}>{val ? <span style={{ padding: "2px 8px", borderRadius: 6, background: C.pale, color: C.blue, fontSize: 14, fontWeight: 800 }}>{val}</span> : <span style={{ color: "#5B6B85" }}>-</span>}</td>;
                          if (eq) {
                            const on = hasEquip(val);
                            const short = /^(o|○|있음|유|y|yes)$/i.test(String(val || "").trim());
                            return <td key={k} style={{ ...base, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={val || ""}>{on ? (short ? <span style={{ color: C.blue, fontWeight: 900 }}>●</span> : <span style={{ fontSize: 14 }}>{val}</span>) : <span style={{ color: "#5B6B85" }}>{val || "-"}</span>}</td>;
                          }
                          if (k === "주행거리") return <td key={k} style={{ ...base, fontFamily: MONO, fontWeight: 800 }}>{r.cs?.odometer ? `${r.cs.odometer.toLocaleString()}km` : <span style={{ color: "#5B6B85" }}>-</span>}</td>;
                          if (k === "엔진오일") return <td key={k} style={base}>{cc.oil ? <span style={{ padding: "2px 8px", borderRadius: 6, background: cc.oil.level === 2 ? C.navy : "#DCE6F7", color: cc.oil.level === 2 ? "#fff" : C.mid, fontSize: 14, fontWeight: 800 }}>{cc.oil.text}</span> : cc.oilLast ? <span style={{ color: C.sub, fontSize: 14 }}>정상</span> : <span style={{ color: "#5B6B85", fontSize: 14 }}>{r.linkRaw ? "기록 없음" : "-"}</span>}</td>;
                          if (k === "만기") return <td key={k} style={{ ...base, whiteSpace: "nowrap" }}>{r.dues?.length ? <span title={r.dues.map((x) => `${x.label} ${x.date}`).join("\n")} style={{ padding: "2px 8px", borderRadius: 6, background: dueTone(r.dues[0].d).bg, color: dueTone(r.dues[0].d).fg, fontSize: 13.5, fontWeight: 800 }}>{dueText(r.dues[0])}</span> : <span style={{ color: "#9AA9C3" }}>-</span>}</td>;
                          if (k === "점검알림") return <td key={k} style={{ ...base, textAlign: "left", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{cc.alerts?.length ? cc.alerts.slice(0, 3).map((a) => a.label).join(" · ") + (cc.alerts.length > 3 ? ` 외 ${cc.alerts.length - 3}` : "") : <span style={{ color: "#5B6B85" }}>-</span>}</td>;
                          return <td key={k} style={{ ...base, color: val ? C.navy : "#5B6B85", fontFamily: ["기사변경일", "차대번호"].includes(k) ? MONO : undefined, fontSize: k === "차대번호" ? 14 : 14.5 }}>{val || "-"}</td>;
                        })}
                      </tr>
                    );
                  })}
                  {!shown.length && <tr><td colSpan={COLS.length} style={{ ...td, textAlign: "center", color: C.mute, padding: 40 }}>조건에 맞는 차량이 없습니다</td></tr>}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {creating && (
        <Modal title="차량 등록" onClose={() => setCreating(null)} width={820} footer={<><Btn onClick={() => setCreating(null)}>취소</Btn><Btn kind="primary" onClick={() => createVehicle(creating)}>등록</Btn></>}>
          <BasicForm v={creating} set={setCreating} purposeOpts={purposeOpts} companyOpts={companyOpts} company={co} isNew />
          {drvByPlate.get(plateCore(creating.차량번호)) && <div style={{ marginTop: 12, fontSize: 14.5, color: C.blue, fontWeight: 800 }}>기사관리에 이 차량의 기사({drvByPlate.get(plateCore(creating.차량번호)).이름})가 있어 현재 기사로 함께 등록됩니다.</div>}
        </Modal>
      )}
      {importing && <ImportModal existing={list} onClose={() => setImporting(false)} onImport={importRows} />}
      {selV && (
        <LedgerDrawer key={selV.id} narrow={narrow} onClose={closeDrawer}>
          <Ledger v={selV} co={co} appDriver={selV.appDriver} linkRaw={selV.linkRaw} drivers={drivers} canEdit={canEdit} by={by} narrow={narrow} purposeOpts={purposeOpts} companyOpts={companyOpts} kindOpts={kindOpts} onBack={closeDrawer} toast={toast} drawer editSignal={editReq.id === selV.id ? editReq.n : 0} />
        </LedgerDrawer>
      )}
      <style>{VL_CSS}</style>
      {toastEl}
    </div>
  );
}
