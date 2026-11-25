// ======================= src/StmtCompare.jsx =======================
// ⭐ 2026-11-17 업체 명세서 비교 — 거래처가 먼저 보낸 거래명세서를 올리면 우리 오더와 한 줄씩 맞춰 본다
//  · 여는 곳: 배차현황 › 월 마감(고른 거래처) · 정산관리 › 거래처정산(명세서 편집 머리) — [업체 명세서 비교]
//  · 올리기: 엑셀(xlsx · xls) · CSV가 기본. 캡처 · 사진은 오더 스캔과 같은 글자 인식(서버 → 안 되면 브라우저). 표를 복사해 Ctrl+V 해도 된다
//  · ① 읽은 내용 — 오더 스캔처럼 읽은 줄을 보여 주고 칸마다 바로 고친다. 제목 칸을 못 찾으면 [칸 맞추기]에서 직접 고른다
//  · ② 검증 결과 — 일치 · 불일치 · 우리만 있음 · 업체만 있음 · 총합(우리 vs 업체 · 차이). 다른 칸은 빨간 테두리 + 이유
//  · 우리 오더 줄 [수정] → 오더 복사/수정 패널(배차관리와 같은 패널). 저장하면 오더가 바뀌어 바로 다시 비교된다
//  계산은 src/stmtCompareCore.js(순수 함수 · scripts/stmtCompare.test.mjs)
import React from "react";
import { createPortal } from "react-dom";
import { FIELDS, detectHeader, headerMapOf, rowsFromTable, textToTable, parseLooseLines, compareStatement, ocrTable, fmtWon, parseAmount, parseDate } from "./stmtCompareCore";

const NUM = { fontVariantNumeric: "tabular-nums" };
const C = { ink: "#0F1A30", navy: "#1B2B4B", sub: "#5B6B85", mute: "#9AA9C3", line: "#E3E8F0", hair: "#EEF2F8", soft: "#F4F6FA", ok: "#0F7A52", warn: "#B25F00", bad: "#C62F25", blue: "#2D4C82" };
const btn = "h-10 px-3.5 rounded-xl border border-[#D5DDEA] bg-white text-[14px] font-bold text-[#1B2B4B] hover:bg-[#F4F6FA] transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
const btnPri = "h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black hover:bg-[#1B2B4B] transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
const cellInp = "h-8 w-full rounded-md border border-[#E1E6EF] bg-white px-2 text-[13px] font-semibold text-[#0F1A30] outline-none focus:border-[#1B2B4B]";
const colName = (i) => { let s = ""; let x = i + 1; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const EDIT_KEYS = ["date", "plate", "name", "route", "amount"];
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));
// 이 창보다 위에 뜬 창(오더 복사/수정 패널 z-[99999] · 월 마감 폰 고치기 창 z-[100050] · 오더 팝업 등)이 있으면 Esc · 붙여넣기는 그 창 몫
const panelOpen = () => typeof document !== "undefined" && !!document.querySelector('.fixed.inset-0[class*="z-[99999]"], .fixed.inset-0[class*="z-[1000"]');
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");

// 글자 인식 — 오더 스캔과 같은 순서(서버 Google Vision → 안 되면 브라우저 tesseract)
async function readImage(dataUrl, onStatus) {
  const { prepImage, toUploadJpeg } = await import("./OrderScanModal");
  const prep = await prepImage(dataUrl);
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
    const { mainScanAi } = await import("./orderScanApi");
    onStatus("글자를 읽고 있어요");
    const up = toUploadJpeg(prep.canvas);
    const r = await mainScanAi.ocr(up.b64);
    const lines = (r?.lines || []).filter((l) => l?.text && l.bbox);
    if (lines.length) return { lines, text: lines.map((l) => l.text).join("\n") };
    if (r?.text) return { lines: [], text: String(r.text) };
  } catch (e) { console.warn("[업체 명세서 비교] 서버 글자 인식 실패, 브라우저 인식으로 읽어요:", e?.message || e); }
  onStatus("한글 인식 모델을 준비하고 있어요(처음 한 번은 조금 걸려요)");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("kor+eng", 1, { logger: (m) => { if (m.status === "recognizing text") onStatus(`글자를 읽고 있어요 ${Math.round((m.progress || 0) * 100)}%`); }, errorHandler: () => {} });
  await worker.setParameters({ preserve_interword_spaces: "1" }).catch(() => {});
  const { data } = await worker.recognize(prep.canvas, {}, { text: true, blocks: true });
  worker.terminate().catch(() => {});
  const lines = [];
  (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => { const t = String(l.text || "").replace(/\n/g, " ").trim(); if (t) lines.push({ text: t, bbox: l.bbox }); })));
  return { lines, text: lines.length ? lines.map((l) => l.text).join("\n") : String(data.text || "") };
}
const fileToDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
// CSV · 글 — UTF-8이 아니면 한글 엑셀이 저장한 EUC-KR로 읽는다
const decodeText = (buf) => { try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { try { return new TextDecoder("euc-kr").decode(buf); } catch { return new TextDecoder().decode(buf); } } };

function Cell({ st, children, className = "" }) {
  const sty = st === "bad" ? { outline: `2px solid ${C.bad}`, outlineOffset: -2, background: "#FFF5F4" } : st === "warn" ? { outline: "2px solid #E3A008", outlineOffset: -2, background: "#FFFBEB" } : undefined;
  return <td className={`px-2 py-2 text-[13px] text-center whitespace-nowrap ${className}`} style={sty}>{children}</td>;
}

export default function StmtCompareModal({ client = "", ym = "", orders = [], onClose, onEdit, canEdit = true, where = "" }) {
  const [src, setSrc] = React.useState(null); // { name, kind: "table" | "loose", sheets: [{ name, rows }], text }
  const [sheetIdx, setSheetIdx] = React.useState(0);
  const [hdr, setHdr] = React.useState({ headerRow: -1, map: {} });
  const [theirs, setTheirs] = React.useState([]);
  const [stated, setStated] = React.useState(null);
  const [step, setStep] = React.useState("upload"); // upload | read | result
  const [busy, setBusy] = React.useState("");
  const [err, setErr] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [drag, setDrag] = React.useState(false);
  const fileRef = React.useRef(null);

  React.useEffect(() => { const k = (e) => { if (e.key === "Escape" && !panelOpen()) onClose?.(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const rows2d = src?.kind === "table" ? src.sheets[sheetIdx]?.rows || [] : [];
  // 표 + 칸 지정 → 업체 줄. 칸을 바꾸면 다시 읽는다(고친 칸은 처음부터)
  const applyTable = React.useCallback((rows, h) => { const r = rowsFromTable(rows, { ...h, ym }); setTheirs(r.rows); setStated(r.statedTotal); }, [ym]);
  const loadTable = React.useCallback((name, sheets, how = "") => {
    // 시트가 여러 장이면 차량번호 · 금액 칸을 가장 잘 찾은 장부터
    let bi = 0, bs = -1;
    sheets.forEach((s, i) => { const h = detectHeader(s.rows); const r = rowsFromTable(s.rows, { ...h, ym }).rows.length; const sc = (h.map.plate != null ? 2 : 0) + (h.map.amount != null ? 2 : 0) + (h.headerRow >= 0 ? 1 : 0) + Math.min(1, r); if (sc > bs) { bs = sc; bi = i; } });
    const h = detectHeader(sheets[bi].rows);
    setSrc({ name, kind: "table", sheets, how }); setSheetIdx(bi); setHdr(h); applyTable(sheets[bi].rows, h);
    const okMap = h.map.amount != null && (h.map.plate != null || h.map.name != null);
    setStep(okMap && h.headerRow >= 0 ? "result" : "read");
  }, [applyTable, ym]);
  const loadText = React.useCallback((name, text, how = "") => {
    const t = textToTable(text);
    if (t && detectHeader(t).headerRow >= 0) { loadTable(name, [{ name: "붙여넣기", rows: t }], how); return; }
    const L = parseLooseLines(text, ym);
    setSrc({ name, kind: "loose", sheets: [], text, how }); setTheirs(L.rows); setStated(L.statedTotal); setHdr({ headerRow: -1, map: {} });
    setStep("read");
  }, [loadTable, ym]);
  const loadLines = React.useCallback((name, read) => {
    if (read.lines?.length) {
      const t = ocrTable(read.lines);
      if (t.length && detectHeader(t).headerRow >= 0) { loadTable(name, [{ name: "캡처", rows: t }], "image"); setStep("read"); return; }
    }
    loadText(name, read.text, "image");
  }, [loadTable, loadText]);

  const readFile = async (f) => {
    if (!f) return;
    setErr(""); setBusy("파일을 읽고 있어요");
    try {
      const nm = f.name || "파일";
      const ext = (nm.split(".").pop() || "").toLowerCase();
      if (ext === "pdf" || f.type === "application/pdf") throw new Error("PDF는 아직 바로 못 읽어요. 엑셀 파일을 받아 주시거나, PDF 화면을 캡처해서 그림으로 올려 주세요.");
      if (/^image\//.test(f.type) || ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(ext)) {
        const url = await fileToDataUrl(f);
        loadLines(nm, await readImage(url, setBusy));
        return;
      }
      const buf = await f.arrayBuffer();
      if (["csv", "txt", "tsv"].includes(ext)) {
        const text = decodeText(buf);
        if (ext !== "csv" || text.includes("\t")) { loadText(nm, text); return; }
        const XLSX = await import("xlsx");
        const wb = XLSX.read(text, { type: "string", raw: true });
        loadTable(nm, wb.SheetNames.map((s) => ({ name: s, rows: XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: "" }) })));
        return;
      }
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const sheets = wb.SheetNames.map((s) => ({ name: s, rows: XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: "" }) })).filter((s) => s.rows.length);
      if (!sheets.length) throw new Error("파일에 내용이 없어요");
      loadTable(nm, sheets);
    } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(""); }
  };
  // Ctrl+V — 엑셀에서 복사한 표(글) · 캡처 그림
  React.useEffect(() => {
    const h = async (e) => {
      if (busy || panelOpen()) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const items = [...(e.clipboardData?.items || [])];
      const img = items.find((it) => it.type.startsWith("image/"));
      if (img) { e.preventDefault(); const f = img.getAsFile(); if (f) readFile(new File([f], "붙여넣은 캡처.png", { type: f.type })); return; }
      const t = e.clipboardData?.getData("text/plain");
      if (t && t.trim()) { e.preventDefault(); setErr(""); loadText("붙여넣은 표", t); }
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const res = React.useMemo(() => (theirs.length || orders.length ? compareStatement(orders, theirs, { statedTotal: stated }) : null), [orders, theirs, stated]);
  const setMap = (field, col) => { const h = { ...hdr, map: { ...hdr.map } }; if (col === "") delete h.map[field]; else { Object.keys(h.map).forEach((k) => { if (h.map[k] === Number(col)) delete h.map[k]; }); h.map[field] = Number(col); } setHdr(h); applyTable(rows2d, h); };
  const setHeaderRow = (r) => { const m = r >= 0 ? headerMapOf(rows2d[r]) : {}; const h = { headerRow: r, map: Object.keys(m).length ? m : hdr.map }; setHdr(h); applyTable(rows2d, h); };
  const editTheir = (i, k, v) => setTheirs((l) => l.map((r) => (r.i !== i ? r : { ...r, [k]: k === "amount" ? parseAmount(v) : k === "date" ? (parseDate(v, ym) || v) : v })));
  const delTheir = (i) => setTheirs((l) => l.filter((r) => r.i !== i));
  const reset = () => { setSrc(null); setTheirs([]); setStated(null); setHdr({ headerRow: -1, map: {} }); setStep("upload"); setErr(""); setFilter("all"); };

  const header = rows2d[hdr.headerRow] || [];
  const width = Math.max(0, ...rows2d.slice(0, 60).map((r) => (r || []).length));
  const colOpts = Array.from({ length: width }, (_, i) => ({ v: i, l: `${colName(i)}열${header[i] ? ` · ${String(header[i]).slice(0, 10)}` : ""}` }));
  const mapOk = hdr.map.amount != null && (hdr.map.plate != null || hdr.map.name != null);

  const sum = res?.sum, tot = res?.totals;
  const shown = (res?.rows || []).filter((r) => filter === "all" || (filter === "bad" ? r.status === "bad" : filter === "warn" ? r.status === "warn" : r.status === filter));
  const cards = res ? [
    ["ok", "일치", sum.ok, C.ok, sum.warn ? `날짜 차이 ${sum.warn}건 포함` : ""], ["bad", "불일치", sum.bad, sum.bad ? C.bad : C.mute, "차량 · 기사 · 금액"],
    ["ours", "우리만 있음", sum.ours, sum.ours ? C.warn : C.mute, "업체 명세서에 없어요"], ["theirs", "업체만 있음", sum.theirs, sum.theirs ? C.warn : C.mute, "우리 오더에 없어요"],
  ] : [];
  const statusChip = (s) => { const m = { ok: ["일치", C.ok, "#E9F6F0"], warn: ["날짜 차이", C.warn, "#FFF6E5"], bad: ["불일치", C.bad, "#FFEFEE"], ours: ["우리만", C.blue, "#EEF3FB"], theirs: ["업체만", C.warn, "#FFF6E5"] }[s]; return <span className="inline-flex h-6 px-2 items-center rounded-md text-[12px] font-black whitespace-nowrap" style={{ color: m[1], background: m[2] }}>{m[0]}</span>; };
  const ymText = ym ? `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월` : "";

  const node = (
    <div className="fixed inset-0 z-[99990] flex items-center justify-center p-2 sm:p-5" style={{ background: "rgba(11,20,40,.5)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => { if (e.target === e.currentTarget) setDrag(false); }} onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0]); }}>
      <div className="w-full max-w-[1320px] h-[94vh] rounded-[22px] bg-white flex flex-col overflow-hidden" role="dialog" aria-label="업체 명세서 비교" data-kp="stmt-compare" style={{ color: C.ink }}>
        {/* 머리 */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[#E3E8F0] flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.22em]" style={{ color: C.blue }}>STATEMENT CHECK</div>
            <div className="text-[19px] font-black truncate">업체 명세서 비교 · {client || "거래처"}</div>
            <div className="text-[13px] mt-0.5" style={{ color: C.sub }} >{ymText}{where ? ` · ${where}` : ""} · 우리 오더 <b style={NUM}>{orders.length.toLocaleString()}</b>건{src ? <> · 올린 파일 <b>{src.name}</b> {theirs.length.toLocaleString()}줄</> : ""}</div>
          </div>
          {src && (
            <div className="inline-flex p-0.5 rounded-xl bg-[#F4F6FA]" role="tablist" aria-label="단계">
              {[["read", "① 읽은 내용"], ["result", "② 검증 결과"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={step === k} onClick={() => setStep(k)} className={`h-9 px-4 rounded-lg text-[13.5px] font-black ${step === k ? "bg-white text-[#0F1A30] shadow-sm" : "text-[#5B6B85]"}`}>{l}</button>)}
            </div>)}
          {src && <button type="button" onClick={reset} className={btn}>다른 파일</button>}
          <button type="button" aria-label="닫기" onClick={onClose} className="w-10 h-10 rounded-xl border border-[#DCE3EE] text-[18px]">×</button>
        </div>
        {err && <div className="px-6 py-2.5 text-[13.5px] font-bold border-b border-[#F3D6D3] bg-[#FFF5F4]" style={{ color: C.bad }}>{err}</div>}

        <div className="flex-1 min-h-0 overflow-auto">
          {/* 올리기 */}
          {step === "upload" && (
            <div className="p-6 sm:p-10 flex flex-col items-center">
              <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className={`w-full max-w-[680px] rounded-3xl border-2 border-dashed px-6 py-14 text-center transition ${drag ? "border-[#2D4C82] bg-[#EEF3FB]" : "border-[#C9D3E3] hover:border-[#8FA3C4] bg-[#FAFBFD]"}`}>
                <div className="mx-auto w-14 h-14 rounded-2xl bg-[#0F1A30] text-white flex items-center justify-center">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
                </div>
                <div className="mt-4 text-[18px] font-black">{busy || "업체가 보낸 명세서를 올려 주세요"}</div>
                <div className="mt-1.5 text-[14px]" style={{ color: C.sub }}>{busy ? "잠깐만 기다려 주세요" : "눌러서 고르거나, 파일을 여기로 끌어다 놓으면 돼요"}</div>
                <div className="mt-4 flex justify-center gap-1.5 flex-wrap text-[12.5px] font-bold">
                  {["엑셀 xlsx · xls", "CSV", "캡처 · 사진", "Ctrl+V 붙여넣기"].map((t) => <span key={t} className="px-2.5 py-1 rounded-lg bg-white border border-[#E1E6EF]" style={{ color: C.sub }}>{t}</span>)}
                </div>
              </button>
              <input ref={fileRef} id="stmt-cmp-file" type="file" className="hidden" accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt,image/*,.pdf" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="mt-6 w-full max-w-[680px] grid sm:grid-cols-3 gap-2 text-[13px]" style={{ color: C.sub }}>
                {[["차량번호 · 기사 · 금액", "다르면 불일치(빨강)로 세요"], ["날짜", "하루 이틀 차이는 노랑(주의)으로만 보여요"], ["구간", "회사마다 적는 법이 달라 참고로만 보여요"]].map(([a, b]) => (
                  <div key={a} className="rounded-xl border border-[#E3E8F0] px-3 py-2.5"><div className="font-black text-[#0F1A30]">{a}</div><div className="mt-0.5">{b}</div></div>))}
              </div>
            </div>)}

          {/* ① 읽은 내용 — 칸 맞추기 + 읽은 줄(바로 고치기) */}
          {step === "read" && src && (
            <div className="p-4 sm:p-5 space-y-3">
              {src.kind === "table" ? (
                <div className="rounded-2xl border border-[#E3E8F0] px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-[15px] font-black mr-auto">칸 맞추기 <span className="text-[12.5px] font-bold" style={{ color: mapOk ? C.ok : C.bad }}>{mapOk ? "자동으로 찾았어요. 다르면 골라 주세요" : "금액 · 차량번호(또는 기사) 칸을 골라 주세요"}</span></div>
                    {src.sheets.length > 1 && (
                      <label className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: C.sub }} htmlFor="stmt-cmp-sheet">시트
                        <select id="stmt-cmp-sheet" value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); const h = detectHeader(src.sheets[i].rows); setSheetIdx(i); setHdr(h); applyTable(src.sheets[i].rows, h); }} className="h-9 rounded-lg border border-[#D5DDEA] px-2 text-[13px] font-bold">
                          {src.sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                        </select></label>)}
                    <label className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: C.sub }} htmlFor="stmt-cmp-hrow">제목 줄
                      <select id="stmt-cmp-hrow" value={hdr.headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))} className="h-9 rounded-lg border border-[#D5DDEA] px-2 text-[13px] font-bold max-w-[240px]">
                        <option value={-1}>없음(처음부터 내용)</option>
                        {rows2d.slice(0, 25).map((r, i) => <option key={i} value={i}>{i + 1}번째 줄 · {(r || []).filter((v) => v !== "").slice(0, 4).join(" · ").slice(0, 26)}</option>)}
                      </select></label>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {FIELDS.map((f) => (
                      <label key={f.key} className="block" htmlFor={`stmt-cmp-map-${f.key}`}>
                        <span className="block text-[12px] font-extrabold mb-0.5" style={{ color: ["plate", "name", "amount"].includes(f.key) ? C.ink : C.sub }}>{f.label}{["plate", "amount"].includes(f.key) ? " *" : ""}</span>
                        <select id={`stmt-cmp-map-${f.key}`} value={hdr.map[f.key] ?? ""} onChange={(e) => setMap(f.key, e.target.value)} className="h-9 w-full rounded-lg border px-2 text-[13px] font-bold" style={{ borderColor: hdr.map[f.key] != null ? "#8FA3C4" : "#D5DDEA" }}>
                          <option value="">(없음)</option>
                          {colOpts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </label>))}
                  </div>
                  {src.how === "image" && <div className="mt-2 text-[12.5px] font-bold" style={{ color: C.warn }}>캡처는 글자를 읽은 거라 틀릴 수 있어요. 아래에서 한 번 훑어보고 고쳐 주세요.</div>}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E3E8F0] px-4 py-3 text-[13.5px]" style={{ color: C.sub }}>
                  <b className="text-[#0F1A30]">줄 글로 읽었어요</b> · 줄마다 차량번호 · 날짜 · 금액 · 기사를 찾았어요{src.how === "image" ? "(캡처 글자 인식)" : ""}. 틀린 칸은 아래에서 바로 고치면 돼요.
                </div>)}

              <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#E3E8F0] flex items-center gap-2 flex-wrap bg-[#F8FAFD]">
                  <div className="text-[14.5px] font-black mr-auto">읽은 줄 <span className="text-[12.5px] font-bold" style={{ color: C.mute }}>{theirs.length.toLocaleString()}줄 · 합계 {fmtWon(theirs.reduce((a, r) => a + r.amount, 0))}원{stated ? ` · 명세서 합계 줄 ${fmtWon(stated)}원` : ""}</span></div>
                  <button type="button" disabled={!theirs.length} onClick={() => setStep("result")} className={btnPri}>비교하기</button>
                </div>
                {!theirs.length ? <div className="py-12 text-center text-[14px] font-bold" style={{ color: C.mute }}>읽은 줄이 없어요. 위에서 칸을 맞춰 주세요</div> : (
                  <table className="w-full" style={{ ...NUM, minWidth: 820 }}>
                    <thead><tr className="text-[12.5px]" style={{ color: C.sub }}>
                      <th className="px-2 py-2 font-black w-12">줄</th>{EDIT_KEYS.map((k) => <th key={k} className="px-2 py-2 font-black">{LABEL[k]}</th>)}<th className="w-10" />
                    </tr></thead>
                    <tbody>
                      {theirs.map((r) => (
                        <tr key={r.i} className="border-t border-[#EEF2F8]">
                          <td className="px-2 py-1 text-center text-[12px]" style={{ color: C.mute }}>{r.src || r.i + 1}</td>
                          {EDIT_KEYS.map((k) => (
                            <td key={k} className="px-1.5 py-1">
                              <input aria-label={`${r.src || r.i + 1}줄 ${LABEL[k]}`} defaultValue={k === "amount" ? (r.amount ? fmtWon(r.amount) : "") : r[k] || ""} key={`${r.i}-${k}-${r[k]}`}
                                onBlur={(e) => { if (e.target.value !== (k === "amount" ? (r.amount ? fmtWon(r.amount) : "") : r[k] || "")) editTheir(r.i, k, e.target.value); }}
                                className={`${cellInp} ${k === "amount" ? "text-right" : "text-center"}`} style={(k === "plate" && !r.plate) || (k === "amount" && !r.amount) || (k === "date" && !r.date) ? { borderColor: "#E3A008", background: "#FFFBEB" } : undefined} />
                            </td>))}
                          <td className="px-1 text-center"><button type="button" aria-label="이 줄 빼기" title="이 줄 빼기" onClick={() => delTheir(r.i)} className="w-7 h-7 rounded-md text-[#A3AEC2] hover:text-[#C62F25]">×</button></td>
                        </tr>))}
                    </tbody>
                  </table>)}
              </div>
            </div>)}

          {/* ② 검증 결과 */}
          {step === "result" && res && (
            <div className="p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)] gap-2" data-kp="stmt-cmp-summary">
                {cards.map(([k, l, v, c, h]) => (
                  <button key={k} type="button" onClick={() => setFilter(filter === k ? "all" : k)} className={`rounded-2xl border px-4 py-3 text-left transition ${filter === k ? "border-[#1B2B4B] ring-2 ring-[#1B2B4B]/10" : "border-[#E3E8F0] hover:border-[#B8C4D8]"}`}>
                    <div className="text-[12.5px] font-bold" style={{ color: C.sub }}>{l}</div>
                    <div className="text-[24px] font-black leading-tight" style={{ ...NUM, color: c }}>{v.toLocaleString()}<span className="text-[13px] font-bold ml-0.5" style={{ color: C.mute }}>건</span></div>
                    {h && <div className="text-[11.5px] font-bold" style={{ color: C.mute }}>{h}</div>}
                  </button>))}
                <div className="col-span-2 lg:col-span-1 rounded-2xl border px-4 py-3" style={{ borderColor: tot.same ? "#BFE3D2" : "#F1C4BF", background: tot.same ? "#F3FBF7" : "#FFF7F6", ...NUM }}>
                  <div className="text-[12.5px] font-bold" style={{ color: C.sub }}>총 청구 합계{res.vat ? " (부가세 포함으로 맞춤)" : ""}</div>
                  <div className="mt-1 grid grid-cols-3 gap-2 items-end">
                    <div><div className="text-[11.5px] font-bold" style={{ color: C.mute }}>우리</div><div className="text-[16px] font-black whitespace-nowrap">{fmtWon(tot.ours)}</div></div>
                    <div><div className="text-[11.5px] font-bold" style={{ color: C.mute }}>업체</div><div className="text-[16px] font-black whitespace-nowrap">{fmtWon(tot.theirs)}</div></div>
                    <div><div className="text-[11.5px] font-bold" style={{ color: C.mute }}>차이</div><div className="text-[16px] font-black whitespace-nowrap" style={{ color: tot.same ? C.ok : C.bad }}>{tot.same ? "같아요" : `${tot.diff > 0 ? "+" : ""}${fmtWon(tot.diff)}`}</div></div>
                  </div>
                </div>
              </div>
              {(res.vat || tot.statedMismatch || res.allSame) && (
                <div className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold space-y-0.5" style={{ background: res.allSame ? "#F3FBF7" : "#FFF8EC", color: res.allSame ? C.ok : C.warn }}>
                  {res.allSame && <div>우리 오더와 업체 명세서가 모두 맞아요{sum.warn ? ` · 날짜만 다른 ${sum.warn}건은 한 번 봐 주세요` : ""}.</div>}
                  {res.vat && <div>업체 금액이 부가세 포함이라 우리 청구운임 × 1.1로 맞춰 봤어요(공급가 합계 {fmtWon(tot.ourSupply)}원).</div>}
                  {tot.statedMismatch && <div>업체 명세서의 합계 줄({fmtWon(tot.stated)}원)이 줄마다 더한 값({fmtWon(tot.theirRows)}원)과 달라요. 업체 쪽 합계를 확인해 주세요.</div>}
                </div>)}

              <div className="rounded-2xl border border-[#E3E8F0] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#E3E8F0] flex items-center gap-2 flex-wrap bg-[#F8FAFD]">
                  <div className="inline-flex p-0.5 rounded-lg bg-white border border-[#E3E8F0] mr-auto" role="tablist" aria-label="거르기">
                    {[["all", `전체 ${res.rows.length}`], ["bad", `불일치 ${sum.bad}`], ["warn", `날짜 차이 ${sum.warn}`], ["ours", `우리만 ${sum.ours}`], ["theirs", `업체만 ${sum.theirs}`]].map(([k, l]) => (
                      <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`h-8 px-3 rounded-md text-[12.5px] font-black ${filter === k ? "bg-[#0F1A30] text-white" : "text-[#5B6B85]"}`}>{l}</button>))}
                  </div>
                  <span className="text-[12.5px] font-bold" style={{ color: C.mute }}>빨간 테두리 = 다른 칸 · 노란 테두리 = 날짜 차이 · 구간은 참고만</span>
                </div>
                <div className="overflow-auto">
                  <table className="w-full" style={{ ...NUM, minWidth: 1180 }}>
                    <thead>
                      <tr className="text-[12px]" style={{ color: C.sub }}>
                        <th rowSpan={2} className="px-2 py-2 font-black bg-[#F8FAFD] sticky top-0 z-[1]">결과</th>
                        <th colSpan={5} className="px-2 pt-2 pb-1 font-black bg-[#EEF3FB] text-[#2D4C82] sticky top-0 z-[1]">우리 오더</th>
                        <th colSpan={5} className="px-2 pt-2 pb-1 font-black bg-[#FFF6E5] text-[#8A4B00] sticky top-0 z-[1]">업체 명세서</th>
                        <th rowSpan={2} className="px-2 py-2 font-black bg-[#F8FAFD] sticky top-0 z-[1] text-left">확인할 것</th>
                        <th rowSpan={2} className="px-2 py-2 bg-[#F8FAFD] sticky top-0 z-[1]" />
                      </tr>
                      <tr className="text-[12px]" style={{ color: C.sub }}>
                        {["날짜", "차량번호", "기사", "구간", "금액"].map((h) => <th key={`o${h}`} className="px-2 pb-2 font-black bg-[#EEF3FB] sticky top-[30px] z-[1]">{h}</th>)}
                        {["날짜", "차량번호", "기사", "구간", "금액"].map((h) => <th key={`t${h}`} className="px-2 pb-2 font-black bg-[#FFF6E5] sticky top-[30px] z-[1]">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r, i) => { const u = r.our, t = r.their, c = r.cells; return (
                        <tr key={`${u?.id || "x"}-${t?.i ?? "y"}-${i}`} className="border-t border-[#EEF2F8] align-middle">
                          <td className="px-2 py-2 text-center">{statusChip(r.status)}</td>
                          {u ? <>
                            <Cell st={c.date?.st}>{md(u.date)}</Cell>
                            <Cell st={c.plate?.st} className="font-bold">{u.plate || <span style={{ color: C.mute }}>-</span>}</Cell>
                            <Cell st={c.name?.st}>{u.name || <span style={{ color: C.mute }}>-</span>}</Cell>
                            <Cell st="" className="max-w-[180px] truncate !text-[12.5px] text-[#5B6B85]">{u.route || "-"}</Cell>
                            <Cell st={c.amount?.st} className="font-black !text-right">{fmtWon(u.amount)}</Cell>
                          </> : <td colSpan={5} className="px-2 py-2 text-center text-[12.5px] font-bold bg-[#FAFBFD]" style={{ color: C.mute }}>우리 오더에 없어요</td>}
                          {t ? <>
                            <Cell st={c.date?.st}>{md(t.date) || <span style={{ color: C.mute }}>-</span>}</Cell>
                            <Cell st={c.plate?.st} className="font-bold">{t.plate || <span style={{ color: C.mute }}>-</span>}</Cell>
                            <Cell st={c.name?.st}>{t.name || <span style={{ color: C.mute }}>-</span>}</Cell>
                            <Cell st="" className="max-w-[180px] truncate !text-[12.5px] text-[#5B6B85]">{t.route || "-"}</Cell>
                            <Cell st={c.amount?.st} className="font-black !text-right">{fmtWon(t.amount)}</Cell>
                          </> : <td colSpan={5} className="px-2 py-2 text-center text-[12.5px] font-bold bg-[#FAFBFD]" style={{ color: C.mute }}>업체 명세서에 없어요</td>}
                          <td className="px-2 py-2 text-[12.5px] font-bold min-w-[220px]">
                            {r.reasons.map((m, j) => <div key={j} style={{ color: /^(금액|차량번호|기사)/.test(m) ? C.bad : /^날짜/.test(m) ? C.warn : C.mute }}>{m}</div>)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {u && canEdit && onEdit && <button type="button" onClick={() => onEdit(u.order)} className="h-8 px-3 rounded-lg border border-[#D5DDEA] bg-white text-[12.5px] font-black text-[#1B2B4B] hover:border-[#1B2B4B]">수정</button>}
                          </td>
                        </tr>); })}
                      {!shown.length && <tr><td colSpan={13} className="py-12 text-center text-[14px] font-bold" style={{ color: C.mute }}>해당하는 줄이 없어요</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="text-[12.5px]" style={{ color: C.mute }}>[수정]을 누르면 오더 복사/수정 패널이 열려요. 저장하면 바로 다시 비교해요. 업체 쪽 값이 틀리게 읽혔으면 ① 읽은 내용에서 고치면 돼요.</div>
            </div>)}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
