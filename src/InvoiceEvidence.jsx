// ======================= src/InvoiceEvidence.jsx =======================
// 🧾 2026-11-11 정산 창 › 증빙서류 — 계산서 이미지를 올리면(눌러서 · 끌어 놓기 · Ctrl+V 붙여넣기) 바로 자동 스캔
//  · 이미지 → 서버 글자 인식(orderScanOcr = 오더 스캔과 같은 Google Vision) → 안 되면 브라우저 인식(tesseract)
//  · 글 → src/invoiceScan.js 가 종류(전자세금계산서 · 계산서 · 거래명세서 · 이체확인증 …) · 작성일자 · 공급가액/세액/합계 · 공급자/공급받는자 · 입금자명을 뽑는다
//  · 뽑은 값은 정산 창에 바로 반영(계산서 발행일 · 입금자명) + 운임과 금액이 맞는지 표시 + 오더에 계산서스캔으로 저장
//  · 파일은 오더 첨부(attachments)에 kind: "invoice" 로 저장 → 배차현황 첨부 · 정산관리 › 입금 확인에서 같은 파일이 보인다
//  · 계산서 글(메일 본문 등)을 붙여넣어도 같은 방법으로 읽는다(파일은 남지 않는다)
import React from "react";
import { createPortal } from "react-dom";
import { collection, doc, setDoc, deleteDoc, updateDoc, increment, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { parseInvoiceText, checkAmount } from "./invoiceScan";

const NUM = { fontVariantNumeric: "tabular-nums" };
const won = (v) => (Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0).toLocaleString("ko-KR");
const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${Number(m[1])}/${Number(m[2])}` : ""; };

// ── 저장소(기본 = Firestore 오더 첨부). 미리보기 · 점검에서는 api를 바꿔 끼운다 ──
const colOf = (row) => row?.__col || "orders";
export const firestoreEvidenceApi = {
  subscribe(row, cb) {
    const id = row?._id || row?.id; if (!id) { cb([]); return () => {}; }
    return onSnapshot(query(collection(db, colOf(row), id, "attachments"), where("kind", "==", "invoice")),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))), () => cb([]));
  },
  async upload(row, payload) {
    const id = row._id || row.id; const col = colOf(row);
    const ref = doc(collection(db, col, id, "attachments"));
    await setDoc(ref, { ...payload, kind: "invoice", uploadedBy: "dispatch", createdAt: serverTimestamp() });
    await updateDoc(doc(db, col, id), { attachCount: increment(1), officeAttach: increment(1) });
    return ref.id;
  },
  async update(row, attId, patch) { await updateDoc(doc(db, colOf(row), row._id || row.id, "attachments", attId), patch); },
  async remove(row, attId) {
    const id = row._id || row.id; const col = colOf(row);
    await deleteDoc(doc(db, col, id, "attachments", attId));
    await updateDoc(doc(db, col, id), { attachCount: increment(-1), officeAttach: increment(-1) });
  },
};

// ── 이미지 준비 ──
const readFile = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || "")); fr.onerror = rej; fr.readAsDataURL(file); });
function shrink(dataUrl, max, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve({ url: dataUrl, w: 0, h: 0 });
    img.onload = () => {
      try {
        const r = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        resolve({ url: c.toDataURL("image/jpeg", quality), w: c.width, h: c.height, canvas: c });
      } catch { resolve({ url: dataUrl, w: 0, h: 0 }); }
    };
    img.src = dataUrl;
  });
}
// 글자 읽기 — 서버(Vision) → 브라우저(tesseract)
async function readText(dataUrl, onStatus) {
  const big = await shrink(dataUrl, 2000, 0.9);
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    try {
      onStatus?.("정밀 인식으로 글자를 읽고 있어요");
      const { mainScanAi } = await import("./orderScanApi");
      const r = await mainScanAi.ocr(big.url);
      const text = (r?.lines || []).map((l) => l.text).join("\n") || String(r?.text || "");
      if (text.trim()) return { text, engine: "vision" };
    } catch (e) { console.warn("[증빙 스캔] 서버 인식 실패 → 브라우저 인식:", e?.message || e); }
  }
  onStatus?.("브라우저에서 글자를 읽고 있어요(처음 한 번은 조금 걸려요)");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("kor+eng", 1, { errorHandler: () => {} });
  try {
    const { data } = await worker.recognize(big.canvas || big.url);
    return { text: String(data?.text || ""), engine: "tesseract" };
  } finally { worker.terminate().catch(() => {}); }
}

const KIND_TONE = { 이체확인증: "#0E7A4F", 거래명세서: "#7A4B00", 인수증: "#5B6B85" };

// 스캔 결과 카드
export function ScanCard({ scan, expect, compact = false }) {
  if (!scan) return null;
  const chk = checkAmount(scan, expect);
  const tone = chk.level === "ok" || chk.level === "vat" ? { bg: "#ECFDF3", fg: "#067647", bd: "#ABEFC6", ic: "✓" } : chk.level === "warn" ? { bg: "#FFFAEB", fg: "#B54708", bd: "#FEDF89", ic: "!" } : { bg: "#F7F9FC", fg: "#7A8AA8", bd: "#E3E8F0", ic: "–" };
  return (
    <div className="rounded-xl border border-[#E3E8F0] bg-white overflow-hidden" data-scan-card>
      <div className="flex items-center gap-2 px-3 py-2 bg-[#F7F9FC] border-b border-[#EEF2F8]">
        <span className="h-6 px-2 rounded-md text-[11.5px] font-black text-white inline-flex items-center" style={{ background: KIND_TONE[scan.kind] || "#1B2B4B" }}>{scan.kind}</span>
        {scan.date && <span className="text-[12.5px] font-black text-[#0F1A30]" style={NUM}>작성일자 {scan.date}</span>}
        <span className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-black border" style={{ background: tone.bg, color: tone.fg, borderColor: tone.bd }} data-amount-check={chk.level}>
          <span>{tone.ic}</span>{chk.level === "ok" || chk.level === "vat" ? "금액 일치" : chk.level === "warn" ? "금액 다름" : "금액 확인 필요"}
        </span>
      </div>
      <div className={`grid grid-cols-3 gap-2 px-3 ${compact ? "py-2" : "py-2.5"} text-center`} style={NUM}>
        {[["공급가액", scan.supply], [scan.taxFree ? "세액(면세)" : "세액", scan.vat], ["합계", scan.total]].map(([l, v], i) => (
          <div key={l}><div className="text-[10.5px] font-bold text-[#7A8AA8]">{l}</div><div className={`${i === 2 ? "text-[14.5px] font-black text-[#0F1A30]" : "text-[13px] font-bold text-[#3A4A66]"}`}>{v ? won(v) : "-"}</div></div>
        ))}
      </div>
      <div className="px-3 pb-2.5 space-y-1">
        {(scan.supplier || scan.buyer) && (
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#3A4A66] min-w-0">
            <span className="text-[10.5px] font-black text-[#9AA9C3] shrink-0">공급자</span><span className="truncate">{scan.supplier || "-"}</span>
            <span className="text-[#C2CBDB] shrink-0">→</span>
            <span className="text-[10.5px] font-black text-[#9AA9C3] shrink-0">받는자</span><span className="truncate">{scan.buyer || "-"}</span>
          </div>
        )}
        <div className="text-[11.5px] font-semibold" style={{ color: tone.fg }}>{chk.text}</div>
      </div>
    </div>
  );
}

// 큰 그림 보기
export function EvidenceLightbox({ items, start = 0, onClose, expect }) {
  const [i, setI] = React.useState(start);
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } else if (e.key === "ArrowRight") setI((v) => Math.min(items.length - 1, v + 1)); else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1)); };
    window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true);
  }, [items.length, onClose]);
  const it = items[i]; if (!it) return null;
  const src = it.base64 || it.url;
  const isPdf = /pdf/i.test(it.type || "") || /^data:application\/pdf/.test(String(src || ""));
  return createPortal(
    <div className="fixed inset-0 z-[100001] bg-[#060D1C]/85 flex items-center justify-center p-4" data-evidence-lightbox>
      <div className="w-full max-w-[980px] max-h-[92vh] bg-white rounded-2xl overflow-hidden flex flex-col md:flex-row shadow-2xl">
        <div className="flex-1 min-h-[300px] bg-[#0F1A30] flex items-center justify-center relative">
          {isPdf ? <a href={src} download={it.name || "증빙.pdf"} className="text-white font-black underline">PDF 내려받기 · {it.name}</a>
            : <img src={src} alt={it.name || "증빙"} className="max-w-full max-h-[86vh] object-contain" />}
          {items.length > 1 && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/80 text-[12px] font-black bg-black/40 rounded-full px-3 py-1" style={NUM}>{i + 1} / {items.length}</div>}
        </div>
        <div className="w-full md:w-[320px] shrink-0 p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><div className="text-[10px] font-extrabold tracking-[0.24em] text-[#4B6CB7]">EVIDENCE · 증빙서류</div><div className="text-[14px] font-black text-[#0F1A30] truncate">{it.name || "증빙"}</div></div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-[#F1F4F9] text-[#3A4A66] font-black">✕</button>
          </div>
          {it.scan ? <ScanCard scan={it.scan} expect={expect} /> : <div className="text-[12.5px] font-semibold text-[#9AA9C3]">스캔 결과가 없는 파일입니다.</div>}
          <div className="flex gap-2">
            <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="flex-1 h-9 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black disabled:opacity-40">← 이전</button>
            <button type="button" disabled={i >= items.length - 1} onClick={() => setI(i + 1)} className="flex-1 h-9 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black disabled:opacity-40">다음 →</button>
          </div>
          {!isPdf && <a href={src} download={it.name || "증빙.jpg"} className="block text-center h-9 leading-9 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black">이미지 저장</a>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 오더의 증빙서류만 구독 — 입금 확인 표의 [증빙] 칸에서 눌렀을 때
export function EvidenceViewer({ row, onClose, api = firestoreEvidenceApi, expect }) {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => api.subscribe(row, setItems), [row, api]);
  if (items === null) return null;
  if (!items.length) { setTimeout(() => { window.alert("올린 증빙서류가 없습니다."); onClose?.(); }, 0); return null; }
  return <EvidenceLightbox items={items} onClose={onClose} expect={expect} />;
}

// ── 정산 창의 증빙서류 칸 ──
//  onScanned(scan) — 읽은 값을 정산 창에 반영(부모가 저장까지)
export function EvidenceBox({ row, canEdit = true, expect, onScanned, api = firestoreEvidenceApi, known = [], self = "", selfIs = "" }) {
  const [items, setItems] = React.useState([]);
  const [job, setJob] = React.useState(null); // { url, status, step(0..3), name }
  const [last, setLast] = React.useState(null);
  const [drag, setDrag] = React.useState(false);
  const [view, setView] = React.useState(-1);
  const [err, setErr] = React.useState("");
  const inputRef = React.useRef(null);
  React.useEffect(() => api.subscribe(row, setItems), [row?._id, row?.id, api]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (scan) => { setLast(scan); onScanned?.(scan); };
  const scanText = (text) => {
    const scan = parseInvoiceText(text, { known, self, selfIs });
    if (!scan.filled.length) { setErr("계산서 내용을 찾지 못했어요. 계산서 화면을 캡처해 붙여넣어 보세요."); return; }
    apply({ ...scan, src: "text" });
  };
  const handleFiles = async (files) => {
    if (!canEdit) return;
    setErr("");
    for (const file of files) {
      const isImg = String(file.type || "").startsWith("image/");
      const isPdf = /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "");
      if (!isImg && !isPdf) { setErr(`${file.name || "파일"}: 이미지 또는 PDF만 올릴 수 있어요.`); continue; }
      try {
        const raw = await readFile(file);
        if (isPdf) {
          if (raw.length > 1_000_000) { setErr("PDF가 너무 커요(약 700KB 이하). 계산서 화면을 캡처해 붙여넣으면 자동으로 읽어요."); continue; }
          setJob({ url: "", status: "PDF를 올리고 있어요", step: 0, name: file.name });
          await api.upload(row, { base64: raw, name: file.name, type: "application/pdf", size: file.size, sizeKB: Math.round(raw.length * 0.75 / 1024) });
          setErr("PDF는 보관만 했어요. 자동으로 읽으려면 계산서 화면을 캡처해 붙여넣어(Ctrl+V) 주세요.");
          continue;
        }
        const keep = await shrink(raw, 1600, 0.82);
        setJob({ url: keep.url, status: "이미지를 올리고 있어요", step: 0, name: file.name });
        const attId = await api.upload(row, { base64: keep.url, name: file.name || "계산서.jpg", type: "image/jpeg", size: file.size, sizeKB: Math.round(keep.url.length * 0.75 / 1024) });
        setJob((j) => ({ ...j, step: 1, status: "글자를 읽고 있어요" }));
        const { text, engine } = await readText(raw, (s) => setJob((j) => (j ? { ...j, status: s } : j)));
        setJob((j) => ({ ...j, step: 2, status: "계산서 항목을 정리하고 있어요" }));
        const scan = { ...parseInvoiceText(text, { known, self, selfIs }), engine, src: "image" };
        setJob((j) => ({ ...j, step: 3, status: "운임과 금액을 맞춰 보고 있어요" }));
        await new Promise((r) => setTimeout(r, 450));
        const save = { kind: scan.kind, date: scan.date, supply: scan.supply, vat: scan.vat, total: scan.total, supplier: scan.supplier, buyer: scan.buyer, payer: scan.payer, approval: scan.approval, taxFree: scan.taxFree, engine };
        if (attId) api.update(row, attId, { scan: save }).catch(() => {});
        if (!scan.filled.length) setErr("글자를 읽었지만 계산서 항목을 찾지 못했어요. 더 선명한 이미지로 다시 올려 주세요.");
        else apply({ ...scan, attId });
      } catch (e) { setErr(`올리지 못했어요: ${e?.message || e}`); }
      finally { setJob(null); }
    }
  };
  // Ctrl+V — 이미지면 올려서 스캔, 계산서 글이면 바로 읽기(입력 칸에 붙여넣을 때는 건드리지 않는다)
  React.useEffect(() => {
    if (!canEdit) return undefined;
    const h = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); handleFiles(files); return; }
      const txt = e.clipboardData?.getData("text") || "";
      if (/계산서|공급가액|합계금액|이체|명세서/.test(txt)) { e.preventDefault(); scanText(txt); }
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  });

  const steps = ["업로드", "글자 인식", "항목 정리", "금액 대조"];
  return (
    <div className="pt-3" data-evidence-box>
      <style>{`@keyframes kpScanLine { 0% { top: 0% } 50% { top: calc(100% - 3px) } 100% { top: 0% } } @keyframes kpPop { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[12.5px] font-black text-[#0F1A30]">증빙서류</div>
        <span className="text-[10px] font-extrabold tracking-[0.16em] text-white bg-gradient-to-r from-[#1B2B4B] to-[#2D4C82] rounded px-1.5 py-0.5">AUTO SCAN</span>
        <span className="text-[11.5px] font-semibold text-[#9AA9C3] truncate">세금계산서 · 계산서 · 거래명세서 · 이체확인증</span>
        {items.length > 0 && <span className="ml-auto text-[11.5px] font-black text-[#2D4C82] shrink-0" style={NUM}>{items.length}장</span>}
      </div>

      {/* 올린 증빙 */}
      {items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {items.map((it, k) => {
            const pdf = /pdf/i.test(it.type || "");
            const ok = it.scan ? checkAmount(it.scan, expect) : null;
            return (
              <div key={it.id} className="relative shrink-0 group" style={{ animation: "kpPop .3s ease both" }}>
                <button type="button" onClick={() => setView(k)} className="block w-[92px] h-[70px] rounded-lg overflow-hidden border border-[#DCE3EE] bg-[#F7F9FC]" title={it.name}>
                  {pdf ? <span className="w-full h-full grid place-items-center text-[12px] font-black text-[#9A1F15]">PDF</span> : <img src={it.base64 || it.url} alt="" className="w-full h-full object-cover" />}
                </button>
                <span className="absolute left-1 bottom-1 text-[9.5px] font-black text-white bg-[#0F1A30]/80 rounded px-1">{(it.scan?.kind || (pdf ? "PDF" : "증빙")).replace(/^전자/, "")}</span>
                {ok && <span className={`absolute right-1 bottom-1 w-4 h-4 rounded-full text-[10px] font-black grid place-items-center text-white ${ok.ok ? "bg-emerald-500" : "bg-amber-500"}`}>{ok.ok ? "✓" : "!"}</span>}
                {canEdit && <button type="button" onClick={async () => { if (window.confirm("이 증빙서류를 지울까요?")) api.remove(row, it.id).catch((e) => window.alert(e?.message || e)); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-[#DCE3EE] text-[11px] font-black text-[#9A1F15] hidden group-hover:grid place-items-center" aria-label="지우기">×</button>}
              </div>
            );
          })}
        </div>
      )}

      {/* 스캔 중 */}
      {job ? (
        <div className="rounded-xl border border-[#C9D6EC] bg-[#F5F8FD] p-3 flex gap-3 items-center" data-scanning>
          <div className="relative w-[88px] h-[110px] rounded-lg overflow-hidden bg-[#0F1A30] shrink-0">
            {job.url ? <img src={job.url} alt="" className="w-full h-full object-cover opacity-90" /> : <span className="absolute inset-0 grid place-items-center text-white font-black">PDF</span>}
            <span className="absolute left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg,transparent,#8FB0F0,#fff,#8FB0F0,transparent)", boxShadow: "0 0 14px 3px rgba(143,176,240,.85)", animation: "kpScanLine 1.6s ease-in-out infinite" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-black text-[#0F1A30]">계산서를 스캔하고 있어요</div>
            <div className="text-[11.5px] font-semibold text-[#5B6B85] mt-0.5 truncate">{job.status}</div>
            <div className="mt-2.5 grid grid-cols-4 gap-1">
              {steps.map((s, i) => (
                <div key={s}>
                  <div className={`h-1.5 rounded-full ${i < job.step ? "bg-[#1B2B4B]" : i === job.step ? "bg-[#8FB0F0] animate-pulse" : "bg-[#DCE3EE]"}`} />
                  <div className={`mt-1 text-[10px] font-black ${i <= job.step ? "text-[#1B2B4B]" : "text-[#B4BFD0]"}`}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : canEdit && (
        <div role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles([...(e.dataTransfer?.files || [])]); }}
          data-evidence-drop
          className={`rounded-xl border-2 border-dashed px-4 py-4 flex items-center gap-3 cursor-pointer transition ${drag ? "border-[#2D4C82] bg-[#EEF3FB]" : "border-[#C9D6EC] bg-[#FAFBFD] hover:bg-[#F5F8FD]"}`}>
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0F1A30] to-[#2D4C82] grid place-items-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-black text-[#0F1A30]">{drag ? "여기에 놓으면 바로 스캔해요" : "계산서를 올리면 자동으로 읽어요"}</div>
            <div className="text-[11.5px] font-semibold text-[#7A8AA8] mt-0.5">눌러서 선택 · 끌어다 놓기 · <b className="text-[#1B2B4B]">Ctrl+V</b> 붙여넣기 → 발행일 · 금액 · 입금자명 자동 입력</div>
          </div>
          <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={(e) => { handleFiles([...(e.target.files || [])]); e.target.value = ""; }} />
        </div>
      )}
      {err && <div className="mt-2 text-[12px] font-semibold text-[#B54708] bg-[#FFFAEB] border border-[#FEDF89] rounded-lg px-3 py-2">{err}</div>}
      {last && !job && (
        <div className="mt-2" style={{ animation: "kpPop .35s ease both" }}>
          <div className="text-[11px] font-black text-[#2D4C82] mb-1">방금 읽은 내용 — 위 칸에 자동으로 넣었어요</div>
          <ScanCard scan={last} expect={expect} />
        </div>
      )}
      {view >= 0 && <EvidenceLightbox items={items} start={view} onClose={() => setView(-1)} expect={expect} />}
    </div>
  );
}
