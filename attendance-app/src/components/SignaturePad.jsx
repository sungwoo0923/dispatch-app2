import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

// Canvas-based signature capture, shared by contract signing and safety
// training attendance. Exposes getDataUrl()/isEmpty() via ref so parents can
// pull the signature at submit time instead of syncing on every stroke.
const SignaturePad = forwardRef(function SignaturePad(_props, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const [empty, setEmpty] = useState(true);

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
        <button
          type="button"
          onClick={clear}
          disabled={empty}
          className="flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-40"
        >
          <Eraser size={13} /> 다시 서명
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
