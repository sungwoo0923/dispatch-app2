// ======================= src/ReceiptCenter.jsx =======================
// 🧾 2026-11-09 인수증관리 — 배차현황 › [인수증관리] 탭(운송팀 · 경리팀이 같이 쓰는 배차현황 안, 경리 부서 화면에도 그대로 보인다)
//  · 기사가 기사앱으로 올린 인수증·하차 사진 + 운송사가 오더를 골라 직접 올리는 인수증·전표를 한곳에서 본다
//  · 저장 위치는 기존 오더 첨부와 같다: {orders|dispatch}/{오더}/attachments/{첨부} { base64, name, type, size, uploadedBy, 종류, createdAt }
//    + 오더.attachCount(첨부 수) — 오더 표의 📎 첨부 칸·첨부 창과 같은 데이터(새 보안 규칙 없음)
//  · 미제출 = 배차가 끝났는데(배차완료·운송완료) 첨부가 0건인 오더
import React from "react";
import { collection, doc, getDocs, increment, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import CustomDatePicker from "./CustomDatePicker";

const pad = (n) => String(n).padStart(2, "0");
const kstToday = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const MONO = { fontFamily: "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif", fontVariantNumeric: "tabular-nums" };
const idOf = (r) => r?._id || r?.id;
const colOf = (r) => r?.__col || "orders";
const srcOf = (a) => a?.base64 || a?.url || "";
const isImg = (a) => /^data:image\//.test(srcOf(a)) || /^image\//.test(String(a?.type || ""));
const KINDS = ["인수증", "전표", "하차사진", "기타"];
// ⭐ 2026-11-09 '미제출'은 운행이 끝난 오더만 — 배차완료(기사만 정해짐)는 하차일이 지났을 때부터 센다(오늘 막 배차한 오더가 미제출로 잡히던 문제)
const done = (r) => ["운송완료", "하차완료", "완료"].includes(String(r?.배차상태 || "")) || r?.기사확인상태 === "완료" || !!r?.운송완료일시 || !!r?.하차완료일시
  || (String(r?.배차상태 || "") === "배차완료" && String(r?.하차일 || r?.상차일 || "") < kstToday());
const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "_").trim() || "첨부";

function shrink(file, max = 1600, quality = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
const readDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); });
async function dataUrlToBlob(s) { return (await fetch(s)).blob(); }
function saveBlob(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
const extOf = (a) => { const m = /^data:([a-z]+)\/([a-z0-9+.-]+)/i.exec(srcOf(a)); const e = (m?.[2] || "jpg").toLowerCase(); return e === "jpeg" ? "jpg" : e === "svg+xml" ? "svg" : e; };

async function loadAtts(r) {
  const s = await getDocs(collection(db, colOf(r), idOf(r), "attachments"));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

export default function ReceiptCenter({ dispatchData = [], isViewer = false, toast }) {
  const today = kstToday();
  const [from, setFrom] = React.useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = React.useState(today);
  const [client, setClient] = React.useState("");
  const [q, setQ] = React.useState("");
  const [st, setSt] = React.useState("all"); // all · has · missing
  const [sel, setSel] = React.useState(null);
  const [checked, setChecked] = React.useState(() => new Set());
  const [zipBusy, setZipBusy] = React.useState("");
  const inRange = (r) => { const d = String(r?.상차일 || ""); return d && d >= from && d <= to; };
  const base = React.useMemo(() => (dispatchData || []).filter((r) => idOf(r) && inRange(r) && !/취소/.test(String(r.배차상태 || ""))), [dispatchData, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const clients = React.useMemo(() => [...new Set(base.map((r) => r.거래처명).filter(Boolean))].sort(), [base]);
  const rows = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return base.filter((r) => {
      if (client && r.거래처명 !== client) return false;
      const n = Number(r.attachCount) || 0;
      if (st === "has" && n <= 0) return false;
      if (st === "missing" && (n > 0 || !done(r))) return false;
      if (qq && ![r.거래처명, r.상차지명, r.하차지명, r.차량번호, r.이름].some((v) => String(v || "").toLowerCase().includes(qq))) return false;
      return true;
    }).sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")) || String(a.상차시간 || "").localeCompare(String(b.상차시간 || "")));
  }, [base, client, q, st]);
  const cnt = React.useMemo(() => ({ all: base.length, has: base.filter((r) => (Number(r.attachCount) || 0) > 0).length, missing: base.filter((r) => !(Number(r.attachCount) > 0) && done(r)).length }), [base]);
  const selRow = sel ? rows.find((r) => idOf(r) === sel) || base.find((r) => idOf(r) === sel) : null;

  const zipOrders = async (list) => {
    if (!list.length) return;
    setZipBusy(`0/${list.length}`);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip(); let files = 0;
      for (let i = 0; i < list.length; i += 1) {
        const r = list[i];
        const atts = await loadAtts(r);
        // 폴더·파일에 순번 — 같은 날·같은 기사 오더가 한 폴더로 섞이거나 같은 이름(사진.jpg 등)끼리 덮어쓰지 않게
        const folder = zip.folder(safe(`${String(i + 1).padStart(3, "0")}_${r.상차일 || ""}_${r.거래처명 || ""}_${r.차량번호 || r.이름 || ""}`));
        for (let k = 0; k < atts.length; k += 1) { const a = atts[k]; if (!srcOf(a)) continue; folder.file(`${k + 1}_${a.name ? safe(a.name) : `첨부.${extOf(a)}`}`, await dataUrlToBlob(srcOf(a))); files += 1; }
        setZipBusy(`${i + 1}/${list.length}`);
      }
      if (!files) { window.alert("내려받을 첨부가 없습니다."); return; }
      saveBlob(await zip.generateAsync({ type: "blob" }), `인수증_${from}~${to}_${list.length}건.zip`);
    } catch (e) { window.alert(`내려받기 실패: ${e?.message || e}`); } finally { setZipBusy(""); }
  };

  const chip = (k, l, n) => (
    <button key={k} type="button" onClick={() => setSt(k)} className={`h-9 px-3.5 rounded-xl text-[13px] font-black border ${st === k ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#1B2B4B] border-[#DCE3EE]"}`}>
      {l} <span className={`ml-1 ${st === k ? "text-[#8FB0F0]" : "text-[#7A89A3]"}`} style={MONO}>{n}</span>
    </button>
  );
  return (
    <div className="space-y-3" data-receipt-center>
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] p-3 flex flex-wrap items-center gap-2">
        <span className="w-[140px]"><CustomDatePicker value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold" openOnFocus={false} /></span>
        <span className="text-[#9AA9C3]">~</span>
        <span className="w-[140px]"><CustomDatePicker value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-full px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold" openOnFocus={false} /></span>
        <select value={client} onChange={(e) => setClient(e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold min-w-[150px]">
          <option value="">전체 거래처</option>{clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처·상하차지·차량번호·기사 검색" className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] w-[240px]" />
        <div className="flex gap-1.5 ml-1">{chip("all", "전체", cnt.all)}{chip("has", "제출", cnt.has)}{chip("missing", "미제출", cnt.missing)}</div>
        <div className="flex-1" />
        <button type="button" disabled={!!zipBusy || !checked.size} onClick={() => zipOrders(rows.filter((r) => checked.has(idOf(r))))} className="h-9 px-3.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-40">{zipBusy ? `내려받는 중 ${zipBusy}` : `선택 ${checked.size}건 ZIP`}</button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3 items-start">
        <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-hidden">
          <div className="max-h-[68vh] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-[1]"><tr className="bg-[#1B2B4B] text-white">
                <th className="w-9 py-2"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => checked.has(idOf(r)))} onChange={(e) => setChecked(e.target.checked ? new Set(rows.map(idOf)) : new Set())} /></th>
                {["상차일", "거래처", "상차 → 하차", "기사", "인수증"].map((h) => <th key={h} className="px-2 py-2 text-left font-extrabold whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="py-14 text-center text-[#9AA9C3] font-bold">해당 기간 오더가 없습니다</td></tr>}
                {rows.slice(0, 600).map((r) => {
                  const id = idOf(r); const n = Number(r.attachCount) || 0; const on = sel === id;
                  return (
                    <tr key={id} onClick={() => setSel(id)} className={`border-t border-[#EEF1F6] cursor-pointer ${on ? "bg-[#EEF3FC]" : "hover:bg-[#F7F9FC]"}`}>
                      <td className="text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.has(id)} onChange={() => setChecked((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; })} /></td>
                      <td className="px-2 py-2 whitespace-nowrap font-bold text-[#1B2B4B]" style={MONO}>{String(r.상차일 || "").slice(5)}</td>
                      <td className="px-2 py-2 font-black text-[#0F1A30] truncate max-w-[140px]">{r.거래처명 || "-"}</td>
                      <td className="px-2 py-2 text-[#5B6B85] truncate max-w-[220px]">{r.상차지명 || ""} → {r.하차지명 || ""}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-[#1B2B4B]">{r.이름 || "-"} <span className="text-[#9AA9C3]">{r.차량번호 || ""}</span></td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {n > 0 ? <span className="inline-flex items-center h-6 px-2 rounded-md bg-[#0F1A30] text-white text-[11.5px] font-black" style={MONO}>제출 {n}</span>
                          : done(r) ? <span className="inline-flex items-center h-6 px-2 rounded-md bg-[#FDECEC] text-[#B4342A] text-[11.5px] font-black">미제출</span>
                            : <span className="text-[11.5px] font-bold text-[#9AA9C3]">운행 전</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 600 && <div className="px-3 py-2 text-[12px] text-[#7A89A3] border-t border-[#EEF1F6]">앞 600건만 보여 줍니다 — 기간을 줄여 주세요</div>}
        </div>
        <div className="xl:sticky xl:top-3">
          {selRow ? <ReceiptPanel key={idOf(selRow)} row={selRow} isViewer={isViewer} toast={toast} onZip={() => zipOrders([selRow])} />
            : <div className="rounded-[18px] bg-white border border-dashed border-[#C9D5EA] py-20 text-center text-[#7A89A3] font-bold">왼쪽에서 오더를 고르면 인수증·전표를 보고 올릴 수 있습니다</div>}
        </div>
      </div>
    </div>
  );
}

function ReceiptPanel({ row, isViewer, toast, onZip }) {
  const [atts, setAtts] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [kind, setKind] = React.useState("인수증");
  const [drag, setDrag] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [view, setView] = React.useState(null);
  const inputRef = React.useRef(null);
  const reload = React.useCallback(() => { setErr(""); loadAtts(row).then(setAtts).catch((e) => { setAtts([]); setErr(e?.code === "permission-denied" ? "이 오더의 첨부를 볼 권한이 없습니다" : "첨부를 불러오지 못했습니다"); }); }, [idOf(row), colOf(row), row?.attachCount]); // eslint-disable-line react-hooks/exhaustive-deps -- 다른 오더가 바뀔 때마다(실시간) 첨부 전체를 다시 읽지 않게
  React.useEffect(() => { reload(); }, [reload]);
  const upload = async (list) => {
    const files = [...(list || [])];
    if (!files.length || isViewer) return;
    setBusy(true);
    let ok = 0;
    for (const file of files) {
      try {
        const img = String(file.type || "").startsWith("image/");
        const base64 = img ? await shrink(file) : await readDataUrl(file);
        if (String(base64).length > 1_000_000) { window.alert(`${file.name}: 파일이 너무 큽니다(약 700KB 이하).`); continue; }
        const ref = doc(collection(db, colOf(row), idOf(row), "attachments"));
        await setDoc(ref, {
          base64, name: file.name, type: (String(base64).match(/^data:([^;,]+)/) || [])[1] || file.type || "",
          size: file.size, sizeKB: Math.round(String(base64).length * 0.75 / 1024), uploadedBy: "dispatch", 종류: kind, createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, colOf(row), idOf(row)), { attachCount: increment(1) });
        ok += 1;
      } catch (e) { window.alert(`${file.name} 올리기 실패: ${e?.message || e}`); }
    }
    setBusy(false);
    if (ok) { toast?.(`${kind} ${ok}개를 올렸습니다`, "success"); reload(); }
  };
  const list = atts || [];
  return (
    <div className="rounded-[18px] bg-white border border-[#E3E8F0] overflow-hidden">
      <div className="px-4 py-3 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
        <div className="text-[10px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={MONO}>RECEIPT · {String(row.상차일 || "")}</div>
        <div className="text-[16px] font-black truncate">{row.거래처명 || "-"}</div>
        <div className="text-[12px] text-white/70 truncate">{row.상차지명 || ""} → {row.하차지명 || ""}{row.이름 || row.차량번호 ? ` · ${row.이름 || ""} ${row.차량번호 || ""}` : " · 기사 미배정"}</div>
      </div>
      <div className="p-4 space-y-3">
        {!isViewer && (
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
            className={`rounded-2xl border-2 border-dashed px-4 py-4 flex flex-wrap items-center gap-2 ${drag ? "border-[#4B6CB7] bg-[#EEF3FC]" : "border-[#C9D5EA] bg-[#F7F9FC]"}`}>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-bold bg-white">{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <div className="text-[12.5px] font-bold text-[#5B6B85] flex-1 min-w-[160px]">사진·PDF를 여기에 끌어다 놓거나</div>
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-50">{busy ? "올리는 중…" : "파일 선택"}</button>
            <input ref={inputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>
        )}
        {err && <div className="rounded-xl border border-[#F3C2BE] bg-[#FDF3F2] px-3 py-2 text-[12.5px] font-bold text-[#B4342A]">{err}</div>}
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-black text-[#0F1A30]">첨부 <span style={MONO}>{atts ? list.length : "…"}</span>건</div>
          {list.length > 0 && <button type="button" onClick={onZip} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#1B2B4B]">전체 내려받기</button>}
        </div>
        {atts && list.length === 0 && !err && <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">아직 올라온 인수증이 없습니다</div>}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {list.map((a) => (
            <div key={a.id} className="rounded-xl border border-[#E3E8F0] overflow-hidden bg-[#F5F7FA]">
              <button type="button" onClick={() => setView(a)} className="block w-full">
                {isImg(a) ? <img src={srcOf(a)} alt={a.name || ""} className="w-full h-24 object-cover" style={a.rotation ? { transform: `rotate(${a.rotation}deg)` } : undefined} />
                  : <div className="w-full h-24 grid place-items-center text-[12px] font-black text-[#2D4C82]">PDF</div>}
              </button>
              <div className="px-1.5 py-1 flex items-center gap-1">
                <span className={`text-[10.5px] font-black px-1.5 rounded ${a.uploadedBy === "driver" ? "bg-[#EAF0FB] text-[#2D4C82]" : "bg-[#0F1A30] text-white"}`}>{a.종류 || (a.uploadedBy === "driver" ? "기사" : "운송사")}</span>
                <button type="button" onClick={async () => saveBlob(await dataUrlToBlob(srcOf(a)), safe(a.name) || `첨부.${extOf(a)}`)} className="ml-auto text-[11px] font-bold text-[#4B6CB7]">저장</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {view && (
        <div className="fixed inset-0 z-[99995] bg-black/80 flex items-center justify-center p-4" onClick={() => setView(null)}>
          {isImg(view) ? <img src={srcOf(view)} alt="" className="max-w-[94vw] max-h-[90vh] object-contain rounded-lg" style={view.rotation ? { transform: `rotate(${view.rotation}deg)` } : undefined} />
            : <object data={srcOf(view)} type="application/pdf" className="w-[min(900px,94vw)] h-[88vh] bg-white rounded-lg" aria-label={view.name || "PDF"} />}
        </div>
      )}
    </div>
  );
}
