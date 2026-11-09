// ======================= src/ApprovalFiles.jsx =======================
// 📎 2026-11-08 전자결재 첨부 파일 — 올리기(작성 화면) · 목록·미리보기·저장(문서 보기)
//  저장 위치·검사 규칙은 src/approvalFiles.js, 서버 규칙은 storage.rules › approvals/{회사 키}/{문서 id}/{파일}
//  · 둘러보기(/preview)에서는 서버에 올리지 않고 이 창 안에서만 파일을 들고 있는다(미리보기 점검용)
//  · 내려받기는 getBlob(로그인한 사람의 권한으로 받음 — 공개 주소를 만들지 않는다)
import React from "react";
import { ref as sRef, uploadBytes, getBlob, deleteObject } from "firebase/storage";
import { storage } from "./firebase";
import { isPreviewMode } from "./fsTenant";
import { AP_FILE_ACCEPT, AP_FILE_COUNT, KIND_LABEL, apFilePath, canPreview, checkApFile, fileKind, fmtSize, safeFileName } from "./approvalFiles";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const KIND_TONE = {
  image: ["#EEF3FC", "#2D4C82"], pdf: ["#FDF1F0", "#9A1F15"], ppt: ["#FFF4EC", "#B54708"], xls: ["#EEF8F1", "#1D6B3A"],
  doc: ["#EEF3FC", "#1E4FA8"], hwp: ["#EEF6FB", "#0B6A94"], zip: ["#F3F1FA", "#53389E"], file: ["#F2F4F7", "#3A4A66"],
};
export function KindBadge({ f, size = 36 }) {
  const k = fileKind(f);
  const [bg, fg] = KIND_TONE[k] || KIND_TONE.file;
  return (
    <span aria-hidden className="shrink-0 rounded-lg inline-flex items-center justify-center font-black" data-kind={k}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size >= 36 ? 11 : 10, letterSpacing: "0.04em", fontFamily: MONO, border: `1px solid ${fg}22` }}>{KIND_LABEL[k]}</span>
  );
}

// ───────── 서버 ─────────
const localUrls = new Map(); // 둘러보기용(path → blob 주소)
export async function uploadApFile(file, { company, docId, me, count = 0 }) {
  const chk = checkApFile(file, count);
  if (!chk.ok) throw new Error(chk.error);
  const at = Date.now();
  const path = apFilePath(company, docId, file.name, at);
  const meta = { name: String(file.name || "file").slice(0, 120), size: Number(file.size) || 0, type: chk.type, path, uploadedBy: me?.uid || "", uploadedByName: me?.name || "", at };
  if (isPreviewMode()) { localUrls.set(path, URL.createObjectURL(file)); return { ...meta, preview: true }; }
  await uploadBytes(sRef(storage, path), file, { contentType: chk.type, customMetadata: { uploadedBy: me?.uid || "", docId: String(docId || "") } });
  return meta;
}
export async function removeApFile(f) {
  if (!f?.path) return;
  if (f.preview || localUrls.has(f.path)) { try { URL.revokeObjectURL(localUrls.get(f.path)); } catch { /* 무시 */ } localUrls.delete(f.path); return; }
  await deleteObject(sRef(storage, f.path)).catch((e) => { if (e?.code !== "storage/object-not-found") throw e; });
}
const blobCache = new Map();
// ⭐ 2026-11-09 첨부가 "불러오는 중"에서 멈추던 문제 — 저장소 응답이 없으면 SDK가 최대 2분 동안 조용히 다시 시도하고,
//  그 멈춘 요청이 캐시에 남아 문서를 다시 열어도 계속 멈춰 있었다 → 25초가 지나면 실패로 끝내고(캐시도 지움) 이유와 [다시 시도]를 보여 준다
const AP_BLOB_TIMEOUT = 25000;
export async function apFileBlob(f) {
  if (!f?.path) throw new Error("파일 위치가 없어요");
  if (localUrls.has(f.path)) return (await fetch(localUrls.get(f.path))).blob();
  if (blobCache.has(f.path)) return blobCache.get(f.path);
  const timeout = new Promise((_, rej) => setTimeout(() => { const e = new Error("응답 없음"); e.code = "timeout"; rej(e); }, AP_BLOB_TIMEOUT));
  const p = Promise.race([getBlob(sRef(storage, f.path)), timeout]).then((b) => (f.type && b.type !== f.type ? new Blob([b], { type: f.type }) : b));
  blobCache.set(f.path, p);
  p.catch(() => blobCache.delete(f.path));
  return p;
}
async function dataUrlBlob(src) {
  const s = String(src || "");
  if (!s.startsWith("data:")) return (await fetch(s)).blob();
  const [head, body] = s.split(",");
  const mime = /data:([^;,]+)/.exec(head)?.[1] || "image/jpeg";
  const bin = /;base64/.test(head) ? atob(body) : decodeURIComponent(body);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
export async function saveApFile(f) { saveBlob(await apFileBlob(f), f.name || "첨부"); }
// 첨부 모두 저장 — 파일 + 예전 사진 첨부를 한 ZIP으로(1개면 그대로)
export async function saveAllApFiles({ files = [], images = [], docNo = "" }) {
  const base = safeFileName(docNo || "전자결재");
  const ext = (src) => { const m = /^data:image\/([a-z0-9+.-]+)/i.exec(String(src || "")); const e = (m?.[1] || "jpeg").toLowerCase(); return e === "jpeg" ? "jpg" : e; };
  const items = [
    ...(images || []).filter(Boolean).map((src, i) => ({ name: `${base}_사진${i + 1}.${ext(src)}`, get: () => dataUrlBlob(src) })),
    ...(files || []).filter((f) => f?.path).map((f) => ({ name: safeFileName(f.name), get: () => apFileBlob(f) })),
  ];
  if (!items.length) return;
  if (items.length === 1) { saveBlob(await items[0].get(), items[0].name); return; }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const seen = new Map();
  for (const it of items) {
    let n = it.name; const c = seen.get(n) || 0; seen.set(n, c + 1);
    if (c) n = n.replace(/(\.[^.]+)?$/, (m) => `(${c + 1})${m}`);
    zip.file(n, await it.get());
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), `${base}_첨부${items.length}개.zip`);
}

// 불러오기 실패 이유 — 사용자에게 보여 줄 말(괄호 안 코드는 문의할 때 알려 주면 원인을 바로 찾는다)
export function apFileErrText(e) {
  const c = String(e?.code || "");
  if (c === "storage/unauthorized") return "이 파일을 볼 권한이 없어요 (storage/unauthorized)";
  if (c === "storage/object-not-found") return "파일이 저장소에 없어요 — 기안자가 올리는 중 창을 닫았을 수 있어요. 기안자에게 다시 첨부를 요청해 주세요 (object-not-found)";
  if (c === "timeout" || c === "storage/retry-limit-exceeded") return "저장소 응답이 없어요 — 인터넷·회사 방화벽에서 firebasestorage.googleapis.com 접속이 막혔는지 확인해 주세요";
  if (c === "storage/unauthenticated") return "로그인이 풀렸어요 — 다시 로그인해 주세요";
  return `파일을 불러오지 못했어요${c ? ` (${c})` : ""}`;
}
// 미리보기용 blob 주소(화면에 보이는 동안만) · retry()로 다시 받기
function useBlobUrl(f, on = true) {
  const [url, setUrl] = React.useState("");
  const [err, setErr] = React.useState("");
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!on || !f?.path) return undefined;
    let alive = true; let u = "";
    setErr("");
    apFileBlob(f).then((b) => { if (!alive) return; u = URL.createObjectURL(b); setUrl(u); }).catch((e) => { if (alive) setErr(apFileErrText(e)); });
    return () => { alive = false; if (u) setTimeout(() => URL.revokeObjectURL(u), 1000); };
  }, [f?.path, on, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = () => { if (f?.path) blobCache.delete(f.path); setErr(""); setUrl(""); setTick((n) => n + 1); };
  return { url, err, retry };
}
function Thumb({ f, onOpen, onUrl }) {
  const { url, err, retry } = useBlobUrl(f, fileKind(f) === "image" && canPreview(f));
  React.useEffect(() => { onUrl?.(f.path, url); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" onClick={() => onOpen(url)} title={`${f.name} 크게 보기`} className="relative block w-full rounded-xl overflow-hidden border border-[#E3E8F0] bg-[#F5F7FA] focus:outline-none focus:ring-2 focus:ring-[#2D4C82]/40">
      {url ? <img src={url} alt={f.name} className="w-full h-28 sm:h-36 object-cover" /> : <div className="w-full h-28 sm:h-36 grid place-items-center content-center gap-1 px-2 text-center text-[12px] font-bold text-[#8E9BB2]">{err ? <><span className="text-[#9A1F15] leading-snug">{err}</span><span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); retry(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); retry(); } }} className="h-7 px-2.5 rounded-md border border-[#DCE3EE] bg-white text-[#2D4C82] inline-flex items-center">다시 시도</span></> : "불러오는 중"}</div>}
      <span className="absolute left-1.5 bottom-1.5 right-1.5 h-5 px-1.5 rounded-md bg-[#0F1A30]/80 text-white text-[10.5px] font-bold truncate text-left leading-5">{f.name}</span>
    </button>
  );
}
function Viewer({ f, onClose }) {
  const { url, err, retry } = useBlobUrl(f, true);
  const k = fileKind(f);
  return (
    <div className="mt-3 rounded-2xl border border-[#DCE3EE] bg-[#F5F7FA] overflow-hidden" data-ap-file-view={k}>
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-[#E3E8F0]">
        <KindBadge f={f} size={26} />
        <span className="flex-1 min-w-0 truncate text-[13.5px] font-black text-[#0F1A30]">{f.name}</span>
        <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#3A4A66]">닫기</button>
      </div>
      {err ? <div className="p-6 text-center text-[13.5px] font-bold text-[#9A1F15] grid gap-2 justify-items-center">{err}<button type="button" onClick={retry} className="h-8 px-3 rounded-lg border border-[#DCE3EE] bg-white text-[12.5px] font-black text-[#2D4C82]">다시 시도</button></div>
        : !url ? <div className="p-6 text-center text-[13.5px] font-bold text-[#8E9BB2]">불러오는 중…</div>
          : k === "pdf" ? <object data={url} type="application/pdf" className="w-full block bg-white" style={{ height: "min(72vh, 820px)" }} aria-label={f.name}><iframe src={url} title={f.name} className="w-full block" style={{ height: "min(72vh, 820px)", border: 0 }} /></object>
            : <div className="p-3 grid place-items-center bg-[#0F1A30]/[0.04]"><img src={url} alt={f.name} className="max-w-full object-contain" style={{ maxHeight: "72vh" }} /></div>}
    </div>
  );
}

// 파일 한 줄
function FileRow({ f, onPreview, onSave, onRemove, busy, active }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${active ? "border-[#2D4C82] bg-[#F5F8FD]" : "border-[#E3E8F0] bg-white"}`} data-ap-file={fileKind(f)}>
      <KindBadge f={f} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-black text-[#0F1A30] truncate" title={f.name}>{f.name}</div>
        <div className="text-[12px] font-semibold text-[#5B6B85] truncate">{fmtSize(f.size)}{f.uploadedByName ? ` · ${f.uploadedByName}` : ""}{f.uploading ? " · 올리는 중" : ""}</div>
      </div>
      {onPreview && canPreview(f) && !f.uploading && <button type="button" onClick={onPreview} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:border-[#4B6CB7] whitespace-nowrap">{active ? "접기" : "미리보기"}</button>}
      {onSave && !f.uploading && <button type="button" onClick={onSave} disabled={busy} className="h-8 px-2.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:border-[#4B6CB7] disabled:opacity-50 whitespace-nowrap">저장</button>}
      {onRemove && <button type="button" onClick={onRemove} disabled={f.uploading} aria-label={`${f.name} 빼기`} className="w-8 h-8 rounded-lg text-[#5B6B85] hover:bg-[#EEF3FC] disabled:opacity-40">✕</button>}
    </div>
  );
}

// 작성 화면 — 파일 올리기 · 빼기 · 미리보기
export function ApprovalAttachInput({ company, docId, me, files, setFiles, onRemoveFile, legacy = null, onError, onBusy }) {
  const inputRef = React.useRef(null);
  const [view, setView] = React.useState(null);
  const [drag, setDrag] = React.useState(false);
  const [uploading, setUploading] = React.useState([]);
  const total = files.length + uploading.length;
  React.useEffect(() => { onBusy?.(uploading.length); }, [uploading.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (list) => {
    const picked = [...(list || [])];
    if (!picked.length) return;
    let count = total;
    const errs = [];
    for (const file of picked) {
      const chk = checkApFile(file, count);
      if (!chk.ok) { errs.push(chk.error); continue; }
      count += 1;
      const tmp = { name: file.name, size: file.size, type: chk.type, path: `tmp:${Date.now()}_${Math.random()}`, uploading: true };
      setUploading((p) => [...p, tmp]);
      uploadApFile(file, { company, docId, me, count: 0 })
        .then((meta) => setFiles((p) => [...p, meta].slice(0, AP_FILE_COUNT)))
        .catch((e) => onError?.(`${file.name} 올리기 실패: ${e?.code === "storage/unauthorized" ? "권한이 없어요 — 같은 회사 직원·기안자만 올릴 수 있어요. 계속 안 되면 관리자에게 '파일 저장소 보안 규칙(storage) 배포'를 요청해 주세요" : e.message || e}`))
        .finally(() => setUploading((p) => p.filter((x) => x !== tmp)));
    }
    if (errs.length) onError?.(errs.join(" "));
  };
  return (
    <div data-ap-attach>
      <div className="flex items-center gap-2">
        <span className="text-[14.5px] font-black text-[#3A4A66]">첨부 파일</span>
        <span className="text-[12.5px] font-semibold text-[#5B6B85]">{total}/{AP_FILE_COUNT} · 파일당 20MB 미만</span>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer?.files); }}
        className={`mt-1.5 rounded-2xl border-2 border-dashed px-4 py-3.5 flex items-center gap-3 ${drag ? "border-[#2D4C82] bg-[#EEF3FC]" : "border-[#C9D2E0] bg-[#FAFBFD]"}`}>
        <div className="flex-1 min-w-0 text-[12.5px] font-semibold text-[#5B6B85] leading-relaxed break-keep">사진 · PDF · PPT · 엑셀 · 워드 · 한글 · ZIP<br className="hidden sm:block" /> 파일을 끌어다 놓거나 버튼을 눌러 고르세요</div>
        <button type="button" disabled={total >= AP_FILE_COUNT} onClick={() => inputRef.current?.click()} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-40 shrink-0" data-ap-attach-add>파일 추가</button>
        <input ref={inputRef} type="file" multiple hidden accept={AP_FILE_ACCEPT} data-ap-attach-input onChange={(e) => { const l = e.target.files; add(l); e.target.value = ""; }} />
      </div>
      {legacy}
      {(files.length > 0 || uploading.length > 0) && (
        <div className="mt-2 space-y-1.5">
          {files.map((f) => (
            <React.Fragment key={f.path}>
              <FileRow f={f} active={view === f.path} onPreview={() => setView(view === f.path ? null : f.path)} onRemove={() => { if (view === f.path) setView(null); onRemoveFile(f); }} />
              {view === f.path && <Viewer f={f} onClose={() => setView(null)} />}
            </React.Fragment>
          ))}
          {uploading.map((f) => <FileRow key={f.path} f={f} />)}
        </div>
      )}
    </div>
  );
}

// 문서 보기 — 첨부 목록 · 사진 썸네일 · PDF 미리보기 · 하나씩/모두 저장
export function ApprovalAttachPanel({ files = [], images = [], docNo, onImage, onGallery }) {
  const [view, setView] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const urls = React.useRef({}); // 불러온 사진 파일 path → blob 주소(크게 보기용)
  const list = (files || []).filter((f) => f?.path);
  const imgs = list.filter((f) => fileKind(f) === "image" && canPreview(f));
  // ⭐ 2026-11-09 사진 파일을 누르면 예전 사진과 같은 확대 창(이미지 저장·좌우 넘기기) — 예전 사진 + 불러온 사진 파일을 한 줄로
  const openGallery = (f) => {
    const loaded = imgs.filter((x) => urls.current[x.path]);
    if (!onGallery || !urls.current[f.path]) { setView(view === f.path ? null : f.path); return; } // 아직 못 불러왔으면 아래 미리보기(이유·다시 시도)
    const srcs = [...(images || []), ...loaded.map((x) => urls.current[x.path])];
    const names = [...(images || []).map(() => ""), ...loaded.map((x) => x.name || "")];
    onGallery({ srcs, names, start: (images || []).length + loaded.findIndex((x) => x.path === f.path) });
  };
  const n = list.length + (images || []).length;
  if (!n) return null;
  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { window.alert(`저장하지 못했어요: ${e?.code ? apFileErrText(e) : e.message || e}`); } finally { setBusy(""); } };
  const cur = list.find((f) => f.path === view);
  return (
    <div className="max-w-[780px] mx-auto mt-4 bg-white rounded-2xl p-4" data-ap-attachments>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>FILES</span>
        <span className="text-[13.5px] font-black text-[#0F1A30] whitespace-nowrap">첨부 {n}개</span>
        <button type="button" disabled={!!busy} onClick={() => run("all", () => saveAllApFiles({ files: list, images, docNo }))} data-ap-save-all
          className="ml-auto h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] hover:border-[#4B6CB7] disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" /></svg>
          {busy === "all" ? "받는 중…" : "첨부 모두 저장"}
        </button>
      </div>
      {(imgs.length > 0 || (images || []).length > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          {(images || []).map((src, i) => (
            <button key={`l${i}`} type="button" onClick={() => onImage?.(i)} title={`사진 ${i + 1} 크게 보기`} className="relative block rounded-xl overflow-hidden border border-[#E3E8F0]">
              <img src={src} alt={`사진 ${i + 1}`} className="w-full h-28 sm:h-36 object-cover" />
            </button>
          ))}
          {imgs.map((f) => <Thumb key={f.path} f={f} onUrl={(p, u) => { if (u) urls.current[p] = u; else delete urls.current[p]; }} onOpen={() => openGallery(f)} />)}
        </div>
      )}
      <div className="space-y-1.5">
        {list.map((f) => <FileRow key={f.path} f={f} busy={busy === f.path} active={view === f.path} onPreview={() => (imgs.includes(f) && urls.current[f.path] ? openGallery(f) : setView(view === f.path ? null : f.path))} onSave={() => run(f.path, () => saveApFile(f))} />)}
      </div>
      {cur && <Viewer f={cur} onClose={() => setView(null)} />}
    </div>
  );
}
