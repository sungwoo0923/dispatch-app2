import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Save } from "lucide-react";

// Canvas-based signature capture, shared by contract signing and safety
// training attendance. Exposes getDataUrl()/isEmpty() via ref so parents can
// pull the signature at submit time instead of syncing on every stroke.
//
// onSave (optional): when passed, renders a "저장" button next to "다시 서명".
// Tapping it (once something is drawn) opens a centered confirm popup asking
// "최종 제출하시겠습니까?" — confirming calls onSave(), cancelling just closes
// the popup so the user can redraw or tap 저장 again. This exists because on
// mobile the actual submit button lives in the parent Modal's footer, which
// can end up scrolled out of reach; 저장 gives every signing screen a second,
// always-reachable way to finish (see Modal.jsx for the underlying fix too).
const SignaturePad = forwardRef(function SignaturePad({ onSave, saving }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return {
      x: ((point.clientX - rect.left) / rect.width) * canvas.width,
      y: ((point.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1E293B";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStroke.current = true;
    setEmpty(false);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
    setEmpty(true);
  };

  useImperativeHandle(ref, () => ({
    getDataUrl: () => canvasRef.current.toDataURL("image/png"),
    isEmpty: () => !hasStroke.current,
    clear,
  }));

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        className="w-full touch-none rounded-xl border border-slate-200 bg-white"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-muted">위 칸에 직접 서명해주세요</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clear}
            disabled={empty}
            className="flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-40"
          >
            <Eraser size={13} /> 다시 서명
          </button>
          {onSave && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={empty || saving}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark disabled:text-muted disabled:opacity-40"
            >
              <Save size={13} /> {saving ? "저장 중..." : "저장"}
            </button>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-5">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="text-sm text-ink">
              서명이 완료되었습니다.
              <br />
              최종 제출하시겠습니까?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-ink hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  onSave?.();
                }}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
              >
                제출
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default SignaturePad;
