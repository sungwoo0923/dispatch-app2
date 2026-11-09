// ======================= src/VehicleAutomation.jsx =======================
// 🚚 2026-11-09 차량관리 자동화(차량관리대장 안) — 계산은 functions/fleetCareCore.mjs(서버와 같은 기준)
//  · 소모품 주기(회사별) : vehicleCareSettings/{회사} = { companyName, intervals: { 항목키: { km, months } }, updatedAt, updatedBy }
//  · 소모품 교체 예정 표(차량 상세) : 기사 문서 care.items + 주기 → 다음 예정 km·날짜 · 정상/임박/초과
//  · 월 차량별 비용 리포트 : 정비·소모품·구조변경(대장) + 유류·하이패스(카드 내역) + 보험료(연 ÷12) · 주행거리(키로수 누적) → km당 비용 · 엑셀·인쇄
//  · 하이패스·유류카드 대조 : vehicleCardTx/{id} = { companyName, ym, type, date, time, amount, plate, cardNo, place, liter, kind, fileName, uploadedAt, by }
//    엑셀 업로드(열 자동 인식) → 차량 매칭(차량번호·카드 끝 4자리) · 그날 운행(오더·키로수 누적) 대조 → 의심 표시
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch, deleteDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "./firebase";
import { kpConfirm } from "./kpDialog";
import { CARE_ITEMS, consumableRows, monthlyCostReport, parseCardSheet, reconcileCards, buildActiveDays, cardTxId, FLAG_LABEL, kstToday } from "../functions/fleetCareCore.mjs";

const C = { navy: "#0F1A30", mid: "#1B2B4B", blue: "#2D4C82", line: "#E3E8F0", soft: "#F4F6FA", sub: "#5B6B85" };
const TAB = { fontVariantNumeric: "tabular-nums" };
const won = (v) => (Number(v) || 0).toLocaleString("ko-KR");
const coKey = (co) => String(co || "").trim().replace(/\//g, "_");
export const CARE_SET_COL = "vehicleCareSettings";
export const CARD_TX_COL = "vehicleCardTx";

// 회사별 소모품 주기
export function useCareSettings(co) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!co) return undefined;
    return onSnapshot(doc(db, CARE_SET_COL, coKey(co)), (s) => setD(s.exists() ? s.data() : {}), () => setD({}));
  }, [co]);
  return useMemo(() => d?.intervals || EMPTY_INT, [d]);
}
const EMPTY_INT = Object.freeze({});

const box = { background: "#fff", borderRadius: 16, border: `1px solid ${C.line}` };
const th = { padding: "9px 10px", fontSize: 13.5, fontWeight: 800, color: "#fff", background: C.mid, textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 };
const td = { padding: "8px 10px", fontSize: 14, color: C.navy, borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" };
const numIn = { height: 34, width: 96, padding: "0 8px", borderRadius: 8, border: "1px solid #D5DDEA", fontSize: 14, textAlign: "right", ...TAB };
function Btn({ children, onClick, kind = "ghost", disabled, title }) {
  const k = kind === "primary" ? { background: "linear-gradient(135deg,#1B2B4B,#2D4C82)", color: "#fff", border: "1px solid #1B2B4B" } : { background: "#fff", color: C.mid, border: "1px solid #D5DDEA" };
  return <button type="button" title={title} disabled={disabled} onClick={onClick} style={{ height: 38, padding: "0 14px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", ...k }}>{children}</button>;
}
function Sheet({ title, code, onClose, children, footer, width = 1180 }) {
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100060, background: "rgba(11,20,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...box, width: "100%", maxWidth: width, maxHeight: "92dvh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.35)" }}>
        <div style={{ padding: "14px 18px", background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {code && <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.2em", color: "#8FB0F0" }}>{code}</div>}
            <div style={{ fontSize: 17, fontWeight: 900 }}>{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 16, overflow: "auto", flex: 1, overscrollBehavior: "contain" }}>{children}</div>
        {footer && <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}
const LV = { 2: { bg: "#0F1A30", fg: "#fff" }, 1: { bg: "#DCE6F7", fg: "#1B2B4B" }, 0: { bg: "#EAF6EF", fg: "#1F7A4D" }, [-1]: { bg: "#F1F4F9", fg: "#5B6B85" } };
const Chip = ({ level, children }) => <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 7, fontSize: 13, fontWeight: 800, background: LV[level]?.bg, color: LV[level]?.fg }}>{children}</span>;

// ─── 소모품 주기(회사별) ───
export function CareIntervalsModal({ co, intervals = {}, by = "", onClose }) {
  const [v, setV] = useState(() => JSON.parse(JSON.stringify(intervals || {})));
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const set = (k, f, x) => setV((p) => ({ ...p, [k]: { ...(p[k] || {}), [f]: String(x).replace(/[^\d]/g, "") } }));
  const save = async () => {
    setBusy(true); setMsg("");
    const clean = {};
    Object.entries(v).forEach(([k, o]) => { const km = o?.km === "" || o?.km == null ? null : Number(o.km); const months = o?.months === "" || o?.months == null ? null : Number(o.months); if (km != null || months != null) clean[k] = { ...(km != null ? { km } : {}), ...(months != null ? { months } : {}) }; });
    try { await setDoc(doc(db, CARE_SET_COL, coKey(co)), { companyName: co, intervals: clean, updatedAt: Date.now(), updatedBy: by }); onClose(); }
    catch (e) { setMsg(e?.code === "permission-denied" ? "저장 권한이 없습니다(보안 규칙 배포 전이면 배포가 필요합니다)" : (e?.message || "저장하지 못했습니다")); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="정비·소모품 교체 주기 (회사 기준)" code="CARE INTERVAL" onClose={onClose} width={900}
      footer={<>{msg && <span style={{ marginRight: "auto", color: "#B42318", fontSize: 14, fontWeight: 800 }}>{msg}</span>}<Btn onClick={() => setV({})}>모두 기본값으로</Btn><Btn onClick={onClose}>취소</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</Btn></>}>
      <div style={{ fontSize: 14, color: C.sub, fontWeight: 600, marginBottom: 10, lineHeight: 1.6 }}>칸을 비우면 톤급별 기본값(소형/중형/대형)을 씁니다. 0을 넣으면 그 기준(km 또는 개월)은 쓰지 않습니다. 차량마다 따로 정한 주기(기사앱·차량 상세)가 있으면 그 값이 먼저입니다.</div>
      <div style={{ ...box, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr>{["항목", "기본 (소형 · 중형 · 대형)", "회사 기준 km", "회사 기준 개월"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{CARE_ITEMS.map((it) => (
            <tr key={it.key}>
              <td style={{ ...td, fontWeight: 800 }}>{it.label}{it.consumable && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 800, color: C.blue }}>소모품</span>}</td>
              <td style={{ ...td, color: C.sub, ...TAB }}>{["small", "mid", "large"].map((c) => { const [km, m] = it[c]; return [km ? `${won(km)}km` : "", m ? `${m}개월` : ""].filter(Boolean).join("/") || "-"; }).join(" · ")}</td>
              <td style={{ ...td, textAlign: "center" }}><input inputMode="numeric" style={numIn} value={v[it.key]?.km ?? ""} placeholder="기본" onChange={(e) => set(it.key, "km", e.target.value)} /></td>
              <td style={{ ...td, textAlign: "center" }}><input inputMode="numeric" style={numIn} value={v[it.key]?.months ?? ""} placeholder="기본" onChange={(e) => set(it.key, "months", e.target.value)} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Sheet>
  );
}

// ─── 소모품 교체 예정(차량 상세) ───
export function ConsumablePlan({ linkRaw, vehicle, coIntervals = {}, compact = false }) {
  const rows = useMemo(() => (linkRaw ? consumableRows(vehicle || linkRaw.vehicle || {}, linkRaw.care || {}, coIntervals) : []), [linkRaw, vehicle, coIntervals]);
  if (!linkRaw) return <div style={{ padding: 16, textAlign: "center", color: C.sub, fontSize: 14.5 }}>기사관리에 이 차량번호로 등록된 기사가 없어 교체 예정을 계산할 수 없습니다.</div>;
  const sorted = [...rows].sort((a, b) => b.level - a.level);
  const odo = Number(linkRaw.care?.odometer) || 0;
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.sub, marginBottom: 8 }}>현재 주행거리 <b style={{ color: C.navy, ...TAB }}>{odo ? `${won(odo)}km` : "미입력"}</b> · 정비 이력에 정비를 넣으면 마지막 교체가 자동으로 바뀝니다</div>
      <div style={{ ...box, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: compact ? 560 : 760 }}>
          <thead><tr>{["상태", "항목", "주기", "마지막 교체", "다음 예정 km", "다음 예정일"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.key}>
              <td style={{ ...td, textAlign: "center" }}><Chip level={r.level}>{r.status}</Chip></td>
              <td style={{ ...td, fontWeight: 800 }}>{r.label}</td>
              <td style={{ ...td, color: C.sub, ...TAB }}>{[r.km ? `${won(r.km)}km` : "", r.months ? `${r.months}개월` : ""].filter(Boolean).join(" / ")}</td>
              <td style={{ ...td, ...TAB }}>{[r.lastDate, r.lastKm ? `${won(r.lastKm)}km` : ""].filter(Boolean).join(" · ") || "-"}</td>
              <td style={{ ...td, textAlign: "right", ...TAB }}>{r.nextKm ? `${won(r.nextKm)}km` : "-"}{r.leftKm != null && <div style={{ fontSize: 12.5, color: r.leftKm < 0 ? "#B42318" : C.sub, fontWeight: 700 }}>{r.leftKm < 0 ? `${won(-r.leftKm)}km 초과` : `${won(r.leftKm)}km 남음`}</div>}</td>
              <td style={{ ...td, textAlign: "center", ...TAB }}>{r.nextDate || "-"}{r.daysLeft != null && <div style={{ fontSize: 12.5, color: r.daysLeft < 0 ? "#B42318" : C.sub, fontWeight: 700 }}>{r.daysLeft < 0 ? `${-r.daysLeft}일 지남` : `D-${r.daysLeft}`}</div>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// 카드 내역(그달) — vehicleCardTx
async function loadTx(co, ym) {
  const s = await getDocs(query(collection(db, CARD_TX_COL), where("companyName", "==", co), where("ym", "==", ym)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// 그달 오더(운행한 날 판단용) — orders · dispatch 상차일 범위
async function loadOrders(ym) {
  const from = `${ym}-01`; const to = `${ym}-31`;
  const res = await Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", from), where("상차일", "<=", to))).then((s) => s.docs.map((d) => d.data())).catch(() => [])));
  return res.flat();
}
const ymOpts = () => { const out = []; const d = new Date(Date.now() + 9 * 3600e3); for (let i = 0; i < 18; i += 1) { const x = new Date(d.getUTCFullYear(), d.getUTCMonth() - i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`); } return out; };
function YmSelect({ value, onChange }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #D5DDEA", fontSize: 14.5, fontWeight: 800, color: C.navy, background: "#fff" }}>{ymOpts().map((m) => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}</select>;
}
const printDoc = (title, html) => {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;padding:24px;color:#0F1A30}h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1B2B4B;color:#fff;padding:6px}td{border-bottom:1px solid #E3E8F0;padding:5px 6px;text-align:right}td:first-child,td:nth-child(2){text-align:left}tfoot td{font-weight:800;background:#F4F6FA}@page{size:A4 landscape;margin:12mm}</style></head><body>${html}<script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
};

// ─── 월 차량별 비용 리포트 ───
export function CostReportModal({ co, vehicles = [], drivers = [], onClose }) {
  const [ym, setYm] = useState(() => { const d = new Date(Date.now() + 9 * 3600e3); const x = new Date(d.getUTCFullYear(), d.getUTCMonth() - 1, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; });
  const [txs, setTxs] = useState(null);
  useEffect(() => { let on = true; setTxs(null); loadTx(co, ym).then((t) => { if (on) setTxs(t); }).catch(() => { if (on) setTxs([]); }); return () => { on = false; }; }, [co, ym]);
  const rep = useMemo(() => monthlyCostReport({ vehicles, drivers, txs: txs || [], ym }), [vehicles, drivers, txs, ym]);
  const COLS = [["plate", "차량번호"], ["driver", "기사"], ["repair", "정비비"], ["consumable", "소모품"], ["structure", "구조변경"], ["fuel", "유류"], ["hipass", "하이패스"], ["insurance", "보험(월)"], ["total", "합계"], ["km", "주행거리(km)"], ["perKm", "km당 비용"]];
  const cell = (r, k) => (k === "plate" || k === "driver" ? r[k] || "-" : r[k] == null ? "-" : won(r[k]));
  const toExcel = () => {
    const aoa = [COLS.map((c) => c[1]), ...rep.rows.map((r) => COLS.map(([k]) => (k === "plate" || k === "driver" ? r[k] || "" : r[k] ?? ""))), ["합계", "", ...COLS.slice(2).map(([k]) => rep.sum[k] ?? "")]];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), ym);
    XLSX.writeFile(wb, `차량별_비용_${co}_${ym}.xlsx`);
  };
  const toPrint = () => printDoc(`차량별 비용 ${ym}`, `<h1>${co} · ${ym.replace("-", "년 ")}월 차량별 비용 리포트</h1><table><thead><tr>${COLS.map((c) => `<th>${c[1]}</th>`).join("")}</tr></thead><tbody>${rep.rows.map((r) => `<tr>${COLS.map(([k]) => `<td>${cell(r, k)}</td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr><td>합계</td><td></td>${COLS.slice(2).map(([k]) => `<td>${rep.sum[k] == null ? "-" : won(rep.sum[k])}</td>`).join("")}</tr></tfoot></table><p style="font-size:11px;color:#5B6B85">정비·소모품은 부가세 포함 · 보험은 대장의 연 보험료 ÷ 12 · 주행거리는 기사앱 키로수 누적 기준 · 유류·하이패스는 업로드한 카드 내역 기준</p>`);
  return (
    <Sheet title="월 차량별 비용 리포트" code="MONTHLY COST" onClose={onClose}
      footer={<><Btn onClick={toExcel}>엑셀 저장</Btn><Btn onClick={toPrint}>인쇄 · PDF</Btn><Btn kind="primary" onClick={onClose}>닫기</Btn></>}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <YmSelect value={ym} onChange={setYm} />
        <span style={{ fontSize: 14, color: C.sub, fontWeight: 700 }}>{txs == null ? "카드 내역 불러오는 중…" : `카드 내역 ${txs.length}건 · 차량 ${rep.rows.length}대`}</span>
        <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 900, color: C.navy, ...TAB }}>총 {won(rep.sum.total)}원{rep.sum.perKm != null && <span style={{ fontSize: 13.5, color: C.sub, marginLeft: 8 }}>km당 {won(rep.sum.perKm)}원</span>}</span>
      </div>
      <div style={{ ...box, overflow: "auto", maxHeight: "62dvh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
          <thead><tr>{COLS.map((c) => <th key={c[0]} style={th}>{c[1]}</th>)}</tr></thead>
          <tbody>{rep.rows.map((r) => <tr key={r.id || r.plate}>{COLS.map(([k]) => <td key={k} style={{ ...td, textAlign: k === "plate" || k === "driver" ? "left" : "right", fontWeight: k === "total" || k === "plate" ? 800 : 600, ...TAB }}>{cell(r, k)}</td>)}</tr>)}</tbody>
          <tfoot><tr>{COLS.map(([k], i) => <td key={k} style={{ ...td, background: C.soft, fontWeight: 900, textAlign: i < 2 ? "left" : "right", ...TAB }}>{i === 0 ? "합계" : i === 1 ? "" : rep.sum[k] == null ? "-" : won(rep.sum[k])}</td>)}</tr></tfoot>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: C.sub, fontWeight: 600, lineHeight: 1.6 }}>정비·소모품은 부가세 포함 · 보험은 대장 기본정보의 "연 보험료" ÷ 12 · 주행거리는 기사앱 키로수 누적(출근~퇴근 이동거리) · 유류·하이패스는 [카드 대조]에서 올린 내역입니다. 매월 1일 아침 지난달 리포트 요약이 관리자에게 알림으로 갑니다.</div>
    </Sheet>
  );
}

// ─── 하이패스·유류카드 대조 ───
export function CardReconModal({ co, vehicles = [], drivers = [], by = "", canEdit = true, onClose }) {
  const [ym, setYm] = useState(() => kstToday().slice(0, 7));
  const [txs, setTxs] = useState(null);
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);
  const [only, setOnly] = useState("flag");
  const [preview, setPreview] = useState(null); // { rows, type, fileName, error }
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const [upType, setUpType] = useState("");
  const fileRef = useRef(null);
  useEffect(() => { let on = true; setTxs(null); Promise.all([loadTx(co, ym), loadOrders(ym)]).then(([t, o]) => { if (on) { setTxs(t); setOrders(o); } }).catch(() => { if (on) setTxs([]); }); return () => { on = false; }; }, [co, ym, tick]);
  const active = useMemo(() => buildActiveDays({ orders, drivers }), [orders, drivers]);
  const res = useMemo(() => reconcileCards(txs || [], vehicles, active), [txs, vehicles, active]);
  const shown = only === "flag" ? res.rows.filter((r) => r.flags.length) : res.rows;
  const readFile = async (f) => {
    setMsg("");
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
      const all = []; let type = ""; let error = "";
      wb.SheetNames.forEach((nm) => { const p = parseCardSheet(XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, defval: "" }), upType); if (p.rows.length) { all.push(...p.rows); type = type || p.type; } else if (!error) error = p.error || ""; });
      setPreview({ rows: all, type, fileName: f.name, error: all.length ? "" : (error || "읽을 줄이 없습니다") });
    } catch (e) { setPreview({ rows: [], fileName: f.name, error: e?.message || "파일을 읽지 못했습니다" }); }
  };
  const saveUpload = async () => {
    if (!preview?.rows?.length) return;
    setBusy("save");
    try {
      for (let i = 0; i < preview.rows.length; i += 400) {
        const b = writeBatch(db);
        preview.rows.slice(i, i + 400).forEach((t) => b.set(doc(db, CARD_TX_COL, cardTxId(co, t)), { ...t, companyName: co, ym: t.date.slice(0, 7), fileName: preview.fileName, uploadedAt: Date.now(), by }, { merge: true }));
        await b.commit();
      }
      const months = [...new Set(preview.rows.map((t) => t.date.slice(0, 7)))].sort();
      setMsg(`${preview.rows.length}건을 저장했습니다 (같은 줄은 한 번만 저장) · ${months.join(", ")}`);
      setPreview(null); if (months.length && !months.includes(ym)) setYm(months[months.length - 1]); else setTick((x) => x + 1);
    } catch (e) { setMsg(e?.code === "permission-denied" ? "저장 권한이 없습니다(보안 규칙 배포 전이면 배포가 필요합니다)" : (e?.message || "저장하지 못했습니다")); }
    finally { setBusy(""); }
  };
  const clearMonth = async () => {
    if (!txs?.length || !(await kpConfirm(`${ym} 카드 내역 ${txs.length}건을 모두 지울까요?`, { danger: true, okText: "지우기" }))) return;
    setBusy("del");
    try { await Promise.all(txs.map((t) => deleteDoc(doc(db, CARD_TX_COL, t.id)))); setTick((x) => x + 1); } catch (e) { setMsg(e?.message || "지우지 못했습니다"); } finally { setBusy(""); }
  };
  const toExcel = () => {
    const aoa = [["구분", "일자", "시간", "차량", "매칭", "카드번호", "사용처", "금액", "의심"], ...res.rows.map((r) => [r.type, r.date, r.time || "", r.vehiclePlate || "", { plate: "차량번호", card: "카드", none: "미확인" }[r.match], r.cardNo || "", r.place || "", r.amount, r.flags.map((f) => FLAG_LABEL[f]).join(", ")])];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), ym);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["차량", "유류", "하이패스", "건수", "의심"], ...res.summary.map((s) => [s.plate, s.fuel, s.hipass, s.count, s.flagged])]), "차량별 합계");
    XLSX.writeFile(wb, `카드대조_${co}_${ym}.xlsx`);
  };
  const flagged = res.rows.filter((r) => r.flags.length).length;
  return (
    <Sheet title="하이패스 · 유류카드 대조" code="CARD RECONCILE" onClose={onClose}
      footer={<>{msg && <span style={{ marginRight: "auto", fontSize: 14, fontWeight: 800, color: /권한|못했/.test(msg) ? "#B42318" : C.blue }}>{msg}</span>}<Btn onClick={toExcel} disabled={!res.rows.length}>엑셀 저장</Btn>{canEdit && <Btn onClick={clearMonth} disabled={!txs?.length || !!busy}>이달 내역 지우기</Btn>}<Btn kind="primary" onClick={onClose}>닫기</Btn></>}>
      {canEdit && (
        <div style={{ ...box, padding: 14, marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: C.soft }}>
          <b style={{ fontSize: 14.5, color: C.navy }}>내역 올리기</b>
          <select value={upType} onChange={(e) => setUpType(e.target.value)} style={{ height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #D5DDEA", fontSize: 14, fontWeight: 700 }}>
            <option value="">종류 자동(열 이름으로)</option><option value="유류">유류카드</option><option value="하이패스">하이패스</option>
          </select>
          <Btn onClick={() => fileRef.current?.click()}>엑셀 파일 고르기</Btn>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readFile(f); }} />
          <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>카드사·한국도로공사에서 받은 이용내역 엑셀을 그대로 올리면 이용일시·금액·차량번호·카드번호·사용처 열을 자동으로 찾습니다.</span>
          {preview && (
            <div style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {preview.error ? <span style={{ color: "#B42318", fontWeight: 800, fontSize: 14 }}>{preview.fileName}: {preview.error}</span>
                : <><span style={{ fontSize: 14, fontWeight: 800, color: C.navy }}>{preview.fileName} · {preview.type} {preview.rows.length}건 · 합계 {won(preview.rows.reduce((s, t) => s + t.amount, 0))}원 · {preview.rows[0]?.date} ~ {preview.rows[preview.rows.length - 1]?.date}</span><Btn kind="primary" disabled={!!busy} onClick={saveUpload}>{busy === "save" ? "저장 중…" : "저장하고 대조"}</Btn><Btn onClick={() => setPreview(null)}>취소</Btn></>}
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <YmSelect value={ym} onChange={setYm} />
        {[["flag", `의심만 ${flagged}`], ["all", `전체 ${res.rows.length}`]].map(([k, l]) => <button key={k} type="button" onClick={() => setOnly(k)} style={{ height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${only === k ? C.mid : "#D5DDEA"}`, background: only === k ? C.mid : "#fff", color: only === k ? "#fff" : C.mid, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>{l}</button>)}
        <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{txs == null ? "불러오는 중…" : "운행 여부 = 그날 오더(상·하차일) 또는 기사앱 이동 기록"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 12 }} className="vl-recon-grid">
        <div style={{ ...box, overflow: "auto", maxHeight: "56dvh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
            <thead><tr>{["구분", "일시", "차량", "카드", "사용처", "금액", "의심"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{shown.length ? shown.map((r) => (
              <tr key={r.id || `${r.date}${r.time}${r.amount}${r.cardNo}`}>
                <td style={{ ...td, textAlign: "center", fontWeight: 800 }}>{r.type}</td>
                <td style={{ ...td, ...TAB }}>{r.date} {r.time || ""}</td>
                <td style={{ ...td, fontWeight: 800 }}>{r.vehiclePlate || "-"}<div style={{ fontSize: 12, color: C.sub, fontWeight: 700 }}>{{ plate: "차량번호로 매칭", card: "카드번호로 매칭", none: "매칭 안 됨" }[r.match]}</div></td>
                <td style={{ ...td, ...TAB, color: C.sub }}>{r.cardNo ? `…${String(r.cardNo).replace(/\D/g, "").slice(-4)}` : "-"}</td>
                <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.place || "-"}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, ...TAB }}>{won(r.amount)}</td>
                <td style={td}>{r.flags.length ? r.flags.map((f) => <span key={f} style={{ display: "inline-block", marginRight: 4, padding: "2px 8px", borderRadius: 7, fontSize: 12.5, fontWeight: 800, background: f === "unmatched" ? "#F1F4F9" : "#0F1A30", color: f === "unmatched" ? C.sub : "#fff" }}>{FLAG_LABEL[f]}</span>) : <span style={{ color: "#1F7A4D", fontWeight: 800, fontSize: 13 }}>정상</span>}</td>
              </tr>
            )) : <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: C.sub, padding: 30 }}>{txs == null ? "불러오는 중…" : only === "flag" ? "의심 내역이 없습니다" : "이달 올린 카드 내역이 없습니다"}</td></tr>}</tbody>
          </table>
        </div>
        <div style={{ ...box, overflow: "auto", maxHeight: "56dvh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["차량", "유류", "하이패스", "의심"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{res.summary.map((s) => <tr key={s.plate}><td style={{ ...td, fontWeight: 800 }}>{s.plate}</td><td style={{ ...td, textAlign: "right", ...TAB }}>{won(s.fuel)}</td><td style={{ ...td, textAlign: "right", ...TAB }}>{won(s.hipass)}</td><td style={{ ...td, textAlign: "center", fontWeight: 800, color: s.flagged ? "#B42318" : C.sub }}>{s.flagged}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <style>{"@media (max-width: 860px){.vl-recon-grid{grid-template-columns:1fr !important}}"}</style>
    </Sheet>
  );
}
