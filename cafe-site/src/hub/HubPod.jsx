// ======================= cafe-site/src/hub/HubPod.jsx =======================
// ⭐ 2026-11-06 인수증 · 서류(여러 장) — 보기(크게) · 저장(내려받기) · 공유(휴대폰: 공유 시트로 사진 그대로 · PC: 링크 복사)
//  등록자 · 배차된 회원 · 관리자만 파일을 열 수 있다(storage.rules hub/pod). 배차된 회원은 운송완료 뒤에도 더 올릴 수 있다.
import React, { useEffect, useRef, useState } from "react";
import { HI, Card } from "./hubUi";
import { fileUrl, podList, addPods } from "./hubApi";

const isImg = (p) => String(p?.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(p?.path || "");
const fileName = (o, p, i) => `${o.상차일 || ""}_${o.상차시군구 || o.상차시도 || ""}-${o.하차시군구 || o.하차시도 || ""}_${p.kind || "인수증"}${i + 1}.${(String(p.path).split(".").pop() || "jpg").slice(0, 5)}`.replace(/\s+/g, "");

async function blobOf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("파일을 받지 못했어요");
  return r.blob();
}
export async function downloadFile(url, name) {
  try {
    const b = await blobOf(url);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { window.open(url, "_blank", "noopener"); }
}
async function shareFiles(items, title, toast) {
  try {
    if (navigator.canShare) {
      const files = await Promise.all(items.map(async (x) => { const b = await blobOf(x.url); return new File([b], x.name, { type: b.type || "image/jpeg" }); }));
      if (navigator.canShare({ files })) { await navigator.share({ files, title, text: title }); return; }
    }
    if (navigator.share) { await navigator.share({ title, text: `${title}\n${items.map((x) => x.url).join("\n")}` }); return; }
    await navigator.clipboard.writeText(items.map((x) => x.url).join("\n"));
    toast?.("링크를 복사했어요");
  } catch (e) { if (e?.name !== "AbortError") { try { await navigator.clipboard.writeText(items.map((x) => x.url).join("\n")); toast?.("링크를 복사했어요"); } catch { toast?.("공유하지 못했어요"); } } }
}

export default function HubPod({ o, canAdd, toast }) {
  const list = podList(o);
  const [urls, setUrls] = useState({});
  const [big, setBig] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const key = list.map((p) => p.path).join("|");
  useEffect(() => {
    let on = true;
    list.forEach((p) => { if (!urls[p.path]) fileUrl(p.path).then((u) => on && setUrls((m) => ({ ...m, [p.path]: u }))).catch(() => {}); });
    return () => { on = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length && !canAdd) return null;
  const items = list.map((p, i) => ({ ...p, url: urls[p.path], name: fileName(o, p, i) })).filter((x) => x.url);
  const title = `인수증 ${o.상차시도} ${o.상차시군구 || ""} → ${o.하차시도} ${o.하차시군구 || ""}`;
  const add = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try { const n = await addPods(o, files); toast?.(`인수증 ${n}장을 올렸어요`); } catch (e) { toast?.(e?.message || "올리지 못했어요"); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4" data-testid="pod-card">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <HI name="file" size={18} className="text-[#2D4C82]" />
        <span className="text-[16px] font-extrabold text-[#0F1A30] whitespace-nowrap">인수증과 전표</span>
        <span className="text-[14px] font-bold text-[#5F6E87] whitespace-nowrap" data-testid="pod-count">{list.length}장</span>
        {items.length > 0 && (
          <span className="ml-auto flex gap-1.5">
            <button type="button" onClick={() => shareFiles(items, title, toast)} className="h-10 px-3 rounded-xl bg-[#EAF0FA] text-[14px] font-bold text-[#1B2B4B] inline-flex items-center gap-1.5 whitespace-nowrap" data-testid="pod-share-all"><HI name="link" size={15} />공유</button>
            <button type="button" onClick={() => items.forEach((x, i) => setTimeout(() => downloadFile(x.url, x.name), i * 400))} className="h-10 px-3 rounded-xl bg-[#0F1A30] text-white text-[14px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap" data-testid="pod-save-all"><HI name="down" size={15} />모두 저장</button>
          </span>
        )}
      </div>
      {list.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" data-testid="pod-grid">
          {list.map((p, i) => {
            const u = urls[p.path];
            return (
              <div key={p.path} className="relative rounded-2xl overflow-hidden ring-1 ring-inset ring-[#E2E7EF] bg-[#F2F5FA] aspect-square">
                {u && isImg(p) ? <button type="button" className="w-full h-full" onClick={() => setBig({ ...p, url: u, name: fileName(o, p, i) })}><img src={u} alt={`인수증 ${i + 1}`} className="w-full h-full object-cover" data-testid="pod-img" /></button>
                  : <a href={u || "#"} target="_blank" rel="noreferrer" className="w-full h-full flex flex-col items-center justify-center gap-1 text-[#2D4C82]"><HI name="file" size={26} /><span className="text-[13px] font-bold px-1 truncate max-w-full">{p.name || "PDF"}</span></a>}
                <span className="absolute left-1.5 top-1.5 h-6 px-2 rounded-full bg-[#0F1A30]/80 text-white text-[13px] font-bold inline-flex items-center">{p.kind || "인수증"} {i + 1}</span>
              </div>
            );
          })}
        </div>
      )}
      {canAdd && (
        <>
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="mt-3 w-full h-12 rounded-2xl bg-white ring-1 ring-inset ring-[#D6DEEA] text-[15px] font-bold text-[#1B2B4B] inline-flex items-center justify-center gap-2" data-testid="pod-add">
            <HI name="camera" size={18} />{busy ? "올리고 있어요" : list.length ? "더 올리기" : "인수증·전표 올리기"}
          </button>
          <input ref={input} type="file" accept="image/*,application/pdf" multiple className="sr-only" data-testid="pod-add-input" onChange={(e) => { add([...(e.target.files || [])]); e.target.value = ""; }} />
        </>
      )}
      {big && (
        <div className="fixed inset-0 z-[90] bg-[#0B1428]/92 flex flex-col" onClick={() => setBig(null)} data-testid="pod-viewer">
          <div className="flex items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))] text-white" onClick={(e) => e.stopPropagation()}>
            <span className="text-[15px] font-bold truncate flex-1">{big.name}</span>
            <button type="button" onClick={() => downloadFile(big.url, big.name)} className="h-11 px-4 rounded-2xl bg-white/10 text-[15px] font-bold inline-flex items-center gap-1.5" data-testid="pod-save"><HI name="down" size={16} />저장</button>
            <button type="button" onClick={() => shareFiles([big], title, toast)} className="h-11 px-4 rounded-2xl bg-white/10 text-[15px] font-bold inline-flex items-center gap-1.5" data-testid="pod-share"><HI name="link" size={16} />공유</button>
            <button type="button" onClick={() => setBig(null)} aria-label="닫기" className="w-11 h-11 rounded-2xl bg-white/10 inline-flex items-center justify-center"><HI name="close" size={18} /></button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-3"><img src={big.url} alt="" className="max-w-full max-h-full object-contain rounded-xl" /></div>
        </div>
      )}
    </Card>
  );
}

