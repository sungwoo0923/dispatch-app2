// ======================= src/VehicleLedger.jsx =======================
// ⭐ 2026-11-02 차량관리대장 — 회사별 맞춤 기능(companyFeatures.vehicleLedger, 최고관리자가 켬)
//  ① 차량 전체 현황: 차량번호·회사·현재 기사·연락처·기사 변경일·차대번호·보험사·유류·하이패스·GPS·덮개·박스·차주명·용도
//     머리글 누르면 정렬(오름/내림), 검색·용도·회사·장비 필터, 엑셀 가져오기/내보내기, 기사관리 차량 불러오기
//  ② 관리대장(차량 한 대): 기본 정보 · 수리·정비 이력(부가세 10% 자동, 연·월 합계, 증빙) · 구조변경 · 기사 탑승 이력 ·
//     기본정보 변경·기타 이력 — 한 페이지에서 한눈에, A4 인쇄·엑셀 저장
//  휴대폰(좁은 화면)에서는 표 대신 카드로 그린다.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where, setDoc, deleteDoc, runTransaction } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db, auth } from "./firebase";
import { kpConfirm } from "./kpDialog";
import {
  VL_COL, PURPOSE_PRESETS, REPAIR_KINDS, EQUIP, today, uid, won, num, normPlate, plateCore, vehicleDocId, hasEquip, fmtPhone, normDate,
  currentDriver, parseSheetRows, saveEvidence, loadEvidence, deleteEvidence, dataUrlToBlobUrl, repairVat, ledgerPrintHtml, printHtml,
} from "./vehicleLedgerData";

const C = { ink: "#0B1428", navy: "#0F1A30", mid: "#1B2B4B", blue: "#2D4C82", sky: "#8FB0F0", line: "#E3E8F0", soft: "#F4F6FA", sub: "#5B6B85", mute: "#9AA9C3", pale: "#EEF2F9" };
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
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
      <span style={{ fontSize: 13.5, fontWeight: 800, color: C.sub }}>{label}</span>
      {children}
    </label>
  );
}
// 선택 + 직접 입력(목록에 없는 값은 "직접 입력…"으로)
function SelectOrType({ value, onChange, options, placeholder = "선택" }) {
  const opts = useMemo(() => Array.from(new Set([...options, value].filter(Boolean))), [options, value]);
  const [typing, setTyping] = useState(false);
  if (typing) return (
    <div style={{ display: "flex", gap: 6 }}>
      <input autoFocus value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="직접 입력" style={inp} />
      <Btn onClick={() => setTyping(false)} style={{ flexShrink: 0 }}>목록</Btn>
    </div>
  );
  return (
    <select value={value || ""} onChange={(e) => { if (e.target.value === "__type") { setTyping(true); onChange(""); } else onChange(e.target.value); }} style={inp}>
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value="__type">직접 입력…</option>
    </select>
  );
}
function Modal({ title, onClose, children, footer, width = 640 }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9600, background: "rgba(11,20,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ width: `min(${width}px, 100%)`, maxHeight: "calc(100vh - 24px)", background: "#fff", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 60px rgba(11,20,40,.35)" }}>
        <div style={{ padding: "14px 18px", background: "linear-gradient(120deg,#0B1428,#1B2B4B)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{title}</div>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 24, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}
const EqDot = ({ on, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99, fontSize: 13, fontWeight: 800, background: on ? C.mid : "#F1F4F9", color: on ? "#fff" : "#A7B3C7" }}>{label}</span>
);

// ── 기본 정보 입력 폼(등록·수정 공용) ──
const BASIC_KEYS = ["차량번호", "용도", "톤수", "회사", "차대번호", "보험사", "차주명", "유류카드사", "유류카드번호", "하이패스", "GPS", "덮개", "박스", "박스메모", "메모"];
function BasicForm({ v, set, purposeOpts, companyOpts, isNew }) {
  const f = (k) => ({ value: v[k] || "", onChange: (e) => set({ ...v, [k]: e.target.value }), style: inp });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
      <Field label="차량번호 *"><input {...f("차량번호")} placeholder="예) 경기12가3456" disabled={!isNew && false} /></Field>
      <Field label="용도·형태"><SelectOrType value={v.용도} onChange={(x) => set({ ...v, 용도: x })} options={purposeOpts} /></Field>
      <Field label="톤수"><input {...f("톤수")} placeholder="예) 5톤" /></Field>
      <Field label="회사(소속)"><input {...f("회사")} list="vl-co-list" placeholder="소속·차주 회사" /><datalist id="vl-co-list">{companyOpts.map((c) => <option key={c} value={c} />)}</datalist></Field>
      <Field label="차대번호"><input {...f("차대번호")} /></Field>
      <Field label="보험사"><input {...f("보험사")} /></Field>
      <Field label="차주명"><input {...f("차주명")} /></Field>
      <Field label="유류카드 카드사"><input {...f("유류카드사")} placeholder="예) 신한" /></Field>
      <Field label="유류카드 번호"><input {...f("유류카드번호")} /></Field>
      <Field label="하이패스"><input {...f("하이패스")} placeholder="번호 또는 O/X" /></Field>
      <Field label="GPS"><input {...f("GPS")} placeholder="단말·업체 또는 O/X" /></Field>
      <Field label="덮개"><input {...f("덮개")} placeholder="O/X 또는 종류" /></Field>
      <Field label="박스"><input {...f("박스")} placeholder="O/X 또는 종류" /></Field>
      <Field label="박스 사용처·제작사"><input {...f("박스메모")} placeholder="어디서 쓰는 박스인지" /></Field>
      <Field label="메모" wide><input {...f("메모")} /></Field>
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
          <button type="button" onClick={() => open(m)} title={m.name} style={{ border: "none", background: "transparent", padding: "3px 8px", fontSize: 13, fontWeight: 800, color: C.blue, cursor: "pointer", maxWidth: compact ? 90 : 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.type === "pdf" ? "PDF" : "사진"} · {m.name}</button>
          {canEdit && onRemove && <button type="button" onClick={() => onRemove(m)} style={{ border: "none", borderLeft: `1px solid ${C.line}`, background: "#fff", padding: "3px 6px", fontSize: 13, color: C.mute, cursor: "pointer" }}>×</button>}
        </span>
      ))}
      {canEdit && onAdd && (<>
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} style={{ border: `1px dashed ${C.sky}`, background: "#fff", borderRadius: 7, padding: "3px 9px", fontSize: 13, fontWeight: 800, color: C.blue, cursor: "pointer" }}>{busy ? "올리는 중…" : "+ 증빙"}</button>
        <input ref={ref} type="file" accept="image/*,application/pdf" multiple hidden onChange={async (e) => {
          const fs = Array.from(e.target.files || []); e.target.value = "";
          if (!fs.length) return;
          setBusy(true);
          try { await onAdd(fs); } finally { setBusy(false); }
        }} />
      </>)}
      {!files.length && !canEdit && <span style={{ color: "#C0CADB", fontSize: 13 }}>-</span>}
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

function RowEditor({ kind, row, onSave, onClose, kindOpts }) {
  const def = HIST[kind];
  const [r, setR] = useState(() => ({ ...def.empty(), ...row }));
  const [busy, setBusy] = useState(false);
  const autoVat = Math.round(num(r.공가) * 0.1);
  return (
    <Modal title={`${def.title} ${row?.id ? "수정" : "추가"}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>취소</Btn><Btn kind="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(r); } finally { setBusy(false); } }}>{busy ? "저장 중…" : "저장"}</Btn></>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {def.fields.map(([k, t, label]) => {
          const L = label || k;
          if (t === "textarea") return <Field key={k} label={L} wide><textarea value={r[k] || ""} onChange={(e) => setR({ ...r, [k]: e.target.value })} rows={3} style={{ ...inp, height: "auto", padding: 10, resize: "vertical", fontFamily: "inherit" }} /></Field>;
          if (t === "kind") return <Field key={k} label={L}><SelectOrType value={r[k]} onChange={(x) => setR({ ...r, [k]: x })} options={kindOpts} /></Field>;
          if (t === "logkind") return <Field key={k} label={L}><select value={r[k] || "이력"} onChange={(e) => setR({ ...r, [k]: e.target.value })} style={inp}><option>변경</option><option>이력</option></select></Field>;
          if (t === "money") return <Field key={k} label={L}><input inputMode="numeric" value={r[k] === "" || r[k] == null ? "" : won(num(r[k]))} onChange={(e) => setR({ ...r, [k]: e.target.value.replace(/[^\d]/g, "") })} style={{ ...inp, textAlign: "right", fontFamily: MONO }} placeholder="0" /></Field>;
          if (t === "vat") return (
            <Field key={k} label={L}>
              <input inputMode="numeric" value={r.부가세 === "" || r.부가세 == null ? "" : won(num(r.부가세))} onChange={(e) => setR({ ...r, 부가세: e.target.value.replace(/[^\d]/g, "") })} style={{ ...inp, textAlign: "right", fontFamily: MONO }} placeholder={`${won(autoVat)} (자동)`} />
            </Field>
          );
          if (t === "date") return <Field key={k} label={L}><input type="date" value={r[k] || ""} onChange={(e) => setR({ ...r, [k]: e.target.value })} style={inp} /></Field>;
          if (t === "phone") return <Field key={k} label={L}><input inputMode="tel" value={r[k] || ""} onChange={(e) => setR({ ...r, [k]: e.target.value })} onBlur={(e) => setR({ ...r, [k]: fmtPhone(e.target.value) })} style={inp} /></Field>;
          return <Field key={k} label={L}><input value={r[k] || ""} onChange={(e) => setR({ ...r, [k]: e.target.value })} style={inp} /></Field>;
        })}
      </div>
      {kind === "repairs" && (
        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 12, background: C.soft, display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14.5, fontWeight: 700, color: C.sub }}>
          <span>공가 <b style={{ color: C.navy, fontFamily: MONO }}>{won(num(r.공가))}</b></span>
          <span>부가세 <b style={{ color: C.navy, fontFamily: MONO }}>{won(repairVat(r))}</b></span>
          <span>합금액 <b style={{ color: C.navy, fontFamily: MONO, fontSize: 16 }}>{won(num(r.공가) + repairVat(r))}</b>원</span>
        </div>
      )}
      {"files" in def.empty() && <div style={{ marginTop: 10, fontSize: 13.5, color: C.mute }}>증빙(사진·PDF)은 저장한 뒤 표의 [+ 증빙]으로 올립니다.</div>}
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
            <thead><tr>{["차량번호", "용도", "회사", "현재기사", "기사연락처", "기사변경일", "보험사", "차주명"].map((h) => <th key={h} style={{ position: "sticky", top: 0, background: C.mid, color: "#fff", padding: "8px 10px", fontSize: 14, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{res.rows.slice(0, 200).map((r, i) => (
              <tr key={i} style={{ background: exKeys.has(normPlate(r.차량번호)) ? undefined : "#F3F8EE" }}>
                {["차량번호", "용도", "회사", "현재기사", "기사연락처", "기사변경일", "보험사", "차주명"].map((k) => <td key={k} style={{ padding: "7px 10px", fontSize: 14, borderTop: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>{r[k] || ""}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ marginTop: 6, fontSize: 13.5, color: C.mute }}>연두색 줄 = 새로 등록되는 차량</div>
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
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.22em", color: C.mute }}>{code}</div>
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

function Ledger({ v, co, appDriver, drivers, canEdit, by, narrow, purposeOpts, companyOpts, kindOpts, onBack, toast }) {
  const ref = doc(db, VL_COL, v.id);
  const [edit, setEdit] = useState(null); // 기본 정보 수정 중 값
  const [editor, setEditor] = useState(null); // { kind, row }
  const [drvForm, setDrvForm] = useState(null); // { 이름, 연락처, 시작, driverId }
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(0);
  const cur = currentDriver(v);

  // 배열 이력은 트랜잭션으로(여러 명이 동시에 고쳐도 덮어쓰지 않게)
  const mutate = (fn) => runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new Error("차량이 삭제되었습니다");
    const patch = fn(s.data());
    tx.update(ref, { ...patch, updatedAt: Date.now(), updatedBy: by });
  });
  const saveRow = async (kind, r) => {
    const row = { ...r, id: r.id || uid() };
    if (kind === "driverHist") row.연락처 = fmtPhone(row.연락처);
    await mutate((d) => {
      const arr = [...(d[kind] || [])];
      const i = arr.findIndex((x) => x.id === row.id);
      if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push({ ...row, createdAt: Date.now(), by });
      return { [kind]: arr };
    });
    setEditor(null); toast("저장했습니다");
  };
  const delRow = async (kind, row) => {
    if (!(await kpConfirm(`이 줄을 삭제할까요?${row.files?.length ? ` (증빙 ${row.files.length}건도 함께 삭제)` : ""}`, { title: "이력 삭제", okText: "삭제", danger: true }))) return;
    await mutate((d) => ({ [kind]: (d[kind] || []).filter((x) => x.id !== row.id) }));
    deleteEvidence(row.files || []).catch(() => {});
    toast("삭제했습니다");
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
    BASIC_KEYS.forEach((k) => {
      const a = String(v[k] ?? "").trim(); const b = String(edit[k] ?? "").trim();
      if (a !== b) { next[k] = b; changes.push({ id: uid(), 일자: today(), 내용: `${k} 변경`, 구분: "변경", 날짜: today(), 세부내용: `${a || "(없음)"} → ${b || "(없음)"}`, 비고: `자동 기록 · ${by}`, createdAt: Date.now(), by }); }
    });
    if (!normPlate(edit.차량번호)) { toast("차량번호를 입력하세요"); return; }
    if (!changes.length) { setEdit(null); return; }
    if (next.차량번호 !== undefined) next.plateKey = normPlate(next.차량번호);
    await mutate((d) => ({ ...next, logs: [...(d.logs || []), ...changes] }));
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
    const kv = [["항목", "내용"], ["차량번호", v.차량번호], ["용도·형태", v.용도], ["톤수", v.톤수], ["회사", v.회사], ["차대번호", v.차대번호], ["보험사", v.보험사], ["차주명", v.차주명],
      ["현재 기사", cur?.이름 || ""], ["기사 연락처", cur?.연락처 || ""], ["기사 변경일", cur?.시작 || ""], ["유류카드 카드사", v.유류카드사], ["유류카드 번호", v.유류카드번호], ["하이패스", v.하이패스], ["GPS", v.GPS], ["덮개", v.덮개], ["박스", v.박스], ["박스 사용처", v.박스메모], ["메모", v.메모]];
    const add = (name, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = w.map((x) => ({ wch: x })); XLSX.utils.book_append_sheet(wb, ws, name); };
    add("기본정보", kv, [16, 40]);
    const rep = [...(v.repairs || [])].sort((a, b) => String(a.일자).localeCompare(String(b.일자)));
    add("수리정비", [["일자", "구분", "정비내용", "업체", "업체번호", "공가금액", "부가세", "합금액", "비고", "증빙"], ...rep.map((r) => [r.일자, r.구분, r.내용, r.업체, r.업체번호, num(r.공가), repairVat(r), num(r.공가) + repairVat(r), r.비고, (r.files || []).length || ""]),
      ["합계", "", "", "", "", rep.reduce((s, r) => s + num(r.공가), 0), rep.reduce((s, r) => s + repairVat(r), 0), rep.reduce((s, r) => s + num(r.공가) + repairVat(r), 0), "", ""]], [12, 12, 40, 16, 15, 12, 11, 12, 20, 6]);
    add("구조변경", [["일자", "내용", "업체", "금액", "비고"], ...(v.structures || []).map((r) => [r.일자, r.내용, r.업체, num(r.금액), r.비고])], [12, 40, 16, 12, 20]);
    add("기사탑승", [["시작", "종료", "기사", "연락처", "비고"], ...(v.driverHist || []).map((r) => [r.시작, r.종료 || "현재", r.이름, r.연락처, r.비고])], [12, 12, 12, 15, 20]);
    add("변경기타이력", [["일자", "내용", "변경/이력", "날짜", "세부내용", "비고"], ...(v.logs || []).map((r) => [r.일자, r.내용, r.구분, r.날짜, r.세부내용, r.비고])], [12, 20, 10, 12, 40, 24]);
    XLSX.writeFile(wb, `차량관리대장_${normPlate(v.차량번호)}_${today()}.xlsx`);
  };
  const removeVehicle = async () => {
    if (!(await kpConfirm(`${v.차량번호} 차량과 모든 이력·증빙을 삭제할까요? 되돌릴 수 없습니다.`, { title: "차량 삭제", okText: "삭제", danger: true }))) return;
    const files = [...(v.repairs || []), ...(v.structures || [])].flatMap((r) => r.files || []);
    await deleteDoc(ref);
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
    ["차량번호", v.차량번호], ["용도·형태", v.용도], ["톤수", v.톤수], ["회사", v.회사], ["차대번호", v.차대번호], ["보험사", v.보험사], ["차주명", v.차주명],
    ["현재 기사", cur ? cur.이름 : appDriver ? `${appDriver.이름} (기사관리)` : ""], ["기사 연락처", cur ? cur.연락처 : appDriver?.전화번호 || ""], ["기사 변경일", cur?.시작 || ""],
  ];
  const nav = [["vl-basic", "기본 정보"], ["vl-repairs", `정비 ${reps.length}`], ["vl-structures", `구조변경 ${(v.structures || []).length}`], ["vl-driverHist", `기사 ${(v.driverHist || []).length}`], ["vl-logs", `변경·기타 ${(v.logs || []).length}`]];
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // 이력 표(구조변경·기타·기사) — 넓으면 표, 좁으면 카드
  const HistTable = ({ kind, rows, cols, render }) => {
    const sorted = [...rows].sort((a, b) => String(b[cols[0][0]] || "").localeCompare(String(a[cols[0][0]] || "")));
    if (!sorted.length) return <div style={{ padding: 28, textAlign: "center", color: C.mute, fontSize: 14.5 }}>기록이 없습니다</div>;
    if (narrow) return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {sorted.map((r) => (
          <div key={r.id} style={{ padding: "12px 14px", borderTop: `1px solid #EEF1F6` }} onClick={() => canEdit && setEditor({ kind, row: r })}>
            {render ? render(r) : cols.map(([k, l]) => r[k] ? <div key={k} style={{ fontSize: 14.5, color: C.navy, lineHeight: 1.5 }}><b style={{ color: C.sub, fontSize: 13.5, marginRight: 6 }}>{l}</b>{typeof r[k] === "number" || k === "금액" ? won(num(r[k])) : r[k]}</div> : null)}
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
      {/* 머리 */}
      <div style={{ borderRadius: 18, padding: narrow ? "16px" : "18px 22px", color: "#fff", background: HERO_BG, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Btn kind="light" onClick={onBack}>← 목록</Btn>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.26em", color: C.sky }}>VEHICLE LEDGER</div>
          <div style={{ fontSize: narrow ? 24 : 28, fontWeight: 900, letterSpacing: "-0.01em" }}>{v.차량번호}</div>
          <div style={{ fontSize: 14.5, color: "rgba(255,255,255,.72)", marginTop: 2 }}>{[v.용도, v.톤수, v.회사].filter(Boolean).join(" · ") || "기본 정보를 입력하세요"}{(cur || appDriver) ? ` · 현재 기사 ${cur?.이름 || appDriver.이름}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="light" onClick={() => printHtml(ledgerPrintHtml(v, co))}>인쇄</Btn>
          <Btn kind="light" onClick={exportXlsx}>엑셀</Btn>
          {canEdit && <Btn kind="light" onClick={removeVehicle}>삭제</Btn>}
        </div>
      </div>
      {/* 바로가기 */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", gap: 6, overflowX: "auto", padding: 6, background: "rgba(244,246,250,.94)", backdropFilter: "blur(6px)", borderRadius: 12, border: `1px solid ${C.line}` }}>
        {nav.map(([id, l]) => <button key={id} type="button" onClick={() => go(id)} style={{ flexShrink: 0, height: 36, padding: "0 14px", borderRadius: 9, border: "none", background: "#fff", color: C.mid, fontSize: 14.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.06)" }}>{l}</button>)}
      </div>

      {/* 기본 정보 */}
      <Section id="vl-basic" title="기본 정보" code="BASIC" right={canEdit && (edit ? <div style={{ display: "flex", gap: 6 }}><Btn onClick={() => setEdit(null)}>취소</Btn><Btn kind="primary" onClick={saveBasic}>저장</Btn></div> : <Btn onClick={() => setEdit(Object.fromEntries(BASIC_KEYS.map((k) => [k, v[k] || ""])))}>수정</Btn>)}>
        <div style={{ padding: 16 }}>
          {edit ? <BasicForm v={edit} set={setEdit} purposeOpts={purposeOpts} companyOpts={companyOpts} /> : (<>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2, minmax(0,1fr))" : "repeat(5, minmax(0,1fr))", gap: 0, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              {info.map(([k, val]) => (
                <div key={k} style={{ padding: "10px 12px", borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.mute }}>{k}</div>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: val ? C.navy : "#C0CADB", marginTop: 2, wordBreak: "break-all" }}>{val || "-"}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 14, fontWeight: 900, color: C.sub }}>장비</div>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "repeat(5, minmax(0,1fr))", gap: 10, marginTop: 8 }}>
              {[["유류카드", [v.유류카드사, v.유류카드번호].filter(Boolean).join(" · "), hasEquip(v.유류카드번호)], ["하이패스", v.하이패스, hasEquip(v.하이패스)], ["GPS", v.GPS, hasEquip(v.GPS)], ["덮개", v.덮개, hasEquip(v.덮개)], ["박스", [v.박스, v.박스메모].filter(Boolean).join(" · "), hasEquip(v.박스)]].map(([k, val, on]) => (
                <div key={k} style={{ padding: "12px 14px", borderRadius: 12, background: on ? "linear-gradient(135deg,#0F1A30,#1B2B4B)" : C.soft, color: on ? "#fff" : C.mute, display: "flex", alignItems: narrow ? "center" : "flex-start", flexDirection: narrow ? "row" : "column", gap: narrow ? 10 : 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: on ? C.sky : C.mute, minWidth: narrow ? 64 : 0 }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, wordBreak: "break-all" }}>{val || "없음"}</div>
                </div>
              ))}
            </div>
            {v.메모 && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: C.pale, fontSize: 14.5, color: C.navy }}>{v.메모}</div>}
          </>)}
        </div>
      </Section>

      {/* 수리·정비 */}
      <Section id="vl-repairs" title="수리·정비 이력" code="REPAIR" right={<div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select value={year} onChange={(e) => { setYear(e.target.value); setMonth(0); }} style={{ ...inp, width: 110, height: 38 }}>{years.map((y) => <option key={y} value={y}>{y}년</option>)}<option value="all">전체</option></select>
        {canEdit && <Btn kind="primary" onClick={() => setEditor({ kind: "repairs", row: null })}>+ 정비 추가</Btn>}
      </div>}>
        <div style={{ padding: "14px 16px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch", borderBottom: `1px solid #EEF1F6` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, flex: narrow ? "1 1 100%" : "0 0 400px" }}>
            {[["공가", sum.g], ["부가세", sum.v], ["합금액", sum.g + sum.v]].map(([l, n], i) => (
              <div key={l} style={{ padding: "10px 12px", borderRadius: 12, background: i === 2 ? "linear-gradient(135deg,#0F1A30,#2D4C82)" : C.soft, color: i === 2 ? "#fff" : C.navy }}>
                <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.75 }}>{l} · {repShown.length}건</div>
                <div style={{ fontFamily: MONO, fontSize: narrow ? 16 : 19, fontWeight: 800, marginTop: 2 }}>{won(n)}</div>
              </div>
            ))}
          </div>
          {year !== "all" && (
            <div style={{ flex: 1, minWidth: 260, display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 4, alignItems: "end" }}>
              {monthly.map((m, i) => (
                <button key={i} type="button" onClick={() => setMonth(month === i + 1 ? 0 : i + 1)} title={`${i + 1}월 ${won(m)}원`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                  <span style={{ fontSize: 11.5, fontFamily: MONO, fontWeight: 700, color: C.sub, whiteSpace: "nowrap" }}>{m ? (m >= 10000 ? `${Math.round(m / 10000)}만` : won(m)) : ""}</span>
                  <span style={{ width: "100%", height: Math.max(4, Math.round((m / maxM) * 48)), borderRadius: 4, background: month === i + 1 ? C.blue : m ? C.sky : "#E6EBF3" }} />
                  <span style={{ fontSize: 13, fontWeight: month === i + 1 ? 900 : 700, color: month === i + 1 ? C.blue : C.sub }}>{i + 1}월</span>
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
                {r.구분 && <span style={{ padding: "2px 8px", borderRadius: 6, background: C.pale, color: C.blue, fontSize: 13, fontWeight: 800 }}>{r.구분}</span>}
                <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 16, fontWeight: 800, color: C.navy }}>{won(num(r.공가) + repairVat(r))}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginTop: 4, whiteSpace: "pre-wrap" }} onClick={() => canEdit && setEditor({ kind: "repairs", row: r })}>{r.내용 || "-"}</div>
              <div style={{ fontSize: 13.5, color: C.sub, marginTop: 2 }}>{[r.업체, r.업체번호].filter(Boolean).join(" · ")} {num(r.공가) ? `· 공가 ${won(num(r.공가))} + 부가세 ${won(repairVat(r))}` : ""}{r.비고 ? ` · ${r.비고}` : ""}</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Evidence files={r.files} canEdit={canEdit} compact onAdd={(fs) => addFiles("repairs", r, fs)} onRemove={(m) => rmFile("repairs", r, m)} />
                {canEdit && <span style={{ marginLeft: "auto" }}><RowActs onEdit={() => setEditor({ kind: "repairs", row: r })} onDel={() => delRow("repairs", r)} /></span>}
              </div>
            </div>
          ))}</div>
        ) : (
          <div style={{ overflow: "auto", maxHeight: 560 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
              <thead><tr>{["일자", "구분", "정비내용", "업체", "업체번호", "공가금액", "부가세", "합금액", "비고", "증빙"].map((h) => <th key={h} style={th}>{h}</th>)}{canEdit && <th style={{ ...th, width: 110 }}></th>}</tr></thead>
              <tbody>
                {repShown.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }}>{r.일자}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.구분}</td>
                    <td style={{ ...td, minWidth: 220, whiteSpace: "pre-wrap" }}>{r.내용}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.업체}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.업체번호}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: MONO }}>{won(num(r.공가))}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: MONO, color: C.sub }}>{won(repairVat(r))}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 800 }}>{won(num(r.공가) + repairVat(r))}</td>
                    <td style={{ ...td, minWidth: 100 }}>{r.비고}</td>
                    <td style={td}><Evidence files={r.files} canEdit={canEdit} onAdd={(fs) => addFiles("repairs", r, fs)} onRemove={(m) => rmFile("repairs", r, m)} /></td>
                    {canEdit && <td style={{ ...td, whiteSpace: "nowrap", textAlign: "center" }}><RowActs onEdit={() => setEditor({ kind: "repairs", row: r })} onDel={() => delRow("repairs", r)} /></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ background: C.soft }}>
                <td colSpan={5} style={{ ...td, fontWeight: 900 }}>합계 {repShown.length}건</td>
                <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 800 }}>{won(sum.g)}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 800 }}>{won(sum.v)}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: MONO, fontWeight: 900 }}>{won(sum.g + sum.v)}</td>
                <td colSpan={canEdit ? 3 : 2} style={td}></td>
              </tr></tfoot>
            </table>
          </div>
        )}
      </Section>

      {/* 구조변경 */}
      <Section id="vl-structures" title="구조변경 이력" code="STRUCTURE" right={canEdit && <Btn kind="primary" onClick={() => setEditor({ kind: "structures", row: null })}>+ 구조변경 추가</Btn>}>
        <HistTable kind="structures" rows={v.structures || []} cols={[["일자", "일자", { whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }], ["내용", "내용", { minWidth: 260, whiteSpace: "pre-wrap" }], ["업체", "업체", { whiteSpace: "nowrap" }], ["금액", "금액", { textAlign: "right", fontFamily: MONO }], ["비고", "비고"]]} />
      </Section>

      {/* 기사 탑승 */}
      <Section id="vl-driverHist" title="기사 탑승 이력" code="DRIVER" right={canEdit && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!cur && appDriver && !(v.driverHist || []).length && <Btn onClick={() => saveRow("driverHist", { 이름: appDriver.이름, 연락처: appDriver.전화번호, 시작: today(), 종료: "", 비고: "기사관리에서 가져옴", driverId: appDriver.id })}>기사관리 기사로 시작</Btn>}
        <Btn onClick={() => setEditor({ kind: "driverHist", row: null })}>+ 과거 이력</Btn>
        <Btn kind="primary" onClick={() => setDrvForm({ 이름: "", 연락처: "", 시작: today(), driverId: "", 비고: "" })}>기사 변경</Btn>
      </div>}>
        <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: `1px solid #EEF1F6` }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.sub }}>현재 기사</span>
          {cur ? <span style={{ fontSize: 16, fontWeight: 900, color: C.navy }}>{cur.이름} <a href={`tel:${cur.연락처}`} style={{ fontSize: 14.5, color: C.blue, fontWeight: 700, marginLeft: 6 }}>{cur.연락처}</a> <span style={{ fontSize: 14, color: C.sub, fontWeight: 700, marginLeft: 6 }}>{cur.시작}부터</span></span>
            : <span style={{ fontSize: 14.5, color: C.mute }}>{appDriver ? `탑승 이력 없음 · 기사관리 등록 기사: ${appDriver.이름} ${appDriver.전화번호 || ""}` : "배정된 기사가 없습니다"}</span>}
        </div>
        <HistTable kind="driverHist" rows={v.driverHist || []} cols={[["시작", "시작", { whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }], ["종료", "종료", { whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }], ["이름", "기사", { whiteSpace: "nowrap", fontWeight: 800 }], ["연락처", "연락처", { whiteSpace: "nowrap" }], ["비고", "비고"]]}
          render={(r) => <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><b style={{ fontSize: 15.5, color: C.navy }}>{r.이름}</b><a href={`tel:${r.연락처}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 14, color: C.blue }}>{r.연락처}</a><span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13.5, color: r.종료 ? C.sub : C.blue, fontWeight: 800 }}>{r.시작} ~ {r.종료 || "현재"}</span>{r.비고 && <div style={{ width: "100%", fontSize: 13.5, color: C.sub }}>{r.비고}</div>}</div>} />
      </Section>

      {/* 변경·기타 이력 */}
      <Section id="vl-logs" title="기본정보 변경·기타 이력" code="LOG" right={canEdit && <Btn kind="primary" onClick={() => setEditor({ kind: "logs", row: null })}>+ 이력 추가</Btn>}>
        <HistTable kind="logs" rows={v.logs || []} cols={[["일자", "일자", { whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }], ["내용", "내용", { whiteSpace: "nowrap", fontWeight: 800 }], ["구분", "변경/이력", { whiteSpace: "nowrap", textAlign: "center" }], ["날짜", "날짜", { whiteSpace: "nowrap", fontFamily: MONO, fontSize: 14 }], ["세부내용", "세부내용", { minWidth: 240, whiteSpace: "pre-wrap" }], ["비고", "비고", { color: C.sub }]]} />
      </Section>

      {editor && <RowEditor kind={editor.kind} row={editor.row} kindOpts={kindOpts} onClose={() => setEditor(null)} onSave={(r) => saveRow(editor.kind, r)} />}
      {drvForm && (
        <Modal title="기사 변경" onClose={() => setDrvForm(null)} width={560}
          footer={<><Btn onClick={() => setDrvForm(null)}>취소</Btn><Btn kind="primary" onClick={changeDriver}>변경 저장</Btn></>}>
          <div style={{ fontSize: 14.5, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>{cur ? <>지금 기사 <b style={{ color: C.navy }}>{cur.이름}</b>의 탑승은 시작일로 자동 종료되고, 새 기사가 현재 기사가 됩니다.</> : "새 기사가 현재 기사가 됩니다."}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 12 }}>
            <Field label="기사관리에서 고르기" wide>
              <select value={drvForm.driverId} onChange={(e) => { const d = drivers.find((x) => x.id === e.target.value); setDrvForm({ ...drvForm, driverId: e.target.value, 이름: d ? (d.이름 || d.name || "") : drvForm.이름, 연락처: d ? fmtPhone(d.전화번호 || d.phone || "") : drvForm.연락처 }); }} style={inp}>
                <option value="">직접 입력</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.이름 || d.name} · {d.차량번호 || "-"} {d.등급 ? `(${d.등급})` : ""}</option>)}
              </select>
            </Field>
            <Field label="기사 이름 *"><input value={drvForm.이름} onChange={(e) => setDrvForm({ ...drvForm, 이름: e.target.value })} style={inp} /></Field>
            <Field label="연락처"><input inputMode="tel" value={drvForm.연락처} onChange={(e) => setDrvForm({ ...drvForm, 연락처: e.target.value })} onBlur={(e) => setDrvForm({ ...drvForm, 연락처: fmtPhone(e.target.value) })} style={inp} /></Field>
            <Field label="기사 변경일(탑승 시작)"><input type="date" value={drvForm.시작} onChange={(e) => setDrvForm({ ...drvForm, 시작: e.target.value })} style={inp} /></Field>
            <Field label="비고"><input value={drvForm.비고} onChange={(e) => setDrvForm({ ...drvForm, 비고: e.target.value })} style={inp} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
function RowActs({ onEdit, onDel }) {
  const b = { height: 32, padding: "0 10px", borderRadius: 8, fontSize: 13.5, fontWeight: 800, cursor: "pointer", background: "#fff" };
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
const COLS = [
  ["차량번호", "차량번호", 130], ["용도", "용도·형태", 90], ["톤수", "톤수", 70], ["회사", "회사", 110], ["현재기사", "현재 기사", 90], ["기사연락처", "기사 연락처", 130], ["기사변경일", "기사 변경일", 110],
  ["차대번호", "차대번호", 170], ["보험사", "보험사", 90], ["유류카드번호", "유류", 120], ["하이패스", "하이패스", 100], ["GPS", "GPS", 80], ["덮개", "덮개", 70], ["박스", "박스", 90], ["차주명", "차주명", 90],
];

export default function VehicleLedger({ company = "", drivers = [], canEdit = true, myName = "" }) {
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
  const [sort, setSort] = useState({ k: "차량번호", d: 1 });
  const [creating, setCreating] = useState(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const by = `${myName || auth.currentUser?.email || "직원"}`;
  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2200); };
  const pick = (id) => { setSelId(id); try { if (id) sessionStorage.setItem("vlSel", id); else sessionStorage.removeItem("vlSel"); } catch { /* 무시 */ } window.scrollTo?.({ top: 0 }); };

  useEffect(() => {
    if (!co) return undefined;
    // fsTenant 자동 필터 대상이 아닌 컬렉션 → 항상 회사 조건을 직접 붙인다
    return onSnapshot(query(collection(db, VL_COL), where("companyName", "==", co)), (s) => { setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoaded(true); setErr(""); }, (e) => { setErr(e?.code || "error"); setLoaded(true); });
  }, [co]);

  // 기사관리(drivers) 연결 — 번호판으로
  const drvByPlate = useMemo(() => {
    const m = new Map();
    drivers.forEach((d) => { const p = d.차량번호 || d.carNo; if (!normPlate(p)) return; const k = plateCore(p); if (!m.has(k) || (d.등급 && ["지입", "직영", "임대"].includes(d.등급))) m.set(k, d); });
    return m;
  }, [drivers]);
  const rows = useMemo(() => list.map((v) => {
    const cur = currentDriver(v);
    const app = drvByPlate.get(plateCore(v.차량번호)) || null;
    const appDriver = app ? { id: app.id, 이름: app.이름 || app.name || "", 전화번호: fmtPhone(app.전화번호 || app.phone || ""), 등급: app.등급 || "" } : null;
    return { ...v, appDriver, 현재기사: cur?.이름 || appDriver?.이름 || "", 기사연락처: cur?.연락처 || appDriver?.전화번호 || "", 기사변경일: cur?.시작 || "", fromApp: !cur && !!appDriver };
  }), [list, drvByPlate]);
  const purposeOpts = useMemo(() => Array.from(new Set([...PURPOSE_PRESETS, ...list.map((v) => v.용도).filter(Boolean)])), [list]);
  const companyOpts = useMemo(() => Array.from(new Set(list.map((v) => v.회사).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")), [list]);
  const kindOpts = useMemo(() => Array.from(new Set([...REPAIR_KINDS, ...list.flatMap((v) => (v.repairs || []).map((r) => r.구분)).filter(Boolean)])), [list]);
  const thisYear = String(new Date().getFullYear());

  const shown = useMemo(() => {
    const qq = q.trim().replace(/\s/g, "").toLowerCase();
    const [ek, ev] = fEq.split(":");
    return rows
      .filter((r) => !fPurpose || (r.용도 || "") === fPurpose)
      .filter((r) => !fCo || (r.회사 || "") === fCo)
      .filter((r) => !ek || hasEquip(r[ek]) === (ev === "1"))
      .filter((r) => !qq || [r.차량번호, r.현재기사, r.기사연락처, r.차주명, r.차대번호, r.회사, r.보험사, r.용도, r.유류카드번호, r.하이패스].some((x) => String(x || "").replace(/\s/g, "").toLowerCase().includes(qq)))
      .sort((a, b) => sort.d * String(a[sort.k] || "￿").localeCompare(String(b[sort.k] || "￿"), "ko", { numeric: true }));
  }, [rows, q, fPurpose, fCo, fEq, sort]);
  const sel = rows.find((r) => r.id === selId) || null;

  const createVehicle = async (v) => {
    const key = normPlate(v.차량번호);
    if (!key) { toast("차량번호를 입력하세요"); return; }
    if (list.some((x) => normPlate(x.차량번호) === key || x.id === vehicleDocId(co, key))) { toast("이미 등록된 차량번호입니다"); return; }
    const id = vehicleDocId(co, key);
    const data = { companyName: co, plateKey: key, repairs: [], structures: [], driverHist: [], logs: [], createdAt: Date.now(), updatedAt: Date.now(), updatedBy: by };
    BASIC_KEYS.forEach((k) => { data[k] = String(v[k] ?? "").trim(); });
    const app = drvByPlate.get(plateCore(v.차량번호));
    if (app) data.driverHist = [{ id: uid(), 이름: app.이름 || app.name || "", 연락처: fmtPhone(app.전화번호 || app.phone || ""), 시작: today(), 종료: "", 비고: "기사관리에서 가져옴", driverId: app.id, createdAt: Date.now(), by }];
    await setDoc(doc(db, VL_COL, id), data);
    setCreating(null); toast("등록했습니다"); pick(id);
  };
  // 기사관리의 지입·직영·임대 차량 중 아직 대장에 없는 차량 일괄 등록
  const appMissing = useMemo(() => {
    const have = new Set(list.map((v) => plateCore(v.차량번호)));
    const seen = new Set();
    return drivers.filter((d) => ["지입", "직영", "임대"].includes(d.등급)).filter((d) => {
      const k = plateCore(d.차량번호 || d.carNo); if (!k || k === "-" || have.has(k) || seen.has(k)) return false; seen.add(k); return true;
    });
  }, [drivers, list]);
  const importFromDrivers = async () => {
    if (!appMissing.length) return;
    if (!(await kpConfirm(`기사관리에 등록된 지입·직영·임대 차량 ${appMissing.length}대를 관리대장에 추가할까요? (현재 기사도 탑승 이력으로 함께 등록)`, { title: "기사관리 차량 불러오기", okText: "불러오기" }))) return;
    for (const d of appMissing) {
      const plate = String(d.차량번호 || d.carNo).trim();
      const key = normPlate(plate);
      await setDoc(doc(db, VL_COL, vehicleDocId(co, key)), {
        companyName: co, plateKey: key, 차량번호: plate, 용도: d.차량종류 || d.vehicleType || "", 톤수: String(d.차량톤수 || d.톤수 || ""), 회사: d.사업자상호 || "", 차주명: "",
        repairs: [], structures: [], logs: [],
        driverHist: [{ id: uid(), 이름: d.이름 || d.name || "", 연락처: fmtPhone(d.전화번호 || d.phone || ""), 시작: today(), 종료: "", 비고: "기사관리에서 가져옴", driverId: d.id, createdAt: Date.now(), by }],
        createdAt: Date.now(), updatedAt: Date.now(), updatedBy: by,
      }, { merge: true });
    }
    toast(`${appMissing.length}대를 불러왔습니다`);
  };
  const importRows = async (rowsIn) => {
    const byKey = new Map(list.map((v) => [normPlate(v.차량번호), v]));
    let n = 0;
    for (const r of rowsIn) {
      const key = normPlate(r.차량번호);
      const ex = byKey.get(key);
      const id = ex?.id || vehicleDocId(co, key);
      const patch = { companyName: co, plateKey: key, updatedAt: Date.now(), updatedBy: by };
      BASIC_KEYS.forEach((k) => { if (r[k] != null && String(r[k]).trim() !== "") patch[k] = String(r[k]).trim(); });
      if (!ex) Object.assign(patch, { repairs: [], structures: [], logs: [], driverHist: [], createdAt: Date.now() });
      const hist = [...(ex?.driverHist || [])];
      const cur = currentDriver({ driverHist: hist });
      if (r.현재기사 && (!cur || cur.이름 !== r.현재기사)) {
        const start = r.기사변경일 || today();
        const closed = hist.map((h) => (h.종료 ? h : { ...h, 종료: start }));
        closed.push({ id: uid(), 이름: r.현재기사, 연락처: r.기사연락처 || "", 시작: start, 종료: "", 비고: "엑셀 가져오기", createdAt: Date.now(), by });
        patch.driverHist = closed;
      } else if (cur && r.기사연락처 && !cur.연락처) {
        patch.driverHist = hist.map((h) => (h.id === cur.id ? { ...h, 연락처: r.기사연락처 } : h));
      }
      await setDoc(doc(db, VL_COL, id), patch, { merge: true });
      n += 1;
    }
    toast(`${n}대를 가져왔습니다`);
  };
  const exportList = () => {
    const aoa = [COLS.map((c) => c[1]).concat(["유류카드사", "박스 사용처", "메모", `${thisYear} 정비비`]), ...shown.map((r) => COLS.map(([k]) => r[k] || "").concat([r.유류카드사 || "", r.박스메모 || "", r.메모 || "", (r.repairs || []).filter((x) => String(x.일자 || "").startsWith(thisYear)).reduce((s, x) => s + num(x.공가) + repairVat(x), 0)]))];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = aoa[0].map((h, i) => ({ wch: i < COLS.length ? Math.round(COLS[i][2] / 8) : 14 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "차량 전체 현황");
    XLSX.writeFile(wb, `차량전체현황_${co}_${today()}.xlsx`);
  };

  const box = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" };
  const toastEl = msg && <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", background: C.navy, color: "#fff", padding: "11px 18px", borderRadius: 12, fontSize: 14.5, fontWeight: 800, zIndex: 9999, maxWidth: "90vw" }}>{msg}</div>;

  if (!co) return <div style={{ padding: 40, textAlign: "center", color: C.mute, fontSize: 15 }}>회사 정보를 불러오는 중…</div>;
  if (sel) return (<>
    <Ledger key={sel.id} v={sel} co={co} appDriver={sel.appDriver} drivers={drivers} canEdit={canEdit} by={by} narrow={narrow} purposeOpts={purposeOpts} companyOpts={companyOpts} kindOpts={kindOpts} onBack={() => pick(null)} toast={toast} />
    {toastEl}
  </>);

  const cnt = {
    all: rows.length,
    assigned: rows.filter((r) => r.현재기사).length,
    cost: rows.reduce((s, r) => s + (r.repairs || []).filter((x) => String(x.일자 || "").startsWith(thisYear)).reduce((a, x) => a + num(x.공가) + repairVat(x), 0), 0),
  };
  const sortBy = (k) => setSort((s) => (s.k === k ? { k, d: -s.d } : { k, d: 1 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 18, padding: narrow ? 16 : "18px 22px", color: "#fff", background: HERO_BG, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, letterSpacing: "0.26em", color: C.sky }}>FLEET · VEHICLE LEDGER</div>
          <div style={{ fontSize: 23, fontWeight: 900, marginTop: 2 }}>차량 관리대장</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.68)", marginTop: 2 }}>차량 전체 현황 · 정비·구조변경·기사 탑승 이력을 차량별로 한눈에 관리합니다.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, flex: narrow ? "1 1 100%" : "0 0 auto" }}>
          {[["전체 차량", `${cnt.all}대`], ["기사 배정", `${cnt.assigned}대`], [`${thisYear} 정비비`, won(cnt.cost)]].map(([l, n]) => (
            <div key={l} style={{ minWidth: narrow ? 0 : 120, padding: "8px 12px", borderRadius: 12, border: "1px solid rgba(143,176,240,.3)", background: "rgba(255,255,255,.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.72, whiteSpace: "nowrap" }}>{l}</div>
              <div style={{ fontFamily: MONO, fontSize: narrow ? 16 : 20, fontWeight: 800, whiteSpace: "nowrap" }}>{n}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={box}>
        {/* 도구 줄 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 14px", background: "#F7F9FC", borderBottom: `1px solid #E8EDF4` }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: C.navy, marginRight: 4, whiteSpace: "nowrap" }}>차량 전체 현황 <span style={{ fontFamily: MONO, color: C.blue }}>{shown.length}</span><span style={{ fontSize: 14, color: C.mute }}>/{rows.length}대</span></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="차량번호·기사·차주·차대번호 검색" style={{ ...inp, width: narrow ? "100%" : 260, height: 38 }} />
          <select value={fPurpose} onChange={(e) => setFPurpose(e.target.value)} style={{ ...inp, width: narrow ? "calc(33% - 6px)" : 130, height: 38 }}><option value="">용도 전체</option>{purposeOpts.filter((p) => list.some((v) => v.용도 === p)).map((p) => <option key={p}>{p}</option>)}</select>
          <select value={fCo} onChange={(e) => setFCo(e.target.value)} style={{ ...inp, width: narrow ? "calc(33% - 6px)" : 140, height: 38 }}><option value="">회사 전체</option>{companyOpts.map((p) => <option key={p}>{p}</option>)}</select>
          <select value={fEq} onChange={(e) => setFEq(e.target.value)} style={{ ...inp, width: narrow ? "calc(34% - 6px)" : 150, height: 38 }}>
            <option value="">장비 전체</option>
            {EQUIP.flatMap((e) => [<option key={e.key + 1} value={`${e.key}:1`}>{e.label} 있음</option>, <option key={e.key + 0} value={`${e.key}:0`}>{e.label} 없음</option>])}
          </select>
          {narrow && (
            <select value={`${sort.k}:${sort.d}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort({ k, d: Number(d) }); }} style={{ ...inp, height: 38 }}>
              {COLS.slice(0, 9).flatMap(([k, l]) => [<option key={k + "a"} value={`${k}:1`}>{l} ↑ 정렬</option>, <option key={k + "d"} value={`${k}:-1`}>{l} ↓ 정렬</option>])}
            </select>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {canEdit && appMissing.length > 0 && <Btn onClick={importFromDrivers} title="기사관리의 지입·직영·임대 차량 중 대장에 없는 차량">기사관리 차량 {appMissing.length}대 불러오기</Btn>}
            {canEdit && <Btn onClick={() => setImporting(true)}>엑셀 가져오기</Btn>}
            <Btn onClick={exportList} disabled={!shown.length}>엑셀 내보내기</Btn>
            {canEdit && <Btn kind="primary" onClick={() => setCreating({})}>+ 차량 등록</Btn>}
          </div>
        </div>
        {err && <div style={{ padding: 14, color: "#B42318", fontWeight: 800, fontSize: 14.5 }}>차량 정보를 불러오지 못했습니다({err}). 권한을 확인하세요.</div>}
        {!loaded ? <div style={{ padding: 40, textAlign: "center", color: C.mute, fontSize: 15 }}>불러오는 중…</div>
          : !rows.length ? (
            <div style={{ padding: "48px 20px", textAlign: "center", color: C.sub, fontSize: 15, lineHeight: 1.7 }}>
              아직 등록된 차량이 없습니다.<br />[엑셀 가져오기]로 차량 전체 현황 시트를 올리거나, [+ 차량 등록]{appMissing.length ? " 또는 [기사관리 차량 불러오기]" : ""}로 시작하세요.
            </div>
          ) : narrow ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {shown.map((r) => (
                <button key={r.id} type="button" onClick={() => pick(r.id)} style={{ textAlign: "left", border: "none", borderTop: `1px solid #EEF1F6`, background: "#fff", padding: "14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                    <span style={{ fontSize: 17, fontWeight: 900, color: C.navy }}>{r.차량번호}</span>
                    {r.용도 && <span style={{ padding: "2px 8px", borderRadius: 6, background: C.pale, color: C.blue, fontSize: 13, fontWeight: 800 }}>{r.용도}</span>}
                    {r.톤수 && <span style={{ fontSize: 13.5, color: C.sub, fontWeight: 700 }}>{r.톤수}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 13.5, color: C.sub, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{r.회사}</span>
                  </div>
                  <div style={{ fontSize: 14.5, color: r.현재기사 ? C.navy : C.mute, fontWeight: 700 }}>
                    {r.현재기사 ? <>{r.현재기사} <span style={{ color: C.blue, fontWeight: 600 }}>{r.기사연락처}</span>{r.기사변경일 && <span style={{ color: C.mute, fontWeight: 600 }}> · {r.기사변경일}~</span>}{r.fromApp && <span style={{ color: C.mute, fontWeight: 600 }}> · 기사관리</span>}</> : "기사 미배정"}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{EQUIP.map((e) => <EqDot key={e.key} on={hasEquip(r[e.key])} label={e.label} />)}</div>
                </button>
              ))}
              {!shown.length && <div style={{ padding: 30, textAlign: "center", color: C.mute, fontSize: 14.5 }}>조건에 맞는 차량이 없습니다</div>}
            </div>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "calc(100vh - 330px)", minHeight: 300 }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1500 }}>
                <thead><tr>{COLS.map(([k, l, w]) => (
                  <th key={k} onClick={() => sortBy(k)} style={{ ...th, minWidth: w, cursor: "pointer", userSelect: "none", ...(k === "차량번호" ? { left: 0, zIndex: 3 } : {}) }}>
                    {l}<span style={{ marginLeft: 4, fontSize: 12, color: sort.k === k ? "#fff" : "rgba(143,176,240,.55)" }}>{sort.k === k ? (sort.d > 0 ? "▲" : "▼") : "↕"}</span>
                  </th>
                ))}</tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="vl-row" onClick={() => pick(r.id)} style={{ cursor: "pointer" }}>
                      {COLS.map(([k]) => {
                        const val = r[k];
                        const eq = ["유류카드번호", "하이패스", "GPS", "덮개", "박스"].includes(k);
                        const base = { ...td, whiteSpace: "nowrap", textAlign: "center", borderTop: "none", borderBottom: "1px solid #EEF1F6" };
                        if (k === "차량번호") return <td key={k} style={{ ...base, position: "sticky", left: 0, background: "inherit", fontWeight: 900, textAlign: "left", zIndex: 1 }}>{val}</td>;
                        if (k === "현재기사") return <td key={k} style={{ ...base, fontWeight: 800 }}>{val || <span style={{ color: "#C0CADB" }}>-</span>}{r.fromApp && <span title="기사관리 등록 기사(탑승 이력 없음)" style={{ marginLeft: 4, fontSize: 12, color: C.mute }}>앱</span>}</td>;
                        if (k === "용도") return <td key={k} style={base}>{val ? <span style={{ padding: "2px 8px", borderRadius: 6, background: C.pale, color: C.blue, fontSize: 13.5, fontWeight: 800 }}>{val}</span> : <span style={{ color: "#C0CADB" }}>-</span>}</td>;
                        if (eq) {
                          const on = hasEquip(val);
                          const short = /^(o|○|있음|유|y|yes)$/i.test(String(val || "").trim());
                          return <td key={k} style={{ ...base, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={val || ""}>{on ? (short ? <span style={{ color: C.blue, fontWeight: 900 }}>●</span> : <span style={{ fontSize: 14 }}>{val}</span>) : <span style={{ color: "#C0CADB" }}>{val ? val : "-"}</span>}</td>;
                        }
                        return <td key={k} style={{ ...base, color: val ? C.navy : "#C0CADB", fontFamily: ["기사변경일", "차대번호"].includes(k) ? MONO : undefined, fontSize: ["차대번호"].includes(k) ? 13.5 : 14.5 }}>{val || "-"}</td>;
                      })}
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={COLS.length} style={{ ...td, textAlign: "center", color: C.mute, padding: 40 }}>조건에 맞는 차량이 없습니다</td></tr>}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {creating && (
        <Modal title="차량 등록" onClose={() => setCreating(null)} width={820} footer={<><Btn onClick={() => setCreating(null)}>취소</Btn><Btn kind="primary" onClick={() => createVehicle(creating)}>등록</Btn></>}>
          <BasicForm v={creating} set={setCreating} purposeOpts={purposeOpts} companyOpts={companyOpts} isNew />
          {drvByPlate.get(plateCore(creating.차량번호)) && <div style={{ marginTop: 12, fontSize: 14.5, color: C.blue, fontWeight: 800 }}>기사관리에 이 차량의 기사({drvByPlate.get(plateCore(creating.차량번호)).이름})가 있어 현재 기사로 함께 등록됩니다.</div>}
        </Modal>
      )}
      {importing && <ImportModal existing={list} onClose={() => setImporting(false)} onImport={importRows} />}
      <style>{`.vl-row{background:#fff}.vl-row:hover{background:#F2F6FD}`}</style>
      {toastEl}
    </div>
  );
}

// 엑셀 날짜 정규화는 가져오기에서 씀(외부 재사용용)
export { normDate };
