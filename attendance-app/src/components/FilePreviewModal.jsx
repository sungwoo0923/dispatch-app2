import { useEffect, useState } from "react";
import { Download, RotateCw, ZoomIn, ZoomOut, X } from "lucide-react";

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

function extOf(name = "") {
  return name.split(".").pop()?.toLowerCase() || "";
}

// 서류함/문서 미리보기에서 공용으로 쓰는 팝업 — 이미지 파일은 확대/축소,
// 회전, 저장(다운로드)이 가능하고 그 외 파일(PDF 등)은 iframe으로 미리보고
// 다운로드만 제공한다. fetch 후 blob으로 저장해야 실제로 "다운로드"가
// 되고(그냥 <a href> 새 창 이동이 아니라), 파일명도 원본 그대로 유지된다.
export default function FilePreviewModal({ open, onClose, url, fileName }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const isImage = IMAGE_EXT.includes(extOf(fileName));

  useEffect(() => {
    if (open) {
      setScale(1);
      setRotation(0);
    }
  }, [open, url]);

  if (!open) return null;

  const download = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={onClose}>
      <div className="flex flex-nowrap items-center justify-between gap-2 bg-black/60 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm text-white">{fileName}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {isImage && (
            <>
              <button type="button" className="rounded-lg p-2 text-white hover:bg-white/10" onClick={() => setScale((s) => Math.max(0.25, s - 0.25))} title="축소">
                <ZoomOut size={18} />
              </button>
              <button type="button" className="rounded-lg p-2 text-white hover:bg-white/10" onClick={() => setScale((s) => Math.min(4, s + 0.25))} title="확대">
                <ZoomIn size={18} />
              </button>
              <button type="button" className="rounded-lg p-2 text-white hover:bg-white/10" onClick={() => setRotation((r) => (r + 90) % 360)} title="회전">
                <RotateCw size={18} />
              </button>
            </>
          )}
          <button type="button" className="rounded-lg p-2 text-white hover:bg-white/10" onClick={download} title="다운로드/저장">
            <Download size={18} />
          </button>
          <button type="button" className="rounded-lg p-2 text-white hover:bg-white/10" onClick={onClose} title="닫기">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img
            src={url}
            alt={fileName}
            className="max-h-full max-w-full select-none object-contain transition-transform"
            style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
            draggable={false}
          />
        ) : (
          <iframe src={url} title={fileName} className="h-full w-full max-w-4xl rounded-xl bg-white" />
        )}
      </div>
    </div>
  );
}
